import * as tapestry from "@tapestry/engine";
tapestry.events.on('player.login', function(event) {
    var data = event.data || {};
    var entityId = event.sourceEntityId;
    var name = data.playerName;
    if (!entityId || !name) { return; }

    // Server-wide login announce (excludes the logging-in player, like gossip).
    tapestry.world.sendToAll(
        'The wheel turns, and ' + name + ' is woven into the pattern once more.\r\n',
        entityId
    );
});
