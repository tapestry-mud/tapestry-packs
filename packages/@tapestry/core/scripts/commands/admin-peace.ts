import * as tapestry from "@tapestry/engine";
tapestry.commands.register({
    name: 'peace',
    admin: true,
    handler: function(actor, resolved) {
        if (!actor.roomId) {
            actor.send('You are nowhere.\r\n');
            return;
        }
        var occupants = tapestry.world.getRoomOccupants(actor.roomId);
        var cleared = 0;
        for (var i = 0; i < occupants.length; i++) {
            if (tapestry.combat.isInCombat(occupants[i].id)) {
                tapestry.combat.removeFromAllCombat(occupants[i].id);
                cleared++;
            }
        }
        if (cleared === 0) {
            actor.send('The room is already at peace.\r\n');
            return;
        }
        actor.send('You impose peace on the room.\r\n');
        actor.sendToRoom('Peace settles over the room.\r\n');
    }
});
