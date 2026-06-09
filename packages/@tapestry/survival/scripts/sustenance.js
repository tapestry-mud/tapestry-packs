(function() {
'use strict';
var DRAIN_AMOUNT = 1;
var DRAIN_CADENCE = 300;
var REMINDER_INTERVAL = 3000;
var TIER_FULL_MIN = 67;
var TIER_HUNGRY_MIN = 34;

// The tier model, published for peer packs (cooking reads thresholds rather than
// hardcoding them). Namespace exports are read-only by convention.
tapestry.packs.export('tiers', { FULL_MIN: TIER_FULL_MIN, HUNGRY_MIN: TIER_HUNGRY_MIN }, {
    kind: 'namespace',
    description: 'Sustenance tier thresholds: >=FULL_MIN is full, >=HUNGRY_MIN is hungry, else famished.'
});

function getSustenanceValue(entityId) {
    var val = tapestry.world.getProperty(entityId, 'sustenance');
    return (val === null || val === undefined) ? 100 : val;
}

function getTier(value) {
    if (value >= TIER_FULL_MIN) { return 'full'; }
    if (value >= TIER_HUNGRY_MIN) { return 'hungry'; }
    return 'famished';
}

var lastReminder = {};

tapestry.schedule.everyForEach(DRAIN_CADENCE, { type: 'player' }, function(entity) {
    var entityId = entity.id;
    var current = getSustenanceValue(entityId);
    var prevTier = getTier(current);

    var drain = DRAIN_AMOUNT;
    if (tapestry.effects.hasEffect(entityId, 'well-fed')) {
        drain = 0; // well-fed: skip hunger drain while the effect is active
    }
    tapestry.events.publish('sustenance.tick', {
        entityId: entityId,
        drainAmount: drain
    });

    var newValue = Math.max(0, current - drain);
    tapestry.world.setProperty(entityId, 'sustenance', newValue);

    var newTier = getTier(newValue);
    if (newTier !== prevTier) {
        tapestry.events.publish('sustenance.changed', {
            entityId: entityId,
            oldTier: prevTier,
            newTier: newTier
        });
    }

    if (newTier !== 'full' && newTier === prevTier) {
        var lastReminderTick = lastReminder[entityId] || 0;
        lastReminder[entityId] = (lastReminderTick || 0) + 1;
        if (lastReminder[entityId] >= (REMINDER_INTERVAL / DRAIN_CADENCE)) {
            lastReminder[entityId] = 0;
            tapestry.events.publish('sustenance.reminder', {
                entityId: entityId,
                tier: newTier
            });
        }
    }
});

tapestry.events.on('sustenance.changed', function(evt) {
    var entityId = evt.data.entityId;
    var newTier = evt.data.newTier;
    if (newTier === 'hungry') {
        tapestry.world.send(entityId, 'You are getting hungry.\r\n');
    } else if (newTier === 'famished') {
        tapestry.world.send(entityId, 'You are famished! Your body aches with hunger.\r\n');
    } else if (newTier === 'full') {
        tapestry.world.send(entityId, 'You feel satisfied.\r\n');
    }
});

tapestry.events.on('sustenance.reminder', function(evt) {
    var entityId = evt.data.entityId;
    var tier = evt.data.tier;
    if (tier === 'hungry') {
        tapestry.world.send(entityId, 'You are hungry.\r\n');
    } else if (tier === 'famished') {
        tapestry.world.send(entityId, 'You are famished and can barely think straight.\r\n');
    }
});

tapestry.events.on('item.consumed', function(evt) {
    var effectId = evt.data.effectId;
    var effectData = evt.data.effectData;
    var entityId = evt.data.entityId;

    // Nutrition applies only to eating (a 'cook' consume must not feed).
    // instant-heal / instant-restore below stay method-agnostic.
    if (evt.data.consumeMethod === 'eat') {
        // Number() is required: values read off evt.data arrive CLR-wrapped, so a bare
        // `current + sustenanceValue` would string-concatenate instead of add.
        var sustenanceValue = Number(evt.data.sustenanceValue) || 0;
        if (sustenanceValue > 0) {
            var current = Number(getSustenanceValue(entityId)) || 0;
            tapestry.world.setProperty(entityId, 'sustenance', Math.min(100, current + sustenanceValue));
        }
    }

    if (effectId === 'core:instant-heal' && effectData) {
        var healHp = effectData.heal_hp || 0;
        if (healHp > 0) {
            tapestry.stats.addVital(entityId, 'hp', healHp);
            tapestry.world.send(entityId,
                'You feel a warm surge of healing energy. (+' + healHp + ' HP)\r\n');
        }
    }

    if (effectId === 'core:instant-restore' && effectData) {
        var healResource = effectData.heal_resource || 0;
        if (healResource > 0) {
            tapestry.stats.addVital(entityId, 'resource', healResource);
            tapestry.world.send(entityId,
                'You feel your power restored. (+' + healResource + ')\r\n');
        }
    }
});

tapestry.events.on('entity.regen', function(evt) {
    var entityId = evt.sourceEntityId;
    if (!entityId) { return; }
    var tier = getTier(getSustenanceValue(entityId));
    var mult = tier === 'full' ? 1.0 : tier === 'hungry' ? 0.5 : 0.0;
    evt.data.amount = Math.round(evt.data.amount * mult);
    if (mult === 0.0) {
        evt.cancel();
    }
});

// Seed sustenance on new characters (moved here from the engine's
// WorldEventModule so the kernel holds no hunger logic). Idempotent: only
// sets when unset, so it never clobbers a loaded/famished value. Also runs on
// login to backfill characters created before survival owned this.
function seedSustenance(entityId) {
    if (!entityId) { return; }
    var raw = tapestry.world.getProperty(entityId, 'sustenance');
    if (raw === null || raw === undefined) {
        tapestry.world.setProperty(entityId, 'sustenance', 100);
    }
}
tapestry.events.on('character.created', function(evt) { seedSustenance(evt.sourceEntityId); });
tapestry.events.on('player.login', function(evt) { seedSustenance(evt.sourceEntityId); });

// ---- Pack interop exports (Phase 1) ----
// Survival exposes its hunger model to peer packs through the sanctioned, enforced
// interop surface (tapestry.packs). Callers must declare a dependency edge on
// @tapestry/survival. See cooking's cook command for the consumer.

tapestry.packs.export('getHungerTier', function (entityId) {
    return getTier(getSustenanceValue(entityId)); // 'full' | 'hungry' | 'famished'
}, {
    kind: 'query',
    description: 'Hunger tier for an entity, derived from its sustenance value.',
    params: [{ name: 'entityId', type: 'entity' }],
    returns: 'string'
});

tapestry.packs.export('applyWellFedBuff', function (entityId, durationTicks) {
    tapestry.effects.apply(entityId, {
        id: 'well-fed',
        duration: Number(durationTicks),
        flags: ['well_fed']
    });
    tapestry.world.send(entityId, 'You feel well-fed and satisfied.\r\n');
}, {
    kind: 'command',
    description: 'Suppress hunger drain for the given duration in ticks (a well-fed buff).',
    params: [
        { name: 'entityId', type: 'entity' },
        { name: 'durationTicks', type: 'number' }
    ],
    returns: 'undefined'
});
})();
