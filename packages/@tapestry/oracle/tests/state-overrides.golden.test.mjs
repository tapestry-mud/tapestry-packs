import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSixAxisTable } from "../dist/scripts/six-axis.js";
import { applyStateOverrides } from "../dist/scripts/room-compose.js";

const ROOM2 = {
    table: "ROOM-2", axis: "DRESSING", name: "x",
    subtables: {
        openers: ["The tunnel opens into a wider dark."],
        state_overrides: {
            looted: ["The vein is a spray of shards now, picked clean."],
            collapsed: ["A fall of rock has closed half the chamber."],
        },
    },
};

test("applyStateOverrides appends override fragments for stamped kinds", () => {
    const d = parseSixAxisTable(ROOM2);
    const out = applyStateOverrides("A cavern.", d, ["looted"]);
    assert.equal(out, "A cavern. The vein is a spray of shards now, picked clean.");
});

test("applyStateOverrides applies multiple kinds deterministically and ignores unknowns", () => {
    const d = parseSixAxisTable(ROOM2);
    const out = applyStateOverrides("A cavern.", d, ["looted", "collapsed", "haunted"]);
    assert.equal(out,
        "A cavern. The vein is a spray of shards now, picked clean. A fall of rock has closed half the chamber.");
});

test("applyStateOverrides returns base prose when nothing matches", () => {
    const d = parseSixAxisTable(ROOM2);
    assert.equal(applyStateOverrides("A cavern.", d, []), "A cavern.");
    assert.equal(applyStateOverrides("A cavern.", d, ["nope"]), "A cavern.");
});

test("applyStateOverrides over an empty base yields just the scar line (trim) - the revisit-send form", () => {
    const d = parseSixAxisTable(ROOM2);
    assert.equal(applyStateOverrides("", d, ["looted"]).trim(),
        "The vein is a spray of shards now, picked clean.");
    assert.equal(applyStateOverrides("", undefined, ["looted"]).trim(), ""); // no ROOM-2 -> empty
});
