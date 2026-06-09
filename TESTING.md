# Testing Packs

Tapestry packs are **not** unit-tested in isolation, and that is a deliberate
choice — not an oversight. A mechanical "no test files → untested" read of this
repo is wrong. This document explains how pack correctness is actually verified,
and why the usual unit-test approach doesn't fit.

## Why there are no isolation unit tests

A pack is not a library you can import and call. Each pack script runs inside the
engine's embedded JavaScript sandbox (Jint), registering behavior by calling a
global `tapestry` object at load time:

```js
tapestry.commands.register({ /* ... */ });
tapestry.events.on('sustenance.changed', handler);
tapestry.packs.export('getHungerTier', fn);
```

Cross-pack (and cross-file) sharing goes through `tapestry.packs.export` /
`tapestry.packs.require` -- an engine-mediated, dependency-edge-gated registry, not a
Node module system. There is still no `module.exports` and no Node resolution: a
`require()`d member only exists inside a composed, running engine, so there is still
no handler to import into a Node test harness. Two consequences follow:

1. **Behavior only exists once packs are composed.** Cross-pack calls — e.g.
   `tapestry.packs.call('@tapestry/survival', 'getHungerTier', id)` — only resolve
   when both packs are loaded together. A pack tested alone can't exercise its real
   integration surface.
2. **Node is the wrong runtime.** The engine runs scripts under Jint with CLR value
   marshalling. Values arriving from the engine are CLR-wrapped — e.g.
   `survival/sustenance.js` calls `Number(evt.data.sustenanceValue)` precisely
   because a bare `+` would string-concatenate a CLR-wrapped number. A Jest/Node
   test runs on V8 with plain JS numbers and would never reproduce that, so it would
   be testing a fiction.

So a pack-level unit suite would be low-fidelity at best and misleading at worst.
We verify behavior where it actually lives: in the composed engine.

## How packs are actually verified

### 1. Engine load-time composition gate (the primary gate)

When the engine boots a set of packs, its `PackValidator` runs a battery of checks
against the *composed* world. Most are fatal (they abort the boot); some downgrade
to warnings when a pack sets `validation: lenient` in its `pack.yaml` (the default
is `strict`). The gate covers, among others:

- Duplicate entity IDs and pack-namespace mismatches
- Rooms referencing undefined areas; areas referencing undefined weather zones
- JavaScript syntax errors (fatal to the boot)
- Unknown tags / properties, and tag/property type mismatches
- `spawn_on` distribution selectors that cross a pack boundary without a declared
  dependency edge
- **Required dependencies are present** — a pack declaring a dependency on a pack
  that isn't loaded fails the boot.
- **Static interop resolution** — every literal-argument `tapestry.packs.call(...)`
  / `tapestry.packs.has(...)` is resolved at load: the caller must declare a
  dependency edge on the target, and (for `call`) the named export must exist. A
  typo'd or missing cross-pack call fails the boot with a located error
  (`pack (file:line): ...`) — **even if the call sits on a code path that never runs**.

Because this runs on **every boot**, a broken composition is caught immediately and
loudly, not when some cold branch eventually executes in front of a player.

### 2. `tapestry validate` (manifest lint)

`tapestry validate` checks a single pack's `pack.yaml` against the manifest schema
(required fields, types, scoped-name format, enum values). It is a fast
authoring-time sanity check. It does **not** resolve dependencies, parse
JavaScript, or perform cross-pack analysis — that is the engine gate's job, which
needs the full composed set a single-pack lint doesn't have.

### 3. Strict-mode boot + playtest before deploy

Every gameplay change is exercised by booting the engine in `strict` mode against
the composed pack set and playing it. This is the top of the testing pyramid: it
covers behavior that only emerges in a live, multi-pack, real-runtime session —
exactly what isolation tests can't reach.

## Verifying a pack change

1. Run `tapestry validate` in the pack directory — manifest sanity.
2. Boot the engine in `strict` mode against a composed set that includes your pack,
   and confirm it reaches `Pack validation complete: 0 issue(s) found`.
3. Playtest the affected behavior.

If the composition gate finds a problem, it names the pack, file, and line.
