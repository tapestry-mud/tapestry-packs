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
// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------
/** Keyed by areaId (the bare areaSlug). */
const _areaStore = new Map();
/** Maps roomId -> areaId so the resolver can find the AreaState from a roomId alone. */
const _roomAreaMap = new Map();
/** Maps roomId -> roomPath ("x,y" grid coords, e.g. "0,0", "0,1", "-1,0"). */
const _roomPathMap = new Map();
// ---------------------------------------------------------------------------
// AreaState accessors
// ---------------------------------------------------------------------------
export function setAreaState(areaId, state) {
    _areaStore.set(areaId, state);
}
export function getAreaState(areaId) {
    return _areaStore.get(areaId);
}
// ---------------------------------------------------------------------------
// Room -> area mapping (lets the resolver go from roomId to AreaState)
// ---------------------------------------------------------------------------
/** Register that roomId belongs to the given areaId. Called at mint time. */
export function setRoomArea(roomId, areaId) {
    _roomAreaMap.set(roomId, areaId);
}
/** Get the areaId that owns this roomId, if registered. */
export function getRoomArea(roomId) {
    return _roomAreaMap.get(roomId);
}
// ---------------------------------------------------------------------------
// Room path map (coordinate string "x,y" per room)
// ---------------------------------------------------------------------------
/** Register the grid path for a room. Path format: "x,y" (signed integers). */
export function setRoomPath(roomId, path) {
    _roomPathMap.set(roomId, path);
}
/** Get the grid path for a room, if registered. */
export function getRoomPath(roomId) {
    return _roomPathMap.get(roomId);
}
