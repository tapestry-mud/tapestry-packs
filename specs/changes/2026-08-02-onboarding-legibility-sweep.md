---
release: unreleased
specs: [core-progression.md, core-admin.md, oracle.md]
---

# Onboarding Legibility Sweep

## Why

Three defects found by playing the public Threadwalker instance with a scripted player and
reading the transcript rather than the code.

**`score` printed `Hunger: null (0%)`.** The sustenance row was appended unconditionally,
but sustenance belongs to `@tapestry/survival`. A game that does not load that pack has no
`sustenance` property at all, so the tier expression evaluated to JS `null` and the panel
rendered the word.

**`help` listed `admin (7 topics)` to a level-1 player.** Help visibility is per topic, not
per category: `HelpService` compares the topic's own `role` against the player's tier. Seven
topics sat in the `admin` category without declaring `role`, so they were role-less and
visible to everyone -- and their count kept the whole category in the index. Each of the
seven says "this command requires admin privileges" in its own body, so the omission was an
authoring slip, not a decision.

**Starter abilities were granted with no way to use them.** The guide taught KICK and BASH
with flavour lines that said a skill had been learned but never how to spend it. Over the
rest of that run the player used neither. A granted skill whose syntax is never stated is
the same as no skill.

Also fixed while in the guide: `deliverProvisions` returned in total silence when the area
context was not resolvable yet, so an ask made too early got no response at all -- not even
an acknowledgement. Measured once as a HELLO six seconds after arrival doing nothing, with
the identical HELLO twelve seconds later outfitting normally. The player has no way to tell
that from "this NPC does not respond to that word" and no reason to try again.

## What

`score` pushes the sustenance section only when the property is present, so a game without
survival simply has no Hunger row.

The seven ungated `admin`-category help topics now declare `role: "admin"`, matching the
other admin topics. `badinput` gained one too; it is `hidden: true` and so was never listed,
but the role is the real gate. The `admin` category no longer appears in a plain player's
help index.

Each starter ability carries a `use` line alongside its flavour, printed immediately after
it -- `(type KICK <target> during a fight)` and the same for BASH.

`deliverProvisions`'s two early returns now route through a shared `askAgain`, so the guide
always answers the ask: "The pattern is still settling. Say HELLO again in a moment." The
underlying timing question -- why the area context is sometimes unresolvable seconds after
the player arrives -- is not answered here, and is worth its own look; this only makes the
window recoverable instead of silent.
