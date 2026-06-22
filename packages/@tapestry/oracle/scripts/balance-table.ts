import { data } from "@tapestry/engine";
import { rollDice, weightedPick } from "./prng.js";

// Eagerly loaded at module init time so data.loadYaml runs while CurrentPackDir
// is still set (the engine clears it after boot; lazy init at runtime = null return).
const _balance: any = data.loadYaml("data/master-balance.yml");

function getBalance(): any {
    return _balance;
}

export type StatKind = "weapon" | "armor" | "mob" | "boss";

/**
 * Roll stats for a given kind and level (or boss rank) from master-balance.yml.
 *
 * weapon  -> { damage: string }        rolled notation string ("dice to pick the dice")
 * armor   -> { slots: string[], ac: number }
 * mob     -> { hp: number, damage: string, flee_threshold: number }
 * boss    -> { hp: number, damage: string, swell_baseline_gap_ticks: number,
 *               swell_jitter_ticks: number, swell_telegraph_ticks: number,
 *               swell_window_ticks: number, swell_chunk_pct: number,
 *               swell_whiff_pct: number, swell_weather_pct: number }
 *
 * For mob, hp is rolled from the dice notation and returned as a concrete number.
 * For boss, hp is already a fixed integer in the table (frozen at roster creation).
 * For weapon, the damage field is a weighted list; weightedPick selects the notation string.
 * rng must be a seeded PRNG from splitmix64() - this function never constructs one.
 */
export function statsFor(kind: StatKind, level: number, rng: () => number): Record<string, any> {
    const balance = getBalance();
    const table = balance[kind];
    if (!table) {
        throw new Error(`oracle/balance-table: unknown kind '${kind}'`);
    }
    const row = table[level] ?? table[String(level)];
    if (!row) {
        throw new Error(`oracle/balance-table: no entry for ${kind} level ${level}`);
    }

    if (kind === "weapon") {
        const damageNotation = weightedPick(row.damage, rng);
        return { damage: damageNotation };
    }

    if (kind === "armor") {
        return {
            slots: row.slots,
            ac: row.ac,
        };
    }

    if (kind === "mob") {
        const hp = rollDice(row.hp, rng);
        return {
            hp,
            damage: row.damage,
            flee_threshold: row.flee_threshold,
        };
    }

    if (kind === "boss") {
        return {
            hp: row.hp,
            damage: row.damage,
            swell_baseline_gap_ticks: row.swell_baseline_gap_ticks,
            swell_jitter_ticks: row.swell_jitter_ticks,
            swell_telegraph_ticks: row.swell_telegraph_ticks,
            swell_window_ticks: row.swell_window_ticks,
            swell_chunk_pct: row.swell_chunk_pct,
            swell_whiff_pct: row.swell_whiff_pct,
            swell_weather_pct: row.swell_weather_pct,
        };
    }

    throw new Error(`oracle/balance-table: unhandled kind '${kind}'`);
}

/**
 * Return the raw (unrolled) hp formula string for a mob level.
 * Used by rollRoster to store hp_formula on mob types for per-instance rolling in P4.
 */
export function mobHpFormula(level: number): string {
    const balance = getBalance();
    const table = balance["mob"];
    if (!table) { return "1d10"; }
    const row = table[level] ?? table[String(level)];
    if (!row || !row.hp) { return "1d10"; }
    return String(row.hp);
}
