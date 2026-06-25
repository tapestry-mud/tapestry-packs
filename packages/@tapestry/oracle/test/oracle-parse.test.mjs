import { test } from "node:test";
import assert from "node:assert/strict";
import { parseList, parsePipeLines, pushLines, slug } from "../dist/scripts/oracle-parse.js";

test("parseList strips a leading preamble line", () => {
    // An 8B often answers "Here are 5 places: hall, pantry, ...".
    const out = parseList("Here are 5 common places: hall, pantry, cellar");
    assert.deepEqual(out, ["hall", "pantry", "cellar"]);
});

// MAJOR 4: the strip must be phrasing-agnostic, not keyed on the literal word "here".
test("parseList strips a 'Common places:' lead-in (no 'here')", () => {
    const out = parseList("Common places: hall, pantry, cellar");
    assert.deepEqual(out, ["hall", "pantry", "cellar"]);
});

test("parseList strips an 'Options:' lead-in", () => {
    const out = parseList("Options: hall, pantry, cellar");
    assert.deepEqual(out, ["hall", "pantry", "cellar"]);
});

test("parseList strips a 'Sure!' interjection with no colon", () => {
    const out = parseList("Sure! hall, pantry, cellar");
    assert.deepEqual(out, ["hall", "pantry", "cellar"]);
});

test("parseList preserves a clean comma list with no lead-in", () => {
    const out = parseList("hall, pantry, cellar");
    assert.deepEqual(out, ["hall", "pantry", "cellar"]);
});

test("parseList strips numbering prefixes", () => {
    const out = parseList("1. hall, 2. pantry, 3. cellar");
    assert.deepEqual(out, ["hall", "pantry", "cellar"]);
});

test("parsePipeLines strips a preamble line and numbered prefixes for mobs", () => {
    const raw = [
        "Here are 5 common foes:",
        "1. Angry Cook | A red-faced cook.",
        "2. Scullion | A soot-streaked pot-scrubber.",
    ].join("\n");
    const out = parsePipeLines(raw, "mob", false);
    assert.equal(out.length, 2);
    assert.equal(out[0].name, "Angry Cook");
    assert.equal(out[0].id, "angry-cook");
    assert.equal(out[1].name, "Scullion");
});

test("parsePipeLines drops junk rows (empty or punctuation-only name)", () => {
    const raw = [
        "Angry Cook | A red-faced cook.",
        " | orphaned desc",
        "--- | ---",
    ].join("\n");
    const out = parsePipeLines(raw, "mob", false);
    assert.equal(out.length, 1);
    assert.equal(out[0].name, "Angry Cook");
});

test("parsePipeLines caps an over-long fragment", () => {
    const longName = "x".repeat(300);
    const out = parsePipeLines(longName + " | desc", "mob", false);
    assert.equal(out.length, 1);
    assert.ok(out[0].name.length <= 120);
});

test("pushLines strips a preamble and numbering", () => {
    const out = [];
    pushLines(out, "Here are some openers:\n1. The air is still.\n2. Dust drifts.", "opener");
    assert.equal(out.length, 2);
    assert.equal(out[0].desc, "The air is still.");
    assert.equal(out[1].desc, "Dust drifts.");
});

test("slug is unchanged for clean input", () => {
    assert.equal(slug("Angry Cook"), "angry-cook");
});
