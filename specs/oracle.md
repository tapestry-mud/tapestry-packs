---
capability: oracle
last-updated: 2026-06-28
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

### Table kinds

`OracleTableData` kinds registered per area:

| Kind | Shape | Usage |
|------|-------|-------|
| `places` | list of place-word entries (`w`, `id`, `name`, `desc`) | themed room names + prose palette |
| `mobs` | entries with `balance_ref: "mob"` | ambient spawn source via `mintMobInstance` |
| `boss` | single entry with `balance_ref: "boss"` | boss spawn source via `mintBossInstance` |
| `items` | entries with rarity + item kind | loot source via `mintItemInstance` |
| `rooms` | (baked sets only) | room description fragments |
| `prose` | entries tagged `opener`, `detail`, `atmosphere` | room prose via `composeProse` / assembled ROOM-2 |
| `scars` | entries tagged by consequence kind (`looted`, `boss-slain`, `collapsed`) | ROOM-3 state-override scar prose |

The `scars` table is always present: an LLM area fills it via `fill_scars`, and `bakedTables`
appends a generic fallback scars table to any baked set that lacks one (`BAKED_KINDS` omits
scars, so every baked set gets the fallback).
(packages/@tapestry/oracle/scripts/oracle-tables.ts:228-229; packages/@tapestry/oracle/scripts/oracle-tables.ts:272-284; packages/@tapestry/oracle/scripts/oracle-tables.ts:29-41)

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

When `authoring.recommendEnabled()` returns true, `fillTables` fires the LLM burst. Each call
passes a per-kind STRICT json_schema (`SCHEMA_*`) to `authoring.recommend`, so the seam returns
constrained JSON, not free text:
- Round 1 (1 in-flight): `fill_places`
- Round 2 (up to 2 in-flight): `fill_mobs` + `fill_boss`, then `fill_items` after one slot frees
- Round 3 (up to 2 in-flight): `fill_prose_openers` + `fill_prose_details`, then
  `fill_prose_atmosphere` and `fill_scars` as those slots free

All tables (places, mobs, boss, items, prose, scars) resolve before `onReady` fires. Each call's
mapper falls back to deterministic entries when the LLM returns empty or unparseable JSON. The
player sees flavor messages during the wait.
(packages/@tapestry/oracle/scripts/oracle-tables.ts:86-216; packages/@tapestry/oracle/scripts/area-gen.ts:219-241)

### LLM-off branch

When `authoring.recommendEnabled()` returns false (or is unavailable), the `solo` flow skips the
`idea` prompt (LLM-only) and instead presents a `scenario` `choice` step FIRST, then the name.
The scenario list is built by the engine-free `buildScenarios(SIX_AXIS_THEMES, BAKED_SET_IDS)`
(golden-tested under plain node): every six-axis theme is offered as a depth-banded scenario and
uses its OWN baked set when one exists (else the first baked set); every other baked set is offered
as a flat scenario, and a baked set that is also a theme is NOT offered as a duplicate flat entry.
Each scenario carries both an `idea`/theme and a `bakedSet`; the pick threads both into
`createSoloArea`.
(packages/@tapestry/oracle/scripts/scenarios.ts:8-19; packages/@tapestry/oracle/scripts/flows/solo-flow.ts:34)

The `__solo_scenario` property is read back in `on_complete` ONLY when the LLM is off. A stale
value left by a prior LLM-off run is otherwise ignored, so it can no longer override a typed idea
in an LLM-on run (the "typed Haunted Circus, generated endless-underdeep" bug).
(packages/@tapestry/oracle/scripts/flows/solo-flow.ts:118-122)

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

### Structured-output table fill

LLM table-fill output is structured JSON, not free text. Each `fill_*` call passes a per-kind
STRICT json_schema constant (`SCHEMA_PLACES`, `SCHEMA_MOBS`, `SCHEMA_BOSS`, `SCHEMA_ITEMS`,
`SCHEMA_PROSE`, `SCHEMA_SCARS`) to `authoring.recommend`; the seam returns JSON constrained to
that schema. Each schema is a root object with `additionalProperties:false` and all properties
required; arrays are wrapped in an object property because strict mode forbids a root array. The
item schema carries rarity (`common`/`uncommon`/`rare`/`epic`) and kind (`weapon`/`armor`) as
enums.
(packages/@tapestry/oracle/scripts/oracle-structured.ts:165-239; packages/@tapestry/oracle/scripts/oracle-tables.ts:61-72)

`oracle-structured.ts` (zero engine imports, golden-tested with `node --test`) holds the
JSON->`OracleEntry` mappers `mapPlaces` / `mapMobs` / `mapBoss` / `mapItems` / `mapProse` /
`mapScars`. The engine returns raw JSON, so the mappers fold values pack-side: `asciiFold`
enforces 7-bit ASCII, names cap at 60 chars (`MAX_NAME`), descriptions cap on a SENTENCE boundary
at ~200 chars (`MAX_DESC`), `normalize` turns LLM snake_case identifiers back into spaces and
strips leading list-numbering the model sometimes bakes into array items. Any `JSON.parse`
failure returns `[]`, and the caller falls back to baked/deterministic entries.
(packages/@tapestry/oracle/scripts/oracle-structured.ts:11-163; packages/@tapestry/oracle/scripts/oracle-tables.ts:100-145)

The crammed-multi-record leak class - the unfixed weakness of the old heuristic parser - is gone
by construction: each schema array element is one discrete record, so records can never share a
line. `normalizeRarity` / `normalizeKind` are kept as a defensive guard for the baked /
schema-ignoring path.
(packages/@tapestry/oracle/scripts/oracle-structured.ts:74-81; packages/@tapestry/oracle/test/oracle-structured.test.mjs)

### Six-axis generator stack (rooms)

Rooms resolve through six axes (degree, dressing, consequence, cascade, signature, context)
loaded as pack data rather than a flat one-row-one-pick. `coords.ts` supplies a 3D `x,y,z`
coordinate model with up/down offsets (fixing the u/d-exit bug and supplying `descentDepth`).
`six-axis.ts` defines `parseSixAxisTable` (pure normalize, golden-tested) and the band resolver:
`diceSpan`/`resolveBands` read the die declared in each table's `dice:` metadata - dice are data,
never hardcoded. `degree.ts` rolls a DEPTH-BIASED degree over the die span (deeper re-weights the
distribution up; the rare threshold band stays a tail gated by the boss clock, never reachable
from depth alone). `room-compose.ts` is a generic composition core plus a registered `rooms`
composer that maps the resolved band to spawn density and banded prose. The composer engages
whenever ROOM-1 is present in the area's table set, returning null only if it is absent.
(packages/@tapestry/oracle/scripts/coords.ts; packages/@tapestry/oracle/scripts/six-axis.ts;
packages/@tapestry/oracle/scripts/degree.ts; packages/@tapestry/oracle/scripts/room-compose.ts:86-100;
packages/@tapestry/oracle/data/six-axis/endless-underdeep/)

### Six-axis on every area

Every area is six-axis, not just the one authored theme. The six-axis set splits into shared
theme-agnostic MECHANICS and per-area DRESSING. Shared MECHANICS - the ROOM-1 DEGREE bands and
the ROOM-3 CONSEQUENCE taxonomy/lifespans - live in `data/six-axis/_default/` and are eager-loaded
into `DEFAULT_MECHANICS` at module init, the same posture as `SIX_AXIS_CACHE`. The band structure
(dice span, ranges, which table fires) and the consequence kinds/lifespans are fixed game logic
the LLM never touches; only the prose is themed.
(packages/@tapestry/oracle/data/six-axis/_default/ROOM-1.yaml; packages/@tapestry/oracle/data/six-axis/_default/ROOM-3.yaml; packages/@tapestry/oracle/scripts/six-axis.ts:223-241)

`buildAreaSixAxis(themeDir, proseEntries, scarEntries)` assembles the per-area set: the shared
MECHANICS plus a ROOM-2 DRESSING table. An AUTHORED theme (endless-underdeep) keeps its full
authored set, and its authored ROOM-2 still wins. Any other area (an LLM-themed idea, or a flat
baked set) gets a ROOM-2 ASSEMBLED by `assembleRoom2` from the area's frozen `prose` table
(openers/details/atmosphere subtables) and frozen `scars` table (the per-kind `state_overrides`).
This is how an LLM-themed area gets six-axis dressing with no authored YAML.
(packages/@tapestry/oracle/scripts/six-axis.ts:247-298; packages/@tapestry/oracle/scripts/area-gen.ts:358-375)

A generated room is named after a themed place word drawn from the frozen `places` table
(deterministic per room), NOT `theme/band - biome` - the generic terrain biome clashed with the
area theme (a "Cavern" in a circus). It falls back to the composed band, then the theme, then the
biome when the places table is empty.
(packages/@tapestry/oracle/scripts/room-gen.ts:275-291)

The six-axis tables are eager-loaded + cached at module init (`SIX_AXIS_CACHE`), the same posture
as the baked-table loader: `data.loadYaml` resolves against `CurrentPackDir`, which at RUNTIME is
the last-loaded pack (the dest pack), so a lazy runtime load would resolve to the wrong directory
and find nothing. `loadSixAxisTables(themeDir)` reads the cache.
(packages/@tapestry/oracle/scripts/six-axis.ts:SIX_AXIS_CACHE)

### Room consequences and revisit

Gameplay events stamp room consequences via the engine `tapestry.consequence.*` overlay, routed by
the lifespan from the shared ROOM-3 taxonomy (`lifespanFor`, with a `LIFESPAN_FALLBACK` for the
reachable kinds). `consequence-hooks.ts` subscribes to `mob.death`: a boss death stamps
`boss-slain` (persistent); clearing the last npc in a room stamps `looted` (ephemeral). The engine
evicts ephemeral entries on the area repop tick and keeps persistent/succession-seed until reboot;
all consequences are memory-only and drop on reboot. `room-revisit.ts` subscribes to
`player.direction.moved` and appends the destination room's scar prose (the ROOM-2
`state_overrides` fragment for each stamped kind) as a trailing line on walk-in. The scar prose
comes from the per-area ROOM-2: the authored set for a six-axis theme, or the set assembled from
the frozen `scars` table for any other area.
(packages/@tapestry/oracle/scripts/consequence-hooks.ts:33-83; packages/@tapestry/oracle/scripts/room-revisit.ts;
packages/@tapestry/oracle/data/six-axis/_default/ROOM-3.yaml)

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

- `oracle-parse.ts` heuristic free-text parser -- the table-fill output was once free text run
  through a hardened parser (preamble/interjection/numbering/junk-row stripping). It carried an
  unfixed crammed-multi-record leak class (several records on one line). Deleted in 0.3.0 when the
  recommend seam moved to STRICT json_schema structured output; the parser is replaced by the
  schema-constrained mappers in `oracle-structured.ts`, where each array element is one discrete
  record by construction. (packages/@tapestry/oracle/scripts/oracle-structured.ts:1-7)

## Change Log

- 2026-06-28 [oracle-structured-six-axis-everywhere](changes/2026-06-28-oracle-structured-six-axis-everywhere.md) - structured-output table fill (parser deleted, per-kind json_schema + JSON->entry mappers); six-axis on every area (shared _default mechanics + assembled ROOM-2 dressing, composer ungated); fill_scars + always-present scars table; place-word room names; extracted buildScenarios with theme/baked dedup; playtest fixes (stale-scenario gate, weighted exit count, present-tense prompts)
- 2026-06-27 [oracle-six-axis-tables](changes/2026-06-27-oracle-six-axis-tables.md) - six-axis generator stack: 3D coords (u/d fix + depth), per-table dice-metadata band resolver, depth-biased degree, multi-table composition + depth-banded rooms, module-init six-axis cache, consequence stamping + walk-in revisit scars, LLM-off scenario picker
- 2026-06-25 [solo-oracle-v2-completion](changes/2026-06-25-solo-oracle-v2-completion.md) - item delivery (freeze + mob-inventory ride + corpse drop), LLM-off baked-set picker, hardened parse module with 11 golden tests, 3 missing armor base templates
