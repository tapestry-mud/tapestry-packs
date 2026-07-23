// flows/mint-flow.ts - the mint bench wizard: bake a draft thread template.
//
// Registers the oracle_mint flow. The mint command (no args) triggers this flow.
// Mirrors flows/solo-flow.ts's shape exactly (entity.scratch.set/get for transient
// wizard answers, on_complete parses + validates + calls the production function) -
// re-targeted at bakeTemplate (Task 5) instead of createSoloArea, with a band window
// (bandFloor/bandCap) instead of level min/max, plus a death_mode pick.
//
// This is the ONLY way content enters the game (spec 8): an admin rolls a week here
// (a draft template), playtests it (`tapestry start <id> <level>`), then flips it
// open (`mint flip <id>`) so it appears on the player-facing board (Task 6).
//
// ASCII; braces on all control flow.

import * as tapestry from "@tapestry/engine";
import { bakeTemplate } from "../area-gen.js";
import { BAKED_SET_IDS } from "../oracle-tables.js";
import { SIX_AXIS_THEMES } from "../six-axis.js";
import { buildScenarios, type Scenario } from "../scenarios.js";

function llmOff(): boolean {
    const fn = (tapestry as any).authoring.recommendEnabled;
    return !(fn && fn());
}

// LLM-off scenario picker, same shape as solo-flow.ts's. With the LLM off there is no
// idea to theme the template's area attributes from, so the admin picks a pre-baked
// scenario label instead - bakeTemplate's own LLM-off path always freezes the fixed
// default baked set (BAKED_SET_IDS[0]) regardless, so the pick here is cosmetic
// (area theme/short/description text) not a table-selection lever.
const SCENARIOS: Scenario[] = buildScenarios(SIX_AXIS_THEMES, BAKED_SET_IDS);

function scenarioById(id: string): Scenario | null {
    for (let i = 0; i < SCENARIOS.length; i++) {
        if (SCENARIOS[i].id === id) { return SCENARIOS[i]; }
    }
    return null;
}

/** Band window ceiling. No API available; use the documented constant (mirrors solo-flow.ts). */
const SERVER_MAX_LEVEL = 60;

tapestry.flows.register({
    id: "oracle_mint",
    display_name: "mint a thread template",
    trigger: "oracle_mint",
    cancellable: true,
    steps: [
        {
            // LLM off: pick a pre-baked scenario label FIRST, THEN name it. (Shown only
            // when LLM is off - mirrors solo-flow.ts's scenario/idea split.)
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
                entity.scratch.set("mint_scenario", option.value);
            },
        },
        {
            // LLM on: free-text idea themes the template's area attributes. (Skipped when LLM off.)
            id: "idea",
            type: "text",
            prompt: "Describe the idea (e.g. a sunken ship):",
            skip_if: function(_entity: any) { return llmOff(); },
            on_input: function(entity: any, value: string) {
                entity.scratch.set("mint_idea", value);
            },
        },
        {
            id: "name",
            type: "text",
            prompt: "Thread name (blank for random):",
            on_input: function(entity: any, value: string) {
                entity.scratch.set("mint_name", value);
            },
        },
        {
            id: "band_floor",
            type: "text",
            prompt: "Band floor (min level, 0-" + SERVER_MAX_LEVEL + "):",
            on_input: function(entity: any, value: string) {
                entity.scratch.set("mint_band_floor", value);
            },
        },
        {
            id: "band_cap",
            type: "text",
            prompt: "Band cap (max level, 0-" + SERVER_MAX_LEVEL + "):",
            on_input: function(entity: any, value: string) {
                entity.scratch.set("mint_band_cap", value);
            },
        },
        {
            // Same run-size band as solo-flow.ts.
            id: "size",
            type: "choice",
            prompt: "Run size:",
            options: function(_entity: any) {
                return [
                    { label: "school (~20 rooms)", value: "school" },
                    { label: "standard (40-60 rooms)", value: "standard" },
                    { label: "epic (~100 rooms)", value: "epic" },
                ];
            },
            on_select: function(entity: any, option: any) {
                entity.scratch.set("mint_size", option.value);
            },
        },
        {
            id: "death_mode",
            type: "text",
            prompt: "Death mode: grind or unraveling (blank for grind):",
            on_input: function(entity: any, value: string) {
                entity.scratch.set("mint_death_mode", value);
            },
        },
        {
            // Optional explicit seed - reproducible re-bakes ("re-roll last week's template").
            // Blank rolls from time x actor as always (see bakeTemplate).
            id: "seed",
            type: "text",
            prompt: "Seed (blank for random):",
            on_input: function(entity: any, value: string) {
                entity.scratch.set("mint_seed", value);
            },
        },
    ],
    on_complete: function(entity: any) {
        const rawIdea = entity.scratch.get("mint_idea") || "";
        const rawName = entity.scratch.get("mint_name") || "";
        const rawFloor = entity.scratch.get("mint_band_floor") || "";
        const rawCap = entity.scratch.get("mint_band_cap") || "";
        const rawSize = entity.scratch.get("mint_size") || "";
        const rawDeathMode = entity.scratch.get("mint_death_mode") || "";
        const rawSeed = entity.scratch.get("mint_seed") || "";
        // Scenario is an LLM-OFF-only concept, mirrors solo-flow.ts: a value here is stale
        // from a prior LLM-off run when the LLM is on, so ignore it in that case.
        const rawScenario = llmOff() ? (entity.scratch.get("mint_scenario") || "") : "";
        const scenario = (String(rawScenario).trim() !== "") ? scenarioById(String(rawScenario).trim()) : null;

        // Parse band floor.
        const floorStr = String(rawFloor).trim();
        if (floorStr === "") {
            return { success: false, message: "Band floor is required." };
        }
        const bandFloor = parseInt(floorStr, 10);
        if (isNaN(bandFloor)) {
            return { success: false, message: "Band floor must be a number." };
        }

        // Parse band cap.
        const capStr = String(rawCap).trim();
        if (capStr === "") {
            return { success: false, message: "Band cap is required." };
        }
        const bandCap = parseInt(capStr, 10);
        if (isNaN(bandCap)) {
            return { success: false, message: "Band cap must be a number." };
        }

        // Validate range: 0 <= band_floor <= band_cap <= 60 (mirrors solo-flow.ts:153-195's
        // bounds pattern).
        if (bandFloor < 0) {
            return { success: false, message: "Band floor cannot be negative." };
        }
        if (bandCap > SERVER_MAX_LEVEL) {
            return { success: false, message: "Band cap cannot exceed " + SERVER_MAX_LEVEL + "." };
        }
        if (bandFloor > bandCap) {
            return { success: false, message: "Band floor cannot be greater than band cap." };
        }

        const nameValue = (rawName && rawName.trim() !== "") ? rawName.trim() : null;
        // A picked scenario (LLM off) supplies the idea/theme; otherwise the free-text idea.
        const ideaSource = scenario ? scenario.idea : rawIdea;
        const ideaValue = (ideaSource && ideaSource.trim() !== "") ? ideaSource.trim() : null;

        // Size band (defaults to standard if the step was somehow skipped).
        const sizeValue = (rawSize === "school" || rawSize === "epic") ? String(rawSize) : "standard";

        // Death mode: blank or anything other than "unraveling" defaults to "grind".
        const deathModeStr = String(rawDeathMode).trim().toLowerCase();
        const deathMode: "grind" | "unraveling" = (deathModeStr === "unraveling") ? "unraveling" : "grind";

        // Optional explicit seed: blank -> random; non-blank must be a non-negative integer.
        let seedValue: number | null = null;
        const seedStr = String(rawSeed).trim();
        if (seedStr !== "") {
            const parsedSeed = parseInt(seedStr, 10);
            if (isNaN(parsedSeed) || parsedSeed < 0) {
                return { success: false, message: "Seed must be a non-negative integer (or blank for random)." };
            }
            seedValue = parsedSeed;
        }

        try {
            bakeTemplate(entity, ideaValue, nameValue, bandFloor, bandCap, sizeValue, deathMode, seedValue);
        } catch (err) {
            const detail = (err && (err as any).message) ? (err as any).message : String(err);
            return { success: false, message: "Bake failed: " + detail };
        }

        // bakeTemplate itself sends the "baked as draft" confirmation + follow-up hints
        // (see area-gen.ts), so no extra message is needed here. Unlike solo-flow.ts,
        // baking does not teleport the admin anywhere, so there is no need to
        // suppress_look - the default post-flow look is harmless (same room).
        return { success: true };
    },
});
