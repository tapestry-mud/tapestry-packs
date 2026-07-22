// area-teardown.ts - one call that clears every pack-side in-memory store for a
// discarded area. Called by `solo discard` AFTER authoring.deleteArea returns true.
//
// The engine owns the world artifacts (rooms, entities, registries, side-cars).
// These are the pack's own caches; a live session would otherwise serve stale
// AreaState / run counters / visited marks for an area that no longer exists.
//
// Items already instanced in a player's inventory are NOT touched (Decision C).
//
// ASCII; braces on all control flow.

import { removeAreaState } from "./area-state.js";
import { removeRunStatesForArea } from "./run-state.js";
import { removeMintedSet } from "./area-context.js";
import { removeVisited } from "./population.js";
import { removeGranted } from "./starter-kit.js";

export function clearAreaCaches(areaId: string): void {
    removeAreaState(areaId);
    removeRunStatesForArea(areaId);
    removeMintedSet(areaId);
    removeVisited(areaId);
    removeGranted(areaId);
}
