# Cleared Room Exit Hint

Task 13: proves that when the last mob in a room dies, a hint message is printed
(consequence-hooks.ts:72-80) guiding the player that they can use LEAVE to return to
the hub. The message is "Nothing more stirs here. If the thread feels done, LEAVE
returns you to the hub."

The room-cleared consequence stamp (`looted`) identifies when the last non-boss mob
dies via `getEntitiesInRoom(roomId, "npc")` returning 0 remaining NPCs (the dead mob
is already removed by the engine, and corpses are containers, not npcs). The text is
printed via `sendToRoom` to guide the player about their available exit.

Fix round 1 (Task 13 review): the original scenario depended on a forced seed/walk
(`999` -> template `oracle-week-3e7`, walk `north, west`) that was invented rather than
derived from the pack's own procedural-generation functions - unlike `boss-room-no-wander.md`,
whose walk was found by replaying `structure.js`/`population.ts` offline. The claimed
landing room does not actually spawn a killable trash mob under the transit/charged-band
density rules, and "tangy trash" is not a name produced by any mob-naming deck in this
pack. Replacing it with the same direct-spawn pattern Task 12's fix round proved
(`hint-command.md`): core's admin `spawn <template-id>` drops a real mob
(`tapestry-oracle:hostile-melee`, default name "a creature", keyword "creature" -
`packages/@tapestry/oracle/templates/mobs/hostile-melee.yaml`) straight into the
Gamemaster's own room, no run/board/procedural-generation involved. `purge npc` first
guarantees the room has no other NPCs before spawning, matching the pattern core's own
`ward-capability.md` uses ahead of each `spawn`.

Gamemaster's default room (`tapestry-core:recall`) is tagged `safe` (`EngineTags.Safe`),
which makes `combat.engage` refuse with "You can't fight here." before any mob can be
killed there. This scenario first teleports Gamemaster to `tapestry-test-fixtures:test-arena`
(tags: none), the same non-safe room core's own `ward-capability.md` teleports into ahead
of its `spawn`/`kill` steps - that fixtures pack is always merged into the staged corpus
by the telnet runner's `--managed` mode, independent of oracle's own `pack.yaml`
dependencies (which list only `@tapestry/core`).

Uses core's admin `teleport`, `purge npc`, and `spawn` (all admin-gated) to reach a
combat-legal room directly - no `oracle-admin` bake/start needed since this no longer
touches a generated run at all. `set npc hp creature 1` before `kill`, the same
technique `death-grind.md` uses, makes the kill land in one round instead of riding out
several rounds of real melee variance against the template's full 20 HP.

## Setup
- Players: Gamemaster

## Steps
1. Gamemaster: `teleport Gamemaster tapestry-test-fixtures:test-arena`
2. Gamemaster: `purge npc`
3. Assert Gamemaster sees: `Purged`
4. Gamemaster: `spawn tapestry-oracle:hostile-melee`
5. Assert Gamemaster sees: `Spawned: a creature`
6. Gamemaster: `set npc hp creature 1`
7. Assert Gamemaster sees: `hp set to 1 (hp and max hp).`
8. Gamemaster: `kill creature`
9. Assert Gamemaster sees: `You attack a creature!`
10. Wait for Gamemaster sees: `You have slain`
11. Wait for Gamemaster sees: `Nothing more stirs here. If the thread feels done, LEAVE returns you to the hub.`
