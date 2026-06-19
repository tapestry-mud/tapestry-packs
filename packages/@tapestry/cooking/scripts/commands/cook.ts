import * as tapestry from "@tapestry/engine";

tapestry.commands.register({
    name: 'cook',
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

        // Find cooking tool: inventory first, then room
        var toolItem = null;
        var invItems = tapestry.inventory.getContents(actor.entityId) || [];
        for (var i = 0; i < invItems.length; i++) {
            if (tapestry.world.getProperty(invItems[i].id, 'can_cook')) {
                toolItem = invItems[i];
                break;
            }
        }

        var roomEntities = tapestry.world.getVisibleEntities(actor.roomId, actor.entityId);
        if (!toolItem) {
            for (var j = 0; j < roomEntities.length; j++) {
                var re = roomEntities[j];
                var rt = re.type || '';
                if ((rt === 'item' || rt === 'container' || rt.indexOf('item:') === 0) &&
                    tapestry.world.getProperty(re.id, 'can_cook')) {
                    toolItem = re;
                    break;
                }
            }
        }

        if (!toolItem) {
            actor.send("You need something to cook with.\r\n");
            return;
        }

        // Check heat source - skip if tool is self-contained (microwave)
        if (!tapestry.world.getProperty(toolItem.id, 'heat_source')) {
            var hasHeat = false;
            for (var k = 0; k < roomEntities.length; k++) {
                var he = roomEntities[k];
                var ht = he.type || '';
                if ((ht === 'item' || ht === 'container' || ht.indexOf('item:') === 0) &&
                    tapestry.world.getProperty(he.id, 'heat_source')) {
                    hasHeat = true;
                    break;
                }
            }
            if (!hasHeat) {
                actor.send("You need a heat source nearby.\r\n");
                return;
            }
        }

        var result = tapestry.consumables.consume(actor.entityId, item.id);
        if (!result || !result.success) {
            actor.send("You can't cook that right now.\r\n");
            return;
        }

        var spawn = tapestry.items.spawnToInventory(cooksInto, actor.entityId);
        if (!spawn) {
            actor.send("Something went wrong - the cooked result couldn't be created.\r\n");
            return;
        }

        var cookText = tapestry.world.getProperty(toolItem.id, 'cook_text');
        if (cookText) {
            actor.send(cookText.replace('{item}', item.name) + '\r\n');
        } else {
            actor.send('You cook ' + item.name + ' into ' + spawn.name + '.\r\n');
        }
        actor.sendToRoom(actor.name + ' cooks something.\r\n');

        // Single-use cooking tools (e.g. a portable campfire) are spent after one meal.
        // Reusable tools (stoves, ovens) have no destroy_on_empty and are left untouched.
        if (tapestry.world.getProperty(toolItem.id, 'destroy_on_empty')) {
            tapestry.consumables.consume(actor.entityId, toolItem.id);
        }
    }
});
