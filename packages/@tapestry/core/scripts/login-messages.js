tapestry.events.on('player.login', function(event) {
    var data = event.data || {};
    var entityId = event.sourceEntityId;
    var name = data.playerName;
    if (!entityId || !name) { return; }

    var roomId = tapestry.world.getEntityRoomId(entityId);
    if (!roomId) { return; }

    tapestry.world.sendToRoomExcept(
        roomId,
        entityId,
        name + ' materializes from the threads of the Pattern.\r\n'
    );
});
