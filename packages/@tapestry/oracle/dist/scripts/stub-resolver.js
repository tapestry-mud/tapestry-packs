// stub-resolver.ts - Registers the E3 stub exit resolver for @tapestry/oracle.
//
// THE RESOLVER CONTRACT (E3 brief, StubExitResolver.TryResolve):
//   The resolver mints the neighbor room + two-way-wires exits, then returns true.
//   World.MoveEntity re-reads the current room's exit after TryResolve; if the stub
//   is now a real exit, the move completes. So the resolver MUST:
//     a. createRoom + wire the neighbor (materializeRoom handles createRoom).
//     b. setRoomExit(roomId, direction, neighborId) - turn the current stub -> real exit.
//     c. setRoomExit(neighborId, oppositeDir, roomId) - wire the return exit.
//
// MINT-ON-DEMAND ONLY (spec section 5 hard line):
//   materializeRoom is the committing mint and advances the boss clock.
//   It is called ONCE per first arrival. On backtrack (room already exists), skip.
//   rollRoomFacts is pure; this seam rolls facts on-demand for any new neighbor.
//
// P-E REWORK:
//   - prefetchNeighbors removed (no per-room LLM left to hide latency for).
//   - takeCached / peekCached removed (session cache dead - no async prose to pre-warm).
//   - areaSeed now read from in-memory AreaState (fast path) with fallback to
//     tapestry.area.get(areaId).seed (T5 engine seam, for reloaded/shared areas).
//   - Per-area minted-type sets maintained in-memory so shouldReuse can gate
//     on whether types have already been introduced.
//
// ASCII; no em dashes; braces on all control flow.
import * as tapestry from "@tapestry/engine";
import { rollRoomFacts, materializeRoom } from "./room-gen.js";
import { hashCoord, splitmix64, pick } from "./prng.js";
import { oppositeDir, neighborPath, pathKey, parsePathKey, descentDepth } from "./coords.js";
import { loadSixAxisTables } from "./six-axis.js";
import { getAreaState, setAreaState, getRoomArea, getRoomPath, setRoomArea, setRoomPath } from "./area-state.js";
import { getRunState, setRunState } from "./run-state.js";
import { soloAreaBiomePalette } from "./roster.js";
// ---------------------------------------------------------------------------
// Per-area in-memory minted type sets.
// Tracks which mob type ids have been minted so shouldReuse can gate on count.
// Session-scoped (resets on reboot, per tuning decision 2).
// ---------------------------------------------------------------------------
const _mintedMobTypes = new Map();
export function getMintedSet(areaId) {
    let s = _mintedMobTypes.get(areaId);
    if (!s) {
        s = new Set();
        _mintedMobTypes.set(areaId, s);
    }
    return s;
}
// ---------------------------------------------------------------------------
// resolveAreaSeed
//
// Returns the area seed for the given areaId.
// Fast path: AreaState.areaSeed (same-session in-memory).
// Fallback: tapestry.area.get(areaId).seed (T5 engine seam, for reloaded areas).
// Returns 0 if neither is available (graceful - determinism degraded but not fatal).
// ---------------------------------------------------------------------------
function resolveAreaSeed(areaId) {
    const areaState = getAreaState(areaId);
    if (areaState) {
        return areaState.areaSeed;
    }
    // T5 fallback: read persisted seed from area.yaml via engine seam.
    const area = tapestry.area && tapestry.area.get(areaId);
    if (area && area.seed) {
        const parsed = parseInt(String(area.seed), 10);
        if (!isNaN(parsed)) {
            return parsed;
        }
        // Seed field present but not parseable as integer - determinism degraded.
        // (tapestry.system is not declared in the type stubs; cast to any for the warn call.)
        tapestry.system?.warn("[oracle] resolveAreaSeed: area '" + areaId + "' has non-integer seed '" + area.seed + "'; falling back to 0. Determinism degraded.");
    }
    else {
        // No in-memory state and no persisted seed. The area may have been reloaded
        // without T6 AuthoredOracleLoader. Room generation will be non-deterministic.
        tapestry.system?.warn("[oracle] resolveAreaSeed: no seed found for area '" + areaId + "'; falling back to 0. Determinism degraded.");
    }
    return 0;
}
// ---------------------------------------------------------------------------
// EMPTY_ROSTER - typed null-object. The roster is no longer consulted in the hot
// path (P-E: frozen tables replace it), but AreaState.roster must satisfy the type.
// ---------------------------------------------------------------------------
const EMPTY_ROSTER = {
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
function normalizeLevelRange(lr) {
    if (lr && typeof lr.length === "number" && lr.length >= 2) {
        const a = parseInt(String(lr[0]), 10);
        const b = parseInt(String(lr[1]), 10);
        if (!isNaN(a) && !isNaN(b)) {
            return [a, b];
        }
    }
    return [1, 5];
}
// ---------------------------------------------------------------------------
// ensureAreaContext - returns the areaId owning roomId, reconstructing the in-memory
// resolver context (AreaState + room->area + room->path + run-state) from the persisted
// area.yaml when it is absent. This is the reboot / reshare path: the in-memory maps
// (set at creation) are empty after a restart, but the room ids encode the namespace +
// grid path, and the seed / level range / theme persist in area.yaml (T5). The biome
// palette is re-derived from the seed via the shared soloAreaBiomePalette helper, so a
// reconstructed area is byte-identical to creation. Returns undefined for a non-oracle
// room (no persisted seed), so the resolver refuses gracefully.
//
// Room id scheme (authored by this pack): "<namespace>:<areaId>-<pathKey>" where pathKey
// is "entry" (= 0,0) or "<x>_<y>" (signed). areaId itself contains hyphens.
// ---------------------------------------------------------------------------
function ensureAreaContext(roomId) {
    const mapped = getRoomArea(roomId);
    if (mapped && getAreaState(mapped)) {
        return mapped; // fully live this session - fast path.
    }
    const colon = roomId.indexOf(":");
    if (colon < 0) {
        return undefined;
    }
    const ns = roomId.slice(0, colon);
    const rest = roomId.slice(colon + 1);
    const m = rest.match(/^(.+)-(entry|-?\d+_-?\d+_-?\d+)$/);
    if (!m) {
        return undefined;
    }
    const areaId = m[1];
    const pathKeyStr = m[2];
    // Only reconstruct for a real oracle area (a persisted seed is the marker).
    const area = tapestry.area && tapestry.area.get(areaId);
    if (!area || !area.seed) {
        return undefined;
    }
    const seed = parseInt(String(area.seed), 10);
    if (isNaN(seed)) {
        return undefined;
    }
    if (!getAreaState(areaId)) {
        // Run-state is session-scoped (resets on reboot, per plan tuning decision 2);
        // a synthetic per-area key suffices since the resolver has no playerId here.
        const runStateKey = "reload:" + areaId;
        setRunState(runStateKey, { roomsSinceLastBoss: 0 });
        const theme = typeof area.theme === "string" ? area.theme : "";
        const themeDir = theme.toLowerCase().indexOf("underdeep") !== -1 ? "endless-underdeep" : "";
        setAreaState(areaId, {
            areaId,
            areaSeed: seed,
            biomePalette: soloAreaBiomePalette(seed),
            theme,
            levelRange: normalizeLevelRange(area.levelRange),
            targetNamespace: ns,
            areaSlug: areaId,
            runStateKey,
            roster: EMPTY_ROSTER,
            sixAxis: loadSixAxisTables(themeDir),
        });
    }
    setRoomArea(roomId, areaId);
    setRoomPath(roomId, parsePathKey(pathKeyStr) || "0,0,0");
    return areaId;
}
// ---------------------------------------------------------------------------
// resolveStub - the E3 hook implementation.
//
// roomId:    the current room the player is standing in.
// direction: the stub direction being traversed ("north","south","east","west").
//
// Returns true if the neighbor was minted + wired (move will complete).
// Returns false on any failure (graceful refusal - "the way is not yet formed").
// ---------------------------------------------------------------------------
function resolveStub(roomId, direction) {
    try {
        // ------------------------------------------------------------------
        // a. Look up area state from the room.
        // ------------------------------------------------------------------
        // Resolve the owning area, reconstructing in-memory context from the persisted
        // area.yaml when this is the first traversal after a reboot/reshare.
        const areaId = ensureAreaContext(roomId);
        if (!areaId) {
            // Room is not oracle-owned (or no persisted seed). Graceful refusal.
            return false;
        }
        const areaState = getAreaState(areaId);
        if (!areaState) {
            // Area state not found - oracle data unavailable.
            return false;
        }
        // ------------------------------------------------------------------
        // b. Compute the neighbor's grid path.
        // ------------------------------------------------------------------
        const currentPath = getRoomPath(roomId);
        if (!currentPath) {
            return false;
        }
        const neighbor = neighborPath(currentPath, direction);
        if (!neighbor) {
            // Not a known direction, or unparseable path. No stub resolver handles it.
            return false;
        }
        // Derive the neighbor room id. Scheme: namespace:areaSlug-x_y_z.
        const neighborKey = pathKey(neighbor);
        const neighborId = areaState.targetNamespace + ":" + areaState.areaSlug + "-" + neighborKey;
        const retDir = oppositeDir(direction);
        // ------------------------------------------------------------------
        // d. Check if neighbor already exists (idempotent backtrack).
        // ------------------------------------------------------------------
        const areaRooms = tapestry.authoring.getAreaRooms(areaId) || [];
        let neighborExists = false;
        for (let i = 0; i < areaRooms.length; i++) {
            if (areaRooms[i].id === neighborId) {
                neighborExists = true;
                break;
            }
        }
        if (neighborExists) {
            // Room already minted (backtrack or revisit). Just ensure exits are wired.
            tapestry.authoring.setRoomExit(roomId, direction, neighborId);
            if (retDir) {
                tapestry.authoring.setRoomExit(neighborId, retDir, roomId);
            }
            return true;
        }
        // ------------------------------------------------------------------
        // e. Resolve the area seed (fast path: in-memory; fallback: T5 seam).
        // ------------------------------------------------------------------
        const areaSeed = resolveAreaSeed(areaId);
        // ------------------------------------------------------------------
        // f. Derive per-neighbor biome deterministically from position.
        // ------------------------------------------------------------------
        const biomeRng = splitmix64(hashCoord(areaSeed, neighbor));
        const biome = pick(areaState.biomePalette, biomeRng);
        const theme = areaState.theme;
        // ------------------------------------------------------------------
        // g. Roll room facts (pure, no side effects).
        //    Roster is no longer used in rollRoomFacts (P-E) but the signature
        //    still accepts it. Pass the null stub from area-state.
        // ------------------------------------------------------------------
        const facts = rollRoomFacts(areaSeed, neighbor, areaState.roster, biome);
        // ------------------------------------------------------------------
        // h. Fetch the run state for this area's solo run.
        //    runStateKey was stored in AreaState at creation (area-gen.ts step 6b).
        // ------------------------------------------------------------------
        const runState = getRunState(areaState.runStateKey);
        if (!runState) {
            // Run state missing - cannot advance boss clock. Graceful refusal.
            return false;
        }
        // ------------------------------------------------------------------
        // i. Materialize the room (committing mint).
        //    This is the ONLY call site. Called once per first arrival.
        //    materializeRoom (P-E) is now synchronous: prose from composeProse,
        //    spawns from frozen tables, no LLM. No async callback needed.
        // ------------------------------------------------------------------
        materializeRoom(neighborId, areaId, areaSeed, facts, runState, biome, theme, getMintedSet(areaId), areaState.sixAxis, descentDepth(neighbor));
        // ------------------------------------------------------------------
        // j. Register the neighbor in area-state so future resolver calls work.
        // ------------------------------------------------------------------
        setRoomArea(neighborId, areaId);
        setRoomPath(neighborId, neighbor);
        // ------------------------------------------------------------------
        // k. Wire the two-way exits.
        //    - Turn the current stub into a real exit pointing to neighborId.
        //    - Wire the return exit on the neighbor back to the current room.
        // ------------------------------------------------------------------
        tapestry.authoring.setRoomExit(roomId, direction, neighborId);
        if (retDir) {
            tapestry.authoring.setRoomExit(neighborId, retDir, roomId);
        }
        return true;
    }
    catch (_err) {
        // Defensive: any failure degrades to graceful refusal, never a crash.
        return false;
    }
}
// ---------------------------------------------------------------------------
// Register the resolver at module load (top-level, fires at boot).
// The engine's StubExitResolver.Register takes the last-registered function;
// v1 has exactly one resolver (the oracle pack).
// ---------------------------------------------------------------------------
tapestry.authoring.registerStubResolver(resolveStub);
