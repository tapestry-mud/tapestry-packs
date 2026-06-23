// oracle-tables golden tests - pure parser helpers only (no engine, no LLM).
// Run: node --test tests/oracle-tables.golden.test.mjs  (run after npm run build)
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseList, parsePipeLines, slug } from "../dist/scripts/oracle-tables.js";

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

test("parseList trims and caps at 8", () => {
    assert.deepEqual(parseList("hearth, pantry , walk-in freezer"), ["hearth", "pantry", "walk-in freezer"]);
});

test("parseList returns empty array on null", () => {
    assert.deepEqual(parseList(null), []);
});

test("parseList caps at 8 entries", () => {
    const raw = "a,b,c,d,e,f,g,h,i,j";
    assert.equal(parseList(raw).length, 8);
});

test("parsePipeLines weights items by rarity", () => {
    const raw = "Dented Ladle | battered | common\nMasterwork Ladle | heavy | rare";
    const entries = parsePipeLines(raw, "weapon", true);
    assert.equal(entries[0].rarity, "common");
    assert.equal(entries[0].w, 60);
    assert.equal(entries[1].rarity, "rare");
    assert.equal(entries[1].w, 8);
});

test("parsePipeLines defaults unknown rarity to common", () => {
    const raw = "Widget | desc | legendary | weapon";
    const entries = parsePipeLines(raw, "weapon", true);
    assert.equal(entries[0].rarity, "common");
    assert.equal(entries[0].w, 60);
});

test("parsePipeLines sets balance_ref from kind field for items", () => {
    const raw = "Iron Cap | heavy | common | armor\nShort Sword | sharp | common | weapon";
    const entries = parsePipeLines(raw, "weapon", true);
    assert.equal(entries[0].balance_ref, "armor");
    assert.equal(entries[1].balance_ref, "weapon");
});

test("parsePipeLines uses defaultBalanceRef for non-items", () => {
    const raw = "goblin | a small green creature\ntroll | a large grey creature";
    const entries = parsePipeLines(raw, "mob", false);
    assert.equal(entries[0].balance_ref, "mob");
    assert.equal(entries[1].balance_ref, "mob");
    assert.equal(entries[0].rarity, undefined);
});

test("parsePipeLines skips lines with no pipe", () => {
    const raw = "no pipe here\ngoblin | desc";
    const entries = parsePipeLines(raw, "mob", false);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].name, "goblin");
});

test("parsePipeLines returns empty array on null", () => {
    assert.deepEqual(parsePipeLines(null, "mob", false), []);
});

test("parsePipeLines id is slugified name", () => {
    const raw = "Cave Troll | lumbers slowly";
    const entries = parsePipeLines(raw, "mob", false);
    assert.equal(entries[0].id, "cave-troll");
});

test("parsePipeLines weight is 50 for non-items", () => {
    const raw = "goblin | small | common | weapon";
    const entries = parsePipeLines(raw, "mob", false);
    assert.equal(entries[0].w, 50);
});
