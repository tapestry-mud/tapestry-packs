// room-gen.ts - Per-room generation: pure fact-roll vs committing mint.
//
// THE HARD LINE (spec section 5):
//   rollRoomFacts  - PURE, side-effect-free. Zero engine writes, zero runState access.
//                    Same (areaSeed, roomPath, roster) -> byte-identical RoomFacts every time.
//                    Only function prefetch (P6) may call.
//   materializeRoom - The committing mint. ONLY place that writes the world + advances
//                     the boss clock. Called solely on real committed arrival (P5).
//   bossClockFires  - Pure given (roomsSinceLastBoss, rng), but rng input is seeded from
//                     the room, so it only ever runs inside materializeRoom.
//
// roomPath convention: signed grid coords string "x,y" (integers, no spaces).
// Entry room is "0,0". North of "0,0" is "0,1". East is "1,0". etc.
// P5 derives a neighbor's roomPath by parsing the current path and applying the
// direction offset from DIR_OFFSETS below.
//
// Boss clock slope: BOSS_CLOCK_SLOPE (fraction per room). At count N, the threshold
// is min(N * slope, 1.0). Room 0 = 0% (structurally boss-free). Resets cold on spawn.

import * as tapestry from "@tapestry/engine";
import { hashCoord, splitmix64, rollDice, pick } from "./prng.js";
import { getPrompt, placeholder } from "./prompts.js";
import { type Roster } from "./roster.js";
import { type RunState } from "./run-state.js";

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

/** Probability climbs this fraction per room since the last boss spawn. */
const BOSS_CLOCK_SLOPE = 0.07;

/** Max ambient mobs per room (roll 0..MAX_AMBIENT). */
const MAX_AMBIENT_MOBS = 2;

/** Probability any one direction becomes an exit (per direction). */
const EXIT_CHANCE = 0.55;

/** Minimum exits in any rolled room. */
const MIN_EXITS = 1;

// ---------------------------------------------------------------------------
// Direction coordinate offsets: roomPath "x,y" convention.
// North = +y, South = -y, East = +x, West = -x.
// P5 reads DIR_OFFSETS to compute a neighbor's roomPath.
// ---------------------------------------------------------------------------

export const DIR_OFFSETS: Record<string, [number, number]> = {
    north: [0, 1],
    south: [0, -1],
    east: [1, 0],
    west: [-1, 0],
};

const ALL_DIRECTIONS = Object.keys(DIR_OFFSETS);

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
    /** Ambient mob placements with per-instance frozen overrides (hp rolled here). */
    ambientSpawns: AmbientSpawnSpec[];
    /** Variables for the room prose recommend call. */
    proseVars: {
        biome: string;
        theme: string;
        mood: string;
        exits: string[];
    };
}

// ---------------------------------------------------------------------------
// rollRoomFacts
//
// PURE. Zero engine calls. Zero runState access. No Date. No Math.random.
// Derives the room seed from (areaSeed, roomPath) and rolls all room facts.
// Same inputs -> byte-identical output, regardless of direction approached or backtrack.
// ---------------------------------------------------------------------------

export function rollRoomFacts(areaSeed: number, roomPath: string, roster: Roster): RoomFacts {
    const roomSeed = hashCoord(areaSeed, roomPath);
    const rng = splitmix64(roomSeed);

    // -------------------------------------------------------------------------
    // Roll exit directions.
    // Each direction has EXIT_CHANCE probability of being rolled. If none pass,
    // we guarantee at least MIN_EXITS by forcing the highest-roll direction.
    // -------------------------------------------------------------------------

    const exitCandidates: Array<{ direction: string; roll: number }> = [];
    for (let i = 0; i < ALL_DIRECTIONS.length; i++) {
        exitCandidates.push({ direction: ALL_DIRECTIONS[i], roll: rng() });
    }

    const chosenDirs: string[] = [];
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
    const biomeForPlaceholder = roster.mobs.length > 0
        ? (roster.mobs[0].base.split(":")[0] || "wilds")
        : "wilds";
    // Use the roster's mob names to derive a biome hint without calling the engine.
    // The actual biome comes from the area roster; we use a compact stand-in here
    // (P5 passes the real biome through when it calls materializeRoom, but
    // rollRoomFacts has no area-level state beyond the roster).
    // For exit labels we build the placeholder from the direction alone.

    const exits: Array<{ direction: string; label: string }> = [];
    for (let i = 0; i < chosenDirs.length; i++) {
        const dir = chosenDirs[i];
        const label = placeholder("exit", { direction: dir });
        exits.push({ direction: dir, label });
    }

    // -------------------------------------------------------------------------
    // Roll ambient spawn specs.
    // Count: 0..MAX_AMBIENT_MOBS, each a mob type drawn from roster.mobs.
    // Per-instance hp is rolled from the type's hp_formula here and frozen.
    // -------------------------------------------------------------------------

    const ambientSpawns: AmbientSpawnSpec[] = [];

    if (roster.mobs.length > 0) {
        const spawnCountMax = Math.min(MAX_AMBIENT_MOBS, roster.mobs.length);
        const spawnCount = Math.floor(rng() * (spawnCountMax + 1));

        for (let i = 0; i < spawnCount; i++) {
            const mobType = pick(roster.mobs, rng);

            // Roll this instance's hp from the type's formula (dice own the facts).
            // This is the ONLY place hp is rolled for ambient instances.
            const instanceHp = rollDice(mobType.hp_formula, rng);

            const override: SpawnOverride = {
                from_type: mobType.ref,
                name: mobType.name || placeholder("name", { level: mobType.level }),
                desc: mobType.desc || "",
                max_hp: instanceHp,
                damage: mobType.damage,
                items: [],
                no_reroll: true,
            };

            ambientSpawns.push({
                base: mobType.base,
                override,
            });
        }
    }

    // -------------------------------------------------------------------------
    // Roll prompt variables for room prose.
    // No engine call here - just the variable bag passed to materializeRoom
    // for the authoring.recommend call.
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
        biome: biomeForPlaceholder,
        theme: "",
        mood,
        exits: exits.map(function (e) { return e.direction; }),
    };

    return {
        roomSeed,
        exits,
        ambientSpawns,
        proseVars,
    };
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
// Steps:
//   1. createRoom with facts (name placeholder if no LLM).
//   2. setStubExit for each rolled exit.
//   3. spawnMob for each ambient spawn with its frozen override.
//   4. authoring.recommend for room prose (placeholder on null/disabled).
//   5. Evaluate boss clock; if fires, spawn the roster boss + reset clock.
//      Otherwise advance clock by 1.
//
// onProseReady: called when prose resolves (LLM or placeholder). Progressive
// arrival: the player is already on facts before this fires.
//
// biome / theme: real area values passed by P5 (not stored in RoomFacts to
// keep rollRoomFacts roster-only; P5 has them from the run context).
// ---------------------------------------------------------------------------

export function materializeRoom(
    roomId: string,
    areaId: string,
    facts: RoomFacts,
    roster: Roster,
    runState: RunState,
    biome: string,
    theme: string,
    onProseReady?: (prose: string) => void
): void {
    // -------------------------------------------------------------------------
    // 1. Build room name + placeholder description, then createRoom.
    // -------------------------------------------------------------------------

    const exitDirNames = facts.exits.map(function (e) { return e.direction; });

    const roomName = theme
        ? theme + " - " + biome + " passage"
        : biome + " passage";

    const initialDesc = placeholder("room", {
        biome,
        mood: facts.proseVars.mood,
        exits: exitDirNames,
    });

    tapestry.authoring.createRoom(areaId, roomId, roomName, initialDesc);

    // -------------------------------------------------------------------------
    // 2. setStubExit for each rolled exit direction.
    // -------------------------------------------------------------------------

    for (let i = 0; i < facts.exits.length; i++) {
        const exit = facts.exits[i];
        tapestry.authoring.setStubExit(roomId, exit.direction, exit.label);
    }

    // -------------------------------------------------------------------------
    // 3. spawnMob for each ambient spawn with frozen override.
    //    mobs.spawnMob(options) - 2-arg options-object form per brief.
    // -------------------------------------------------------------------------

    for (let i = 0; i < facts.ambientSpawns.length; i++) {
        const spec = facts.ambientSpawns[i];
        tapestry.mobs.spawnMob({
            template: spec.base,
            roomId,
            override: {
                from_type: spec.override.from_type,
                name: spec.override.name,
                desc: spec.override.desc,
                max_hp: spec.override.max_hp,
                damage: spec.override.damage,
                items: spec.override.items,
                no_reroll: spec.override.no_reroll,
            },
        });
    }

    // -------------------------------------------------------------------------
    // 4. authoring.recommend for room prose. Progressive arrival: placeholder
    //    already written above; prose replaces it when it resolves.
    // -------------------------------------------------------------------------

    const canRecommend = tapestry.authoring.recommendEnabled &&
        tapestry.authoring.recommendEnabled();

    if (canRecommend) {
        const roomPr = getPrompt("room_prose");
        tapestry.authoring.recommend(
            {
                field: "description",
                roomId,
                template: roomPr.template,
                system: roomPr.system,
                vars: {
                    biome,
                    theme: theme || biome + " wilds",
                    mood: facts.proseVars.mood,
                },
            },
            function (result: string | null) {
                const prose = result
                    ? result
                    : placeholder("room", { biome, mood: facts.proseVars.mood, exits: exitDirNames });
                if (result) {
                    tapestry.authoring.setRoomDescription(roomId, prose);
                }
                if (onProseReady) { onProseReady(prose); }
            }
        );
    } else {
        // LLM off: placeholder already set; fire onProseReady synchronously.
        if (onProseReady) { onProseReady(initialDesc); }
    }

    // -------------------------------------------------------------------------
    // 5. Boss clock: seeded from the room (same-room first-arrival is determined).
    //    rng is derived from the room seed so the roll is deterministic per room.
    //    The THRESHOLD comes from runState.roomsSinceLastBoss (path-dependent).
    // -------------------------------------------------------------------------

    const bossRng = splitmix64(facts.roomSeed + 1);

    if (bossClockFires(runState.roomsSinceLastBoss, bossRng)) {
        // Spawn the roster boss with frozen override.
        // Base template carries the swell dials (they live in the template, not the override).
        const boss = roster.boss;
        tapestry.mobs.spawnMob({
            template: boss.base,
            roomId,
            override: {
                from_type: boss.ref,
                name: boss.name || placeholder("name", { biome, rank: boss.level }),
                max_hp: boss.hp,
                damage: boss.damage,
                no_reroll: true,
            },
        });
        // Reset the clock.
        runState.roomsSinceLastBoss = 0;
    } else {
        runState.roomsSinceLastBoss += 1;
    }
}
