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
import { selectMobEntry, pickEpithet, defaultMinibossFor } from "./tiers.js";
import {
    selectItemEntry, itemContextBump, pickSignatureName, isSignatureBand,
    type ItemDropContext,
} from "./item-tiers.js";
import { parseLandmarksTable } from "./sector-compose.js";
import type { SixAxisTable } from "./six-axis.js";
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
// mintMobInstance - select a mob type from frozen <area>:mobs (six-axis: the
// MOB-1 menace roll bent by the room's CONTEXT bump, resolved through the band
// resolver; a 0.4.0 flat table falls back to the flat weighted pick), roll
// concrete stats from master-balance at level, return the frozen override blob.
// Returns null if the table is empty.
// ---------------------------------------------------------------------------

export function mintMobInstance(
    areaId: string,
    level: number,
    rng: () => number,
    mob1?: SixAxisTable,
    bump: number = 0
): any {
    const entries = table(areaId, "mobs");
    if (entries.length === 0) { return null; }
    const type = selectMobEntry(mob1, entries, bump, rng);
    if (!type) { return null; }
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
// mintEliteInstance - the charged-band tier (stage-B ladder). Selection forces
// the top of the menace span (apex band preferred; empty slice falls back
// flat), the SIGNATURE epithet is rolled once here and frozen into the name,
// and stats come from the elite row of master-balance. Swell dials are
// template data (swell-elite) - spawn overrides cannot carry properties.
// ---------------------------------------------------------------------------

export function mintEliteInstance(
    areaId: string,
    level: number,
    rng: () => number,
    mob1?: SixAxisTable
): any {
    const entries = table(areaId, "mobs");
    if (entries.length === 0) { return null; }
    const type = selectMobEntry(mob1, entries, 99, rng);
    if (!type) { return null; }
    const epithet = pickEpithet(rng);
    const stats = statsFor("elite", level, rng);
    const maxHp = rollFormula(stats.hp as string, rng);
    return {
        fromType: "elite-" + type.id,
        name: "the " + epithet + " " + type.name,
        desc: type.desc,
        maxHp,
        damage: stats.damage,
        items: [],
        noReroll: true,
    };
}

// ---------------------------------------------------------------------------
// mintMinibossInstance - the landmark tier (stage-B ladder). Identity comes
// from the frozen landmarks table (boss-<i> rows); a 0.4.0-era table (no boss
// rows) synthesizes "the keeper of the <landmark>" via defaultMinibossFor.
// Stats come from the miniboss row of master-balance.
// Returns null when the landmarks table has no record at that index.
// ---------------------------------------------------------------------------

export function mintMinibossInstance(
    areaId: string,
    landmarkIndex: number,
    level: number,
    rng: () => number
): any {
    const lm = table(areaId, "landmarks");
    const parsed = parseLandmarksTable(lm);
    const dress = parsed[landmarkIndex];
    if (!dress || dress.name === "") { return null; }
    let bossName = dress.bossName;
    let bossDesc = dress.bossDesc;
    if (bossName === "") {
        const synth = defaultMinibossFor(dress.name);
        bossName = synth.bossName;
        bossDesc = synth.bossDesc;
    } else if (bossDesc === "") {
        bossDesc = defaultMinibossFor(dress.name).bossDesc;
    }
    const stats = statsFor("miniboss", level, rng);
    return {
        fromType: "miniboss-" + landmarkIndex,
        name: bossName,
        desc: bossDesc,
        maxHp: rollFormula(String(stats.hp), rng),
        damage: stats.damage,
        noReroll: true,
    };
}

// ---------------------------------------------------------------------------
// mintMobInstanceByTypeId - re-instantiate a specific mob type from the frozen
// <area>:mobs table by its id. Used when shouldReuse fires to spawn another
// copy of an already-introduced type (consistent encounter feel within an area).
// Returns null if the type is not found in the table.
// ---------------------------------------------------------------------------

export function mintMobInstanceByTypeId(areaId: string, typeId: string, level: number, rng: () => number): any {
    const entries = table(areaId, "mobs");
    if (entries.length === 0) { return null; }
    let type = null;
    for (let i = 0; i < entries.length; i++) {
        if (entries[i].id === typeId) {
            type = entries[i];
            break;
        }
    }
    if (!type) { return null; }
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
// effectiveItemLevel - the loot band math (Task 8): bend the run's dialed
// level by the rolled rarity's modifier, then clamp to the 1..60 ladder.
// Pure wrapper around balance-table's clampLevel/rarityModifier so it is
// golden-testable under plain node (resolver.ts has no import-time engine
// hooks - see tests/loot-band.golden.test.mjs).
// ---------------------------------------------------------------------------

export function effectiveItemLevel(level: number, rarity: string): number {
    return clampLevel(level + rarityModifier(rarity));
}

// ---------------------------------------------------------------------------
// mintItemInstance - roll an item type from frozen <area>:items through the
// ITEM-1 band resolver (bent by ITEM-6 context), apply rarity modifier to
// the level band, roll stats, freeze via writeItemTemplate, and return
// { id, base, name } so the caller can attach it to a mob's inventory.
// The epic band (ITEM-1's signature-firing band) freezes a proper-noun
// SIGNATURE name over the dressing name. Returns null if the table is empty
// or the base template is unknown.
// ---------------------------------------------------------------------------

export function mintItemInstance(
    areaId: string,
    level: number,
    rng: () => number,
    coordKey: string,
    index: number,
    item1?: SixAxisTable,
    item6?: SixAxisTable,
    ctx?: ItemDropContext
): { id: string; base: string; name: string } | null {
    const entries = table(areaId, "items");
    if (entries.length === 0) { return null; }
    const bump = ctx ? itemContextBump(item6, ctx) : 0;
    const type = selectItemEntry(item1, entries, bump, rng);
    if (!type) { return null; }
    const rarity = type.rarity || "common";
    const effectiveLevel = effectiveItemLevel(level, rarity);
    const isArmor = type.balance_ref === "armor";
    const kind = isArmor ? "armor" : "weapon";
    const stats = statsFor(kind, effectiveLevel, rng);

    let baseId: string;
    const properties: Record<string, any> = { rarity };
    if (isArmor) {
        // statsFor("armor",...) -> { ac: number, slots: "a,b,c" }. Pick a slot deterministically.
        const slotList = String((stats as any).slots || "body").split(",");
        const slot = slotList[Math.floor(rng() * slotList.length)] || "body";
        baseId = "tapestry-oracle:armor-" + slot;
        const acVal = Number((stats as any).ac) || 0;
        properties.slot = slot;
        properties.ac = { slash: acVal, pierce: acVal, bash: acVal, exotic: acVal };
    } else {
        baseId = "tapestry-oracle:weapon-melee";
        properties.slot = "wield";
        properties.damage_dice = String(stats.damage);
    }

    const modifiers: Array<{ stat: string; value: number }> = [];
    const maxHpVal = Number((stats as any).max_hp) || 0;
    if (maxHpVal > 0) {
        modifiers.push({ stat: "maxHp", value: maxHpVal });
    }

    // SIGNATURE (ITEM-5): the top ITEM-1 band freezes a unique proper name
    // once at mint, overriding the rolled type's dressing name. Same drop,
    // two signatures = two different named items - the deck is small (8
    // entries) but the roll happens once per mint, not once per area.
    // The frozen NAME is the whole observable effect this slice - we do NOT
    // stamp a marker property. The mint is persisted to a generated area pack
    // that boots with no manifest (strict validation), so any property here
    // must be an ENGINE-registered property; an unregistered flag (e.g.
    // `signature: true`) crashes the reload with "unregistered property". A
    // queryable signature marker is a future slice that registers the property.
    let name = type.name;
    if (isSignatureBand(item1, rarity)) {
        name = pickSignatureName(rng);
    }

    // Fold the killer tier into the frozen id (defaulting to "trash" when no
    // ctx is supplied) so miniboss/elite/boss/trash loot minted at the SAME
    // coordKey and the SAME index (Task 4 mints each of the three new tiers
    // at index 0) can never collide - each tier gets its own id namespace
    // even when several tiers fire in one room and roll the same base type.
    const tierTag = ctx ? ctx.killerTier : "trash";
    const frozenId = areaId + ":loot-" + type.id + "-" + coordKey + "-" + tierTag + "-" + index;
    const written = (tapestry as any).authoring.writeItemTemplate({
        areaId,
        id: frozenId,
        base: baseId,
        name,
        desc: type.desc,
        type: "item",
        properties,
        modifiers,
    });
    if (!written) { return null; }
    return { id: frozenId, base: baseId, name };
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
        maxHp: rollFormula(stats.hp as string, rng),
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
