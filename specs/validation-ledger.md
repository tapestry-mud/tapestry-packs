---
capability: validation-ledger
last-updated: 2026-06-13
---

# specs validation ledger

## Overview

Adjudication record for `/backfill-specs` Validate-mode passes over this repo's capability
specs. One line per finding: date, file, finding, verdict (fixed / below-bar / not-real), and
a one-line why. A finding with a verdict here is settled unless new evidence names why the
verdict was wrong. Read before judging; never re-report an adjudicated finding as new.

Severity floor (pinned): BLOCKER = an anchor that does not support its claim; a wrong behavior
statement; a leak past the repo's visibility rules; a contract lint failure. Everything else
(style, phrasing, marginal boundary, nice-to-have anchors whose claims are verifiable anyway)
is BELOW-BAR: logged here, never looped.

Stopping rule: validated when two consecutive passes produce zero NEW blockers.

## Behavior

Adjudication findings are recorded in the Findings table below. A row with a settled verdict
is closed unless new evidence overrides it. (specs/README.md)

## Findings

| Date | File | Finding | Verdict | Why |
|------|------|---------|---------|-----|
| 2026-06-13 | socials.md | "The 90 socials registered at runtime" but socials.yaml has 91 `- name:` entries | fixed | Wrong count (BLOCKER); enumerated list was already complete at 91, only the prose number was wrong. Changed 90 -> 91. |
| 2026-06-13 | socials.md | Claim "all other message fields use global regex replacement" is false | fixed | BLOCKER. init.js:32 (self) and :41 (targeted) player-facing messages use single literal `.replace('$n','You')`; only the *_room/*_victim fields are global. Rewrote bullet to the first-person-vs-third-person split. |
| 2026-06-13 | core-economy.md | Shop listing "total line width of 50 characters" | fixed | BLOCKER. shop.js:104 sets dots = 50 - name - price, so name+dots+price = 50; with the 2-space indent and 2 flanking spaces the rendered line is 54. Reworded to describe the 50-char name+price span and 54-char rendered line. |
| 2026-06-13 | core-groups.md | `follow.started` claimed to carry a `reason` field | fixed | BLOCKER. groups.js:175-178 publishes follow.started with followerId+leaderId only; only follow.ended (142,206,266,280) carries reason. Split the bullet into started (no reason) and ended (reason: command/nofollow/cleanup). |
| 2026-06-13 | viewer.md | Anchor pack.yaml:19-20 for "load_order: 10 and validation: strict" | fixed | BLOCKER. Lines 19-20 are a blank line + `content:`; actual values are validation at :14, load_order at :18. Repointed anchor to :18 and :14. The claim itself was true. |
| 2026-06-13 | core-navigation.md | Door format quote "open\|closed\|closed, locked" | not-real | The `\|` enumerates the three door states open / closed / "closed, locked" (look.js:245-247); the comma inside the third option is not a duplicate "closed". Claim is correct. |
| 2026-06-13 | core-progression.md | Level-up message shows a period after the flavor text | not-real | The period comes from the fallback flavor strings ("Your skills improve." / "Your magical power grows.", progression.js:31/57), not added by the format; default behavior matches the spec example. |
| 2026-06-13 | core-navigation.md | Movement-blocked quote uses "resting/sleeping" not a literal string | below-bar | movement.js:32 builds the message from restState ('resting' or 'sleeping'); the "/" denotes the dynamic slot and conveys both runtime values. Behavior accurate; marginal phrasing. |
| 2026-06-13 | tinkers.md | recipe-arg error quote omits "Type 'recipes' to see your book." | below-bar | recipes-table.js:95 first sentence matches the quote verbatim (X = token placeholder); the omitted second sentence is supplementary guidance. Truncated representative quote. |
| 2026-06-13 | tinkers.md | craft knowledge-gate / deficit quotes truncated | below-bar | Quoted prefixes are verbatim at craft.js; full messages add trailing guidance. Representative quotes. |
| 2026-06-13 | core-combat.md | flee.prevented quote "feet won't move!" not in the room message | below-bar | Phrase is verbatim in the player message (output.js:106); the room message paraphrases ("can't move!"). The bullet's behavior claim and quote are accurate for what they cite. |
| 2026-06-13 | core-admin.md | loaditem reports "Unknown item template", spec says "Unknown template" | below-bar | Both fail-silent with a near-identical message; the claim's intent (no world message, reports unknown template) holds. Minor string imprecision. |
| 2026-06-13 | core-admin.md | "23 admin-gated commands (plus three aliases)" vs 25 commands / 2 aliases | below-bar | Count slightly off; does not change any behavior claim. Inventory-style miscount. |
| 2026-06-13 | core-init.md | Several anchors point to the first line of multi-entry blocks; decay-events.js:6 vs message at :8 | below-bar | All claims verifiable at or beside the cited line; anchors land on the right block/condition. Anchor-precision only. |
| 2026-06-13 | core-inventory.md | read.js last-charge message paraphrased/truncated | below-bar | Cited line is correct; quoted text is a truncation of the full string. Representative quote. |
| 2026-06-13 | core-progression.md | death_penalty anchor :43 points at the closing brace; value is at :44 | below-bar | Off by one; the claim (0.1) is correct and adjacent. Anchor-precision only. |
| 2026-06-13 | biomes.md | Anchor :13-14 omits line 12 where `validation: strict` sits | below-bar | Claim is true and verifiable; anchor covers the dependency lines but not the adjacent validation line. Anchor-precision only. |
| 2026-06-13 | builder.md | Spec says "Reset interval (seconds)"; code label is "Reset interval (s)" | below-bar | Descriptive (non-quoted) field name; minor abbreviation difference. |
| 2026-06-13 | example-pack.md | pack.yaml version anchor 8-13 omits the version line (2); guide keyword quotes representative | below-bar | All facts (version 0.1.9, deps, keyword responses) correct; anchor range and quotes are imprecise but verifiable. |
| 2026-06-13 | viewer.md | Help-text claim says both entries state "tell or reply content" | below-bar | tell.yaml says "tell content", reply.yaml says "reply content"; each states only its own command. Paraphrase. |

## Rejected and Reverted

- None on record.

## Change Log
