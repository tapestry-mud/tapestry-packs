# Guide Outfitting Idempotency Across Death

S2-17 verification: confirms the guide never re-prompts an already-outfitted
player after a grind-tier death repop. area-gen.ts's unconditional "Say
HELLO to be outfitted for the road" message (area-gen.ts:311) lives only in
the disused solo/buildArea creation path - the live per-player run path
(`tapestry start` / `oracle-admin start` -> `startRun` -> `instantiateRunArea`,
area-gen.ts:702-774) only ever sends "The thread pulls taut and draws you
in." and never that line, whether on first mint or on the grind-death repop
seam (core's `entity.vital.depleted` grind branch publishes `run.grind_repop`,
which population.ts answers by clearing the run's visited-room state and
calling `populateEntry` again - never `buildArea`). guide.ts's own `onSay`
handler already gates the kit/ability grant on already-granted state
(guide.ts:59-98), so a second "hello" after death should fall through to the
"You carry all I can give" idle line instead of re-outfitting or re-prompting.

Uses the same `oracle-admin` harness and exact seed/geometry death-grind.md
already established (`10 50 standard grind 305419896` -> `oracle-week-12345678`,
level 10 -> entry room "Raised Spice Row") since that scenario proved the
grind-repop seam correctly re-populates the entry room; this scenario adds
the guide-interaction half death-grind.md did not check (it never spoke to
the guide before or after its own forced death). oracle-admin's `bake`/`flip`/
`start` call the real `bakeTemplate`/`setTemplateState`/`startRun` functions
directly (admin/builder-gated), the same production code path `tapestry
start` drives - so this is not a stand-in, it is the real run-start path
under a fixed, admin-driven seed.

The entry room carries no `safe` tag anywhere in oracle's scripts (unlike
`tapestry-core:recall`, which cleared-room-exit-hint.md found blocks combat
outright) - it is merely "ambient-zero" (tiers.ambientDensity never rolls a
PROCEDURAL mob into it), which does not stop an admin `spawn` from placing
one there directly. So the forced death happens right in the entry room,
with no need to walk to an adjacent room or touch the wandering tandoor
beast death-grind.md found one room north - same `set player hp <actor> 1`
+ `spawn tapestry-example-pack:goblin` + `kill` idiom death-grind.md used to
make its own death deterministic in one round instead of riding out combat
RNG.

## Setup
- Players: Gamemaster

## Steps
1. Gamemaster: `oracle-admin bake - guide-idem-test 10 50 standard grind 305419896`
2. Assert Gamemaster sees: `baked as draft`
3. Assert Gamemaster sees: `oracle-week-12345678`
4. Gamemaster: `oracle-admin flip oracle-week-12345678`
5. Assert Gamemaster sees: `Opened oracle-week-12345678`
6. Gamemaster: `oracle-admin start oracle-week-12345678 10`
7. Assert Gamemaster sees: `pulls taut`
8. Gamemaster: `say hello`
9. Assert Gamemaster sees: `Take these`
10. Gamemaster: `set player hp Gamemaster 1`
11. Assert Gamemaster sees: `Gamemaster's max HP set to 1.`
12. Gamemaster: `spawn tapestry-example-pack:goblin`
13. Assert Gamemaster sees: `Spawned: a goblin`
14. Gamemaster: `kill goblin`
15. Assert Gamemaster sees: `You attack a goblin!`
16. Wait for Gamemaster sees: `You wake at the threshold.`
17. Assert Gamemaster sees: `Raised Spice Row`
18. Assert Gamemaster does not see: `Say HELLO when you are ready to be outfitted`
19. Gamemaster: `say hello`
20. Assert Gamemaster sees: `You carry all I can give`
