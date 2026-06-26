// coords.ts - 3D grid coordinate primitives for the oracle area graph.
//
// roomPath convention: signed integer triple "x,y,z". Entry room is "0,0,0".
// North = +y, South = -y, East = +x, West = -x, Up = +z, Down = -z.
// Descent (down) lowers z, so descentDepth rises as the player goes deeper - this
// is the depth-degree input the rooms DEGREE axis reads.
//
// Net-new for the six-axis slice: the prior convention was 2D "x,y" with only the
// four cardinals in DIR_OFFSETS, so up/down exits could never mint a distinct room
// (the u/d-exit bug). Adding z plus the up/down offsets fixes that and gives depth.
//
// PURE. No engine calls, no Date, no Math.random. ASCII; braces on all control flow.

export const DIR_OFFSETS: Record<string, [number, number, number]> = {
    north: [0, 1, 0],
    south: [0, -1, 0],
    east: [1, 0, 0],
    west: [-1, 0, 0],
    up: [0, 0, 1],
    down: [0, 0, -1],
};

export const ALL_DIRECTIONS: string[] = Object.keys(DIR_OFFSETS);

export function parseCoord(path: string): [number, number, number] | null {
    // 3D only. A 2D "x,y" is rejected: the room-id scheme is 3D and a 2D-tolerant
    // parse would let a pre-F0 (2D) world re-mint duplicates. F0 needs a re-seed.
    const parts = String(path).split(",");
    if (parts.length !== 3) {
        return null;
    }
    const x = parseInt(parts[0], 10);
    const y = parseInt(parts[1], 10);
    const z = parseInt(parts[2], 10);
    if (isNaN(x) || isNaN(y) || isNaN(z)) {
        return null;
    }
    return [x, y, z];
}

export function formatCoord(x: number, y: number, z: number): string {
    return x + "," + y + "," + z;
}

export function oppositeDir(direction: string): string {
    if (direction === "north") { return "south"; }
    if (direction === "south") { return "north"; }
    if (direction === "east") { return "west"; }
    if (direction === "west") { return "east"; }
    if (direction === "up") { return "down"; }
    if (direction === "down") { return "up"; }
    return "";
}

export function neighborPath(path: string, direction: string): string | null {
    const offset = DIR_OFFSETS[direction];
    if (!offset) { return null; }
    const coords = parseCoord(path);
    if (!coords) { return null; }
    return formatCoord(coords[0] + offset[0], coords[1] + offset[1], coords[2] + offset[2]);
}

export function pathKey(path: string): string {
    const coords = parseCoord(path);
    if (!coords) { return "entry"; }
    return coords[0] + "_" + coords[1] + "_" + coords[2];
}

export function parsePathKey(key: string): string | null {
    // 3D only (no legacy 2D "x_y"). See parseCoord - F0 is a clean break, not a migration.
    if (key === "entry") { return "0,0,0"; }
    const m = key.match(/^(-?\d+)_(-?\d+)_(-?\d+)$/);
    if (!m) { return null; }
    return m[1] + "," + m[2] + "," + m[3];
}

export function descentDepth(path: string): number {
    const coords = parseCoord(path);
    if (!coords) { return 0; }
    return Math.max(0, -coords[2]);
}
