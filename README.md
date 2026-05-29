# tapestry-packs

Official content packs for the [Tapestry MUD engine](https://tapestryengine.com).

This monorepo is the reference for how Tapestry packs are structured and published. The same tooling works for community packs.

---

## What's Here

| Pack | Description |
|------|-------------|
| `@tapestry/core` | Engine commands, combat, abilities, and core systems. Every Tapestry game depends on this. |
| `@tapestry/survival` | Sustenance system: hunger drain, eat/drink commands, and hunger-based regen scaling. |
| `@tapestry/biomes` | Shared world vocabulary for biomes and terrain — a thin layer of room tags content packs target. |
| `@tapestry/cooking` | Cook→eat crafting loop: raw ingredients cooked into food via survival interop. |
| `@tapestry/tinkers` | Tinkers-style crafting exemplar: materials scatter into the world, recipes are pack-owned JS, a levelable bench gates tiers. |
| `@tapestry/example-pack` | Starter races, classes, and a tutorial area. Good starting point for a new world. |

---

## What Packs Are

Packs are the unit of extension for everything in Tapestry -- content and systems alike.

The engine ships plumbing: an entity system, combat loop, event bus, command registry. Packs ship everything else. That includes the obvious things (rooms, NPCs, items, quests) but also entire game systems. A pack can implement crafting, an economy, an enhanced quest engine, a skill tree, a reputation system -- anything. System packs register their own tags and properties with the engine; content packs declare a dependency on them and use those tags in YAML. The CLI resolves the dependency graph and installs everything in the right order, the same way npm resolves packages.

This means the ecosystem can grow independently of the engine. Someone publishes a crafting system pack. A world builder adds it as a dependency and starts marking items as craftable in YAML. No engine changes needed.

A pack is a directory with a `pack.yaml` manifest and content files:

```
@yourscope/my-pack/
  pack.yaml               # name, version, engine constraint, dependencies
  areas/
    my-area/
      area.yaml           # area-level properties (level range, reset interval, flags)
      rooms/              # room definitions
      mobs/               # NPC definitions
      items/              # item definitions
  quests/                 # quest definitions
  scripts/                # system behavior, event hooks, custom commands (optional)
  help/                   # in-game help topics (optional)
```

**You can build a complete, playable world with nothing but YAML.** Rooms, NPCs with combat behavior, quests with branching paths and prerequisites, shops, trainers, loot tables -- all config files. JavaScript is available when you want event-driven behavior or to implement a new system, but you can ship a game without writing a single line of code.

---

## Building a Pack

```bash
npm install -g @tapestry-mud/cli
tapestry create pack @yourscope/my-pack
cd my-pack
# edit YAML files
tapestry validate
```

The scaffold includes annotated examples of every content type. See the [CLI docs](https://github.com/tapestry-mud/tapestry-cli) for the full authoring workflow.

---

## Publishing

Bump `version` in your pack's `pack.yaml`, then:

```bash
tapestry login
tapestry publish
tapestry dist-tag set @yourscope/my-pack stable 1.0.0
```

Your pack appears in the pack browser at [tapestryengine.com/packages.html](https://tapestryengine.com/packages.html). Anyone running `tapestry install @yourscope/my-pack` gets it.

---

## CI Auto-Publishing

On push to `master`, `.github/workflows/publish.yml` detects which packs have a version bump, publishes each changed pack, and tags it `stable`. No manual steps required.

To use the same setup for a community monorepo: copy `.github/workflows/publish.yml` and set a `REGISTRY_CI_TOKEN` secret in your repo.

---

## Links

- [tapestryengine.com](https://tapestryengine.com)
- [Browse all packs](https://tapestryengine.com/packages.html)
- [tapestry-cli](https://github.com/tapestry-mud/tapestry-cli) -- CLI and authoring docs
- [tapestry-public](https://github.com/tapestry-mud/tapestry-public) -- the engine

---

## License

[AGPL-3.0](LICENSE)
