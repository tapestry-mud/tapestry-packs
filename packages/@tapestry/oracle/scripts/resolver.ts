// resolver.ts - Deterministic resolver: roll entries from frozen oracle tables.
//
// This is the hot path during play: zero LLM, pure table lookups seeded by
// splitmix64(hashCoord(areaSeed, coord)) so results are deterministic on any box.
//
// Exports:
//   rollEntry        - weighted pick from any OracleEntry[].
//   shouldReuse      - mint-vs-reuse roll (reuse weight 0.65, never reuse if count=0).
//   mintMobInstance  - roll mob type from frozen <area>:mobs table + stats from master-balance.
//   mintItemInstance - roll item type from frozen <area>:items table + rarity-scaled stats.
//   mintBossInstance - roll boss from frozen <area>:boss table (uses index 0 always).
//   rngFor           - convenience: seed a per-room rng from area seed + key.
//
// ASCII only; no em dashes; braces on all control flow.

import * as tapestry from "@tapestry/engine";
import { splitmix64, hashCoord, weightedPick } from "./prng.js";
import { statsFor, rarityModifier, clampLevel } from "./balance-table.js";
import type { OracleEntry } from "./oracle-tables.js";

const REUSE_WEIGHT = 0.65;

// ---------------------------------------------------------------------------
// rollEntry - weighted pick from an OracleEntry[].
// weightedPick takes { w, value }[] and returns value directly (no .value).
// ---------------------------------------------------------------------------

export function rollEntry(entries: OracleEntry[], rng: () => number): OracleEntry {
    return weightedPick(entries.map((e) => ({ w: e.w, value: e })), rng);
}

// ---------------------------------------------------------------------------
// shouldReuse - mint-vs-reuse decision for spawn pools.
// Never reuses when existingCount === 0 (nothing to reuse from).
// ---------------------------------------------------------------------------

export function shouldReuse(existingCount: number, rng: () => number): boolean {
    if (existingCount <= 0) { return false; }
    return rng() < REUSE_WEIGHT;
}

// ---------------------------------------------------------------------------
// table - read frozen table entries from the engine registry.
// Returns [] if the table is not registered (area not yet frozen).
// ---------------------------------------------------------------------------

function table(areaId: string, kind: string): OracleEntry[] {
    const t = (tapestry as any).oracle.table(areaId + ":" + kind);
    if (!t || !t.entries) { return []; }
    return t.entries;
}

// ---------------------------------------------------------------------------
// rollFormula - roll a concrete number from "NdM" dice notation using rng.
// Falls back to parseInt on non-dice strings.
// ---------------------------------------------------------------------------

function rollFormula(notation: string, rng: () => number): number {
    const m = /^(\d+)d(\d+)$/.exec(notation);
    if (!m) { return parseInt(notation, 10) || 1; }
    const n = parseInt(m[1], 10);
    const die = parseInt(m[2], 10);
    let sum = 0;
    for (let i = 0; i < n; i++) {
        sum += 1 + Math.floor(rng() * die);
    }
    return sum;
}

// ---------------------------------------------------------------------------
// mintMobInstance - roll a mob type from frozen <area>:mobs, roll concrete
// stats from master-balance at level, return the frozen override blob.
// Returns null if the table is empty.
// ---------------------------------------------------------------------------

export function mintMobInstance(areaId: string, level: number, rng: () => number): any {
    const entries = table(areaId, "mobs");
    if (entries.length === 0) { return null; }
    const type = rollEntry(entries, rng);
    const stats = statsFor("mob", level, rng);
    const maxHp = rollFormula(stats.hp as string, rng);
    return {
        fromType: type.id,
        name: type.name,
        desc: type.desc,
        maxHp,
        damage: stats.damage,
        items: [],
        noReroll: true,
    };
}

// ---------------------------------------------------------------------------
// mintItemInstance - roll an item type from frozen <area>:items, apply rarity
// modifier to the level band, roll stats, return the frozen override blob.
// Returns null if the table is empty.
// ---------------------------------------------------------------------------

export function mintItemInstance(areaId: string, level: number, rng: () => number): any {
    const entries = table(areaId, "items");
    if (entries.length === 0) { return null; }
    const type = rollEntry(entries, rng);
    const rarity = type.rarity || "common";
    const effectiveLevel = clampLevel(level + rarityModifier(rarity));
    const kind = type.balance_ref === "armor" ? "armor" : "weapon";
    const stats = statsFor(kind, effectiveLevel, rng);
    return {
        fromType: type.id,
        name: type.name,
        desc: type.desc,
        rarity,
        damage: stats.damage,
        ac: (stats as any).ac,
        slots: (stats as any).slots,
    };
}

// ---------------------------------------------------------------------------
// mintBossInstance - use the first entry in the frozen <area>:boss table.
// Boss type is deterministic (index 0); only stats are rolled.
// Returns null if the table is empty.
// ---------------------------------------------------------------------------

export function mintBossInstance(areaId: string, level: number, rng: () => number): any {
    const entries = table(areaId, "boss");
    if (entries.length === 0) { return null; }
    const type = entries[0];
    const stats = statsFor("boss", level, rng);
    return {
        fromType: type.id,
        name: type.name,
        desc: type.desc,
        maxHp: stats.hp,
        damage: stats.damage,
        noReroll: true,
    };
}

// ---------------------------------------------------------------------------
// rngFor - convenience: seed a per-room/per-spawn rng from area seed + key.
// ---------------------------------------------------------------------------

export function rngFor(areaSeed: number, key: string): () => number {
    return splitmix64(hashCoord(areaSeed, key));
}
