# Boss Room No Wander

Task 7: proves the wandering boss's room is tagged `no_wander` the moment it spawns
(population.ts:237, inside the lair branch added by Task 5), consuming the engine's
Part A Task 2 write binding (`tapestry.world.addRoomTag`). Closes S2-13 (a fleeing
low-HP trash mob could pick the boss's room as its escape route, turning first contact
into an unplanned 2v1) - the engine side (`CombatManager.AttemptFlee` filtering exits
against `EngineTags.NoWander`) is proven by that repo's own `CombatManagerTests`; this
scenario proves the PACK side actually applies the tag, end to end, against a live boot.

Forcing a genuinely random flee outcome deterministically through the telnet runner is
impractical (flee only fires off the engine's wimpy-HP threshold mid-combat, with no
JS-exposed way to force it), so this follows the brief's documented fallback: walk a real
player into the room the boss spawns in, then read the room's flags back with core's
admin `inspect room` (`admin-inspect.ts`, roles admin-only) and assert `no_wander` is
present.

Task 5 (`feat(oracle): boss owns the furthest landmark behind a miniboss seal; delete
the boss clock`) deleted the old probabilistic boss clock entirely (`bossClockFires`,
`BOSS_CLOCK_SLOPE`) and gave the boss a fixed address instead: the boss now spawns ONLY
in the lair room, the landmark placed furthest from entry (spec 5.2,
`lair.ts`'s `furthestLandmarkIndex` over `structure.ts`'s `placeLandmarks`), gated by
`!safeStart` (never the entry cell or its six orthogonal neighbors, `tiers.ts`'s
`isEntryAdjacent`). Every input to that placement - `areaSeed`, `targetRooms`, the
K landmark cells, and the room graph's edges - is a pure, deterministic function of the
template's forced seed and size band. The forced seed/walk below (`999` -> template
`oracle-week-3e7`, school-sized, walk `south, south`) was found by replaying the SAME
functions this pack ships and the real mint path actually calls
(`structure.js`'s `computeStructure`/`placeLandmarks`/`edgeExists` for the room graph -
identical to what `geometry-mint.ts`'s `mintAreaGeometry` calls to cut real two-way
exits - and `lair.js`'s `furthestLandmarkIndex` for the lair pick) against the built
`dist/` in a throwaway offline Node script - not guessed or hand-tuned.

That replay, at seed `999` / band `school`, rolls `targetRooms = 20` (one rng draw off
the forced seed, same as `bakeTemplate`'s own derivation) and `landmarkCount = 2`. The
two landmarks land at cells `(1,1,0)` and `(0,-2,0)`; squared distance from entry is `2`
for the first and `4` for the second, so `furthestLandmarkIndex` picks index `1`, path
`0,-2,0`, as the lair - not entry-adjacent (`isEntryAdjacent` is false there), so the
`!safeStart` gate does not refuse it. Re-running the same BFS `computeStructure` runs
internally, with parent pointers kept, shows entry -> `0,-2,0` walks the forced road
(`roadEdges` lines a straight Bresenham path from entry to every landmark) in exactly two
moves, `south, south` - a short, deterministic two-move walk instead of needing to search
for a clock-fire room. Seed `999` remains a valid, non-degenerate pick for this template
size (2 landmarks, lair reachable and not entry-adjacent), so no reseed was needed.

Uses `oracle-admin` (still in the tree per Task 5/6/7's own scenarios) to bake/start as the
single seeded admin actor (`oracle-admin start` is admin/builder-gated, same one-actor
pattern `oracle-run-start.md` uses) - no second player is needed since the assertion only
reads room state, never anything player-scoped. Deliberately SKIPS `oracle-admin flip`/
`mint flip`: `startRun`'s own gate is `tpl.state !== "open" && !isAdmin(actor)`, so an admin
can start a draft template directly, and `tapestry.ts`'s `boardList` only ever lists
`state === "open"` templates. Starting straight off the draft means this scenario's baked
template never becomes visible on the shared `tapestry` board at all - avoiding the same
kind of cross-scenario-file state leakage Task 6's report flagged for
`gear-carries-hp.md`'s `tapestry_unlocked` (this suite's managed run shares one server
process, and therefore one template registry, across every scenario file in a directory or
`--all-packs` run). A fresh, unused forced seed (`999`) was picked deliberately, distinct
from the `305419896` pair other oracle smoke tests reuse, purely so this file's own
simulation and the others' stay independently legible.

## Setup
- Players: Gamemaster

## Steps
1. Gamemaster: `oracle-admin bake - boss-tag-test 1 10 school grind 999`
2. Assert Gamemaster sees: `baked as draft`
3. Assert Gamemaster sees: `oracle-week-3e7`
4. Gamemaster: `oracle-admin start oracle-week-3e7 1`
5. Assert Gamemaster sees: `pulls taut`
6. Gamemaster: `south`
7. Gamemaster: `south`
8. Gamemaster: `inspect room`
9. Assert Gamemaster sees: `no_wander`
