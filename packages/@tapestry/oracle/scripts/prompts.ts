import { data } from "@tapestry/engine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromptEntry {
    system: string;
    template: string;
}

/** facts passed to placeholder() when the LLM is off, times out, or returns bad data. */
export interface PlaceholderFacts {
    biome?: string;
    theme?: string;
    name?: string;
    level?: number;
    direction?: string;
    exits?: string[];
    mood?: string;
    rank?: number;
    slot?: string;
    level_min?: number;
    level_max?: number;
}

// ---------------------------------------------------------------------------
// Prompts cache
// ---------------------------------------------------------------------------

let _prompts: Record<string, PromptEntry> | null = null;

function getPrompts(): Record<string, PromptEntry> {
    if (!_prompts) {
        _prompts = data.loadYaml("data/prompts.yml") as Record<string, PromptEntry>;
    }
    return _prompts;
}

// ---------------------------------------------------------------------------
// getPrompt - returns the raw system + template for a key.
// P3/P4 pass these directly to authoring.recommend() as options.system and
// options.template. The engine (seam E2) substitutes {var} slots and prepends
// projected room context before calling the LLM. The pack never substitutes here.
// ---------------------------------------------------------------------------

export function getPrompt(key: string): PromptEntry {
    const prompts = getPrompts();
    const entry = prompts[key];
    if (!entry) {
        throw new Error(`oracle/prompts: unknown prompt key '${key}'. Known keys: ${Object.keys(prompts).join(", ")}`);
    }
    return { system: entry.system, template: entry.template };
}

// ---------------------------------------------------------------------------
// renderPrompt - optional pack-side full substitution (completeness helper).
// Substitutes {var} slots in the template and returns a ready {system, user} pair.
// This is NOT the recommend path - P3/P4 use getPrompt + authoring.recommend.
// Useful for debugging and for any direct LLM call outside the recommend seam.
// ---------------------------------------------------------------------------

export function renderPrompt(key: string, vars: Record<string, string>): { system: string; user: string } {
    const entry = getPrompt(key);
    let user = entry.template;
    for (const k of Object.keys(vars)) {
        user = user.split("{" + k + "}").join(vars[k]);
    }
    return { system: entry.system, user };
}

// ---------------------------------------------------------------------------
// placeholder - deterministic, ASCII-clean, fact-stitched fallback.
//
// Called when authoring.recommend() returns null (LLM off / timeout / bad data).
// Pure function of facts: same facts -> same string, every time.
// No randomness, no time, no side effects.
//
// All output is strict 7-bit ASCII. No em dashes, no smart quotes, no unicode.
// ---------------------------------------------------------------------------

export function placeholder(kind: "room" | "name" | "exit", facts: PlaceholderFacts): string {
    if (kind === "room") {
        return buildRoomPlaceholder(facts);
    }
    if (kind === "name") {
        return buildNamePlaceholder(facts);
    }
    if (kind === "exit") {
        return buildExitPlaceholder(facts);
    }
    // TypeScript exhaustiveness guard - should never reach here at runtime.
    throw new Error(`oracle/prompts: unknown placeholder kind '${kind}'`);
}

// ---------------------------------------------------------------------------
// Room placeholder
//
// "A stretch of {biome} terrain. {mob_phrase} {exit_phrase}"
// e.g. "A stretch of swamp terrain. The air is heavy and still. Exits: north, west."
// ---------------------------------------------------------------------------

function buildRoomPlaceholder(facts: PlaceholderFacts): string {
    const biome = sanitize(facts.biome ?? "open");
    const mood = sanitize(facts.mood ?? "");

    let desc: string;
    if (mood) {
        desc = "A stretch of " + biome + " terrain. " + capitalize(mood) + ".";
    } else {
        desc = "A stretch of " + biome + " terrain.";
    }

    const exits = facts.exits;
    if (exits && exits.length > 0) {
        const exitList = exits.map((e) => sanitize(e)).join(", ");
        desc = desc + " Exits: " + exitList + ".";
    }

    return desc;
}

// ---------------------------------------------------------------------------
// Name placeholder
//
// Produces a fact-based default like "rotting-forest creature" or "swamp boss".
// Uses biome + rank/level to vary without any randomness.
// ---------------------------------------------------------------------------

function buildNamePlaceholder(facts: PlaceholderFacts): string {
    const biome = sanitize(facts.biome ?? "unknown");

    if (facts.rank !== undefined && facts.rank > 0) {
        // Boss name placeholder.
        return "the " + biome + " boss";
    }

    const level = facts.level ?? 1;
    const tierLabel = levelTier(level);
    return tierLabel + " " + biome + " creature";
}

// ---------------------------------------------------------------------------
// Exit placeholder
//
// Produces a direction-based label like "path leading north".
// Incorporates biome if available.
// ---------------------------------------------------------------------------

function buildExitPlaceholder(facts: PlaceholderFacts): string {
    const direction = sanitize(facts.direction ?? "forward");
    const biome = facts.biome ? sanitize(facts.biome) + " " : "";
    return biome + "path leading " + direction;
}

// ---------------------------------------------------------------------------
// Helpers (private)
// ---------------------------------------------------------------------------

/** Strip non-ASCII and control characters, trim whitespace. */
function sanitize(s: string): string {
    // Replace non-printable-ASCII (including smart quotes, em dashes, unicode) with nothing.
    // Keep plain ASCII printable range (0x20-0x7E), but drop the DEL (0x7F).
    return s.replace(/[^\x20-\x7E]/g, "").trim();
}

function capitalize(s: string): string {
    if (!s) {
        return s;
    }
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Map a level number to a simple tier word, deterministically. No randomness. */
function levelTier(level: number): string {
    if (level <= 1) { return "feeble"; }
    if (level <= 2) { return "weak"; }
    if (level <= 3) { return "common"; }
    if (level <= 4) { return "dangerous"; }
    return "deadly";
}
