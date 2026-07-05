---
release: 0.5.1
specs: [oracle.md]
---

# Oracle Stage B2 - low-level combat feel

## Why

Travis's first stage-B prod playtest with a brand-new level-1 character
(2026-07-04) surfaced a broken first five minutes: the entry room landed the
player next to two aggro mobs, a single trash mob (diagnosed as 6d10, avg 33
HP, vs a 1d12 starter weapon) survived three heal-and-flee cycles, the silent
starter kit auto-grant meant the player never saw the handoff, and no
abilities meant no combat decisions. Diagnosis and every numeric target were
agreed with Travis in-session; this is the B.2 hotfix stage between B and C.

Implementation surfaced the deeper truth behind the unkillable trash: live
pools were not even the tabled 33 -- they were ~10x the table. The engine's
`data.loadYaml` (YamlDotNet `Deserialize<object>`) returns every scalar as a
STRING under Jint, and `interpolateNumeric` string-concatenated at the
anchors (`"6" + 0` = `"60"` -> 60d10, avg 330). Node golden tests never saw
it because the js-yaml engine stub typed scalars as numbers. Latent since
0.3.x; observable on any live trash kill.

## What

- **Safe entry room (structural guarantee)**: the entry cell spawns ZERO
  ambient mobs, ever - `tiers.ambientDensity` zeroes the trash budget at
  `ENTRY_PATH`, the same posture as the structurally boss-free entry. NPCs
  stay allowed (the guide lives there); the guide rides the separate NPC
  spawn path, so the two rules cannot collide. Golden-tested per band.

- **Guide NPC at entry**: `tapestry-oracle:guide` (no_kill, friendly,
  stationary, generic identity - stage E owns the real onboarding design)
  spawns with the entry room and re-ensures (presence-checked by template_id,
  never a double-spawn) on every arrival at the entry cell, because spawnMob
  mobs are transient across reboots while the entry's visited marker is
  frozen. Saying hello delivers the starter kit through the EXISTING
  once-per-player grants-table gate - the stage-B silent auto-grant at
  creation and on first move is deleted - and grants two class-agnostic core
  combat abilities (kick + bash) at novice-cap proficiency 25 via
  `tapestry.abilities.learn`, gated by absence (`getProficiency === null`),
  so trained progress is never clobbered. A hint keyword answers with the
  roads-lead-to-landmarks line.

- **Low-level balance retune** (master-balance.yml, data only; pinned player
  model = geared skill-less level 1, ~6.5 avg damage, 55-60% hit rate):
  trash `hp_count` L1 6 -> 2 (2d10, avg 11 = 3-4 rounds) and L10 14 -> 5
  (proportional; 20/40/60 anchors untouched); trash L1 damage 1d8 -> 1d6;
  elite `hp_count` L1 12 -> 5, L10 28 -> 10 (~2x trash, 8-10 rounds);
  miniboss hp L1 90 -> 60, L10 320 -> 210 (a real fight, ~16 rounds
  skill-less); boss curve untouched - sanity-checked that the swell chunk
  (15% of boss maxHp per countered swell) kills a 200 HP L1 boss in ~7 clean
  counters while attrition alone would take 51+ rounds; trash `wimpy_pct`
  L1 20 -> 0 interpolating back to the old curve by L10, with the
  hostile/wary template wimpy set to 0 to match (all solo trash mints at L1
  and SpawnOverride cannot carry wimpy; skittish keeps 65 - that IS the
  timid disposition). TTK targets are pinned by golden tests; frozen-area
  tables are untouched - only newly minted stats change.

- **loadYaml string-scalar fix** (the bug that made the retune real):
  balance-table.ts now coerces all yaml arithmetic through a single `num()`
  point, and dice-band dict lookups index with the ORIGINAL anchor element --
  Jint's CLR-dict wrapper is key-type-strict, so a coerced `damage[1]` misses
  the string key "1" (that miss threw inside populateRoom's catch and
  silently emptied every room on the first fixed build). The oracle
  engine-stub (node_modules/@tapestry/engine) now stringifies every scalar so
  golden tests run against exactly the live shapes. Proof: live-inspected
  trash pools dropped from 101/101 to single digits; a 3-round and a 5-round
  trash kill on a fresh level-1 character in the LLM-off gate run.
  ENGINE-LANE CANDIDATE (documented, not patched): DataModule could
  deserialize typed scalars so every pack does not have to coerce.

- Companions in the same train: engine 0.1.49 rekeys the damage-verb ladder
  (absolute-damage progression channel), core 0.1.25 adds the target
  condition line on band change (relative tactical channel).
