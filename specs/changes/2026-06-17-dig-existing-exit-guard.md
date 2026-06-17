---
release: 0.2.5
specs: [builder.md]
---

# Dig Existing Exit Guard

## Why

The existing-exit guard on the carve path (added in 0.2.4 for the carve-into-pack
case) was gated on the from-room being pack-owned. Digging an already-occupied
direction from an authored room was unguarded: `dig <dir>` repointed the from-room's
forward exit to the freshly minted room and left the old target's reverse exit
pointing back as a one-way orphan. The hazard is identical to the pack case the
0.2.4 guard already covered; the authored carve path simply never checked (a latent
gap since the original dig, which the 0.2.4 pack guard exposed by asymmetry).

## What

- The carve-path existing-exit guard now runs for every from-room, not only
  pack-owned ones. Before creating anything, `dig <dir>` calls
  `getExitTarget(fromId, dir)`; if the direction is already occupied it refuses with
  "already taken" and changes nothing - no new room, no repointed exit, no orphan.
  (packages/@tapestry/builder/scripts/commands/dig.js)
- Because `getExitTarget` reads the live world, the guard catches both kinds of
  existing exit: an inline side-car exit and a connection-backed (linked) exit. You
  can no longer dig over a `link`ed or carve-into-pack boundary.
  (packages/@tapestry/builder/scripts/commands/dig.js)
