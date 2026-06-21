import * as tapestry from "@tapestry/engine";

// The single Telegraph-rung window validator. Deterministic: it only decides right-vs-wrong.
// Off-window commits are rejected by the engine before this runs; a weather arrives here as an empty verb.
tapestry.combat.registerWindow("telegraph-rung", function (ctx) {
    if (!ctx.command || !ctx.command.verb) {
        return { outcome: "WEATHERED", narrationKey: "weathered" };
    }
    if (ctx.command.verb === ctx.swell.requiredCounter) {
        return { outcome: "COUNTERED", narrationKey: "countered" };
    }
    return { outcome: "WHIFFED", narrationKey: "whiffed" };
});
