// packages/@tapestry/builder/scripts/commands/dig.js
//
// Dig a new room in a direction, wire bidirectional inline exits, and move
// the builder into it. The active area + namespace are inferred from the
// builder's current room.
tapestry.commands.register({
    name: 'dig',
    aliases: [],
    description: 'Dig a new room in a direction and move into it (dig north).',
    category: 'builder',
    roles: ['admin', 'builder'],
    args: {
        direction: { type: 'keyword', required: true }
    },
    handler: function (actor, resolved) {
        var dir = String(resolved.direction).toLowerCase();
        var opposite = {
            north: 'south', south: 'north', east: 'west',
            west: 'east', up: 'down', down: 'up'
        }[dir];
        if (!opposite) {
            actor.send("Unknown direction: " + dir + "\r\n");
            return;
        }

        var fromId = actor.roomId;
        if (!fromId || fromId.indexOf(':') < 1) {
            actor.send("You must be standing in an authored room to dig.\r\n");
            return;
        }
        var area = tapestry.world.getRoomArea(fromId);
        if (!area) {
            actor.send("Could not determine the area of your current room.\r\n");
            return;
        }
        var namespace = fromId.substring(0, fromId.indexOf(':'));

        // Mint a collision-free key: area-<n>, bumping n past any existing id.
        var existing = tapestry.world.getRoomsInArea(area) || [];
        var taken = {};
        for (var i = 0; i < existing.length; i++) {
            taken[existing[i]] = true;
        }
        var n = existing.length;
        var newId;
        do {
            newId = namespace + ':' + area + '-' + n;
            n++;
        } while (taken[newId]);

        if (!tapestry.authoring.createRoom(area, newId, 'New Room', 'An undescribed room.')) {
            actor.send("Could not dig that room.\r\n");
            return;
        }
        tapestry.authoring.setRoomExit(fromId, dir, newId);
        tapestry.authoring.setRoomExit(newId, opposite, fromId);
        tapestry.world.teleportEntity(actor.entityId, newId);
        actor.send("You dig " + dir + " into a new room.\r\n");
    }
});
