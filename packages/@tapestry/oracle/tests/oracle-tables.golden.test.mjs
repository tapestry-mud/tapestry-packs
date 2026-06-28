// oracle-tables golden tests - slug only (the parser moved to oracle-structured.ts;
// its mapping is golden-tested in test/oracle-structured.test.mjs). slug is still
// re-exported from oracle-tables.
// Run: node --test tests/oracle-tables.golden.test.mjs  (run after npm run build)
import { test } from "node:test";
import assert from "node:assert/strict";
import { slug } from "../dist/scripts/oracle-tables.js";

test("slug normalizes to ascii kebab", () => {
    assert.equal(slug("Masterwork Ladle!"), "masterwork-ladle");
});

test("slug falls back to 'item' on empty result", () => {
    assert.equal(slug("!!!"), "item");
});

test("slug caps at 40 chars", () => {
    const long = "a".repeat(50);
    assert.equal(slug(long).length, 40);
});
