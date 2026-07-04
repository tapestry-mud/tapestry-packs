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

test("statsFor elite: dice hp between mob and boss, own damage curve", () => {
    const e1 = statsFor("elite", 1, splitmix64(3));
    assert.equal(e1.hp, "12d10", "L1 elite hp dice (2x mob count)");
    assert.equal(e1.damage, "1d10");
    const e10 = statsFor("elite", 10, splitmix64(3));
    assert.equal(e10.hp, "28d10");
    assert.equal(e10.damage, "3d10");
});

test("statsFor miniboss: flat hp between elite and boss", () => {
    const m1 = statsFor("miniboss", 1, splitmix64(3));
    assert.equal(m1.hp, 90, "L1 miniboss hp");
    assert.equal(m1.damage, "2d8");
    const m10 = statsFor("miniboss", 10, splitmix64(3));
    assert.equal(m10.hp, 320);
    // interpolates between anchors like boss
    const m15 = statsFor("miniboss", 15, splitmix64(3));
    assert.equal(m15.hp, 535);
});
