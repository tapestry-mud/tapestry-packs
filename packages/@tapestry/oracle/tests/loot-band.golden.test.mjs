// loot-band golden tests - effectiveItemLevel(): the loot band math (Task 8).
// Wraps clampLevel(level + rarityModifier(rarity)) so a mint at the dialed
// run level bands to that level, bent by rarity, clamped to the 1..60 ladder.
// Run after npm run build. Rarity modifiers come from data/master-balance.yml
// (junk:-1, common:0, uncommon:1, rare:2, epic:3 - no "legendary" key here).
import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveItemLevel } from "../dist/scripts/resolver.js";

test("common rarity bands exactly to the dialed level", () => {
    assert.equal(effectiveItemLevel(10, "common"), 10);
    assert.equal(effectiveItemLevel(30, "common"), 30);
});

test("rarity bends the band up or down by its modifier", () => {
    assert.equal(effectiveItemLevel(10, "rare"), 12);
    assert.equal(effectiveItemLevel(10, "epic"), 13);
    assert.equal(effectiveItemLevel(10, "junk"), 9);
});

test("unknown rarity falls back to a zero modifier (same as common)", () => {
    assert.equal(effectiveItemLevel(10, "not-a-rarity"), 10);
});

test("clamps to the 1..60 ladder at both ends", () => {
    assert.equal(effectiveItemLevel(0, "common"), 1);
    assert.equal(effectiveItemLevel(1, "junk"), 1);
    assert.equal(effectiveItemLevel(60, "epic"), 60);
    assert.equal(effectiveItemLevel(100, "epic"), 60);
});

test("a level-3 run and a level-30 run band to different item levels for the same rarity", () => {
    const low = effectiveItemLevel(3, "common");
    const high = effectiveItemLevel(30, "common");
    assert.ok(high > low, "level-30 drop must band above a level-3 drop");
});
