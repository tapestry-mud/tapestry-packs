---
release: 0.8.0
specs: [oracle.md]
---

# Hub and Threads - Oracle

## Why

The solo generator was a player-facing firehose: everyone free-rolled their own one-shot area,
generation ran the LLM per play, and nothing persisted as a shareable "this week's content." The
hub-and-threads game needs the opposite - one authored thread that every player runs at a level
they dial, deterministic and instant, with the LLM cost paid once at authoring. That is the
template/run split, and around it the board, the mint bench, level-locked loot, and per-run
teardown.

## What

**Template/run split.** `bakeTemplate` runs the expensive generation once against a template
area (geometry, prose, roster, boss, loot placement) and freezes the tables; no player, no
teleport. `startRun` re-runs the same seed per player at their chosen level - numeric, no LLM -
minting a fresh per-player run area (a run slug from the template seed plus a player hash) that
copies the template's frozen tables. Two players running the same thread get identical geometry
and roster with distinct area ids and no shared lock; only mob and item numbers resolve to the
dialed level. One entry-room derivation is shared between the run's `oracle_active_run` composite
and the minted room, so the death-handler respawn target can never drift from the room actually
built.

**Template registry.** Templates persist as one frozen oracle table on a fixed well-known area,
each row a JSON blob carrying band window, draft/open state, seed, and death mode - a discoverable
index that survives reboot independent of any single run area.

**The Tapestry board + the mint bench.** `tapestry` lists open threads (band + gear signpost) and
`tapestry start <id> <level>` pulls one, gated on `tapestry_unlocked`. `mint` is the admin bench:
bake a draft week, `mint flip <id>` opens it. Players never free-roll; `solo` is gated to admin.

**Level-locked loot + per-run teardown.** Drop bands resolve to the dialed run level. One active
run per player: `startRun` tears down any prior run before minting, and aborts rather than
orphaning if the sweep fails. Teardown fires on Unraveling death (`run.unraveled`), and on
leave/recall (`return.used` / `player.teleported`) via one shared no-op-when-not-in-a-run helper.

**Refuse a nested run start (ship fix).** `startRun` refuses when the caller is already standing
in a run area: capturing the current room as the return-address and then tearing that area down
would have pointed `leave` at a deleted room. The refusal is non-destructive - the run in progress
is untouched - and the remedy is in the player's hands (`leave` returns to the hub and tears the
run down), so a run always starts from the hub.
