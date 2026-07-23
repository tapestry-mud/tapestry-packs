import * as tapestry from "@tapestry/engine";

// --- Boss immunity gate (Task 10; hardened against review findings 1+2) ---
//
// A mob tagged req_<cap> takes zero effective damage until its own
// cap_cleared_<cap> runtime property is set (Task 9's dispel verb writes
// that property on the MOB instance, never the room, so a repopped fresh
// instance is warded again - SA1).
//
// isWardBlocked is the single source of truth for "is this defender
// currently immune", shared by every damage-dealing surface in the pack
// (melee output, spells, skills) so the check never drifts between them.
export function isWardBlocked(defenderId) {
    var tags = tapestry.world.getEntityTags(defenderId) || [];
    for (var i = 0; i < tags.length; i++) {
        if (tags[i].indexOf("req_") !== 0) { continue; }
        var capName = tags[i].substring("req_".length);
        var cleared = tapestry.world.getProperty(defenderId, "cap_cleared_" + capName);
        if (!cleared) {
            return true;
        }
    }
    return false;
}

// --- The root gate: entity.vital.changed, not combat.hit ---
//
// combat.hit only fires for melee auto-attacks (ResolveAutoAttacksPhase.cs).
// Ability/spell damage (Fireball, Kick, Bash - all can_target:["npc"]) goes
// straight through tapestry.combat.applyDamage -> VitalsService.Apply and
// publishes ability.used / entity.vital.depleted, NEVER combat.hit. A gate
// that only listens on combat.hit is trivially bypassed by casting a spell
// or using a skill instead of swinging a weapon (review Finding 1).
//
// VitalsService.Apply/Set (engine repo, VitalsService.cs) is the SOLE write
// path for HP - melee, ability, boss-swell, regen, and any future pack script
// that touches Hp all funnel through it, and it unconditionally publishes
// entity.vital.changed with { vital, old, new, delta, reason } after the C#
// write lands (there is no pre-application cancelable combat hook anywhere
// in the engine - confirmed against ResolveAutoAttacksPhase.cs and
// EventBus.Publish, which runs subscribers synchronously and in-order with
// no way to intercept a write that already happened in an earlier phase of
// the same publish chain). Gating on entity.vital.changed instead of
// combat.hit catches every CURRENT and FUTURE HP-damage source structurally,
// without depending on each new ability remembering to add its own check.
//
// Exact restore, no overshoot (review Finding 2): old/new in the event are
// the ACTUAL post-clamp StatBlock values (StatBlock.Hp's setter clamps to
// [0, MaxHp]), not the raw requested delta. So old - new is always the exact
// amount of HP really lost on this write, even when the raw damage exceeded
// current HP and the clamp silently ate the remainder (e.g. Hp 3/10, a
// damage-10 hit clamps to new=0, but old-new=3, not 10). Restoring by exactly
// that amount lands back on the true pre-hit value, never snapping to max.
// There is no absolute-set vitals binding exposed to packs (checked
// StatsModule.cs / CombatModule.cs - addVital and applyDamage are both
// relative-delta only), so this old-minus-new computation is what makes an
// exact restore possible without one.
//
// No self-trigger: this handler only reacts to DECREASES (new < old). The
// heal-back call below is itself an entity.vital.changed publish, but it's
// an INCREASE, so it can never re-enter this branch - the direction check
// alone is the recursion guard, no extra flag needed.
tapestry.events.on("entity.vital.changed", function(event) {
    var data = event.data || {};
    if (data.vital !== "hp") { return; }

    var oldValue = typeof data.old === "number" ? data.old : 0;
    var newValue = typeof data.new === "number" ? data.new : 0;
    if (newValue >= oldValue) { return; } // not a real loss - also filters our own heal-back

    var targetId = event.sourceEntityId; // entity.vital.changed's sourceEntityId is the VITAL OWNER (the defender), not an attacker
    if (!targetId || !isWardBlocked(targetId)) { return; }

    var restoreAmount = oldValue - newValue; // exact amount actually lost, post-clamp
    tapestry.combat.applyDamage(targetId, -restoreAmount, "ward");

    // Melee: combat.hit fires right after this, in the same synchronous call
    // chain (Apply -> publish entity.vital.changed [we restore here] ->
    // Apply returns -> ResolveAutoAttacksPhase publishes combat.hit). The
    // combat.hit listener in output.ts re-checks isWardBlocked and renders
    // the attacker-facing refusal line there, where it has a real attacker
    // id (combat.hit's sourceEntityId). Nothing further to do here for that
    // path - suppress the fallback message below so the attacker doesn't see
    // it twice.
    if (data.reason === "combat.melee") { return; }

    // Ability / any other source: entity.vital.changed carries no attacker
    // id (SourceEntityId here is the DEFENDER - see VitalsService.Publish -
    // there is no caster/source field anywhere on this event). The
    // currently-shipped npc-damaging abilities (fireball, kick, bash)
    // pre-check isWardBlocked themselves before ever calling applyDamage
    // (see spells.ts / skills.ts), so they never reach this fallback and
    // handle their own attacker-attributed message. This path is therefore
    // only reached by a damage source we have no per-callsite messaging
    // for - message the room generically rather than guessing an attacker.
    var entity = tapestry.world.getEntity(targetId);
    var targetName = entity && entity.name ? entity.name : "it";
    if (event.roomId) {
        tapestry.world.sendToRoom(event.roomId, "A shimmering ward turns the blow aside from " + targetName + ".\r\n");
    }
});
