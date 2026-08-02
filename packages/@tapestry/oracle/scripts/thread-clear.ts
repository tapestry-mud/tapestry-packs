// thread-clear.ts - what happens when the lair boss dies (spec 6.1 exit 1, 6.2, 6.3).
//
// THE ORDER IS THE POINT (spec 6.2):
//   1. the kill resolves and prints  (core's combat.kill handler, already shipped)
//   2. the payout is ROLLED, silently - nothing is sent and nothing is granted
//   3. cutscene.play opens the hold and runs beats composed around that roll, so
//      the reveal is the LAST beat
//   4. onComplete grants the payout and the thread, teleports to the portal, and
//      tears the instance down
//
// Step 2 used to read "boss loot drops and is granted (the engine's own death drop,
// already shipped)." That was the only engine claim in this plan with no file:line
// behind it, and it was false: core's death.ts builds a corpse container and
// auto-awards only gold, so the boss's roll sat in a corpse that step 4 deleted
// about seven seconds later. Nobody ever looted a boss. See clear-payout.ts.
//
// The thread grant belongs in onComplete and NOT a line earlier, or the player reads
// "you receive a thread" and then watches a cutscene about receiving a thread.
// weaver-opener.js:66 is the worked precedent, and its own comment warns the teleport
// belongs in onComplete and never at cutscene start.
//
// WHERE IT RETURNS YOU (spec 6.3): the portal you came out of, not the corridor's
// arrival room. You have just been handed that thread and its own door is the only
// place it works; putting you anywhere else means the first thing the game does
// after a clear is make you walk.
//
// AN UNRAVELING CLEAR RUNS THE SAME SEQUENCE (spec 6.4). The differences are what it
// pays and what it grants: it pays the pinnacle roll and grants no thread, because
// you already hold the one that got you in. Beats differ per mode; the ordering
// rules do not.
//
// RUNTIME CHECK (Task 8): does a rebooted run reaching this handler still carry
// AreaState.runLevel? Yes, always - population.ts's player.direction.moved hook
// calls ensureAreaContext(toRoom) on every room entry (area-context.ts:109), and the
// player must walk into the boss's room to fight it, so ensureAreaContext has always
// already reconstructed this run's AreaState (including a numeric runLevel -
// area-context.ts:159) before the kill can happen. getAreaState(runAreaId) below is
// therefore never undefined and its runLevel is never missing at this point; the
// typeof guard is a defensive last resort, not a live path.
//
// ASCII; braces on all control flow.

import * as tapestry from "@tapestry/engine";
import { grantThread } from "./thread-item.js";
import { rollClearPayout, grantClearPayout, payoutRevealBeat } from "./clear-payout.js";
import { teardownRun } from "./area-gen.js";
import { getTemplate } from "./template-registry.js";
import { getAreaState } from "./area-state.js";

// Beats are the OPENING of the sequence; the closing beat is composed at runtime
// from what the payout roll came up with (payoutRevealBeat), so the reveal is the
// last thing the player reads rather than a line that spoils the beat before it.
// The old UNRAVELING_BEATS literally predicted a payout line the player had already
// been sent - the S2-8 class of bug this task's own header warns about.

const NORMAL_OPENING = [
    { text: "The last of it comes apart in your hands, thread by thread.", pauseAfter: 25 },
    { text: "For a moment the whole place is only pattern, and you can see where it was tied.", pauseAfter: 25 },
    { text: "One strand does not go with the rest. It is still warm. You take it.", pauseAfter: 20 },
];

const UNRAVELING_OPENING = [
    { text: "It falls, and this time the place does not knit itself back up behind it.", pauseAfter: 25 },
    { text: "The pattern holds still, all the way down, and lets you look at it.", pauseAfter: 25 },
];

/** v1 authors no rare table, so nothing pays rare yet (spec 6.4: "plus whatever
 *  rare table the week carries"). The lever is a number, not a code path - when a
 *  week authors one, this reads off the portal instead of the constant. */
const RARE_CHANCE = 0;

function activeRun(entityId: string): { runAreaId: string; mode: string } | null {
    const raw = (tapestry as any).world.getProperty(entityId, "oracle_active_run") || "";
    if (raw === "") {
        return null;
    }
    const parts = String(raw).split("|");
    if (!parts[0]) {
        return null;
    }
    return { runAreaId: parts[0], mode: parts.length > 1 && parts[1] ? parts[1] : "normal" };
}

(tapestry as any).events.on("mob.death", function (evt: any): void {
    try {
        const data = (evt && evt.data) ? evt.data : {};
        if (String(data.templateId || "").indexOf("swell-boss") === -1) { return; }
        const killerId = data.killerId;
        if (!killerId) { return; }
        const run = activeRun(String(killerId));
        if (!run) { return; }

        const templateId = String((tapestry as any).world.getProperty(killerId, "oracle_run_template") || "");
        const returnRoomId = String((tapestry as any).world.getProperty(killerId, "oracle_run_return") || "");
        const tpl = templateId ? getTemplate(templateId) : undefined;
        const templateName = tpl ? tpl.name : "the weave";
        const isUnraveling = run.mode === "unraveling";
        const runAreaId = run.runAreaId;

        // STEP 1 of the ordering rule: roll SILENTLY. Nothing is sent, nothing is
        // granted, no inventory changes. The roll exists only so the beats can be
        // composed around it. An Unraveling clear rolls the same way and gets the
        // pinnacle tier out of it, which is what folds the old payPinnacle into this
        // one path instead of leaving it sitting beside the cutscene.
        const state = getAreaState(runAreaId);
        const runLevel = state && typeof state.runLevel === "number" ? state.runLevel : 1;
        const payout = rollClearPayout(runAreaId, String(killerId), runLevel, run.mode, RARE_CHANCE);

        const opening = isUnraveling ? UNRAVELING_OPENING : NORMAL_OPENING;
        const beats = opening.concat([{ text: payoutRevealBeat(payout), pauseAfter: 0 }]);

        (tapestry as any).cutscene.play(String(killerId), beats, { skippable: true }, function (): void {
            try {
                // STEP 2: grant, in onComplete, never a line earlier. Both payouts
                // land here - the gear for either mode, and the thread for a normal
                // clear only (an Unraveling clear grants no thread, because you
                // already hold the one that got you in, spec 6.4).
                grantClearPayout(String(killerId), payout);
                if (!isUnraveling && templateId) {
                    const granted = grantThread(String(killerId), templateId, templateName, runAreaId);
                    if (granted) {
                        (tapestry as any).world.send(killerId, "You are carrying the thread of " + templateName + ".\r\n");
                        recordThreadEarned(String(killerId), templateId);
                        // threadwalker's frontier.js listens for this to re-point recall_room_id
                        // at the player's new frontier the moment threads_earned changes. There
                        // is no generic property-change event in the engine (SetProperty only
                        // notifies IPropertyObserver in-process; EntityStatusBroadcaster turns
                        // that into entity.<topic>.changed, and only for keys explicitly
                        // registered observable via PropertyRegistry.RegisterObservable, which
                        // threads_earned is not), so this explicit publish is the seam instead
                        // of a listener for an event that would never fire. events.publish sets
                        // no sourceEntityId, so the player id travels in data.entityId.
                        (tapestry as any).events.publish("thread.earned", { entityId: String(killerId), templateId: templateId });
                    }
                }
                // STEP 3: home, then teardown. The payout is already an instanced
                // entity on the player file by now, so the sweep cannot take it
                // (Decision C: teardown never touches instanced items).
                const home = returnRoomId !== ""
                    ? returnRoomId
                    : ((tapestry as any).world.getProperty(killerId, "recall_room_id") || "tapestry-core:recall");
                (tapestry as any).world.teleportEntity(killerId, home);
                (tapestry as any).returnaddress.clear(String(killerId));
                teardownRun(String(killerId), runAreaId);
                (tapestry as any).world.sendRoomDescription(killerId);
            } catch (_err) {
                // graceful: never throw out of a cutscene callback.
            }
        });
    } catch (_err) {
        // graceful: never throw into the engine loop.
    }
});

/** The ordered, permanent list of threads this player has earned (spec 7.5). It is
 *  what the corridor's frontier lookup reads, and it is deliberately separate from
 *  the carried ITEM: the item is the key you walk through the door with, the list is
 *  the progression readout, and dropping the key must not un-earn the week. */
function recordThreadEarned(playerId: string, templateId: string): void {
    try {
        const raw = (tapestry as any).world.getProperty(playerId, "threads_earned") || "[]";
        let list: string[] = [];
        try {
            const parsed = JSON.parse(String(raw));
            if (Array.isArray(parsed)) { list = parsed; }
        } catch (_parseErr) {
            list = [];
        }
        if (list.indexOf(templateId) !== -1) { return; }
        list.push(templateId);
        (tapestry as any).world.setProperty(playerId, "threads_earned", JSON.stringify(list));
    } catch (_err) {
        // graceful: a failed record never blocks the exit.
    }
}
