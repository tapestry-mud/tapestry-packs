tapestry.commands.register({
    name: 'restore',
    admin: true,
    args: {
        target: { type: 'keyword', required: true }
    },
    handler: function(actor, resolved) {
        if (resolved.target.toLowerCase() === 'all') {
            var players = tapestry.world.getOnlinePlayers();
            for (var i = 0; i < players.length; i++) {
                tapestry.stats.restoreVitals(players[i].id);
                tapestry.world.send(players[i].id, 'You feel completely restored.\r\n');
            }
            actor.send('Restored ' + players.length + ' player(s).\r\n');
            return;
        }
        var found = tapestry.world.findPlayerByName(resolved.target);
        if (!found) {
            actor.send('No player named ' + resolved.target + ' is online.\r\n');
            return;
        }
        tapestry.stats.restoreVitals(found.id);
        tapestry.world.send(found.id, 'You feel completely restored.\r\n');
        actor.send('Restored ' + found.name + '.\r\n');
    }
});
