// lair golden tests - the boss takes the landmark furthest from entry (spec 5.2).
// placeLandmarks already puts K landmarks one per angular wedge at 0.45R..0.70R and
// roadEdges already forces a Bresenham road to each, so promoting the furthest one
// costs no new geometry. Run after npm run build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { furthestLandmarkIndex } from "../dist/scripts/lair.js";
import { placeLandmarks } from "../dist/scripts/structure.js";

test("picks the landmark with the greatest distance from entry", () => {
    const cells = [
        { index: 0, x: 3, y: 0, z: 0 },
        { index: 1, x: 0, y: 9, z: 0 },
        { index: 2, x: -4, y: -4, z: 0 },
    ];
    assert.equal(furthestLandmarkIndex(cells), 1);
});

test("ties break to the LOWEST index so the pick is deterministic", () => {
    const cells = [
        { index: 0, x: 5, y: 0, z: 0 },
        { index: 1, x: 0, y: 5, z: 0 },
        { index: 2, x: -5, y: 0, z: 0 },
    ];
    assert.equal(furthestLandmarkIndex(cells), 0);
});

test("an empty landmark list has no lair", () => {
    assert.equal(furthestLandmarkIndex([]), -1);
});

test("a single landmark is the lair", () => {
    assert.equal(furthestLandmarkIndex([{ index: 0, x: 2, y: 2, z: 0 }]), 0);
});

test("is pure f(seed): the same real placement always yields the same lair", () => {
    const cells = placeLandmarks(11223344, 40);
    const a = furthestLandmarkIndex(cells);
    const b = furthestLandmarkIndex(placeLandmarks(11223344, 40));
    assert.equal(a, b);
    assert.ok(a >= 0 && a < cells.length);
});

test("real placements leave at least one miniboss on a standard area", () => {
    const cells = placeLandmarks(987654321, 40);
    assert.ok(cells.length >= 2);
    const lair = furthestLandmarkIndex(cells);
    assert.ok(cells.length - 1 >= 1, "K-1 minibosses must remain");
    assert.ok(lair >= 0);
});
