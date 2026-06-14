# core-abilities

## Overview

The ability subsystem in `@tapestry/core` provides three categories of learnable
abilities: active skills (combat and buff moves triggered by command), active spells
(cast via the `cast` command), and passive abilities (applied automatically by the
engine via hook points). Abilities are registered with `tapestry.abilities.register`,
tracked per-entity as a proficiency percentage (0-100), and capped by a trainer tier
system. The subsystem ships six bundled active abilities (three skills, four spells),
six passive abilities, and one dedicated rescue skill, plus the `practice`, `tree`,
`skills`, `spells`, and `cast` player commands.

---

## Behavior

### Ability registration

- Active skills are registered with `tapestry.abilities.register` using `type: "active"`
  and `category: "skill"`. The registration object includes `id`, `name`, `resource_cost`,
  `proficiency_gain_chance`, `can_target` (an array of allowed target types), optional
  `effect` block, and a `handler` function called when the ability fires.
  (packages/@tapestry/core/scripts/abilities/skills.js:3)
- Active spells use the same registration shape with `category: "spell"`. Bundled spells
  carry `metadata` for damage or heal dice and a `damage_type` or heal indicator.
  (packages/@tapestry/core/scripts/abilities/spells.js:55)
- Passive abilities use `type: "passive"` and carry a `metadata` block with
  `passive_mode` ("binary" or "scaling") and a `hook` name that determines when
  the engine applies them.
  (packages/@tapestry/core/scripts/abilities/passives.js:5)

### Bundled active skills

- `battle_stance` (resource_cost: 15) targets self, applies an effect with
  `duration: 25`, the `battle_stance` flag, and a +3 Strength stat modifier.
  (packages/@tapestry/core/scripts/abilities/skills.js:3-26)
- `kick` (resource_cost: 10) targets NPCs. Damage is `2d6+4` scaled by
  `prof / 100` plus the user's `damage_roll` stat, then reduced by the
  target's AC for "bash" damage type.
  (packages/@tapestry/core/scripts/abilities/skills.js:29-58)
- `bash` (resource_cost: 15) targets NPCs. Damage formula matches kick
  but uses `2d8+6`. On a hit it additionally applies a `stunned` effect
  with `duration: 1` and the `stunned` flag to the target.
  (packages/@tapestry/core/scripts/abilities/skills.js:60-95)

### Bundled active spells

- `fireball` (resource_cost: 25) targets NPCs. Base damage `3d8+10` is
  scaled by `prof / 100` and adds `caster.stats.channeling_damage`, then
  subtracts `target.stats.channeling_protection` (floored at 1).
  (packages/@tapestry/core/scripts/abilities/spells.js:55-86)
- `cure_light` (resource_cost: 15) targets self or players. Heal is
  `2d8+5` scaled by `prof / 100` (minimum 1). If the target has the
  `no_heal` tag the cast is blocked with a message and no HP is restored.
  (packages/@tapestry/core/scripts/abilities/spells.js:88-120)
- `blindness` (resource_cost: 20) targets NPCs or players. The target
  rolls a "spell" saving throw; on success the spell is resisted. On
  failure an effect is applied with `duration: 30`, the `is_blind` flag,
  and a -4 Dexterity modifier.
  (packages/@tapestry/core/scripts/abilities/spells.js:122-150)
- `shield` (resource_cost: 30) targets self or players. Applies an effect
  with `duration: 60` and the `shield` flag; no stat modifiers are
  included in the bundled definition.
  (packages/@tapestry/core/scripts/abilities/spells.js:152-175)
- `poison` (resource_cost: 20) targets NPCs or players. Saving throw
  check mirrors blindness. On failure applies `duration: 40` with flags
  `is_poisoned` and `no_heal` and a -3 Strength modifier.
  (packages/@tapestry/core/scripts/abilities/spells.js:177-205)

### Passive abilities

- `dodge` and `parry` are binary passives (mode "binary") on the
  `defensive_check` hook. Both cap at 40% maximum chance and have a
  `proficiency_gain_chance` of 0.04.
  (packages/@tapestry/core/scripts/abilities/passives.js:5-23)
- `second_attack` is binary on the `extra_attack` hook, caps at 75%,
  gain chance 0.03.
  (packages/@tapestry/core/scripts/abilities/passives.js:25-33)
- `enhanced_damage` is a scaling passive on the `stat_modifier` hook. It
  modifies `damage_roll` with a `max_bonus` of 50 and caps at 100%.
  (packages/@tapestry/core/scripts/abilities/passives.js:37-45)
- `fast_healing` is scaling on the `regen_modifier` hook. It modifies
  `regen_hp` with a `max_bonus` of 10 and caps at 100%.
  (packages/@tapestry/core/scripts/abilities/passives.js:47-55)
- `second_cast` is binary on the `extra_attack` hook with `category:
  "spell"`, caps at 65%, gain chance 0.02.
  (packages/@tapestry/core/scripts/abilities/passives.js:57-65)
- When a dodge or parry fires the engine emits `combat.evade`. The
  handler in passives.js sends first- and second-person evade messages
  using `tapestry.abilities.getDisplayName` to derive the verb, and
  broadcasts a third-person message to the rest of the room.
  (packages/@tapestry/core/scripts/abilities/passives.js:68-84)

### Rescue skill

- `rescue` is an active skill with `resource_cost: 0`, `can_target:
  ["player"]`, and `proficiency_gain_chance: 0.05`.
  (packages/@tapestry/core/scripts/abilities/rescue.js:3-12)
- The `rescue` command is only visible to entities that already have a
  positive proficiency in "rescue" (checked via `visibleTo`).
  (packages/@tapestry/core/scripts/abilities/rescue.js:18-21)
- Rescue requires both the rescuer and the target to share the same
  `group_id` world property; rescuing non-group members is rejected.
  (packages/@tapestry/core/scripts/abilities/rescue.js:41-45)
- The target must be in combat; if not, the command returns an error
  message.
  (packages/@tapestry/core/scripts/abilities/rescue.js:47-49)
- Success chance is `Math.max(10, prof * 0.8)`, capped at 100% when
  proficiency is 100. Failure on the roll sends "You fail to rescue."
  (packages/@tapestry/core/scripts/abilities/rescue.js:52-59)
- On a successful roll, rescue iterates the target's combatants. For each
  NPC attacker in the same room it calls `setPrimaryTarget` to redirect
  aggro to the rescuer and `engage` to pull the rescuer into combat. If
  no NPC combatants are found the rescue still fails.
  (packages/@tapestry/core/scripts/abilities/rescue.js:62-85)
- A 4-second cooldown (`rescue_cooldown_until` world property) is set
  at the start of each attempt, before the success/fail roll, regardless
  of outcome.
  (packages/@tapestry/core/scripts/abilities/rescue.js:55)
- On success the event `rescue.success` is published with `rescuerId`
  and `targetId`.
  (packages/@tapestry/core/scripts/abilities/rescue.js:90-93)

### Cast command

- The `cast` command (alias `c`) accepts a free-text argument
  `spell_and_target`. Spell resolution uses `resolveSpellName`, which
  first tries an exact underscore-joined multi-word match against the
  entity's learned proficiencies (longest prefix first), then falls back
  to prefix matching against learned spell IDs and display names.
  (packages/@tapestry/core/scripts/abilities/spells.js:14-53; packages/@tapestry/core/scripts/abilities/spells.js:208-275)
- If no target is supplied and the caster is in combat, the first active
  combatant is used as the implicit target (for spells that can target NPCs).
  (packages/@tapestry/core/scripts/abilities/spells.js:244-253)
- If no target is resolved and the spell has `"self"` in `can_target`,
  the caster becomes the target automatically.
  (packages/@tapestry/core/scripts/abilities/spells.js:255-258)
- Casting a spell against a target other than self engages combat if the
  caster is not already in it; if `combat.engage` does not return "ok"
  the cast is blocked.
  (packages/@tapestry/core/scripts/abilities/spells.js:265-271)
- The resolved spell is queued via `tapestry.abilities.queue`.
  (packages/@tapestry/core/scripts/abilities/spells.js:273)

### Practice command

- `practice` (alias `prac`) with no arguments displays all learned
  abilities in a panel showing name, proficiency percentage, and current
  tier cap label (Novice/Apprentice/Journeyman/Master).
  (packages/@tapestry/core/scripts/commands/practice.js:8-46)
- Tier thresholds: Novice = cap 25, Apprentice = cap 50, Journeyman =
  cap 75, Master = cap 100. These labels come from the `tierLabel`
  helper, which uses `<= 25 / <= 50 / <= 75 / else` checks.
  (packages/@tapestry/core/scripts/commands/practice.js:1-6)
- The panel footer defaults to "Seek out a trainer to unlock higher
  proficiency." If `tapestry.training.findTrainerInRoom` returns a
  result the footer names the trainer and shows the syntax.
  (packages/@tapestry/core/scripts/commands/practice.js:31-38)
- The no-argument path also sends a `Response.Training.Practice` GMCP
  event with trainer name, trainer tier, and a full abilities array
  including `cap`, `nextTier`, and display name before rendering the
  panel.
  (packages/@tapestry/core/scripts/commands/practice.js:72-94)
- `practice [skill]` resolves the input against learned ability IDs by
  matching the keyword against the ability's `command_name` field (if
  set), the short ID (part after the last `:`), or the full ID.
  (packages/@tapestry/core/scripts/commands/practice.js:98-110)
- The actual proficiency increment is delegated to `tapestry.training.practice`;
  on `result.kind === 'success'` the player is told "<trainer> teaches you
  more of <ability>."; otherwise `result.message` is sent verbatim.
  (packages/@tapestry/core/scripts/commands/practice.js:112-119)
- The trainer tier progression map is `novice -> apprentice -> journeyman
  -> master -> null` (null meaning fully capped).
  (packages/@tapestry/core/scripts/commands/practice.js:65-70)

### Tree command

- `tree` with no argument (or an optional `filter` keyword) renders the
  player's class path from `tapestry.classes.get(classId)`, where
  `classId` comes from the `class` world property.
  (packages/@tapestry/core/scripts/commands/tree.js:1-15)
- The panel title is "<ClassName> Path" with the player's current level
  (via `tapestry.progression.getLevel(entityId, classDef.track)`) in the
  right column.
  (packages/@tapestry/core/scripts/commands/tree.js:50-54)
- Abilities in the class path are sorted into "Learned" (prof > 0) and
  "Upcoming" (prof absent or 0). Learned rows show the ability's
  `short_name || name`, the unlock level (`Lvl N`), and current
  proficiency. Upcoming rows show name, level, and an `[unlocked_via]`
  tag if the path entry provides one.
  (packages/@tapestry/core/scripts/commands/tree.js:24-89)
- An "Also learned" section lists abilities the player knows that are not
  part of their class path.
  (packages/@tapestry/core/scripts/commands/tree.js:37-46; packages/@tapestry/core/scripts/commands/tree.js:92-106)
- The footer always reads "tree skills / tree spells to filter".
  (packages/@tapestry/core/scripts/commands/tree.js:108-111)
- The `skills` and `spells` commands (proficiency panel) are registered
  in `list.js`, not `tree.js`. A comment in tree.js notes that
  re-registering them here would be a boot error.
  (packages/@tapestry/core/scripts/commands/tree.js:130-133)

### Skills and spells listing commands

- `skills` iterates `tapestry.abilities.getLearnedAbilities(entityId)`,
  filters by `def.category === 'skill'`, and renders a panel titled
  "Your Skills" with a name column, a 20-character progress bar
  (`type: 'progress'`, max 100), and a right-aligned percentage column.
  (packages/@tapestry/core/scripts/abilities/list.js:1-35)
- `spells` follows the same pattern filtered by `category === 'spell'`
  under the title "Your Spells".
  (packages/@tapestry/core/scripts/abilities/list.js:37-71)
- Both commands return "You don't know any skills/spells." and exit early
  when the filtered list is empty.
  (packages/@tapestry/core/scripts/abilities/list.js:15-18; packages/@tapestry/core/scripts/abilities/list.js:51-54)

### Ability output events

- On `ability.missed` the source entity receives "Your <abilityName>
  fails to connect!" and the target (if different) receives "<sourceName>'s
  <abilityName> fails to connect!" Both are wrapped in `<combat_miss>` tags.
  (packages/@tapestry/core/scripts/abilities/output.js:2-18)
- On `ability.fizzled` four `reason` values produce distinct messages:
  `insufficient_resources` -> "You don't have enough energy for <name>.";
  `cooldown` -> "You aren't ready to <name> yet.";
  `no_proficiency` -> "You don't know how to <name>.";
  `not_in_combat` -> "You aren't in combat."
  (packages/@tapestry/core/scripts/abilities/output.js:21-43)

---

## Rejected and Reverted

- None on record.

---

## Change Log

- None on record.
