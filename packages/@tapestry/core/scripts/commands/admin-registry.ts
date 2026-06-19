// Registry introspection command.
// Levels: bare = summary chip grid (Level 0), <kind> = winners list (Level 1),
// <kind> <name> = full ledger (Level 2), <kind> <text> = filtered Level 1.
// 'conflicts' = cross-kind shadow/ambiguity view.
// Filter is a declared text arg (not resolved.rest) to avoid the dead-filter trap.

import * as tapestry from "@tapestry/engine";
tapestry.commands.register(<any>{
    name: 'registry',
    admin: true,
    args: { filter: { type: 'text', required: false } },
    handler: function(actor, resolved) {
        var raw = resolved.filter ? String(resolved.filter).trim() : '';
        var tokens = raw ? raw.split(/\s+/) : [];
        var kind = tokens.length > 0 ? tokens[0].toLowerCase() : '';
        var detail = tokens.length > 1 ? tokens.slice(1).join(' ').toLowerCase() : '';

        if (!kind) {
            showLevel0(actor);
            return;
        }

        if (kind === 'conflicts') {
            showConflicts(actor);
            return;
        }

        var summary = tapestry.registry.summary();
        var kindEntry = null;
        for (var i = 0; i < summary.length; i++) {
            if (summary[i].kind === kind) {
                kindEntry = summary[i];
                break;
            }
        }

        if (!kindEntry) {
            var validKinds = summary.map(function(r) { return r.kind; }).sort().join(', ');
            actor.send("No registry kind '" + kind + "'. Known: " + validKinds + '\r\n');
            return;
        }

        if (!detail) {
            showLevel1(actor, kind, kindEntry.model);
        } else {
            showLevel2orFilter(actor, kind, detail, kindEntry.model);
        }
    }
});

function showLevel0(actor) {
    var summary = tapestry.registry.summary();
    var effWidth = tapestry.ui.width(actor.entityId);
    var panelWidth = effWidth > 0 ? effWidth : 80;

    var totalRegs = 0;
    var totalConflicts = 0;
    for (var i = 0; i < summary.length; i++) {
        totalRegs += summary[i].count;
        totalConflicts += summary[i].conflicts;
    }

    var longestKind = 7;
    for (var i = 0; i < summary.length; i++) {
        if (summary[i].kind.length > longestKind) {
            longestKind = summary[i].kind.length;
        }
    }
    // chip: "kind ~ NN" or "kind NN" - longestKind + 2 marker + 1 space + 3 digits + 2 gap
    var chipWidth = longestKind + 8;
    var cols = Math.floor((panelWidth - 4) / chipWidth);
    if (cols < 1) { cols = 1; }

    var policy = [];
    var namespaced = [];
    for (var i = 0; i < summary.length; i++) {
        if (summary[i].model === 'namespaced') {
            namespaced.push(summary[i]);
        } else {
            policy.push(summary[i]);
        }
    }
    policy.sort(function(a, b) { return a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0; });
    namespaced.sort(function(a, b) { return a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0; });
    var sorted = policy.concat(namespaced);

    var titleStr = 'Registry (' + summary.length + ' kinds . ' + totalRegs + ' regs' +
        (totalConflicts > 0 ? ' . ' + totalConflicts + ' conflicts' : '') + ')';

    var chipRows = [];
    for (var r = 0; r < sorted.length; r += cols) {
        var cells = [{ content: '', width: 2 }];
        for (var j = 0; j < cols && r + j < sorted.length; j++) {
            var e = sorted[r + j];
            var marker = e.model === 'namespaced' ? ' ~' : '';
            cells.push({ content: e.kind + marker + ' ' + e.count, width: chipWidth });
        }
        chipRows.push({ type: 'cell', cells: cells });
    }

    var footerMsg = totalConflicts > 0
        ? '! ' + totalConflicts + ' conflict(s) . registry conflicts to list'
        : 'registry <kind> to browse . ~ = namespaced model';

    var sections = [
        { rows: [{ type: 'title', left: titleStr }] },
        { separatorAbove: 'minor', rows: chipRows },
        { separatorAbove: 'minor', rows: [{ type: 'footer', content: footerMsg }] }
    ];

    actor.send('\r\n' + tapestry.ui.panel({ width: panelWidth, forEntity: actor.entityId, sections: sections }) + '\r\n');
}

function showConflicts(actor) {
    var conflicts = tapestry.registry.conflicts();
    if (!conflicts || conflicts.length === 0) {
        actor.send('No conflicts found across any registry kind.\r\n');
        return;
    }

    var byKind = {};
    for (var i = 0; i < conflicts.length; i++) {
        var c = conflicts[i];
        if (!byKind[c.kind]) { byKind[c.kind] = []; }
        byKind[c.kind].push(c);
    }

    var kinds = Object.keys(byKind).sort();
    var out = 'Registry conflicts (' + conflicts.length + ' entries):\r\n';
    for (var k = 0; k < kinds.length; k++) {
        var kindConfs = byKind[kinds[k]];
        out += '\r\n' + kinds[k] + ':\r\n';
        for (var i = 0; i < kindConfs.length; i++) {
            var c = kindConfs[i];
            if (c.model === 'policy') {
                if (c.isWinner) {
                    out += '  [winner] ' + registryPad(c.name, 16) + ' ' + registryPad(c.owner, 24) + ' (shadows ' + c.shadows + ')\r\n';
                } else {
                    out += '  [shadow] ' + registryPad(c.name, 16) + ' ' + registryPad(c.owner, 24) + ' (shadowed by ' + c.shadowedBy + ')\r\n';
                }
            } else {
                out += '  [ambig ] ' + registryPad(c.name, 16) + ' ' + registryPad(c.owner, 24) + ' (also: ' + c.ambiguousOwners.join(', ') + ')\r\n';
            }
        }
    }
    actor.send(out);
}

function showLevel1(actor, kind, model) {
    var entries = tapestry.registry.list(kind, null);
    if (!entries || entries.length === 0) {
        actor.send("No registrations for kind '" + kind + "'.\r\n");
        return;
    }

    var winners = [];
    var shadowCount = 0;
    for (var i = 0; i < entries.length; i++) {
        if (entries[i].isWinner) {
            winners.push(entries[i]);
            if (entries[i].shadows) { shadowCount++; }
        }
    }
    winners.sort(function(a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });

    var shadowNote = shadowCount > 0 ? '                    ! = shadows another' : '';
    var out = kind + ' (' + winners.length + ')' + shadowNote + '\r\n';

    for (var i = 0; i < winners.length; i++) {
        var e = winners[i];
        var note = '';
        if (model === 'namespaced' && e.isAmbiguous) {
            note = ' ~ ambiguous (' + e.ambiguousOwners.join(', ') + ')';
        } else if (e.shadows) {
            note = ' ! shadows ' + e.shadows;
        } else if (e.isOverride) {
            note = ' (overrides kernel)';
        }
        out += '  ' + registryPad(e.name, 16) + ' ' + registryPad(e.owner, 24) + note + '\r\n';
    }

    if (model === 'namespaced') {
        out += '(~ = namespaced: no override, qualify with pack:name for ambiguous entries)\r\n';
    }
    actor.send(out);
}

function showLevel2orFilter(actor, kind, detail, model) {
    var exactEntries = tapestry.registry.list(kind, detail);

    if (exactEntries && exactEntries.length > 0) {
        showLevel2(actor, kind, detail, exactEntries, model);
        return;
    }

    var allEntries = tapestry.registry.list(kind, null);
    var lowerDetail = detail.toLowerCase();
    var filtered = [];
    for (var i = 0; i < allEntries.length; i++) {
        var e = allEntries[i];
        if (e.name.toLowerCase().indexOf(lowerDetail) !== -1 ||
            e.owner.toLowerCase().indexOf(lowerDetail) !== -1) {
            filtered.push(e);
        }
    }

    if (filtered.length === 0) {
        actor.send("Nothing matching '" + detail + "' in registry kind '" + kind + "'.\r\n");
        return;
    }

    var winners = [];
    for (var i = 0; i < filtered.length; i++) {
        if (filtered[i].isWinner) { winners.push(filtered[i]); }
    }
    winners.sort(function(a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });

    var out = kind + ' [filter: ' + detail + '] (' + winners.length + '):\r\n';
    for (var i = 0; i < winners.length; i++) {
        var e = winners[i];
        var note = e.shadows ? ' ! shadows ' + e.shadows : '';
        out += '  ' + registryPad(e.name, 16) + ' ' + registryPad(e.owner, 24) + note + '\r\n';
    }
    actor.send(out);
}

function showLevel2(actor, kind, name, entries, model) {
    var winner = null;
    var loser = null;
    for (var i = 0; i < entries.length; i++) {
        if (entries[i].isWinner) {
            winner = entries[i];
        } else {
            loser = entries[i];
        }
    }

    if (!winner) {
        actor.send("No registration found for '" + kind + ':' + name + "'.\r\n");
        return;
    }

    var out = kind + ': ' + winner.name + '\r\n';

    if (model === 'namespaced') {
        if (winner.isAmbiguous) {
            out += '  status:    ambiguous\r\n';
            out += '  declared:  ' + winner.ambiguousOwners.join(', ') + '\r\n';
        } else {
            out += '  owner:     ' + winner.owner + '\r\n';
        }
        out += '  source:    (not tracked)\r\n';
        if (winner.valueType !== undefined) {
            out += '  type:      ' + winner.valueType + '\r\n';
            if (winner.min !== null && winner.min !== undefined) {
                out += '  min:       ' + winner.min + '\r\n';
            }
            if (winner.max !== null && winner.max !== undefined) {
                out += '  max:       ' + winner.max + '\r\n';
            }
            if (winner.enum && winner.enum.length > 0) {
                out += '  values:    ' + winner.enum.join(', ') + '\r\n';
            }
            if (winner.transient) {
                out += '  transient: yes\r\n';
            }
        }
        if (winner.appliesTo && winner.appliesTo.length > 0) {
            out += '  applies:   ' + winner.appliesTo.join(', ') + '\r\n';
        }
        if (winner.tagKind) {
            out += '  tag kind:  ' + winner.tagKind + '\r\n';
        }
    } else {
        var loc = winner.sourceFile ? winner.sourceFile + ':' + winner.line : '(engine)';
        out += '  winner:    ' + loc + '\r\n';
        out += '  owner:     ' + winner.owner + '\r\n';
        out += '  override:  ' + (winner.isOverride ? 'yes (declared override: true)' : 'no') + '\r\n';
        if (loser) {
            var loserLoc = loser.sourceFile ? loser.sourceFile + ':' + loser.line : '(engine)';
            out += '  shadows:   ' + loserLoc + '   (lost: lower precedence)\r\n';
            out += '  shadowing: ' + loser.owner + '\r\n';
        }
    }

    actor.send(out);
}

// Unique name: a bare `padRight` collides with groups.js's same-named global in
// the shared pack realm (its version truncates via substring), which silently cut
// every registry name to the column width. Keep this local and pad-only.
function registryPad(str, len) {
    var s = String(str);
    while (s.length < len) { s += ' '; }
    return s;
}
