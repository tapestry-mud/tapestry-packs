# Pure-Gear HP

Task 11 (spec 4.6 / decision 1): HP comes only from the flat race/class base
plus gear modifiers, never from a level grind. The engine's HP formula is
already level-free (`StatBlock.MaxHp = BaseMaxHp + modifiers`), but two pack-
side paths used to sneak a level term back in: `progression.ts`'s combat and
magic `on_level_up` handlers each granted a flat `max_hp` bonus directly, and
`@tapestry/example-pack`'s `warrior`/`mage` class data declared a `max_hp`
`stat_growth` (with a `growth_bonuses` constitution scaling term) that the
engine's `StatGrowthOnLevelUp` applies on every `progression.level.up` event
regardless of which track fired it.

Proves, in order: a fresh player's max HP; combat-track level-up leaves max HP
unchanged; magic-track level-up (same classed player, since `StatGrowthOnLevelUp`
is not track-filtered) leaves max HP unchanged; equipping a gear piece with an
HP modifier (`tapestry-example-pack:leather-cap`, `+10 maxHp`) raises max HP by
exactly that amount. The player is set to the `warrior` class (via `setclass`)
specifically to exercise the class-growth path (`StatGrowthOnLevelUp`), not
just the direct `progression.ts` grants - both violations must be dead for the
level-up assertions to pass.

`inspect` is used (not `score`) because its `Vitals:` line renders as flat
text (`HP <hp>/<max_hp>  Resource ...`), independent of the wrapping/width-
aware panel layout `score` uses - a stable substring to assert on. Assertions
target `/<max_hp>  Resource` (the denominator only, not the full `hp/max_hp`
pair): current HP can legitimately drift from natural regen over the
scenario's real wall-clock time (regen ticks every 3s, `regenIntervalTicks:
30` @ 100ms/tick) whenever there is HP headroom below max - which pre-fix
there is, since the bug itself opens that headroom by inflating max_hp. Only
max_hp is the actual invariant under test. The `Wait for` on the level-up
broadcast (not a fixed `Assert`) rides out the notification queue, which
flushes at the end of the tick that processed the granting admin command,
same tick-timing consideration as combat-pulse-driven scenarios elsewhere in
this suite.

## Setup
- Players: Wanderer, Gamemaster

## Steps
1. Gamemaster: `inspect Wanderer`
2. Assert Gamemaster sees: `/100  Resource`
3. Gamemaster: `setclass Wanderer warrior`
4. Assert Gamemaster sees: `Wanderer is now a warrior.`
5. Gamemaster: `grant player xp Wanderer 250 combat`
6. Assert Gamemaster sees: `Granted 250 XP to Wanderer on track 'combat'.`
7. Wait for Wanderer sees: `You are now level 2! ***`
8. Gamemaster: `inspect Wanderer`
9. Assert Gamemaster sees: `/100  Resource`
10. Gamemaster: `grant player xp Wanderer 250 magic`
11. Assert Gamemaster sees: `Granted 250 XP to Wanderer on track 'magic'.`
12. Wait for Wanderer sees: `You are now level 2! ***`
13. Gamemaster: `inspect Wanderer`
14. Assert Gamemaster sees: `/100  Resource`
15. Gamemaster: `loaditem tapestry-example-pack:leather-cap`
16. Assert Gamemaster sees: `Loaded a leather cap into your inventory.`
17. Gamemaster: `drop cap`
18. Assert Gamemaster sees: `You drop a leather cap.`
19. Wanderer: `get cap`
20. Assert Wanderer sees: `You pick up a leather cap.`
21. Wanderer: `wear cap`
22. Assert Wanderer sees: `You wear a leather cap.`
23. Gamemaster: `inspect Wanderer`
24. Assert Gamemaster sees: `/110  Resource`
