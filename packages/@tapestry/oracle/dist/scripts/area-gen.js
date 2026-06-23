// area-gen.ts - Roll + create a solo oracle area.
//
// createSoloArea is the sole entry point called by P7's solo flow.
// It follows spec section 3 "At area creation" exactly.
//
// CREATION FLOW (P-E rework):
//   1. Roll area seed + create area + set seed/level_range/reset_interval via authoring.
//   2. Call fillTables (LLM burst) - front-loaded at creation, NOT per-room.
//   3. In onReady: freeze every returned table to disk via writeOracleTable.
//   4. Mint the entry room from frozen tables + teleport player in.
//   5. Zero per-room LLM calls remain in the hot path.
//
// Dice own FACTS: seed, level_range, size_target, exit directions.
// LLM owns DRESSING: place palette, mob/item names, prose fragments.
// All LLM work happens in fillTables before the player lands.
//
// Entry room is fully materialized: materializeRoom creates the room, sets stub exits,
// spawns ambient mobs, and evaluates the boss clock. The entry room is count 0 so
// bossClockFires threshold is 0% (entry room is structurally boss-free), counter becomes 1.
//
// The player waits behind a flavor-message loop until fillTables calls onReady
// (or MAX_TICKS elapses). Then teleports to the fully-built entry room.
import * as tapestry from "@tapestry/engine";
import { splitmix64 } from "./prng.js";
import { rollBiomePalette } from "./roster.js";
import { runKey, setRunState } from "./run-state.js";
import { setAreaState, setRoomArea, setRoomPath } from "./area-state.js";
import { rollRoomFacts, materializeRoom } from "./room-gen.js";
import { fillTables } from "./oracle-tables.js";
// ---------------------------------------------------------------------------
// Configurable constants
// ---------------------------------------------------------------------------
/** Possible number of rooms in the generated area (rolled from seed). */
const SIZE_TARGET_OPTIONS = [8, 10, 12, 15, 20];
/** Ticks between flavor messages. Tick = 100ms -> 15 ticks = ~1.5s. */
const FLAVOR_INTERVAL = 15;
/** Safety: teleport even if tables never land (~20s). */
const MAX_TICKS = 200;
// ---------------------------------------------------------------------------
// Flavor messages shown while tables are being filled.
// Sent in rotating order via idx. Each is rendered with "..." appended.
// ---------------------------------------------------------------------------
const FLAVOR = [
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
const pending = {};
// ---------------------------------------------------------------------------
// createSoloArea
//
// actor:            the command actor (entityId, roomId, send)
// idea:             user-supplied area name/idea hint (null/blank = "wilderness").
// minLevel:         lower end of the level range.
// maxLevel:         upper end of the level range.
// targetNamespace:  the scratch pack namespace prefix (default "oracle-run").
//                   P7 supplies "@scratch/oracle-run"'s namespace; this is the prefix
//                   on the room id, e.g. "oracle-run:..." so createRoom can find the pack.
// ---------------------------------------------------------------------------
export function createSoloArea(actor, idea, minLevel, maxLevel, targetNamespace = "oracle-run") {
    // -----------------------------------------------------------------------
    // Step 1: Roll the area seed (single unseeded roll - everything else is
    //         deterministic from it). Create the area authoring record.
    // -----------------------------------------------------------------------
    const now = Date.now();
    const playerIdHash = simpleHash(String(actor.entityId));
    const areaSeed = (now ^ playerIdHash) >>> 0;
    const rng = splitmix64(areaSeed);
    // size_target: how many rooms this area targets (reserved for future room-count gating).
    const _sizeTarget = SIZE_TARGET_OPTIONS[Math.floor(rng() * SIZE_TARGET_OPTIONS.length)];
    // Unique bare area id. Deterministic slug from seed.
    const areaSlug = targetNamespace + "-" + (areaSeed >>> 0).toString(16);
    const nameHint = (idea && idea.trim() !== "") ? idea.trim() : "the wilds";
    const levelRange = [minLevel, maxLevel];
    const created = tapestry.authoring.createArea(areaSlug, nameHint);
    if (!created) {
        actor.send("Could not create oracle area. Try again.\r\n");
        return;
    }
    // Persist seed to area.yaml (T5 seam) - used on reload/share.
    tapestry.authoring.setAreaAttribute(areaSlug, "seed", String(areaSeed));
    tapestry.authoring.setAreaAttribute(areaSlug, "level_range", minLevel + "," + maxLevel);
    tapestry.authoring.setAreaAttribute(areaSlug, "reset_interval", "0");
    // Placeholder dressing - makes the area immediately valid + playable.
    tapestry.authoring.setAreaTheme(areaSlug, nameHint);
    tapestry.authoring.setAreaShort(areaSlug, "An area, level " + minLevel + "-" + maxLevel + ".");
    tapestry.authoring.setAreaDescription(areaSlug, "The " + nameHint + " stretches before you. Levels " + minLevel + " to " + maxLevel + ".");
    // -----------------------------------------------------------------------
    // Step 2: Roll biome palette (name-independent, seed-driven).
    //         This is separate from the places table: biomes control terrain
    //         tags, places control prose palette word choice.
    // -----------------------------------------------------------------------
    const biomePalette = rollBiomePalette(rng);
    const playerId = actor.entityId;
    // -----------------------------------------------------------------------
    // Step 3: Start the flavor-wait loop immediately so the player sees
    //         activity while fillTables is resolving.
    //
    //         The loop fires every FLAVOR_INTERVAL ticks. When ready=true
    //         (set by onReady below) or ticks >= MAX_TICKS, it teleports.
    //
    //         handle is captured by step's closure (assigned before step
    //         first runs, so self-cancel in step() works correctly).
    //         All callbacks run on the single game-loop thread - no races.
    // -----------------------------------------------------------------------
    // Register the pending entry BEFORE fillTables so the synchronous
    // (LLM-off) onReady callback finds the entry and can mark it ready.
    pending[playerId] = {
        entryRoomId: targetNamespace + ":" + areaSlug + "-entry",
        ready: false,
        ticks: 0,
        idx: 0,
    };
    let handle;
    const step = function () {
        const gen = pending[playerId];
        if (!gen) {
            tapestry.schedule.cancel(handle);
            return;
        }
        gen.ticks += FLAVOR_INTERVAL;
        if (gen.ready || gen.ticks >= MAX_TICKS) {
            tapestry.schedule.cancel(handle);
            delete pending[playerId];
            tapestry.world.teleportEntity(playerId, gen.entryRoomId);
            // teleportEntity does NOT auto-render the room - dispatch look as the player.
            tapestry.world.send(playerId, "The pattern settles into place around you.");
            tapestry.admin.executeAs(playerId, "look");
            return;
        }
        tapestry.world.send(playerId, FLAVOR[gen.idx % FLAVOR.length]);
        gen.idx += 1;
    };
    handle = tapestry.schedule.every(FLAVOR_INTERVAL, step);
    // -----------------------------------------------------------------------
    // Step 4: Front-loaded LLM burst. fillTables fires all LLM calls
    //         (places, mobs, boss, items, prose) respecting the in-flight limit.
    //         onReady is called exactly once when all tables have resolved.
    // -----------------------------------------------------------------------
    const ideaStr = nameHint;
    fillTables(ideaStr, levelRange, function (tables) {
        // -------------------------------------------------------------------
        // Step 5: Freeze every returned table to disk (T4 seam).
        //         Tables are now live in the engine registry AND written to
        //         the area sidecar so they survive reboot/share (T6).
        // -------------------------------------------------------------------
        for (let i = 0; i < tables.length; i++) {
            const t = tables[i];
            tapestry.authoring.writeOracleTable({
                areaId: areaSlug,
                kind: t.kind,
                entries: t.entries,
            });
        }
        // -------------------------------------------------------------------
        // Step 6: Build the entry room from the now-frozen tables.
        // -------------------------------------------------------------------
        buildEntryRoom(actor, areaSlug, areaSeed, levelRange, biomePalette, nameHint, targetNamespace);
        // -------------------------------------------------------------------
        // Step 7: Mark ready - the wait loop will teleport on its next tick.
        // -------------------------------------------------------------------
        if (pending[playerId]) {
            pending[playerId].ready = true;
        }
    });
}
// ---------------------------------------------------------------------------
// buildEntryRoom
//
// Rolls + materializes the entry room from the frozen tables.
// The entry room id is fixed: targetNamespace + ":" + areaSlug + "-entry".
// Registers all area-state + room-state needed by the stub resolver.
// ---------------------------------------------------------------------------
function buildEntryRoom(actor, areaSlug, areaSeed, levelRange, biomePalette, nameHint, targetNamespace) {
    const entryRoomId = targetNamespace + ":" + areaSlug + "-entry";
    const entryRoomPath = "0,0";
    const primaryBiome = biomePalette[0] || "wilds";
    // -------------------------------------------------------------------
    // Construct and store the RunState cell.
    // Must happen before materializeRoom so the boss-clock reads correct state.
    // -------------------------------------------------------------------
    const stateKey = runKey(actor.entityId, areaSlug);
    const entryRunState = { roomsSinceLastBoss: 0 };
    setRunState(stateKey, entryRunState);
    // -------------------------------------------------------------------
    // Back-populate area-state so the stub resolver can reach the
    // biome palette + run state + seed without a playerId parameter.
    // The roster field is kept for compatibility but is no longer used
    // in the hot path (frozen tables replace it). Pass a null-safe stub.
    // -------------------------------------------------------------------
    setAreaState(areaSlug, {
        areaId: areaSlug,
        areaSeed,
        biomePalette,
        theme: nameHint,
        levelRange,
        targetNamespace,
        areaSlug,
        runStateKey: stateKey,
        // Roster is no longer used in P-E (frozen tables replace it).
        // Pass a minimal stub so the AreaState type is satisfied.
        roster: { mobs: [], boss: null, loot: [] },
    });
    // Register the entry room's area ownership + coordinate path.
    setRoomArea(entryRoomId, areaSlug);
    setRoomPath(entryRoomId, entryRoomPath);
    // -------------------------------------------------------------------
    // Roll room facts (pure, no engine calls) + materialize.
    // materializeRoom now uses composeProse (P-D) instead of recommend.
    // The Roster parameter is still accepted by materializeRoom's signature
    // but the new version of materializeRoom reads frozen tables instead.
    // We pass the nulled roster stub for signature compatibility until P-G
    // canonically removes it.
    // -------------------------------------------------------------------
    const entryFacts = rollRoomFacts(areaSeed, entryRoomPath, { mobs: [], boss: null, loot: [] }, primaryBiome);
    materializeRoom(entryRoomId, areaSlug, areaSeed, entryFacts, entryRunState, primaryBiome, nameHint);
}
// ---------------------------------------------------------------------------
// simpleHash - deterministic hash of a string into a 32-bit unsigned integer.
// Used to fold the player id into the initial area seed.
// ---------------------------------------------------------------------------
function simpleHash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = (Math.imul(h, 0x01000193)) >>> 0;
    }
    return h;
}
