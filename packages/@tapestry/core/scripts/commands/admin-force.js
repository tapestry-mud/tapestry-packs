// force -- ROM admin parity
// Notify-before-execute order: target sees 'X forces you to ...' BEFORE the
// forced command's output (matching ROM).  If executeAs returns false (no
// session / bad id), world.send went nowhere, so no stray notification.
tapestry.commands.register({
    name: 'force',
    description: 'Force a player or mob to execute a command.',
    category: 'admin',
    admin: true,
    args: {
        target: { type: 'keyword', required: true },
        command: { type: 'text', required: true }
    },
    handler: function(actor, resolved) {
        var targetName = resolved.target.toLowerCase();

        var player = tapestry.world.findPlayerByName(resolved.target);
        if (player) {
            if (player.id !== actor.entityId && tapestry.world.hasRole(player.id, 'admin')) {
                actor.send('You cannot force another admin.\r\n');
                return;
            }
            // Notify target first so 'forces you' appears before forced output.
            tapestry.world.send(player.id, actor.name + ' forces you to \'' + resolved.command + '\'.\r\n');
            if (!tapestry.admin.executeAs(player.id, resolved.command)) {
                actor.send('Could not force ' + player.name + '.\r\n');
                return;
            }
            actor.send('You force ' + player.name + ' to \'' + resolved.command + '\'.\r\n');
            return;
        }

        if (actor.roomId) {
            var occupants = tapestry.world.getRoomOccupants(actor.roomId);
            for (var i = 0; i < occupants.length; i++) {
                if (occupants[i].type === 'npc' && occupants[i].name.toLowerCase().indexOf(targetName) !== -1) {
                    tapestry.mobs.command(occupants[i].id, resolved.command, 0);
                    actor.send('You force ' + occupants[i].name + ' to \'' + resolved.command + '\'.\r\n');
                    return;
                }
            }
        }

        actor.send('No player or mob named \'' + resolved.target + '\' found.\r\n');
    }
});
