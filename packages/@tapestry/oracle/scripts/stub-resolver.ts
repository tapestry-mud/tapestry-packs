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
import { DIR_OFFSETS, rollRoomFacts, materializeRoom } from "./room-gen.js";
import { hashCoord, splitmix64, pick } from "./prng.js";
import { getAreaState, getRoomArea, getRoomPath, setRoomArea, setRoomPath } from "./area-state.js";
import { getRunState } from "./run-state.js";

// ---------------------------------------------------------------------------
// Per-area in-memory minted type sets.
// Tracks which mob type ids have been minted so shouldReuse can gate on count.
// Session-scoped (resets on reboot, per tuning decision 2).
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

// ---------------------------------------------------------------------------
// resolveAreaSeed
//
// Returns the area seed for the given areaId.
// Fast path: AreaState.areaSeed (same-session in-memory).
// Fallback: tapestry.area.get(areaId).seed (T5 engine seam, for reloaded areas).
// Returns 0 if neither is available (graceful - determinism degraded but not fatal).
// ---------------------------------------------------------------------------

function resolveAreaSeed(areaId: string): number {
    const areaState = getAreaState(areaId);
    if (areaState) {
        return areaState.areaSeed;
    }
    // T5 fallback: read persisted seed from area.yaml via engine seam.
    const area = (tapestry as any).area && (tapestry as any).area.get(areaId);
    if (area && area.seed) {
        const parsed = parseInt(String(area.seed), 10);
        if (!isNaN(parsed)) {
            return parsed;
        }
        // Seed field present but not parseable as integer - determinism degraded.
        // (tapestry.system is not declared in the type stubs; cast to any for the warn call.)
        (tapestry as any).system?.warn("[oracle] resolveAreaSeed: area '" + areaId + "' has non-integer seed '" + area.seed + "'; falling back to 0. Determinism degraded.");
    } else {
        // No in-memory state and no persisted seed. The area may have been reloaded
        // without T6 AuthoredOracleLoader. Room generation will be non-deterministic.
        (tapestry as any).system?.warn("[oracle] resolveAreaSeed: no seed found for area '" + areaId + "'; falling back to 0. Determinism degraded.");
    }
    return 0;
}

// ---------------------------------------------------------------------------
// oppositeDir - returns the cardinal opposite of a direction.
// ---------------------------------------------------------------------------

function oppositeDir(direction: string): string {
    if (direction === "north") { return "south"; }
    if (direction === "south") { return "north"; }
    if (direction === "east") { return "west"; }
    if (direction === "west") { return "east"; }
    return "";
}

// ---------------------------------------------------------------------------
// parseCoord - parse "x,y" into [x, y] integers. Returns null on bad input.
// ---------------------------------------------------------------------------

function parseCoord(path: string): [number, number] | null {
    const parts = path.split(",");
    if (parts.length !== 2) { return null; }
    const x = parseInt(parts[0], 10);
    const y = parseInt(parts[1], 10);
    if (isNaN(x) || isNaN(y)) { return null; }
    return [x, y];
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

function resolveStub(roomId: string, direction: string): boolean {
    try {
        // ------------------------------------------------------------------
        // a. Look up area state from the room.
        // ------------------------------------------------------------------

        const areaId = getRoomArea(roomId);
        if (!areaId) {
            // Room is not registered as oracle-owned. Graceful refusal.
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
            // Current room has no registered path - cannot derive neighbor.
            return false;
        }

        const offset = DIR_OFFSETS[direction];
        if (!offset) {
            // Not a cardinal direction - no stub resolver handles this.
            return false;
        }

        const coords = parseCoord(currentPath);
        if (!coords) {
            return false;
        }

        const neighborX = coords[0] + offset[0];
        const neighborY = coords[1] + offset[1];
        const neighborPath = neighborX + "," + neighborY;

        // ------------------------------------------------------------------
        // c. Derive the neighbor room id.
        //    Scheme: namespace:areaSlug-x_y  (comma replaced with underscore)
        //    e.g. "oracle-run:oracle-run-abc123-0_1"
        // ------------------------------------------------------------------

        const pathKey = neighborX + "_" + neighborY;
        const neighborId = areaState.targetNamespace + ":" + areaState.areaSlug + "-" + pathKey;

        const retDir = oppositeDir(direction);

        // ------------------------------------------------------------------
        // d. Check if neighbor already exists (idempotent backtrack).
        // ------------------------------------------------------------------

        const areaRooms: any[] = tapestry.authoring.getAreaRooms(areaId) || [];
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

        const biomeRng = splitmix64(hashCoord(areaSeed, neighborPath));
        const biome = pick(areaState.biomePalette, biomeRng);
        const theme = areaState.theme;

        // ------------------------------------------------------------------
        // g. Roll room facts (pure, no side effects).
        //    Roster is no longer used in rollRoomFacts (P-E) but the signature
        //    still accepts it. Pass the null stub from area-state.
        // ------------------------------------------------------------------

        const facts = rollRoomFacts(areaSeed, neighborPath, areaState.roster, biome);

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

        materializeRoom(
            neighborId,
            areaId,
            areaSeed,
            facts,
            runState,
            biome,
            theme,
            getMintedSet(areaId)
        );

        // ------------------------------------------------------------------
        // j. Register the neighbor in area-state so future resolver calls work.
        // ------------------------------------------------------------------

        setRoomArea(neighborId, areaId);
        setRoomPath(neighborId, neighborPath);

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
    } catch (_err) {
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
