tapestry.commands.register({
    name: 'wizlock',
    description: 'Toggle wizlock: only admins may log in.',
    category: 'admin',
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
