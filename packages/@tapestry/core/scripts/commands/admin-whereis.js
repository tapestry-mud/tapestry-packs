// whereis / mwhere / owhere -- locate entities by name keyword (ROM mwhere/owhere parity).
// Backed by the engine-wide world.findEntitiesByName query; carried items resolve
// their room through the holder and report the holder's name.

function whereisRender(actor, keyword, typeFilter, label) {
    var matches = tapestry.world.findEntitiesByName(keyword);
    var filtered = [];
    for (var i = 0; i < matches.length; i++) {
        var m = matches[i];
        if (typeFilter && m.type !== typeFilter) { continue; }
        filtered.push(m);
    }
    if (filtered.length === 0) {
        actor.send('No ' + label + ' matching \'' + keyword + '\' found.\r\n');
        return;
    }
    var cap = 100;
    var total = filtered.length;
    var renderCount = total < cap ? total : cap;
    var lines = [];
    for (var j = 0; j < renderCount; j++) {
        var e = filtered[j];
        var loc;
        if (e.roomName) {
            loc = e.roomName + ' [' + e.roomId + ']';
        } else {
            loc = '(no room)';
        }
        if (e.holderName) {
            if (e.roomName) {
                loc = 'carried by ' + e.holderName + ' in ' + loc;
            } else {
                loc = 'carried by ' + e.holderName;
            }
        }
        lines.push('  ' + e.name + ' (' + e.type + ') - ' + loc + '\r\n');
    }
    var out = 'Found ' + total + ' ' + label + ' matching \'' + keyword + '\':\r\n' + lines.join('');
    if (total > cap) {
        out += '  ... and ' + (total - cap) + ' more; refine the keyword.\r\n';
    }
    actor.send(out);
}

tapestry.commands.register({
    name: 'whereis',
    description: 'Locate all entities matching a name.',
    category: 'admin',
    admin: true,
    args: { keyword: { type: 'text', required: true } },
    handler: function(actor, resolved) {
        whereisRender(actor, resolved.keyword, null, 'entities');
    }
});

tapestry.commands.register({
    name: 'mwhere',
    description: 'Locate all NPCs matching a name.',
    category: 'admin',
    admin: true,
    args: { keyword: { type: 'text', required: true } },
    handler: function(actor, resolved) {
        whereisRender(actor, resolved.keyword, 'npc', 'NPCs');
    }
});

tapestry.commands.register({
    name: 'owhere',
    description: 'Locate all items matching a name.',
    category: 'admin',
    admin: true,
    args: { keyword: { type: 'text', required: true } },
    handler: function(actor, resolved) {
        whereisRender(actor, resolved.keyword, 'item', 'items');
    }
});
