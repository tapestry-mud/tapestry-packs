# Death - The Unraveling

Task 12 (punch-list item 5, spec 3.5, decision 3): an Unraveling-tier death ejects the
player to the hub via the return-address, keeps every held item and every worn piece of
gear intact (no corpse, ever), tears the run area down (oracle's `teardownRun`, reached
via the "run.unraveled" event - see combat/output.ts header note for why this is an
event-publish and not a direct cross-pack import), and clears `oracle_active_run` back
to empty.

Uses the temporary `oracle-admin` harness for bake/flip/start (same rationale as
death-grind.md - a technical fixture for the death-branch primitive, sidestepping the
`tapestry_unlocked` progression gate Task 6's real board enforces). Deliberately uses a
DIFFERENT forced seed (4096) than death-grind.md/oracle-run-start.md/tapestry-board.md
(305419896) so re-baking here can never mutate a template another scenario in the same
suite run already depends on - this scenario does not need to know the resulting
geometry at all, since none of its assertions touch minted room/mob content.

The final step re-bakes the SAME template (`bakeTemplate`'s own `registerTemplate` call
always resets `state` to `"draft"`) so this scenario does not leave an OPEN thread
behind for a later scenario in the same suite run - `--all-packs` shares one server/world
across every scenario file, and `oracle-mint-bench.md` asserts a clean "no threads open"
board state at a point in the corpus discovery order that runs after this file.

The player's hub is pinned to a KNOWN room (`tapestry-core:recall`, "The Nexus") by
teleporting there before calling `start` - `startRun` captures the caller's CURRENT room
as the return-address, so this makes the post-death "ejected to hub" assertion exact
instead of guessing at a room this scenario never explicitly visited. The player's own
death is made deterministic with `set player hp Gamemaster 1` before engaging a freshly
admin-spawned goblin, so the first landed counter-hit ends the scenario without racing
combat RNG. The runner has no variable capture, so the exact per-player run area id
(seed hex + a hash of the entity's own GUID) can never be known ahead of time as a full
string - the composite's KNOWN prefix (`oracle-run-1000-`, since the forced seed's hex is
known) and mode field (`|unraveling|`) are asserted as substrings instead, both before
start (present) and after death (absent - the property line no longer contains the run
area prefix once `teardownRun` clears it to empty).

## Setup
- Players: Gamemaster

## Steps
1. Gamemaster: `teleport Gamemaster tapestry-core:recall`
2. Assert Gamemaster sees: `The Nexus`
3. Gamemaster: `oracle-admin bake - unraveltest 10 50 standard unraveling 4096`
4. Assert Gamemaster sees: `baked as draft`
5. Assert Gamemaster sees: `oracle-week-1000`
6. Gamemaster: `oracle-admin flip oracle-week-1000`
7. Assert Gamemaster sees: `Opened oracle-week-1000`
8. Gamemaster: `loaditem tapestry-core:staff-of-dispel-ward`
9. Assert Gamemaster sees: `Loaded a staff of dispel ward into your inventory.`
10. Gamemaster: `loaditem tapestry-example-pack:leather-cap`
11. Assert Gamemaster sees: `Loaded a leather cap into your inventory.`
12. Gamemaster: `wear cap`
13. Assert Gamemaster sees: `You wear a leather cap.`
14. Gamemaster: `oracle-admin start oracle-week-1000 10`
15. Assert Gamemaster sees: `pulls taut`
16. Gamemaster: `inspect Gamemaster`
17. Assert Gamemaster sees: `oracle-run-1000-`
18. Assert Gamemaster sees: `|unraveling|`
19. Gamemaster: `set player hp Gamemaster 1`
20. Assert Gamemaster sees: `Gamemaster's max HP set to 1.`
21. Gamemaster: `spawn tapestry-example-pack:goblin`
22. Assert Gamemaster sees: `Spawned: a goblin`
23. Gamemaster: `kill goblin`
24. Assert Gamemaster sees: `You attack a goblin!`
25. Wait for Gamemaster sees: `The Unraveling takes you.`
26. Assert Gamemaster sees: `The Nexus`
27. Gamemaster: `inventory`
28. Assert Gamemaster sees: `a staff of dispel ward`
29. Gamemaster: `equipment`
30. Assert Gamemaster sees: `a leather cap`
31. Gamemaster: `inspect Gamemaster`
32. Assert Gamemaster does not see: `oracle-run-1000-`
33. Gamemaster: `oracle-admin bake - unraveltest 10 50 standard unraveling 4096`
34. Assert Gamemaster sees: `baked as draft`
