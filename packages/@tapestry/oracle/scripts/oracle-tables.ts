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
import { data } from "@tapestry/engine";
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
// Constants
// ---------------------------------------------------------------------------

const RARITY_WEIGHTS: Record<string, number> = { common: 60, uncommon: 30, rare: 8, epic: 2 };

// ---------------------------------------------------------------------------
// Pure parsing helpers (exported for golden tests)
// ---------------------------------------------------------------------------

/**
 * Slugify a name: lowercase, replace non-alnum runs with "-", strip leading/trailing
 * dashes, cap at 40 chars. Returns "item" if the result is empty.
 */
export function slug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "item";
}

/**
 * Parse a comma-separated LLM list into a string[], trimming each entry and capping at 8.
 * Returns [] on null/empty input.
 */
export function parseList(raw: string | null): string[] {
    if (!raw) { return []; }
    return raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0).slice(0, 8);
}

/**
 * Parse "name | desc[ | rarity | kind]" lines into OracleEntry[].
 * For items (isItem=true): weight by rarity; 4th field (weapon|armor) sets balance_ref.
 * For non-items: weight=50; balance_ref=defaultBalanceRef.
 * Lines missing a name or desc are skipped.
 */
export function parsePipeLines(raw: string | null, defaultBalanceRef: string, isItem: boolean): OracleEntry[] {
    if (!raw) { return []; }
    const out: OracleEntry[] = [];
    for (const line of raw.split("\n")) {
        const parts = line.split("|").map((p) => p.trim());
        if (parts.length < 2 || parts[0].length === 0) { continue; }
        const name = parts[0];
        const desc = parts[1];
        const rarity = isItem ? normalizeRarity(parts[2]) : undefined;
        const balanceRef = isItem ? normalizeItemKind(parts[3]) : defaultBalanceRef;
        const w = isItem ? (RARITY_WEIGHTS[rarity!] || 60) : 50;
        const entry: OracleEntry = { w, id: slug(name), name, desc, balance_ref: balanceRef };
        if (rarity) { entry.rarity = rarity; }
        out.push(entry);
    }
    return out;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function normalizeRarity(s: string | undefined): string {
    const r = (s || "").toLowerCase().trim();
    return RARITY_WEIGHTS[r] !== undefined ? r : "common";
}

/**
 * Normalize "weapon" or "armor" from the LLM kind field.
 * Anything that is not "armor" defaults to "weapon".
 * This is what lets statsFor("armor",...) be reached for armor loot.
 */
function normalizeItemKind(s: string | undefined): string {
    return (s || "").toLowerCase().trim() === "armor" ? "armor" : "weapon";
}

// ---------------------------------------------------------------------------
// recommend call wrapper
// ---------------------------------------------------------------------------

type Recommend = (opts: any, cb: (result: string | null) => void) => void;

function call(
    recommend: Recommend,
    promptKey: string,
    vars: Record<string, string>,
    cb: (r: string | null) => void
): void {
    const pr = getPrompt(promptKey);
    recommend({ field: promptKey, template: pr.template, system: pr.system, vars }, cb);
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
    call(recommend, "fill_places", vars, (placesRaw) => {
        const places = parseList(placesRaw);
        const placeList = places.length > 0 ? places : ["hall", "passage", "chamber", "corner", "threshold", "alcove"];
        tables.push({
            kind: "places",
            entries: placeList.map((p, i) => ({ w: 10, id: slug(p), name: p, desc: "" })),
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
            call(recommend, "fill_items", vars, (raw) => {
                const entries = parsePipeLines(raw, "weapon", true);
                tables.push({ kind: "items", entries: entries.length > 0 ? entries : fallbackItems() });
                done();
            });
        };
        call(recommend, "fill_mobs", vars, (raw) => {
            const entries = parsePipeLines(raw, "mob", false);
            tables.push({ kind: "mobs", entries: entries.length > 0 ? entries : fallbackMobs() });
            done();
            // mobs slot freed - now fire items (boss may still be in-flight: 1 -> 2).
            fireItems();
        });
        call(recommend, "fill_boss", vars, (raw) => {
            const entries = parsePipeLines(raw, "boss", false);
            tables.push({ kind: "boss", entries: entries.length > 0 ? [entries[0]] : fallbackBoss() });
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
        call(recommend, "fill_prose_atmosphere", proseVars, (raw) => { pushLines(proseEntries, raw, "atmosphere"); done(); });
    };
    call(recommend, "fill_prose_openers", proseVars, (raw) => {
        pushLines(proseEntries, raw, "opener");
        done();
        // openers slot freed - now fire atmosphere (details may still be in-flight: 1 -> 2).
        fireAtmosphere();
    });
    call(recommend, "fill_prose_details", proseVars, (raw) => {
        pushLines(proseEntries, raw, "detail");
        done();
        // details slot freed - fire atmosphere if openers hasn't already triggered it.
        fireAtmosphere();
    });
}

function pushLines(out: OracleEntry[], raw: string | null, kind: string): void {
    if (!raw) { return; }
    let i = 0;
    for (const line of raw.split("\n")) {
        const t = line.trim();
        if (t.length === 0) { continue; }
        out.push({ w: 10, id: kind + "-" + i, name: kind, desc: t });
        i++;
    }
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
const BAKED_SET_IDS = ["test-kitchen"]; // phase-1 minimal set; add ids as baked sets are authored

const BAKED: Record<string, OracleTableData[]> = ((): Record<string, OracleTableData[]> => {
    const all: Record<string, OracleTableData[]> = {};
    for (const setId of BAKED_SET_IDS) {
        const tables: OracleTableData[] = [];
        for (const kind of BAKED_KINDS) {
            const raw: any = data.loadYaml("data/baked/" + setId + "/" + kind + ".yaml");
            if (raw && raw.oracle_table) {
                tables.push({ kind: raw.oracle_table.kind, entries: raw.oracle_table.entries });
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
