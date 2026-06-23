// Balance-curve determinism gate (pure helpers only + statsFor via local engine stub).
// Run: node --test tests/balance-curve.golden.test.mjs  (run after npm run build)
import { test } from "node:test";
import assert from "node:assert/strict";
import { interpolateNumeric, rarityModifier, clampLevel, statsFor } from "../dist/scripts/balance-table.js";
import { splitmix64 } from "../dist/scripts/prng.js";

test("interpolateNumeric hits the anchors exactly", () => {
    const anchors = [1, 10, 20, 40, 60];
    const values = [200, 700, 1600, 4200, 9000];
    assert.equal(interpolateNumeric(anchors, values, 1), 200);
    assert.equal(interpolateNumeric(anchors, values, 10), 700);
    assert.equal(interpolateNumeric(anchors, values, 60), 9000);
});

test("interpolateNumeric is linear between anchors", () => {
    const anchors = [1, 10, 20, 40, 60];
    const values = [200, 700, 1600, 4200, 9000];
    // midpoint between L10 (700) and L20 (1600) is L15 -> 1150
    assert.equal(interpolateNumeric(anchors, values, 15), 1150);
});

test("clampLevel pins to 1-60", () => {
    assert.equal(clampLevel(0), 1);
    assert.equal(clampLevel(99), 60);
    assert.equal(clampLevel(30), 30);
});

test("rarityModifier returns the per-tier bump", () => {
    assert.equal(rarityModifier("common"), 0);
    assert.equal(rarityModifier("rare"), 2);
    assert.equal(rarityModifier("epic"), 3);
    assert.equal(rarityModifier("unknown"), 0);
});

// Guards finding 6: a double-unwrapped weightedPick would make damage undefined and this fails.
test("statsFor returns a concrete rolled stat, never undefined", () => {
    const rng = splitmix64(7);
    assert.match(String(statsFor("weapon", 1, rng).damage), /^\d+d\d+$/);
    assert.match(String(statsFor("mob", 20, rng).hp), /^\d+d\d+$/);
    assert.equal(typeof statsFor("boss", 40, rng).hp, "number");
});
