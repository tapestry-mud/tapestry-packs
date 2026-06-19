import * as tapestry from "@tapestry/engine";

tapestry.commands.register({
    name: 'commands',
    aliases: ['cmds'],
    roles: ['player'],
    args: { filter: { type: 'text', required: false } },
    handler: function(actor, resolved) {
        var filterRaw = resolved.filter ? String(resolved.filter).trim() : '';
        var filter = filterRaw.toLowerCase();

        var vocab = tapestry.commands.categories();        // [{id,label}] declared order, visible only
        var entries = tapestry.commands.listForPlayer(actor.entityId); // {keyword,category,description,aliases}

        // Apply the free-text filter: keyword | alias | category id | category label.
        var labelById = {};
        for (var v = 0; v < vocab.length; v++) {
            labelById[vocab[v].id] = vocab[v].label;
        }
        var visible = [];
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (!filter) {
                visible.push(e);
                continue;
            }
            if (matchesFilter(e, labelById[e.category] || '', filter)) {
                visible.push(e);
            }
        }

        if (visible.length === 0) {
            if (filter) {
                actor.send("No commands match '" + filterRaw + "'.\r\n");
            } else {
                actor.send('No commands available.\r\n');
            }
            tapestry.gmcp.send(actor.entityId, 'Commands.Open', filter ? { filter: filterRaw } : {});
            return;
        }

        // Group visible entries by category id.
        var byCat = {};
        for (var g = 0; g < visible.length; g++) {
            var cat = visible[g].category;
            if (!byCat[cat]) { byCat[cat] = []; }
            byCat[cat].push(visible[g]);
        }

        var effWidth = tapestry.ui.width(actor.entityId); // 0 = wrapping off / unbounded
        var panelWidth = effWidth > 0 ? effWidth : 80;    // the grid auto-fits the player width
        var longest = 0;
        for (var k = 0; k < visible.length; k++) {
            if (visible[k].keyword.length > longest) { longest = visible[k].keyword.length; }
        }
        var colWidth = longest + 2; // 2-space inter-column gap
        // panelWidth - 2 frame - 2 left indent leaves the column band; the frame pads the remainder.
        var cols = Math.floor((panelWidth - 4) / colWidth);
        if (cols < 1) { cols = 1; }

        var sections: any[] = [{ rows: [{ type: 'title', left: 'Commands (' + visible.length + ')' }] }];

        for (var c = 0; c < vocab.length; c++) {
            var id = vocab[c].id;
            var members = byCat[id];
            if (!members || members.length === 0) { continue; } // omit empty sections

            members.sort(function(a, b) { return a.keyword.localeCompare(b.keyword); });

            var titleRow = id === 'admin'
                ? { type: 'title', left: vocab[c].label + ' (' + members.length + ')', right: 'admins only' }
                : { type: 'title', left: vocab[c].label + ' (' + members.length + ')' };

            var rows: any[] = [titleRow];
            for (var r = 0; r < members.length; r += cols) {
                var cells = [{ content: '', width: 2 }]; // left indent
                for (var j = 0; j < cols && r + j < members.length; j++) {
                    cells.push({ content: members[r + j].keyword, width: colWidth });
                }
                rows.push({ type: 'cell', cells: cells });
            }

            sections.push({ separatorAbove: 'minor', rows: rows });
        }

        sections.push({
            separatorAbove: 'minor',
            rows: [{ type: 'footer', content: 'commands <text> to filter . help <cmd> for detail' }]
        });

        var output = tapestry.ui.panel({ width: panelWidth, forEntity: actor.entityId, sections: sections });
        actor.send('\r\n' + output + '\r\n');
        tapestry.gmcp.send(actor.entityId, 'Commands.Open', filter ? { filter: filterRaw } : {});
    }
});

function matchesFilter(entry, label, filter) {
    if (entry.keyword.toLowerCase().indexOf(filter) !== -1) { return true; }
    if (entry.category.toLowerCase().indexOf(filter) !== -1) { return true; }
    if (label.toLowerCase().indexOf(filter) !== -1) { return true; }
    if (entry.aliases) {
        for (var a = 0; a < entry.aliases.length; a++) {
            if (entry.aliases[a].toLowerCase().indexOf(filter) !== -1) { return true; }
        }
    }
    return false;
}
