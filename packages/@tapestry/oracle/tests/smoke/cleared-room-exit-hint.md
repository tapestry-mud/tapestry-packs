# Cleared Room Exit Hint

Task 13: proves that when the last mob in a room dies, a hint message is printed
(consequence-hooks.ts:72-80) guiding the player that they can use LEAVE to return to
the hub. The message is "Nothing more stirs here. If the thread feels done, LEAVE
returns you to the hub."

The room-cleared consequence stamp (`looted`) identifies when the last non-boss mob
dies via `getEntitiesInRoom(roomId, "npc")` returning 0 remaining NPCs (the dead mob
is already removed by the engine, and corpses are containers, not npcs). The text is
printed via `sendToRoom` to guide the player about their available exit.

Uses the deterministic seed/walk pattern from `boss-room-no-wander.md`: forced seed
`999` (template `oracle-week-3e7`, school-sized) with a specific walk that ends at a
room where the player can kill the sole mob and see the hint. The walk `north, west`
from entry reaches a transit room (path `1,-1,0`) with a single trash mob; killing it
leaves the room cleared and triggers the hint message.

Uses `oracle-admin` to bake/start as the single seeded admin actor (no second player
needed for the message assertion). Starts the draft template directly without flipping.

## Setup
- Players: Gamemaster

## Steps
1. Gamemaster: `oracle-admin bake - cleared-room-test 1 10 school grind 999`
2. Assert Gamemaster sees: `baked as draft`
3. Gamemaster: `oracle-admin start oracle-week-3e7 1`
4. Assert Gamemaster sees: `pulls taut`
5. Gamemaster: `north`
6. Gamemaster: `west`
7. Gamemaster: `kill tangy trash`
8. Assert Gamemaster sees: `You have slain`
9. Assert Gamemaster sees: `Nothing more stirs here. If the thread feels done, LEAVE returns you to the hub.`
