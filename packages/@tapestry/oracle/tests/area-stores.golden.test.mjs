// Pure-store gate: area-state.ts and run-state.ts import no @tapestry/engine binding,
// so their removers are directly testable. Run after `npm run build`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    setAreaState, getAreaState, setRoomArea, getRoomArea,
    setRoomPath, getRoomPath, removeAreaState,
} from "../dist/scripts/area-state.js";
import {
    runKey, setRunState, getRunState, removeRunStatesForArea,
} from "../dist/scripts/run-state.js";

function fakeAreaState(areaId) {
    return {
        areaId, areaSeed: 1, biomePalette: [], theme: "t", levelRange: [1, 5],
        targetNamespace: "oracle-run", areaSlug: areaId,
        runStateKey: "p1:" + areaId, targetRooms: 40,
        roster: { mobs: [], boss: {}, loot: [] }, sixAxis: {},
    };
}

test("removeAreaState drops the AreaState and every room mapping for that area", () => {
    setAreaState("oracle-run-3f2a", fakeAreaState("oracle-run-3f2a"));
    setRoomArea("oracle-run:oracle-run-3f2a-entry", "oracle-run-3f2a");
    setRoomPath("oracle-run:oracle-run-3f2a-entry", "0,0,0");
    setRoomArea("oracle-run:oracle-run-3f2a-1_0_0", "oracle-run-3f2a");
    setRoomPath("oracle-run:oracle-run-3f2a-1_0_0", "1,0,0");

    // A sibling area sharing the pack namespace must survive.
    setAreaState("oracle-run-9c1d", fakeAreaState("oracle-run-9c1d"));
    setRoomArea("oracle-run:oracle-run-9c1d-entry", "oracle-run-9c1d");
    setRoomPath("oracle-run:oracle-run-9c1d-entry", "0,0,0");

    const unmapped = removeAreaState("oracle-run-3f2a");

    assert.equal(unmapped, 2);
    assert.equal(getAreaState("oracle-run-3f2a"), undefined);
    assert.equal(getRoomArea("oracle-run:oracle-run-3f2a-entry"), undefined);
    assert.equal(getRoomPath("oracle-run:oracle-run-3f2a-entry"), undefined);
    assert.equal(getRoomArea("oracle-run:oracle-run-3f2a-1_0_0"), undefined);
    assert.equal(getRoomPath("oracle-run:oracle-run-3f2a-1_0_0"), undefined);

    assert.notEqual(getAreaState("oracle-run-9c1d"), undefined);
    assert.equal(getRoomArea("oracle-run:oracle-run-9c1d-entry"), "oracle-run-9c1d");
    assert.equal(getRoomPath("oracle-run:oracle-run-9c1d-entry"), "0,0,0");
});

test("removeAreaState on an unknown area is a no-op returning 0", () => {
    assert.equal(removeAreaState("no-such-area"), 0);
});

test("removeRunStatesForArea drops the player key AND the reload key, not siblings", () => {
    setRunState(runKey("p1", "oracle-run-3f2a"), { roomsSinceLastBoss: 0, bossFired: false });
    setRunState(runKey("p2", "oracle-run-3f2a"), { roomsSinceLastBoss: 3, bossFired: true });
    setRunState("reload:oracle-run-3f2a", { roomsSinceLastBoss: 1, bossFired: false });
    setRunState(runKey("p1", "oracle-run-9c1d"), { roomsSinceLastBoss: 0, bossFired: false });

    const removed = removeRunStatesForArea("oracle-run-3f2a");

    assert.equal(removed, 3);
    assert.equal(getRunState(runKey("p1", "oracle-run-3f2a")), undefined);
    assert.equal(getRunState(runKey("p2", "oracle-run-3f2a")), undefined);
    assert.equal(getRunState("reload:oracle-run-3f2a"), undefined);
    assert.notEqual(getRunState(runKey("p1", "oracle-run-9c1d")), undefined);
});

test("removeRunStatesForArea on an unknown area is a no-op returning 0", () => {
    assert.equal(removeRunStatesForArea("no-such-area"), 0);
});
