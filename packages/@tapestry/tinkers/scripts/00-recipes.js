var _tinkersRecipes = (function() {
    // Pack-internal recipe table. Keyed by recipe id.
    var _recipes = {};

    /**
     * Register a recipe. Also the interop export so other packs can contribute recipes.
     *
     * @param {object} recipe
     * @param {string} recipe.id              - Scoped recipe id, e.g. 'tapestry-tinkers:campfire-portable'
     * @param {Array}  recipe.inputs          - [{material: 'wood', count: 20}] or [{id: 'core:iron', count: 5}]
     * @param {number} recipe.benchLevelRequired - 0 = no bench needed
     * @param {string} recipe.output          - Template id of the crafted result
     */
    function addRecipe(recipe) {
        if (!recipe.id || !recipe.output) {
            throw new Error('addRecipe: recipe must have id and output');
        }
        _recipes[recipe.id] = recipe;
    }

    /** Resolve a recipe by id or by display name (case-insensitive match on short id). */
    function findRecipe(nameOrId) {
        if (_recipes[nameOrId]) {
            return _recipes[nameOrId];
        }
        var lower = nameOrId.toLowerCase();
        var keys = Object.keys(_recipes);
        for (var i = 0; i < keys.length; i++) {
            var r = _recipes[keys[i]];
            var shortId = r.id.indexOf(':') >= 0 ? r.id.split(':')[1] : r.id;
            if (shortId.toLowerCase() === lower || r.id.toLowerCase() === lower) {
                return r;
            }
        }
        return null;
    }

    /** Return all registered recipes as an array. */
    function getAllRecipes() {
        return Object.keys(_recipes).map(function(k) { return _recipes[k]; });
    }

    // Export addRecipe for cross-pack contribution (Phase 1 interop)
    tapestry.packs.export('addRecipe', addRecipe, {
        kind: 'command',
        description: 'Register a crafting recipe into the Tinkers recipe table.',
        params: [{ name: 'recipe', type: 'object' }],
        returns: 'undefined'
    });

    // Register the two bootstrap recipes
    addRecipe({
        id: 'tapestry-tinkers:level-1-bench',
        inputs: [{ material: 'wood', count: 20 }],
        benchLevelRequired: 0,
        output: 'tapestry-tinkers:crafting-bench'
    });

    addRecipe({
        id: 'tapestry-tinkers:campfire-portable',
        inputs: [{ material: 'wood', count: 5 }],
        benchLevelRequired: 1,
        output: 'tapestry-cooking:campfire-portable'
    });

    return {
        addRecipe: addRecipe,
        findRecipe: findRecipe,
        getAllRecipes: getAllRecipes
    };
})();
