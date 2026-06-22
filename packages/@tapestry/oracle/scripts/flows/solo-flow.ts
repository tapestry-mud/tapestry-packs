// flows/solo-flow.ts - Three-step wizard for solo area generation.
//
// Registers the oracle_solo flow. The solo command triggers this flow.
// Steps stash answers into entity properties; on_complete reads them,
// validates, and calls createSoloArea.
//
// Level guards (spec section 7):
//   - Blank -> random band: min = 1 + floor(random * 3), max = min + 4.
//   - Non-blank non-integer -> error.
//   - min >= 0, max <= SERVER_MAX_LEVEL, min <= max -> error on violation.

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
            on_input: function(entity, value) {
                entity.setProperty("__solo_name", value);
            },
        },
        {
            id: "min_level",
            type: "text",
            prompt: "Min level (blank for random):",
            on_input: function(entity, value) {
                entity.setProperty("__solo_min_level", value);
            },
        },
        {
            id: "max_level",
            type: "text",
            prompt: "Max level (blank for random):",
            on_input: function(entity, value) {
                entity.setProperty("__solo_max_level", value);
            },
        },
    ],
    on_complete: function(entity) {
        const rawName = entity.getProperty("__solo_name") || "";
        const rawMin = entity.getProperty("__solo_min_level") || "";
        const rawMax = entity.getProperty("__solo_max_level") || "";

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

        createSoloArea(entity, nameValue, minLevel, maxLevel, "oracle-run");

        return { success: true, message: "Generating area..." };
    },
});
