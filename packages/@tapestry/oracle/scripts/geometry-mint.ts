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
// rework made materialization pure math, so 40-150 createRoom calls of pure
// composition run sub-second at creation. Spawns stay lazy (population.ts).
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
    roomNameV3, titleCase, type LandmarkDressing, type SectorPools,
} from "./sector-compose.js";
import { parseCoord, neighborPath, pathKey, ALL_DIRECTIONS } from "./coords.js";
import { diceSpan } from "./six-axis.js";
import { setRoomArea, setRoomPath, type AreaState } from "./area-state.js";

export interface MintResult {
    roomCount: number;
    landmarkRoomIds: string[];
}

const EMPTY_POOLS: SectorPools = {
    qualifier: "", openers: [], details: [], sensory: [], hooks: [], landmarkLines: [],
};

/** Room id for a grid path: the entry cell keeps the historical "-entry" suffix. */
export function roomIdFor(namespace: string, areaSlug: string, path: string): string {
    const suffix = path === "0,0,0" ? "entry" : pathKey(path);
    return namespace + ":" + areaSlug + "-" + suffix;
}

export function mintAreaGeometry(areaState: AreaState): MintResult {
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

    // -----------------------------------------------------------------------
    // Pass 1: create every reachable room (sorted order - deterministic bytes).
    // -----------------------------------------------------------------------

    const landmarkRoomIds: string[] = [];
    for (let r = 0; r < structure.rooms.length; r++) {
        const path = structure.rooms[r];
        const roomId = roomIdFor(areaState.targetNamespace, areaState.areaSlug, path);
        const coords = parseCoord(path);
        if (!coords) { continue; }

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
                const nearLandmark = Math.sqrt(dx * dx + dy * dy) <= 1.5;
                const always = path === "0,0,0" || nearLandmark;
                const ref = landmarkRefLine(areaSeed, path, pools, homeDress, dirWord(path, lmPathStr), always);
                if (ref !== "") {
                    prose = prose + " " + ref;
                }
            }

            name = roomNameV3(areaSeed, path, pools.qualifier, placeNames);
            if (name === "") { name = "Chamber"; }
        }

        tapestry.authoring.createRoom(areaId, roomId, name, prose);
        setRoomArea(roomId, areaId);
        setRoomPath(roomId, path);
    }

    // -----------------------------------------------------------------------
    // Pass 2: wire real two-way exits. Each endpoint sets its own side in the
    // fixed direction order, so exit insertion order (and the side-car bytes)
    // is deterministic. Reciprocity holds because edgeExists(a,b)==edgeExists(b,a).
    // -----------------------------------------------------------------------

    for (let r = 0; r < structure.rooms.length; r++) {
        const path = structure.rooms[r];
        const roomId = roomIdFor(areaState.targetNamespace, areaState.areaSlug, path);
        for (let d = 0; d < ALL_DIRECTIONS.length; d++) {
            const dir = ALL_DIRECTIONS[d];
            const neighbor = neighborPath(path, dir);
            if (!neighbor || !roomSet[neighbor]) { continue; }
            if (!edgeExists(areaSeed, structure.radius, structure.roads, path, neighbor, span)) { continue; }
            const neighborId = roomIdFor(areaState.targetNamespace, areaState.areaSlug, neighbor);
            tapestry.authoring.setRoomExit(roomId, dir, neighborId);
        }
    }

    return { roomCount: structure.rooms.length, landmarkRoomIds };
}
