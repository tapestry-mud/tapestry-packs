// area-gen.ts - Roll + create a solo oracle area (v3: geometry eager, spawns lazy).
//
// createSoloArea is the sole entry point called by the solo flow.
//
// CREATION FLOW (v3):
//   1. Roll area seed (or accept a forced seed - the shareable-seed seam) +
//      target_rooms from the chosen size band. Create the area authoring record,
//      persist seed/level_range/reset_interval (T5).
//   2. fillTables (LLM burst: places, landmarks, mobs/boss/items, sector pools,
//      scars) or bakedTables (LLM-off). normalizeTables guarantees K landmarks +
//      K sector pool-sets either way.
//   3. Freeze every table to disk (T4/T6), including the "structure" table that
//      carries target_rooms (the area-attribute seam whitelists only
//      level_range/reset_interval/wip/seed, so the size fact rides a table).
//   4. mintAreaGeometry: create EVERY reachable room + real two-way exits.
//      No stubs exist. Sub-second pure composition.
//   5. populateEntry (teleportEntity does not fire the population trigger),
//      then teleport the player in. Every other room populates on first
//      arrival via population.ts.
//
// Dice own FACTS: seed, target_rooms, landmark placement, sectors, edges,
// direction words. LLM owns DRESSING: names, bespoke landmark prose, sector
// pools, scar lines. All LLM work happens in the burst before the player lands.

import * as tapestry from "@tapestry/engine";
import { splitmix64 } from "./prng.js";
import { soloAreaBiomePalette } from "./roster.js";
import { runKey, setRunState } from "./run-state.js";
import { setAreaState, getAreaState } from "./area-state.js";
import { buildAreaSixAxis } from "./six-axis.js";
import { fillTables, bakedTables, normalizeTables, BAKED_SET_IDS, type OracleTableData } from "./oracle-tables.js";
import { rollTargetRooms, landmarkCount } from "./structure.js";
import { mintAreaGeometry } from "./geometry-mint.js";
import { populateEntry } from "./population.js";
import { EMPTY_ROSTER } from "./area-context.js";

// ---------------------------------------------------------------------------
// Configurable constants
// ---------------------------------------------------------------------------

/** Ticks between flavor messages. Tick = 100ms -> 15 ticks = ~1.5s. */
const FLAVOR_INTERVAL = 15;

/**
 * Hard abort ceiling for the flavor-wait loop (~90s). Generous because the teleport is
 * tied to room READINESS (onReadyTables), not to this timer - a slow LLM burst completes
 * and teleports whenever it lands. This ceiling only fires on a true hang, and on expiry
 * it aborts gracefully (a message, no teleport) rather than stranding the player in a
 * room that does not exist yet.
 */
const MAX_TICKS = 900;

// ---------------------------------------------------------------------------
// Flavor messages shown while tables are being filled.
// ---------------------------------------------------------------------------

const FLAVOR: string[] = [
    "Weaving the Pattern...",
    "Consulting the Dice...",
    "Tracing Ancient Paths...",
    "Reading Forgotten Omens...",
    "Binding Threads of Fate...",
    "Calling Upon Old Magic...",
    "Turning the Wheel...",
    "Shaping the Realm...",
    "Drawing Strange Portents...",
    "Whispering to the Void...",
    "Summoning Possibilities...",
    "Scribing New Legends...",
    "Seeking Hidden Truths...",
    "Awakening Sleeping Powers...",
    "Testing the Bounds of Reality...",
    "Bargaining with Destiny...",
    "Rearranging the Tapestry...",
    "Disturbing Ancient Things...",
    "Uncovering Lost Secrets...",
    "Drawing Back the Veil...",
    "Weaving New Threads...",
    "Knotting Loose Ends...",
    "Following the Pattern...",
    "Spinning Fresh Threads...",
    "Untangling Possibilities...",
    "Tightening the Weave...",
    "Coloring the Tapestry...",
    "Finding Missing Threads...",
    "Repairing the Loom...",
    "Threading New Destinies...",
    "Pulling at Fate's Edges...",
    "Expanding the Pattern...",
    "Stitching Together Legends...",
    "Mending Ancient Tears...",
    "Tracing the Great Design...",
];

// ---------------------------------------------------------------------------
// Pending generation state: keyed by playerId.
// ---------------------------------------------------------------------------

interface PendingGen {
    entryRoomId: string;
    ticks: number;
    idx: number;
}

const pending: Record<string, PendingGen> = {};

// ---------------------------------------------------------------------------
// createSoloArea
//
// actor:            the command actor (entityId, roomId, send)
// idea:             user-supplied area idea hint (null/blank = "the wilds").
// name:             display name (null = idea).
// minLevel/maxLevel: level range.
// targetNamespace:  destination pack namespace prefix for room ids.
// bakedSetId:       LLM-off table set.
// sizeBand:         "school" | "standard" | "epic" (target_rooms band).
// forcedSeed:       optional explicit seed (shareable seeds + determinism
//                   proofs); null rolls from time x player as before.
// ---------------------------------------------------------------------------

export function createSoloArea(
    actor: any,
    idea: string | null,
    name: string | null,
    minLevel: number,
    maxLevel: number,
    targetNamespace: string = "oracle-run",
    bakedSetId: string = BAKED_SET_IDS[0],
    sizeBand: string = "standard",
    forcedSeed: number | null = null
): void {
    // -----------------------------------------------------------------------
    // Step 1: Roll the area seed + target_rooms. STREAM CONTRACT: exactly ONE
    // rng() draw happens before the biome palette derivation -
    // soloAreaBiomePalette replays that single draw on reload, so it must
    // never drift. The target_rooms roll IS that draw (it replaced the old
    // size_target roll at the same stream position).
    // -----------------------------------------------------------------------

    const now = Date.now();
    const playerIdHash = simpleHash(String(actor.entityId));
    const areaSeed = forcedSeed !== null ? (forcedSeed >>> 0) : ((now ^ playerIdHash) >>> 0);

    const rng = splitmix64(areaSeed);
    const targetRooms = rollTargetRooms(sizeBand, rng());
    const k = landmarkCount(targetRooms);

    // Unique bare area id. Deterministic slug from seed.
    const areaSlug = targetNamespace + "-" + (areaSeed >>> 0).toString(16);

    const ideaHint = (idea && idea.trim() !== "") ? idea.trim() : "the wilds";
    const nameHint = (name && name.trim() !== "") ? name.trim() : ideaHint;
    const levelRange: [number, number] = [minLevel, maxLevel];

    const created = tapestry.authoring.createArea(areaSlug, nameHint);
    if (!created) {
        actor.send("Could not create oracle area. Try again.\r\n");
        return;
    }

    // Persist seed to area.yaml (T5 seam) - used on reload/share.
    tapestry.authoring.setAreaAttribute(areaSlug, "seed", String(areaSeed));
    tapestry.authoring.setAreaAttribute(areaSlug, "level_range", minLevel + "," + maxLevel);
    // Repop ON: drives the engine consequence overlay's ephemeral eviction
    // (looted clears on repop). reset_interval is in engine ticks (100ms);
    // effective interval = reset_interval * occupied_modifier (default 3.0).
    tapestry.authoring.setAreaAttribute(areaSlug, "reset_interval", "2000");

    tapestry.authoring.setAreaTheme(areaSlug, ideaHint);
    tapestry.authoring.setAreaShort(areaSlug, "An area, level " + minLevel + "-" + maxLevel + ".");
    tapestry.authoring.setAreaDescription(
        areaSlug,
        "The " + nameHint + " stretches before you. Levels " + minLevel + " to " + maxLevel + "."
    );

    // -----------------------------------------------------------------------
    // Step 2: Biome palette (seed-driven, shared derivation with reload).
    // -----------------------------------------------------------------------

    const biomePalette = soloAreaBiomePalette(areaSeed);
    const playerId = actor.entityId;

    // -----------------------------------------------------------------------
    // Step 3: Flavor-wait loop (LLM path can be slow; the teleport is tied to
    // readiness, never to this timer).
    // -----------------------------------------------------------------------

    pending[playerId] = {
        entryRoomId: targetNamespace + ":" + areaSlug + "-entry",
        ticks: 0,
        idx: 0,
    };

    let handle: string;

    const step = function () {
        const gen = pending[playerId];
        if (!gen) {
            tapestry.schedule.cancel(handle);
            return;
        }
        gen.ticks += FLAVOR_INTERVAL;
        if (gen.ticks >= MAX_TICKS) {
            tapestry.schedule.cancel(handle);
            delete pending[playerId];
            tapestry.world.send(playerId, "The oracle's weaving falters. Try `solo` again in a moment.");
            return;
        }
        tapestry.world.send(playerId, FLAVOR[gen.idx % FLAVOR.length]);
        gen.idx += 1;
    };

    handle = tapestry.schedule.every(FLAVOR_INTERVAL, step);

    // -----------------------------------------------------------------------
    // Step 4: Front-loaded table fill (LLM burst or baked set).
    // -----------------------------------------------------------------------

    const ideaStr = ideaHint;
    const llmEnabled = tapestry.authoring.recommendEnabled && tapestry.authoring.recommendEnabled();

    if (!llmEnabled) {
        const tables = bakedTables(bakedSetId);
        onReadyTables(tables);
        return;
    }

    fillTables(ideaStr, levelRange, k, areaSeed, onReadyTables);

    function onReadyTables(tables: OracleTableData[]): void {
        // -------------------------------------------------------------------
        // Step 5: Normalize (K landmarks + K sector pool-sets guaranteed for
        // both paths), add the structure table, freeze everything to disk.
        // -------------------------------------------------------------------

        const normalized = normalizeTables(tables, k, areaSeed);
        normalized.push({
            kind: "structure",
            entries: [{ w: 10, id: "target-rooms", name: "target_rooms", desc: String(targetRooms) }],
        });

        for (let i = 0; i < normalized.length; i++) {
            const t = normalized[i];
            (tapestry as any).authoring.writeOracleTable({
                areaId: areaSlug,
                kind: t.kind,
                entries: t.entries,
            });
        }

        // -------------------------------------------------------------------
        // Step 6: Area state + eager geometry mint + entry population.
        // -------------------------------------------------------------------

        buildArea(actor, areaSlug, areaSeed, levelRange, biomePalette, ideaHint, targetNamespace, targetRooms);

        // -------------------------------------------------------------------
        // Step 7: Teleport into the built entry room (tied to readiness).
        // -------------------------------------------------------------------

        const gen = pending[playerId];
        if (gen) {
            tapestry.schedule.cancel(handle);
            delete pending[playerId];
            tapestry.world.teleportEntity(playerId, gen.entryRoomId);
            tapestry.world.send(playerId, "The pattern settles into place around you.");
            tapestry.admin.executeAs(playerId, "look");
        }
    }
}

// ---------------------------------------------------------------------------
// buildArea
//
// Registers run state + area state, mints the whole room graph (real two-way
// exits, zero stubs), and populates the entry room. The entry room id is
// fixed: targetNamespace + ":" + areaSlug + "-entry".
// ---------------------------------------------------------------------------

function buildArea(
    actor: any,
    areaSlug: string,
    areaSeed: number,
    levelRange: [number, number],
    biomePalette: string[],
    ideaHint: string,
    targetNamespace: string,
    targetRooms: number
): void {
    const entryRoomId = targetNamespace + ":" + areaSlug + "-entry";

    // Run state before population so the boss clock reads correct state.
    const stateKey = runKey(actor.entityId, areaSlug);
    setRunState(stateKey, { roomsSinceLastBoss: 0 });

    // Every area is six-axis: authored theme keeps its set; any other area
    // assembles ROOM-2 from its frozen prose + scars tables (frozen above).
    const themeDir = ideaHint && ideaHint.toLowerCase().indexOf("underdeep") !== -1 ? "endless-underdeep" : "";
    const proseTable = (tapestry as any).oracle.table(areaSlug + ":prose");
    const scarsTable = (tapestry as any).oracle.table(areaSlug + ":scars");
    setAreaState(areaSlug, {
        areaId: areaSlug,
        areaSeed,
        biomePalette,
        theme: ideaHint,
        levelRange,
        targetNamespace,
        areaSlug,
        runStateKey: stateKey,
        targetRooms,
        roster: EMPTY_ROSTER,
        sixAxis: buildAreaSixAxis(themeDir, proseTable ? proseTable.entries : [], scarsTable ? scarsTable.entries : []),
    });

    // Eager geometry: every reachable room + real two-way exits. No stubs.
    const state = getAreaState(areaSlug);
    if (!state) { return; }
    mintAreaGeometry(state);

    // Entry population happens NOW (teleport does not fire the trigger).
    populateEntry(areaSlug, entryRoomId);
}

// ---------------------------------------------------------------------------
// simpleHash - deterministic hash of a string into a 32-bit unsigned integer.
// ---------------------------------------------------------------------------

function simpleHash(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = (Math.imul(h, 0x01000193)) >>> 0;
    }
    return h;
}
