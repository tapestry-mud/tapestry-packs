// packages/@tapestry/builder/scripts/commands/edit.js
//
// `edit <noun> [args...]` — single-token dispatch verb that looks up <noun> in a
// builder-local registry of "editables" and hands off to its handler. Same shape
// and rationale as create.js: the router resolves only the first token, so `edit`
// is the command and the noun is the first arg (captured as a single 'keyword',
// variable tail captured as greedy 'text' and split ourselves — mirroring
// core/scripts/commands/admin-grant.js).
//
// REGISTRY SHAPE: plain builder-pack-local object (var editors), NOT the engine
// tapestry.admin.grant surface. Adding an editable noun is a one-liner.
// FUTURE (real spec step): promote to a core/engine surface for cross-pack
// registration, like tapestry.admin.grant.register.

// --- builder-local editable registry ---------------------------------------
var editors = {};

// register(noun, handler) — handler signature: function(actor, args)
function registerEditor(noun, handler) {
    editors[noun] = handler;
}

// room: trigger the schema-driven room editor flow (defined in flows/edit-room.js).
//   edit room
registerEditor('room', function (actor, args) {
    actor.send("Editing this room. Type 'cancel' to exit; type '~' at a field for suggestions.\r\n");
    tapestry.flows.trigger(actor.entityId, "builder_edit_room");
});

// --- the dispatch command --------------------------------------------------
tapestry.commands.register({
    name: 'edit',
    aliases: [],
    description: 'Edit a builder entity: edit <room>.',
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

        var fn = editors[noun];
        if (!fn) {
            var nouns = Object.keys(editors).join(', ');
            actor.send("Don't know how to edit '" + noun + "'. Try: " + nouns + "\r\n");
            return;
        }
        fn(actor, args);
    }
});
