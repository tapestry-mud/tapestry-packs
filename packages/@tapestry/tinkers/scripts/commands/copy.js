tapestry.commands.register({
    name: 'copy',
    description: 'Copy a schematic or set of plans into your recipe book.',
    category: 'inventory',
    roles: ['player'],
    args: {
        item: { type: 'findable', required: true }
    },
    handler: function(actor, resolved) {
        var item = resolved.item;
        var recipeId = tapestry.world.getProperty(item.id, 'teaches_recipe');

        if (!recipeId) {
            actor.send("There's nothing on that worth copying down.\r\n");
            return;
        }

        var knownRaw = tapestry.world.getProperty(actor.entityId, 'known_recipes') || [];
        var known = Array.isArray(knownRaw) ? knownRaw.slice() : [];

        if (known.indexOf(recipeId) >= 0) {
            actor.send("You've already copied that into your recipe book.\r\n");
            return;
        }

        known.push(recipeId);
        tapestry.world.setProperty(actor.entityId, 'known_recipes', known);

        var displayName = recipeId.indexOf(':') >= 0
            ? recipeId.split(':')[1].replace(/-/g, ' ')
            : recipeId;

        actor.send("You copy the plans into your recipe book: " + displayName +
            ". The worn schematic crumbles as you transcribe the last of it.\r\n");
        actor.sendToRoom(actor.name + " studies " + item.name + ", then sets the spent schematic aside.\r\n");

        // Consume the schematic: one schematic teaches one player. inventory.destroy
        // detaches from the holder's contents + untracks. (Not removeEntity/consume --
        // those leave non-consumable items dangling; see Task 7.5.)
        tapestry.inventory.destroy(actor.entityId, item.id);
    }
});
