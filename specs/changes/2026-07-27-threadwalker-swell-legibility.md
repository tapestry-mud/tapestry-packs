---
release: 0.1.28
specs: [core-combat.md]
---

# Threadwalker Swell Legibility

## Why

Task 15 (S2-20a/S2-20b playtest findings on week one's boss QTE). Two legibility gaps in the
swell counter loop: the tell-lines and narration always said "the guardian" regardless of the
mob's rolled name, and a countered swell's real chunk damage never showed up as anything the
player could see - the same HP loss from a melee hit produces a condition-band line, but the
swell path was silent.

## What

**Countered-swell damage visibility (core-combat).** `SwellClockManager.ApplyDamage` already
funnels a countered swell's chunk damage through `VitalsService.Apply` with reason
`combat.swell`, which fires `entity.vital.changed` - but never `combat.hit` (that only fires for
melee auto-attacks), so nothing surfaced it. A new `entity.vital.changed` listener in
`output.ts` broadcasts the same `<combat_status>[target] [condition].</combat_status>` line
`combat.hit` uses whenever `data.reason === "combat.swell"` and HP decreased, reusing
`conditionIndex`/`conditionText` so a countered swell and a melee hit read on the identical band
ladder. It does not reuse `combat.hit`'s per-attacker dedup bookkeeping (there is no attacker id
on this event), so it broadcasts unconditionally on every swell-damage decrease rather than only
on a band transition - acceptable because a countered swell is a rare, telegraphed, once-per-
cycle event, not a per-tick spam risk.

**Swell tell-line and narration name substitution (threadwalker-world, see
threadwalker's own spec).** `week-one-ward.js`'s `wardBossIfPresent` now overwrites the boss
instance's `swell_line1/2_tell_full/shape`, `swell_tell_hidden`, and
`swell_narration_countered/whiffed/weathered` properties using the mob's live `.name` at the
moment it is first seen, the same variable already used to build the room telegraph line -
instead of leaving the archetype's hardcoded "the guardian" placeholder text in place for every
bake.
