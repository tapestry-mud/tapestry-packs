---
release: 0.1.18
specs: [core-admin.md]
---

# Registry Introspection

## Why

The engine holds a full provenance ledger for every registry kind but surfaced it
nowhere an admin could reach. When a command or ability fired the wrong version or
went silently dead, there was no in-MUD way to ask who won a name and what it
shadowed. Tags had a registry view (`tags registry`) but properties - which carry
richer metadata - had none, an asymmetry with no reason behind it.

## What

- New admin command `registry`, a three-level provenance browser over the engine's
  `tapestry.registry.*` interop. Bare `registry` renders a Level 0 summary: every
  kind with its registration count and a conflict flag, as a width-fit chip grid,
  property and tag marked as the namespaced model. `registry <kind>` lists that
  kind's winners with shadow/ambiguity markers (Level 1). `registry <kind> <name>`
  shows the full ledger for one name - the winner's source location and, for an
  override, the shadowed loser it beat (Level 2). `registry conflicts` is the
  cross-kind view of every name with more than one claimant. `registry <kind> <text>`
  filters a kind by name or owner. An unknown kind prints the valid kinds, read from
  the summary rather than a hardcoded list.
- The honesty rule: policy kinds speak shadow/override; the two namespaced kinds
  (property, tag) speak ambiguity (a bare name declared by two or more packs). The
  browser shows each model in its own vocabulary rather than flattening them. Level 2
  for property surfaces value type, range, enum, and applies-to - the browse
  properties never had.
- `tags registry` is retired (superseded by `registry tag`); the other `tags`
  subcommands are untouched.
- Name truncation fix: a `padRight` helper in the new command collided with a
  same-named global in groups.js (which truncates) in the shared pack realm, cutting
  every registry name to the column width. Renamed the helper to keep it local and
  pad-only.
