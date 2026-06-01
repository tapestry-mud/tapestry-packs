// packages/@tapestry/builder/scripts/commands/rooms.js
//
// rooms — the builder's authoring discovery tool. Renders the current area's rooms
// as an id-annotated ASCII map + legend (short id, name, exits) so you know what to
// type in `dig <dir> <id>`. All projection/rendering is engine-side
// (tapestry.world.renderAreaMap); this command stays thin.
tapestry.commands.register({
    name: 'rooms',
    aliases: [],
    description: 'List this area\'s rooms with an id-annotated map (builder).',
    category: 'builder',
    roles: ['admin', 'builder'],
    args: {},
    handler: function (actor, resolved) {
        var fromId = actor.roomId;
        if (!fromId || fromId.indexOf(':') < 1) {
            actor.send("You must be standing in an authored room to list rooms.\r\n");
            return;
        }
        var props = tapestry.world.getRoomProperties(fromId) || {};
        if (props.source_pack) {
            actor.send("This room belongs to a pack — 'rooms' works inside areas you author.\r\n");
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
