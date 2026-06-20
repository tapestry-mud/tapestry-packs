---
capability: builder
last-updated: 2026-06-20
---

# builder

## Overview

The builder pack (`@tapestry/builder`) provides in-MUD Online Level Creation (OLC)
commands that let admin and builder roles author areas, rooms, and exits without
leaving the game. It wraps the always-on engine world-authoring API
(`tapestry.authoring.*`) and depends on `@tapestry/core` (^0.1.5) for `link`/`unlink`.
Current version: 0.2.7; requires engine >=0.1.36.

The pack registers five commands (`create`, `dig`, `edit`, `rooms`, `map`), four help
topics, and two editor flows (`builder_edit_room`, `builder_edit_area`). It exports
`buildEntityEditFlow` so the per-entity editor files can import the factory.

## Behavior

### Roles and access

- The `create`, `dig`, `edit`, and `rooms` commands require the `admin` or `builder`
  role. (packages/@tapestry/builder/scripts/commands/create.ts:104)
- The `map` command is in category `info` and requires only the `player` role; it is
  the player-facing map view with no room ids.
  (packages/@tapestry/builder/scripts/commands/map.ts:8)

### `create` command

- `create` is a single-token dispatch verb. It looks up the first argument (the noun)
  in a builder-local `creators` registry and hands off to its handler. The greedy tail
  is split on whitespace and passed as `args`.
  (packages/@tapestry/builder/scripts/commands/create.ts:99)
- `create area <namespace:area-id>` creates a new area and an anchor room whose id
  is `<namespace>:<area-id>-anchor`, then teleports the builder into that anchor room.
  (packages/@tapestry/builder/scripts/commands/create.ts:32)
- The namespace component before the colon is used as the room id prefix; the bare
  area-id after the colon is stored as the area identifier.
  (packages/@tapestry/builder/scripts/commands/create.ts:39)
- If an area with that id already exists (either pack-owned or authored), `create area`
  refuses and names the source pack if known.
  (packages/@tapestry/builder/scripts/commands/create.ts:43)
- `create room <key>` creates a blank room in the active area (inferred from the
  builder's current room) with no auto-exit and no teleport. The new id is
  `<namespace>:<key>` derived from the current room's namespace.
  (packages/@tapestry/builder/scripts/commands/create.ts:72)
- The creator registry is extensible via `registerCreator(noun, handler)`.
  (packages/@tapestry/builder/scripts/commands/create.ts:26)

### `dig` command

- `dig <dir>` carves a new room in the given direction, wires two-way exits, and
  moves the builder into the new room. Direction abbreviations (n/s/e/w/u/d) are
  accepted. (packages/@tapestry/builder/scripts/commands/dig.ts:10)
- The new room id is auto-minted as `<namespace>:<area>-<n>`, bumping `n` past any
  existing collision. (packages/@tapestry/builder/scripts/commands/dig.ts:129)
- `dig <dir> <target>` connects a two-way exit to an EXISTING authored room in the
  same area without creating a new room or moving the builder. `<target>` can be a
  bare short id (namespace inferred from the current room) or a fully-qualified id.
  (packages/@tapestry/builder/scripts/commands/dig.ts:65)
- `dig <dir>` from a pack-owned room (detected via `source_pack`) routes into a
  carve-into-pack branch instead of refusing: the existing-exit guard confirms the
  chosen direction is free, the authored room is minted, and the boundary
  link is wired as a connection record via `tapestry.connections.create` (not a
  side-car exit), so it never mutates pack data and survives restarts and pack updates.
  The builder is teleported in and gets an ASCII boundary message ("belongs to a pack
  - your way back is a connection..."). Digging onward from the new authored room is
  the unchanged authored-to-authored inline-exit path.
  (packages/@tapestry/builder/scripts/commands/dig.ts)
- Existing-exit guard: before creating anything, `dig <dir>` calls
  `getExitTarget(fromId, dir)`. If the direction is already occupied on the from-room
  - whether by an inline side-car exit or a connection-backed (linked) exit, and
  whether the from-room is pack-owned or authored - it refuses with "already taken"
  and changes nothing (no new room, no repointed exit, no one-way orphan).
  (packages/@tapestry/builder/scripts/commands/dig.ts)
- `dig <dir> <target>` (connect) still refuses when the from-room is pack-owned - the
  CONNECT path cannot safely use side-car exits against a pack room.
  (packages/@tapestry/builder/scripts/commands/dig.ts)
- The connect path enforces ordered guards before writing anything: no self-link,
  target must exist, target must be authored (not pack-owned), target must be in the
  same area, and the chosen direction must be free on the source room.
  (packages/@tapestry/builder/scripts/commands/dig.ts:65)
- If the target's reverse slot is already occupied, `dig` wires only the forward exit
  and notifies the builder rather than refusing.
  (packages/@tapestry/builder/scripts/commands/dig.ts:111)
- `dig` is intra-area (both CARVE and CONNECT). To attach an authored area to the
  wider world, builders use `link` (provided by `@tapestry/core`).
  (packages/@tapestry/builder/scripts/commands/dig.ts)

### `edit` command

- `edit` is a single-token dispatch verb with the same registry shape as `create`.
  Adding an editable noun is a one-liner via `registerEditor(noun, handler)`.
  (packages/@tapestry/builder/scripts/commands/edit.ts:15)
- `edit room` triggers the flow `builder_edit_room` on the current builder entity.
  (packages/@tapestry/builder/scripts/commands/edit.ts:25)
- `edit area [<id>]` accepts a bare or namespaced area id; strips the namespace to
  the bare id. With no argument it falls back to the area containing the current room.
  Before triggering the flow it stashes the resolved id in the entity property
  `__edit_area`. (packages/@tapestry/builder/scripts/commands/edit.ts:33)
- `edit area` refuses if no area definition exists and tells the builder to use
  `create area` first. (packages/@tapestry/builder/scripts/commands/edit.ts:49)

### Edit flow factory (`buildEntityEditFlow`)

- The factory lives in `edit-flow-factory.ts` and is a native module export, so that
  `editors-area.ts` and `editors-room.ts` import it with a relative import
  (`import { buildEntityEditFlow } from "./edit-flow-factory.js"`). ESM resolves the
  module graph, so the factory module is guaranteed to evaluate before the editors that
  import it -- the old alphabetical-filename load-order dependency is gone.
  (packages/@tapestry/builder/scripts/flows/edit-flow-factory.ts:22;
  packages/@tapestry/builder/scripts/flows/editors-area.ts:7;
  packages/@tapestry/builder/scripts/flows/editors-room.ts:7)
- Each editor flow built by the factory has three steps: (1) a `choice` step to pick
  a field (showing the truncated current value in brackets), (2) a `choice` step for
  known-value fields (skipped for text fields), and (3) a `text` step for free-text
  fields (skipped for choice fields).
  (packages/@tapestry/builder/scripts/flows/edit-flow-factory.ts:22)
- All flows set `cancellable: true`; typing `cancel` at any step exits without saving.
  (packages/@tapestry/builder/scripts/flows/edit-flow-factory.ts:37)
- When an AI provider is enabled and the selected field supports recommendations, step 3
  advertises `'~' for suggestions`; otherwise only `'cancel' to abort` is shown.
  (packages/@tapestry/builder/scripts/flows/edit-flow-factory.ts:104)
- The factory attaches `flow.recommend_context` from `spec.recommendContext` when
  provided. (packages/@tapestry/builder/scripts/flows/edit-flow-factory.ts:117-118)

### Area editor (`builder_edit_area`)

- The area editor schema always includes: Name, Short, Description, Theme (LLM brief,
  never shown to players), Lore, Level range (min,max), Reset interval (seconds), and
  WIP (work-in-progress toggle shown as a choice of `true`/`false`).
  (packages/@tapestry/builder/scripts/flows/editors-area.ts:25)
- Dynamic fields from the engine's property registry scoped to `area` are appended;
  enum-valued and bool-typed properties become choice fields, others become text fields.
  (packages/@tapestry/builder/scripts/flows/editors-area.ts:39)
- The area under edit is resolved from `__edit_area` entity property, falling back to
  the current room's area. (packages/@tapestry/builder/scripts/flows/editors-area.ts:14)
- AI suggestions (`~`) are enabled on Short, Description, Theme, and Lore.
  Recommendation context is `'area'`.
  (packages/@tapestry/builder/scripts/flows/editors-area.ts:94)
- `level_range` and `reset_interval`, plus any unknown property key, are dispatched to
  `tapestry.authoring.setAreaAttribute`; recognized keys (name, short, description,
  theme, lore) each have a dedicated authoring call.
  (packages/@tapestry/builder/scripts/flows/editors-area.ts:60)

### Room editor (`builder_edit_room`)

- The room editor schema always includes Room name and Room description. Dynamic
  properties from the engine registry scoped to `room` are appended; biome tags
  (tag kind `'biome'`, appliesTo `'room'`) become a single Biome choice field.
  (packages/@tapestry/builder/scripts/flows/editors-room.ts:12)
- Renaming a room may re-key its id to a slug of the new name; the editor reports the
  new id when this occurs and surfaces any warnings from the engine.
  (packages/@tapestry/builder/scripts/flows/editors-room.ts:58)
- Biome is a single-valued tag group: setting a new biome clears the old one via
  `tapestry.authoring.clearRoomAttribute` before calling `setRoomAttribute`.
  (packages/@tapestry/builder/scripts/flows/editors-room.ts:85)
- AI suggestions (`~`) are offered only on the `name` and `description` fields;
  the room editor does not set `recommendContext`.
  (packages/@tapestry/builder/scripts/flows/editors-room.ts:108)

### `rooms` command

- `rooms` (no argument) renders an id-annotated ASCII map of the current area using
  scope `'area'`, label `'id'`, and the shared terrain legend.
  (packages/@tapestry/builder/scripts/commands/rooms.ts:54)
- `rooms <area>` lists every room in the named area (bare or namespaced id) with id,
  name, and provenance tag, and reminds the builder to use `teleport <id>` to jump.
  (packages/@tapestry/builder/scripts/commands/rooms.ts:20)
- `rooms` refuses with a message if called from a pack-owned room (detected via
  `source_pack`) and recommends it is used inside authored areas.
  (packages/@tapestry/builder/scripts/commands/rooms.ts:44)

### `map` command

- `map` renders the player's surroundings within 3 hops using scope `'radius'`,
  radius `3`, label `'dot'` (no room ids), and the shared terrain legend. It is the
  player-facing counterpart to `rooms`.
  (packages/@tapestry/builder/scripts/commands/map.ts:25)
- The terrain glyph legend (`forest: f`, `stone: s`, `water: w`, `sand: .`,
  `road: =`, `grass: "`, `mountain: A`) is duplicated in both `map.js` and `rooms.js`
  with a comment noting they must be kept in sync.
  (packages/@tapestry/builder/scripts/commands/map.ts:30)

### AI suggestions (`~`)

- Typing `~` (optionally followed by a hint) at a text prompt in `edit room` or
  `edit area` requests AI-generated suggestions, delivered as a numbered list. The
  builder picks a number to accept or types their own value.
  (packages/@tapestry/builder/help/suggestions.yaml:1)
- Suggestions require an AI provider to be configured server-side; if not enabled the
  editor silently omits the `~` hint and only accepts plain input.
  (packages/@tapestry/builder/scripts/flows/edit-flow-factory.ts:106)
- An area's Theme field is the durable mechanism for shaping suggestions for all rooms
  in that area. (packages/@tapestry/builder/help/suggestions.yaml:1)

### Dependencies and seam with core

- The pack declares `dependencies: { "@tapestry/core": "^0.1.5" }` and a load order
  of 10. (packages/@tapestry/builder/pack.yaml:13)
- `link`/`unlink` (provided by core) are the intended path for attaching an authored
  area to the broader pack-based world; `dig` is explicitly scoped to intra-area wiring
  only. (packages/@tapestry/builder/scripts/commands/dig.ts:49)

## Rejected and Reverted

- None on record.

## Change Log

- 2026-06-20 [pack-script-esm](changes/2026-06-20-pack-script-esm.md)
- 2026-06-17 [dig-existing-exit-guard](changes/2026-06-17-dig-existing-exit-guard.md)
- 2026-06-15 [extend-baked-in-areas](changes/2026-06-15-extend-baked-in-areas.md)
