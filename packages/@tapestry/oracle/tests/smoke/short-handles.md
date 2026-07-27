# Short Board Handles

Task 11: `tapestry` board rows are 1-based numbered, and `resolveTemplateRef` accepts an
ordinal, a full templateId, or an unambiguous templateId prefix - all three resolving to
the SAME thread through the SAME `startRun` (Task 5) call. Also proves the `start` keyword
is optional: `tapestry <number or id> [level]` pulls a thread exactly like
`tapestry start <number or id> [level]`.

Only one thread template is baked and opened for this scenario (see the discrepancy note
in tapestry.ts: templateIds are always `oracle-week-<seed hex>`, independent of the `name`
arg passed to `oracle-admin bake`), which keeps prefix resolution trivially unambiguous
(exactly one open thread whose id the prefix could match) without needing a second baked
template just to prove "ambiguous prefix" - that negative case is not this scenario's
concern, it only proves the three POSITIVE resolution paths agree.

Setup bakes and opens a thread template via the temporary `oracle-admin` harness
(commands/oracle-admin.ts, still in the tree per Task 6's brief), the same convention
tapestry-board.md and level-dial-default.md use: `tapestry` itself only ever READS
templates, it never bakes or flips one. `leave` between each `start` call mirrors those
scenarios' sequential-runs pattern: `startRun` captures the CURRENT room as the return
address, so a second `start` while still standing in the first run's area would capture a
room the teardown is about to delete.

An explicit level (10) is passed on every `start` call in this scenario - the level-dial
default/explain/warn path is level-dial-default.md's concern, not this one's; here the
level argument is just along for the ride so each `start` resolves cleanly regardless of
Wanderer's current combat level (which, per level-dial-default.md, is NOT assumable across
scenario files in one managed run).

## Setup
- Players: Wanderer, Gamemaster

## Steps
1. Gamemaster: `oracle-admin bake - handle-test 1 100 standard grind 305419896`
2. Assert Gamemaster sees: `baked as draft`
3. Assert Gamemaster sees: `oracle-week-12345678`
4. Gamemaster: `oracle-admin flip oracle-week-12345678`
5. Assert Gamemaster sees: `Opened oracle-week-12345678`
6. Gamemaster: `set player tapestry_unlocked Wanderer true`
7. Assert Gamemaster sees: `set to`
8. Wanderer: `tapestry`
9. Assert Wanderer sees: `The Tapestry - open threads:`
10. Assert Wanderer sees: `1) oracle-week-12345678`
11. Assert Wanderer sees: `Pull a thread: tapestry start <number or id> [level]`
12. Wanderer: `tapestry start 1 10`
13. Assert Wanderer sees: `The thread pulls taut and draws you in.`
14. Wanderer: `leave`
15. Assert Wanderer sees: `a stone fountain is here`
16. Wanderer: `tapestry oracle-week-12345678 10`
17. Assert Wanderer sees: `The thread pulls taut and draws you in.`
18. Wanderer: `leave`
19. Assert Wanderer sees: `a stone fountain is here`
20. Wanderer: `tapestry oracle-week-1234 10`
21. Assert Wanderer sees: `The thread pulls taut and draws you in.`
22. Wanderer: `leave`
23. Assert Wanderer sees: `a stone fountain is here`
24. Wanderer: `tapestry start 99 10`
25. Assert Wanderer sees: `No such thread. Use its board number or full id.`
26. Wanderer: `tapestry zzzzz`
27. Assert Wanderer sees: `Usage: tapestry | tapestry start <number or id> [level] | tapestry <number or id> [level]`
28. Gamemaster: `set player tapestry_unlocked Wanderer false`
29. Assert Gamemaster sees: `set to False`
