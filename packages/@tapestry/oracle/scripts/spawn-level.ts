// spawn-level.ts - pure level selector for the spawn layer.
//
// Split out of population.ts (which registers engine hooks at import time,
// so it cannot be loaded outside the Jint sandbox) to keep this small,
// side-effect-free function golden-testable under plain node, same pattern
// as balance-table.ts / tiers.ts / prng.ts.

/** The level a spawn in this area resolves at: the run's chosen level, or the
 *  band floor for legacy areas that never set one. Never returns < 1. */
export function spawnLevel(state: { runLevel?: number; levelRange: [number, number] }): number {
    if (typeof state.runLevel === "number" && state.runLevel > 0) {
        return state.runLevel;
    }
    const floor = state.levelRange && state.levelRange.length > 0 ? state.levelRange[0] : 1;
    return floor > 0 ? floor : 1;
}
