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
20. Gamemaster: `leave`
21. Assert Gamemaster sees: `a stone fountain is here`
22. Gamemaster: `oracle-admin start oracle-week-12345678 50`
23. Assert Gamemaster sees: `pulls taut`
24. Gamemaster: `oracle-admin room`
25. Assert Gamemaster sees: `SELF-ROOM-ID: oracle-run:oracle-run-12345678-`
26. Assert Gamemaster sees: `SELF-ROOM-NAME: Raised Spice Row`
27. Assert Gamemaster sees: `A long prep table runs the length of the room. A hundred colors wink from crowded shelves.`
28. Assert Gamemaster sees: `SELF-ROOM-EXITS: north,south,east,west`
29. Gamemaster: `north`
30. Assert Gamemaster sees: `Sunken Cellar`
31. Gamemaster: `oracle-admin room`
32. Assert Gamemaster sees: `SELF-ROOM-NAME: Sunken Cellar`
33. Assert Gamemaster sees: `Flour dusts every surface like fresh snow. The air tastes of salt and old smoke.`
34. Assert Gamemaster sees: `SELF-ROOM-EXITS: north,south,east,west`
35. Assert Gamemaster sees: `SELF-ROOM-MOB: tandoor beast | hp=`
36. Assert Gamemaster sees: `max_hp=506`
37. Gamemaster: `leave`
38. Assert Gamemaster sees: `a stone fountain is here`
