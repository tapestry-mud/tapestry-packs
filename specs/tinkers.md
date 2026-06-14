# tinkers

## Overview

`@tapestry/tinkers` is a crafting system pack for Tapestry. It introduces a
recipe table, a recipe-book discovery loop (find schematic -> read -> copy ->
craft), a tiered bench gate, and three player-facing commands: `recipes`,
`copy`, and `craft`. The pack ships four items: wood-chunk (raw material),
crafting-bench (bench tool), and two schematic items that teach the bootstrap
recipes. It serves as the Phase 2 cross-pack composition exemplar: the
campfire recipe outputs a `@tapestry/cooking` heat-source item, proving
cross-pack output delegation.

Pack metadata: `type: module`, `load_order: 15`, `engine: ">=0.1.25"`,
`validation: strict`. Dependencies: `@tapestry/core ^0.1.4`,
`@tapestry/biomes ^0.1.1`, `@tapestry/cooking ^0.1.2`.
(packages/@tapestry/tinkers/pack.yaml:1-17)

## Behavior

### Recipe table (recipes-table.js)

- The recipe table is a private `_recipes` map keyed by scoped recipe id
  (e.g. `tapestry-tinkers:campfire-portable`). It is initialized at script
  load time and not exposed directly; callers use the exported functions.
  (packages/@tapestry/tinkers/scripts/recipes-table.js:4)

- `addRecipe(recipe)` validates that `recipe.id` and `recipe.output` are
  present, then stores the record. It is exported via
  `tapestry.packs.export('addRecipe', ...)` so other packs can contribute
  recipes at their own load time (Phase 1 interop).
  (packages/@tapestry/tinkers/scripts/recipes-table.js:29-33;
  packages/@tapestry/tinkers/scripts/recipes-table.js:78-83)

- A recipe object has four fields: `id` (scoped string), `name` (optional
  short craft token), `inputs` (array of `{material, count}` or `{id, count}`
  entries), `benchLevelRequired` (integer; 0 means no bench needed), and
  `output` (template id of the spawned result).
  (packages/@tapestry/tinkers/scripts/recipes-table.js:23-28)

- `findRecipe(nameOrId)` resolves a recipe by exact scoped id, exact short id
  (after the colon), or exact display name. If no exact hit, it falls back to
  a unique-substring match so partial tokens like `'camp'` resolve to
  `'campfire'`. Ambiguous or empty queries return null.
  (packages/@tapestry/tinkers/scripts/recipes-table.js:51-75)

- Matching is tolerant: input is lowercased, surrounding quotes are stripped,
  and runs of spaces, hyphens, and underscores are collapsed to a single
  space before comparison.
  (packages/@tapestry/tinkers/scripts/recipes-table.js:12-17)

- A `'recipe'` arg type is registered with the engine arg resolver. When a
  command declares `type: 'recipe'`, the engine calls `findRecipe` on the
  typed token and either resolves to a recipe id or returns the error
  "You don't have a recipe called X." before the handler runs.
  (packages/@tapestry/tinkers/scripts/recipes-table.js:88-100)

- `findRecipe` and `displayName` are exported so sibling scripts (craft.js,
  recipes.js) can call them via `tapestry.packs.require('@tapestry/tinkers')`.
  (packages/@tapestry/tinkers/scripts/recipes-table.js:122-133)

- Two bootstrap recipes are registered at load time:
  - `tapestry-tinkers:level-1-bench` (name: `bench`) -- 20x `material:wood`,
    `benchLevelRequired: 0`, output: `tapestry-tinkers:crafting-bench`.
  - `tapestry-tinkers:campfire-portable` (name: `campfire`) -- 5x
    `material:wood`, `benchLevelRequired: 1`, output:
    `tapestry-cooking:campfire-portable`.
  (packages/@tapestry/tinkers/scripts/recipes-table.js:103-117)

### `craft` command

- Registered in the `inventory` category, roles: `['player']`. Takes one
  required `recipe` arg (resolved by the `'recipe'` arg type before the
  handler runs). (packages/@tapestry/tinkers/scripts/commands/craft.js:2-12)

- Recipe knowledge gate: if `benchLevelRequired > 0`, the handler reads the
  `known_recipes` player property and aborts with "You haven't learned that
  recipe yet..." if the recipe id is absent. Recipes with
  `benchLevelRequired: 0` are craftable without prior schematic discovery.
  (packages/@tapestry/tinkers/scripts/commands/craft.js:25-30)

- Bench gate: if `benchLevelRequired > 0`, the handler scans the player's
  inventory for an item whose `bench_level` property is >= the required level.
  If none found, it also scans entities visible in the player's current room
  (e.g. a bench placed in the room). Failure message: "You need a level N
  crafting bench to build that."
  (packages/@tapestry/tinkers/scripts/commands/craft.js:35-61)

- Validate-all-before-consume: the handler iterates every input entry and
  accumulates a `toRemove` list before destroying anything. If any input is
  short, it reports the deficit ("still need Nx <material-or-id>") and
  returns immediately -- nothing is consumed on a partial match.
  (packages/@tapestry/tinkers/scripts/commands/craft.js:64-98)

- Input matching is by `material` or by `id` (template id), not both on the
  same entry. For `material` inputs, `tapestry.world.getProperty(it.id,
  'material')` is compared; for `id` inputs, `template_id` is compared.
  (packages/@tapestry/tinkers/scripts/commands/craft.js:75-82)

- On success, consumed items are destroyed via `tapestry.inventory.destroy`
  (detaches from contents and untracks), then the output template is spawned
  directly into the player's inventory via
  `tapestry.items.spawnToInventory(recipe.output, actor.entityId)`.
  (packages/@tapestry/tinkers/scripts/commands/craft.js:102-113)

- The actor sees "You craft <output.name>." and the room sees "<actor.name>
  crafts something." (packages/@tapestry/tinkers/scripts/commands/craft.js:113-114)

### `recipes` command

- Registered in the `inventory` category, roles: `['player']`. Takes one
  optional `recipe` arg. (packages/@tapestry/tinkers/scripts/commands/recipes.js:2-11)

- List view (no arg): reads `known_recipes` from the player entity. If empty,
  prompts "Find a schematic, 'read' it, then 'copy' it to learn a recipe."
  Otherwise prints each recipe name alongside its bench requirement in plain
  text ("craft by hand" or "needs a level N bench").
  (packages/@tapestry/tinkers/scripts/commands/recipes.js:13-15;
  packages/@tapestry/tinkers/scripts/commands/recipes.js:46-65)

- Detail view (`recipes <name>`): resolves the arg to a recipe and prints its
  display name, bench level label, each input line (count + material or id),
  and a "To build: craft <name>" reminder.
  (packages/@tapestry/tinkers/scripts/commands/recipes.js:18-43)

- The `recipes` command does not gate on known_recipes when showing details --
  any recipe that resolves via the arg type can be inspected.
  (packages/@tapestry/tinkers/scripts/commands/recipes.js:18-22)

### `copy` command

- Registered in the `inventory` category, roles: `['player']`. Takes one
  required `findable` arg (an item the player can locate by standard find
  rules). (packages/@tapestry/tinkers/scripts/commands/copy.js:2-8)

- Reads `teaches_recipe` from the target item. If the property is absent,
  responds "There's nothing on that worth copying down." and returns.
  (packages/@tapestry/tinkers/scripts/commands/copy.js:11-15)

- Duplicate guard: if the recipe id is already in the player's `known_recipes`
  list, responds "You've already copied that into your recipe book."
  (packages/@tapestry/tinkers/scripts/commands/copy.js:21-23)

- On success, appends the recipe id to `known_recipes` via
  `tapestry.world.setProperty`, then destroys the schematic item via
  `tapestry.inventory.destroy`. One schematic teaches exactly one player and is
  consumed on transcription.
  (packages/@tapestry/tinkers/scripts/commands/copy.js:26-40)

- The room sees "<actor.name> studies <item.name>, then sets the spent
  schematic aside." (packages/@tapestry/tinkers/scripts/commands/copy.js:35)

### Items

- `tapestry-tinkers:wood-chunk` -- `material: wood`, weight 2, rarity common.
  Scattered into forest rooms via `spawn_on` with `scope: global` (at most 3
  wood-chunk instances across all forest rooms combined, 50% chance per reset).
  (packages/@tapestry/tinkers/items/wood-chunk.yaml:1-16)

- `tapestry-tinkers:crafting-bench` -- `bench_level: 1`, weight 8, rarity
  uncommon. Crafted via the `bench` recipe (no bench required, 20x wood).
  Can be carried in inventory or placed in a room; both locations satisfy the
  bench gate in `craft`. (packages/@tapestry/tinkers/items/crafting-bench.yaml:1-14)

- `tapestry-tinkers:woodworking-schematic` -- `tags: [readable]`,
  `teaches_recipe: tapestry-tinkers:level-1-bench`. Spawns in forest rooms
  (chance 0.2, count 1 per room). Reading it shows charcoal diagrams; copying
  it teaches the `bench` recipe and destroys the item.
  (packages/@tapestry/tinkers/items/woodworking-schematic.yaml:1-25)

- `tapestry-tinkers:campfire-schematic` -- `tags: [readable]`,
  `teaches_recipe: tapestry-tinkers:campfire-portable`. Spawns in forest rooms
  (chance 0.2, count 1 per room). Copying it teaches the `campfire` recipe
  (which requires a level-1 bench) and destroys the item.
  (packages/@tapestry/tinkers/items/campfire-schematic.yaml:1-25)

### Properties

- `material` (type: string, applies_to: item) -- raw material tag used for
  `material`-type craft inputs. (packages/@tapestry/tinkers/properties.yml:2-7)

- `bench_level` (type: int, applies_to: item) -- bench tier. Level 0 is
  hands-only; level 1 is the basic portable bench.
  (packages/@tapestry/tinkers/properties.yml:9-13)

- `teaches_recipe` (type: string, applies_to: item) -- recipe id a schematic
  item teaches on `copy`. (packages/@tapestry/tinkers/properties.yml:15-20)

- `known_recipes` (type: list_string, applies_to: player) -- the player's
  recipe book, persisted across sessions.
  (packages/@tapestry/tinkers/properties.yml:22-28)

### Cross-pack interop

- The campfire recipe's output (`tapestry-cooking:campfire-portable`) is owned
  by `@tapestry/cooking`. Tinkers declares a caret dependency
  (`"@tapestry/cooking": "^0.1.2"`) so the template id resolves at spawn time.
  (packages/@tapestry/tinkers/pack.yaml:16;
  packages/@tapestry/tinkers/scripts/recipes-table.js:111-117)

- `addRecipe` is exported for external packs to register additional recipes
  into the Tinkers table without forking the pack.
  (packages/@tapestry/tinkers/scripts/recipes-table.js:78-83)

## Rejected and Reverted

- None on record.

## Change Log

- None on record.
