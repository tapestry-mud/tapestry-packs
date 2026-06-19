import * as tapestry from "@tapestry/engine";
// Demo of the mob behavior hook seam: onLook / onAttack / onDeath.
// Look at the scout, attack it, then kill it to watch each hook fire.
tapestry.mobs.registerScript("tapestry-example-pack:grizzled-scout", {
    // mob = { entityId, name, roomId }, player = { entityId, name }
    onLook: function(mob, player) {
        tapestry.mobs.command(mob.entityId, "emote looks up and meets your gaze.");
        tapestry.mobs.command(mob.entityId, "say See something you like, " + player.name + "?", 1.0);
    },

    // attacker may be null if the engager couldn't be resolved
    onAttack: function(mob, attacker) {
        var who = attacker ? attacker.name : "someone";
        tapestry.mobs.command(mob.entityId, "say You'll regret that, " + who + "!");
    },

    // onDeath fires on mob.death -- the scout entity is already gone, so we
    // talk to the room directly (mob = { name, roomId }, no entityId).
    onDeath: function(mob, killer) {
        tapestry.world.sendToRoom(mob.roomId,
            "With its last breath, the scout rasps, 'Tell my sister...'\r\n");
    }
});
