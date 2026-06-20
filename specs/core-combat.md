---
capability: core-combat
last-updated: 2026-06-13
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
- Invoked with no arguments, reports the current `wimpy_threshold` property
  (defaults to 0 if unset). (packages/@tapestry/core/scripts/combat/commands.ts:52-55)
- Accepts an integer percentage value in the range 0-50 inclusive; values outside
  this range or non-numeric input are rejected with "Wimpy must be between 0 and 50."
  (packages/@tapestry/core/scripts/combat/commands.ts:59-61)
- Value 0 disables auto-flee ("Wimpy disabled. You will fight to the death.");
  any non-zero value sets the threshold and confirms the percentage.
  (packages/@tapestry/core/scripts/combat/commands.ts:64-69)
- Threshold is persisted via `tapestry.world.setProperty` under the key
  `wimpy_threshold`. (packages/@tapestry/core/scripts/combat/commands.ts:64)
- NOTE: the help file (packages/@tapestry/core/help/wimpy.yaml) describes the
  argument as "an HP value, not a percentage," but the implementation stores and
  validates it as a percentage (0-50). The help text appears to be inaccurate.

### consider command

- Registered as command `consider` with alias `con`; requires an `npc` target.
  (packages/@tapestry/core/scripts/combat/commands.ts:74-79)
- Computes `delta = playerLevel - targetLevel` where player level is the
  `combat` skill via `tapestry.progression.getLevel` (defaults to 1) and target
  level is the `mob_level` property (defaults to 1).
  (packages/@tapestry/core/scripts/combat/commands.ts:83-85)
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
  (packages/@tapestry/core/scripts/combat/output.ts:2-12)
- `combat.hit`: sends damage messages to three audiences using
  `formatDamageMessage` which calls `tapestry.combat.formatDamageVerb(damage)`
  to pick a verb. Attacker sees "Your [weapon] [verb] [target].", defender sees
  "[attacker]'s [weapon] [verb] you.", room bystanders see the third-person form.
  (packages/@tapestry/core/scripts/combat/output.ts:21-41)
- `combat.miss`: sends `<combat_miss>`-tagged miss messages to all three
  audiences (attacker, defender, room).
  (packages/@tapestry/core/scripts/combat/output.ts:44-63)
- `combat.flee`: broadcasts the flee message to the origin room, confirms
  direction to the fleeing player, notifies the destination room, and auto-fires
  `tapestry.world.sendRoomDescription` so the fleeing player sees their new room.
  (packages/@tapestry/core/scripts/combat/output.ts:66-85)
- `combat.flee.failed`: notifies the fleeing player and their room that no exit
  was available ("no way out!"). (packages/@tapestry/core/scripts/combat/output.ts:88-98)
- `combat.flee.prevented`: notifies that the player tried to flee but was held in
  place ("feet won't move!"). (packages/@tapestry/core/scripts/combat/output.ts:101-111)
- `combat.kill`: sends `<combat_kill>You have slain [name]!</combat_kill>` to the
  killer and a third-person form to room bystanders.
  (packages/@tapestry/core/scripts/combat/output.ts:114-128)
- `entity.vital.depleted` (hp, player only): on player death, creates a tagged
  corpse container with a 600-tick decay timer, silently unequips all gear and
  transfers inventory to the corpse, places the corpse in the death room, restores
  the player's vitals, teleports them to their recall room (defaulting to
  `tapestry-core:recall`), sends `<death>`-tagged messages, auto-describes the
  recall room, and publishes a `player.death` event for pack extensions.
  (packages/@tapestry/core/scripts/combat/output.ts:131-185)

## Rejected and Reverted

- `aggro` mob behavior (packages/@tapestry/core/scripts/mobs/behaviors.ts):
  a tick-driven behavior that attacked the first player found in a mob's room was
  removed in commit d42d285. It was redundant with the disposition system, which
  aggros on room entry (instant) as well as on the tick, and correctly respects
  posture, safe rooms, and admin exemption. The sole consumer (LF trolloc) was
  migrated to `base_disposition: hostile`. Hostility is now disposition-only.
  (packages/@tapestry/core/scripts/mobs/behaviors.ts, git log commit d42d285)

## Change Log

- None on record.
