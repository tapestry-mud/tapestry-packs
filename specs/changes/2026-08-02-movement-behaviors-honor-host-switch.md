---
release: unreleased
specs: [core-mobs.md]
---

# Movement Behaviors Honor The Host Switch

## Why

`wander` and `patrol` are the two behaviors that relocate a mob, and both do it on their own
schedule regardless of what else is happening. Wander rolls two unseeded `Math.random()`
calls; patrol runs a fixed route but on a timer whose phase relative to anything observing it
is arbitrary. That is correct for a live game and fatal for the engine's end-to-end telnet
scenarios, which act on a named mob across several commands: the mob leaves between the
command that finds it and the command that acts on it, and its arrive/leave line lands in the
middle of output an assertion is reading.

The engine cannot fix this by skipping behaviors on the packs' behalf without deciding what
"movement" means for a pack it does not own, so it exposes the answer instead.

## What

Both behaviors consult `tapestry.mobs.movementEnabled()` and return early when it is false,
via a small local helper that treats a missing seam as enabled so this pack still loads
against an older engine.

Nothing else changes: with movement enabled the two behaviors are byte-for-byte what they
were, including the existing destination-side `no_wander` check in wander. Mobs that should
never move already declare `behavior: stationary`, which is untouched and remains the way to
pin a single mob.
