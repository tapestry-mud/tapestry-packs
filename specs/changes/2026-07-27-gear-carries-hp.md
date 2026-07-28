---
release: unreleased
specs: [oracle.md, core-progression.md]
---

# Gear Carries HP

## Why

Threadwalker's A1 root-cause finding: with level-up HP grants removed (core-progression's
pure-gear-HP change, 2026-07-25) and no other survivability source shipped yet, a player's max
HP was flatly stuck at the race/class base for the entire run - gear rolled `max_hp` in the
master balance table but nothing ever turned that number into a real stat modifier. Every piece
of oracle-minted or kit-granted armor and every weapon was cosmetically "worth" HP on paper and
worth zero HP in play. The engine side already had the plumbing (`ItemTemplate.Modifiers` ->
`StatModifier` at both entity-creation and equip time); the oracle pack simply never populated
the `modifiers` array it was handing to `writeItemTemplate`.

## What

**Minted loot and starter-kit gear now carry a real `maxHp` stat modifier.** `mintItemInstance`
(the six-axis loot mint fired at all four spawn tiers) and `grantStarterKit`'s weapon + three
armor pieces both read the `max_hp` figure `statsFor` already rolled from the master balance
table's per-kind `max_hp` anchor curve (weapon 5/12/25/55/100, armor 3/8/18/40/75 at levels
1/10/20/40/60) and, when it rolls greater than zero, push `{ stat: "maxHp", value: maxHp }`
into the `modifiers` array passed to `writeItemTemplate`. Zero-or-negative rolls omit the
modifier entirely rather than writing a no-op zero entry.
(packages/@tapestry/oracle/scripts/balance-table.ts:71-79;
packages/@tapestry/oracle/scripts/resolver.ts:251-302;
packages/@tapestry/oracle/scripts/starter-kit.ts:104-148)

**The engine already turns that array into a live stat.** `ItemTemplate.CreateEntity` maps
each `ModifierEntry` onto a `StatModifier` on the frozen item entity's `Modifiers` property at
mint time; `EquipmentManager`'s wear path reads that same list off the item and calls
`entity.Stats.AddModifier` at equip time, so the wearer's `StatBlock.MaxHp` (base + modifiers)
rises the instant the item goes on and falls back off on unequip. No oracle-side change was
needed here - only the missing pass-through of a non-empty `modifiers` array upstream of it -
which the engine-side task in this same lane confirmed already forwards decorator modifiers
correctly end to end. (Tapestry.Engine/Items/ItemTemplate.cs:44-52;
Tapestry.Engine/Inventory/EquipmentManager.cs:80-89)

**Closes A1.** Before this change, gear-carries-HP was a documented design intent with zero
runtime effect: `core-progression.md`'s pure-gear-HP change left HP with exactly one working
source (the flat race/class base) and one dead one (gear). A fresh level-1 wanderer who loots
or is kit-granted a single armor piece now sees max HP rise by exactly that piece's rolled
`max_hp` (e.g. +3 at the L1 armor anchor), proven end to end by a new smoke scenario
(packages/@tapestry/oracle/tests/smoke/gear-carries-hp.md) that mints a draft thread through the
admin bench, starts a run at level 1, wears the kit-granted head slot, and asserts the `inspect`
Vitals denominator moved off the pre-gear baseline.

**Also folded into this release: the boss room is tagged `no_wander` at spawn time.**
Right after `population.ts`'s wandering-boss `spawnMob` call, the pack now calls the
engine's new `tapestry.world.addRoomTag(roomId, "no_wander")` write binding (Part A Task 2)
so the boss's room carries the same `no_wander` tag the `wander` behavior already honored --
and that `CombatManager.AttemptFlee` now ALSO prefers to avoid as a flee destination.
Closes S2-13: a low-HP trash mob fleeing near a freshly-spawned boss could previously pick
that boss's room as its escape route, turning a clean first contact into an unplanned 2v1.
(packages/@tapestry/oracle/scripts/population.ts:314-324) Proven end to end by a new smoke
scenario (packages/@tapestry/oracle/tests/smoke/boss-room-no-wander.md) that bakes/starts a
small deterministic run, walks the exact three-move path (found by replaying the pack's own
`bossClockFires`/`computeStructure` against the built `dist/` offline) that makes the
wandering boss fire on the third room visited, and asserts core's admin `inspect room` shows
`no_wander` in the room's Flags line -- confirmed by a negative-control run (the tag call
temporarily stripped from `dist/`) that the same assertion fails without the fix (`Flags:
(none)`, boss occupants still present). This is folded in here rather than its own change
record because it is a small, self-contained companion fix in the same release; it is
independent of the gear-carries-HP mechanic above and touches no other file this record
already lists.

## Rejected and Reverted

- **Option 2 - flat per-level HP with AC-only gear survivability** (considered and rejected
  2026-07-27). The threadwalker design fork weighed reinstating a flat per-level `max_hp` grant
  (undoing the 2026-07-25 pure-gear-HP change) and letting gear contribute only Armor Class,
  leaving HP a character-level number. Rejected in favor of the gear-carries-HP path documented
  above: re-adding a level-driven HP grant would directly contradict core-progression's shipped
  "character level gates nothing" design (the whole point of the pure-gear-HP change was to make
  gear, not the grind, the survivability axis), and AC-only gear leaves early gear pickups with
  no felt HP payoff even though the balance table already rolls an `max_hp` figure for every
  weapon and armor piece - the table was already computing the number this change now wires up
  live rather than the number the rejected option would have made permanently decorative.
