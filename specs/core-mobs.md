---
capability: core-mobs
last-updated: 2026-06-13
---

# core-mobs

NPC subsystem for @tapestry/core. Covers registered movement behaviors, the
combat-command dispatcher, idle-command dispatch, mob commands, death handling,
and the three scripted mob hooks (onAttack, onDeath, onSay).

## Overview

Mobs (NPCs) are driven by a recurring `mob.ai.tick` event. On each tick the
engine fires the mob's registered behavior function and the two tick listeners
in behaviors.js and idle.js. Death is handled separately via `entity.vital.depleted`.
Mob authors attach scripts via `tapestry.mobs.registerScript`, which defines
named hook functions (`onAttack`, `onDeath`, `onSay`, `onLook`, etc.) that the
dispatch files invoke when matching events occur.

Hostility is controlled entirely by `base_disposition` (or a `disposition:` rules
block) on the mob YAML -- there is no behavior named "aggro". A mob can have any
movement behavior and still be hostile.

## Behavior

### Registered behaviors

- Three behaviors are registered at startup: `stationary`, `wander`, and `patrol`.
  The `stationary` handler is an intentional no-op reserved for future flavor work.
  (packages/@tapestry/core/scripts/mobs/behaviors.js:2-4)

- `wander` moves the mob to a random adjacent exit each tick cycle, subject to
  three gates: the mob must not be in combat, enough ticks must have elapsed since
  the last recorded action (`wander_interval`, default 30), and a random roll must
  beat `wander_chance` (default 0.3). Rooms tagged `no_wander` are skipped. The
  move is also blocked when the exit leads outside the mob's `wander_boundary`
  (default `"area"`). When a move fires, arrival and departure messages are sent to
  the affected rooms. (packages/@tapestry/core/scripts/mobs/behaviors.js:7-54)

- `patrol` follows a list of room IDs defined in `patrol_route` (minimum 2 entries).
  It bounces ping-pong style: when the route index would go out of bounds the
  direction reverses. Same combat and tick-interval gates apply (`patrol_interval`,
  default 30; `patrol_chance`, default 0.5). The current index and direction are
  stored in `_patrol_index` and `_patrol_direction` on the entity. If no adjacent
  exit resolves to the target room the step is silently skipped.
  (packages/@tapestry/core/scripts/mobs/behaviors.js:57-123)

- `patrol_route` is defined as a top-level YAML key (not inside `properties:`); the
  town-guard example places it at the same level as `behavior:`.
  (packages/@tapestry/example-pack/areas/starter-town/mobs/town-guard.yaml:23-27)

### Wander and patrol YAML properties

- `wander_interval` (int, ticks, default 30): minimum ticks between wander moves.
  (packages/@tapestry/core/scripts/mobs/behaviors.js:15)
- `wander_chance` (float 0-1, default 0.3): probability of actually moving once
  the interval is satisfied.
  (packages/@tapestry/core/scripts/mobs/behaviors.js:21)
- `wander_boundary` (string, default `"area"`): when `"area"`, the move is blocked
  if the exit leads to a different area.
  (packages/@tapestry/core/scripts/mobs/behaviors.js:42-45)
- `patrol_interval` (int, ticks, default 30): minimum ticks between patrol steps.
  (packages/@tapestry/core/scripts/mobs/behaviors.js:69)
- `patrol_chance` (float 0-1, default 0.5): probability of stepping once the
  interval is satisfied.
  (packages/@tapestry/core/scripts/mobs/behaviors.js:75)

### Combat-command dispatcher

- Any mob that has a `battle_commands` list participates in the combat-command
  dispatcher regardless of which movement behavior it uses. The dispatcher listens
  on `mob.ai.tick` and fires only while the mob is in combat.
  (packages/@tapestry/core/scripts/mobs/behaviors.js:133-161)

- On each qualifying tick, a random entry is selected from `battle_commands` and
  issued via `tapestry.mobs.command`. An empty-string entry is an intentional
  no-op (auto-attack only for that slot). Dispatch is gated by `battle_interval`
  (default 15 ticks) and `battle_chance` (default 0.4).
  (packages/@tapestry/core/scripts/mobs/behaviors.js:146-160)

- `battle_interval` and `battle_chance` may be defined at the top level of the mob
  YAML (outside `properties:`), as shown in the goblin-chief example.
  (packages/@tapestry/example-pack/areas/starter-town/mobs/goblin-chief.yaml:18-19)

### Idle-command dispatcher

- Mobs with an `idle_commands` list fire a random command from that list when not
  in combat, gated by `idle_interval` (default 30 ticks) and `idle_chance`
  (default 0.3). The dispatcher listens on `mob.ai.tick`.
  (packages/@tapestry/core/scripts/mobs/idle.js:1-27)

- `idle_commands`, `idle_interval`, and `idle_chance` may be top-level YAML keys.
  (packages/@tapestry/example-pack/areas/starter-town/mobs/goblin-chief.yaml:35-38)

### Mob commands

- Two mob commands are registered: `say` and `emote`. Both suppress output when
  no players are in the room at fire time (checked via
  `tapestry.world.getEntitiesInRoom(mob.roomId, "player")`).
  (packages/@tapestry/core/scripts/mobs/commands.js:1-20)

- `say` wraps the text in a `<highlight>` tag and formats it as speech attributed
  to the mob's name. (packages/@tapestry/core/scripts/mobs/commands.js:1-10)

- `emote` prepends the mob's name and appends the text directly, with no
  highlight tag. (packages/@tapestry/core/scripts/mobs/commands.js:12-20)

### Death handling

- Death is triggered by the `entity.vital.depleted` event. Only entities of
  type `"npc"` are processed; entities tagged `no_kill` are skipped.
  (packages/@tapestry/core/scripts/mobs/death.js:2-11)

- A corpse container is created with the name `"the corpse of <mobName>"` and
  tagged `corpse`, `container`, and `no_get`. The corpse receives `corpse_decay`
  (default 300 seconds), `corpse_created_tick`, `template_id`, and `mob_level`
  properties. (packages/@tapestry/core/scripts/mobs/death.js:20-27)

- All inventory and equipped items are transferred from the mob to the corpse
  before the mob entity is removed from the world.
  (packages/@tapestry/core/scripts/mobs/death.js:30-37)

- Gold is awarded directly to the killer (not placed in the corpse) when the mob
  has a `gold_min` property. The amount is a uniform random integer in
  `[gold_min, gold_max]` (both inclusive); if `gold_max` is absent it equals
  `gold_min`. A zero roll produces no award and no message.
  (packages/@tapestry/core/scripts/mobs/death.js:42-55)

- After entity removal, a `mob.death` event is published carrying `templateId`,
  `mobName`, `roomId`, `corpseId`, and `killerId`. This event is the hook point
  for onDeath dispatch; the mob entity is already gone by the time listeners run.
  (packages/@tapestry/core/scripts/mobs/death.js:59-65)

### onAttack dispatch

- When `combat.engage` fires, the dispatcher checks whether the *target* is an
  NPC with a `template_id` property. If so, it calls
  `tapestry.mobs.invokeHook(templateId, "onAttack", mob, attacker, null)`.
  The attacker argument is null when the source entity cannot be resolved.
  (packages/@tapestry/core/scripts/mobs/onattack-dispatch.js:4-27)

### onDeath dispatch

- Listens on `mob.death` (published by death.js). Calls
  `tapestry.mobs.invokeHook(templateId, "onDeath", mob, killer, { corpseId })`.
  The `mob` argument carries only `name` and `roomId` -- no `entityId` -- because
  the entity has already been removed.
  (packages/@tapestry/core/scripts/mobs/ondeath-dispatch.js:4-18)

### onSay dispatch

- Listens on `player.say`. For every NPC in the room that has a `template_id` and
  is not in combat, calls
  `tapestry.mobs.invokeHook(templateId, "onSay", mob, speaker, text)`.
  The mob itself is excluded if its ID matches the speaking player's ID (guards
  against self-response). (packages/@tapestry/core/scripts/mobs/onsay-dispatch.js:1-30)

### Mob YAML schema notes

- `base_disposition` drives aggro: `hostile` mobs engage on room entry and on tick;
  `neutral` mobs do not aggro; `friendly` mobs are non-hostile. This is separate from
  the `behavior` key. (packages/@tapestry/example-pack/areas/starter-town/mobs/goblin.yaml:5-7;
  packages/@tapestry/example-pack/areas/starter-town/mobs/goblin-chief.yaml:5-6)

- `loot` is a YAML block on the mob with sub-keys `guaranteed` (array of
  `{item, count}`), `pool` (array of `{item, weight}`), `pool_rolls` (int), and
  `rare_bonus` (`{chance, pool}`). Loot resolution is not implemented in the files
  listed above; the YAML schema is illustrated by the goblin template.
  (packages/@tapestry/example-pack/areas/starter-town/mobs/goblin.yaml:38-55)

- `corpse_decay` (int seconds, default 300) is a property on the mob YAML that
  controls how long the corpse persists. Death.js reads it and stamps it onto the
  corpse entity. (packages/@tapestry/core/scripts/mobs/death.js:17)

## Rejected and Reverted

- `aggro` behavior retired (commit d42d285, 2026-06-12). A behavior named `aggro`
  was previously registered and drove hostility directly. It was removed in favor of
  the `base_disposition: hostile` / `disposition:` rules approach, which decouples
  aggro from movement and handles room-entry aggro, tick-based aggro, safe-room
  exemptions, and admin exemptions uniformly. The comment block at
  (packages/@tapestry/core/scripts/mobs/behaviors.js:125-128) documents the
  rationale in-source.

## Change Log

- None on record.
