// room-gen.ts - Per-room generation: pure fact-roll vs committing mint.
//
// THE HARD LINE (spec section 5):
//   rollRoomFacts  - PURE, side-effect-free. Zero engine writes, zero runState access.
//                    Same (areaSeed, roomPath, roster) -> byte-identical RoomFacts every time.
//   materializeRoom - The committing mint. ONLY place that writes the world + advances
//                     the boss clock. Called solely on real committed arrival (P5).
//   bossClockFires  - Pure given (roomsSinceLastBoss, rng), but rng input is seeded from
//                     the room, so it only ever runs inside materializeRoom.
//
// P-E REWORK: materializeRoom no longer calls authoring.recommend for room prose.
//   Prose is composed deterministically from the frozen prose table via composeProse (P-D).
//   Ambient spawns come from frozen tables via mintMobInstance / mintItemInstance.
//   Boss spawn uses mintBossInstance from frozen tables.
//   Zero LLM calls remain in this file.
//
// roomPath convention: signed grid coords string "x,y" (integers, no spaces).
// Entry room is "0,0". North of "0,0" is "0,1". East is "1,0". etc.
// P5 derives a neighbor's roomPath by parsing the current path and applying the
// direction offset from DIR_OFFSETS below.
//
// Boss clock slope: BOSS_CLOCK_SLOPE (fraction per room). At count N, the threshold
// is min(N * slope, 1.0). Room 0 = 0% (structurally boss-free). Resets cold on spawn.
import * as tapestry from "@tapestry/engine";
import { hashCoord, splitmix64 } from "./prng.js";
import { placeholder } from "./prompts.js";
import { composeProse } from "./prose-compose.js";
import { mintMobInstance, mintBossInstance, mintItemInstance, rngFor } from "./resolver.js";
// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------
/** Probability climbs this fraction per room since the last boss spawn. */
const BOSS_CLOCK_SLOPE = 0.07;
/** Max ambient mobs per room (roll 0..MAX_AMBIENT). */
const MAX_AMBIENT_MOBS = 2;
// Chance an ambient mob carries a piece of loot. Slice-1 loot path: there is no
// engine API to place an item on the room floor, so loot rides the mob's inventory
// and drops to the room when the mob dies. Floor loot is deferred to a later slice.
const LOOT_DROP_CHANCE = 0.35;
/** Probability any one direction becomes an exit (per direction). */
const EXIT_CHANCE = 0.55;
/** Minimum exits in any rolled room. */
const MIN_EXITS = 1;
// ---------------------------------------------------------------------------
// Direction coordinate offsets: roomPath "x,y" convention.
// North = +y, South = -y, East = +x, West = -x.
// P5 reads DIR_OFFSETS to compute a neighbor's roomPath.
// ---------------------------------------------------------------------------
export const DIR_OFFSETS = {
    north: [0, 1],
    south: [0, -1],
    east: [1, 0],
    west: [-1, 0],
};
const ALL_DIRECTIONS = Object.keys(DIR_OFFSETS);
// ---------------------------------------------------------------------------
// rollRoomFacts
//
// PURE. Zero engine calls. Zero runState access. No Date. No Math.random.
// Derives the room seed from (areaSeed, roomPath) and rolls all room facts.
// Same inputs -> byte-identical output, regardless of direction approached or backtrack.
//
// Note: roster parameter is kept for signature compatibility but is no longer
// consulted here - ambient mob types come from frozen tables at materialize time.
// ---------------------------------------------------------------------------
export function rollRoomFacts(areaSeed, roomPath, _roster, biome = "wilds") {
    const roomSeed = hashCoord(areaSeed, roomPath);
    const rng = splitmix64(roomSeed);
    // -------------------------------------------------------------------------
    // Roll exit directions.
    // Each direction has EXIT_CHANCE probability of being rolled. If none pass,
    // we guarantee at least MIN_EXITS by forcing the highest-roll direction.
    // -------------------------------------------------------------------------
    const exitCandidates = [];
    for (let i = 0; i < ALL_DIRECTIONS.length; i++) {
        exitCandidates.push({ direction: ALL_DIRECTIONS[i], roll: rng() });
    }
    const chosenDirs = [];
    for (let i = 0; i < exitCandidates.length; i++) {
        if (exitCandidates[i].roll < EXIT_CHANCE) {
            chosenDirs.push(exitCandidates[i].direction);
        }
    }
    // Guarantee at least MIN_EXITS.
    if (chosenDirs.length < MIN_EXITS) {
        // Sort by roll ascending so the lowest-roll (most likely) direction is first.
        exitCandidates.sort(function (a, b) { return a.roll - b.roll; });
        for (let i = 0; i < exitCandidates.length && chosenDirs.length < MIN_EXITS; i++) {
            const dir = exitCandidates[i].direction;
            if (chosenDirs.indexOf(dir) === -1) {
                chosenDirs.push(dir);
            }
        }
    }
    // Roll exit labels (placeholder-based, deterministic from rng - no engine calls).
    const exits = [];
    for (let i = 0; i < chosenDirs.length; i++) {
        const dir = chosenDirs[i];
        const label = placeholder("exit", { direction: dir });
        exits.push({ direction: dir, label });
    }
    // -------------------------------------------------------------------------
    // Roll ambient spawn count (0..MAX_AMBIENT_MOBS).
    // Individual mob types are determined at materialize time from frozen tables.
    // -------------------------------------------------------------------------
    const ambientCount = Math.floor(rng() * (MAX_AMBIENT_MOBS + 1));
    // -------------------------------------------------------------------------
    // Roll prompt variables for room prose composition.
    // biome is passed in from the caller (real area biome).
    // -------------------------------------------------------------------------
    const moodOptions = [
        "the air is still",
        "a faint wind stirs the ground",
        "something moves in the shadows",
        "an uneasy quiet hangs here",
        "the path narrows ahead",
        "light filters weakly through the canopy",
    ];
    const mood = moodOptions[Math.floor(rng() * moodOptions.length)];
    const proseVars = {
        biome: biome,
        mood,
    };
    return {
        roomSeed,
        exits,
        ambientCount,
        proseVars,
    };
}
// ---------------------------------------------------------------------------
// titleCase
//
// Capitalizes each word in s. Words are split on spaces and hyphens; hyphens
// are preserved in the output. ASCII only - no unicode needed.
// e.g. "walk-in freezer" -> "Walk-In Freezer"
// ---------------------------------------------------------------------------
function titleCase(s) {
    return s.replace(/([a-zA-Z]+)/g, function (word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
    });
}
// ---------------------------------------------------------------------------
// bossClockFires
//
// Pure given (roomsSinceLastBoss, rng). Ramp-and-reset pity timer.
// Threshold = min(roomsSinceLastBoss * BOSS_CLOCK_SLOPE, 1.0).
// Room 0 (right after a spawn, or the very first room) has 0% chance.
// Climbs by BOSS_CLOCK_SLOPE each room. Resets to 0 on a spawn.
// ---------------------------------------------------------------------------
export function bossClockFires(roomsSinceLastBoss, rng) {
    const threshold = Math.min(roomsSinceLastBoss * BOSS_CLOCK_SLOPE, 1.0);
    return rng() < threshold;
}
// ---------------------------------------------------------------------------
// materializeRoom
//
// THE COMMITTING MINT. The ONLY place that writes the world + advances the boss clock.
// Called solely on real committed arrival (P5 will call this).
//
// P-E REWORK: No LLM calls. Prose comes from composeProse (frozen table roll).
//   Ambient spawns come from mintMobInstance + mintItemInstance (frozen tables).
//   Boss spawn uses mintBossInstance (frozen table).
//
// Steps:
//   1. Compose prose from frozen table + create the room.
//   2. setStubExit for each rolled exit.
//   3. Spawn ambient mobs (mintMobInstance from frozen <areaId>:mobs).
//   4. Evaluate boss clock; if fires, spawn boss (mintBossInstance from frozen <areaId>:boss).
//
// biome / theme: real area values passed by the caller (P5 has them from the run context).
// areaSeed: needed for composeProse + rngFor calls (deterministic from coord).
//
// Note: onProseReady is removed (prose is now synchronous - no LLM wait).
// ---------------------------------------------------------------------------
export function materializeRoom(roomId, areaId, areaSeed, facts, runState, biome, theme) {
    // -------------------------------------------------------------------------
    // 1. Compose prose deterministically from frozen table + create the room.
    //    composeProse reads the frozen <areaId>:prose table and picks fragments
    //    using a coord-seeded rng. Falls back to "A plain space." if no table.
    // -------------------------------------------------------------------------
    // Extract coord string from roomId to use as composeProse coord.
    // Room ids follow: namespace:areaSlug-x_y  (e.g. "oracle-run:slug-0_0")
    // We use the facts.roomSeed as a coord key for composeProse.
    const coordKey = String(facts.roomSeed);
    const prose = composeProse(areaId, areaSeed, coordKey, biome);
    const exitDirNames = facts.exits.map(function (e) { return e.direction; });
    const roomName = theme
        ? theme + " - " + titleCase(biome)
        : titleCase(biome);
    tapestry.authoring.createRoom(areaId, roomId, roomName, prose);
    // -------------------------------------------------------------------------
    // 2. setStubExit for each rolled exit direction.
    // -------------------------------------------------------------------------
    for (let i = 0; i < facts.exits.length; i++) {
        const exit = facts.exits[i];
        tapestry.authoring.setStubExit(roomId, exit.direction, exit.label);
    }
    // -------------------------------------------------------------------------
    // 3. Spawn ambient mobs from frozen tables.
    //    mintMobInstance reads the frozen <areaId>:mobs table and rolls stats.
    //    If the table is not yet frozen (empty), no mobs spawn (graceful).
    // -------------------------------------------------------------------------
    // Spawn ambient mobs: use level=1 as a default band start.
    // A P-G pass will thread AreaState.levelRange here so mobs scale correctly.
    // mintMobInstance + mintItemInstance read frozen tables; no LLM call.
    const spawnRng = rngFor(areaSeed, coordKey + ":spawn");
    for (let i = 0; i < facts.ambientCount; i++) {
        const level = 1; // P-G will thread levelRange from AreaState
        const override = mintMobInstance(areaId, level, spawnRng);
        if (override) {
            tapestry.mobs.spawnMob({
                template: "tapestry-oracle:hostile-melee",
                roomId,
                override,
            });
        }
        // Loot drop: attach item to mob inventory so it drops on death.
        // mintItemInstance calculates the override; loot attachment via the
        // spawnMob items[] array requires P-G to thread the item base id.
        // Advance the rng regardless (keep the rng stream deterministic).
        if (spawnRng() < LOOT_DROP_CHANCE) {
            const _itemOverride = mintItemInstance(areaId, level, spawnRng);
            // TODO P-G: attach _itemOverride to mob via spawnMob items[] once
            // the base template id is threaded through here correctly.
            void _itemOverride;
        }
    }
    // -------------------------------------------------------------------------
    // 4. Boss clock: seeded from the room (same-room first-arrival is determined).
    //    The THRESHOLD comes from runState.roomsSinceLastBoss (path-dependent).
    // -------------------------------------------------------------------------
    const bossRng = splitmix64(facts.roomSeed + 1);
    if (bossClockFires(runState.roomsSinceLastBoss, bossRng)) {
        const bossRngForMint = rngFor(areaSeed, coordKey + ":boss");
        const bossOverride = mintBossInstance(areaId, 1, bossRngForMint);
        if (bossOverride) {
            tapestry.mobs.spawnMob({
                template: "tapestry-oracle:swell-boss",
                roomId,
                override: bossOverride,
            });
        }
        // Reset the clock.
        runState.roomsSinceLastBoss = 0;
    }
    else {
        runState.roomsSinceLastBoss += 1;
    }
}
