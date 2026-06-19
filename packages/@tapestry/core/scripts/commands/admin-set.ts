// Admin `set` command.
//
// Declared attributes (PropertyRegistry / TagRegistry) flow through the engine's
// registry-driven dispatch -- "declared <=> settable". A small retained table below
// handles the 14 out-of-scope subsystem ops (EntityStats / alignment / training /
// currency / npc hp) that are NOT stored properties; these keep their current
// command paths until StatRegistry (north-star section 9) lands.

import * as tapestry from "@tapestry/engine";
function domainResolveTarget(kind, name) {
    var lower = name.toLowerCase();
    if (kind === 'player') {
        var players = tapestry.world.getOnlinePlayers();
        for (var i = 0; i < players.length; i++) {
            if (players[i].name.toLowerCase() === lower) {
                return { id: players[i].id, name: players[i].name };
            }
        }
        return null;
    }
    if (kind === 'npc') {
        var npcs = tapestry.world.getNpcsInWorld();
        for (var n = 0; n < npcs.length; n++) {
            if (npcs[n].name.toLowerCase().indexOf(lower) !== -1) {
                return { id: npcs[n].id, name: npcs[n].name };
            }
        }
        return null;
    }
    if (kind === 'item') {
        var items = tapestry.world.getItemsInWorld();
        for (var k = 0; k < items.length; k++) {
            if (items[k].name.toLowerCase().indexOf(lower) !== -1) {
                return { id: items[k].id, name: items[k].name };
            }
        }
        return null;
    }
    return null;
}

function statHandler(statKey, label, min?: any) {
    return function(actor, target, rest) {
        var n = parseInt(rest, 10);
        if (isNaN(n)) { actor.send('Value must be a number.\r\n'); return; }
        if (min !== undefined && n < min) { actor.send(label + ' must be at least ' + min + '.\r\n'); return; }
        tapestry.stats.setBase(target.id, statKey, n);
        actor.send(target.name + "'s " + label + " set to " + n + ".\r\n");
    };
}

// Retained subsystem ops (out of registry scope). Keyed kind:attr.
var domainSetOps = {
    'player:alignment': {
        handler: function(actor, target, rest) {
            var n = parseInt(rest, 10);
            if (isNaN(n)) { actor.send('Value must be a number.\r\n'); return; }
            tapestry.alignment.set(target.id, n, 'admin_set');
            var actual = tapestry.alignment.get(target.id);
            var bucket = tapestry.alignment.bucket(target.id);
            actor.send(target.name + "'s alignment set to " + actual + " (" + bucket + ").\r\n");
        }
    },
    'player:str': { handler: statHandler('strength', 'Strength') },
    'player:int': { handler: statHandler('intelligence', 'Intelligence') },
    'player:wis': { handler: statHandler('wisdom', 'Wisdom') },
    'player:dex': { handler: statHandler('dexterity', 'Dexterity') },
    'player:con': { handler: statHandler('constitution', 'Constitution') },
    'player:luck': { handler: statHandler('luck', 'Luck') },
    'player:hp': { handler: statHandler('max_hp', 'max HP', 1) },
    'player:mana': { handler: statHandler('max_resource', 'max Mana', 1) },
    'player:mv': { handler: statHandler('max_movement', 'max Movement', 1) },
    'player:prof': {
        handler: function(actor, target, rest) {
            var parts = rest.split(' ');
            if (parts.length < 2) { actor.send('Usage: set player prof [target] [ability] [value]\r\n'); return; }
            var abilityId = parts[0];
            var n = parseInt(parts[1], 10);
            if (isNaN(n)) { actor.send('Value must be a number.\r\n'); return; }
            tapestry.abilities.setProficiency(target.id, abilityId, n);
            actor.send(target.name + "'s " + abilityId + " proficiency set to " + n + "%.\r\n");
        }
    },
    'player:cap': {
        handler: function(actor, target, rest) {
            var parts = rest.split(' ');
            if (parts.length < 2) { actor.send('Usage: set player cap [target] [ability] [novice|apprentice|journeyman|master]\r\n'); return; }
            var abilityId = parts[0];
            var tier = parts[1].toLowerCase();
            if (!['novice', 'apprentice', 'journeyman', 'master'].includes(tier)) {
                actor.send('Invalid tier. Use: novice, apprentice, journeyman, master.\r\n');
                return;
            }
            tapestry.training.setCap(target.id, abilityId, tier);
            actor.send(target.name + "'s " + abilityId + " cap set to " + tier + ".\r\n");
        }
    },
    'player:gold': {
        handler: function(actor, target, rest) {
            var n = parseInt(rest, 10);
            if (isNaN(n) || n < 0) { actor.send('Gold cannot be negative.\r\n'); return; }
            tapestry.currency.setGold(target.id, n, 'admin:set');
            var total = tapestry.currency.getGold(target.id);
            actor.send(target.name + "'s gold set to " + total + ".\r\n");
        }
    },
    'npc:hp': {
        handler: function(actor, target, rest) {
            var n = parseInt(rest, 10);
            if (isNaN(n) || n < 0) { actor.send('Value must be a non-negative number.\r\n'); return; }
            tapestry.admin.setEntityHp(target.id, n);
            actor.send(target.name + "'s hp set to " + n + " (hp and max hp).\r\n");
        }
    }
};

tapestry.commands.register(<any>{
    name: 'set',
    admin: true,
    args: {
        entity: { type: 'keyword', required: true },
        property: { type: 'keyword', required: false },
        value: { type: 'text', required: false }
    },
    handler: function(actor, resolved) {
        var entityKind = (resolved.entity || '').toLowerCase();
        var attr = (resolved.property || '').toLowerCase();
        var valueStr = resolved.value || '';

        // Retained subsystem ops: resolve target locally and run the legacy handler.
        var domain = domainSetOps[entityKind + ':' + attr];
        if (domain) {
            var spaceIdx = valueStr.indexOf(' ');
            var targetName = spaceIdx === -1 ? valueStr : valueStr.slice(0, spaceIdx);
            var rest = spaceIdx === -1 ? '' : valueStr.slice(spaceIdx + 1);
            if (!targetName) {
                actor.send('Usage: set ' + entityKind + ' ' + attr + ' [target] [value]\r\n');
                return;
            }
            var target = domainResolveTarget(entityKind, targetName);
            if (!target) {
                actor.send("No " + entityKind + " named '" + targetName + "' found.\r\n");
                return;
            }
            domain.handler(actor, target, rest);
            return;
        }

        // Everything else (panels, value-omitted echo, declared attributes) -> engine.
        // Reconstruct dispatch args: [kind, attr, target, ...value], dropping empties.
        var dispatchArgs = [];
        if (resolved.entity) { dispatchArgs.push(resolved.entity); }
        if (resolved.property) { dispatchArgs.push(resolved.property); }
        if (valueStr) {
            var parts = valueStr.split(' ');
            for (var i = 0; i < parts.length; i++) {
                if (parts[i].length > 0) { dispatchArgs.push(parts[i]); }
            }
        }
        (tapestry.admin.set as any).dispatch(actor.entityId, dispatchArgs);
    }
});
