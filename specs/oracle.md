---
capability: oracle
last-updated: 2026-06-23
---

# oracle

## Overview

`@tapestry/oracle` is the solo-RPG area generator for Tapestry. It rolls a coherent area from
frozen tables, materializes rooms lazily as the player explores, and composes deterministic prose
from the frozen sets. The LLM fills tables once at area creation (dressing only -- names, palette
words, prose fragments); all facts (seed, level range, exit directions, boss clock, stat rolls)
are dice-owned and deterministic. The generator works in both LLM-on mode (live burst via
`authoring.recommend`) and LLM-off mode (baked hand-authored table sets).

The design has two hard lines: (1) dice own facts, LLM owns dressing; (2) once frozen, a room
replays identically from the same seed on any box.

## Behavior

### Generate - freeze - roll primitive

The life of an oracle area goes through three phases:

1. **Generate**: `createSoloArea` rolls the area seed from `(Date.now() XOR hash(playerId))` and
   calls `fillTables` (LLM-on) or `bakedTables` (LLM-off). The seed and level range are
   persisted to `area.yaml` via `authoring.setAreaAttribute` so areas survive reboot.
   (packages/@tapestry/oracle/scripts/area-gen.ts:127-148)

2. **Freeze**: `onReadyTables` writes every resolved `OracleTableData` to disk via
   `authoring.writeOracleTable({ areaId, kind, entries })`. Tables are also live in the engine
   registry immediately after the write, so the first room is materialized on the same tick.
   (packages/@tapestry/oracle/scripts/area-gen.ts:244-260)

3. **Roll**: on each first-arrival at a stub exit, `resolveStub` reads frozen tables via
   `tapestry.oracle.table(areaId + ":" + kind)` and calls `materializeRoom`. All rolls use
   `splitmix64(hashCoord(areaSeed, roomPath))` -- same inputs always produce the same room.
   (packages/@tapestry/oracle/scripts/stub-resolver.ts:189-233)

### Six table kinds

Six `OracleTableData` kinds are registered per area:

| Kind | Shape | Usage |
|------|-------|-------|
| `places` | list of place-word entries (`w`, `id`, `name`, `desc`) | palette for room names via `composeProse` |
| `mobs` | pipe-delimited entries with `balance_ref: "mob"` | ambient spawn source via `mintMobInstance` |
| `boss` | single entry with `balance_ref: "boss"` | boss spawn source via `mintBossInstance` |
| `items` | pipe-delimited entries with rarity + item kind | loot source via `mintItemInstance` |
| `rooms` | (baked sets only) | room description fragments |
| `prose` | entries tagged `opener`, `detail`, `atmosphere` | room prose via `composeProse` |

(packages/@tapestry/oracle/scripts/oracle-tables.ts:278; packages/@tapestry/oracle/scripts/oracle-tables.ts:30-43)

### Theme-x-balance separation

Theme (place words, mob names, prose) is LLM-owned dressing and lives in the oracle tables.
Balance (level, hp formula, damage, stat modifiers) is dice-owned and comes exclusively from the
master balance table (`BALANCE_TABLE` in `balance-table.ts`). The two layers never cross: an LLM
output never influences a numeric stat. Rarity (`common`, `uncommon`, `rare`, `epic`) modifies the
effective level band via `rarityModifier` before the balance lookup.
(packages/@tapestry/oracle/scripts/balance-table.ts:1-60; packages/@tapestry/oracle/scripts/resolver.ts:99-116)

### Deterministic resolver

`rngFor(areaSeed, key)` creates a per-room seeded rng via `splitmix64(hashCoord(areaSeed, key))`.
Every dice roll inside `materializeRoom` -- exit count, ambient mob count, mob stats, boss clock,
prose selection -- draws from this seeded stream. The same `(areaSeed, roomPath)` always
produces the same room regardless of traversal order, reboot, or box.

`resolveAreaSeed` looks up the seed: fast path is in-memory `AreaState.areaSeed`; fallback is
`tapestry.area.get(areaId).seed` (T5 engine seam for reloaded areas). If neither is found it
returns `0` and emits a warn (determinism degraded but not fatal).
(packages/@tapestry/oracle/scripts/stub-resolver.ts:58-80; packages/@tapestry/oracle/scripts/resolver.ts:143-145)

### LLM-on branch

When `authoring.recommendEnabled()` returns true, `fillTables` fires the LLM burst:
- Round 1 (1 in-flight): `fill_places`
- Round 2 (up to 2 in-flight): `fill_mobs` + `fill_boss`, then `fill_items` after one slot frees
- Round 3 (up to 2 in-flight): `fill_prose_openers` + `fill_prose_details`, then
  `fill_prose_atmosphere` after one slot frees

All six tables resolve before `onReady` fires. The player sees flavor messages during the wait.
(packages/@tapestry/oracle/scripts/oracle-tables.ts:141-201; packages/@tapestry/oracle/scripts/area-gen.ts:219-241)

### LLM-off branch

When `authoring.recommendEnabled()` returns false (or is unavailable), `bakedTables("test-kitchen")`
is used instead. Baked table sets are YAML files eagerly loaded at module init time
(`data/baked/<setId>/<kind>.yaml`) so `data.loadYaml` runs while `CurrentPackDir` is still set.
The `onReadyTables` callback fires synchronously on the same tick; no flavor wait is needed but
the loop fires once before the teleport happens.
(packages/@tapestry/oracle/scripts/oracle-tables.ts:280-298; packages/@tapestry/oracle/data/baked/test-kitchen/)

### Destination-pack model

The `solo` flow collects five inputs: `name`, `idea`, `min_level`, `max_level`, and
`destination_pack`. Blank `destination_pack` defaults to `"scratch-oracle-run"`. The
`targetNamespace` value is used as the pack namespace prefix on every room id minted in the area
(`targetNamespace + ":" + areaSlug + "-" + pathKey`). Area packs that depend on `@tapestry/oracle`
declare `oracle: "areas/**/*-oracle-table.yaml"` in their `content:` block to load frozen tables
at boot via the T6 `AuthoredOracleLoader`.
(packages/@tapestry/oracle/scripts/flows/solo-flow.ts:67-71; packages/@tapestry/oracle/pack.yaml:23)

### Mint-vs-reuse

`shouldReuse(existingCount, rng)` returns true with probability `REUSE_WEIGHT = 0.65` when
`existingCount > 0`. The per-area `_mintedMobTypes` set in `stub-resolver.ts` tracks which mob
type ids have appeared in the area. On each ambient spawn: if the set is non-empty and
`shouldReuse` fires, `mintMobInstanceByTypeId` re-instantiates an already-introduced type
(consistent encounter feel); otherwise `mintMobInstance` rolls fresh from the weighted table and
records the new type id in the set.
(packages/@tapestry/oracle/scripts/stub-resolver.ts:38-47; packages/@tapestry/oracle/scripts/resolver.ts:37-39; packages/@tapestry/oracle/scripts/room-gen.ts:299-322)

### Boss clock

`bossClockFires(roomsSinceLastBoss, rng)` ramps: threshold = `min(roomsSinceLastBoss *
BOSS_CLOCK_SLOPE, 1.0)` where `BOSS_CLOCK_SLOPE = 0.07`. The entry room (count=0) is
structurally boss-free. On a boss spawn the counter resets to 0. The run state key
(`playerId + ":" + areaId`) is stored in `AreaState.runStateKey` so the stub resolver can reach
the per-player counter without a playerId parameter.
(packages/@tapestry/oracle/scripts/room-gen.ts:38-39; packages/@tapestry/oracle/scripts/room-gen.ts:221-224)

### Pack content glob

`pack.yaml` declares `oracle: "areas/**/*-oracle-table.yaml"` so the engine's `T2 PackLoader`
calls `LoadOracleData` and registers frozen tables at boot for areas that live inside this pack.
Destination packs declare the same glob to load their frozen tables at boot.
(packages/@tapestry/oracle/pack.yaml:22-23)

## Rejected and Reverted

- Per-room LLM calls -- the original design called `authoring.recommend` for each room's prose
  and mob names as the player explored. Replaced by the front-loaded table-fill approach (P-E
  rework): all LLM work happens once at area creation; the hot path (stub resolver, materializeRoom)
  is zero-LLM. (packages/@tapestry/oracle/scripts/area-gen.ts:1-23)

- `prefetchNeighbors` / session prose cache -- originally the resolver prefetched neighbor rooms
  to hide per-room LLM latency. Removed in the P-E rework because the front-loaded table model
  eliminated per-room LLM calls entirely. (packages/@tapestry/oracle/scripts/stub-resolver.ts:18-24)

- `packs.export` / `RequireProxy` roster sharing -- an earlier version attempted to share the
  rolled roster across packs via `packs.export`. Removed when the ESM pack module system shipped
  (2026-06-20). Cross-module sharing is now native ESM import/export.

## Change Log

- None on record.
