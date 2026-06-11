// Fire the onDeath mob hook. Hangs on mob.death (published by death.js once the
// corpse exists), so the hook reads name/room/killer/corpse off the event -- the
// mob entity itself has already been removed from the world by this point.
tapestry.events.on("mob.death", function(event) {
    var data = event.data || {};
    var templateId = data.templateId;
    if (!templateId) {
        return;
    }

    var killerId = data.killerId;
    var killer = killerId ? tapestry.world.getEntity(killerId) : null;

    tapestry.mobs.invokeHook(templateId, "onDeath",
        { name: data.mobName, roomId: data.roomId },
        killer ? { entityId: killerId, name: killer.name } : null,
        { corpseId: data.corpseId });
});
