import * as tapestry from "@tapestry/engine";

tapestry.commands.register({
    name: 'emote',
    aliases: [':'],
    roles: ['player', 'mob'],
    gmcp: { channel: 'emote', prependSender: false },
    args: {
        message: { type: 'text', required: true }
    },
    handler: function(actor, resolved) {
        if (tapestry.world.getProperty(actor.entityId, 'noemote')) {
            actor.send('You cannot emote right now.\r\n');
            return;
        }

        actor.send(actor.name + ' ' + resolved.message + '\r\n');
        tapestry.world.sendToRoomExcept(
            actor.roomId,
            actor.entityId,
            actor.name + ' ' + resolved.message + '\r\n'
        );

        tapestry.events.publish("communication.message", {
            channel: "emote",
            sender: actor.name,
            senderId: actor.entityId,
            source: "player",
            text: actor.name + ' ' + resolved.message,
            roomId: actor.roomId
        });
    }
});
