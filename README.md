# tapestry-packs

Official Tapestry content packs.

## Packs

- `@tapestry/core` - Engine commands, abilities, combat, and core systems
- `@tapestry/example-pack` - Starter races, classes, and tutorial area

## Publishing

Bump `version:` in the pack's `tapestry.yaml` before merging to master. CI automatically publishes changed packs and tags them `stable`.

## Community Packs

Copy `.github/workflows/publish.yml` and swap in your own `REGISTRY_TOKEN` secret. The CLI commands are identical for official and community packs.

See [tapestryengine.com](https://tapestryengine.com) for documentation.
