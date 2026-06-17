tapestry.commands.register({
    name: 'link',
    aliases: [],
    admin: true,
    args: {},
    handler: function(actor, resolved) {
        actor.send("Starting link wizard. Type 'cancel' or 'quit' to exit at any time.\r\n");
        tapestry.flows.trigger(actor.entityId, "admin_link");
    }
});
