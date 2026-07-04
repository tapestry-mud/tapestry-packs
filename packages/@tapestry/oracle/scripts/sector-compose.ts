// sector-compose.ts - v3 composed-room prose and naming, plus the landmark/sector
// oracle-table codecs. PURE: no engine imports, no Date, no Math.random - all
// randomness is hashCoord(areaSeed, path + ":" + purpose) streams, so every room's
// words are f(seed, coord) and replay byte-identical in any traversal order.
//
// The anti-repetition stack (exploration doc 3.8) lives here:
//   - variable cadence: the composed slot-type subset varies by band and seed, so
//     the fixed three-sentence rhythm is gone (transit is terse, big rooms breathe);
//   - neighbor exclusion: a room computes its horizontal neighbors' natural picks
//     and shifts its own off them - the adjacent-repeat class dies with zero state;
//   - qualifier x place-word names: sector qualifiers product with the places table
//     (z-levels override with Upper/Lower);
//   - slot-filled landmark references: the LLM writes lines with literal {landmark}
//     and {dir} slots (or we fall back to a dice deck); dice fill the direction from
//     computed geometry, so prose can never lie about where things are.
//
// Landmarks + sector pools freeze as ordinary OracleEntry rows via ID-PREFIX
// ENCODING ("lm-0"/"afar-0", "s0-opener-3"...) because the engine's writeOracleTable
// binding whitelists exactly {w,id,name,desc,balance_ref,rarity} - extra fields are
// dropped at the boundary, so structure has to ride the id.
//
// ASCII; braces on all control flow.

import { splitmix64, hashCoord } from "./prng.js";
import { parseCoord, formatCoord } from "./coords.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LandmarkDressing {
    /** Display name WITHOUT a leading article ("broken tower", not "the broken tower"). */
    name: string;
    /** Full bespoke room description (frozen at creation; no direction/exit talk). */
    desc: string;
    /** One-line seen-from-afar view, used in landmark reference lines. */
    afar: string;
}

export interface SectorPools {
    /** One-word name qualifier for the sector ("flooded", "outer"...). */
    qualifier: string;
    openers: string[];
    details: string[];
    sensory: string[];
    hooks: string[];
    /** Lines carrying literal {landmark} and/or {dir} slots. */
    landmarkLines: string[];
}

interface EntryRow {
    w: number;
    id: string;
    name: string;
    desc: string;
}

// ---------------------------------------------------------------------------
// titleCase (moved from room-gen.ts - v3 naming lives here)
// ---------------------------------------------------------------------------

export function titleCase(s: string): string {
    return s.replace(/([a-zA-Z]+)/g, function (word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
    });
}

// ---------------------------------------------------------------------------
// Landmark table codec (kind: "landmarks")
// Rows: { id: "lm-<i>",   name: <landmark name>, desc: <full description> }
//       { id: "afar-<i>", name: <landmark name>, desc: <afar line> }
// ---------------------------------------------------------------------------

export function encodeLandmarksTable(landmarks: LandmarkDressing[]): EntryRow[] {
    const out: EntryRow[] = [];
    for (let i = 0; i < landmarks.length; i++) {
        out.push({ w: 10, id: "lm-" + i, name: landmarks[i].name, desc: landmarks[i].desc });
        out.push({ w: 10, id: "afar-" + i, name: landmarks[i].name, desc: landmarks[i].afar });
    }
    return out;
}

export function parseLandmarksTable(entries: any[]): LandmarkDressing[] {
    const byIndex: Record<number, LandmarkDressing> = {};
    let max = -1;
    if (!entries || typeof entries.length !== "number") { return []; }
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const id = String((e && e.id) || "");
        let m = id.match(/^lm-(\d+)$/);
        if (m) {
            const idx = parseInt(m[1], 10);
            if (!byIndex[idx]) { byIndex[idx] = { name: "", desc: "", afar: "" }; }
            byIndex[idx].name = String((e && e.name) || "");
            byIndex[idx].desc = String((e && e.desc) || "");
            if (idx > max) { max = idx; }
            continue;
        }
        m = id.match(/^afar-(\d+)$/);
        if (m) {
            const idx = parseInt(m[1], 10);
            if (!byIndex[idx]) { byIndex[idx] = { name: "", desc: "", afar: "" }; }
            if (!byIndex[idx].name) { byIndex[idx].name = String((e && e.name) || ""); }
            byIndex[idx].afar = String((e && e.desc) || "");
            if (idx > max) { max = idx; }
        }
    }
    const out: LandmarkDressing[] = [];
    for (let i = 0; i <= max; i++) {
        out.push(byIndex[i] || { name: "", desc: "", afar: "" });
    }
    return out;
}

// ---------------------------------------------------------------------------
// Sector table codec (kind: "sectors")
// Rows: { id: "s<i>-qual" }, { id: "s<i>-opener-<n>" }, "s<i>-detail-<n>",
//       "s<i>-sensory-<n>", "s<i>-hook-<n>", "s<i>-lmline-<n>". name = tag.
// ---------------------------------------------------------------------------

export function encodeSectorsTable(sectors: SectorPools[]): EntryRow[] {
    const out: EntryRow[] = [];
    for (let i = 0; i < sectors.length; i++) {
        const s = sectors[i];
        out.push({ w: 10, id: "s" + i + "-qual", name: "qualifier", desc: s.qualifier });
        const lists: Array<[string, string[]]> = [
            ["opener", s.openers], ["detail", s.details], ["sensory", s.sensory],
            ["hook", s.hooks], ["lmline", s.landmarkLines],
        ];
        for (let li = 0; li < lists.length; li++) {
            const tag = lists[li][0];
            const arr = lists[li][1];
            for (let n = 0; n < arr.length; n++) {
                out.push({ w: 10, id: "s" + i + "-" + tag + "-" + n, name: tag, desc: arr[n] });
            }
        }
    }
    return out;
}

export function parseSectorsTable(entries: any[]): SectorPools[] {
    const byIndex: Record<number, SectorPools> = {};
    let max = -1;
    if (!entries || typeof entries.length !== "number") { return []; }
    const ensure = function (idx: number): SectorPools {
        if (!byIndex[idx]) {
            byIndex[idx] = { qualifier: "", openers: [], details: [], sensory: [], hooks: [], landmarkLines: [] };
        }
        return byIndex[idx];
    };
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const id = String((e && e.id) || "");
        const desc = String((e && e.desc) || "");
        const m = id.match(/^s(\d+)-(qual|opener|detail|sensory|hook|lmline)(?:-\d+)?$/);
        if (!m) { continue; }
        const idx = parseInt(m[1], 10);
        const s = ensure(idx);
        if (idx > max) { max = idx; }
        if (m[2] === "qual") { s.qualifier = desc; continue; }
        if (m[2] === "opener") { s.openers.push(desc); continue; }
        if (m[2] === "detail") { s.details.push(desc); continue; }
        if (m[2] === "sensory") { s.sensory.push(desc); continue; }
        if (m[2] === "hook") { s.hooks.push(desc); continue; }
        s.landmarkLines.push(desc);
    }
    const out: SectorPools[] = [];
    for (let i = 0; i <= max; i++) {
        out.push(byIndex[i] || { qualifier: "", openers: [], details: [], sensory: [], hooks: [], landmarkLines: [] });
    }
    return out;
}

// ---------------------------------------------------------------------------
// Baked-path synthesis + fallbacks
// ---------------------------------------------------------------------------

const QUALIFIER_DECK: string[] = [
    "outer", "inner", "old", "broken", "quiet", "flooded",
    "overgrown", "dim", "cold", "forgotten",
];

/**
 * Synthesize K sector pool-sets for the baked/LLM-off path: pools are shared from
 * the area prose table (opener/detail/atmosphere tags; atmosphere maps to sensory),
 * but each sector gets a DISTINCT seeded qualifier so sectors stay legible in room
 * names even when the prose pool is shared.
 */
export function synthesizeSectors(k: number, proseEntries: any[], areaSeed: number): SectorPools[] {
    const openers: string[] = [];
    const details: string[] = [];
    const sensory: string[] = [];
    if (proseEntries && typeof proseEntries.length === "number") {
        for (let i = 0; i < proseEntries.length; i++) {
            const e = proseEntries[i];
            const tag = String((e && e.name) || "");
            const desc = String((e && e.desc) || "");
            if (desc === "") { continue; }
            if (tag === "opener") { openers.push(desc); }
            if (tag === "detail") { details.push(desc); }
            if (tag === "atmosphere") { sensory.push(desc); }
        }
    }
    // Seeded partial Fisher-Yates over the qualifier deck: k distinct qualifiers.
    const deck = QUALIFIER_DECK.slice();
    const rng = splitmix64(hashCoord(areaSeed, "sector-qualifiers"));
    for (let i = 0; i < deck.length - 1; i++) {
        const j = i + Math.floor(rng() * (deck.length - i));
        const tmp = deck[i];
        deck[i] = deck[j];
        deck[j] = tmp;
    }
    const out: SectorPools[] = [];
    for (let i = 0; i < k; i++) {
        out.push({
            qualifier: deck[i % deck.length],
            openers: openers.slice(),
            details: details.slice(),
            sensory: sensory.slice(),
            hooks: [],
            landmarkLines: [],
        });
    }
    return out;
}

/** Theme-neutral landmark deck for the LLM-off / short-fill path. 8 records. */
export function fallbackLandmarks(): LandmarkDressing[] {
    return [
        {
            name: "standing stones",
            desc: "A ring of weathered monoliths circles this open ground. Whatever raised them is long gone, but the stones still hold a hush that makes you lower your voice.",
            afar: "A crown of tall grey stones rises over everything around it.",
        },
        {
            name: "broken tower",
            desc: "The stump of an old watchtower leans over a spill of its own masonry. You can climb a little way into its cracked shell, where the wind speaks through the gaps.",
            afar: "A snapped tower juts at the sky like a broken tooth.",
        },
        {
            name: "old well",
            desc: "A stone well squats at the center of this clearing, its rope long rotted away. When you lean over the lip, the dark below breathes back cold and damp.",
            afar: "A low stone ring marks an old well against the ground.",
        },
        {
            name: "sunken shrine",
            desc: "Steps descend into a half-drowned shrine. Offerings still crust the altar stone, and the water that laps at your ankles is colder than it has any right to be.",
            afar: "Tilted pillars mark where a shrine has slumped into the earth.",
        },
        {
            name: "great arch",
            desc: "A single freestanding arch dwarfs you, carved with figures worn past recognizing. Passing under it, the air tightens as if the arch remembers being a door.",
            afar: "A lone arch stands vast and dark against the sky.",
        },
        {
            name: "hollow tree",
            desc: "An enormous dead tree has split open into a chamber of smooth heartwood. Things have denned here over the years; some of the bones are large.",
            afar: "A colossal dead tree looms, split and blackened.",
        },
        {
            name: "toppled idol",
            desc: "A stone idol lies face-down where it fell, its features pressed into the dirt for an age. The pedestal it left behind is scorched in a perfect circle.",
            afar: "A fallen bulk of carved stone breaks the ground's line.",
        },
        {
            name: "ashen bonfire",
            desc: "A fire pit wider than a wagon sits cold and grey. The ash never seems to scatter, and here and there it holds the shape of things that burned.",
            afar: "A wide grey scar of old ash marks a giant's fire pit.",
        },
    ];
}

/** Dice-owned landmark reference templates (used when the LLM gave no lines). */
export const FALLBACK_LANDMARK_LINES: string[] = [
    "The {landmark} stands {dir} of here.",
    "You catch sight of the {landmark} to the {dir}.",
    "Off to the {dir} you can make out the {landmark}.",
    "The way {dir} runs toward the {landmark}.",
];

// ---------------------------------------------------------------------------
// Variable cadence
// ---------------------------------------------------------------------------

/**
 * The slot-type subset for a room, by pure degree. Transit is one terse line;
 * chambers vary; charged rooms may add a hook; the landmark band breathes in
 * three parts; threshold stays clipped and tense. Length doubles as signal:
 * long prose = important room.
 */
export function cadencePlan(degree: number, rng: () => number): string[] {
    if (degree <= 2) {
        return ["openers"];
    }
    if (degree <= 5) {
        return rng() < 0.5 ? ["openers", "details"] : ["openers", "sensory"];
    }
    if (degree <= 7) {
        const plan = ["openers", "details"];
        if (rng() < 0.5) { plan.push("hooks"); }
        return plan;
    }
    if (degree <= 9) {
        return ["openers", "details", "sensory"];
    }
    return ["openers", "hooks"];
}

// ---------------------------------------------------------------------------
// Neighbor exclusion
// ---------------------------------------------------------------------------

const HORIZONTAL_OFFSETS: Array<[number, number]> = [[0, 1], [0, -1], [1, 0], [-1, 0]];

function naturalIndex(poolLen: number, areaSeed: number, path: string, subtable: string): number {
    const rng = splitmix64(hashCoord(areaSeed, path + ":pick:" + subtable));
    return Math.floor(rng() * poolLen);
}

/**
 * Deterministic pick with neighbor exclusion: shift this room's natural pick off
 * its four horizontal neighbors' natural picks. When two adjacent rooms share the
 * same natural index, the lexicographically smaller path walks forward and the
 * larger walks backward, so they diverge instead of colliding on the same shift.
 * Pools of 4 or fewer skip exclusion (do not starve tiny pools).
 */
export function pickExcluding(pool: string[], areaSeed: number, path: string, subtable: string): string {
    if (!pool || pool.length === 0) { return ""; }
    const len = pool.length;
    let own = naturalIndex(len, areaSeed, path, subtable);
    if (len <= 4) { return pool[own]; }
    const coords = parseCoord(path);
    if (!coords) { return pool[own]; }
    const neighborNaturals: number[] = [];
    let smallestCollider: string | null = null;
    for (let i = 0; i < HORIZONTAL_OFFSETS.length; i++) {
        const nPath = formatCoord(coords[0] + HORIZONTAL_OFFSETS[i][0], coords[1] + HORIZONTAL_OFFSETS[i][1], coords[2]);
        const nIdx = naturalIndex(len, areaSeed, nPath, subtable);
        neighborNaturals.push(nIdx);
        if (nIdx === own && (smallestCollider === null || nPath < smallestCollider)) {
            smallestCollider = nPath;
        }
    }
    const step = smallestCollider !== null && path < smallestCollider ? 1 : -1;
    for (let guard = 0; guard < len; guard++) {
        if (neighborNaturals.indexOf(own) === -1) { break; }
        own = (own + step + len) % len;
    }
    return pool[own];
}

// ---------------------------------------------------------------------------
// Slot filling + landmark reference lines
// ---------------------------------------------------------------------------

/** Fill the literal {landmark} and {dir} slots. Dice own the direction. */
export function fillSlots(line: string, landmarkName: string, dir: string): string {
    return line.split("{landmark}").join(landmarkName).split("{dir}").join(dir);
}

/**
 * The appended landmark reference line for a composed room, or "" when the seeded
 * gate keeps this room quiet (always=true bypasses the gate: entry + rooms adjacent
 * to their landmark). Two variants: the landmark's afar line with a dice-owned
 * direction tail, or a slot-filled pool line. Vertical references (above/below)
 * use a fixed template - "visible to the above" is not a sentence.
 */
export function landmarkRefLine(
    areaSeed: number,
    path: string,
    pools: SectorPools,
    landmark: LandmarkDressing,
    dir: string,
    always: boolean
): string {
    if (dir === "" || !landmark || landmark.name === "") { return ""; }
    const rng = splitmix64(hashCoord(areaSeed, path + ":lmref"));
    const gate = rng();
    const variant = rng();
    const lineRoll = rng();
    if (!always && gate >= 0.45) { return ""; }
    if (dir === "above" || dir === "below") {
        return "The " + landmark.name + " lies somewhere " + dir + ".";
    }
    if (variant < 0.5 && landmark.afar !== "") {
        return landmark.afar + " It lies to the " + dir + " of here.";
    }
    const lines = pools && pools.landmarkLines && pools.landmarkLines.length > 0
        ? pools.landmarkLines
        : FALLBACK_LANDMARK_LINES;
    const line = lines[Math.floor(lineRoll * lines.length)];
    return fillSlots(line, landmark.name, dir);
}

// ---------------------------------------------------------------------------
// Room prose + name composition
// ---------------------------------------------------------------------------

/**
 * Compose a room's base prose from its sector pools (border rooms pass the
 * second-nearest sector as blend and alternate sources per part). Returns ""
 * when every selected pool is empty (caller falls back to the legacy path).
 */
export function composeRoomV3(
    areaSeed: number,
    path: string,
    degree: number,
    pools: SectorPools,
    blend: SectorPools | null
): string {
    const rng = splitmix64(hashCoord(areaSeed, path + ":cadence"));
    const plan = cadencePlan(degree, rng);
    const parts: string[] = [];
    for (let i = 0; i < plan.length; i++) {
        const key = plan[i];
        let source = pools;
        if (blend !== null && rng() < 0.5) { source = blend; }
        let pool: string[] = [];
        if (key === "openers") { pool = source.openers; }
        if (key === "details") { pool = source.details; }
        if (key === "sensory") { pool = source.sensory; }
        if (key === "hooks") { pool = source.hooks; }
        if (pool.length === 0 && blend !== null) {
            // Blend partner empty for this slot: fall back to the home sector.
            const home = source === pools ? blend : pools;
            if (key === "openers") { pool = home.openers; }
            if (key === "details") { pool = home.details; }
            if (key === "sensory") { pool = home.sensory; }
            if (key === "hooks") { pool = home.hooks; }
        }
        if (pool.length === 0) { continue; }
        const picked = pickExcluding(pool, areaSeed, path, key);
        if (picked !== "") { parts.push(picked); }
    }
    return parts.join(" ");
}

/**
 * qualifier x place-word room name. z-levels override the sector qualifier with
 * Upper/Lower so vertical rooms read as vertical. Neighbor-excluded place pick.
 */
export function roomNameV3(areaSeed: number, path: string, qualifier: string, places: string[]): string {
    const coords = parseCoord(path);
    const z = coords ? coords[2] : 0;
    let qual = qualifier || "";
    if (z > 0) { qual = "upper"; }
    if (z < 0) { qual = "lower"; }
    const place = places && places.length > 0
        ? pickExcluding(places, areaSeed, path, "name")
        : "";
    const joined = (qual !== "" && place !== "") ? qual + " " + place : (place !== "" ? place : qual);
    return titleCase(joined);
}
