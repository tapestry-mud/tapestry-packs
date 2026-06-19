// packages/@tapestry/builder/scripts/commands/edit.ts
//
// `edit <noun> [args...]` - single-token dispatch verb that looks up <noun> in a
// builder-local registry of "editables" and hands off to its handler. Same shape
// and rationale as create.ts: the router resolves only the first token, so `edit`
// is the command and the noun is the first arg (captured as a single 'keyword',
// variable tail captured as greedy 'text' and split ourselves - mirroring
// core/scripts/commands/admin-grant.js).
//
// REGISTRY SHAPE: plain builder-pack-local object (var editors), NOT the engine
// tapestry.admin.grant surface. Adding an editable noun is a one-liner.
// FUTURE (real spec step): promote to a core/engine surface for cross-pack
// registration, like tapestry.admin.grant.register.

import * as tapestry from "@tapestry/engine";

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

// area: trigger the schema-driven area editor flow (defined in flows/edit-area.js).
//   edit area [<id>]   -- bare id ("road-to-tar-valon") or namespaced ("wot:road-to-tar-valon")
//   edit area          -- falls back to the area containing the current room
registerEditor('area', function (actor, args) {
    // Accept a bare id ("road-to-tar-valon") OR a namespaced ref ("wot:road-to-tar-valon");
    // strip the namespace to the bare id. With no arg, fall back to the current room's area.
    var areaId;
    if (args[0]) {
        var ref = String(args[0]);
        var colon = ref.indexOf(':');
        areaId = colon >= 0 ? ref.substring(colon + 1) : ref;
    } else {
        areaId = tapestry.world.getRoomArea(actor.roomId);
    }

    if (!areaId) {
        actor.send("You are not in an area, and no <area-id> was given.\r\n");
        return;
    }
    var info = tapestry.authoring.getArea(areaId);
    if (!info || !info.exists) {
        actor.send("No area definition for '" + areaId + "'. Use 'create area <namespace:" + areaId + ">' first.\r\n");
        return;
    }

    // Stash the resolved target BEFORE triggering so the flow + engine recommend-context
    // read THIS id, not the current room. flows.trigger carries no payload.
    tapestry.world.setProperty(actor.entityId, "__edit_area", areaId);

    actor.send("Editing area '" + areaId + "'. Type 'cancel' to exit; type '~' at a text field for suggestions.\r\n");
    tapestry.flows.trigger(actor.entityId, "builder_edit_area");
});

// --- the dispatch command --------------------------------------------------
tapestry.commands.register({
    name: 'edit',
    aliases: [],
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
