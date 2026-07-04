---
release: 0.5.0
specs: [oracle.md]
---

# Oracle Stage B - threat-tier ladder + mobs six-axis

## Why

The stage-A playtest verdict was "rooms feel unique and interconnected" - and combat did not
keep up. Every spawn was the same flat weighted pick on the same hostile template; the ambient
boss clock repeat-fired ("the head chef" three times in one school run); landmarks were
navigational rewards with nothing waiting at them; Travis explicitly asked for an
aggro/non-aggro MIX so walking a run is not one uniform wall of teeth. Two stage-A prose gaps
also rode along: one fixed afar sentence per landmark appended verbatim (17/41 rooms, worst
6x), and the name deck exhausted at 41 rooms (8 duplicate clusters). Separately, `solo` was
still admin/builder-gated - useless for playtesters on fresh characters, who also spawn naked
with no way to gear up.

## What

Threat-tier ladder over the existing bands: trash stays the chamber ambient loop; every
charged-band room now spawns a swell-capable epithet-named ELITE (apex-forced selection,
lighter-dialed `swell-elite` template - boss-as-data); every landmark room spawns its one
named MINIBOSS on first visit, identity frozen in the landmarks table (`boss-<i>` rows, LLM
`boss_name`/`boss_desc`; 0.4.0-era tables synthesize "the keeper of the <landmark>"); the
ambient clock becomes the ONE wandering big-boss pity timer - fires at most once per run,
never in landmark or entry-adjacent rooms. Mob tables are six-axis: a shared MOB-1 menace
DEGREE table (skulker/common/hunter/apex) selects WHICH creature through the band resolver,
bent by the room band (CONTEXT); every trash spawn draws a dice-owned band-weighted
DISPOSITION (aggro/neutral/timid) that picks among three temperament templates - the engine's
`base_disposition` seam; per-instance overrides and flee-on-sight do not exist engine-side
(documented; timid = neutral + wimpy 65). Balance stays dice-owned via new elite/miniboss
master-balance rows. Frozen 0.4.0 tables keep working everywhere: flat mob tables select
exactly as before, single-afar/boss-less landmark tables parse with synthesis - proven by
booting and walking a 0.4.0-generated fixture on 0.5.0 code. Ride-alongs: 3 afar variants per
landmark + a distance-banded reference gate (0.45 near / 0.25 far) + a 4-tail direction deck;
sector qualifier decks (2-3 each) + a mint-time no-replacement name deal (23-room run: zero
duplicate names, was 3 pairs). `solo` opens to players (`roles: ["player"]` - listing
privilege roles re-gates the command; stage-E per-player rate limit is the documented ship
dependency), and a PLAYTEST-SCAFFOLDING starter kit (weapon + head/hands/feet at area min
level, once per player per area via a `grants` table) lets a brand-new character fight the
ladder - stages C/E own the real design.
