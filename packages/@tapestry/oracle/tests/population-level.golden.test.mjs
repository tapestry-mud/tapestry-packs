// population-level golden tests - spawnLevel(): the pure level selector that
// carries a run's chosen level (or the legacy band-floor default) into the
// four population.ts spawn sites. Run after npm run build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnLevel } from "../dist/scripts/spawn-level.js";

test("run level wins when set", () => {
    assert.equal(spawnLevel({ runLevel: 37, levelRange: [1, 10] }), 37);
});

test("falls back to band floor for legacy areas", () => {
    assert.equal(spawnLevel({ levelRange: [12, 20] }), 12);
});

test("never returns below 1", () => {
    assert.equal(spawnLevel({ runLevel: 0, levelRange: [0, 0] }), 1);
});
