// owned-runs.ts - the player's list of solo runs they created.
//
// Nothing recorded "who made area X" before this. One JSON-encoded string property
// on the player file, `oracle_runs`, holds one record per run. Written at creation
// (area-gen.createSoloArea), pruned at discard, and lazily pruned on `solo list`
// when an area has vanished underneath it (an admin `solo discard <areaId>` cannot
// reach an offline owner's file).
//
// WHY A JSON STRING and not list_string: one scalar round-trips through the typed
// persist path with no Jint array marshalling, and the record is a struct, not a
// string. `oracle_runs` is DECLARED in properties.yml so it survives the
// registered-only-persist direction.
//
// The v3 self-contained-run lifecycle enriches this same real estate with
// ready/active states. This slice seeds it with the minimum for list + discard.
//
// ASCII; braces on all control flow.

import * as tapestry from "@tapestry/engine";

export const OWNED_RUNS_KEY = "oracle_runs";

export interface OwnedRun {
    areaId: string;
    name: string;
    levelRange: [number, number];
    roomCount: number;
    seed: number;
    packName: string;
}

function toInt(v: any, fallback: number): number {
    const n = parseInt(String(v), 10);
    return isNaN(n) ? fallback : n;
}

/** Pure. Tolerant of every shape a hand-edited or legacy player file can carry. */
export function decodeOwnedRuns(raw: unknown): OwnedRun[] {
    if (raw === null || raw === undefined || raw === "") {
        return [];
    }
    let parsed: any;
    try {
        parsed = JSON.parse(String(raw));
    } catch (_err) {
        return [];
    }
    if (!Array.isArray(parsed)) {
        return [];
    }
    const out: OwnedRun[] = [];
    for (let i = 0; i < parsed.length; i++) {
        const r = parsed[i];
        if (!r || typeof r !== "object") {
            continue;
        }
        const areaId = typeof r.areaId === "string" ? r.areaId : "";
        if (areaId === "") {
            continue;
        }
        const lr = Array.isArray(r.levelRange) && r.levelRange.length >= 2
            ? [toInt(r.levelRange[0], 0), toInt(r.levelRange[1], 0)] as [number, number]
            : [0, 0] as [number, number];
        out.push({
            areaId,
            name: typeof r.name === "string" && r.name !== "" ? r.name : areaId,
            levelRange: lr,
            roomCount: toInt(r.roomCount, 0),
            seed: toInt(r.seed, 0),
            packName: typeof r.packName === "string" ? r.packName : "",
        });
    }
    return out;
}

/** Pure. */
export function encodeOwnedRuns(runs: OwnedRun[]): string {
    return JSON.stringify(runs);
}

export function listOwnedRuns(playerId: string): OwnedRun[] {
    const raw = (tapestry as any).world.getProperty(playerId, OWNED_RUNS_KEY);
    return decodeOwnedRuns(raw);
}

export function writeOwnedRuns(playerId: string, runs: OwnedRun[]): void {
    (tapestry as any).world.setProperty(playerId, OWNED_RUNS_KEY, encodeOwnedRuns(runs));
}

/** Appends, or replaces an existing entry with the same areaId (re-created id). */
export function addOwnedRun(playerId: string, run: OwnedRun): void {
    const runs = listOwnedRuns(playerId);
    let replaced = false;
    for (let i = 0; i < runs.length; i++) {
        if (runs[i].areaId === run.areaId) {
            runs[i] = run;
            replaced = true;
            break;
        }
    }
    if (!replaced) {
        runs.push(run);
    }
    writeOwnedRuns(playerId, runs);
}

/** Returns true when an entry was removed. */
export function removeOwnedRun(playerId: string, areaId: string): boolean {
    const runs = listOwnedRuns(playerId);
    const kept: OwnedRun[] = [];
    for (let i = 0; i < runs.length; i++) {
        if (runs[i].areaId !== areaId) {
            kept.push(runs[i]);
        }
    }
    if (kept.length === runs.length) {
        return false;
    }
    writeOwnedRuns(playerId, kept);
    return true;
}
