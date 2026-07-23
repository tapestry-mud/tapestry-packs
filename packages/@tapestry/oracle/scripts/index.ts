// Side-effect registration entry point.
// population registers the first-visit trigger (player.direction.moved) at module
// load; solo-flow registers the flow; commands/solo registers the command; commands/
// tapestry registers the Tapestry board (Task 6: list + start, unlock-gated).
// (consequence-hooks, room-revisit, and commands/oracle-admin self-register via the
// pack script glob.)
import "./population.js";
import "./flows/solo-flow.js";
import "./commands/solo.js";
import "./commands/tapestry.js";
export {};
