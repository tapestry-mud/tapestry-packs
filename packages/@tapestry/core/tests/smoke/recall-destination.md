# Recall Destination

`recall` sends the player to their own `recall_room_id` (this pack's registered player
property), falling back to the historical `tapestry-core:recall` when it is unset.

Stack-critical, and found the hard way at ship validate (2026-07-23): the verb used to
hardcode `tapestry-core:recall` and read no property at all, while the death handler in
`combat/output.ts` had honoured `recall_room_id` all along. In core's own world that
mismatch is invisible, because the hardcoded room IS the recall point. In a world that
ships its own hub it is a one-word trap: `tapestry-core:recall` is a two-room pocket
(The Nexus, exit down to The Donation Pit, exit back up) with no path into that world's
content, so a player typing a stock MUD reflex leaves the game and cannot walk back.

Cannot be pinned down by a unit test: pack JS runs inside the engine's Jint sandbox
against CLR-wrapped values, and the thing under test is where the player physically ends
up after a real command dispatch.

Both directions matter, so both are asserted:

- Unset property still lands in The Nexus. Worlds that never set `recall_room_id` keep
  the exact behaviour they had before, which is what makes this change safe to ship into
  core rather than fork per world.
- Set property is honoured. This is the half a world's hub depends on.

The scenario starts in The Donation Pit rather than The Nexus on purpose: recalling to
where you already stand would pass whether or not the teleport fired at all.

Steps 8-10 are not cosmetic cleanup, they are required. The whole suite runs against one
managed server and one shared Gamemaster, so both things this scenario mutates - the
persisted `recall_room_id` and the player's own location - leak into every scenario that
runs after it. Leaving either changed breaks unrelated scenarios downstream (observed:
`ward-capability`, `oracle-run-start` and `run-teardown` all failed on the first run of
this file, because they expect Gamemaster to be standing in The Nexus). Restoring the
property to the default and recalling home fixes both at once, and doubles as a third
assertion: the restored default sends the player back to The Nexus.

## Setup
- Players: Gamemaster

## Steps
1. Gamemaster: `teleport Gamemaster tapestry-core:donation-pit`
2. Assert Gamemaster sees: `The Donation Pit`
3. Gamemaster: `recall`
4. Assert Gamemaster sees: `a stone fountain is here`
5. Gamemaster: `set player recall_room_id Gamemaster tapestry-core:donation-pit`
6. Gamemaster: `recall`
7. Assert Gamemaster sees: `The Donation Pit`
8. Gamemaster: `set player recall_room_id Gamemaster tapestry-core:recall`
9. Gamemaster: `recall`
10. Assert Gamemaster sees: `a stone fountain is here`
