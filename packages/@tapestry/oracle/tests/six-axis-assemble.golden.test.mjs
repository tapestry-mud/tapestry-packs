// six-axis assembly golden tests - building a per-area ROOM-2 from frozen prose + scars.
// The shared ROOM-1/3 mechanics load from YAML at module init (verified at strict-boot +
// playtest, not here, since the node engine stub does not read YAML).
import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleRoom2, buildAreaSixAxis } from "../dist/scripts/six-axis.js";

test("assembleRoom2 builds subtables from prose and stateOverrides from scars", () => {
  const prose = [
    { name: "opener", desc: "The tent looms overhead." },
    { name: "detail", desc: "Sawdust covers the floor." },
    { name: "atmosphere", desc: "Calliope music drifts." },
    { name: "opener", desc: "Torn banners hang limp." },
  ];
  const scars = [
    { name: "looted", desc: "The booths are stripped bare." },
    { name: "boss-slain", desc: "The ringmaster lies still." },
  ];
  const room2 = assembleRoom2(prose, scars);
  assert.equal(room2.axis, "DRESSING");
  assert.deepEqual(room2.subtables.openers, ["The tent looms overhead.", "Torn banners hang limp."]);
  assert.deepEqual(room2.subtables.details, ["Sawdust covers the floor."]);
  assert.deepEqual(room2.subtables.atmosphere, ["Calliope music drifts."]);
  assert.deepEqual(room2.stateOverrides.looted, ["The booths are stripped bare."]);
  assert.deepEqual(room2.stateOverrides["boss-slain"], ["The ringmaster lies still."]);
});

test("assembleRoom2 tolerates empty/garbage input", () => {
  const room2 = assembleRoom2(null, undefined);
  assert.deepEqual(room2.subtables.openers, []);
  assert.deepEqual(room2.stateOverrides, {});
});

test("buildAreaSixAxis assembles ROOM-2 for a non-authored theme", () => {
  const six = buildAreaSixAxis("", [{ name: "opener", desc: "x" }], [{ name: "looted", desc: "y" }]);
  assert.ok(six["ROOM-2"], "ROOM-2 assembled");
  assert.deepEqual(six["ROOM-2"].subtables.openers, ["x"]);
  assert.deepEqual(six["ROOM-2"].stateOverrides.looted, ["y"]);
});
