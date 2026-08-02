// level-resolution.ts - what level a thread run mints at (spec 4.3).
//
// The level dial is deleted. Entry is walking through a portal, so there is no
// argument to supply, and the band window [min, max] moved off the template and
// onto the portal (spec 2.6) because the same minted area is wired to more than
// one portal at different levels - which is exactly what normal mode and the
// Unraveling are.
//
//   normal run level     = clamp(playerLevel + 1, min, max)
//   unraveling run level = max + unravelingBoost
//
// The FLOOR does the gating, and it is the whole soft gate: an under-leveled
// player who walks into a high portal is clamped UP to the floor and flattened.
// Same intent as the old 4.3 soft gate, with no number to type and no gear score.
//
// Loot bands to the RUN level (mintItemInstance takes it), never to the player,
// so a level 60 player cannot farm school for level 60 items.
//
// Pure, zero engine imports, golden-testable under plain node.
// ASCII; braces on all control flow.

export interface PortalBand {
    /** Band floor: the lowest level this portal will ever mint at. */
    min: number;
    /** Band cap: the highest level this portal will ever mint at. */
    max: number;
    /** Levels added to max for the Unraveling run. */
    unravelingBoost: number;
}

function safeInt(n: number, fallback: number): number {
    if (typeof n !== "number" || isNaN(n)) {
        return fallback;
    }
    return Math.floor(n);
}

/** The band floor, never below 1. A portal wired with a garbage or missing min
 *  still mints something playable rather than a level 0 area. */
function floorOf(band: PortalBand): number {
    const min = safeInt(band.min, 1);
    return min < 1 ? 1 : min;
}

/** The band cap, never below the floor. A portal wired backwards (max < min)
 *  collapses to a single-level band at the floor instead of inverting the clamp. */
function capOf(band: PortalBand): number {
    const floor = floorOf(band);
    const max = safeInt(band.max, floor);
    return max < floor ? floor : max;
}

export function normalRunLevel(playerLevel: number, band: PortalBand): number {
    const floor = floorOf(band);
    const cap = capOf(band);
    const wanted = safeInt(playerLevel, 1) + 1;
    if (wanted < floor) {
        return floor;
    }
    if (wanted > cap) {
        return cap;
    }
    return wanted;
}

export function unravelingRunLevel(band: PortalBand): number {
    const cap = capOf(band);
    const boost = safeInt(band.unravelingBoost, 0);
    const level = cap + (boost < 0 ? 0 : boost);
    return level < 1 ? 1 : level;
}

/** Mob tiers offset from the run level, keeping the ratios observed in the
 *  current school. population.ts reads these when it mints each tier. */
export function mobTierLevels(runLevel: number): { trash: number; miniboss: number; boss: number } {
    const base = safeInt(runLevel, 1) < 1 ? 1 : safeInt(runLevel, 1);
    return { trash: base, miniboss: base + 2, boss: base + 4 };
}
