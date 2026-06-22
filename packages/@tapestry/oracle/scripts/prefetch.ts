// prefetch.ts - Session cache + background neighbor prefetch.
//
// THE HARD LINE (spec section 5):
//   Prefetch is PURE-ONLY. Zero world writes. Zero materializeRoom calls.
//   Zero RunState / boss-clock access. Zero engine mutations.
//   Only allowed operations: rollRoomFacts (pure) + authoring.recommend (prose async).
//
// Cache shape: Map<roomPath, CacheEntry>
//   roomPath: "x,y" string (the same coord-key used everywhere).
//   CacheEntry: { facts, prose } where prose starts null and fills when recommend resolves.
//
// Determinism: a cache miss is always safe. rollRoomFacts(areaSeed, path, roster)
//   returns byte-identical facts for the same inputs (hashCoord determinism).
//   Only prose may differ until the room is committed (sidecar write).
//
// materializeRoom still runs EXACTLY ONCE per first arrival (the resolver checks
//   neighborExists before calling materializeRoom, so a cache hit does not cause
//   a double-materialize - the resolver skips materializeRoom on backtrack regardless).
//
// ASCII; no em dashes; braces on all control flow.

import * as tapestry from "@tapestry/engine";
import { DIR_OFFSETS, rollRoomFacts, type RoomFacts } from "./room-gen.js";
import { type Roster } from "./roster.js";
import { getPrompt, placeholder } from "./prompts.js";
import { hashCoord, splitmix64, pick } from "./prng.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CacheEntry {
    facts: RoomFacts;
    /** null until the recommend callback resolves (or LLM disabled). */
    prose: string | null;
}

// ---------------------------------------------------------------------------
// In-memory session cache
// Keyed by roomPath ("x,y"). Cleared implicitly at module load (per session).
// ---------------------------------------------------------------------------

const _cache = new Map<string, CacheEntry>();

// ---------------------------------------------------------------------------
// takeCached - Returns AND removes the entry for roomPath.
// Used by the resolver when committing a room on arrival: consume the cached
// entry so it does not hang around after the room is materialized.
// ---------------------------------------------------------------------------

export function takeCached(roomPath: string): CacheEntry | undefined {
    const entry = _cache.get(roomPath);
    if (entry !== undefined) {
        _cache.delete(roomPath);
    }
    return entry;
}

// ---------------------------------------------------------------------------
// peekCached - Returns the entry without removing it.
// Used to check whether a neighbor is already warm before prefetching.
// ---------------------------------------------------------------------------

export function peekCached(roomPath: string): CacheEntry | undefined {
    return _cache.get(roomPath);
}

// ---------------------------------------------------------------------------
// prefetchNeighbors
//
// For each of the 4 cardinal neighbors off fromRoomPath:
//   1. Skip if already in the cache.
//   2. rollRoomFacts (pure, instant) -> store entry with prose=null.
//   3. Fire authoring.recommend for prose (if enabled); on resolve, fill entry.prose.
//      roomId is OMITTED - the room is not yet minted. The engine uses an empty
//      RoomData context (spec section 5, E2 brief: roomId may be omitted).
//
// MUST NOT call materializeRoom.
// MUST NOT call spawnMob / createRoom / setStubExit.
// MUST NOT read or write RunState or the boss clock.
// MUST NOT write the world.
//
// biomePalette is optional: passed through for per-neighbor biome derivation
// used in the recommend vars (same deterministic pick as the resolver uses).
// ---------------------------------------------------------------------------

export function prefetchNeighbors(
    areaSeed: number,
    fromRoomPath: string,
    roster: Roster,
    biomePalette?: string[]
): void {
    const parts = fromRoomPath.split(",");
    if (parts.length !== 2) {
        return;
    }
    const x = parseInt(parts[0], 10);
    const y = parseInt(parts[1], 10);
    if (isNaN(x) || isNaN(y)) {
        return;
    }

    const canRecommend = tapestry.authoring.recommendEnabled &&
        tapestry.authoring.recommendEnabled();

    const dirKeys = Object.keys(DIR_OFFSETS);
    for (let i = 0; i < dirKeys.length; i++) {
        const dir = dirKeys[i];
        const offset = DIR_OFFSETS[dir];
        const nx = x + offset[0];
        const ny = y + offset[1];
        const neighborPath = nx + "," + ny;

        // Skip if already warm.
        if (_cache.has(neighborPath)) {
            continue;
        }

        // Pure fact roll (ONLY pure operation allowed in prefetch).
        const facts = rollRoomFacts(areaSeed, neighborPath, roster);

        // Store entry immediately with prose=null.
        const entry: CacheEntry = { facts, prose: null };
        _cache.set(neighborPath, entry);

        if (!canRecommend) {
            // LLM off: fill prose with placeholder now (synchronously).
            const biome = deriveBiome(areaSeed, neighborPath, biomePalette);
            const exitDirs = facts.exits.map(function (e) { return e.direction; });
            entry.prose = placeholder("room", {
                biome,
                mood: facts.proseVars.mood,
                exits: exitDirs,
            });
            continue;
        }

        // Async prose via authoring.recommend (roomId omitted - not yet minted).
        // Capture neighborPath + entry in the closure by value (loop-safe via let in for-of).
        const capturedPath = neighborPath;
        const capturedEntry = entry;
        const biome = deriveBiome(areaSeed, neighborPath, biomePalette);

        const roomPr = getPrompt("room_prose");
        tapestry.authoring.recommend(
            {
                field: "description",
                template: roomPr.template,
                system: roomPr.system,
                vars: {
                    biome,
                    theme: facts.proseVars.theme || biome + " wilds",
                    mood: facts.proseVars.mood,
                },
            },
            function (result: string | null) {
                // Only write if this path is still in the cache (not yet committed).
                if (!_cache.has(capturedPath)) {
                    return;
                }
                const exitDirs = capturedEntry.facts.exits.map(function (e) { return e.direction; });
                if (result) {
                    capturedEntry.prose = result;
                } else {
                    capturedEntry.prose = placeholder("room", {
                        biome,
                        mood: capturedEntry.facts.proseVars.mood,
                        exits: exitDirs,
                    });
                }
            }
        );
    }
}

// ---------------------------------------------------------------------------
// deriveBiome - deterministic biome pick for a neighbor path.
// Mirrors the logic in stub-resolver.ts (same seed, same pick -> same biome).
// Pure: no engine calls.
// ---------------------------------------------------------------------------

function deriveBiome(areaSeed: number, roomPath: string, biomePalette?: string[]): string {
    if (!biomePalette || biomePalette.length === 0) {
        return "wilds";
    }
    const biomeRng = splitmix64(hashCoord(areaSeed, roomPath));
    return pick(biomePalette, biomeRng);
}
