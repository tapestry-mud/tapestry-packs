// area-gen.ts - Roll + create a solo oracle area.
//
// createSoloArea is the sole entry point called by P7's solo flow.
// It follows spec section 3 "At area creation" exactly.
//
// Dice own FACTS: seed, biome_palette, level_range, size_target, roster stats, exit directions.
// LLM owns DRESSING: theme/short/description names, descs - non-load-bearing, placeholder on fail.
//
// biome_palette is rolled from the area seed alone (decision 2: `solo <name>` steers
// LLM prose ONLY, never the rolled palette). The name is passed as the LLM theme hint.
//
// Entry room is fully materialized: materializeRoom creates the room, sets stub exits,
// spawns ambient mobs, and evaluates the boss clock. The entry room is count 0 so
// bossClockFires threshold is 0% (entry room is structurally boss-free), counter becomes 1.
//
// The area is fully PLAYABLE immediately (facts written, stub exits render, player
// is teleported in). LLM prose may arrive slightly after teleport.

import * as tapestry from "@tapestry/engine";
import { splitmix64 } from "./prng.js";
import { rollRoster, dressRoster, rollBiomePalette } from "./roster.js";
import { getPrompt } from "./prompts.js";
import { runKey, setRunState } from "./run-state.js";
import { setAreaState, setRoomArea, setRoomPath } from "./area-state.js";
import { rollRoomFacts, materializeRoom } from "./room-gen.js";

// ---------------------------------------------------------------------------
// Configurable constants
// ---------------------------------------------------------------------------

/** Possible number of rooms in the generated area (rolled from seed). */
const SIZE_TARGET_OPTIONS = [8, 10, 12, 15, 20];

// ---------------------------------------------------------------------------
// createSoloArea
//
// actor: the command actor (entityId, roomId, send)
// name: user-supplied area name hint (null/blank = roll a generic hint). LLM-only.
// minLevel, maxLevel: from the flow's guards
// targetNamespace: the scratch pack namespace prefix (default "oracle-run").
//                  P7 supplies "@scratch/oracle-run"'s namespace; this is the prefix
//                  on the room id, e.g. "oracle-run:..." so createRoom can find the pack.
// ---------------------------------------------------------------------------

export function createSoloArea(
    actor: any,
    name: string | null,
    minLevel: number,
    maxLevel: number,
    targetNamespace: string = "oracle-run"
): void {
    // -----------------------------------------------------------------------
    // Step 1: Roll the descriptor (dice own all facts).
    // -----------------------------------------------------------------------

    // The area seed is rolled from the current timestamp + player id hash (unseeded
    // entropy at creation time). This is the ONE unseeded roll - after this, everything
    // is deterministic from the seed.
    const now = Date.now();
    const playerIdHash = simpleHash(String(actor.entityId));
    const areaSeed = (now ^ playerIdHash) >>> 0;

    const rng = splitmix64(areaSeed);

    // biome_palette: rolled from the area seed alone (name-independent, decision 2).
    const biomePalette = rollBiomePalette(rng);
    const primaryBiome = biomePalette[0];

    // size_target: how many rooms this area targets (reserved for future room-count gating).
    const _sizeTarget = SIZE_TARGET_OPTIONS[Math.floor(rng() * SIZE_TARGET_OPTIONS.length)];

    // Unique bare area id. Use a deterministic slug from seed + timestamp segment.
    const areaSlug = targetNamespace + "-" + (areaSeed >>> 0).toString(16);

    // -----------------------------------------------------------------------
    // Step 2: Stamp oracle_seed on the player.
    // -----------------------------------------------------------------------

    tapestry.world.setProperty(actor.entityId, "oracle_seed", areaSeed);

    // -----------------------------------------------------------------------
    // Step 3: Roll the roster (dice own all mob/boss/loot facts).
    // -----------------------------------------------------------------------

    const levelRange: [number, number] = [minLevel, maxLevel];
    const roster = rollRoster(areaSeed, levelRange);

    // -----------------------------------------------------------------------
    // Step 4: Create the area - FACTS first, then async dressing.
    //
    // createArea(bareAreaId, name) creates the area and writes area.yaml.
    // setAreaAttribute sets reset_interval: 0 (repop-off guard E4) + level_range.
    // Placeholder dressing makes the area complete + playable instantly.
    // LLM dressing arrives async and is best-effort (placeholder stands on null).
    //
    // Note: oracle.yaml (seed, biome_palette, roster types) is conceptually the
    // oracle sidecar documented in the spec. In slice 1 this data lives in-memory
    // (run-state + module state). A persistent oracle.yaml writer (for freeze-and-share
    // replay across reboots) is a deferred slice-2 concern that requires a pack-data
    // write seam (no such engine API exists today). Within a session, the run-state
    // cell and the roster held in the solo flow's closure are sufficient for P4-P6.
    // -----------------------------------------------------------------------

    const created = tapestry.authoring.createArea(areaSlug, name || primaryBiome + " wilds");
    if (!created) {
        actor.send("Could not create oracle area. Try again.\r\n");
        return;
    }

    // Set level_range + reset_interval: 0 (no repop).
    tapestry.authoring.setAreaAttribute(areaSlug, "level_range", minLevel + "," + maxLevel);
    tapestry.authoring.setAreaAttribute(areaSlug, "reset_interval", "0");

    // Set a placeholder theme/short/description immediately so the area is complete.
    const nameHint = name || primaryBiome + " wilds";
    tapestry.authoring.setAreaTheme(areaSlug, nameHint);
    tapestry.authoring.setAreaShort(areaSlug, "A " + primaryBiome + " area, level " + minLevel + "-" + maxLevel + ".");
    tapestry.authoring.setAreaDescription(
        areaSlug,
        "The " + nameHint + " stretches before you. A " + primaryBiome + " expanse, levels " +
        minLevel + " to " + maxLevel + "."
    );

    // -----------------------------------------------------------------------
    // Step 5: Roll entry-room facts + materialize (P7 wiring).
    //
    // materializeRoom creates the room, sets stub exits, spawns ambient mobs,
    // and evaluates the boss clock. runState must be constructed BEFORE this
    // call (entry room is count 0 so bossClockFires threshold = 0%, counter
    // becomes 1 after the call).
    // -----------------------------------------------------------------------

    const entryRoomId = targetNamespace + ":" + areaSlug + "-entry";
    const entryRoomPath = "0,0";

    // -----------------------------------------------------------------------
    // Step 6: Construct and store the RunState cell.
    // Must happen before materializeRoom so the boss-clock reads correct state.
    // -----------------------------------------------------------------------

    const stateKey = runKey(actor.entityId, areaSlug);
    const entryRunState = { roomsSinceLastBoss: 0 };
    setRunState(stateKey, entryRunState);

    // Roll facts and materialize the entry room.
    const entryFacts = rollRoomFacts(areaSeed, entryRoomPath, roster);
    materializeRoom(
        entryRoomId,
        areaSlug,
        entryFacts,
        roster,
        entryRunState,
        primaryBiome,
        nameHint
    );

    // -----------------------------------------------------------------------
    // Step 6b: Back-populate area-state so the stub resolver can reach the
    // roster + biome palette + run state without a playerId parameter.
    // -----------------------------------------------------------------------

    setAreaState(areaSlug, {
        areaId: areaSlug,
        areaSeed,
        biomePalette,
        theme: name || primaryBiome + " wilds",
        levelRange,
        targetNamespace,
        areaSlug,
        runStateKey: stateKey,
        roster,
    });

    // Register the entry room's area ownership + coordinate path.
    setRoomArea(entryRoomId, areaSlug);
    setRoomPath(entryRoomId, "0,0");

    // -----------------------------------------------------------------------
    // Step 7: Teleport the player into the entry room.
    // The player lands on facts NOW. LLM dressing arrives async.
    // -----------------------------------------------------------------------

    tapestry.world.teleportEntity(actor.entityId, entryRoomId);

    // -----------------------------------------------------------------------
    // Async dressing (best-effort, runs AFTER teleport).
    // Recommend the area theme, entry room prose. Placeholder already stands.
    // -----------------------------------------------------------------------

    const canRecommend = tapestry.authoring.recommendEnabled &&
        tapestry.authoring.recommendEnabled();

    if (canRecommend) {
        // Dress area theme.
        const areaPr = getPrompt("area_theme");
        tapestry.authoring.recommend(
            {
                field: "theme",
                template: areaPr.template,
                system: areaPr.system,
                vars: {
                    biome: primaryBiome,
                    level_min: String(minLevel),
                    level_max: String(maxLevel),
                    name_hint: nameHint,
                },
            },
            (themeResult: string | null) => {
                const theme = themeResult || nameHint;
                tapestry.authoring.setAreaTheme(areaSlug, theme);

                // Area short after theme resolves.
                const shortPr = getPrompt("area_short");
                tapestry.authoring.recommend(
                    {
                        field: "short",
                        template: shortPr.template,
                        system: shortPr.system,
                        vars: { biome: primaryBiome, theme },
                    },
                    (shortResult: string | null) => {
                        if (shortResult) {
                            tapestry.authoring.setAreaShort(areaSlug, shortResult);
                        }
                    }
                );

                // Area long desc.
                const longPr = getPrompt("area_long");
                tapestry.authoring.recommend(
                    {
                        field: "description",
                        template: longPr.template,
                        system: longPr.system,
                        vars: {
                            biome: primaryBiome,
                            theme,
                            level_min: String(minLevel),
                            level_max: String(maxLevel),
                        },
                    },
                    (longResult: string | null) => {
                        if (longResult) {
                            tapestry.authoring.setAreaDescription(areaSlug, longResult);
                        }
                    }
                );
            }
        );

    }

    // Dress the roster async (best-effort).
    dressRoster(roster, primaryBiome);
}

// ---------------------------------------------------------------------------
// simpleHash - deterministic hash of a string into a 32-bit unsigned integer.
// Used to fold the player id into the initial area seed.
// ---------------------------------------------------------------------------

function simpleHash(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = (Math.imul(h, 0x01000193)) >>> 0;
    }
    return h;
}
