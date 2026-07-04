// commands/solo.ts - Trigger the oracle_solo flow.
//
// Open to PLAYERS as of 0.5.0 (Travis 2026-07-04): solo is the game loop, not
// a builder tool. ROLE SEMANTICS (engine CommandRouter): "player"/"mob" are
// actor-type roles; anything else (admin, builder) is a PRIVILEGE gate - if
// any privilege role is listed the actor must hold one. So the open form is
// exactly ["player"]; admins qualify because they dispatch as source "player".
// SHIP DEPENDENCY (documented, not built here): opening solo publicly needs
// the per-player rate limit from the self-contained-run design (campaign
// stage E) before a server has real strangers on it - acceptable now because
// the playtest server is empty. No args.

import * as tapestry from "@tapestry/engine";

tapestry.commands.register({
    name: "solo",
    aliases: [],
    roles: ["player"],
    args: {},
    handler: function(actor, _resolved) {
        actor.send("Starting solo area generation. Type 'cancel' at any prompt to abort.\r\n");
        tapestry.flows.trigger(actor.entityId, "oracle_solo");
    },
});
