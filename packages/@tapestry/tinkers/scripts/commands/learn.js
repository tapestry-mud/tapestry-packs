tapestry.commands.register({
    name: 'learn',
    description: 'Study a recipe schematic to add it to your recipe book.',
    category: 'inventory',
    roles: ['player'],
    args: {
        item: { type: 'inventory', required: true }
    },
    handler: function(actor, resolved) {
        var item = resolved.item;
        var recipeId = tapestry.world.getProperty(item.id, 'teaches_recipe');

        if (!recipeId) {
            actor.send("There's nothing to learn from that.\r\n");
            return;
        }

        var knownRaw = tapestry.world.getProperty(actor.entityId, 'known_recipes') || [];
        var known = Array.isArray(knownRaw) ? knownRaw.slice() : [];

        if (known.indexOf(recipeId) >= 0) {
            actor.send("You already know that recipe.\r\n");
            return;
        }

        known.push(recipeId);
        tapestry.world.setProperty(actor.entityId, 'known_recipes', known);

        var displayName = recipeId.indexOf(':') >= 0
            ? recipeId.split(':')[1].replace(/-/g, ' ')
            : recipeId;

        actor.send("You study the schematic and learn how to craft: " + displayName + ".\r\n");

        // Destroy the schematic via inventory.destroy (detaches from contents + untracks).
        // Do NOT use removeEntity (room-only) or consumables.consume (needs charges).
        tapestry.inventory.destroy(actor.entityId, item.id);
    }
});
