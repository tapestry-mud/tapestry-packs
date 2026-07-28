---
release: unreleased
specs: [oracle.md]
---

# Oracle - Cleared Thread Exit Hint

## Why

When a player clears a room of all non-boss mobs, there is no surfaced way out. The
room consequence stamp records the state, but the player sees nothing. A cleared-but-empty
room is a dead end without explicit guidance.

## What

When the last non-boss mob in a room dies, the `mob.death` consequence hook now prints
a hint message: "Nothing more stirs here. If the thread feels done, LEAVE returns you
to the hub." This message guides the player that they can use the LEAVE command to
return to the hub when ready to exit the thread.

The room-cleared check reads the remaining NPCs via `getEntitiesInRoom(roomId, "npc")`
(the engine removes the dead mob before publishing the event, and corpses are containers,
not npcs, so 0 remaining means cleared). Boss deaths (identified by template_id containing
"swell-boss") still stamp with `boss-slain` only and do not print the room-cleared message.
The `looted` consequence stamp rides the ephemeral lifespan (evicted on repop/reboot).
(packages/@tapestry/oracle/scripts/consequence-hooks.ts:72-80)

A scenario (`cleared-room-exit-hint.md`) proves the hint prints when the last mob dies.
