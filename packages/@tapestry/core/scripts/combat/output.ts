import * as tapestry from "@tapestry/engine";
import { conditionIndex, conditionText } from "./condition.js";
import { isWardBlocked } from "./ward.js";
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

// --- Boss immunity gate (Task 10, the req_ side of the capability web) ---
// The actual gate - blocking damage and restoring HP for ANY source, not
// just melee - lives in ward.ts, subscribed to entity.vital.changed (which
// every HP write funnels through, unlike combat.hit which only fires for
// melee auto-attacks). By the time combat.hit fires here, a warded target's
// HP has ALREADY been restored upstream (entity.vital.changed fires before
// combat.hit in the same synchronous publish chain - see ward.ts for the
// full reasoning). This handler only needs to recognize the still-warded
// target and swap in the refusal line instead of normal hit text; it does
// no HP math of its own.
//
// combat.hit fires AFTER VitalsService.Apply has already written the damage
// to the defender's HP (ResolveAutoAttacksPhase.cs runs Apply, then publishes
// combat.hit for text/output - core-combat.md: "HP is already applied when
// combat.hit fires"). Pack scripts have no pre-application hook to cancel the
// write before it lands - that's why the reversal has to happen in ward.ts's
// entity.vital.changed handler instead of here.

// --- Combat hit output ---
tapestry.events.on("combat.hit", function(event) {
    var attackerId = event.sourceEntityId;
    var targetId = event.targetEntityId;
    var data = event.data || {};
    var damage = data.damage || 0;

    if (isWardBlocked(targetId)) {
        // The message names the shape of the answer (a ward wants
        // dispelling) - the third discoverability surface for the themed
        // verb, spec 4.4. HP was already restored by ward.ts's
        // entity.vital.changed handler before this event fired.
        tapestry.world.send(attackerId, "Your blow glances off a shimmering ward. Steel will not part it.\r\n");
        return;
    }

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

// --- Swell counter damage visibility (S2-20b) ---
// SwellClockManager.ApplyDamage funnels through VitalsService.Apply with
// reason "combat.swell", which fires entity.vital.changed but never
// combat.hit (that only fires for melee auto-attacks) - so a countered
// swell's real HP loss never triggered the shared condition-band line.
// Same band ladder as look/combat.hit (condition.js), so a countered
// swell and a melee hit read consistently.
tapestry.events.on("entity.vital.changed", function(event) {
    var data = event.data || {};
    if (data.vital !== "hp" || data.reason !== "combat.swell") { return; }
    var newValue = typeof data.new === "number" ? data.new : 0;
    var oldValue = typeof data.old === "number" ? data.old : 0;
    if (newValue >= oldValue) { return; }
    var targetId = event.sourceEntityId;
    var entity = tapestry.world.getEntity(targetId);
    var targetName = entity && entity.name ? entity.name : "it";
    if (event.roomId) {
        var stats = tapestry.stats.get(targetId);
        if (!stats) { return; }
        var band = conditionIndex(stats.hp, stats.maxHp);
        var line = "<combat_status>" + targetName + " " + conditionText(band) + ".</combat_status>\r\n";
        tapestry.world.sendToRoom(event.roomId, line);
    }
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

// Player death (Task 12, spec 3.5 / decision 3) - tier-scaled, NEVER strand gear.
//
// The old handler unconditionally spawned a corpse, unequipped every worn
// item, and transferred the whole inventory onto it before recalling the
// player naked - gear replacement grind that fights the hub-and-threads
// design (punch-list item 5). This handler never creates a corpse and never
// touches equipment/inventory; every branch keeps gear+loot on the player.
//
// The death mode and respawn point ride ENTIRELY on the `oracle_active_run`
// player property, the pipe composite "<runAreaId>|<deathMode>|<entryRoomId>"
// Task 5's startRun writes (area-gen.ts). This is the SOLE carrier - there is
// no cross-pack read of oracle's in-memory AreaState, and no second death-mode
// signal anywhere in core.
//
// Cross-pack teardown (Unraveling branch only): oracle owns `teardownRun`
// (area-gen.ts), and oracle depends on core (pack.yaml `dependencies:
// @tapestry/core`), never the reverse - core has zero pack dependencies by
// design (it is the foundational pack every other pack, including oracle,
// builds on). A literal `import { teardownRun } from "@tapestry/oracle"`
// here would be a backwards dependency the pack graph does not support (every
// real cross-pack import in this repo flows dependent -> its own dependency,
// e.g. @tapestry/cooking -> @tapestry/survival, never core -> a pack that
// depends on core). So this branch PUBLISHES "run.unraveled" with the
// already-split runAreaId instead of calling teardownRun directly; oracle
// registers a synchronous listener for it (area-gen.ts, self-registered via
// the pack script glob, same pattern as consequence-hooks.ts/population.ts).
// The engine event bus dispatches subscribers synchronously in-process (same
// call stack, confirmed against EventBus.Publish for the ward gate above), so
// the publish-then-listener teardown completes before this handler returns -
// no async gap, same effective timing as a direct call would have had.
// Task 13's brief assumed a literal direct `teardownRun(playerId, runAreaId)`
// call for this branch specifically; that assumption does not hold given the
// pack dependency direction, so this event is the substitute. Task 13 must
// NOT add a second listener for the death path - only for leave/recall.
tapestry.events.on("entity.vital.depleted", function(event) {
    if (!event.data || event.data.vital !== "hp") {
        return;
    }

    var entity = tapestry.world.getEntity(event.sourceEntityId);
    if (!entity || entity.type !== "player") {
        return;
    }

    // Vitals restore on death - drop the stale condition band.
    clearConditionTracking(event.sourceEntityId);

    var entityId = event.sourceEntityId;
    var roomId = entity.roomId;
    var playerName = entity.name;

    // Notify the room. No corpse - gear/loot stay on the player in every branch.
    tapestry.world.sendToRoom(roomId, "<death>" + playerName + " has been slain!</death>\r\n");

    // Wake with full vitals regardless of branch; gear + inventory untouched.
    tapestry.stats.restoreVitals(entityId);

    var raw = tapestry.world.getProperty(entityId, "oracle_active_run") || "";
    if (raw !== "") {
        // Split the locked composite "<runAreaId>|<deathMode>|<entryRoomId>" (Task 3/5).
        var parts = String(raw).split("|");
        var runAreaId = parts[0];
        var mode = (parts.length > 1 && parts[1]) ? parts[1] : "grind";
        var entryRoomId = (parts.length > 2 && parts[2]) ? parts[2] : (runAreaId + "-entry");

        if (mode === "unraveling") {
            var home = tapestry.returnaddress.has(entityId)
                ? tapestry.returnaddress.get(entityId)
                : (tapestry.world.getProperty(entityId, "recall_room_id") || "tapestry-core:recall");
            tapestry.world.teleportEntity(entityId, home);
            tapestry.returnaddress.clear(entityId);
            // No cross-pack import (see header note) - oracle's listener on
            // "run.unraveled" does the split-free teardown synchronously.
            tapestry.events.publish("run.unraveled", {
                entityId: entityId,
                runAreaId: runAreaId
            });
            tapestry.world.send(entityId, "\r\n<death>The Unraveling takes you.</death>\r\n");
            tapestry.world.send(entityId, "You are cast back to the hub, your gear intact, the roll lost.\r\n");
        } else {
            // Grind tier: respawn at the run entry, keep everything, repop now.
            tapestry.world.teleportEntity(entityId, entryRoomId);
            tapestry.world.resetArea(runAreaId); // Task 1 binding - repops any AUTHORED spawn-rule content
            // Oracle's own mobs are never registered with the engine's spawn-rule
            // system (they spawn lazily via tapestry.mobs.spawnMob on first visit -
            // see population.ts), so world.resetArea alone does not repop them.
            // Same cross-pack seam as "run.unraveled" above: publish, oracle's
            // synchronous listener (population.ts) clears the run's visited-room
            // state so the next visit spawns fresh instances (SA1).
            tapestry.events.publish("run.grind_repop", {
                entityId: entityId,
                runAreaId: runAreaId,
                entryRoomId: entryRoomId
            });
            tapestry.world.send(entityId, "\r\n<death>You wake at the threshold.</death>\r\n");
            tapestry.world.send(entityId, "The path has closed behind you - the enemies return.\r\n");
        }
    } else {
        // Non-run death: never strand. Wake at recall with everything.
        var recallRoom = tapestry.world.getProperty(entityId, "recall_room_id") || "tapestry-core:recall";
        tapestry.world.teleportEntity(entityId, recallRoom);
        tapestry.world.send(entityId, "\r\n<death>You collapse, then wake at the recall point, battered but whole.</death>\r\n");
    }

    tapestry.world.sendRoomDescription(entityId);

    // Publish player death event for pack extensions - progression.ts's XP
    // penalty listener (progression.ts:158) and groups.ts's follow-clear
    // listener both depend on this firing for every branch above.
    tapestry.events.publish("player.death", {
        entityId: entityId,
        roomId: roomId
    });
});
