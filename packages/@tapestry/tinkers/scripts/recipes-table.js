(function() {
    'use strict';
    // Pack-internal recipe table. Keyed by recipe id.
    var _recipes = {};

    function shortId(id) {
        return id.indexOf(':') >= 0 ? id.split(':')[1] : id;
    }

    // Normalize a name/id for tolerant matching: lowercase, strip surrounding
    // quotes, collapse runs of space/hyphen/underscore to a single space.
    function normalize(s) {
        return String(s).toLowerCase().trim()
            .replace(/^['"]+|['"]+$/g, '')
            .replace(/[\s_-]+/g, ' ')
            .trim();
    }

    /**
     * Register a recipe. Also the interop export so other packs can contribute recipes.
     *
     * @param {object} recipe
     * @param {string} recipe.id              - Scoped recipe id, e.g. 'tapestry-tinkers:campfire-portable'
     * @param {string} recipe.name            - Short, single-word craft token shown to players, e.g. 'bench'
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

    // The human-facing name used to list, look up, and craft a recipe.
    function displayName(recipe) {
        return recipe.name || shortId(recipe.id).replace(/-/g, ' ');
    }

    // Normalized strings a query may match against for one recipe.
    function candidatesFor(recipe) {
        return [recipe.id, shortId(recipe.id), displayName(recipe)].map(normalize);
    }

    /**
     * Resolve a recipe by id, short id, or friendly name. Tolerant of spaces vs
     * hyphens and surrounding quotes; falls back to a unique substring match
     * (so 'camp' finds 'campfire'). Ambiguous or no match returns null.
     */
    function findRecipe(nameOrId) {
        if (nameOrId === null || nameOrId === undefined) { return null; }
        if (_recipes[nameOrId]) { return _recipes[nameOrId]; }
        var q = normalize(nameOrId);
        if (!q) { return null; }

        var keys = Object.keys(_recipes);
        var i, cands;

        // Exact match against id / short id / display name.
        for (i = 0; i < keys.length; i++) {
            cands = candidatesFor(_recipes[keys[i]]);
            if (cands.indexOf(q) >= 0) { return _recipes[keys[i]]; }
        }

        // Unique substring fallback (e.g. 'camp' -> 'campfire').
        var matches = [];
        for (i = 0; i < keys.length; i++) {
            cands = candidatesFor(_recipes[keys[i]]);
            for (var j = 0; j < cands.length; j++) {
                if (cands[j].indexOf(q) >= 0) { matches.push(_recipes[keys[i]]); break; }
            }
        }
        return matches.length === 1 ? matches[0] : null;
    }

    // Export addRecipe for cross-pack contribution (Phase 1 interop).
    tapestry.packs.export('addRecipe', addRecipe, {
        kind: 'command',
        description: 'Register a crafting recipe into the Tinkers recipe table.',
        params: [{ name: 'recipe', type: 'object' }],
        returns: 'undefined'
    });

    // Register a 'recipe' arg type so craft/recipes resolve a typed name through the
    // engine's standard arg resolver (consistent matching + error handling). The
    // resolve fn receives a single token; it resolves to a recipe and yields the recipe id.
    tapestry.args.registerType({
        name: 'recipe',
        resolve: function(actor, token, def) {
            var recipe = findRecipe(token);
            if (!recipe) {
                return {
                    success: false,
                    error: "You don't have a recipe called '" + token + "'. Type 'recipes' to see your book.\r\n"
                };
            }
            return { success: true, value: recipe.id };
        }
    });

    // Register the two bootstrap recipes.
    addRecipe({
        id: 'tapestry-tinkers:level-1-bench',
        name: 'bench',
        inputs: [{ material: 'wood', count: 20 }],
        benchLevelRequired: 0,
        output: 'tapestry-tinkers:crafting-bench'
    });

    addRecipe({
        id: 'tapestry-tinkers:campfire-portable',
        name: 'campfire',
        inputs: [{ material: 'wood', count: 5 }],
        benchLevelRequired: 1,
        output: 'tapestry-cooking:campfire-portable'
    });

    // Sibling files (commands/craft.js, commands/recipes.js) consume these via
    // tapestry.packs.require('@tapestry/tinkers') — late-bound, so file load order
    // does not matter (the importers sort BEFORE this file and that is fine).
    tapestry.packs.export('findRecipe', findRecipe, {
        kind: 'query',
        description: 'Resolve a recipe by id, short id, or friendly name (tolerant matching).',
        params: [{ name: 'nameOrId', type: 'string' }],
        returns: 'object'
    });
    tapestry.packs.export('displayName', displayName, {
        kind: 'query',
        description: 'Human-facing display name for a recipe object.',
        params: [{ name: 'recipe', type: 'object' }],
        returns: 'string'
    });
})();
