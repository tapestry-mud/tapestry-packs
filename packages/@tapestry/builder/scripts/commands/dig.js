// packages/@tapestry/builder/scripts/commands/dig.js
//
// dig <dir>            — carve a NEW room in a direction, wire two-way exits, move in.
// dig <dir> <target>   — connect a two-way exit to an EXISTING authored room in the
//                        same area; do not create anything, do not move. <target> is a
//                        short id (castle-3 -> prefix inferred from the current room's
//                        namespace) or a fully-qualified id (castle:castle-3).
//
// The active area + namespace are inferred from the builder's current room.
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
        // Accept abbreviations (n/s/e/w/u/d) as well as full names.
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

        // Seam: dig is intra-area only — it wires INLINE exits between authored rooms (which
        // export with the pack). You cannot dig off a PRE-EXISTING (pack) room: an exit on a
        // pack room can't persist in the rooms side-car (it's skipped on reload because the
        // room already loaded from the pack), so the way back would vanish on restart. Attach
        // a new area to the existing world once, explicitly, with 'link'. Pack rooms carry the
        // engine-set source_pack property; authored rooms do not.
        var fromProps = tapestry.world.getRoomProperties(fromId) || {};
        if (fromProps.source_pack) {
            actor.send("You can't dig off '" + fromId + "' — it belongs to a pack. Dig only " +
                "within an area you're authoring; use 'link' to attach your area to the world.\r\n");
            return;
        }

        // ---------------------------------------------------------------------------
        // CONNECT path: dig <dir> <target> — wire a door to an EXISTING authored room.
        // Spec §4.1 guards, in order; on any failure send a specific message, change nothing.
        // ---------------------------------------------------------------------------
        if (resolved.target) {
            // Resolve the target id: prefix inference (castle-3 -> castle:castle-3).
            var targetRef = String(resolved.target);
            var targetId = targetRef.indexOf(':') >= 1
                ? targetRef
                : namespace + ':' + targetRef;

            if (targetId === fromId) {
                actor.send("You can't link a room to itself.\r\n");
                return;
            }

            // Guard 2: the target must exist.
            if (!tapestry.world.getRoomName(targetId)) {
                actor.send("There is no room '" + targetId + "'. Use 'rooms' to list this " +
                    "area's rooms.\r\n");
                return;
            }

            // Guard 3: the target must be authored (no source_pack) — an exit onto a pack
            // room can't persist in the side-car and would vanish on reload.
            var targetProps = tapestry.world.getRoomProperties(targetId) || {};
            if (targetProps.source_pack) {
                actor.send("'" + targetId + "' belongs to a pack — you can only connect rooms " +
                    "you've authored. Use 'link' to attach your area to the world.\r\n");
                return;
            }

            // Guard 4: same area.
            var targetArea = tapestry.world.getRoomArea(targetId);
            if (targetArea !== area) {
                actor.send("'" + targetId + "' is in area '" + targetArea + "', not '" + area +
                    "'. dig only connects rooms within the same area.\r\n");
                return;
            }

            // Guard 5: the chosen direction must be free here — never clobber an exit.
            if (tapestry.world.getExitTarget(fromId, dir)) {
                actor.send("You already have a " + dir + " exit.\r\n");
                return;
            }

            // Guard 6: if the target's reverse slot is occupied, wire forward-only + notice.
            var reverseTaken = tapestry.world.getExitTarget(targetId, opposite);
            tapestry.authoring.setRoomExit(fromId, dir, targetId);
            if (reverseTaken) {
                actor.send(tapestry.world.getRoomName(targetId) + " already has a " + opposite +
                    " exit — linked one-way (" + dir + " from here).\r\n");
                return;
            }
            tapestry.authoring.setRoomExit(targetId, opposite, fromId);
            actor.send("You connect " + dir + " to " + tapestry.world.getRoomName(targetId) +
                " (" + targetId + "). Two-way exit wired.\r\n");
            return;
        }

        // ---------------------------------------------------------------------------
        // CARVE path: dig <dir> — today's behavior, unchanged.
        // ---------------------------------------------------------------------------

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
