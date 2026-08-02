// item-tiers.ts - the stage-C items six-axis pure core. NO engine value
// imports (six-axis/prng/oracle-tables types are engine-stub-safe), so
// everything here is golden-testable under plain node.
//
// Items six-axis (0.6.0):
//   DEGREE    - ITEM-1 rarity bands (shared _default mechanics, 1d12:
//               junk 1-2 / common 3-7 / uncommon 8-10 / rare 11 / epic 12)
//               resolved through the shipped band resolver. WHICH rarity an
//               item rolls is a banded roll, not a flat pick off the
//               entry's own static rarity field.
//   CONTEXT   - ITEM-6: killer tier + room band bend BOTH the base drop
//               chance and the rarity roll, from the same two inputs. Kept
//               as table data (not a TS constant) so playtest feel verdicts
//               can retune it without a rebuild.
//   DRESSING  - the LLM names/describes items per rarity tier (oracle-structured.ts).
//   SIGNATURE - the epic band freezes a proper-noun name once at mint,
//               mirroring stage B's elite epithets.
//   CONSEQUENCE / CASCADE - deferred (curse/ego, cross-area hooks); the
//               design spec's own posture, unchanged by this slice.
//
// ASCII; braces on all control flow.

import { weightedPick } from "./prng.js";
import { rollDegree, resolveBands, type SixAxisTable } from "./six-axis.js";
import type { OracleEntry } from "./oracle-tables.js"; // type-only: erased at compile

export type KillerTier = "trash" | "elite" | "miniboss" | "boss";

export interface ItemDropContext {
    killerTier: KillerTier;
    roomBand: string;
    /** Clear-payout only: the band selection is lifted TO. Absent for every ordinary
     *  drop, which is why the un-floored path is untouched. */
    rarityFloor?: string;
    /** Clear-payout only: the band selection may never fall BELOW when the table
     *  cannot satisfy rarityFloor. Absent means no descent at all (R3-F1). */
    rarityMin?: string;
}

/** Fallback drop chances when ITEM-6 is unavailable (defensive - ITEM-6 is
 *  eager-loaded as a shared _default mechanic so this path is not expected
 *  to fire on any 0.6.0+ area, only in isolated unit tests). Trash matches
 *  the exact 0.35 value stage A/B shipped, preserving today's observable
 *  trash drop frequency at the default (no-bump) context. */
const DEFAULT_DROP_CHANCE: Record<KillerTier, number> = {
    trash: 0.35, elite: 0.65, miniboss: 0.90, boss: 1.00,
};

/** Look up the killer_tier row's drop_chance from ITEM-6's CONTEXT inputs. */
export function dropChanceFor(item6: SixAxisTable | undefined, killerTier: KillerTier): number {
    if (!item6) { return DEFAULT_DROP_CHANCE[killerTier]; }
    for (let i = 0; i < item6.inputs.length; i++) {
        const row = item6.inputs[i];
        if (row && row.kind === "killer_tier" && row.key === killerTier && row.drop_chance !== undefined) {
            return Number(row.drop_chance);
        }
    }
    return DEFAULT_DROP_CHANCE[killerTier];
}

/** Unconditional per-spawn draw: does this kill drop anything at all. */
export function rollItemDrop(item6: SixAxisTable | undefined, killerTier: KillerTier, rng: () => number): boolean {
    return rng() < dropChanceFor(item6, killerTier);
}

/** Sum the killer_tier bump and the room_band bump from ITEM-6's CONTEXT
 *  inputs. Unknown keys (or a missing table) contribute 0 - back-compat by
 *  construction, same posture as MOB-1's CONTEXT_BUMP fallback. */
export function itemContextBump(item6: SixAxisTable | undefined, ctx: ItemDropContext): number {
    if (!item6) { return 0; }
    let bump = 0;
    for (let i = 0; i < item6.inputs.length; i++) {
        const row = item6.inputs[i];
        if (!row) { continue; }
        if (row.kind === "killer_tier" && row.key === ctx.killerTier) { bump += Number(row.bump) || 0; }
        if (row.kind === "room_band" && row.key === ctx.roomBand) { bump += Number(row.bump) || 0; }
    }
    return bump;
}

/**
 * Six-axis item selection: roll the ITEM-1 rarity degree, bend it by the
 * supplied context bump, resolve the band, and pick within the entries that
 * share that band's name in their `rarity` field (items already carry rarity
 * as a first-class field - no id-prefix encoding needed, unlike mobs).
 * Fallback ladder (back-compat by construction):
 *   - entries empty -> null
 *   - no ITEM-1 table -> flat weighted pick over all entries
 *   - no entry matches the resolved band -> flat weighted pick over all entries
 */
export function selectItemEntry(
    item1: SixAxisTable | undefined,
    entries: OracleEntry[],
    bump: number,
    rng: () => number
): OracleEntry | null {
    if (!entries || entries.length === 0) { return null; }
    const flat = function (): OracleEntry {
        return weightedPick(entries.map(function (e) { return { w: e.w, value: e }; }), rng);
    };
    if (!item1) { return flat(); }
    const degree = rollDegree(item1, rng) + bump;
    const band = resolveBands(item1, degree).band;
    const slice: OracleEntry[] = [];
    for (let i = 0; i < entries.length; i++) {
        if ((entries[i].rarity || "common") === band) { slice.push(entries[i]); }
    }
    if (slice.length === 0) { return flat(); }
    return weightedPick(slice.map(function (e) { return { w: e.w, value: e }; }), rng);
}

/** Rank a band by its degree window. ITEM-1's bands are ordered windows over the
 *  degree roll, so `min` IS the ladder position - more robust than array index and
 *  it cannot be broken by a table that lists its bands out of order. Unknown band
 *  names rank -1, which makes every comparison against them a no-op. */
function bandRank(item1: SixAxisTable | undefined, band: string): number {
    if (!item1) { return -1; }
    for (let i = 0; i < item1.bands.length; i++) {
        if (item1.bands[i].band === band) { return item1.bands[i].min; }
    }
    return -1;
}

/**
 * Select an item entry within a band WINDOW: no richer than the roll or the floor
 * (whichever is higher), and never poorer than minBand.
 *
 * Deliberately a SEPARATE function rather than a new optional parameter on
 * selectItemEntry: the un-floored path is what every trash, elite, and miniboss drop
 * in the game goes through, and its behavior here must stay byte-identical. Nothing
 * about ordinary loot changes.
 *
 * THE DESCENT IS BOUNDED, and that bound is review R3-F1. selectItemEntry's own
 * fallback for an empty band slice is a FLAT pick over every entry, which for a
 * floored selection is strictly worse than no floor - ask for epic, get a common. An
 * unbounded descent is barely better: the real shared ITEM-1 ladder is
 * junk 1-2 / common 3-7 / uncommon 8-10 / rare 11 / epic 12, so descending from epic
 * walks epic, rare, uncommon, common, JUNK, and an area with a thin items table
 * would hand the player vendor trash for killing the boss. That contradicts both
 * 6.4's "guaranteed max-band piece" and the reason the tier exists.
 *
 * So the window has a floor AND a bottom. If nothing in [minBand, target] exists,
 * this returns NULL rather than reaching below it. Null is the loud failure: the
 * caller warns and the clear pays no gear, which surfaces a thin items table as the
 * authoring bug it is instead of quietly paying junk forever. Paying nothing is
 * recoverable by fixing the table; teaching a player that boss rewards are trash is
 * not.
 *
 * minBand empty or unknown means "no descent at all" - the window collapses to the
 * target band, which is the safe default rather than an unbounded one.
 */
export function selectItemEntryFloored(
    item1: SixAxisTable | undefined,
    entries: OracleEntry[],
    bump: number,
    floorBand: string,
    minBand: string,
    rng: () => number
): OracleEntry | null {
    if (!entries || entries.length === 0) { return null; }
    // No ITEM-1 table means no band ladder to honor the floor against, so REFUSE
    // rather than pay below it (review R4-F1). An earlier revision delegated to
    // selectItemEntry here, which flat-picks over EVERY entry including junk - so
    // the one branch that could not check the floor was also the one that ignored
    // the bottom, and a clear payout came out as vendor trash through the single
    // door this function exists to close.
    //
    // Reachability is low: ITEM-1 is eager-loaded from the shared `_default` set at
    // module init. But that loader is a try/catch that SILENTLY SKIPS a missing or
    // malformed file (six-axis.ts:226-241), so a broken `_default/ITEM-1.yaml`
    // produces no table, no error, and a game that quietly pays junk for boss kills.
    // That is exactly the silent-degrade shape this whole payout path was rewritten
    // to eliminate. Null instead: the caller warns and the thread pays no gear,
    // which is loud, and which is what spec 6.2 as amended requires.
    if (!item1) { return null; }

    const rolled = resolveBands(item1, rollDegree(item1, rng) + bump).band;
    const floorR = bandRank(item1, floorBand);
    const rolledR = bandRank(item1, rolled);
    const targetR = floorR > rolledR ? floorR : rolledR;
    const minR = minBand !== "" ? bandRank(item1, minBand) : targetR;
    const bottomR = (minR < 0 || minR > targetR) ? targetR : minR;

    // Every band inside [bottom, target], richest first.
    const ladder: Array<{ band: string; rank: number }> = [];
    for (let i = 0; i < item1.bands.length; i++) {
        const b = item1.bands[i];
        if (b.min <= targetR && b.min >= bottomR) { ladder.push({ band: b.band, rank: b.min }); }
    }
    ladder.sort(function (a, b) { return b.rank - a.rank; });

    for (let i = 0; i < ladder.length; i++) {
        const slice: OracleEntry[] = [];
        for (let j = 0; j < entries.length; j++) {
            if ((entries[j].rarity || "common") === ladder[i].band) { slice.push(entries[j]); }
        }
        if (slice.length > 0) {
            return weightedPick(slice.map(function (e) { return { w: e.w, value: e }; }), rng);
        }
    }
    // Nothing in the window. Deliberately NOT a flat pick - see the header.
    return null;
}

/** SIGNATURE axis: a frozen proper name for the epic band, rolled once at
 *  mint (mirrors ELITE_EPITHETS in tiers.ts). Deliberately just a name this
 *  slice - power/bane/purpose stacking (the design's fuller ITEM-5) needs
 *  the CONSEQUENCE/CASCADE axes, both deferred. */
export const ITEM_SIGNATURE_NAMES: string[] = [
    "Gravewake", "Emberfall", "Duskbiter", "Stormkeel",
    "Ashwhisper", "Nightgall", "Sunderthorn", "Hollowmere",
];

export function pickSignatureName(rng: () => number): string {
    return ITEM_SIGNATURE_NAMES[Math.floor(rng() * ITEM_SIGNATURE_NAMES.length)];
}

/** True only for the ITEM-1 band whose `fires` is "signature". */
export function isSignatureBand(item1: SixAxisTable | undefined, band: string): boolean {
    if (!item1) { return false; }
    for (let i = 0; i < item1.bands.length; i++) {
        if (item1.bands[i].band === band) { return item1.bands[i].fires === "signature"; }
    }
    return false;
}
