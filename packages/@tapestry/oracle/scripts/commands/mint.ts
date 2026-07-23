// commands/mint.ts - the admin mint bench: the only way content enters the game (spec 8).
//
//   mint                 trigger the oracle_mint flow (bake a draft thread template)
//   mint flip <id>       flip a draft template open (setTemplateState -> "open"),
//                        so it appears on the player-facing Tapestry board (commands/tapestry.ts)
//
// Admin/builder ONLY - unlike commands/solo.ts's open-to-players escape-hatch pattern,
// mint is never player-facing, so it gates on the real privilege role list (mirrors
// commands/dig.ts, commands/edit.ts, commands/rooms.ts, commands/create.ts in
// @tapestry/builder: roles: ['admin', 'builder']), not the actor-type "player" role
// with an internal isAdmin() check.
//
// The engine router is single-token, so `flip <id>` is the first token of one
// declared text arg, not a separate command (mirrors commands/solo.ts, commands/
// tapestry.ts, commands/oracle-admin.ts - reference_tapestry_arg_resolver: only
// `text` is greedy).
//
// ASCII; braces on all control flow.

import * as tapestry from "@tapestry/engine";
import { setTemplateState } from "../template-registry.js";

tapestry.commands.register({
    name: "mint",
    aliases: [],
    roles: ["admin", "builder"],
    args: { target: { type: "text", required: false } },
    handler: function (actor, resolved) {
        const raw = resolved.target ? String(resolved.target).trim() : "";
        const tokens = raw ? raw.split(/\s+/) : [];
        const sub = tokens.length > 0 ? tokens[0].toLowerCase() : "";

        if (sub === "") {
            actor.send("Starting the mint bench. Type 'cancel' at any prompt to abort.\r\n");
            tapestry.flows.trigger(actor.entityId, "oracle_mint");
            return;
        }

        if (sub === "flip" && tokens.length >= 2) {
            const ok = setTemplateState(tokens[1], "open");
            actor.send(ok ? ("Thread " + tokens[1] + " is now open.\r\n") : "No such draft.\r\n");
            return;
        }

        actor.send("Usage: mint | mint flip <templateId>\r\n");
    },
});
