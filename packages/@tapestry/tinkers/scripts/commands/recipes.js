tapestry.commands.register({
    name: 'recipes',
    description: 'List the recipes you know.',
    category: 'inventory',
    roles: ['player'],
    args: {},
    handler: function(actor) {
        var knownRaw = tapestry.world.getProperty(actor.entityId, 'known_recipes') || [];
        var known = Array.isArray(knownRaw) ? knownRaw : [];

        if (known.length === 0) {
            actor.send("You don't know any recipes yet.\r\n");
            return;
        }

        actor.send("Your recipe book:\r\n");
        for (var i = 0; i < known.length; i++) {
            var recipe = _tinkersRecipes.findRecipe(known[i]);
            var shortId = known[i].indexOf(':') >= 0
                ? known[i].split(':')[1].replace(/-/g, ' ')
                : known[i];
            var bench = recipe ? ' (bench L' + recipe.benchLevelRequired + ')' : '';
            actor.send('  ' + shortId + bench + '\r\n');
        }
    }
});
