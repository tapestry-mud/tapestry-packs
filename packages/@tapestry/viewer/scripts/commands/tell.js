// Watch-mode privacy (Slice C): overrides @tapestry/core's `tell` so the DM reaches the player but
// is NOT mirrored to anonymous /watch spectators. Identical to core's tell except the two DM-content
// writes go through sendPrivate (per-write broadcast suppression). The guard/feedback lines stay on
// plain send -- they are feedback to the sender, not DM content, so a watcher seeing them is no leak.
// The GMCP tell is below the watch tap, so it is private regardless. Requires the dependency edge on
// @tapestry/core (declared in pack.yaml) + override:true, per the registration-policy override rules.
tapestry.commands.register({
    name: 'tell',
    override: true,
    aliases: ['t'],
    description: 'Send a private message to a player.',
    category: 'social',
    roles: ['player'],
    args: {
        target: { type: 'player', required: true },
        message: { type: 'text', required: true }
    },
    handler: function(actor, resolved) {
        var target = resolved.target;
        var message = resolved.message;

        if (tapestry.world.getProperty(actor.entityId, 'notell')) {
            actor.send('You cannot send tells right now.\r\n');
            return;
        }

        if (tapestry.world.getProperty(actor.entityId, 'nochannels')) {
            actor.send('You cannot use channels right now.\r\n');
            return;
        }

        if (tapestry.world.getProperty(target.id, 'notell')) {
            actor.send(target.name + ' is not accepting tells right now.\r\n');
            return;
        }

        actor.sendPrivate('<tell>You tell ' + target.name + ': "' + message + '"</tell>\r\n');
        tapestry.world.sendPrivate(target.id, '<tell>' + actor.name + ' tells you: "' + message + '"</tell>\r\n');
        tapestry.gmcp.send(target.id, 'Comm.Channel', { channel: 'tell', sender: actor.name, text: message });

        tapestry.world.setProperty(target.id, 'last_tell_from', actor.entityId);
        tapestry.world.setProperty(actor.entityId, 'last_tell_to', target.id);
    }
});
