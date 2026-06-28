---
release: 0.3.0
specs: [oracle.md]
---

# Oracle Structured Six Axis Everywhere

## Why

Two standing weaknesses fell in this release.

The LLM table-fill lane parsed free text. A heuristic parser stripped preambles,
interjections, numbering, and junk rows, but crammed-multi-record output (several records
on one line) was a known unfixed leak class - the parser could not reliably split it. Free
text plus heuristics is fragile by construction: every new small-model quirk is a new parse
bug.

Six-axis richness (depth-banded rooms, themed scar memory) only reached one authored theme
(endless-underdeep). Every other area fell back to the flat one-row-one-pick path, so a
typed idea or a flat baked set never got the banded/scarred treatment.

This release deletes the parser and makes the seam return structured JSON constrained by a
per-kind schema, and it splits six-axis into shared theme-agnostic MECHANICS plus per-area
LLM-generated DRESSING so every area is six-axis, not just the one authored theme.

## What

- **Structured-output consumption; the parser is deleted.** `scripts/oracle-parse.ts` is
  gone. The recommend seam now returns JSON constrained by per-kind STRICT json_schema
  constants - `SCHEMA_PLACES` / `SCHEMA_MOBS` / `SCHEMA_BOSS` / `SCHEMA_ITEMS` / `SCHEMA_PROSE`
  / `SCHEMA_SCARS` (root object, `additionalProperties:false`, all properties required; arrays
  wrapped in an object property since strict mode forbids a root array; the item schema carries
  rarity + kind enums)
  (packages/@tapestry/oracle/scripts/oracle-structured.ts:165-239). New `scripts/oracle-structured.ts`
  holds the JSON->OracleEntry mappers `mapPlaces` / `mapMobs` / `mapBoss` / `mapItems` /
  `mapProse` / `mapScars`; any JSON parse failure returns `[]` so the caller falls back to
  baked entries (packages/@tapestry/oracle/scripts/oracle-structured.ts:65-163;
  packages/@tapestry/oracle/scripts/oracle-tables.ts:100-145). The crammed-multi-record leak
  class is gone by construction: each array element is one discrete record.
- **Pack-side value hygiene.** Mappers ASCII-fold every value (the engine returns raw JSON),
  cap names at 60 chars and descriptions on a sentence boundary at ~200 chars, turn LLM
  snake_case identifiers back into spaces, and strip leading list-numbering the model sometimes
  bakes into array items (`asciiFold`, `MAX_NAME`/`MAX_DESC`, `normalize`)
  (packages/@tapestry/oracle/scripts/oracle-structured.ts:11-63). `normalizeRarity` /
  `normalizeKind` are kept as a defensive guard for the baked / schema-ignoring path
  (packages/@tapestry/oracle/scripts/oracle-structured.ts:74-81).
- **Six-axis on every area.** Theme-agnostic shared MECHANICS - ROOM-1 DEGREE bands and ROOM-3
  CONSEQUENCE lifespans - live in `data/six-axis/_default/` and are eager-loaded into
  `DEFAULT_MECHANICS` at module init (packages/@tapestry/oracle/data/six-axis/_default/ROOM-1.yaml;
  packages/@tapestry/oracle/data/six-axis/_default/ROOM-3.yaml;
  packages/@tapestry/oracle/scripts/six-axis.ts:225-241). `buildAreaSixAxis(themeDir, prose, scars)`
  returns the shared mechanics plus a ROOM-2 DRESSING table: an authored theme
  (endless-underdeep) keeps its authored ROOM-2, which still wins; any other area gets ROOM-2
  assembled from its frozen prose + scars entries via `assembleRoom2`
  (packages/@tapestry/oracle/scripts/six-axis.ts:247-298). The rooms composer is now UNGATED -
  it engages whenever ROOM-1 is present, which is every area
  (packages/@tapestry/oracle/scripts/area-gen.ts:358-375; packages/@tapestry/oracle/scripts/room-compose.ts:86-100).
- **fill_scars - themed scar prose, frozen as a `scars` table.** A new structured fill writes
  one short themed scar line per gameplay-reachable consequence kind (looted, boss-slain,
  collapsed - the `SCHEMA_SCARS` enum; three of the nine ROOM-3 kinds), frozen as a `scars`
  oracle table and consumed as ROOM-3 state overrides
  (packages/@tapestry/oracle/scripts/oracle-tables.ts:195-203;
  packages/@tapestry/oracle/scripts/oracle-structured.ts:149-163, 221-239). When the LLM is off
  or returns empty, `fallbackScars` supplies generic lines, and `bakedTables` always appends a
  fallback `scars` table when a set lacks one (`BAKED_KINDS` omits scars, so every baked set
  gets the generic fallback) (packages/@tapestry/oracle/scripts/oracle-tables.ts:272-319).
- **Place-word room names.** A generated room is named after a themed place word drawn from the
  frozen places table, not `theme/band - biome` - the generic terrain biome clashed with the
  area theme. Falls back to the band, then the theme, then the biome
  (packages/@tapestry/oracle/scripts/room-gen.ts:275-291).
- **Underdeep baked roster + scenario wiring.** An engine-free `scripts/scenarios.ts` exports
  `buildScenarios` (golden-tested under plain node): a six-axis theme uses its own baked set when
  one exists, else the first baked set; a baked set that is also a theme is not offered as a
  duplicate flat scenario (packages/@tapestry/oracle/scripts/scenarios.ts:8-19;
  packages/@tapestry/oracle/scripts/flows/solo-flow.ts:34). A bespoke endless-underdeep baked
  roster ships under `data/baked/endless-underdeep/`
  (packages/@tapestry/oracle/data/baked/endless-underdeep/).
- **Playtest fixes.** A stale `__solo_scenario` property is ignored unless the LLM is off, fixing
  the "typed Haunted Circus, generated endless-underdeep" bug
  (packages/@tapestry/oracle/scripts/flows/solo-flow.ts:118-122); a weighted exit-count
  distribution skews most rooms to 2-3 exits and keeps 6-exit hubs rare
  (packages/@tapestry/oracle/scripts/room-gen.ts:53-60); the table-fill prompts are present-tense,
  second-person, with a new scar prompt
  (packages/@tapestry/oracle/data/prompts.yml:172-186).

Requires engine `>=0.1.44`.
