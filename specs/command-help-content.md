---
capability: command-help-content
last-updated: 2026-06-17
---

# Command Help Content

## Overview

This capability is the pack-side half of the command and help registry. The engine
owns command dispatch and the help index; the packs own the content. That content is
three things: a declared list of help categories, command registrations that carry
behavior only, and a help topic for every command and social.

The split is deliberate. A command registration says what a command does at runtime.
A help topic says how to describe it to a player. Keeping the description text in the
help topic means there is exactly one place to edit player-facing wording, and the
catalog and the help system read from the same declared vocabulary.

The engine release that ships the gates enforcing this contract is recorded with the
engine. This spec records only the pack content those gates run against.

## Behavior

### Declared category vocabulary

- `@tapestry/core` ships the canonical category list as a YAML sequence under a single
  `categories:` key. Each entry has an `id` and a display `label`; declaration order is
  display order. (packages/@tapestry/core/help/categories.yaml)

- The list declares thirteen categories: movement, communication, character, combat,
  inventory, shop (label Trade), group (label Grouping), world, rest, social,
  accessibility, builder (label Building), and admin (label Immortal).
  (packages/@tapestry/core/help/categories.yaml)

- The `social` category carries `hidden: true`. A hidden category is a valid category for
  topics to declare, but the catalog does not list it and does not list the topics filed
  under it. (packages/@tapestry/core/help/categories.yaml)

- Every help topic's `category` value must be one of these declared ids. Topics across all
  packs were re-filed into this vocabulary so no topic names an undeclared category.
  (packages/@tapestry/core/help/categories.yaml)

### Command registrations carry behavior only

- Command registrations no longer carry `description` or `category` fields. Those fields
  were removed from every registration; the registration keeps only runtime behavior
  (name, aliases, roles, args, gmcp, handler). The player-facing description now lives in
  the command's help topic. (packages/@tapestry/core/scripts/commands/say.ts:1-6)

- The strip applies across packs, not just core: the same two fields were removed from
  command registrations in `@tapestry/builder`, `@tapestry/example-pack`,
  `@tapestry/survival`, `@tapestry/viewer`, `@tapestry/cooking`, and `@tapestry/tinkers`.
  (packages/@tapestry/survival/scripts/commands/eat.ts; packages/@tapestry/tinkers/scripts/commands/craft.ts)

- Social registration was stripped the same way. The init loop no longer sets a `category`
  or a `description` on each social command; those values now come from the per-social help
  topics. (packages/@tapestry/core/scripts/socials/init.ts)

### One help topic per command (coverage contract)

- Every registered command has a help topic. core authored topics for the commands that
  previously had none, so the topic set covers the full command surface.
  (packages/@tapestry/core/help/commands.yaml)

- A help topic declares `id`, `title`, `category`, `brief`, `body`, `keywords`, and an
  optional `see_also`. The `category` must be a declared id; `see_also` lists other topic
  ids. (packages/@tapestry/core/help/look.yaml:22)

- Packs that own commands also own their help topics. `@tapestry/cooking` authors a topic
  for its `cook` command (filed under inventory).
  (packages/@tapestry/cooking/help/cook.yaml)

- `@tapestry/tinkers` authors topics for `copy`, `craft`, and `recipes`.
  (packages/@tapestry/tinkers/help/craft.yaml)

### Hidden social category (91 generated topics plus one visible overview)

- core generates one help topic per social, 91 in all, each filed `category: social`.
  Because the social category is hidden, none of the 91 appear in the catalog, yet each
  still resolves under `help <social-name>` and each social still dispatches as a command.
  (packages/@tapestry/core/help/socials/)

- A generated social topic carries its own `id`, `title`, `category: social`, `brief`,
  `body`, and `keywords`. (packages/@tapestry/core/help/socials/wave.yaml)

- One visible overview topic, `socials`, is filed `category: communication` so it does
  appear in the catalog. It explains the social system and tells the player to type
  `help <social>` for any specific one, instead of enumerating all 91 inline.
  (packages/@tapestry/core/help/social.yaml)

### see_also references resolve within the composed set

- Every `see_also` reference must resolve to a topic id present in the composed pack set.
  Dangling references that named no real topic were removed.
  (packages/@tapestry/core/help/social.yaml:20)

- core does not reference topics owned by optional modules. The `drink` and `eat` topics
  belong to `@tapestry/survival`, so core dropped its `see_also` links to them; a
  composition without survival still resolves every core reference and boots clean.
  (packages/@tapestry/core/help/quaff.yaml:18)

- The dependency direction is one-way: a module may reference core topics, but core never
  references a module's topics. `@tapestry/survival` links its `drink` topic back to core
  topics (`fill`, `quaff`, `inventory`); core does not link forward to `drink`.
  (packages/@tapestry/survival/help/drink.yaml:19)

### Packs register a help content path

- A pack only contributes help topics if its manifest declares a `content.help` glob.
  `@tapestry/cooking` and `@tapestry/tinkers` each added `help: "help/**/*.yaml"` so their
  new topics load. (packages/@tapestry/cooking/pack.yaml; packages/@tapestry/tinkers/pack.yaml)

## Rejected and Reverted

- None on record.

## Change Log

- 2026-06-17 [command-help-registry](changes/2026-06-17-command-help-registry.md)
