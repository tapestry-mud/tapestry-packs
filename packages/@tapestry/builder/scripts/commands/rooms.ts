// packages/@tapestry/builder/scripts/commands/rooms.ts
//
// rooms [<area>] -- the builder's authoring discovery tool.
//   rooms           -- renders the current area's id-annotated ASCII map (original behavior).
//   rooms <area>    -- lists every room in <area> (bare or namespaced id) with id, name,
//                      and per-room provenance tag; handy for navigation/teleport targeting.
// All map projection/rendering is engine-side (tapestry.world.renderAreaMap); this stays thin.

import * as tapestry from "@tapestry/engine";

tapestry.commands.register({
    name: 'rooms',
    aliases: [],
    roles: ['admin', 'builder'],
    args: {
        area: { type: 'keyword', required: false }
    },
    handler: function (actor, resolved) {
        var areaArg = resolved.area || '';
        if (areaArg) {
            var ref = String(areaArg);
            var colon = ref.indexOf(':');
            var areaId = colon >= 0 ? ref.substring(colon + 1) : ref;

            var rooms = tapestry.authoring.getAreaRooms(areaId) || [];
            if (!rooms.length) {
                actor.send("No rooms in area '" + areaId + "'.\r\n");
                return;
            }
            var lines = ["Rooms in " + areaId + ":"];
            for (var i = 0; i < rooms.length; i++) {
                var r = rooms[i];
                lines.push("  " + r.id + "  " + r.name + "  " + r.provenance);
            }
            lines.push("Use 'teleport <id>' to jump to one.");
            actor.send(lines.join("\r\n") + "\r\n");
            return;
        }
        var fromId = actor.roomId;
        if (!fromId || fromId.indexOf(':') < 1) {
            actor.send("You must be standing in an authored room to list rooms.\r\n");
            return;
        }
        var props = tapestry.world.getRoomProperties(fromId) || {};
        if (props.source_pack) {
            actor.send("This room belongs to a pack - 'rooms' works inside areas you author.\r\n");
            return;
        }
        var area = tapestry.world.getRoomArea(fromId);
        if (!area) {
            actor.send("Could not determine the area of your current room.\r\n");
            return;
        }

        var out = tapestry.world.renderAreaMap(fromId, {
            scope: 'area',
            label: 'id',
            showCurrent: true,
            // Terrain glyph legend — duplicated in map.js; keep both in sync.
            legend: {
                forest: 'f', stone: 's', water: 'w', sand: '.',
                road: '=', grass: '"', mountain: 'A'
            }
        });
        actor.send("Area: " + area + "\r\n" + out + "\r\n");
    }
});
