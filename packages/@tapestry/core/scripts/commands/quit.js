tapestry.commands.register({
    name: 'quit',
    aliases: ['qq'],
    roles: ['player'],
    priority: 0,
    args: {},
    handler: function(actor, resolved) {
        actor.send('Farewell, adventurer. Until next time.\r\n');
        tapestry.world.sendToRoomExcept(
            actor.roomId,
            actor.entityId,
            actor.name + ' fades from existence.\r\n'
        );
        tapestry.world.disconnectPlayer(actor.entityId);
    }
});
