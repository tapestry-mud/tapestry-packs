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
            if (tokens.length < 3) {
                actor.send("Usage: tapestry start <id> <level>\r\n");
                return;
            }
            const level = parseInt(tokens[2], 10);
            if (isNaN(level)) {
                actor.send("Level must be a number.\r\n");
                return;
            }
            startRun(actor, tokens[1], level);
            return;
        }

        actor.send("Usage: tapestry | tapestry start <id> <level>\r\n");
    },
});

// ---------------------------------------------------------------------------
// boardList - open threads only (see the discrepancy note above).
// ---------------------------------------------------------------------------

function boardList(actor: any): void {
    const open = listTemplates().filter((t) => t.state === "open");
    if (open.length === 0) {
        actor.send("No threads are open yet.\r\n");
        return;
    }
    actor.send("The Tapestry - open threads:\r\n");
    for (let i = 0; i < open.length; i++) {
        const t = open[i];
        actor.send(
            "  " + t.templateId + "  " + t.name +
            "  [levels " + t.bandFloor + "-" + t.bandCap + "]" +
            "  gear: ~" + t.bandFloor + "+\r\n"
        );
    }
    actor.send("Pull a thread: tapestry start <id> <level>\r\n");
}
