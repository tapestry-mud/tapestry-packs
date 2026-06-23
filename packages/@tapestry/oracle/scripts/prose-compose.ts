// prose-compose.ts - Deterministic prose composition from frozen table fragments.
//
// composeProse reads the frozen <areaId>:prose table from the engine registry
// and picks one opener, one detail, and one atmosphere fragment using a
// coord-seeded PRNG. No LLM calls - pure table rolls + string assembly.
//
// pickFragments is exported for golden tests (it takes pre-loaded entries so
// no engine binding is needed in the test harness).
//
// ASCII only; no em dashes; braces on all control flow.

import * as tapestry from "@tapestry/engine";
import { splitmix64, hashCoord, pick } from "./prng.js";
import type { OracleEntry } from "./oracle-tables.js";

// ---------------------------------------------------------------------------
// byTag - filter entries to those matching a specific name tag.
// ---------------------------------------------------------------------------

function byTag(entries: OracleEntry[], tag: string): OracleEntry[] {
    return entries.filter((e) => e.name === tag);
}

// ---------------------------------------------------------------------------
// pickFragments - pick one opener, one detail, one atmosphere from entries.
// Uses a single rng stream so the three picks are sequenced and fully
// deterministic for a given seed. Skips a fragment type if no entries exist
// for it. Returns "A plain space." if no entries at all.
//
// Exported for golden tests.
// ---------------------------------------------------------------------------

export function pickFragments(entries: OracleEntry[], rng: () => number): string {
    const openers = byTag(entries, "opener");
    const details = byTag(entries, "detail");
    const atmos = byTag(entries, "atmosphere");
    const parts: string[] = [];
    if (openers.length > 0) {
        parts.push(pick(openers, rng).desc);
    }
    if (details.length > 0) {
        parts.push(pick(details, rng).desc);
    }
    if (atmos.length > 0) {
        parts.push(pick(atmos, rng).desc);
    }
    if (parts.length === 0) {
        return "A plain space.";
    }
    return parts.join(" ");
}

// ---------------------------------------------------------------------------
// composeProse - assemble a room description from the frozen prose table.
//
// areaId  - area identifier (same key prefix used for all oracle tables).
// areaSeed - the area's deterministic seed (from the sidecar).
// coord   - room coordinate string (e.g. "0,0,0").
// _place  - reserved for future place-type filtering; not used yet.
// ---------------------------------------------------------------------------

export function composeProse(areaId: string, areaSeed: number, coord: string, _place: string): string {
    const t = (tapestry as any).oracle.table(areaId + ":prose");
    const entries: OracleEntry[] = (t && t.entries) ? t.entries : [];
    const rng = splitmix64(hashCoord(areaSeed, coord + ":prose"));
    return pickFragments(entries, rng);
}
