import * as tapestry from "@tapestry/engine";

tapestry.commands.register({
    name: 'wizlock',
    admin: true,
    handler: function(actor, resolved) {
        var locked = !tapestry.admin.isWizlocked();
        tapestry.admin.setWizlock(locked);
        if (locked) {
            actor.send('Wizlock ON. Only admins may log in. (Resets on reboot.)\r\n');
        } else {
            actor.send('Wizlock OFF. Logins are open.\r\n');
        }
    }
});
