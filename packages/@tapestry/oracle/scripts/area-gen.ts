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
// Entry room is a SHELL only. It has stub exits and area/room prose via recommend
// (placeholder fallback), but no ambient mob spawns and no boss-clock evaluation.
// Those require materializeRoom (P4) which imports run-state.ts and room-gen.ts.
// P7 wires the entry-room beat: materializeRoom(entryRoomId, ...) once P4/P5/P6 exist.
//
// The area is fully PLAYABLE immediately (facts written, stub exits render, player
// is teleported in). LLM prose may arrive slightly after teleport.

import * as tapestry from "@tapestry/engine";
import { splitmix64 } from "./prng.js";
import { rollRoster, dressRoster, rollBiomePalette } from "./roster.js";
import { getPrompt, placeholder } from "./prompts.js";
import { runKey, setRunState } from "./run-state.js";
import { setAreaState, setRoomArea, setRoomPath } from "./area-state.js";

// ---------------------------------------------------------------------------
// Configurable constants
// ---------------------------------------------------------------------------

/** Possible number of rooms in the generated area (rolled from seed). */
const SIZE_TARGET_OPTIONS = [8, 10, 12, 15, 20];

/** Default exit directions for the entry room. Rolled from seed. */
const ALL_DIRECTIONS = ["north", "south", "east", "west"];

/** Minimum exits on the entry room. */
const ENTRY_EXIT_MIN = 2;
/** Maximum exits on the entry room. */
const ENTRY_EXIT_MAX = 4;

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

    // size_target: how many rooms this area targets.
    const sizeTarget = SIZE_TARGET_OPTIONS[Math.floor(rng() * SIZE_TARGET_OPTIONS.length)];

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
    // Step 5: Create the entry room (SHELL - no mob spawns, no boss-clock).
    //
    // Room id: targetNamespace:areaSlug-entry
    // The targetNamespace prefix is how createRoom finds which pack to write into.
    // Stub exits are set for rolled directions (E3: setStubExit).
    // -----------------------------------------------------------------------

    const entryRoomId = targetNamespace + ":" + areaSlug + "-entry";
    const entryRoomName = "Entrance to " + nameHint;
    const entryRoomDesc = placeholder("room", { biome: primaryBiome, exits: [] });

    const roomCreated = tapestry.authoring.createRoom(
        areaSlug,
        entryRoomId,
        entryRoomName,
        entryRoomDesc
    );

    if (!roomCreated) {
        actor.send("Could not create entry room. Area was created but may be incomplete.\r\n");
        return;
    }

    // Roll exit directions from the seed (dice own this fact).
    const exitRng = splitmix64(areaSeed + 1);
    const exitDirs = rollExitDirections(exitRng);

    for (let i = 0; i < exitDirs.length; i++) {
        const dir = exitDirs[i];
        const exitLabel = placeholder("exit", { biome: primaryBiome, direction: dir });
        tapestry.authoring.setStubExit(entryRoomId, dir, exitLabel);
    }

    // -----------------------------------------------------------------------
    // Step 6: Construct and store the RunState cell.
    // -----------------------------------------------------------------------

    const stateKey = runKey(actor.entityId, areaSlug);
    setRunState(stateKey, { roomsSinceLastBoss: 0 });

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

        // Dress entry room prose.
        const roomPr = getPrompt("room_prose");
        tapestry.authoring.recommend(
            {
                field: "description",
                roomId: entryRoomId,
                template: roomPr.template,
                system: roomPr.system,
                vars: { biome: primaryBiome, theme: nameHint, mood: "the start of the path" },
            },
            (roomResult: string | null) => {
                if (roomResult) {
                    tapestry.authoring.setRoomDescription(entryRoomId, roomResult);
                }
            }
        );
    }

    // Dress the roster async (best-effort).
    dressRoster(roster, primaryBiome);

    // P7 wires the entry-room beat here: materializeRoom(entryRoomId, ...) once P4/P5/P6 exist.
    // P3 intentionally does NOT call materializeRoom - ambient mobs and boss-clock are P4's job.
}

// ---------------------------------------------------------------------------
// rollExitDirections - roll how many exits + which directions for the entry room.
// Dice own the directions (rolled from seed), pure function of the rng.
// ---------------------------------------------------------------------------

function rollExitDirections(rng: () => number): string[] {
    const spread = ENTRY_EXIT_MAX - ENTRY_EXIT_MIN;
    const count = ENTRY_EXIT_MIN + Math.floor(rng() * (spread + 1));

    // Shuffle directions, pick the first `count`.
    const dirs = ALL_DIRECTIONS.slice();
    for (let i = dirs.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = dirs[i];
        dirs[i] = dirs[j];
        dirs[j] = tmp;
    }
    return dirs.slice(0, count);
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
