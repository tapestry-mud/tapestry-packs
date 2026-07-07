import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dropChanceFor, rollItemDrop, itemContextBump, selectItemEntry,
  pickSignatureName, isSignatureBand, ITEM_SIGNATURE_NAMES,
} from "../dist/scripts/item-tiers.js";
import { splitmix64 } from "../dist/scripts/prng.js";
import { parseSixAxisTable } from "../dist/scripts/six-axis.js";

const ITEM1 = parseSixAxisTable({
  table: "ITEM-1", axis: "DEGREE", dice: "1d12",
  bands: [
    { min: 1, max: 2, band: "junk", effect: "x" },
    { min: 3, max: 7, band: "common", effect: "x" },
    { min: 8, max: 10, band: "uncommon", effect: "x" },
    { min: 11, max: 11, band: "rare", effect: "x" },
    { min: 12, max: 12, band: "epic", effect: "x", fires: "signature" },
  ],
});

const ITEM6 = parseSixAxisTable({
  table: "ITEM-6", axis: "CONTEXT",
  inputs: [
    { kind: "killer_tier", key: "trash", bump: 0, drop_chance: 0.35 },
    { kind: "killer_tier", key: "boss", bump: 3, drop_chance: 1.0 },
    { kind: "room_band", key: "charged", bump: 1 },
  ],
});

test("dropChanceFor reads the killer_tier row; falls back to defaults with no table", () => {
  assert.equal(dropChanceFor(ITEM6, "trash"), 0.35);
  assert.equal(dropChanceFor(ITEM6, "boss"), 1.0);
  assert.equal(dropChanceFor(undefined, "trash"), 0.35);
  assert.equal(dropChanceFor(undefined, "elite"), 0.65);
  assert.equal(dropChanceFor(undefined, "miniboss"), 0.90);
  assert.equal(dropChanceFor(undefined, "boss"), 1.0);
});

test("rollItemDrop: boss (chance 1.0) always drops, trash does not always", () => {
  assert.equal(rollItemDrop(ITEM6, "boss", splitmix64(1)), true);
  let drops = 0;
  for (let i = 0; i < 50; i++) {
    if (rollItemDrop(ITEM6, "trash", splitmix64(i + 1))) { drops++; }
  }
  assert.ok(drops > 0 && drops < 50);
});

test("itemContextBump sums killer_tier + room_band rows; unknown keys contribute 0", () => {
  assert.equal(itemContextBump(ITEM6, { killerTier: "trash", roomBand: "charged" }), 1);
  assert.equal(itemContextBump(ITEM6, { killerTier: "boss", roomBand: "charged" }), 4);
  assert.equal(itemContextBump(ITEM6, { killerTier: "trash", roomBand: "unknown-band" }), 0);
  assert.equal(itemContextBump(undefined, { killerTier: "boss", roomBand: "charged" }), 0);
});

test("selectItemEntry: no ITEM-1 table -> flat weighted pick", () => {
  const entries = [{ w: 60, id: "a", name: "A", rarity: "common" }, { w: 40, id: "b", name: "B", rarity: "rare" }];
  const r = selectItemEntry(undefined, entries, 0, splitmix64(5));
  assert.ok(["a", "b"].includes(r.id));
});

test("selectItemEntry: empty entries -> null", () => {
  assert.equal(selectItemEntry(ITEM1, [], 0, splitmix64(1)), null);
});

test("selectItemEntry: band with no matching rarity entries falls back to flat pick", () => {
  // Only "common" entries exist; bump forces the roll to epic (band with no match).
  const entries = [{ w: 60, id: "a", name: "A", rarity: "common" }];
  const r = selectItemEntry(ITEM1, entries, 99, splitmix64(1));
  assert.equal(r.id, "a");
});

test("selectItemEntry: epic band only reachable with a large bump on 1d12", () => {
  const entries = [
    { w: 60, id: "c", name: "C", rarity: "common" },
    { w: 2, id: "e", name: "E", rarity: "epic" },
  ];
  // bump 0: sweep many seeds, epic should be rare-to-absent at raw span 1-12.
  let epicHits = 0;
  for (let i = 0; i < 200; i++) {
    const r = selectItemEntry(ITEM1, entries, 0, splitmix64(i + 1));
    if (r.id === "e") { epicHits++; }
  }
  assert.ok(epicHits < 30, "epic should be uncommon with no bump");
  // bump +11 forces every roll to resolve at or above the epic band's floor.
  const forced = selectItemEntry(ITEM1, entries, 11, splitmix64(3));
  assert.equal(forced.id, "e");
});

test("pickSignatureName is deterministic and draws from the fixed deck", () => {
  const n1 = pickSignatureName(splitmix64(42));
  const n2 = pickSignatureName(splitmix64(42));
  assert.equal(n1, n2);
  assert.ok(ITEM_SIGNATURE_NAMES.includes(n1));
});

test("isSignatureBand: true only for the band whose fires is signature", () => {
  assert.equal(isSignatureBand(ITEM1, "epic"), true);
  assert.equal(isSignatureBand(ITEM1, "rare"), false);
  assert.equal(isSignatureBand(undefined, "epic"), false);
});
