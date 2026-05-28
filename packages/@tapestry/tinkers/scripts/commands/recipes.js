tapestry.commands.register({
    name: 'recipes',
    description: "List the recipes in your book, or show one recipe's details: recipes [name]",
    category: 'inventory',
    roles: ['player'],
    args: {
        // Optional: when given, resolves (via the 'recipe' arg type) to a recipe id
        // and shows that recipe's details. When omitted, lists the whole book.
        recipe: { type: 'recipe', required: false }
    },
    handler: function(actor, resolved) {
        var knownRaw = tapestry.world.getProperty(actor.entityId, 'known_recipes') || [];
        var known = Array.isArray(knownRaw) ? knownRaw : [];

        // --- Detail view: 'recipes <name>' ---
        // resolved.recipe is a recipe id when the arg resolved, else null.
        if (resolved.recipe) {
            var recipe = _tinkersRecipes.findRecipe(resolved.recipe);
            if (!recipe) {
                actor.send("That recipe isn't in your book. Type 'recipes' to see it.\r\n");
                return;
            }

            var name = _tinkersRecipes.displayName(recipe);
            actor.send(name + ":\r\n");
            if (recipe.benchLevelRequired > 0) {
                actor.send("  Bench:      requires a level " + recipe.benchLevelRequired + " crafting bench\r\n");
            } else {
                actor.send("  Bench:      none needed (craft by hand)\r\n");
            }
            actor.send("  Materials:\r\n");
            for (var i = 0; i < recipe.inputs.length; i++) {
                var inp = recipe.inputs[i];
                if (inp.material) {
                    actor.send("    " + inp.count + "x " + inp.material + "\r\n");
                } else if (inp.id) {
                    actor.send("    " + inp.count + "x " + inp.id + "\r\n");
                }
            }
            actor.send("  To build:   craft " + name + "\r\n");
            return;
        }

        // --- List view: 'recipes' ---
        if (known.length === 0) {
            actor.send("Your recipe book is empty. Find a schematic, 'read' it, then 'copy' it to learn a recipe.\r\n");
            return;
        }

        actor.send("Your recipe book:\r\n");
        for (var k = 0; k < known.length; k++) {
            var r = _tinkersRecipes.findRecipe(known[k]);
            if (!r) {
                actor.send("  " + known[k] + "\r\n");
                continue;
            }
            var dn = _tinkersRecipes.displayName(r);
            var bench = r.benchLevelRequired > 0
                ? "needs a level " + r.benchLevelRequired + " bench"
                : "craft by hand";
            actor.send("  " + dn + "  -- " + bench + "\r\n");
        }
        actor.send("\r\n");
        actor.send("Type 'recipes <name>' for materials, or 'craft <name>' to build it.\r\n");
    }
});
