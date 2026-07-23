# Death - Grind Tier

Task 12 (punch-list item 5, spec 3.5, decision 3): grind-tier death never strands gear.
The player wakes at the run's ENTRY room with every held item and every worn piece of
gear intact, the run area repops immediately, and `player.death` still fires
(progression.ts's XP penalty listener depends on it).

Repop is TWO calls, not one: `world.resetArea` (Task 1) reuses the engine's generic
SpawnManager.RunAreaReset, which only repops mobs registered through the AUTHORED
spawn-rule system (example-pack-style content). Oracle's own mobs never go through that
system - they spawn lazily via `tapestry.mobs.spawnMob` on first visit, gated by a
per-room "visited" marker (population.ts), so `world.resetArea` alone is a structural
no-op for every oracle run area (confirmed empirically while writing this scenario: a
killed mob's room stayed empty after `world.resetArea` with no repop of any kind). The
death handler therefore ALSO publishes "run.grind_repop", which a new oracle listener
(population.ts) answers by clearing the run's visited-room state (both the in-memory
cache AND the frozen "visited" oracle table it rehydrates from - clearing only the cache
is not enough, since the very next check reloads the same markers straight off the
persisted side-car) and re-populating the entry room immediately. Every other room in
the run repops lazily on the player's next real visit, same as any first visit.

Also proves the SA1 re-ward, adapted to what is actually testable pre-Task-16 (no
authored ward content exists yet - `req_ward_dispel` is always a runtime `tags add`,
same technical-fixture technique as ward-capability.md): a boss the player had already
`dispel`-cleared and killed earlier in the run is replaced by a FRESH mob instance after
a later grind-death repop - proven by re-tagging the fresh instance and confirming its
`cap_cleared_ward_dispel` is ABSENT (a stale/reused instance would still carry it from
before). `cap_cleared_ward_dispel` lives on the mob instance, never the room (ward.ts),
so this is the correct discriminator between "truly fresh" and "same instance, revisited".
The reusable core dispel staff (Task 9) is a KEPT tool, not consumed, so re-clearing the
ward on the fresh instance costs a walk back, not a re-acquisition. NOTE: the repop roll
is a genuinely NEW rng draw, not a replay of the original mint - the fresh mob's flavor
name is NOT guaranteed to match the original ("tandoor beast" respawns as "angry cook"
for this exact seed + scripted step sequence, verified empirically and stable across
re-runs of this exact scenario; that name would drift if steps before it are edited).

Uses the temporary `oracle-admin` harness (bake/flip/start call the real
bakeTemplate/setTemplateState/startRun functions directly - Task 6's real `tapestry`
board would work identically here, but the harness sidesteps the `tapestry_unlocked`
progression gate, keeping this a technical fixture for the death-branch primitive, not
authored content). Reuses the exact seed (305419896) and geometry already documented in
oracle-run-start.md (entry room "Raised Spice Row", one room north "Sunken Cellar" with
a wandering "tandoor beast" at 35 HP for a level-10 run) - deterministic, so the room/mob
names below are known ahead of the run, not discovered live.

The final step re-bakes the SAME template (`bakeTemplate`'s own `registerTemplate` call
always resets `state` to `"draft"`) so this scenario does not leave an OPEN thread behind
for a later scenario in the same suite run - `--all-packs` shares one server/world across
every scenario file.

The boss is killed BEFORE the player's own death (not left alive) - a still-alive mob is
not "missing" from anything, so it would never look like it needs replacing.
`set npc hp tandoor 1` after dispelling (ward already cleared, so the gate does not
intervene) makes the kill deterministic in one round instead of riding out several rounds
of real melee variance against 35 HP. The player's own death is likewise made
deterministic with `set player hp Gamemaster 1` before engaging a freshly admin-spawned
goblin, so the very first landed counter-hit ends the scenario without racing combat RNG.

## Setup
- Players: Gamemaster

## Steps
1. Gamemaster: `oracle-admin bake - grindtest 10 50 standard grind 305419896`
2. Assert Gamemaster sees: `baked as draft`
3. Assert Gamemaster sees: `oracle-week-12345678`
4. Gamemaster: `oracle-admin flip oracle-week-12345678`
5. Assert Gamemaster sees: `Opened oracle-week-12345678`
6. Gamemaster: `loaditem tapestry-example-pack:leather-cap`
7. Assert Gamemaster sees: `Loaded a leather cap into your inventory.`
8. Gamemaster: `wear cap`
9. Assert Gamemaster sees: `You wear a leather cap.`
10. Gamemaster: `loaditem tapestry-core:staff-of-dispel-ward`
11. Assert Gamemaster sees: `Loaded a staff of dispel ward into your inventory.`
12. Gamemaster: `oracle-admin start oracle-week-12345678 10`
13. Assert Gamemaster sees: `pulls taut`
14. Gamemaster: `oracle-admin room`
15. Assert Gamemaster sees: `SELF-ROOM-NAME: Raised Spice Row`
16. Gamemaster: `north`
17. Assert Gamemaster sees: `Sunken Cellar`
18. Gamemaster: `tags add tandoor req_ward_dispel`
19. Assert Gamemaster sees: `Added tag 'req_ward_dispel' to tandoor beast.`
20. Gamemaster: `dispel`
21. Assert Gamemaster sees: `You level a staff of dispel ward. The ward parts with a sound like tearing cloth.`
22. Gamemaster: `inspect tandoor`
23. Assert Gamemaster sees: `cap_cleared_ward_dispel`
24. Gamemaster: `set npc hp tandoor 1`
25. Assert Gamemaster sees: `hp set to 1 (hp and max hp).`
26. Gamemaster: `kill tandoor`
27. Assert Gamemaster sees: `You attack tandoor beast!`
28. Wait for Gamemaster sees: `You have slain tandoor beast!`
29. Gamemaster: `set player hp Gamemaster 1`
30. Assert Gamemaster sees: `Gamemaster's max HP set to 1.`
31. Gamemaster: `spawn tapestry-example-pack:goblin`
32. Assert Gamemaster sees: `Spawned: a goblin`
33. Gamemaster: `kill goblin`
34. Assert Gamemaster sees: `You attack a goblin!`
35. Wait for Gamemaster sees: `You wake at the threshold.`
36. Assert Gamemaster sees: `Raised Spice Row`
37. Gamemaster: `inventory`
38. Assert Gamemaster sees: `a staff of dispel ward`
39. Gamemaster: `equipment`
40. Assert Gamemaster sees: `a leather cap`
41. Gamemaster: `north`
42. Assert Gamemaster sees: `Sunken Cellar`
43. Gamemaster: `tags add cook req_ward_dispel`
44. Assert Gamemaster sees: `Added tag 'req_ward_dispel' to angry cook.`
45. Gamemaster: `inspect cook`
46. Assert Gamemaster sees: `[angry cook]`
47. Assert Gamemaster does not see: `cap_cleared_ward_dispel`
48. Gamemaster: `oracle-admin bake - grindtest 10 50 standard grind 305419896`
49. Assert Gamemaster sees: `baked as draft`
