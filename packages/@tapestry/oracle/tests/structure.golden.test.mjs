// structure golden tests - the v3 spatial core is pure f(areaSeed, coord), so the
// whole geometry layer is provable under plain node: determinism, edge reciprocity,
// landmark reachability by construction, envelope closure, size-band calibration,
// vertical scarcity, and rim decay. Run after npm run build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    SIZE_BANDS, rollTargetRooms, landmarkCount, radiusFor, envelopeFactor,
    placeLandmarks, landmarkPath, sectorOf, edgeKey, roadEdges, edgeExists,
    computeStructure, pureDegree, dirWord, BORDER_GAP, DEFAULT_SPAN,
} from "../dist/scripts/structure.js";
import { parseCoord, neighborPath, ALL_DIRECTIONS } from "../dist/scripts/coords.js";

const SPAN = [1, 10];

test("rollTargetRooms respects band bounds and edges", () => {
    assert.equal(rollTargetRooms("school", 0), 18);
    assert.equal(rollTargetRooms("school", 0.999), 24);
    assert.equal(rollTargetRooms("standard", 0), 40);
    assert.equal(rollTargetRooms("standard", 0.999), 60);
    assert.equal(rollTargetRooms("epic", 0), 90);
    assert.equal(rollTargetRooms("epic", 0.999), 110);
    // unknown band falls back to standard
    assert.equal(rollTargetRooms("bogus", 0), 40);
});

test("landmarkCount: floor 2, cap 8, ~12 rooms per sector", () => {
    assert.equal(landmarkCount(20), 2);
    assert.equal(landmarkCount(50), 4);
    assert.equal(landmarkCount(60), 5);
    assert.equal(landmarkCount(100), 8);
    assert.equal(landmarkCount(110), 8); // capped (round(110/12) = 9)
    assert.equal(landmarkCount(8), 2);   // floored
});

test("envelopeFactor: full inside 0.7R, linear to 0 at R, z costs extra", () => {
    const R = 10;
    assert.equal(envelopeFactor(0, 0, 0, R), 1);
    assert.equal(envelopeFactor(7, 0, 0, R), 1);           // exactly at the knee
    assert.equal(envelopeFactor(10, 0, 0, R), 0);          // at R
    assert.equal(envelopeFactor(12, 0, 0, R), 0);          // beyond R
    const mid = envelopeFactor(8.5, 0, 0, R);
    assert.ok(mid > 0.49 && mid < 0.51, `expected ~0.5 at midpoint, got ${mid}`);
    // one z-level costs 2.5 horizontal units
    assert.equal(envelopeFactor(0, 0, 1, R), 1);
    assert.ok(envelopeFactor(6, 0, 1, R) < 1);             // 6 + 2.5 = 8.5 -> decaying
});

test("placeLandmarks: deterministic, distinct cells, never entry, inside the knee", () => {
    for (const target of [20, 50, 100]) {
        const a = placeLandmarks(777, target);
        const b = placeLandmarks(777, target);
        assert.deepEqual(a, b);
        assert.equal(a.length, landmarkCount(target));
        const R = radiusFor(target);
        const seen = new Set();
        for (const l of a) {
            const key = l.x + "," + l.y;
            assert.ok(!seen.has(key), "landmark cells must be distinct");
            seen.add(key);
            assert.ok(!(l.x === 0 && l.y === 0), "landmark never on entry");
            assert.equal(l.z, 0);
            assert.ok(envelopeFactor(l.x, l.y, 0, R) > 0, "landmark inside the envelope");
        }
    }
});

test("sectorOf: nearest landmark wins, gap measures the border", () => {
    const landmarks = [
        { index: 0, x: 4, y: 0, z: 0 },
        { index: 1, x: -4, y: 0, z: 0 },
    ];
    assert.equal(sectorOf(landmarks, 3, 0).index, 0);
    assert.equal(sectorOf(landmarks, -3, 0).index, 1);
    const mid = sectorOf(landmarks, 0, 0);
    assert.ok(mid.gap < BORDER_GAP, "equidistant cell is a border room");
    assert.ok(sectorOf(landmarks, 4, 0).gap > BORDER_GAP, "cell at a landmark is interior");
});

test("edge reciprocity: edgeExists(a,b) === edgeExists(b,a) everywhere", () => {
    const target = 50;
    const R = radiusFor(target);
    const landmarks = placeLandmarks(31337, target);
    const roads = roadEdges(landmarks);
    let checked = 0;
    for (let x = -6; x <= 6; x++) {
        for (let y = -6; y <= 6; y++) {
            for (let z = -1; z <= 1; z++) {
                const a = `${x},${y},${z}`;
                for (const dir of ALL_DIRECTIONS) {
                    const b = neighborPath(a, dir);
                    assert.equal(
                        edgeExists(31337, R, roads, a, b, SPAN),
                        edgeExists(31337, R, roads, b, a, SPAN),
                        `reciprocity broke on ${a} <-> ${b}`
                    );
                    checked++;
                }
            }
        }
    }
    assert.ok(checked > 1000);
});

test("every landmark is reachable from entry (roads by construction)", () => {
    for (let seed = 1; seed <= 30; seed++) {
        for (const target of [20, 50, 100]) {
            const s = computeStructure(seed * 1000003, target);
            const roomSet = new Set(s.rooms);
            for (const l of s.landmarks) {
                assert.ok(
                    roomSet.has(landmarkPath(l)),
                    `seed ${seed} target ${target}: landmark ${l.index} at ${landmarkPath(l)} unreachable`
                );
            }
        }
    }
});

test("envelope closure: every reachable room sits strictly inside R", () => {
    for (const seed of [42, 999, 123456]) {
        const s = computeStructure(seed, 50);
        for (const p of s.rooms) {
            const c = parseCoord(p);
            assert.ok(envelopeFactor(c[0], c[1], c[2], s.radius) > 0, `${p} escaped the envelope`);
        }
    }
});

test("size bands calibrate: medians near target, strictly ordered", () => {
    const medians = {};
    for (const [band, target] of [["school", 21], ["standard", 50], ["epic", 100]]) {
        const counts = [];
        for (let i = 0; i < 40; i++) {
            counts.push(computeStructure(i * 7919 + 13, target).rooms.length);
        }
        counts.sort((a, b) => a - b);
        const median = counts[20];
        medians[band] = median;
        assert.ok(
            median >= target * 0.65 && median <= target * 1.45,
            `${band}: median ${median} outside 65%-145% of target ${target} (min ${counts[0]}, max ${counts[39]})`
        );
    }
    assert.ok(medians.school < medians.standard, "school < standard");
    assert.ok(medians.standard < medians.epic, "standard < epic");
});

test("vertical edges are scarce (descent is an event, not noise)", () => {
    let vertical = 0;
    let total = 0;
    for (const seed of [5, 55, 555]) {
        const s = computeStructure(seed, 50);
        const roomSet = new Set(s.rooms);
        for (const p of s.rooms) {
            for (const dir of ["north", "east", "up"]) { // one canonical direction per axis pair
                const n = neighborPath(p, dir);
                if (!roomSet.has(n)) { continue; }
                if (edgeExists(seed, s.radius, s.roads, p, n, SPAN)) {
                    total++;
                    if (dir === "up") { vertical++; }
                }
            }
        }
    }
    assert.ok(total > 100, `graph too small to judge (${total} edges)`);
    const frac = vertical / total;
    assert.ok(frac < 0.08, `vertical fraction ${(frac * 100).toFixed(1)}% >= 8%`);
});

test("degree stats: mean 2.0-3.2, rim rooms dead-endier than the interior", () => {
    let interiorSum = 0, interiorN = 0, rimSum = 0, rimN = 0;
    for (const seed of [11, 222, 3333, 44444]) {
        const s = computeStructure(seed, 50);
        const roomSet = new Set(s.rooms);
        for (const p of s.rooms) {
            let deg = 0;
            for (const dir of ALL_DIRECTIONS) {
                const n = neighborPath(p, dir);
                if (roomSet.has(n) && edgeExists(seed, s.radius, s.roads, p, n, SPAN)) { deg++; }
            }
            const c = parseCoord(p);
            if (envelopeFactor(c[0], c[1], c[2], s.radius) >= 1) {
                interiorSum += deg; interiorN++;
            } else {
                rimSum += deg; rimN++;
            }
        }
    }
    const interiorMean = interiorSum / interiorN;
    const rimMean = rimSum / rimN;
    const overall = (interiorSum + rimSum) / (interiorN + rimN);
    assert.ok(overall >= 2.0 && overall <= 3.2, `overall mean degree ${overall.toFixed(2)} outside 2.0-3.2`);
    assert.ok(rimMean < interiorMean, `rim mean ${rimMean.toFixed(2)} not below interior mean ${interiorMean.toFixed(2)}`);
});

test("computeStructure is deterministic (same seed -> deep-equal)", () => {
    const a = computeStructure(987654321, 50);
    const b = computeStructure(987654321, 50);
    assert.deepEqual(a.rooms, b.rooms);
    assert.deepEqual(a.landmarks, b.landmarks);
    assert.deepEqual([...a.roads].sort(), [...b.roads].sort());
});

test("pureDegree is stable and within span", () => {
    for (let i = 0; i < 200; i++) {
        const d = pureDegree(42, `${i},0,0`, SPAN);
        assert.equal(d, pureDegree(42, `${i},0,0`, SPAN));
        assert.ok(d >= 1 && d <= 10);
    }
    // depth biases upward on average
    let shallow = 0, deep = 0;
    for (let i = 0; i < 300; i++) {
        shallow += pureDegree(7, `${i},0,0`, SPAN);
        deep += pureDegree(7, `${i},0,-6`, SPAN);
    }
    assert.ok(deep > shallow, "descent should re-weight the degree distribution up");
});

test("dirWord: octants, vertical, and self", () => {
    assert.equal(dirWord("0,0,0", "5,1,0"), "east");
    assert.equal(dirWord("0,0,0", "-5,-1,0"), "west");
    assert.equal(dirWord("0,0,0", "1,5,0"), "north");
    assert.equal(dirWord("0,0,0", "0,-3,0"), "south");
    assert.equal(dirWord("0,0,0", "2,2,0"), "northeast");
    assert.equal(dirWord("0,0,0", "-3,2,0"), "northwest");
    assert.equal(dirWord("0,0,0", "3,-2,0"), "southeast");
    assert.equal(dirWord("0,0,0", "-2,-2,0"), "southwest");
    assert.equal(dirWord("0,0,0", "0,0,-1"), "below");
    assert.equal(dirWord("0,0,0", "0,0,2"), "above");
    assert.equal(dirWord("1,1,0", "1,1,0"), "");
});

test("edgeKey is canonical and roads force edges", () => {
    assert.equal(edgeKey("0,0,0", "0,1,0"), edgeKey("0,1,0", "0,0,0"));
    const landmarks = placeLandmarks(1, 50);
    const roads = roadEdges(landmarks);
    assert.ok(roads.size > 0);
    // every road edge exists regardless of the hash draw
    const R = radiusFor(50);
    for (const key of roads) {
        const [a, b] = key.split("|");
        assert.equal(edgeExists(1, R, roads, a, b, SPAN), true, `road edge ${key} must be forced`);
    }
});
