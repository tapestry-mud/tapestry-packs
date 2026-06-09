// packages/@tapestry/builder/scripts/flows/edit-flow-factory.js
//
// The shared 3-step entity-editor flow factory, exported for the per-entity editor
// files (editors-room.js, editors-area.js) to require() -- the split the original
// entity-editors.js header asked for.
//
// ORDERING NOTE: require() members are late-bound, but the per-entity files INVOKE
// the factory at load time, so this exporter file must load first. Within a pack,
// files load in alphabetical full-path order: 'edit-flow-factory.js' sorts before
// 'editors-*.js' ('-' < 'o'). Keep names that preserve this if you add editors.

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

    tapestry.packs.export('buildEntityEditFlow', buildEntityEditFlow, {
        kind: 'command',
        description: 'Build + register a schema-driven 3-step editor flow from a spec: { id, displayName, trigger, schema, apply, recommendField, recommendContext?, completeMessage }.',
        params: [{ name: 'spec', type: 'object' }],
        returns: 'undefined'
    });
})();
