// Watch-mode privacy (Slice C): overrides @tapestry/core's `reply` (a tell to your last sender) so
// the DM reaches the player but is NOT mirrored to anonymous /watch spectators. reply is a DM too --
// leaving it on plain send would leak DMs through the back door. Same treatment as the tell override:
// the two DM-content writes use sendPrivate; guard/feedback lines stay public; GMCP is below the tap.
tapestry.commands.register({
    name: 'reply',
    override: true,
    aliases: ['r'],
    description: 'Reply to the last player who sent you a tell.',
    category: 'social',
    roles: ['player'],
    args: {
        message: { type: 'text', required: true }
    },
    handler: function(actor, resolved) {
        var message = resolved.message;

        var lastFrom = tapestry.world.getProperty(actor.entityId, 'last_tell_from');
        if (!lastFrom) {
            actor.send('You have no one to reply to.\r\n');
            return;
        }

        var players = tapestry.world.getOnlinePlayers();
        var found = null;
        for (var i = 0; i < players.length; i++) {
            if (players[i].id === lastFrom) {
                found = players[i];
                break;
            }
        }

        if (!found) {
            actor.send('That player is no longer online.\r\n');
            return;
        }

        if (tapestry.world.getProperty(actor.entityId, 'notell')) {
            actor.send('You cannot send tells right now.\r\n');
            return;
        }

        actor.sendPrivate('<tell>You tell ' + found.name + ': "' + message + '"</tell>\r\n');
        tapestry.world.sendPrivate(found.id, '<tell>' + actor.name + ' tells you: "' + message + '"</tell>\r\n');
        tapestry.gmcp.send(found.id, 'Comm.Channel', { channel: 'tell', sender: actor.name, text: message });

        tapestry.world.setProperty(found.id, 'last_tell_from', actor.entityId);
        tapestry.world.setProperty(actor.entityId, 'last_tell_to', found.id);
    }
});
