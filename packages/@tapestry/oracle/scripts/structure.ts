// structure.ts - v3 spatial core: size bands, radius envelope, landmark placement,
// Voronoi sectors, edge-hash exits with forced roads, and the reachable-room set.
//
// EVERYTHING here is pure f(areaSeed, coord) + frozen constants. No engine imports,
// no Date, no Math.random - golden-tested under plain node like coords/prng/degree.
//
// The v3 model (2026-07-02 exploration doc, sections 2-3.8):
//   - target_rooms rolls from a size band and derives a radius envelope R. Edge
//     probability decays toward the rim (full strength inside 0.7R, linear falloff
//     to 0 at R), so the map closes itself at roughly target size with a dead-endier
//     rim. Entry sits at the envelope center (0,0,0).
//   - K landmarks (K = max(2, min(8, round(target/12)))) are placed one per angular
//     wedge at mid-radius with seeded jitter. Spacing by construction, pure f(seed).
//   - sectorOf(coord) = nearest landmark (Voronoi). Border rooms (gap < BORDER_GAP)
//     blend the two nearest sectors' prose pools.
//   - Exit existence is an EDGE property: hash(areaSeed, canonicalEdgeKey) < p.
//     Both endpoints compute the same answer, so reciprocity is free and the v2
//     return-exit inflation class is deleted. Vertical edges run at ~15% of
//     horizontal; per-room degree bands modulate p so fiction and structure agree.
//   - Roads: the Bresenham grid lines entry->each landmark and the landmark ring
//     k->k+1 are FORCED edges. Every landmark is reachable from entry by
//     construction, and goal-directed travel has actual corridors.
//   - reachableRooms = BFS from entry over the edge graph. Geometry is minted
//     eagerly from this set at creation; cells the percolation strands are simply
//     never born. No stubs exist.
//
// ASCII; braces on all control flow.

import { splitmix64, hashCoord } from "./prng.js";
import { parseCoord, formatCoord, neighborPath, descentDepth, ALL_DIRECTIONS } from "./coords.js";
import { roomBiasedDegree } from "./degree.js";

// ---------------------------------------------------------------------------
// Tuning constants (validated by tests/structure.golden.test.mjs)
// ---------------------------------------------------------------------------

/** Base per-edge probability for a horizontal edge at full envelope strength. */
const BASE_EDGE_P = 0.58;

/** Vertical (up/down) edges run at this fraction of horizontal probability. */
const VERTICAL_EDGE_MULT = 0.15;

/** Envelope distance cost per z-level - keeps the map mostly flat; descent is an event. */
const Z_ENVELOPE_COST = 2.5;

/** Base fill fraction at small radii (tuned empirically via the size-band golden). */
const RADIUS_FILL_BASE = 0.62;

/** Fill growth per unit radius past the small-map baseline: bigger envelopes have a
 *  proportionally larger fully-connected interior plus vertical shells, so the
 *  effective fill fraction rises with R. Measured over 40-seed sweeps. */
const RADIUS_FILL_SLOPE = 0.10;
const RADIUS_FILL_KNEE = 3.3;
const RADIUS_FILL_CAP = 1.1;

/** Envelope decay starts at this fraction of R (full strength inside). */
const ENVELOPE_KNEE = 0.7;

/** Sector border threshold: rooms where the two nearest landmarks are within this
 *  distance gap of each other read as transition zones and blend both pools. */
export const BORDER_GAP = 1.5;

/** Size bands: rolled target room counts per player-chosen band. */
export const SIZE_BANDS: Record<string, [number, number]> = {
    school: [18, 24],
    standard: [40, 60],
    epic: [90, 110],
};

// ---------------------------------------------------------------------------
// Size + radius derivations
// ---------------------------------------------------------------------------

/** Roll target_rooms from a band with a single [0,1) draw (dice-owned area fact). */
export function rollTargetRooms(band: string, roll01: number): number {
    const range = SIZE_BANDS[band] || SIZE_BANDS.standard;
    const lo = range[0];
    const hi = range[1];
    return lo + Math.floor(roll01 * (hi - lo + 1));
}

/** K landmarks from target size: ~12 rooms per sector, floor 2, cap 8. */
export function landmarkCount(targetRooms: number): number {
    const k = Math.round(targetRooms / 12);
    if (k < 2) { return 2; }
    if (k > 8) { return 8; }
    return k;
}

/** Effective fill fraction estimate at a given radius (empirical model). */
function fillEstimate(radius: number): number {
    const extra = radius > RADIUS_FILL_KNEE ? (radius - RADIUS_FILL_KNEE) * RADIUS_FILL_SLOPE : 0;
    const fill = RADIUS_FILL_BASE + extra;
    return fill > RADIUS_FILL_CAP ? RADIUS_FILL_CAP : fill;
}

/**
 * Radius envelope R from target_rooms. Because the effective fill fraction rises
 * with R (larger fully-connected interior + vertical shells), R is solved by a
 * short deterministic fixed-point iteration against the fill model rather than a
 * single constant. Float radius; cells live at integer coords.
 */
export function radiusFor(targetRooms: number): number {
    let r = Math.sqrt(targetRooms / (Math.PI * RADIUS_FILL_BASE));
    for (let i = 0; i < 8; i++) {
        r = Math.sqrt(targetRooms / (Math.PI * fillEstimate(r)));
    }
    return r < 3 ? 3 : r;
}

/**
 * Envelope decay factor for a cell: 1 inside ENVELOPE_KNEE*R, linear falloff to 0
 * at R, 0 outside. z-levels cost Z_ENVELOPE_COST each so the envelope is a squat
 * lens, not a sphere - vertical sprawl self-limits.
 */
export function envelopeFactor(x: number, y: number, z: number, radius: number): number {
    const d = Math.sqrt(x * x + y * y) + Z_ENVELOPE_COST * Math.abs(z);
    const knee = ENVELOPE_KNEE * radius;
    if (d <= knee) { return 1; }
    if (d >= radius) { return 0; }
    return (radius - d) / (radius - knee);
}

// ---------------------------------------------------------------------------
// Landmark placement
// ---------------------------------------------------------------------------

export interface LandmarkCell {
    index: number;
    x: number;
    y: number;
    z: number;
}

/**
 * Place K landmarks: one per angular wedge, at mid-radius (0.45R..0.7R) with seeded
 * jitter, snapped to the integer grid, z = 0. Wedge confinement guarantees spacing;
 * a deterministic x-nudge resolves the (rare) snap collision or entry overlap.
 */
export function placeLandmarks(areaSeed: number, targetRooms: number): LandmarkCell[] {
    const k = landmarkCount(targetRooms);
    const radius = radiusFor(targetRooms);
    const rng = splitmix64(hashCoord(areaSeed, "landmarks"));
    const out: LandmarkCell[] = [];
    const taken: Record<string, boolean> = {};
    for (let i = 0; i < k; i++) {
        const theta = ((i + 0.25 + 0.5 * rng()) / k) * 2 * Math.PI;
        const r = radius * (0.45 + 0.25 * rng());
        let x = Math.round(r * Math.cos(theta));
        let y = Math.round(r * Math.sin(theta));
        while ((x === 0 && y === 0) || taken[x + "," + y]) {
            x += x >= 0 ? 1 : -1;
        }
        taken[x + "," + y] = true;
        out.push({ index: i, x, y, z: 0 });
    }
    return out;
}

/** The room path string for a landmark cell. */
export function landmarkPath(l: LandmarkCell): string {
    return formatCoord(l.x, l.y, l.z);
}

// ---------------------------------------------------------------------------
// Voronoi sectors
// ---------------------------------------------------------------------------

export interface SectorInfo {
    /** Index of the nearest landmark (this room's sector). */
    index: number;
    /** Index of the second-nearest landmark (blend partner on borders). */
    second: number;
    /** dist(second) - dist(nearest). Below BORDER_GAP the room is a border room. */
    gap: number;
}

/** Nearest-landmark sector for a cell (2D distance; ties break to the lower index). */
export function sectorOf(landmarks: LandmarkCell[], x: number, y: number): SectorInfo {
    let bestI = 0;
    let bestD = Infinity;
    let secondI = 0;
    let secondD = Infinity;
    for (let i = 0; i < landmarks.length; i++) {
        const dx = x - landmarks[i].x;
        const dy = y - landmarks[i].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestD) {
            secondD = bestD;
            secondI = bestI;
            bestD = d;
            bestI = i;
        } else if (d < secondD) {
            secondD = d;
            secondI = i;
        }
    }
    if (landmarks.length < 2) {
        return { index: bestI, second: bestI, gap: Infinity };
    }
    return { index: bestI, second: secondI, gap: secondD - bestD };
}

// ---------------------------------------------------------------------------
// Roads (forced edges)
// ---------------------------------------------------------------------------

/** Canonical undirected edge key: the two coord strings, sorted, pipe-joined. */
export function edgeKey(aPath: string, bPath: string): string {
    return aPath < bPath ? aPath + "|" + bPath : bPath + "|" + aPath;
}

/** 4-connected grid line (one-axis-per-step Bresenham) between two cells at z=0. */
function gridLine(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
    const cells: Array<[number, number]> = [[x0, y0]];
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x1 > x0 ? 1 : -1;
    const sy = y1 > y0 ? 1 : -1;
    let err = dx - dy;
    while (x !== x1 || y !== y1) {
        const e2 = 2 * err;
        if (e2 > -dy && x !== x1) {
            err -= dy;
            x += sx;
        } else {
            err += dx;
            y += sy;
        }
        cells.push([x, y]);
    }
    return cells;
}

/**
 * Forced road edges: entry->each landmark plus the landmark ring k->k+1.
 * Roads guarantee every landmark is reachable from entry by construction and give
 * goal-directed travel real corridors through the organic sprawl.
 */
export function roadEdges(landmarks: LandmarkCell[]): Set<string> {
    const roads = new Set<string>();
    const addLine = function (x0: number, y0: number, x1: number, y1: number): void {
        const cells = gridLine(x0, y0, x1, y1);
        for (let i = 1; i < cells.length; i++) {
            const a = formatCoord(cells[i - 1][0], cells[i - 1][1], 0);
            const b = formatCoord(cells[i][0], cells[i][1], 0);
            roads.add(edgeKey(a, b));
        }
    };
    for (let i = 0; i < landmarks.length; i++) {
        addLine(0, 0, landmarks[i].x, landmarks[i].y);
    }
    if (landmarks.length > 2) {
        for (let i = 0; i < landmarks.length; i++) {
            const next = landmarks[(i + 1) % landmarks.length];
            addLine(landmarks[i].x, landmarks[i].y, next.x, next.y);
        }
    }
    return roads;
}

// ---------------------------------------------------------------------------
// Pure per-room degree (geometry band)
// ---------------------------------------------------------------------------

/**
 * The pure geometry degree for a room: the depth-biased roll with pressure 0.
 * This is the SAME number the mint-time composer resolves into a ROOM-1 band, so
 * prose cadence, spawn density, and edge counts all agree by construction.
 * (Pressure no longer biases the band - geometry purity requires it; the boss
 * clock remains the deliberate path-dependent channel.)
 */
export function pureDegree(areaSeed: number, path: string, span: [number, number]): number {
    return roomBiasedDegree({
        depth: descentDepth(path),
        pressure: 0,
        rng: splitmix64(hashCoord(areaSeed, path + ":degree")),
        span,
    });
}

/** Edge-probability multiplier from a room's pure degree (band agreement). */
function degreeEdgeMult(areaSeed: number, path: string, span: [number, number]): number {
    const d = pureDegree(areaSeed, path, span);
    if (d <= 2) { return 0.75; }   // transit: thin connective space
    if (d >= 8) { return 1.25; }   // landmark band: may hub
    return 1.0;                    // chamber / charged
}

// ---------------------------------------------------------------------------
// Edge existence
// ---------------------------------------------------------------------------

/**
 * Does the edge between two orthogonally-adjacent cells exist?
 * Pure: hash(areaSeed, canonicalEdgeKey) < p, where p folds base probability,
 * vertical weighting, both endpoints' degree-band multipliers, and the envelope
 * decay of the WEAKER endpoint. Forced roads short-circuit true. Cells at
 * envelope 0 never connect - the map closes at R by construction.
 */
export function edgeExists(
    areaSeed: number,
    radius: number,
    roads: Set<string>,
    aPath: string,
    bPath: string,
    span: [number, number]
): boolean {
    const a = parseCoord(aPath);
    const b = parseCoord(bPath);
    if (!a || !b) { return false; }
    const envA = envelopeFactor(a[0], a[1], a[2], radius);
    const envB = envelopeFactor(b[0], b[1], b[2], radius);
    if (envA <= 0 || envB <= 0) { return false; }
    const key = edgeKey(aPath, bPath);
    if (roads.has(key)) { return true; }
    const vertical = a[2] !== b[2];
    let p = BASE_EDGE_P
        * (vertical ? VERTICAL_EDGE_MULT : 1)
        * degreeEdgeMult(areaSeed, aPath, span)
        * degreeEdgeMult(areaSeed, bPath, span)
        * Math.min(envA, envB);
    if (p > 0.95) { p = 0.95; }
    const roll = splitmix64(hashCoord(areaSeed, "edge:" + key));
    return roll() < p;
}

// ---------------------------------------------------------------------------
// Reachable set (the area's room list)
// ---------------------------------------------------------------------------

export interface AreaStructure {
    targetRooms: number;
    radius: number;
    landmarks: LandmarkCell[];
    roads: Set<string>;
    /** Sorted room paths reachable from entry - the cells that get minted. */
    rooms: string[];
}

/** Default ROOM-1 die span (the shared _default table is 1d10). */
export const DEFAULT_SPAN: [number, number] = [1, 10];

/**
 * Compute the full area structure: landmarks, roads, and the BFS-reachable room
 * set from entry (0,0,0). Deterministic: fixed expansion order, sorted output.
 */
export function computeStructure(
    areaSeed: number,
    targetRooms: number,
    span: [number, number] = DEFAULT_SPAN
): AreaStructure {
    const radius = radiusFor(targetRooms);
    const landmarks = placeLandmarks(areaSeed, targetRooms);
    const roads = roadEdges(landmarks);
    const entry = "0,0,0";
    const visited = new Set<string>();
    visited.add(entry);
    const queue: string[] = [entry];
    while (queue.length > 0) {
        const current = queue.shift() as string;
        for (let i = 0; i < ALL_DIRECTIONS.length; i++) {
            const neighbor = neighborPath(current, ALL_DIRECTIONS[i]);
            if (!neighbor || visited.has(neighbor)) { continue; }
            if (edgeExists(areaSeed, radius, roads, current, neighbor, span)) {
                visited.add(neighbor);
                queue.push(neighbor);
            }
        }
    }
    const rooms: string[] = [];
    visited.forEach(function (p: string): void { rooms.push(p); });
    rooms.sort();
    return { targetRooms, radius, landmarks, roads, rooms };
}

// ---------------------------------------------------------------------------
// Direction words (prose dressing, never an exit claim)
// ---------------------------------------------------------------------------

/**
 * 8-way compass word from one cell toward another, for slot-filled landmark
 * references. Same-column cells resolve to above/below. Same cell -> "".
 */
export function dirWord(fromPath: string, toPath: string): string {
    const a = parseCoord(fromPath);
    const b = parseCoord(toPath);
    if (!a || !b) { return ""; }
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    if (dx === 0 && dy === 0) {
        if (dz > 0) { return "above"; }
        if (dz < 0) { return "below"; }
        return "";
    }
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (adx >= 2 * ady) { return dx > 0 ? "east" : "west"; }
    if (ady >= 2 * adx) { return dy > 0 ? "north" : "south"; }
    const ns = dy > 0 ? "north" : "south";
    const ew = dx > 0 ? "east" : "west";
    return ns + ew;
}
