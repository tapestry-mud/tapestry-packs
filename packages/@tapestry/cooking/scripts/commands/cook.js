// @tapestry/cooking — pack interop consumer.
//
// The `cook` command consumes @tapestry/survival's exports through the sanctioned
// interop surface (tapestry.packs), each call guarded by has() so cooking degrades
// gracefully when survival isn't loaded (survival is an optionalDependency). This
// began as the interop-wall discovery scaffold; the walls are now resolved.
//
// See findings document: docs/tapestry/reviews/2026-05-24-survival-pack-extraction-findings.md

tapestry.commands.register({
    name: 'cook',
    description: 'Cook a meal using ingredients in your inventory.',
    category: 'inventory',
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

        // Query wall → resolved: ask survival whether the actor is too full to benefit.
        var tier = tapestry.packs.has('@tapestry/survival', 'getHungerTier')
            ? tapestry.packs.call('@tapestry/survival', 'getHungerTier', actor.entityId)
            : null;
        if (tier === 'full') {
            actor.send("You're too full to benefit from a hearty meal right now.\r\n");
        }

        // Perform the cook action (assumed successful for scaffold purposes)
        actor.send('You cook ' + item.name + ' over a nearby flame.\r\n');
        actor.sendToRoom(actor.name + ' cooks ' + item.name + '.\r\n');

        // Invoke wall → resolved: apply a well-fed buff via survival (bonus, not required).
        if (tapestry.packs.has('@tapestry/survival', 'applyWellFedBuff')) {
            tapestry.packs.call('@tapestry/survival', 'applyWellFedBuff', actor.entityId, 3600);
        }
    }
});
