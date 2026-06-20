---
release: 0.1.20
specs: [survival.md, cooking.md, tinkers.md, builder.md, core-groups.md, core-progression.md]
---

# Pack Script ES Modules

## Why

Every pack script ran inside one shared script realm at global scope. Each file's
top-level `function` and `var` declarations landed in a single namespace shared by
every pack, so the last-loaded definition of a bare helper silently won. The seal
made duplicate registrations (commands, abilities, hooks) loud, but bare helpers
bypassed it entirely: two packs each declaring a top-level `padRight` would clobber
one another, and a fix to one pack could break another with no error at boot.

Code sharing between and within packs was layered on top of that shared realm with a
bespoke interop API - `tapestry.packs.export` / `require` / `call` / `has` plus a
late-bound require proxy. It needed manual edge bookkeeping, leaned on alphabetical
file load order in places, and read nothing like the `import` / `export` every
JavaScript developer already knows.

## What

- All seven JavaScript packs are now native ES modules. Sources are authored in
  TypeScript under `scripts/**/*.ts`, compiled to ESM under `dist/scripts/**/*.js`;
  each pack's `pack.yaml` declares `content.scripts_format: esm` and points
  `content.scripts` at the compiled `dist/scripts/**/*.js`. Every script gets module
  scope: a top-level helper is module-private and can no longer collide with another
  pack's. (`@tapestry/biomes` is YAML-only and did not migrate.)
- The engine API is consumed as a module import - `import * as tapestry from
  "@tapestry/engine"` at the top of each file - rather than a shared global object.
  Every existing `tapestry.X.Y(...)` call site reads unchanged.
- Cross-pack code sharing is now a native `import` over a declared dependency edge.
  The `tapestry.packs.export` / `require` / `call` / `has` interop and its require
  proxy are gone; the resolver rejects an undeclared cross-pack import at load. The
  `tapestry.packs` namespace keeps only introspection (listing, dependency reads).
- Data shared across the pack boundary is frozen at the export site (an `export const`
  is a mutable live binding under ESM, so a shared data table is wrapped in
  `Object.freeze`).
- Per-pack mechanism changes:
  - `@tapestry/survival` (0.1.6): `tiers` is a frozen native export, and
    `getHungerTier` / `applyWellFedBuff` are native exports (were `packs.export`). A new
    `scripts/index.ts` is the entry module a cross-pack import resolves to, re-exporting
    the public surface.
  - `@tapestry/cooking` (0.1.5): consumes survival via a namespace import plus a runtime
    capability guard - `import * as survival from "@tapestry/survival"; if (typeof
    survival.applyWellFedBuff === "function") { ... }` - replacing the `packs.has` probe.
    `@tapestry/survival` is declared an `optional_dependency`; when it is absent at boot
    the resolver yields an empty module, so cooking still loads and functions without it.
  - `@tapestry/tinkers` (0.1.6): `addRecipe` / `findRecipe` / `displayName` are native
    exports, with a new `scripts/index.ts` entry. `craft` and `recipes` reach the recipe
    table through a relative import (`import { ... } from "../recipes-table.js"`) instead
    of a self-referential `packs.require`.
  - `@tapestry/builder` (0.2.7): `buildEntityEditFlow` is a native export; the editor
    files import the factory via a relative import (`./edit-flow-factory.js`). ESM
    guarantees the factory module evaluates first, so the old alphabetical-load-order
    dependency is gone.
  - `@tapestry/core` (0.1.20): `getSameRoomGroupMembers` is exported from
    `commands/groups.ts` and imported by `progression/progression.ts`, replacing the
    implicit shared-realm global it used to call.
- Companion versions in this release: `@tapestry/core` 0.1.20, `@tapestry/survival`
  0.1.6, `@tapestry/cooking` 0.1.5, `@tapestry/tinkers` 0.1.6, `@tapestry/builder`
  0.2.7, `@tapestry/viewer` 0.1.3, `@tapestry/example-pack` 0.1.11.
