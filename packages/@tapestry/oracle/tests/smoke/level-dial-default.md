# Level Dial Default And Warning

Task 6: `tapestry start <id>` with no level defaults the dial to the player's own
combat level instead of erroring, and `tapestry start <id> <level>` still warns (but
does not block) when the dialed level outpaces the player's own level. Proves both
halves end-to-end through the real player-facing `tapestry` command and the real
`startRun` (Task 5) - not the admin harness, since the default/warning logic lives in
`tapestry.ts`'s `start` branch and `area-gen.ts`'s `startRun`, not in `oracle-admin.ts`
(oracle-admin's own `start` always passes `explicitLevel=true` and never defaults - see
its brief-driven Step 4 update - so it cannot exercise the default path at all).

This scenario cannot assume Wanderer's combat level going in: player entities persist
across scenario FILES within one managed test run (same save store for the whole
`--managed` invocation, `--all-packs` included), and several OTHER packs' smoke tests
reuse "Wanderer" and grant it combat XP (core's pure-gear-hp.md, and others via kills),
so whatever level Wanderer starts this file at depends on run order (confirmed
empirically: a version of this test that hardcoded "level 1" passed standalone but
failed under `--all-packs`). Rather than invent a new player name (tried; a genuinely
unseeded name hits the full email/account-creation flow instead of the pre-seeded
test-account password prompt every other scenario relies on - out of scope here), this
scenario forces Wanderer to a KNOWN level regardless of starting point: the "combat"
track's `max_level` is 50 (`core/scripts/progression/progression.ts`), and
`ProgressionManager.GrantExperience` clamps the level-up loop at `max_level` no matter
how much XP overshoots it - so granting an enormous amount (10,000,000, far past the
~16,160 XP level 50 requires from level 1) deterministically leaves Wanderer at EXACTLY
level 50, whether it started at 1 or 49. The grant is idempotent if Wanderer is already
50 (no error, no further level-up, XP simply accumulates past the used amount).

The bake below uses `bandFloor=1, bandCap=100` - wide enough to hold both the
now-guaranteed default level (50) and a deliberately-over-dialed explicit level (75)
above it, in the SAME template. `leave` between the two `start` calls mirrors oracle-
run-start.md's sequential-runs pattern: `startRun` captures the CURRENT room as the
return address, so a second `start` while still standing in the first run's area would
capture a room the teardown is about to delete.

Setup bakes and opens a thread template via the temporary `oracle-admin` harness
(commands/oracle-admin.ts, still in the tree per Task 6's brief), the same convention
tapestry-board.md uses: `tapestry` itself only ever READS templates, it never bakes or
flips one.

## Setup
- Players: Wanderer, Gamemaster

## Steps
1. Gamemaster: `oracle-admin bake - dial-test 1 100 standard grind 305419896`
2. Assert Gamemaster sees: `baked as draft`
3. Assert Gamemaster sees: `oracle-week-12345678`
4. Gamemaster: `oracle-admin flip oracle-week-12345678`
5. Assert Gamemaster sees: `Opened oracle-week-12345678`
6. Gamemaster: `grant player xp Wanderer 10000000 combat`
7. Assert Gamemaster sees: `Granted 10000000 XP to Wanderer on track 'combat'.`
8. Gamemaster: `set player tapestry_unlocked Wanderer true`
9. Assert Gamemaster sees: `set to`
10. Wanderer: `tapestry`
11. Assert Wanderer sees: `Pull a thread: tapestry start <id> <level>`
12. Assert Wanderer sees: `<level> sets the difficulty dial - it does not scale to your gear. Higher is harder.`
13. Wanderer: `tapestry start oracle-week-12345678`
14. Assert Wanderer sees: `No level given - defaulting to your own level (50).`
15. Assert Wanderer sees: `The thread pulls taut and draws you in.`
16. Wanderer: `leave`
17. Assert Wanderer sees: `a stone fountain is here`
18. Wanderer: `tapestry start oracle-week-12345678 75`
19. Assert Wanderer sees: `Dialing 75 against your own level 50 - this will be hard. Gear up first if you are not sure.`
20. Assert Wanderer sees: `The thread pulls taut and draws you in.`
21. Wanderer: `leave`
22. Assert Wanderer sees: `a stone fountain is here`
23. Gamemaster: `set player tapestry_unlocked Wanderer false`
24. Assert Gamemaster sees: `set to False`
