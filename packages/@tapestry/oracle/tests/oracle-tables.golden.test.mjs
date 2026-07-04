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

// ---------------------------------------------------------------------------
// v3: normalizeTables + baked landmarks (the engine stub's data.loadYaml reads
// the real baked YAML, so bakedTables here exercises the true load path).
// ---------------------------------------------------------------------------
import { bakedTables, normalizeTables } from "../dist/scripts/oracle-tables.js";
import { parseLandmarksTable, parseSectorsTable } from "../dist/scripts/sector-compose.js";

function kindOf(tables, kind) {
    return tables.find((t) => t.kind === kind) || null;
}

test("bakedTables returns a landmarks table for both authored sets", () => {
    for (const setId of ["test-kitchen", "endless-underdeep"]) {
        const lm = kindOf(bakedTables(setId), "landmarks");
        assert.ok(lm, `${setId} missing landmarks table`);
        const parsed = parseLandmarksTable(lm.entries);
        assert.equal(parsed.length, 8, `${setId} deck must hold 8 records`);
        for (const rec of parsed) {
            assert.ok(rec.name.length > 0 && rec.desc.length > 40 && rec.afar.length > 10);
            assert.ok(!/\b(north|south|east|west|exit|exits)\b/i.test(rec.desc), `direction talk in ${rec.name}`);
        }
    }
});

test("normalizeTables guarantees k landmarks + k sectors from a bare baked set", () => {
    const k = 4;
    const normalized = normalizeTables(bakedTables("test-kitchen"), k, 12345);
    const lm = parseLandmarksTable(kindOf(normalized, "landmarks").entries);
    assert.equal(lm.length, k);
    const names = new Set(lm.map((l) => l.name.toLowerCase()));
    assert.equal(names.size, k, "landmark names distinct");
    const sectors = parseSectorsTable(kindOf(normalized, "sectors").entries);
    assert.equal(sectors.length, k);
    const quals = new Set(sectors.map((s) => s.qualifier));
    assert.equal(quals.size, k, "sector qualifiers distinct");
    for (const s of sectors) {
        assert.ok(s.openers.length >= 8, `synthesized sector pools should inherit the grown prose pool (got ${s.openers.length})`);
    }
    assert.ok(kindOf(normalized, "scars"), "scars guaranteed");
    assert.ok(kindOf(normalized, "prose"), "prose guaranteed");
    // determinism
    const again = normalizeTables(bakedTables("test-kitchen"), k, 12345);
    assert.deepEqual(kindOf(again, "sectors").entries, kindOf(normalized, "sectors").entries);
});

test("normalizeTables synthesizes everything from an empty table list", () => {
    const normalized = normalizeTables([], 3, 999);
    const lm = parseLandmarksTable(kindOf(normalized, "landmarks").entries);
    assert.equal(lm.length, 3);
    const sectors = parseSectorsTable(kindOf(normalized, "sectors").entries);
    assert.equal(sectors.length, 3);
    for (const s of sectors) {
        assert.ok(s.openers.length > 0, "sectors synthesize from the fallback prose");
    }
});

test("normalizeTables keeps a filled sector but replaces an empty one", () => {
    const filled = {
        kind: "sectors",
        entries: [
            { w: 10, id: "s0-qual", name: "qualifier", desc: "gilded" },
            { w: 10, id: "s0-opener-0", name: "opener", desc: "Real LLM line." },
        ],
    };
    const normalized = normalizeTables([filled], 2, 7);
    const sectors = parseSectorsTable(kindOf(normalized, "sectors").entries);
    assert.equal(sectors.length, 2);
    assert.equal(sectors[0].qualifier, "gilded");
    assert.deepEqual(sectors[0].openers, ["Real LLM line."]);
    assert.ok(sectors[1].openers.length > 0, "hole synthesized");
});
