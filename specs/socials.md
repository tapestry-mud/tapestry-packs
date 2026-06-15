---
capability: socials
last-updated: 2026-06-13
---

# Socials

## Overview

The socials system provides a library of pre-written emote commands (ack, wave, bow, etc.)
that players can invoke with or without a target. All socials are registered in bulk at
startup from a single YAML data file via an init script in @tapestry/core. Each social is
a first-class command in the "social" category, so it appears in help listings alongside
regular commands.

## Behavior

- All socials are loaded at startup from
  (packages/@tapestry/core/scripts/socials/socials.yaml) and iterated in
  (packages/@tapestry/core/scripts/socials/init.js:1-7). A missing or unreadable YAML
  file throws an error and aborts registration.

- Each entry in the YAML is registered as a command with `category: 'social'` and
  `description` set to the entry's `no_target` string.
  (packages/@tapestry/core/scripts/socials/init.js:8-14)

- The optional `target` argument resolves against visible entities only (`type: 'visible'`,
  `required: false`). Typing a social alone is valid.
  (packages/@tapestry/core/scripts/socials/init.js:12-14)

- Each social defines three message variants per the YAML schema:
  (packages/@tapestry/core/scripts/socials/socials.yaml:1-8)
  - `no_target` / `no_target_room` -- used when no target is supplied.
  - `self` / `self_room` -- used when the player targets themselves
    (target.id === player.entityId).
  - `targeted` / `targeted_room` / `targeted_victim` -- used when the player targets
    someone else; `targeted_victim` is sent directly to the target entity.

- When no target is given, the player sees the `no_target` string with the literal token
  `$n` replaced by "You". The rest of the room receives `no_target_room` with all
  occurrences of `$n` replaced by the player's name and all occurrences of `$mself`
  replaced by the gender-reflexive pronoun.
  (packages/@tapestry/core/scripts/socials/init.js:22-28)

- When the player targets themselves, the player sees the `self` string with `$n` -> "You"
  and `$mself` -> reflexive pronoun (single replacement each). The room sees `self_room`
  with global replacement of both tokens.
  (packages/@tapestry/core/scripts/socials/init.js:31-38)

- When the player targets another entity, the player sees `targeted` with `$n` -> "You"
  and all `$N` occurrences replaced by the target's name. The room (excluding both actor
  and target) receives `targeted_room` with `$n` -> actor name and `$N` -> target name.
  The target entity receives `targeted_victim` with `$n` -> actor name.
  (packages/@tapestry/core/scripts/socials/init.js:41-49)

- Placeholder tokens: `$n` (lowercase) is always the acting player's name (or "You" in
  first-person messages); `$N` (uppercase) is the target entity's name. `$mself` is a
  gender-reflexive pronoun derived from the player's `gender` world property.
  (packages/@tapestry/core/scripts/socials/init.js:16-17; packages/@tapestry/core/scripts/socials/socials.yaml:5-8)

- The gender-reflexive pronoun resolves as: `gender === 'male'` -> "himself",
  `gender === 'female'` -> "herself", any other value (including absent) -> "themselves".
  (packages/@tapestry/core/scripts/socials/init.js:16-17)

- First-person (player-facing) messages substitute the `$n` token with a single literal
  `String.replace('$n', 'You')`, so only the first `$n` occurrence is replaced; this holds
  for the `no_target`, `self`, and `targeted` strings, and the `self` string likewise uses a
  single literal replace for `$mself`. The third-person room and victim messages
  (`no_target_room`, `self_room`, `targeted_room`, `targeted_victim`) use global regex
  replacement (`/\$n/g`, `/\$N/g`, `/\$mself/g`). The split is deliberate: "You" appears once
  in first-person text, while names can recur. (packages/@tapestry/core/scripts/socials/init.js:22;
  packages/@tapestry/core/scripts/socials/init.js:32; packages/@tapestry/core/scripts/socials/init.js:41;
  packages/@tapestry/core/scripts/socials/init.js:26; packages/@tapestry/core/scripts/socials/init.js:36;
  packages/@tapestry/core/scripts/socials/init.js:45; packages/@tapestry/core/scripts/socials/init.js:49)

- The help topic `social` (category "social", role "player") describes the system and
  lists available socials. Its keyword list includes: emote, action, gesture, expression,
  roleplay, rp. (packages/@tapestry/core/help/social.yaml:1-6)

- UNVERIFIED: The social list in the help topic (packages/@tapestry/core/help/social.yaml:17-25)
  is out of sync with the YAML data file. The help text names several socials (growl, hide,
  hmm, hop, kneel, mock, mutter, nibble, ponder, roar, ruffle, scowl, tap, think, and
  others) that have no corresponding entry in socials.yaml, and the YAML data file contains
  socials (fume, gag, hiccup, jump, moan, pace, pinch, plead, point, raise, roll, scoff,
  scream, shiver, snore, spin, squeeze, stare, strut, twiddle, and others) not mentioned in
  the help text. The canonical runtime list is the YAML data file.

- The 91 socials registered at runtime (from socials.yaml) are:
  ack, applaud, bark, beam, blush, boggle, bonk, bounce, bow, burp, cackle, cheer,
  chuckle, clap, comb, comfort, cough, cringe, cry, cuddle, curse, dance, drool,
  eye, faint, flex, flip, flirt, flutter, frown, fume, gag, gasp, giggle, glare,
  grin, groan, grumble, grunt, hiccup, howl, hug, jump, kiss, laugh, lick, moan,
  nod, nudge, pace, pat, peer, pinch, plead, point, poke, pout, purr, raise, roll,
  salute, scoff, scream, shake, shiver, shrug, sigh, slap, smile, smirk, snap,
  snicker, sniff, snore, sob, spin, spit, squeeze, stare, strut, sulk, tackle,
  thank, tickle, twiddle, wave, whine, whistle, wink, worship, yawn.
  (packages/@tapestry/core/scripts/socials/socials.yaml)

## Rejected and Reverted

- **Offensive legacy ROM socials (deliberately not ported):** a number of socials from the
  original ROM set are intentionally omitted because they encode attitudes that have no place
  in a modern game. This is a deliberate exclusion, not an incomplete port. Do not backfill them.

## Change Log

- None on record.
