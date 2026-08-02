// clear-payout.ts - roll the boss payout, then hand it over (spec 6.2 as amended).
//
// WHY THIS EXISTS AT ALL: core's death.ts (scripts/mobs/death.ts:20-36) puts a dead
// mob's items into a CORPSE CONTAINER and auto-awards only gold (:44-57). For trash
// and keepers that is fine - the player is standing there and loots it. For the lair
// boss it is fatal: the clear sequence holds the player in a cutscene for about
// seven seconds and then tears the entire area down, so anything in that corpse is
// destroyed before the player has input back. Law 1's "the boss pays its roll" was
// silently false for every run in both modes.
//
// So the payout is rolled and granted directly, and the corpse is left empty by
// Task 5 (no pre-loaded drop on the lair boss) so the run cannot pay twice.
//
// THE ORDER (spec 6.2): roll FIRST and SILENTLY, compose the beats around what came
// up, then grant and message in onComplete. The player reads the payout as the last
// beat rather than as a line that spoils the beat before it. This is the same
// ordering rule the thread grant obeys, and it is why rollClearPayout and
// grantClearPayout are two calls instead of one.
//
// ASCII; braces on all control flow.

import * as tapestry from "@tapestry/engine";
import { mintItemInstance, rngFor } from "./resolver.js";
import { getAreaState } from "./area-state.js";
import { payoutTierFor, rarityForTier, type PayoutTier } from "./payout-tier.js";

export interface ClearPayoutItem {
    itemId: string;
    name: string;
    tier: PayoutTier;
}

export type ClearPayout = ClearPayoutItem | null;

/**
 * Roll the clear payout. Mints the item TEMPLATE but does not give it to anybody -
 * nothing the player can see happens here. Returns null only when the area's tables
 * are unreadable, which is the one case where there is genuinely nothing to pay.
 *
 * The stream key includes the player and the mode so two players clearing the same
 * run area, and the same player clearing normal then Unraveling, do not collide on
 * one frozen item id.
 */
export function rollClearPayout(
    areaId: string,
    playerId: string,
    runLevel: number,
    mode: string,
    rareChance: number
): ClearPayout {
    try {
        const st = getAreaState(areaId);
        if (!st) {
            return null;
        }
        const rng = rngFor(st.areaSeed, "clear-payout:" + mode + ":" + playerId);
        const tier = payoutTierFor(mode, rng(), rareChance);
        const item1 = st.sixAxis["ITEM-1"];
        const item6 = st.sixAxis["ITEM-6"];
        // GUARANTEED: this is a payout, not a drop chance. rollItemDrop is never
        // consulted here - that is the tier probability the ordinary loot path uses,
        // and spec 9.2's "the clear payout is the thread plus one guaranteed piece"
        // is exactly the thing it cannot express.
        //
        // rarityFloor is how the TIER REACHES THE ITEM (R2-F1). There is no `rarity`
        // opt on mintItemInstance and there never was: rarity is read off the
        // selected table entry, so the only way to move it is to move SELECTION.
        // Step 3b's selectItemEntryFloored honors this floor and walks down if the
        // table cannot satisfy it.
        const loot = mintItemInstance(
            areaId, runLevel, rng, "clear-payout", 0, item1, item6,
            {
                killerTier: "boss",
                roomBand: "charged",
                rarityFloor: rarityForTier(tier),
                // The bottom of the descent, and it is the STANDARD tier's own band
                // by construction - a clear never pays below what the weakest clear
                // pays. Without this the descent runs epic -> rare -> uncommon ->
                // common -> junk and a thin items table pays vendor trash for the
                // boss (R3-F1).
                rarityMin: rarityForTier("standard"),
            }
        );
        if (!loot || !loot.id) {
            // The window was unsatisfiable: this area's items table carries nothing
            // at uncommon or above. Loud, because it is an authoring bug in the
            // area's tables, not a runtime condition - and silent junk would have
            // been the alternative.
            try {
                (tapestry as any).system?.warn(
                    "[oracle] clear payout for " + areaId + " found no entry at or above "
                    + rarityForTier("standard") + "; the thread paid no gear. Check the area's items table."
                );
            } catch (_warnErr) {
                // graceful: a missing warn binding never blocks the exit.
            }
            return null;
        }
        return { itemId: loot.id, name: String(loot.name || "something"), tier };
    } catch (_err) {
        // graceful: a failed roll pays nothing rather than blocking the exit.
        return null;
    }
}

/** The last cutscene beat, composed around what the roll actually produced. The
 *  reveal IS the beat, so no payout line is sent before the cutscene. */
export function payoutRevealBeat(payout: ClearPayout): string {
    if (!payout) {
        return "The weave lets you go.";
    }
    if (payout.tier === "rare") {
        return "Something the pattern should not have been holding comes loose with it: " + payout.name + ".";
    }
    if (payout.tier === "pinnacle") {
        return "The bottom of the pattern gives, and pays out what it was holding: " + payout.name + ".";
    }
    return "One thing worth carrying comes away in your hand: " + payout.name + ".";
}

/** Hand it over. Called in onComplete, BEFORE the teardown, so the instanced item is
 *  already a real entity on the player file when the area goes (the same Decision C
 *  guarantee `solo discard` relies on: teardown never touches instanced items). */
export function grantClearPayout(playerId: string, payout: ClearPayout): boolean {
    if (!payout) {
        return false;
    }
    try {
        const spawned = (tapestry as any).items.spawnToInventory(payout.itemId, playerId);
        if (!spawned) {
            return false;
        }
        (tapestry as any).world.send(playerId, "You are carrying " + payout.name + ".\r\n");
        return true;
    } catch (_err) {
        return false;
    }
}
