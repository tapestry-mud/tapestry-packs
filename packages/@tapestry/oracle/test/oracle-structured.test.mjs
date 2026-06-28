import { test } from "node:test";
import assert from "node:assert/strict";
import {
  slug, mapPlaces, mapMobs, mapBoss, mapItems, mapProse,
  SCHEMA_MOBS, SCHEMA_ITEMS,
} from "../dist/scripts/oracle-structured.js";

test("mapMobs maps wrapped JSON to entries", () => {
  const raw = JSON.stringify({ mobs: [{ name: "Imp", desc: "small" }, { name: "Ogre", desc: "big" }] });
  const out = mapMobs(raw);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { w: 50, id: "imp", name: "Imp", desc: "small", balance_ref: "mob" });
});

test("mapMobs returns [] on malformed JSON", () => {
  assert.deepEqual(mapMobs("not json"), []);
  assert.deepEqual(mapMobs(null), []);
});

test("mapBoss takes the single record", () => {
  const out = mapBoss(JSON.stringify({ name: "Warden", desc: "guards" }));
  assert.equal(out.length, 1);
  assert.equal(out[0].balance_ref, "boss");
  assert.equal(out[0].w, 100);
});

test("mapItems normalizes rarity/kind and weights", () => {
  const raw = JSON.stringify({ items: [{ name: "Blade", desc: "sharp", rarity: "rare", kind: "weapon" }] });
  const out = mapItems(raw);
  assert.equal(out[0].rarity, "rare");
  assert.equal(out[0].balance_ref, "weapon");
  assert.equal(out[0].w, 8);
});

test("mapItems defaults junk rarity/kind", () => {
  const raw = JSON.stringify({ items: [{ name: "Thing", desc: "x", rarity: "???", kind: "???" }] });
  const out = mapItems(raw);
  assert.equal(out[0].rarity, "common");
  assert.equal(out[0].balance_ref, "weapon");
});

test("mapPlaces caps at 8 and drops junk", () => {
  const raw = JSON.stringify({ places: ["hall", "  ", "###", "nook"] });
  assert.deepEqual(mapPlaces(raw), ["hall", "nook"]);
});

test("mapProse tags fragments", () => {
  const out = mapProse(JSON.stringify({ lines: ["A still room.", "Dust hangs."] }), "opener");
  assert.deepEqual(out[0], { w: 10, id: "opener-0", name: "opener", desc: "A still room." });
  assert.equal(out[1].id, "opener-1");
});

test("asciiFold transliterates smart quotes and drops other non-ascii", () => {
  // Smart quotes -> straight quotes (the common real case); other non-ascii (accents) dropped,
  // matching the engine AsciiFold contract (transliterate quotes/dashes/ellipsis, drop the rest).
  const out = mapMobs(JSON.stringify({ mobs: [{ name: "Naïve “Boss”", desc: "café" }] }));
  assert.equal(out[0].name, 'Nave "Boss"');
  assert.equal(out[0].desc, "caf");
});

test("schemas are strict-valid JSON objects", () => {
  const m = JSON.parse(SCHEMA_MOBS);
  assert.equal(m.type, "object");
  assert.equal(m.additionalProperties, false);
  assert.deepEqual(m.required, ["mobs"]);
  const it = JSON.parse(SCHEMA_ITEMS);
  assert.deepEqual(it.properties.items.items.properties.rarity.enum, ["common", "uncommon", "rare", "epic"]);
});

test("slug kebabs and caps", () => {
  assert.equal(slug("The Forgotten Hollow"), "the-forgotten-hollow");
});

test("place names normalize snake_case underscores to spaces", () => {
  const out = mapPlaces(JSON.stringify({ places: ["abyssal_trench", "gloomy_cavern"] }));
  assert.deepEqual(out, ["abyssal trench", "gloomy cavern"]);
});

test("mob names also de-underscore", () => {
  const out = mapMobs(JSON.stringify({ mobs: [{ name: "cave_wight", desc: "x" }] }));
  assert.equal(out[0].name, "cave wight");
});

test("desc caps on a sentence boundary, keeping whole sentences (no mid-word chop)", () => {
  const s1 = "A pale and gangling wretch lurks in the gloom here, watching you with wet, unblinking eyes from somewhere back in the dark.";
  const s2 = "It has waited down in the cold and the silence for a very long time indeed, and does not intend to let you leave alive at all.";
  const out = mapMobs(JSON.stringify({ mobs: [{ name: "X", desc: s1 + " " + s2 }] }));
  const d = out[0].desc;
  assert.ok(d.length <= 200, `expected <=200 chars, got ${d.length}`);
  assert.ok(/[.!?]$/.test(d), `should end on sentence punctuation: "${d}"`);
  assert.equal(d, s1); // first whole sentence kept, second dropped whole
});

test("a single long sentence survives whole, not chopped mid-word", () => {
  const one = "This is one long unbroken sentence that runs on and on for well past two hundred characters without any internal period so the sentence cap must keep it intact rather than slicing it mid word at an arbitrary index here";
  const out = mapMobs(JSON.stringify({ mobs: [{ name: "X", desc: one }] }));
  assert.equal(out[0].desc, one);
});
