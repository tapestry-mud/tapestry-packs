// run-entry golden tests - runEntryRoomId(): the single derivation for a run's entry-room
// id, shared by startRun (oracle_active_run composite) and instantiateRunArea (geometry
// mint) so the two can never diverge (D6 / validate-plan R2 LOW). Run after npm run build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runEntryRoomId, RUN_NAMESPACE } from "../dist/scripts/run-entry.js";

test("entry room id is namespace:runSlug-entry", () => {
    assert.equal(runEntryRoomId("oracle-run-1a2b3c4d-9f8e7d6c"), "oracle-run:oracle-run-1a2b3c4d-9f8e7d6c-entry");
});

test("uses the fixed RUN_NAMESPACE constant", () => {
    assert.equal(runEntryRoomId("abc"), RUN_NAMESPACE + ":abc-entry");
});

test("is pure: same input always yields the same output", () => {
    const a = runEntryRoomId("same-slug");
    const b = runEntryRoomId("same-slug");
    assert.equal(a, b);
});

test("different run slugs never collide", () => {
    const a = runEntryRoomId("run-a");
    const b = runEntryRoomId("run-b");
    assert.notEqual(a, b);
});
