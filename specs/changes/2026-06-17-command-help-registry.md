---
release: 0.1.15
specs: [command-help-content.md]
---

# Command Help Registry

## Why

Command registrations carried their own description and category text, and the help
topics carried it again. Two sources of truth for the same player-facing wording drift
apart: a command's catalog blurb and its help page could disagree. Some commands had a
registration but no help topic at all, so `help <command>` failed for them.

This change moves all player-facing description and category text out of the
registrations and into the help topics, and gives every command a topic. The result is
one declared category list and one description per command.

## What

- `@tapestry/core` declares the canonical category vocabulary as a YAML sequence in
  `help/categories.yaml`. Thirteen categories in declaration-is-display order: movement,
  communication, character, combat, inventory, shop (Trade), group (Grouping), world,
  rest, social, accessibility, builder (Building), admin (Immortal). The social category
  is marked `hidden: true`.

- Every command registration across core, builder, example-pack, survival, viewer,
  cooking, and tinkers had its `description` and `category` fields removed. A registration
  now carries runtime behavior only. The social init loop was stripped the same way.

- core authored help topics for the commands that previously had none, so the topic set
  now covers every registered command. Topics across all packs were re-filed so each
  topic's category is one of the declared ids.

- core generates one help topic per social, 91 in all, each filed under the hidden social
  category. None appear in the catalog, but each still resolves under `help <name>` and
  each social still dispatches. One visible overview topic (`socials`, filed under
  communication) explains the system and points the player at `help <social>`.

- Dangling `see_also` references that named no real topic were removed. core dropped its
  links to the survival-owned `drink` and `eat` topics so a survival-less composition
  resolves every reference and boots clean. Module topics may link back to core; core does
  not link forward into a module. survival's `drink`/`eat` topics link to core, one way.

- cooking and tinkers added new help topics (cook; copy, craft, recipes) and registered a
  `content.help` glob in their manifests so those topics load.

The engine release that ships the gates enforcing this contract (category vocabulary,
per-command topic coverage, see_also resolution) is recorded with that engine release.
