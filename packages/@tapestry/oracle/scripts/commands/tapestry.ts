// commands/tapestry.ts - the Tapestry board: the real player-facing thread surface.
//
//   tapestry                        list open threads (level band + gear signpost)
//   tapestry list                   same as bare
//   tapestry start <templateId> <level>   pull a thread at a chosen in-band level
//
// Gated on tapestry_unlocked (Task 3's one v1 trophy: finish the school thread first).
// This command is a thin UI layer over already-landed pieces:
//   - listTemplates/getTemplate (Task 4, template-registry.ts) supply the board data.
//   - startRun (Task 5, area-gen.ts) already validates the band window (bandFloor <=
//     level <= bandCap), already checks the template is "open" (unless admin), already
//     tears down any prior active run (one-active-run-per-player), and already sets the
//     return-address. This handler does not duplicate any of that - it only parses the
//     command line and calls through.
//
// Replaces oracle-admin's `start` subcommand as the shipped UX (commands/oracle-admin.ts
// stays in the tree, admin-gated, as the TEMPORARY scaffolding it always was - see its
// header comment).
//
// Mirrors commands/solo.ts's shape: single greedy `target` text arg, first token is the
// subcommand (the engine router is single-token, so `list`/`start` are the first token of
// one declared text arg, not separate commands - reference_tapestry_arg_resolver: only
// `text` is greedy).
//
// Discrepancy note (Task 6 brief vs template-registry.ts, flagged in the task-6 report,
// not resolved here): the brief's "Why" text describes the board listing "open + archived
// (open-but-older) threads", but ThreadTemplate's `state` field is only "draft" | "open"
// today - there is no archived state to filter on, and the brief's own Step 1 code sample
// lists `state === "open"` only, with no archived section. This follows that literal
// sample: open threads only.
//
// ASCII; braces on all control flow.

import * as tapestry from "@tapestry/engine";
import { listTemplates } from "../template-registry.js";
import { startRun } from "../area-gen.js";

function openTemplates(): ReturnType<typeof listTemplates> {
    return listTemplates().filter((t) => t.state === "open");
}

function resolveTemplateRef(ref: string): string | null {
    const open = openTemplates();
    const ordinal = parseInt(ref, 10);
    if (!isNaN(ordinal) && String(ordinal) === ref && ordinal >= 1 && ordinal <= open.length) {
        return open[ordinal - 1].templateId;
    }
    const exact = open.find((t) => t.templateId === ref);
    if (exact) { return exact.templateId; }
    const prefixMatches = open.filter((t) => t.templateId.indexOf(ref) === 0);
    if (prefixMatches.length === 1) { return prefixMatches[0].templateId; }
    return null;
}

tapestry.commands.register({
    name: "tapestry",
    aliases: [],
    roles: ["player"],
    args: { target: { type: "text", required: false } },
    handler: function (actor, resolved) {
        const unlocked = tapestry.world.getProperty(actor.entityId, "tapestry_unlocked");
        if (!unlocked) {
            actor.send("The Tapestry hangs dark. Finish the school first.\r\n");
            return;
        }

        const raw = resolved.target ? String(resolved.target).trim() : "";
        const tokens = raw ? raw.split(/\s+/) : [];
        const sub = tokens.length > 0 ? tokens[0].toLowerCase() : "";

        if (sub === "" || sub === "list") {
            boardList(actor);
            return;
        }

        if (sub === "start") {
            if (tokens.length < 2) {
                actor.send("Usage: tapestry start <number or id> [level]\r\n");
                return;
            }
            const resolvedId = resolveTemplateRef(tokens[1]);
            if (!resolvedId) {
                actor.send("No such thread. Use its board number or full id.\r\n");
                return;
            }
            let level: number;
            let explicitLevel: boolean;
            if (tokens.length >= 3) {
                level = parseInt(tokens[2], 10);
                if (isNaN(level)) {
                    actor.send("Level must be a number.\r\n");
                    return;
                }
                explicitLevel = true;
            } else {
                level = tapestry.progression.getLevel(actor.entityId, "combat") || 1;
                explicitLevel = false;
                actor.send("No level given - defaulting to your own level (" + level + ").\r\n");
            }
            startRun(actor, resolvedId, level, explicitLevel);
            return;
        }

        const bareResolved = resolveTemplateRef(sub);
        if (bareResolved) {
            let level: number;
            let explicitLevel: boolean;
            if (tokens.length >= 2) {
                level = parseInt(tokens[1], 10);
                if (isNaN(level)) {
                    actor.send("Level must be a number.\r\n");
                    return;
                }
                explicitLevel = true;
            } else {
                level = tapestry.progression.getLevel(actor.entityId, "combat") || 1;
                explicitLevel = false;
                actor.send("No level given - defaulting to your own level (" + level + ").\r\n");
            }
            startRun(actor, bareResolved, level, explicitLevel);
            return;
        }

        actor.send("Usage: tapestry | tapestry start <number or id> [level] | tapestry <number or id> [level]\r\n");
    },
});

// ---------------------------------------------------------------------------
// boardList - open threads only (see the discrepancy note above).
// ---------------------------------------------------------------------------

function boardList(actor: any): void {
    const open = openTemplates();
    if (open.length === 0) {
        actor.send("No threads are open yet.\r\n");
        return;
    }
    actor.send("The Tapestry - open threads:\r\n");
    for (let i = 0; i < open.length; i++) {
        const t = open[i];
        actor.send(
            "  " + (i + 1) + ") " + t.templateId + "  " + t.name +
            "  [levels " + t.bandFloor + "-" + t.bandCap + "]" +
            "  gear: ~" + t.bandFloor + "+\r\n"
        );
    }
    actor.send("Pull a thread: tapestry start <number or id> [level]\r\n");
    actor.send("<level> sets the difficulty dial - it does not scale to your gear. Higher is harder.\r\n");
}
