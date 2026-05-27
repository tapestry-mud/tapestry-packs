tapestry.commands.register({
    name: 'recipe',
    description: 'Show the details of a known recipe: inputs and required bench level.',
    category: 'inventory',
    roles: ['player'],
    args: {
        name: { type: 'text', required: true }
    },
    handler: function(actor, resolved) {
        var nameArg = resolved.name;
        var recipe = _tinkersRecipes.findRecipe(nameArg);

        if (!recipe) {
            actor.send("You don't know a recipe called '" + nameArg + "'.\r\n");
            return;
        }

        var knownRaw = tapestry.world.getProperty(actor.entityId, 'known_recipes') || [];
        var known = Array.isArray(knownRaw) ? knownRaw : [];
        if (recipe.benchLevelRequired > 0 && known.indexOf(recipe.id) < 0) {
            actor.send("You don't know that recipe.\r\n");
            return;
        }

        var shortId = recipe.id.indexOf(':') >= 0
            ? recipe.id.split(':')[1].replace(/-/g, ' ')
            : recipe.id;

        actor.send(shortId + ":\r\n");
        actor.send("  Output:    " + recipe.output + "\r\n");
        actor.send("  Bench:     level " + recipe.benchLevelRequired + "\r\n");
        actor.send("  Requires:\r\n");
        for (var i = 0; i < recipe.inputs.length; i++) {
            var inp = recipe.inputs[i];
            if (inp.material) {
                actor.send("    " + inp.count + "x " + inp.material + " (material)\r\n");
            } else if (inp.id) {
                actor.send("    " + inp.count + "x " + inp.id + "\r\n");
            }
        }
    }
});
