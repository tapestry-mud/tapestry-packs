// commands/solo.ts - Trigger the oracle_solo flow.
//
// Requires builder or admin role. No args.

import * as tapestry from "@tapestry/engine";

tapestry.commands.register({
    name: "solo",
    aliases: [],
    roles: ["admin", "builder"],
    args: {},
    handler: function(actor, _resolved) {
        actor.send("Starting solo area generation. Type 'cancel' at any prompt to abort.\r\n");
        tapestry.flows.trigger(actor.entityId, "oracle_solo");
    },
});
