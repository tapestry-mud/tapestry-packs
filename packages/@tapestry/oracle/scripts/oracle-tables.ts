// oracle-tables.ts - Oracle table schema + table-fill generators.
//
// fillTables fires the front-loaded LLM burst within the RecommendMaxInFlight=2
// budget, assembles the filled tables, and calls onReady when all resolve (or
// falls back to deterministic entries when the LLM is off or returns bad data).
//
// This is the ONLY LLM work in the table-fill lane. Everything downstream
// consumes the frozen tables deterministically.
//
// v3 burst sequencing (K = landmark count, a dice-owned geometry fact):
//   Round 1 (in flight: 1): fill_places
//   Round 2 (in flight: 1): fill_landmarks (bespoke prose for the K landmarks)
//   Round 3 (in flight: up to 2): fill_mobs, fill_boss, fill_items (paired)
//   Round 4 (in flight: up to 2): fill_sector x K (per-sector prose pools that
//     know their landmark's name), with fill_scars chained in as a slot frees
//
// The area "prose" table is the UNION of the sector pools (openers->opener,
// details->detail, sensory->atmosphere) so assembleRoom2 and the legacy compose
// fallback keep working with zero extra LLM calls. The old fill_prose_* rounds
// are deleted - sector pools supersede them.
//
// normalizeTables is the single normalization point for BOTH paths (LLM + baked):
// it guarantees exactly K landmark records, K sector pool-sets (synthesized from
// the prose table when absent - the baked path), a prose table, and a scars table.
//
// bakedTables(setId) returns a hand-authored OracleTableData[] for that set.
// Tables are eagerly loaded at module init time (P-F) - the engine clears
// CurrentPackDir after boot, so any lazy load inside a runtime callback returns null.

import * as tapestry from "@tapestry/engine";
import { getPrompt } from "./prompts.js";
import {
    encodeLandmarksTable, parseLandmarksTable, encodeSectorsTable, parseSectorsTable,
    synthesizeSectors, fallbackLandmarks,
    type LandmarkDressing, type SectorPools,
} from "./sector-compose.js";

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
    mapPlaces, mapMobs, mapBoss, mapItems, mapScars, mapLandmarks, mapSector,
    SCHEMA_PLACES, SCHEMA_MOBS, SCHEMA_BOSS, SCHEMA_ITEMS, SCHEMA_SCARS,
    SCHEMA_LANDMARKS, SCHEMA_SECTOR,
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
// Fires the v3 LLM burst and assembles OracleTableData[] for this area.
// Calls onReady once all tables are resolved (LLM or fallback).
//
// The burst never exceeds RecommendMaxInFlight=2:
//   - places fires alone, then landmarks alone (each keys later prompts).
//   - mobs + boss pair up; items chains in as a slot frees.
//   - the K fill_sector calls run two at a time; fill_scars chains in once the
//     last sector call has been LAUNCHED (one slot is free from then on).
// ---------------------------------------------------------------------------

export function fillTables(
    idea: string,
    levelRange: [number, number],
    k: number,
    areaSeed: number,
    onReady: (tables: OracleTableData[]) => void
): void {
    const recommend: Recommend = (tapestry as any).authoring.recommend;
    const tables: OracleTableData[] = [];
    const vars: Record<string, string> = {
        idea,
        level_min: String(levelRange[0]),
        level_max: String(levelRange[1]),
    };

    // Step 1: fill places first - names + sector synthesis key off the place list.
    call(recommend, "fill_places", vars, SCHEMA_PLACES, (placesRaw) => {
        const places = mapPlaces(placesRaw);
        const placeList = places.length > 0 ? places : ["hall", "passage", "chamber", "corner", "threshold", "alcove"];
        tables.push({
            kind: "places",
            entries: placeList.map((p) => ({ w: 10, id: slug(p), name: p, desc: "" })),
        });

        // Step 2: landmarks (1 in-flight). K is a dice-owned geometry fact; the
        // mapper returns EXACTLY k records no matter what the model does.
        const lmVars: Record<string, string> = {
            idea,
            count: String(k),
            level_min: vars.level_min,
            level_max: vars.level_max,
        };
        call(recommend, "fill_landmarks", lmVars, SCHEMA_LANDMARKS, (lmRaw) => {
            const landmarks = mapLandmarks(lmRaw, k, fallbackLandmarks());
            tables.push({ kind: "landmarks", entries: encodeLandmarksTable(landmarks) });

            // Step 3: mobs, boss, items - pairs under the in-flight limit.
            let pending = 3;
            const done = () => {
                pending -= 1;
                if (pending === 0) {
                    fillSectors(recommend, idea, k, areaSeed, landmarks, tables, onReady);
                }
            };
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
                fireItems();
            });
            call(recommend, "fill_boss", vars, SCHEMA_BOSS, (raw) => {
                const entries = mapBoss(raw);
                tables.push({ kind: "boss", entries: entries.length > 0 ? entries : fallbackBoss() });
                done();
                fireItems();
            });
        });
    });
}

// ---------------------------------------------------------------------------
// fillSectors (private)
//
// Fires the K fill_sector calls (two at a time) plus fill_scars, assembles the
// "sectors" table (holes left by unparseable sector replies are synthesized in
// normalizeTables), builds the area "prose" table as the UNION of the sector
// pools, and calls onReady.
// ---------------------------------------------------------------------------

function fillSectors(
    recommend: Recommend,
    idea: string,
    k: number,
    areaSeed: number,
    landmarks: LandmarkDressing[],
    tables: OracleTableData[],
    onReady: (t: OracleTableData[]) => void
): void {
    const results: Array<SectorPools | null> = [];
    for (let i = 0; i < k; i++) { results.push(null); }
    const scarEntries: OracleEntry[] = [];
    let completed = 0;
    let launched = 0;
    let scarsFired = false;
    let scarsDone = false;
    let sectorsDone = false;

    const finish = () => {
        if (!sectorsDone || !scarsDone) { return; }
        // The area prose table = union of the sector pools (assembleRoom2 + the
        // legacy compose fallback read it). Sector tags map: sensory->atmosphere.
        const proseEntries: OracleEntry[] = [];
        let n = 0;
        for (let i = 0; i < k; i++) {
            const s = results[i];
            if (!s) { continue; }
            for (const line of s.openers) { proseEntries.push({ w: 10, id: "opener-" + n, name: "opener", desc: line }); n++; }
            for (const line of s.details) { proseEntries.push({ w: 10, id: "detail-" + n, name: "detail", desc: line }); n++; }
            for (const line of s.sensory) { proseEntries.push({ w: 10, id: "atmosphere-" + n, name: "atmosphere", desc: line }); n++; }
        }
        tables.push({ kind: "prose", entries: proseEntries.length > 0 ? proseEntries : fallbackProse() });
        const empty: SectorPools = { qualifier: "", openers: [], details: [], sensory: [], hooks: [], landmarkLines: [] };
        const dense: SectorPools[] = [];
        for (let i = 0; i < k; i++) { dense.push(results[i] || empty); }
        tables.push({ kind: "sectors", entries: encodeSectorsTable(dense) });
        tables.push({ kind: "scars", entries: scarEntries.length > 0 ? scarEntries : fallbackScars() });
        onReady(tables);
    };

    const fireScars = () => {
        if (scarsFired) { return; }
        scarsFired = true;
        call(recommend, "fill_scars", { idea, place: "chamber" }, SCHEMA_SCARS, (raw) => {
            for (const e of mapScars(raw)) { scarEntries.push(e); }
            scarsDone = true;
            finish();
        });
    };

    const fireNext = () => {
        if (launched >= k) { return; }
        const i = launched;
        launched += 1;
        call(recommend, "fill_sector", { idea, landmark: landmarks[i].name }, SCHEMA_SECTOR, (raw) => {
            results[i] = mapSector(raw);
            completed += 1;
            if (launched < k) {
                fireNext();
            } else {
                fireScars();
            }
            if (completed === k) {
                sectorsDone = true;
                finish();
            }
        });
    };

    fireNext();
    if (k > 1) {
        fireNext();
    } else {
        fireScars();
    }
}

// ---------------------------------------------------------------------------
// normalizeTables
//
// The single normalization point for BOTH the LLM and baked paths, called by
// area-gen before the freeze. Guarantees:
//   - a "landmarks" table with EXACTLY k valid, name-distinct records
//     (fallback-deck padding + waypoint synthesis past exhaustion);
//   - a "sectors" table with exactly k pool-sets (a hole or empty pool-set is
//     synthesized from the prose table; a hole's non-empty qualifier survives);
//   - a "prose" table (fallback entries when absent);
//   - a "scars" table (generic fallback when absent).
// Pure given its inputs - golden-tested under plain node.
// ---------------------------------------------------------------------------

export function normalizeTables(tables: OracleTableData[], k: number, areaSeed: number): OracleTableData[] {
    // COPY-ON-WRITE: never mutate an input table object - the caller may hand
    // us tables aliased to a long-lived cache.
    const out = tables.slice();
    const byKind = function (kind: string): OracleTableData | null {
        for (let i = 0; i < out.length; i++) {
            if (out[i].kind === kind) { return out[i]; }
        }
        return null;
    };
    const replaceKind = function (kind: string, entries: OracleEntry[]): void {
        for (let i = 0; i < out.length; i++) {
            if (out[i].kind === kind) {
                out[i] = { kind, entries };
                return;
            }
        }
        out.push({ kind, entries });
    };

    // 1. prose first (sector synthesis reads it).
    let prose = byKind("prose");
    if (!prose) {
        prose = { kind: "prose", entries: fallbackProse() };
        out.push(prose);
    }

    // 2. landmarks: exactly k valid distinct records.
    const lmTable = byKind("landmarks");
    const parsedLm = lmTable ? parseLandmarksTable(lmTable.entries) : [];
    const deck = fallbackLandmarks();
    const used: Record<string, boolean> = {};
    const finalLm: LandmarkDressing[] = [];
    for (let i = 0; i < k; i++) {
        const cand = parsedLm[i];
        if (cand && cand.name !== "" && cand.desc !== "" && !used[cand.name.toLowerCase()]) {
            used[cand.name.toLowerCase()] = true;
            finalLm.push(cand);
        } else {
            finalLm.push(null as any); // hole - filled below
        }
    }
    let deckIdx = 0;
    for (let i = 0; i < k; i++) {
        if (finalLm[i]) { continue; }
        let fill: LandmarkDressing | null = null;
        while (deckIdx < deck.length) {
            const cand = deck[deckIdx];
            deckIdx += 1;
            if (!used[cand.name.toLowerCase()]) { fill = cand; break; }
        }
        if (!fill) {
            fill = {
                name: "waypoint " + (i + 1),
                desc: "Something about this spot draws the eye and holds it. Travelers have marked it before you; their signs are half-worn but legible.",
                afar: "A marked waypoint interrupts the landscape.",
            };
        }
        used[fill.name.toLowerCase()] = true;
        finalLm[i] = fill;
    }
    replaceKind("landmarks", encodeLandmarksTable(finalLm) as OracleEntry[]);

    // 3. sectors: exactly k pool-sets; empty ones synthesize from prose.
    const secTable = byKind("sectors");
    const parsedSec = secTable ? parseSectorsTable(secTable.entries) : [];
    const synth = synthesizeSectors(k, prose.entries, areaSeed);
    const finalSec: SectorPools[] = [];
    for (let i = 0; i < k; i++) {
        const cand = parsedSec[i];
        if (cand && cand.openers.length > 0) {
            finalSec.push(cand);
        } else {
            const s = synth[i];
            if (cand && cand.qualifier !== "") { s.qualifier = cand.qualifier; }
            finalSec.push(s);
        }
    }
    replaceKind("sectors", encodeSectorsTable(finalSec) as OracleEntry[]);

    // 4. scars: always present.
    if (!byKind("scars")) {
        out.push({ kind: "scars", entries: fallbackScars() });
    }

    return out;
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

const BAKED_KINDS = ["places", "mobs", "boss", "items", "rooms", "prose", "landmarks"];
export const BAKED_SET_IDS = ["test-kitchen", "endless-underdeep"]; // add ids as baked sets are authored

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
    // Per-call copies down to the entries ARRAY (entry objects are never
    // mutated downstream): callers like normalizeTables must never be able to
    // reach the module-level cache through the returned tables. A shared table
    // object bit once - the first run's k=2 normalization truncated the cached
    // landmark deck for every later run in the session.
    const src = BAKED[setId] || BAKED["test-kitchen"] || [];
    const t: OracleTableData[] = [];
    for (let i = 0; i < src.length; i++) {
        t.push({ kind: src[i].kind, entries: src[i].entries.slice() });
    }
    // Ensure a scars table so consequences are visible on LLM-off areas too (an authored
    // six-axis theme like underdeep uses its own state_overrides and ignores this).
    let hasScars = false;
    for (let i = 0; i < t.length; i++) {
        if (t[i].kind === "scars") { hasScars = true; }
    }
    if (!hasScars) {
        t.push({ kind: "scars", entries: fallbackScars() });
    }
    return t;
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

// Generic scar lines when the LLM is off or returns empty - so consequences are still
// visible on any area. name = the consequence kind, desc = the scar fragment.
function fallbackScars(): OracleEntry[] {
    return [
        { w: 10, id: "looted-0", name: "looted", desc: "The room has been stripped of anything worth taking." },
        { w: 10, id: "boss-slain-0", name: "boss-slain", desc: "The body of the fallen ruler lies cooling here." },
        { w: 10, id: "collapsed-0", name: "collapsed", desc: "Rubble blocks part of the room where a way out used to be." },
    ];
}
