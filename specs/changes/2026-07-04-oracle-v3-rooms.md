---
release: 0.4.0
specs: [oracle.md]
---

# Oracle V3 Rooms

## Why

The 0.3.0 generator rolled every room as an independent dice roll - no spatial memory, no
structure. The observed damage (dfca3eaf sample, 2026-06-28): fragment repetition certain by
room 4-5 (8-line pools picked IID), a fixed three-sentence cadence that read as repeated even
with different words, duplicate room names within six rooms, exit inflation (the stub resolver
wired a return exit ON TOP of the rolled set, effective mean ~3.3), and stub exits that looked
real to every engine system (mobs fled into them and popped back). Per-room lazy
materialization existed only to hide per-room LLM latency that the P-E rework had already
deleted - a vestige. The 2026-07-02 v3 exploration doc designed the successor: give the map
structure (envelope, landmarks, sectors, edge-hash exits), spend the expensive LLM words where
players linger (bespoke landmarks), and mint geometry eagerly so stubs cease to exist. This is
campaign stage A of the solo roguelite ladder.

## What

An area now generates from five frozen inputs - seed, level range, theme, target_rooms
(school/standard/epic size band, new flow question), and an LLM-filled landmarks table -
with everything else a pure function of (seed, coord) plus frozen tables:

- **Radius envelope**: edge probability full inside 0.7R, linear to 0 at R; the map closes
  itself near target size with a dead-endier rim. Entry at center.
- **Landmarks**: K = max(2, min(8, round(target/12))), wedge-placed at mid-radius with seeded
  jitter. Each freezes a name, a bespoke 2-3 sentence room description, and a seen-from-afar
  line (new fill_landmarks round; direction talk linted out sentence-by-sentence; names dedupe
  like a no-replacement deck).
- **Voronoi sectors**: per-sector prose pools + one-word qualifiers (new fill_sector rounds,
  one per landmark; baked path synthesizes pools from the grown prose tables). Border rooms
  blend the two nearest sectors.
- **Edge-hash exits**: existence is an edge property - hash(seed, canonicalEdgeKey) < p - so
  reciprocity is free and the return-exit inflation class is deleted. Forced Bresenham roads
  entry->landmarks + landmark ring guarantee reachability; vertical edges run at 0.15x;
  degree bands modulate p so thin rooms stay thin and landmark-band rooms may hub.
- **Geometry eager, spawns lazy**: the whole reachable graph mints at creation (12 rooms per
  engine tick - the 5s Jint entry cap with synchronous side-car writes forbids one big call),
  with real two-way exits; stub-resolver.ts, room-gen.ts, and prose-compose.ts retired. Spawns
  move to a player.direction.moved first-visit subscriber with a persisted `visited` oracle
  table (a room property failed reboot validation - runtime destination packs default strict).
  First-visit spawns announce with a "stirs at your arrival" line (the event is post-render).
- **Anti-repetition stack**: variable cadence by band, zero-state neighbor exclusion (adjacent
  repeat rate 12.5% -> <3%), qualifier x place-word names with Upper/Lower z-overrides,
  slot-filled {dir} landmark reference lines (the LLM never writes a direction), pools grown
  to the 30-40 floor.
- **Seed input**: optional explicit seed in the solo flow - shareable runs and the
  determinism-proof lever (same seed + same walk = byte-identical area dirs, proven).

Fixes surfaced by the danger-zone proofs: non-greedy room-id parsing (the greedy regex broke
post-reboot context for every negative-x room, latent since 0.3.x), copy-on-write table
normalization (the first run's k=2 landmark view truncated the module-level baked cache for
the whole session), and the chunked mint. WHAT spawns is unchanged from 0.3.x (same rng
stream keys, mint-vs-reuse, loot draw, boss clock slope) - only WHERE moved. Engine floor
0.1.47.
