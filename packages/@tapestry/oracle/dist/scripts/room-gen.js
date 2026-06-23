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
// ---------------------------------------------------------------------------
export function rollRoomFacts(areaSeed, roomPath, roster, biome = "wilds") {
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
    // biome is passed in from the caller (real area biome, not derived from roster namespace).
    const exits = [];
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
    const ambientSpawns = [];
    if (roster.mobs.length > 0) {
        const spawnCountMax = Math.min(MAX_AMBIENT_MOBS, roster.mobs.length);
        const spawnCount = Math.floor(rng() * (spawnCountMax + 1));
        for (let i = 0; i < spawnCount; i++) {
            const mobType = pick(roster.mobs, rng);
            // Roll this instance's hp from the type's formula (dice own the facts).
            // This is the ONLY place hp is rolled for ambient instances.
            const instanceHp = rollDice(mobType.hp_formula, rng);
            // Roll loot for this instance (frozen now). Dropped to the room on death.
            const items = [];
            if (roster.loot.length > 0 && rng() < LOOT_DROP_CHANCE) {
                const lootType = pick(roster.loot, rng);
                items.push(lootType.base);
            }
            const override = {
                from_type: mobType.ref,
                name: mobType.name || placeholder("name", { biome, level: mobType.level }),
                desc: mobType.desc || "",
                max_hp: instanceHp,
                damage: mobType.damage,
                items: items,
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
        biome: biome,
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
export function materializeRoom(roomId, areaId, facts, roster, runState, biome, theme, onProseReady) {
    // -------------------------------------------------------------------------
    // 1. Build room name + placeholder description, then createRoom.
    // -------------------------------------------------------------------------
    const exitDirNames = facts.exits.map(function (e) { return e.direction; });
    const roomName = theme
        ? theme + " - " + titleCase(biome)
        : titleCase(biome);
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
                fromType: spec.override.from_type,
                name: spec.override.name,
                desc: spec.override.desc,
                maxHp: spec.override.max_hp,
                damage: spec.override.damage,
                items: spec.override.items,
                noReroll: spec.override.no_reroll,
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
        tapestry.authoring.recommend({
            field: "description",
            roomId,
            template: roomPr.template,
            system: roomPr.system,
            vars: {
                biome,
                theme: theme || biome + " wilds",
                mood: facts.proseVars.mood,
            },
        }, function (result) {
            const prose = result
                ? result
                : placeholder("room", { biome, mood: facts.proseVars.mood, exits: exitDirNames });
            if (result) {
                tapestry.authoring.setRoomDescription(roomId, prose);
            }
            if (onProseReady) {
                onProseReady(prose);
            }
        });
    }
    else {
        // LLM off: placeholder already set; fire onProseReady synchronously.
        if (onProseReady) {
            onProseReady(initialDesc);
        }
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
                fromType: boss.ref,
                name: boss.name || placeholder("name", { biome, rank: boss.level }),
                maxHp: boss.hp,
                damage: boss.damage,
                noReroll: true,
            },
        });
        // Reset the clock.
        runState.roomsSinceLastBoss = 0;
    }
    else {
        runState.roomsSinceLastBoss += 1;
    }
}
