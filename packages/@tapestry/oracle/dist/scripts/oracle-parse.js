// oracle-parse.ts - Pure LLM-output parse helpers. ZERO engine imports so they are
// unit-testable under plain Node. Hardened against small-model leakage: preambles,
// numbering, over-long fragments, junk rows. (Crammed multi-record lines are NOT
// hardened - no such leak has been observed; a splitter is deferred until one is seen.)
const RARITY_WEIGHTS = { common: 60, uncommon: 30, rare: 8, epic: 2 };
const MAX_FRAGMENT = 120;
/** Strip leading numbering ("1.", "2)", "- ", "* ") and surrounding whitespace from a line. */
export function cleanLine(raw) {
    let s = raw.trim();
    s = s.replace(/^\s*\d+\s*[.)]\s*/, "");
    s = s.replace(/^\s*[-*]\s+/, "");
    return s.trim();
}
/** A line that is an LLM preamble: ends with ":" and carries no "|" record separator. */
function isPreamble(line) {
    const s = line.trim();
    return s.endsWith(":") && s.indexOf("|") === -1;
}
/** Cap a fragment length and trim. Returns "" for nullish input. */
function capFragment(s) {
    const t = (s || "").trim();
    return t.length > MAX_FRAGMENT ? t.slice(0, MAX_FRAGMENT).trim() : t;
}
/** A name is junk if empty after cleaning or has no alphanumeric character. */
function isJunkName(name) {
    return name.length === 0 || !/[a-z0-9]/i.test(name);
}
export function slug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "item";
}
export function parseList(raw) {
    if (!raw) {
        return [];
    }
    let body = raw;
    // Strip a leading interjection ("Sure!", "Okay,", "OK -", "Alright,") before the real list.
    body = body.replace(/^\s*(sure|okay|ok|alright|here you go)\s*[!,.:-]*\s+/i, "");
    // Strip a single-line lead-in clause that ends in ":" with NO comma before the colon
    // ("Common places: a, b, c" -> "a, b, c") for ANY phrasing - not keyed on the word "here".
    // A legit list item containing a colon is preserved because a comma would precede the colon.
    if (body.indexOf("\n") === -1) {
        const colon = body.indexOf(":");
        if (colon >= 0 && body.slice(0, colon).indexOf(",") === -1) {
            body = body.slice(colon + 1);
        }
    }
    return body
        .split(",")
        .map((s) => cleanLine(s))
        .map((s) => capFragment(s))
        .filter((s) => s.length > 0 && /[a-z0-9]/i.test(s))
        .slice(0, 8);
}
export function parsePipeLines(raw, defaultBalanceRef, isItem) {
    if (!raw) {
        return [];
    }
    const out = [];
    for (const rawLine of raw.split("\n")) {
        if (isPreamble(rawLine)) {
            continue;
        }
        const line = cleanLine(rawLine);
        if (line.length === 0) {
            continue;
        }
        const parts = line.split("|").map((p) => p.trim());
        if (parts.length < 2) {
            continue;
        }
        const name = capFragment(parts[0]);
        if (isJunkName(name)) {
            continue;
        }
        const desc = capFragment(parts[1]);
        const rarity = isItem ? normalizeRarity(parts[2]) : undefined;
        const balanceRef = isItem ? normalizeItemKind(parts[3]) : defaultBalanceRef;
        const w = isItem ? (RARITY_WEIGHTS[rarity] || 60) : 50;
        const entry = { w, id: slug(name), name, desc, balance_ref: balanceRef };
        if (rarity) {
            entry.rarity = rarity;
        }
        out.push(entry);
    }
    return out;
}
export function pushLines(out, raw, kind) {
    if (!raw) {
        return;
    }
    let i = 0;
    for (const rawLine of raw.split("\n")) {
        if (isPreamble(rawLine)) {
            continue;
        }
        const t = capFragment(cleanLine(rawLine));
        if (t.length === 0 || !/[a-z0-9]/i.test(t)) {
            continue;
        }
        out.push({ w: 10, id: kind + "-" + i, name: kind, desc: t });
        i++;
    }
}
function normalizeRarity(s) {
    const r = (s || "").toLowerCase().trim();
    return RARITY_WEIGHTS[r] !== undefined ? r : "common";
}
function normalizeItemKind(s) {
    return (s || "").toLowerCase().trim() === "armor" ? "armor" : "weapon";
}
