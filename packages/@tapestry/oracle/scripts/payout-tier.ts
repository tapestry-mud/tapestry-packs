// payout-tier.ts - which tier a clear pays (spec 6.2 as amended, spec 6.4).
//
// Split out pure, zero engine imports, because this is the REPLAYABILITY LEVER and
// it should be testable on its own. Spec 6.2: "Which piece you get is decided at
// clear time, so one authored boss can pay a different slot every run. That is the
// renewable reason to walk a thread you have already beaten, and it is where a rare
// tier (a 1-in-N artifact) belongs."
//
// So the rare tier EXISTS in the shape from day one and is driven by data
// (`rareChance`), rather than being bolted on later by reshaping the roll. v1 wires
// rareChance to 0 everywhere because no week has authored a rare table yet (6.4:
// "plus whatever rare table the week carries"); the day one does, it is a number on
// the portal, not a code change.
//
// ASCII; braces on all control flow.

export type PayoutTier = "standard" | "pinnacle" | "rare";

/**
 * roll01 is a single [0,1) draw. The rare check comes FIRST and wins over the mode,
 * so a rare artifact is reachable from a normal clear too - otherwise the only way
 * to see one would be the Unraveling, and 7.2's "a normal clear is a full payout in
 * its own right" would quietly stop being true.
 *
 * The boundary is exclusive (`<`), so rareChance 0 can never pay rare no matter what
 * comes up, which is what makes 0 a safe v1 default rather than a 1-in-infinity edge.
 */
export function payoutTierFor(mode: string, roll01: number, rareChance: number): PayoutTier {
    const chance = typeof rareChance === "number" && rareChance > 0 ? rareChance : 0;
    const roll = typeof roll01 === "number" && roll01 >= 0 ? roll01 : 1;
    if (roll < chance) {
        return "rare";
    }
    if (mode === "unraveling") {
        return "pinnacle";
    }
    return "standard";
}

/** The rarity BAND each tier floors selection at. These are band names the item
 *  tables already speak (an item entry's own `rarity` field is matched against the
 *  resolved ITEM-1 band by `selectItemEntry`), which is what lets the floor be
 *  honored by selection rather than pasted onto the result. A clear always pays at
 *  least uncommon: it is the end of a thread, not a trash drop. */
export function rarityForTier(tier: PayoutTier): string {
    if (tier === "rare") {
        return "epic";
    }
    if (tier === "pinnacle") {
        return "rare";
    }
    return "uncommon";
}
