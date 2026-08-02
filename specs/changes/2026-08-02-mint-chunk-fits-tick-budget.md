---
release: unreleased
specs: [oracle.md]
---

# Mint Chunk Fits The Tick Budget

## Why

`mintAreaGeometry` chunks its work across engine ticks, and `CHUNK_ROOMS` was sized against
the wrong ceiling. The comment on it named the 5s Jint entry cap -- the correctness ceiling,
where the constraint interrupt surfaces as bogus ReferenceErrors mid-function. It never
considered the 50ms slow-tick budget on a 100ms tick, which binds roughly a hundred times
sooner.

At 12 rooms per tick the handler was measured on a 2-core CI runner at 59-86ms wall, all of
it cpu (`cpu-bound`, not preempted), driving whole ticks to 96-187ms against a 100ms rate.
A tick that overruns starves the command FIFO, and that is what made the engine's telnet
scenario suite fail a different scenario almost every run: a `quit` echoed but never
processed, a mob wandering off between the `look` that found it and the `kill` that could
not, an hp assert reading a mob that had already moved. Four different scenarios failed
across five runs before this change, and three runs of one unrelated commit failed on three
different sets -- the signature of a shared timing fault rather than any one broken
scenario.

Worth being precise about a related observation: the same handler shows up in the droplet's
logs as `wall >> cpu (preempted)`, which is that host's CPU contention rather than this.
Both are real; only the cpu-bound one is work this pack controls.

## What

`CHUNK_ROOMS` drops from 12 to 4, sized against the tick budget rather than the Jint cap.
At the measured ~5-7ms per room that lands near 20-28ms with headroom on a slow runner, and
remains far under the cap it was originally sized for.

The cost is wall clock: a 40-room area mints in roughly 20 ticks (~2s) instead of ~8, across
the two passes. Creation already waits on the flavor loop, which covers it.

The constant now carries both ceilings in its comment so the next person to touch it does
not re-tune against the looser one.
