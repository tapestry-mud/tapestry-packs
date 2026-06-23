// Side-effect registration entry point.
// Import order matters: stub-resolver registers the E3 hook at module load (top-level call).
import "./stub-resolver.js";
import "./flows/solo-flow.js";
import "./commands/solo.js";
