tapestry.commands.register({
    name: 'motd',
    roles: ['player'],
    args: {},
    priority: 0,
    handler: function(actor, resolved) {
        tapestry.world.sendMotd(actor.entityId);
    }
});
