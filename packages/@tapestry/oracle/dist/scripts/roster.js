// roster.ts - Roster types + biome palette for the oracle area.
//
// The roster is the area's frozen "deck" of types: mobs, a boss, and loot.
// Type definitions used by area-state.ts and room-gen.ts.
// rollBiomePalette is the live runtime export; used by area-gen.ts.
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
// rollBiomePalette is the only live export from this section.
// rollRoster, dressRoster, fallbackPlacePalette were removed (dead code after P-E rework).
