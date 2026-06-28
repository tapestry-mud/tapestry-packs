// oracle-structured.ts - structured-output schemas + JSON->entry mappers.
//
// Replaces the deleted heuristic parser (oracle-parse.ts). Pure, zero engine imports,
// golden-tested under plain node. The recommend seam now returns JSON constrained by the
// SCHEMA_* below (OpenAI response_format json_schema); these mappers JSON.parse + map to
// OracleEntry, ASCII-folding values pack-side (the engine returns raw JSON). ANY parse
// failure returns [] so the caller falls back to baked entries.

import type { OracleEntry } from "./oracle-tables.js"; // type-only: erased at compile, no engine pull

const RARITY_WEIGHTS: Record<string, number> = { common: 60, uncommon: 30, rare: 8, epic: 2 };
const MAX_FRAGMENT = 120;

export function slug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "item";
}

/** Strict 7-bit ASCII enforcement on a single value. Transliterates common smart chars,
 *  then drops anything outside printable ASCII. The structured path folds values here. */
function asciiFold(s: string): string {
    return (s || "")
        .replace(/[‘’‚‛]/g, "'")
        .replace(/[“”„‟]/g, '"')
        .replace(/[–—―]/g, "-")
        .replace(/…/g, "...")
        .replace(/[^\x20-\x7E]/g, "")
        .trim();
}

function clean(s: unknown): string {
    const t = asciiFold(typeof s === "string" ? s : "");
    return t.length > MAX_FRAGMENT ? t.slice(0, MAX_FRAGMENT).trim() : t;
}

function junk(name: string): boolean {
    return name.length === 0 || !/[a-z0-9]/i.test(name);
}

function parseJson(raw: string | null): any {
    if (!raw) { return null; }
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function normalizeRarity(s: unknown): string {
    const r = (typeof s === "string" ? s : "").toLowerCase().trim();
    return RARITY_WEIGHTS[r] !== undefined ? r : "common";
}

function normalizeKind(s: unknown): string {
    return (typeof s === "string" ? s : "").toLowerCase().trim() === "armor" ? "armor" : "weapon";
}

export function mapPlaces(raw: string | null): string[] {
    const j = parseJson(raw);
    const arr = j && Array.isArray(j.places) ? j.places : (Array.isArray(j) ? j : null);
    if (!arr) { return []; }
    return arr.map((p: unknown) => clean(p)).filter((s: string) => !junk(s)).slice(0, 8);
}

export function mapMobs(raw: string | null): OracleEntry[] {
    return mapRecords(raw, "mobs", 50, "mob");
}

export function mapBoss(raw: string | null): OracleEntry[] {
    const j = parseJson(raw);
    const rec = j && j.name != null ? j : (j && Array.isArray(j.boss) ? j.boss[0] : null);
    if (!rec) { return []; }
    const name = clean(rec.name);
    if (junk(name)) { return []; }
    return [{ w: 100, id: slug(name), name, desc: clean(rec.desc), balance_ref: "boss" }];
}

function mapRecords(raw: string | null, key: string, w: number, balanceRef: string): OracleEntry[] {
    const j = parseJson(raw);
    const arr = j && Array.isArray(j[key]) ? j[key] : null;
    if (!arr) { return []; }
    const out: OracleEntry[] = [];
    for (const rec of arr) {
        const name = clean(rec && rec.name);
        if (junk(name)) { continue; }
        out.push({ w, id: slug(name), name, desc: clean(rec && rec.desc), balance_ref: balanceRef });
    }
    return out;
}

export function mapItems(raw: string | null): OracleEntry[] {
    const j = parseJson(raw);
    const arr = j && Array.isArray(j.items) ? j.items : null;
    if (!arr) { return []; }
    const out: OracleEntry[] = [];
    for (const rec of arr) {
        const name = clean(rec && rec.name);
        if (junk(name)) { continue; }
        const rarity = normalizeRarity(rec && rec.rarity);
        const balanceRef = normalizeKind(rec && rec.kind);
        out.push({ w: RARITY_WEIGHTS[rarity] || 60, id: slug(name), name, desc: clean(rec && rec.desc), balance_ref: balanceRef, rarity });
    }
    return out;
}

export function mapProse(raw: string | null, tag: string): OracleEntry[] {
    const j = parseJson(raw);
    const arr = j && Array.isArray(j.lines) ? j.lines : (Array.isArray(j) ? j : null);
    if (!arr) { return []; }
    const out: OracleEntry[] = [];
    let i = 0;
    for (const line of arr) {
        const t = clean(line);
        if (junk(t)) { continue; }
        out.push({ w: 10, id: tag + "-" + i, name: tag, desc: t });
        i++;
    }
    return out;
}

// Strict json_schema (root object, additionalProperties:false, all properties required).
// Arrays are wrapped in an object property (OpenAI strict mode forbids a root array).
// Passed to authoring.recommend as a stringified JSON schema.
export const SCHEMA_PLACES = JSON.stringify({
    type: "object",
    properties: { places: { type: "array", items: { type: "string" } } },
    required: ["places"], additionalProperties: false,
});

export const SCHEMA_MOBS = JSON.stringify({
    type: "object",
    properties: {
        mobs: {
            type: "array",
            items: {
                type: "object",
                properties: { name: { type: "string" }, desc: { type: "string" } },
                required: ["name", "desc"], additionalProperties: false,
            },
        },
    },
    required: ["mobs"], additionalProperties: false,
});

export const SCHEMA_BOSS = JSON.stringify({
    type: "object",
    properties: { name: { type: "string" }, desc: { type: "string" } },
    required: ["name", "desc"], additionalProperties: false,
});

export const SCHEMA_ITEMS = JSON.stringify({
    type: "object",
    properties: {
        items: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    desc: { type: "string" },
                    rarity: { type: "string", enum: ["common", "uncommon", "rare", "epic"] },
                    kind: { type: "string", enum: ["weapon", "armor"] },
                },
                required: ["name", "desc", "rarity", "kind"], additionalProperties: false,
            },
        },
    },
    required: ["items"], additionalProperties: false,
});

export const SCHEMA_PROSE = JSON.stringify({
    type: "object",
    properties: { lines: { type: "array", items: { type: "string" } } },
    required: ["lines"], additionalProperties: false,
});
