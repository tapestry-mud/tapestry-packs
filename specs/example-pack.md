# example-pack

## Overview

`@tapestry/example-pack` is the official starter and demo world for the Tapestry engine. It
ships two playable classes (warrior and mage), two playable races (human and elf), a
three-step character-creation flow, two areas (starter-town and example-area), and a set of
scripted mobs and commands that demonstrate core engine extension points. Pack authors are
expected to copy and adapt this pack as their starting point.

Current version: 0.1.9. Declares `engine: ">=0.1.7"` and depends on
`@tapestry/core 0.1.4`, `@tapestry/biomes 0.1.1`, and `@tapestry/cooking 0.1.2`.
(packages/@tapestry/example-pack/pack.yaml:8-13)

Content is loaded via glob patterns under the pack root: area definitions, rooms, items,
mobs, and scripts. (packages/@tapestry/example-pack/pack.yaml:17-23)

A `properties.yml` registers one custom pack property -- `dialogue` (type: string, applies
to NPC entities) -- used to attach dialogue script references to vendor and quest mobs.
(packages/@tapestry/example-pack/properties.yml:2-5)

---

## Behavior

### Classes

- The warrior class is registered with id `warrior`, track `combat`, and tagline "Master of
  arms and armor". It is allowed for races with category `human` or `elf` and all three
  genders. (packages/@tapestry/example-pack/scripts/classes/warrior.js:2-11)

- Warrior stat growth is `2d6+2` max_hp (boosted by constitution) and `1d4` max_movement
  (boosted by dexterity). (packages/@tapestry/example-pack/scripts/classes/warrior.js:13-19)

- The warrior ability path unlocks: dodge (L1), kick (L3), parry (L5), battle_stance (L8),
  bash (L12), second_attack (L18), enhanced_damage (L25). Five trains per level.
  (packages/@tapestry/example-pack/scripts/classes/warrior.js:21-29)

- The mage class is registered with id `mage`, track `magic`, and tagline "Student of arcane
  forces". It is allowed for races with category `human` or `elf` and all three genders.
  (packages/@tapestry/example-pack/scripts/classes/mage.js:2-11)

- Mage stat growth is `1d6` max_hp (boosted by constitution) and `2d4+1` max_resource
  (boosted by intelligence). (packages/@tapestry/example-pack/scripts/classes/mage.js:13-19)

- The mage ability path unlocks: cure_light (L1), fireball (L3), shield (L5), blindness
  (L10), poison (L15), second_cast (L20). Five trains per level.
  (packages/@tapestry/example-pack/scripts/classes/mage.js:21-28)

### Races

- The human race is registered with id `human`, race_category `human`, and tagline
  "Adaptable and ambitious". All six primary stat caps are 25, with max_hp cap 18,
  max_resource cap 18, max_movement cap 16. Cast cost modifier: -10.
  (packages/@tapestry/example-pack/scripts/races/human.js:2-22)

- The elf race is registered with id `elf`, race_category `elf`, and tagline "Graceful and
  attuned to magic". Elves have higher caps for intelligence (28), wisdom (27), and
  dexterity (28), but lower constitution (20) and max_hp cap (16) compared to humans.
  Max_resource cap is 22 and max_movement cap is 18. Cast cost modifier: -15.
  (packages/@tapestry/example-pack/scripts/races/elf.js:1-21)

### Character Creation Flow

- A flow is registered with id `character_creation`, triggered on `new_player_connect`. The
  wizard surface shows three labeled steps: Race, Gender, Class.
  (packages/@tapestry/example-pack/scripts/flows/character_creation.js:24-32)

- Step order: welcome (info text), race (choice), gender (choice), class (choice). No
  `on_complete` handler; the engine seeds starting alignment automatically at flow
  completion. (packages/@tapestry/example-pack/scripts/flows/character_creation.js:33-92)

- The race step calls `tapestry.races.getAll()` and maps the live registry to options, so it
  reflects whatever races are loaded at runtime rather than a hardcoded list.
  (packages/@tapestry/example-pack/scripts/flows/character_creation.js:44-56)

- The class step calls `tapestry.classes.getEligibleClasses({ race, gender })` after race and
  gender are set, filtering classes by `allowed_categories` and `allowed_genders`.
  (packages/@tapestry/example-pack/scripts/flows/character_creation.js:73-88)

- Three gender options are defined as a module-level constant: male (he/him), female
  (she/her), and other (they/them). NPC address style is documented inline per option.
  (packages/@tapestry/example-pack/scripts/flows/character_creation.js:3-22)

### Hello Command

- Registers a command with name `hello`, alias `hi`, category `social`, role `player`. An
  optional `target` text argument defaults to the string `'world'` when omitted. The actor
  receives "Hello, \<target\>!" and the room receives "\<actor\> says hello to \<target\>."
  (packages/@tapestry/example-pack/scripts/commands/hello.js:3-17)

### Mob Scripts

- The grizzled-scout script (`tapestry-example-pack:grizzled-scout`) demonstrates all three
  mob behavior hook entry points. `onLook` fires an emote and a delayed `say` addressed to
  the looking player. `onAttack` fires a `say` naming the attacker (or "someone" if
  unresolved). `onDeath` sends a message directly to the room via `tapestry.world.sendToRoom`
  because the entity is already gone at death time and `mob.entityId` is unavailable.
  (packages/@tapestry/example-pack/scripts/mobs/grizzled-scout.js:3-22)

- The guide script (`tapestry-example-pack:guide`) implements `onSay` keyword dispatch:
  greets on help/hello/hi; directs to the blacksmith ("just south") on weapon/equipment/
  blacksmith keywords; directs to the inn ("to the north") on inn/rest/sleep keywords.
  (packages/@tapestry/example-pack/scripts/mobs/guide.js:1-25)

### Areas

- Two areas ship: `starter-town` (level range 1-5, flags: city, safe_recall) and
  `example-area` (level range 1-5, flag: safe_recall, no city flag). Both use a
  1800-second reset interval and temperate weather zone.
  (packages/@tapestry/example-pack/areas/starter-town/area.yaml;
  packages/@tapestry/example-pack/areas/example-area/area.yaml)

- The `example-area` contains a single room, `example-room` ("Example Town Square"), which
  spawns the guide mob (persistent) and fixtures a shiny-coin. It exits north to
  `tapestry-example-pack:town-square`.
  (packages/@tapestry/example-pack/areas/example-area/rooms/example-room.yaml)

### starter-town Rooms and Spawns

- `town-square` is the hub and recall point (tags: safe, recall_point). It connects north to
  the inn, south to training-grounds, east to the general-store, west to west-road, and down
  to mine-entrance. Persistent spawns: town-guard and blacksmith. Fixtures include the
  fountain, town-sign, brass-ring, travel-ration, and a `@tapestry/cooking` raw-meat item.
  (packages/@tapestry/example-pack/areas/starter-town/rooms/town-square.yaml)

- `training-grounds` (terrain: outdoors, south of town-square) spawns 2 goblins, 1
  goblin-chief, 1 test-dummy, and persistent warrior-trainer and mage-trainer. Fixtures:
  iron-sword, leather-helm, wooden-shield.
  (packages/@tapestry/example-pack/areas/starter-town/rooms/training-grounds.yaml)

- `wilderness-path` (terrain: forest) spawns 2 goblins, 1 goblin-chief, and 1 drowsy-wolf.
  Fixtures: gnarled-staff.
  (packages/@tapestry/example-pack/areas/starter-town/rooms/wilderness-path.yaml)

- `deep-woods` (terrain: forest, biome: forest) spawns 1 grizzled-scout. Fixtures:
  wolfskin-gloves. This is the room where the onLook/onAttack/onDeath hook demo fires.
  (packages/@tapestry/example-pack/areas/starter-town/rooms/deep-woods.yaml)

- The `inn` ("The Wanderer's Rest", tags: safe, no_wander) spawns a persistent old-hermit
  and fixtures a healing-draught.
  (packages/@tapestry/example-pack/areas/starter-town/rooms/inn.yaml)

- The `general-store` (tags: safe, no_wander) spawns a persistent merchant and fixtures
  silver-ring, traveler-cloak, and leather-boots.
  (packages/@tapestry/example-pack/areas/starter-town/rooms/general-store.yaml)

- `hilltop` (terrain: outdoors, accessible via west-road) has no mob spawns. It fixtures the
  windswept-amulet (marked rare in description markup).
  (packages/@tapestry/example-pack/areas/starter-town/rooms/hilltop.yaml)

- `mine-entrance` and `mine-shaft` form a two-room underground chain (terrain: underground).
  mine-entrance fixtures a glowing-lantern; mine-shaft fixtures a rusty-dagger and
  iron-chain.
  (packages/@tapestry/example-pack/areas/starter-town/rooms/mine-entrance.yaml;
  packages/@tapestry/example-pack/areas/starter-town/rooms/mine-shaft.yaml)

### Notable Mobs

- The grizzled-scout YAML (mob_level 3, behavior: stationary, no disposition tag, neutral by
  default) wears a rusty-dagger and leather-cap so that `look scout` exercises the equipment
  list rendering path. (packages/@tapestry/example-pack/areas/starter-town/mobs/grizzled-scout.yaml)

- The town-guide YAML (mob_level 5, tags: no_kill, base_disposition: friendly) uses an
  idle_chance of 0.6 on a 20-second interval to fire ambient say/emote lines when not being
  talked to. It references `mobs/guide.js` for its `onSay` script.
  (packages/@tapestry/example-pack/areas/starter-town/mobs/guide.yaml)

- The goblin (mob_level 3, base_disposition: hostile, behavior: wander) wanders within
  area boundary. It drops a guaranteed goblin-ear plus one loot pool roll (rusty-dagger /
  leather-scrap / small-coin-pouch) with a 5% rare-bonus chance.
  (packages/@tapestry/example-pack/areas/starter-town/mobs/goblin.yaml)

- The goblin-chief (mob_level 7, base_disposition: neutral, behavior: stationary) has
  battle_chance/interval for in-combat kick usage, drops 2x goblin-ear and 1x iron-key
  guaranteed, 2 pool rolls, and a 15% rare-bonus table containing chieftain-ring,
  crude-iron-crown, and rare-gem.
  (packages/@tapestry/example-pack/areas/starter-town/mobs/goblin-chief.yaml)

- The drowsy-wolf spawns in `rest_state: sleeping`. While sleeping, MobAI suppresses
  wandering and idle commands; combat auto-wakes it. This demonstrates the posture gate.
  (packages/@tapestry/example-pack/areas/starter-town/mobs/drowsy-wolf.yaml:17-23)

- The blacksmith (tags: vendor, quest, no_kill) references a `dialogue` property
  (`tapestry-example-pack:blacksmith-intro`), exercising the custom pack property registered
  in `properties.yml`. (packages/@tapestry/example-pack/areas/starter-town/mobs/blacksmith.yaml)

- The warrior-trainer (tag: skill_trainer, tier: apprentice) trains the full warrior ability
  list: dodge, kick, parry, battle_stance, bash, second_attack, enhanced_damage.
  (packages/@tapestry/example-pack/areas/starter-town/mobs/warrior-trainer.yaml)

- The mage-trainer (tag: skill_trainer, tier: apprentice) trains the full mage ability list:
  cure_light, fireball, shield, blindness, poison, second_cast.
  (packages/@tapestry/example-pack/areas/starter-town/mobs/mage-trainer.yaml)

### Smoke Test

- A pack-level smoke test lives at
  `packages/@tapestry/example-pack/tests/smoke/core-journey.md`. It sets up two players
  (Alice and Wanderer) and verifies: both appear in `who`, Alice sees "The Nexus" on `look`,
  Wanderer receives Alice's `say` output, and both can `quit`.
  (packages/@tapestry/example-pack/tests/smoke/core-journey.md)

---

## Rejected and Reverted

- None on record.

---

## Change Log

- None on record.
