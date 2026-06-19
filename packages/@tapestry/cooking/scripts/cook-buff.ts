import * as tapestry from "@tapestry/engine";
import * as survival from "@tapestry/survival"; // optional dep: resolver yields an empty module if survival is absent

tapestry.events.on('item.consumed', function (evt) {
  if (evt.data.consumeMethod !== 'eat') { return; }
  var itemId = evt.data.itemId;
  if (!tapestry.world.getProperty(itemId, 'cooked')) { return; }
  var entityId = evt.data.entityId;
  // Capability guard replaces tapestry.packs.has(...): the namespace member is undefined when
  // survival is not installed (the resolver resolved @tapestry/survival to an empty module).
  if (typeof survival.applyWellFedBuff === 'function') {
    survival.applyWellFedBuff(entityId, 3000);
  }
});
