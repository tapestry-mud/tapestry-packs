// Side-effect registration entry point.
// population registers the first-visit trigger (player.direction.moved) at module
// load; solo-flow/mint-flow register the flows; commands/solo, commands/tapestry, and
// commands/mint register the commands (commands/mint: Task 7's admin bench - bake a
// draft template + flip it open, unlock-gated on nothing since it is admin/builder-only).
// (consequence-hooks, room-revisit, and commands/oracle-admin self-register via the
// pack script glob.)
import "./population.js";
import "./flows/solo-flow.js";
import "./flows/mint-flow.js";
import "./commands/solo.js";
import "./commands/tapestry.js";
import "./commands/mint.js";
export {};
