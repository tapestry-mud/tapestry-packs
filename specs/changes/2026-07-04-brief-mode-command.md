---
release: 0.1.24
specs: [core-navigation.md]
---

# Brief Mode Command

## Why

Classic ROM brief mode, scoped to what the oracle v3 playtest needs (tapestry#42,
accessibility). Screen-reader users (and sighted skimmers) walking a generated area
re-read the same description bodies on every backtrack; the v3 room model was designed
so names + exits + landmark references alone carry navigation, and brief mode is the
switch that proves it. Explicit `look` must always render full - brief is about
movement noise, not information loss.

## What

- **`brief` command** (core-navigation.md): role player, category accessibility. No
  argument toggles; `brief on` / `brief off` set explicitly; anything else prints usage.
  Persists as the core-declared `brief` bool player property (declared in
  properties.yml the same commit that reads it, per the vocabulary convention).
  (packages/@tapestry/core/scripts/commands/brief.ts;
  packages/@tapestry/core/properties.yml; packages/@tapestry/core/help/brief.yaml)

- **Movement honors the pref** (core-navigation.md): the six directional handlers read
  `brief` and pass it as the optional second argument to
  `tapestry.world.sendRoomDescription` (engine >=0.1.48), which suppresses only the
  description body - name, `[Exits: ...]`, and entity lines are byte-identical. OFF
  (default) keeps the one-arg-equivalent full render, byte-identical for existing
  players. `look` is untouched (always full). v1 scope is directional movement only;
  enter/recall/leave/group-follow renders stay full and are the obvious extension seam.
  (packages/@tapestry/core/scripts/commands/movement.ts:50-54)

- **Seams for the accessibility trio, built NONE of them**: battle mode (tapestry#43)
  would be a sibling bool pref suppressing round text where core combat output renders
  (packages/@tapestry/core/scripts/combat/output.ts); damage-verb decorator stripping
  (tapestry#44) lives in the same file's verb tables; the blind-mode visibility flag
  (tapestry#45) is a three-state property surfaced by the `who` renderer.

- Engine floor documented as `engine: ">=0.1.48"` in pack.yaml (documentation-only key).
  On an older engine the two-arg call still renders full (extra delegate args are
  ignored - pinned engine-side); brief simply has no effect.
  (packages/@tapestry/core/pack.yaml)
