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
attempted damage. Steps 45-56 (now renumbered - see Task 16 below) prove an
ability (Fireball, `cast`) is ALSO blocked by the ward, not just melee -
closing the bypass a warded boss had via any `can_target:["npc"]` spell or
skill. The steps after that prove the exact-restore math on a mob whose
current HP is BELOW its max (`set npc hp dummy 30`, then some real unwarded
damage lands before tagging it warded) - a fixture where "restore to the
exact pre-hit value" and the old bug's "restore to max" would visibly
disagree, unlike the 99999-HP fixture above where they coincide. Since the
runner has no variable capture, the discriminator is two literal `does not
see` exclusions (`HP 30/30` rules out the overshoot-to-max bug, `HP 0/30`
rules out a stuck-at-floor no-op) rather than asserting the single exact
number, which is unknown at scenario-authoring time (real melee damage, not
scripted).

Task 16 (playtest bug fix): the tool lookup in `dispel.ts` originally walked
only `tapestry.inventory.getContents` (carried items), so a player who
WIELDED the staff - which its own item text explicitly invites ("Level it at
a ward and DISPEL", `slot: wield`) - got the failure message even though they
were plainly holding it (`EquipmentManager.Equip` moves an item OUT of
Contents into the Equipment slot dictionary). The fix adds an
`tapestry.equipment.getSlots` fallback so an equipped `cap_<CAP>`-tagged item
also answers. The new steps below prove the wielded path: `wield` moves the
staff out of `inventory` entirely (proving the assertion genuinely exercises
the Equipment path, not a residual Contents hit), `dispel` still succeeds,
and `remove` restores it to carried before the pre-existing combat steps
run unchanged.

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
21. Wanderer: `dispell`
22. Assert Wanderer sees: `There is nothing here to dispel.`
23. Gamemaster: `inspect goblin`
24. Assert Gamemaster sees: `cap_cleared_ward_dispel`
25. Gamemaster: `inspect room`
26. Assert Gamemaster does not see: `cap_cleared_ward_dispel`
27. Wanderer: `inventory`
28. Assert Wanderer sees: `a staff of dispel ward`
29. Gamemaster: `purge npc`
30. Assert Gamemaster sees: `Purged`
31. Gamemaster: `spawn tapestry-example-pack:goblin`
32. Assert Gamemaster sees: `Spawned: a goblin`
33. Gamemaster: `tags add goblin req_ward_dispel`
34. Assert Gamemaster sees: `Added tag 'req_ward_dispel' to a goblin.`
35. Wanderer: `wield staff`
36. Assert Wanderer sees: `You wield a staff of dispel ward.`
37. Wanderer: `inventory`
38. Assert Wanderer sees: `You are carrying nothing.`
39. Wanderer: `dispel`
40. Assert Wanderer sees: `You level a staff of dispel ward. The ward parts with a sound like tearing cloth.`
41. Gamemaster: `inspect goblin`
42. Assert Gamemaster sees: `cap_cleared_ward_dispel`
43. Wanderer: `remove staff`
44. Assert Wanderer sees: `You remove a staff of dispel ward.`
45. Wanderer: `inventory`
46. Assert Wanderer sees: `a staff of dispel ward`
47. Gamemaster: `purge npc`
48. Assert Gamemaster sees: `Purged`
49. Gamemaster: `teleport Gamemaster tapestry-test-fixtures:test-arena`
50. Gamemaster: `teleport Wanderer tapestry-test-fixtures:test-arena`
51. Gamemaster: `spawn tapestry-test-fixtures:test-dummy`
52. Assert Gamemaster sees: `Spawned: a training dummy`
53. Gamemaster: `tags add dummy req_ward_dispel`
54. Assert Gamemaster sees: `Added tag 'req_ward_dispel' to a training dummy.`
55. Wanderer: `kill dummy`
56. Assert Wanderer sees: `You attack a training dummy!`
57. Wait for Wanderer sees: `Your blow glances off a shimmering ward. Steel will not part it.`
58. Gamemaster: `inspect dummy`
59. Assert Gamemaster sees: `HP 99999/99999`
60. Wanderer: `dispel`
61. Assert Wanderer sees: `You level a staff of dispel ward. The ward parts with a sound like tearing cloth.`
62. Wait for Wanderer sees: `a training dummy.`
63. Gamemaster: `inspect dummy`
64. Assert Gamemaster does not see: `HP 99999/99999`
65. Gamemaster: `purge npc`
66. Assert Gamemaster sees: `Purged`
67. Gamemaster: `spawn tapestry-test-fixtures:test-dummy`
68. Assert Gamemaster sees: `Spawned: a training dummy`
69. Gamemaster: `tags add dummy req_ward_dispel`
70. Assert Gamemaster sees: `Added tag 'req_ward_dispel' to a training dummy.`
71. Gamemaster: `learn Wanderer fireball 100`
72. Assert Gamemaster sees: `Granted Fireball to Wanderer at 100% proficiency.`
73. Wanderer: `cast fireball dummy`
74. Wait for Wanderer sees: `Your Fireball scorches a shimmering ward. Magic will not part it.`
75. Gamemaster: `inspect dummy`
76. Assert Gamemaster sees: `HP 99999/99999`
77. Gamemaster: `purge npc`
78. Assert Gamemaster sees: `Purged`
79. Gamemaster: `spawn tapestry-test-fixtures:test-dummy`
80. Assert Gamemaster sees: `Spawned: a training dummy`
81. Gamemaster: `set npc hp dummy 30`
82. Assert Gamemaster sees: `hp set to 30 (hp and max hp).`
83. Wanderer: `kill dummy`
84. Assert Wanderer sees: `You attack a training dummy!`
85. Wait for Wanderer sees: `a training dummy.`
86. Wanderer: `consider dummy`
87. Wait for Wanderer sees: `a training dummy.`
88. Wanderer: `consider dummy`
89. Wait for Wanderer sees: `a training dummy.`
90. Gamemaster: `tags add dummy req_ward_dispel`
91. Assert Gamemaster sees: `Added tag 'req_ward_dispel' to a training dummy.`
92. Wait for Wanderer sees: `Your blow glances off a shimmering ward. Steel will not part it.`
93. Gamemaster: `inspect dummy`
94. Assert Gamemaster does not see: `HP 30/30`
95. Assert Gamemaster does not see: `HP 0/30`
96. Wanderer: `consider dummy`
97. Wait for Wanderer sees: `Your blow glances off a shimmering ward. Steel will not part it.`
98. Gamemaster: `inspect dummy`
99. Assert Gamemaster does not see: `HP 30/30`
100. Assert Gamemaster does not see: `HP 0/30`
101. Gamemaster: `purge npc`
102. Assert Gamemaster sees: `Purged`
