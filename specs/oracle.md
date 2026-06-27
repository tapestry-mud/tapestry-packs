---
capability: oracle
last-updated: 2026-06-27
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

### Reload reconstruction

The in-memory stores (`AreaState`, room->area, room->path, run-state) are populated at
creation and are empty after a reboot/reshare. `ensureAreaContext(roomId)` rebuilds them on
the first stub traversal after a restart: it parses the namespace and grid path out of the
room id (`<namespace>:<areaId>-<pathKey>`, where `pathKey` is `entry` = `0,0,0` or `<x>_<y>_<z>`),
reads the persisted seed / level range / theme from `tapestry.area.get(areaId)`, and re-derives
the biome palette from the seed via the shared `soloAreaBiomePalette` helper so a reconstructed
area is byte-identical to creation. A room is reconstructed only when the area has a persisted
seed (the oracle marker); otherwise the resolver refuses gracefully. Already-explored rooms
need no reconstruction - they persist their real two-way exits to their side-cars and load as
plain rooms. Run-state (the boss clock) resets on reboot, consistent with the session-scoped
mint-reuse set.
(packages/@tapestry/oracle/scripts/stub-resolver.ts:ensureAreaContext;
packages/@tapestry/oracle/scripts/roster.ts:soloAreaBiomePalette)

### LLM-on branch

When `authoring.recommendEnabled()` returns true, `fillTables` fires the LLM burst:
- Round 1 (1 in-flight): `fill_places`
- Round 2 (up to 2 in-flight): `fill_mobs` + `fill_boss`, then `fill_items` after one slot frees
- Round 3 (up to 2 in-flight): `fill_prose_openers` + `fill_prose_details`, then
  `fill_prose_atmosphere` after one slot frees

All six tables resolve before `onReady` fires. The player sees flavor messages during the wait.
(packages/@tapestry/oracle/scripts/oracle-tables.ts:141-201; packages/@tapestry/oracle/scripts/area-gen.ts:219-241)

### LLM-off branch

When `authoring.recommendEnabled()` returns false (or is unavailable), the `solo` flow skips the
`idea` prompt (LLM-only) and instead presents a `scenario` `choice` step FIRST, then the name.
Each scenario maps to a roster (a baked set) AND a theme: every six-axis theme in
`SIX_AXIS_THEMES` is offered as a depth-banded scenario (its idea string is the theme dir, which
the themeDir resolver matches), and every `BAKED_SET_IDS` entry is offered as a flat scenario. The
picked scenario sets both the `idea`/theme (so `composeFor` engages or falls back) and the
`bakedSetId` roster threaded to `createSoloArea`; a blank selection defaults to the first baked set.
(packages/@tapestry/oracle/scripts/flows/solo-flow.ts:SCENARIOS)

Baked table sets are YAML files eagerly loaded at module init time (`data/baked/<setId>/<kind>.yaml`)
so `data.loadYaml` runs while `CurrentPackDir` is still set. The `onReadyTables` callback fires
synchronously on the same tick; no flavor wait is needed but the loop fires once before the
teleport happens.
(packages/@tapestry/oracle/scripts/flows/solo-flow.ts; packages/@tapestry/oracle/scripts/oracle-tables.ts;
packages/@tapestry/oracle/scripts/area-gen.ts; packages/@tapestry/oracle/data/baked/test-kitchen/)

### Destination-pack model

The `solo` flow collects five inputs: `name`, `idea`, `min_level`, `max_level`, and
`destination_pack`. The flow resolves a pack NAME (blank -> `@scratch/oracle-run`; a bare name ->
`@solo/<slug>`; a name containing `/` -> used as-is) and calls `authoring.createPack(packName)`,
which creates the destination pack if it does not exist (writes a `type: world` `pack.yaml`,
registers the namespace live) and returns the registered namespace. That namespace becomes the
`targetNamespace` used as the prefix on every room id minted in the area
(`targetNamespace + ":" + areaSlug + "-" + pathKey`). The destination pack declares
`oracle: "areas/**/*-oracle-table.yaml"` in its `content:` block to load frozen tables at boot
via the T6 `AuthoredOracleLoader`.
(packages/@tapestry/oracle/scripts/flows/solo-flow.ts:on_complete; packages/@tapestry/oracle/pack.yaml:23)

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

### Item delivery - freeze + ride mob inventory

When a loot-drop roll fires for an ambient mob, `mintItemInstance(areaId, level, rng, coordKey, index)`
freezes the rolled item as a standalone item-template side-car and returns its id so the caller can
attach it to the mob's inventory before spawning. The item rides the mob and drops to a room corpse
on death via the core `death.ts` `transferAll`.

`mintItemInstance` maps the rolled `balance_ref` to a base template (`armor-<slot>` for armor,
`weapon-melee` for weapons), overlays the rolled stats (`damage_dice` for weapons; `ac` map +
`slot` for armor), and calls `tapestry.authoring.writeItemTemplate`. The write freezes the item as
`data/areas/<areaId>/items/loot-<typeId>-<coordKey>-<index>.yaml` AND registers it live in the
`ItemRegistry` so the same-session mob inventory resolves without a reboot. The `AuthoredItemLoader`
restores frozen side-cars at boot (reload half).

All 7 armor slots defined in the master balance table (head, hands, feet, body, wrist, waist, neck,
covering level bands 1-60) have a corresponding base template in the oracle pack's `templates/items/`
directory, so a slot roll always resolves to a real base and `writeItemTemplate` never returns null
for armor at any supported level.

The loot threshold draw (`LOOT_DROP_CHANCE = 0.35`) is unconditional per spawn iteration (same
rng-stream position as the shipped v2 code); `mintItemInstance` only fires when the draw succeeds
AND the mob override is non-null. `tapestry.mobs.spawnMob` consumes no rng, so attaching loot
before the spawn does not shift the stream.
(packages/@tapestry/oracle/scripts/resolver.ts:mintItemInstance;
packages/@tapestry/oracle/scripts/room-gen.ts:materializeRoom)

### LLM table-fill parser hardening

LLM table-fill output is processed through `oracle-parse.ts` (zero engine imports, golden-tested
with `node --test`). The hardened helpers strip common small-model leakage:
- **Preambles**: any line ending in ":" with no "|" separator is skipped (`isPreamble`).
- **Phrasing-agnostic lead-in clauses**: any single-line "Common places: ..." or "Options: ..."
  style prefix is stripped regardless of phrasing (colon detection + no comma before the colon).
- **Interjections**: leading "Sure!", "Okay,", "OK -" patterns are stripped before parsing.
- **Numbering prefixes**: "1.", "2)", "- ", "* " are stripped from each fragment (`cleanLine`).
- **Over-long fragments**: any name or desc exceeding 120 characters is hard-capped.
- **Junk rows**: pipe-delimited rows whose name field has no alphanumeric character (e.g. "--- | ---"
  or " | orphaned desc") are dropped.

Crammed multi-record lines (multiple records on one line, not split by newline) are a NAMED
DEFERRAL - no such leak has been observed; a conservative splitter is deferred until one appears
in a real playtest session.

`oracle-tables.ts` re-exports `slug`, `parseList`, `parsePipeLines`, `pushLines` from
`oracle-parse.ts` so existing importers are unchanged.
(packages/@tapestry/oracle/scripts/oracle-parse.ts; packages/@tapestry/oracle/test/oracle-parse.test.mjs)

### Six-axis generator stack (rooms)

Rooms resolve through six axes (degree, dressing, consequence, cascade, signature, context)
loaded as pack data rather than a flat one-row-one-pick. `coords.ts` supplies a 3D `x,y,z`
coordinate model with up/down offsets (fixing the u/d-exit bug and supplying `descentDepth`).
`six-axis.ts` defines `parseSixAxisTable` (pure normalize, golden-tested) and the band resolver:
`diceSpan`/`resolveBands` read the die declared in each table's `dice:` metadata - dice are data,
never hardcoded. `degree.ts` rolls a DEPTH-BIASED degree over the die span (deeper re-weights the
distribution up; the rare threshold band stays a tail gated by the boss clock, never reachable
from depth alone). `room-compose.ts` is a generic composition core plus a registered `rooms`
composer that maps the resolved band to spawn density and banded prose. The composer engages only
when the area theme resolves to a six-axis theme dir (`themeDirFor`); a non-themed area returns
null and falls back to the legacy flat path unchanged.
(packages/@tapestry/oracle/scripts/coords.ts; packages/@tapestry/oracle/scripts/six-axis.ts;
packages/@tapestry/oracle/scripts/degree.ts; packages/@tapestry/oracle/scripts/room-compose.ts;
packages/@tapestry/oracle/data/six-axis/endless-underdeep/)

The six-axis tables are eager-loaded + cached at module init (`SIX_AXIS_CACHE`), the same posture
as the baked-table loader: `data.loadYaml` resolves against `CurrentPackDir`, which at RUNTIME is
the last-loaded pack (the dest pack), so a lazy runtime load would resolve to the wrong directory
and find nothing. `loadSixAxisTables(themeDir)` reads the cache.
(packages/@tapestry/oracle/scripts/six-axis.ts:SIX_AXIS_CACHE)

### Room consequences and revisit

Gameplay events stamp room consequences via the engine `tapestry.consequence.*` overlay, routed by
the ROOM-3 lifespan tag. `consequence-hooks.ts` subscribes to `mob.death`: a boss death stamps
`boss-slain` (persistent); clearing the last npc in a room stamps `looted` (ephemeral). The engine
evicts ephemeral entries on the area repop tick and keeps persistent/succession-seed until reboot;
all consequences are memory-only and drop on reboot. `room-revisit.ts` subscribes to
`player.direction.moved` and appends the destination room's scar prose (the ROOM-2
`state_overrides` fragment for each stamped kind) as a trailing line on walk-in.
(packages/@tapestry/oracle/scripts/consequence-hooks.ts; packages/@tapestry/oracle/scripts/room-revisit.ts;
packages/@tapestry/oracle/data/six-axis/endless-underdeep/ROOM-3.yaml)

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

- 2026-06-27 [oracle-six-axis-tables](changes/2026-06-27-oracle-six-axis-tables.md) - six-axis generator stack: 3D coords (u/d fix + depth), per-table dice-metadata band resolver, depth-biased degree, multi-table composition + depth-banded rooms, module-init six-axis cache, consequence stamping + walk-in revisit scars, LLM-off scenario picker
- 2026-06-25 [solo-oracle-v2-completion](changes/2026-06-25-solo-oracle-v2-completion.md) - item delivery (freeze + mob-inventory ride + corpse drop), LLM-off baked-set picker, hardened parse module with 11 golden tests, 3 missing armor base templates
