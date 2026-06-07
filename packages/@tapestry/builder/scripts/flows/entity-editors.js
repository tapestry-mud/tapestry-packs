// packages/@tapestry/builder/scripts/flows/entity-editors.js
//
// Schema-driven entity editors. ONE shared 3-step flow factory + per-entity configs (room,
// area), wrapped in an IIFE so nothing leaks into the shared pack global scope and there is
// NO cross-file load-order dependency -- the whole machine is self-contained here. A future
// pack module system can split these into per-entity files importing the factory.
//
// Each editor is just a config: { id, displayName, trigger, schema, apply, recommendField,
// recommendContext?, completeMessage }. To add mob/item/quest editors later, add a config.

(function () {
    'use strict';

    function truncate(s, n) {
        s = String(s == null ? '' : s);
        return s.length > n ? s.substring(0, n - 3) + '...' : s;
    }

    function currentLabel(v) {
        return (v == null || v === '') ? '(unset)' : truncate(v, 40);
    }

    // Build + register a schema-driven editor flow.
    //   spec.schema(entity)        -> [ { key, label, kind:'text'|'choice', options?, min?, max?, current, ... } ]
    //   spec.apply(entity, key, v) -> write v via the right authoring call
    //   spec.recommendField(entity) -> field key that offers '~', or null
    function buildEntityEditFlow(spec) {
        function fieldFor(entity, key) {
            var fs = spec.schema(entity);
            for (var i = 0; i < fs.length; i++) {
                if (fs[i].key === key) {
                    return fs[i];
                }
            }
            return null;
        }

        var flow = {
            id: spec.id,
            display_name: spec.displayName,
            trigger: spec.trigger,
            cancellable: true,
            steps: [
                {
                    // Step 1: pick a field -- label shows the (truncated) current value.
                    id: 'field',
                    type: 'choice',
                    prompt: 'Which field do you want to edit?',
                    options: function (entity) {
                        return spec.schema(entity).map(function (f) {
                            return { label: f.label + '  [' + currentLabel(f.current) + ']', value: f.key };
                        });
                    },
                    on_select: function (entity, option) {
                        entity.setProperty('__edit_field', String(option.value));
                    }
                },
                {
                    // Step 2a: known-value fields (choice) -> selector. Skipped for text fields.
                    id: 'value_choice',
                    type: 'choice',
                    skip_if: function (entity) {
                        var m = fieldFor(entity, entity.getProperty('__edit_field'));
                        return !m || m.kind !== 'choice';
                    },
                    prompt: function (entity) {
                        var m = fieldFor(entity, entity.getProperty('__edit_field'));
                        var cur = (m && m.current != null && m.current !== '') ? ' (current: ' + m.current + ')' : '';
                        return 'Choose ' + (m ? m.label : 'value') + cur + " (or 'cancel' to abort):";
                    },
                    options: function (entity) {
                        var m = fieldFor(entity, entity.getProperty('__edit_field'));
                        var opts = (m && m.options) ? m.options : [];
                        return opts.map(function (v) {
                            return { label: v, value: v };
                        });
                    },
                    on_select: function (entity, option) {
                        spec.apply(entity, entity.getProperty('__edit_field'), String(option.value));
                    }
                },
                {
                    // Step 2b: free fields -> text. Skipped for choice fields. Shows the FULL
                    // current value on its own line, plus any range; '~' is offered only when
                    // the current field actually supports it.
                    id: 'value_text',
                    type: 'text',
                    skip_if: function (entity) {
                        var m = fieldFor(entity, entity.getProperty('__edit_field'));
                        return !!(m && m.kind === 'choice');
                    },
                    recommend_field: function (entity) {
                        return spec.recommendField ? spec.recommendField(entity) : null;
                    },
                    prompt: function (entity) {
                        var m = fieldFor(entity, entity.getProperty('__edit_field'));
                        var label = m ? m.label : 'field';
                        var curLine = (m && m.current != null && m.current !== '')
                            ? 'Current ' + label + ':\r\n  ' + m.current + '\r\n' : '';
                        var range = '';
                        if (m && (m.min != null || m.max != null)) {
                            range = ' [range ' + (m.min != null ? m.min : '') + '-' + (m.max != null ? m.max : '') + ']';
                        }
                        var hints = ["'cancel' to abort"];
                        var canRecommend = tapestry.authoring.recommendEnabled
                            && tapestry.authoring.recommendEnabled()
                            && spec.recommendField && spec.recommendField(entity);
                        if (canRecommend) {
                            hints.unshift("'~' for suggestions");
                        }
                        return curLine + "New value for '" + label + "'" + range + ' (or ' + hints.join(', ') + ')' + ':';
                    },
                    on_input: function (entity, value) {
                        spec.apply(entity, entity.getProperty('__edit_field'), value);
                    }
                }
            ],
            on_complete: function (entity) {
                return { success: true, message: spec.completeMessage || 'Updated.' };
            }
        };
        if (spec.recommendContext) {
            flow.recommend_context = spec.recommendContext;
        }
        tapestry.flows.register(flow);
    }

    // ------------------------------------------------------------------ ROOM editor
    function roomSchema(entity) {
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

    function roomApply(entity, field, value) {
        var roomId = entity.roomId;
        if (field === 'name') {
            // setRoomName may RE-KEY the room id (rename refactor); use res.id afterward, not roomId.
            var res = tapestry.authoring.setRoomName(roomId, value);
            if (res && res.renamed && entity.send) {
                var newId = String(res.id);
                var shortId = newId.indexOf(':') >= 0 ? newId.split(':')[1] : newId;
                entity.send('Name set to "' + value + '" (room id is now: ' + shortId + ').\r\n');
            }
            if (res && res.warnings && entity.send) {
                for (var w = 0; w < res.warnings.length; w++) {
                    entity.send('Warning: ' + res.warnings[w] + '\r\n');
                }
            }
            return;
        }
        if (field === 'description') {
            tapestry.authoring.setRoomDescription(roomId, value);
            return;
        }
        // Biome is a single-valued tag group: setting the new one clears the old.
        var fs = roomSchema(entity);
        var meta = null;
        for (var i = 0; i < fs.length; i++) {
            if (fs[i].key === field) {
                meta = fs[i];
                break;
            }
        }
        if (meta && meta.isBiome) {
            var cur = tapestry.world.getRoomBiome(roomId);
            if (cur && cur !== value) {
                tapestry.authoring.clearRoomAttribute(roomId, cur);
            }
            var bmsg = tapestry.authoring.setRoomAttribute(roomId, value, 'true');
            if (bmsg && entity.send) {
                entity.send(bmsg + '\r\n');
            }
            return;
        }
        var msg = tapestry.authoring.setRoomAttribute(roomId, field, value);
        if (msg && entity.send) {
            entity.send(msg + '\r\n');
        }
    }

    buildEntityEditFlow({
        id: 'builder_edit_room',
        displayName: 'editing room',
        trigger: 'builder_edit_room',
        schema: roomSchema,
        apply: roomApply,
        recommendField: function (entity) {
            // Only name/description have field-specific logic in the engine RoomPromptBuilder.
            var key = entity.getProperty('__edit_field');
            return (key === 'name' || key === 'description') ? key : null;
        },
        completeMessage: 'Room updated.'
    });

    // ------------------------------------------------------------------ AREA editor
    // The 'edit area' command stashes __edit_area before triggering; this resolves it (with a
    // current-room fallback) so the schema/apply act on the named area.
    function areaResolve(entity) {
        var stored = entity.getProperty('__edit_area');
        if (stored) {
            return String(stored);
        }
        return tapestry.world.getRoomArea(entity.roomId);
    }

    function areaSchema(entity) {
        var info = tapestry.authoring.getArea(areaResolve(entity)) || {};
        var fields = [];
        fields.push({ key: 'name', label: 'Name', kind: 'text', current: info.name });
        fields.push({ key: 'short', label: 'Short', kind: 'text', current: info.short });
        fields.push({ key: 'description', label: 'Description', kind: 'text', current: info.description });
        fields.push({ key: 'theme', label: 'Theme (LLM brief)', kind: 'text', current: info.theme });
        fields.push({ key: 'lore', label: 'Lore', kind: 'text', current: info.lore });
        fields.push({ key: 'level_range', label: 'Level range (min,max)', kind: 'text', current: info.levelRange });
        fields.push({ key: 'reset_interval', label: 'Reset interval (s)', kind: 'text', current: info.resetInterval });

        // Future registry properties scoped to 'area' (mirrors the room introspection).
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

    function areaApply(entity, field, value) {
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
            entity.send(msg);
        }
    }

    buildEntityEditFlow({
        id: 'builder_edit_area',
        displayName: 'editing area',
        trigger: 'builder_edit_area',
        schema: areaSchema,
        apply: areaApply,
        recommendField: function (entity) {
            var key = entity.getProperty('__edit_field');
            return (key === 'short' || key === 'description' || key === 'theme' || key === 'lore') ? key : null;
        },
        recommendContext: 'area',
        completeMessage: 'Area updated.'
    });
})();
