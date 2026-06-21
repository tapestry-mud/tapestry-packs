---
release: 0.1.21
specs: [core-combat.md, example-pack.md]
---

# Swell Combat Content Graduated to Core

## Why

The swell combat machinery first proved out as demo content in
`@tapestry/example-pack`: the Telegraph-rung window validator, the two counter
verbs, the builder dial editor, and the `swell_*` dial property declarations.
That is the wrong home for reusable mechanics - any world pack that wants a swell
boss would have had to copy the scripts and re-declare the dials. The engine seam
(`tapestry.combat.registerWindow`, the `pace` field, the per-fight swell clock)
shipped in engine v0.1.41; the matching content belongs in core so every pack
builds on one registered validator and one set of counter verbs.

## What

- **`@tapestry/core` (0.1.21)** gains the graduated swell content: the
  `telegraph-rung` window validator
  (packages/@tapestry/core/scripts/combat/telegraph-rung.ts:5), the `sidestep`
  and `brace` counter verbs registered `pace: battle`
  (packages/@tapestry/core/scripts/commands/counters.ts:5), the builder-gated
  `tune` live dial editor (packages/@tapestry/core/scripts/commands/tune.ts:26),
  the full set of `swell_*` dial property declarations on npc entities
  (packages/@tapestry/core/properties.yml:30), and the sidestep / brace / tune
  help topics. Core now requires engine >=0.1.41. Any pack depending on core can
  declare a swell boss purely as data.

- **`@tapestry/example-pack` (0.1.13)** drops its local copies of all of the
  above and consumes the core-provided versions. The swell-warden mini-boss is
  unchanged in behavior - it keeps its dials and uses the core-registered
  validator and counters.
  (packages/@tapestry/example-pack/areas/starter-town/mobs/swell-warden.yaml:32)

- No behavior change to the swell loop itself; this is a relocation so the
  mechanics are reusable. The duplicate `brace` / `sidestep` / `tune` command and
  help registrations that would have collided at the seal are removed from
  example-pack.
