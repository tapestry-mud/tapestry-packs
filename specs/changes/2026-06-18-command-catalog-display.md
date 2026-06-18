---
release: 0.1.16
specs: [core-navigation.md]
---

# Command Catalog Display

## Why

The `commands` listing rendered one keyword-and-description row per command and
spanned several pages. With the command-help registry now giving every command a
declared category and a brief, the listing could become a dense, scannable chip
grid grouped by category - the same shape the web command palette uses - so both
surfaces read consistently.

## What

`commands` (alias `cmds`) now renders a bordered chip grid: a title with the
total count, then one section per visible category in declared vocabulary order
(real labels from the help registry, per-section counts, empty and hidden
categories omitted), then auto-fit columns of keyword chips sized to the player's
width. The description moves off the grid - reach it with `help <cmd>`.

An optional free-text argument (`commands <text>`) filters chips by
case-insensitive substring against keyword, alias, category id, or category
label; no match prints `No commands match '<text>'.`. The admin section is
annotated `admins only`. On every path the command emits a `Commands.Open` GMCP
trigger (`{ filter }` when a filter was given, else `{}`) alongside the text grid,
so a structured client can open its palette in step; GMCP-inactive clients drop
it and just see the grid.
