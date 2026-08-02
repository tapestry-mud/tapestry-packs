---
capability: oracle
last-updated: 2026-08-02
---

# oracle

## Overview

`@tapestry/oracle` is the solo-RPG area generator for Tapestry. It rolls a coherent area from
frozen tables inside a radius envelope with landmarks, Voronoi sector prose, and edge-hash exits;
mints the WHOLE room graph (real two-way exits, zero stubs) at creation; and populates each room
with spawns on first player arrival through a THREAT-TIER LADDER: ambient trash with a dice-owned
disposition mix, a swell-capable elite in every charged-band room, one named miniboss AT each
landmark, and a single once-per-run wandering boss on the pity clock. The entry room is a
STRUCTURALLY SAFE START: zero ambient spawns ever (B.2), boss-free, elite-free -- its one
inhabitant is the friendly guide NPC that hands over the starter kit and starter abilities on
interaction. The LLM fills tables once
at area creation (dressing only -- names, bespoke landmark prose + miniboss identities, sector
fragment pools, banded creature rosters, scar lines); all facts (seed, target_rooms, landmark
placement, sector geometry, exit existence, direction words, menace-band selection, disposition
distribution, boss clock, stat rolls) are dice-owned and deterministic. The generator works in
both LLM-on mode (live burst via `authoring.recommend` structured output) and LLM-off mode
(baked hand-authored table sets). The `solo` command is open to players (roles `["player"]`);
the stage-E per-player rate limit is a documented SHIP DEPENDENCY before a server has real
strangers on it.

The design has two hard lines: (1) dice own facts, LLM owns dressing -- no LLM output ever touches
a number, a direction, or an exit; (2) same seed replays byte-identical on any box. The only
deliberate path-dependent channels are the boss clock and first-visit spawn timing (including the
session-scoped mint-vs-reuse set); geometry and prose never depend on path.

## Behavior

### Generate - freeze - mint - populate lifecycle

1. **Generate**: `createSoloArea` rolls the area seed (`Date.now() XOR hash(playerId)`, or an
   explicit seed supplied through the solo flow's optional `seed` question -- the shareable-seed
   seam) and rolls `target_rooms` from the player-chosen size band (school 18-24, standard 40-60,
   epic 90-110). STREAM CONTRACT: the target roll is the single rng draw before the biome-palette
   derivation, replayed by `soloAreaBiomePalette` on reload. Seed and level range persist to
   `area.yaml` (T5); `target_rooms` rides the frozen `structure` oracle table because the T5
   area-attribute seam whitelists only `level_range`/`reset_interval`/`wip`/`seed`.
   (packages/@tapestry/oracle/scripts/area-gen.ts:createSoloArea)

2. **Freeze**: `fillTables` (LLM-on) or `bakedTables` (LLM-off) produce the table set;
   `normalizeTables` -- the single normalization point for BOTH paths -- guarantees exactly K
   landmark records, K sector pool-sets (synthesized from the prose table when absent), a prose
   table, and a scars table, all COPY-ON-WRITE (never mutating tables aliased to the baked
   module cache). Every table freezes to disk via `authoring.writeOracleTable`.
   (packages/@tapestry/oracle/scripts/oracle-tables.ts:normalizeTables)

3. **Mint**: `mintAreaGeometry` computes the pure structure (envelope, landmarks, roads,
   BFS-reachable set) and creates EVERY reachable room with composed prose plus real two-way
   exits. CHUNKED at 12 rooms per engine tick: the engine caps each Jint entry at 5s wall clock
   and every `createRoom`/`setRoomExit` writes a side-car synchronously, so a 70-room mint in one
   call blows the cap (the constraint interrupt surfaces as bogus ReferenceErrors). The teleport
   rides the mint completion callback, never the flavor timer.
   (packages/@tapestry/oracle/scripts/geometry-mint.ts:mintAreaGeometry)

4. **Populate**: spawns stay lazy. `population.ts` subscribes to `player.direction.moved` (the
   room-revisit pattern; core movement publishes it AFTER the room render) and runs ambient
   spawns + the boss clock exactly once per room on first arrival. Because the event is
   post-render, first-visit spawns announce with a "<name> stirs at your arrival." line to the
   mover. The entry room populates at creation (`populateEntry`) because `teleportEntity`
   publishes no direction event. (packages/@tapestry/oracle/scripts/population.ts)

### The v3 spatial model (pure structure.ts)

All geometry is `f(areaSeed, coord)` + frozen constants, golden-tested under plain node:

- **Radius envelope**: `target_rooms` derives R by a fixed-point iteration against an empirical
  fill model. Edge probability runs at full strength inside 0.7R and decays linearly to 0 at R;
  z-levels cost 2.5 horizontal units, so the envelope is a squat lens. The map closes itself at
  roughly target size with a dead-endier rim; entry sits at the center (0,0,0).
- **Landmarks**: K = max(2, min(8, round(target/12))), placed one per angular wedge at mid-radius
  (0.45R-0.7R) with seeded jitter, z = 0, deterministic collision nudge. The landmark's coords
  ARE a room.
- **Sectors**: `sectorOf(coord)` = nearest landmark (2D). Rooms whose two nearest landmarks are
  within `BORDER_GAP = 1.5` of each other are border rooms and blend both sectors' pools.
- **Edge-hash exits**: `edgeExists(a,b) = hash(areaSeed, canonicalEdgeKey) < p`. Both endpoints
  compute the same answer, so reciprocity is free (the v2 return-exit inflation class is deleted).
  p folds base 0.58, vertical multiplier 0.15 (descent is an event, not noise), both endpoints'
  degree-band multipliers (transit 0.75 / landmark-band 1.25 -- fiction and structure agree), and
  the envelope decay of the weaker endpoint.
- **Roads**: the 4-connected Bresenham lines entry->each landmark plus the landmark ring k->k+1
  are FORCED edges -- every landmark is reachable from entry by construction, and goal-directed
  travel has real corridors.
- **Reachable set**: BFS from entry in fixed direction order, sorted output. Cells the
  percolation strands are never born; only reachable rooms mint.
- **pureDegree**: the depth-biased ROOM-1 degree roll with pressure 0 -- the same number drives
  edge modulation, prose cadence, and spawn density, so all three agree by construction.
  (Pressure no longer biases the band; geometry purity requires it.)
(packages/@tapestry/oracle/scripts/structure.ts; packages/@tapestry/oracle/tests/structure.golden.test.mjs)

### Table kinds

`OracleTableData` kinds registered per area:

| Kind | Shape | Usage |
|------|-------|-------|
| `places` | place-word entries (`w`, `id`, `name`, `desc`) | qualifier x place room names |
| `mobs` | BANDED: id prefix `mb-<band>-<slug>` assigns each creature a MOB-1 menace band (`skulker`/`common`/`hunter`/`apex`); `balance_ref: "mob"` | banded spawn source via `mintMobInstance` / elite pool via `mintEliteInstance` (a table with NO banded ids -- every 0.4.0 frozen area -- falls back to the flat weighted pick) |
| `boss` | single entry with `balance_ref: "boss"` | wandering-boss source via `mintBossInstance` |
| `items` | entries with rarity + item kind (`{w,id,name,desc,balance_ref,rarity}`, shape unchanged since 0.3.x) | six-axis loot source via `mintItemInstance`: an ITEM-1 DEGREE band (bent by ITEM-6 CONTEXT) picks which `rarity` slice to draw from -- a table with no ITEM-1 band match, or no ITEM-1 table at all (every pre-0.6.0 frozen area), falls back to the flat weighted pick |
| `prose` | entries tagged `opener`/`detail`/`atmosphere` | union of sector pools; feeds assembleRoom2 + sector synthesis |
| `scars` | entries tagged by consequence kind | ROOM-3 state-override scar prose |
| `landmarks` | ID-PREFIX ENCODED: `lm-<i>` rows carry the bespoke room description, `afar-<i>-<v>` rows the seen-from-afar VARIANTS (target 3), `boss-<i>` rows the landmark's frozen MINIBOSS identity (name = title, desc = one line); legacy 0.4.0 rows (`afar-<i>`, no boss rows) still parse -- one variant, keeper-of synthesis | bespoke landmark rooms + reference lines + miniboss identities |
| `sectors` | ID-PREFIX ENCODED: `s<i>-qual-<n>` (the 2-3 word QUALIFIER DECK; legacy single `s<i>-qual` parses as a one-word deck), `s<i>-opener-<n>`, `s<i>-detail-<n>`, `s<i>-sensory-<n>`, `s<i>-hook-<n>`, `s<i>-lmline-<n>` | per-sector prose pools + name-deck qualifiers + slot lines |
| `structure` | single entry `target-rooms` (desc = the number) | persists target_rooms the T6 way |
| `visited` | one row per populated room, `id` = pathKey, entries kept SORTED | first-visit tracking across reboot |
| `grants` | one row per granted player, `id` = player entity id, entries SORTED | starter-kit once-per-player gate (PLAYTEST SCAFFOLDING) |

The id-prefix encoding exists because the engine's `writeOracleTable` binding whitelists exactly
`{w, id, name, desc, balance_ref, rarity}` -- extra fields are dropped at the Jint boundary, so
structure rides the id. Codecs (`encodeLandmarksTable`/`parseLandmarksTable`,
`encodeSectorsTable`/`parseSectorsTable`) are pure and golden-tested.
(packages/@tapestry/oracle/scripts/sector-compose.ts)

### Composed room prose and names (anti-repetition stack)

Composed (non-landmark) rooms assemble from their sector's pools:

- **Variable cadence**: the slot-type subset varies by pure degree band -- transit is one terse
  opener; chambers take two parts; charged rooms may add a hook; the landmark band breathes in
  three; threshold stays clipped. Length doubles as signal.
- **Neighbor exclusion**: a room computes its four horizontal neighbors' natural picks and shifts
  its own off them (lexicographic tie-break walks colliding same-natural neighbors in opposite
  directions). Zero state; adjacent repeat rate drops from 12.5% to under 3% (residual documented
  -- a perfect guarantee needs radius-2 recursion, not worth it for prose). Pools of 4 or fewer
  skip exclusion.
- **Names**: mint-time NO-REPLACEMENT deal (`dealSectorNames`, pure and traversal-independent):
  each sector shuffles its qualifier-deck x place product deck with a seeded rng and deals
  `titleCase(qualifier + " " + place)` names to its composed rooms in sorted-path order,
  reshuffling past exhaustion (repeats only after every product is used once -- the 0.4.0
  independent per-room pick duplicated 8 name clusters in a 41-room run). z != 0 overrides the
  qualifier with Upper/Lower; a place word already containing the qualifier drops it ("cold" x
  "cold room" -> "Cold Room"). Landmark rooms are named by their landmark (deck deduped at map
  time).
- **Slot-filled landmark references**: appended at mint from computed geometry -- one of the
  landmark's afar VARIANTS (up to 3 frozen per landmark) plus a dice-owned 4-tail direction
  deck, or a slot-filled `{dir}` pool line (8-way `dirWord`; vertical uses a fixed template).
  The 4-tail deck names the landmark explicitly ("The <name> lies to the <dir> of here.")
  rather than using a bare pronoun -- an LLM-authored afar sentence isn't guaranteed to give
  "it" a physical-object antecedent, so the tail can't lean on one; the vertical template
  (above/below) already named the landmark for the same reason.
  DISTANCE-BANDED seeded gate: 0.45 within 2D distance 3 of the landmark, 0.25 beyond
  (the 0.4.0 flat gate put one fixed afar sentence in 17/41 rooms); always-on for the entry
  room and rooms adjacent to their landmark. Four rng draws happen unconditionally so the
  stream shape never depends on branch outcomes. The LLM never writes a direction: mapper lint
  drops slotless landmark lines and strips compass sentences from all pool lines and bespoke
  prose.
- Landmark rooms use their frozen bespoke description verbatim.
(packages/@tapestry/oracle/scripts/sector-compose.ts; packages/@tapestry/oracle/scripts/geometry-mint.ts)

### First-visit population - the threat-tier ladder

`populateRoom` runs the stage-B tier ladder on each room's first visit, every rng draw in fixed
code position (per-room streams stay traversal-independent; keys `coordKey+":miniboss"` /
`":spawn"` / `":boss"`):

0. **Safe entry (B.2 structural guarantee)** -- the entry cell spawns ZERO ambient mobs, ever:
   `tiers.ambientDensity(band, path)` zeroes the trash budget at `ENTRY_PATH` ("0,0,0"), the
   same posture as the structurally boss-free entry. NPCs stay allowed -- the guide (below)
   rides the separate NPC spawn path, so the ambient-zero rule and the guide spawn cannot
   collide. Golden-tested for every band. (packages/@tapestry/oracle/scripts/tiers.ts:ambientDensity)

1. **Miniboss** -- a landmark room spawns its frozen identity (`boss-<i>` landmarks row; a
   0.4.0-era table synthesizes "the keeper of the <landmark>" via `defaultMinibossFor`) on the
   `swell-miniboss` template. Exactly one per landmark -- EXCEPT a landmark that is
   entry-adjacent (possible on school maps), where the structurally-safe start wins over
   exactly-K and the miniboss is skipped (documented exception: that run has K-1).
2. **Elite** -- a charged-band room converts its first density slot into a swell-capable elite:
   apex-forced banded selection, a SIGNATURE epithet rolled once and frozen into the name
   ("the dire tandoor beast"), elite balance row, `swell-elite` template. Never at entry or
   entry-adjacent rooms.
3. **Trash** -- the 0.3.x ambient loop (same stream key, mint-vs-reuse set, level-1 flat band)
   plus two new unconditional per-iteration draws: banded type selection through MOB-1, and a
   dice-owned band-weighted DISPOSITION draw that picks the spawn template (see the disposition
   axis section). Its loot draw (still 0.35 by default) now reads from ITEM-6's `trash` row
   instead of a hardcoded constant -- see "Item delivery" below.
4. **Boss clock** -- see the boss clock section; suppressed here in landmark and safe-start
   rooms.

Spawn density reads the pure geometry band (transit 0 / chamber 1 / charged 2 / landmark 1 /
threshold 1); the elite consumes one charged slot (charged = 1 elite + 1 trash). Arrival lines
are per-kind dressing (`stirLine`): aggro "rounds on you the moment you enter", neutral "stirs
at your arrival", timid "shrinks back", elite "turns its full attention on you", miniboss
"rises to meet you". (packages/@tapestry/oracle/scripts/population.ts:populateRoom;
packages/@tapestry/oracle/scripts/tiers.ts)

First-visit tracking: an in-memory per-area set of visited pathKeys, hydrated lazily from the
frozen `visited` oracle table and persisted by rewriting that table (sorted entries) on each
first visit. A room property was rejected: generated rooms belong to the runtime-created
destination pack, which has no loaded manifest on reboot and validates STRICT -- a pack-declared
property on those rooms fails the boot, and the docker deployment cannot even write the pack
scaffold. Oracle table side-cars ride `AuthoredOracleLoader` with zero validator surface.

`spawnMob` mobs are transient (the engine repop tick only restocks pack-YAML spawn rules), so a
marker-persisted room stays as the player left it after a reboot -- the same outcome 0.3.x had
for materialized rooms. (packages/@tapestry/oracle/scripts/population.ts)

### Reload reconstruction

The in-memory stores (AreaState, room->area, room->path, run-state, visited sets, minted-type
sets) are populated at creation and empty after a reboot/reshare. `ensureAreaContext(roomId)`
(now in area-context.ts) rebuilds them on the first population-trigger event after a restart:
`parseOracleRoomId` (pure, golden-tested) splits the room id NON-GREEDILY -- the old greedy regex
misparsed any negative leading coordinate (`...--1_-1_0` split as areaId `...-` + path
`1,-1,0`), silently killing post-reboot context for negative-x rooms, latent since 0.3.x. Seed /
level range / theme reload from `area.yaml`; `target_rooms` from the `structure` table; the biome
palette re-derives via `soloAreaBiomePalette`; the assembled six-axis rebuilds from the frozen
prose + scars tables. Minted rooms load as plain rooms with real exits; nothing re-mints.
Run-state (the boss clock) resets on reboot, consistent with the session-scoped mint-reuse set.
(packages/@tapestry/oracle/scripts/area-context.ts; packages/@tapestry/oracle/scripts/coords.ts:parseOracleRoomId)

### LLM-on branch

When `authoring.recommendEnabled()` returns true, `fillTables` fires the burst, never exceeding
RecommendMaxInFlight=2 (K = landmark count):
- Round 1 (1 in-flight): `fill_places`
- Round 2 (1 in-flight): `fill_landmarks` -- `mapLandmarks` returns EXACTLY K records (name
  dedupe as a no-replacement deck, direction lint sentence-by-sentence, fallback-deck padding,
  numbered-waypoint synthesis past exhaustion, 500-char sentence-boundary cap for bespoke
  descs); each record now carries up to 3 linted `afars` variants plus a `boss_name`/`boss_desc`
  miniboss identity (title normalized to "the <title>"; junk -> "" -> keeper-of synthesis at
  consume time; normalize pads afars to >= 1)
- Round 3 (up to 2): `fill_mobs` (BANDED: 2 skulkers / 3 common / 2 hunters / 1 apex, required
  `band` enum -> `mb-<band>-<slug>` ids) + `fill_boss`, then `fill_items` as a slot frees
- Round 4 (up to 2): `fill_sector` x K (each knows its landmark's name; 2-3 one-word
  QUALIFIERS per sector -- legacy single-qualifier replies still map; pool lines are
  sentence-cased and direction-linted; `landmark_lines` must carry the literal `{dir}` slot or
  they drop), with `fill_scars` chained in once the last sector call has been launched

The area `prose` table is the union of the sector pools (openers->opener, details->detail,
sensory->atmosphere); the old `fill_prose_*` rounds are deleted. An unparseable sector reply
leaves a hole that `normalizeTables` synthesizes. On a slow local model the full burst runs
minutes; the flavor-wait ceiling is ~5 minutes and the teleport rides mint completion, so a slow
burst lands late rather than stranding the player. Structured output requires the engine
deployment to set `llm.structured_output: true` -- without it the provider returns free text,
every mapper falls back, and the area generates with deterministic fallback dressing.
(packages/@tapestry/oracle/scripts/oracle-tables.ts:fillTables;
packages/@tapestry/oracle/scripts/oracle-structured.ts)

### LLM-off branch

When the LLM is off, the `solo` flow presents a `scenario` choice FIRST (engine-free
`buildScenarios(SIX_AXIS_THEMES, BAKED_SET_IDS)`, golden-tested; six-axis themes offer
depth-banded scenarios using their own baked set, other baked sets offer flat scenarios, no
duplicates). Baked table sets load eagerly at module init (`data/baked/<setId>/<kind>.yaml`) and
include an authored `landmarks` deck (8 records per set, no direction talk, 3 afar variants +
a miniboss identity each) and a BANDED `mobs` deck (`mb-<band>-` ids across all four menace
bands; the apex entry doubles as the elite pool). `bakedTables`
returns per-call copies down to the entries array -- a shared table object bit once: the first
run's k=2 normalization truncated the cached landmark deck for every later run in the session.
Sector pools synthesize from the (grown, 12-per-tag) prose pools, each sector dealing 2
distinct qualifiers from a 20-word deck (2 x K never exhausts it at the K=8 cap); landmark
reference lines use the dice template deck. The stale `__solo_scenario` gate from 0.3.0
is unchanged. (packages/@tapestry/oracle/scripts/oracle-tables.ts:bakedTables;
packages/@tapestry/oracle/data/baked/)

### Solo flow inputs

The flow collects: scenario (LLM-off) or idea (LLM-on), `name`, `min_level`, `max_level`,
`size` (school/standard/epic choice -- the target_rooms band), `destination_pack`, and `seed`
(blank = random; a non-negative integer replays that exact area -- the stage-F shareable-seed
seam and the determinism-proof lever). Destination-pack resolution and `authoring.createPack`
semantics are unchanged from 0.3.x. The `solo` command registers with `roles: ["player"]` --
the engine CommandRouter treats `player`/`mob` as actor-type roles and ANY other listed role
(admin, builder) as a privilege gate the actor must hold, so the open form is exactly
`["player"]` (admins qualify: they dispatch as source "player"). SHIP DEPENDENCY: the stage-E
per-player rate limit must land before a public server carries strangers.
(packages/@tapestry/oracle/scripts/flows/solo-flow.ts;
packages/@tapestry/oracle/scripts/commands/solo.ts)

The flow holds these answers in flow scratch (`entity.scratch`) between steps, not the
entity property bag, so a completed solo run leaves no `solo_*` residue in `player.yaml`.
(packages/@tapestry/oracle/scripts/flows/solo-flow.ts)

### Run lifecycle: list and discard

`solo` is one command with subcommand-style args parsed in its handler (the engine router is
single-token). It stays registered with `roles: ["player"]`; the admin escape hatch checks
privilege inside the handler.

- `solo` - roll a new area and enter it.
- `solo list` - render the caller's owned runs: index, display name, level range, room count.
- `solo discard` - discard the run you are standing in, resolved via `ensureAreaContext` on your
  current room and intersected with your owned list.
- `solo discard <n>` - discard run #n from `solo list` (insertion order, stable).
- `solo discard <areaId>` - **admin/builder only**. Removes ANY area by full id, including
  orphans minted before this feature existed. Ordinary players are list-scoped and cannot name
  an id outside their own runs.
(packages/@tapestry/oracle/scripts/commands/solo.ts)

#### Ownership

`oracle_runs` is a registered `string` player property (`properties.yml`) holding a JSON array,
one record per run: `{ areaId, name, levelRange, roomCount, seed, packName }`. Written at the end
of `createSoloArea` once the room graph exists (so `roomCount` is the real minted count), removed
at discard. It is the sole authorization source for `solo discard <n>`.

An admin `solo discard <areaId>` can tear down an area whose owner is offline. The stale record on
that player's file is harmless and is pruned lazily the next time they run `solo list`.
(packages/@tapestry/oracle/scripts/owned-runs.ts)

#### Discard order

1. `authoring.deleteArea(areaId)` - the engine's atomic sweep (evacuate to recall, untrack
   entities, remove rooms, clear consequences, unregister from the area/oracle-table/item
   registries, delete the area directory). If it returns false, nothing further runs.
2. `clearAreaCaches(areaId)` (`area-teardown.ts`) - the pack's own in-memory stores: `AreaState`
   plus room->area and room->path maps, `RunState` cells, the minted-type set, the visited set,
   the granted-player set.
3. `removeOwnedRun(playerId, areaId)`.
(packages/@tapestry/oracle/scripts/commands/solo.ts; packages/@tapestry/oracle/scripts/area-teardown.ts)

#### What discard does NOT touch

- **Your inventory.** Item templates under the area go with the directory; items already instanced
  in a player's inventory are real entities on the player file and stay. Gear purge is stage E's
  lifecycle, not this one.
- **The destination pack.** Its `pack.yaml` scaffold, its runtime-namespace marker, and
  `server.yaml` all survive. An area is not a pack. Empty pack directories linger and are benign;
  pack-level GC belongs to the v3 one-pack-per-run lifecycle.

### Template/run split - the thread contract (hub-and-threads v1)

The player-facing surface is no longer `solo` (now admin-gated); it is a curated set of
authored threads a player pulls from a board, each run at a level they dial.

- **Bake once (authoring, LLM, slow).** `bakeTemplate` runs the expensive generation against a
  template area - geometry, prose, roster, boss, loot placement - and freezes the tables, with
  no player and no teleport. (packages/@tapestry/oracle/scripts/area-gen.ts:394)
- **Run per player (numeric, instant, no LLM).** `startRun` re-runs the same seed at the
  player's chosen level, minting a fresh per-player run area (a run slug from the template seed
  plus a player hash) that copies the template's frozen tables. Identical deterministic geometry
  and roster across players; distinct area ids, no shared lock; only mob/item numbers resolve to
  the dialed level. One shared entry-room derivation keeps the `oracle_active_run` composite and
  the minted room from drifting. (packages/@tapestry/oracle/scripts/area-gen.ts:608)
- **The level dial defaults, is explained, and warns on over-dial.** `tapestry start <id>` with
  no level defaults to the player's own combat progression level (`tapestry.progression.getLevel`,
  falling back to 1) rather than erroring, and tells the player it did so. The board listing
  explains up front that the dial sets difficulty and does not scale to the player's gear. When a
  level IS given explicitly and it outpaces the player's own level, `startRun` warns before
  starting - the run still starts either way; the warning only fires for an explicit dial, never
  for a defaulted one, since a defaulted level is by construction never above the player's own.
  (packages/@tapestry/oracle/scripts/commands/tapestry.ts;
  packages/@tapestry/oracle/scripts/area-gen.ts:608-624)
- **Refuse a nested run start.** `startRun` refuses when the caller is already standing in a run
  area (the current room would become a return-address that the prior-run teardown then deletes).
  The refusal is non-destructive; the remedy is `leave` or `recall` - the refusal message names
  both. It cannot name the specific active thread: the only handle available at refusal time is
  `oracle_active_run`'s runSlug (`oracle-run-<hex>-<hex>`), a per-player id derived independently
  of `templateId` (`oracle-week-<hex>`), and the run area carries no retrievable attribute pointing
  back to its originating templateId - so the wording stays generic ("a thread") rather than
  attempting a lookup that can never resolve. (packages/@tapestry/oracle/scripts/area-gen.ts:641)
- **Template registry.** Templates persist as one frozen oracle table on a fixed well-known
  area, each row a JSON blob with band window, draft/open state, seed, and death mode - a
  reboot-durable index. (packages/@tapestry/oracle/scripts/template-registry.ts:82;
  packages/@tapestry/oracle/scripts/template-registry.ts:89)
- **The board + the mint bench.** `tapestry` lists open threads and `tapestry start <id> [level]`
  pulls one, gated on `tapestry_unlocked`; the level is optional (defaults to the player's own
  combat level - see above). `mint` bakes a draft; `mint flip <id>` opens it.
  (packages/@tapestry/oracle/scripts/commands/tapestry.ts:55;
  packages/@tapestry/oracle/scripts/commands/mint.ts)
- **Short board handles: ordinal, prefix, and `start` is optional.** The board numbers each open
  row 1-based in listing order (`1) oracle-week-...`, `2) ...`); `resolveTemplateRef` accepts that
  ordinal, the full templateId, or any unambiguous prefix of a templateId among currently-open
  threads, and resolves all three the same way before handing off to `startRun`. A prefix that
  matches more than one open thread, or an ordinal outside the open-thread count, resolves to
  nothing (`No such thread. Use its board number or full id.`) rather than guessing. The `start`
  keyword itself is optional: `tapestry <number or id> [level]` resolves and pulls a thread exactly
  like `tapestry start <number or id> [level]` when the first token is not `list`/`start` and DOES
  resolve to an open thread - if it does not resolve, the handler falls through to the usage
  string instead of trying to start anything. Ordinals are listing-order, not stable identity -
  they shift if a thread's board position changes (a new thread opens ahead of it), so they are a
  convenience for the CURRENT listing, never a saved reference. (packages/@tapestry/oracle/scripts/commands/tapestry.ts:38-124)
- **Per-run teardown.** One active run per player: `startRun` tears down any prior run before
  minting and aborts rather than orphaning on a failed sweep. `teardownRun` fires on Unraveling
  death (`run.unraveled`) and on leave/recall (`return.used` / `player.teleported`) via one
  no-op-when-not-in-a-run helper. (packages/@tapestry/oracle/scripts/area-gen.ts:516)

### Default naming

When the player leaves BOTH the idea and the name blank, the display name is
`seededAreaName(areaSeed)` (`area-namer.ts`): a `qualifier x place` draw from two hand-authored
16-word ASCII decks, e.g. `the Ashen Hollow`. Same seed, same name, on every box, with or without
an LLM.

The namer draws from its OWN sub-stream, `splitmix64(hashCoord(areaSeed, "name"))`, never from the
area's primary `rng()`. The single documented `target_rooms` draw at the head of the area stream is
undisturbed, so geometry is unchanged for a given seed.

An explicit idea (theme) or an explicit name still wins. The theme hint keeps its `"the wilds"`
generic fallback for the LLM; only the player-visible name changed.
(packages/@tapestry/oracle/scripts/area-namer.ts; packages/@tapestry/oracle/scripts/area-gen.ts)

### Theme-x-balance separation

Theme (place words, mob names, prose) is LLM-owned dressing in the oracle tables. Balance
(level, hp formula, damage, stat modifiers) is dice-owned and comes exclusively from the master
balance table -- stage B adds `elite` and `miniboss` anchor rows beside mob/weapon/armor/boss;
six-axis adds selection/dressing/disposition, never numbers. Rarity modifies the effective
level band via `rarityModifier` before the balance lookup.

B.2 retuned the LOW-LEVEL anchors against a pinned player model (geared skill-less level 1:
~6.5 avg damage/hit, 55-60% hit rate; targets agreed with Travis 2026-07-04): trash 2d10 +
1d6 damage at L1 (3-4 rounds to kill), elite 5d10 (~2x trash, 8-10 rounds), miniboss 60 HP
(a real fight), L10 anchors rescaled proportionally with the 20/40/60 anchors untouched.
The boss curve is deliberately untouched: the swell chunk (15% of boss maxHp per countered
swell, a swell-boss template dial) is what kills a 200 HP L1 boss (~7 clean counters);
attrition never does. That reasoning holds only within a single unbroken engagement,
which is not how the fight is actually played: a geared L1 player survives roughly 22s of
boss damage while landing ~8 clean counters at the shipped rank-1 dial (12%, not the 15%
this paragraph reasons from) needs ~75s, so the fight necessarily spans several
flee-and-recover cycles. The boss therefore carries `no_regen` (2026-08-01) - without it the
~28 HP it regained during each recovery exceeded a whole engagement of auto-attack output at
the observed starter hit rate, making the fight net-negative and unwinnable at any HP total. Trash `wimpy_pct` is 0 at L1 (interpolating back to the old curve by
L10) and the hostile/wary TEMPLATES carry wimpy 0 to match -- all solo trash currently mints
at L1 and `SpawnOverride` cannot carry wimpy, so the template IS the L1 value; skittish keeps
65 because that approximation IS the timid disposition. TTK targets are pinned by golden
tests (tests/balance-curve.golden.test.mjs); frozen-area tables are untouched -- only newly
minted stats change.

LOADYAML TYPE CONTRACT (B.2 discovery): the engine's `data.loadYaml` is YamlDotNet
`Deserialize<object>` -- under the live Jint runtime EVERY scalar is a STRING and CLR-dict
key lookups are TYPE-STRICT. Two consequences, both fixed in balance-table.ts: arithmetic
must coerce (`"2" + 0` is `"20"` -- this string-concat made every live trash spawn carry 10x
the tabled hp dice from 0.3.x through 0.5.0, the real cause of the unkillable-trash playtest;
node golden tests stayed green because the js-yaml stub typed scalars), and dice-band dict
lookups must index with the ORIGINAL anchor element, never a coerced number (`damage[1]`
misses the CLR key "1"). `num()` is the single coercion point; the oracle engine-stub now
stringifies all scalars so golden tests exercise exactly the live shapes.
(packages/@tapestry/oracle/scripts/balance-table.ts;
packages/@tapestry/oracle/node_modules/@tapestry/engine/index.js)
(packages/@tapestry/oracle/scripts/balance-table.ts;
packages/@tapestry/oracle/scripts/resolver.ts)

### Mint-vs-reuse

`shouldReuse(existingCount, rng)` returns true with probability `REUSE_WEIGHT = 0.65` when
`existingCount > 0`. The per-area `_mintedMobTypes` set (now in area-context.ts) is
session-scoped -- the deliberate path-dependent channel. Unchanged in kind from 0.3.x.
(packages/@tapestry/oracle/scripts/area-context.ts:getMintedSet;
packages/@tapestry/oracle/scripts/population.ts:populateRoom)

### Boss clock - the once-per-run wandering boss

`bossClockFires(roomsSinceLastBoss, rng)` (population.ts): threshold =
`min(roomsSinceLastBoss * 0.07, 1.0)`; the counter advances on each first-visit population;
entry room is count 0 and structurally boss-free. Stage-B semantics: the FIRE is gated --
at most ONCE per run (`RunState.bossFired`), and never in a landmark room (the miniboss owns
those -- no double-boss) or an entry-adjacent room (the structurally-safe start). Landmark
minibosses are the structural fights; the clock is the one wandering pity-timer boss. A boss
and an elite MAY share a charged room (only the landmark double-boss is barred). Run-state
stays session-scoped and resets on reboot (the accepted 0.3.x posture) -- a reboot re-arms the
pity timer exactly as it reset the 0.4.0 counter.
(packages/@tapestry/oracle/scripts/population.ts:bossClockFires;
packages/@tapestry/oracle/scripts/run-state.ts)

The instant the wandering boss spawns, its room is tagged `no_wander` via the engine's
`tapestry.world.addRoomTag` write binding -- an engine-registered tag, not a pack-declared
one, so no `tags.yml` entry is needed. This closes S2-13: without the tag, a fleeing
low-HP trash mob (`CombatManager.AttemptFlee`) or a wandering mob (the existing `wander`
behavior, which already honored `no_wander`) could route into the boss's room, turning a
clean first contact into an unplanned 2v1.
(packages/@tapestry/oracle/scripts/population.ts:314-324)

### Mobs six-axis - MOB-1 menace bands + the disposition axis

The mob tables are six-axis (campaign stage B, per the 2026-06-25 v2 exploration):

- **DEGREE**: WHICH creature spawns is a banded menace roll, not a flat pick. The shared
  `_default/MOB-1.yaml` DEGREE table (1d10: skulker 1-2 / common 3-6 / hunter 7-9 / apex 10)
  eager-loads with ROOM-1/ROOM-3 into every area's six-axis set. `selectMobEntry` rolls the
  degree, bends it, resolves the band through the shipped band resolver, and weighted-picks
  within the band's id slice. Fallback ladder = back-compat by construction: no MOB-1 / no
  banded ids (every 0.4.0 frozen table) / empty band slice all fall back to the flat
  whole-table pick.
- **CONTEXT**: the room's ROOM-1 band bends the menace roll before bands are read
  (`CONTEXT_BUMP`: transit -2 / chamber 0 / charged +2 / landmark +1 / threshold +2) and
  weights the disposition draw.
- **DISPOSITION** (dice-owned, band-weighted): every trash spawn draws aggro/neutral/timid
  (`DISPOSITION_WEIGHTS`, [aggro, neutral, timid]: charged [.65,.30,.05] skews aggro, transit
  [.10,.30,.60] skews timid -- transit density is currently 0, the row exists for future
  density changes; unknown bands use chamber [.30,.45,.25]). The draw picks the spawn TEMPLATE:
  `hostile-melee` (aggro), `wary-melee` (neutral -- fights only when attacked), or
  `skittish-melee` (timid). The template's `base_disposition` field IS the engine aggro seam
  (DispositionEvaluator aggros hostile mobs on room entry + tick; ADMINS ARE EXEMPT -- the
  disposition axis is only observable on a player character). ENGINE GAPS (documented, not
  built): `SpawnOverride` carries only fromType/name/desc/maxHp/damage/items/noReroll, so a
  per-instance disposition override is impossible pack-side; and there is no flee-on-sight
  seam, so timid approximates as neutral + `wimpy_pct: 65` (never initiates, bolts early once
  hurt) + restless wander.
- **DRESSING**: per-disposition arrival lines (`stirLine`); the LLM only names and describes
  creatures (`fill_mobs` asks 2 skulkers / 3 common / 2 hunters / 1 apex with a required
  `band` enum; the mapper encodes it as the `mb-<band>-<slug>` id, invalid bands -> common).
- **SIGNATURE**: elite epithets (8-word deck, rolled once at mint, frozen into the name);
  miniboss identities frozen in the landmarks table.
- **CONSEQUENCE**: the existing death-stamp hooks (unchanged). **CASCADE**: deferred to the
  combat lane (documented, not built).

Tier balance rides new `elite` (dice hp, ~2x trash) and `miniboss` (flat hp between elite and
boss) rows in master-balance; swell DIALS are template data (`swell-elite` lightest,
`swell-miniboss` middle, `swell-boss` unchanged) because spawn overrides cannot carry
properties. (packages/@tapestry/oracle/scripts/tiers.ts;
packages/@tapestry/oracle/data/six-axis/_default/MOB-1.yaml;
packages/@tapestry/oracle/data/master-balance.yml)

**Behavior correction (0.9.1 hotfix): armor's `ac` anchor row is positive.** The engine's
`CalculateArmorClass` is additive -- a worn item's `ac[damageType]` RAISES the wearer's
effective AC, making the defender harder to hit (`totalRoll >= AC` is the hit test). Both
`mintItemInstance` and `grantStarterKit` copy the master-balance `armor.ac` roll straight into
`properties.ac` with no sign flip, so the table row must itself already be the raise amount.
0.9.0 shipped `armor.ac: [-1, -3, -5, -9, -14]` (negative, growing more negative at higher
levels), which meant every minted and starter-kit armor piece in that release LOWERED the
wearer's effective AC instead of raising it -- armor made the wearer easier to hit, the exact
inverse of the intended and engine-tested contract. Corrected to `[1, 3, 5, 9, 14]`; no other
balance figure in this release changed. (packages/@tapestry/oracle/data/master-balance.yml:35-40;
packages/@tapestry/oracle/scripts/resolver.ts:260-262;
packages/@tapestry/oracle/scripts/starter-kit.ts:124,139;
Tapestry.Engine/Combat/HitResolver.cs:CalculateArmorClass;
Tapestry.Engine.Tests/Combat/HitResolverTests.cs:CalculateArmorClass_OneEquippedPiece_RaisesAC)

### Items six-axis - ITEM-1 rarity bands + ITEM-6 context

The item tables are six-axis too (stage C, 0.6.0), the same shape as stage B's mobs six-axis:

- **DEGREE**: WHICH rarity an item rolls is a banded roll, not a flat pick off the entry's own
  static `rarity` field. The shared `_default/ITEM-1.yaml` DEGREE table (1d12: junk 1-2 /
  common 3-7 / uncommon 8-10 / rare 11 / epic 12) eager-loads alongside ROOM-1/ROOM-3/MOB-1
  into every area's six-axis set. `selectItemEntry` rolls the degree, bends it by the context
  bump, resolves the band, and weighted-picks within the entries whose `rarity` field matches
  that band's name. Fallback ladder mirrors mobs' back-compat-by-construction shape: entries
  empty -> null; no ITEM-1 table -> flat weighted pick over all entries; no entry matches the
  resolved band -> flat weighted pick (every 0.4.0/0.5.x frozen area hits this path -- the
  on-disk `items` table shape is unchanged by this slice).
- **CONTEXT**: the shared `_default/ITEM-6.yaml` table bends BOTH the rarity roll and the base
  drop chance from the same two inputs -- which killer tier made the kill (`killer_tier` rows
  trash/elite/miniboss/boss, each carrying a `bump` AND its own `drop_chance`: 0/0.35, 1/0.65,
  2/0.90, 3/1.00) and which ROOM-1 band the room reads as (`room_band` rows carry only a
  `bump`: transit -1 / chamber 0 / charged 1 / landmark 1 / threshold 2). `itemContextBump`
  sums both matching inputs before the ITEM-1 degree is resolved; `dropChanceFor`/
  `rollItemDrop` gate whether a kill drops anything at all, checked BEFORE the band roll runs
  (a separate binary gate, not a "none" band competing inside the DEGREE roll -- see Rejected).
  Unlike stage B's mob CONTEXT (`CONTEXT_BUMP`, a TS constant), ITEM-6 is TABLE DATA on
  purpose -- Travis's explicit 2026-07-06 instruction, so pending playtest feel-tuning can
  retune drop chances and bumps without a rebuild.
- **DRESSING**: the LLM only names and describes items within each rarity tier. `fill_items`
  now asks for 8 entries in a tier-shifted register (1 junk plain/disposable, 3 common, 2
  uncommon, 1 rare, 1 epic legend-shaped-but-not-yet-signature -- the actual signature name is
  rolled separately at mint, so the LLM/baked entry is just that slot's flavor before the epic
  roll overrides its name); `junk` joins `RARITY_WEIGHTS` (100, the heaviest weight) and
  `SCHEMA_ITEMS`'s rarity enum; `fallbackItems()` returns 5 entries spanning junk-epic; both
  baked decks (`test-kitchen`, `endless-underdeep`) were rewritten to full 6-entry
  junk-through-epic rosters.
- **SIGNATURE**: the epic band (the one ITEM-1 band with `fires: signature`) freezes one of 8
  fixed proper names (`ITEM_SIGNATURE_NAMES`: Gravewake/Emberfall/Duskbiter/Stormkeel/
  Ashwhisper/Nightgall/Sunderthorn/Hollowmere) over the item's normal dressing name at mint,
  mirroring stage B's elite epithets -- the frozen item id folds in the killer tier (default
  "trash" when no context is supplied) so miniboss/elite/boss/trash loot minted at the same
  room+index can never collide. The frozen NAME is the whole SIGNATURE effect this slice: the
  mint stamps NO marker property (a queryable signature flag is a future slice, see the
  reboot-safety invariant below).
- **CONSEQUENCE/CASCADE**: deferred, per the design spec's own posture, unchanged by this
  slice -- IT2 (curse/ego/attunement), IT4 (cross-area hook queue), IT5 (item sets).

**Reboot-safety invariant (required boot gate):** minted item side-cars persist under the
per-run area namespace (`<pack>-<seedhex>`), which validates STRICT on reboot -- unlike
generated ROOMS, which use the bare registered runtime namespace and validate lenient. So
every property `mintItemInstance` writes must be an ENGINE-registered property; an
unregistered flag on a minted item (an earlier `signature: true` was the witnessed case)
crashes the strict-boot reload with "unregistered property". The ship boot gates MUST include
a reboot OVER a persisted EPIC drop (the mint that carries the most properties, including the
signature path) and confirm `Pack validation complete: 0 issue(s) found`; minting an epic
without rebooting over it does not exercise this path.

(packages/@tapestry/oracle/scripts/item-tiers.ts;
packages/@tapestry/oracle/scripts/resolver.ts:mintItemInstance;
packages/@tapestry/oracle/data/six-axis/_default/ITEM-1.yaml;
packages/@tapestry/oracle/data/six-axis/_default/ITEM-6.yaml)

### Entry guide + starter provisions - PLAYTEST SCAFFOLDING

Stage C (items six-axis) and stage E (gear isolation / real onboarding design) own the final
shape; the B.2 guide replaces the stage-B SILENT auto-grant so the player SEES the handoff.

The guide (`tapestry-oracle:guide`: no_kill engine tag, friendly, stationary, generic
identity by design) spawns with the entry room at creation (`populateEntry`) and RE-ENSURES
on every arrival at the entry cell -- `ensureGuideAt` presence-checks by `template_id` before
spawning, so the creation spawn and the post-reboot respawn (spawnMob mobs are transient;
the entry's visited marker is frozen) can never double-spawn. Saying a greet/kit keyword to
it (core onSay dispatch; the mob hooks register via `mobs.registerScript` at script load)
delivers two things:

- **Kit**: one weapon + head/hands/feet armor, stats from the master balance table at the
  AREA'S MIN LEVEL (wear/wield carry no level gates). Items freeze through
  `writeItemTemplate` and deliver through `items.spawnToInventory`. Gate unchanged from
  stage B: once per player per area -- the `grants` oracle table + an in-memory mirror
  (visited-table pattern), mark-first. Kit item ids and grants rows are keyed by the player
  ENTITY id, which is per-database -- player-scoped artifacts, deliberately outside the
  same-seed byte-identity claim (which covers rooms, tables, and loot side-cars).
- **Starter abilities**: kick + bash (class-agnostic @tapestry/core skills) at novice-cap
  proficiency 25 via `tapestry.abilities.learn` -- the same engine seam core's admin-learn
  uses. Gated by ABSENCE (`abilities.getProficiency === null`), so re-asking never clobbers
  trained progress. A level-1 character gets two real combat decisions (damage spender +
  stun).
  Each ability prints a `use` line naming its syntax immediately after its flavour line, so
  a granted skill states how to spend it rather than only that it was learned.
  (packages/@tapestry/oracle/scripts/guide.ts:35-53, 95-96)

The guide always answers an ask it received. When the area context is not yet resolvable,
`deliverProvisions` routes both of its early returns through `askAgain` rather than
returning silently, so the player is told to repeat the greeting instead of reading no
response as "this NPC does not know that word".
(packages/@tapestry/oracle/scripts/guide.ts:70-93)

A hint keyword answers with the roads-lead-to-landmarks line; anything else prompts for
HELLO/HINT. The creation teleport sends a one-line pointer at the guide instead of granting.
(packages/@tapestry/oracle/scripts/guide.ts; packages/@tapestry/oracle/scripts/starter-kit.ts;
packages/@tapestry/oracle/templates/mobs/guide.yaml)

**Idempotent across a grind-tier death repop.** A player who already collected the kit/
abilities and then dies grind-tier never gets re-prompted or re-outfitted after waking at
the entry room. First mint (`startRun` -> `instantiateRunArea`) sends "The thread pulls
taut and draws you in." -- that path fires exactly once, at run creation, and a grind
repop never re-invokes it. A grind-tier death runs a completely different path: core's
`entity.vital.depleted` handler (`packages/@tapestry/core/scripts/combat/output.ts`,
the grind branch around line 319) teleports the player back to the entry room, sends the
DISTINCT wake line "You wake at the threshold." (never "The thread pulls taut..."), and
publishes `run.grind_repop`, which oracle's `population.ts` listener answers by calling
`populateEntry` directly -- never `instantiateRunArea` or `buildArea`. `populateEntry`
re-spawns the guide (`ensureGuideAt`'s template-id presence check no-ops since one is
already there) but never re-grants anything. `deliverProvisions`'s own kit/ability gates
(grant table lookup + `abilities.getProficiency` absence check) are keyed on player id,
not on any per-run or per-life state, so a repeat "hello" after death falls through to the
idle line ("You carry all I can give. Ask for a HINT if the pattern confuses you.")
exactly as a repeat "hello" would on a live character that never died.

This guarantee is proven only for the population/wake path (the wake message itself, plus
the guide's own `onSay` handler). It does NOT cover the guide's separate idle-chatter
channel, which is a distinct, NOT-yet-verified risk: `templates/mobs/guide.yaml` sets
`idle_chance: 0.3` / `idle_interval: 30` and lists the literal outfit-prompt string ("Say
HELLO when you are ready to be outfitted, or ask for a HINT.") as an `idle_command`; core's
`mob.ai.tick` handler (`packages/@tapestry/core/scripts/mobs/idle.ts`) fires that command
with NO per-player or outfitted-state gate once 30 ticks have elapsed since the guide's
last action. An already-outfitted player who lingers near the guide can still be
proactively re-sent that exact prompt text through this channel. The committed smoke
test's negative assertion (`guide-idempotency.md` step 18) runs within seconds of
respawn -- far under the 30-tick interval -- so it exercises the wake/population path only
and cannot exercise the idle-chatter risk either way. A deterministic smoke-test assertion
for the idle channel was judged impractical with the current tooling: one mob-AI tick is a
real second (10 game-loop ticks at the default 100ms `TickRateMs`), so 30 ticks alone
consumes the telnet-runner's entire 30s `Wait for ... sees` ceiling before `idle_chance`
even gets its first per-tick roll, the expected wait including that roll is closer to ~33s,
the tail is unbounded (geometric, no cap), and neither the engine nor the test harness
exposes an admin/test seam to force-advance or skip mob-AI ticks. See Task 17 (ambient
chatter variety) for related follow-up; this idle-chatter gap should be closed there or
with a purpose-built long-running test, not treated as covered by this idempotency proof.
(packages/@tapestry/oracle/scripts/guide.ts:59-98;
packages/@tapestry/oracle/scripts/area-gen.ts:702-774;
packages/@tapestry/core/scripts/combat/output.ts:304-321;
packages/@tapestry/core/scripts/mobs/idle.ts;
packages/@tapestry/oracle/templates/mobs/guide.yaml;
packages/@tapestry/oracle/tests/smoke/guide-idempotency.md)

### Item delivery - freeze + ride mob inventory

Loot now fires at ALL FOUR spawn tiers (stage C, 0.6.0) -- through 0.5.x only the trash loop
ever called `mintItemInstance`; elite/miniboss/boss dropped zero loot, a real gap rather than a
design choice (fixed because ITEM-6's killer-tier context has nothing to bend if bosses never
roll for loot in the first place). Each tier draws its own keyed rng and reads its own
ITEM-6-driven drop chance via `rollItemDrop`/`dropChanceFor`: trash keeps its existing
per-iteration draw (same stream key), now reading its threshold from ITEM-6's `trash` row
instead of the deleted `LOOT_DROP_CHANCE = 0.35` TS constant; elite reuses the shared
`spawnRng` stream; miniboss and boss each get a dedicated keyed draw
(`coordKey + ":miniboss-loot"` / `":boss-loot"`). `mintItemInstance` still freezes the rolled
item as a standalone item-template side-car and attaches it to the mob's inventory before
spawning; corpse drop via core death transfer is unchanged. All 7 armor slots have base
templates. (packages/@tapestry/oracle/scripts/population.ts;
packages/@tapestry/oracle/scripts/resolver.ts:mintItemInstance)

### Structured-output table fill

LLM table-fill output is structured JSON via per-kind STRICT json_schema constants
(`SCHEMA_PLACES/_MOBS/_BOSS/_ITEMS/_SCARS/_LANDMARKS/_SECTOR`); `oracle-structured.ts` (zero
engine imports, golden-tested) holds the JSON->entry mappers with ASCII folding, name/desc caps,
list-numbering strips, and the v3 additions: `stripDirectionTalk`, `ensureSentence`, landmark
dedupe/padding, `{dir}`-slot enforcement. Any parse failure returns []/null and the caller falls
back. (packages/@tapestry/oracle/scripts/oracle-structured.ts)

### Six-axis generator stack

Every area remains six-axis: shared `_default` MECHANICS (ROOM-1 degree bands, ROOM-3
consequence taxonomy, MOB-1 menace bands, ITEM-1 rarity bands, ITEM-6 context bumps)
eager-loaded at module init; an authored theme keeps
its full set (authored themes carry no MOB-1, so the shared one always applies); any
other area gets ROOM-2 ASSEMBLED from its frozen prose + scars tables. The `rooms` composer and
depth-biased degree remain, but v3 mints call `pureDegree` (pressure 0) directly so band,
edges, cadence, and density share one number. Consequence stamping (`mob.death` ->
boss-slain/looted) and walk-in scar lines (`room-revisit.ts`) are unchanged.
(packages/@tapestry/oracle/scripts/six-axis.ts; packages/@tapestry/oracle/scripts/room-compose.ts;
packages/@tapestry/oracle/scripts/consequence-hooks.ts)

### Consequence hooks - room-cleared exit hint

When all non-boss mobs in a room die, the `mob.death` event hook fires for each death.
The non-boss branch checks if any NPCs remain in the room via
`(tapestry as any).world.getEntitiesInRoom(roomId, "npc")` -- the engine removes the dead
mob BEFORE publishing the event, and corpses are containers (not npcs), so 0 remaining
means the room is cleared. When a room clears, the hook stamps it with the `looted`
consequence and prints the hint message: "Nothing more stirs here. If the thread feels
done, LEAVE returns you to the hub." This guides the player that they can use the LEAVE
command to return to the hub when ready.

Boss deaths (identified by template_id containing "swell-boss") stamp with `boss-slain`
instead and do not print the room-cleared message. First-visit tracking already records
when rooms are visited; the looted stamp marks consequence state for the duration of the
room's ephemeral lifespan (evicted by the engine's repop tick on reboot).
(packages/@tapestry/oracle/scripts/consequence-hooks.ts:72-80;
packages/@tapestry/oracle/tests/smoke/cleared-room-exit-hint.md)

### Pack content glob

`pack.yaml` declares `oracle: "areas/**/*-oracle-table.yaml"`; destination packs declare the
same glob. The engine boot compose must LIST the destination pack (e.g. `@scratch/oracle-run`)
in `server.yaml packs:` for its lenient manifest to load on reboot -- unlisted runtime packs
default to strict validation (see Rejected: room-property visited marker).
(packages/@tapestry/oracle/pack.yaml:22-23)

## Rejected and Reverted

- Tombstone: S2-17 "guide re-prompts an already-outfitted player after death" -- investigated
  (2026-07-27) and found ALREADY RESOLVED, not fixed by new code in this patch. The
  unconditional "Say HELLO to be outfitted for the road" message the finding worried about
  lives only in the disused `solo`/`buildArea` creation path (area-gen.ts:311); the live
  per-player run path (`tapestry start` / board -> `startRun` -> `instantiateRunArea`) never
  sent it in the first place, and a grind-tier death repop only re-invokes `populateEntry`,
  never `buildArea`. guide.ts's own `onSay` handler already gated the kit/ability grant on
  already-granted state before this task ran. Verified end to end against a live boot
  (`guide-idempotency.md`): outfit once, force death, confirm no unprompted re-outfit message
  on wake, confirm a repeat "hello" answers with the idle line, not a re-grant. No fix was
  needed or applied.

- Per-instance disposition override -- the stage-B disposition axis was first sketched as a
  spawn-override field. Rejected: the engine `SpawnOverride`/`ParseOverride`/`ApplyOverride`
  chain accepts exactly fromType/name/desc/maxHp/damage/items/noReroll; no tag, property, or
  disposition can ride a spawn. Disposition (and swell dials) are TEMPLATE data instead --
  three trash templates carry the three temperaments.
  (packages/@tapestry/oracle/scripts/tiers.ts:DISPOSITION_TEMPLATES)

- Flee-on-sight timid -- the engine has no seam for a mob that avoids players before combat
  (the Disposition enum is Neutral/Friendly/Hostile; wimpy_pct fires only in combat).
  "Timid" ships as the honest approximation: neutral + wimpy_pct 65 + restless wander.
  Building engine-side flee-on-sight is an engine-lane candidate, not a pack patch.

- `roles: ["player", "builder", "admin"]` on solo -- listing privilege roles alongside the
  actor-type role re-gates the command (CommandRouter requires one of the privilege roles when
  any is present); plain players got "Huh?". The open registration is exactly `["player"]`.

- Room-property visited marker -- the v3 first-visit tracker was first a pack-declared
  `oracle_populated` room property. Rejected: generated rooms belong to the runtime-created
  destination pack, which has no loaded manifest on reboot (and docker deployments cannot write
  the pack scaffold), so PackValidator defaults it to strict and fails the boot on the
  "unregistered" property. Replaced by the `visited` oracle table.
  (packages/@tapestry/oracle/scripts/population.ts:isPopulated)

- Single-call whole-area mint -- minting 70+ rooms inside one Jint entry exceeded the engine's
  5s TimeoutInterval (side-car writes are synchronous); the constraint interrupt surfaced as
  nonsense ReferenceErrors ("MASK is not defined") at whatever code was executing. Replaced by
  the 12-rooms-per-tick chunked mint. (packages/@tapestry/oracle/scripts/geometry-mint.ts)

- Stub exits + per-room lazy materialization -- v2's stub resolver minted neighbors on first
  traversal; stubs looked like real exits to every engine system (mobs fled into them and popped
  back) and the +1 return-exit wiring inflated exit counts. Deleted in 0.4.0: geometry is eager,
  every exit is real, `stub-resolver.ts`/`room-gen.ts`/`prose-compose.ts` retired.

- `fill_prose_openers/details/atmosphere` rounds -- superseded by the per-sector pool fills; the
  area prose table is now the union of sector pools, so assembleRoom2 keeps working with zero
  extra LLM calls. (packages/@tapestry/oracle/scripts/oracle-tables.ts:fillSectors)

- Per-room LLM calls -- replaced by the front-loaded table burst (P-E rework, pre-0.3.0).
- `prefetchNeighbors` / session prose cache -- removed in the P-E rework.
- `packs.export` / `RequireProxy` roster sharing -- removed when ESM pack modules shipped.
- `oracle-parse.ts` heuristic free-text parser -- deleted in 0.3.0 for STRICT json_schema
  structured output.

- PZL puzzle-cache loot hookup -- the stage-C roadmap row's text claimed items should hook
  into "puzzle-cache loot (PZL mid-band) ... from rooms v3." Verified against the rooms-v3
  design: PZL tables are a documented FUTURE extension in the exploration doc, never built, and
  the rooms-v3 implementation plan explicitly lists "gates/puzzles" as OUT OF SCOPE
  (docs/tapestry/superpowers/plans/2026-07-04-oracle-v3-rooms.md:19). There is no PZL table
  kind, no lock-predicate system, no `fill_puzzles` round -- nothing exists to hook into yet.
  This is a scope correction (the roadmap row overreached what rooms-v3 actually delivered),
  not design creep; PZL remains a separate, larger future slice.

- Single-roll "none band" for item drops -- folding "no drop" into the ITEM-1 DEGREE roll as a
  competing band was considered and rejected. A boss's guaranteed drop (`drop_chance: 1.00`)
  could never be expressed cleanly as a weighted band racing a "none" band inside one roll, and
  each killer tier needs its own independent drop probability. Replaced by a separate binary
  gate (`rollItemDrop`, checked BEFORE `selectItemEntry` runs) so the DEGREE roll stays purely
  about WHICH rarity, never WHETHER anything drops.
  (packages/@tapestry/oracle/scripts/item-tiers.ts)

## Change Log

- 2026-08-02 [onboarding-legibility-sweep](changes/2026-08-02-onboarding-legibility-sweep.md) - each starter ability prints a `use` line naming its syntax alongside its flavour, and the guide answers an ask it cannot yet fulfil ("The pattern is still settling") instead of returning in silence
- 2026-08-01 [armor-ac-sign-hotfix](changes/2026-08-01-armor-ac-sign-hotfix.md) - corrects a sign inversion in the just-shipped 0.9.0 `armor.ac` master-balance anchor row (`[-1,-3,-5,-9,-14]` -> `[1,3,5,9,14]`); the engine's additive AC formula meant every minted and starter-kit armor piece was lowering the wearer's effective AC instead of raising it
- 2026-07-27 [oracle-cleared-thread-exit-hint](changes/2026-07-27-oracle-cleared-thread-exit-hint.md) - when the last non-boss mob in a room dies, print the exit hint "Nothing more stirs here. If the thread feels done, LEAVE returns you to the hub."
- 2026-07-27 [gear-carries-hp](changes/2026-07-27-gear-carries-hp.md) - minted loot and starter-kit gear now push a real `maxHp` stat modifier (read off the master balance table's already-rolled `max_hp` figure) into `writeItemTemplate`'s `modifiers` array at all four loot tiers and the starter kit's weapon/armor pieces, closing A1 (gear previously rolled `max_hp` on paper but granted zero live HP); Option 2 (flat per-level HP, AC-only gear) considered and rejected in favor of wiring the existing roll through
- 2026-07-27 [level-dial-default-and-warning](changes/2026-07-27-level-dial-default-and-warning.md) - `tapestry start <id>` with no level now defaults to the player's own combat level instead of erroring, and the board listing explains the level dial does not scale to gear; `startRun` gained an `explicitLevel` parameter and warns (without blocking) when an explicit level outpaces the player's own level
- 2026-07-25 [hub-threads-oracle](changes/2026-07-25-hub-threads-oracle.md) - template/run split (bake once, re-roll per player at a dialed level), the thread-template registry, the Tapestry board + admin mint bench, level-locked loot, per-run teardown on death/leave/recall, and the nested-run-start guard
- 2026-07-22 [solo-area-lifecycle-naming](changes/2026-07-22-solo-area-lifecycle-naming.md) - `solo list` / `solo discard [n|areaId]` run lifecycle riding the engine's `authoring.deleteArea` sweep (owned-runs `oracle_runs` player property, admin escape hatch, lazy prune of stale entries, per-area cache teardown); blank runs get a deterministic seeded `qualifier x place` name from its own sub-stream instead of `"the wilds"`, geometry unchanged; engine floor raised to >=0.1.51
- 2026-07-22 [flow-scratch-migration](changes/2026-07-22-flow-scratch-migration.md) - solo wizard holds its collected inputs in entity.scratch (engine >=0.1.50) instead of the entity property bag, so a completed run leaves no solo_* residue in player.yaml
- 2026-07-06 [oracle-stage-c-items-six-axis](changes/2026-07-06-oracle-stage-c-items-six-axis.md) - items six-axis (ITEM-1 banded rarity DEGREE roll replaces the flat pick; shared ITEM-6 CONTEXT table bends both drop chance and rarity roll from killer tier + room band, kept as table data rather than a TS constant so playtest feel-tuning can retune it without a rebuild); loot now fires at all four spawn tiers (elite/miniboss/boss previously dropped zero loot); junk rarity tier added to dressing (RARITY_WEIGHTS, SCHEMA_ITEMS, fallbackItems, fill_items, both baked decks rewritten to full junk-epic rosters); epic band freezes one of 8 fixed signature names at mint; PZL puzzle-cache hookup cut (does not exist yet, out of scope per the rooms-v3 plan) and a single-roll "none band" design rejected in favor of a per-tier drop-chance gate
- 2026-07-04 [oracle-stage-b2-combat-feel](changes/2026-07-04-oracle-stage-b2-combat-feel.md) - safe entry room (ambient-zero structural guarantee, golden-tested); entry guide NPC (no_kill, reload-safe ensureGuideAt, onSay-delivered starter kit through the unchanged grants gate + kick/bash at novice cap via abilities.learn, silent auto-grant deleted); low-level balance retune against the pinned player model (trash 2d10/1d6/wimpy-0 at L1, elite 5d10, miniboss 60, L10 proportional, boss curve untouched - swell chunks are the kill mechanic), TTK targets pinned by golden tests; loadYaml string-scalar fix (live pools were 10x the table since 0.3.x - num() coercion + original-key dict lookups + string-scalar engine stub for test parity)
- 2026-07-04 [oracle-stage-b-tiers-mobs](changes/2026-07-04-oracle-stage-b-tiers-mobs.md) - threat-tier ladder (charged elites with frozen epithets, landmark minibosses with frozen identities + 0.4.0 keeper synthesis, once-per-run wandering boss with landmark/safe-start suppression); mobs six-axis (shared MOB-1 menace bands + banded mb- ids with flat-pick back-compat, dice-owned band-weighted disposition axis riding template selection, elite/miniboss balance rows, four new mob templates); ride-alongs (3 afar variants + distance-banded gate + 4-tail deck, sector qualifier decks + mint-time no-replacement name deal); solo opened to players (rate-limit ship dependency documented); starter-kit playtest scaffolding (grants table, spawnToInventory)
- 2026-07-04 [oracle-v3-rooms](changes/2026-07-04-oracle-v3-rooms.md) - rooms v3: radius envelope + target_rooms size bands, wedge-placed landmarks with bespoke prose + afar lines, Voronoi sector pools with border blends, canonical edge-hash exits with forced Bresenham roads + vertical scarcity + band modulation, eager chunked geometry mint (stubs deleted), first-visit population trigger with visited-table persistence, anti-repetition stack (variable cadence, neighbor exclusion, qualifier x place names, slot-filled landmark references), fill_landmarks + fill_sector burst rounds, seed + size flow inputs; fixes: non-greedy room-id parse (negative-x reload), baked-cache aliasing, Jint 5s-cap chunking
- 2026-06-28 [oracle-structured-six-axis-everywhere](changes/2026-06-28-oracle-structured-six-axis-everywhere.md) - structured-output table fill (parser deleted, per-kind json_schema + JSON->entry mappers); six-axis on every area (shared _default mechanics + assembled ROOM-2 dressing, composer ungated); fill_scars + always-present scars table; place-word room names; extracted buildScenarios with theme/baked dedup; playtest fixes (stale-scenario gate, weighted exit count, present-tense prompts)
- 2026-06-27 [oracle-six-axis-tables](changes/2026-06-27-oracle-six-axis-tables.md) - six-axis generator stack: 3D coords (u/d fix + depth), per-table dice-metadata band resolver, depth-biased degree, multi-table composition + depth-banded rooms, module-init six-axis cache, consequence stamping + walk-in revisit scars, LLM-off scenario picker
- 2026-06-25 [solo-oracle-v2-completion](changes/2026-06-25-solo-oracle-v2-completion.md) - item delivery (freeze + mob-inventory ride + corpse drop), LLM-off baked-set picker, hardened parse module with 11 golden tests, 3 missing armor base templates
