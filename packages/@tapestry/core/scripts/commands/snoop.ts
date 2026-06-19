import * as tapestry from "@tapestry/engine";

tapestry.commands.register({
    name: 'snoop',
    admin: true,
    args: {
        target: { type: 'keyword', required: true }
    },
    handler: function (actor, resolved) {
        var arg = (resolved.target || '').toLowerCase();

        if (arg === 'off' || arg === 'stop') {
            if (tapestry.watch.stop(actor.entityId)) {
                actor.send('*** You stop snooping. ***\r\n');
            } else {
                actor.send('You are not snooping anyone.\r\n');
            }
            return;
        }

        var players = tapestry.world.getOnlinePlayers();
        var target = null;
        for (var i = 0; i < players.length; i++) {
            if (players[i].name.toLowerCase() === arg) {
                target = players[i];
                break;
            }
        }

        if (!target) {
            actor.send('No online player named "' + resolved.target + '".\r\n');
            return;
        }
        if (target.id === actor.entityId) {
            actor.send('You cannot snoop yourself.\r\n');
            return;
        }

        // Admins are off-limits: no spying on a fellow admin.
        var targetRoles = tapestry.world.getEntityRoles(target.id) || [];
        for (var r = 0; r < targetRoles.length; r++) {
            if (String(targetRoles[r]).toLowerCase() === 'admin') {
                actor.send('You cannot snoop another admin.\r\n');
                return;
            }
        }

        if (tapestry.watch.start(actor.entityId, target.id)) {
            actor.send('*** Now snooping ' + target.name + '. Type "snoop off" to stop. ***\r\n');
        } else {
            actor.send('Could not start snooping ' + target.name + '.\r\n');
        }
    }
});
