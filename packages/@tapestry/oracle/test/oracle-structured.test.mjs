import { test } from "node:test";
import assert from "node:assert/strict";
import {
  slug, mapPlaces, mapMobs, mapBoss, mapItems, mapProse, mapScars,
  SCHEMA_MOBS, SCHEMA_ITEMS,
} from "../dist/scripts/oracle-structured.js";

test("mapScars maps scar records to kind-tagged entries, normalizing the kind", () => {
  const raw = JSON.stringify({ scars: [{ kind: "looted", line: "Picked clean." }, { kind: "Boss Slain", line: "A body cools here." }] });
  const out = mapScars(raw);
  assert.equal(out[0].name, "looted");
  assert.equal(out[0].desc, "Picked clean.");
  assert.equal(out[1].name, "boss-slain");
});

test("mapScars returns [] on malformed JSON", () => {
  assert.deepEqual(mapScars("nope"), []);
  assert.deepEqual(mapScars(null), []);
});

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

test("strips leading list numbering the model bakes into array items", () => {
  const out = mapProse(JSON.stringify({ lines: ["1. Eerie music echoes here.", "2) A cold mist clings.", "- Ghostly laughter fades."] }), "detail");
  assert.equal(out[0].desc, "Eerie music echoes here.");
  assert.equal(out[1].desc, "A cold mist clings.");
  assert.equal(out[2].desc, "Ghostly laughter fades.");
});

test("keeps mid-sentence numbers; only leading enumeration is stripped", () => {
  const out = mapProse(JSON.stringify({ lines: ["The big top rises 30 feet overhead."] }), "opener");
  assert.equal(out[0].desc, "The big top rises 30 feet overhead.");
});

// ---------------------------------------------------------------------------
// v3: landmarks + sectors
// ---------------------------------------------------------------------------
import { mapLandmarks, mapSector, stripDirectionTalk, SCHEMA_LANDMARKS, SCHEMA_SECTOR } from "../dist/scripts/oracle-structured.js";
import { fallbackLandmarks } from "../dist/scripts/sector-compose.js";

test("stripDirectionTalk drops only the offending sentences", () => {
  const s = "The tent rises high. A canvas arch leads north into the dark. Sawdust coats everything.";
  assert.equal(stripDirectionTalk(s), "The tent rises high. Sawdust coats everything.");
  assert.equal(stripDirectionTalk("No exits here."), "");
  assert.equal(stripDirectionTalk("Clean prose stays."), "Clean prose stays.");
});

test("mapLandmarks returns exactly k, deduped, linted, article-stripped", () => {
  const raw = JSON.stringify({ landmarks: [
    { name: "The Big Top", desc: "Striped canvas soars overhead. A flap opens to the west wind. The ring smells of sawdust.", afar: "A striped peak over the trees." },
    { name: "big top", desc: "Duplicate should be replaced.", afar: "x" },
    { name: "Animal Cages", desc: "Iron bars in long rows. Something paces inside.", afar: "Low iron shapes in a row." },
  ]});
  const out = mapLandmarks(raw, 3, fallbackLandmarks());
  assert.equal(out.length, 3);
  assert.equal(out[0].name, "big top");
  assert.equal(out[0].desc, "Striped canvas soars overhead. The ring smells of sawdust."); // west sentence linted
  assert.equal(out[1].name, fallbackLandmarks()[0].name); // duplicate replaced from the deck
  assert.equal(out[2].name, "animal cages");
});

test("mapLandmarks pads from the deck and synthesizes past exhaustion", () => {
  const out = mapLandmarks(null, 3, fallbackLandmarks());
  assert.equal(out.length, 3);
  assert.equal(out[0].name, fallbackLandmarks()[0].name);
  const tiny = mapLandmarks(null, 3, fallbackLandmarks().slice(0, 1));
  assert.equal(tiny.length, 3);
  assert.equal(tiny[1].name, "waypoint 2");
});

test("mapSector maps pools, lowercases qualifier to one word, enforces {dir}", () => {
  const raw = JSON.stringify({
    qualifier: "Flooded Midway",
    openers: ["Water sheets the boards."], details: ["Ticket stubs float past."],
    sensory: ["Everything smells of wet rope."], hooks: ["A prize booth stands shuttered."],
    landmark_lines: [
      "The big top is visible to the {DIR}.",
      "The big top is that way.",
      "Past the booths, the big top rises { dir } of here."
    ],
  });
  const s = mapSector(raw);
  assert.equal(s.qualifier, "flooded");
  assert.deepEqual(s.openers, ["Water sheets the boards."]);
  assert.equal(s.landmarkLines.length, 2); // the slotless line dropped
  assert.ok(s.landmarkLines[0].includes("{dir}"));
  assert.ok(s.landmarkLines[1].includes("{dir}"));
  assert.equal(mapSector("garbage"), null);
  assert.equal(mapSector(null), null);
});

test("v3 schemas are strict root objects", () => {
  for (const schema of [SCHEMA_LANDMARKS, SCHEMA_SECTOR]) {
    const j = JSON.parse(schema);
    assert.equal(j.type, "object");
    assert.equal(j.additionalProperties, false);
    assert.ok(Array.isArray(j.required) && j.required.length > 0);
  }
});

test("mapSector sentence-cases pool lines and lints direction talk", () => {
  const raw = JSON.stringify({
    qualifier: "twisted",
    openers: ["cracked stage curtains", "Mirrored maze shadows stretch far and wide in north"],
    details: ["a discarded rubber chicken"],
    sensory: [], hooks: [],
    landmark_lines: ["the big top is visible to the {dir}"],
  });
  const s = mapSector(raw);
  assert.deepEqual(s.openers, ["Cracked stage curtains."]); // compass line dropped
  assert.deepEqual(s.details, ["A discarded rubber chicken."]);
  assert.deepEqual(s.landmarkLines, ["The big top is visible to the {dir}."]);
});
