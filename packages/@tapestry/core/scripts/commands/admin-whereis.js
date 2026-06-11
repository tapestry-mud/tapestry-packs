// whereis / mwhere / owhere -- locate entities by name keyword (ROM mwhere/owhere parity).
// Backed by the engine-wide world.findEntitiesByName query; carried items resolve
// their room through the holder and report the holder's name.

function whereisRender(actor, keyword, typeFilter, label) {
    var matches = tapestry.world.findEntitiesByName(keyword);
    var lines = [];
    for (var i = 0; i < matches.length; i++) {
        var m = matches[i];
        if (typeFilter && m.type !== typeFilter) { continue; }
        var loc;
        if (m.roomName) {
            loc = m.roomName + ' [' + m.roomId + ']';
        } else {
            loc = '(no room)';
        }
        if (m.holderName) {
            if (m.roomName) {
                loc = 'carried by ' + m.holderName + ' in ' + loc;
            } else {
                loc = 'carried by ' + m.holderName;
            }
        }
        lines.push('  ' + m.name + ' (' + m.type + ') - ' + loc + '\r\n');
    }
    if (lines.length === 0) {
        actor.send('No ' + label + ' matching \'' + keyword + '\' found.\r\n');
        return;
    }
    actor.send('Found ' + lines.length + ' ' + label + ' matching \'' + keyword + '\':\r\n' + lines.join(''));
}

tapestry.commands.register({
    name: 'whereis',
    description: 'Locate all entities matching a name.',
    category: 'admin',
    admin: true,
    args: { keyword: { type: 'keyword', required: true } },
    handler: function(actor, resolved) {
        whereisRender(actor, resolved.keyword, null, 'entities');
    }
});

tapestry.commands.register({
    name: 'mwhere',
    description: 'Locate all NPCs matching a name.',
    category: 'admin',
    admin: true,
    args: { keyword: { type: 'keyword', required: true } },
    handler: function(actor, resolved) {
        whereisRender(actor, resolved.keyword, 'npc', 'NPCs');
    }
});

tapestry.commands.register({
    name: 'owhere',
    description: 'Locate all items matching a name.',
    category: 'admin',
    admin: true,
    args: { keyword: { type: 'keyword', required: true } },
    handler: function(actor, resolved) {
        whereisRender(actor, resolved.keyword, 'item', 'items');
    }
});
