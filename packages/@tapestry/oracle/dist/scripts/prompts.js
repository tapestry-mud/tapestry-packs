import { data } from "@tapestry/engine";
// ---------------------------------------------------------------------------
// Prompts cache
//
// Eagerly loaded at module init time so data.loadYaml runs while CurrentPackDir
// is still set (the engine clears it after boot; lazy init at runtime = null return).
// ---------------------------------------------------------------------------
const _prompts = data.loadYaml("data/prompts.yml");
function getPrompts() {
    return _prompts;
}
// ---------------------------------------------------------------------------
// getPrompt - returns the raw system + template for a key.
// P3/P4 pass these directly to authoring.recommend() as options.system and
// options.template. The engine (seam E2) substitutes {var} slots and prepends
// projected room context before calling the LLM. The pack never substitutes here.
// ---------------------------------------------------------------------------
export function getPrompt(key) {
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
export function renderPrompt(key, vars) {
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
export function placeholder(kind, facts) {
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
function buildRoomPlaceholder(facts) {
    const biome = sanitize(facts.biome ?? "open");
    const mood = sanitize(facts.mood ?? "");
    // Exits are NOT appended here: the engine renders the exit list separately.
    let desc;
    if (mood) {
        desc = "You stand in " + biome + " terrain. " + capitalize(mood) + ".";
    }
    else {
        desc = "You stand in a stretch of " + biome + " terrain.";
    }
    return desc;
}
// ---------------------------------------------------------------------------
// Name placeholder
//
// Produces a fact-based default like "rotting-forest creature" or "swamp boss".
// Uses biome + rank/level to vary without any randomness.
// ---------------------------------------------------------------------------
function buildNamePlaceholder(facts) {
    const biome = sanitize(facts.biome ?? "wilds");
    if (facts.rank !== undefined && facts.rank > 0) {
        // Boss name placeholder.
        return "the " + biome + " lurker";
    }
    const level = facts.level ?? 1;
    const tierLabel = levelTier(level);
    return tierLabel + " " + biome + " hunter";
}
// ---------------------------------------------------------------------------
// Exit placeholder
//
// Produces a direction-based label like "path leading north".
// Incorporates biome if available.
// ---------------------------------------------------------------------------
function buildExitPlaceholder(facts) {
    const direction = sanitize(facts.direction ?? "forward");
    const biome = facts.biome ? sanitize(facts.biome) + " " : "";
    return biome + "trail heading " + direction;
}
// ---------------------------------------------------------------------------
// Helpers (private)
// ---------------------------------------------------------------------------
/** Strip non-ASCII and control characters, trim whitespace. */
function sanitize(s) {
    // Replace non-printable-ASCII (including smart quotes, em dashes, unicode) with nothing.
    // Keep plain ASCII printable range (0x20-0x7E), but drop the DEL (0x7F).
    return s.replace(/[^\x20-\x7E]/g, "").trim();
}
function capitalize(s) {
    if (!s) {
        return s;
    }
    return s.charAt(0).toUpperCase() + s.slice(1);
}
/** Map a level number to a simple tier word, deterministically. No randomness. */
function levelTier(level) {
    if (level <= 1) {
        return "feeble";
    }
    if (level <= 2) {
        return "weak";
    }
    if (level <= 3) {
        return "common";
    }
    if (level <= 4) {
        return "dangerous";
    }
    return "deadly";
}
