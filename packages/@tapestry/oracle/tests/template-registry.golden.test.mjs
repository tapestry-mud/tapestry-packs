// Codec gate. template-registry.ts imports @tapestry/engine but calls nothing at module
// load, so the stub in node_modules/@tapestry/engine satisfies the import. Run after
// `npm run build`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeTemplates, decodeTemplates } from "../dist/scripts/template-registry.js";

const SAMPLE = {
    templateId: "week-1a2b3c4d", name: "The Drowned Keep", seed: 439041741,
    bandFloor: 1, bandCap: 10, sizeBand: "standard", bakedSetId: "baked-0",
    state: "draft", deathMode: "grind",
};

test("template survives an encode/decode round trip", () => {
    const table = encodeTemplates([SAMPLE]);
    const back = decodeTemplates(table.entries);
    assert.deepEqual(back, [SAMPLE]);
});

test("decode tolerates an empty table", () => {
    assert.deepEqual(decodeTemplates([]), []);
});

test("encode tags the table with the template kind", () => {
    const table = encodeTemplates([SAMPLE]);
    assert.equal(table.kind, "template");
});

test("encode preserves insertion order across multiple templates", () => {
    const second = Object.assign({}, SAMPLE, { templateId: "week-9f8e7d6c", name: "The Sunken Reach" });
    const table = encodeTemplates([SAMPLE, second]);
    const back = decodeTemplates(table.entries);
    assert.equal(back[0].templateId, "week-1a2b3c4d");
    assert.equal(back[1].templateId, "week-9f8e7d6c");
});

test("decode skips a corrupt row instead of throwing", () => {
    const table = encodeTemplates([SAMPLE]);
    const corrupt = [{ w: 10, id: "bad", name: "bad", desc: "{not json" }].concat(table.entries);
    const back = decodeTemplates(corrupt);
    assert.deepEqual(back, [SAMPLE]);
});

test("decode skips a row with no desc field", () => {
    const back = decodeTemplates([{ w: 10, id: "empty", name: "empty" }]);
    assert.deepEqual(back, []);
});
