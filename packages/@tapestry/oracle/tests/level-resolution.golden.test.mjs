// level-resolution golden tests - spec 4.3. The player never picks a level: entry is
// walking through a portal, so the band moved from the template onto the portal and
// the run level is the player's own level plus one, clamped into that band. The FLOOR
// is the soft gate - an under-leveled player is clamped UP and flattened.
// Run after npm run build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalRunLevel, unravelingRunLevel, mobTierLevels } from "../dist/scripts/level-resolution.js";

const SCHOOL = { min: 1, max: 1, unravelingBoost: 3 };
const WEEK_ONE = { min: 2, max: 5, unravelingBoost: 3 };
const WEEK_TWO = { min: 5, max: 10, unravelingBoost: 3 };

test("school always mints at 1 no matter who walks in (spec 4.3 worked example)", () => {
    assert.equal(normalRunLevel(1, SCHOOL), 1);
    assert.equal(normalRunLevel(60, SCHOOL), 1);
});

test("school's Unraveling mints at 4", () => {
    assert.equal(unravelingRunLevel(SCHOOL), 4);
});

test("week one: a level 3 player mints it at 4", () => {
    assert.equal(normalRunLevel(3, WEEK_ONE), 4);
});

test("week one caps out: a level 5 player still mints at 5, not 6", () => {
    assert.equal(normalRunLevel(5, WEEK_ONE), 5);
});

test("week two: a level 5 player mints it at 6 and climbs with them", () => {
    assert.equal(normalRunLevel(5, WEEK_TWO), 6);
    assert.equal(normalRunLevel(8, WEEK_TWO), 9);
    assert.equal(normalRunLevel(20, WEEK_TWO), 10);
});

test("the floor is the soft gate: a level 3 player walking into week two is clamped UP to 5", () => {
    assert.equal(normalRunLevel(3, WEEK_TWO), 5);
});

test("mob tiers offset from the run level, keeping the school's observed ratios", () => {
    assert.deepEqual(mobTierLevels(1), { trash: 1, miniboss: 3, boss: 5 });
    assert.deepEqual(mobTierLevels(4), { trash: 4, miniboss: 6, boss: 8 });
});

test("a nonsense player level never mints below the band floor", () => {
    assert.equal(normalRunLevel(0, WEEK_TWO), 5);
    assert.equal(normalRunLevel(-3, WEEK_TWO), 5);
});

test("a portal wired backwards (max below min) resolves to the floor, never below it", () => {
    assert.equal(normalRunLevel(9, { min: 8, max: 4, unravelingBoost: 2 }), 8);
});

test("a missing boost is treated as zero, never NaN", () => {
    assert.equal(unravelingRunLevel({ min: 1, max: 6, unravelingBoost: 0 }), 6);
});
