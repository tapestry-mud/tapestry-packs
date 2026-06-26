// six-axis.ts - the v2 generator-stack table model (schema + loader + band resolver).
//
// Resolution stays pack-side (the engine has no roll). One table = one YAML file,
// six axes as top-level keys, the die declared as `dice` metadata (never hardcoded).
// parseSixAxisTable is PURE (plain object -> normalized table) so it is node-testable.
// loadSixAxisTables is the CLR-backed glob loader (data.loadYaml), verified at strict boot.
//
// ASCII; braces on all control flow.

import * as tapestry from "@tapestry/engine";
import { rollDice } from "./prng.js";

export type Axis = "DEGREE" | "DRESSING" | "CONSEQUENCE" | "CASCADE" | "SIGNATURE" | "CONTEXT";

export interface BandEntry { min: number; max: number; band: string; effect: string; fires: string; }
export interface ConsequenceEntry {
    id: string; effect: string;
    lifespan: "ephemeral" | "persistent" | "succession-seed";
    tier: "minor" | "moderate" | "severe";
}

export interface SixAxisTable {
    id: string;
    axis: Axis;
    name: string;
    dice: string;
    degree: string;
    bands: BandEntry[];
    subtables: Record<string, string[]>;
    stateOverrides: Record<string, string[]>;
    consequences: ConsequenceEntry[];
    cascades: any[];
    signatures: any[];
    inputs: any[];
}

const VALID_AXES = ["DEGREE", "DRESSING", "CONSEQUENCE", "CASCADE", "SIGNATURE", "CONTEXT"];

// Rebuild a possibly CLR-backed list/object into a native JS array of plain objects.
// (loadYaml returns YamlDotNet-backed values; native rebuild mirrors oracle-tables.ts.)
function nativeArray(raw: any): any[] {
    const out: any[] = [];
    if (!raw || typeof raw.length !== "number") { return out; }
    for (let i = 0; i < raw.length; i++) {
        const e = raw[i];
        if (e && typeof e === "object") {
            const o: any = {};
            for (const k in e) {
                if (Object.prototype.hasOwnProperty.call(e, k)) { o[k] = e[k]; }
            }
            out.push(o);
        } else {
            out.push(e);
        }
    }
    return out;
}

function nativeStringMap(raw: any): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    if (!raw || typeof raw !== "object") { return out; }
    for (const k in raw) {
        if (Object.prototype.hasOwnProperty.call(raw, k)) {
            out[k] = nativeArray(raw[k]).map(function (s) { return String(s); });
        }
    }
    return out;
}

export function parseSixAxisTable(raw: any): SixAxisTable {
    if (!raw || typeof raw !== "object") {
        throw new Error("six-axis: table is not an object");
    }
    const axis = String(raw.axis || "");
    if (VALID_AXES.indexOf(axis) === -1) {
        throw new Error("six-axis: invalid or missing axis '" + axis + "' for table '" + String(raw.table) + "'");
    }

    const t: SixAxisTable = {
        id: String(raw.table || ""),
        axis: axis as Axis,
        name: String(raw.name || ""),
        dice: String(raw.dice || ""),
        degree: String(raw.degree || ""),
        bands: [],
        subtables: {},
        stateOverrides: {},
        consequences: [],
        cascades: [],
        signatures: [],
        inputs: [],
    };

    if (axis === "DEGREE") {
        const bands = nativeArray(raw.bands);
        for (let i = 0; i < bands.length; i++) {
            const b = bands[i];
            t.bands.push({
                min: parseInt(String(b.min), 10),
                max: parseInt(String(b.max), 10),
                band: String(b.band),
                effect: String(b.effect || ""),
                fires: String(b.fires || ""),
            });
        }
    } else if (axis === "DRESSING") {
        const subs = nativeStringMap(raw.subtables);
        for (const k in subs) {
            if (!Object.prototype.hasOwnProperty.call(subs, k)) { continue; }
            if (k === "state_overrides") {
                // state_overrides is nested one level deeper (kind -> fragments).
                t.stateOverrides = nativeStringMap((raw.subtables as any).state_overrides);
            } else {
                t.subtables[k] = subs[k];
            }
        }
    } else if (axis === "CONSEQUENCE") {
        const tiers = raw.tiers || {};
        const tierNames = ["minor", "moderate", "severe"];
        for (let ti = 0; ti < tierNames.length; ti++) {
            const tier = tierNames[ti];
            const list = nativeArray((tiers as any)[tier]);
            for (let i = 0; i < list.length; i++) {
                const c = list[i];
                t.consequences.push({
                    id: String(c.id),
                    effect: String(c.effect || ""),
                    lifespan: String(c.lifespan || "ephemeral") as ConsequenceEntry["lifespan"],
                    tier: tier as ConsequenceEntry["tier"],
                });
            }
        }
    } else if (axis === "CASCADE") {
        t.cascades = nativeArray(raw.entries);
    } else if (axis === "SIGNATURE") {
        t.signatures = nativeArray(raw.entries);
    } else if (axis === "CONTEXT") {
        t.inputs = nativeArray(raw.inputs);
    }

    return t;
}

export function diceSpan(dice: string): [number, number] {
    const m = /^(\d+)d(\d+)([+-]\d+)?$/i.exec(String(dice).trim());
    if (!m) {
        const k = parseInt(String(dice), 10);
        if (isNaN(k)) { return [1, 1]; }
        return [k, k];
    }
    const count = parseInt(m[1], 10);
    const sides = parseInt(m[2], 10);
    const mod = m[3] ? parseInt(m[3], 10) : 0;
    return [count + mod, count * sides + mod];
}

export function rollDegree(table: SixAxisTable, rng: () => number): number {
    return rollDice(table.dice, rng);
}

export function resolveBands(table: SixAxisTable, degree: number): BandEntry {
    if (table.axis !== "DEGREE") {
        throw new Error("six-axis: resolveBands requires a DEGREE table, got '" + table.axis + "'");
    }
    if (table.bands.length === 0) {
        throw new Error("six-axis: DEGREE table '" + table.id + "' has no bands");
    }
    const span = diceSpan(table.dice);
    let d = Math.round(degree);
    if (d < span[0]) { d = span[0]; }
    if (d > span[1]) { d = span[1]; }
    for (let i = 0; i < table.bands.length; i++) {
        const b = table.bands[i];
        if (d >= b.min && d <= b.max) {
            return b;
        }
    }
    return table.bands[table.bands.length - 1];
}

export function loadSixAxisTables(areaThemeDir: string): Record<string, SixAxisTable> {
    const out: Record<string, SixAxisTable> = {};
    const ids = ["ROOM-1", "ROOM-2", "ROOM-3", "ROOM-4", "ROOM-5", "ROOM-6"];
    for (let i = 0; i < ids.length; i++) {
        const path = "data/six-axis/" + areaThemeDir + "/" + ids[i] + ".yaml";
        try {
            const raw: any = (tapestry as any).data.loadYaml(path);
            if (raw && raw.table) {
                const table = parseSixAxisTable(raw);
                out[table.id] = table;
            }
        } catch (_err) {
            // Missing file or parse failure: skip gracefully (graceful degradation,
            // same posture as resolveAreaSeed). A real boot issue surfaces at strict boot.
        }
    }
    return out;
}
