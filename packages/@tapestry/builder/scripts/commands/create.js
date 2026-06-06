// packages/@tapestry/builder/scripts/commands/create.js
//
// `create <noun> [args...]` — a single-token dispatch verb that looks up <noun>
// in a builder-local registry of "creatables" and hands off to its handler.
//
// The engine command router only resolves the FIRST whitespace-delimited token
// as the command name, so a multi-word "create area" keyword would never match.
// That's why `create` is the command and the noun is the FIRST ARG. The noun is
// captured as a single 'keyword' arg and the variable tail as a greedy 'text'
// arg (only 'text' is greedy — custom/keyword types are single-token). We then
// split the tail ourselves. This mirrors core's admin-grant.js, which captures
// its variable tail as `value: { type: 'text' }` and splits on ' '.
//
// REGISTRY SHAPE: this is a plain builder-pack-local object (var creators), NOT
// the engine `tapestry.admin.grant` surface. It is self-contained for v1, but
// the register(noun, fn) helper keeps "add a noun" a one-liner. FUTURE (real
// spec step): promote this to a core/engine surface so OTHER packs can register
// their own creatables cross-pack, the way tapestry.admin.grant.register works.

// --- builder-local creatable registry -------------------------------------
var creators = {};

// register(noun, handler) — handler signature: function(actor, args)
//   actor : the command actor (entityId, roomId, send)
//   args  : array of the remaining whitespace-split tokens after the noun
function registerCreator(noun, handler) {
    creators[noun] = handler;
}

// area: create a new authoring area and plant the builder in its anchor room.
//   create area <namespace:area-id>
registerCreator('area', function (actor, args) {
    var areaRef = String(args[0] || '');
    var colon = areaRef.indexOf(':');
    if (colon < 1 || colon >= areaRef.length - 1) {
        actor.send("Usage: create area <namespace:area-id>\r\n");
        return;
    }
    var namespace = areaRef.substring(0, colon);
    var areaId = areaRef.substring(colon + 1);   // BARE area id (no namespace)

    var existing = tapestry.authoring.getArea(areaId);
    if (existing && existing.exists) {
        if (existing.sourcePack) {
            actor.send("Area '" + areaId + "' already exists (pack: " + existing.sourcePack + ").\r\n");
        } else {
            actor.send("Area '" + areaId + "' already exists (authored).\r\n");
        }
        return;
    }

    var created = tapestry.authoring.createArea(areaId, null);
    if (!created) {
        actor.send("Could not create area '" + areaId + "'.\r\n");
        return;
    }

    // Anchor room id keeps the namespace; room.Area is the BARE area id (today's behavior).
    var anchorId = namespace + ':' + areaId + '-anchor';
    var ok = tapestry.authoring.createRoom(areaId, anchorId, 'New Area Anchor',
        'A freshly dug anchor room. Use "edit room" to describe it.');
    if (!ok) {
        actor.send("Created area '" + areaId + "' but could not dig its anchor room.\r\n");
        return;
    }
    tapestry.world.teleportEntity(actor.entityId, anchorId);
    actor.send("Created area '" + areaId + "'. You are in its anchor room. Use 'edit area' to describe it.\r\n");
});

// room: create a blank room in the active area with no auto-exit and no move.
//   create room <key>
registerCreator('room', function (actor, args) {
    var fromId = actor.roomId;
    if (!fromId || fromId.indexOf(':') < 1) {
        actor.send("You must be standing in an authored room to create one.\r\n");
        return;
    }
    var key = String(args[0] || '');
    if (!key) {
        actor.send("Usage: create room <key>\r\n");
        return;
    }
    var area = tapestry.world.getRoomArea(fromId);
    if (!area) {
        actor.send("Could not determine the area of your current room.\r\n");
        return;
    }
    var namespace = fromId.substring(0, fromId.indexOf(':'));
    var newId = namespace + ':' + key;

    if (!tapestry.authoring.createRoom(area, newId, 'New Room', 'An undescribed room.')) {
        actor.send("Could not create room (bad key, duplicate, or namespace mismatch).\r\n");
        return;
    }
    actor.send("Created room " + newId + " in area " + area + ".\r\n");
});

// --- the dispatch command --------------------------------------------------
tapestry.commands.register({
    name: 'create',
    aliases: [],
    description: 'Create a builder entity: create <area|room> [args].',
    category: 'builder',
    roles: ['admin', 'builder'],
    args: {
        noun: { type: 'keyword', required: true },
        rest: { type: 'text', required: false }
    },
    handler: function (actor, resolved) {
        var noun = String(resolved.noun).toLowerCase();
        var restStr = resolved.rest || '';
        var args = restStr.length > 0 ? restStr.split(' ') : [];

        var fn = creators[noun];
        if (!fn) {
            var nouns = Object.keys(creators).join(', ');
            actor.send("Don't know how to create '" + noun + "'. Try: " + nouns + "\r\n");
            return;
        }
        fn(actor, args);
    }
});
