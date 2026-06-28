// oracle-tables.ts - Oracle table schema + table-fill generators.
//
// fillTables fires the front-loaded LLM burst (places, mobs, boss, items, prose
// fragments) within the RecommendMaxInFlight=2 budget, assembles the filled
// tables, and calls onReady when all resolve (or fall back to deterministic
// fallbacks when the LLM is off or returns empty data).
//
// This is the ONLY LLM work in the table-fill lane. P-C and P-D consume the
// filled tables deterministically.
//
// Burst sequencing:
//   Round 1 (in flight: 1): fill_places
//   Round 2 (in flight: up to 2 at once): fill_mobs, fill_boss, fill_items
//     (fired in pairs to stay under RecommendMaxInFlight=2)
//   Round 3 (in flight: up to 2 at once): fill_prose_openers, fill_prose_details,
//     fill_prose_atmosphere (fired after mobs/boss/items complete, also in pairs)
//
// bakedTables(setId) returns a hand-authored OracleTableData[] for that set.
// Tables are eagerly loaded at module init time (P-F) - the engine clears
// CurrentPackDir after boot, so any lazy load inside a runtime callback returns null.

import * as tapestry from "@tapestry/engine";
import { getPrompt } from "./prompts.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OracleEntry {
    w: number;
    id: string;
    name: string;
    desc: string;
    balance_ref?: string;
    rarity?: string;
}

export interface OracleTableData {
    kind: string;
    entries: OracleEntry[];
}

// ---------------------------------------------------------------------------
// Mapping + schemas live in oracle-structured.ts (pure, zero engine imports, golden-tested).
// The recommend seam returns JSON constrained by the per-kind schemas; the mappers JSON.parse
// + map to OracleEntry (and []-on-failure -> the caller falls back to baked entries).
// slug is re-exported so existing importers keep working.
// ---------------------------------------------------------------------------

export { slug } from "./oracle-structured.js";
import {
    slug,
    mapPlaces, mapMobs, mapBoss, mapItems, mapProse,
    SCHEMA_PLACES, SCHEMA_MOBS, SCHEMA_BOSS, SCHEMA_ITEMS, SCHEMA_PROSE,
} from "./oracle-structured.js";

// ---------------------------------------------------------------------------
// recommend call wrapper
// ---------------------------------------------------------------------------

type Recommend = (opts: any, cb: (result: string | null) => void) => void;

function call(
    recommend: Recommend,
    promptKey: string,
    vars: Record<string, string>,
    schema: string,
    cb: (r: string | null) => void
): void {
    const pr = getPrompt(promptKey);
    recommend({ field: promptKey, template: pr.template, system: pr.system, vars, schema }, cb);
}

// ---------------------------------------------------------------------------
// fillTables
//
// Fires the LLM burst and assembles OracleTableData[] for this area.
// Calls onReady once all tables are resolved (LLM or fallback).
//
// The burst is sequenced so we never exceed RecommendMaxInFlight=2:
//   - places is fired alone (1 in-flight).
//   - mobs, boss, items fire as pairs (first 2, then the 3rd when any completes).
//   - prose openers/details/atmosphere fire after all 3 above complete, in pairs.
// ---------------------------------------------------------------------------

export function fillTables(
    idea: string,
    levelRange: [number, number],
    onReady: (tables: OracleTableData[]) => void
): void {
    const recommend: Recommend = (tapestry as any).authoring.recommend;
    const tables: OracleTableData[] = [];
    const vars: Record<string, string> = {
        idea,
        level_min: String(levelRange[0]),
        level_max: String(levelRange[1]),
    };

    // Step 1: fill places first - prose fills key off the place list.
    call(recommend, "fill_places", vars, SCHEMA_PLACES, (placesRaw) => {
        const places = mapPlaces(placesRaw);
        const placeList = places.length > 0 ? places : ["hall", "passage", "chamber", "corner", "threshold", "alcove"];
        tables.push({
            kind: "places",
            entries: placeList.map((p) => ({ w: 10, id: slug(p), name: p, desc: "" })),
        });

        // Step 2: mobs, boss, items in a batch of 3.
        // Fire them in pairs to stay under the in-flight limit.
        let pending = 3;
        const done = () => {
            pending -= 1;
            if (pending === 0) {
                fillProse(recommend, idea, placeList, tables, onReady);
            }
        };

        // Pair 1: mobs + boss (2 in-flight).
        // fill_items is chained inside the mobs callback so it fires only after
        // mobs resolves (freeing one slot), keeping in-flight <= 2 at all times.
        let itemsFired = false;
        const fireItems = () => {
            if (itemsFired) { return; }
            itemsFired = true;
            call(recommend, "fill_items", vars, SCHEMA_ITEMS, (raw) => {
                const entries = mapItems(raw);
                tables.push({ kind: "items", entries: entries.length > 0 ? entries : fallbackItems() });
                done();
            });
        };
        call(recommend, "fill_mobs", vars, SCHEMA_MOBS, (raw) => {
            const entries = mapMobs(raw);
            tables.push({ kind: "mobs", entries: entries.length > 0 ? entries : fallbackMobs() });
            done();
            // mobs slot freed - now fire items (boss may still be in-flight: 1 -> 2).
            fireItems();
        });
        call(recommend, "fill_boss", vars, SCHEMA_BOSS, (raw) => {
            const entries = mapBoss(raw);
            tables.push({ kind: "boss", entries: entries.length > 0 ? entries : fallbackBoss() });
            done();
            // boss slot freed - fire items if mobs hasn't already triggered it.
            fireItems();
        });
    });
}

// ---------------------------------------------------------------------------
// fillProse (private)
//
// Fires the three prose LLM calls after mobs/boss/items all complete.
// All prose fragments go into a single "prose" table with entries tagged by
// sub-kind via the entry name field ("opener", "detail", "atmosphere").
// ---------------------------------------------------------------------------

function fillProse(
    recommend: Recommend,
    idea: string,
    places: string[],
    tables: OracleTableData[],
    onReady: (t: OracleTableData[]) => void
): void {
    const proseEntries: OracleEntry[] = [];
    // Phase 1: fill fragments for the primary place; used loosely for all rooms.
    const keyPlace = places[0] || "chamber";
    let pending = 3;
    const done = () => {
        pending -= 1;
        if (pending === 0) {
            if (proseEntries.length === 0) {
                for (const e of fallbackProse()) { proseEntries.push(e); }
            }
            tables.push({ kind: "prose", entries: proseEntries });
            onReady(tables);
        }
    };
    const proseVars: Record<string, string> = { idea, place: keyPlace };

    // Pair 1: openers + details (2 in-flight).
    // fill_prose_atmosphere is chained inside the openers callback so it fires only
    // after openers resolves, keeping in-flight <= 2 at all times.
    let atmosphereFired = false;
    const fireAtmosphere = () => {
        if (atmosphereFired) { return; }
        atmosphereFired = true;
        call(recommend, "fill_prose_atmosphere", proseVars, SCHEMA_PROSE, (raw) => {
            for (const e of mapProse(raw, "atmosphere")) { proseEntries.push(e); }
            done();
        });
    };
    call(recommend, "fill_prose_openers", proseVars, SCHEMA_PROSE, (raw) => {
        for (const e of mapProse(raw, "opener")) { proseEntries.push(e); }
        done();
        // openers slot freed - now fire atmosphere (details may still be in-flight: 1 -> 2).
        fireAtmosphere();
    });
    call(recommend, "fill_prose_details", proseVars, SCHEMA_PROSE, (raw) => {
        for (const e of mapProse(raw, "detail")) { proseEntries.push(e); }
        done();
        // details slot freed - fire atmosphere if openers hasn't already triggered it.
        fireAtmosphere();
    });
}

// ---------------------------------------------------------------------------
// bakedTables
//
// Return the eagerly-loaded baked table set for a given setId.
// Falls back to "test-kitchen" if the requested id is unknown.
//
// EAGER load at module init - the engine clears CurrentPackDir after boot,
// so a lazy load inside any runtime callback returns null.
// ---------------------------------------------------------------------------

const BAKED_KINDS = ["places", "mobs", "boss", "items", "rooms", "prose"];
export const BAKED_SET_IDS = ["test-kitchen"]; // phase-1 minimal set; add ids as baked sets are authored

// Rebuild loadYaml entry rows (CLR-backed, not native JsArrays) into native JS objects
// so the writeOracleTable freeze keeps them. Tolerates string-typed scalars from YAML.
function nativeEntries(src: any): OracleEntry[] {
    const out: OracleEntry[] = [];
    if (!src || typeof src.length !== "number") { return out; }
    for (let i = 0; i < src.length; i++) {
        const e = src[i];
        if (!e) { continue; }
        const entry: OracleEntry = {
            w: typeof e.w === "number" ? e.w : (parseInt(String(e.w), 10) || 0),
            id: e.id != null ? String(e.id) : "",
            name: e.name != null ? String(e.name) : "",
            desc: e.desc != null ? String(e.desc) : "",
        };
        if (e.balance_ref != null) { entry.balance_ref = String(e.balance_ref); }
        if (e.rarity != null) { entry.rarity = String(e.rarity); }
        out.push(entry);
    }
    return out;
}

const BAKED: Record<string, OracleTableData[]> = ((): Record<string, OracleTableData[]> => {
    const all: Record<string, OracleTableData[]> = {};
    for (const setId of BAKED_SET_IDS) {
        const tables: OracleTableData[] = [];
        for (const kind of BAKED_KINDS) {
            const raw: any = (tapestry as any).data.loadYaml("data/baked/" + setId + "/" + kind + ".yaml");
            if (raw && raw.oracle_table) {
                // data.loadYaml returns CLR-backed objects/lists (YamlDotNet), which are
                // indexable in JS but are NOT native JsArrays - so writeOracleTable's
                // `is JsArray` check drops them and freezes empty tables. Rebuild every
                // entry as a NATIVE JS object/array so the freeze keeps them. (Index access
                // + .length on loadYaml lists is the same pattern balance-table relies on.)
                tables.push({ kind: String(raw.oracle_table.kind), entries: nativeEntries(raw.oracle_table.entries) });
            }
        }
        all[setId] = tables;
    }
    return all;
})();

export function bakedTables(setId: string): OracleTableData[] {
    return BAKED[setId] || BAKED["test-kitchen"] || [];
}

// ---------------------------------------------------------------------------
// Deterministic fallbacks (LLM unavailable / empty output)
// Keep the lane playable with no LLM.
// ---------------------------------------------------------------------------

function fallbackMobs(): OracleEntry[] {
    return [{ w: 60, id: "wanderer", name: "wanderer", desc: "A wary local.", balance_ref: "mob" }];
}

function fallbackBoss(): OracleEntry[] {
    return [{ w: 100, id: "warden", name: "the warden", desc: "It guards this place.", balance_ref: "boss" }];
}

function fallbackItems(): OracleEntry[] {
    return [{ w: 60, id: "tool", name: "worn tool", desc: "Still useful.", balance_ref: "weapon", rarity: "common" }];
}

function fallbackProse(): OracleEntry[] {
    return [
        { w: 10, id: "opener-0", name: "opener", desc: "A plain space." },
        { w: 10, id: "detail-0", name: "detail", desc: "Dust in the corners." },
        { w: 10, id: "atmosphere-0", name: "atmosphere", desc: "It is quiet here." },
    ];
}
