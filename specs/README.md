# Tapestry Packs -- specs

Capability specs for the Tapestry content packs. Each file describes one pack system's current
behavior (mechanics, registrations, interop), known constraints, and change history. This
directory is the canonical, public source of truth for how each system behaves now -- a fresh
agent or contributor answers "how does X behave?" from the relevant file alone.

## Index

| Capability | File | Last Updated |
|------------|------|--------------|
| biomes | [biomes.md](biomes.md) | 2026-06-13 |
| cooking | [cooking.md](cooking.md) | 2026-06-20 |
| socials | [socials.md](socials.md) | 2026-06-13 |
| example-pack | [example-pack.md](example-pack.md) | 2026-06-21 |
| survival | [survival.md](survival.md) | 2026-06-20 |
| tinkers | [tinkers.md](tinkers.md) | 2026-06-20 |
| builder | [builder.md](builder.md) | 2026-06-20 |
| viewer | [viewer.md](viewer.md) | 2026-06-13 |
| core-init | [core-init.md](core-init.md) | 2026-06-13 |
| core-admin | [core-admin.md](core-admin.md) | 2026-06-19 |
| core-communication | [core-communication.md](core-communication.md) | 2026-06-13 |
| core-navigation | [core-navigation.md](core-navigation.md) | 2026-06-18 |
| core-combat | [core-combat.md](core-combat.md) | 2026-06-21 |
| oracle | [oracle.md](oracle.md) | 2026-06-28 |
| core-abilities | [core-abilities.md](core-abilities.md) | 2026-06-13 |
| core-inventory | [core-inventory.md](core-inventory.md) | 2026-06-13 |
| core-economy | [core-economy.md](core-economy.md) | 2026-06-13 |
| core-mobs | [core-mobs.md](core-mobs.md) | 2026-06-13 |
| core-groups | [core-groups.md](core-groups.md) | 2026-06-20 |
| core-progression | [core-progression.md](core-progression.md) | 2026-06-20 |
| Validation Ledger | [validation-ledger.md](validation-ledger.md) | 2026-06-13 |
| Command Help Content | [command-help-content.md](command-help-content.md) | 2026-06-17 |

## Contract summary

Each capability spec has four required sections: Overview, Behavior, Rejected and Reverted,
Change Log. Change records live in `specs/changes/` and use the frontmatter fields `release:`
(the pack version that shipped it) and `specs:` (capability files touched).

Hotfixes, regressions, and dependency bumps owe no change record. Tombstones on any reversal
of shipped behavior are mandatory.

A capability spec is current if its Change Log references the latest shipped change record
that names it in `specs:`.

## Format rules (mechanically linted)

- Behavior claims carry inline anchors in exactly one form: `(repo-relative/path/File.ext:123)`,
  where the line part may be a single line `:123` or a range `:123-145`, and may be omitted only
  for whole-file claims. Several anchors may share one set of parentheses, joined by `; `. A test
  name in the same parentheses also counts. Lint pattern (the gate IS this regex, keep them in
  sync): `\([@\w./\\-]+\.(js|mjs|cjs|ya?ml|json)(:\d+(-\d+)?)?[^)]*\)`. A file with no matches in its
  Behavior section fails validation outright.
- An empty Rejected and Reverted section contains the single line `- None on record.` under the
  heading (the heading itself is always present).
- Change Log is a one-line-per-record list, newest first: `- YYYY-MM-DD [slug](changes/...)`.
  Not a table.

<!-- spec-lint:start -->
Mode: strict

Required sections: Overview, Behavior, Rejected and Reverted, Change Log

Anchor regex (Behavior): \([@\w./\\-]+\.(cs|js|ts|json|ya?ml|md)(:\d+(-\d+)?)?[^)]*\)

Empty-reversal sentinel: - None on record.

Change Log: list, newest-first by date, not a table. Empty is valid for unmodified capabilities.

Index sync: every capability .md on disk appears in README index; every indexed file exists on disk; index date matches file last-updated.

Currency: for each change record naming a capability, the top Change Log entry references that record and last-updated >= record date. A capability named by zero records may have an empty Change Log.

Tombstone: a change record with status:reverted requires a tombstone entry in the capability Rejected and Reverted (not the empty sentinel).
<!-- spec-lint:end -->
