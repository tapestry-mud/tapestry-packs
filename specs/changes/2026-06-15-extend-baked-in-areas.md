---
release: 0.2.4
specs: [builder.md]
---

# Extend Baked In Areas

## Why

A builder could edit a packed area's prose but not grow it. Standing in a
pack-shipped room, there was no way to `dig` a new room onto the zone: both `dig`
paths refused when the from-room carried `source_pack`, because a directional exit
written into a pack room's side-car vanishes when that room reloads from its pack
file on the next boot. The guard prevented a silently-vanishing exit, not a wrong
operation.

The engine's connection system (records that re-apply an exit to both endpoint
rooms at runtime and persist outside pack data) is exactly the right wire for a
boundary that must survive a packed-room reload. Routing the dig boundary through a
connection removes the vanishing-exit reason, so the refusal becomes a routing
branch.

## What

- `dig <dir>` from a pack-owned room now carves into the pack instead of refusing.
  It mints the authored room in the pack area's own namespace and area, then wires
  the boundary as a connection record via `tapestry.connections.create` (the pack
  room gets `dir`, the new room gets the opposite) - no `setRoomExit` on the
  boundary, so neither side is stored in pack data. The link re-applies at every
  boot and survives pack updates.
  (packages/@tapestry/builder/scripts/commands/dig.js)

- Shadow guard: before creating anything, the carve-into-pack branch checks
  `getExitTarget(fromId, dir)`. If the direction is already a real pack exit, `dig`
  refuses with "already taken" and changes nothing - a connection exit must never
  shadow the pack's own topology.
  (packages/@tapestry/builder/scripts/commands/dig.js)

- Boundary message (ASCII only, no confirmation prompt): when a dig extends a pack
  area, the new-room confirmation tells the builder the from-room belongs to a pack
  and the way back is a connection kept outside the pack, so it survives pack
  updates. (packages/@tapestry/builder/scripts/commands/dig.js)

- Onward digging from the new authored room is unchanged (authored-to-authored
  inline side-car exits). `dig <dir> <target>` (connect) still refuses from a
  pack-owned room and still refuses a pack room as a target; outward growth only,
  no splicing into a different pack room.
  (packages/@tapestry/builder/scripts/commands/dig.js)

Requires engine >=0.1.36, which adds the orphan-visibility surface: an extension
whose pack anchor is later removed shows `(orphaned)` in `rooms <area>` rather than
disappearing silently.
