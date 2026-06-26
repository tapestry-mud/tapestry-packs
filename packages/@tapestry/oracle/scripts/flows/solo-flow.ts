// flows/solo-flow.ts - Five-step wizard for solo area generation (v2).
//
// Registers the oracle_solo flow. The solo command triggers this flow.
// Steps stash answers into entity properties; on_complete reads them,
// validates, and calls createSoloArea.
//
// Level guards (spec section 7):
//   - Blank -> random band: min = 1 + floor(random * 3), max = min + 4.
//   - Non-blank non-integer -> error.
//   - min >= 0, max <= SERVER_MAX_LEVEL, min <= max -> error on violation.
//
// destination_pack:
//   - Blank -> create a fresh scratch pack "@scratch/oracle-run".
//   - Non-blank bare name -> scoped under "@solo/<slug>".
//   - Non-blank scoped name (contains "/") -> used as-is.
//   The pack is created + registered via authoring.createPack BEFORE generation, which
//   writes a real world-pack manifest and registers the namespace so createRoom is accepted.
//   createPack returns the namespace, which becomes the new area's targetNamespace.

import * as tapestry from "@tapestry/engine";
import { createSoloArea } from "../area-gen.js";
import { BAKED_SET_IDS } from "../oracle-tables.js";
import { SIX_AXIS_THEMES } from "../six-axis.js";

function llmOff(): boolean {
    const fn = (tapestry as any).authoring.recommendEnabled;
    return !(fn && fn());
}

// LLM-off scenario picker. With the LLM off there is no idea to theme an area from, so
// the player picks a pre-baked scenario instead - and that pick drives BOTH the room
// theme and the mob/item roster. Each six-axis theme is a depth-banded generated
// scenario (its idea string is the theme dir, which the themeDir resolver matches); each
// baked set is a flat pre-authored area. The roster always comes from a baked set.
interface Scenario { id: string; label: string; idea: string; bakedSet: string; }

const SCENARIOS: Scenario[] = SIX_AXIS_THEMES.map(function (t: string): Scenario {
    return { id: t, label: t + " (depth-banded)", idea: t, bakedSet: BAKED_SET_IDS[0] };
}).concat(BAKED_SET_IDS.map(function (s: string): Scenario {
    return { id: "flat:" + s, label: s + " (flat)", idea: "", bakedSet: s };
}));

function scenarioById(id: string): Scenario | null {
    for (let i = 0; i < SCENARIOS.length; i++) {
        if (SCENARIOS[i].id === id) { return SCENARIOS[i]; }
    }
    return null;
}

/** Server max level. No API available; use the documented constant. */
const SERVER_MAX_LEVEL = 60;

tapestry.flows.register({
    id: "oracle_solo",
    display_name: "solo area generation",
    trigger: "oracle_solo",
    cancellable: true,
    steps: [
        {
            // LLM off: pick a pre-baked scenario FIRST (it sets the theme AND the roster),
            // THEN name it. The "describe the idea" step is LLM-only and is skipped here -
            // there is no LLM to theme from. (Shown only when LLM is off.)
            id: "scenario",
            type: "choice",
            skip_if: function(_entity: any) { return !llmOff(); },
            prompt: "Pick a scenario:",
            options: function(_entity: any) {
                return SCENARIOS.map(function(s: Scenario) {
                    return { label: s.label, value: s.id };
                });
            },
            on_select: function(entity: any, option: any) {
                entity.setProperty("__solo_scenario", option.value);
            },
        },
        {
            // LLM on: free-text idea the LLM themes the area from. (Skipped when LLM off.)
            id: "idea",
            type: "text",
            prompt: "Describe the idea (e.g. a sunken ship):",
            skip_if: function(_entity: any) { return llmOff(); },
            on_input: function(entity: any, value: string) {
                entity.setProperty("__solo_idea", value);
            },
        },
        {
            id: "name",
            type: "text",
            prompt: "Area name (blank for random):",
            on_input: function(entity: any, value: string) {
                entity.setProperty("__solo_name", value);
            },
        },
        {
            id: "min_level",
            type: "text",
            prompt: "Min level (blank for random):",
            on_input: function(entity: any, value: string) {
                entity.setProperty("__solo_min_level", value);
            },
        },
        {
            id: "max_level",
            type: "text",
            prompt: "Max level (blank for random):",
            on_input: function(entity: any, value: string) {
                entity.setProperty("__solo_max_level", value);
            },
        },
        {
            id: "destination_pack",
            type: "text",
            prompt: "Destination pack (blank to create one):",
            on_input: function(entity: any, value: string) {
                entity.setProperty("__solo_dest_pack", value);
            },
        },
    ],
    on_complete: function(entity: any) {
        const rawName = entity.getProperty("__solo_name") || "";
        const rawIdea = entity.getProperty("__solo_idea") || "";
        const rawMin = entity.getProperty("__solo_min_level") || "";
        const rawMax = entity.getProperty("__solo_max_level") || "";
        const rawDest = entity.getProperty("__solo_dest_pack") || "";
        const rawScenario = entity.getProperty("__solo_scenario") || "";
        const scenario = (String(rawScenario).trim() !== "") ? scenarioById(String(rawScenario).trim()) : null;

        // Parse min level.
        let minLevel: number;
        if (rawMin === "" || rawMin == null) {
            // Rolled below, after we know min.
            minLevel = -1; // sentinel for random
        } else {
            const parsed = parseInt(String(rawMin), 10);
            if (isNaN(parsed)) {
                return { success: false, message: "Min level must be a number (or blank for random)." };
            }
            minLevel = parsed;
        }

        // Parse max level.
        let maxLevel: number;
        if (rawMax === "" || rawMax == null) {
            maxLevel = -1; // sentinel for random
        } else {
            const parsed = parseInt(String(rawMax), 10);
            if (isNaN(parsed)) {
                return { success: false, message: "Max level must be a number (or blank for random)." };
            }
            maxLevel = parsed;
        }

        // Apply random defaults.
        if (minLevel === -1) {
            minLevel = 1 + Math.floor(Math.random() * 3);
        }
        if (maxLevel === -1) {
            maxLevel = minLevel + 4;
        }

        // Validate range.
        if (minLevel < 0) {
            return { success: false, message: "Min level cannot be negative." };
        }
        if (maxLevel > SERVER_MAX_LEVEL) {
            return { success: false, message: "Max level cannot exceed " + SERVER_MAX_LEVEL + "." };
        }
        if (minLevel > maxLevel) {
            return { success: false, message: "Min level cannot be greater than max level." };
        }

        const nameValue = (rawName && rawName.trim() !== "") ? rawName.trim() : null;
        // A picked scenario (LLM off) supplies the idea/theme; otherwise the free-text idea.
        const ideaSource = scenario ? scenario.idea : rawIdea;
        const ideaValue = (ideaSource && ideaSource.trim() !== "") ? ideaSource.trim() : null;
        const destValue = (rawDest && rawDest.trim() !== "") ? rawDest.trim() : null;

        // Resolve the destination pack NAME (scoped @scope/name form for createPack).
        let packName: string;
        if (destValue == null) {
            packName = "@scratch/oracle-run";
        } else if (destValue.indexOf("/") >= 0) {
            packName = destValue;
        } else {
            const slug = destValue.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
            packName = "@solo/" + (slug || "run");
        }

        // Create + register the destination pack; createPack writes its manifest and returns
        // the registered namespace used for the new area's room ids.
        const namespace = (tapestry as any).authoring.createPack(packName);
        if (!namespace) {
            return { success: false, message: "Could not create destination pack '" + packName + "'." };
        }

        const bakedSetId = scenario ? scenario.bakedSet : BAKED_SET_IDS[0];

        try {
            createSoloArea(entity, ideaValue, nameValue, minLevel, maxLevel, namespace, bakedSetId);
        } catch (err) {
            const detail = (err && (err as any).message) ? (err as any).message : String(err);
            return { success: false, message: "Area generation failed: " + detail };
        }

        // suppress_look: the flow engine auto-looks the player's CURRENT room on
        // completion, which would flash the pre-solo room before the generation wait.
        // We render the new entry room ourselves after the deferred teleport.
        return { success: true, message: "The oracle stirs...", suppress_look: true };
    },
});
