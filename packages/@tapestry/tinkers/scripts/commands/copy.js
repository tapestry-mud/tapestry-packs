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

        // Non-destructive: the schematic is a reference you transcribe from, not consumed.
        actor.send("You carefully copy the plans into your recipe book: " + displayName + ".\r\n");
        actor.sendToRoom(actor.name + " studies " + item.name + ", scribbling notes.\r\n");
    }
});
