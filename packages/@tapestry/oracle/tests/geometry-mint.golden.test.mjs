// geometry-mint golden tests - roomIdFor(): proves the run-entry case is genuinely ONE
// formula with runEntryRoomId (review finding 1, fix-plan pass on Task 5) rather than two
// independently-maintained strings that only coincidentally matched. Run after npm run build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { roomIdFor } from "../dist/scripts/geometry-mint.js";
import { runEntryRoomId, RUN_NAMESPACE } from "../dist/scripts/run-entry.js";

test("roomIdFor delegates to runEntryRoomId for the RUN_NAMESPACE entry cell", () => {
    const slugs = ["oracle-run-12345678-749d13cb", "oracle-run-1a2b3c4d-9f8e7d6c", "abc", "x-y-z"];
    for (const slug of slugs) {
        assert.equal(roomIdFor(RUN_NAMESPACE, slug, "0,0,0"), runEntryRoomId(slug));
    }
});

test("roomIdFor still derives non-entry cells inline under RUN_NAMESPACE (pathKey, not the entry helper)", () => {
    assert.equal(roomIdFor(RUN_NAMESPACE, "oracle-run-abc", "1,0,0"), RUN_NAMESPACE + ":oracle-run-abc-1_0_0");
});

test("roomIdFor keeps the original inline formula for non-run namespaces (createSoloArea's path unaffected)", () => {
    assert.equal(roomIdFor("@solo/my-area", "solo-area-1a2b", "0,0,0"), "@solo/my-area:solo-area-1a2b-entry");
    assert.equal(roomIdFor("@scratch/oracle-run", "scratch-oracle-run-deadbeef", "0,0,0"), "@scratch/oracle-run:scratch-oracle-run-deadbeef-entry");
});
