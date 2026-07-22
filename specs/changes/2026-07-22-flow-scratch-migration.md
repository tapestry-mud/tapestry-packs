---
release: 0.1.26
specs: [core-navigation.md, builder.md, oracle.md]
---

# Flow Scratch Migration

## Why

Every wizard flow kept its between-step working memory in the entity property bag via
`entity.setProperty`. That bag is what the engine writes to `player.yaml`, so each
wizard run left its answers behind in the save permanently - the link wizard alone
wrote 14 `link_*` keys per run, the builder editors wrote `__edit_area` / `__edit_field`,
and the solo oracle wizard wrote eight `__solo_*` keys. Engine 0.1.50 added a private
per-flow scratch store (`entity.scratch`) and flipped the serializer to drop unregistered
keys, so this moves every official wizard onto scratch: working memory stops leaking into
the save, and scalar answers keep their real type.

## What

- **Link / unlink wizards** (core-navigation.md). `@tapestry/core` 0.1.26. The
  `link_rooms` and `unlink_rooms` flows read and write their per-step working memory
  (chosen pack, rooms, exit types, keywords, confirmation) through `entity.scratch`
  instead of `entity.setProperty`. `on_complete` reads the accumulated answers from the
  scratch it now receives. A completed link or unlink leaves no `link_*` / `unlink_*`
  residue in `player.yaml`. (packages/@tapestry/core/scripts/flows/link.ts;
  packages/@tapestry/core/scripts/flows/unlink.ts)

- **Builder room / area editors** (builder.md). `@tapestry/builder` 0.2.9. The
  edit-flow factory and the room/area editors use `entity.scratch` for the field-edit
  working keys. The `edit area` command no longer writes an `__edit_area` entity
  property; it seeds the id into the flow at creation via
  `flows.trigger(entityId, "builder_edit_area", { edit_area: areaId })`, and the area
  editor resolves the area under edit from the `edit_area` scratch key (falling back to
  the current room's area). (packages/@tapestry/builder/scripts/commands/edit.ts;
  packages/@tapestry/builder/scripts/flows/editors-area.ts;
  packages/@tapestry/builder/scripts/flows/edit-flow-factory.ts)

- **Solo oracle wizard** (oracle.md). `@tapestry/oracle` 0.6.1. The `solo` flow holds
  its collected inputs (scenario/idea, name, level range, size, destination pack, seed)
  in `entity.scratch` between steps. A completed solo run leaves no `solo_*` residue in
  `player.yaml`. (packages/@tapestry/oracle/scripts/flows/solo-flow.ts)

- **Engine floor** (all three). Each pack's documented engine floor rises to `>=0.1.50`,
  the release that introduced `entity.scratch` and the `flows.trigger` scratch seed. The
  `character_creation` counter-example is unchanged: `class` / `race` are real registered
  character fields and stay on `entity.setProperty`.
