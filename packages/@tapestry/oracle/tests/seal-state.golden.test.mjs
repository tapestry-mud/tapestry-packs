// seal-state golden tests - the pure half of the lair seal (spec 5.3). The counter
// persists as a frozen "seal" oracle side-car table because setAreaAttribute
// whitelists only level_range/reset_interval/wip/seed, and a runtime-created run
// pack validates STRICT on reboot so it cannot carry pack-declared properties.
// Run after npm run build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeSeal, decodeSeal, recordSlain, EMPTY_SEAL } from "../dist/scripts/seal-state.js";

test("a fresh seal with no minibosses is already broken", () => {
    const s = decodeSeal(encodeSeal({ total: 0, slain: 0, broken: false }));
    assert.equal(s.broken, true);
});

test("round-trips through the table encoding", () => {
    const before = { total: 3, slain: 1, broken: false };
    const after = decodeSeal(encodeSeal(before));
    assert.deepEqual(after, before);
});

test("recordSlain advances the counter without breaking early", () => {
    let s = { total: 3, slain: 0, broken: false };
    s = recordSlain(s);
    assert.deepEqual(s, { total: 3, slain: 1, broken: false });
    s = recordSlain(s);
    assert.deepEqual(s, { total: 3, slain: 2, broken: false });
});

test("recordSlain breaks the seal on the last miniboss", () => {
    let s = { total: 2, slain: 1, broken: false };
    s = recordSlain(s);
    assert.equal(s.slain, 2);
    assert.equal(s.broken, true);
});

test("recordSlain past total never regresses the broken flag or overcounts", () => {
    let s = { total: 1, slain: 1, broken: true };
    s = recordSlain(s);
    assert.deepEqual(s, { total: 1, slain: 1, broken: true });
});

test("decodeSeal survives a missing or corrupt table", () => {
    assert.deepEqual(decodeSeal([]), EMPTY_SEAL);
    assert.deepEqual(decodeSeal(null), EMPTY_SEAL);
    assert.deepEqual(decodeSeal([{ id: "junk" }]), EMPTY_SEAL);
});

test("EMPTY_SEAL FAILS OPEN: an absent or unreadable table never seals a run shut", () => {
    assert.equal(EMPTY_SEAL.broken, true);
    assert.equal(EMPTY_SEAL.total, 0);
    assert.equal(EMPTY_SEAL.slain, 0);
});

test("a decoded table whose keepers are all dead stays broken across a reload", () => {
    const s = decodeSeal(encodeSeal({ total: 3, slain: 3, broken: true }));
    assert.equal(s.broken, true);
});
