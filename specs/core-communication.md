---
capability: core-communication
last-updated: 2026-06-13
---

# core-communication

Player-to-player messaging and broadcast channels in @tapestry/core.

## Overview

The core communication capability provides seven player-facing commands for
sending messages at varying scopes: room-local speech and emote, private
player-to-player tells and replies, game-wide gossip, area-scoped yell, and an
admin-only immortal channel (immtalk). All channels relay a `Comm.Channel` GMCP
event to relevant recipients, either directly in the command handler or via the
`communication.message` event listener in `communication-gmcp.js`. Channel
access is guarded by per-entity mute properties (`no_channels`, `no_tell`,
`no_emote`). The `say` command is aliased to `'`; `emote` is aliased to `:`;
`immtalk` is aliased to `;`.

## Behavior

### say

- `say` is registered with alias `'`, category `communication`, and roles
  `player` and `mob`. (packages/@tapestry/core/scripts/commands/say.ts:2-6)
- The actor sees `You say "<highlight>...</highlight>"` and all other players in
  the same room see `<Name> says "<highlight>...</highlight>"` via
  `tapestry.world.sendToRoomExcept`. (packages/@tapestry/core/scripts/commands/say.ts:12-17)
- `say` publishes two events: `communication.message` with `channel: "say"` and
  `player.say` carrying `playerId`, `playerName`, `roomId`, and `text`.
  (packages/@tapestry/core/scripts/commands/say.ts:19-33)
- The `communication.message` listener in `communication-gmcp.js` resolves
  recipients as all player entities in `data.roomId` and sends `Comm.Channel`
  with `{ channel, sender, senderId, source, text }` to each, skipping the
  sender. (packages/@tapestry/core/scripts/core/communication-gmcp.ts:5-31)
- The command registration also carries `gmcp: { channel: 'say', prependSender: false }`;
  whether the framework uses this field to send an additional GMCP event is
  UNVERIFIED: no command-framework code was found in this repo consuming that field.
  (packages/@tapestry/core/scripts/commands/say.ts:7)

### emote

- `emote` is registered with alias `:`, category `communication`, and roles
  `player` and `mob`. (packages/@tapestry/core/scripts/commands/emote.ts:2-6)
- The actor is blocked if the entity property `no_emote` is truthy; they receive
  `You cannot emote right now.` (packages/@tapestry/core/scripts/commands/emote.ts:12-15)
- Both the actor and all other room occupants see `<Name> <message>` -- no
  quotation marks are added. (packages/@tapestry/core/scripts/commands/emote.ts:17-22)
- `emote` publishes `communication.message` with `channel: "emote"` and
  `text` set to the fully-prefixed string `<Name> <message>`.
  (packages/@tapestry/core/scripts/commands/emote.ts:24-32)
- `communication-gmcp.js` routes emote the same as say: room-scoped recipient
  list, sender excluded. (packages/@tapestry/core/scripts/core/communication-gmcp.ts:5-9)
- The command registration carries `gmcp: { channel: 'emote', prependSender: false }`;
  whether this triggers an additional framework-level GMCP send is UNVERIFIED.
  (packages/@tapestry/core/scripts/commands/emote.ts:7)

### tell

- `tell` is registered with alias `t`, category `social`, roles `player` only.
  The `target` arg type is `player`, resolving to an online player.
  (packages/@tapestry/core/scripts/commands/tell.ts:2-9)
- Blocked if the sender has property `no_tell`; error: `You cannot send tells
  right now.` (packages/@tapestry/core/scripts/commands/tell.ts:15-18)
- Blocked if the sender has property `no_channels`; error: `You cannot use
  channels right now.` (packages/@tapestry/core/scripts/commands/tell.ts:20-23)
- Blocked if the target has property `no_tell`; error: `<Name> is not accepting
  tells right now.` (packages/@tapestry/core/scripts/commands/tell.ts:25-28)
- Sender sees `<tell>You tell <Name>: "<message>"</tell>`; target sees
  `<tell><Name> tells you: "<message>"</tell>`.
  (packages/@tapestry/core/scripts/commands/tell.ts:30-31)
- A `Comm.Channel` GMCP event with `{ channel: 'tell', sender, text }` is sent
  directly to the target (not the sender).
  (packages/@tapestry/core/scripts/commands/tell.ts:32)
- After delivery, `last_tell_from` is set on the target and `last_tell_to` is
  set on the sender, enabling `reply`. (packages/@tapestry/core/scripts/commands/tell.ts:34-35)

### reply

- `reply` is registered with alias `r`, category `social`, roles `player` only.
  (packages/@tapestry/core/scripts/commands/reply.ts:2-6)
- Reads `last_tell_from` from the actor's entity properties. If absent, sends
  `You have no one to reply to.` and returns.
  (packages/@tapestry/core/scripts/commands/reply.ts:13-17)
- Validates that the stored player ID is still online via
  `tapestry.world.getOnlinePlayers()`. If not found, sends `That player is no
  longer online.` (packages/@tapestry/core/scripts/commands/reply.ts:19-31)
- Blocked if the sender has `no_tell`; error: `You cannot send tells right now.`
  (packages/@tapestry/core/scripts/commands/reply.ts:33-36)
- On success, sends the same tell formatting and GMCP event as `tell`, and
  updates `last_tell_from` / `last_tell_to` on both parties.
  (packages/@tapestry/core/scripts/commands/reply.ts:38-43)
- Note: `reply` does not check `no_channels` on the sender, unlike `tell`.
  (packages/@tapestry/core/scripts/commands/reply.ts:33-36 vs packages/@tapestry/core/scripts/commands/tell.ts:20-23)

### gossip

- `gossip` is registered with no alias, category `social`, roles `player` and
  `mob`. (packages/@tapestry/core/scripts/commands/gossip.ts:2-5)
- Blocked if the actor has `no_channels`; error: `You cannot use channels right
  now.` (packages/@tapestry/core/scripts/commands/gossip.ts:12-15)
- Sender sees `<gossip>You gossip: "<message>"</gossip>`; all other online
  players see `<gossip><Name> gossips: "<message>"</gossip>` via
  `tapestry.world.sendToAll` with the sender excluded.
  (packages/@tapestry/core/scripts/commands/gossip.ts:17-21)
- A `Comm.Channel` GMCP event with `{ channel: 'gossip', sender, text }` is
  sent to every online player including the sender.
  (packages/@tapestry/core/scripts/commands/gossip.ts:23-27)

### yell

- `yell` is registered with no alias, category `social`, roles `player` and
  `mob`. (packages/@tapestry/core/scripts/commands/yell.ts:2-5)
- The message is uppercased and an exclamation mark is appended before display.
  (packages/@tapestry/core/scripts/commands/yell.ts:11-12)
- Sender sees `You yell "<yell><UPPER>!</yell>"`. Other players in the same
  room see `<Name> yells "<yell><UPPER>!</yell>"` via `actor.sendToRoom`.
  (packages/@tapestry/core/scripts/commands/yell.ts:13-14)
- The command description states "Shout a message to the entire area" but the
  in-room text output uses `actor.sendToRoom`, which is room-scoped in all other
  command usages in this codebase. No `sendToArea` API exists in the repo.
  Whether room residents across the whole area also receive the text message is
  UNVERIFIED: the implementation does not show an area-wide text sweep.
  (packages/@tapestry/core/scripts/commands/yell.ts:3,14)
- A `Comm.Channel` GMCP event with `{ channel: 'yell', sender, text }` (using
  the original, un-uppercased text) is sent to every online player.
  (packages/@tapestry/core/scripts/commands/yell.ts:17-19)
- `yell` has no `no_channels` gate; no mute property check is performed.
  (packages/@tapestry/core/scripts/commands/yell.ts:1-21)

### immtalk

- `immtalk` is registered with alias `;`, category `social`, and `admin: true`;
  no explicit `roles` array is declared, so role access is handled by the admin
  flag. (packages/@tapestry/core/scripts/commands/immtalk.ts:2-7)
- Blocked if the actor has `no_channels`; error: `You cannot use channels right
  now.` (packages/@tapestry/core/scripts/commands/immtalk.ts:11-14)
- Delivery iterates all online players and sends only to those where
  `tapestry.world.hasRole(target.id, 'admin')` is true. The sender receives the
  message if they also hold the admin role.
  (packages/@tapestry/core/scripts/commands/immtalk.ts:17-26)
- Message format: `<imm>[Imm] <Name>: "<message>"</imm>`.
  (packages/@tapestry/core/scripts/commands/immtalk.ts:22)
- A `Comm.Channel` GMCP event with `{ channel: 'imm', sender, text }` is sent
  to each admin recipient. (packages/@tapestry/core/scripts/commands/immtalk.ts:23)

### GMCP relay (communication-gmcp.js)

- Listens on `communication.message`. For channels `say` and `emote`, recipients
  are all player entities in the event's `roomId`; for `tell` or `whisper`,
  recipient is the single `targetId`; for all other channels, recipients are all
  online players. (packages/@tapestry/core/scripts/core/communication-gmcp.ts:4-16)
- Sends `Comm.Channel` with payload `{ channel, sender, senderId, source, text }`
  to each recipient, skipping any recipient whose `id` matches `data.senderId`
  when `data.source === "player"`.
  (packages/@tapestry/core/scripts/core/communication-gmcp.ts:18-31)
- `tell` and `reply` do not publish `communication.message`; they call
  `tapestry.gmcp.send` directly in the handler, so the event listener is not
  involved for those channels. (packages/@tapestry/core/scripts/commands/tell.ts:32,
  packages/@tapestry/core/scripts/commands/reply.ts:40)
- `gossip`, `yell`, and `immtalk` similarly bypass the event listener and call
  `tapestry.gmcp.send` inline. (packages/@tapestry/core/scripts/commands/gossip.ts:23-27,
  packages/@tapestry/core/scripts/commands/yell.ts:17-19,
  packages/@tapestry/core/scripts/commands/immtalk.ts:23)

## Rejected and Reverted

- None on record.

## Change Log

- None on record.
