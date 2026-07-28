---
release: unreleased
specs: [oracle.md]
---

# Level Dial Default And Warning

## Why

`tapestry start <id> <level>` required an explicit level with no guidance on what the
number meant, and no player-facing description of what "level" actually dials. A new
player pulling their first thread had to guess a number, and a player who over-dialed on
purpose (or by typo) got no warning before the run minted at a difficulty above their own
character - the same failure a UI would flag before letting the action complete.

## What

`tapestry start <id>` with no level now defaults to the player's own combat progression
level (`tapestry.progression.getLevel`, falling back to 1) instead of erroring, and tells
the player it did so. The board listing (`tapestry` / `tapestry list`) now explains, right
under the pull instructions, that the level sets a difficulty dial and does not scale to
the player's gear. `startRun` gained a fourth parameter, `explicitLevel: boolean` - true
only when the player named a level themselves - and warns (without blocking) when an
explicit level outpaces the player's own combat level; a defaulted level can never trigger
the warning, since by construction it never exceeds the player's own level.
`oracle-admin start` (the temporary admin harness) always passes `explicitLevel=true`,
since an admin-dialed level is always a deliberate choice.
