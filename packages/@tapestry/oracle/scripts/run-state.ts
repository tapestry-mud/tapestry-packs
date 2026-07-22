// run-state.ts - Per-run in-memory state cell for a solo oracle run.
//
// The RunState holds path-dependent counters that advance as the player walks.
// It has exactly ONE construction site (createSoloArea in area-gen.ts) and ONE
// writer (materializeRoom in P4's room-gen.ts). Prefetch never reads or mutates it.
//
// The key format is `${playerId}:${areaId}` - derivable anywhere both are known.
// Use runKey(playerId, areaId) for consistency.
//
// P6 (prefetch.ts) will also export getRunState/setRunState from here - they are
// defined here rather than in prefetch.ts because P3 (area-gen.ts) is the sole
// constructor and imports this module, while P4 (room-gen.ts) is the sole writer.
// Keeping the store here avoids a circular import between area-gen and prefetch.

export interface RunState {
    roomsSinceLastBoss: number;
    /** Stage-B: the wandering big-boss pity timer fires at most ONCE per run.
     *  Run-state is session-scoped (resets on reboot - the accepted 0.3.x
     *  posture), so a reboot re-arms the timer. */
    bossFired: boolean;
}

// In-memory keyed store. Not persisted (slice-1 scope).
const _store = new Map<string, RunState>();

export function runKey(playerId: string, areaId: string): string {
    return playerId + ":" + areaId;
}

export function getRunState(key: string): RunState | undefined {
    return _store.get(key);
}

export function setRunState(key: string, state: RunState): void {
    _store.set(key, state);
}

/**
 * Removes every RunState cell belonging to an area. Two key shapes reach this store:
 * the creation key `<playerId>:<areaId>` (runKey) and the reload key `reload:<areaId>`
 * (area-context.ensureAreaContext). Both end in `:<areaId>`, and areaId is the whole
 * tail, so a suffix match is exact and cannot reach a sibling area.
 * Returns the number of cells removed.
 */
export function removeRunStatesForArea(areaId: string): number {
    const suffix = ":" + areaId;
    const doomed: string[] = [];
    _store.forEach(function (_state: RunState, key: string): void {
        if (key.length > suffix.length && key.endsWith(suffix)) {
            doomed.push(key);
        }
    });
    for (let i = 0; i < doomed.length; i++) {
        _store.delete(doomed[i]);
    }
    return doomed.length;
}
