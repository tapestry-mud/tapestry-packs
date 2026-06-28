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
// roomPath convention: signed grid coords string "x,y,z" (integers, no spaces).
// Entry room is "0,0,0". North of entry is "0,1,0". Down is "0,0,-1". See coords.ts.
// The stub resolver derives a neighbor's roomPath via neighborPath() from coords.ts.
//
// Boss clock slope: BOSS_CLOCK_SLOPE (fraction per room). At count N, the threshold
// is min(N * slope, 1.0). Room 0 = 0% (structurally boss-free). Resets cold on spawn.

import * as tapestry from "@tapestry/engine";
import { hashCoord, splitmix64, weightedPick, pick } from "./prng.js";
import { placeholder } from "./prompts.js";
import { type Roster } from "./roster.js";
import { type RunState } from "./run-state.js";
import { composeProse } from "./prose-compose.js";
import { mintMobInstance, mintBossInstance, mintItemInstance, mintMobInstanceByTypeId, rngFor, shouldReuse } from "./resolver.js";
import { DIR_OFFSETS, ALL_DIRECTIONS } from "./coords.js";
import { type SixAxisTable } from "./six-axis.js";
import { composeFor, composeRoomProse } from "./room-compose.js";

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

/** Weighted exit-count distribution (the "sliding scale"): roll a target exit count,
 *  then take that many directions. Skews toward 2-3 so most rooms branch lightly and
 *  6-exit hubs stay rare (~2%). value = exit count, w = weight. */
const EXIT_COUNT_WEIGHTS: { w: number; value: number }[] = [
    { w: 2, value: 1 },
    { w: 6, value: 2 },
    { w: 6, value: 3 },
    { w: 2, value: 4 },
    { w: 0.8, value: 5 },
    { w: 0.3, value: 6 },
];

/** Minimum exits in any rolled room. */
const MIN_EXITS = 1;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Frozen override blob for a single mob instance. */
export interface SpawnOverride {
    from_type: string;
    name: string;
    desc: string;
    max_hp: number;
    damage: string;
    items: string[];
    no_reroll: boolean;
}

/** A single ambient mob placement: base template + frozen override. */
export interface AmbientSpawnSpec {
    /** Namespaced base template id, e.g. "tapestry-oracle:hostile-melee". */
    base: string;
    override: SpawnOverride;
}

/** All rolled facts for one room. Pure output of rollRoomFacts. */
export interface RoomFacts {
    /** The room's derived seed (for downstream use, e.g. naming the path). */
    roomSeed: number;
    /**
     * Exit directions and their stub display labels.
     * Each entry: { direction: string, label: string }.
     */
    exits: Array<{ direction: string; label: string }>;
    /** Ambient mob count to roll at materialize time (not pre-rolled, since
     *  mintMobInstance reads frozen tables not roster). */
    ambientCount: number;
    /** Variables for prose composition (biome, mood). */
    proseVars: {
        biome: string;
        mood: string;
    };
}

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

export function rollRoomFacts(areaSeed: number, roomPath: string, _roster: Roster, biome: string = "wilds"): RoomFacts {
    const roomSeed = hashCoord(areaSeed, roomPath);
    const rng = splitmix64(roomSeed);

    // -------------------------------------------------------------------------
    // Roll exit directions.
    // Each direction has EXIT_CHANCE probability of being rolled. If none pass,
    // we guarantee at least MIN_EXITS by forcing the highest-roll direction.
    // -------------------------------------------------------------------------

    // Give every direction a random roll - the tie-break for WHICH directions become exits.
    const exitCandidates: Array<{ direction: string; roll: number }> = [];
    for (let i = 0; i < ALL_DIRECTIONS.length; i++) {
        exitCandidates.push({ direction: ALL_DIRECTIONS[i], roll: rng() });
    }

    // Roll the exit COUNT from the weighted distribution, then take that many of the
    // lowest-roll directions. Clamp to [MIN_EXITS, ALL_DIRECTIONS.length] for safety.
    let targetCount = weightedPick(EXIT_COUNT_WEIGHTS, rng);
    if (targetCount < MIN_EXITS) { targetCount = MIN_EXITS; }
    if (targetCount > ALL_DIRECTIONS.length) { targetCount = ALL_DIRECTIONS.length; }

    exitCandidates.sort(function (a, b) { return a.roll - b.roll; });
    const chosenDirs: string[] = [];
    for (let i = 0; i < targetCount; i++) {
        chosenDirs.push(exitCandidates[i].direction);
    }

    // Roll exit labels (placeholder-based, deterministic from rng - no engine calls).
    const exits: Array<{ direction: string; label: string }> = [];
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

function titleCase(s: string): string {
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

export function bossClockFires(roomsSinceLastBoss: number, rng: () => number): boolean {
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

export function materializeRoom(
    roomId: string,
    areaId: string,
    areaSeed: number,
    facts: RoomFacts,
    runState: RunState,
    biome: string,
    theme: string,
    mintedMobTypes: Set<string>,
    sixAxis: Record<string, SixAxisTable>,
    depth: number
): void {
    // -------------------------------------------------------------------------
    // 1. Compose prose deterministically from frozen table + create the room.
    //    composeProse reads the frozen <areaId>:prose table and picks fragments
    //    using a coord-seeded rng. Falls back to "A plain space." if no table.
    // -------------------------------------------------------------------------

    // Extract coord string from roomId to use as composeProse coord.
    // Room ids follow: namespace:areaSlug-x_y_z  (e.g. "oracle-run:slug-0_0_0"). See coords.ts.
    // We use the facts.roomSeed as a coord key for composeProse.
    const coordKey = String(facts.roomSeed);

    // Depth-biased composition: roll band + density from ROOM-1 (if six-axis tables are present).
    // composeRng seeds BOTH the degree roll (via composeFor) AND the prose fragment pick.
    // When ROOM-1 is absent, composeFor returns null -> flat fallback path unchanged.
    const composeRng = splitmix64(facts.roomSeed + 2);
    const composition = composeFor("rooms", sixAxis, {
        depth,
        pressure: runState.roomsSinceLastBoss,
        rng: composeRng,
    });

    // Banded prose: use ROOM-2 dressing when available; fall back to legacy composeProse.
    const sixAxisProse = composeRoomProse(sixAxis, composeRng);
    const prose = sixAxisProse !== "" ? sixAxisProse : composeProse(areaId, areaSeed, coordKey, biome);

    // Room name: a themed place word (deterministic per room), NO biome suffix - the generic
    // terrain biome clashes with the area theme ("Cavern" on a circus). Falls back to the band
    // or theme if the places table is empty.
    const placesTable = (tapestry as any).oracle.table(areaId + ":places");
    const placePool: any[] = placesTable && placesTable.entries ? placesTable.entries : [];
    let roomName: string;
    if (placePool.length > 0) {
        const namePick = pick(placePool, rngFor(areaSeed, coordKey + ":name"));
        roomName = titleCase(String((namePick && namePick.name) || ""));
    } else if (composition) {
        roomName = titleCase(composition.band);
    } else if (theme) {
        roomName = titleCase(theme);
    } else {
        roomName = titleCase(biome);
    }
    if (roomName === "") { roomName = titleCase(biome); }

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

    // Spawn ambient mobs.
    // Level band comes from the area's level range; for now we use a flat level=1
    // as the minimum (the areaState levelRange is not threaded here yet in slice-1).
    // shouldReuse gates whether we introduce a fresh mob type (new variety) or re-spawn
    // an already-introduced one (consistent encounter feel within the same area).
    // mintMobInstance + mintItemInstance read frozen tables; no LLM call.
    const spawnRng = rngFor(areaSeed, coordKey + ":spawn");

    const spawnCount = composition ? composition.spawnDensity : facts.ambientCount;
    for (let i = 0; i < spawnCount; i++) {
        const level = 1;
        let override: any;
        if (mintedMobTypes && shouldReuse(mintedMobTypes.size, spawnRng)) {
            // Reuse path: spawn another copy of an already-introduced mob type.
            const mintedArr = Array.from(mintedMobTypes);
            const reuseIdx = Math.floor(spawnRng() * mintedArr.length);
            const reuseTypeId = mintedArr[reuseIdx];
            override = mintMobInstanceByTypeId(areaId, reuseTypeId, level, spawnRng);
        } else {
            // Fresh mint path: roll a new type from the weighted frozen table.
            override = mintMobInstance(areaId, level, spawnRng);
            if (override && mintedMobTypes) {
                mintedMobTypes.add(override.fromType);
            }
        }
        // Loot threshold draw is UNCONDITIONAL - same rng-stream position as the shipped code
        // (the original rolled this every iteration, outside `if (override)`). spawnMob consumes
        // no rng, so minting + attaching loot before the spawn does not shift the stream.
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
    } else {
        runState.roomsSinceLastBoss += 1;
    }
}
