// templates -- list mob/item templates by keyword with live instance counts
// (ROM vnum + count parity). Tapestry has no vnums; templates are the identity
// equivalent. Keyword 'all' lists every registered template.

tapestry.commands.register({
    name: 'templates',
    description: 'List mob/item templates matching a keyword, with live instance counts.',
    category: 'admin',
    admin: true,
    args: { keyword: { type: 'text', required: true } },
    handler: function(actor, resolved) {
        var matches = tapestry.world.searchTemplates(resolved.keyword);
        if (matches.length === 0) {
            actor.send('No templates matching \'' + resolved.keyword + '\'.\r\n');
            return;
        }
        var cap = 100;
        var total = matches.length;
        var renderCount = total < cap ? total : cap;
        var out = 'Templates matching \'' + resolved.keyword + '\' (' + total + '):\r\n';
        for (var i = 0; i < renderCount; i++) {
            var t = matches[i];
            out += '  [' + t.kind + '] ' + t.id + ' - ' + t.name + ' (' + t.instances + ' live)\r\n';
        }
        if (total > cap) {
            out += '  ... and ' + (total - cap) + ' more; refine the keyword.\r\n';
        }
        actor.send(out);
    }
});
