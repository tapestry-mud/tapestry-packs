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

// The six-axis theme dirs to eager-load (each is data/six-axis/<theme>/ROOM-1..6.yaml).
// One per authored theme - extend this when a new themed table set ships, exactly like
// BAKED_SET_IDS gates the baked rosters. The solo-flow scenario picker reads this too.
export const SIX_AXIS_THEMES: string[] = ["endless-underdeep"];

// Eager-load + cache ALL theme tables at MODULE INIT, when the oracle pack is being
// loaded and tapestry.data.loadYaml resolves against the oracle pack dir
// (PackContext.CurrentPackDir). A LAZY runtime load is the bug this replaces:
// CurrentPackDir is set only during pack load (PackLoader), so at runtime it holds the
// LAST-loaded pack (the @scratch dest pack, load_order 900), which has no data/six-axis -
// the load silently returns nothing and every room falls back to flat. The baked-table
// loader (oracle-tables.ts BAKED) uses this same module-init pattern for the same reason.
const SIX_AXIS_CACHE: Record<string, Record<string, SixAxisTable>> = ((): Record<string, Record<string, SixAxisTable>> => {
    const all: Record<string, Record<string, SixAxisTable>> = {};
    const ids = ["ROOM-1", "ROOM-2", "ROOM-3", "ROOM-4", "ROOM-5", "ROOM-6"];
    for (let t = 0; t < SIX_AXIS_THEMES.length; t++) {
        const theme = SIX_AXIS_THEMES[t];
        const out: Record<string, SixAxisTable> = {};
        for (let i = 0; i < ids.length; i++) {
            const path = "data/six-axis/" + theme + "/" + ids[i] + ".yaml";
            try {
                const raw: any = (tapestry as any).data.loadYaml(path);
                if (raw && raw.table) {
                    const table = parseSixAxisTable(raw);
                    out[table.id] = table;
                }
            } catch (_err) {
                // Missing file or parse failure: skip gracefully (graceful degradation).
            }
        }
        all[theme] = out;
    }
    return all;
})();

export function loadSixAxisTables(areaThemeDir: string): Record<string, SixAxisTable> {
    if (!areaThemeDir) {
        return {};
    }
    return SIX_AXIS_CACHE[areaThemeDir] || {};
}

// Shared mechanics tables (ROOM-1 bands + ROOM-3 taxonomy + MOB-1 menace bands) used by
// EVERY area. Theme-agnostic game logic the LLM never touches. Eager-loaded at module
// init, same posture as SIX_AXIS_CACHE.
const DEFAULT_MECHANICS: Record<string, SixAxisTable> = ((): Record<string, SixAxisTable> => {
    const out: Record<string, SixAxisTable> = {};
    const ids = ["ROOM-1", "ROOM-3", "MOB-1", "ITEM-1", "ITEM-6"];
    for (let i = 0; i < ids.length; i++) {
        const path = "data/six-axis/_default/" + ids[i] + ".yaml";
        try {
            const raw: any = (tapestry as any).data.loadYaml(path);
            if (raw && raw.table) {
                const t = parseSixAxisTable(raw);
                out[t.id] = t;
            }
        } catch (_err) {
            // graceful: missing/invalid default mechanics file is skipped.
        }
    }
    return out;
})();

// PURE: build a per-area ROOM-2 DRESSING table from the area's frozen prose + scars oracle
// entries (name = tag/kind, desc = line). subtables come from the prose table
// (openers/details/atmosphere); stateOverrides (the consequence scar prose) from the scars
// table. This is how an LLM-themed area gets six-axis dressing without authored YAML.
export function assembleRoom2(proseEntries: any[], scarEntries: any[]): SixAxisTable {
    const subtables: Record<string, string[]> = { openers: [], details: [], atmosphere: [] };
    // The prose table tags are SINGULAR (opener/detail/atmosphere); composeRoomProse reads the
    // PLURAL subtable keys (openers/details/atmosphere). Map singular tag -> plural key.
    const TAG_TO_SUB: Record<string, string> = { opener: "openers", detail: "details", atmosphere: "atmosphere" };
    const prose = Array.isArray(proseEntries) ? proseEntries : [];
    for (let i = 0; i < prose.length; i++) {
        const e = prose[i];
        const subKey = TAG_TO_SUB[String((e && e.name) || "")];
        if (subKey) {
            subtables[subKey].push(String((e && e.desc) || ""));
        }
    }
    const stateOverrides: Record<string, string[]> = {};
    const scars = Array.isArray(scarEntries) ? scarEntries : [];
    for (let i = 0; i < scars.length; i++) {
        const e = scars[i];
        const kind = String((e && e.name) || "");
        if (kind === "") { continue; }
        if (!stateOverrides[kind]) { stateOverrides[kind] = []; }
        stateOverrides[kind].push(String((e && e.desc) || ""));
    }
    return {
        id: "ROOM-2", axis: "DRESSING", name: "Composition (generated)",
        dice: "", degree: "", bands: [], subtables, stateOverrides,
        consequences: [], cascades: [], signatures: [], inputs: [],
    };
}

// Build the full six-axis table set for an area: shared mechanics + dressing.
// An AUTHORED theme (e.g. endless-underdeep) uses its full authored set (its ROOM-2 wins).
// Any other area (LLM-themed or flat baked) gets the shared mechanics + a ROOM-2 assembled
// from its frozen prose + scars tables - so every area is six-axis, not just authored themes.
export function buildAreaSixAxis(
    themeDir: string,
    proseEntries: any[],
    scarEntries: any[]
): Record<string, SixAxisTable> {
    const out: Record<string, SixAxisTable> = {};
    for (const k in DEFAULT_MECHANICS) {
        if (Object.prototype.hasOwnProperty.call(DEFAULT_MECHANICS, k)) { out[k] = DEFAULT_MECHANICS[k]; }
    }
    const authored = themeDir ? (SIX_AXIS_CACHE[themeDir] || null) : null;
    if (authored && authored["ROOM-2"]) {
        for (const k in authored) {
            if (Object.prototype.hasOwnProperty.call(authored, k)) { out[k] = authored[k]; }
        }
    } else {
        out["ROOM-2"] = assembleRoom2(proseEntries, scarEntries);
    }
    return out;
}
