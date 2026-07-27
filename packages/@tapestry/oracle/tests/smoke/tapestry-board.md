# Tapestry Board

Task 6: the real player-facing `tapestry` command (list open threads, start a run),
gated on the `tapestry_unlocked` trophy (Task 3). Proves the three things that can't be
pinned down by a unit test: the unlock gate blocks a non-admin player end-to-end, the
board's open-thread listing renders the level band, and `tapestry start` hands off to
the real `startRun` (Task 5) and teleports the caller into a minted run.

Setup bakes and opens a thread template via the temporary `oracle-admin` harness
(commands/oracle-admin.ts, still in the tree per Task 6's brief) - `tapestry` itself
only ever READS templates (listTemplates/getTemplate), it never bakes or flips one, so
the harness remains the only way a scenario can put an open template in front of the
board. `Wanderer` (a plain, non-admin test player) drives the actual `tapestry` calls
under test; `Gamemaster` (admin) only does setup (bake/flip/unlock).

## Setup
- Players: Wanderer, Gamemaster

## Steps
1. Wanderer: `tapestry`
2. Assert Wanderer sees: `The Tapestry hangs dark. Finish the school first.`
3. Assert Wanderer does not see: `pulls taut`
4. Gamemaster: `oracle-admin bake - week-test 10 50 standard grind 305419896`
5. Assert Gamemaster sees: `baked as draft`
6. Assert Gamemaster sees: `oracle-week-12345678`
7. Gamemaster: `oracle-admin flip oracle-week-12345678`
8. Assert Gamemaster sees: `Opened oracle-week-12345678`
9. Gamemaster: `set player tapestry_unlocked Wanderer true`
10. Assert Gamemaster sees: `set to`
11. Wanderer: `tapestry`
12. Assert Wanderer sees: `The Tapestry - open threads:`
13. Assert Wanderer sees: `oracle-week-12345678`
14. Assert Wanderer sees: `week-test`
15. Assert Wanderer sees: `[levels 10-50]`
16. Assert Wanderer sees: `Pull a thread: tapestry start <number or id> [level]`
17. Wanderer: `tapestry start oracle-week-12345678 10`
18. Assert Wanderer sees: `The thread pulls taut and draws you in.`
