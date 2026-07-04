import * as tapestry from "@tapestry/engine";

// Player command: classic ROM brief mode (accessibility, tapestry#42).
//
//   brief        -> toggle
//   brief on     -> movement shows room name + exits + who is here (no description body)
//   brief off    -> full room descriptions on movement (default)
//
// Explicit `look` ALWAYS renders the full description regardless of this setting.
// The preference persists on the player as the core-declared `brief` bool property;
// movement.ts reads it and passes it to tapestry.world.sendRoomDescription.

tapestry.commands.register({
    name: 'brief',
    roles: ['player'],
    args: {
        value: { type: 'text', required: false }
    },
    handler: function(actor, resolved) {
        var arg = (resolved.value || '').trim().toLowerCase();
        var current = tapestry.world.getProperty(actor.entityId, 'brief') === true;

        var next;
        if (arg === '') {
            next = !current;
        } else if (arg === 'on') {
            next = true;
        } else if (arg === 'off') {
            next = false;
        } else {
            actor.send('Usage: brief, brief on, or brief off.\r\n');
            return;
        }

        tapestry.world.setProperty(actor.entityId, 'brief', next);
        if (next) {
            actor.send('Brief mode ON. Moving shows the room name, exits, and who is here. ' +
                       'Type "look" any time for the full description.\r\n');
        } else {
            actor.send('Brief mode OFF. Full room descriptions restored.\r\n');
        }
    }
});
