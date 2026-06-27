---
release: 0.2.0
specs: [oracle.md]
---

# Oracle Six Axis Tables

## Why

The flat oracle resolved each domain table as one weighted pick - samey rooms with no
sense of depth or memory. The six-axis model makes richness combinatorial: every domain
table resolves through six axes (degree, dressing, consequence, cascade, signature,
context) together, so one deep table beats a hundred flat ones. Rooms run first, because
they are the spine of "solo an area into existence" - and that is where the magic lands:
rooms that read as banded by descent depth, and that remember what happened to them.

## What

- **3D coordinate model** (`coords.ts`): `x,y,z` with up/down offsets. Fixes the
  up/down-exit bug (the old 2D convention never emitted u/d offsets, so a `down` never
  minted a distinct lower room) and supplies `descentDepth` as the rooms degree input.
  The room-id scheme is now `slug-x_y_z` (a clean break - generating an area requires a
  fresh re-seed, no 2D back-compat).

- **Six-axis schema + band resolver** (`six-axis.ts`): one table per YAML file, six axes
  as top-level keys, the die declared as `dice:` metadata. `parseSixAxisTable` normalizes
  (pure, golden-tested); `diceSpan`/`resolveBands` read and roll the declared die so dice
  are data, never hardcoded in the resolver.

- **Depth-biased degree** (`degree.ts`): the rooms adapter rolls a degree BIASED upward by
  descent depth over the die span (deeper re-weights the distribution up), reserving the
  top value so the threshold/boss band stays a rare tail gated by the boss clock, never
  reachable from depth alone. Same-depth rooms still vary.

- **Multi-table composition + banded rooms** (`room-compose.ts`, `room-gen.ts`): a generic
  `composeAxes` core plus a registered `rooms` composer maps the resolved band to spawn
  density and banded prose (room name `<Band> - <Biome>`, ROOM-2 dressing). Non-themed
  areas fall back to the legacy flat path unchanged.

- **Module-init six-axis cache** (`six-axis.ts` `SIX_AXIS_CACHE`): the tables are eager-
  loaded and cached at module init, mirroring the baked-table loader, because
  `data.loadYaml` resolves against the active pack dir which at runtime is the last-loaded
  (destination) pack - a lazy runtime load would resolve to the wrong directory and find
  nothing (every room then fell back to flat). This is the load-bearing fix that makes the
  six-axis output actually reach the player.

- **Room consequences + revisit** (`consequence-hooks.ts`, `room-revisit.ts`): gameplay
  events stamp consequences via the engine `tapestry.consequence.*` overlay routed by the
  ROOM-3 lifespan tag (last npc cleared -> `looted` ephemeral; boss death -> `boss-slain`
  persistent). On walk-in a `player.direction.moved` subscriber appends the room's
  `state_overrides` scar fragment, so cleared / boss-slain rooms read their history.

- **LLM-off scenario picker** (`solo-flow.ts`): with the LLM off the flow presents a
  scenario picker first (each six-axis theme + each baked set), then the name - the idea
  prompt is LLM-only. The picked scenario sets both the theme and the roster, so the
  six-axis path is reachable without typing a magic keyword.

Requires engine `>=0.1.42` (the consequence overlay + `tapestry.consequence` binding).
