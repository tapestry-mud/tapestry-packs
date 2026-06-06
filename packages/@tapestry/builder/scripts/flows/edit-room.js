// packages/@tapestry/builder/scripts/flows/edit-room.js
//
// Schema-driven room editor (v2). The editable-field list is built by introspection:
//   - core structured fields (name, description)
//   - registry properties whose appliesTo includes 'room'
//   - a 'biome' field if any registry tag has kind === 'biome' and applies to room
//
// Each field carries metadata + its CURRENT value, so the picker shows current values and
// known-value fields (biome / bool / enum) drop into a SELECTOR instead of free text.
// Free fields stay text and show the current value + any min/max range. The branch is done
// with two value steps and skip_if (exactly one runs).
//
// In-flow current-room id is read via entity.roomId. Writes go through tapestry.authoring.*.

function loomTruncate(s, n) {
    s = String(s == null ? '' : s);
    return s.length > n ? s.substring(0, n - 3) + '...' : s;
}

function loomCurrentLabel(v) {
    return (v == null || v === '') ? '(unset)' : loomTruncate(v, 40);
}

// Build the ordered field schema for the builder's current room.
// Each entry: { key, label, kind: 'text'|'choice', options?, valueType?, min?, max?, current, isBiome? }
function roomEditSchema(entity) {
    var roomId = entity.roomId;
    var fields = [];

    fields.push({ key: 'name', label: 'Room name', kind: 'text', current: tapestry.world.getRoomName(roomId) });
    fields.push({ key: 'description', label: 'Room description', kind: 'text', current: tapestry.world.getRoomDescription(roomId) });

    var props = tapestry.world.getPropertyRegistry ? tapestry.world.getPropertyRegistry() : [];
    var roomProps = tapestry.world.getRoomProperties ? (tapestry.world.getRoomProperties(roomId) || {}) : {};
    for (var i = 0; i < props.length; i++) {
        var p = props[i];
        if (!p.appliesTo || p.appliesTo.indexOf('room') === -1) {
            continue;
        }
        var f = { key: p.name, label: p.name, valueType: p.valueType, current: roomProps[p.name], min: p.min, max: p.max };
        if (p.enum && p.enum.length) {
            f.kind = 'choice';
            f.options = p.enum.slice();
        } else if (p.valueType === 'bool' || p.valueType === 'Bool') {
            f.kind = 'choice';
            f.options = ['true', 'false'];
        } else {
            f.kind = 'text';
        }
        fields.push(f);
    }

    var tags = tapestry.world.getTagRegistry ? tapestry.world.getTagRegistry() : [];
    var biomeNames = [];
    for (var t = 0; t < tags.length; t++) {
        var tg = tags[t];
        if (tg.appliesTo && tg.appliesTo.indexOf('room') !== -1 && tg.kind === 'biome') {
            biomeNames.push(tg.name);
        }
    }
    if (biomeNames.length) {
        fields.push({
            key: 'biome', label: 'Biome', kind: 'choice', options: biomeNames,
            current: tapestry.world.getRoomBiome(roomId), isBiome: true
        });
    }

    return fields;
}

function findField(entity, key) {
    var fs = roomEditSchema(entity);
    for (var i = 0; i < fs.length; i++) {
        if (fs[i].key === key) {
            return fs[i];
        }
    }
    return null;
}

// Write a field value through the right authoring call. Biome is a single-valued tag group:
// adding the chosen biome tag clears any previously-set biome tag.
function applyField(entity, field, value) {
    var roomId = entity.roomId;
    if (field === 'name') {
        // setRoomName may RE-KEY the room id (rename refactor). After this call the
        // entity.roomId snapshot on this proxy is stale — only use res.id from here on.
        var res = tapestry.authoring.setRoomName(roomId, value);
        if (res && res.renamed && entity.send) {
            var newId = String(res.id);
            var shortId = newId.indexOf(':') >= 0 ? newId.split(':')[1] : newId;
            entity.send('Name set to "' + value + '" (room id is now: ' + shortId + ').\r\n');
        }
        if (res && res.warnings && entity.send) {
            for (var w = 0; w < res.warnings.length; w++) {
                // ASCII only: telnet clients mojibake any non-7-bit char.
                entity.send('Warning: ' + res.warnings[w] + '\r\n');
            }
        }
        return;
    }
    if (field === 'description') {
        tapestry.authoring.setRoomDescription(roomId, value);
        return;
    }
    var meta = findField(entity, field);
    if (meta && meta.isBiome) {
        var cur = tapestry.world.getRoomBiome(roomId);
        if (cur && cur !== value) {
            tapestry.authoring.clearRoomAttribute(roomId, cur);
        }
        var bmsg = tapestry.authoring.setRoomAttribute(roomId, value, 'true');
        if (bmsg && entity.send) {
            entity.send(bmsg + "\r\n");
        }
        return;
    }
    var msg = tapestry.authoring.setRoomAttribute(roomId, field, value);
    if (msg && entity.send) {
        entity.send(msg + "\r\n");
    }
}

tapestry.flows.register({
    id: "builder_edit_room",
    display_name: "editing room",
    trigger: "builder_edit_room",
    cancellable: true,
    steps: [
        {
            // Step 1: pick the field — label shows the current value.
            id: "field",
            type: "choice",
            prompt: "Which field do you want to edit?",
            options: function (entity) {
                return roomEditSchema(entity).map(function (f) {
                    return { label: f.label + "  [" + loomCurrentLabel(f.current) + "]", value: f.key };
                });
            },
            on_select: function (entity, option) {
                entity.setProperty("__edit_field", String(option.value));
            }
        },
        {
            // Step 2a: known-value fields (biome / bool / enum) -> selector. Skipped for text fields.
            id: "value_choice",
            type: "choice",
            skip_if: function (entity) {
                var m = findField(entity, entity.getProperty("__edit_field"));
                return !m || m.kind !== "choice";
            },
            prompt: function (entity) {
                var m = findField(entity, entity.getProperty("__edit_field"));
                var cur = (m && m.current != null && m.current !== '') ? " (current: " + m.current + ")" : "";
                return "Choose " + (m ? m.label : "value") + cur + ":";
            },
            options: function (entity) {
                var m = findField(entity, entity.getProperty("__edit_field"));
                var opts = (m && m.options) ? m.options : [];
                return opts.map(function (v) {
                    return { label: v, value: v };
                });
            },
            on_select: function (entity, option) {
                applyField(entity, entity.getProperty("__edit_field"), String(option.value));
            }
        },
        {
            // Step 2b: free fields -> text. Skipped for choice fields. Shows current value +
            // any min/max range; recommend_field enables the per-field '~' side-action.
            id: "value_text",
            type: "text",
            skip_if: function (entity) {
                var m = findField(entity, entity.getProperty("__edit_field"));
                return !!(m && m.kind === "choice");
            },
            recommend_field: function (entity) {
                // Only name/description have field-specific prompt logic in the engine
                // RoomPromptBuilder; return null elsewhere so "~" isn't offered for arbitrary
                // free-text fields (the engine then says "not available for this field").
                var key = entity.getProperty("__edit_field");
                return (key === "name" || key === "description") ? key : null;
            },
            prompt: function (entity) {
                var m = findField(entity, entity.getProperty("__edit_field"));
                var label = m ? m.label : "field";
                var cur = (m && m.current != null && m.current !== '')
                    ? " (current: " + loomTruncate(m.current, 40) + ")" : "";
                var range = "";
                if (m && (m.min != null || m.max != null)) {
                    range = " [range " + (m.min != null ? m.min : "") + "-" + (m.max != null ? m.max : "") + "]";
                }
                var suggestHint = (tapestry.authoring.recommendEnabled && tapestry.authoring.recommendEnabled())
                    ? " (or '~' for suggestions)" : "";
                return "New value for '" + label + "'" + cur + range + suggestHint + ":";
            },
            on_input: function (entity, value) {
                applyField(entity, entity.getProperty("__edit_field"), value);
            }
        }
    ],
    on_complete: function (entity) {
        return { success: true, message: "Room updated." };
    }
});
