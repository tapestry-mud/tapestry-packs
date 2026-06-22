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
//   rollRoomFacts is pure; this is the "cache miss -> roll now" seam that P6 will
//   extend by checking its session cache BEFORE calling rollRoomFacts.
//
// ASCII; no em dashes; braces on all control flow.

import * as tapestry from "@tapestry/engine";
import { DIR_OFFSETS, rollRoomFacts, materializeRoom } from "./room-gen.js";
import { hashCoord, splitmix64, pick } from "./prng.js";
import { getAreaState, getRoomArea, getRoomPath, setRoomArea, setRoomPath } from "./area-state.js";
import { getRunState } from "./run-state.js";
import { takeCached, prefetchNeighbors } from "./prefetch.js";

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
        //    P6 and P7 reuse this same scheme.
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
            // setRoomExit is idempotent; re-wiring a real exit is a no-op or harmless.
            tapestry.authoring.setRoomExit(roomId, direction, neighborId);
            if (retDir) {
                tapestry.authoring.setRoomExit(neighborId, retDir, roomId);
            }
            return true;
        }

        // ------------------------------------------------------------------
        // e. Check the session cache first (P6).
        //    Cache hit: use cached facts (and cached prose, if already resolved).
        //    Cache miss: roll room facts now (pure, no side effects).
        //    Either path yields identical facts (hashCoord determinism guarantees it).
        //    takeCached removes the entry: this is the commit-on-travel consume.
        //    Untraveled neighbors stay in the cache until walked into or evicted.
        // ------------------------------------------------------------------

        const cached = takeCached(neighborPath);
        const facts = cached ? cached.facts : rollRoomFacts(areaState.areaSeed, neighborPath, areaState.roster);
        const cachedProse: string | null = cached ? cached.prose : null;

        // ------------------------------------------------------------------
        // f. Fetch the run state for this area's solo run.
        //    runStateKey was stored in AreaState at creation (area-gen.ts step 6b).
        // ------------------------------------------------------------------

        const runState = getRunState(areaState.runStateKey);
        if (!runState) {
            // Run state missing - cannot advance boss clock. Graceful refusal.
            return false;
        }

        // ------------------------------------------------------------------
        // g. Derive the per-room biome deterministically from position.
        //    Uses pick() seeded from hashCoord so revisits are stable.
        // ------------------------------------------------------------------

        const biomeRng = splitmix64(hashCoord(areaState.areaSeed, neighborPath));
        const biome = pick(areaState.biomePalette, biomeRng);
        const theme = areaState.theme;

        // ------------------------------------------------------------------
        // h. Materializethe room (committing mint: createRoom + spawns + boss clock).
        //    This is the ONLY call site. Called once per first arrival.
        //    onProseReady: progressive arrival - player lands on facts, prose follows.
        //
        //    materializeRoom signature (room-gen.ts):
        //      materializeRoom(roomId, areaId, facts, roster, runState, biome, theme, onProseReady?)
        // ------------------------------------------------------------------

        materializeRoom(
            neighborId,
            areaId,
            facts,
            areaState.roster,
            runState,
            biome,
            theme,
            function (_prose: string) {
                // Progressive arrival: prose resolved (LLM or placeholder).
                // The room description was already written inside materializeRoom.
                //
                // P6: trigger background prefetch of the NEW room's candidate
                // neighbors now that the room is committed. This warms them for
                // the next move so prose is likely ready on arrival.
                // prefetchNeighbors is pure-only: no world writes, no materializeRoom,
                // no RunState access. Safe to call from inside the prose callback.
                prefetchNeighbors(
                    areaState.areaSeed,
                    neighborPath,
                    areaState.roster,
                    areaState.biomePalette
                );
            }
        );

        // ------------------------------------------------------------------
        // P6: If the cached entry already had prose, pass it to the room as
        // the final description now (the LLM resolved during prefetch dwell time).
        // materializeRoom already wrote the placeholder; overwrite with cached prose
        // only if it is present and non-empty (progressive arrival: instant upgrade).
        // ------------------------------------------------------------------

        if (cachedProse) {
            tapestry.authoring.setRoomDescription(neighborId, cachedProse);
        }

        // ------------------------------------------------------------------
        // i. Register the neighbor in area-state so future resolver calls work.
        // ------------------------------------------------------------------

        setRoomArea(neighborId, areaId);
        setRoomPath(neighborId, neighborPath);

        // ------------------------------------------------------------------
        // j. Wire the two-way exits.
        //    - Turn the current stub into a real exit pointing to neighborId.
        //    - Wire the return exit on the neighbor back to the current room.
        //    World.MoveEntity re-reads the current room's exit after TryResolve;
        //    setRoomExit(roomId, direction, neighborId) makes it a real exit.
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
