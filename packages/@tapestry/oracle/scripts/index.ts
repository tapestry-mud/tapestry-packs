// Side-effect registration entry point.
// Import order matters: stub-resolver registers the E3 hook at module load (top-level call).
// P7 will add the solo flow import here.
import "./stub-resolver.js";
export {};
