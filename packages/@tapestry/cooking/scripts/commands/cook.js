// @tapestry/cooking — interop discovery scaffold.
//
// This command exists to surface what @tapestry/survival cannot expose to
// peer packs. Each interop wall comment marks a call site that would require
// a pack-to-pack interop API. No workaround is implemented here.
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

        // INTEROP WALL (query): Cooking wants to check if the entity is starving
        // before applying a well-fed buff — to avoid wasting the buff on a full
        // character. Desired call:
        //   var tier = tapestry.packs.call('@tapestry/survival', 'getHungerTier', actor.entityId);
        // Without interop, the only alternative is to read survival's raw property
        // key 'sustenance' directly — hard-coding survival's internals, which is
        // the exact anti-pattern gap-analysis-gomud.md §4 warns against.
        // Property peeking is intentionally NOT done here.

        // Perform the cook action (assumed successful for scaffold purposes)
        actor.send('You cook ' + item.name + ' over a nearby flame.\r\n');
        actor.sendToRoom(actor.name + ' cooks ' + item.name + '.\r\n');

        // INTEROP WALL (invoke): Cooking wants to apply a well-fed buff via the
        // survival pack — "cut drain rate for 1 hour" or "apply well-fed effect."
        // Desired call:
        //   tapestry.packs.call('@tapestry/survival', 'applyWellFedBuff', actor.entityId, 3600);
        // The effects system handles timed stat modifiers (via RemainingPulses), but
        // reducing survival's drain rate requires survival to register the reduction —
        // cooking cannot command it. No workaround shipped here.
    }
});
