// packages/@tapestry/builder/scripts/commands/map.js
//
// map — the player-view map: your surroundings within 3 hops, centered on you,
// no room ids (dot label mode), no fog (v1 shows the connected area). Builders get
// the id-annotated version with 'rooms'.
tapestry.commands.register({
    name: 'map',
    aliases: [],
    description: 'Show a map of your surroundings.',
    category: 'info',
    roles: ['player'],
    args: {},
    handler: function (actor, resolved) {
        var fromId = actor.roomId;
        if (!fromId) {
            actor.send("There's nothing to map here.\r\n");
            return;
        }
        var area = tapestry.world.getRoomArea(fromId);
        if (!area) {
            actor.send("There's nothing to map here.\r\n");
            return;
        }

        var out = tapestry.world.renderAreaMap(fromId, {
            scope: 'radius',
            radius: 3,
            label: 'dot',
            showCurrent: true,
            legend: {
                forest: 'f', stone: 's', water: 'w', sand: '.',
                road: '=', grass: '"', mountain: 'A'
            }
        });
        actor.send(out + "\r\n");
    }
});
