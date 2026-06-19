import * as tapestry from "@tapestry/engine";

// Text helper for aligning the compact (narrow-terminal) score layout.
function scorePad(str, n) {
    str = '' + str;
    while (str.length < n) { str += ' '; }
    return str.length > n ? str.substring(0, n) : str;
}

tapestry.commands.register({
    name: 'score',
    roles: ['player'],
    args: {},
    handler: function(actor, resolved) {
        var s = actor.stats;

        // --- Build GMCP payload from the same data the renderer will use ---
        var race = tapestry.world.getProperty(actor.entityId, 'race') || '';
        var charClass = tapestry.world.getProperty(actor.entityId, 'class') || '';

        var allTracks = tapestry.progression.getTracks();
        var xpTracks = [];
        var primaryLevel = 0;
        if (allTracks && allTracks.length > 0) {
            for (var gi = 0; gi < allTracks.length; gi++) {
                var gInfo = tapestry.progression.getInfo(actor.entityId, allTracks[gi].name);
                if (!gInfo) { continue; }
                if (gi === 0) { primaryLevel = gInfo.level; }
                xpTracks.push({
                    name: allTracks[gi].name,
                    level: gInfo.level,
                    xp: gInfo.xp,
                    xpToNext: gInfo.xpToNext
                });
            }
        }

        var goldAmount = tapestry.currency.getGold(actor.entityId);
        var alignmentValue = tapestry.alignment.get(actor.entityId);
        var alignmentLabel = tapestry.alignment.bucket(actor.entityId);
        var susRaw = tapestry.world.getProperty(actor.entityId, 'sustenance');
        var susValue = (susRaw === null || susRaw === undefined) ? null : susRaw;
        var hungerLabel = susValue === null ? null
            : susValue >= 67 ? 'full'
            : susValue >= 34 ? 'hungry'
            : 'famished';

        tapestry.gmcp.send(actor.entityId, 'Response.Char.Score', {
            status: 'ok',
            name: actor.name,
            race: race,
            class: charClass,
            level: primaryLevel,
            stats: {
                str: s.strength,
                int: s.intelligence,
                wis: s.wisdom,
                dex: s.dexterity,
                con: s.constitution,
                luk: s.luck
            },
            hp: s.hp,
            maxHp: s.maxHp,
            mana: s.resource,
            maxMana: s.maxResource,
            mv: s.movement,
            maxMv: s.maxMovement,
            gold: goldAmount,
            alignment: alignmentValue + ' [' + alignmentLabel + ']',
            hungerTier: hungerLabel,
            xpTracks: xpTracks
        });

        tapestry.respond.suppress(actor.entityId);

        // --- Rendering ---
        // The 3-column cell layout needs ~62 cols before its fill cells (the "(100%)"
        // and Wis/Luc) have room. Below that, fall back to a single-column compact layout
        // that fits the player's width instead of being floored to 56 and wrapped.
        var width = tapestry.ui.width(actor.entityId); // 0 = wrapping off / unbounded
        var compact = width > 0 && width < 62;

        var hpName = tapestry.stats.getDisplayName('hp');
        var resName = tapestry.stats.getDisplayName('resource');
        var movName = tapestry.stats.getDisplayName('movement');

        var identitySection = {
            rows: [{ type: 'title', left: actor.name }]
        };

        var tracks = tapestry.progression.getTracks();
        var proficiencySection = null;
        if (tracks && tracks.length > 0) {
            var profRows = [];
            for (var t = 0; t < tracks.length; t++) {
                var info = tapestry.progression.getInfo(actor.entityId, tracks[t].name);
                if (!info) { continue; }
                var pct = 0;
                if (info.xpToNext > 0) {
                    var progressInLevel = info.xp - info.currentLevelThreshold;
                    var levelRange = info.xpToNext + progressInLevel;
                    pct = Math.floor((progressInLevel / levelRange) * 100);
                } else if (info.level >= info.maxLevel) {
                    pct = 100;
                }
                var tName = tracks[t].name.charAt(0).toUpperCase() + tracks[t].name.slice(1);
                var xpMax = info.xp + info.xpToNext;
                profRows.push({
                    type: 'text',
                    content: compact
                        ? '  ' + tName + ' L' + info.level + ': ' + info.xp + '/' + xpMax + ' (' + pct + '%)'
                        : '  ' + tName + ': Level ' + info.level + '  XP: ' + info.xp + ' / ' + xpMax + ' (' + pct + '%)'
                });
            }
            if (profRows.length > 0) {
                proficiencySection = { separatorAbove: 'minor', rows: profRows };
            }
        }

        var hpPct  = s.maxHp       > 0 ? Math.floor(s.hp       / s.maxHp       * 100) : 0;
        var resPct = s.maxResource > 0 ? Math.floor(s.resource / s.maxResource * 100) : 0;
        var movPct = s.maxMovement > 0 ? Math.floor(s.movement / s.maxMovement * 100) : 0;

        var vitalsSection;
        if (compact) {
            vitalsSection = {
                separatorAbove: 'minor',
                rows: [
                    { type: 'text', content: '  ' + scorePad(hpName + ':', 10) + s.hp + '/' + s.maxHp + ' (' + hpPct + '%)' },
                    { type: 'text', content: '  ' + scorePad(resName + ':', 10) + s.resource + '/' + s.maxResource + ' (' + resPct + '%)' },
                    { type: 'text', content: '  ' + scorePad(movName + ':', 10) + s.movement + '/' + s.maxMovement + ' (' + movPct + '%)' }
                ]
            };
        } else {
            vitalsSection = {
                separatorAbove: 'minor',
                rows: [
                    { type: 'cell', cells: [
                        { content: '  ' + hpName,  width: 16 },
                        { type: 'progress', value: s.hp,       max: s.maxHp,       width: 22 },
                        { content: s.hp       + ' / ' + s.maxHp,       width: 14, align: 'right' },
                        { content: '', width: 2 },
                        { content: '(' + hpPct  + '%)', width: 'fill', align: 'left' }
                    ]},
                    { type: 'cell', cells: [
                        { content: '  ' + resName, width: 16 },
                        { type: 'progress', value: s.resource,  max: s.maxResource, width: 22 },
                        { content: s.resource + ' / ' + s.maxResource, width: 14, align: 'right' },
                        { content: '', width: 2 },
                        { content: '(' + resPct + '%)', width: 'fill', align: 'left' }
                    ]},
                    { type: 'cell', cells: [
                        { content: '  ' + movName, width: 16 },
                        { type: 'progress', value: s.movement,  max: s.maxMovement, width: 22 },
                        { content: s.movement + ' / ' + s.maxMovement, width: 14, align: 'right' },
                        { content: '', width: 2 },
                        { content: '(' + movPct + '%)', width: 'fill', align: 'left' }
                    ]}
                ]
            };
        }

        var alignment = tapestry.alignment.get(actor.entityId);
        var bucket = tapestry.alignment.bucket(actor.entityId);
        var attribSection;
        if (compact) {
            attribSection = {
                separatorAbove: 'minor',
                rows: [
                    { type: 'text', content: '  Str: ' + s.strength + '  Int: ' + s.intelligence + '  Wis: ' + s.wisdom },
                    { type: 'text', content: '  Dex: ' + s.dexterity + '  Con: ' + s.constitution + '  Luc: ' + s.luck },
                    { type: 'text', content: '  Alignment: ' + alignment + ' [' + bucket + ']' }
                ]
            };
        } else {
            attribSection = {
                separatorAbove: 'minor',
                rows: [
                    { type: 'cell', cells: [
                        { content: '  Str: ' + s.strength,      width: 26 },
                        { content: 'Int: ' + s.intelligence,     width: 26 },
                        { content: 'Wis: ' + s.wisdom,           width: 'fill' }
                    ]},
                    { type: 'cell', cells: [
                        { content: '  Dex: ' + s.dexterity,     width: 26 },
                        { content: 'Con: ' + s.constitution,     width: 26 },
                        { content: 'Luc: ' + s.luck,             width: 'fill' }
                    ]},
                    { type: 'text', content: '  Alignment: ' + alignment + ' [' + bucket + ']' }
                ]
            };
        }

        var gold = tapestry.currency.getGold(actor.entityId);
        var goldSection = {
            separatorAbove: 'minor',
            rows: [{ type: 'text', content: '  Gold: ' + gold }]
        };

        var susRaw2 = tapestry.world.getProperty(actor.entityId, 'sustenance');
        var susValue2 = (susRaw2 === null || susRaw2 === undefined) ? null : susRaw2;
        var susTier = susValue2 === null ? null
            : susValue2 >= 67 ? 'full'
            : susValue2 >= 34 ? 'hungry'
            : 'famished';
        var susPct = Math.floor(susValue2 !== null ? susValue2 : 0);
        var susSection = {
            separatorAbove: 'minor',
            rows: [{ type: 'text', content: '  Hunger: ' + susTier + ' (' + susPct + '%)' }]
        };

        var sections: any[] = [identitySection];
        if (proficiencySection) { sections.push(proficiencySection); }
        sections.push(vitalsSection);
        sections.push(attribSection);
        sections.push(susSection);
        sections.push(goldSection);

        var output = tapestry.ui.panel({ forEntity: actor.entityId, sections: sections });
        actor.send('\r\n' + output + '\r\n');
    }
});
