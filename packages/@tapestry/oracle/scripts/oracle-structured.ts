// oracle-structured.ts - structured-output schemas + JSON->entry mappers.
//
// Replaces the deleted heuristic parser (oracle-parse.ts). Pure, zero engine imports,
// golden-tested under plain node. The recommend seam now returns JSON constrained by the
// SCHEMA_* below (OpenAI response_format json_schema); these mappers JSON.parse + map to
// OracleEntry, ASCII-folding values pack-side (the engine returns raw JSON). ANY parse
// failure returns [] so the caller falls back to baked entries.

import type { OracleEntry } from "./oracle-tables.js"; // type-only: erased at compile, no engine pull

import type { LandmarkDressing, SectorPools } from "./sector-compose.js"; // type-only: erased at compile

const RARITY_WEIGHTS: Record<string, number> = { common: 60, uncommon: 30, rare: 8, epic: 2 };
const MAX_NAME = 60;
const MAX_DESC = 200;
/** Landmark room descriptions are bespoke prose (2-3 sentences) - a larger cap. */
const MAX_LANDMARK_DESC = 500;

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

// Normalize a player-facing value: ASCII-fold, turn LLM snake_case identifiers back into
// spaces (abyssal_trench -> abyssal trench), collapse whitespace, and strip leading list
// numbering the model sometimes bakes into array items ("1.", "2)", "- "). Leading-only, so
// mid-sentence numbers (e.g. "30 feet tall") survive.
function normalize(s: unknown): string {
    let t = asciiFold(typeof s === "string" ? s : "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
    t = t.replace(/^\d+\s*[.)]\s*/, "").replace(/^[-*]\s+/, "").trim();
    return t;
}

// Names stay short - a hard char cap is fine (a 60+ char "name" is junk).
function cleanName(s: unknown): string {
    const t = normalize(s);
    return t.length > MAX_NAME ? t.slice(0, MAX_NAME).trim() : t;
}

// Descriptions cap on a SENTENCE boundary, not mid-word: keep whole sentences up to the soft
// cap, always keeping at least the first (so a single long sentence survives intact).
function capOnSentence(t: string, cap: number): string {
    if (t.length <= cap) { return t; }
    const sentences = t.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [t];
    let out = "";
    for (let i = 0; i < sentences.length; i++) {
        if (out.length > 0 && (out + sentences[i]).length > cap) { break; }
        out += sentences[i];
    }
    return out.trim();
}

function cleanDesc(s: unknown): string {
    return capOnSentence(normalize(s), MAX_DESC);
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
    return arr.map((p: unknown) => cleanName(p)).filter((s: string) => !junk(s)).slice(0, 12);
}

const MOB_BANDS: Record<string, boolean> = { skulker: true, common: true, hunter: true, apex: true };

/** Banded mob mapper (stage-B six-axis): each record carries a MOB-1 menace
 *  band, encoded into the id as mb-<band>-<slug> (the writeOracleTable field
 *  whitelist means structure rides the id). Invalid/missing bands -> common. */
export function mapMobs(raw: string | null): OracleEntry[] {
    const j = parseJson(raw);
    const arr = j && Array.isArray(j.mobs) ? j.mobs : null;
    if (!arr) { return []; }
    const out: OracleEntry[] = [];
    for (const rec of arr) {
        const name = cleanName(rec && rec.name);
        if (junk(name)) { continue; }
        const rawBand = (rec && typeof rec.band === "string" ? rec.band : "").toLowerCase().trim();
        const band = MOB_BANDS[rawBand] ? rawBand : "common";
        out.push({
            w: 50,
            id: "mb-" + band + "-" + slug(name),
            name,
            desc: cleanDesc(rec && rec.desc),
            balance_ref: "mob",
        });
    }
    return out;
}

export function mapBoss(raw: string | null): OracleEntry[] {
    const j = parseJson(raw);
    const rec = j && j.name != null ? j : (j && Array.isArray(j.boss) ? j.boss[0] : null);
    if (!rec) { return []; }
    const name = cleanName(rec.name);
    if (junk(name)) { return []; }
    return [{ w: 100, id: slug(name), name, desc: cleanDesc(rec.desc), balance_ref: "boss" }];
}

export function mapItems(raw: string | null): OracleEntry[] {
    const j = parseJson(raw);
    const arr = j && Array.isArray(j.items) ? j.items : null;
    if (!arr) { return []; }
    const out: OracleEntry[] = [];
    for (const rec of arr) {
        const name = cleanName(rec && rec.name);
        if (junk(name)) { continue; }
        const rarity = normalizeRarity(rec && rec.rarity);
        const balanceRef = normalizeKind(rec && rec.kind);
        out.push({ w: RARITY_WEIGHTS[rarity] || 60, id: slug(name), name, desc: cleanDesc(rec && rec.desc), balance_ref: balanceRef, rarity });
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
        const t = cleanDesc(line);
        if (junk(t)) { continue; }
        out.push({ w: 10, id: tag + "-" + i, name: tag, desc: t });
        i++;
    }
    return out;
}

// Scar prose per consequence kind, frozen as a "scars" oracle table (name=kind, desc=line)
// so the pack assembles ROOM-2 stateOverrides from it. kind is normalized to the canonical
// tag (lowercase, spaces/underscores -> hyphen) so "Boss Slain" -> "boss-slain".
export function mapScars(raw: string | null): OracleEntry[] {
    const j = parseJson(raw);
    const arr = j && Array.isArray(j.scars) ? j.scars : null;
    if (!arr) { return []; }
    const out: OracleEntry[] = [];
    let i = 0;
    for (const rec of arr) {
        const kind = String((rec && rec.kind) || "").toLowerCase().trim().replace(/[\s_]+/g, "-");
        const line = cleanDesc(rec && rec.line);
        if (!kind || junk(line)) { continue; }
        out.push({ w: 10, id: kind + "-" + i, name: kind, desc: line });
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
                properties: {
                    name: { type: "string" },
                    desc: { type: "string" },
                    band: { type: "string", enum: ["skulker", "common", "hunter", "apex"] },
                },
                required: ["name", "desc", "band"], additionalProperties: false,
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

// ---------------------------------------------------------------------------
// v3: landmarks + sector pools
// ---------------------------------------------------------------------------

/**
 * Direction-talk lint for bespoke landmark prose: spatial claims are appended
 * geometry (dice-owned), never LLM words - "a canvas arch leads north" will lie
 * when the edge hash disagrees. Drops any sentence containing compass or exit
 * vocabulary; keeps the rest.
 */
export function stripDirectionTalk(s: string): string {
    const bad = /\b(north|south|east|west|northeast|northwest|southeast|southwest|exit|exits|doorway|doorways)\b/i;
    const sentences = s.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
    let out = "";
    for (let i = 0; i < sentences.length; i++) {
        if (bad.test(sentences[i])) { continue; }
        out += sentences[i];
    }
    return out.trim();
}

/** Strip a leading article from a landmark name ("the broken tower" -> "broken tower"). */
function stripArticle(s: string): string {
    return s.replace(/^(the|a|an)\s+/i, "");
}

/** Normalize a miniboss title: force the "the <title>" shape, lowercase, "" on junk. */
function normalizeBossTitle(s: unknown): string {
    const t = cleanName(s);
    if (junk(t)) { return ""; }
    const stripped = t.replace(/^the\s+/i, "").trim();
    if (stripped === "") { return ""; }
    return "the " + stripped.toLowerCase();
}

/**
 * Map the fill_landmarks JSON to EXACTLY k dressing records. Names dedupe like a
 * no-replacement deck (a duplicate or junk record is replaced from the fallback
 * deck); direction talk is linted out of desc + afar; short output pads from the
 * fallback deck so landmark count (a dice-owned geometry fact) never bends to
 * LLM output size.
 */
export function mapLandmarks(raw: string | null, k: number, fallback: LandmarkDressing[]): LandmarkDressing[] {
    const j = parseJson(raw);
    const arr = j && Array.isArray(j.landmarks) ? j.landmarks : [];
    const out: LandmarkDressing[] = [];
    const used: Record<string, boolean> = {};
    let fallbackIdx = 0;
    const nextFallback = function (): LandmarkDressing | null {
        while (fallbackIdx < fallback.length) {
            const cand = fallback[fallbackIdx];
            fallbackIdx += 1;
            if (!used[cand.name.toLowerCase()]) { return cand; }
        }
        return null;
    };
    for (let i = 0; i < arr.length && out.length < k; i++) {
        const rec = arr[i];
        const name = stripArticle(cleanName(rec && rec.name)).toLowerCase();
        const desc = stripDirectionTalk(capOnSentence(normalize(rec && rec.desc), MAX_LANDMARK_DESC));
        const afars: string[] = [];
        const rawAfars = rec && Array.isArray(rec.afars) ? rec.afars : [];
        for (let a = 0; a < rawAfars.length && afars.length < 3; a++) {
            const t = stripDirectionTalk(cleanDesc(rawAfars[a]));
            if (!junk(t)) { afars.push(t); }
        }
        const bossName = normalizeBossTitle(rec && rec.boss_name);
        const bossDesc = bossName === "" ? "" : stripDirectionTalk(cleanDesc(rec && rec.boss_desc));
        if (junk(name) || used[name] || desc === "") {
            const fb = nextFallback();
            if (fb) {
                used[fb.name.toLowerCase()] = true;
                out.push(fb);
            }
            continue;
        }
        used[name] = true;
        out.push({ name, desc, afars, bossName, bossDesc });
    }
    while (out.length < k) {
        const fb = nextFallback();
        if (fb) {
            used[fb.name.toLowerCase()] = true;
            out.push(fb);
            continue;
        }
        // Deck exhausted (k > fallback size after heavy dedupe): synthesize a
        // numbered waypoint so the caller ALWAYS gets exactly k records.
        const n = out.length + 1;
        out.push({
            name: "waypoint " + n,
            desc: "Something about this spot draws the eye and holds it. Travelers have marked it before you; their signs are half-worn but legible.",
            afars: [
                "A marked waypoint interrupts the landscape.",
                "A traveler's mark stands out against the ground.",
                "Old signs cluster around a marked spot.",
            ],
            bossName: "",
            bossDesc: "",
        });
    }
    return out.slice(0, k);
}

/** Canonicalize slot spelling ({DIR} / { dir } -> {dir}) so the lint can check it. */
function canonicalSlots(s: string): string {
    return s.replace(/\{\s*dir\s*\}/gi, "{dir}").replace(/\{\s*landmark\s*\}/gi, "{landmark}");
}

/** Sentence-case a prose fragment: capitalize the first letter and close with a
 *  period when terminal punctuation is missing. Small local models return bare
 *  noun phrases ("cracked stage curtains"); composed prose needs sentences. */
export function ensureSentence(s: string): string {
    let t = s.trim();
    if (t === "") { return ""; }
    t = t.charAt(0).toUpperCase() + t.slice(1);
    if (!/[.!?]$/.test(t)) { t = t + "."; }
    return t;
}

/**
 * Map one fill_sector JSON to a SectorPools record, or null on parse failure
 * (the caller synthesizes that sector instead). Pool lines are sentence-cased
 * and DIRECTION-LINTED (a compass claim in a pool line lies about geometry the
 * same way it would in landmark prose - the model leaks them despite the
 * prompt). landmark_lines MUST carry the literal {dir} slot - a line without
 * it is dropped (it would claim a direction the dice did not compute).
 */
export function mapSector(raw: string | null): SectorPools | null {
    const j = parseJson(raw);
    if (!j || typeof j !== "object") { return null; }
    const mapLines = function (arr: unknown): string[] {
        if (!Array.isArray(arr)) { return []; }
        const out: string[] = [];
        for (const line of arr) {
            const t = ensureSentence(stripDirectionTalk(cleanDesc(line)));
            if (!junk(t)) { out.push(t); }
        }
        return out;
    };
    const qualifiers: string[] = [];
    const rawQuals = Array.isArray(j.qualifiers)
        ? j.qualifiers
        : (typeof j.qualifier === "string" ? [j.qualifier] : []);
    for (let i = 0; i < rawQuals.length && qualifiers.length < 3; i++) {
        const q = cleanName(rawQuals[i]).toLowerCase().split(" ")[0] || "";
        if (q !== "" && qualifiers.indexOf(q) === -1) { qualifiers.push(q); }
    }
    const landmarkLines: string[] = [];
    if (Array.isArray(j.landmark_lines)) {
        for (const line of j.landmark_lines) {
            const t = ensureSentence(canonicalSlots(cleanDesc(line)));
            if (junk(t)) { continue; }
            if (t.indexOf("{dir}") === -1) { continue; }
            landmarkLines.push(t);
        }
    }
    return {
        qualifiers,
        openers: mapLines(j.openers),
        details: mapLines(j.details),
        sensory: mapLines(j.sensory),
        hooks: mapLines(j.hooks),
        landmarkLines,
    };
}

export const SCHEMA_LANDMARKS = JSON.stringify({
    type: "object",
    properties: {
        landmarks: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    desc: { type: "string" },
                    afars: { type: "array", items: { type: "string" } },
                    boss_name: { type: "string" },
                    boss_desc: { type: "string" },
                },
                required: ["name", "desc", "afars", "boss_name", "boss_desc"], additionalProperties: false,
            },
        },
    },
    required: ["landmarks"], additionalProperties: false,
});

export const SCHEMA_SECTOR = JSON.stringify({
    type: "object",
    properties: {
        qualifiers: { type: "array", items: { type: "string" } },
        openers: { type: "array", items: { type: "string" } },
        details: { type: "array", items: { type: "string" } },
        sensory: { type: "array", items: { type: "string" } },
        hooks: { type: "array", items: { type: "string" } },
        landmark_lines: { type: "array", items: { type: "string" } },
    },
    required: ["qualifiers", "openers", "details", "sensory", "hooks", "landmark_lines"],
    additionalProperties: false,
});

// One short themed scar line per gameplay-reachable consequence kind (the LLM writes the
// prose; the kinds + their lifespans are fixed mechanics in the shared ROOM-3).
export const SCHEMA_SCARS = JSON.stringify({
    type: "object",
    properties: {
        scars: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    kind: { type: "string", enum: ["looted", "boss-slain", "collapsed"] },
                    line: { type: "string" },
                },
                required: ["kind", "line"], additionalProperties: false,
            },
        },
    },
    required: ["scars"], additionalProperties: false,
});
