// packages/@tapestry/builder/scripts/flows/editors-area.js
//
// Area editor config for the shared edit-flow factory (see edit-flow-factory.js,
// which must sort before this file -- the factory call below runs at load time).

(function () {
    'use strict';

    var builder = tapestry.packs.require('@tapestry/builder');

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
        fields.push({
            key: 'wip', label: 'Work-in-progress (hide from players)',
            kind: 'choice', options: ['true', 'false'],
            current: info.wip ? 'true' : 'false'
        });

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

    builder.buildEntityEditFlow({
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
