# Gear Legibility

Task 11b (spec 4.3 "Gear legibility", SA5 from Travis's first playtest F1): a
player must be able to tell which of two items is better without picking
either one up. `examine` already rendered slot/weight/rarity/modifiers for an
item held in inventory (`inventory.examineItem`, `resolved.source ===
'inventory'` in `look.ts`), but an item lying loose on the ground fell
through to the generic room/container entity branch, which only ever read
`properties.description` off `world.getEntity` - name and flavor text, no
rarity, no modifiers. This scenario proves the room-floor gap is closed by
routing that branch through the same `examineItem` accessor and the newly
factored `renderItemStats` renderer.

Two stock `@tapestry/example-pack` items exercise different rarity tiers and
different rolled modifiers: `iron-sword` (rare, `+2` to strength, wield slot)
and `leather-cap` (common, `+10` to maxHp, head slot) - the modifier stat name
renders in the engine's enum casing (`Strength`, `MaxHp`), not the lowercase
YAML source key, so assertions match that casing.

Proves, in order: examining the sword while held shows its rarity and
modifier line (regression guard - this already worked pre-fix); dropping it
and examining it on the ground now shows the same rarity and modifier line
(this is the fix - pre-fix it showed only the name and, since the sword has
no `properties.description`, nothing else); a second item of a different
rarity (the cap) confirms the fix isn't a coincidence of one item's data -
dropped and examined, its own (different) rarity and modifier line renders
too.

Out of scope, found while mapping every examine path for this task and
recorded in the implementation report rather than exercised here: an item
resting inside a container, and an item currently worn/wielded by the actor,
are both unresolvable by `examine`/`look` today independent of this display
fix - the `visible` arg type's resolver only searches the actor's own
top-level inventory contents and the room's entity list, never a container's
nested contents nor the actor's `Equipment` collection, so target resolution
itself fails ("You don't see that here.") before `lookAtTarget` ever runs.
Closing that gap needs an engine-side (or new custom arg-type) change, out of
this pack-only task's scope.

## Setup
- Players: Gamemaster

## Steps
1. Gamemaster: `loaditem tapestry-example-pack:iron-sword`
2. Assert Gamemaster sees: `Loaded an iron sword into your inventory.`
3. Gamemaster: `examine sword`
4. Assert Gamemaster sees: `Rarity:`
5. Assert Gamemaster sees: `rare`
6. Assert Gamemaster sees: `Modifiers:`
7. Assert Gamemaster sees: `+2 Strength`
8. Gamemaster: `drop sword`
9. Assert Gamemaster sees: `You drop an iron sword.`
10. Gamemaster: `examine sword`
11. Assert Gamemaster sees: `Rarity:`
12. Assert Gamemaster sees: `rare`
13. Assert Gamemaster sees: `Modifiers:`
14. Assert Gamemaster sees: `+2 Strength`
15. Gamemaster: `loaditem tapestry-example-pack:leather-cap`
16. Assert Gamemaster sees: `Loaded a leather cap into your inventory.`
17. Gamemaster: `drop cap`
18. Assert Gamemaster sees: `You drop a leather cap.`
19. Gamemaster: `examine cap`
20. Assert Gamemaster sees: `Rarity:`
21. Assert Gamemaster sees: `common`
22. Assert Gamemaster sees: `Modifiers:`
23. Assert Gamemaster sees: `+10 MaxHp`
