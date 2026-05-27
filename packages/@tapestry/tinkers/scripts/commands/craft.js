tapestry.commands.register({
    name: 'craft',
    description: 'Craft an item using a known recipe and materials in your inventory.',
    category: 'inventory',
    roles: ['player'],
    args: {
        recipe: { type: 'text', required: true }
    },
    handler: function(actor, resolved) {
        var recipeName = resolved.recipe;
        var recipe = _tinkersRecipes.findRecipe(recipeName);

        // 1. Recipe exists?
        if (!recipe) {
            actor.send("You don't know a recipe called '" + recipeName + "'.\r\n");
            return;
        }

        // 2. Recipe knowledge check:
        //    benchLevelRequired:0 → craftable without knowing it (bootstrap)
        //    benchLevelRequired:1+ → must be in player's recipe book
        if (recipe.benchLevelRequired > 0) {
            var knownRaw = tapestry.world.getProperty(actor.entityId, 'known_recipes') || [];
            var knownList = Array.isArray(knownRaw) ? knownRaw : [];
            if (knownList.indexOf(recipe.id) < 0) {
                actor.send("You don't know how to make that.\r\n");
                return;
            }
        }

        // 3. Bench check
        if (recipe.benchLevelRequired > 0) {
            var invItems = tapestry.inventory.getContents(actor.entityId) || [];
            var benchItem = null;
            for (var i = 0; i < invItems.length; i++) {
                var lvl = tapestry.world.getProperty(invItems[i].id, 'bench_level');
                if (lvl !== null && lvl !== undefined && lvl >= recipe.benchLevelRequired) {
                    benchItem = invItems[i];
                    break;
                }
            }
            // Also check room fixtures (e.g. a bench placed in the room)
            if (!benchItem) {
                var roomEntities = tapestry.world.getVisibleEntities(actor.roomId, actor.entityId);
                for (var j = 0; j < roomEntities.length; j++) {
                    var re = roomEntities[j];
                    var rlvl = tapestry.world.getProperty(re.id, 'bench_level');
                    if (rlvl !== null && rlvl !== undefined && rlvl >= recipe.benchLevelRequired) {
                        benchItem = re;
                        break;
                    }
                }
            }
            if (!benchItem) {
                actor.send("You need a level " + recipe.benchLevelRequired + " crafting bench.\r\n");
                return;
            }
        }

        // 4. Resolve inputs — validate ALL before consuming any
        var invItemsFull = tapestry.inventory.getContents(actor.entityId) || [];
        var toRemove = []; // flat list of entity ids to destroy

        for (var k = 0; k < recipe.inputs.length; k++) {
            var input = recipe.inputs[k];
            var needed = input.count;
            var found = [];

            for (var m = 0; m < invItemsFull.length; m++) {
                var it = invItemsFull[m];
                var matches = false;
                if (input.material) {
                    var mat = tapestry.world.getProperty(it.id, 'material');
                    matches = mat === input.material;
                } else if (input.id) {
                    var tid = tapestry.world.getProperty(it.id, 'template_id');
                    matches = tid === input.id;
                }
                if (matches) {
                    found.push(it.id);
                    if (found.length >= needed) { break; }
                }
            }

            if (found.length < needed) {
                var missing = needed - found.length;
                var what = input.material ? input.material + ' (material)' : input.id;
                actor.send("You're missing: " + missing + ' ' + what + ".\r\n");
                return; // validation failed — nothing consumed yet
            }

            for (var fi = 0; fi < needed; fi++) {
                toRemove.push(found[fi]);
            }
        }

        // 5. Consume inputs — inventory.destroy detaches from contents + untracks
        for (var ri = 0; ri < toRemove.length; ri++) {
            tapestry.inventory.destroy(actor.entityId, toRemove[ri]);
        }

        // 6. Spawn output
        var output = tapestry.items.spawnToInventory(recipe.output, actor.entityId);
        if (!output) {
            actor.send("Something went wrong — the crafted item couldn't be created.\r\n");
            return;
        }

        actor.send("You craft " + output.name + ".\r\n");
        actor.sendToRoom(actor.name + " crafts something.\r\n");
    }
});
