// room-revisit.ts - "rooms remember" on walk-in. Subscribes to player.direction.moved
// (published AFTER the room render, movement.ts:62) and appends the destination room's
// scar prose (ROOM-2 state_overrides for each stamped consequence kind) as a trailing line
// to the mover. Additive + regression-free: extra text, only to the mover, only when the
// room carries scars. See the R2 task note for why this is NOT a global look override.
//
// ASCII; \r\n for telnet; braces on all control flow. No Node test (calls tapestry.*).
import * as tapestry from "@tapestry/engine";
import { applyStateOverrides } from "./room-compose.js";
import { getRoomArea, getAreaState } from "./area-state.js";
function scarLineFor(roomId) {
    const entries = tapestry.consequence.list(roomId) || [];
    if (entries.length === 0) {
        return "";
    }
    const kinds = [];
    for (let i = 0; i < entries.length; i++) {
        kinds.push(String(entries[i].kind));
    }
    const areaId = getRoomArea(roomId);
    const tables = areaId ? (getAreaState(areaId)?.sixAxis || {}) : {};
    return applyStateOverrides("", tables["ROOM-2"], kinds).trim();
}
export function registerRevisitHooks() {
    tapestry.events.on("player.direction.moved", function (evt) {
        try {
            const data = evt && evt.data;
            const entityId = data && data.entityId;
            const toRoom = data && data.toRoom;
            if (!entityId || !toRoom) {
                return;
            }
            const line = scarLineFor(toRoom);
            if (line !== "") {
                tapestry.world.send(entityId, line + "\r\n");
            }
        }
        catch (_err) {
            // graceful: never throw into the engine loop.
        }
    });
}
registerRevisitHooks();
