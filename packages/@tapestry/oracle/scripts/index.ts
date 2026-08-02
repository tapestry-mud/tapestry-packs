// Side-effect registration entry point, AND (Task 13) the cross-pack entry: a bare
// `import { ... } from "@tapestry/oracle"` resolves here (dist/scripts/index.js -
// see TapestryModuleLoader's EntryRelFile), same convention @tapestry/survival's
// index.ts documents for @tapestry/cooking's interop import.
//
// population registers the first-visit trigger (player.direction.moved) at module
// load; solo-flow/mint-flow register the flows; commands/solo and commands/mint
// register the commands (commands/mint: Task 7's admin bench - bake a draft
// template + flip it open, unlock-gated on nothing since it is admin/builder-only).
// The `tapestry` board command is deleted (Task 6): the level dial it fronted is
// gone, and entry is a portal now.
// (consequence-hooks, room-revisit, and commands/oracle-admin self-register via the
// pack script glob.)
import "./population.js";
import "./flows/solo-flow.js";
import "./flows/mint-flow.js";
import "./commands/solo.js";
import "./commands/mint.js";

// startRun/heldThreadFor: threadwalker's portal.js (the corridor's thread-portal
// fixture handler) is the consumer. Neither was reachable through this entry point
// before Task 13 - startRun lived only in area-gen.ts and heldThreadFor only in
// thread-item.ts, both internal oracle modules with no cross-pack export.
export { startRun } from "./area-gen.js";
export { heldThreadFor } from "./thread-item.js";
