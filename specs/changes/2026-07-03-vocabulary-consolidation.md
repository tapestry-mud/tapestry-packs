---
release: 0.1.23
specs: [core-combat.md, core-communication.md, core-economy.md, core-init.md, core-inventory.md, core-mobs.md, core-progression.md, cooking.md, example-pack.md, viewer.md]
---

# Vocabulary Consolidation

## Why

Pack content and declarations had drifted from a single naming grammar: the same concept
carried two names, a few names did two jobs, and some keys packs read were declared
nowhere. This pass moves every affected pack onto the settled vocabulary in lockstep with
the engine registrations, so content and engine speak one grammar. It ships across
`@tapestry/core` 0.1.23, `@tapestry/example-pack` 0.1.15, `@tapestry/oracle` 0.3.1,
`@tapestry/viewer` 0.1.4, and `@tapestry/cooking` 0.1.6, paired with engine 0.1.45.

## What

- **Combat + mobs (core-combat, core-mobs, core-progression).** Mob flee content moves to
  `wimpy_pct` (int 0-100); the old `flee_threshold` 0-1 doubles are converted x100. Mob
  strength is read from the `level.combat` map instead of the scalar `mob_level`, which
  survives only as an authoring key and corpse metadata. The `wimpy` command and its help
  now read/describe `wimpy_pct` as a percentage.
- **Communication (core-communication, viewer).** The ROM negation trio
  `notell`/`nochannels`/`noemote` is renamed to `no_tell`/`no_channels`/`no_emote` in the
  property declarations, every reader (tell, reply, clan, gossip, emote, immtalk, and the
  viewer's tell/reply), and the help text. `no_follow` was already snake_case and is
  untouched.
- **Economy (core-economy).** Shop content uses the flat `shop_sells` list plus
  `shop_buy_modifier`/`shop_sell_modifier`; the dotted keys and the description string that
  cited `shop.sells` are retired. The `value` property declaration is dropped from the pack
  (the engine now owns it).
- **Inventory (core-inventory, cooking).** Fill sources carry the liquid on the `fill_type`
  property; the obsolete `fill_source` property is removed while the `fill_source` tag
  stays. The `drink` tag is retired in favor of `drinkable`. Items carrying both `fixture`
  and `no_get` drop the redundant `no_get` (fixture now implies it).
- **World + navigation (core-init, example-pack).** Room `terrain` is a closed set
  (indoors/outdoors/underground); biome carries its own `biome:` axis, and the
  weather-zone `forest` flavor is matched biome-first with city/road flavor moved to the
  room level. `recall` becomes the declared `recall_room_id`; `safe_recall` is retired in
  favor of composing the `safe` and `recall_point` tags; the example blacksmith's
  `vendor` tag becomes `shop` (now a real shop with a small smithing inventory); `no_heal`
  is declared distinct from `no_regen`.

The `@tapestry/oracle` sweep (flee value naming in its balance table and templates) is
vocabulary plumbing for consistency only; the balance value is discarded downstream, so no
spawn behavior changes.
