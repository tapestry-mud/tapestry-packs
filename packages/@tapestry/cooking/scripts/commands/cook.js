tapestry.commands.register({
    name: 'cook',
    description: 'Cook a meal using ingredients in your inventory.',
    category: 'inventory',
    roles: ['player'],
    args: {
        item: { type: 'inventory', required: true }
    },
    handler: function(actor, resolved) {
        var item = resolved.item;

        var cookable = tapestry.world.getProperty(item.id, 'cookable');
        if (!cookable) {
            actor.send("You can't cook that.\r\n");
            return;
        }

        var cooksInto = tapestry.world.getProperty(item.id, 'cooks_into');
        if (!cooksInto) {
            actor.send("You don't know how to cook that.\r\n");
            return;
        }

        var result = tapestry.consumables.consume(actor.entityId, item.id);
        if (!result || !result.success) {
            actor.send("You can't cook that right now.\r\n");
            return;
        }

        var spawn = tapestry.items.spawnToInventory(cooksInto, actor.entityId);
        if (!spawn) {
            actor.send("Something went wrong — the cooked result couldn't be created.\r\n");
            return;
        }
        actor.send('You cook ' + item.name + ' into ' + spawn.name + '.\r\n');
        actor.sendToRoom(actor.name + ' cooks something over a nearby flame.\r\n');
    }
});
