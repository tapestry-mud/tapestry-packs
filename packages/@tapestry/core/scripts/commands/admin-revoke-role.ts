// Admin `revokerole` command. Removes a role from an online player.
//
// Named `revokerole` for symmetry with `grantrole` (see admin-grant-role.js).
import * as tapestry from "@tapestry/engine";
tapestry.commands.register({
    name: 'revokerole',
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
        tapestry.world.removeRole(target.id, role);
        actor.send("Revoked role '" + role + "' from " + target.name + ".\r\n");
    }
});
