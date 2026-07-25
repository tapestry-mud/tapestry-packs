---
capability: core-progression
last-updated: 2026-07-25
---

# core-progression

XP tracks, leveling, training, character state, and quests in @tapestry/core.

## Overview

The progression system in `@tapestry/core` defines two XP tracks (combat and magic),
handles kill XP distribution and death penalties, provides the `train`, `practice`,
`score`, `affects`, `tree`, `rest`, `sleep`, `wake`, and `quests` player commands, and
manages rest states that affect regen. Tracks are registered at boot via
`tapestry.progression.registerTrack`; level-up stat grants fire automatically through
the track's `on_level_up` callback.

## Behavior

### XP Tracks

- Two tracks are registered at startup: `combat` and `magic`, each with `max_level: 50`
  and an identical XP curve of `Math.floor(100 * Math.pow(level, 1.3))` XP required to
  advance from the given level. (packages/@tapestry/core/scripts/progression/progression.ts:8-62)

- Both tracks carry `death_penalty: 0.1`, meaning 10% of within-level progress is lost
  on death. (packages/@tapestry/core/scripts/progression/progression.ts:15; packages/@tapestry/core/scripts/progression/progression.ts:43)

- The combat track's `on_level_up` callback grants +1 to two randomly chosen stats from
  `[str, int, wis, dex, con, luc]` (uniform distribution), plus +3 max_resource and
  +2 max_movement per level. `max_hp` is deliberately not granted -- see Level-up vitals
  (pure-gear HP) below. (packages/@tapestry/core/scripts/progression/progression.ts:16-35)

- The magic track's `on_level_up` callback draws from a weighted pool
  `[int, int, wis, wis, dex, luc]` (int and wis each appear twice, doubling their
  probability), then grants +5 max_resource and +1 max_movement per level. No `max_hp`
  grant -- see Level-up vitals (pure-gear HP) below.
  (packages/@tapestry/core/scripts/progression/progression.ts:45-61)

- On level-up, both tracks send a notification via `tapestry.notifications.enqueue` at
  priority 40 using the event key `level_up`. The message reads:
  `*** <flavor>. You are now level N! *** <gains>`. If the character's class defines
  `level_up_flavor` that string is used; otherwise a track-default fallback applies.
  (packages/@tapestry/core/scripts/progression/progression.ts:33-34; packages/@tapestry/core/scripts/progression/progression.ts:59-60)

- The `tree` command reads a class's `track` property to resolve which progression track
  controls class level for the ability path display. (packages/@tapestry/core/scripts/commands/tree.ts:14)

### Kill XP

- XP is awarded on the `combat.kill` event. No XP is given for killing players
  (`victim.type === "player"` guard). (packages/@tapestry/core/scripts/progression/progression.ts:73-83)

- Base XP for a kill uses the mob's `xp_value` property if set; otherwise falls back to
  `Math.floor(30 + (mobLevel * mobLevel * 2))` where `mobLevel` is read directly off the
  victim's `level` map property (`level.combat`, defaulting to 1 if the map or the
  `combat` key is absent). A live mob no longer carries a scalar `mob_level` property.
  (packages/@tapestry/core/scripts/progression/progression.ts:66-69; packages/@tapestry/core/scripts/progression/progression.ts:87-88)

- All player entities actively in combat with the killed mob are collected via
  `tapestry.combat.getCombatants(victimId)`; if none are found the killer is used as the
  sole recipient. (packages/@tapestry/core/scripts/progression/progression.ts:90-94)

- Same-room group members of any player combatant who share the victim's room are also
  added to the recipient list (deduplicated). This extends XP to grouped players present
  in the room even if they did not strike the mob. The member lookup uses
  `getSameRoomGroupMembers`, imported from `commands/groups.ts` (a native cross-file
  import that replaces the implicit shared-realm global the two files used to share).
  (packages/@tapestry/core/scripts/progression/progression.ts:2,109-123)

- Each eligible player receives XP scaled by `tapestry.progression.calculateMobXp` using
  the player's current combat level, the mob's level, and the base XP value. The result is
  multiplied by `tapestry.progression.groupShare(N)` where N is the total recipient count,
  then floored. (packages/@tapestry/core/scripts/progression/progression.ts:125-135)

- XP is granted to the `combat` track only via `tapestry.progression.grant(..., "combat", "kill")`.
  (packages/@tapestry/core/scripts/progression/progression.ts:134)

- When the source is `"kill"`, a `progression.xp.gained` listener sends the message
  `You gain N experience.` to the player using the `<experience>` tag.
  (packages/@tapestry/core/scripts/progression/progression.ts:141-151)

### Death Penalty

- On `player.death`, every registered track with `death_penalty > 0` deducts XP. The
  amount deducted is `Math.floor(progressInLevel * death_penalty)` where `progressInLevel`
  is `info.xp - info.currentLevelThreshold`. Loss cannot drop a player below the current
  level floor because only within-level progress is used as the base.
  (packages/@tapestry/core/scripts/progression/progression.ts:155-179)

- The loss message uses the `<death>` tag: `You lose N experience.`
  (packages/@tapestry/core/scripts/progression/progression.ts:173-175)

### Level-up vitals (pure-gear HP)

- Neither the combat nor the magic level-up track grants `max_hp`. Both grant `max_resource`
  and `max_movement` only; the `max_hp` grants were removed so player max HP comes from the flat
  race/class base plus gear modifiers, never a character-level grind. (The example classes'
  `max_hp` stat-growth terms were removed for the same reason.)
  (packages/@tapestry/core/scripts/progression/progression.ts:25;
  packages/@tapestry/core/scripts/progression/progression.ts:53)
- Character level therefore gates no survivability; it is a vanity number. A wear-level
  requirement is deliberately not implemented.

### train Command

- `train` (no argument) displays a panel titled "Your Attributes" listing all six base
  stats (strength, intelligence, wisdom, dexterity, constitution, luck) with current value
  and race stat cap, alongside the count of trains available from
  `tapestry.training.getTrainsAvailable`. Also sends a `Response.Training.Train` GMCP
  message with `trainsRemaining` and the current stat object.
  (packages/@tapestry/core/scripts/commands/train.ts:18-82)

- `train [stat]` accepts the stat name or its abbreviation/prefix and resolves it via a
  prefix-match table. Valid abbreviations: str, int, wis, dex, con, luc/luck.
  (packages/@tapestry/core/scripts/commands/train.ts:1-14)

- A successful train calls `tapestry.training.trainStat(entityId, statName)` and returns
  the text message from the result. The stat is raised by 1 point up to the race stat cap
  (cap enforcement is inside the engine's `trainStat` implementation, referenced by help
  text). On success a GMCP `Response.Training.Train` is sent with updated stats.
  (packages/@tapestry/core/scripts/commands/train.ts:91-110)

- The help file states trains are granted per level-up with the amount depending on class;
  the exact trains-per-level value is not encoded in these scripts.
  (packages/@tapestry/core/help/train.yaml:16-17)

### practice Command

- `practice` (alias `prac`) with no argument lists all learned abilities with proficiency
  percentage and cap tier label (Novice cap 25%, Apprentice cap 50%, Journeyman cap 75%,
  Master cap 100%). Sends `Response.Training.Practice` GMCP.
  (packages/@tapestry/core/scripts/commands/practice.ts:8-46; packages/@tapestry/core/scripts/commands/practice.ts:48-95)

- `practice [ability]` requires a trainer NPC in the same room. On success the trainer
  raises the player's proficiency with that ability via `tapestry.training.practice`.
  The ability argument is matched by command_name, short ID after the last colon, or full
  ability ID. (packages/@tapestry/core/scripts/commands/practice.ts:97-122)

### tree Command

- `tree` renders the class ability path split into "Learned" and "Upcoming" sections.
  Upcoming entries show the required level; learned entries show current proficiency.
  Abilities learned outside the class path appear in an "Also learned" section.
  (packages/@tapestry/core/scripts/commands/tree.ts:1-115)

- `tree skills` or `tree spells` filters the display to the given category.
  (packages/@tapestry/core/scripts/commands/tree.ts:117-128)

### score Command

- `score` renders a full character sheet panel containing: character name, all six
  attributes (str, int, wis, dex, con, luc), HP/resource/movement as current/max with
  progress bars, alignment value and bucket label, hunger tier (full >= 67%, hungry >= 34%,
  famished < 34%), gold, and all registered XP tracks (level, XP, XP-to-next, percentage
  through level). (packages/@tapestry/core/scripts/commands/score.ts:14-221)

- A `Response.Char.Score` GMCP message is sent before rendering, containing the full data
  set including race, class, primary level (from the first registered track), and the
  `xpTracks` array. (packages/@tapestry/core/scripts/commands/score.ts:48-73)

- When the terminal width is known and less than 62 columns, a compact single-column
  layout is used instead of the three-column layout. Width 0 (no wrap / unbounded) forces
  the full layout. (packages/@tapestry/core/scripts/commands/score.ts:80-81)

- The per-track progress percentage is computed as
  `Math.floor((progressInLevel / levelRange) * 100)` where `levelRange = xpToNext + progressInLevel`.
  At max level it shows 100%. (packages/@tapestry/core/scripts/commands/score.ts:98-105)

### affects Command

- `affects` (aliases `aff`, `effects`) lists all active effects from
  `tapestry.effects.getActive`. Each effect shows its name (or id fallback), duration in
  pulses (or "permanent" for remaining_pulses < 0), and is tagged `<buff>` or `<debuff>`
  based on whether the `harmful` flag is present in `effect.flags`.
  (packages/@tapestry/core/scripts/commands/affects.ts:1-61)

- If no effects are active, a panel with the message "You are not affected by anything."
  is shown. (packages/@tapestry/core/scripts/commands/affects.ts:11-20)

### Rest States

- The three rest states managed by `tapestry.rest` are `awake`, `resting`, and `sleeping`.
  (packages/@tapestry/core/scripts/commands/rest.ts:8-9; packages/@tapestry/core/scripts/commands/sleep.ts:9; packages/@tapestry/core/scripts/commands/wake.ts:8)

- `rest` blocks if the actor is already resting or sleeping, or is in combat.
  Sets state to `resting`. Room message: "[Name] sits down and rests."
  (packages/@tapestry/core/scripts/commands/rest.ts:9-25)

- `sleep` blocks if the actor is already sleeping, or is in combat. Setting state to
  `resting` first is not required; `sleep` transitions directly to `sleeping`. Room
  message: "[Name] lies down and sleeps."
  (packages/@tapestry/core/scripts/commands/sleep.ts:9-25)

- `wake` (alias `stand`) can be called from any non-awake state without a combat check.
  Sets state to `awake`. Room message: "[Name] wakes up and stands."
  (packages/@tapestry/core/scripts/commands/wake.ts:8-21)

- If combat begins while an entity is asleep or resting, the engine fires
  `entity.rest_state.changed` with `reason: 'combat'` and `newState: 'awake'`. The core
  listener sends: "You are attacked! You wake up!" using the `<alert>` tag.
  (packages/@tapestry/core/scripts/rest.ts:1-10)

- UNVERIFIED: Whether resting and sleeping grant different HP/resource/movement regen
  rates. The regen multiplier logic is not present in these pack scripts; it is presumably
  handled inside the engine layer.

### quests Command

- `quests` (alias `journal`) displays active quests from `tapestry.quests.getState`,
  showing each quest's name, type label, and objectives with current/required counts and
  progress bars for objectives with required > 1.
  (packages/@tapestry/core/scripts/commands/quests.ts:27-70)

- `quests [name]` or `quests [id]` shows the detail view for a matching active quest,
  including stage description, stage index / stage count, and full objective list.
  (packages/@tapestry/core/scripts/commands/quests.ts:72-123)

- `quests abandon [name]` calls `tapestry.quests.abandon(entityId, questId)` to drop a
  quest matched by name or questId substring.
  (packages/@tapestry/core/scripts/commands/quests.ts:125-142)

- The quest state object exposes `state.active`; there is no `state.completed` field
  accessed in this command -- completed quest history is not displayed.
  (packages/@tapestry/core/scripts/commands/quests.ts:28-29)

- UNVERIFIED: Whether completed quests are tracked at all, and whether any XP reward is
  granted on quest completion. No quest completion handler is present in the surveyed
  scripts.

## Rejected and Reverted

- None on record.

## Change Log

- 2026-07-25 [hub-threads-core](changes/2026-07-25-hub-threads-core.md) - pure-gear HP: level-up tracks no longer grant max_hp; HP is flat base plus gear only, character level gates nothing
- 2026-07-03 [vocabulary-consolidation](changes/2026-07-03-vocabulary-consolidation.md) - victim mob level read from the level.combat map instead of the scalar mob_level
- 2026-06-20 [pack-script-esm](changes/2026-06-20-pack-script-esm.md)
