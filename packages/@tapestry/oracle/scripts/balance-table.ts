import { data as engineData } from "@tapestry/engine";
import { weightedPick } from "./prng.js";
// Eager load at module init - the engine clears CurrentPackDir after boot, so a lazy load returns null.
const data: any = engineData.loadYaml("data/master-balance.yml");

// data.loadYaml is YamlDotNet Deserialize<object>: EVERY scalar arrives as a
// STRING under the live Jint runtime. Any arithmetic on those values must
// coerce first - "2" + 0 is "20" in JS, which is exactly the B.2 bug that
// made live trash spawn with 10x the tabled hp dice (interpolateNumeric
// string-concatenated at the anchors) while node golden tests, whose js-yaml
// stub typed scalars as numbers, stayed green. num() is the single coercion
// point; the engine test stub now loads yaml FAILSAFE-style (all strings) so
// the golden tests exercise this same path.
function num(v: any): number {
    const n = Number(v);
    return isNaN(n) ? 0 : n;
}

export function clampLevel(level: number): number {
    if (level < 1) { return 1; }
    if (level > 60) { return 60; }
    return Math.floor(level);
}

export function interpolateNumeric(anchors: Array<number | string>, values: Array<number | string>, level: number): number {
    const L = clampLevel(level);
    for (let i = 0; i < anchors.length - 1; i++) {
        const a0 = num(anchors[i]);
        const a1 = num(anchors[i + 1]);
        if (L >= a0 && L <= a1) {
            const span = a1 - a0;
            const t = span === 0 ? 0 : (L - a0) / span;
            const v0 = num(values[i]);
            return Math.round(v0 + t * (num(values[i + 1]) - v0));
        }
    }
    return num(values[L <= num(anchors[0]) ? 0 : values.length - 1]);
}

/** Nearest anchor, returned as the ORIGINAL array element (a string under the
 *  live engine loader) because callers use it as a DICT KEY: Jint's CLR-dict
 *  wrapper matches keys by type, so a coerced number misses a string key
 *  ("damage[1]" finds nothing when the key is "1"). Coerce with num() only
 *  for arithmetic, never for indexing. */
function nearestAnchor(anchors: Array<number | string>, level: number): number | string {
    const L = clampLevel(level);
    let best: number | string = anchors[0];
    let bestDist = Math.abs(L - num(anchors[0]));
    for (const a of anchors) {
        const d = Math.abs(L - num(a));
        if (d < bestDist) { best = a; bestDist = d; }
    }
    return best;
}

export function rarityModifier(rarity: string): number {
    const r = data.rarity || {};
    if (r[rarity] === undefined || r[rarity] === null) { return 0; }
    return num(r[rarity]);
}

export function statsFor(kind: string, level: number, rng: () => number): Record<string, string | number> {
    const L = clampLevel(level);
    if (kind === "mob") {
        const a = data.mob.anchors;
        const count = interpolateNumeric(a, data.mob.hp_count, L);
        const dmgBand = data.mob.damage[nearestAnchor(a, L)];
        const wimpyPct = interpolateNumeric(a, data.mob.wimpy_pct, L);
        return { hp: count + "d" + data.mob.hp_die, damage: weightedPick(dmgBand, rng), wimpy_pct: wimpyPct };
    }
    if (kind === "weapon") {
        const band = data.weapon.damage[nearestAnchor(data.weapon.anchors, L)];
        return { damage: weightedPick(band, rng) };
    }
    if (kind === "armor") {
        const ac = interpolateNumeric(data.armor.anchors, data.armor.ac, L);
        const slots = data.armor.slots[nearestAnchor(data.armor.anchors, L)];
        return { ac, slots: slots.join(",") };
    }
    if (kind === "boss") {
        const hp = interpolateNumeric(data.boss.anchors, data.boss.hp, L);
        const band = data.boss.damage[nearestAnchor(data.boss.anchors, L)];
        return { hp, damage: weightedPick(band, rng) };
    }
    if (kind === "elite") {
        // Stage-B charged-band tier: dice-notation hp like mob, its own curve.
        const a = data.elite.anchors;
        const count = interpolateNumeric(a, data.elite.hp_count, L);
        const dmgBand = data.elite.damage[nearestAnchor(a, L)];
        return { hp: count + "d" + data.elite.hp_die, damage: weightedPick(dmgBand, rng) };
    }
    if (kind === "miniboss") {
        // Stage-B landmark tier: flat hp number like boss, its own curve.
        const hp = interpolateNumeric(data.miniboss.anchors, data.miniboss.hp, L);
        const band = data.miniboss.damage[nearestAnchor(data.miniboss.anchors, L)];
        return { hp, damage: weightedPick(band, rng) };
    }
    return {};
}

// Boss swell dials: unchanged v1 clamped lookup. Combat lane owns the 1-60 curve later.
// Index with the ORIGINAL key string (Jint CLR-dict wrappers are key-type-strict);
// coerce the dial values because loadYaml scalars are strings (see num() above).
export function bossSwellDials(rank: number): Record<string, number> {
    const swell = data.boss_swell;
    const keys = Object.keys(swell).sort(function (x, y) { return num(x) - num(y); });
    let rk = keys[0];
    for (let i = 0; i < keys.length; i++) { if (rank >= num(keys[i])) { rk = keys[i]; } }
    const row = swell[rk] || {};
    const out: Record<string, number> = {};
    for (const k of Object.keys(row)) { out[k] = num(row[k]); }
    return out;
}

/**
 * Return the raw (unrolled) hp formula string for a mob level.
 * Used by rollRoster to store hp_formula on mob types for per-instance rolling in P4.
 */
export function mobHpFormula(level: number): string {
    return statsFor("mob", level, () => 0.5).hp as string;
}
