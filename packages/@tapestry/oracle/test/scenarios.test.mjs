import { test } from "node:test";
import assert from "node:assert/strict";
import { buildScenarios } from "../dist/scripts/scenarios.js";

test("six-axis theme uses its own baked set when one exists", () => {
  const s = buildScenarios(["endless-underdeep"], ["test-kitchen", "endless-underdeep"]);
  const banded = s.find((x) => x.id === "endless-underdeep");
  assert.equal(banded.bakedSet, "endless-underdeep");
});

test("a baked set that is also a theme is not offered as a duplicate flat scenario", () => {
  const s = buildScenarios(["endless-underdeep"], ["test-kitchen", "endless-underdeep"]);
  assert.equal(s.filter((x) => x.id === "flat:endless-underdeep").length, 0);
  assert.equal(s.filter((x) => x.id === "flat:test-kitchen").length, 1);
});

test("a theme without a matching baked set falls back to the first baked set", () => {
  const s = buildScenarios(["sunken-ship"], ["test-kitchen"]);
  assert.equal(s.find((x) => x.id === "sunken-ship").bakedSet, "test-kitchen");
});
