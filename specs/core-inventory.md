# core-inventory

Item manipulation, equipping, and loot protection provided by `@tapestry/core`.

## Overview

The inventory capability covers every command that moves items between the world and
actor possession, equips or unequips gear, consumes or activates items, and controls
access to loot on player corpses. All commands live in
`packages/@tapestry/core/scripts/commands/` and loot access control lives in
`packages/@tapestry/core/scripts/containers/loot-protection.js`.

## Behavior

### get / take

- Registered with alias `take`; available to roles `player` and `mob`.
  (packages/@tapestry/core/scripts/commands/get.js:2-6)
- With no container argument and a literal `all` or `all.<keyword>` token, picks up
  every matching item from the room via `tapestry.inventory.getAll`.
  (packages/@tapestry/core/scripts/commands/get.js:50-61)
- Items tagged `no_get` in the world entity are blocked: the actor receives "You can't
  pick that up."  (packages/@tapestry/core/scripts/commands/get.js:68-71)
- When a carry-weight or capacity limit is exceeded, `tapestry.inventory.pickUp` returns
  falsy and the actor receives "You can't carry that."
  (packages/@tapestry/core/scripts/commands/get.js:73-79)
- With a `from`/`in` container argument and the keyword `all`, transfers every item in
  that container via `tapestry.inventory.getAllFromContainer`; a `denied` result yields
  "You can't take items from that."  (packages/@tapestry/core/scripts/commands/get.js:15-34)
- Single-item get from a container uses `tapestry.inventory.getFromContainer`; a `denied`
  result produces the same "You can't take items from that." message.
  (packages/@tapestry/core/scripts/commands/get.js:36-47)

### drop

- Available to roles `player` and `mob`; item arg is typed `inventory` with `bulk: true`.
  (packages/@tapestry/core/scripts/commands/drop.js:1-8)
- Bulk resolution (e.g. `drop all`) iterates the resolved array, calling
  `tapestry.inventory.drop` per item and echoing each name individually.
  (packages/@tapestry/core/scripts/commands/drop.js:12-22)
- Single drop calls `tapestry.inventory.drop` with the item keyword and echoes to actor
  and room.  (packages/@tapestry/core/scripts/commands/drop.js:25-29)

### give

- Transfers a single carried item to any entity (`player` or `npc`) present in the room.
  (packages/@tapestry/core/scripts/commands/give.js:1-9)
- Publishes `entity.item.received` with item id, template id, giver id, and giver name
  so subscribers can react to receiving items.
  (packages/@tapestry/core/scripts/commands/give.js:20-26)
- When the target is an NPC, invokes the `onGive` mob hook on its template, passing
  actor and item context.  (packages/@tapestry/core/scripts/commands/give.js:28-36)

### put

- Available to roles `player` and `mob`; requires a carried item and an in-room container.
  (packages/@tapestry/core/scripts/commands/put.js:1-10)
- Containers cannot nest: placing a container inside another container returns reason
  `is_container` and the message "You can't put containers in containers."
  (packages/@tapestry/core/scripts/commands/put.js:50-51)
- Weight capacity is enforced: reason `too_heavy` yields "That would be too heavy for
  <container>."  (packages/@tapestry/core/scripts/commands/put.js:61-62)
- Volume capacity is enforced: reason `full` yields "<container> is full."
  (packages/@tapestry/core/scripts/commands/put.js:56-57)
- Bulk mode (`put all [container]`) transfers all carried items and reports per-item
  feedback; if the container fills mid-transfer `stopReason` is `full` or `too_heavy`
  and the actor is told "<container> is full."
  (packages/@tapestry/core/scripts/commands/put.js:15-38)

### wear

- Available to role `player` only; bulk-capable (e.g. `wear all`).
  (packages/@tapestry/core/scripts/commands/wear.js:1-8)
- Slot is read from `tapestry.inventory.getItemDetails`; items without a `slot` property
  are rejected with "You can't wear that."
  (packages/@tapestry/core/scripts/commands/wear.js:63-66)
- `tapestry.equipment.equip` handles slot assignment; if the slot already held an item,
  `result.displaced` is set and the displaced item's name is echoed before the new item.
  (packages/@tapestry/core/scripts/commands/wear.js:69-74)
- Bulk wear pre-computes which slots are already full (by comparing occupied vs total
  slot instances) and silently skips items whose slot base is exhausted; reports "Nothing
  you're carrying can be worn." if nothing succeeded.
  (packages/@tapestry/core/scripts/commands/wear.js:17-59)
- Slot keys that include a colon (e.g. `finger:1`) are reduced to their base name for
  fullness tracking so multi-slot types are handled correctly.
  (packages/@tapestry/core/scripts/commands/wear.js:24)

### wield

- Available to role `player` only; calls `tapestry.equipment.equip` with the hard-coded
  slot name `'wield'`.  (packages/@tapestry/core/scripts/commands/wield.js:11)
- Displaced weapon is announced before the new one when a weapon is already wielded.
  (packages/@tapestry/core/scripts/commands/wield.js:13-14)
- No `bulk` support; takes exactly one item argument.
  (packages/@tapestry/core/scripts/commands/wield.js:7)

### remove

- Available to role `player` only; accepts a keyword or `all`.
  (packages/@tapestry/core/scripts/commands/remove.js:1-8)
- `remove all` calls `tapestry.equipment.unequipAll` and echoes each removed item name;
  "You aren't wearing anything." if nothing was equipped.
  (packages/@tapestry/core/scripts/commands/remove.js:12-23)
- For a named keyword, tries `tapestry.equipment.unequipByKeyword` first (matches item
  name), then falls back to `tapestry.equipment.unequip` (matches slot name directly).
  (packages/@tapestry/core/scripts/commands/remove.js:25-37)

### fill

- Available to role `player` only; requires a carried item and a room-side source object.
  (packages/@tapestry/core/scripts/commands/fill.js:1-10)
- Three failure reasons are surfaced: `not_fillable` ("You can't fill that."),
  `mixed_liquids` ("You can't mix liquids."), and `source_empty` ("<source> has dried up.").
  (packages/@tapestry/core/scripts/commands/fill.js:23-31)

### quaff

- Available to role `player` only; validates the item's `consume_method` property equals
  `'quaff'` before delegating to `tapestry.consumables.consume`.
  (packages/@tapestry/core/scripts/commands/quaff.js:12-14)
- Non-potion items (wrong `consume_method`) are rejected with "You can't quaff that."
  (packages/@tapestry/core/scripts/commands/quaff.js:13-14)

### recite

- Registered under category `social`; available to role `player`.
  (packages/@tapestry/core/scripts/commands/recite.js:3-5)
- Validates `consume_method === 'recite'` before consuming; optionally accepts a target
  entity and adjusts echo accordingly.
  (packages/@tapestry/core/scripts/commands/recite.js:14-33)

### read

- Item must carry the tag `readable`; absence yields "There's nothing written on that."
  (packages/@tapestry/core/scripts/commands/read.js:12-15)
- Reads the `text` property from the world entity and sends it directly to the actor.
  (packages/@tapestry/core/scripts/commands/read.js:18-22)
- If the item is also tagged `consumable` with `consume_method === 'read'`, each read
  consumes one charge via `tapestry.consumables.consume`; multi-charge items print "The
  book creaks softly as a few pages loosen and drift free." while the last charge prints
  "The book falls apart in your hands..."  (packages/@tapestry/core/scripts/commands/read.js:25-37)
- Uses arg type `findable`, meaning the item can be in inventory or the room (not
  inventory-only).  (packages/@tapestry/core/scripts/commands/read.js:8)

### sac / sacrifice

- Registered with alias `sacrifice`; targets a room item (not a carried item).
  (packages/@tapestry/core/scripts/commands/sac.js:2-3; packages/@tapestry/core/scripts/commands/sac.js:8)
- Only entities tagged `corpse` may be sacrificed; non-corpses are rejected with "You
  can only sacrifice corpses."  (packages/@tapestry/core/scripts/commands/sac.js:13-15)
- Player corpses (`player_corpse` tag) may not be sacrificed while they still contain
  items; the actor is told "You cannot sacrifice a player corpse that still has
  belongings in it."  (packages/@tapestry/core/scripts/commands/sac.js:18-23)
- Non-player corpses with `mob_level > 0` reward the actor with gold equal to `mob_level`
  via `tapestry.currency.addGold` with reason string `"sac"`.
  (packages/@tapestry/core/scripts/commands/sac.js:38-42)
- Sacrifice recursively destroys the corpse and all its contents via `destroyWithContents`.
  (packages/@tapestry/core/scripts/commands/sac.js:46-52)
- Player corpses yield no gold regardless of level.
  (packages/@tapestry/core/scripts/commands/sac.js:38)

### inventory / i

- Alias `i`; available to role `player` only; category `info`.
  (packages/@tapestry/core/scripts/commands/inventory.js:2-7)
- Groups items into stacks via `tapestry.stacking.getStacks` before display.
  (packages/@tapestry/core/scripts/commands/inventory.js:10)
- Each stack line prepends a rarity inline tag (from `tapestry.rarity.formatInline`) and
  an essence glyph (from `tapestry.essence.format`) if applicable, then appends `(xN)`
  for quantities greater than one.
  (packages/@tapestry/core/scripts/commands/inventory.js:17-22)
- Panel header shows "Inventory" on the left and total item count (sum of stack
  quantities) on the right.  (packages/@tapestry/core/scripts/commands/inventory.js:36-38)
- Gold balance is shown below the item list via `tapestry.currency.getGold`.
  (packages/@tapestry/core/scripts/commands/inventory.js:28-29)

### equipment / eq

- Alias `eq`; available to role `player` only; category `info`.
  (packages/@tapestry/core/scripts/commands/equipment.js:2-6)
- Slot list comes from `tapestry.equipment.getSlots`; empty slots display with subtle
  styling using `tapestry.equipment.getEmptyText()`.
  (packages/@tapestry/core/scripts/commands/equipment.js:9-10; packages/@tapestry/core/scripts/commands/equipment.js:23-24)
- Filled slots prepend rarity tag and essence glyph to the item name, matching the
  format used in the inventory command.
  (packages/@tapestry/core/scripts/commands/equipment.js:26-30)
- Slot label column width is computed dynamically to right-align all slot names to the
  longest label in the current slot list.
  (packages/@tapestry/core/scripts/commands/equipment.js:16-19)

### loot-protection

- Fires on the `container.access.check` event; enforces policy only on entities tagged
  `player_corpse`.  (packages/@tapestry/core/scripts/containers/loot-protection.js:9-17)
- Current hard-coded policy is `owner_only`: only the entity whose id matches
  `container.properties.owner` may access the corpse.
  (packages/@tapestry/core/scripts/containers/loot-protection.js:23-38)
- Three policy values are defined in comments: `owner_only`, `permission`, and `none`
  (open PvP loot); the `tapestry.config` module needed to make this runtime-configurable
  does not yet exist.  (packages/@tapestry/core/scripts/containers/loot-protection.js:1-7)
- Blocked access calls `event.cancel()` and sends "That corpse doesn't belong to you."
  to the accessor.  (packages/@tapestry/core/scripts/containers/loot-protection.js:34-38)
- Non-player-corpse containers (regular chests, bags, NPC corpses) are exempt from the
  policy check entirely.  (packages/@tapestry/core/scripts/containers/loot-protection.js:15-17)

## Rejected and Reverted

- None on record.

## Change Log

- None on record.
