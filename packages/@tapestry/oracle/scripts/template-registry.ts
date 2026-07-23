// template-registry.ts - the thread template registry: open/draft state + stable identity.
//
// The mint bench bakes a draft template and flips it open; the board lists open (and
// archived) templates. Templates are persisted areas, but their game metadata (band
// window, state, display name, seed, death mode) needs a discoverable index that
// survives reboot on its own, independent of any single generated run area.
//
// Persisted as ONE frozen oracle table (kind "template") on the fixed well-known area
// "oracle-templates" - mirroring how target_rooms rides the "structure" table on a
// generated area in area-gen.ts. Each entry carries a single JSON blob in `desc` (the
// oracle_runs-style single-JSON-string pattern) rather than one field per column, which
// dodges the Jint array-marshalling gotcha (reference_jint_jsvalue_array_marshalling)
// and keeps the shape forward-compatible as ThreadTemplate grows fields.
//
// ASCII; braces on all control flow.

import * as tapestry from "@tapestry/engine";

const REGISTRY_AREA = "oracle-templates";
const TABLE_KIND = "template";

export interface ThreadTemplate {
    templateId: string;   // stable: the seed hex slug, e.g. "week-1a2b3c4d"
    name: string;         // display name on the board
    seed: number;         // deterministic re-roll seed
    bandFloor: number;    // authored band window floor
    bandCap: number;      // authored band window cap
    sizeBand: string;     // "school" | "standard" | "epic"
    bakedSetId: string;   // LLM-off table set id used at bake
    state: "draft" | "open";
    deathMode: "grind" | "unraveling";
}

/** Pure. */
export function encodeTemplates(list: ThreadTemplate[]): { kind: string; entries: any[] } {
    const entries = list.map((t) => ({
        w: 10, id: t.templateId, name: t.name, desc: JSON.stringify(t),
    }));
    return { kind: TABLE_KIND, entries };
}

/** Pure. A corrupt or desc-less row is skipped, never crashes the board. */
export function decodeTemplates(entries: any[]): ThreadTemplate[] {
    const out: ThreadTemplate[] = [];
    if (!Array.isArray(entries)) { return out; }
    for (let i = 0; i < entries.length; i++) {
        const raw = entries[i] && entries[i].desc ? entries[i].desc : "";
        if (!raw) { continue; }
        try {
            out.push(JSON.parse(raw) as ThreadTemplate);
        } catch (e) {
            // A corrupt row is skipped, never crashes the board.
        }
    }
    return out;
}

function loadAll(): ThreadTemplate[] {
    const table = (tapestry as any).oracle.table(REGISTRY_AREA + ":" + TABLE_KIND);
    if (!table || !table.entries) { return []; }
    return decodeTemplates(table.entries);
}

function saveAll(list: ThreadTemplate[]): void {
    // Ensure the registry area exists (idempotent; createArea returns false if present).
    tapestry.authoring.createArea(REGISTRY_AREA, "Oracle Templates");
    const encoded = encodeTemplates(list);
    (tapestry as any).authoring.writeOracleTable({
        areaId: REGISTRY_AREA, kind: encoded.kind, entries: encoded.entries,
    });
}

export function listTemplates(): ThreadTemplate[] {
    return loadAll();
}

export function getTemplate(templateId: string): ThreadTemplate | undefined {
    return loadAll().find((t) => t.templateId === templateId);
}

/** Registers a new template, or replaces an existing entry with the same templateId. */
export function registerTemplate(t: ThreadTemplate): void {
    const all = loadAll().filter((x) => x.templateId !== t.templateId);
    all.push(t);
    saveAll(all);
}

/** Returns true when the template was found (and its state updated); false otherwise. */
export function setTemplateState(templateId: string, state: "draft" | "open"): boolean {
    const all = loadAll();
    const idx = all.findIndex((t) => t.templateId === templateId);
    if (idx < 0) { return false; }
    all[idx].state = state;
    saveAll(all);
    return true;
}
