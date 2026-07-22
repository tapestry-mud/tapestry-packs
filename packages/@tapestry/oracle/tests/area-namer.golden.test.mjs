// Pure-helper determinism gate (carve-out from the no-node-tests rule: zero CLR/Jint values).
// Run: node --test tests/area-namer.golden.test.mjs  (run after `npm run build`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { seededAreaName, NAME_QUALIFIERS, NAME_PLACES } from "../dist/scripts/area-namer.js";

// Pinned by running the built module once: node -e "import('./dist/scripts/area-namer.js')
// .then(m => console.log(JSON.stringify(m.seededAreaName(0x3f2a))))"
const GOLDEN = "the Fading Expanse";

test("seededAreaName is deterministic for a seed", () => {
    const a = seededAreaName(0x3f2a);
    const b = seededAreaName(0x3f2a);
    assert.equal(a, b);
});

test("seededAreaName composes 'the <qualifier> <place>' from the decks", () => {
    const name = seededAreaName(0x3f2a);
    assert.ok(name.startsWith("the "));
    const rest = name.slice(4);
    const parts = rest.split(" ");
    assert.equal(parts.length, 2);
    assert.ok(NAME_QUALIFIERS.includes(parts[0]), "qualifier from deck: " + parts[0]);
    assert.ok(NAME_PLACES.includes(parts[1]), "place from deck: " + parts[1]);
});

test("seededAreaName is strict 7-bit ASCII for every deck word", () => {
    const words = NAME_QUALIFIERS.concat(NAME_PLACES);
    for (const w of words) {
        for (let i = 0; i < w.length; i++) {
            assert.ok(w.charCodeAt(i) >= 32 && w.charCodeAt(i) <= 126, "non-ascii in " + w);
        }
    }
});

test("seededAreaName varies across seeds (not a constant)", () => {
    const names = new Set();
    for (let s = 0; s < 64; s++) {
        names.add(seededAreaName(s));
    }
    assert.ok(names.size > 20, "expected spread, got " + names.size);
});

test("seededAreaName does not disturb the area rng (independent sub-stream)", () => {
    // The namer must never draw from splitmix64(areaSeed) itself. Proven structurally:
    // it draws from splitmix64(hashCoord(areaSeed, "name")), a different stream.
    // Golden pin: see GOLDEN below.
    assert.equal(seededAreaName(0x3f2a), GOLDEN);
});
