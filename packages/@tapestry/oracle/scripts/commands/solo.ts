// commands/solo.ts - the solo run surface.
//
//   solo                 trigger the oracle_solo flow (generate + enter a run)
//   solo list            list the runs you created
//   solo discard         discard the run you are standing in
//   solo discard <n>     discard run #n from `solo list`
//   solo discard <id>    discard ANY area by full id (admin/builder only)
//
// Open to PLAYERS as of 0.5.0 (Travis 2026-07-04): solo is the game loop, not
// a builder tool. ROLE SEMANTICS (engine CommandRouter): "player"/"mob" are
// actor-type roles; anything else (admin, builder) is a PRIVILEGE gate - if
// any privilege role is listed the actor must hold one. So the open form is
// exactly ["player"]; admins qualify because they dispatch as source "player",
// and the admin escape hatch checks privilege INSIDE the handler.
//
// SHIP DEPENDENCY (documented, not built here): opening solo publicly needs
// the per-player rate limit from the self-contained-run design (stage E /
// v3 async-notify lifecycle) before a server has real strangers on it.
//
// The engine router is single-token, so `list` / `discard` are the first token
// of one declared text arg, not separate commands.
//
// ASCII; braces on all control flow.

import * as tapestry from "@tapestry/engine";
import { listOwnedRuns, writeOwnedRuns, type OwnedRun } from "../owned-runs.js";

tapestry.commands.register({
    name: "solo",
    aliases: [],
    roles: ["player"],
    args: { target: { type: "text", required: false } },
    handler: function (actor, resolved) {
        const raw = resolved.target ? String(resolved.target).trim() : "";
        const tokens = raw ? raw.split(/\s+/) : [];
        const sub = tokens.length > 0 ? tokens[0].toLowerCase() : "";

        if (sub === "") {
            actor.send("Starting solo area generation. Type 'cancel' at any prompt to abort.\r\n");
            tapestry.flows.trigger(actor.entityId, "oracle_solo");
            return;
        }

        if (sub === "list") {
            soloList(actor);
            return;
        }

        if (sub === "discard") {
            soloDiscard(actor, tokens.slice(1).join(" "));
            return;
        }

        actor.send("Usage: solo | solo list | solo discard [n]\r\n");
    },
});

// ---------------------------------------------------------------------------
// Lazy prune: an admin `solo discard <areaId>` can tear down an area whose owner
// is offline, and nothing can reach that player's file. The stale entry is
// harmless and is collected here, the one place it can be observed.
// ---------------------------------------------------------------------------

function prunedRuns(playerId: string): OwnedRun[] {
    const runs = listOwnedRuns(playerId);
    const kept: OwnedRun[] = [];
    for (let i = 0; i < runs.length; i++) {
        if (areaExists(runs[i].areaId)) {
            kept.push(runs[i]);
        }
    }
    if (kept.length !== runs.length) {
        writeOwnedRuns(playerId, kept);
    }
    return kept;
}

function areaExists(areaId: string): boolean {
    const area = (tapestry as any).area && (tapestry as any).area.get(areaId);
    if (!area) {
        return false;
    }
    if (typeof area.exists === "boolean") {
        return area.exists;
    }
    return true;
}

// ---------------------------------------------------------------------------
// solo list
// ---------------------------------------------------------------------------

function soloList(actor: any): OwnedRun[] {
    const runs = prunedRuns(actor.entityId);
    if (runs.length === 0) {
        actor.send("You have no solo runs. Type 'solo' to roll one.\r\n");
        return runs;
    }

    let out = "Your solo runs:\r\n";
    out += "  #  " + pad("NAME", 28) + pad("LEVELS", 10) + "ROOMS\r\n";
    for (let i = 0; i < runs.length; i++) {
        const r = runs[i];
        const levels = r.levelRange[0] + "-" + r.levelRange[1];
        const index = pad(String(i + 1), 3);
        out += "  " + index + pad(clip(r.name, 27), 28) + pad(levels, 10) + String(r.roomCount) + "\r\n";
    }
    out += "\r\n'solo discard <n>' removes a run. 'solo discard' removes the one you stand in.\r\n";
    actor.send(out);
    return runs;
}

// soloDiscard is a stub - Task 11 implements it for real.
function soloDiscard(actor: any, _arg: string): void {
    actor.send("Not implemented yet.\r\n");
}

// Unique names: a bare `pad` would collide with another pack's same-named global
// in the shared pack realm (the registry command learned this the hard way).
function pad(str: string, len: number): string {
    let s = String(str);
    while (s.length < len) {
        s += " ";
    }
    return s;
}

function clip(str: string, len: number): string {
    const s = String(str);
    if (s.length <= len) {
        return s;
    }
    return s.slice(0, len - 1) + ".";
}
