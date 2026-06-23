// roster.ts - Roster types + biome palette for the oracle area.
//
// The roster is the area's frozen "deck" of types: mobs, a boss, and loot.
// Type definitions used by area-state.ts and room-gen.ts.
// rollBiomePalette is the live runtime export; used by area-gen.ts.

import { splitmix64 } from "./prng.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single mob type in the roster. hp_formula is the string for per-instance rolling. */
export interface MobType {
    ref: string;
    base: string;
    level: number;
    hp_formula: string;
    damage: string;
    flee_threshold: number;
    name: string;
    desc: string;
}

/** The boss is a one-of: stats frozen at creation (hp is a concrete number). */
export interface BossType {
    ref: string;
    base: string;
    level: number;
    hp: number;
    damage: string;
    swell_baseline_gap_ticks: number;
    swell_jitter_ticks: number;
    swell_telegraph_ticks: number;
    swell_window_ticks: number;
    swell_chunk_pct: number;
    swell_whiff_pct: number;
    swell_weather_pct: number;
    name: string;
}

/** A loot type: gear base + slot + ac, name filled by dressing. */
export interface LootType {
    ref: string;
    base: string;
    slot: string;
    ac: number;
    name: string;
}

export interface Roster {
    mobs: MobType[];
    boss: BossType;
    loot: LootType[];
}

// ---------------------------------------------------------------------------
// Biome palettes used by area-gen.ts to steer room biomes.
// These MUST match the biome values the biomes pack declares.
// ---------------------------------------------------------------------------
const BIOME_PALETTES: string[][] = [
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
export function rollBiomePalette(rng: () => number): string[] {
    const idx = Math.floor(rng() * BIOME_PALETTES.length);
    return BIOME_PALETTES[idx].slice();
}

// rollBiomePalette is the only live export from this section.
// rollRoster, dressRoster, fallbackPlacePalette were removed (dead code after P-E rework).
