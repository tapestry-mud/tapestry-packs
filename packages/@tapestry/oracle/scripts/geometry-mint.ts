// geometry-mint.ts - the v3 eager whole-area mint.
//
// Called ONCE at creation, after the tables freeze: computes the pure structure
// (envelope, landmarks, sectors, edge graph, reachable set), then mints EVERY
// reachable room with composed prose and wires REAL two-way exits for every
// edge. No stubs exist afterwards - flee, wander, and pathfinding all work
// because every exit leads to a real room. Rim rooms simply have fewer exits;
// the envelope closes the map by construction.
//
// Per-room laziness was a vestige of hiding per-room LLM latency; the P-E
// rework made materialization pure math. Spawns stay lazy (population.ts).
//
// CHUNKED ACROSS TICKS: the engine caps every top-level Jint entry at 5s wall
// clock (JintRuntime TimeoutInterval) and each createRoom/setRoomExit writes a
// side-car synchronously - a 70-room area is ~500 file writes, which can blow
// the cap inside one call (the constraint interrupt surfaces as bogus
// ReferenceErrors mid-function). The mint therefore runs CHUNK_ROOMS per
// engine tick via tapestry.schedule: still whole-area at creation, just
// spread over ~1-2s that the flavor-wait loop already covers. The completion
// callback fires when the last exit is wired.
//
// Prose assembly per composed room: sector-pool cadence composition + the
// appended landmark direction line (the mint-time twin of the scar append
// mechanic), all frozen into the room side-car here. Landmark rooms use their
// bespoke frozen description verbatim.
//
// ASCII; braces on all control flow.

import * as tapestry from "@tapestry/engine";
import {
    computeStructure, sectorOf, edgeExists, landmarkPath, pureDegree, dirWord,
    BORDER_GAP, DEFAULT_SPAN, type AreaStructure, type LandmarkCell,
} from "./structure.js";
import {
    parseLandmarksTable, parseSectorsTable, composeRoomV3, landmarkRefLine,
    dealSectorNames, titleCase, type LandmarkDressing, type SectorPools,
} from "./sector-compose.js";
import { parseCoord, neighborPath, pathKey, ALL_DIRECTIONS } from "./coords.js";
import { diceSpan } from "./six-axis.js";
import { setRoomArea, setRoomPath, type AreaState } from "./area-state.js";
import { RUN_NAMESPACE, runEntryRoomId } from "./run-entry.js";

export interface MintResult {
    roomCount: number;
    landmarkRoomIds: string[];
}

const EMPTY_POOLS: SectorPools = {
    qualifiers: [], openers: [], details: [], sensory: [], hooks: [], landmarkLines: [],
};

/** Rooms minted (pass 1) or exit-wired (pass 2) per engine tick.
 *
 *  There are TWO ceilings here and only the looser one was ever honoured. The 5s
 *  Jint entry cap is the correctness ceiling: exceed it and the constraint
 *  interrupt surfaces as bogus ReferenceErrors mid-function. The 50ms slow-tick
 *  budget on a 100ms tick is the liveness one, and it binds roughly a hundred
 *  times sooner. At 12 this handler was measured on a 2-core CI runner at
 *  59-86ms wall, ALL of it cpu (`cpu-bound`, not preempted), driving whole ticks
 *  to 96-187ms against a 100ms rate. Overrunning the tick starves the command
 *  FIFO, which is what made the telnet scenario suite fail a different scenario
 *  almost every run -- a `quit` echoed but never processed, a mob wandering off
 *  between the look that found it and the kill that could not.
 *
 *  Sized against the tick budget instead: ~5-7ms per room measured, so 4 rooms
 *  lands near 20-28ms with headroom on a slow runner, and stays far under the
 *  Jint cap it was originally sized for. The cost is wall-clock -- a 40-room
 *  area mints in ~20 ticks (~2s) rather than ~8 -- which the flavor-wait loop
 *  at creation already covers. Do not raise this to "mint faster": the tick it
 *  runs on is shared with every player's input. */
const CHUNK_ROOMS = 4;

/**
 * Room id for a grid path: the entry cell keeps the historical "-entry" suffix.
 *
 * The run-entry case (namespace === RUN_NAMESPACE, path "0,0,0") delegates to
 * runEntryRoomId instead of reproducing its formula inline - review finding 1
 * (fix-plan pass on Task 5): startRun's oracle_active_run composite and this
 * function's minted entry room used to be two independently-maintained string
 * formulas that only matched because RUN_NAMESPACE happened to equal the run
 * targetNamespace today. Routing through the shared helper makes them
 * genuinely ONE formula, so a future edit to either can't silently desync the
 * death handler's respawn target from the room actually minted. The non-run
 * path (createSoloArea's solo areas, any other namespace) is untouched.
 */
export function roomIdFor(namespace: string, areaSlug: string, path: string): string {
    if (namespace === RUN_NAMESPACE && path === "0,0,0") {
        return runEntryRoomId(areaSlug);
    }
    const suffix = path === "0,0,0" ? "entry" : pathKey(path);
    return namespace + ":" + areaSlug + "-" + suffix;
}

export function mintAreaGeometry(areaState: AreaState, onDone: (result: MintResult) => void): void {
    const areaId = areaState.areaId;
    const areaSeed = areaState.areaSeed;
    const room1 = areaState.sixAxis["ROOM-1"];
    const span: [number, number] = room1 ? diceSpan(room1.dice) : DEFAULT_SPAN;
    const structure: AreaStructure = computeStructure(areaSeed, areaState.targetRooms, span);

    // Frozen dressing (already normalized: exactly K landmarks + K pool-sets).
    const lmTable = (tapestry as any).oracle.table(areaId + ":landmarks");
    const landmarks: LandmarkDressing[] = parseLandmarksTable(lmTable ? lmTable.entries : []);
    const secTable = (tapestry as any).oracle.table(areaId + ":sectors");
    const sectors: SectorPools[] = parseSectorsTable(secTable ? secTable.entries : []);
    const placesTable = (tapestry as any).oracle.table(areaId + ":places");
    const placeNames: string[] = [];
    if (placesTable && placesTable.entries) {
        for (let i = 0; i < placesTable.entries.length; i++) {
            const n = String((placesTable.entries[i] && placesTable.entries[i].name) || "");
            if (n !== "") { placeNames.push(n); }
        }
    }

    // Landmark cell lookup by path.
    const landmarkAt: Record<string, LandmarkCell> = {};
    for (let i = 0; i < structure.landmarks.length; i++) {
        landmarkAt[landmarkPath(structure.landmarks[i])] = structure.landmarks[i];
    }

    const roomSet: Record<string, boolean> = {};
    for (let i = 0; i < structure.rooms.length; i++) {
        roomSet[structure.rooms[i]] = true;
    }

    // Mint-time no-replacement name deal: each sector deals its qualifier x place
    // product deck to its composed rooms (pure, traversal-independent).
    const nameByPath = dealSectorNames(areaSeed, structure.rooms, structure.landmarks, sectors, placeNames);

    // -----------------------------------------------------------------------
    // Pass 1 (chunked): create every reachable room (sorted order -
    // deterministic bytes). Pass 2 (chunked): wire real two-way exits, each
    // endpoint setting its own side in the fixed direction order, so exit
    // insertion order (and the side-car bytes) is deterministic. Reciprocity
    // holds because edgeExists(a,b) == edgeExists(b,a).
    // -----------------------------------------------------------------------

    const landmarkRoomIds: string[] = [];

    const mintOne = function (path: string): void {
        const roomId = roomIdFor(areaState.targetNamespace, areaState.areaSlug, path);
        const coords = parseCoord(path);
        if (!coords) { return; }

        let name: string;
        let prose: string;
        const lmCell = landmarkAt[path];
        if (lmCell && landmarks[lmCell.index]) {
            // Bespoke landmark room: the frozen record IS the description.
            const dress = landmarks[lmCell.index];
            name = titleCase(dress.name);
            prose = dress.desc;
            landmarkRoomIds.push(roomId);
        } else {
            const degree = pureDegree(areaSeed, path, span);
            const sec = sectorOf(structure.landmarks, coords[0], coords[1]);
            const pools = sectors[sec.index] || EMPTY_POOLS;
            const blend = sec.gap < BORDER_GAP ? (sectors[sec.second] || null) : null;
            prose = composeRoomV3(areaSeed, path, degree, pools, blend);
            if (prose === "") { prose = "A plain space."; }

            // Appended landmark reference: dice-owned direction, frozen at mint.
            const homeLm = structure.landmarks[sec.index];
            const homeDress = landmarks[sec.index];
            if (homeLm && homeDress && homeDress.name !== "") {
                const lmPathStr = landmarkPath(homeLm);
                const dx = coords[0] - homeLm.x;
                const dy = coords[1] - homeLm.y;
                const distToHome = Math.sqrt(dx * dx + dy * dy);
                const nearLandmark = distToHome <= 1.5;
                const always = path === "0,0,0" || nearLandmark;
                const ref = landmarkRefLine(areaSeed, path, pools, homeDress, dirWord(path, lmPathStr), always, distToHome);
                if (ref !== "") {
                    prose = prose + " " + ref;
                }
            }

            name = nameByPath[path] || "";
            if (name === "") { name = "Chamber"; }
        }

        tapestry.authoring.createRoom(areaId, roomId, name, prose);
        setRoomArea(roomId, areaId);
        setRoomPath(roomId, path);
    };

    const wireOne = function (path: string): void {
        const roomId = roomIdFor(areaState.targetNamespace, areaState.areaSlug, path);
        for (let d = 0; d < ALL_DIRECTIONS.length; d++) {
            const dir = ALL_DIRECTIONS[d];
            const neighbor = neighborPath(path, dir);
            if (!neighbor || !roomSet[neighbor]) { continue; }
            if (!edgeExists(areaSeed, structure.radius, structure.roads, path, neighbor, span)) { continue; }
            const neighborId = roomIdFor(areaState.targetNamespace, areaState.areaSlug, neighbor);
            tapestry.authoring.setRoomExit(roomId, dir, neighborId);
        }
    };

    // Tick-driven chunk loop: phase 1 mints, phase 2 wires, then completion.
    let phase = 1;
    let idx = 0;
    let handle: string;
    const step = function (): void {
        try {
            const work = phase === 1 ? mintOne : wireOne;
            const end = Math.min(idx + CHUNK_ROOMS, structure.rooms.length);
            for (; idx < end; idx++) {
                work(structure.rooms[idx]);
            }
            if (idx < structure.rooms.length) { return; }
            if (phase === 1) {
                phase = 2;
                idx = 0;
                return;
            }
            tapestry.schedule.cancel(handle);
            onDone({ roomCount: structure.rooms.length, landmarkRoomIds });
        } catch (err) {
            // Defensive: never leave the loop armed after a failure. The area
            // may be partially minted; completing lets the caller land the
            // player in what exists rather than stranding them.
            tapestry.schedule.cancel(handle);
            (tapestry as any).system?.warn("[oracle] mintAreaGeometry failed at phase " + phase + " index " + idx + ": " + ((err as any) && (err as any).message ? (err as any).message : String(err)));
            onDone({ roomCount: idx, landmarkRoomIds });
        }
    };
    handle = tapestry.schedule.every(1, step);
}
