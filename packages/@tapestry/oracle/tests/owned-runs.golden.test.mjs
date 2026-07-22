// Codec gate. owned-runs.ts imports @tapestry/engine but calls nothing at module load,
// so the stub in node_modules/@tapestry/engine satisfies the import. Run after `npm run build`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeOwnedRuns, encodeOwnedRuns } from "../dist/scripts/owned-runs.js";

const RUN = {
    areaId: "oracle-run-3f2a",
    name: "the Ashen Hollow",
    levelRange: [1, 5],
    roomCount: 42,
    seed: 16170,
    packName: "@scratch/oracle-run",
};

test("encode then decode round-trips a run", () => {
    const decoded = decodeOwnedRuns(encodeOwnedRuns([RUN]));
    assert.deepEqual(decoded, [RUN]);
});

test("encode preserves insertion order", () => {
    const second = Object.assign({}, RUN, { areaId: "oracle-run-9c1d", name: "the Sunken Reach" });
    const decoded = decodeOwnedRuns(encodeOwnedRuns([RUN, second]));
    assert.equal(decoded[0].areaId, "oracle-run-3f2a");
    assert.equal(decoded[1].areaId, "oracle-run-9c1d");
});

test("decode is tolerant: null, empty, garbage, and non-array all yield []", () => {
    assert.deepEqual(decodeOwnedRuns(null), []);
    assert.deepEqual(decodeOwnedRuns(undefined), []);
    assert.deepEqual(decodeOwnedRuns(""), []);
    assert.deepEqual(decodeOwnedRuns("not json"), []);
    assert.deepEqual(decodeOwnedRuns("{}"), []);
    assert.deepEqual(decodeOwnedRuns("[1,2,3]"), []);
});

test("decode drops records with no areaId and repairs missing fields", () => {
    const raw = JSON.stringify([
        { name: "orphan" },
        { areaId: "oracle-run-3f2a" },
    ]);
    const decoded = decodeOwnedRuns(raw);
    assert.equal(decoded.length, 1);
    assert.equal(decoded[0].areaId, "oracle-run-3f2a");
    assert.equal(decoded[0].name, "oracle-run-3f2a"); // falls back to the id
    assert.deepEqual(decoded[0].levelRange, [0, 0]);
    assert.equal(decoded[0].roomCount, 0);
    assert.equal(decoded[0].seed, 0);
    assert.equal(decoded[0].packName, "");
});

test("encode output is strict 7-bit ASCII", () => {
    const s = encodeOwnedRuns([RUN]);
    for (let i = 0; i < s.length; i++) {
        assert.ok(s.charCodeAt(i) >= 32 && s.charCodeAt(i) <= 126);
    }
});
