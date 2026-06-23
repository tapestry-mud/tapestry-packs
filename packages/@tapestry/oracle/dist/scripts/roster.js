// roster.ts - Roll + dress the oracle area roster.
//
// The roster is the area's frozen "deck" of types: mobs, a boss, and loot.
// Rolled ONCE at area creation from the area seed + level_range (dice own the facts).
// Dressed via authoring.recommend (LLM owns names/descs, placeholder on null).
//
// Roster type vs instance: the roster holds TYPES ("this area has rot-wolves at level 1
// with 6d10 hp formula, named rot-touched wolf"). It does NOT hold live mob instances.
// When a room mints (P4), it rolls each instance's hp from the formula and freezes a
// per-instance override blob. The area owns types, the room owns instances.
//
// The boss is the exception: one-of, stats frozen at roster-creation time (hp is a
// concrete number, not a formula). It is placed by the boss ramp-clock in P4.
import * as tapestry from "@tapestry/engine";
import { splitmix64 } from "./prng.js";
import { statsFor, mobHpFormula } from "./balance-table.js";
import { getPrompt, placeholder } from "./prompts.js";
// ---------------------------------------------------------------------------
// Biome palettes used by area-gen.ts to steer room biomes.
// These MUST match the biome values the biomes pack declares.
// ---------------------------------------------------------------------------
const BIOME_PALETTES = [
    ["forest", "cave"],
    ["swamp", "forest"],
    ["desert", "cave"],
    ["tundra", "forest"],
    ["plains", "forest"],
    ["swamp", "cave", "forest"],
    ["mountain", "cave"],
    ["jungle", "cave"],
];
/** Roll a biome palette from the area seed alone. Name-independent (decision 2). */
export function rollBiomePalette(rng) {
    const idx = Math.floor(rng() * BIOME_PALETTES.length);
    return BIOME_PALETTES[idx].slice();
}
/**
 * Fallback place palette used when the LLM is off or the place_palette call fails.
 * Theme-neutral place words that read better than terrain labels when no LLM is present.
 */
export function fallbackPlacePalette() {
    return ["hall", "passage", "chamber", "corner", "threshold", "alcove"];
}
// Gear slot bases for loot. Base id is the namespace:local form.
const GEAR_BASES = [
    { base: "tapestry-oracle:armor-head", slot: "head" },
    { base: "tapestry-oracle:armor-hands", slot: "hands" },
    { base: "tapestry-oracle:armor-feet", slot: "feet" },
    { base: "tapestry-oracle:armor-body", slot: "body" },
];
// How many mob types to roll per area.
const MOB_TYPE_COUNT = 3;
// How many loot types to roll per area.
const LOOT_TYPE_COUNT = 2;
// The boss rank is always the max level (capped to the balance table's top rank).
const MAX_BOSS_RANK = 5;
// ---------------------------------------------------------------------------
// rollRoster - dice own all facts (stats, levels, bases). Names left blank.
// ---------------------------------------------------------------------------
export function rollRoster(areaSeed, levelRange) {
    const rng = splitmix64(areaSeed);
    const [minLevel, maxLevel] = levelRange;
    // Roll mob types.
    // statsFor("mob") rolls hp (a number), but the roster keeps the formula string
    // for per-instance rolling in P4. Use mobHpFormula() to get the raw notation.
    const mobs = [];
    for (let i = 0; i < MOB_TYPE_COUNT; i++) {
        // Pick a level in the range.
        const spread = maxLevel - minLevel;
        const level = minLevel + Math.floor(rng() * (spread + 1));
        // Advance the rng past the mob's hp roll so subsequent rolls stay seeded.
        const stats = statsFor("mob", level, rng);
        mobs.push({
            ref: "m" + (i + 1),
            base: "tapestry-oracle:hostile-melee",
            level,
            hp_formula: mobHpFormula(level),
            damage: stats.damage,
            flee_threshold: stats.flee_threshold,
            name: "",
            desc: "",
        });
    }
    // Roll boss (one-of, frozen hp).
    const bossRank = Math.min(maxLevel, MAX_BOSS_RANK);
    const bossStats = statsFor("boss", bossRank, rng);
    const boss = {
        ref: "b1",
        base: "tapestry-oracle:swell-boss",
        level: maxLevel,
        hp: bossStats.hp,
        damage: bossStats.damage,
        swell_baseline_gap_ticks: bossStats.swell_baseline_gap_ticks,
        swell_jitter_ticks: bossStats.swell_jitter_ticks,
        swell_telegraph_ticks: bossStats.swell_telegraph_ticks,
        swell_window_ticks: bossStats.swell_window_ticks,
        swell_chunk_pct: bossStats.swell_chunk_pct,
        swell_whiff_pct: bossStats.swell_whiff_pct,
        swell_weather_pct: bossStats.swell_weather_pct,
        name: "",
    };
    // Roll loot types.
    const loot = [];
    const gearPool = GEAR_BASES.slice();
    for (let i = 0; i < LOOT_TYPE_COUNT && gearPool.length > 0; i++) {
        const gearIdx = Math.floor(rng() * gearPool.length);
        const gear = gearPool.splice(gearIdx, 1)[0];
        // Roll armor stats at mid-level.
        const midLevel = Math.max(1, Math.min(Math.round((minLevel + maxLevel) / 2), 5));
        const armorStats = statsFor("armor", midLevel, rng);
        loot.push({
            ref: "i" + (i + 1),
            base: gear.base,
            slot: gear.slot,
            ac: armorStats.ac,
            name: "",
        });
    }
    return { mobs, boss, loot };
}
// ---------------------------------------------------------------------------
// dressRoster - fills names/descs via authoring.recommend (async, best-effort).
// placeholder() on null/disabled. Does NOT block area creation.
//
// biome: the primary biome from the rolled palette (for prompt context).
// onDone: optional callback fired when all fields have resolved.
// ---------------------------------------------------------------------------
export function dressRoster(roster, biome, theme, onDone) {
    if (!tapestry.authoring.recommendEnabled || !tapestry.authoring.recommendEnabled()) {
        // LLM off - fill all names with placeholders synchronously.
        applyRosterPlaceholders(roster, biome);
        if (onDone) {
            onDone();
        }
        return;
    }
    const themeLabel = theme || biome + " wilds";
    // Count how many async calls are in flight so we can fire onDone once.
    let pending = roster.mobs.length * 2 + 1 + roster.loot.length;
    function tick() {
        pending -= 1;
        if (pending <= 0 && onDone) {
            onDone();
        }
    }
    // Dress mob names + descs.
    for (let i = 0; i < roster.mobs.length; i++) {
        const mob = roster.mobs[i];
        const namePr = getPrompt("mob_name");
        tapestry.authoring.recommend({
            field: "name",
            template: namePr.template,
            system: namePr.system,
            vars: { level: String(mob.level), biome, theme: themeLabel },
        }, (result) => {
            mob.name = result
                ? result
                : placeholder("name", { biome, level: mob.level });
            tick();
        });
        // Dress desc after name is known (or placeholder) - use a captured closure.
        const descPr = getPrompt("mob_desc");
        const nameAtStart = mob.name;
        tapestry.authoring.recommend({
            field: "description",
            template: descPr.template,
            system: descPr.system,
            vars: { name: nameAtStart || placeholder("name", { biome, level: mob.level }), biome, theme: themeLabel },
        }, (result) => {
            mob.desc = result ? result : "";
            tick();
        });
    }
    // Dress boss name.
    const bossNamePr = getPrompt("boss_name");
    tapestry.authoring.recommend({
        field: "name",
        template: bossNamePr.template,
        system: bossNamePr.system,
        vars: { rank: String(roster.boss.level), biome },
    }, (result) => {
        roster.boss.name = result
            ? result
            : placeholder("name", { biome, rank: roster.boss.level });
        tick();
    });
    // Dress loot names.
    for (let i = 0; i < roster.loot.length; i++) {
        const item = roster.loot[i];
        // loot_name prompt assumes an armor slot. For non-armor bases (weapons) use a
        // generic fallback. In slice 1 all loot is armor, so this is the normal path.
        const lootPr = getPrompt("loot_name");
        tapestry.authoring.recommend({
            field: "name",
            template: lootPr.template,
            system: lootPr.system,
            vars: { slot: item.slot, biome, theme: themeLabel },
        }, (result) => {
            // Gear must NOT get a "creature" placeholder - use a slot/biome name.
            item.name = result
                ? result
                : biome + " " + item.slot + " armor";
            tick();
        });
    }
}
// ---------------------------------------------------------------------------
// applyRosterPlaceholders - sync placeholder fill when LLM is off.
// ---------------------------------------------------------------------------
function applyRosterPlaceholders(roster, biome) {
    for (let i = 0; i < roster.mobs.length; i++) {
        const mob = roster.mobs[i];
        if (!mob.name) {
            mob.name = placeholder("name", { biome, level: mob.level });
        }
    }
    if (!roster.boss.name) {
        roster.boss.name = placeholder("name", { biome, rank: roster.boss.level });
    }
    for (let i = 0; i < roster.loot.length; i++) {
        const item = roster.loot[i];
        if (!item.name) {
            item.name = biome + " " + item.slot + " armor";
        }
    }
}
