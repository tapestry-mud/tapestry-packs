// Admin `grantrole` command. Adds a role to an online player.
//
// Named `grantrole` (not `grant`) because `grant` is already registered by
// admin-grant.js for awarding xp/trains/gold; two registrations of the same
// command name would collide at boot.
import * as tapestry from "@tapestry/engine";
tapestry.commands.register({
    name: 'grantrole',
    aliases: [],
    admin: true,
    args: {
        target: { type: 'keyword', required: true },
        role: { type: 'keyword', required: true }
    },
    handler: function(actor, resolved) {
        var targetName = resolved.target;
        var role = String(resolved.role).toLowerCase();
        var target = tapestry.world.findPlayerByName(targetName);
        if (!target) {
            actor.send('No such player online: ' + targetName + '\r\n');
            return;
        }
        tapestry.world.addRole(target.id, role);
        actor.send("Granted role '" + role + "' to " + target.name + ".\r\n");
    }
});
