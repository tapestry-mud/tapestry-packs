---
release: 0.1.22
specs: [core-combat.md]
---

# Swell Counter Feedback Off-Window

## Why

Playtest bug: typing `sidestep` or `brace` when no swell window is open produced
no output at all - the inert command handler ran and said nothing, so the prompt
just held and the verb felt broken. During an active swell the engine router
intercepts these verbs (commit or "the world has slowed" nudge); the handler only
runs off-window (the chip baseline, out of combat, or against a non-swell mob),
and it had no feedback path.

## What

- The `sidestep` and `brace` handlers now send a read when invoked off-window: if
  the player is in combat with a swell boss they get "No opening yet - read the
  swell." otherwise "There is nothing to counter right now."
  (packages/@tapestry/core/scripts/commands/counters.ts:21)
- No engine change; the active-swell interception is unchanged. The boss is
  detected by scanning the player's combat list for a `swell_window` dial, the
  same pattern the `tune` command uses.
