import * as tapestry from "@tapestry/engine";

tapestry.commands.register({
    name: 'read',
    roles: ['player'],
    args: {
        item: { type: 'findable', required: true }
    },
    handler: function(actor, resolved) {
        var item = resolved.item;

        var tags = tapestry.world.getEntityTags(item.id);
        if (!tags || tags.indexOf('readable') === -1) {
            actor.send("There's nothing written on that.\r\n");
            return;
        }

        var text = tapestry.world.getProperty(item.id, 'text');
        if (text) {
            actor.send(text + '\r\n');
        } else {
            actor.send('There is nothing written there.\r\n');
        }

        // A skill book confers a capability when read (spec 9.4). The grant runs
        // BEFORE the consume block below, so a book whose ability is unknown or
        // already learned is never destroyed for nothing.
        var grantsAbility = tapestry.world.getProperty(item.id, 'grants_ability');
        if (grantsAbility) {
            var abilityId = String(grantsAbility).toLowerCase();
            var def = tapestry.abilities.getDefinition(abilityId);
            if (!def) {
                actor.send('The instructions here describe something you cannot make sense of.\r\n');
                return;
            }
            var existing = tapestry.abilities.getProficiency(actor.entityId, abilityId);
            if (existing !== null && existing !== undefined) {
                actor.send('You already know ' + def.name + '. The pages tell you nothing new.\r\n');
                return;
            }
            var startingProficiency = tapestry.world.getProperty(item.id, 'grants_proficiency') || 25;
            tapestry.abilities.learn(actor.entityId, abilityId, { proficiency: startingProficiency });
            actor.send('You work through it twice, and the second time your body already knows.\r\n');
            actor.send('You have learned ' + def.name + '.\r\n');
        }

        var consumeMethod = tapestry.world.getProperty(item.id, 'consume_method');
        if (consumeMethod === 'read' && tags.indexOf('consumable') !== -1) {
            var charges = tapestry.world.getProperty(item.id, 'charges');
            var result = tapestry.consumables.consume(actor.entityId, item.id);
            if (result && result.success) {
                actor.sendToRoom(actor.name + ' reads ' + item.name + '.\r\n');
                if (charges && charges > 1) {
                    actor.send('The book creaks softly as a few pages loosen and drift free.\r\n');
                } else {
                    actor.send('The book falls apart in your hands, its pages scattering into faded scraps.\r\n');
                }
            }
        }
    }
});
