tapestry.events.on('item.consumed', function(evt) {
    if (evt.data.consumeMethod !== 'eat') { return; }
    var itemId = evt.data.itemId;
    if (!tapestry.world.getProperty(itemId, 'cooked')) { return; }
    var entityId = evt.data.entityId;
    if (tapestry.packs.has('@tapestry/survival', 'applyWellFedBuff')) {
        tapestry.packs.call('@tapestry/survival', 'applyWellFedBuff', entityId, 3000);
    }
});
