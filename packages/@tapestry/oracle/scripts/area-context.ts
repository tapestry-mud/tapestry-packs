// area-context.ts - area-state reconstruction + shared per-area session stores.
//
// Everything here used to live in stub-resolver.ts. Stubs are dead in v3 (the
// whole room graph is minted at creation), but the reconstruction problem
// remains: the in-memory stores (AreaState, room->area, room->path, run-state)
// are populated at creation and empty after a reboot/reshare. ensureAreaContext
// rebuilds them lazily from persisted state on the first event that needs them
// (now the population trigger rather than a stub traversal).
//
// ASCII; braces on all control flow.

import * as tapestry from "@tapestry/engine";
import { parseOracleRoomId } from "./coords.js";
import { buildAreaSixAxis } from "./six-axis.js";
import { getAreaState, setAreaState, getRoomArea, setRoomArea, setRoomPath } from "./area-state.js";
import { setRunState } from "./run-state.js";
import { soloAreaBiomePalette, type Roster } from "./roster.js";

// ---------------------------------------------------------------------------
// Per-area in-memory minted type sets.
// Tracks which mob type ids have been minted so shouldReuse can gate on count.
// Session-scoped (resets on reboot) - the deliberate path-dependent channel.
// ---------------------------------------------------------------------------

const _mintedMobTypes = new Map<string, Set<string>>();

export function getMintedSet(areaId: string): Set<string> {
    let s = _mintedMobTypes.get(areaId);
    if (!s) {
        s = new Set<string>();
        _mintedMobTypes.set(areaId, s);
    }
    return s;
}

/** Teardown: drop the minted-type set for a discarded area. */
export function removeMintedSet(areaId: string): void {
    _mintedMobTypes.delete(areaId);
}

// ---------------------------------------------------------------------------
// resolveAreaSeed
//
// Fast path: AreaState.areaSeed (same-session in-memory).
// Fallback: tapestry.area.get(areaId).seed (T5 engine seam, for reloaded areas).
// Returns 0 if neither is available (graceful - determinism degraded but not fatal).
// ---------------------------------------------------------------------------

export function resolveAreaSeed(areaId: string): number {
    const areaState = getAreaState(areaId);
    if (areaState) {
        return areaState.areaSeed;
    }
    const area = (tapestry as any).area && (tapestry as any).area.get(areaId);
    if (area && area.seed) {
        const parsed = parseInt(String(area.seed), 10);
        if (!isNaN(parsed)) {
            return parsed;
        }
        (tapestry as any).system?.warn("[oracle] resolveAreaSeed: area '" + areaId + "' has non-integer seed '" + area.seed + "'; falling back to 0. Determinism degraded.");
    } else {
        (tapestry as any).system?.warn("[oracle] resolveAreaSeed: no seed found for area '" + areaId + "'; falling back to 0. Determinism degraded.");
    }
    return 0;
}

// ---------------------------------------------------------------------------
// EMPTY_ROSTER - typed null-object. The roster is dead in the hot path (frozen
// tables replaced it in P-E) but AreaState.roster must satisfy the type.
// ---------------------------------------------------------------------------

export const EMPTY_ROSTER: Roster = {
    mobs: [],
    boss: {
        ref: "", base: "", level: 0, hp: 0, damage: "",
        swell_baseline_gap_ticks: 0, swell_jitter_ticks: 0, swell_telegraph_ticks: 0,
        swell_window_ticks: 0, swell_chunk_pct: 0, swell_whiff_pct: 0, swell_weather_pct: 0,
        name: "",
    },
    loot: [],
};

// ---------------------------------------------------------------------------
// normalizeLevelRange - coerce the engine area.levelRange into a [min,max] tuple.
// ---------------------------------------------------------------------------

function normalizeLevelRange(lr: any): [number, number] {
    if (lr && typeof lr.length === "number" && lr.length >= 2) {
        const a = parseInt(String(lr[0]), 10);
        const b = parseInt(String(lr[1]), 10);
        if (!isNaN(a) && !isNaN(b)) { return [a, b]; }
    }
    return [1, 5];
}

// ---------------------------------------------------------------------------
// ensureAreaContext - returns the areaId owning roomId, reconstructing the
// in-memory context (AreaState + room->area + room->path + run-state) from the
// persisted area.yaml when absent. Reboot/reshare path: room ids encode the
// namespace + grid path; seed / level range / theme / target_rooms persist in
// area.yaml (T5); the biome palette re-derives from the seed via the shared
// soloAreaBiomePalette helper so a reconstructed area is byte-identical to
// creation. Returns undefined for a non-oracle room (no persisted seed).
//
// Room id scheme (authored by this pack): "<namespace>:<areaId>-<pathKey>"
// where pathKey is "entry" (= 0,0,0) or "<x>_<y>_<z>" (signed).
// ---------------------------------------------------------------------------

export function ensureAreaContext(roomId: string): string | undefined {
    const mapped = getRoomArea(roomId);
    if (mapped && getAreaState(mapped)) {
        return mapped; // fully live this session - fast path.
    }

    const parsed = parseOracleRoomId(roomId);
    if (!parsed) { return undefined; }
    const ns = parsed.namespace;
    const areaId = parsed.areaId;

    // Only reconstruct for a real oracle area (a persisted seed is the marker).
    const area = (tapestry as any).area && (tapestry as any).area.get(areaId);
    if (!area || !area.seed) { return undefined; }
    const seed = parseInt(String(area.seed), 10);
    if (isNaN(seed)) { return undefined; }

    if (!getAreaState(areaId)) {
        // Run-state is session-scoped (resets on reboot); a synthetic per-area key
        // suffices since the population trigger has no playerId-stable key here.
        const runStateKey = "reload:" + areaId;
        setRunState(runStateKey, { roomsSinceLastBoss: 0, bossFired: false });
        const theme = typeof area.theme === "string" ? area.theme : "";
        const themeDir = theme.toLowerCase().indexOf("underdeep") !== -1 ? "endless-underdeep" : "";
        // target_rooms rides the frozen "structure" oracle table (the T5 area
        // attribute seam whitelists only level_range/reset_interval/wip/seed, so
        // the number persists the T6 way instead). Default: standard band floor.
        let targetRooms = 40;
        const structTable = (tapestry as any).oracle.table(areaId + ":structure");
        if (structTable && structTable.entries) {
            for (let i = 0; i < structTable.entries.length; i++) {
                const e = structTable.entries[i];
                if (e && String(e.id) === "target-rooms") {
                    const t = parseInt(String(e.desc), 10);
                    if (!isNaN(t) && t > 0) { targetRooms = t; }
                    break;
                }
            }
        }
        // Frozen prose + scars tables reloaded from the side-cars at boot - rebuild
        // the assembled six-axis so a reloaded area is six-axis just like at creation.
        const proseTable = (tapestry as any).oracle.table(areaId + ":prose");
        const scarsTable = (tapestry as any).oracle.table(areaId + ":scars");
        const levelRange = normalizeLevelRange(area.levelRange);
        setAreaState(areaId, {
            areaId,
            areaSeed: seed,
            biomePalette: soloAreaBiomePalette(seed),
            theme,
            levelRange,
            runLevel: levelRange[0],
            targetNamespace: ns,
            areaSlug: areaId,
            runStateKey,
            targetRooms,
            roster: EMPTY_ROSTER,
            sixAxis: buildAreaSixAxis(themeDir, proseTable ? proseTable.entries : [], scarsTable ? scarsTable.entries : []),
        });
    }

    setRoomArea(roomId, areaId);
    setRoomPath(roomId, parsed.path);
    return areaId;
}
