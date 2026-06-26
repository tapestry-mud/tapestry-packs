import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSixAxisTable } from "../dist/scripts/six-axis.js";
import { lifespanFor } from "../dist/scripts/consequence-hooks.js";

const ROOM3 = {
    table: "ROOM-3", axis: "CONSEQUENCE", name: "x",
    tiers: {
        minor: [{ id: "looted", effect: "e", lifespan: "ephemeral" }],
        severe: [{ id: "collapsed", effect: "e", lifespan: "succession-seed" },
                 { id: "boss-slain", effect: "e", lifespan: "persistent" }],
    },
};

test("lifespanFor reads the lifespan tag from ROOM-3", () => {
    const tables = { "ROOM-3": parseSixAxisTable(ROOM3) };
    assert.equal(lifespanFor(tables, "looted"), "ephemeral");
    assert.equal(lifespanFor(tables, "boss-slain"), "persistent");
    assert.equal(lifespanFor(tables, "collapsed"), "succession-seed");
    assert.equal(lifespanFor(tables, "unknown"), "ephemeral"); // safe default
});

test("lifespanFor falls back to the builtin map when ROOM-3 is absent", () => {
    assert.equal(lifespanFor({}, "boss-slain"), "persistent");   // no tables in memory
    assert.equal(lifespanFor({}, "collapsed"), "succession-seed");
    assert.equal(lifespanFor({}, "looted"), "ephemeral");
});
