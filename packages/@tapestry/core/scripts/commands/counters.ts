import * as tapestry from "@tapestry/engine";

// The two swell counter verbs for the Telegraph-rung 2-line matrix.
// pace: 'battle' routes these to the combat clock; the validator compares the verb to the locked counter.
// They live in core so any pack can build a swell boss on them.
//
// During an active swell the engine router intercepts these (commit / "world has slowed") and the
// handler below never runs. The handler runs ONLY off-window: at the chip baseline, out of combat, or
// against a non-swell mob. Without feedback it silently no-ops and the prompt just holds, so give the
// player a read: "no opening yet" when a swell boss is engaged, otherwise "nothing to counter".

function isFightingSwellBoss(actor) {
    const ids = tapestry.combat.getCombatants(actor.entityId) || [];
    for (let i = 0; i < ids.length; i++) {
        if (tapestry.world.getProperty(ids[i], "swell_window")) {
            return true;
        }
    }
    return false;
}

function counterOffWindow(actor) {
    if (isFightingSwellBoss(actor)) {
        actor.send("No opening yet - read the swell.\r\n");
    } else {
        actor.send("There is nothing to counter right now.\r\n");
    }
}

tapestry.commands.register({
    name: "sidestep",
    pace: "battle",
    roles: ["player"],
    handler: function (actor, resolved) {
        counterOffWindow(actor);
    }
});

tapestry.commands.register({
    name: "brace",
    pace: "battle",
    roles: ["player"],
    handler: function (actor, resolved) {
        counterOffWindow(actor);
    }
});
