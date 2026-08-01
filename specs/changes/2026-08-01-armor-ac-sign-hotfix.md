---
release: 0.9.1
specs: [oracle.md]
---

# Armor AC Sign Hotfix

## Why

Oracle 0.9.0 shipped `master-balance.yml`'s `armor.ac` anchor row as
`[-1, -3, -5, -9, -14]` -- negative, growing more negative at higher levels. The engine's
`HitResolver.CalculateArmorClass` is additive: `BaseAC + innateAC + equippedAC + dexMod`, and
`HitResolverTests.cs` documents the contract in its own words ("a defender wearing one armor
piece has AC raised by that piece's ac[type]"). Neither `mintItemInstance` nor
`grantStarterKit` flips the sign before writing `properties.ac` -- both copy the rolled table
value straight across -- so the table row itself has to already be the raise amount. With a
negative row, every minted and starter-kit armor piece in 0.9.0 LOWERED the wearer's effective
AC instead of raising it: armor made a character easier to hit, the exact inverse of its
intended (and engine-tested) effect. This is a sign inversion in already-shipped 0.9.0
behavior, not a new design decision.

## What

**`armor.ac` anchor row corrected to `[1, 3, 5, 9, 14]`.** Same five level anchors (1/10/20/
40/60), same magnitudes, sign flipped. No other balance figure in this release changed --
`max_hp`, weapon damage, mob/elite/miniboss/boss curves, and slot progression are untouched.
`resolver.ts`'s `mintItemInstance` armor branch and `starter-kit.ts`'s `grantStarterKit` armor
loop both needed no code change: they were already doing the right thing (pass the table's
`ac` roll straight through per damage type); the bug was entirely in the table's own sign.
(packages/@tapestry/oracle/data/master-balance.yml:35-40)

**Verified against the engine's own contract before applying.** Re-read
`HitResolver.CalculateArmorClass` (additive formula, hit test is `totalRoll >= targetAC`) and
`HitResolverTests.CalculateArmorClass_OneEquippedPiece_RaisesAC` (asserts AC 10 -> 13 from a
single `ac[slash]=3` piece) to confirm the additive/raises-AC convention independently, then
confirmed by reading `resolver.ts` and `starter-kit.ts` that neither already compensates for
the sign anywhere else in the pipeline, before concluding the fix belongs in the data file
alone. (Tapestry.Engine/Combat/HitResolver.cs:40-65;
Tapestry.Engine.Tests/Combat/HitResolverTests.cs:113-123;
packages/@tapestry/oracle/scripts/resolver.ts:260-262;
packages/@tapestry/oracle/scripts/starter-kit.ts:124,139)
