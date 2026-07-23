import * as tapestry from "@tapestry/engine";

tapestry.commands.register({
    name: 'recall',
    roles: ['player'],
    args: {},
    handler: function(actor, resolved) {
        // Recall to the player's own recall_room_id -- the property this pack
        // already registers (properties.yml: "Room ID where the player recalls
        // to") and the death handler in combat/output.ts already honours. The
        // verb itself read neither, so a world that ships its own hub had no way
        // to point `recall` at it and every recall dropped the player into
        // tapestry-core:recall, a two-room pocket with no exit back into the
        // game. Fallback keeps the historical destination for any world that
        // never sets the property.
        var recallRoom = tapestry.world.getProperty(actor.entityId, 'recall_room_id') || 'tapestry-core:recall';
        var moved = tapestry.world.teleportEntity(actor.entityId, recallRoom);
        if (moved) {
            actor.send('You are surrounded by a brief flash of light...\r\n');
            tapestry.world.sendRoomDescription(actor.entityId);
            tapestry.events.publish('player.teleported', {
                entityId: actor.entityId
            });
        } else {
            actor.send('You failed to recall.\r\n');
        }
    }
});
