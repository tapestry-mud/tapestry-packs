import * as tapestry from "@tapestry/engine";

// hint.ts - bare `hint` command (S2-4). The guide already answers "hint" said
// aloud (guide.ts's onSay, case-insensitive) - this just gives the natural
// bare-command form the same answer, by re-dispatching through say the same
// way area-gen.ts already re-dispatches `look` via admin.executeAs.
// ASCII; braces on all control flow.

tapestry.commands.register({
    name: "hint",
    aliases: [],
    roles: ["player"],
    args: {},
    handler: function (actor, resolved) {
        (tapestry as any).admin.executeAs(actor.entityId, "say hint");
    },
});
