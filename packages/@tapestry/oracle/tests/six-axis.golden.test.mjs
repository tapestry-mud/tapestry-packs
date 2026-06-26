// Pure six-axis parse/resolve tests (zero CLR/Jint values; plain JS literals only).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSixAxisTable } from "../dist/scripts/six-axis.js";

const ROOM1 = {
    table: "ROOM-1", axis: "DEGREE", name: "Room Outcome (Underdeep)",
    dice: "1d10", degree: "D = depth + pressure - safety",
    bands: [
        { min: 1, max: 2, band: "transit", effect: "thin", fires: "ROOM-2" },
        { min: 3, max: 5, band: "chamber", effect: "featured", fires: "ROOM-2" },
        { min: 10, max: 10, band: "threshold", effect: "boss", fires: "ROOM-6" },
    ],
};

const ROOM3 = {
    table: "ROOM-3", axis: "CONSEQUENCE", name: "Room State (Underdeep)",
    tiers: {
        minor: [{ id: "looted", effect: "picked clean", lifespan: "ephemeral" }],
        severe: [{ id: "collapsed", effect: "cave-in", lifespan: "succession-seed" }],
    },
};

test("parseSixAxisTable normalizes a DEGREE table and coerces band numbers", () => {
    const t = parseSixAxisTable(ROOM1);
    assert.equal(t.id, "ROOM-1");
    assert.equal(t.axis, "DEGREE");
    assert.equal(t.dice, "1d10");
    assert.equal(t.bands.length, 3);
    assert.equal(t.bands[0].min, 1);
    assert.equal(t.bands[2].band, "threshold");
});

test("parseSixAxisTable flattens CONSEQUENCE tiers into a flat list with tier+lifespan", () => {
    const t = parseSixAxisTable(ROOM3);
    assert.equal(t.axis, "CONSEQUENCE");
    assert.equal(t.consequences.length, 2);
    const looted = t.consequences.find((c) => c.id === "looted");
    assert.equal(looted.tier, "minor");
    assert.equal(looted.lifespan, "ephemeral");
    const collapsed = t.consequences.find((c) => c.id === "collapsed");
    assert.equal(collapsed.lifespan, "succession-seed");
});

test("parseSixAxisTable throws on a missing or invalid axis", () => {
    assert.throws(() => parseSixAxisTable({ table: "X", name: "no axis" }), /axis/);
    assert.throws(() => parseSixAxisTable({ table: "X", axis: "BOGUS", name: "bad" }), /axis/);
});
