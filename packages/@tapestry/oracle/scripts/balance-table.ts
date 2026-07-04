import { data as engineData } from "@tapestry/engine";
import { weightedPick } from "./prng.js";
// Eager load at module init - the engine clears CurrentPackDir after boot, so a lazy load returns null.
const data: any = engineData.loadYaml("data/master-balance.yml");

export function clampLevel(level: number): number {
    if (level < 1) { return 1; }
    if (level > 60) { return 60; }
    return Math.floor(level);
}

export function interpolateNumeric(anchors: number[], values: number[], level: number): number {
    const L = clampLevel(level);
    for (let i = 0; i < anchors.length - 1; i++) {
        if (L >= anchors[i] && L <= anchors[i + 1]) {
            const span = anchors[i + 1] - anchors[i];
            const t = span === 0 ? 0 : (L - anchors[i]) / span;
            return Math.round(values[i] + t * (values[i + 1] - values[i]));
        }
    }
    return values[L <= anchors[0] ? 0 : values.length - 1];
}

function nearestAnchor(anchors: number[], level: number): number {
    const L = clampLevel(level);
    let best = anchors[0];
    let bestDist = Math.abs(L - anchors[0]);
    for (const a of anchors) {
        const d = Math.abs(L - a);
        if (d < bestDist) { best = a; bestDist = d; }
    }
    return best;
}

export function rarityModifier(rarity: string): number {
    const r = data.rarity || {};
    return typeof r[rarity] === "number" ? r[rarity] : 0;
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
export function bossSwellDials(rank: number): Record<string, number> {
    const swell = data.boss_swell;
    const ranks = Object.keys(swell).map(Number).sort((x, y) => x - y);
    let r = ranks[0];
    for (const k of ranks) { if (rank >= k) { r = k; } }
    return swell[r];
}

/**
 * Return the raw (unrolled) hp formula string for a mob level.
 * Used by rollRoster to store hp_formula on mob types for per-instance rolling in P4.
 */
export function mobHpFormula(level: number): string {
    return statsFor("mob", level, () => 0.5).hp as string;
}
