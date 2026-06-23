import { test } from "node:test";
import assert from "node:assert/strict";
import { rollEntry, shouldReuse } from "../dist/scripts/resolver.js";
import { splitmix64 } from "../dist/scripts/prng.js";

test("rollEntry is deterministic AND returns a real entry (not undefined)", () => {
  const entries = [
    { w: 60, id: "a", name: "A" },
    { w: 40, id: "b", name: "B" },
  ];
  const r1 = rollEntry(entries, splitmix64(12345));
  const r2 = rollEntry(entries, splitmix64(12345));
  assert.ok(r1 !== undefined && ["a", "b"].includes(r1.id));  // guards the double-unwrap regression
  assert.equal(r1.id, r2.id);
});

test("shouldReuse never reuses when nothing minted yet", () => {
  assert.equal(shouldReuse(0, splitmix64(1)), false);
  assert.equal(shouldReuse(0, splitmix64(999)), false);
});

test("shouldReuse can reuse once instances exist", () => {
  // Across many seeds, some reuse and some mint -> both branches reachable.
  let reuse = 0;
  for (let i = 0; i < 50; i++) {
    if (shouldReuse(3, splitmix64(i + 1))) { reuse++; }
  }
  assert.ok(reuse > 0 && reuse < 50);
});
