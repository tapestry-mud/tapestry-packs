// packages/@tapestry/core/scripts/commands/areas.js
//
// areas -- list world areas by level range.
// Players see name/short/level range.
// Builders and admins additionally see id, provenance tag, room count, and override count.
tapestry.commands.register({
    name: 'areas',
    aliases: [],
    description: 'List the world\'s areas by level range.',
    category: 'info',
    roles: ['player'],
    args: {},
    priority: 0,
    handler: function (actor, resolved) {
        var isBuilder = actor.hasRole('builder') || actor.hasRole('admin');
        var list = tapestry.authoring.getAreas(isBuilder) || [];
        if (!list.length) {
            actor.send("There are no areas yet.\r\n");
            return;
        }

        var lines = [];
        for (var i = 0; i < list.length; i++) {
            var a = list[i];
            var lr = (a.levelRange && a.levelRange.length === 2)
                ? (a.levelRange[0] + '-' + a.levelRange[1])
                : '?';
            if (isBuilder) {
                var wipTag = a.wip ? ' [WIP]' : '';
                lines.push('[' + lr + '] ' + a.name + ' (' + a.id + ') ' + a.provenance + wipTag +
                    ' rooms:' + a.roomCount + ' edits:' + a.overrideCount);
                if (a.short) {
                    lines.push('    ' + a.short);
                }
            } else {
                lines.push('[' + lr + '] ' + a.name + (a.short ? ' - ' + a.short : ''));
            }
        }
        actor.send(lines.join('\r\n') + '\r\n');
    }
});
