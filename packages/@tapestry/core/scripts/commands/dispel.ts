import * as tapestry from "@tapestry/engine";

// The ward-dispel capability. A capability tool grants a discoverable,
// item-named verb (spec 4.4) -- this is the ONE verb for this ONE capability
// instance (v1's only capability tool). A second tool ships its own themed
// verb file the same way; there is deliberately no generic `use` dispatcher.
var CAP = 'ward_dispel';

tapestry.commands.register({
    name: 'dispel',
    roles: ['player'],
    args: {},
    handler: function(actor, resolved) {
        var roomId = tapestry.world.getEntityRoomId(actor.entityId);
        if (!roomId) { return; }

        // Find the encounter in this room that requires this capability.
        var mobs = tapestry.world.getEntitiesInRoom(roomId, 'npc') || [];
        var gated = null;
        for (var i = 0; i < mobs.length; i++) {
            if (tapestry.world.hasTag(mobs[i].id, 'req_' + CAP)) {
                gated = mobs[i];
                break;
            }
        }

        if (!gated) {
            actor.send('There is nothing here to dispel.\r\n');
            return;
        }

        // The tool is carried, not named: any inventory item tagged cap_<CAP>
        // answers. No engine find-by-tag binding exists, so walk the actor's
        // own contents (same accessor sac.ts uses for a corpse's contents).
        var contents = tapestry.inventory.getContents(actor.entityId) || [];
        var tool = null;
        for (var j = 0; j < contents.length; j++) {
            if (tapestry.world.hasTag(contents[j].id, 'cap_' + CAP)) {
                tool = contents[j];
                break;
            }
        }

        if (!tool) {
            actor.send('You reach for the ward and find nothing in your hands that answers it.\r\n');
            return;
        }

        // Clear on the MOB INSTANCE (per-encounter, per-run - SA1). Never a
        // room flag: SpawnManager.RunAreaReset spawns a FRESH mob with no
        // clear on a grind-death repop, and teardown deletes the mob outright,
        // so the ward comes back on its own. A room flag would survive both
        // and permanently defeat the ward after one dispel + death.
        tapestry.world.setProperty(gated.id, 'cap_cleared_' + CAP, true);

        // The staff is NOT consumed (reusable gear, contrast quaff/recite's
        // one-shot tapestry.consumables.consume pattern).
        actor.send('You level ' + tool.name + '. The ward parts with a sound like tearing cloth.\r\n');
        actor.sendToRoom(actor.name + ' levels ' + tool.name + ' and the ward parts.\r\n');
    }
});
