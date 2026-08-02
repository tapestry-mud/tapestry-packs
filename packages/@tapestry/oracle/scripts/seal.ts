// seal.ts - the lair seal, engine side (spec 5.3).
//
// "The lair is sealed until the run's minibosses are dead. Pure run state: a
// counter and an immunity flag, no items." Because no item is involved, nothing
// can be farmed at a low level and carried into the Unraveling, so spec 4.4's
// deferred run-bound item rule stays deferred. And a kill counter needs no lever
// primitive, so the per-run traversal gate 4.4 deferred under SA6 comes back for
// free: a geared veteran still clears the minibosses before the lair opens.
//
// STORAGE: a frozen "seal" oracle table on the RUN area, not run-state.ts.
// run-state.ts is in-memory and explicitly not persisted (run-state.ts:23). That
// was harmless for a pity timer and is fatal for a seal: reboot mid-run and the
// counter would reset while the minibosses stay dead, so the lair never opens and
// the run soft-locks. It is also not an area attribute - setAreaAttribute
// whitelists only level_range/reset_interval/wip/seed - nor a room property, since
// a run's destination pack has no manifest on reboot and validates STRICT.
//
// IMMUNITY: core's ward gate (@tapestry/core scripts/combat/ward.ts) already does
// exactly this job for any `req_<cap>` tag: a mob so tagged takes zero effective
// damage until its own `cap_cleared_<cap>` property is set, gated at
// entity.vital.changed so ability damage cannot bypass it. The boss is tagged
// req_seal on spawn and cleared when the last miniboss dies. Per-INSTANCE, never a
// room flag, so an Unraveling repop re-seals a fresh boss automatically (the same
// SA1 property the dispel ward relies on).
//
// ASCII; braces on all control flow.

import * as tapestry from "@tapestry/engine";
import { decodeSeal, encodeSeal, recordSlain, EMPTY_SEAL, type SealState } from "./seal-state.js";
import { getAreaState, getRoomPath } from "./area-state.js";
import { placeLandmarks, landmarkPath, dirWord } from "./structure.js";
import { furthestLandmarkIndex } from "./lair.js";

export const SEAL_CAP = "seal";
export const SEAL_REQ_TAG = "req_" + SEAL_CAP;
export const SEAL_CLEARED_PROPERTY = "cap_cleared_" + SEAL_CAP;

/** In-memory mirror, hydrated lazily from the frozen table (the visited-set
 *  pattern). The table is the source of truth; this only avoids a read per hit. */
const _seals = new Map<string, SealState>();

function readTable(areaId: string): SealState {
    try {
        const t = (tapestry as any).oracle.table(areaId + ":" + SEAL_CAP);
        return decodeSeal(t && t.entries ? t.entries : null);
    } catch (_err) {
        // An unreadable table reads as OPEN (EMPTY_SEAL), never sealed. See F4.
        return EMPTY_SEAL;
    }
}

/**
 * Persist the seal. Returns whether it actually landed.
 *
 * F4: this used to swallow its failure with a "the in-memory mirror still guards
 * this session" comment while _seals advanced anyway. Compose that with a
 * fail-closed decode and you get precisely the soft-lock 5.3 exists to prevent: the
 * write fails silently, the player kills the rest of the keepers against a mirror
 * nobody persisted, the server reboots, and the lair is shut with every keeper
 * already dead. A swallowed write on the one piece of state that gates run
 * completion is not graceful. Every caller must react to a false return.
 */
function writeTable(areaId: string, state: SealState): boolean {
    try {
        (tapestry as any).authoring.writeOracleTable({
            areaId, kind: SEAL_CAP, entries: encodeSeal(state),
        });
        return true;
    } catch (_err) {
        return false;
    }
}

/** The seal cannot be persisted, so it must not be able to lock. Open it now, in
 *  memory and out loud, rather than leave a run that may not be completable after a
 *  reboot. Degrading to a free boss is the cheap failure; a dead run is not. */
function failOpen(areaId: string, why: string): SealState {
    const open: SealState = { total: 0, slain: 0, broken: true };
    _seals.set(areaId, open);
    try {
        (tapestry as any).system?.warn("[oracle] seal " + areaId + ": " + why + "; failing OPEN so the run cannot soft-lock.");
    } catch (_err) {
        // graceful: a missing warn binding never blocks the fail-open itself.
    }
    unsealBossesIn(areaId);
    return open;
}

export function getSeal(areaId: string): SealState {
    let s = _seals.get(areaId);
    if (!s) {
        s = readTable(areaId);
        _seals.set(areaId, s);
    }
    return s;
}

export function sealBroken(areaId: string): boolean {
    return getSeal(areaId).broken;
}

/** Called once at run mint with the miniboss count this run will place (K-1, the
 *  landmarks that are not the lair). A run with zero minibosses opens immediately.
 *  If the seal cannot be persisted at mint, the run never seals at all (F4) - the
 *  lair is open from the start rather than shut with no way to record progress. */
export function initSeal(areaId: string, total: number): void {
    const t = total > 0 ? total : 0;
    const state: SealState = { total: t, slain: 0, broken: t === 0 };
    _seals.set(areaId, state);
    if (!writeTable(areaId, state)) {
        failOpen(areaId, "could not write the seal at mint");
    }
}

/** Re-arm on an Unraveling repop: the minibosses come back, so the seal re-locks. */
export function resetSeal(areaId: string): void {
    const current = getSeal(areaId);
    initSeal(areaId, current.total);
}

/** Teardown of a discarded area: drop the mirror. The frozen table goes with the
 *  area directory, so nothing needs rewriting. */
export function removeSeal(areaId: string): void {
    _seals.delete(areaId);
}

/** Tag a freshly spawned boss immune while the seal holds. No-op once broken, so a
 *  player who clears the minibosses BEFORE ever finding the lair meets an open one. */
export function sealBoss(bossEntityId: string, areaId: string): void {
    if (sealBroken(areaId)) {
        return;
    }
    try {
        (tapestry as any).world.addTag(bossEntityId, SEAL_REQ_TAG);
    } catch (_err) {
        // graceful: a failed tag never blocks the spawn.
    }
}

/** Clear every live boss instance in the area. Called the moment the seal breaks,
 *  for the case where the player already walked into the lair and left the boss
 *  standing. Rooms the player has not reached yet are covered by sealBoss's own
 *  broken-check at spawn time. */
export function unsealBossesIn(areaId: string): void {
    try {
        const rooms = (tapestry as any).authoring.getAreaRooms(areaId) || [];
        for (let i = 0; i < rooms.length; i++) {
            const roomId = typeof rooms[i] === "string" ? rooms[i] : (rooms[i] && rooms[i].id);
            if (!roomId) {
                continue;
            }
            const npcs = (tapestry as any).world.getEntitiesInRoom(roomId, "npc") || [];
            for (let j = 0; j < npcs.length; j++) {
                const id = npcs[j].id;
                if (!(tapestry as any).world.hasTag(id, SEAL_REQ_TAG)) {
                    continue;
                }
                (tapestry as any).world.setProperty(id, SEAL_CLEARED_PROPERTY, true);
                (tapestry as any).world.sendToRoom(roomId, "The seal on this place gives way.\r\n");
            }
        }
    } catch (_err) {
        // graceful: never throw into the engine loop.
    }
}

/**
 * The objective, in words, for a run that has one (spec 5.4: "The run states its
 * objective on entry and the state is readable afterward. This is a status readout,
 * not a UI"). Empty string when there is nothing to say.
 */
export function objectiveLine(areaId: string): string {
    const s = getSeal(areaId);
    if (s.total <= 0) {
        return "";
    }
    if (s.broken) {
        return "The keepers of this thread are down. The lair stands open.";
    }
    const left = s.total - s.slain;
    const word = left === 1 ? "keeper holds" : "keepers hold";
    return "Something at the far end of this thread is sealed. " + left + " " + word + " it shut.";
}

/** Which way the lair lies from a room, as a compass word, or "" if unknowable.
 *  dirWord is the 8-way word structure.ts already exports for prose dressing. */
function lairDirectionFrom(areaId: string, roomId: string): string {
    try {
        const st = getAreaState(areaId);
        if (!st || !roomId) {
            return "";
        }
        const from = getRoomPath(roomId);
        if (!from) {
            return "";
        }
        const cells = placeLandmarks(st.areaSeed, st.targetRooms);
        const idx = furthestLandmarkIndex(cells);
        if (idx < 0) {
            return "";
        }
        return dirWord(from, landmarkPath(cells[idx]));
    } catch (_err) {
        return "";
    }
}

/**
 * One landmark miniboss died. Advances the counter, persists it, and opens the lair
 * on the last one. Returns the new state so the caller can message.
 *
 * F3: this used to speak ONLY on the break, so killing one of three keepers said
 * nothing and the player had no way to learn the kill counted toward anything.
 * Every kill now reports the remaining count.
 *
 * F6: the break line carries the direction. During the keeper phase a direction
 * hint is genuinely redundant - roads run to every landmark and the player has to
 * visit all of them anyway - but at the break the player has to walk BACK to a lair
 * that may be across the map, and that is the moment 5.4 was describing.
 */
export function noteMinibossSlain(areaId: string, roomId: string): SealState {
    const before = getSeal(areaId);
    if (before.broken) {
        return before;
    }
    const after = recordSlain(before);
    _seals.set(areaId, after);
    if (!writeTable(areaId, after)) {
        // Cannot record the kill. Do not leave a run that may be unfinishable after
        // a reboot: open it now and say so (F4).
        const opened = failOpen(areaId, "could not persist a keeper kill");
        if (roomId) {
            (tapestry as any).world.sendToRoom(roomId, "The seal gives way early, wrongly, like something tore instead of opening.\r\n");
        }
        return opened;
    }
    if (!roomId) {
        return after;
    }
    if (after.broken) {
        unsealBossesIn(areaId);
        const dir = lairDirectionFrom(areaId, roomId);
        const where = dir !== "" ? " Far to the " + dir + ", something comes unbound." : " Something far off comes unbound.";
        (tapestry as any).world.sendToRoom(roomId, "The last of the keepers falls." + where + "\r\n");
        return after;
    }
    const left = after.total - after.slain;
    const word = left === 1 ? "keeper" : "keepers";
    (tapestry as any).world.sendToRoom(roomId, "The keeper falls. " + left + " " + word + " still hold the seal.\r\n");
    return after;
}
