# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A monorepo of official content packs for the Tapestry MUD engine. Each pack lives under `packages/@tapestry/<name>/` with a `pack.yaml` manifest and content files (YAML + optional JS). The engine ships plumbing; packs ship everything else -- rooms, NPCs, items, quests, and entire game systems.

## Packs

| Pack | Type | Role |
|------|------|------|
| `core` | core | Engine foundation: combat, commands, progression, mobs, socials. Every game depends on this. |
| `survival` | module | Hunger drain, eat/drink, regen scaling. |
| `biomes` | module | Shared room-tag vocabulary for terrain and biomes. |
| `cooking` | module | Cook-to-eat loop with survival interop. |
| `tinkers` | module | Crafting exemplar: materials, recipes, levelable bench. |
| `builder` | module | In-game builder tools. |
| `viewer` | module | Web viewer integration. |
| `example-pack` | world | Starter races, classes, tutorial area. Reference point for new worlds. |

## Commands

```bash
# Install dependencies (js-yaml for validation script)
npm ci

# Lint all pack manifests (runs tapestry validate in each pack directory)
npm test

# Validate a single pack
cd packages/@tapestry/<name>
tapestry validate

# Dry-run publish to see what would be published
node scripts/publish-changed.js --dry-run
```

Requires the Tapestry CLI on PATH: `npm install -g @tapestry-mud/cli`

## Testing

There are no isolation unit tests -- this is intentional. Pack scripts run inside the engine's embedded JS sandbox (Jint) against CLR-wrapped values; a Node/Jest harness would test a fiction. Read `TESTING.md` for the full rationale.

The verification sequence for any pack change:
1. `tapestry validate` -- manifest schema lint (fast, local).
2. Boot the engine in `strict` mode against a composed set that includes your pack. Look for `Pack validation complete: 0 issue(s) found`.
3. Playtest the affected behavior.

## Key conventions

**Manifest keys are snake_case.** `display_name`, `load_order`, `area_definitions`, `optional_dependencies` -- not camelCase.

**Use caret deps for inter-pack dependencies.** Exact pins are brittle when a dependency pack releases a patch. Prefer `"^0.1.4"` over `"0.1.4"`. Run `tapestry resolve` as a pre-flight before publishing to confirm the graph is satisfiable.

**A version bump must be in the tip commit.** CI publishes by comparing local `pack.yaml` versions against the registry. If a version bump is not in the final pushed commit, the publish step sees the old version as already published and silently skips that pack.

**`load_order` determines publish sequence.** `publish-changed.js` sorts by `load_order` ascending so dependencies land on the registry before their dependents. Keep `load_order` consistent with the dependency graph.

## System behavior lives in specs

`specs/` is the canonical source of truth for how each pack system behaves. Before asking "how does X work?", read the relevant spec. The index is at `specs/README.md`.

Do not duplicate spec content here or in code comments. If behavior is unclear, the spec (not the code) is authoritative -- if they diverge, the spec wins and the code is the bug.

## Publishing

CI (`publish.yml`) runs on every push to `master`: validates manifests, then publishes any pack whose `pack.yaml` version is not yet on the registry. Auth is GitHub OIDC -- no stored secret. To publish manually: `tapestry login && tapestry publish` inside the pack directory.
