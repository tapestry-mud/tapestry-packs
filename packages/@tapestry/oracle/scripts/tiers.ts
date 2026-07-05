// tiers.ts - the stage-B threat-ladder pure core. NO engine value imports
// (six-axis/prng/coords are engine-stub-safe), so everything here is
// golden-testable under plain node.
//
// The mob six-axis instantiation (0.5.0):
//   DEGREE    - MOB-1 menace bands (shared _default mechanics, 1d10:
//               skulker 1-2 / common 3-6 / hunter 7-9 / apex 10) resolved
//               through the shipped band resolver. WHICH creature spawns is a
//               banded roll, not a flat pick.
//   CONTEXT   - the room's ROOM-1 band bends the menace roll before bands are
//               read (CONTEXT_BUMP), and weights the disposition draw
//               (DISPOSITION_WEIGHTS).
//   DRESSING  - per-disposition arrival lines (stirLine); the LLM only names
//               and describes creatures.
//   SIGNATURE - elite epithets: rolled once at mint, frozen into the name.
//               Miniboss identities freeze in the landmarks table (boss-<i>).
//   CONSEQUENCE - death stamps (consequence-hooks.ts, unchanged).
//   CASCADE   - deferred to the combat lane (documented, not built).
//
// DISPOSITION is dice-owned and rides TEMPLATE selection: the engine's aggro
// seam is the mob template's base_disposition field (DispositionEvaluator
// aggros hostile mobs on room entry + tick; admins are exempt). SpawnOverride
// carries no disposition/tag/property fields, so a per-instance override is
// impossible pack-side - three trash templates carry the three temperaments.
// There is NO engine flee-on-sight seam: "timid" approximates as neutral +
// high wimpy_pct (bolts early once hurt) - documented engine gap.
//
// ASCII; braces on all control flow.

import { weightedPick } from "./prng.js";
import { parseCoord } from "./coords.js";
import { rollDegree, resolveBands, type SixAxisTable } from "./six-axis.js";
import type { OracleEntry } from "./oracle-tables.js"; // type-only: erased at compile

export type Disposition = "aggro" | "neutral" | "timid";

/** CONTEXT axis: how the room's ROOM-1 band bends the MOB-1 menace roll. */
export const CONTEXT_BUMP: Record<string, number> = {
    transit: -2,
    chamber: 0,
    charged: 2,
    landmark: 1,
    threshold: 2,
};

/** Dice-owned disposition distribution per room band: [aggro, neutral, timid].
 *  Charged skews aggro; transit skews timid (transit density is currently 0 -
 *  the row exists so any future density change inherits the right mix). */
export const DISPOSITION_WEIGHTS: Record<string, [number, number, number]> = {
    transit: [0.10, 0.30, 0.60],
    chamber: [0.30, 0.45, 0.25],
    charged: [0.65, 0.30, 0.05],
    landmark: [0.40, 0.40, 0.20],
    threshold: [0.50, 0.35, 0.15],
};

/** Trash disposition -> mob template. The template's base_disposition IS the
 *  engine aggro seam; see the module header. */
export const DISPOSITION_TEMPLATES: Record<Disposition, string> = {
    aggro: "tapestry-oracle:hostile-melee",
    neutral: "tapestry-oracle:wary-melee",
    timid: "tapestry-oracle:skittish-melee",
};

/** Threat tier -> swell-capable template (dials are template data because
 *  SpawnOverride cannot carry swell properties). */
export const TIER_TEMPLATES: Record<string, string> = {
    elite: "tapestry-oracle:swell-elite",
    miniboss: "tapestry-oracle:swell-miniboss",
    boss: "tapestry-oracle:swell-boss",
};

/** SIGNATURE axis for elites: rolled once at mint, frozen into the name. */
export const ELITE_EPITHETS: string[] = [
    "dire", "hulking", "rabid", "ancient", "pale", "scarred", "one-eyed", "silent",
];

export function pickEpithet(rng: () => number): string {
    return ELITE_EPITHETS[Math.floor(rng() * ELITE_EPITHETS.length)];
}

/** One draw, cumulative over the band's weight triple. Unknown band -> chamber. */
export function rollDisposition(band: string, rng: () => number): Disposition {
    const w = Object.prototype.hasOwnProperty.call(DISPOSITION_WEIGHTS, band)
        ? DISPOSITION_WEIGHTS[band]
        : DISPOSITION_WEIGHTS.chamber;
    const roll = rng();
    if (roll < w[0]) { return "aggro"; }
    if (roll < w[0] + w[1]) { return "neutral"; }
    return "timid";
}

/** The entry cell's pathKey - the structurally safe start. */
export const ENTRY_PATH = "0,0,0";

/** Ambient spawn density per ROOM-1 band. transit is a breather; charged is
 *  densest. threshold maps to 1: the arena's real threat is the boss clock,
 *  not trash. (Moved from population.ts in B.2 so the entry-zero rule below
 *  is golden-testable with it.) */
export const DENSITY: Record<string, number> = {
    transit: 0,
    chamber: 1,
    charged: 2,
    landmark: 1,
    threshold: 1,
};

/** STRUCTURAL GUARANTEE (B.2): the entry room spawns ZERO ambient mobs, ever
 *  - same posture as the structurally boss-free entry. NPCs (the guide) ride
 *  a different spawn path and stay allowed. */
export function entrySafeDensity(path: string, density: number): number {
    return path === ENTRY_PATH ? 0 : density;
}

/** Ambient (trash) spawn budget for a room: the band's density, entry-zeroed. */
export function ambientDensity(band: string, path: string): number {
    const d = Object.prototype.hasOwnProperty.call(DENSITY, band) ? DENSITY[band] : 1;
    return entrySafeDensity(path, d);
}

/** True for exactly the six orthogonal neighbors of the entry cell (0,0,0).
 *  The entry cell itself returns false - callers test it separately. */
export function isEntryAdjacent(path: string): boolean {
    const c = parseCoord(path);
    if (!c) { return false; }
    return Math.abs(c[0]) + Math.abs(c[1]) + Math.abs(c[2]) === 1;
}

/** The menace band an area mob entry is assigned to via its id prefix, or null
 *  for a 0.4.0-shape flat id. */
export function bandOfEntryId(id: string): string | null {
    const m = /^mb-(skulker|common|hunter|apex)-/.exec(String(id));
    return m ? m[1] : null;
}

/**
 * Six-axis mob selection: roll the MOB-1 menace degree, bend it by the room's
 * CONTEXT bump, resolve the band, and pick within the band slice.
 * Fallback ladder (back-compat by construction):
 *   - entries empty -> null
 *   - no MOB-1 table or no banded ids (every 0.4.0 frozen table) -> flat
 *     weighted pick over all entries (exactly the 0.4.0 behavior)
 *   - band slice empty -> flat weighted pick over all entries
 */
export function selectMobEntry(
    mob1: SixAxisTable | undefined,
    entries: OracleEntry[],
    bump: number,
    rng: () => number
): OracleEntry | null {
    if (!entries || entries.length === 0) { return null; }
    const flat = function (): OracleEntry {
        return weightedPick(entries.map(function (e) { return { w: e.w, value: e }; }), rng);
    };
    if (!mob1) { return flat(); }
    const banded: OracleEntry[] = [];
    for (let i = 0; i < entries.length; i++) {
        if (bandOfEntryId(entries[i].id) !== null) { banded.push(entries[i]); }
    }
    if (banded.length === 0) { return flat(); }
    const degree = rollDegree(mob1, rng) + bump;
    const band = resolveBands(mob1, degree).band;
    const slice: OracleEntry[] = [];
    for (let i = 0; i < banded.length; i++) {
        if (bandOfEntryId(banded[i].id) === band) { slice.push(banded[i]); }
    }
    if (slice.length === 0) { return flat(); }
    return weightedPick(slice.map(function (e) { return { w: e.w, value: e }; }), rng);
}

/** Synthesized miniboss identity for landmarks frozen before 0.5.0 (no boss-<i>
 *  rows) or a fill that gave nothing. */
export function defaultMinibossFor(landmarkName: string): { bossName: string; bossDesc: string } {
    return {
        bossName: "the keeper of the " + landmarkName,
        bossDesc: "Something has claimed the " + landmarkName + " and suffers no trespass.",
    };
}

/** DRESSING: per-kind arrival lines (population capitalizes the first letter). */
export function stirLine(kind: Disposition | "elite" | "miniboss" | "boss", name: string): string {
    if (kind === "aggro") { return name + " rounds on you the moment you enter."; }
    if (kind === "timid") { return name + " shrinks back at your arrival."; }
    if (kind === "elite") { return name + " turns its full attention on you."; }
    if (kind === "miniboss") { return name + " rises to meet you."; }
    return name + " stirs at your arrival.";
}
