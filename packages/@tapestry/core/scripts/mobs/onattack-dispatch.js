// Fire the onAttack mob hook when a scripted mob becomes a combat target.
// combat.engage publishes once per engagement (Source = attacker, Target =
// the entity being attacked); we only fire for NPCs that registered a script.
tapestry.events.on("combat.engage", function(event) {
    var targetId = event.targetEntityId;
    if (!targetId) {
        return;
    }

    var templateId = tapestry.world.getProperty(targetId, "template_id");
    if (!templateId) {
        return;
    }

    var target = tapestry.world.getEntity(targetId);
    if (!target || target.type !== "npc") {
        return;
    }

    var attackerId = event.sourceEntityId;
    var attacker = attackerId ? tapestry.world.getEntity(attackerId) : null;

    tapestry.mobs.invokeHook(templateId, "onAttack",
        { entityId: targetId, name: target.name, roomId: event.roomId },
        attacker ? { entityId: attackerId, name: attacker.name } : null,
        null);
});
