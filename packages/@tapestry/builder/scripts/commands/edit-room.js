// packages/@tapestry/builder/scripts/commands/edit-room.js
//
// 'editroom' triggers the schema-driven room editor flow (like core's 'link').
// Single-token command name (a multi-word "edit room" keyword would not resolve).
tapestry.commands.register({
    name: 'editroom',
    aliases: ['eroom'],
    description: 'Edit the current room: name, description, biome, terrain, tags.',
    category: 'builder',
    roles: ['admin', 'builder'],
    args: {},
    handler: function (actor, resolved) {
        actor.send("Editing this room. Type 'cancel' to exit; type 'recommend' at a field for suggestions.\r\n");
        tapestry.flows.trigger(actor.entityId, "builder_edit_room");
    }
});
