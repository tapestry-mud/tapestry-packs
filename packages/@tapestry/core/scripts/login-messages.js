tapestry.events.on('player.login', function(event) {
    var entityId = event.sourceEntityId;
    if (!entityId) { return; }

    var name = tapestry.world.getEntityName(entityId);
    var roomId = tapestry.world.getEntityRoom(entityId);
    if (!name || !roomId) { return; }

    tapestry.world.sendToRoomExcept(
        roomId,
        entityId,
        name + ' materializes from the threads of the Pattern.\r\n'
    );
});
