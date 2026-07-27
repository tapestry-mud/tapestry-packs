# Gear Carries HP

Task (2026-07-27): proves oracle-minted armor carries a real maxHp modifier
that raises the wearer's HP on wear, closing A1's root cause (gear
contributed zero HP). Mirrors pure-gear-hp.md's `inspect` idiom (flat-text
`/<max_hp>  Resource` line, immune to score's wrapping) and
oracle-mint-bench.md's admin mint flow (scenario/name/band-floor/band-cap/
run-size/death-mode/seed wizard order, `mint flip <id>`).

Uses the same known-good seed/id pair as oracle-mint-bench.md
(`305419896` -> `oracle-week-12345678`, per `area-gen.ts`'s
`"oracle-week-" + (areaSeed >>> 0).toString(16)`) since `--managed` runs boot
an isolated temp data dir per scenario file, so there is no template-registry
collision between the two scenarios' baked drafts.

The wearer never leveled up (pure-gear-HP already proved level-up grants no
max_hp elsewhere), so the ONLY thing that can move the Vitals denominator off
the level-1 race/class base of 100 is the kit-granted head slot's rolled
`max_hp` (armor anchor at L1 is 3 in master-balance.yml -> 103). The kit is
guide-delivered on interaction (guide.ts's `onSay` hook, gated on a
hello/hi/hey/help/kit/... keyword match), not auto-granted on arrival, so
Wanderer says `hello` to the guide standing in the run's entry room before
wearing anything.

`inspect` resolves its target via `tapestry.args.resolve`, which is
room-scoped (admin-inspect.ts's own header comment) - it cannot see an entity
in a different room, let alone a different area. Once `tapestry start`
teleports Wanderer into the freshly minted run area, Gamemaster's `inspect
Wanderer` would fail with "No entity found" until Wanderer comes back.
`leave` (roles: player, no admin gate) reads the return-address `startRun`
set to Gamemaster's own room the moment Wanderer pulled the thread, and
teleports Wanderer straight back there without touching equipment (the
run-teardown side effect only removes the run's minted area, never anything
on the player) - so it doubles as the vehicle back into inspect's reach.

## Setup
- Players: Gamemaster, Wanderer

## Steps
1. Gamemaster: `inspect Wanderer`
2. Assert Gamemaster sees: `/100  Resource`
3. Gamemaster: `mint`
4. Assert Gamemaster sees: `Starting the mint bench.`
5. Gamemaster: `1`
6. Gamemaster: `gear-hp-test`
7. Gamemaster: `1`
8. Gamemaster: `10`
9. Gamemaster: `1`
10. Gamemaster: `grind`
11. Gamemaster: `305419896`
12. Assert Gamemaster sees: `baked as draft`
13. Gamemaster: `mint flip oracle-week-12345678`
14. Assert Gamemaster sees: `is now open.`
15. Gamemaster: `set player tapestry_unlocked Wanderer true`
16. Assert Gamemaster sees: `set to`
17. Wanderer: `tapestry start oracle-week-12345678 1`
18. Wait for Wanderer sees: `The thread pulls taut and draws you in.`
19. Wanderer: `say hello`
20. Wait for Wanderer sees: `Take these`
21. Wanderer: `wear cap`
22. Assert Wanderer sees: `You wear`
23. Wanderer: `leave`
24. Gamemaster: `inspect Wanderer`
25. Assert Gamemaster sees: `/103  Resource`
