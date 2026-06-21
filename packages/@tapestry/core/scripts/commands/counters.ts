import * as tapestry from "@tapestry/engine";

// The two swell counter verbs for the Telegraph-rung 2-line matrix.
// pace: 'battle' routes these to the combat clock; the validator compares the verb to the locked counter.
// They live in core so any pack can build a swell boss on them.
tapestry.commands.register({
    name: "sidestep",
    pace: "battle",
    roles: ["player"],
    handler: function (actor, resolved) {
        // Routed to the swell clock when fighting; this body is the off-combat fallback.
    }
});

tapestry.commands.register({
    name: "brace",
    pace: "battle",
    roles: ["player"],
    handler: function (actor, resolved) {
    }
});
