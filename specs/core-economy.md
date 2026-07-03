---
capability: core-economy
last-updated: 2026-07-03
---

# core-economy

Shop commerce and container/door access in @tapestry/core.

## Overview

This capability covers the commands that drive the in-game economy and world-object
interaction: the shop cluster (shop/list, buy, sell, value), the door/container state
commands (open, close), and the lock/unlock pair. Shop transactions delegate pricing
and inventory logic to the engine's `tapestry.shop` subsystem; door state changes
delegate to `tapestry.doors`. All commands are in roles "player" (lock/unlock and
shop commands) or "player" and "mob" (open/close).

## Behavior

### Shop -- Shopkeeper Identity

- An NPC is recognized as a shopkeeper by carrying the `shop` tag. The tag description
  is "NPC operates as a vendor with shop_sells inventory".
  (packages/@tapestry/core/tags.yml:29-31)

- A shopkeeper's stock is defined via the `shop_sells` property on the NPC template, as
  a list of item template IDs.
  (packages/@tapestry/example-pack/areas/starter-town/mobs/merchant.yaml:20-33)

- `tapestry.shop.findShopInRoom(actorEntityId)` locates the shopkeeper NPC in the same
  room as the actor. All shop subcommands call this first and short-circuit with "There
  is no shop here." if no shopkeeper is found.
  (packages/@tapestry/core/scripts/commands/shop.ts:59-63; packages/@tapestry/core/scripts/commands/shop.ts:116-119)

### Shop -- List (shop / list)

- The `shop` command (alias: `list`) is in category "progression", role "player". It
  accepts an optional keyword filter argument.
  (packages/@tapestry/core/scripts/commands/shop.ts:5-17)

- `tapestry.shop.listings(npcId)` returns the available stock. If the stock is empty,
  the player receives "The shop has nothing for sale." and a GMCP
  `Response.Shop.List` message with an empty items array is emitted.
  (packages/@tapestry/core/scripts/commands/shop.ts:67-78)

- When a filter keyword is given, items are narrowed to those whose names contain the
  keyword (case-insensitive). If no items match the filter, the player receives
  "Nothing for sale matches that."
  (packages/@tapestry/core/scripts/commands/shop.ts:81-99)

- Each matching item is displayed as a dot-padded line: "  <name> .... <price> gold".
  The dot run is sized so the name plus the "<price> gold" string together span 50
  characters (`50 - name.length - price.length` dots, with a one-dot minimum); with the
  two-space indent and the single spaces flanking the dots, the rendered line is 54
  characters wide. (packages/@tapestry/core/scripts/commands/shop.ts:101-107)

- A GMCP `Response.Shop.List` payload is sent containing shopkeeper name, items array
  (id, name, price per item), and the filter value; the text response is then suppressed
  via `tapestry.respond.suppress`.
  (packages/@tapestry/core/scripts/commands/shop.ts:85-94)

### Shop -- Buy

- The `buy` command is in category "progression", role "player", with a required
  keyword argument.
  (packages/@tapestry/core/scripts/commands/shop.ts:19-30)

- `tapestry.shop.buy(actorEntityId, npcId, query)` handles the transaction. On success
  (reason `ok`) the result carries `itemName`, `amount`, and `goldRemaining`.
  (packages/@tapestry/core/scripts/commands/shop.ts:122-142)

- Buy failure reasons and their player-facing messages:
  - `itemNotForSale`: "The shopkeeper doesn't sell that."
  - `insufficientGold`: "You can't afford that. (<N> gold short)" where N is
    `amount - goldRemaining`.
  - `ambiguousItem`: "Which one? Several listings match '<query>'."
  (packages/@tapestry/core/scripts/commands/shop.ts:124-131)

- On success, the player receives "You buy <item> for <amount> gold." A GMCP
  `Response.Shop.Buy` payload is sent with status, message, item name, cost, and
  goldRemaining.
  (packages/@tapestry/core/scripts/commands/shop.ts:133-142)

- UNVERIFIED: buy prices are computed as the item's base value multiplied by a
  per-shopkeeper `shop_buy_modifier` (default 1.2x). The fixture comments document this
  relationship but the field is not confirmed in engine source within this repo.
  (packages/@tapestry/example-pack/tests/fixtures/shop-test-fixtures.yaml:5-15)

### Shop -- Sell

- The `sell` command is in category "progression", role "player", with a required
  keyword argument.
  (packages/@tapestry/core/scripts/commands/shop.ts:32-43)

- `tapestry.shop.sell(actorEntityId, npcId, query)` handles the transaction. On
  success (reason `ok`) the result carries `itemName`, `amount`, and `goldRemaining`.
  (packages/@tapestry/core/scripts/commands/shop.ts:157-177)

- Sell failure reasons and their player-facing messages:
  - `itemNotInInventory`: "You aren't carrying that."
  - `itemIsNoSell`: "The shopkeeper won't take that."
  - `itemValueZero`: "The shopkeeper won't take that."
  (packages/@tapestry/core/scripts/commands/shop.ts:159-165)

- Items tagged `no_sell` cannot be sold; the tag description is "Cannot be sold to
  shops".
  (packages/@tapestry/core/tags.yml:17-19)

- On success, the player receives "You sell <item> for <amount> gold." A GMCP
  `Response.Shop.Sell` payload is sent with status, message, item name, earnings, and
  goldRemaining.
  (packages/@tapestry/core/scripts/commands/shop.ts:168-177)

- UNVERIFIED: sell prices are computed as the item's base value multiplied by a
  per-shopkeeper `shop_sell_modifier` (default 0.5x). The fixture comments document this
  relationship but the field is not confirmed in engine source within this repo.
  (packages/@tapestry/example-pack/tests/fixtures/shop-test-fixtures.yaml:5-19)

### Shop -- Value

- The `value` command is in category "progression", role "player", with a required
  keyword argument.
  (packages/@tapestry/core/scripts/commands/shop.ts:45-56)

- `tapestry.shop.value(actorEntityId, npcId, query)` checks both the actor's inventory
  and the shop's stock. The result carries a `scope` field:
  - `scope === 'inventory'`: item is held by the actor; message is "The shopkeeper
    would pay <amount> gold for <item>."
  - any other scope: item is for sale; message is "<item> would cost you <amount>
    gold."
  (packages/@tapestry/core/scripts/commands/shop.ts:195-205)

- If the item is neither in the actor's inventory nor in the shop's stock, the message
  is "You don't have that, and the shop doesn't sell it."
  (packages/@tapestry/core/scripts/commands/shop.ts:201-203)

- A GMCP `Response.Shop.Value` payload is sent with `buyPrice` (when the item is for
  sale) or `sellPrice` (when the item is in inventory), mutually exclusive.
  (packages/@tapestry/core/scripts/commands/shop.ts:207-213)

### Open and Close

- `open` and `close` are in category "world" and allow both "player" and "mob" roles.
  Both accept a `target` argument of type `door`.
  (packages/@tapestry/core/scripts/commands/open.ts:1-8; packages/@tapestry/core/scripts/commands/close.ts:1-8)

- `open` checks `door.isClosed`; if false (already open), the actor receives "That is
  already open." If `door.isLocked` is true, the actor receives "That is locked." and
  the command aborts without calling the engine.
  (packages/@tapestry/core/scripts/commands/open.ts:16-24)

- On a successful open, `tapestry.doors.open(actorEntityId, roomId, dirStr)` is called.
  The actor receives "You open the <name>." and the room receives "<actor> opens the
  <name>."
  (packages/@tapestry/core/scripts/commands/open.ts:26-32)

- `close` checks `door.isClosed`; if true (already closed), the actor receives "That is
  already closed." On success, `tapestry.doors.close` is called and both actor and room
  receive closure messages.
  (packages/@tapestry/core/scripts/commands/close.ts:16-27)

- If the engine call returns a falsy value, the actor receives "You can't open that."
  or "You can't close that." respectively.
  (packages/@tapestry/core/scripts/commands/open.ts:32-34; packages/@tapestry/core/scripts/commands/close.ts:23-25)

### Lock and Unlock

- `lock` and `unlock` are in category "world", role "player" only (mobs are excluded).
  Both accept a `target` argument of type `door`.
  (packages/@tapestry/core/scripts/commands/lock.ts:1-8; packages/@tapestry/core/scripts/commands/unlock.ts:1-8)

- `lock` requires the door to be closed first; if `door.isClosed` is false, the actor
  receives "You must close it before locking."
  (packages/@tapestry/core/scripts/commands/lock.ts:21-23)

- When `door.keyId` is set, `tapestry.doors.hasKey(actorEntityId, door.keyId)` is
  checked for both lock and unlock. If the actor does not hold the key, they receive
  "You don't have the key."
  (packages/@tapestry/core/scripts/commands/lock.ts:26-29; packages/@tapestry/core/scripts/commands/unlock.ts:21-24)

- If `door.keyId` is absent, no key check is performed; the door can be locked or
  unlocked without a key.
  (packages/@tapestry/core/scripts/commands/lock.ts:26; packages/@tapestry/core/scripts/commands/unlock.ts:21)

- `unlock` checks that `door.isLocked` is true before proceeding; if already unlocked,
  the actor receives "That is not locked."
  (packages/@tapestry/core/scripts/commands/unlock.ts:16-18)

- On success, `tapestry.doors.lockDoor` or `tapestry.doors.unlock` is called. The
  actor and room receive "<actor> locks/unlocks the <name>." messages.
  (packages/@tapestry/core/scripts/commands/lock.ts:31-36; packages/@tapestry/core/scripts/commands/unlock.ts:26-31)

- If the engine call returns falsy, the actor receives "You can't lock that." or "You
  can't unlock that."
  (packages/@tapestry/core/scripts/commands/lock.ts:37-39; packages/@tapestry/core/scripts/commands/unlock.ts:32-34)

## Rejected and Reverted

- None on record.

## Change Log

- 2026-07-03 [vocabulary-consolidation](changes/2026-07-03-vocabulary-consolidation.md) - flat shop_sells plus shop_buy_modifier/shop_sell_modifier replace the dotted shop keys; the value declaration is dropped (engine owns it)
- 2026-07-03: Vocabulary consolidation (Slice 3, Task 3.2). Fixed the `shop` tag
  description in `tags.yml` to say `shop_sells` (was stale `shop.sells`, a retired
  dotted key). The engine's per-entity shop markup/discount override keys renamed
  from `shop.buy_markup` / `shop.sell_discount` to `shop_buy_modifier` /
  `shop_sell_modifier`; updated the UNVERIFIED buy/sell price notes below to match.
