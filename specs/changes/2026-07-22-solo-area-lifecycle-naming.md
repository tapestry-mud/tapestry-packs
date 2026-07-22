---
release: 0.7.0
specs: [oracle.md]
---

# Solo Area Lifecycle Naming

## Why

Every `solo` run minted a fresh area with no way to remove it, so runs piled up with no
cleanup path. Blank-named runs all fell back to the same generic `"the wilds"` label, so a
player's owned runs were hard to tell apart. This slice adds a discard path and a
deterministic default name, riding the engine's new `authoring.deleteArea` teardown
primitive.

## What

**Run lifecycle - `solo list` and `solo discard`.** `solo` stays one command with
subcommand-style args parsed in its handler (the engine router is single-token), registered
with `roles: ["player"]`.

- `solo list` renders the caller's owned runs: index, display name, level range, room count,
  as a strict 7-bit ASCII table.
- `solo discard` discards the run you are standing in, resolved from your current room and
  intersected with your owned list.
- `solo discard <n>` discards run #n from `solo list` (stable insertion order).
- `solo discard <areaId>` is admin/builder only - an escape hatch to remove ANY area by full
  id, including orphans minted before this feature existed. Ordinary players are list-scoped;
  a non-privileged player naming an id outside their own runs is refused.

**Ownership tracking.** `oracle_runs` is a registered `string` player property holding a JSON
array, one record per run (`areaId`, `name`, `levelRange`, `roomCount`, `seed`, `packName`),
written at the end of `createSoloArea` once the room graph exists (so `roomCount` is the real
minted count) and removed at discard. It is the sole authorization source for
`solo discard <n>`. An admin discard of an area whose owner is offline leaves a stale record
on that player's file; it is harmless and is pruned lazily the next time they run
`solo list`.

**Discard order.** `authoring.deleteArea(areaId)` (engine) runs first - the atomic sweep. If
it returns true, the pack clears its own in-memory stores for the area via
`clearAreaCaches(areaId)`: `AreaState` plus the room->area and room->path maps, `RunState`
cells (both the `<playerId>:<areaId>` creation key and the `reload:<areaId>` key), the
minted-type set, the visited set, and the granted-player set. Then the owner's owned-runs
record is removed. Item templates under the area go with the engine's directory delete; items
already instanced in a player's inventory stay - gear purge is a later lifecycle. The
destination pack, its runtime-namespace marker, and `server.yaml` all survive: an area is not
a pack.

**Default naming.** When the player leaves both the idea and the name blank, the display name
is a seeded `qualifier x place` draw from two hand-authored 16-word ASCII decks
(`area-namer.ts`), e.g. `the Ashen Hollow`. It draws from its own sub-stream,
`splitmix64(hashCoord(areaSeed, "name"))`, never the area's primary `rng()`, so the same seed
gives the same name on every box with or without an LLM, and area geometry is unchanged. An
explicit idea (theme) or an explicit name still wins; the theme hint keeps its `"the wilds"`
generic fallback for the LLM, and only the player-visible name changed.

Requires engine `authoring.deleteArea` (engine floor raised to `>=0.1.51`).
