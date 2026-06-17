// abilities (alias: slookup) -- search registered abilities by keyword
// Keyword 'all' lists every ability. ROM slookup parity.

tapestry.commands.register({
    name: 'abilities',
    aliases: ['slookup'],
    admin: true,
    args: { keyword: { type: 'text', required: true } },
    handler: function(actor, resolved) {
        var matches = tapestry.abilities.search(resolved.keyword);
        if (matches.length === 0) {
            actor.send('No abilities matching \'' + resolved.keyword + '\'.\r\n');
            return;
        }
        var cap = 100;
        var total = matches.length;
        var renderCount = total < cap ? total : cap;
        var out = 'Abilities matching \'' + resolved.keyword + '\' (' + total + '):\r\n';
        for (var i = 0; i < renderCount; i++) {
            var a = matches[i];
            var packLabel = a.pack ? ' [' + a.pack + ']' : '';
            out += '  ' + a.id + ' - ' + a.name + ' (' + a.type + '/' + a.category + ')' + packLabel + '\r\n';
        }
        if (total > cap) {
            out += '  ... and ' + (total - cap) + ' more; refine the keyword.\r\n';
        }
        actor.send(out);
    }
});
