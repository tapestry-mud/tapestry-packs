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
import { soloAreaBiomePalette } from "./roster.js";
import { runKey, setRunState } from "./run-state.js";
import { setAreaState, setRoomArea, setRoomPath } from "./area-state.js";
import { rollRoomFacts, materializeRoom } from "./room-gen.js";
import { fillTables, bakedTables, BAKED_SET_IDS } from "./oracle-tables.js";
import { getMintedSet } from "./stub-resolver.js";
// ---------------------------------------------------------------------------
// Configurable constants
// ---------------------------------------------------------------------------
/** Possible number of rooms in the generated area (rolled from seed). */
const SIZE_TARGET_OPTIONS = [8, 10, 12, 15, 20];
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
export function createSoloArea(actor, idea, name, minLevel, maxLevel, targetNamespace = "oracle-run", bakedSetId = BAKED_SET_IDS[0]) {
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
    // ideaHint feeds the LLM prompt context (concept / theme of the area).
    // nameHint is the display name shown to players; defaults to ideaHint if not supplied.
    const ideaHint = (idea && idea.trim() !== "") ? idea.trim() : "the wilds";
    const nameHint = (name && name.trim() !== "") ? name.trim() : ideaHint;
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
    // Theme = the IDEA (drives room naming "<theme> - <biome>"), persisted so a
    // reboot reconstruction (stub-resolver) names new rooms identically. The area's
    // display NAME stays nameHint; theme is the generative concept, not the name.
    tapestry.authoring.setAreaTheme(areaSlug, ideaHint);
    tapestry.authoring.setAreaShort(areaSlug, "An area, level " + minLevel + "-" + maxLevel + ".");
    tapestry.authoring.setAreaDescription(areaSlug, "The " + nameHint + " stretches before you. Levels " + minLevel + " to " + maxLevel + ".");
    // -----------------------------------------------------------------------
    // Step 2: Roll biome palette (name-independent, seed-driven).
    //         This is separate from the places table: biomes control terrain
    //         tags, places control prose palette word choice.
    // -----------------------------------------------------------------------
    // Derive via the shared helper so a reboot reconstruction (stub-resolver) gets the
    // byte-identical palette off the persisted seed. (Helper re-consumes the size_target
    // roll internally, matching this stream's position - see soloAreaBiomePalette.)
    const biomePalette = soloAreaBiomePalette(areaSeed);
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
    // (LLM-off) onReady callback finds the entry and teleports.
    pending[playerId] = {
        entryRoomId: targetNamespace + ":" + areaSlug + "-entry",
        ticks: 0,
        idx: 0,
    };
    let handle;
    // The wait loop is FLAVOR ONLY. The teleport lives in onReadyTables (tied to the room
    // actually being built), so a slow LLM burst can never strand the player in the void.
    // On the hard ceiling this aborts gracefully - no teleport into a not-yet-built room.
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
            // A late onReadyTables will see pending gone and skip the teleport; the area
            // still freezes to disk and can be re-entered. Player stays where they are.
            tapestry.world.send(playerId, "The oracle's weaving falters. Try `solo` again in a moment.");
            return;
        }
        tapestry.world.send(playerId, FLAVOR[gen.idx % FLAVOR.length]);
        gen.idx += 1;
    };
    handle = tapestry.schedule.every(FLAVOR_INTERVAL, step);
    // -----------------------------------------------------------------------
    // Step 4: Front-loaded table fill.
    //
    // LLM-on:  fillTables fires the full LLM burst respecting RecommendMaxInFlight=2.
    //          onReady is called exactly once when all tables have resolved.
    //
    // LLM-off: skip the LLM path entirely - use the baked table set directly.
    //          onReady is called synchronously on the same tick.
    //          The pending entry is registered above so the synchronous callback
    //          finds it and marks it ready before the wait loop's first tick.
    // -----------------------------------------------------------------------
    // Use ideaHint (the concept) as the LLM context string - this is the descriptive phrase
    // that drives table generation. nameHint (the display name) is used for room/area labels.
    const ideaStr = ideaHint;
    const llmEnabled = tapestry.authoring.recommendEnabled && tapestry.authoring.recommendEnabled();
    if (!llmEnabled) {
        const tables = bakedTables(bakedSetId);
        onReadyTables(tables);
        return;
    }
    fillTables(ideaStr, levelRange, onReadyTables);
    function onReadyTables(tables) {
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
        buildEntryRoom(actor, areaSlug, areaSeed, levelRange, biomePalette, ideaHint, nameHint, targetNamespace);
        // -------------------------------------------------------------------
        // Step 7: Teleport into the now-built entry room. Tied to room readiness
        //         (here), NOT to the flavor timer, so a slow LLM burst can never
        //         strand the player in the void. If the wait loop already aborted
        //         (pending gone), the room is still frozen to disk; skip teleport.
        // -------------------------------------------------------------------
        const gen = pending[playerId];
        if (gen) {
            tapestry.schedule.cancel(handle);
            delete pending[playerId];
            tapestry.world.teleportEntity(playerId, gen.entryRoomId);
            // teleportEntity does NOT auto-render the room - dispatch look as the player.
            tapestry.world.send(playerId, "The pattern settles into place around you.");
            tapestry.admin.executeAs(playerId, "look");
        }
    }
}
// ---------------------------------------------------------------------------
// buildEntryRoom
//
// Rolls + materializes the entry room from the frozen tables.
// The entry room id is fixed: targetNamespace + ":" + areaSlug + "-entry".
// Registers all area-state + room-state needed by the stub resolver.
// ---------------------------------------------------------------------------
function buildEntryRoom(actor, areaSlug, areaSeed, levelRange, biomePalette, ideaHint, nameHint, targetNamespace) {
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
    // Roster is no longer consulted in P-E (frozen tables replace it).
    // Pass an empty-but-typed stub so the AreaState type is satisfied without a null cast.
    const emptyRoster = {
        mobs: [],
        boss: {
            ref: "", base: "", level: 0, hp: 0, damage: "",
            swell_baseline_gap_ticks: 0, swell_jitter_ticks: 0, swell_telegraph_ticks: 0,
            swell_window_ticks: 0, swell_chunk_pct: 0, swell_whiff_pct: 0, swell_weather_pct: 0,
            name: "",
        },
        loot: [],
    };
    setAreaState(areaSlug, {
        areaId: areaSlug,
        areaSeed,
        biomePalette,
        theme: ideaHint,
        levelRange,
        targetNamespace,
        areaSlug,
        runStateKey: stateKey,
        roster: emptyRoster,
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
    const entryFacts = rollRoomFacts(areaSeed, entryRoomPath, emptyRoster, primaryBiome);
    materializeRoom(entryRoomId, areaSlug, areaSeed, entryFacts, entryRunState, primaryBiome, ideaHint, getMintedSet(areaSlug));
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
