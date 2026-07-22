// area-namer.ts - Deterministic default name for a solo oracle area.
//
// Replaces the "the wilds" blank-default with a seeded qualifier x place draw.
// Applies ONLY when the player leaves BOTH the idea and the name blank; an
// explicit idea (theme) or explicit name still wins.
//
// STREAM CONTRACT: this draws from its OWN sub-stream,
// splitmix64(hashCoord(areaSeed, "name")), never from the area's primary rng().
// The single documented target_rooms draw at the head of the area stream must
// never shift, or every area's geometry moves. Importing prng.js directly (not
// resolver.js) also keeps this module free of the @tapestry/engine import, so it
// stays golden-testable.
//
// Deck product is 16 x 16 = 256. Exact-dupe collisions across one player's runs
// are rare and cosmetic; `solo list` shows level range and room count to
// disambiguate.
//
// ASCII only; braces on all control flow.

import { splitmix64, hashCoord } from "./prng.js";

export const NAME_QUALIFIERS: string[] = [
    "Ashen", "Sunken", "Hollow", "Bitter",
    "Silent", "Broken", "Winding", "Frozen",
    "Weeping", "Hungry", "Crooked", "Drowned",
    "Burning", "Fading", "Restless", "Buried",
];

export const NAME_PLACES: string[] = [
    "Hollow", "Reach", "March", "Warren",
    "Expanse", "Barrens", "Threshold", "Verge",
    "Basin", "Rookery", "Passage", "Bulwark",
    "Steps", "Fen", "Spire", "Deeps",
];

/**
 * Deterministic default display name for an area, keyed on its seed.
 * Same seed -> same name on every box, LLM or no LLM.
 */
export function seededAreaName(areaSeed: number): string {
    const rng = splitmix64(hashCoord(areaSeed, "name"));
    const qualifier = NAME_QUALIFIERS[Math.floor(rng() * NAME_QUALIFIERS.length)];
    const place = NAME_PLACES[Math.floor(rng() * NAME_PLACES.length)];
    return "the " + qualifier + " " + place;
}
