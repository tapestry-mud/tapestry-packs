---
capability: core-combat
last-updated: 2026-07-25
---

# core-combat

Combat commands and output formatting provided by @tapestry/core.

## Overview

The core-combat capability registers four player commands (kill/attack, flee,
wimpy, consider) and a set of event listeners that format and broadcast all
combat output to attackers, defenders, and bystanders. Combat is round-based:
once initiated, exchanges happen automatically each round until one side flees
or is slain. Mob hostility is driven exclusively by the disposition system;
there is no standalone aggro behavior.

## Behavior

### kill / attack command

- Registered as command `kill` with alias `attack`; requires an `npc` target
  argument. (packages/@tapestry/core/scripts/combat/commands.ts:2-8)
- Before engaging, the handler checks the player's rest state via
  `tapestry.rest.getRestState`. If the state is `resting` or `sleeping`, the
  player receives a message to wake up first and the command aborts.
  (packages/@tapestry/core/scripts/combat/commands.ts:10-14)
- Engagement is delegated to `tapestry.combat.engage(player.entityId, target.id)`
  which returns one of five result codes:
  - `no_kill` -- target cannot be attacked; player is told "You can't attack
    [name]." (packages/@tapestry/core/scripts/combat/commands.ts:18-19)
  - `safe-room` -- current room forbids combat; player is told "You can't fight
    here." (packages/@tapestry/core/scripts/combat/commands.ts:20-21)
  - `already-fighting` -- player is already in combat with this target.
    (packages/@tapestry/core/scripts/combat/commands.ts:22-23)
  - `flee-cooldown` -- player fled too recently; message: "You're too winded
    from fleeing to attack right now."
    (packages/@tapestry/core/scripts/combat/commands.ts:24-25)
  - `ok` -- combat begins; player is told "You attack [name]!"
    (packages/@tapestry/core/scripts/combat/commands.ts:26-27)

### flee command

- Registered as command `flee` with no arguments.
  (packages/@tapestry/core/scripts/combat/commands.ts:33-44)
- If the player is not in combat (`tapestry.combat.isInCombat` returns false),
  they receive "You're not in combat." and the command returns early.
  (packages/@tapestry/core/scripts/combat/commands.ts:37-40)
- When in combat, delegates to `tapestry.combat.flee(player.entityId)`; output
  is handled entirely by event listeners in output.js, not by the command handler.
  (packages/@tapestry/core/scripts/combat/commands.ts:42-44)

### wimpy command

- Registered as command `wimpy` with no required arguments.
  (packages/@tapestry/core/scripts/combat/commands.ts:48-71)
- Invoked with no arguments, reports the current `wimpy_pct` property
  (defaults to 0 if unset). (packages/@tapestry/core/scripts/combat/commands.ts:52-55)
- Accepts an integer percentage value in the range 0-50 inclusive; values outside
  this range or non-numeric input are rejected with "Wimpy must be between 0 and 50."
  (packages/@tapestry/core/scripts/combat/commands.ts:59-61)
- Value 0 disables auto-flee ("Wimpy disabled. You will fight to the death.");
  any non-zero value sets the threshold and confirms the percentage.
  (packages/@tapestry/core/scripts/combat/commands.ts:64-69)
- Threshold is persisted via `tapestry.world.setProperty` under the key
  `wimpy_pct`. (packages/@tapestry/core/scripts/combat/commands.ts:64)
- The engine reads this property via `CombatManager.ShouldFlee`, the single flee
  predicate shared by the player wimpy pulse phase and mob AI auto-flee -- see
  the tapestry engine repo's combat-resolution.md. The legacy `wimpy_threshold`
  key is retired; saves carrying it are migrated to `wimpy_pct` on load.
  (packages/@tapestry/core/help/wimpy.yaml)

### consider command

- Registered as command `consider` with alias `con`; requires an `npc` target.
  (packages/@tapestry/core/scripts/combat/commands.ts:74-79)
- Computes `delta = playerLevel - targetLevel` where player level is the
  `combat` skill via `tapestry.progression.getLevel` (defaults to 1) and target
  level is read directly off the target's `level` map property (`level.combat`,
  defaults to 1 if the map or the `combat` key is absent). This is a pure read via
  `tapestry.world.getProperty` -- it does not go through `tapestry.progression.getLevel`,
  which would initialize a `level`/`xp` track as a side effect on a level-less NPC.
  (packages/@tapestry/core/scripts/combat/commands.ts:79-82)
- Five message buckets based on delta:
  - delta >= 5: "You could squash [name] like a bug."
    (packages/@tapestry/core/scripts/combat/commands.ts:88-89)
  - delta >= 2: "[name] should be manageable."
    (packages/@tapestry/core/scripts/combat/commands.ts:90-91)
  - delta >= -1: "[name] would be an even fight."
    (packages/@tapestry/core/scripts/combat/commands.ts:92-93)
  - delta >= -4: "[name] looks dangerous..."
    (packages/@tapestry/core/scripts/combat/commands.ts:94-95)
  - else (delta < -4): "[name] would be certain death."
    (packages/@tapestry/core/scripts/combat/commands.ts:96-97)

### combat output event listeners (output.js)

- `combat.engage`: broadcasts `<combat_engage>...<combat_engage>` to all room
  occupants except attacker and target.
  (packages/@tapestry/core/scripts/combat/output.ts:4-14)
- `combat.hit`: sends damage messages to three audiences using
  `formatDamageMessage` which calls `tapestry.combat.formatDamageVerb(damage)`
  to pick a verb. Attacker sees "Your [weapon] [verb] [target].", defender sees
  "[attacker]'s [weapon] [verb] you.", room bystanders see the third-person form.
  (packages/@tapestry/core/scripts/combat/output.ts:55-79)

- Target condition line (B.2): after the damage messages, `combat.hit` emits
  `<combat_status>[target] [condition].</combat_status>` to the attacker and
  room bystanders when - and ONLY when - the target's condition BAND changed
  (never every round; not on the killing blow, which the kill line owns). Two
  channels by design (Travis 2026-07-04): the verb keys on ABSOLUTE damage
  (the progression channel), the condition line is the RELATIVE tactical
  state. HP is already applied when combat.hit fires, so the line reads the
  post-hit band. Per-target tracking is in-memory, seeded at perfect health,
  cleared on combat.kill and player death.
  (packages/@tapestry/core/scripts/combat/output.ts:sendConditionTransition)

- The percent-HP band ladder lives in `combat/condition.ts`
  (`CONDITION_BANDS`, `conditionIndex`, `conditionText`) - the ONE
  implementation shared by the `look` command's health tier text and the
  combat condition line, so the two can never disagree. Bands mirror the
  engine HealthTier ladder exactly: perfect (100), few scratches (75-99),
  small wounds (50-74), wounded (35-49), badly wounded (20-34), bleeding
  profusely (10-19), near death (<10 or maxHp <= 0).
  (packages/@tapestry/core/scripts/combat/condition.ts)
- `combat.miss`: sends `<combat_miss>`-tagged miss messages to all three
  audiences (attacker, defender, room).
  (packages/@tapestry/core/scripts/combat/output.ts:82-101)
- `combat.flee`: broadcasts the flee message to the origin room, confirms
  direction to the fleeing player, notifies the destination room, and auto-fires
  `tapestry.world.sendRoomDescription` so the fleeing player sees their new room.
  (packages/@tapestry/core/scripts/combat/output.ts:104-123)
- `combat.flee.failed`: notifies the fleeing player and their room that no exit
  was available ("no way out!"). (packages/@tapestry/core/scripts/combat/output.ts:126-136)
- `combat.flee.prevented`: notifies that the player tried to flee but was held in
  place ("feet won't move!"). (packages/@tapestry/core/scripts/combat/output.ts:139-149)
- `combat.kill`: sends `<combat_kill>You have slain [name]!</combat_kill>` to the
  killer and a third-person form to room bystanders.
  (packages/@tapestry/core/scripts/combat/output.ts:152-169)
- `entity.vital.depleted` (hp, player only): on player death, creates a tagged
  corpse container with a 600-tick decay timer, silently unequips all gear and
  transfers inventory to the corpse, places the corpse in the death room, restores
  the player's vitals, teleports them to their recall room (read from the
  `recall_room_id` property if set, else `tapestry-core:recall`), sends
  `<death>`-tagged messages, auto-describes the recall room, and publishes a
  `player.death` event for pack extensions.
  (packages/@tapestry/core/scripts/combat/output.ts:172-229)

### tier-scaled death (never strand gear)

- "Tier-scaled death" describes only the respawn and gear-strand consequences branch (grind
  repop vs Unraveling eject), not XP loss. The XP death penalty is flat: 10% of
  within-level progress on any death, regardless of tier or context. See core-progression.md's
  "Death Penalty" section for XP-loss details.
  
- The `entity.vital.depleted` (hp) handler creates no corpse and touches no equipment on any
  path. It splits the player's `oracle_active_run` composite `<runAreaId>|<deathMode>|<entryRoomId>`
  (the sole death-mode carrier). (packs/@tapestry/core/scripts/combat/output.ts:234)
- Grind-tier death teleports to the run entry, keeps all gear/loot, and publishes
  `run.grind_repop` so oracle refreshes the run; a `world.resetArea` call covers any authored
  spawn-rule content. The Unraveling ejects to the hub via the return-address and publishes
  `run.unraveled` (oracle tears the run down). A non-run death wakes at the recall room, intact.
  `player.death` fires on every path. (packs/@tapestry/core/scripts/combat/output.ts:257)

### boss immunity gate - the ward

- A mob tagged `req_<cap>` takes zero effective damage until its own `cap_cleared_<cap>` runtime
  property is set. `isWardBlocked` is the single source of truth.
  (packs/@tapestry/core/scripts/combat/ward.ts:13)
- The gate listens on `entity.vital.changed` - the event every HP write funnels through - not
  `combat.hit`, so it catches abilities and spells, and restores the exact post-clamp amount lost
  (no overshoot). (packs/@tapestry/core/scripts/combat/ward.ts:63)
- The `dispel` verb finds a `cap_ward_dispel`-tagged tool whether carried or wielded and writes
  the clear on the mob instance, never a room flag, so a repopped boss is re-warded by
  construction. (packs/@tapestry/core/scripts/commands/dispel.ts:73)

### Swell combat content (boss slice 1)

Core supplies the reusable content for the engine swell loop (engine v0.1.41), so
any pack can build a swell boss as data.

- The `telegraph-rung` window validator is registered through
  `tapestry.combat.registerWindow`. It is deterministic and decides right-vs-wrong
  only: an empty committed verb is weathered, a verb matching the locked required
  counter is countered, anything else is whiffed.
  (packages/@tapestry/core/scripts/combat/telegraph-rung.ts:5)

- The `sidestep` and `brace` counter verbs are registered `pace: battle`, so the
  swell clock routes them during an active swell. Invoked off-window (no active
  swell) the handler sends a read - "No opening yet - read the swell." when a
  swell boss is engaged, otherwise "There is nothing to counter right now." -
  rather than silently no-opping.
  (packages/@tapestry/core/scripts/commands/counters.ts:21)

- The builder-gated `tune` command (`pace: free`, `builder` role) prints and live-
  edits a swell boss's dials in memory for playtest; bare `tune` lists the dials
  to hand-copy back into the mob YAML.
  (packages/@tapestry/core/scripts/commands/tune.ts:26)

- The full `swell_*` dial property set is declared on npc entities so the seal
  accepts swell bosses in core and in any pack that depends on core.
  (packages/@tapestry/core/properties.yml:30)

## Rejected and Reverted

- `aggro` mob behavior (packages/@tapestry/core/scripts/mobs/behaviors.ts):
  a tick-driven behavior that attacked the first player found in a mob's room was
  removed in commit d42d285. It was redundant with the disposition system, which
  aggros on room entry (instant) as well as on the tick, and correctly respects
  posture, safe rooms, and admin exemption. The sole consumer (LF trolloc) was
  migrated to `base_disposition: hostile`. Hostility is now disposition-only.
  (packages/@tapestry/core/scripts/mobs/behaviors.ts, git log commit d42d285)

## Change Log

- 2026-07-25 [hub-threads-core](changes/2026-07-25-hub-threads-core.md) - tier-scaled death (no corpse, never strand gear; grind repop / Unraveling eject) and the boss-immunity ward gate + dispel verb
- 2026-07-04 [target-condition-line](changes/2026-07-04-target-condition-line.md) - band ladder extracted to combat/condition.ts (shared by look + combat output); combat.hit emits the target condition line on band transitions only (verb = absolute damage channel, condition = relative tactical channel)
- 2026-07-03 [vocabulary-consolidation](changes/2026-07-03-vocabulary-consolidation.md) - mob flee content on wimpy_pct (int 0-100); flee_threshold doubles converted x100; wimpy command and help read percentage
- 2026-06-21 [swell-combat-graduation](changes/2026-06-21-swell-combat-graduation.md) - the telegraph-rung validator, sidestep/brace counters, the tune dial editor, and the swell_* dial declarations graduated into core from example-pack
