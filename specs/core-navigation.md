---
capability: core-navigation
last-updated: 2026-07-22
---

# core-navigation

World movement, room observation, and session commands in @tapestry/core.

## Overview

This capability covers every command that lets a player move through the world, observe
their surroundings, discover connections between areas, and manage their session. It
spans six logical groups: directional movement, room observation (look/exits/areas),
portal traversal (enter/leave), admin room-linking (link/unlink/connections), world-state
queries (time/weather), and session/info commands (who, help, commands, motd, packs,
version, width, quit).

## Behavior

### Directional Movement

- Six cardinal directions are registered as commands: north (n), south (s), east (e),
  west (w), up (u), down (d). Each is in category "world" with role "player".
  (packages/@tapestry/core/scripts/commands/movement.ts:1-8; packages/@tapestry/core/scripts/commands/movement.ts:19-27)

- Movement is blocked when the actor is resting or sleeping; the player receives
  "You can't move while resting/sleeping. Type 'wake' to stand up."
  (packages/@tapestry/core/scripts/commands/movement.ts:30-34)

- Movement is blocked when the actor is in combat; the player receives "You can't move
  while fighting! Type 'flee' to escape."
  (packages/@tapestry/core/scripts/commands/movement.ts:35-38)

- If a door exists on the chosen exit and its isClosed flag is true, movement is blocked
  with "The <name> is closed." regardless of combat or rest state.
  (packages/@tapestry/core/scripts/commands/movement.ts:41-45)

- On successful movement, the room description is sent to the mover, disposition is
  triggered, and bystanders in both the old and new room receive arrival/departure
  messages (sleeping entities are excluded from those broadcasts).
  (packages/@tapestry/core/scripts/commands/movement.ts:48-65)

- The movement-triggered render honors the player's brief preference: when the
  core-declared `brief` bool player property is true, the handler passes `true` as the
  second argument to `tapestry.world.sendRoomDescription`, which suppresses only the
  description body (room name, `[Exits: ...]`, and entity lines are unchanged; engine
  >=0.1.48). Explicit `look` keeps the always-full one-arg call. Brief mode v1 scope is
  the six directional commands; enter/recall/leave/group follow renders stay full.
  (packages/@tapestry/core/scripts/commands/movement.ts:50-54;
  packages/@tapestry/core/properties.yml:22-25)


- The `brief` command (role player, category accessibility) toggles the preference:
  no argument flips it, `brief on` / `brief off` set it explicitly, anything else
  prints usage. The property persists on the player like other non-transient prefs.
  Help topic: help/brief.yaml. (packages/@tapestry/core/scripts/commands/brief.ts;
  packages/@tapestry/core/help/brief.yaml)

- On successful movement, the engine publishes the "player.direction.moved" event with
  entityId, leaderName, direction, fromRoom, toRoom, and arrivalFrom.
  (packages/@tapestry/core/scripts/commands/movement.ts:66-73)

- On failed movement (no exit in that direction), the player receives "You cannot go
  that way." and the engine publishes "player.move.failed".
  (packages/@tapestry/core/scripts/commands/movement.ts:75-81)

- Arrival messages use opposite-direction labels: arriving from north means the message
  reads "from the south"; arriving from up reads "from below".
  (packages/@tapestry/core/scripts/commands/movement.ts:10-17; packages/@tapestry/core/scripts/commands/movement.ts:63-65)

### Look and Examine

- "look" (alias: l) with no argument sends a full room description via
  sendRoomDescription, also sends a GMCP "Response.Look" payload containing room name,
  description, exits list, entities (npcs + other players), and items.
  (packages/@tapestry/core/scripts/commands/look.ts:211-236)

- A sleeping actor who types "look" with no argument receives "You can't see anything,
  you're asleep." and the command returns early.
  (packages/@tapestry/core/scripts/commands/look.ts:221-225)

- On a room look, any exits that have doors attached display a door status line formatted
  "<direction> (<name>, open|closed|closed, locked)".
  (packages/@tapestry/core/scripts/commands/look.ts:239-252)

- On a room look, keyword exits (portals) are listed as "You see: <name>, ..." after the
  door status line.
  (packages/@tapestry/core/scripts/commands/look.ts:254-263)

- On a room look, any NPC in combat has a combat status line rendered after the rest of
  the room content: "<name> is here, fighting! (<health tier>)".
  (packages/@tapestry/core/scripts/commands/look.ts:152-166)

- "look <target>" / "examine" (aliases: ex, exa) with a visible target delegates to
  lookAtTarget. Inventory items show name, slot, weight, rarity, and modifiers. Room
  entities (npc/player/container) show a bracketed name header, description, health tier,
  and worn-equipment list.
  (packages/@tapestry/core/scripts/commands/look.ts:71-149; packages/@tapestry/core/scripts/commands/look.ts:275-289)

- Health tiers for NPCs and players are determined by HP percentage: >=100% "is in
  perfect health", >=75% "has a few scratches", >=50% "has some small wounds", >=35% "is
  wounded", >=20% "is badly wounded", >=10% "is bleeding profusely", else "is near
  death".
  (packages/@tapestry/core/scripts/commands/look.ts:1-15)

- When looking at an NPC directly, the mob's "onLook" hook is fired (if a template_id is
  present) before the worn-equipment list renders.
  (packages/@tapestry/core/scripts/commands/look.ts:114-123)

- Worn equipment for NPCs and players is rendered in SlotRegistry order with right-
  aligned bracketed slot labels matching the equipment command style.
  (packages/@tapestry/core/scripts/commands/look.ts:47-69)

- NPC entities in room look carry a questMarker flag sourced from
  tapestry.quests.hasQuestMarker when the quests subsystem is present.
  (packages/@tapestry/core/scripts/commands/look.ts:185-188)

### Exits

- "exits" lists the directional exits available from the current room as a comma-
  separated list with the tag "Obvious exits: ...". If none exist, it outputs "There are
  no obvious exits."
  (packages/@tapestry/core/scripts/commands/exits.ts:1-15)

### Areas

- "areas" lists all world areas sorted by level range. Players see [level-range] name -
  short description. Builders and admins also see the area id, provenance tag, WIP status,
  room count, and override count.
  (packages/@tapestry/core/scripts/commands/areas.ts:6-41)

- Areas with a level range of exactly two elements display it as "min-max"; otherwise "?"
  is shown.
  (packages/@tapestry/core/scripts/commands/areas.ts:24-27)

### Recall

- "recall" teleports the actor to the room identified by the key "tapestry-core:recall"
  using tapestry.world.teleportEntity. On success, the actor receives a flash-of-light
  message and the room description is displayed. On failure, "You failed to recall." is
  sent.
  (packages/@tapestry/core/scripts/commands/recall.ts:1-19)

- There is no explicit combat or rest check in the recall command; those restrictions are
  not enforced at the command level.
  (packages/@tapestry/core/scripts/commands/recall.ts:1-19)

- On successful recall, the engine publishes "player.teleported" with entityId.
  (packages/@tapestry/core/scripts/commands/recall.ts:12-14)

### Portal Traversal (enter / leave)

- "enter <keyword>" looks up keyword exits in the current room via
  tapestry.portals.getKeywordExits. If a matching exit is found and is not locked or
  closed, the actor is teleported to the target room and the room description is shown.
  Bystanders in the origin room receive "<name> passes through the <portal name>."
  (packages/@tapestry/core/scripts/commands/enter.ts:1-50)

- If the keyword exit has a door and it is locked, "That is locked." is returned. If
  closed but not locked, "That is closed."
  (packages/@tapestry/core/scripts/commands/enter.ts:33-41)

- "leave" uses tapestry.returnaddress to retrieve the player's stored return room. The
  teleport happens before the return address is cleared so the address remains valid
  during the move event chain. After teleport the address is cleared and the room
  description is shown.
  (packages/@tapestry/core/scripts/commands/leave.ts:1-27)

- If the player has no return address, "leave" outputs "You have nowhere to return to."
  (packages/@tapestry/core/scripts/commands/leave.ts:8-10)

- On a successful "leave", the engine publishes "return.used" with entityId, fromRoomId,
  and toRoomId.
  (packages/@tapestry/core/scripts/commands/leave.ts:22-26)

### Room Linking (admin: link / unlink / connections)

- "link" and "unlink" are admin-only commands (category "admin", admin: true). They
  launch guided multi-step flows via tapestry.flows.trigger.
  (packages/@tapestry/core/scripts/commands/link.ts:1-12; packages/@tapestry/core/scripts/commands/unlink.ts:1-13)

- The link flow (id: "link_rooms", trigger: "admin_link") is cancellable and walks
  through: choose target pack, choose destination room (entry points first, then all),
  choose return exit type (direction, keyword, or one-way), optionally enter keywords,
  then confirm. If the opposite direction of the chosen return exit is available on the
  source room, it is auto-assigned without an extra step.
  (packages/@tapestry/core/scripts/flows/link.ts:10-351)

- The link flow calls tapestry.connections.create(fromRoomId, srcType, fromOpts,
  toRoomId, tgtType, toOpts) on completion. If create returns falsy, the admin is told
  "Failed to create connection. A link between these rooms may already exist."
  (packages/@tapestry/core/scripts/flows/link.ts:341-349)

- The unlink flow (id: "unlink_rooms", trigger: "admin_unlink") is cancellable and shows
  all connections for the current room. The admin selects one and confirms; the flow
  calls tapestry.connections.remove(id) on completion.
  (packages/@tapestry/core/scripts/flows/unlink.ts:4-77)

- Both flows keep their per-step working memory (chosen pack, rooms, exit types,
  keywords, confirmation) in flow scratch (`entity.scratch`), not the entity property
  bag, so a completed link or unlink leaves no `link_*` / `unlink_*` residue in
  `player.yaml`. (packages/@tapestry/core/scripts/flows/link.ts;
  packages/@tapestry/core/scripts/flows/unlink.ts)

- "connections" (admin-only) with no argument lists connections for the current room via
  tapestry.connections.getForRoom. With argument "all" it lists every connection on the
  server via tapestry.connections.getAll. Each connection is formatted as
  "<exit> --> <target room> (<return type>)".
  (packages/@tapestry/core/scripts/commands/connections.ts:1-38)

### Time and Weather

- "time" shows the current in-game hour and period. Hours 0-23 are mapped to named
  labels (midnight, predawn, dawn, morning, noon, afternoon, dusk, evening, night, etc.).
  Output format: "It is <label> (hour <N>). Period: <period>."
  (packages/@tapestry/core/scripts/commands/time.ts:1-19)

- "weather" resolves the actor's current room to an area via tapestry.world.getRoomArea,
  then calls tapestry.weather.current(areaId). Output: "The weather here: <state>." If
  the room has no area, "This area has no weather." is displayed.
  (packages/@tapestry/core/scripts/commands/weather.ts:1-16)

### Who and Session Info

- "who" displays a panel listing all online players with columns: role badge, name,
  highest level across all progression tracks, and race/class. Idle time is shown in
  seconds (s), minutes (m), or hours (h) when the player has been idle for 10 or more
  seconds; otherwise the idle column is blank.
  (packages/@tapestry/core/scripts/commands/who.ts:41-103)

- Admins viewing "who" also see an IP column sourced from the "last_ip" entity property.
  (packages/@tapestry/core/scripts/commands/who.ts:59-62; packages/@tapestry/core/scripts/commands/who.ts:83-85)

- Role badges: admins display "[Admin]", builders display "[Builder]", players with
  neither role display no badge.
  (packages/@tapestry/core/scripts/commands/who.ts:34-39)

- "help" (alias: ?) with no argument lists available help categories and topic counts. With
  a topic argument it queries tapestry.help and returns status ok, multiple matches, or no
  match; each result is rendered via tapestry.ui.help and also sent as a GMCP
  "Response.Help" message.
  (packages/@tapestry/core/scripts/commands/help.ts:1-71)

- "commands" (alias: cmds) lists all commands available to the calling player as a dense
  keyword chip grid, grouped into sections by category in declared vocabulary order (from
  the help registry), with a per-section count and a total count in the title. Columns
  auto-fit to the player's screen width. Empty and hidden categories are omitted. An
  optional free-text argument ("commands <text>") filters chips by case-insensitive
  substring against keyword, alias, category id, or category label; no match prints
  "No commands match '<text>'." The admin section title carries the annotation
  "admins only". The command always emits a "Commands.Open" GMCP trigger (payload
  { filter } when a filter was given, else {}) alongside the text grid; GMCP-inactive
  clients drop it. Drill into a command with "help <cmd>".
  (packages/@tapestry/core/scripts/commands/commands.ts:1-105)

- "motd" re-displays the message of the day by calling tapestry.world.sendMotd.
  (packages/@tapestry/core/scripts/commands/motd.ts:1-11)

- "packs" (admin-only) displays a panel of loaded content packs including display name,
  version, author, description, and copyright for each pack.
  (packages/@tapestry/core/scripts/commands/packs.ts:1-37)

- "version" (alias: ver) shows engine version and git SHA alongside each loaded pack's
  version and build ref in a two-section panel.
  (packages/@tapestry/core/scripts/commands/version.ts:1-47)

- "width" with no argument reports the player's current screen-width setting. "width
  <N>" (20-500) sets a per-player word-wrap column stored in the "screen_width" entity
  property. "width off" (or 0/none) disables wrapping. "width auto" (or reset/default)
  clears the override and returns to the server default.
  (packages/@tapestry/core/scripts/commands/width.ts:12-72)

- "quit" (alias: qq) sends "Farewell, adventurer. Until next time." to the actor,
  broadcasts "<name> fades from existence." to the room, then calls
  tapestry.world.disconnectPlayer.
  (packages/@tapestry/core/scripts/commands/quit.ts:1-18)

## Rejected and Reverted

- None on record.

## Change Log

- 2026-07-22 [flow-scratch-migration](changes/2026-07-22-flow-scratch-migration.md) - link/unlink wizards keep per-step working memory in entity.scratch (engine >=0.1.50) instead of the entity property bag, so completed flows leave no link_*/unlink_* residue in player.yaml
- 2026-07-04 [brief-mode-command](changes/2026-07-04-brief-mode-command.md) - brief mode v1 (tapestry#42): `brief` toggle command + core-declared `brief` bool player pref; directional movement renders name/exits/entities only when on (engine >=0.1.48 sendRoomDescription flag); `look` always full
- 2026-06-18 [command-catalog-display](changes/2026-06-18-command-catalog-display.md)
