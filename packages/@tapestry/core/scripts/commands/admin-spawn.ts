import * as tapestry from "@tapestry/engine";
tapestry.commands.register(<any>{
    name: 'spawn',
    admin: true,
    args: {
        templateId: { type: 'keyword', required: true }
    },
    handler: function(actor, resolved) {
        var templateId = resolved.templateId;
        var result = tapestry.mobs.spawnMob(templateId, actor.roomId);

        if (result) {
            actor.send('Spawned: ' + result.name + '\r\n');
        } else {
            actor.send('Unknown template: ' + templateId + '\r\n');
        }
    }
});
