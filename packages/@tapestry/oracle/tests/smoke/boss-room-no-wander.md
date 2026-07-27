# Boss Room No Wander

Task 7: proves the wandering boss's room is tagged `no_wander` the moment it spawns
(population.ts:314-324), consuming the engine's Part A Task 2 write binding
(`tapestry.world.addRoomTag`). Closes S2-13 (a fleeing low-HP trash mob could pick the
boss's room as its escape route, turning first contact into an unplanned 2v1) - the engine
side (`CombatManager.AttemptFlee` filtering exits against `EngineTags.NoWander`) is proven
by that repo's own `CombatManagerTests`; this scenario proves the PACK side actually applies
the tag, end to end, against a live boot.

Forcing a genuinely random flee outcome deterministically through the telnet runner is
impractical (flee only fires off the engine's wimpy-HP threshold mid-combat, with no
JS-exposed way to force it), so this follows the brief's documented fallback: walk a real
player into the room the wandering boss spawns in, then read the room's flags back with
core's admin `inspect room` (`admin-inspect.ts`, roles admin-only) and assert `no_wander`
is present.

The boss clock (`bossClockFires`, population.ts) is probabilistic - `threshold =
min(roomsSinceLastBoss * 0.07, 1.0)`, rolled per room off a per-coordinate rng stream keyed
by `hashCoord(areaSeed, path) + 1` - but every input is a pure, deterministic function of
the template's forced seed and the exact rooms visited in order. The forced seed/walk below
(`999` -> template `oracle-week-3e7`, school-sized, walk `north, north, east`) was found by
replaying the SAME functions this pack ships (`structure.js`'s `computeStructure`/
`edgeExists` for the room graph, `population.ts`'s own `bossClockFires`/`hashCoord`/
`splitmix64` for the clock) against the built `dist/` in a throwaway offline Node script -
not guessed or hand-tuned. That simulation found the wandering boss fires in the THIRD
room visited (path `1,2,0`, not a landmark, not entry-adjacent) after exactly `north,
north, east` from entry - a short, deterministic, three-move walk instead of needing to
explore most of the map to hit the clock's guaranteed-fire tail (threshold clamps to 1.0
only after ~15 rooms without a fire).

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
6. Gamemaster: `north`
7. Gamemaster: `north`
8. Gamemaster: `east`
9. Gamemaster: `inspect room`
10. Assert Gamemaster sees: `no_wander`
