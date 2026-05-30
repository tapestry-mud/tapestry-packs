// packages/@tapestry/builder/scripts/flows/edit-room.js
//
// Schema-driven room editor. The editable-field list is built by introspection:
//   - core structured fields (name, description)
//   - registry properties whose appliesTo includes 'room'
//   - a 'biome' field if any registry tag has kind === 'biome' and applies to room
// Writes go through tapestry.authoring.setRoomName / setRoomDescription /
// setRoomAttribute. The flow is a simple two-step shape (pick field -> set value),
// matching core/scripts/flows/link.js's step schema exactly.
//
// In-flow current-room id is read via entity.roomId (the flow entity proxy exposes
// roomId/getProperty/setProperty/send — there is no getRoomId()).

function roomFieldKeys(entity) {
    // Returns the set of editable field keys, in display order.
    var keys = ['name', 'description'];
    var labels = { name: 'Room name', description: 'Room description' };

    var props = tapestry.world.getPropertyRegistry ? tapestry.world.getPropertyRegistry() : [];
    for (var i = 0; i < props.length; i++) {
        var p = props[i];
        if (p.appliesTo && p.appliesTo.indexOf('room') !== -1) {
            if (keys.indexOf(p.name) === -1) {
                keys.push(p.name);
                labels[p.name] = p.name;
            }
        }
    }

    var tags = tapestry.world.getTagRegistry ? tapestry.world.getTagRegistry() : [];
    for (var t = 0; t < tags.length; t++) {
        var tag = tags[t];
        if (tag.appliesTo && tag.appliesTo.indexOf('room') !== -1 && tag.kind === 'biome') {
            if (keys.indexOf('biome') === -1) {
                keys.push('biome');
                labels.biome = 'Biome';
            }
        }
    }

    return { keys: keys, labels: labels };
}

tapestry.flows.register({
    id: "builder_edit_room",
    display_name: "editing room",
    trigger: "builder_edit_room",
    cancellable: true,
    steps: [
        {
            // Step 1: pick the field to edit.
            id: "field",
            type: "choice",
            prompt: "Which field do you want to edit?",
            options: function (entity) {
                var schema = roomFieldKeys(entity);
                return schema.keys.map(function (key) {
                    return { label: schema.labels[key] || key, value: key };
                });
            },
            on_select: function (entity, option) {
                entity.setProperty("__edit_field", String(option.value));
            }
        },
        {
            // Step 2: set the value. recommend_field enables the per-field recommend
            // side-action wired by the engine flow runtime (read only on text steps).
            id: "value",
            type: "text",
            // Recommend the field the player actually picked (engine evaluates this per
            // invocation). The static stub only suggests name/description; other fields
            // (terrain, biome, ...) return no suggestions until a real provider docks in.
            recommend_field: function (entity) {
                return entity.getProperty("__edit_field");
            },
            prompt: function (entity) {
                var field = entity.getProperty("__edit_field") || "field";
                return "New value for '" + field + "' (or type 'recommend' for suggestions):";
            },
            on_input: function (entity, value) {
                var field = entity.getProperty("__edit_field");
                var roomId = entity.roomId;
                if (field === 'name') {
                    tapestry.authoring.setRoomName(roomId, value);
                } else if (field === 'description') {
                    tapestry.authoring.setRoomDescription(roomId, value);
                } else {
                    // Registry property or tag (including biome) -> generalized writer.
                    var msg = tapestry.authoring.setRoomAttribute(roomId, field, value);
                    if (msg && entity.send) {
                        entity.send(msg + "\r\n");
                    }
                }
            }
        }
    ],
    on_complete: function (entity) {
        return { success: true, message: "Room updated." };
    }
});
