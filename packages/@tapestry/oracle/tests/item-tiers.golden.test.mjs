import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dropChanceFor, rollItemDrop, itemContextBump, selectItemEntry, selectItemEntryFloored,
  pickSignatureName, isSignatureBand, ITEM_SIGNATURE_NAMES,
} from "../dist/scripts/item-tiers.js";
import { rarityForTier } from "../dist/scripts/payout-tier.js";
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

// Rng fixtures for the floor tests below. The file has no existing rng helper
// beyond calling splitmix64(seed) directly, so these are thin wrappers added for
// the floor cases: seededRng is just a named alias, maxRollRng pins the draw near
// 1 so rollDegree's 1d12 always resolves to 12 (ITEM-1's epic floor).
function seededRng(seed) {
  return splitmix64(seed);
}

function maxRollRng() {
  return function () { return 0.999999; };
}

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

// --- clear-payout rarity floor (spec 6.2 as amended; review R2-F1) ---

test("a floor above the rolled band lifts selection to the floor", () => {
  // Entries in several bands; floor at epic must return the epic entry every time,
  // whatever the degree roll comes up with.
  const entries = [
    { w: 10, id: "c", name: "a common thing", desc: "", rarity: "common" },
    { w: 10, id: "e", name: "an epic thing", desc: "", rarity: "epic" },
  ];
  for (let i = 0; i < 25; i++) {
    const picked = selectItemEntryFloored(ITEM1, entries, 0, "epic", "uncommon", seededRng(i));
    assert.equal(picked.rarity, "epic");
  }
});

test("a floor BELOW the rolled band never drags a lucky roll down", () => {
  // The fixture carries a MIDDLE band, so "did not drag down" is a claim that can
  // actually be false: a broken implementation that clamped TO the floor would
  // return common here and fail. (An earlier draft used a two-band fixture and
  // asserted the result was one of those two bands, which no implementation could
  // fail - review R3-F2.)
  const entries = [
    { w: 10, id: "c", name: "a common thing", desc: "", rarity: "common" },
    { w: 10, id: "u", name: "an uncommon thing", desc: "", rarity: "uncommon" },
    { w: 10, id: "e", name: "an epic thing", desc: "", rarity: "epic" },
  ];
  // rollDegree of 12 on ITEM-1's 1d12 lands in the epic band (min 12).
  const picked = selectItemEntryFloored(ITEM1, entries, 0, "common", "common", maxRollRng());
  assert.equal(picked.rarity, "epic", "a floor must be a minimum, never a target");
});

test("a floor no entry satisfies walks DOWN to the best band present", () => {
  // The failure this guards: asking for epic and getting a common because the
  // empty-slice fallback flat-picked over everything.
  const entries = [
    { w: 10, id: "c", name: "a common thing", desc: "", rarity: "common" },
    { w: 10, id: "u", name: "an uncommon thing", desc: "", rarity: "uncommon" },
  ];
  for (let i = 0; i < 25; i++) {
    const picked = selectItemEntryFloored(ITEM1, entries, 0, "epic", "uncommon", seededRng(i));
    assert.equal(picked.rarity, "uncommon", "must take the best band present, not fall to common");
  }
});

test("the descent STOPS at rarityMin and returns null rather than paying junk", () => {
  // R3-F1. The real ITEM-1 ladder bottoms out at junk, so an unbounded descent
  // would hand vendor trash to the player who just killed the boss.
  const entries = [
    { w: 10, id: "j", name: "a junk thing", desc: "", rarity: "junk" },
    { w: 10, id: "c", name: "a common thing", desc: "", rarity: "common" },
  ];
  for (let i = 0; i < 25; i++) {
    const picked = selectItemEntryFloored(ITEM1, entries, 0, "epic", "uncommon", seededRng(i));
    assert.equal(picked, null, "nothing at or above uncommon means no payout, never junk");
  }
});

test("no ITEM-1 ladder refuses outright, it does not fall back to a flat pick", () => {
  // R4-F1. The shared _default/ITEM-1.yaml loader silently skips a missing or
  // malformed file, so this branch is reachable without any error being raised.
  // Delegating to selectItemEntry here would flat-pick over every entry INCLUDING
  // junk, ignoring both the floor and the bottom. This case fails loudly if anyone
  // restores that delegation.
  const entries = [
    { w: 10, id: "j", name: "a junk thing", desc: "", rarity: "junk" },
    { w: 10, id: "e", name: "an epic thing", desc: "", rarity: "epic" },
  ];
  assert.equal(selectItemEntryFloored(undefined, entries, 0, "epic", "uncommon", seededRng(1)), null);
});

test("an absent rarityMin collapses the window to the target band, never an open descent", () => {
  const entries = [
    { w: 10, id: "c", name: "a common thing", desc: "", rarity: "common" },
  ];
  const picked = selectItemEntryFloored(ITEM1, entries, 0, "epic", "", seededRng(1));
  assert.equal(picked, null);
});

test("each payout tier floors at a distinct band, so the three tiers are distinguishable", () => {
  const s = rarityForTier("standard");
  const p = rarityForTier("pinnacle");
  const r = rarityForTier("rare");
  assert.notEqual(s, p);
  assert.notEqual(p, r);
  assert.notEqual(s, r);
});
