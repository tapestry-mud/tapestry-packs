// roster.ts - Roster types + biome palette for the oracle area.
//
// The roster is the area's frozen "deck" of types: mobs, a boss, and loot.
// Type definitions used by area-state.ts and room-gen.ts.
// rollBiomePalette is the live runtime export; used by area-gen.ts.
import { splitmix64 } from "./prng.js";
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
 * soloAreaBiomePalette - the canonical area biome-palette derivation, shared by area
 * creation (area-gen) and reboot reconstruction (stub-resolver) so the two can never
 * drift. Replicates the creation rng sequence exactly: one roll is consumed first (the
 * area-gen size_target roll) before the palette is drawn, so an area reconstructed off
 * the persisted seed picks the byte-identical palette it had at creation. Keep this the
 * SOLE place that derives the palette from a seed.
 */
export function soloAreaBiomePalette(areaSeed) {
    const rng = splitmix64(areaSeed);
    rng(); // consume the size_target roll (area-gen createSoloArea step 1)
    return rollBiomePalette(rng);
}
// rollBiomePalette is the only live export from this section.
// rollRoster, dressRoster, fallbackPlacePalette were removed (dead code after P-E rework).
