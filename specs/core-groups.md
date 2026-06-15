---
capability: core-groups
last-updated: 2026-06-13
---

# core-groups

Party system, follow mechanics, and clan channel in @tapestry/core.

## Overview

The groups capability covers three related but independent features:

1. **Groups (parties)** -- a runtime party system that lets players team up,
   share gold from kills, and use a private group chat channel.
2. **Follow mechanics** -- automatic room-following that moves a follower
   alongside a leader, with combat and rest-state blocks.
3. **Clan channel** -- a persistent social channel scoped to a tag-based clan
   membership, separate from the runtime group system.

Groups and follow state are ephemeral: they live in world properties and are
cleared on logout, death, and teleport. Clan membership is tag-based and
persists across sessions; the `clan` command provides only a broadcast channel,
not clan management (create/join/leave have no implementation in this file).

## Behavior

### Group ID and formation

- Group IDs are generated with `'grp_' + Date.now().toString(36) + '_' + random`
  and are created lazily: a group ID is allocated only when a player accepts an
  invitation, not when an invitation is sent. (packages/@tapestry/core/scripts/commands/groups.js:1-2)
- When the first `group accept` fires, if the inviter has no existing group, a
  new group is created and both the inviter and the accepter are added together.
  (packages/@tapestry/core/scripts/commands/groups.js:393-398)
- Each member tracks three world properties: `group_id`, `group_leader`, and
  `group_join_time` (set to `Date.now()` at join time).
  (packages/@tapestry/core/scripts/commands/groups.js:47-50)
- Group membership is resolved at runtime by scanning online players for a
  matching `group_id`; there is no persistent member list.
  (packages/@tapestry/core/scripts/commands/groups.js:21-32)

### Invitations

- `group invite [player]` requires the target to be online, not already in any
  group, and to have no existing pending invitation.
  (packages/@tapestry/core/scripts/commands/groups.js:340-369)
- An invitation stores `group_invite_from` and `group_invite_expires` on the
  target. The expiry window is 60 seconds (`Date.now() + 60000`).
  (packages/@tapestry/core/scripts/commands/groups.js:364-365)
- The inviter need not already be in a group at invitation time; the group is
  created on accept. (packages/@tapestry/core/scripts/commands/groups.js:393-396)
- `group decline` clears both invite properties and notifies the inviter if
  still online. (packages/@tapestry/core/scripts/commands/groups.js:412-425)

### Group command subcommands

- The `group` command (alias `gr`) dispatches on a `subcommand` keyword. With no
  subcommand it shows the group roster. Recognized subcommands: `invite`,
  `accept`, `decline`, `leave`, `kick`, `promote`, `disband`.
  (packages/@tapestry/core/scripts/commands/groups.js:315-337)
- `group kick [player]` is leader-only and requires the target to share the
  same `group_id`. The kicked player is removed and all remaining members are
  notified. (packages/@tapestry/core/scripts/commands/groups.js:473-511)
- `group promote [player]` is leader-only. It updates `group_leader` for every
  current member to the promoted player's ID and notifies all members.
  (packages/@tapestry/core/scripts/commands/groups.js:513-551)
- `group disband` is leader-only. It removes all members from the group,
  notifies non-leaders, and publishes `group.disbanded`.
  (packages/@tapestry/core/scripts/commands/groups.js:553-572)

### Leader departure and auto-promotion

- When the leader uses `group leave`, the member with the lowest `group_join_time`
  among the remaining members is promoted automatically to leader.
  (packages/@tapestry/core/scripts/commands/groups.js:74-90)
- If `promoteNextLeader` returns null (no remaining members), no promotion
  broadcast is sent; the group is effectively dissolved.
  (packages/@tapestry/core/scripts/commands/groups.js:448-470)
- When a non-leader leaves, remaining members receive a leave notice but no
  leader change occurs. (packages/@tapestry/core/scripts/commands/groups.js:466-470)

### Group roster display

- The `group` command with no arguments renders a panel with a title row showing
  member count and a data row per member showing: name (with `(leader)` suffix
  for the leader), combat level (`Lv`), current HP, max HP, and `[here]` or
  `[elsewhere]` depending on whether the member shares the actor's room.
  (packages/@tapestry/core/scripts/commands/groups.js:574-606)
- Level is read from `tapestry.progression.getLevel(memberId, 'combat')`.
  (packages/@tapestry/core/scripts/commands/groups.js:587)

### gtell -- group broadcast

- `gtell` (alias `gt`) sends a message to all online members of the actor's
  group regardless of location. The actor must be in a group.
  (packages/@tapestry/core/scripts/commands/groups.js:610-632)
- Messages are formatted as `<group>[Group] Name: "text"</group>`.
  (packages/@tapestry/core/scripts/commands/groups.js:629)
- `sendToGroup` delivers to every member including the sender.
  (packages/@tapestry/core/scripts/commands/groups.js:58-63)

### Gold split on kill

- On `combat.kill`, if the killer is in a group, the victim's gold is split
  equally (floor division) among the killer plus all same-room group members.
  (packages/@tapestry/core/scripts/commands/groups.js:636-668)
- The split only fires when there are at least two recipients (killer + at least
  one same-room group member). Solo kills in a group receive no split logic.
  (packages/@tapestry/core/scripts/commands/groups.js:651-653)
- Integer remainder goes to the killer. All recipients see the message "amount
  gold coins are divided among the group."
  (packages/@tapestry/core/scripts/commands/groups.js:657-667)
- `getSameRoomGroupMembers` excludes the actor from the member list, so the
  killer is added separately as `recipients[0]`.
  (packages/@tapestry/core/scripts/commands/groups.js:34-44, 647-650)

### Follow command

- `follow [player]` sets `following` on the actor to the target's entity ID.
  The target must be online and must not have `no_follow` set.
  (packages/@tapestry/core/scripts/commands/groups.js:155-178)
- `follow stop` clears `following` and publishes `follow.ended` with
  `reason: 'command'`. (packages/@tapestry/core/scripts/commands/groups.js:128-147)
- A player cannot follow themselves.
  (packages/@tapestry/core/scripts/commands/groups.js:150-153)
- Follow is independent of group membership; a player can follow someone
  without being in their group.

### Automatic follow movement

- On `player.direction.moved`, all online players whose `following` property
  matches the mover and who are in the mover's departure room are moved in the
  same direction. (packages/@tapestry/core/scripts/commands/groups.js:219-259)
- A follower in a rest state (`resting` or `sleeping`) is silently skipped.
  (packages/@tapestry/core/scripts/commands/groups.js:239-240)
- A follower in combat receives the message "You cannot follow while in combat."
  and is skipped. (packages/@tapestry/core/scripts/commands/groups.js:242-245)
- On successful move, the follower receives a room description, disposition is
  triggered, and departure/arrival messages are broadcast to the old and new
  rooms. (packages/@tapestry/core/scripts/commands/groups.js:250-258)

### nofollow toggle

- `nofollow` is a toggle. First use sets `no_follow = true` and immediately
  drops all current followers by clearing their `following` property and
  publishing `follow.ended` with `reason: 'nofollow'`.
  (packages/@tapestry/core/scripts/commands/groups.js:195-214)
- Second use clears `no_follow` and the player is again accepting followers.
  (packages/@tapestry/core/scripts/commands/groups.js:192-194)
- Note: the help file (nofollow.yaml) states nofollow "only blocks new follow
  attempts" and does not drop existing followers -- this contradicts the code,
  which does drop existing followers immediately on enable.
  (packages/@tapestry/core/scripts/commands/groups.js:196-213,
  packages/@tapestry/core/help/nofollow.yaml:17-18)

### Cleanup on logout, death, and teleport

- On `player.logout`, `no_follow` is cleared, `clearFollowState` is called, and
  if the player was in a group, `handleGroupLeave` is called on their behalf
  (with a no-op `send`). (packages/@tapestry/core/scripts/commands/groups.js:289-297)
- On `player.death`, only `clearFollowState` is called; the player is not
  removed from their group. (packages/@tapestry/core/scripts/commands/groups.js:299-304)
- On `player.teleported`, only `clearFollowState` is called; the player is not
  removed from their group. (packages/@tapestry/core/scripts/commands/groups.js:306-311)
- `clearFollowState` clears the entity's own `following` property and also
  iterates all online players to drop any who were following the entity,
  notifying them "Your leader is gone. You stop following."
  (packages/@tapestry/core/scripts/commands/groups.js:262-287)

### Events published

- `group.created` -- published when the first accept creates a new group.
  (packages/@tapestry/core/scripts/commands/groups.js:405)
- `group.member.joined` -- published on every successful accept.
  (packages/@tapestry/core/scripts/commands/groups.js:407-409)
- `group.member.left` -- published on leave (reason: 'leave').
  (packages/@tapestry/core/scripts/commands/groups.js:442-444)
- `group.member.kicked` -- published on kick.
  (packages/@tapestry/core/scripts/commands/groups.js:508-510)
- `group.member.promoted` -- published on manual promote and on auto-promote
  after leader departure. (packages/@tapestry/core/scripts/commands/groups.js:548-550, 461-464)
- `group.disbanded` -- published on disband and on leader-leave when no
  successor can be found.
  (packages/@tapestry/core/scripts/commands/groups.js:464, 571)
- `follow.started` -- published when a follow begins, carrying `followerId` and
  `leaderId` only (no `reason` field).
  (packages/@tapestry/core/scripts/commands/groups.js:175-178)
- `follow.ended` -- published when a follow ends, carrying `followerId`, `leaderId`,
  and a `reason` field whose value is 'command' (explicit unfollow), 'nofollow'
  (the target turned nofollow on), or 'cleanup' (logout, death, or teleport).
  (packages/@tapestry/core/scripts/commands/groups.js:142-147;
  packages/@tapestry/core/scripts/commands/groups.js:206-211;
  packages/@tapestry/core/scripts/commands/groups.js:266-270;
  packages/@tapestry/core/scripts/commands/groups.js:280-284)

### Clan channel

- The `clan` command is a communication-only channel; there are no subcommands
  for creating, joining, or leaving clans in clan.js. Clan membership is
  determined entirely by entity tags of the form `clan:*`.
  (packages/@tapestry/core/scripts/commands/clan.js:1-40)
- At send time the command scans all of the actor's tags for the first one that
  starts with `'clan:'` and then broadcasts to all online players who share that
  exact tag. (packages/@tapestry/core/scripts/commands/clan.js:12-36)
- The actor must not have the `nochannels` property set.
  (packages/@tapestry/core/scripts/commands/clan.js:26-29)
- Messages are formatted as `<clan>[Clan] Name: "text"</clan>` and also trigger
  a `Comm.Channel` GMCP event with `channel: 'clan'`.
  (packages/@tapestry/core/scripts/commands/clan.js:35-36)
- A player with multiple `clan:*` tags will broadcast only to members of the
  first matching tag (iteration order of `getEntityTags`). UNVERIFIED: whether
  the tag array has a defined order.

## Rejected and Reverted

- None on record.

## Change Log

- None on record.
