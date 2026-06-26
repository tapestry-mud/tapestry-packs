// area-state.ts - Per-area session store for the solo oracle run.
//
// Distinct from RunState (which is path-dependent counters, one per player+area).
// AreaState holds the rolled descriptor data the global stub resolver needs to
// mint neighbor rooms without a playerId parameter.
//
// The resolver receives only (roomId, direction). To reach the roster + biome palette
// + run state, it needs:
//   1. areaId from roomId -> look up via _roomAreaMap
//   2. AreaState from areaId -> look up via _areaStore
//   3. RunState key from AreaState.runStateKey -> look up via run-state.ts
//
// In-memory only (slice-1 scope). Not persisted across reboots.

import { type Roster } from "./roster.js";

// ---------------------------------------------------------------------------
// AreaState
// ---------------------------------------------------------------------------

export interface AreaState {
    /** The bare area id (areaSlug), e.g. "oracle-run-abc123". */
    areaId: string;
    /** Area seed rolled at creation (dice own all facts). */
    areaSeed: number;
    /** Rolled biome palette for this area. Name-independent (decision 2). */
    biomePalette: string[];
    /** Theme hint (name supplied to the solo flow, or rolled generic). LLM-only. */
    theme: string;
    /** Level range rolled/supplied at creation. */
    levelRange: [number, number];
    /** Pack namespace prefix, e.g. "oracle-run". */
    targetNamespace: string;
    /** Bare area slug, e.g. "oracle-run-abc123". Same as areaId. */
    areaSlug: string;
    /** The run-state key for this area's RunState cell (format: playerId + ":" + areaId). */
    runStateKey: string;
    /** Frozen roster rolled at creation. */
    roster: Roster;
}

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

/** Keyed by areaId (the bare areaSlug). */
const _areaStore = new Map<string, AreaState>();

/** Maps roomId -> areaId so the resolver can find the AreaState from a roomId alone. */
const _roomAreaMap = new Map<string, string>();

/** Maps roomId -> roomPath ("x,y,z" grid coords, e.g. "0,0,0", "0,1,0", "-1,0,0"). */
const _roomPathMap = new Map<string, string>();

// ---------------------------------------------------------------------------
// AreaState accessors
// ---------------------------------------------------------------------------

export function setAreaState(areaId: string, state: AreaState): void {
    _areaStore.set(areaId, state);
}

export function getAreaState(areaId: string): AreaState | undefined {
    return _areaStore.get(areaId);
}

// ---------------------------------------------------------------------------
// Room -> area mapping (lets the resolver go from roomId to AreaState)
// ---------------------------------------------------------------------------

/** Register that roomId belongs to the given areaId. Called at mint time. */
export function setRoomArea(roomId: string, areaId: string): void {
    _roomAreaMap.set(roomId, areaId);
}

/** Get the areaId that owns this roomId, if registered. */
export function getRoomArea(roomId: string): string | undefined {
    return _roomAreaMap.get(roomId);
}

// ---------------------------------------------------------------------------
// Room path map (coordinate string "x,y" per room)
// ---------------------------------------------------------------------------

/** Register the grid path for a room. Path format: "x,y,z" (signed integers). */
export function setRoomPath(roomId: string, path: string): void {
    _roomPathMap.set(roomId, path);
}

/** Get the grid path for a room, if registered. Returns "x,y,z" string or undefined. */
export function getRoomPath(roomId: string): string | undefined {
    return _roomPathMap.get(roomId);
}
