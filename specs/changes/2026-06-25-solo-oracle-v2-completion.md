---
release: 0.2.0
specs: [oracle.md]
---

# Solo Oracle V2 Completion

## Why

Three playtest gaps surfaced during the v2 ship: minted loot was discarded instead of
reaching the player's hands, the LLM-off flow asked a "Describe the idea" prompt it then
ignored, and the LLM table-fill parser leaked preambles and numbering straight into mob
names and prose. This closes all three.

## What

- **Item delivery (B0-B2):** Three missing armor base templates added (wrist/waist/neck) for
  full 1-60 slot coverage. `mintItemInstance` now calls `authoring.writeItemTemplate` to
  freeze the rolled item as a standalone `items/<id>.yaml` side-car and live-register it.
  The frozen id is pushed into `override.items` before `spawnMob`, so the item rides the
  mob's inventory and drops to the room corpse on death via core `death.ts` `transferAll`.

- **LLM-off baked-set picker (C1-C2):** When the LLM is off, `solo` skips the ignored
  `idea` step and shows a `choice` step listing `BAKED_SET_IDS` (data-driven). The chosen
  set id threads to `createSoloArea`. LLM-on path unchanged.

- **Hardened parse module (D1-D2):** Parse helpers extracted into `oracle-parse.ts` (zero
  engine imports, Node-importable). Hardened against preamble lines, phrasing-agnostic
  lead-ins, interjections, numbering prefixes, over-long fragments, and junk rows. 11
  golden tests via `node --test`. `oracle-tables.ts` re-exports helpers for backward compat.
