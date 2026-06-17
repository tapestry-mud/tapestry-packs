tapestry.commands.register({
    name: 'exits',
    roles: ['player'],
    args: {},
    handler: function(actor, resolved) {
        var exits = tapestry.world.getRoomExits(actor.entityId);
        if (exits.length === 0) {
            actor.send('There are no obvious exits.\r\n');
        } else {
            actor.send('<direction>Obvious exits: ' + exits.join(', ') + '</direction>\r\n');
        }
    }
});
