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
import { sectorOf, type LandmarkCell } from "./structure.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LandmarkDressing {
    /** Display name WITHOUT a leading article ("broken tower", not "the broken tower"). */
    name: string;
    /** Full bespoke room description (frozen at creation; no direction/exit talk). */
    desc: string;
    /** Seen-from-afar variants (target 3), used in landmark reference lines.
     *  0.4.0 frozen tables carried exactly one (id "afar-<i>"); the parser still
     *  reads that shape - degraded variety, never a failure. */
    afars: string[];
    /** Frozen miniboss identity for the landmark ("the cage-master"). Empty when the
     *  table predates 0.5.0 or the fill gave nothing - consumers synthesize a
     *  default via tiers.defaultMinibossFor. */
    bossName: string;
    bossDesc: string;
}

export interface SectorPools {
    /** One-word name qualifiers for the sector (2-3: "flooded", "outer"...).
     *  0.4.0 frozen tables carried exactly one (id "s<i>-qual"); the parser still
     *  reads that shape into a one-element deck. */
    qualifiers: string[];
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
// Rows: { id: "lm-<i>",       name: <landmark name>,  desc: <full description> }
//       { id: "afar-<i>-<v>", name: <landmark name>,  desc: <afar variant v> }
//       { id: "boss-<i>",     name: <miniboss title>, desc: <miniboss desc> }
// Legacy (0.4.0) rows "afar-<i>" parse as variant 0; missing boss rows parse as
// "" (consumers synthesize a default identity).
// ---------------------------------------------------------------------------

export function encodeLandmarksTable(landmarks: LandmarkDressing[]): EntryRow[] {
    const out: EntryRow[] = [];
    for (let i = 0; i < landmarks.length; i++) {
        const lm = landmarks[i];
        out.push({ w: 10, id: "lm-" + i, name: lm.name, desc: lm.desc });
        const afars = lm.afars || [];
        for (let v = 0; v < afars.length; v++) {
            out.push({ w: 10, id: "afar-" + i + "-" + v, name: lm.name, desc: afars[v] });
        }
        if (lm.bossName !== "") {
            out.push({ w: 10, id: "boss-" + i, name: lm.bossName, desc: lm.bossDesc });
        }
    }
    return out;
}

function emptyDressing(): LandmarkDressing {
    return { name: "", desc: "", afars: [], bossName: "", bossDesc: "" };
}

export function parseLandmarksTable(entries: any[]): LandmarkDressing[] {
    const byIndex: Record<number, LandmarkDressing> = {};
    const afarByIndex: Record<number, Record<number, string>> = {};
    let max = -1;
    if (!entries || typeof entries.length !== "number") { return []; }
    const ensure = function (idx: number): LandmarkDressing {
        if (!byIndex[idx]) { byIndex[idx] = emptyDressing(); }
        if (idx > max) { max = idx; }
        return byIndex[idx];
    };
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const id = String((e && e.id) || "");
        const name = String((e && e.name) || "");
        const desc = String((e && e.desc) || "");
        let m = id.match(/^lm-(\d+)$/);
        if (m) {
            const rec = ensure(parseInt(m[1], 10));
            rec.name = name;
            rec.desc = desc;
            continue;
        }
        m = id.match(/^afar-(\d+)(?:-(\d+))?$/);
        if (m) {
            const idx = parseInt(m[1], 10);
            const rec = ensure(idx);
            if (!rec.name) { rec.name = name; }
            const v = m[2] !== undefined ? parseInt(m[2], 10) : 0;
            if (!afarByIndex[idx]) { afarByIndex[idx] = {}; }
            afarByIndex[idx][v] = desc;
            continue;
        }
        m = id.match(/^boss-(\d+)$/);
        if (m) {
            const rec = ensure(parseInt(m[1], 10));
            rec.bossName = name;
            rec.bossDesc = desc;
        }
    }
    for (const k in afarByIndex) {
        if (!Object.prototype.hasOwnProperty.call(afarByIndex, k)) { continue; }
        const variants = afarByIndex[k];
        const vs: number[] = [];
        for (const v in variants) {
            if (Object.prototype.hasOwnProperty.call(variants, v)) { vs.push(parseInt(v, 10)); }
        }
        vs.sort(function (a, b) { return a - b; });
        const list: string[] = [];
        for (let i = 0; i < vs.length; i++) { list.push(variants[vs[i]]); }
        byIndex[parseInt(k, 10)].afars = list;
    }
    const out: LandmarkDressing[] = [];
    for (let i = 0; i <= max; i++) {
        out.push(byIndex[i] || emptyDressing());
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
        const quals = s.qualifiers || [];
        for (let q = 0; q < quals.length; q++) {
            out.push({ w: 10, id: "s" + i + "-qual-" + q, name: "qualifier", desc: quals[q] });
        }
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
            byIndex[idx] = { qualifiers: [], openers: [], details: [], sensory: [], hooks: [], landmarkLines: [] };
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
        if (m[2] === "qual") { s.qualifiers.push(desc); continue; }
        if (m[2] === "opener") { s.openers.push(desc); continue; }
        if (m[2] === "detail") { s.details.push(desc); continue; }
        if (m[2] === "sensory") { s.sensory.push(desc); continue; }
        if (m[2] === "hook") { s.hooks.push(desc); continue; }
        s.landmarkLines.push(desc);
    }
    const out: SectorPools[] = [];
    for (let i = 0; i <= max; i++) {
        out.push(byIndex[i] || { qualifiers: [], openers: [], details: [], sensory: [], hooks: [], landmarkLines: [] });
    }
    return out;
}

// ---------------------------------------------------------------------------
// Baked-path synthesis + fallbacks
// ---------------------------------------------------------------------------

const QUALIFIER_DECK: string[] = [
    "outer", "inner", "old", "broken", "quiet", "flooded",
    "overgrown", "dim", "cold", "forgotten", "sunken", "raised",
    "narrow", "wide", "ruined", "still", "windy", "dark",
    "worn", "hidden",
];

/**
 * Synthesize K sector pool-sets for the baked/LLM-off path: pools are shared from
 * the area prose table (opener/detail/atmosphere tags; atmosphere maps to sensory),
 * but each sector gets TWO distinct seeded qualifiers (a per-sector name deck) so
 * sectors stay legible in room names even when the prose pool is shared. 2 x k
 * never exceeds the 20-word deck at the K=8 cap.
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
    // Seeded partial Fisher-Yates over the qualifier deck: 2k distinct qualifiers.
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
            qualifiers: [deck[(2 * i) % deck.length], deck[(2 * i + 1) % deck.length]],
            openers: openers.slice(),
            details: details.slice(),
            sensory: sensory.slice(),
            hooks: [],
            landmarkLines: [],
        });
    }
    return out;
}

/** Theme-neutral landmark deck for the LLM-off / short-fill path. 8 records,
 *  each with 3 afar variants and a frozen miniboss identity. */
export function fallbackLandmarks(): LandmarkDressing[] {
    return [
        {
            name: "standing stones",
            desc: "A ring of weathered monoliths circles this open ground. Whatever raised them is long gone, but the stones still hold a hush that makes you lower your voice.",
            afars: [
                "A crown of tall grey stones rises over everything around it.",
                "Grey monoliths stand in a ring against the sky.",
                "A circle of standing stones interrupts the horizon.",
            ],
            bossName: "the stone-tender",
            bossDesc: "It circles the stones with a patience older than they are.",
        },
        {
            name: "broken tower",
            desc: "The stump of an old watchtower leans over a spill of its own masonry. You can climb a little way into its cracked shell, where the wind speaks through the gaps.",
            afars: [
                "A snapped tower juts at the sky like a broken tooth.",
                "The stump of a watchtower leans over its own rubble.",
                "A ruined tower tilts black against the light.",
            ],
            bossName: "the last sentry",
            bossDesc: "It still keeps a watch that nothing ever relieved.",
        },
        {
            name: "old well",
            desc: "A stone well squats at the center of this clearing, its rope long rotted away. When you lean over the lip, the dark below breathes back cold and damp.",
            afars: [
                "A low stone ring marks an old well against the ground.",
                "A squat stone well crouches alone in open ground.",
                "The land dips toward a ring of pale stones.",
            ],
            bossName: "the well-dweller",
            bossDesc: "Something wet and patient has made the shaft its home.",
        },
        {
            name: "sunken shrine",
            desc: "Steps descend into a half-drowned shrine. Offerings still crust the altar stone, and the water that laps at your ankles is colder than it has any right to be.",
            afars: [
                "Tilted pillars mark where a shrine has slumped into the earth.",
                "Broken pillars lean together over sunken ground.",
                "A drowned roofline breaks the ground like a jaw.",
            ],
            bossName: "the shrine-keeper",
            bossDesc: "It tends the drowned altar and resents the living.",
        },
        {
            name: "great arch",
            desc: "A single freestanding arch dwarfs you, carved with figures worn past recognizing. Passing under it, the air tightens as if the arch remembers being a door.",
            afars: [
                "A lone arch stands vast and dark against the sky.",
                "A freestanding arch dwarfs everything near it.",
                "The silhouette of a great arch cuts the distance.",
            ],
            bossName: "the arch-warden",
            bossDesc: "It stands beneath the arch as if that were a door to guard.",
        },
        {
            name: "hollow tree",
            desc: "An enormous dead tree has split open into a chamber of smooth heartwood. Things have denned here over the years; some of the bones are large.",
            afars: [
                "A colossal dead tree looms, split and blackened.",
                "The husk of a giant tree rises over everything.",
                "A vast dead trunk stands alone, cracked open.",
            ],
            bossName: "the thing in the heartwood",
            bossDesc: "It denned in the hollow long ago and grew into it.",
        },
        {
            name: "toppled idol",
            desc: "A stone idol lies face-down where it fell, its features pressed into the dirt for an age. The pedestal it left behind is scorched in a perfect circle.",
            afars: [
                "A fallen bulk of carved stone breaks the ground's line.",
                "A great carved shape lies face-down in the dirt.",
                "Something enormous and man-made lies where it fell.",
            ],
            bossName: "the idol's mourner",
            bossDesc: "It circles the fallen stone, keening at trespassers.",
        },
        {
            name: "ashen bonfire",
            desc: "A fire pit wider than a wagon sits cold and grey. The ash never seems to scatter, and here and there it holds the shape of things that burned.",
            afars: [
                "A wide grey scar of old ash marks a giant's fire pit.",
                "A field of dead ash spreads flat and colorless.",
                "Grey haze hangs over a ring of burnt ground.",
            ],
            bossName: "the ember-shepherd",
            bossDesc: "It rakes the cold ash for coals only it can see.",
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

/** Inside this 2D distance of the landmark, the reference gate runs at NEAR odds. */
const NEAR_REF_DIST = 3;
/** Gate probability for rooms within NEAR_REF_DIST of their landmark. */
const NEAR_REF_GATE = 0.45;
/** Gate probability for rooms beyond NEAR_REF_DIST (stage-B ride-along: the 0.4.0
 *  flat 0.45 gate made one afar sentence appear in 17/41 rooms of a school run). */
const FAR_REF_GATE = 0.25;

/**
 * The appended landmark reference line for a composed room, or "" when the seeded
 * gate keeps this room quiet (always=true bypasses the gate: entry + rooms adjacent
 * to their landmark). The gate is DISTANCE-BANDED: rooms near their landmark
 * reference it at 0.45, far rooms at 0.25. Two line families: one of the landmark's
 * afar VARIANTS plus a dice-owned direction tail (4-tail deck), or a slot-filled
 * pool line. Vertical references (above/below) use a fixed template.
 * Four rng draws happen unconditionally so the stream shape never depends on
 * branch outcomes.
 */
export function landmarkRefLine(
    areaSeed: number,
    path: string,
    pools: SectorPools,
    landmark: LandmarkDressing,
    dir: string,
    always: boolean,
    dist: number
): string {
    if (dir === "" || !landmark || landmark.name === "") { return ""; }
    const rng = splitmix64(hashCoord(areaSeed, path + ":lmref"));
    const gateRoll = rng();
    const variant = rng();
    const afarPick = rng();
    const lineRoll = rng();
    const gate = dist <= NEAR_REF_DIST ? NEAR_REF_GATE : FAR_REF_GATE;
    if (!always && gateRoll >= gate) { return ""; }
    if (dir === "above" || dir === "below") {
        return "The " + landmark.name + " lies somewhere " + dir + ".";
    }
    const afars: string[] = [];
    const rawAfars = landmark.afars || [];
    for (let i = 0; i < rawAfars.length; i++) {
        if (rawAfars[i] !== "") { afars.push(rawAfars[i]); }
    }
    if (variant < 0.5 && afars.length > 0) {
        const afar = afars[Math.floor(afarPick * afars.length)];
        const tails = [
            " The " + landmark.name + " lies to the " + dir + " of here.",
            " The " + landmark.name + " stands " + dir + " of here.",
            " From here, the " + landmark.name + " is " + dir + ".",
            " The way " + dir + " leads toward the " + landmark.name + ".",
        ];
        return afar + tails[Math.floor(lineRoll * tails.length)];
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
 * Compose one room name from a dealt qualifier x place pair. z-levels override
 * the qualifier with Upper/Lower so vertical rooms read as vertical. A place
 * word that already contains the qualifier drops it ("cold" x "cold room"
 * names "Cold Room", never "Cold Cold Room").
 */
function composeName(qualifier: string, place: string, z: number): string {
    let qual = qualifier || "";
    if (z > 0) { qual = "upper"; }
    if (z < 0) { qual = "lower"; }
    // Word-boundary containment via space padding (no regex, no block-scoped
    // locals: a Jint quirk threw "placeWords is not defined" on the previous
    // split()-based form when a second area generated in the same session).
    const padded = " " + place.toLowerCase() + " ";
    const needle = " " + qual.toLowerCase() + " ";
    if (qual !== "" && place !== "" && padded.indexOf(needle) !== -1) {
        return titleCase(place);
    }
    if (qual !== "" && place !== "") {
        return titleCase(qual + " " + place);
    }
    return titleCase(place !== "" ? place : qual);
}

/**
 * Mint-time NO-REPLACEMENT name deal (stage-B ride-along: the 0.4.0 per-room
 * independent pick exhausted at 41 rooms with 8 duplicate clusters). Pure and
 * traversal-independent: rooms sort internally, each sector shuffles its own
 * qualifier x place product deck with a seeded rng and deals names to its
 * composed rooms in sorted-path order; on exhaustion the deck reshuffles and
 * dealing continues (repeats only after every product is used once). Landmark
 * cells are skipped - landmark rooms are named by their landmark.
 */
export function dealSectorNames(
    areaSeed: number,
    rooms: string[],
    landmarkCells: LandmarkCell[],
    sectors: SectorPools[],
    places: string[]
): Record<string, string> {
    const skip: Record<string, boolean> = {};
    for (let i = 0; i < landmarkCells.length; i++) {
        const l = landmarkCells[i];
        skip[formatCoord(l.x, l.y, l.z)] = true;
    }
    const sorted = rooms.slice().sort();
    const bySector: Record<number, string[]> = {};
    for (let i = 0; i < sorted.length; i++) {
        const path = sorted[i];
        if (skip[path]) { continue; }
        const c = parseCoord(path);
        if (!c) { continue; }
        const sec = landmarkCells.length > 0 ? sectorOf(landmarkCells, c[0], c[1]).index : 0;
        if (!bySector[sec]) { bySector[sec] = []; }
        bySector[sec].push(path);
    }
    const out: Record<string, string> = {};
    for (const secKey in bySector) {
        if (!Object.prototype.hasOwnProperty.call(bySector, secKey)) { continue; }
        const sec = parseInt(secKey, 10);
        const pool = sectors[sec] && sectors[sec].qualifiers ? sectors[sec].qualifiers : [];
        const quals: string[] = [];
        for (let i = 0; i < pool.length; i++) {
            if (pool[i] !== "") { quals.push(pool[i]); }
        }
        if (quals.length === 0) { quals.push(""); }
        const placeList = places && places.length > 0 ? places.slice() : [""];
        const deck: Array<{ q: string; p: string }> = [];
        for (let qi = 0; qi < quals.length; qi++) {
            for (let pi = 0; pi < placeList.length; pi++) {
                deck.push({ q: quals[qi], p: placeList[pi] });
            }
        }
        const rng = splitmix64(hashCoord(areaSeed, "names:s" + sec));
        let hand = shuffleDeck(deck, rng);
        let di = 0;
        const secRooms = bySector[sec];
        for (let ri = 0; ri < secRooms.length; ri++) {
            if (di >= hand.length) {
                hand = shuffleDeck(deck, rng);
                di = 0;
            }
            const pick = hand[di];
            di += 1;
            const c = parseCoord(secRooms[ri]);
            const name = composeName(pick.q, pick.p, c ? c[2] : 0);
            out[secRooms[ri]] = name;
        }
    }
    return out;
}

function shuffleDeck<T>(deck: T[], rng: () => number): T[] {
    const d = deck.slice();
    for (let i = 0; i < d.length - 1; i++) {
        const j = i + Math.floor(rng() * (d.length - i));
        const tmp = d[i];
        d[i] = d[j];
        d[j] = tmp;
    }
    return d;
}
