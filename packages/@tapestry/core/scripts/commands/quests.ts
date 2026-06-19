import * as tapestry from "@tapestry/engine";

tapestry.commands.register({
    name: 'quests',
    aliases: ['journal'],
    roles: ['player'],
    args: {
        subcommand: { type: 'keyword', required: false },
        target: { type: 'text', required: false }
    },
    handler: function(actor, resolved) {
        var sub = resolved.subcommand ? resolved.subcommand.toLowerCase() : null;
        var target = resolved.target || null;

        if (sub === 'abandon' && target) {
            handleQuestAbandon(actor, target);
        } else if (sub && target) {
            handleQuestDetail(actor, sub + ' ' + target);
        } else if (sub) {
            handleQuestDetail(actor, sub);
        } else {
            handleQuestList(actor);
        }
    }
});

function handleQuestList(actor) {
    var state = tapestry.quests.getState(actor.entityId);
    var active = (state && state.active) ? state.active : [];

    if (active.length === 0) {
        actor.send('\r\nYou have no active quests. Explore the world to find them.\r\n');
        return;
    }

    var sections = [];

    active.forEach(function(q) {
        var rows = [];
        rows.push({ type: 'title', left: q.name + '  (' + (q.type || 'side') + ')' });

        q.objectives.forEach(function(obj) {
            if (obj.complete) {
                rows.push({ type: 'text', content: '  [done] ' + obj.description });
            } else {
                rows.push({
                    type: 'cell',
                    cells: [
                        { content: '  ' + obj.description, width: 'fill' },
                        { content: '[' + obj.current + '/' + obj.required + ']', width: 12 }
                    ]
                });
                if (obj.required > 1) {
                    rows.push({
                        type: 'cell',
                        cells: [
                            { content: '  ', width: 2 },
                            { type: 'progress', value: obj.current, max: obj.required, width: 22 }
                        ]
                    });
                }
            }
        });

        sections.push({ rows: rows });
    });

    var output = tapestry.ui.panel({ sections: sections });
    actor.send('\r\n' + output + '\r\n');
}

function handleQuestDetail(actor, nameFragment) {
    var state = tapestry.quests.getState(actor.entityId);
    var active = (state && state.active) ? state.active : [];

    var lower = nameFragment.toLowerCase();
    var match = active.find(function(q) {
        return q.name.toLowerCase().indexOf(lower) !== -1 ||
               q.questId.toLowerCase().indexOf(lower) !== -1;
    });

    if (!match) {
        actor.send('\r\nNo active quest matching "' + nameFragment + '".\r\n');
        return;
    }

    var rows = [];
    rows.push({ type: 'title', left: match.name + '  (' + (match.type || 'side') + ')' });

    if (match.stageDescription) {
        rows.push({ type: 'text', content: '  ' + match.stageDescription });
        rows.push({ type: 'text', content: '' });
    }

    rows.push({ type: 'text', content: '  Stage ' + (match.stageIndex + 1) + ' of ' + match.stageCount });
    rows.push({ type: 'text', content: '' });

    match.objectives.forEach(function(obj) {
        if (obj.complete) {
            rows.push({ type: 'text', content: '  [done] ' + obj.description });
        } else {
            rows.push({
                type: 'cell',
                cells: [
                    { content: '  ' + obj.description, width: 'fill' },
                    { content: '[' + obj.current + '/' + obj.required + ']', width: 12 }
                ]
            });
            if (obj.required > 1) {
                rows.push({
                    type: 'cell',
                    cells: [
                        { content: '  ', width: 2 },
                        { type: 'progress', value: obj.current, max: obj.required, width: 28 }
                    ]
                });
            }
        }
    });

    var output = tapestry.ui.panel({ sections: [{ rows: rows }] });
    actor.send('\r\n' + output + '\r\n');
}

function handleQuestAbandon(actor, nameFragment) {
    var state = tapestry.quests.getState(actor.entityId);
    var active = (state && state.active) ? state.active : [];

    var lower = nameFragment.toLowerCase();
    var match = active.find(function(q) {
        return q.name.toLowerCase().indexOf(lower) !== -1 ||
               q.questId.toLowerCase().indexOf(lower) !== -1;
    });

    if (!match) {
        actor.send('\r\nNo active quest matching "' + nameFragment + '".\r\n');
        return;
    }

    tapestry.quests.abandon(actor.entityId, match.questId);
    actor.send('\r\nYou abandon "' + match.name + '".\r\n');
}
