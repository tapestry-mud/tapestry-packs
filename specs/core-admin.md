# core-admin

Privileged administration commands in @tapestry/core. All commands require the `admin`
role; the engine rejects them silently for non-admin actors.

## Overview

The core-admin capability is a suite of 23 admin-gated commands (plus three aliases) that
expose privileged control over players, NPCs, items, rooms, and the server state. They are
registered under `category: 'admin'` with `admin: true`, which gates them at the engine's
command-dispatch layer. Commands broadly fall into five clusters: entity manipulation (set,
grant, spawn, loaditem, purge, restore, peace, force, at, teleport), inspection (inspect,
whereis/mwhere/owhere, templates, abilities, tags), ability management (learn, forget,
setclass, settrainable), access control (grantrole, revokerole, wizlock), and observation
(snoop).

## Behavior

### Admin gate

- Every command in this capability is registered with `admin: true`; non-admins cannot
  invoke any of them. (packages/@tapestry/core/scripts/commands/admin-set.js:116-120;
  packages/@tapestry/core/scripts/commands/admin-spawn.js:1-6;
  packages/@tapestry/core/help/admin.yaml:9)

### set -- attribute modification

- `set` routes on the `entity:attr` key. A retained table (`domainSetOps`) handles 14
  subsystem ops that are not stored properties: player alignment, six core stats (str, int,
  wis, dex, con, luck), vital caps (hp, mana, mv), ability proficiency (prof), training cap
  (cap), gold, and NPC hp. These bypass the registry and call subsystem APIs directly.
  (packages/@tapestry/core/scripts/commands/admin-set.js:52-114)
- All non-retained combinations fall through to `tapestry.admin.set.dispatch`, which is the
  engine's registry-driven path for declared attributes and panels.
  (packages/@tapestry/core/scripts/commands/admin-set.js:150-162)
- Player target resolution uses exact name match (case-insensitive) against online players;
  NPC and item target resolution uses substring match against the world-wide list.
  (packages/@tapestry/core/scripts/commands/admin-set.js:9-38)
- Vital-cap ops (hp, mana, mv) enforce a minimum of 1; values below 1 are rejected.
  (packages/@tapestry/core/scripts/commands/admin-set.js:69-71)
- `set player gold` accepts 0 but rejects negative values; uses `tapestry.currency.setGold`
  with the reason tag `admin:set`. (packages/@tapestry/core/scripts/commands/admin-set.js:97-104)
- `set player alignment` calls `tapestry.alignment.set` with reason `admin_set` and then
  echoes back the clamped value and bucket label.
  (packages/@tapestry/core/scripts/commands/admin-set.js:53-61)
- `set npc hp` sets both current and max hp via `tapestry.admin.setEntityHp`.
  (packages/@tapestry/core/scripts/commands/admin-set.js:106-113)
- `set player cap` accepts exactly four tier keywords: novice, apprentice, journeyman, master.
  (packages/@tapestry/core/scripts/commands/admin-set.js:83-95)

### grant -- progression and currency awards

- `grant` dispatches to `tapestry.admin.grant.dispatch` using a `[kind, type, target, ...rest]`
  args array; the three built-in registrations cover `player xp`, `player train`, and
  `player gold`. (packages/@tapestry/core/scripts/commands/admin-grant.js:18-20)
- `grant player xp [target] [amount] [track]` awards XP via `tapestry.progression.grant`;
  track defaults to `'combat'`. (packages/@tapestry/core/scripts/commands/admin-grant.js:24-42)
- `grant player train [target] [amount]` awards training sessions via
  `tapestry.training.grantTrains`. (packages/@tapestry/core/scripts/commands/admin-grant.js:44-61)
- `grant player gold [target] [amount]` adds (or subtracts, clamped at 0) gold via
  `tapestry.currency.addGold` with reason `admin:grant`.
  (packages/@tapestry/core/scripts/commands/admin-grant.js:63-81)

### spawn and loaditem -- entity creation

- `spawn [templateId]` calls `tapestry.mobs.spawnMob(templateId, actor.roomId)` and drops
  the mob into the admin's current room. (packages/@tapestry/core/scripts/commands/admin-spawn.js:11-18)
- `loaditem [templateId]` calls `tapestry.items.spawnToInventory(templateId, actor.entityId)`,
  placing the item directly into the admin's inventory.
  (packages/@tapestry/core/scripts/commands/admin-loaditem.js:11-18)
- Both commands report "Unknown template" on failure; neither emits a world message.

### purge and restore -- room/vitals reset

- `purge [npc|items|all]` removes entities from the admin's current room via
  `tapestry.world.purgeEntities(actor.roomId, filter)`. The input keyword `items` is
  normalized to `'item'` before dispatch; default (no arg) is `'all'`.
  (packages/@tapestry/core/scripts/commands/admin-purge.js:10-19)
- `restore [target|all]` calls `tapestry.stats.restoreVitals` and notifies the target with
  "You feel completely restored." `restore all` iterates all online players.
  (packages/@tapestry/core/scripts/commands/admin-restore.js:10-27)

### peace -- end room combat

- `peace` iterates every occupant of the admin's current room, calls
  `tapestry.combat.removeFromAllCombat` on any combatant, and broadcasts
  "Peace settles over the room." when at least one combatant was cleared. Reports
  "The room is already at peace." if none were in combat.
  (packages/@tapestry/core/scripts/commands/admin-peace.js:11-26)

### teleport, at, force -- movement and command injection

- `teleport [player] [roomId]` (alias: `tp`) resolves the target by exact name among online
  players, validates the destination room via `tapestry.world.getRoomName`, and moves the
  player via `tapestry.world.teleportEntity`.
  (packages/@tapestry/core/scripts/commands/admin-teleport.js:12-44)
- `at [target] [command]` accepts a player name or literal room ID as target. It silently
  teleports the admin to the destination, executes the command as the admin via
  `tapestry.admin.executeAs`, then teleports the admin back home. The return teleport fires
  unconditionally even if the executed command itself moved the admin.
  (packages/@tapestry/core/scripts/commands/admin-at.js:29-53)
- `at` teleports are invisible to other room occupants; only mob-AI occupancy tracking and
  the actor's own GMCP update fire. (packages/@tapestry/core/scripts/commands/admin-at.js:7-14)
- `force [target] [command]` can target online players or room-local NPCs. Admins cannot
  force another admin (checked via `tapestry.world.hasRole`). The forced target is notified
  with "X forces you to '...' " before the command output runs (matching ROM notify-before-execute
  order). NPC force uses `tapestry.mobs.command` rather than `executeAs`.
  (packages/@tapestry/core/scripts/commands/admin-force.js:18-45)

### inspect -- deep entity/room/area view

- `inspect [entity]` resolves the keyword via `tapestry.args.resolve` (room-scoped, visible
  only) and prints: name, class, race, level, six core stats, vitals, gold, hunger tier,
  per-track levels, per-ability proficiency, entity tags (unregistered tags marked), equipped
  items, inventory, all properties with registry type annotations, and alignment with last-5
  history. (packages/@tapestry/core/scripts/commands/admin-inspect.js:7-137)
- `inspect room [id]` displays room name, description, area, biome, terrain, non-biome flags,
  extra properties, exits, and current occupants. Omitting `id` inspects the admin's current
  room. (packages/@tapestry/core/scripts/commands/admin-inspect.js:139-210)
- `inspect area [id]` shows area name, short, description, theme, lore, level range, reset
  interval, and a three-state provenance label: `[authored]`, `[pack]`, or `[pack +edits]`.
  (packages/@tapestry/core/scripts/commands/admin-inspect.js:212-234)
- `inspect` cannot bypass visibility; hidden entities must be targeted by raw ID as a
  workaround. (packages/@tapestry/core/scripts/commands/admin-inspect.js:3-4)
- Unregistered properties appear with `(unregistered)` type annotation; unregistered tags are
  shown with the suffix ` (unregistered)`.
  (packages/@tapestry/core/scripts/commands/admin-inspect.js:109-111; packages/@tapestry/core/scripts/commands/admin-inspect.js:83-86)

### whereis, mwhere, owhere -- entity location lookup

- `whereis [keyword]` searches all entity types; `mwhere` filters to NPCs; `owhere` filters
  to `item` and `container` types. All three use `tapestry.world.findEntitiesByName` and
  display room name, room ID, and holder name for carried items.
  (packages/@tapestry/core/scripts/commands/admin-whereis.js:5-76)
- Results are capped at 100 with a "refine the keyword" prompt on overflow.
  (packages/@tapestry/core/scripts/commands/admin-whereis.js:17-42)

### templates and abilities -- registry listing

- `templates [keyword]` calls `tapestry.world.searchTemplates` and lists matching templates
  with kind, ID, display name, and live instance count. Keyword `'all'` lists everything.
  Results are capped at 100. (packages/@tapestry/core/scripts/commands/admin-templates.js:5-30)
- `abilities [keyword]` (alias: `slookup`) calls `tapestry.abilities.search` and lists
  matching abilities with ID, name, type, category, and pack label. Capped at 100.
  (packages/@tapestry/core/scripts/commands/admin-abilities.js:4-31)

### tags -- live tag management

- `tags list [entity]` shows tags, keywords, roles, and disposition on a room-visible entity.
  (packages/@tapestry/core/scripts/commands/admin-tags.js:41-70)
- `tags search [tag]` lists up to 50 entities carrying the tag across the world.
  (packages/@tapestry/core/scripts/commands/admin-tags.js:72-94)
- `tags add [entity] [tag]` adds a tag to a room-visible entity; refuses unregistered tags
  unless `--force` is supplied. Pack context is inferred from the entity's templateId prefix.
  (packages/@tapestry/core/scripts/commands/admin-tags.js:96-133)
- `tags remove [entity] [tag]` removes a tag and reports whether the entity actually had it.
  (packages/@tapestry/core/scripts/commands/admin-tags.js:135-156)
- `tags registry [filter]` dumps the tag registry sorted engine-first then alphabetically;
  filter can be an entity type or scope. (packages/@tapestry/core/scripts/commands/admin-tags.js:158-220)
- `tags validate` scans all loaded entities and reports any that carry unregistered tags
  (world-wide; limit 100 issues reported). (packages/@tapestry/core/scripts/commands/admin-tags.js:223-265)

### learn and forget -- ability manipulation

- `learn [entity] [abilityId] [proficiency]` grants an ability via `tapestry.abilities.learn`
  at the specified proficiency percentage. Target may be `self`, the admin's own name, or any
  online player by exact name. The ability must exist in the registry (`tapestry.abilities.getDefinition`);
  proficiency must be >= 1. (packages/@tapestry/core/scripts/commands/admin-learn.js:1-49)
- `forget [entity] [abilityId]` removes an ability via `tapestry.abilities.forget`. Same
  target resolution as `learn`; does not validate whether the entity held the ability.
  (packages/@tapestry/core/scripts/commands/admin-forget.js:1-36)

### setclass and settrainable -- class and training configuration

- `setclass [player] [classId]` calls `tapestry.classes.setClass(target.id, classId)` for an
  online player; the description states this also grants level-1 abilities, which is expected
  to be a side effect inside the engine call.
  (packages/@tapestry/core/scripts/commands/admin-setclass.js:30-32)
- `settrainable [entity] [abilityId] [true|false]` toggles the trainable flag on an ability
  globally via `tapestry.training.setTrainable`. The `entity` argument is accepted and echoed
  in the confirmation but is not used to scope the call -- the flag is engine-wide.
  (packages/@tapestry/core/scripts/commands/admin-settrainable.js:24-26)

### grantrole, revokerole, wizlock -- access control

- `grantrole [player] [role]` and `revokerole [player] [role]` call `tapestry.world.addRole`
  and `tapestry.world.removeRole` respectively; both require the target to be online and use
  exact name match. (packages/@tapestry/core/scripts/commands/admin-grant-role.js:16-27;
  packages/@tapestry/core/scripts/commands/admin-revoke-role.js:16-24)
- `grant` is already registered by admin-grant.js, so the role commands use the distinct
  names `grantrole` and `revokerole` to avoid boot-time collision.
  (packages/@tapestry/core/scripts/commands/admin-grant-role.js:1-5)
- `wizlock` toggles server-wide admin-only login enforcement via `tapestry.admin.setWizlock`.
  The state resets on reboot (runtime-only). (packages/@tapestry/core/scripts/commands/admin-wizlock.js:7-14)

### snoop -- player observation

- `snoop [player]` mirrors an online player's output to the admin via `tapestry.watch.start`.
  `snoop off` (or `snoop stop`) ends the session via `tapestry.watch.stop`.
  (packages/@tapestry/core/scripts/commands/snoop.js:12-18; packages/@tapestry/core/scripts/commands/snoop.js:44-52)
- Admins cannot snoop themselves or another admin (role check via
  `tapestry.world.getEntityRoles`). (packages/@tapestry/core/scripts/commands/snoop.js:34-46)

## Rejected and Reverted

- None on record.

## Change Log

- None on record.
