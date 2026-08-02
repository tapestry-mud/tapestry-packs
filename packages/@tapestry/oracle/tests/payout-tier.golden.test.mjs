// payout-tier golden tests - which tier a clear pays (spec 6.2 as amended, 6.4).
// The boss payout is ROLLED at clear time and GRANTED in the cutscene, never left
// on a corpse the teardown destroys. The tier is split out pure so the rarity lever
// is testable without the engine. Run after npm run build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { payoutTierFor, rarityForTier } from "../dist/scripts/payout-tier.js";

test("a normal clear pays a standard piece", () => {
    assert.equal(payoutTierFor("normal", 0.9, 0), "standard");
});

test("an Unraveling clear pays the pinnacle, guaranteed", () => {
    assert.equal(payoutTierFor("unraveling", 0.9, 0), "pinnacle");
});

test("the rare tier wins over both modes when the roll lands under the chance", () => {
    assert.equal(payoutTierFor("normal", 0.01, 0.05), "rare");
    assert.equal(payoutTierFor("unraveling", 0.01, 0.05), "rare");
});

test("a zero rare chance can never pay rare, whatever the roll", () => {
    assert.equal(payoutTierFor("normal", 0, 0), "standard");
    assert.equal(payoutTierFor("unraveling", 0, 0), "pinnacle");
});

test("the rare boundary is exclusive, so chance 0.05 pays rare below 0.05 and not at it", () => {
    assert.equal(payoutTierFor("normal", 0.049, 0.05), "rare");
    assert.equal(payoutTierFor("normal", 0.05, 0.05), "standard");
});

test("each tier maps to a rarity the item tables already speak", () => {
    assert.equal(rarityForTier("standard"), "uncommon");
    assert.equal(rarityForTier("pinnacle"), "rare");
    assert.equal(rarityForTier("rare"), "epic");
});

test("an unknown mode degrades to standard rather than throwing", () => {
    assert.equal(payoutTierFor("nonsense", 0.9, 0), "standard");
});
