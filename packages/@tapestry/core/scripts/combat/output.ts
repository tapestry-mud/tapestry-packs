import * as tapestry from "@tapestry/engine";
import { conditionIndex, conditionText } from "./condition.js";
// --- Combat engage output ---
tapestry.events.on("combat.engage", function(event) {
    var data = event.data || {};
    var attackerName = data.attackerName || "Someone";
    var targetName = data.targetName || "something";
    var roomId = event.roomId;

    if (roomId && event.sourceEntityId && event.targetEntityId) {
        var roomMsg = "<combat_engage>" + attackerName + " attacks " + targetName + "!</combat_engage>\r\n";
        tapestry.world.sendToRoomExceptMany(roomId, [event.sourceEntityId, event.targetEntityId], roomMsg);
    }
});

// --- Damage formatting ---

function formatDamageMessage(subject, weaponName, targetName, damage) {
    return subject + " " + weaponName + " " + tapestry.combat.formatDamageVerb(damage) + " " + targetName + ".";
}

// --- Target condition line (B.2) ---
// The %-of-target channel, split from the damage verb (verb = absolute
// damage, the progression channel; condition = relative tactical state -
// Travis's design call 2026-07-04). Emitted ONLY when the target's condition
// BAND changes, never every round. Band ladder is shared with `look`
// (combat/condition.js), so the two can never disagree.
var lastConditionBand = {};

function sendConditionTransition(attackerId, targetId, targetName, roomId) {
    var stats = tapestry.stats.get(targetId);
    if (!stats) { return; }
    var band = conditionIndex(stats.hp, stats.maxHp);
    var prev = Object.prototype.hasOwnProperty.call(lastConditionBand, targetId)
        ? lastConditionBand[targetId]
        : 0; // unseen targets start at perfect health
    lastConditionBand[targetId] = band;
    if (band === prev || stats.hp <= 0) {
        return; // no transition, or the kill line owns this beat
    }
    var line = "<combat_status>" + targetName + " " + conditionText(band) + ".</combat_status>\r\n";
    tapestry.world.send(attackerId, line);
    if (roomId) {
        tapestry.world.sendToRoomExceptMany(roomId, [attackerId, targetId], line);
    }
}

function clearConditionTracking(entityId) {
    if (entityId && Object.prototype.hasOwnProperty.call(lastConditionBand, entityId)) {
        delete lastConditionBand[entityId];
    }
}

// --- Combat hit output ---
tapestry.events.on("combat.hit", function(event) {
    var attackerId = event.sourceEntityId;
    var targetId = event.targetEntityId;
    var data = event.data || {};
    var damage = data.damage || 0;
    var attackerName = data.attackerName || "Something";
    var targetName = data.targetName || "something";
    var weaponName = data.weaponName || "punch";

    var attackMsg = formatDamageMessage("Your", weaponName, targetName, damage) + "\r\n";
    tapestry.world.send(attackerId, attackMsg);

    var defendMsg = formatDamageMessage(attackerName + "'s", weaponName, "you", damage) + "\r\n";
    tapestry.world.send(targetId, defendMsg);

    var roomId = event.roomId;
    if (roomId) {
        var roomMsg = formatDamageMessage(attackerName + "'s", weaponName, targetName, damage) + "\r\n";
        tapestry.world.sendToRoomExceptMany(roomId, [attackerId, targetId], roomMsg);
    }

    // HP is already applied when combat.hit fires (VitalsService.Apply runs
    // first in ResolveAutoAttacksPhase), so this reads the post-hit band.
    sendConditionTransition(attackerId, targetId, targetName, roomId);
});

// --- Combat miss output ---
tapestry.events.on("combat.miss", function(event) {
    var attackerId = event.sourceEntityId;
    var targetId = event.targetEntityId;
    var data = event.data || {};
    var attackerName = data.attackerName || "Something";
    var targetName = data.targetName || "something";
    var weaponName = data.weaponName || "punch";

    var attackMsg = "<combat_miss>Your " + weaponName + " misses " + targetName + ".</combat_miss>\r\n";
    tapestry.world.send(attackerId, attackMsg);

    var defendMsg = "<combat_miss>" + attackerName + "'s " + weaponName + " misses you.</combat_miss>\r\n";
    tapestry.world.send(targetId, defendMsg);

    var roomId = event.roomId;
    if (roomId) {
        var roomMsg = "<combat_miss>" + attackerName + "'s " + weaponName + " misses " + targetName + ".</combat_miss>\r\n";
        tapestry.world.sendToRoomExceptMany(roomId, [attackerId, targetId], roomMsg);
    }
});

// --- Combat flee output ---
tapestry.events.on("combat.flee", function(event) {
    var data = event.data || {};
    var name = data.entityName || "Someone";
    var direction = data.direction || "away";
    var fromRoom = data.fromRoom;
    var toRoom = data.toRoom;

    if (fromRoom) {
        tapestry.world.sendToRoom(fromRoom, name + " flees " + direction + "!\r\n");
    }

    tapestry.world.send(event.sourceEntityId, "You flee " + direction + "!\r\n");

    if (toRoom) {
        tapestry.world.sendToRoomExcept(toRoom, event.sourceEntityId, name + " arrives, looking panicked.\r\n");
    }

    // Auto-look after fleeing
    tapestry.world.sendRoomDescription(event.sourceEntityId);
});

// --- Combat flee failed ---
tapestry.events.on("combat.flee.failed", function(event) {
    var data = event.data || {};
    var entityName = data.entityName || "Someone";
    var roomId = event.roomId;

    tapestry.world.send(event.sourceEntityId, "You look around desperately but there's no way out!\r\n");

    if (roomId) {
        tapestry.world.sendToRoomExcept(roomId, event.sourceEntityId, entityName + " looks around desperately but there's no way out!\r\n");
    }
});

// --- Combat flee prevented ---
tapestry.events.on("combat.flee.prevented", function(event) {
    var data = event.data || {};
    var entityName = data.entityName || "Someone";
    var roomId = event.roomId;

    tapestry.world.send(event.sourceEntityId, "You try to flee but your feet won't move!\r\n");

    if (roomId) {
        tapestry.world.sendToRoomExcept(roomId, event.sourceEntityId, entityName + " tries to flee but can't move!\r\n");
    }
});

// --- Combat kill ---
tapestry.events.on("combat.kill", function(event) {
    var data = event.data || {};
    var victimName = data.victimName || "something";
    var killerName = data.killerName || "Something";
    var roomId = event.roomId;

    // The victim's condition tracking dies with it.
    clearConditionTracking(event.targetEntityId);

    if (event.sourceEntityId) {
        tapestry.world.send(event.sourceEntityId, "<combat_kill>You have slain " + victimName + "!</combat_kill>\r\n");
    }

    if (roomId && event.sourceEntityId && event.targetEntityId) {
        var roomMsg = "<combat_kill>" + killerName + " has slain " + victimName + "!</combat_kill>\r\n";
        tapestry.world.sendToRoomExceptMany(roomId, [event.sourceEntityId, event.targetEntityId], roomMsg);
    }
});

// Player death - create corpse, transfer gear, recall naked
tapestry.events.on("entity.vital.depleted", function(event) {
    if (!event.data || event.data.vital !== "hp") {
        return;
    }

    var entity = tapestry.world.getEntity(event.sourceEntityId);
    if (!entity || entity.type !== "player") {
        return;
    }

    // Vitals restore on recall - drop the stale condition band.
    clearConditionTracking(event.sourceEntityId);

    var entityId = event.sourceEntityId;
    var roomId = entity.roomId;
    var playerName = entity.name;

    // Create player corpse
    var corpseId = tapestry.world.createEntity("container", "the corpse of " + playerName);
    tapestry.world.addTag(corpseId, "corpse");
    tapestry.world.addTag(corpseId, "container");
    tapestry.world.addTag(corpseId, "player_corpse");
    tapestry.world.addTag(corpseId, "no_get");
    tapestry.world.setProperty(corpseId, "owner", entityId);
    tapestry.world.setProperty(corpseId, "corpse_decay", 600);
    tapestry.world.setProperty(corpseId, "corpse_created_tick", tapestry.world.getCurrentTick());

    // Unequip all gear silently (removes stat modifiers, moves to inventory)
    tapestry.equipment.unequipAllSilent(entityId);

    // Transfer all inventory to corpse silently
    tapestry.inventory.transferAllSilent(entityId, corpseId);

    // Place corpse in death room
    tapestry.world.placeEntity(corpseId, roomId);

    // Notify room
    tapestry.world.sendToRoom(roomId, "<death>" + playerName + " has been slain!</death>\r\n");

    // Restore vitals and recall
    tapestry.stats.restoreVitals(entityId);
    var recallRoom = tapestry.world.getProperty(entityId, "recall_room_id") || "tapestry-core:recall";
    tapestry.world.teleportEntity(entityId, recallRoom);

    // Notify player
    tapestry.world.send(entityId, "\r\n<death>You have been slain!</death>\r\n");
    var roomName = tapestry.world.getRoomName(roomId) || "somewhere";
    tapestry.world.send(entityId, "<death>Your corpse remains at " + roomName + ".</death>\r\n");
    tapestry.world.send(entityId, "You feel your spirit pulled back to safety...\r\n\r\n");
    tapestry.world.sendRoomDescription(entityId);

    // Publish player death event for pack extensions
    tapestry.events.publish("player.death", {
        entityId: entityId,
        corpseId: corpseId,
        roomId: roomId
    });
});
