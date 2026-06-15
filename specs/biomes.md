---
capability: biomes
last-updated: 2026-06-13
---

# biomes

## Overview

`@tapestry/biomes` is a thin, data-only module pack that owns the shared biome vocabulary for
Tapestry worlds. It registers room tags that content packs and world packs target for
distribution, behavior gating, and flavor. The pack is intentionally lean -- a tag is added
only when active content uses it.

## Behavior

- The pack is declared as `type: module` with `load_order: 5`, placing it early in the load
  sequence so downstream packs (tinkers at 15, world packs at 10) can depend on its tags.
  (packages/@tapestry/biomes/pack.yaml:3; packages/@tapestry/biomes/pack.yaml:16)

- Five biome tags are registered, all scoped to `applies_to: [room]` and carrying
  `kind: biome`:
  - `forest` -- forested terrain, woodland vegetation and gatherable wood.
  - `cave` -- subterranean rock, caverns and tunnels, mineral and stone deposits.
  - `desert` -- arid sand and stone, sparse vegetation.
  - `wetland` -- waterlogged ground, marsh, bog, and fen.
  - `mountain` -- high rocky elevation, thin air and alpine terrain.
  (packages/@tapestry/biomes/tags.yml:1-21)

- Rooms apply a biome via the `biome:` field rather than a tag list. The engine loader maps
  that field to the corresponding tag at load time. (packages/@tapestry/tinkers/areas/tinkers-test/rooms/test-forest.yaml:7;
  packages/@tapestry/example-pack/areas/starter-town/rooms/deep-woods.yaml:8)

- The `forest` tag is the only biome tag currently consumed by content packs. Tinkers uses
  `tag: forest` as a `spawn_on` filter to scatter wood-chunk and schematic items into forest
  rooms. (packages/@tapestry/tinkers/items/wood-chunk.yaml:12;
  packages/@tapestry/tinkers/items/campfire-schematic.yaml:22;
  packages/@tapestry/tinkers/items/woodworking-schematic.yaml:22)

- The pack has no area definitions, rooms, items, or scripts of its own -- the content paths
  declared in `pack.yaml` are glob patterns that resolve to empty sets. The pack ships only
  `tags.yml` and `pack.yaml`. (packages/@tapestry/biomes/pack.yaml:18-22)

- The pack requires `engine: ">=0.1.7"`, which is when the `kind` field on tags, the `biome:`
  room loader, and room accessors landed. (packages/@tapestry/biomes/pack.yaml:11)

- The pack depends on `@tapestry/core: "^0.1.4"` and enables `validation: strict`.
  (packages/@tapestry/biomes/pack.yaml:13-14)

- Two packs declare `@tapestry/biomes` as a dependency: `@tapestry/tinkers` (caret range
  `^0.1.1`) and `@tapestry/example-pack` (exact pin `0.1.1`).
  (packages/@tapestry/tinkers/pack.yaml:15; packages/@tapestry/example-pack/pack.yaml:12)

## Rejected and Reverted

- `forest_room` tag -- originally placed in `@tapestry/core/tags.yml` as a temporary stopgap
  so cross-pack distribution could resolve before the biomes pack existed. Removed from core
  at commit b7a790d when `@tapestry/biomes` was created to own biome vocabulary as a discrete
  layer. (packages/@tapestry/biomes/tags.yml; packages/@tapestry/biomes/pack.yaml)

- `forest_room` tag name -- renamed to `forest` (dropping the `_room` suffix) and given
  `kind: biome` at commit 49be816. Rooms that previously used `tag: forest_room` were
  migrated to `biome: forest` at the same time.
  (packages/@tapestry/biomes/tags.yml:2-5)

## Change Log

- None on record.
