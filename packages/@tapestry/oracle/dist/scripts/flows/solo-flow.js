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
//   - Blank -> use a deterministic scratch pack named "scratch-oracle-run"
//   - Non-blank -> use as the targetNamespace for the new area.
import * as tapestry from "@tapestry/engine";
import { createSoloArea } from "../area-gen.js";
/** Server max level. No API available; use the documented constant. */
const SERVER_MAX_LEVEL = 60;
tapestry.flows.register({
    id: "oracle_solo",
    display_name: "solo area generation",
    trigger: "oracle_solo",
    cancellable: true,
    steps: [
        {
            id: "name",
            type: "text",
            prompt: "Area name (blank for random):",
            on_input: function (entity, value) {
                entity.setProperty("__solo_name", value);
            },
        },
        {
            id: "idea",
            type: "text",
            prompt: "Describe the idea (e.g. a sunken ship):",
            on_input: function (entity, value) {
                entity.setProperty("__solo_idea", value);
            },
        },
        {
            id: "min_level",
            type: "text",
            prompt: "Min level (blank for random):",
            on_input: function (entity, value) {
                entity.setProperty("__solo_min_level", value);
            },
        },
        {
            id: "max_level",
            type: "text",
            prompt: "Max level (blank for random):",
            on_input: function (entity, value) {
                entity.setProperty("__solo_max_level", value);
            },
        },
        {
            id: "destination_pack",
            type: "text",
            prompt: "Destination pack (blank to create one):",
            on_input: function (entity, value) {
                entity.setProperty("__solo_dest_pack", value);
            },
        },
    ],
    on_complete: function (entity) {
        const rawName = entity.getProperty("__solo_name") || "";
        const rawIdea = entity.getProperty("__solo_idea") || "";
        const rawMin = entity.getProperty("__solo_min_level") || "";
        const rawMax = entity.getProperty("__solo_max_level") || "";
        const rawDest = entity.getProperty("__solo_dest_pack") || "";
        // Parse min level.
        let minLevel;
        if (rawMin === "" || rawMin == null) {
            // Rolled below, after we know min.
            minLevel = -1; // sentinel for random
        }
        else {
            const parsed = parseInt(String(rawMin), 10);
            if (isNaN(parsed)) {
                return { success: false, message: "Min level must be a number (or blank for random)." };
            }
            minLevel = parsed;
        }
        // Parse max level.
        let maxLevel;
        if (rawMax === "" || rawMax == null) {
            maxLevel = -1; // sentinel for random
        }
        else {
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
        const ideaValue = (rawIdea && rawIdea.trim() !== "") ? rawIdea.trim() : null;
        const destValue = (rawDest && rawDest.trim() !== "") ? rawDest.trim() : null;
        // Blank destination -> create a fresh scratch pack named for this run.
        const destPack = destValue || "scratch-oracle-run";
        try {
            createSoloArea(entity, ideaValue, nameValue, minLevel, maxLevel, destPack);
        }
        catch (err) {
            const detail = (err && err.message) ? err.message : String(err);
            return { success: false, message: "Area generation failed: " + detail };
        }
        // suppress_look: the flow engine auto-looks the player's CURRENT room on
        // completion, which would flash the pre-solo room before the generation wait.
        // We render the new entry room ourselves after the deferred teleport.
        return { success: true, message: "The oracle stirs...", suppress_look: true };
    },
});
