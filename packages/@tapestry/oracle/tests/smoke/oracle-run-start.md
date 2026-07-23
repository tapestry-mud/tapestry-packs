# Oracle Run Start

Stack-critical (spec 3.1's determinism claim): a thread template bakes once, then the SAME
player starts two runs from it at two DIFFERENT dialed levels (sequentially - `start` bakes/
flips/starts require admin/builder privilege as of the fix-plan pass on Task 5's review
finding 2, so this harness now runs entirely as the seeded admin, Gamemaster). Both runs must
mint byte-identical geometry (same room names/descriptions/exits) and byte-identical roster
identity (same mob names, same placements) - the ONLY thing that may differ is the resolved
stat numbers (HP), because `runLevel` feeds the spawn/stat path only and never
mintAreaGeometry or the roster roll (area-gen.ts's `instantiateRunArea`). Geometry/roster
identity depend only on the template seed + dialed level, never on which player calls
`start`, so driving both runs through one admin player still proves the claim.

Uses the temporary `oracle-admin` harness command (commands/oracle-admin.ts) since Task 6
(the `tapestry` board -> startRun) and Task 7 (the `mint` bench -> bakeTemplate/`mint flip`)
have not landed yet - `oracle-admin bake|flip|start` call the real bakeTemplate/setTemplateState/
startRun functions directly, all now admin/builder-gated (mutating production calls). `oracle-
admin room` self-reports the caller's own room (id, name, description, exits) PLUS its NPC
occupants' hp/max_hp in one atomic command, sidestepping two sharp edges found while writing
this scenario: (1) the core `at`/`whereis` admin commands do not reliably resolve a just-
teleported player's room in a freshly-minted runtime area, and (2) a wandering ambient mob
can leave the room between two separate commands, so the room and mob report must be a single
round trip.

The explicit `leave` between the two `start` calls matters, not just cosmetic: `startRun`
captures the caller's CURRENT room as the hub/return-address before tearing down any prior
run (one-active-run-per-player, spec 3.1a) - starting the second run while still standing
inside the first run's about-to-be-deleted area would capture a doomed room as the new hub.

Task 8 (level-locked loot wiring) extends this same two-level walk one room further north,
to the trash/elite room where the seed's ONLY loot draw fires in this template - a "dented
ladle" (a common-rarity weapon). The item TYPE and rarity are level-independent rng draws
(the level only bends `effectiveItemLevel`, which feeds `statsFor` for the roll), so the
same-named item mints at both dialed levels with the same rarity - but WHICH occupant ends
up carrying it can differ between levels (confirmed empirically): a higher level rolls more
hp dice for the elite ahead of it in the same spawn-rng stream, which shifts every
downstream draw, including the elite-vs-trash loot-slot roll. So the assertion below
matches on the item's own fields (name/rarity/ac/damage_dice), not on which mob line
precedes it - proving the SAME item type bands to a DIFFERENT `damage_dice` at level 10
vs level 50, which is the actual claim (loot dials with the run level, not flat at 1).
`oracle-admin room`'s per-mob report line was extended (Task 8) to include each occupant's
carried-item rarity/ac/damage_dice in the SAME atomic send as the mob's stats, so this
stays one command per room check - the wandering-mob sharp edge above bites just as hard
on a second bare Assert appended after an already-fetched buffer (confirmed while writing
this addition: a probe assert placed after the existing 4-assert room chain reliably raced
the ambient mob's real-time wander tick and flaked), so this extension follows the SAME
one-command, one-fresh-assert discipline as every other room check here rather than
stacking more assertions onto a buffer already read.

## Setup
- Players: Gamemaster

## Steps
1. Gamemaster: `oracle-admin bake - week-test 10 50 standard grind 305419896`
2. Assert Gamemaster sees: `baked as draft`
3. Assert Gamemaster sees: `oracle-week-12345678`
4. Gamemaster: `oracle-admin flip oracle-week-12345678`
5. Assert Gamemaster sees: `Opened oracle-week-12345678`
6. Gamemaster: `oracle-admin start oracle-week-12345678 10`
7. Assert Gamemaster sees: `pulls taut`
8. Gamemaster: `oracle-admin room`
9. Assert Gamemaster sees: `SELF-ROOM-ID: oracle-run:oracle-run-12345678-`
10. Assert Gamemaster sees: `SELF-ROOM-NAME: Raised Spice Row`
11. Assert Gamemaster sees: `A long prep table runs the length of the room. A hundred colors wink from crowded shelves.`
12. Assert Gamemaster sees: `SELF-ROOM-EXITS: north,south,east,west`
13. Gamemaster: `north`
14. Assert Gamemaster sees: `Sunken Cellar`
15. Gamemaster: `oracle-admin room`
16. Assert Gamemaster sees: `SELF-ROOM-NAME: Sunken Cellar`
17. Assert Gamemaster sees: `Flour dusts every surface like fresh snow. The air tastes of salt and old smoke.`
18. Assert Gamemaster sees: `SELF-ROOM-EXITS: north,south,east,west`
19. Assert Gamemaster sees: `SELF-ROOM-MOB: tandoor beast | hp=35 | max_hp=35`
20. Gamemaster: `north`
21. Gamemaster: `oracle-admin room`
22. Assert Gamemaster sees: `dented ladle | rarity=common | ac=- | damage_dice=2d12`
23. Gamemaster: `leave`
24. Assert Gamemaster sees: `a stone fountain is here`
25. Gamemaster: `oracle-admin start oracle-week-12345678 50`
26. Assert Gamemaster sees: `pulls taut`
27. Gamemaster: `oracle-admin room`
28. Assert Gamemaster sees: `SELF-ROOM-ID: oracle-run:oracle-run-12345678-`
29. Assert Gamemaster sees: `SELF-ROOM-NAME: Raised Spice Row`
30. Assert Gamemaster sees: `A long prep table runs the length of the room. A hundred colors wink from crowded shelves.`
31. Assert Gamemaster sees: `SELF-ROOM-EXITS: north,south,east,west`
32. Gamemaster: `north`
33. Assert Gamemaster sees: `Sunken Cellar`
34. Gamemaster: `oracle-admin room`
35. Assert Gamemaster sees: `SELF-ROOM-NAME: Sunken Cellar`
36. Assert Gamemaster sees: `Flour dusts every surface like fresh snow. The air tastes of salt and old smoke.`
37. Assert Gamemaster sees: `SELF-ROOM-EXITS: north,south,east,west`
38. Assert Gamemaster sees: `SELF-ROOM-MOB: tandoor beast | hp=`
39. Assert Gamemaster sees: `max_hp=506`
40. Gamemaster: `north`
41. Gamemaster: `oracle-admin room`
42. Assert Gamemaster sees: `dented ladle | rarity=common | ac=- | damage_dice=5d16`
43. Gamemaster: `leave`
44. Assert Gamemaster sees: `a stone fountain is here`
