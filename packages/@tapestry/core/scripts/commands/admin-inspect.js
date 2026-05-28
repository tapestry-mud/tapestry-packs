// Admin inspect command.
// First raw arg branches: 'inspect room [id]' shows a room view;
// anything else is entity inspection via tapestry.args.resolve (room-scoped).
// Note: args.resolve does not support bypass_visibility — admins cannot inspect
// hidden entities by name. Use the entity's id directly as a workaround if needed.

function renderEntityInspect(actor, keyword) {
    var found = tapestry.args.resolve ? tapestry.args.resolve(actor.entityId, keyword, 'visible') : null;
    if (!found) {
        actor.send("No entity found matching '" + keyword + "'.\r\n");
        return;
    }

    var e = tapestry.world.getEntity(found.id);
    if (!e) {
        actor.send("Cannot resolve entity.\r\n");
        return;
    }

    var propTypes = {};
    var propRegistry = tapestry.world.getPropertyRegistry ? tapestry.world.getPropertyRegistry() : [];
    for (var pr = 0; pr < propRegistry.length; pr++) {
        propTypes[propRegistry[pr].name] = propRegistry[pr].valueType;
    }

    var cls = tapestry.world.getProperty(found.id, 'class') || '-';
    var race = tapestry.world.getProperty(found.id, 'race') || '-';
    var allProps = e.properties || {};
    var mobLevel = allProps['mob_level'] || 0;
    var levelMap = allProps['level'] || {};
    var combatLevel = typeof levelMap === 'object' ? (levelMap['combat'] || 0) : 0;
    var level = mobLevel > 0 ? mobLevel : (combatLevel > 0 ? combatLevel : '-');

    var s = e.stats || {};
    actor.send('[' + e.name + ']\r\n');
    actor.send('Class: ' + cls + ' | Race: ' + race + ' | Level: ' + level + '\r\n');
    actor.send('Stats:   STR ' + (s.strength||0) +
                '  INT ' + (s.intelligence||0) +
                '  WIS ' + (s.wisdom||0) +
                '  DEX ' + (s.dexterity||0) +
                '  CON ' + (s.constitution||0) +
                '  LUC ' + (s.luck||0) + '\r\n');
    actor.send('Vitals:  HP ' + (s.hp||0) + '/' + (s.max_hp||0) +
                '  Resource ' + (s.resource||0) + '/' + (s.max_resource||0) +
                '  Move ' + (s.movement||0) + '/' + (s.max_movement||0) + '\r\n');

    var gold = tapestry.currency.getGold(found.id);
    actor.send('Gold:    ' + gold + '\r\n');

    var hungerRaw = tapestry.world.getProperty(found.id, 'sustenance');
    var hunger = (hungerRaw === null || hungerRaw === undefined) ? null : hungerRaw;
    var hungerTier = hunger === null ? 'n/a'
        : hunger >= 67 ? 'full'
        : hunger >= 34 ? 'hungry'
        : 'famished';
    actor.send('Hunger:  ' + hungerTier + ' (' + hunger + '%)\r\n');

    var levelLines = [];
    var levelMapData = typeof allProps['level'] === 'object' ? allProps['level'] : {};
    for (var track in levelMapData) {
        if (Object.prototype.hasOwnProperty.call(levelMapData, track)) {
            var tName = track.charAt(0).toUpperCase() + track.slice(1);
            levelLines.push('  ' + tName + ': Level ' + levelMapData[track]);
        }
    }
    if (levelLines.length) {
        actor.send('Levels:\r\n' + levelLines.join('\r\n') + '\r\n');
    }

    var profMapData = typeof allProps['proficiency'] === 'object' ? allProps['proficiency'] : {};
    var profLines = [];
    for (var pk in profMapData) {
        if (Object.prototype.hasOwnProperty.call(profMapData, pk)) {
            profLines.push('  ' + pk + ': ' + profMapData[pk] + '%');
        }
    }
    if (profLines.length) {
        actor.send('Proficiency:\r\n' + profLines.join('\r\n') + '\r\n');
    }

    var tags = tapestry.world.getEntityTags ? tapestry.world.getEntityTags(found.id) : [];
    var flagParts = [];
    for (var ti = 0; ti < tags.length; ti++) {
        var known = tapestry.world.isTagKnown ? tapestry.world.isTagKnown(tags[ti], null) : true;
        flagParts.push(known ? tags[ti] : tags[ti] + ' (unregistered)');
    }
    actor.send('Flags:   ' + (flagParts.length ? flagParts.join(', ') : '(none)') + '\r\n');

    var eq = e.equipment || {};
    var eqLines = [];
    for (var slot in eq) {
        if (Object.prototype.hasOwnProperty.call(eq, slot)) {
            eqLines.push(slot + ': ' + (eq[slot].name || eq[slot]));
        }
    }
    actor.send('Equipment: ' + (eqLines.length ? eqLines.join(', ') : '(none)') + '\r\n');

    var inv = e.inventory || [];
    var invNames = [];
    for (var k = 0; k < inv.length; k++) {
        invNames.push(inv[k].name || String(inv[k]));
    }
    actor.send('Inventory: ' + (invNames.length ? invNames.join(', ') : '(none)') + '\r\n');

    var props = e.properties || {};
    var propLines = [];
    for (var key in props) {
        if (Object.prototype.hasOwnProperty.call(props, key)) {
            var val = props[key];
            var typeTag = propTypes.hasOwnProperty(key) ? '(' + propTypes[key] + ')' : '(unregistered)';
            if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                propLines.push(key + ' ' + typeTag + ': {map}');
                Object.keys(val).forEach(function(k2) {
                    propLines.push('  ' + key + '.' + k2 + ': ' + val[k2]);
                });
            } else {
                propLines.push(key + ' ' + typeTag + ': ' + val);
            }
        }
    }
    if (propLines.length) {
        actor.send('Properties:\r\n' + propLines.map(function(l) { return '  ' + l; }).join('\r\n') + '\r\n');
    } else {
        actor.send('Properties: (none)\r\n');
    }

    var alignment = tapestry.alignment.get(found.id);
    var bucket = tapestry.alignment.bucket(found.id);
    var history = tapestry.alignment.history(found.id);
    var recentHistory = history.slice(-5);
    var historyStr = recentHistory.length > 0
        ? recentHistory.map(function(h) {
            return (h.delta > 0 ? '+' : '') + h.delta + ' (' + h.reason + ')';
          }).join(', ')
        : 'none';
    actor.send('Alignment: ' + alignment + ' [' + bucket + '] - last 5: ' + historyStr + '\r\n');
}

function renderRoomInspect(actor, roomId) {
    var name = tapestry.world.getRoomName(roomId);
    if (!name) {
        actor.send("No room found with id '" + roomId + "'.\r\n");
        return;
    }

    var area = tapestry.world.getRoomArea(roomId) || '(none)';
    var biome = tapestry.world.getRoomBiome ? tapestry.world.getRoomBiome(roomId) : null;

    // Build biome tag set for filtering flags (tag registry now exposes kind)
    var tagRegistry = tapestry.world.getTagRegistry ? tapestry.world.getTagRegistry() : [];
    var biomeTagNames = {};
    for (var i = 0; i < tagRegistry.length; i++) {
        if (tagRegistry[i].kind === 'biome') {
            biomeTagNames[tagRegistry[i].name] = true;
            biomeTagNames[tagRegistry[i].fullName] = true;
        }
    }

    var roomTags = tapestry.world.getRoomTags(roomId);
    var flagParts = [];
    for (var t = 0; t < roomTags.length; t++) {
        if (biomeTagNames[roomTags[t]]) { continue; }
        var known = tapestry.world.isTagKnown ? tapestry.world.isTagKnown(roomTags[t], null) : true;
        flagParts.push(known ? roomTags[t] : roomTags[t] + ' (unregistered)');
    }

    var propTypes = {};
    var propRegistry = tapestry.world.getPropertyRegistry ? tapestry.world.getPropertyRegistry() : [];
    for (var pr = 0; pr < propRegistry.length; pr++) {
        propTypes[propRegistry[pr].name] = propRegistry[pr].valueType;
    }

    var roomProps = tapestry.world.getRoomProperties ? tapestry.world.getRoomProperties(roomId) : {};
    var terrain = roomProps['terrain'] || null;

    var propLines = [];
    for (var key in roomProps) {
        if (Object.prototype.hasOwnProperty.call(roomProps, key)) {
            if (key === 'terrain') { continue; }
            var val = roomProps[key];
            var typeTag = propTypes.hasOwnProperty(key) ? '(' + propTypes[key] + ')' : '(unregistered)';
            propLines.push(key + ' ' + typeTag + ': ' + val);
        }
    }

    var exits = tapestry.world.getRoomExits(roomId);

    var occupants = tapestry.world.getRoomOccupants ? tapestry.world.getRoomOccupants(roomId) : [];
    var occupantNames = [];
    for (var o = 0; o < occupants.length; o++) {
        occupantNames.push(occupants[o].name + ' [' + occupants[o].type + ']');
    }

    actor.send('[Room: ' + roomId + ']\r\n');
    actor.send('Name:    ' + name + '\r\n');
    actor.send('Area:    ' + area + '\r\n');
    actor.send('Biome:   ' + (biome || '(none)') + '\r\n');
    actor.send('Terrain: ' + (terrain || '(none)') + '\r\n');
    actor.send('Flags:   ' + (flagParts.length ? flagParts.join(', ') : '(none)') + '\r\n');
    if (propLines.length) {
        actor.send('Properties:\r\n' + propLines.map(function(l) { return '  ' + l; }).join('\r\n') + '\r\n');
    } else {
        actor.send('Properties: (none)\r\n');
    }
    actor.send('Exits:   ' + (exits.length ? exits.join(', ') : '(none)') + '\r\n');
    actor.send('Occupants: ' + (occupantNames.length ? occupantNames.join(', ') : '(none)') + '\r\n');
}

tapestry.commands.register({
    name: 'inspect',
    description: 'Show detailed stats, equipment, and properties for a target, or inspect a room.',
    category: 'admin',
    admin: true,
    handler: function(actor, rawArgs) {
        if (!rawArgs || rawArgs.length === 0) {
            actor.send('Usage: inspect [entity] | inspect room [id]\r\n');
            return;
        }

        var first = rawArgs[0].toLowerCase();
        if (first === 'room') {
            var roomId = rawArgs.length > 1 ? rawArgs[1] : actor.roomId;
            if (!roomId) {
                actor.send('Not in a room.\r\n');
                return;
            }
            renderRoomInspect(actor, roomId);
        } else {
            renderEntityInspect(actor, rawArgs[0]);
        }
    }
});
