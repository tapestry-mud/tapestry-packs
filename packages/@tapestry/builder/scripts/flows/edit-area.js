// packages/@tapestry/builder/scripts/flows/edit-area.js
//
// Schema-driven area editor. Mirrors edit-room.js structure + API exactly.
// The editable-field list is built by introspection:
//   - core structured fields (name, short, description, theme, lore, level_range, reset_interval)
//   - registry properties whose appliesTo includes 'area'
//
// The 'edit area' command always stashes __edit_area before triggering, so the stored
// value is authoritative (it honors an explicit 'edit area <id>' from any room). The
// current-room fallback is defensive only.

function loomTruncate(s, n) {
    s = String(s == null ? '' : s);
    return s.length > n ? s.substring(0, n - 3) + '...' : s;
}

function loomCurrentLabel(v) {
    return (v == null || v === '') ? '(unset)' : loomTruncate(v, 40);
}

// Resolve the target area id from entity state. The command always pre-stashes
// __edit_area, so this is authoritative. Falls back to the current room's area
// defensively (e.g. if flow is triggered outside the edit command).
function areaResolve(entity) {
    var stored = entity.getProperty("__edit_area");
    if (stored) {
        return String(stored);
    }
    return tapestry.world.getRoomArea(entity.roomId);
}

// Build the ordered field schema for the target area.
// Each entry: { key, label, kind: 'text'|'choice', options?, valueType?, min?, max?, current }
function areaEditSchema(areaId) {
    var info = tapestry.authoring.getArea(areaId) || {};
    var fields = [];

    fields.push({ key: 'name',           label: 'Name',                    kind: 'text', current: info.name });
    fields.push({ key: 'short',          label: 'Short',                   kind: 'text', current: info.short });
    fields.push({ key: 'description',    label: 'Description',             kind: 'text', current: info.description });
    fields.push({ key: 'theme',          label: 'Theme (LLM brief)',       kind: 'text', current: info.theme });
    fields.push({ key: 'lore',           label: 'Lore',                    kind: 'text', current: info.lore });
    fields.push({ key: 'level_range',    label: 'Level range (min,max)',   kind: 'text', current: info.levelRange });
    fields.push({ key: 'reset_interval', label: 'Reset interval (s)',      kind: 'text', current: info.resetInterval });

    // Mirror edit-room.js: future registry properties scoped to 'area'.
    var props = tapestry.world.getPropertyRegistry ? tapestry.world.getPropertyRegistry() : [];
    for (var i = 0; i < props.length; i++) {
        var p = props[i];
        if (!p.appliesTo || p.appliesTo.indexOf('area') === -1) {
            continue;
        }
        var f = { key: p.name, label: p.name, valueType: p.valueType, current: null, min: p.min, max: p.max };
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
    return fields;
}

function findAreaField(entity, key) {
    var schema = areaEditSchema(areaResolve(entity));
    for (var i = 0; i < schema.length; i++) {
        if (schema[i].key === key) {
            return schema[i];
        }
    }
    return null;
}

// Write a field value through the right authoring call.
function applyAreaField(entity, field, value) {
    var areaId = areaResolve(entity);
    if (field === 'name') {
        tapestry.authoring.setAreaName(areaId, value);
        return;
    }
    if (field === 'short') {
        tapestry.authoring.setAreaShort(areaId, value);
        return;
    }
    if (field === 'description') {
        tapestry.authoring.setAreaDescription(areaId, value);
        return;
    }
    if (field === 'theme') {
        tapestry.authoring.setAreaTheme(areaId, value);
        return;
    }
    if (field === 'lore') {
        tapestry.authoring.setAreaLore(areaId, value);
        return;
    }
    var msg = tapestry.authoring.setAreaAttribute(areaId, field, value);
    if (msg && entity.send) {
        entity.send(msg + "\r\n");
    }
}

tapestry.flows.register({
    id: "builder_edit_area",
    display_name: "editing area",
    trigger: "builder_edit_area",
    cancellable: true,
    recommend_context: "area",
    steps: [
        {
            // Step 1: pick the field -- label shows the current value.
            id: "field",
            type: "choice",
            prompt: "Which field do you want to edit?",
            options: function (entity) {
                // __edit_area was already stashed by the command. Re-affirm defensively.
                entity.setProperty("__edit_area", areaResolve(entity));
                var areaId = areaResolve(entity);
                return areaEditSchema(areaId).map(function (f) {
                    return { label: f.label + "  [" + loomCurrentLabel(f.current) + "]", value: f.key };
                });
            },
            on_select: function (entity, option) {
                entity.setProperty("__edit_field", String(option.value));
            }
        },
        {
            // Step 2a: known-value fields (bool / enum) -> selector. Skipped for text fields.
            id: "value_choice",
            type: "choice",
            skip_if: function (entity) {
                var m = findAreaField(entity, entity.getProperty("__edit_field"));
                return !m || m.kind !== "choice";
            },
            prompt: function (entity) {
                var m = findAreaField(entity, entity.getProperty("__edit_field"));
                var cur = (m && m.current != null && m.current !== '') ? " (current: " + m.current + ")" : "";
                return "Choose " + (m ? m.label : "value") + cur + ":";
            },
            options: function (entity) {
                var m = findAreaField(entity, entity.getProperty("__edit_field"));
                var opts = (m && m.options) ? m.options : [];
                return opts.map(function (v) {
                    return { label: v, value: v };
                });
            },
            on_select: function (entity, option) {
                applyAreaField(entity, entity.getProperty("__edit_field"), String(option.value));
            }
        },
        {
            // Step 2b: free fields -> text. Skipped for choice fields. Shows current value +
            // any min/max range; recommend_field enables the per-field '~' side-action.
            id: "value_text",
            type: "text",
            skip_if: function (entity) {
                var m = findAreaField(entity, entity.getProperty("__edit_field"));
                return !!(m && m.kind === "choice");
            },
            recommend_field: function (entity) {
                // Return the field key for fields that have area-specific prompt logic
                // in the engine AreaPromptBuilder. Others report "not available for this field".
                var key = entity.getProperty("__edit_field");
                return (key === "short" || key === "description" || key === "theme" || key === "lore") ? key : null;
            },
            prompt: function (entity) {
                var m = findAreaField(entity, entity.getProperty("__edit_field"));
                var label = m ? m.label : "field";
                // Show the FULL current value on its own line (the field picker truncates to
                // one line; an area field has no in-world view, so this is the only place to
                // read the whole thing). Cancel here to just review without changing it.
                var curLine = (m && m.current != null && m.current !== '')
                    ? "Current " + label + ":\r\n  " + m.current + "\r\n" : "";
                var range = "";
                if (m && (m.min != null || m.max != null)) {
                    range = " [range " + (m.min != null ? m.min : "") + "-" + (m.max != null ? m.max : "") + "]";
                }
                var suggestHint = (tapestry.authoring.recommendEnabled && tapestry.authoring.recommendEnabled())
                    ? " (or '~' for suggestions)" : "";
                return curLine + "New value for '" + label + "'" + range + suggestHint + ":";
            },
            on_input: function (entity, value) {
                applyAreaField(entity, entity.getProperty("__edit_field"), value);
            }
        }
    ],
    on_complete: function (entity) {
        return { success: true, message: "Area updated." };
    }
});
