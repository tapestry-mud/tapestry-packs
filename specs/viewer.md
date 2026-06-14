# viewer

Watch-mode DM privacy for 1:1 player messaging (tell and reply).

## Overview

The `@tapestry/viewer` pack enforces a privacy policy for direct-message commands in
watch-mode ("televised MUD") deployments. It overrides the `tell` and `reply` commands
from `@tapestry/core` so that DM content reaches its intended recipient but is NOT
mirrored to anonymous spectators connected via `/watch`. Guard lines and sender feedback
remain on plain `send` because they are not DM content; only the message text itself is
suppressed. The override uses the engine's per-write broadcast suppression seam
(`sendPrivate`) rather than a filter pass after the fact.

Install this pack when the game has a live audience that must not see player DMs. Omit
it when admin oversight via tell snooping is desired; the same engine seam then delivers
the opposite policy with no code change.

The pack declares a hard dependency on `@tapestry/core: ^0.1.10` and requires
`engine: >=0.1.22`. Registration uses `override: true` per core's registration-policy
rules. (packages/@tapestry/viewer/pack.yaml:15-17)

## Behavior

- The pack registers two commands, `tell` (alias `t`) and `reply` (alias `r`), both with
  `override: true`, replacing the equivalents shipped by `@tapestry/core`.
  (packages/@tapestry/viewer/scripts/commands/tell.js:7-9;
  packages/@tapestry/viewer/scripts/commands/reply.js:5-7)

- Before sending, `tell` checks three world-property guards: `notell` on the sender
  blocks the command with "You cannot send tells right now."; `nochannels` on the sender
  blocks it with "You cannot use channels right now."; `notell` on the target blocks it
  with "[target.name] is not accepting tells right now." All three guard lines go through
  plain `actor.send`, not `sendPrivate`, so spectators can see them -- they are not DM
  content.
  (packages/@tapestry/viewer/scripts/commands/tell.js:22-35)

- The two DM-content writes in `tell` -- the confirmation to the sender and the message
  to the recipient -- both call `sendPrivate`, which suppresses broadcast to `/watch`
  spectators. This is the privacy seam.
  (packages/@tapestry/viewer/scripts/commands/tell.js:37-38)

- GMCP is sent to the recipient via `tapestry.gmcp.send` after the `sendPrivate` calls.
  Because GMCP goes directly to a specific client rather than through the broadcast tap,
  it is private regardless of whether `sendPrivate` or `send` was used for the text
  output.
  (packages/@tapestry/viewer/scripts/commands/tell.js:39)

- After a successful tell, two world properties are updated: `last_tell_from` on the
  target (set to the sender's entity ID) and `last_tell_to` on the sender (set to the
  target's player ID). These track the conversation for the `reply` shortcut.
  (packages/@tapestry/viewer/scripts/commands/tell.js:41-42)

- `reply` resolves the `last_tell_from` property on the actor to find the target; if no
  property exists, it returns "You have no one to reply to." If the player is no longer
  online (not found in `getOnlinePlayers()`), it returns "That player is no longer
  online." The reply target does not persist across sessions (the property is not
  restored on login -- the help text states it resets each session).
  (packages/@tapestry/viewer/scripts/commands/reply.js:18-36;
  packages/@tapestry/viewer/help/reply.yaml:13-16)

- `reply` checks `notell` on the actor before sending. It does NOT re-check `nochannels`
  or `notell` on the target at reply time; those checks are only in `tell`.
  (packages/@tapestry/viewer/scripts/commands/reply.js:38-41)

- The two DM-content writes in `reply` use `sendPrivate` with the same suppression
  policy as `tell`. Guard lines use plain `actor.send`.
  (packages/@tapestry/viewer/scripts/commands/reply.js:43-44)

- UNVERIFIED: The `sendPrivate` method is the engine's per-write broadcast suppression
  seam. The spec asserts it suppresses output to `/watch` spectators on a per-call
  basis. This behavior is described in source comments and help text but the engine
  implementation is not present in this repository for direct verification.
  (packages/@tapestry/viewer/scripts/commands/tell.js:1-4;
  packages/@tapestry/viewer/pack.yaml:6-10)

- The help documents for both commands carry `override: true`, matching the command
  registrations, so they replace the core help entries in the help system.
  (packages/@tapestry/viewer/help/tell.yaml:2;
  packages/@tapestry/viewer/help/reply.yaml:2)

- Both help entries explicitly state to users that spectators watching via `/watch` do
  not see tell or reply content.
  (packages/@tapestry/viewer/help/tell.yaml:13-14;
  packages/@tapestry/viewer/help/reply.yaml:13-14)

- The pack sets `load_order: 10` and `validation: strict`.
  (packages/@tapestry/viewer/pack.yaml:19-20)

- The policy contrast: when `@tapestry/viewer` is NOT installed and `@tapestry/core`
  runs its own tell/reply (which use plain `send`), spectators on `/watch` see DM
  content. This is the classic snoop-MUD behavior. The viewer pack flips the policy
  using the same engine seam. (packages/@tapestry/viewer/pack.yaml:6-10)

## Rejected and Reverted

- None on record.

## Change Log

- None on record.
