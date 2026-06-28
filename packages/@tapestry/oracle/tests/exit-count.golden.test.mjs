// exit-count golden test - the weighted exit-count distribution (the "sliding scale").
// Samples rollRoomFacts over many seeds and asserts the shape: bounded 1..6, most rooms
// 2-3, 6-exit hubs rare. Run after npm run build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rollRoomFacts } from "../dist/scripts/room-gen.js";

function sample(n) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  for (let i = 0; i < n; i++) {
    const facts = rollRoomFacts(12345, i + ",0,0", null, "cavern");
    const k = facts.exits.length;
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}

test("exit count is always 1..6 and never exceeds the 6 directions", () => {
  const c = sample(2000);
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  assert.equal(total, 2000);
  assert.equal(c[0] || 0, 0); // MIN_EXITS floor
  for (let k = 7; k < 12; k++) { assert.equal(c[k] || 0, 0); } // capped at the 6 dirs
});

test("most rooms have 2-3 exits and 6-exit hubs are rare", () => {
  const n = 4000;
  const c = sample(n);
  const twoThree = (c[2] + c[3]) / n;
  const fivePlus = (c[5] + c[6]) / n;
  assert.ok(twoThree > 0.55, `expected >55% 2-3 exits, got ${(twoThree * 100).toFixed(1)}%`);
  assert.ok(c[6] / n < 0.06, `expected <6% 6-exit rooms, got ${((c[6] / n) * 100).toFixed(1)}%`);
  assert.ok(fivePlus < 0.15, `expected <15% 5-6 exits, got ${(fivePlus * 100).toFixed(1)}%`);
});

test("rollRoomFacts is deterministic for the same seed+path", () => {
  const a = rollRoomFacts(999, "3,1,0", null, "cavern");
  const b = rollRoomFacts(999, "3,1,0", null, "cavern");
  assert.deepEqual(a.exits, b.exits);
});
