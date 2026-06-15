---
capability: survival
last-updated: 2026-06-13
---

# Capability Spec: survival

Pack: `@tapestry/survival` v0.1.3
Engine requirement: `>=0.1.25`
Depends on: `@tapestry/core ^0.1.4`

## Overview

The survival pack implements a sustenance (hunger) system for players. It maintains a
per-player `sustenance` integer property ranging from 0 to 100, drains it on a fixed
schedule, notifies players when they cross tier boundaries, and scales HP/resource
regeneration by hunger tier. It exposes two player commands -- `eat` and `drink` -- and
publishes an interop API for peer packs such as cooking.

## Behavior

### Property

- The `sustenance` property is declared for the `player` entity type with type `int`,
  range 0-100. Default for an unset value is treated as 100 throughout the pack.
  (packages/@tapestry/survival/properties.yml:1-7)

### Seeding

- On `character.created` and `player.login`, sustenance is seeded to 100 if and only if
  the property is currently `null` or `undefined`. This is idempotent and does not
  overwrite a loaded or famished value.
  (packages/@tapestry/survival/scripts/sustenance.js:141-149)

### Drain schedule

- `tapestry.schedule.everyForEach` runs once every 300 ticks against all entities of
  type `player`. Each tick decrements sustenance by 1, floored at 0.
  (packages/@tapestry/survival/scripts/sustenance.js:3-4; packages/@tapestry/survival/scripts/sustenance.js:29-44)
- If the player currently has the `well-fed` effect active, the drain amount is reduced
  to 0 for that tick (hunger is frozen, not merely slowed).
  (packages/@tapestry/survival/scripts/sustenance.js:35-37)

### Tiers

- Three tiers are defined by two thresholds: `TIER_FULL_MIN = 67`, `TIER_HUNGRY_MIN = 34`.
  (packages/@tapestry/survival/scripts/sustenance.js:6-7)
  - `full`: sustenance >= 67 (packages/@tapestry/survival/scripts/sustenance.js:21-22)
  - `hungry`: sustenance >= 34 and < 67 (packages/@tapestry/survival/scripts/sustenance.js:23)
  - `famished`: sustenance < 34 (packages/@tapestry/survival/scripts/sustenance.js:24)
- Tier thresholds are exported as a read-only namespace (`tiers`) via `tapestry.packs.export`
  so peer packs can read them without hardcoding.
  (packages/@tapestry/survival/scripts/sustenance.js:11-14)

### Tier-change notifications

- When the tier changes across a drain tick, a `sustenance.changed` event is published
  and the player receives a prose message:
  - Entering `hungry`: "You are getting hungry."
  - Entering `famished`: "You are famished! Your body aches with hunger."
  - Returning to `full`: "You feel satisfied."
  (packages/@tapestry/survival/scripts/sustenance.js:47-78)

### Reminders

- While a player remains in `hungry` or `famished` without changing tier, a periodic
  reminder fires every 3000 ticks (REMINDER_INTERVAL / DRAIN_CADENCE = 3000 / 300 = 10
  drain ticks). The counter resets on tier change.
  (packages/@tapestry/survival/scripts/sustenance.js:5; packages/@tapestry/survival/scripts/sustenance.js:55-65)
  - `hungry` reminder: "You are hungry."
  - `famished` reminder: "You are famished and can barely think straight."
  (packages/@tapestry/survival/scripts/sustenance.js:80-88)

### Regen scaling

- The pack subscribes to `entity.regen` and multiplies the regen amount by a tier
  multiplier before it is applied:
  - `full`: 1.0 (no change)
  - `hungry`: 0.5 (half regen)
  - `famished`: 0.0 (regen cancelled via `evt.cancel()`)
  (packages/@tapestry/survival/scripts/sustenance.js:126-135)

### eat command

- `eat` resolves its argument from the actor's inventory (`type: 'inventory'`).
  (packages/@tapestry/survival/scripts/commands/eat.js:7-8)
- The item must have `consume_method` property equal to `'eat'`. If the item instead
  has the `cookable` property, the rejection message suggests cooking it first.
  (packages/@tapestry/survival/scripts/commands/eat.js:12-19)
- A successful eat calls `tapestry.consumables.consume`, which triggers the
  `item.consumed` event. The survival pack's `item.consumed` subscriber reads
  `sustenanceValue` from the event data and adds it to `sustenance`, capped at 100.
  The value is cast with `Number()` to avoid CLR string-concatenation.
  (packages/@tapestry/survival/scripts/commands/eat.js:22-31; packages/@tapestry/survival/scripts/sustenance.js:97-105)
- Nutrition is gated on `consumeMethod === 'eat'` in the `item.consumed` subscriber,
  so items consumed by other methods (e.g., `cook`) do not feed the player.
  (packages/@tapestry/survival/scripts/sustenance.js:97)
- If the consumable reports `reason: 'nocharges'`, the player is told "It's empty."
  (packages/@tapestry/survival/scripts/commands/eat.js:27-28)

### instant effects on item.consumed

- If `effectId` is `'core:instant-heal'` and `effectData.heal_hp > 0`, the player
  receives that many HP and a message showing the amount.
  (packages/@tapestry/survival/scripts/sustenance.js:107-113)
- If `effectId` is `'core:instant-restore'` and `effectData.heal_resource > 0`, the
  player's resource vital is increased by that amount.
  (packages/@tapestry/survival/scripts/sustenance.js:115-123)
- These effects are not gated on `consumeMethod`; they apply regardless of how the item
  is consumed.
  (packages/@tapestry/survival/scripts/sustenance.js:107; packages/@tapestry/survival/scripts/sustenance.js:115)

### drink command

- `drink` resolves its argument as `type: 'findable'`, meaning it can match items in
  inventory or in the room.
  (packages/@tapestry/survival/scripts/commands/drink.js:7-8)
- If the target item carries the `drinkable` tag, drinking adds 15 to sustenance (capped
  at 100) directly without going through `tapestry.consumables`. The zero-check comment
  explicitly notes that `0` means famished, not unset, to avoid the `|| 100` footgun.
  (packages/@tapestry/survival/scripts/commands/drink.js:12-19)
- If the item does not have the `drinkable` tag, it must have `consume_method === 'drink'`
  to proceed. Items with any other consume_method or neither are rejected with "You can't
  drink from that."
  (packages/@tapestry/survival/scripts/commands/drink.js:22-26)
- A chargeable drink container that has `charges <= 0` is rejected with "It's empty."
  before `tapestry.consumables.consume` is called.
  (packages/@tapestry/survival/scripts/commands/drink.js:28-32)
- A successful drink goes through `tapestry.consumables.consume`; any sustenance or
  effect application follows from whatever the consumable definition declares.
  (packages/@tapestry/survival/scripts/commands/drink.js:34-43)

### Interop exports

- `getHungerTier(entityId)` -- query export returning `'full'`, `'hungry'`, or `'famished'`.
  (packages/@tapestry/survival/scripts/sustenance.js:156-163)
- `applyWellFedBuff(entityId, durationTicks)` -- command export that applies a `well-fed`
  effect for the given number of ticks with flags `['well_fed']` and sends the player
  "You feel well-fed and satisfied." Callers must declare a dependency on
  `@tapestry/survival`.
  (packages/@tapestry/survival/scripts/sustenance.js:165-180)

## Rejected and Reverted

- None on record.

## Change Log

- None on record.
