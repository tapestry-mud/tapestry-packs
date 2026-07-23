# Oracle Mint Bench

Task 7: the admin mint bench (`mint` command + `flows/mint-flow.ts` + `mint flip`) -
the ONLY way content enters the game (spec 8). Proves the full loop end-to-end: an
admin drives the interactive wizard (LLM-off/baked path - band [1,10], fixed seed) to
bake a draft thread template via `bakeTemplate` (Task 5), confirms the draft is NOT on
the player-facing board while still a draft, flips it open with `mint flip <id>`
(`setTemplateState`, Task 4), then confirms it now lists. Also confirms the wizard's
transient `mint_*` scratch answers leave no residue on the admin's persisted properties
(entity.scratch is a flow-scoped store that is never serialized - flows-and-wizards.md -
so `inspect` on the admin, which dumps the real property bag, is the read side of that
guarantee).

Drives the real wizard (`mint` with no args triggers `oracle_mint`), unlike Tasks 5/6's
scenarios which call the temporary `oracle-admin` harness's bake/flip subcommands
directly. `mint`/`mint flip` are admin/builder-gated (roles: ["admin", "builder"]), so
this runs entirely as the seeded admin, Gamemaster.

## Setup
- Players: Gamemaster

## Steps
1. Gamemaster: `mint`
2. Assert Gamemaster sees: `Starting the mint bench.`
3. Assert Gamemaster sees: `Pick a scenario:`
4. Gamemaster: `1`
5. Assert Gamemaster sees: `Thread name (blank for random):`
6. Gamemaster: `mint-bench-test`
7. Assert Gamemaster sees: `Band floor (min level, 0-60):`
8. Gamemaster: `1`
9. Assert Gamemaster sees: `Band cap (max level, 0-60):`
10. Gamemaster: `10`
11. Assert Gamemaster sees: `Run size:`
12. Gamemaster: `1`
13. Assert Gamemaster sees: `Death mode: grind or unraveling (blank for grind):`
14. Gamemaster: `grind`
15. Assert Gamemaster sees: `Seed (blank for random):`
16. Gamemaster: `305419896`
17. Assert Gamemaster sees: `baked as draft`
18. Assert Gamemaster sees: `oracle-week-12345678`
19. Gamemaster: `inspect Gamemaster`
20. Assert Gamemaster does not see: `mint_`
21. Gamemaster: `set player tapestry_unlocked Gamemaster true`
22. Assert Gamemaster sees: `set to`
23. Gamemaster: `tapestry`
24. Assert Gamemaster sees: `No threads are open yet.`
25. Assert Gamemaster does not see: `oracle-week-12345678`
26. Gamemaster: `mint flip oracle-week-12345678`
27. Assert Gamemaster sees: `Thread oracle-week-12345678 is now open.`
28. Gamemaster: `tapestry`
29. Assert Gamemaster sees: `The Tapestry - open threads:`
30. Assert Gamemaster sees: `oracle-week-12345678`
31. Assert Gamemaster sees: `mint-bench-test`
32. Assert Gamemaster sees: `[levels 1-10]`
