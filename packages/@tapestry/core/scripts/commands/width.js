// Player command: set your output screen width for server-side word-wrapping.
//
//   width            -> show your current setting
//   width <columns>  -> wrap output at N columns (20-500)
//   width off        -> disable wrapping (send long lines unbroken)
//   width auto        -> follow the server default
//
// The engine reads the `screen_width` property when wrapping output. Without a pref the
// server default width is used. The web client renders in a fixed-grid terminal too, so
// this helps there as well.

tapestry.commands.register({
    name: 'width',
    description: 'Set your screen width for word-wrapping (e.g. "width 80", "width off", "width auto").',
    category: 'info',
    roles: ['player'],
    args: {
        value: { type: 'text', required: false }
    },
    handler: function(actor, resolved) {
        var MIN = 20;
        var MAX = 500;
        var arg = (resolved.value || '').trim().toLowerCase();
        var current = tapestry.world.getProperty(actor.entityId, 'screen_width');

        // No argument: report current setting.
        if (arg === '') {
            if (current === null || current === undefined) {
                actor.send('Your screen width follows the server default (output is word-wrapped). ' +
                           'Use "width <columns>" to set your own, e.g. "width 80".\r\n');
            } else if (current <= 0) {
                actor.send('Word-wrap is OFF for you; long lines are sent unbroken. ' +
                           'Use "width <columns>" (e.g. "width 80") to turn it back on.\r\n');
            } else {
                actor.send('Your screen width is ' + Math.round(current) + ' columns. ' +
                           'Use "width auto" for the server default, or "width off" to disable wrapping.\r\n');
            }
            return;
        }

        // Reset to the server default.
        if (arg === 'auto' || arg === 'reset' || arg === 'default') {
            tapestry.world.setProperty(actor.entityId, 'screen_width', null);
            actor.send('Screen width reset to the server default.\r\n');
            return;
        }

        // Disable wrapping.
        if (arg === 'off' || arg === 'none' || arg === '0') {
            tapestry.world.setProperty(actor.entityId, 'screen_width', 0);
            actor.send('Word-wrap disabled. Long lines will be sent unbroken. ' +
                       'Use "width <columns>" to re-enable.\r\n');
            return;
        }

        // Numeric set.
        var n = parseInt(arg, 10);
        if (isNaN(n) || String(n) !== arg) {
            actor.send('Usage: width <columns>, width off, or width auto. ' +
                       'Columns must be a whole number between ' + MIN + ' and ' + MAX + '.\r\n');
            return;
        }
        if (n < MIN || n > MAX) {
            actor.send('Screen width must be between ' + MIN + ' and ' + MAX +
                       ' columns (or "off" to disable).\r\n');
            return;
        }

        tapestry.world.setProperty(actor.entityId, 'screen_width', n);
        actor.send('Screen width set to ' + n + ' columns.\r\n');
    }
});
