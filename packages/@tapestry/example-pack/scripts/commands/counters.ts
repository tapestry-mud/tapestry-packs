import * as tapestry from "@tapestry/engine";

// The two counters for the swell-warden's 2-line Telegraph matrix.
// pace: 'battle' routes these to the combat clock; the validator compares the verb to the locked counter.
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
