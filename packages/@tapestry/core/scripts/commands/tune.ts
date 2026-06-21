import * as tapestry from "@tapestry/engine";

// Live dial editor for swell bosses. Builder-gated, pace: free. Bare `tune` prints the values to
// hand-copy back into the mob YAML; `tune <dial> <value>` edits in memory for the current session.
// One greedy `text` arg, split in the handler - the spike's `tempo` command pattern. There is no
// `word` arg type (ArgResolver built-ins are keyword/text/number/...); `text` is the greedy one.
const DIALS = [
    "swell_tell", "swell_baseline_gap_ticks", "swell_jitter_ticks",
    "swell_telegraph_ticks", "swell_window_ticks", "swell_mode",
    "swell_chunk_pct", "swell_whiff_pct", "swell_weather_pct"
];

// The swell boss this builder is fighting: scan their combat list for one carrying swell_window.
// combat.getCombatants(id) is the exposed JS accessor (CombatModule.cs:128); there is NO
// combat.getPrimaryTarget binding.
function findSwellBoss(actor) {
    const ids = tapestry.combat.getCombatants(actor.entityId) || [];
    for (let i = 0; i < ids.length; i++) {
        if (tapestry.world.getProperty(ids[i], "swell_window")) {
            return ids[i];
        }
    }
    return null;
}

tapestry.commands.register({
    name: "tune",
    pace: "free",
    roles: ["builder"],
    args: { rest: { type: "text", required: false } },
    handler: function (actor, resolved) {
        const targetId = findSwellBoss(actor);
        if (!targetId) {
            actor.send("Tune what? Engage a swell boss first.\r\n");
            return;
        }

        const raw = (resolved && resolved.rest ? resolved.rest : "").trim();
        if (raw === "") {
            let out = "Current swell dials:\r\n";
            for (let i = 0; i < DIALS.length; i++) {
                out += "  " + DIALS[i] + " = " + tapestry.world.getProperty(targetId, DIALS[i]) + "\r\n";
            }
            actor.send(out);
            return;
        }

        const parts = raw.split(/\s+/);
        const dial = parts[0];
        const valueRaw = parts.length > 1 ? parts.slice(1).join(" ") : "";
        if (DIALS.indexOf(dial) < 0) {
            actor.send("Unknown dial: " + dial + "\r\n");
            return;
        }
        const numeric = dial.endsWith("_ticks") || dial.endsWith("_pct");
        const value = numeric ? parseInt(valueRaw, 10) : valueRaw;
        tapestry.world.setProperty(targetId, dial, value);
        actor.send("Set " + dial + " = " + value + "\r\n");
    }
});
