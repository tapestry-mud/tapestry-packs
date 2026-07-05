---
release: 0.1.25
specs: [core-combat.md]
---

# Target Condition Line

## Why

Stage-B.2 combat-feel design call (Travis 2026-07-04): combat output carries
two distinct channels. The damage VERB keys on absolute damage - the
progression channel, the power fantasy that grows with gear and levels. The
CONDITION line is the relative tactical state of the target - how close the
fight is to over. The old output had only the verb channel, so a level-1
player watching "scratches" land had no signal that the mob was in fact
dying. Folding percent-of-target into the verb was rejected; two channels,
two vocabularies.

## What

- Extracted the percent-HP band ladder out of `look.ts` into
  `scripts/combat/condition.ts` (`CONDITION_BANDS`, `conditionIndex`,
  `conditionText`) - ONE implementation shared by the look command and
  combat output, so the two can never disagree. Bands mirror the engine
  HealthTier ladder exactly.

- `combat.hit` in `combat/output.ts` now emits
  `<combat_status><name> is bleeding profusely.</combat_status>` to the
  attacker and room bystanders when the target's condition BAND CHANGES -
  never every round, and not on the killing blow (the kill line owns that
  beat). HP is already applied when combat.hit fires, so the line reads the
  post-hit band. Tracking is per-target in-memory, seeded at perfect health,
  and cleared on combat.kill and on player death (vitals restore on recall).
