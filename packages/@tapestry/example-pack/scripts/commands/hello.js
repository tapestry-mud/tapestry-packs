// Example command: registers "hello" with an alias "hi".
// Try: hello, hello world, hi
tapestry.commands.register({
    name: 'hello',
    aliases: ['hi'],
    roles: ['player'],
    args: {
        target: { type: 'text', required: false }
    },
    handler: function(actor, resolved) {
        var target = resolved.target || 'world';
        actor.send('Hello, ' + target + '!\r\n');
        actor.sendToRoom(actor.name + ' says hello to ' + target + '.\r\n');
    }
});
