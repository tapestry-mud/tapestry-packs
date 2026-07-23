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
import { seededAreaName } from "./area-namer.js";
import { addOwnedRun } from "./owned-runs.js";
import { soloAreaBiomePalette } from "./roster.js";
import { runKey, setRunState } from "./run-state.js";
import { setAreaState, getAreaState } from "./area-state.js";
import { buildAreaSixAxis } from "./six-axis.js";
import { fillTables, bakedTables, normalizeTables, BAKED_SET_IDS, type OracleTableData } from "./oracle-tables.js";
import { rollTargetRooms, landmarkCount } from "./structure.js";
import { mintAreaGeometry } from "./geometry-mint.js";
import { populateEntry } from "./population.js";
import { EMPTY_ROSTER } from "./area-context.js";
import { getTemplate, registerTemplate, type ThreadTemplate } from "./template-registry.js";
import { clearAreaCaches } from "./area-teardown.js";
import { runEntryRoomId, RUN_NAMESPACE } from "./run-entry.js";

// Re-exported so area-gen.ts remains the documented module-scope home for the shared
// entry-room derivation (Task 5, D6 / validate-plan R2 LOW); the implementation itself
// lives in run-entry.ts, which has no engine-touching imports and is golden-testable
// under plain node (area-gen.ts pulls in population.js -> guide.js, which calls
// tapestry.mobs.registerScript at import time and cannot be loaded outside the Jint
// sandbox) - same split as population.ts/spawn-level.ts.
export { runEntryRoomId } from "./run-entry.js";

// ---------------------------------------------------------------------------
// Configurable constants
// ---------------------------------------------------------------------------

/** Ticks between flavor messages. Tick = 100ms -> 15 ticks = ~1.5s. */
const FLAVOR_INTERVAL = 15;

/**
 * Hard abort ceiling for the flavor-wait loop (~5 min). Generous because the teleport is
 * tied to room READINESS (mint completion), not to this timer - a slow LLM burst completes
 * and teleports whenever it lands. The v3 burst is 6+K calls (K = landmark count), which
 * on a slow local model runs 3-4 minutes for a school area - the old ~90s ceiling fired
 * mid-burst. This ceiling only fires on a true hang, and on expiry it aborts gracefully
 * (a message, no teleport) rather than stranding the player in a room that does not
 * exist yet.
 */
const MAX_TICKS = 3000;

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
// packName:         destination pack name, recorded on the owned-runs entry.
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
    forcedSeed: number | null = null,
    packName: string = ""
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

    // Theme (LLM dressing input) keeps its generic fallback. The DISPLAY name gets the
    // seeded namer when the player supplied neither an idea nor a name - "the wilds" was
    // the same string on every blank run.
    const ideaGiven = !!(idea && idea.trim() !== "");
    const nameGiven = !!(name && name.trim() !== "");
    const ideaHint = ideaGiven ? idea!.trim() : "the wilds";
    let nameHint: string;
    if (nameGiven) {
        nameHint = name!.trim();
    } else if (ideaGiven) {
        nameHint = ideaHint;
    } else {
        nameHint = seededAreaName(areaSeed);
    }
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
        // Step 6: Area state + eager geometry mint (CHUNKED across ticks -
        // the engine caps a Jint entry at 5s and side-car writes are
        // synchronous) + entry population, then Step 7 teleports on the mint
        // completion callback (tied to readiness, never to the flavor timer).
        // -------------------------------------------------------------------

        buildArea(actor, areaSlug, areaSeed, levelRange, biomePalette, ideaHint, targetNamespace, targetRooms, function (): void {
            const gen = pending[playerId];
            if (gen) {
                tapestry.schedule.cancel(handle);
                delete pending[playerId];

                // Ownership: recorded once the graph exists, so roomCount is the real
                // minted count rather than the rolled target. Powers `solo list` and
                // authorizes `solo discard <n>`.
                const minted = (tapestry as any).authoring.getAreaRooms(areaSlug);
                addOwnedRun(playerId, {
                    areaId: areaSlug,
                    name: nameHint,
                    levelRange: levelRange,
                    roomCount: minted ? minted.length : targetRooms,
                    seed: areaSeed,
                    packName: packName,
                });

                tapestry.world.teleportEntity(playerId, gen.entryRoomId);
                tapestry.world.send(playerId, "The pattern settles into place around you.");
                // B.2: provisions are guide-delivered now - the guide spawned
                // with the entry room (populateEntry); point the creator at it
                // instead of silently auto-granting the kit.
                tapestry.world.send(playerId, "A weathered guide waits here. Say HELLO to be outfitted for the road.");
                tapestry.admin.executeAs(playerId, "look");
            }
        });
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
    targetRooms: number,
    onBuilt: () => void
): void {
    const entryRoomId = targetNamespace + ":" + areaSlug + "-entry";

    // Run state before population so the boss clock reads correct state.
    const stateKey = runKey(actor.entityId, areaSlug);
    setRunState(stateKey, { roomsSinceLastBoss: 0, bossFired: false });

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
        runLevel: levelRange[0],
        targetNamespace,
        areaSlug,
        runStateKey: stateKey,
        targetRooms,
        roster: EMPTY_ROSTER,
        sixAxis: buildAreaSixAxis(themeDir, proseTable ? proseTable.entries : [], scarsTable ? scarsTable.entries : []),
    });

    // Eager geometry: every reachable room + real two-way exits. No stubs.
    // Chunked across ticks; entry population + the caller's teleport ride the
    // completion callback (teleport does not fire the population trigger).
    const state = getAreaState(areaSlug);
    if (!state) { return; }
    mintAreaGeometry(state, function (): void {
        populateEntry(areaSlug, entryRoomId);
        onBuilt();
    });
}

// ---------------------------------------------------------------------------
// isAdmin - the same PRIVILEGE-role check commands/solo.ts uses for its admin
// escape hatch (`solo discard <areaId>`). "player"/"mob" are actor-type roles;
// admin/builder are privilege roles - holding either qualifies.
// ---------------------------------------------------------------------------

function isAdmin(actor: any): boolean {
    return actor.hasRole("admin") || actor.hasRole("builder");
}

// ---------------------------------------------------------------------------
// bakeTemplate
//
// Admin bench: runs Steps 1-5 of the old one-shot flow (roll seed, fillTables/
// bakedTables, normalizeTables, freeze tables) against a TEMPLATE area id, with
// no player, no teleport, no pending-gen/flavor state. Registers the draft
// template (Task 4) once tables land. Geometry is NOT minted here - it is a
// cheap per-run step the admin exercises by starting a run (`startRun`).
// ---------------------------------------------------------------------------

export function bakeTemplate(
    actor: any,
    idea: string | null,
    name: string | null,
    bandFloor: number,
    bandCap: number,
    sizeBand: string,
    deathMode: "grind" | "unraveling",
    forcedSeed: number | null
): void {
    const now = Date.now();
    const playerIdHash = simpleHash(String(actor.entityId));
    const areaSeed = forcedSeed !== null ? (forcedSeed >>> 0) : ((now ^ playerIdHash) >>> 0);
    const templateId = "oracle-week-" + (areaSeed >>> 0).toString(16);
    const rng = splitmix64(areaSeed);
    const targetRooms = rollTargetRooms(sizeBand, rng());
    const k = landmarkCount(targetRooms);
    const ideaHint = (idea && idea.trim() !== "") ? idea.trim() : "the wilds";
    const nameHint = (name && name.trim() !== "") ? name.trim() : ideaHint;

    const created = tapestry.authoring.createArea(templateId, nameHint);
    if (!created) {
        // Already baked with this seed - treat as re-bake, continue to overwrite tables.
    }
    tapestry.authoring.setAreaAttribute(templateId, "seed", String(areaSeed));
    tapestry.authoring.setAreaAttribute(templateId, "level_range", bandFloor + "," + bandCap);
    tapestry.authoring.setAreaAttribute(templateId, "wip", "true"); // draft = wip
    tapestry.authoring.setAreaTheme(templateId, ideaHint);
    tapestry.authoring.setAreaShort(templateId, "A thread template, level " + bandFloor + "-" + bandCap + ".");
    tapestry.authoring.setAreaDescription(
        templateId,
        "The " + nameHint + " waits to be woven. Levels " + bandFloor + " to " + bandCap + "."
    );

    const llmEnabled = tapestry.authoring.recommendEnabled && tapestry.authoring.recommendEnabled();
    const finish = function (tables: OracleTableData[]): void {
        const normalized = normalizeTables(tables, k, areaSeed);
        normalized.push({
            kind: "structure",
            entries: [{ w: 10, id: "target-rooms", name: "target_rooms", desc: String(targetRooms) }],
        });
        for (let i = 0; i < normalized.length; i++) {
            (tapestry as any).authoring.writeOracleTable({
                areaId: templateId,
                kind: normalized[i].kind,
                entries: normalized[i].entries,
            });
        }
        registerTemplate({
            templateId, name: nameHint, seed: areaSeed, bandFloor, bandCap, sizeBand,
            bakedSetId: BAKED_SET_IDS[0], state: "draft", deathMode,
        });
        actor.send("Template " + nameHint + " baked as draft (" + templateId + ").\r\n");
        actor.send("Playtest: tapestry start " + templateId + " " + bandFloor + "\r\n");
        actor.send("Open it: mint flip " + templateId + "\r\n");
    };

    if (!llmEnabled) {
        finish(bakedTables(BAKED_SET_IDS[0]));
        return;
    }
    fillTables(ideaHint, [bandFloor, bandCap], k, areaSeed, finish);
}

// ---------------------------------------------------------------------------
// Table kinds a baked/filled template freezes (Steps 1-5, area-gen Step 5 +
// the structure push in bakeTemplate/createSoloArea). instantiateRunArea
// copies exactly these from the template area onto the run's own area id so
// every reader that keys tables off ITS OWN areaId (geometry-mint.ts,
// resolver.ts, a rebooted area-context.ts reload) keeps working unmodified -
// the run area LOOKS self-contained on disk even though the data source was
// the template. "visited"/"grants" are per-run population state, never baked,
// and are deliberately excluded.
// ---------------------------------------------------------------------------

const RUN_TABLE_KINDS = ["places", "landmarks", "mobs", "boss", "items", "prose", "sectors", "scars", "structure"];

function copyTemplateTables(templateId: string, runAreaId: string): void {
    for (let i = 0; i < RUN_TABLE_KINDS.length; i++) {
        const kind = RUN_TABLE_KINDS[i];
        const t = (tapestry as any).oracle.table(templateId + ":" + kind);
        if (t && t.entries) {
            (tapestry as any).authoring.writeOracleTable({ areaId: runAreaId, kind, entries: t.entries });
        }
    }
}

/** Reads target_rooms back off a frozen "structure" table (same parse as
 *  area-context.ts's reload path). Defaults to 40 when absent. */
function readTargetRooms(areaId: string): number {
    const structTable = (tapestry as any).oracle.table(areaId + ":structure");
    if (structTable && structTable.entries) {
        for (let i = 0; i < structTable.entries.length; i++) {
            const e = structTable.entries[i];
            if (e && String(e.id) === "target-rooms") {
                const t = parseInt(String(e.desc), 10);
                if (!isNaN(t) && t > 0) { return t; }
            }
        }
    }
    return 40;
}

// ---------------------------------------------------------------------------
// teardownRun
//
// Deletes a run area (engine sweep + this pack's own in-memory caches, the
// same two-step solo.ts's `solo discard` uses) and clears the player's active-
// run pointer. Exported for Task 12/13's death/leave listeners; used here by
// startRun to enforce "one active run per player" (spec 3.1a).
// ---------------------------------------------------------------------------

export function teardownRun(playerId: string, runAreaId: string): void {
    const swept = (tapestry as any).authoring.deleteArea(runAreaId);
    if (swept) {
        clearAreaCaches(runAreaId);
    }
    (tapestry as any).world.setProperty(playerId, "oracle_active_run", "");
}

// ---------------------------------------------------------------------------
// startRun
//
// Per-player run start: numeric, no LLM. Validates the level against the
// template's band window, tears down any prior active run (one run per
// player - spec 3.1a), mints a fresh per-player run area from the template
// seed, sets the return-address to the hub room, records oracle_active_run,
// then hands off to instantiateRunArea for the geometry+populate+teleport.
// ---------------------------------------------------------------------------

export function startRun(actor: any, templateId: string, level: number): void {
    const tpl = getTemplate(templateId);
    if (!tpl) {
        actor.send("No such thread.\r\n");
        return;
    }
    if (tpl.state !== "open" && !isAdmin(actor)) {
        actor.send("That thread is not open yet.\r\n");
        return;
    }
    if (level < tpl.bandFloor || level > tpl.bandCap) {
        actor.send("Pick a level between " + tpl.bandFloor + " and " + tpl.bandCap + ".\r\n");
        return;
    }

    const playerId = actor.entityId;
    const hubRoomId = actor.roomId; // where they pulled the thread = home

    // One active run per player (spec 3.1a): tear down any prior instance
    // before minting the new one, so orphan run areas cannot accumulate.
    const priorRaw = (tapestry as any).world.getProperty(playerId, "oracle_active_run");
    if (priorRaw) {
        const priorAreaId = String(priorRaw).split("|")[0];
        if (priorAreaId) {
            teardownRun(playerId, priorAreaId);
        }
    }

    // Unique run area from the template seed (deterministic geometry, per-player id).
    const runSlug = "oracle-run-" + (tpl.seed >>> 0).toString(16) + "-" + simpleHash(String(playerId)).toString(16);
    // ONE shared derivation for the entry-room id (D6 / validate-plan R2 LOW): both the
    // composite carrier written here AND the geometry mint in instantiateRunArea call
    // runEntryRoomId, so the death handler's respawn target and the room actually
    // minted can never drift.
    const entryRoomId = runEntryRoomId(runSlug);

    // Set the return-address so `leave` works (engine service, previously never called).
    tapestry.returnaddress.set(String(playerId), hubRoomId);
    // Record the active run as the pipe COMPOSITE "<runAreaId>|<deathMode>|<entryRoomId>" so
    // the core death handler (Task 12) reads the tier AND the respawn point without importing
    // oracle's in-memory state. This is the ONLY death-mode carrier - do NOT also stash the
    // mode on AreaState.
    (tapestry as any).world.setProperty(playerId, "oracle_active_run", runSlug + "|" + tpl.deathMode + "|" + entryRoomId);

    // Load the template's frozen tables and drive the existing geometry+populate path at `level`.
    instantiateRunArea(actor, tpl, runSlug, level);
}

// ---------------------------------------------------------------------------
// instantiateRunArea
//
// The extracted buildArea-equivalent path for a per-player run: creates the
// run's own area record, COPIES the template's frozen tables onto it (no LLM,
// no re-roll - geometry-mint.ts and resolver.ts both key table reads off
// their caller's OWN areaId, so this keeps them unmodified), sets AreaState
// with runLevel = the player-dialed level (levelRange stays the template's
// authored band window - spawnLevel, Task 2, prefers runLevel), mints
// geometry + populates entry, then teleports on the mint completion callback.
//
// runLevel feeds ONLY the spawn/stat path (population.ts's spawnLevel). It is
// never passed to mintAreaGeometry or any roster-selection call here - both
// key on areaSeed + targetRooms/sizeBand alone, so two runs from the same
// template mint IDENTICAL geometry and IDENTICAL roster identity regardless
// of the level each player dialed (spec 3.1's determinism claim).
// ---------------------------------------------------------------------------

function instantiateRunArea(
    actor: any,
    tpl: ThreadTemplate,
    runSlug: string,
    level: number
): void {
    const playerId = actor.entityId;

    // Register the RUN_NAMESPACE destination pack before minting rooms into it -
    // createRoom only accepts a registered namespace (the same createPack step
    // solo-flow.ts does before calling createSoloArea). PackNamespace() maps a
    // slash-free pack name to itself, so createPack(RUN_NAMESPACE) registers
    // EXACTLY "oracle-run" - the same constant runEntryRoomId derives from.
    // Idempotent: a namespace already registered short-circuits to a cheap
    // lookup, so calling this on every run start is safe.
    (tapestry as any).authoring.createPack(RUN_NAMESPACE);

    const created = tapestry.authoring.createArea(runSlug, tpl.name);
    if (!created) {
        // Same player restarting the same template (runSlug is player+template stable) -
        // reuse the existing area record, continue to overwrite its tables below.
    }
    tapestry.authoring.setAreaAttribute(runSlug, "seed", String(tpl.seed));
    tapestry.authoring.setAreaAttribute(runSlug, "level_range", tpl.bandFloor + "," + tpl.bandCap);
    tapestry.authoring.setAreaAttribute(runSlug, "reset_interval", "2000");

    const templateArea = (tapestry as any).area && (tapestry as any).area.get(tpl.templateId);
    const theme = templateArea && typeof templateArea.theme === "string" && templateArea.theme !== ""
        ? templateArea.theme
        : tpl.name;
    tapestry.authoring.setAreaTheme(runSlug, theme);
    tapestry.authoring.setAreaShort(runSlug, "A thread, level " + tpl.bandFloor + "-" + tpl.bandCap + ".");
    tapestry.authoring.setAreaDescription(
        runSlug,
        "The " + tpl.name + " unfolds before you. Levels " + tpl.bandFloor + " to " + tpl.bandCap + "."
    );

    copyTemplateTables(tpl.templateId, runSlug);
    const targetRooms = readTargetRooms(runSlug);
    const biomePalette = soloAreaBiomePalette(tpl.seed);

    const stateKey = runKey(playerId, runSlug);
    setRunState(stateKey, { roomsSinceLastBoss: 0, bossFired: false });

    const themeDir = theme.toLowerCase().indexOf("underdeep") !== -1 ? "endless-underdeep" : "";
    const proseTable = (tapestry as any).oracle.table(runSlug + ":prose");
    const scarsTable = (tapestry as any).oracle.table(runSlug + ":scars");

    setAreaState(runSlug, {
        areaId: runSlug,
        areaSeed: tpl.seed,
        biomePalette,
        theme,
        levelRange: [tpl.bandFloor, tpl.bandCap],
        runLevel: level,
        targetNamespace: RUN_NAMESPACE,
        areaSlug: runSlug,
        runStateKey: stateKey,
        targetRooms,
        roster: EMPTY_ROSTER,
        sixAxis: buildAreaSixAxis(themeDir, proseTable ? proseTable.entries : [], scarsTable ? scarsTable.entries : []),
    });

    const state = getAreaState(runSlug);
    if (!state) { return; }
    const entryRoomId = runEntryRoomId(runSlug);
    mintAreaGeometry(state, function (): void {
        populateEntry(runSlug, entryRoomId);
        tapestry.world.teleportEntity(playerId, entryRoomId);
        tapestry.world.send(playerId, "The thread pulls taut and draws you in.");
        tapestry.admin.executeAs(playerId, "look");
    });
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
