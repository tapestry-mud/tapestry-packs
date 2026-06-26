import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSixAxisTable } from "../dist/scripts/six-axis.js";
import { composeAxes, composeFor, composeRoomProse } from "../dist/scripts/room-compose.js";
import { splitmix64 } from "../dist/scripts/prng.js";

const ROOM1 = {
    table: "ROOM-1", axis: "DEGREE", name: "x", dice: "1d10", degree: "d",
    bands: [
        { min: 1, max: 2, band: "transit", effect: "thin", fires: "ROOM-2" },
        { min: 3, max: 5, band: "chamber", effect: "featured", fires: "ROOM-2" },
        { min: 6, max: 7, band: "charged", effect: "hazard", fires: "ROOM-4" },
        { min: 8, max: 9, band: "landmark", effect: "named", fires: "ROOM-5" },
        { min: 10, max: 10, band: "threshold", effect: "boss", fires: "ROOM-6" },
    ],
};
const ROOM2 = {
    table: "ROOM-2", axis: "DRESSING", name: "x",
    subtables: {
        openers: ["The tunnel opens into a wider dark."],
        details: ["Pale roots grope down from the ceiling."],
        atmosphere: ["The air is damp and tastes of cold iron."],
    },
};

test("composeAxes is generic - resolves a named degree table, null when absent", () => {
    const tables = { "ROOM-1": parseSixAxisTable(ROOM1) };
    assert.equal(composeAxes(tables, "ROOM-1", 4).band.band, "chamber");
    assert.equal(composeAxes(tables, "CMB-1", 4), null); // unknown table id -> null
});

test("rooms composer maps the resolved band to spawn density (never threshold from depth)", () => {
    const tables = { "ROOM-1": parseSixAxisTable(ROOM1) };
    // Shallow: low bias -> transit/chamber band, low density.
    const shallow = composeFor("rooms", tables, { depth: 0, pressure: 0, rng: splitmix64(5) });
    assert.ok(["transit", "chamber", "charged", "landmark"].indexOf(shallow.band) !== -1);
    assert.notEqual(shallow.band, "threshold"); // depth never auto-selects threshold
    assert.ok(shallow.spawnDensity >= 0 && shallow.spawnDensity <= 2);
});

test("rooms composer returns null when ROOM-1 absent (flat fallback signal)", () => {
    assert.equal(composeFor("rooms", {}, { depth: 0, pressure: 0, rng: splitmix64(1) }), null);
});

test("composeRoomProse composes ROOM-2 fragments (banded prose, not flat)", () => {
    const tables = { "ROOM-2": parseSixAxisTable(ROOM2) };
    const prose = composeRoomProse(tables, splitmix64(9));
    assert.ok(prose.indexOf("wider dark") !== -1);
    assert.ok(prose.indexOf("cold iron") !== -1);
    assert.equal(composeRoomProse({}, splitmix64(9)), ""); // no ROOM-2 -> empty (caller falls back)
});
