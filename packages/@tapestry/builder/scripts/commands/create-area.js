// packages/@tapestry/builder/scripts/commands/create-area.js
//
// Create a new authoring area and plant the builder in its anchor room.
// Command name is single-token ('carea'); the engine command router resolves
// only the first whitespace-delimited token, so a multi-word "create area"
// keyword would never match. Alias 'createarea' kept for discoverability.
tapestry.commands.register({
    name: 'carea',
    aliases: ['createarea'],
    description: 'Create a new authoring area and its anchor room (carea ns:area-id).',
    category: 'builder',
    roles: ['admin', 'builder'],
    args: {
        areaRef: { type: 'keyword', required: true }
    },
    handler: function (actor, resolved) {
        var areaRef = String(resolved.areaRef); // "legends-forgotten:lf-hollow"
        var colon = areaRef.indexOf(':');
        if (colon < 1) {
            actor.send("Usage: carea <namespace:area-id>\r\n");
            return;
        }
        var namespace = areaRef.substring(0, colon);
        var areaId = areaRef.substring(colon + 1);
        if (!areaId) {
            actor.send("Usage: carea <namespace:area-id>\r\n");
            return;
        }
        var anchorId = namespace + ':' + areaId + '-anchor';

        var ok = tapestry.authoring.createRoom(areaId, anchorId, 'New Area Anchor',
            'A freshly dug anchor room. Use editroom to describe it.');
        if (!ok) {
            actor.send("Could not create area (bad namespace, or anchor already exists).\r\n");
            return;
        }
        tapestry.world.teleportEntity(actor.entityId, anchorId);
        actor.send("Created area '" + areaId + "'. You are in its anchor room.\r\n");
    }
});
