---
capability: oracle
last-updated: 2026-07-04
---

# oracle

## Overview

`@tapestry/oracle` is the solo-RPG area generator for Tapestry. It rolls a coherent area from
frozen tables inside a radius envelope with landmarks, Voronoi sector prose, and edge-hash exits;
mints the WHOLE room graph (real two-way exits, zero stubs) at creation; and populates each room
with spawns on first player arrival through a THREAT-TIER LADDER: ambient trash with a dice-owned
disposition mix, a swell-capable elite in every charged-band room, one named miniboss AT each
landmark, and a single once-per-run wandering boss on the pity clock. The LLM fills tables once
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
| `items` | entries with rarity + item kind | loot source via `mintItemInstance` |
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

1. **Miniboss** -- a landmark room spawns its frozen identity (`boss-<i>` landmarks row; a
   0.4.0-era table synthesizes "the keeper of the <landmark>" via `defaultMinibossFor`) on the
   `swell-miniboss` template. Exactly one per landmark -- EXCEPT a landmark that is
   entry-adjacent (possible on school maps), where the structurally-safe start wins over
   exactly-K and the miniboss is skipped (documented exception: that run has K-1).
2. **Elite** -- a charged-band room converts its first density slot into a swell-capable elite:
   apex-forced banded selection, a SIGNATURE epithet rolled once and frozen into the name
   ("the dire tandoor beast"), elite balance row, `swell-elite` template. Never at entry or
   entry-adjacent rooms.
3. **Trash** -- the 0.3.x ambient loop (same stream key, mint-vs-reuse set, unconditional 0.35
   loot draw, level-1 flat band) plus two new unconditional per-iteration draws: banded type
   selection through MOB-1, and a dice-owned band-weighted DISPOSITION draw that picks the
   spawn template (see the disposition axis section).
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

### Theme-x-balance separation

Theme (place words, mob names, prose) is LLM-owned dressing in the oracle tables. Balance
(level, hp formula, damage, stat modifiers) is dice-owned and comes exclusively from the master
balance table -- stage B adds `elite` and `miniboss` anchor rows beside mob/weapon/armor/boss;
six-axis adds selection/dressing/disposition, never numbers. Rarity modifies the effective
level band via `rarityModifier` before the balance lookup.
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

### Starter kit - PLAYTEST SCAFFOLDING

Stage C (items six-axis) and stage E (gear isolation / onboarding NPC) own the real design;
this is a stopgap so a brand-new character can fight the tier ladder. On a player's first
entry to a solo area (creator: at the creation teleport, which fires no direction event;
anyone else: on their first move inside, BEFORE the revisit gate) they receive one weapon +
head/hands/feet armor, stats from the master balance table at the AREA'S MIN LEVEL (wear/wield
carry no level gates -- a level-1 character always equips it). Items freeze through
`writeItemTemplate` and deliver through `items.spawnToInventory` (the core-loaditem / tinkers
seam). Gate: once per player per area -- the `grants` oracle table + an in-memory mirror
(visited-table pattern), mark-first. Kit item ids and the grants rows are keyed by the player
ENTITY id, which is per-database -- they are player-scoped artifacts, deliberately outside the
same-seed byte-identity claim (which covers rooms, tables, and loot side-cars).
(packages/@tapestry/oracle/scripts/starter-kit.ts)

### Item delivery - freeze + ride mob inventory

Unchanged from 0.3.x: the unconditional loot threshold draw (0.35) per spawn iteration;
`mintItemInstance` freezes the rolled item as a standalone item-template side-car and attaches it
to the mob's inventory before spawning; corpse drop via core death transfer. All 7 armor slots
have base templates. (packages/@tapestry/oracle/scripts/resolver.ts:mintItemInstance)

### Structured-output table fill

LLM table-fill output is structured JSON via per-kind STRICT json_schema constants
(`SCHEMA_PLACES/_MOBS/_BOSS/_ITEMS/_SCARS/_LANDMARKS/_SECTOR`); `oracle-structured.ts` (zero
engine imports, golden-tested) holds the JSON->entry mappers with ASCII folding, name/desc caps,
list-numbering strips, and the v3 additions: `stripDirectionTalk`, `ensureSentence`, landmark
dedupe/padding, `{dir}`-slot enforcement. Any parse failure returns []/null and the caller falls
back. (packages/@tapestry/oracle/scripts/oracle-structured.ts)

### Six-axis generator stack

Every area remains six-axis: shared `_default` MECHANICS (ROOM-1 degree bands, ROOM-3
consequence taxonomy, MOB-1 menace bands) eager-loaded at module init; an authored theme keeps
its full set (authored themes carry no MOB-1, so the shared one always applies); any
other area gets ROOM-2 ASSEMBLED from its frozen prose + scars tables. The `rooms` composer and
depth-biased degree remain, but v3 mints call `pureDegree` (pressure 0) directly so band,
edges, cadence, and density share one number. Consequence stamping (`mob.death` ->
boss-slain/looted) and walk-in scar lines (`room-revisit.ts`) are unchanged.
(packages/@tapestry/oracle/scripts/six-axis.ts; packages/@tapestry/oracle/scripts/room-compose.ts;
packages/@tapestry/oracle/scripts/consequence-hooks.ts)

### Pack content glob

`pack.yaml` declares `oracle: "areas/**/*-oracle-table.yaml"`; destination packs declare the
same glob. The engine boot compose must LIST the destination pack (e.g. `@scratch/oracle-run`)
in `server.yaml packs:` for its lenient manifest to load on reboot -- unlisted runtime packs
default to strict validation (see Rejected: room-property visited marker).
(packages/@tapestry/oracle/pack.yaml:22-23)

## Rejected and Reverted

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

## Change Log

- 2026-07-04 [oracle-stage-b-tiers-mobs](changes/2026-07-04-oracle-stage-b-tiers-mobs.md) - threat-tier ladder (charged elites with frozen epithets, landmark minibosses with frozen identities + 0.4.0 keeper synthesis, once-per-run wandering boss with landmark/safe-start suppression); mobs six-axis (shared MOB-1 menace bands + banded mb- ids with flat-pick back-compat, dice-owned band-weighted disposition axis riding template selection, elite/miniboss balance rows, four new mob templates); ride-alongs (3 afar variants + distance-banded gate + 4-tail deck, sector qualifier decks + mint-time no-replacement name deal); solo opened to players (rate-limit ship dependency documented); starter-kit playtest scaffolding (grants table, spawnToInventory)
- 2026-07-04 [oracle-v3-rooms](changes/2026-07-04-oracle-v3-rooms.md) - rooms v3: radius envelope + target_rooms size bands, wedge-placed landmarks with bespoke prose + afar lines, Voronoi sector pools with border blends, canonical edge-hash exits with forced Bresenham roads + vertical scarcity + band modulation, eager chunked geometry mint (stubs deleted), first-visit population trigger with visited-table persistence, anti-repetition stack (variable cadence, neighbor exclusion, qualifier x place names, slot-filled landmark references), fill_landmarks + fill_sector burst rounds, seed + size flow inputs; fixes: non-greedy room-id parse (negative-x reload), baked-cache aliasing, Jint 5s-cap chunking
- 2026-06-28 [oracle-structured-six-axis-everywhere](changes/2026-06-28-oracle-structured-six-axis-everywhere.md) - structured-output table fill (parser deleted, per-kind json_schema + JSON->entry mappers); six-axis on every area (shared _default mechanics + assembled ROOM-2 dressing, composer ungated); fill_scars + always-present scars table; place-word room names; extracted buildScenarios with theme/baked dedup; playtest fixes (stale-scenario gate, weighted exit count, present-tense prompts)
- 2026-06-27 [oracle-six-axis-tables](changes/2026-06-27-oracle-six-axis-tables.md) - six-axis generator stack: 3D coords (u/d fix + depth), per-table dice-metadata band resolver, depth-biased degree, multi-table composition + depth-banded rooms, module-init six-axis cache, consequence stamping + walk-in revisit scars, LLM-off scenario picker
- 2026-06-25 [solo-oracle-v2-completion](changes/2026-06-25-solo-oracle-v2-completion.md) - item delivery (freeze + mob-inventory ride + corpse drop), LLM-off baked-set picker, hardened parse module with 11 golden tests, 3 missing armor base templates
