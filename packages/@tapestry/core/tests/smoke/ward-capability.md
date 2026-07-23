# Ward Capability

Task 9 (spec 4.4 as rewritten 2026-07-22, plus SA1): the `dispel` verb, the ONE
themed verb for v1's one capability-tool instance (a ward). No generic `use` -
`dispel` is item-named and finds the gated encounter and the answering tool on
its own, never requiring the player to name the staff.

The mob-side gate tag (`req_ward_dispel`) is applied at runtime to a stock
`@tapestry/example-pack` mob via the admin `tags` command - this scenario is a
technical fixture for the capability primitive, not authored ward content (the
warded encounter's own prose telegraph is Task 16's job). The tool side is a
real, generic, reusable core item (`tapestry-core:staff-of-dispel-ward`,
tagged `cap_ward_dispel` in its own content, same as any other stock core
item) so `examine` on it proves the discoverability surface (Step 2b) without
any runtime hacking.

Proves, in order: no gated mob -> "nothing to dispel"; gated mob present but
no tool -> "nothing... answers it" AND no property set; the staff's own
description names the verb (`examine`, off the room floor - `examineItem`
never surfaces `properties.description` for a carried item, only room/
container entities do, so the item is dropped and examined before it is
picked up); a successful dispel sets `cap_cleared_ward_dispel` on the MOB
instance (via admin `inspect`), never the room; the staff is not consumed
(still in inventory after).

Task 10 (the req_ side): the same `req_ward_dispel` tag makes a mob immune to
damage until its own `cap_cleared_ward_dispel` is set. Steps 27+ prove the full
ward loop on a fresh encounter - `tapestry-test-fixtures:test-dummy` (99999 HP,
near-unhittable-back at str/dex 1), so the assertion is airtight: attacking
while warded leaves HP exactly unchanged (the gate heals back whatever landed)
and shows the shimmering-ward refusal; the SAME reusable staff from the steps
above (never consumed) dispels it; attacking again lands real damage and HP
drops. `Wait for` (not a fixed-count assert) rides out the auto-attack's
miss/hit variance - the loop keeps swinging every pulse until a hit satisfies
the assertion, so a stray miss can't flake the test.

Fix-up (review findings 1+2 on the Task 10 commit): the gate moved from
`combat.hit` (melee-only) to `entity.vital.changed` (every HP write funnels
through `VitalsService`, see `ward.ts`), and the heal-back now restores the
EXACT `old - new` amount from that event instead of blindly reversing the raw
attempted damage. Steps 45-56 prove an ability (Fireball, `cast`) is ALSO
blocked by the ward, not just melee - closing the bypass a warded boss had via
any `can_target:["npc"]` spell or skill. Steps 57-80 prove the exact-restore
math on a mob whose current HP is BELOW its max (`set npc hp dummy 30`, then
some real unwarded damage lands before tagging it warded) - a fixture where
"restore to the exact pre-hit value" and the old bug's "restore to max" would
visibly disagree, unlike the 99999-HP fixture above where they coincide.
Since the runner has no variable capture, the discriminator is two literal
`does not see` exclusions (`HP 30/30` rules out the overshoot-to-max bug,
`HP 0/30` rules out a stuck-at-floor no-op) rather than asserting the single
exact number, which is unknown at scenario-authoring time (real melee damage,
not scripted).

## Setup
- Players: Wanderer, Gamemaster

## Steps
1. Wanderer: `dispel`
2. Assert Wanderer sees: `There is nothing here to dispel.`
3. Gamemaster: `spawn tapestry-example-pack:goblin`
4. Assert Gamemaster sees: `Spawned: a goblin`
5. Gamemaster: `tags add goblin req_ward_dispel`
6. Assert Gamemaster sees: `Added tag 'req_ward_dispel' to a goblin.`
7. Wanderer: `dispel`
8. Assert Wanderer sees: `You reach for the ward and find nothing in your hands that answers it.`
9. Gamemaster: `inspect goblin`
10. Assert Gamemaster does not see: `cap_cleared_ward_dispel`
11. Gamemaster: `loaditem tapestry-core:staff-of-dispel-ward`
12. Assert Gamemaster sees: `Loaded a staff of dispel ward into your inventory.`
13. Gamemaster: `drop staff`
14. Assert Gamemaster sees: `You drop a staff of dispel ward.`
15. Wanderer: `examine staff`
16. Assert Wanderer sees: `Level it at a ward and DISPEL.`
17. Wanderer: `get staff`
18. Assert Wanderer sees: `You pick up a staff of dispel ward.`
19. Wanderer: `dispel`
20. Assert Wanderer sees: `You level a staff of dispel ward. The ward parts with a sound like tearing cloth.`
21. Gamemaster: `inspect goblin`
22. Assert Gamemaster sees: `cap_cleared_ward_dispel`
23. Gamemaster: `inspect room`
24. Assert Gamemaster does not see: `cap_cleared_ward_dispel`
25. Wanderer: `inventory`
26. Assert Wanderer sees: `a staff of dispel ward`
27. Gamemaster: `teleport Gamemaster tapestry-test-fixtures:test-arena`
28. Gamemaster: `teleport Wanderer tapestry-test-fixtures:test-arena`
29. Gamemaster: `spawn tapestry-test-fixtures:test-dummy`
30. Assert Gamemaster sees: `Spawned: a training dummy`
31. Gamemaster: `tags add dummy req_ward_dispel`
32. Assert Gamemaster sees: `Added tag 'req_ward_dispel' to a training dummy.`
33. Wanderer: `kill dummy`
34. Assert Wanderer sees: `You attack a training dummy!`
35. Wait for Wanderer sees: `Your blow glances off a shimmering ward. Steel will not part it.`
36. Gamemaster: `inspect dummy`
37. Assert Gamemaster sees: `HP 99999/99999`
38. Wanderer: `dispel`
39. Assert Wanderer sees: `You level a staff of dispel ward. The ward parts with a sound like tearing cloth.`
40. Wait for Wanderer sees: `a training dummy.`
41. Gamemaster: `inspect dummy`
42. Assert Gamemaster does not see: `HP 99999/99999`
43. Gamemaster: `purge npc`
44. Assert Gamemaster sees: `Purged`
45. Gamemaster: `spawn tapestry-test-fixtures:test-dummy`
46. Assert Gamemaster sees: `Spawned: a training dummy`
47. Gamemaster: `tags add dummy req_ward_dispel`
48. Assert Gamemaster sees: `Added tag 'req_ward_dispel' to a training dummy.`
49. Gamemaster: `learn Wanderer fireball 100`
50. Assert Gamemaster sees: `Granted Fireball to Wanderer at 100% proficiency.`
51. Wanderer: `cast fireball dummy`
52. Wait for Wanderer sees: `Your Fireball scorches a shimmering ward. Magic will not part it.`
53. Gamemaster: `inspect dummy`
54. Assert Gamemaster sees: `HP 99999/99999`
55. Gamemaster: `purge npc`
56. Assert Gamemaster sees: `Purged`
57. Gamemaster: `spawn tapestry-test-fixtures:test-dummy`
58. Assert Gamemaster sees: `Spawned: a training dummy`
59. Gamemaster: `set npc hp dummy 30`
60. Assert Gamemaster sees: `hp set to 30 (hp and max hp).`
61. Wanderer: `kill dummy`
62. Assert Wanderer sees: `You attack a training dummy!`
63. Wait for Wanderer sees: `a training dummy.`
64. Wanderer: `consider dummy`
65. Wait for Wanderer sees: `a training dummy.`
66. Wanderer: `consider dummy`
67. Wait for Wanderer sees: `a training dummy.`
68. Gamemaster: `tags add dummy req_ward_dispel`
69. Assert Gamemaster sees: `Added tag 'req_ward_dispel' to a training dummy.`
70. Wait for Wanderer sees: `Your blow glances off a shimmering ward. Steel will not part it.`
71. Gamemaster: `inspect dummy`
72. Assert Gamemaster does not see: `HP 30/30`
73. Assert Gamemaster does not see: `HP 0/30`
74. Wanderer: `consider dummy`
75. Wait for Wanderer sees: `Your blow glances off a shimmering ward. Steel will not part it.`
76. Gamemaster: `inspect dummy`
77. Assert Gamemaster does not see: `HP 30/30`
78. Assert Gamemaster does not see: `HP 0/30`
79. Gamemaster: `purge npc`
80. Assert Gamemaster sees: `Purged`
