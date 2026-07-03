---
capability: core-init
last-updated: 2026-07-03
---

# core-init

## Overview

Bootstrap registrations and lifecycle setup performed by the `@tapestry/core`
pack (load_order 0). On startup the pack registers rarity tiers, essence types,
and equipment display config via `scripts/init.ts`, wires event listeners for
corpse decay and player login messages, declares 16 equipment slots, defines the
`temperate` weather zone with full state-transition tables and terrain-specific
flavor text, and seeds the engine with MOTD data files and a two-room core area
(recall + donation pit).

---

## Behavior

### Pack manifest

- The pack is declared with `type: core`, `load_order: 0`, and
  `validation: strict`, making it the first pack loaded and the reference
  baseline for all content packs.
  (packages/@tapestry/core/pack.yaml:3)
- Required engine version is `>=0.1.29`.
  (packages/@tapestry/core/pack.yaml:8)
- Content roots declared in the manifest: `weather_zones`, `area_definitions`,
  `rooms`, `items`, `equipment_slots`, `scripts`, `strings`, `help`, `motd`,
  and `motd_color`.
  (packages/@tapestry/core/pack.yaml:13)

### Rarity tiers (init.js)

- Six tiers are registered in ascending order (0-5): `common`, `uncommon`,
  `rare`, `epic`, `artifact`, `ooak`.
  (packages/@tapestry/core/scripts/init.ts:4)
- `common` (order 0) has no display text, no decorators, color `white`, and
  `visible: false`; it is intentionally invisible in item labels.
  (packages/@tapestry/core/scripts/init.ts:4)
- `uncommon` (order 1) through `epic` (order 3) share the decorator pair
  `left: '-= '` / `right: ' =-'`. Colors are `white`, `green`, and `cyan`
  respectively.
  (packages/@tapestry/core/scripts/init.ts:5)
- `artifact` (order 4) and `ooak` (order 5) use the heavier decorator pair
  `left: '-=='` / `right: '==-'` and both use color `yellow`.
  (packages/@tapestry/core/scripts/init.ts:8)
- `ooak` ("One of a Kind") overrides the HTML class to
  `text-ansi-bright-magenta` despite sharing the terminal color `yellow` with
  `artifact`.
  (packages/@tapestry/core/scripts/init.ts:9)
- All tiers from `uncommon` upward set `visible: true`.
  (packages/@tapestry/core/scripts/init.ts:5)

### Essence types (init.js)

- Four essences are registered: `fire`, `shadow`, `storm`, `earth`.
  (packages/@tapestry/core/scripts/init.ts:11)
- Glyphs: fire `^`, shadow `~`, storm `*`, earth `#`.
  (packages/@tapestry/core/scripts/init.ts:11)
- Terminal colors: fire `red`, shadow `magenta`, storm `cyan`, earth `yellow`.
  (packages/@tapestry/core/scripts/init.ts:11)

### Equipment display config (init.js)

- `tapestry.equipment.setEmptyText('-nothing-')` is called during init; the
  string `-nothing-` appears in the equipment list for any slot that is unoccupied.
  (packages/@tapestry/core/scripts/init.ts:16)

### Equipment slots (equipment_slots.yaml)

- Sixteen slots are defined. Slot names, display labels, and max-equipped
  counts: light/Light (1), head/Head (1), neck/Neck (1), torso/Torso (1),
  cloak/Cloak (1), waist/Waist (1), arms/Arms (1), hands/Hands (1),
  wrist/Wrist (2), finger/Finger (2), shield/Shield (1), legs/Legs (1),
  feet/Feet (1), held/Held (1), floating/Floating (1), wield/Wield (1).
  (packages/@tapestry/core/equipment_slots.yaml:2)
- Only `wrist` and `finger` allow more than one item (`max: 2`).
  (packages/@tapestry/core/equipment_slots.yaml:28)

### Weather zones (weather_zones.yaml)

- One weather zone is declared: `temperate`.
  (packages/@tapestry/core/areas/weather_zones.yaml:1)
- Its valid states are `clear`, `cloudy`, `rain`, `storm`.
  (packages/@tapestry/core/areas/weather_zones.yaml:3)
- Weighted transition tables are defined for every state-to-state pair; for
  example `clear` transitions to itself 70%, cloudy 25%, rain 5%.
  (packages/@tapestry/core/areas/weather_zones.yaml:5)
- Flavor messages are provided for a single key, `forest`, matched biome-first: the
  engine's `WeatherService` tries the room's biome tag against this map before falling
  back to the room's `terrain` value, so any room tagged `biome: forest` gets this
  flavor regardless of its `terrain` property (which, since the terrain closed-set
  migration, is one of `indoors`, `outdoors`, or `underground` only -- never a place
  name). The `forest` entry covers `start`, optional `ongoing`, and `end` messages for
  each weather state, plus time-of-day transition messages for `dawn`, `day`, `dusk`,
  and `night`. The zone previously also carried `city` and `road` terrain-message
  entries; those had no biome equivalent, so they moved to room-level
  `weather_messages`/`time_messages` on the specific rooms that carried those terrain
  values (`example-pack`'s `town-square`/`example-room` for city flavor,
  `west-road` for road flavor) rather than staying on the zone or moving to an
  area-level block, which would shadow the biome lookup for sibling rooms with a
  different biome in the same area. See world-simulation.md in the tapestry engine repo
  for the full resolution chain.
  (packages/@tapestry/core/areas/weather_zones.yaml:9-30)

### Decay events (decay-events.js)

- A listener is registered on the `corpse.decayed` engine event.
  (packages/@tapestry/core/scripts/decay-events.ts:2)
- When the event fires with a non-empty `itemIds` array and a valid `roomId`,
  the message "Its belongings scatter to the ground." is broadcast to the room.
  (packages/@tapestry/core/scripts/decay-events.ts:6)
- If `roomId` is absent or `itemIds` is empty the handler exits silently.
  (packages/@tapestry/core/scripts/decay-events.ts:6)

### Login messages (login-messages.js)

- A listener is registered on the `player.login` engine event.
  (packages/@tapestry/core/scripts/login-messages.ts:1)
- The handler reads `playerName` from `event.data` and resolves the entity's
  current room via `tapestry.world.getEntityRoomId(entityId)`.
  (packages/@tapestry/core/scripts/login-messages.ts:3)
- If either `entityId` or `name` is missing, or if the entity has no room, the
  handler returns without emitting any message.
  (packages/@tapestry/core/scripts/login-messages.ts:5)
- On a valid login, the message "<name> materializes from the threads of the
  Pattern." is sent to everyone in the room except the logging-in player.
  (packages/@tapestry/core/scripts/login-messages.ts:10)

### Core area and rooms

- The core area (`id: core`) covers levels 1-99, has an effectively infinite
  reset interval (999999), and carries no flags.
  (packages/@tapestry/core/areas/core/area.yaml:2)
- The recall room (`tapestry-core:recall`, name "The Nexus") is tagged
  `safe` and `no_wander` and has terrain `indoors`. It contains a stone
  fountain fixture (`tapestry-core:fountain`) and is the system default recall
  destination.
  (packages/@tapestry/core/areas/core/rooms/recall.yaml:1)
- The recall room includes a `tapestry-cooking:campfire` fixture, creating a
  cross-pack dependency on the cooking pack at the core recall point.
  (packages/@tapestry/core/areas/core/rooms/recall.yaml:17)
- The donation pit (`tapestry-core:donation-pit`, name "The Donation Pit") is
  also tagged `safe` and `no_wander` with terrain `indoors`. It is linked
  one exit below the recall room and contains a `tapestry-cooking:microwave`
  fixture.
  (packages/@tapestry/core/areas/core/rooms/donation-pit.yaml:1)
- The stone fountain item (`tapestry-core:fountain`) is tagged `fixture`,
  `fill_source`, and `drinkable`, and provides `fill_type: water`.
  (packages/@tapestry/core/areas/core/items/fountain.yaml:4)

### MOTD data files

- Two MOTD files are registered: `data/motd.txt` (plain ASCII banner) and
  `data/motd_color.txt` (same banner with inline color tags such as `{yellow}`,
  `{cyan}`, `{red}`, `{white}`, and `{/}`).
  (packages/@tapestry/core/pack.yaml:21)
- The banner renders the word "TAPESTRY" in block letters and includes three
  guidance lines directing new players to the `commands`, `look`, and `help`
  commands.
  (packages/@tapestry/core/data/motd.txt:8)

---

## Rejected and Reverted

- None on record.

---

## Change Log

- None on record.
