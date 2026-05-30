// packages/@tapestry/builder/scripts/commands/create-room.js
//
// Create a blank room in the active area with no auto-exit and no move.
// Command name is single-token ('croom'); a multi-word "create room" keyword
// would never resolve (router matches only the first token). Alias kept.
tapestry.commands.register({
    name: 'croom',
    aliases: ['createroom'],
    description: 'Create a blank room in the active area with no auto-exit (croom <key>).',
    category: 'builder',
    roles: ['admin', 'builder'],
    args: {
        key: { type: 'keyword', required: true }
    },
    handler: function (actor, resolved) {
        var fromId = actor.roomId;
        if (!fromId || fromId.indexOf(':') < 1) {
            actor.send("You must be standing in an authored room to create one.\r\n");
            return;
        }
        var area = tapestry.world.getRoomArea(fromId);
        if (!area) {
            actor.send("Could not determine the area of your current room.\r\n");
            return;
        }
        var namespace = fromId.substring(0, fromId.indexOf(':'));
        var newId = namespace + ':' + String(resolved.key);

        if (!tapestry.authoring.createRoom(area, newId, 'New Room', 'An undescribed room.')) {
            actor.send("Could not create room (bad key, duplicate, or namespace mismatch).\r\n");
            return;
        }
        actor.send("Created room " + newId + " in area " + area + ".\r\n");
    }
});
