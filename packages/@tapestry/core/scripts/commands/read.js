tapestry.commands.register({
    name: 'read',
    description: 'Read a sign, letter, book, or other written item.',
    category: 'inventory',
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
