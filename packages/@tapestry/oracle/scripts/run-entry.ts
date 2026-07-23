// run-entry.ts - pure run entry-room id derivation.
//
// Split out of area-gen.ts (which pulls in population.ts -> guide.ts, and guide.ts calls
// tapestry.mobs.registerScript at MODULE LOAD, an engine call the node:test stub does not
// provide - importing area-gen.ts under plain node throws before this function is ever
// reached) to keep this tiny, side-effect-free helper golden-testable under plain node,
// same pattern as spawn-level.ts (split out of population.ts for the identical reason).
//
// area-gen.ts re-exports this so it remains the documented module-scope home the plan
// calls for (Task 5, D6 / validate-plan R2 LOW).

export const RUN_NAMESPACE = "oracle-run";

/** The single source of truth for a run's entry-room id. Called by BOTH startRun (to write
 *  the oracle_active_run composite) and instantiateRunArea (to mint the entry room), so the
 *  death handler's respawn target and the minted room can never diverge (D6 / R2 LOW). */
export function runEntryRoomId(runSlug: string): string {
    return RUN_NAMESPACE + ":" + runSlug + "-entry";
}
