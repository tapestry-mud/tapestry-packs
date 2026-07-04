// population.ts - v3 spawn-lazy population: geometry is minted eagerly at
// creation (geometry-mint.ts); SPAWNS happen on first player arrival per room.
//
// The stub resolver WAS the first-arrival hook; with stubs deleted the hook
// moves to the player.direction.moved subscriber (the room-revisit.ts pattern:
// core movement publishes it AFTER the room render). Because the event is
// post-render, first-visit mobs would appear silently - so population sends a
// short "stirs" line to the mover for each spawn, which reads as the room
// noticing you.
//
// First-visit tracking: an in-memory per-area set of visited pathKeys,
// persisted as the frozen "visited" ORACLE TABLE (one writeOracleTable per
// first visit, entries kept sorted). Rooms belong to the runtime-created
// destination pack, which has no loaded manifest on reboot and therefore
// validates STRICT - a pack-declared room property on generated rooms fails
// the boot (and the docker deployment cannot even write the pack scaffold).
// Oracle table side-cars ride AuthoredOracleLoader instead: no entity
// properties, no validator surface, reload-safe everywhere. After a reboot
// the set rehydrates lazily from the frozen table - the ensureAreaContext
// way. spawnMob mobs are transient (lost on reboot, never repopped by the
// engine), so a marker-persisted room stays as the player left it - the same
// outcome shipped 0.3.x had for materialized rooms.
//
// WHAT spawns is unchanged from 0.3.x (campaign stage A moves only WHERE):
// same rng stream keys (coordKey ":spawn"/":boss"), same mint-vs-reuse set,
// same loot draw, same boss clock slope, same level-1 flat band. Spawn density
// now reads the PURE geometry band (pressure no longer biases the band - the
// boss clock remains the only deliberate path-dependent channel).
//
// ASCII; braces on all control flow.

import * as tapestry from "@tapestry/engine";
import { splitmix64, hashCoord } from "./prng.js";
import { rngFor, mintMobInstance, mintBossInstance, mintItemInstance, mintMobInstanceByTypeId, shouldReuse } from "./resolver.js";
import { getAreaState, getRoomPath } from "./area-state.js";
import { ensureAreaContext, getMintedSet } from "./area-context.js";
import { getRunState } from "./run-state.js";
import { pureDegree, DEFAULT_SPAN } from "./structure.js";
import { diceSpan, resolveBands } from "./six-axis.js";
import { pathKey } from "./coords.js";

// ---------------------------------------------------------------------------
// Tuning constants (unchanged in kind from 0.3.x room-gen.ts)
// ---------------------------------------------------------------------------

/** Probability climbs this fraction per room since the last boss spawn. */
const BOSS_CLOCK_SLOPE = 0.07;

/** Chance an ambient mob carries a piece of loot (rides mob inventory). */
const LOOT_DROP_CHANCE = 0.35;

/** Spawn density per ROOM-1 band. transit is a breather; charged is densest.
 *  threshold maps to 1: the arena's real threat is the boss clock, not trash. */
const DENSITY: Record<string, number> = { transit: 0, chamber: 1, charged: 2, landmark: 1, threshold: 1 };

// ---------------------------------------------------------------------------
// bossClockFires (moved from room-gen.ts - room-gen retired with the stubs)
// ---------------------------------------------------------------------------

export function bossClockFires(roomsSinceLastBoss: number, rng: () => number): boolean {
    const threshold = Math.min(roomsSinceLastBoss * BOSS_CLOCK_SLOPE, 1.0);
    return rng() < threshold;
}

// ---------------------------------------------------------------------------
// First-visit tracking (keyed by room pathKey; persisted as the "visited"
// oracle table, hydrated once per area per session)
// ---------------------------------------------------------------------------

const _populated = new Map<string, Set<string>>();

function visitedSet(areaId: string): Set<string> {
    let s = _populated.get(areaId);
    if (!s) {
        s = new Set<string>();
        // Reload path: hydrate from the frozen visited table (restored at boot
        // by AuthoredOracleLoader). A fresh area simply has no table yet.
        try {
            const t = (tapestry as any).oracle.table(areaId + ":visited");
            if (t && t.entries) {
                for (let i = 0; i < t.entries.length; i++) {
                    const id = String((t.entries[i] && t.entries[i].id) || "");
                    if (id !== "") { s.add(id); }
                }
            }
        } catch (_err) {
            // graceful: an unreadable table never blocks population.
        }
        _populated.set(areaId, s);
    }
    return s;
}

function visitKey(roomId: string): string | null {
    const path = getRoomPath(roomId);
    if (!path) { return null; }
    return pathKey(path);
}

export function isPopulated(areaId: string, roomId: string): boolean {
    const key = visitKey(roomId);
    if (!key) { return false; }
    return visitedSet(areaId).has(key);
}

export function markPopulated(areaId: string, roomId: string): void {
    const key = visitKey(roomId);
    if (!key) { return; }
    const s = visitedSet(areaId);
    if (s.has(key)) { return; }
    s.add(key);
    // Persist: rewrite the visited table with SORTED entries so the side-car
    // bytes depend only on the set, not the visit order.
    try {
        const keys: string[] = [];
        s.forEach(function (k: string): void { keys.push(k); });
        keys.sort();
        const entries: Array<{ w: number; id: string; name: string; desc: string }> = [];
        for (let i = 0; i < keys.length; i++) {
            entries.push({ w: 1, id: keys[i], name: "visited", desc: "" });
        }
        (tapestry as any).authoring.writeOracleTable({ areaId, kind: "visited", entries });
    } catch (_err) {
        // graceful: the in-memory set still guards this session.
    }
}

// ---------------------------------------------------------------------------
// populateRoom - ambient spawns + boss clock for one room. Returns the spawned
// display names (for the arrival lines). Spawn semantics identical to 0.3.x
// materializeRoom steps 3-4.
// ---------------------------------------------------------------------------

export function populateRoom(roomId: string, areaId: string): string[] {
    const spawned: string[] = [];
    const areaState = getAreaState(areaId);
    if (!areaState) { return spawned; }
    const path = getRoomPath(roomId);
    if (!path) { return spawned; }
    const runState = getRunState(areaState.runStateKey);
    if (!runState) { return spawned; }

    const areaSeed = areaState.areaSeed;
    const roomSeed = hashCoord(areaSeed, path);
    const coordKey = String(roomSeed);
    const mintedMobTypes = getMintedSet(areaId);

    // Spawn density from the PURE geometry band - the same degree number the
    // mint used, so structure, prose cadence, and density agree.
    const room1 = areaState.sixAxis["ROOM-1"];
    let density = 1;
    if (room1) {
        const span = diceSpan(room1.dice);
        const degree = pureDegree(areaSeed, path, span);
        const band = resolveBands(room1, degree).band;
        density = Object.prototype.hasOwnProperty.call(DENSITY, band) ? DENSITY[band] : 1;
    } else {
        const degree = pureDegree(areaSeed, path, DEFAULT_SPAN);
        density = degree <= 2 ? 0 : (degree <= 7 ? 1 : 2);
    }

    const spawnRng = rngFor(areaSeed, coordKey + ":spawn");
    for (let i = 0; i < density; i++) {
        const level = 1;
        let override: any;
        if (mintedMobTypes && shouldReuse(mintedMobTypes.size, spawnRng)) {
            const mintedArr: string[] = [];
            mintedMobTypes.forEach(function (t: string): void { mintedArr.push(t); });
            const reuseIdx = Math.floor(spawnRng() * mintedArr.length);
            override = mintMobInstanceByTypeId(areaId, mintedArr[reuseIdx], level, spawnRng);
        } else {
            override = mintMobInstance(areaId, level, spawnRng);
            if (override && mintedMobTypes) {
                mintedMobTypes.add(override.fromType);
            }
        }
        // Loot threshold draw is UNCONDITIONAL per iteration - same rng stream
        // shape as the shipped code. spawnMob consumes no rng.
        const lootRoll = spawnRng();
        if (override && lootRoll < LOOT_DROP_CHANCE) {
            const loot = mintItemInstance(areaId, level, spawnRng, coordKey, i);
            if (loot) {
                if (!override.items) { override.items = []; }
                override.items.push(loot.id);
            }
        }
        if (override) {
            tapestry.mobs.spawnMob({
                template: "tapestry-oracle:hostile-melee",
                roomId,
                override,
            });
            spawned.push(String(override.name || "something"));
        }
    }

    // Boss clock: threshold from the path-dependent counter (deliberate channel);
    // the roll itself is seeded from the room so a given first-arrival is stable.
    const bossRng = splitmix64(roomSeed + 1);
    if (bossClockFires(runState.roomsSinceLastBoss, bossRng)) {
        const bossOverride = mintBossInstance(areaId, 1, rngFor(areaSeed, coordKey + ":boss"));
        if (bossOverride) {
            tapestry.mobs.spawnMob({
                template: "tapestry-oracle:swell-boss",
                roomId,
                override: bossOverride,
            });
            spawned.push(String(bossOverride.name || "something vast"));
        }
        runState.roomsSinceLastBoss = 0;
    } else {
        runState.roomsSinceLastBoss += 1;
    }

    return spawned;
}

// ---------------------------------------------------------------------------
// populateEntry - creation-time population of the entry room (teleportEntity
// does NOT publish player.direction.moved, so the subscriber never fires for
// the landing). Entry is count 0: structurally boss-free, counter becomes 1.
// ---------------------------------------------------------------------------

export function populateEntry(areaId: string, entryRoomId: string): void {
    markPopulated(areaId, entryRoomId);
    populateRoom(entryRoomId, areaId);
}

// ---------------------------------------------------------------------------
// The first-visit trigger.
// ---------------------------------------------------------------------------

function capitalizeFirst(s: string): string {
    if (!s) { return s; }
    return s.charAt(0).toUpperCase() + s.slice(1);
}

export function registerPopulationHooks(): void {
    (tapestry as any).events.on("player.direction.moved", function (evt: any): void {
        try {
            const data = evt && evt.data;
            const entityId = data && data.entityId;
            const toRoom = data && data.toRoom;
            if (!entityId || !toRoom) {
                return;
            }
            const areaId = ensureAreaContext(toRoom);
            if (!areaId) {
                return; // not an oracle room - cheap refusal.
            }
            if (isPopulated(areaId, toRoom)) {
                return; // backtrack/revisit: spawns happen exactly once.
            }
            // Mark FIRST: a mid-spawn failure leaves an empty-but-marked room
            // (safe) rather than risking double spawns on the next entry.
            markPopulated(areaId, toRoom);
            const spawned = populateRoom(toRoom, areaId);
            for (let i = 0; i < spawned.length; i++) {
                (tapestry as any).world.send(entityId, capitalizeFirst(spawned[i]) + " stirs at your arrival.\r\n");
            }
        } catch (_err) {
            // graceful: never throw into the engine loop.
        }
    });
}

registerPopulationHooks();
