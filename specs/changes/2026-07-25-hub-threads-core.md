---
release: 0.1.27
specs: [core-combat.md, core-progression.md, core-navigation.md]
---

# Hub and Threads - Core

## Why

The roguelite hub-and-threads game (threadwalker) needs four things from core that the old
solo-firehose model never provided: a death that never strands your gear, a boss that a bigger
number alone cannot beat, a survivability axis that is actually gear (not a character-level
grind), and a way for a world to send `recall` to its own hub. These are the core-side pieces
of the game-hub-threads v1 slice; the run machinery that drives them lives in `@tapestry/oracle`.

## What

**Tier-scaled death that never strands gear (core-combat).** The old handler spawned a corpse,
stripped every worn item onto it, and recalled the player naked. The new handler creates no
corpse and touches no equipment on any path. It reads the player's `oracle_active_run` composite
`<runAreaId>|<deathMode>|<entryRoomId>` (the sole death-mode carrier; there is no cross-pack read
of oracle state). Grind-tier death respawns at the run entry, keeps everything, and repops the
run now (see below). The Unraveling ejects to the hub via the return-address and tears the run
down. A death outside any run wakes the player at their recall room, intact. `player.death` still
fires on every path (the XP-penalty and group-clear listeners depend on it).

Because oracle depends on core and never the reverse, core cannot call oracle's teardown or
visited-clear directly. It publishes two events instead, dispatched synchronously in-process:
`run.unraveled` (oracle tears down the run area) and `run.grind_repop` (oracle clears the run's
visited-room state so the next visit spawns fresh instances). The grind path also calls
`world.resetArea` for any authored spawn-rule content; oracle's own lazily-spawned mobs are
handled by the visited-clear, since `resetArea` does not touch them.

**Boss immunity gate - the ward (core-combat).** A mob tagged `req_<cap>` takes zero effective
damage until its own `cap_cleared_<cap>` runtime property is set. The gate lives on
`entity.vital.changed` - the one event every HP write funnels through - not `combat.hit`, so it
catches abilities and spells, not just melee, and restores the exact post-clamp amount lost
(never overshooting to full). The `dispel` verb (v1's one capability instance) finds a
`cap_ward_dispel`-tagged tool whether carried or wielded and writes the clear on the mob
instance, never a room flag, so a repopped or re-minted boss is warded again by construction.

**Pure-gear HP (core-progression).** Both level-up tracks stopped granting `max_hp` (and the
example classes' `max_hp` stat-growth terms were removed). Player max HP is now the flat
race/class base plus gear modifiers only, never a character-level grind - character level gates
nothing.

**Gear legibility on examine (core-navigation).** `renderItemStats` is factored out and called
from the room-floor branch as well as the inventory branch, so slot / weight / rarity / rolled
modifiers show on an item lying on the ground - the compare-before-you-pick-it-up case - with an
id guard so a same-named worn item cannot render under a room item's banner.

**Recall honors recall_room_id (core-navigation).** The `recall` verb now reads the player's
`recall_room_id` property (falling back to the historical `tapestry-core:recall`), matching what
the death handler already did. A world that ships its own hub can point `recall` at it; worlds
that set nothing keep the old destination.
