// Side-effect registration entry point.
// population registers the first-visit trigger (player.direction.moved) at module
// load; solo-flow registers the flow; commands/solo registers the command.
// (consequence-hooks and room-revisit self-register via the pack script glob.)
import "./population.js";
import "./flows/solo-flow.js";
import "./commands/solo.js";
export {};
