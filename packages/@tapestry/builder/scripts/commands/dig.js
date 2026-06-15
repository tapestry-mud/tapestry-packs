// packages/@tapestry/builder/scripts/commands/dig.js
//
// dig <dir>            - carve a NEW room in a direction, wire two-way exits, move in.
// dig <dir> <target>  - connect a two-way exit to an EXISTING authored room in the
//                        same area; do not create anything, do not move.
tapestry.commands.register({
    name: 'dig',
    aliases: [],
    description: 'Dig a new room (dig north) or connect to an existing one (dig north castle-3).',
    category: 'builder',
    roles: ['admin', 'builder'],
    args: {
        direction: { type: 'keyword', required: true },
        target: { type: 'keyword', required: false }
    },
    handler: function (actor, resolved) {
        var dirAliases = {
            n: 'north', s: 'south', e: 'east', w: 'west', u: 'up', d: 'down',
            north: 'north', south: 'south', east: 'east', west: 'west', up: 'up', down: 'down'
        };
        var dir = dirAliases[String(resolved.direction).toLowerCase()];
        if (!dir) {
            actor.send("Unknown direction: " + resolved.direction + "\r\n");
            return;
        }
        var opposite = {
            north: 'south', south: 'north', east: 'west',
            west: 'east', up: 'down', down: 'up'
        }[dir];

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
        var fromProps = tapestry.world.getRoomProperties(fromId) || {};

        // -----------------------------------------------------------------------
        // CONNECT path: dig <dir> <target> - wire exits to an EXISTING authored room.
        // -----------------------------------------------------------------------
        if (resolved.target) {
            // Guard: from-room must be authored. A side-car exit against a pack room
            // vanishes on reload; connections.create is not appropriate for CONNECT
            // because the target is already an authored room that owns its exits.
            if (fromProps.source_pack) {
                actor.send("You can't connect from '" + fromId + "' - it belongs to a pack. " +
                    "Use 'link' to attach your area to the world.\r\n");
                return;
            }

            var targetRef = String(resolved.target);
            var targetId = targetRef.indexOf(':') >= 1
                ? targetRef
                : namespace + ':' + targetRef;

            if (targetId === fromId) {
                actor.send("You can't link a room to itself.\r\n");
                return;
            }

            var targetName = tapestry.world.getRoomName(targetId);
            if (!targetName) {
                actor.send("There is no room '" + targetId + "'. Use 'rooms' to list this area's rooms.\r\n");
                return;
            }

            var targetProps = tapestry.world.getRoomProperties(targetId) || {};
            if (targetProps.source_pack) {
                actor.send("'" + targetId + "' belongs to a pack - you can only connect rooms you've authored.\r\n");
                return;
            }

            var targetArea = tapestry.world.getRoomArea(targetId);
            if (targetArea !== area) {
                actor.send("'" + targetId + "' is not in this area" +
                    (targetArea ? " (it's in '" + targetArea + "')" : "") +
                    ". dig only connects rooms within the same area.\r\n");
                return;
            }

            var existingTarget = tapestry.world.getExitTarget(fromId, dir);
            if (existingTarget) {
                actor.send("Your " + dir + " exit is already taken (it goes to " + existingTarget + ").\r\n");
                return;
            }

            var reverseTaken = tapestry.world.getExitTarget(targetId, opposite);
            tapestry.authoring.setRoomExit(fromId, dir, targetId);
            if (reverseTaken) {
                actor.send(targetName + "'s " + opposite + " exit is already taken - linked one-way (" +
                    dir + " from here).\r\n");
                return;
            }
            tapestry.authoring.setRoomExit(targetId, opposite, fromId);
            actor.send("You connect " + dir + " to " + targetName +
                " (" + targetId + "). Two-way exit wired.\r\n");
            return;
        }

        // -----------------------------------------------------------------------
        // CARVE path: dig <dir> - mint a new room and wire exits.
        //   From authored room: inline side-car exits (unchanged behavior).
        //   From packed room:   wire boundary as a connection record (spec B 5.1).
        // -----------------------------------------------------------------------

        // Mint a collision-free key. Area IDs are namespace:slug, so take only the
        // slug portion to avoid double-colon room IDs on Windows paths.
        var existing = tapestry.world.getRoomsInArea(area) || [];
        var taken = {};
        for (var i = 0; i < existing.length; i++) {
            taken[existing[i]] = true;
        }
        var areaSlug = area.indexOf(':') >= 0 ? area.substring(area.lastIndexOf(':') + 1) : area;
        var n = existing.length;
        var newId;
        do {
            newId = namespace + ':' + areaSlug + '-' + n;
            n++;
        } while (taken[newId]);

        // Shadow guard (spec B 5.2): refuse before creating anything if the pack room
        // already has an exit in the chosen direction. Applying a connection exit over
        // an existing pack exit would shadow the pack's own topology at runtime.
        if (fromProps.source_pack) {
            var shadowTarget = tapestry.world.getExitTarget(fromId, dir);
            if (shadowTarget) {
                actor.send("Your " + dir + " exit is already taken (it goes to " + shadowTarget + ").\r\n");
                return;
            }
        }

        if (!tapestry.authoring.createRoom(area, newId, 'New Room', 'An undescribed room.')) {
            actor.send("Could not dig that room.\r\n");
            return;
        }

        if (fromProps.source_pack) {
            // Carve-into-pack (spec B 5.1): wire the boundary as a connection record so
            // neither side of the link is stored in pack data. The connection system
            // applies both exits at runtime and persists the record under data/connections/.
            // RemoveConnectionBackedExits keeps the connection exit out of the authored
            // room's side-car on any subsequent WriteSideCar call.
            tapestry.connections.create(
                fromId, 'direction', { direction: dir },
                newId, 'direction', { direction: opposite });
            tapestry.world.teleportEntity(actor.entityId, newId);
            // Boundary message (spec B 5.3): ASCII only.
            actor.send("You dig " + dir + " into a new room. (" + fromId +
                " belongs to a pack - your way back is a connection kept outside the" +
                " pack, so it survives pack updates.)\r\n");
            return;
        }

        // Authored from-room: inline side-car exits (original behavior, unchanged).
        tapestry.authoring.setRoomExit(fromId, dir, newId);
        tapestry.authoring.setRoomExit(newId, opposite, fromId);
        tapestry.world.teleportEntity(actor.entityId, newId);
        actor.send("You dig " + dir + " into a new room.\r\n");
    }
});
