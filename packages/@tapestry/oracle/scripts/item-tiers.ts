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
