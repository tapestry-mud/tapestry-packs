// Pure coordinate-helper tests (carve-out from no-node-tests: zero CLR/Jint values).
// Run after `npx tsc`: node --test tests/coords.golden.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    DIR_OFFSETS, ALL_DIRECTIONS, parseCoord, formatCoord, oppositeDir,
    neighborPath, pathKey, parsePathKey, descentDepth,
} from "../dist/scripts/coords.js";

test("DIR_OFFSETS has all six directions including up/down", () => {
    assert.deepEqual(ALL_DIRECTIONS.sort(), ["down", "east", "north", "south", "up", "west"]);
    assert.deepEqual(DIR_OFFSETS.up, [0, 0, 1]);
    assert.deepEqual(DIR_OFFSETS.down, [0, 0, -1]);
});

test("parseCoord parses x,y,z (3D only - no 2D back-compat)", () => {
    assert.deepEqual(parseCoord("1,-2,3"), [1, -2, 3]);
    assert.equal(parseCoord("0,0"), null);  // legacy 2D rejected (F0 needs a re-seed)
    assert.equal(parseCoord("bad"), null);
});

test("neighborPath applies the up/down offset (the u/d bug fix)", () => {
    assert.equal(neighborPath("0,0,0", "down"), "0,0,-1");
    assert.equal(neighborPath("0,0,-1", "down"), "0,0,-2");
    assert.equal(neighborPath("0,0,0", "up"), "0,0,1");
    assert.equal(neighborPath("0,0,0", "north"), "0,1,0");
    assert.equal(neighborPath("bad", "down"), null);
});

test("oppositeDir round-trips up/down", () => {
    assert.equal(oppositeDir("up"), "down");
    assert.equal(oppositeDir("down"), "up");
    assert.equal(oppositeDir("north"), "south");
    assert.equal(oppositeDir("nowhere"), "");
});

test("pathKey / parsePathKey round-trip and handle entry", () => {
    assert.equal(pathKey("1,-2,3"), "1_-2_3");
    assert.equal(parsePathKey("1_-2_3"), "1,-2,3");
    assert.equal(parsePathKey("entry"), "0,0,0");
    assert.equal(parsePathKey("0_0"), null);   // legacy 2D pathKey rejected (clean break)
    assert.equal(parsePathKey("garbage-x"), null);
});

test("descentDepth measures downward distance from entry", () => {
    assert.equal(descentDepth("0,0,0"), 0);
    assert.equal(descentDepth("0,0,-3"), 3); // three steps down
    assert.equal(descentDepth("0,0,2"), 0);  // climbed above entry
});

test("formatCoord composes a signed triple", () => {
    assert.equal(formatCoord(-1, 0, -2), "-1,0,-2");
});
