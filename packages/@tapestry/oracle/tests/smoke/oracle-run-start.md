# Oracle Run Start

Stack-critical (spec 3.1's determinism claim): a thread template bakes once, then two
DIFFERENT players start runs from it at two DIFFERENT dialed levels. Both runs must mint
byte-identical geometry (same room names/descriptions/exits) and byte-identical roster
identity (same mob names, same placements) - the ONLY thing that may differ is the
resolved stat numbers (HP), because `runLevel` feeds the spawn/stat path only and never
mintAreaGeometry or the roster roll (area-gen.ts's `instantiateRunArea`).

Uses the temporary `oracle-admin` harness command (commands/oracle-admin.ts) since Task 6
(the `tapestry` board -> startRun) and Task 7 (the `mint` bench -> bakeTemplate/`mint flip`)
have not landed yet - `oracle-admin bake|flip|start` call the real bakeTemplate/setTemplateState/
startRun functions directly. `oracle-admin room` self-reports the caller's own room (id, name,
description, exits) PLUS its NPC occupants' hp/max_hp in one atomic command, sidestepping two
sharp edges found while writing this scenario: (1) the core `at`/`whereis` admin commands do
not reliably resolve a just-teleported player's room in a freshly-minted runtime area, and
(2) a wandering ambient mob can leave the room between two separate commands, so the room and
mob report must be a single round trip.

## Setup
- Players: Gamemaster, Wanderer, Alice

## Steps
1. Gamemaster: `oracle-admin bake - week-test 10 50 standard grind 305419896`
2. Assert Gamemaster sees: `baked as draft`
3. Assert Gamemaster sees: `oracle-week-12345678`
4. Gamemaster: `oracle-admin flip oracle-week-12345678`
5. Assert Gamemaster sees: `Opened oracle-week-12345678`
6. Wanderer: `oracle-admin start oracle-week-12345678 10`
7. Assert Wanderer sees: `pulls taut`
8. Wanderer: `oracle-admin room`
9. Assert Wanderer sees: `SELF-ROOM-ID: oracle-run:oracle-run-12345678-`
10. Assert Wanderer sees: `SELF-ROOM-NAME: Raised Spice Row`
11. Assert Wanderer sees: `A long prep table runs the length of the room. A hundred colors wink from crowded shelves.`
12. Assert Wanderer sees: `SELF-ROOM-EXITS: north,south,east,west`
13. Wanderer: `north`
14. Assert Wanderer sees: `Sunken Cellar`
15. Wanderer: `oracle-admin room`
16. Assert Wanderer sees: `SELF-ROOM-NAME: Sunken Cellar`
17. Assert Wanderer sees: `Flour dusts every surface like fresh snow. The air tastes of salt and old smoke.`
18. Assert Wanderer sees: `SELF-ROOM-EXITS: north,south,east,west`
19. Assert Wanderer sees: `SELF-ROOM-MOB: tandoor beast | hp=35 | max_hp=35`
20. Alice: `oracle-admin start oracle-week-12345678 50`
21. Assert Alice sees: `pulls taut`
22. Alice: `oracle-admin room`
23. Assert Alice sees: `SELF-ROOM-ID: oracle-run:oracle-run-12345678-`
24. Assert Alice sees: `SELF-ROOM-NAME: Raised Spice Row`
25. Assert Alice sees: `A long prep table runs the length of the room. A hundred colors wink from crowded shelves.`
26. Assert Alice sees: `SELF-ROOM-EXITS: north,south,east,west`
27. Alice: `north`
28. Assert Alice sees: `Sunken Cellar`
29. Alice: `oracle-admin room`
30. Assert Alice sees: `SELF-ROOM-NAME: Sunken Cellar`
31. Assert Alice sees: `Flour dusts every surface like fresh snow. The air tastes of salt and old smoke.`
32. Assert Alice sees: `SELF-ROOM-EXITS: north,south,east,west`
33. Assert Alice sees: `SELF-ROOM-MOB: tandoor beast | hp=`
34. Assert Alice sees: `max_hp=506`
35. Wanderer: `leave`
36. Assert Wanderer sees: `a stone fountain is here`
