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
            assert.ok(rec.name.length > 0 && rec.desc.length > 40);
            assert.equal(rec.afars.length, 3, `${setId}/${rec.name} needs 3 afar variants`);
            for (const af of rec.afars) {
                assert.ok(af.length > 10, `short afar on ${rec.name}: ${af}`);
                assert.ok(!/\b(north|south|east|west|exit|exits)\b/i.test(af), `direction talk in afar of ${rec.name}`);
            }
            assert.ok(rec.bossName.startsWith("the "), `${setId}/${rec.name} miniboss title: ${rec.bossName}`);
            assert.ok(rec.bossDesc.length > 10, `${setId}/${rec.name} miniboss desc`);
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
    const allQuals = [];
    for (const s of sectors) {
        assert.equal(s.qualifiers.length, 2, "each synthesized sector deals 2 qualifiers");
        allQuals.push(...s.qualifiers);
    }
    assert.equal(new Set(allQuals).size, 2 * k, "sector qualifier decks distinct");
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
    assert.deepEqual(sectors[0].qualifiers, ["gilded"], "0.4.0-style single-qual row survives");
    assert.deepEqual(sectors[0].openers, ["Real LLM line."]);
    assert.ok(sectors[1].openers.length > 0, "hole synthesized");
});

test("REGRESSION: normalizeTables never mutates the baked cache across runs", () => {
    // First run: school-sized k=2 truncates its own landmark view.
    const firstRun = normalizeTables(bakedTables("test-kitchen"), 2, 424242);
    assert.equal(parseLandmarksTable(kindOf(firstRun, "landmarks").entries).length, 2);
    // Second run in the same session: the full 8-record deck must still be there.
    const second = bakedTables("test-kitchen");
    const deck = parseLandmarksTable(kindOf(second, "landmarks").entries);
    assert.equal(deck.length, 8, "baked landmark deck was mutated by a prior normalize");
    const normalized = normalizeTables(second, 5, 777001);
    const names = parseLandmarksTable(kindOf(normalized, "landmarks").entries).map((l) => l.name);
    assert.deepEqual(names, ["great hearth", "butcher block", "walk-in freezer", "spice vault", "scullery falls"],
        "k=5 run must draw all five from the authored deck, not the fallback");
});
