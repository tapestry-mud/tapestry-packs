// at -- ROM admin parity
// Execute a command as yourself as if standing in the target's room, then
// teleport back.  Target may be a player name (prefix match) or a literal
// room id.
//
// Movement notes:
// - teleportEntity publishes "player.moved" which updates mob-AI occupancy
//   tracking and sends a GMCP room update to the teleporting player.  Other
//   players in the old/new rooms do NOT receive arrival/departure messages
//   (WorldEventModule only notifies mob-AI, not room occupants).  So the
//   teleport is effectively invisible to other players -- close to ROM's
//   silent at.
//
// - If the executed command itself moves the actor (e.g. "at temple north"),
//   the teleport-back still yanks them home regardless.  This matches ROM
//   behavior: at always returns you regardless of what the command did.
tapestry.commands.register({
    name: 'at',
    admin: true,
    args: {
        target: { type: 'keyword', required: true },
        command: { type: 'text', required: true }
    },
    handler: function(actor, resolved) {
        var destRoomId = null;

        var player = tapestry.world.findPlayerByName(resolved.target);
        if (player) {
            destRoomId = tapestry.world.getEntityRoomId(player.id);
        } else if (tapestry.world.getRoomName(resolved.target)) {
            destRoomId = resolved.target;
        }

        if (!destRoomId) {
            actor.send('No player or room \'' + resolved.target + '\' found.\r\n');
            return;
        }

        var homeRoomId = actor.roomId;
        if (destRoomId === homeRoomId) {
            tapestry.admin.executeAs(actor.entityId, resolved.command);
            return;
        }

        if (!tapestry.world.teleportEntity(actor.entityId, destRoomId)) {
            actor.send('Could not reach ' + destRoomId + '.\r\n');
            return;
        }
        tapestry.admin.executeAs(actor.entityId, resolved.command);
        tapestry.world.teleportEntity(actor.entityId, homeRoomId);
    }
});
