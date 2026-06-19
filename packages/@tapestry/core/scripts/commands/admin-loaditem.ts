import * as tapestry from "@tapestry/engine";
tapestry.commands.register(<any>{
    name: 'loaditem',
    admin: true,
    args: {
        templateId: { type: 'keyword', required: true }
    },
    handler: function(actor, resolved) {
        var templateId = resolved.templateId;
        var result = tapestry.items.spawnToInventory(templateId, actor.entityId);

        if (result) {
            actor.send('Loaded ' + result.name + ' into your inventory.\r\n');
        } else {
            actor.send('Unknown item template: ' + templateId + '\r\n');
        }
    }
});
