// consequence-hooks.ts - stamps room consequences from gameplay events, routed by the
// ROOM-3 lifespan tag. Slice-1 sources: boss death -> boss-slain (persistent); last room
// npc cleared -> looted (ephemeral). The engine overlay (R1) evicts ephemeral on the
// repop tick and keeps persistent/succession-seed until reboot.
//
// No Node test for the subscription (it calls tapestry.* - pack philosophy); only the pure
// lifespanFor helper is node-tested. ASCII; braces on all control flow.
//
// GROUNDED against real code (validate-plan findings 1 + 8):
//   - core publishes "mob.death" AFTER removing the mob (death.ts:38 then :60-66), so there
//     is NO evt.mob. The payload is under evt.data: { templateId, mobName, roomId, corpseId,
//     killerId }. A JS-published event leaves the top-level evt.roomId null (EventsModule
//     publish sets only Type+Data), so roomId MUST be read from evt.data.roomId.
//   - the oracle boss spawns with template "tapestry-oracle:swell-boss" (room-gen.ts:351),
//     which becomes the dead mob's template_id -> evt.data.templateId (the spawn override's
//     FromType is stored separately as oracle_from_type, SpawnManager.cs:236, so it does not
//     clobber template_id).
//   - there is no mobs.hostilesIn binding; count remaining NPCs with
//     tapestry.world.getEntitiesInRoom(roomId, "npc") (binding WorldModule.cs:123 ->
//     ApiWorld.cs:323-335; the predicate is Type=="npc" OR tag=="npc", not a hostility test).
//     The dead mob is already removed and the corpse is a "container" (not an npc), so 0 == cleared.
//   - LOOTED HEURISTIC ASSUMPTION: this counts ALL npcs, not just hostile ones. It is correct
//     for oracle areas because they mint only hostile npcs (hostile-melee + swell-boss); if a
//     future oracle pack spawns friendly/vendor npcs, the looted-on-clear stamp would need a
//     hostility/disposition filter. Harmless in slice-1.

import * as tapestry from "@tapestry/engine";
import { type SixAxisTable } from "./six-axis.js";
import { getRoomArea, getAreaState } from "./area-state.js";

// Fallback lifespans for the slice-1 kinds, so stamping is correct even when the area's
// six-axis tables are not in memory (e.g. a stamp fired before ensureAreaContext ran).
const LIFESPAN_FALLBACK: Record<string, string> = {
    looted: "ephemeral",
    "boss-slain": "persistent",
    collapsed: "succession-seed",
};

export function lifespanFor(tables: Record<string, SixAxisTable>, kind: string): string {
    const room3 = tables["ROOM-3"];
    if (room3) {
        for (let i = 0; i < room3.consequences.length; i++) {
            if (room3.consequences[i].id === kind) {
                return room3.consequences[i].lifespan;
            }
        }
    }
    if (Object.prototype.hasOwnProperty.call(LIFESPAN_FALLBACK, kind)) {
        return LIFESPAN_FALLBACK[kind];
    }
    return "ephemeral";
}

function stampForRoom(roomId: string, kind: string): void {
    const areaId = getRoomArea(roomId);
    const tables = areaId ? (getAreaState(areaId)?.sixAxis || {}) : {};
    (tapestry as any).consequence.stamp(roomId, kind, lifespanFor(tables, kind));
}

// Registered at module load. Guard everything; never throw into the engine loop.
export function registerConsequenceHooks(): void {
    (tapestry as any).events.on("mob.death", function (evt: any): void {
        try {
            const data = evt && evt.data;
            const roomId = data && data.roomId;
            if (!roomId) { return; }
            const isBoss = String((data && data.templateId) || "").indexOf("swell-boss") !== -1;
            if (isBoss) {
                stampForRoom(roomId, "boss-slain");
                return;
            }
            // Non-boss: if no npcs remain in the room, it reads as cleared/looted. The dead
            // mob is already removed; getEntitiesInRoom(roomId,"npc") returns the SURVIVING
            // npcs (corpses are containers, not npcs), so 0 == cleared. Counts ALL npcs, not
            // just hostile ones - correct here because oracle areas mint only hostile npcs.
            const remaining = (tapestry as any).world.getEntitiesInRoom(roomId, "npc");
            if (!remaining || remaining.length === 0) {
                stampForRoom(roomId, "looted");
                (tapestry as any).world.sendToRoom(roomId, "Nothing more stirs here. If the thread feels done, LEAVE returns you to the hub.\r\n");
            }
        } catch (_err) {
            // graceful: a hook failure must never crash the engine loop.
        }
    });
}

registerConsequenceHooks();
