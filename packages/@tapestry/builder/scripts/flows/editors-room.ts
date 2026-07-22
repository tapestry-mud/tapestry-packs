// packages/@tapestry/builder/scripts/flows/editors-room.ts
//
// Room editor config for the shared edit-flow factory (see edit-flow-factory.ts;
// the explicit import below guarantees the factory is evaluated before this module).

import * as tapestry from "@tapestry/engine";
import { buildEntityEditFlow } from "./edit-flow-factory.js";

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
        var f: any = { key: p.name, label: p.name, valueType: p.valueType, current: roomProps[p.name], min: p.min, max: p.max };
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
        var key = entity.scratch.get('edit_field');
        return (key === 'name' || key === 'description') ? key : null;
    },
    completeMessage: 'Room updated.'
});
