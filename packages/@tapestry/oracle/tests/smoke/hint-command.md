# Hint Command

Task 12 fix round 1: proves the bare `hint` command (scripts/commands/hint.ts) produces
the IDENTICAL response to saying "hint" aloud to the guide. `hint.ts` re-dispatches through
`admin.executeAs(actor.entityId, "say hint")`, landing on the same `onSay` hook
(guide.ts:110-113) that answers a spoken "hint" - this scenario proves that end to end
against a live boot, not just by reading the source.

Rather than mint a full run just to get a guide NPC into a room (the oracle-mint-bench.md/
gear-carries-hp.md pattern), this uses core's admin `spawn` command
(core/scripts/commands/admin-spawn.ts, `spawn <template-id>` - admin-gated) to drop a guide
(`tapestry-oracle:guide`) directly into Gamemaster's own room. `spawn` places the mob in
the actor's CURRENT room, so Gamemaster ends up standing right next to it with no run,
no board, no teardown - the smallest setup that puts a live guide NPC and a live player in
the same room together.

Both the spoken form and the bare-command form are exercised against the SAME guide
instance, back to back, and each is asserted against the exact two-line response
`onSay` sends for a hint match (guide.ts:110-113). Task 20 has since reworded the
second line to explicitly name CONSIDER; this scenario asserts that current text
(final review fix: the assertions below were stale against the pre-Task-20 wording).

## Setup
- Players: Gamemaster

## Steps
1. Gamemaster: `spawn tapestry-oracle:guide`
2. Assert Gamemaster sees: `Spawned: a weathered guide`
3. Gamemaster: `say hint`
4. Assert Gamemaster sees: `Follow the roads - they run straight to the landmarks, and something worth fighting holds each one.`
5. Assert Gamemaster sees: `CONSIDER what you meet before you swing, and it will size things up for you. The deep chambers are not kind.`
6. Gamemaster: `hint`
7. Assert Gamemaster sees: `Follow the roads - they run straight to the landmarks, and something worth fighting holds each one.`
8. Assert Gamemaster sees: `CONSIDER what you meet before you swing, and it will size things up for you. The deep chambers are not kind.`
