import { test } from "node:test";
import assert from "node:assert/strict";
import { pickFragments } from "../dist/scripts/prose-compose.js";
import { splitmix64 } from "../dist/scripts/prng.js";

test("pickFragments is deterministic and joins opener+detail+atmosphere", () => {
  const entries = [
    { w: 10, id: "opener-0", name: "opener", desc: "A cold hall." },
    { w: 10, id: "opener-1", name: "opener", desc: "A dim hall." },
    { w: 10, id: "detail-0", name: "detail", desc: "Soot on the walls." },
    { w: 10, id: "atmosphere-0", name: "atmosphere", desc: "It is silent." },
  ];
  const a = pickFragments(entries, splitmix64(42));
  const b = pickFragments(entries, splitmix64(42));
  assert.equal(a, b);
  assert.ok(a.includes("Soot on the walls."));
  assert.ok(a.includes("It is silent."));
});

test("pickFragments returns fallback when entries are empty", () => {
  const result = pickFragments([], splitmix64(1));
  assert.equal(result, "A plain space.");
});

test("pickFragments uses only available fragment types", () => {
  const entries = [
    { w: 10, id: "opener-0", name: "opener", desc: "A vast chamber." },
  ];
  const result = pickFragments(entries, splitmix64(7));
  assert.equal(result, "A vast chamber.");
});

test("pickFragments output is strict 7-bit ASCII", () => {
  const entries = [
    { w: 10, id: "opener-0", name: "opener", desc: "A cold hall." },
    { w: 10, id: "detail-0", name: "detail", desc: "Soot on the walls." },
    { w: 10, id: "atmosphere-0", name: "atmosphere", desc: "It is silent." },
  ];
  const result = pickFragments(entries, splitmix64(99));
  for (let i = 0; i < result.length; i++) {
    assert.ok(result.charCodeAt(i) < 128, `Non-ASCII char at index ${i}: ${result[i]}`);
  }
});
