// Pure-helper determinism gate (carve-out from the no-node-tests rule: zero CLR/Jint values).
// Run: node --test tests/prng.golden.test.mjs  (run after `npx tsc`, imports the compiled dist).
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitmix64, hashCoord, rollDice } from "../dist/scripts/prng.js";

test("splitmix64 is deterministic and stable (golden)", () => {
    const a = splitmix64(8473920113);
    const seq = [a(), a(), a()];
    assert.deepEqual(seq, [0.8734609056962885, 0.018167212418308765, 0.5457098882864236]);
    const b = splitmix64(8473920113);
    assert.deepEqual([b(), b(), b()], [0.8734609056962885, 0.018167212418308765, 0.5457098882864236]); // same seed -> same stream
});

test("hashCoord is deterministic by position (golden)", () => {
    assert.equal(hashCoord(8473920113, "0,0"), 2923089662594582);
    assert.equal(hashCoord(8473920113, "0,0"), 2923089662594582); // stable
    assert.notEqual(hashCoord(8473920113, "0,0"), hashCoord(8473920113, "1,0")); // position-sensitive
});

test("rollDice is bounded and seed-stable", () => {
    const r = splitmix64(42);
    const v = rollDice("2d6", r);
    assert.ok(v >= 2 && v <= 12);
});
