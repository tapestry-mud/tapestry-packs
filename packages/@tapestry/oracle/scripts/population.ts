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
import {
    rngFor, mintMobInstance, mintBossInstance, mintItemInstance, mintMobInstanceByTypeId,
    mintEliteInstance, mintMinibossInstance, shouldReuse,
} from "./resolver.js";
import { rollItemDrop, dropChanceFor } from "./item-tiers.js";
import { getAreaState, getRoomPath } from "./area-state.js";
import { ensureAreaContext, getMintedSet } from "./area-context.js";
import { getRunState } from "./run-state.js";
import { pureDegree, DEFAULT_SPAN, placeLandmarks, landmarkPath } from "./structure.js";
import { diceSpan, resolveBands } from "./six-axis.js";
import { pathKey } from "./coords.js";
import {
    CONTEXT_BUMP, DISPOSITION_TEMPLATES, TIER_TEMPLATES, ENTRY_PATH,
    rollDisposition, isEntryAdjacent, stirLine, ambientDensity, entrySafeDensity,
} from "./tiers.js";
import { ensureGuideAt } from "./guide.js";

// ---------------------------------------------------------------------------
// Tuning constants (unchanged in kind from 0.3.x room-gen.ts)
// ---------------------------------------------------------------------------

/** Probability climbs this fraction per room since the last boss spawn. */
const BOSS_CLOCK_SLOPE = 0.07;

// Per-band ambient density moved to tiers.DENSITY (B.2) so the entry-zero
// structural guarantee (tiers.ambientDensity) is golden-testable beside it.

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
// populateRoom - the stage-B threat-tier ladder for one room's first visit.
// Returns the arrival LINES (per-disposition dressing; the caller capitalizes
// and sends). Order, with every rng draw in fixed code position so per-room
// streams stay traversal-independent:
//   1. miniboss - landmark rooms spawn their frozen identity (exactly one per
//      landmark, skipped when the landmark is entry-adjacent: the
//      structurally-safe start wins over exactly-K, documented).
//   2. elite - charged-band rooms convert their first density slot into a
//      swell-capable epithet-named elite (never at entry/entry-adjacent).
//   3. trash - the 0.3.x ambient loop (same stream keys, mint-vs-reuse, loot
//      draw), now with a dice-owned band-weighted DISPOSITION per spawn that
//      picks the template (aggro/neutral/timid).
//   4. boss clock - advances every first visit, but FIRES at most once per
//      run, and never in landmark or entry-adjacent rooms (no double-boss).
// ---------------------------------------------------------------------------

export function populateRoom(roomId: string, areaId: string): string[] {
    const lines: string[] = [];
    const areaState = getAreaState(areaId);
    if (!areaState) { return lines; }
    const path = getRoomPath(roomId);
    if (!path) { return lines; }
    const runState = getRunState(areaState.runStateKey);
    if (!runState) { return lines; }

    const areaSeed = areaState.areaSeed;
    const roomSeed = hashCoord(areaSeed, path);
    const coordKey = String(roomSeed);
    const mintedMobTypes = getMintedSet(areaId);
    const mob1 = areaState.sixAxis["MOB-1"];
    const item1 = areaState.sixAxis["ITEM-1"];
    const item6 = areaState.sixAxis["ITEM-6"];

    // Spawn density + band from the PURE geometry degree - the same number the
    // mint used, so structure, prose cadence, and density agree.
    const room1 = areaState.sixAxis["ROOM-1"];
    let band = "chamber";
    let density = 1;
    if (room1) {
        const span = diceSpan(room1.dice);
        const degree = pureDegree(areaSeed, path, span);
        band = resolveBands(room1, degree).band;
        density = ambientDensity(band, path);
    } else {
        const degree = pureDegree(areaSeed, path, DEFAULT_SPAN);
        const raw = degree <= 2 ? 0 : (degree <= 7 ? 1 : 2);
        band = raw === 0 ? "transit" : (raw === 2 ? "charged" : "chamber");
        density = entrySafeDensity(path, raw);
    }

    const safeStart = path === "0,0,0" || isEntryAdjacent(path);

    // 1. Landmark miniboss (structural fight with an address). placeLandmarks is
    // pure f(seed) - cheap to recompute; no landmark list is persisted in state.
    let isLandmarkRoom = false;
    const landmarkCells = placeLandmarks(areaSeed, areaState.targetRooms);
    let landmarkIndex = -1;
    for (let i = 0; i < landmarkCells.length; i++) {
        if (landmarkPath(landmarkCells[i]) === path) {
            landmarkIndex = i;
            isLandmarkRoom = true;
            break;
        }
    }
    if (landmarkIndex >= 0 && !safeStart) {
        const mb = mintMinibossInstance(areaId, landmarkIndex, 1, rngFor(areaSeed, coordKey + ":miniboss"));
        if (mb) {
            const mbLootRng = rngFor(areaSeed, coordKey + ":miniboss-loot");
            if (rollItemDrop(item6, "miniboss", mbLootRng)) {
                const loot = mintItemInstance(areaId, 1, mbLootRng, coordKey, 0, item1, item6, { killerTier: "miniboss", roomBand: band });
                if (loot) {
                    if (!mb.items) { mb.items = []; }
                    mb.items.push(loot.id);
                }
            }
            tapestry.mobs.spawnMob({
                template: TIER_TEMPLATES.miniboss,
                roomId,
                override: mb,
            });
            lines.push(stirLine("miniboss", String(mb.name || "something")));
        }
    }

    const spawnRng = rngFor(areaSeed, coordKey + ":spawn");

    // 2. Charged-band elite: the band's effect text has promised "a
    // swell-capable mob" since 3.6 - the first density slot delivers it.
    let trashCount = density;
    if (band === "charged" && !safeStart && density > 0) {
        const elite = mintEliteInstance(areaId, 1, spawnRng, mob1);
        if (elite) {
            if (rollItemDrop(item6, "elite", spawnRng)) {
                const loot = mintItemInstance(areaId, 1, spawnRng, coordKey, 0, item1, item6, { killerTier: "elite", roomBand: band });
                if (loot) {
                    if (!elite.items) { elite.items = []; }
                    elite.items.push(loot.id);
                }
            }
            tapestry.mobs.spawnMob({
                template: TIER_TEMPLATES.elite,
                roomId,
                override: elite,
            });
            lines.push(stirLine("elite", String(elite.name || "something")));
            trashCount = density - 1;
        }
    }

    // 3. Ambient trash (0.3.x semantics: same stream keys, mint-vs-reuse set,
    // unconditional loot draw) + the dice-owned disposition axis.
    for (let i = 0; i < trashCount; i++) {
        const level = 1;
        let override: any;
        if (mintedMobTypes && shouldReuse(mintedMobTypes.size, spawnRng)) {
            const mintedArr: string[] = [];
            mintedMobTypes.forEach(function (t: string): void { mintedArr.push(t); });
            const reuseIdx = Math.floor(spawnRng() * mintedArr.length);
            override = mintMobInstanceByTypeId(areaId, mintedArr[reuseIdx], level, spawnRng);
        } else {
            override = mintMobInstance(areaId, level, spawnRng, mob1, Object.prototype.hasOwnProperty.call(CONTEXT_BUMP, band) ? CONTEXT_BUMP[band] : 0);
            if (override && mintedMobTypes) {
                mintedMobTypes.add(override.fromType);
            }
        }
        // Loot threshold draw is UNCONDITIONAL per iteration - same rng stream
        // position as 0.5.x; the THRESHOLD now reads from ITEM-6 (data, not a
        // constant) so trash's observable drop rate at the default (no-bump)
        // context stays exactly 0.35. spawnMob consumes no rng.
        const lootRoll = spawnRng();
        if (override && lootRoll < dropChanceFor(item6, "trash")) {
            const loot = mintItemInstance(areaId, level, spawnRng, coordKey, i, item1, item6, { killerTier: "trash", roomBand: band });
            if (loot) {
                if (!override.items) { override.items = []; }
                override.items.push(loot.id);
            }
        }
        // Disposition draw is UNCONDITIONAL per iteration too (fixed stream
        // shape). Dice own the mix; the template carries the temperament.
        const disposition = rollDisposition(band, spawnRng);
        if (override) {
            tapestry.mobs.spawnMob({
                template: DISPOSITION_TEMPLATES[disposition],
                roomId,
                override,
            });
            lines.push(stirLine(disposition, String(override.name || "something")));
        }
    }

    // 4. Boss clock: the ONE wandering big-boss pity timer. Counter advances on
    // every first visit; the FIRE is gated - at most once per run, never in a
    // landmark room (miniboss owns it) or the safe start.
    const bossRng = splitmix64(roomSeed + 1);
    const clockRoll = bossClockFires(runState.roomsSinceLastBoss, bossRng);
    if (clockRoll && !runState.bossFired && !isLandmarkRoom && !safeStart) {
        const bossOverride = mintBossInstance(areaId, 1, rngFor(areaSeed, coordKey + ":boss"));
        if (bossOverride) {
            const bossLootRng = rngFor(areaSeed, coordKey + ":boss-loot");
            if (rollItemDrop(item6, "boss", bossLootRng)) {
                const loot = mintItemInstance(areaId, 1, bossLootRng, coordKey, 0, item1, item6, { killerTier: "boss", roomBand: band });
                if (loot) {
                    if (!bossOverride.items) { bossOverride.items = []; }
                    bossOverride.items.push(loot.id);
                }
            }
            tapestry.mobs.spawnMob({
                template: TIER_TEMPLATES.boss,
                roomId,
                override: bossOverride,
            });
            lines.push(stirLine("boss", String(bossOverride.name || "something vast")));
        }
        runState.bossFired = true;
        runState.roomsSinceLastBoss = 0;
    } else {
        runState.roomsSinceLastBoss += 1;
    }

    return lines;
}

// ---------------------------------------------------------------------------
// populateEntry - creation-time population of the entry room (teleportEntity
// does NOT publish player.direction.moved, so the subscriber never fires for
// the landing). Entry is count 0: structurally boss-free, counter becomes 1.
// ---------------------------------------------------------------------------

export function populateEntry(areaId: string, entryRoomId: string): void {
    markPopulated(areaId, entryRoomId);
    // Guide first (NPC path), then the tier ladder (dice path, ambient-zero
    // at entry by the tiers.ambientDensity structural rule).
    ensureGuideAt(areaId, entryRoomId);
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
            // B.2: the starter kit is guide-delivered now (say hello to the
            // guide at entry) - the stage-B silent auto-grant is gone. The
            // guide itself is transient (spawnMob mobs do not survive a
            // reboot) while the entry room's visited marker is frozen, so
            // every arrival at the entry cell re-ensures the guide
            // (presence-checked - never a double-spawn). Runs BEFORE the
            // revisit gate on purpose.
            if (getRoomPath(toRoom) === ENTRY_PATH) {
                ensureGuideAt(areaId, toRoom);
            }
            if (isPopulated(areaId, toRoom)) {
                return; // backtrack/revisit: spawns happen exactly once.
            }
            // Mark FIRST: a mid-spawn failure leaves an empty-but-marked room
            // (safe) rather than risking double spawns on the next entry.
            markPopulated(areaId, toRoom);
            const spawned = populateRoom(toRoom, areaId);
            for (let i = 0; i < spawned.length; i++) {
                (tapestry as any).world.send(entityId, capitalizeFirst(spawned[i]) + "\r\n");
            }
        } catch (_err) {
            // graceful: never throw into the engine loop.
        }
    });
}

registerPopulationHooks();
