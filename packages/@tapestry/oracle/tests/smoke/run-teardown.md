# Run Teardown

Task 13: on `leave` (abandon a run to bank a win or bail out), the run area must be deleted
(engine sweep via `authoring.deleteArea`) and the player's `oracle_active_run` pointer cleared
- reusing the SAME event-publish + oracle-listener pattern Task 12 already proved for
Unraveling death (core cannot import oracle, oracle depends on core - never the reverse - so
core publishes an exit event and oracle listens). `leave.ts` publishes `return.used`;
`recall.ts` publishes `player.teleported` - oracle listens on both (area-gen.ts) and tears
down any active run. This scenario proves the `leave` path end-to-end; `recall` shares the
exact same `teardownActiveRunOnExit` handler and no-op guard, so a second full walk would only
re-prove the same code path under a different trigger command.

Stack-critical because it can't be pinned down by a unit test (pack JS is not unit-testable in
isolation - it runs inside the engine's Jint sandbox against CLR-wrapped values) and because a
silent break here is costly: without it, every abandoned run leaks a permanent orphan area
(spec 3.1a's "one active run per player" already guards against a LIVE double-run via
`startRun`'s own teardown-before-mint call, but does nothing for an area a player simply
walked away from).

Steps 12-15 cover the nested-start guard (ship validate 2026-07-23): `startRun` captures the
player's CURRENT room as the return-address, so pulling a second thread from inside the first
would have set that address to a room the very next teardown deletes, leaving `leave` pointing
at nothing. `startRun` now refuses outright when the caller is already standing in a run area,
and the guard must be non-destructive - the refusal leaves the run the player is actually in
untouched, which is what the `AREA-LIVE: true` immediately after it proves.

A static scenario file cannot hardcode the run area's id: its hash half comes from the
engine-generated player entityId (assigned fresh per managed test run), unknown at write time.
So this uses the `oracle-admin` harness's `arealive`/`activerun` self-checks (Task 13
additions, commands/oracle-admin.ts) instead of asserting against core's `inspect area <id>`
with a literal id - both ultimately call the same `authoring.getArea()` engine API, so the
check is equivalent; only the CALLER differs (oracle's own harness, recomputing its own run's
deterministic id server-side, vs. a scenario file trying to guess it ahead of time).

Uses the temporary `oracle-admin` harness (same rationale as oracle-run-start.md and
tapestry-board.md: `oracle-admin bake|flip|start` drive the real bakeTemplate/setTemplateState/
startRun functions directly, admin/builder-gated) plus the real player-facing `leave` command
(core) under test.

## Setup
- Players: Gamemaster

## Steps
1. Gamemaster: `oracle-admin bake - week-teardown 10 50 standard grind 305419896`
2. Assert Gamemaster sees: `baked as draft`
3. Assert Gamemaster sees: `oracle-week-12345678`
4. Gamemaster: `oracle-admin flip oracle-week-12345678`
5. Assert Gamemaster sees: `Opened oracle-week-12345678`
6. Gamemaster: `oracle-admin start oracle-week-12345678 10`
7. Assert Gamemaster sees: `pulls taut`
8. Gamemaster: `oracle-admin room`
9. Assert Gamemaster sees: `SELF-ROOM-ID: oracle-run:oracle-run-12345678-`
10. Gamemaster: `oracle-admin arealive oracle-week-12345678`
11. Assert Gamemaster sees: `AREA-LIVE: true`
12. Gamemaster: `oracle-admin start oracle-week-12345678 10`
13. Assert Gamemaster sees: `still walking a thread`
14. Gamemaster: `oracle-admin arealive oracle-week-12345678`
15. Assert Gamemaster sees: `AREA-LIVE: true`
16. Gamemaster: `leave`
17. Assert Gamemaster sees: `a stone fountain is here`
18. Gamemaster: `oracle-admin activerun`
19. Assert Gamemaster sees: `ACTIVE-RUN: []`
20. Gamemaster: `oracle-admin arealive oracle-week-12345678`
21. Assert Gamemaster sees: `AREA-LIVE: false`
22. Gamemaster: `oracle-admin start oracle-week-12345678 10`
23. Assert Gamemaster sees: `pulls taut`
24. Gamemaster: `oracle-admin room`
25. Assert Gamemaster sees: `SELF-ROOM-ID: oracle-run:oracle-run-12345678-`
26. Gamemaster: `oracle-admin arealive oracle-week-12345678`
27. Assert Gamemaster sees: `AREA-LIVE: true`
28. Gamemaster: `leave`
29. Assert Gamemaster sees: `a stone fountain is here`
