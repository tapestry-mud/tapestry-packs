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
    assert.equal(e1.hp, "5d10", "L1 elite hp dice (B.2 retune, ~2x trash avg)");
    assert.equal(e1.damage, "1d10");
    const e10 = statsFor("elite", 10, splitmix64(3));
    assert.equal(e10.hp, "10d10");
    assert.equal(e10.damage, "3d10");
});

test("statsFor miniboss: flat hp between elite and boss", () => {
    const m1 = statsFor("miniboss", 1, splitmix64(3));
    assert.equal(m1.hp, 60, "L1 miniboss hp (B.2 retune)");
    assert.equal(m1.damage, "2d8");
    const m10 = statsFor("miniboss", 10, splitmix64(3));
    assert.equal(m10.hp, 210);
    // interpolates between anchors like boss
    const m15 = statsFor("miniboss", 15, splitmix64(3));
    assert.equal(m15.hp, 480);
});

// ---------------------------------------------------------------------------
// B.2 low-level TTK gate. Pinned player model (agreed with Travis 2026-07-04):
// GEARED, SKILL-LESS level 1 - avg weapon ~6.5 dmg/hit, ~55-60% hit rate.
// Targets at L1: trash 3-4 rounds, elite 8-10, miniboss a real fight (~60 HP),
// boss untouched (200 HP - the swell chunk kills it, never attrition).
// ---------------------------------------------------------------------------

function avgHpOfDice(notation) {
    const m = /^(\d+)d(\d+)$/.exec(String(notation));
    assert.ok(m, "dice notation: " + notation);
    return Number(m[1]) * (Number(m[2]) + 1) / 2;
}

function roundsToKill(avgHp, avgDmg, hitRate) {
    return Math.ceil(avgHp / (avgDmg * hitRate));
}

const PLAYER_AVG_DMG_L1 = 6.5;

test("TTK L1: trash dies in 3-4 rounds for the pinned player model", () => {
    const hp = avgHpOfDice(statsFor("mob", 1, splitmix64(11)).hp); // 2d10 -> 11
    assert.equal(hp, 11);
    for (const hitRate of [0.55, 0.60]) {
        const r = roundsToKill(hp, PLAYER_AVG_DMG_L1, hitRate);
        assert.ok(r >= 3 && r <= 4, "trash TTK " + r + " rounds at hit rate " + hitRate);
    }
});

test("TTK L1: elite dies in 8-10 rounds for the pinned player model", () => {
    const hp = avgHpOfDice(statsFor("elite", 1, splitmix64(11)).hp); // 5d10 -> 27.5
    assert.equal(hp, 27.5);
    for (const hitRate of [0.55, 0.60]) {
        const r = roundsToKill(hp, PLAYER_AVG_DMG_L1, hitRate);
        assert.ok(r >= 8 && r <= 10, "elite TTK " + r + " rounds at hit rate " + hitRate);
    }
});

test("TTK L1: miniboss is a real fight (~60 HP, 15-17 rounds skill-less)", () => {
    const hp = statsFor("miniboss", 1, splitmix64(11)).hp;
    assert.equal(hp, 60);
    for (const hitRate of [0.55, 0.60]) {
        const r = roundsToKill(hp, PLAYER_AVG_DMG_L1, hitRate);
        assert.ok(r >= 15 && r <= 17, "miniboss TTK " + r + " rounds at hit rate " + hitRate);
    }
});

test("TTK L1: boss curve untouched - 200 HP, swell chunks are the kill mechanic", () => {
    const hp = statsFor("boss", 1, splitmix64(11)).hp;
    assert.equal(hp, 200);
    // Attrition alone would be 51+ rounds even at 60% - the swell chunk
    // (15% of boss maxHp per countered swell, swell-boss template dial)
    // must be what kills it: ~7 clean counters.
    assert.ok(roundsToKill(hp, PLAYER_AVG_DMG_L1, 0.60) > 50);
    assert.equal(Math.ceil(hp / (hp * 0.15)), 7);
});

test("TTK retune: L1 trash damage softened to 1d6", () => {
    assert.equal(statsFor("mob", 1, splitmix64(5)).damage, "1d6");
});

test("TTK retune: wimpy_pct 0 at L1, back on the old curve by L10", () => {
    assert.equal(statsFor("mob", 1, splitmix64(5)).wimpy_pct, 0);
    assert.equal(statsFor("mob", 10, splitmix64(5)).wimpy_pct, 20);
    // interpolates smoothly between: L5 ~ 9
    assert.equal(statsFor("mob", 5, splitmix64(5)).wimpy_pct, 9);
});
