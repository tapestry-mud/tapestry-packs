---
release: 0.6.0
specs: [oracle.md]
---

# Oracle Stage C - items six-axis

## Why

Item tables were the one axis of the solo generator still on a flat weighted pick: rarity came
straight off the entry's own static `rarity` field, with no room-context or killer-tier signal
feeding it -- the same shape mobs had before stage B's menace bands. Worse, only the trash spawn
loop ever called `mintItemInstance`: elite, miniboss, and boss kills dropped zero loot. That
was a real gap, not a design choice -- without a fix, a context table that says "a boss kill
should bump the rarity roll" has nothing to bend, because bosses never rolled for loot in the
first place.

Verify-on-pickup also found the roadmap row's ask overreached what actually exists: the row's
text wanted items to hook into "puzzle-cache loot (PZL mid-band) ... from rooms v3," but no PZL
table kind, lock-predicate system, or `fill_puzzles` round was ever built -- the rooms-v3
implementation plan explicitly scoped "gates/puzzles" OUT. That hookup is cut from this slice
as a scope correction, not a design re-litigation; the core ITEM-1/ITEM-6 design is intact.

Travis's explicit instruction for this slice: every tunable (drop chances, context bumps) must
live in table data, not a TS constant -- deliberately different from stage B, which hardcoded
its mob context bump and disposition weights (`CONTEXT_BUMP`/`DISPOSITION_WEIGHTS`) in code.
Items ship this way from day one so the pending B.2-style playtest feel-tuning pass can retune
drop rates and bumps without a rebuild.

## What

- **ITEM-1 DEGREE table** (`data/six-axis/_default/ITEM-1.yaml`, shared `_default` mechanic,
  eager-loaded alongside ROOM-1/ROOM-3/MOB-1): 1d12 banded rarity roll, bands
  junk(1-2)/common(3-7)/uncommon(8-10)/rare(11)/epic(12). The epic band carries
  `fires: signature`.

- **ITEM-6 CONTEXT table** (`data/six-axis/_default/ITEM-6.yaml`, same eager-load list):
  `killer_tier` rows (trash/elite/miniboss/boss) each carry both a `bump` (0/1/2/3) and a
  `drop_chance` (0.35/0.65/0.90/1.00); `room_band` rows (transit/chamber/charged/landmark/
  threshold) carry only a `bump` (-1/0/1/1/2). Table data throughout, per the instruction above
  -- the deliberate contrast with stage B's hardcoded mob-context constants.

- **`item-tiers.ts`** (new pure, engine-stub-safe, node-testable module -- same posture as
  `tiers.ts`): `dropChanceFor`/`rollItemDrop` (the per-tier drop gate, checked BEFORE any band
  roll), `itemContextBump` (sums the killer-tier and room-band bumps), `selectItemEntry` (rolls
  the ITEM-1 degree bent by that bump, resolves the band, weighted-picks within entries whose
  `rarity` matches; falls back to a flat pick when there is no ITEM-1 table or no entry in the
  resolved band -- back-compat by construction for every 0.4.0/0.5.x frozen area),
  `ITEM_SIGNATURE_NAMES` (8 fixed names: Gravewake/Emberfall/Duskbiter/Stormkeel/Ashwhisper/
  Nightgall/Sunderthorn/Hollowmere), `pickSignatureName`, `isSignatureBand`.

- **`resolver.ts` `mintItemInstance`** rewritten for six-axis: takes optional trailing
  `item1`/`item6`/`ctx` params, rolls the ITEM-1 band (bent by ITEM-6 context) instead of a
  flat pick, and freezes one of the 8 signature names over the item's normal dressing name when
  the epic (signature-firing) band hits. The frozen item id now folds in the killer tier
  (default "trash" when no context is supplied) so miniboss/elite/boss/trash loot minted at the
  same room+index can never collide.

- **Minted items carry only engine-registered properties (reboot-safety).** SIGNATURE is a
  frozen NAME only; the mint stamps NO marker property. Minted item side-cars persist under the
  per-run area namespace (`<pack>-<seedhex>`), which validates STRICT on reboot -- generated
  ROOMS use the bare registered runtime namespace and validate lenient, but minted items do
  not. An unregistered flag on a minted item crashes the strict-boot reload; caught at ship when
  a reboot OVER a persisted epic threw "unregistered property 'signature'", fixed by dropping
  the dead `properties.signature = true` write (the frozen name is unchanged). New required boot
  gate: reboot over a persisted epic drop and confirm `0 issue(s) found`. Filed as a follow-up
  (latent, out of scope for this pack-only slice): minted items sit outside the
  runtime-namespace lenient net that rooms get, so any future pack-semantic minted-item property
  would need engine registration or an item-namespace realignment.

- **`population.ts` loot draw at all four spawn tiers** -- the headline functional fix. Trash
  keeps its existing per-iteration draw (same stream key), now reading its threshold from
  ITEM-6's `trash` row instead of the deleted `LOOT_DROP_CHANCE = 0.35` TS constant. Elite
  reuses the shared `spawnRng` stream. Miniboss and boss each get a dedicated keyed rng draw
  (`coordKey + ":miniboss-loot"` / `":boss-loot"`). Previously only the trash loop dropped
  anything; verified live at the Task 8 boot gates (elite/miniboss/boss all now drop, trash
  rate unchanged).

- **Dressing layer** (`oracle-structured.ts`, `oracle-tables.ts`, `data/prompts.yml`): `junk`
  added to `RARITY_WEIGHTS` (100, the heaviest weight) and `SCHEMA_ITEMS`'s rarity enum;
  `fallbackItems()` now returns 5 entries spanning junk-epic; `fill_items` asks for 8 items in
  a tier-shifted register (1 junk plain/disposable, 3 common, 2 uncommon, 1 rare, 1 epic
  legend-shaped-but-not-yet-signature -- the LLM/baked entry is just that band's flavor before
  the epic roll overrides its name with a rolled signature).

- **Baked decks rewritten** (`data/baked/test-kitchen/items.yaml`,
  `data/baked/endless-underdeep/items.yaml`): both now full 6-entry junk-through-epic rosters.

- **Cut, not built: PZL puzzle-cache loot hookup.** Verified against the rooms-v3 plan
  (`docs/tapestry/superpowers/plans/2026-07-04-oracle-v3-rooms.md:19`, "gates/puzzles" listed
  explicitly out of scope) that no PZL table kind, lock-predicate system, or `fill_puzzles`
  round exists. Nothing to hook into; a real PZL slice is separate, larger future work.

- **Rejected: a single-roll "none band"** folding "no drop" into the ITEM-1 DEGREE roll as a
  competing band. A boss's guaranteed drop (`drop_chance: 1.00`) can't be expressed cleanly as
  a weighted band racing a "none" band inside one roll, and each killer tier needs its own
  independent drop probability. Shipped instead as a separate binary gate
  (`rollItemDrop`/`dropChanceFor`, checked before `selectItemEntry` runs) so the DEGREE roll
  stays purely about WHICH rarity, never WHETHER anything drops.

- Still deferred, unchanged from the original design spec's own posture: IT2 (curse/ego/
  attunement), IT4 (cross-area hook queue), IT5 (item sets).
