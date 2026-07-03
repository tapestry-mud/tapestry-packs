---
capability: cooking
last-updated: 2026-06-20
---

# Cooking

## Overview

The `@tapestry/cooking` pack implements a cook-then-eat crafting loop. Raw
ingredients are transformed into cooked food via the `cook` command, which
requires a cooking tool (`can_cook`) and, for tools that are not self-contained,
a separate heat source (`heat_source`) present in the same room. Cooked food is
eaten normally and, when the optional `@tapestry/survival` pack is loaded, grants
a well-fed buff on consumption. The pack is described in its own metadata as an
interop testbed that will eventually fold into `@tapestry/survival`.

Current version: 0.1.5. Requires `@tapestry/core ^0.1.4`; optionally integrates
with `@tapestry/survival ^0.1.1`, declared as an `optional_dependency`.
(packages/@tapestry/cooking/pack.yaml:1-20)

---

## Behavior

### cook command

- The `cook` command is registered in the `inventory` category and is available
  only to the `player` role. It accepts one required argument, `item`, resolved
  from the actor's inventory. (packages/@tapestry/cooking/scripts/commands/cook.ts:1-8)

- Before any tool search, the command verifies the target item carries both the
  `cookable` property and the `cooks_into` property. Missing either aborts with a
  message to the actor. (packages/@tapestry/cooking/scripts/commands/cook.ts:12-22)

- Tool resolution checks the actor's inventory first; if no `can_cook` item is
  found there, it scans the visible room entities for one. The first matching
  entity of type `item`, `container`, or an `item:`-prefixed type wins.
  (packages/@tapestry/cooking/scripts/commands/cook.ts:26-45)

- If no cooking tool is found in either inventory or room, the command aborts
  with "You need something to cook with." (packages/@tapestry/cooking/scripts/commands/cook.ts:47-50)

- After a tool is found, the command checks whether the tool itself carries
  `heat_source`. If it does, no further heat check is performed (the tool is
  self-contained). If it does not, the room entities are scanned for any item
  carrying `heat_source`; absence aborts with "You need a heat source nearby."
  (packages/@tapestry/cooking/scripts/commands/cook.ts:52-68)

- The raw ingredient is consumed via `tapestry.consumables.consume`. Failure
  aborts with "You can't cook that right now." On success, the item named by
  `cooks_into` is spawned directly into the actor's inventory via
  `tapestry.items.spawnToInventory`. (packages/@tapestry/cooking/scripts/commands/cook.ts:70-80)

- Feedback text is taken from the tool's `cook_text` property if present, with
  `{item}` substituted by the ingredient's name. When no `cook_text` is defined,
  a generic "You cook X into Y." message is sent. A room-scoped message "X cooks
  something." is always broadcast. (packages/@tapestry/cooking/scripts/commands/cook.ts:82-88)

- If the cooking tool carries `destroy_on_empty`, the tool itself is consumed
  after the meal is produced -- making it single-use. Tools without this property
  are left untouched and remain reusable. (packages/@tapestry/cooking/scripts/commands/cook.ts:92-94)

### Property contract

- `cookable` (bool, item): marks an item as an eligible ingredient for the cook
  command. (packages/@tapestry/cooking/properties.yml:2-5)

- `cooks_into` (string, item): the template id of the item that the ingredient
  transforms into after cooking. (packages/@tapestry/cooking/properties.yml:6-9)

- `cooked` (bool, item): marks an item as cooked food; this is what cook-buff.js
  listens for on consumption. (packages/@tapestry/cooking/properties.yml:10-13)

- `can_cook` (bool, item): marks an item as a cooking tool eligible to satisfy
  the tool-resolution step of the cook command. (packages/@tapestry/cooking/properties.yml:14-17)

- `heat_source` (bool, item): marks an item as a heat source. When this property
  is present on the cooking tool itself, the room heat-source scan is skipped.
  When absent from the tool, a separate room item carrying this property must be
  present. (packages/@tapestry/cooking/properties.yml:18-21)

- `cook_text` (string, item): optional flavor text for the cooking action; `{item}`
  is replaced with the ingredient name at runtime.
  (packages/@tapestry/cooking/properties.yml:22-25)

### Survival interop (well-fed buff)

- cook-buff.ts registers a listener on the `item.consumed` event. It ignores any
  consumption that did not use the `eat` method and ignores items that do not
  carry the `cooked` property. (packages/@tapestry/cooking/scripts/cook-buff.ts:4-7)

- The module imports survival as a namespace -- `import * as survival from
  "@tapestry/survival"`. Because `@tapestry/survival` is declared an
  `optional_dependency`, the resolver yields an empty module when survival is absent
  at boot, so cooking still loads.
  (packages/@tapestry/cooking/scripts/cook-buff.ts:2)

- When a cooked item is eaten and the imported survival module exposes
  `applyWellFedBuff`, that function is called with the actor's entity id and a
  duration value of `3000`. The call is guarded by a runtime capability check --
  `if (typeof survival.applyWellFedBuff === 'function')` -- which replaces the former
  `tapestry.packs.has` probe, so the survival pack remains a soft optional dependency
  and cooking functions fully without it.
  (packages/@tapestry/cooking/scripts/cook-buff.ts:11-13)

- UNVERIFIED: A git commit (`ffdc6dd`) is titled "don't apply well-fed buff when
  actor is already full," but the current cook-buff.js contains no such guard.
  That check may have been reverted, superseded on the survival side, or removed
  in a subsequent cleanup. The current file applies the buff unconditionally when
  conditions are met.

### Bundled items

- `tapestry-cooking:raw-meat` -- a slab of raw meat. Tagged `consumable`. Carries
  `cookable: true`, `cooks_into: tapestry-cooking:cooked-steak`,
  `consume_method: cook`, `sustenance_value: 0` (inedible raw), `charges: 1`,
  `destroy_on_empty: true`. (packages/@tapestry/cooking/items/raw-meat.yaml:1-18)

- `tapestry-cooking:cooked-steak` -- a juicy cooked steak. Tagged `consumable`.
  Carries `cooked: true`, `consume_method: eat`, `sustenance_value: 40`,
  `charges: 1`, `destroy_on_empty: true`. Eating this triggers the well-fed buff
  path in cook-buff.js. (packages/@tapestry/cooking/items/cooked-steak.yaml:1-17)

- `tapestry-cooking:pan` -- a cast iron pan. Carries `can_cook: true` and
  `cook_text: "You place {item} on the pan and cook it."` It does NOT carry
  `heat_source`, so a separate heat source must be present in the room when using
  the pan. (packages/@tapestry/cooking/items/pan.yaml:1-12)

- `tapestry-cooking:campfire` -- a crackling campfire. Tagged `fixture`
  (cannot be picked up). Carries `heat_source: true` only -- it is not a cooking
  tool by itself and will not satisfy the `can_cook` check.
  (packages/@tapestry/cooking/items/campfire.yaml:1-13)

- `tapestry-cooking:campfire-portable` (displayed as "a bundle of tinder") --
  carries both `can_cook: true` and `heat_source: true`, making it a self-
  contained cooking tool that needs no separate heat source. Also carries
  `charges: 1`, `destroy_on_empty: true`, making it single-use: the cook command
  will consume it after producing the cooked result.
  (packages/@tapestry/cooking/items/campfire-portable.yaml:1-18)

- `tapestry-cooking:microwave` -- a humming microwave. Tagged `fixture`.
  Carries both `can_cook: true` and `heat_source: true` -- self-contained, no
  separate heat source required. Its `cook_text` is "You put {item} in the
  microwave... DING!" (packages/@tapestry/cooking/items/microwave.yaml:1-14)

---

## Rejected and Reverted

- None on record.

---

## Change Log

- 2026-06-20 [pack-script-esm](changes/2026-06-20-pack-script-esm.md)
