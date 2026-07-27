// commands/oracle-admin.ts - TEMPORARY admin/scenario harness for Task 5's split
// (bakeTemplate / startRun / template open-flip), written because Task 5 lands before
// Tasks 6 (the `tapestry` board -> startRun) and 7 (the `mint` bench -> bakeTemplate,
// including `mint flip`) build their real player-facing commands. This file exists so
// the stack-critical telnet scenario (tests/smoke/oracle-run-start.md, spec 3.1's
// determinism claim) can drive the real bakeTemplate/startRun functions end-to-end
// instead of asserting against a stand-in. It is NOT the shipped UX - Task 6/7 own
// that surface; this stays only as an admin debug fallback once they land (or gets
// deleted then, Travis's call).
//
//   oracle-admin bake <idea|-> <name|-> <bandFloor> <bandCap> <sizeBand> <deathMode> <forcedSeed|->
//   oracle-admin flip <templateId>          (setTemplateState -> "open"; stands in for `mint flip`)
//   oracle-admin start <templateId> <level> (startRun; ADMIN/BUILDER ONLY - see below)
//   oracle-admin whoami                     (debug: actor.roomId vs the engine's true
//                                            getEntityRoomId - the diagnostic that found the
//                                            missing authoring.createPack(RUN_NAMESPACE) call)
//   oracle-admin room                       (self-report YOUR current room - id/name/desc/exits
//                                            PLUS occupant NPC stats, atomically in one command -
//                                            no cross-player admin lookup, so it sidesteps
//                                            whatever gap `at`/`whereis` have resolving a
//                                            just-teleported player's occupancy in a
//                                            freshly-minted runtime area, and no two-command
//                                            gap for a wandering mob to slip through)
//   oracle-admin activerun                  (self-report YOUR oracle_active_run composite,
//                                            Task 13: proves the pointer clears on leave/recall
//                                            teardown without a separate `inspect`/property
//                                            command whose args-resolve gap already bit `room`)
//   oracle-admin arealive <templateId>      (Task 13: recomputes YOUR run's area id from the
//                                            template's seed + your own entityId - the SAME
//                                            formula startRun uses - then reports whether
//                                            authoring.getArea() still finds it. A static
//                                            scenario file cannot hardcode the run area id
//                                            (its hash half comes from the engine-generated
//                                            entityId, unknown at write time), so this
//                                            self-contained check stands in for a scenario
//                                            asserting against core's `inspect area <id>`
//                                            with a literal id - same underlying engine call.)
//
// bake/flip/start require admin/builder privilege (mirrors commands/solo.ts's escape hatch) -
// every subcommand that calls a MUTATING production function (bakeTemplate/setTemplateState/
// startRun) is gated. Review finding 2 (fix-plan pass on Task 5): `start` was originally left
// open to any connected player, which let any player bypass the intended tapestry_unlocked
// progression gate Task 6's real board will enforce - fixed here. whoami/room stay open; they
// are harmless read-only self-reports used only for scenario assertions and debugging.
//
// ASCII; braces on all control flow.

import * as tapestry from "@tapestry/engine";
import { bakeTemplate, startRun, simpleHash } from "../area-gen.js";
import { setTemplateState, getTemplate } from "../template-registry.js";

function isAdmin(actor: any): boolean {
    return actor.hasRole("admin") || actor.hasRole("builder");
}

function orNull(tok: string | undefined): string | null {
    if (!tok || tok === "-") { return null; }
    return tok;
}

tapestry.commands.register({
    name: "oracle-admin",
    aliases: [],
    roles: ["player"],
    args: { target: { type: "text", required: false } },
    handler: function (actor, resolved) {
        const raw = resolved.target ? String(resolved.target).trim() : "";
        const tokens = raw ? raw.split(/\s+/) : [];
        const sub = tokens.length > 0 ? tokens[0].toLowerCase() : "";

        if (sub === "bake") {
            if (!isAdmin(actor)) {
                actor.send("Admin/builder only.\r\n");
                return;
            }
            if (tokens.length < 8) {
                actor.send("Usage: oracle-admin bake <idea|-> <name|-> <bandFloor> <bandCap> <sizeBand> <deathMode> <forcedSeed|->\r\n");
                return;
            }
            const idea = orNull(tokens[1]);
            const name = orNull(tokens[2]);
            const bandFloor = parseInt(tokens[3], 10);
            const bandCap = parseInt(tokens[4], 10);
            const sizeBand = tokens[5];
            const deathMode = tokens[6] === "unraveling" ? "unraveling" : "grind";
            const seedTok = orNull(tokens[7]);
            const forcedSeed = seedTok !== null ? (parseInt(seedTok, 10) >>> 0) : null;
            bakeTemplate(actor, idea, name, bandFloor, bandCap, sizeBand, deathMode, forcedSeed);
            return;
        }

        if (sub === "flip") {
            if (!isAdmin(actor)) {
                actor.send("Admin/builder only.\r\n");
                return;
            }
            if (tokens.length < 2) {
                actor.send("Usage: oracle-admin flip <templateId>\r\n");
                return;
            }
            const ok = setTemplateState(tokens[1], "open");
            actor.send(ok ? ("Opened " + tokens[1] + ".\r\n") : ("No such template: " + tokens[1] + "\r\n"));
            return;
        }

        if (sub === "start") {
            if (!isAdmin(actor)) {
                actor.send("Admin/builder only.\r\n");
                return;
            }
            if (tokens.length < 3) {
                actor.send("Usage: oracle-admin start <templateId> <level>\r\n");
                return;
            }
            const level = parseInt(tokens[2], 10);
            startRun(actor, tokens[1], level, true);
            return;
        }

        if (sub === "whoami") {
            const trueRoomId = (tapestry as any).world.getEntityRoomId ? (tapestry as any).world.getEntityRoomId(actor.entityId) : "(no getEntityRoomId)";
            actor.send("WHOAMI-ACTOR-ROOMID: [" + actor.roomId + "]\r\n");
            actor.send("WHOAMI-TRUE-ROOMID: [" + trueRoomId + "]\r\n");
            return;
        }

        if (sub === "room") {
            // Room facts AND occupant stats in ONE atomic report (single command execution,
            // no intervening tick) - a trash/elite mob can wander off between two SEPARATE
            // commands (confirmed: an ambient mob left the room between a move and a
            // follow-up inspect in exploration), which would make a two-command room+mobs
            // sequence flaky for the scenario's cross-level stat comparison.
            const roomId = actor.roomId;
            const name = (tapestry as any).world.getRoomName(roomId);
            const desc = (tapestry as any).world.getRoomDescription ? (tapestry as any).world.getRoomDescription(roomId) : "";
            const exits = (tapestry as any).world.getRoomExitsById ? (tapestry as any).world.getRoomExitsById(roomId) : [];
            actor.send("SELF-ROOM-ID: " + roomId + "\r\n");
            actor.send("SELF-ROOM-NAME: " + (name || "") + "\r\n");
            actor.send("SELF-ROOM-DESC: " + (desc || "") + "\r\n");
            actor.send("SELF-ROOM-EXITS: " + (exits && exits.length ? exits.join(",") : "(none)") + "\r\n");

            const occupants = (tapestry as any).world.getRoomOccupants ? (tapestry as any).world.getRoomOccupants(roomId) : [];
            if (!occupants || occupants.length === 0) {
                actor.send("SELF-ROOM-MOBS: (none)\r\n");
                return;
            }
            let any_npc = false;
            for (let i = 0; i < occupants.length; i++) {
                const o = occupants[i];
                if (o.type !== "npc") { continue; }
                any_npc = true;
                const e = (tapestry as any).world.getEntity(o.id);
                const s = (e && e.stats) ? e.stats : {};
                actor.send(
                    "SELF-ROOM-MOB: " + o.name + " | hp=" + (s.hp || 0) + " | max_hp=" + (s.max_hp || 0) +
                    " | str=" + (s.strength || 0) + " | dex=" + (s.dexterity || 0) + "\r\n"
                );
                // Task 8 loot-band spot check: report the mob's carried loot
                // (frozen via mintItemInstance) so a scenario can compare the
                // rolled ac/damage_dice/rarity of the SAME room's drop across
                // two dialed-level runs from the same template - same mint
                // decision + item type (level-independent rng), different
                // stat band (effectiveItemLevel bends by level).
                const carried = (e && e.inventory) ? e.inventory : [];
                for (let j = 0; j < carried.length; j++) {
                    const item = (tapestry as any).world.getEntity(carried[j].id);
                    const p = (item && item.properties) ? item.properties : {};
                    const ac = p.ac ? JSON.stringify(p.ac) : "-";
                    const dmg = p.damage_dice !== undefined ? p.damage_dice : "-";
                    actor.send(
                        "SELF-ROOM-MOB-ITEM: " + o.name + " | " + (item ? item.name : carried[j].name) +
                        " | rarity=" + (p.rarity || "-") + " | ac=" + ac + " | damage_dice=" + dmg + "\r\n"
                    );
                }
            }
            if (!any_npc) {
                actor.send("SELF-ROOM-MOBS: (none)\r\n");
            }
            return;
        }

        if (sub === "activerun") {
            const raw = (tapestry as any).world.getProperty(actor.entityId, "oracle_active_run") || "";
            actor.send("ACTIVE-RUN: [" + raw + "]\r\n");
            return;
        }

        if (sub === "arealive") {
            if (tokens.length < 2) {
                actor.send("Usage: oracle-admin arealive <templateId>\r\n");
                return;
            }
            const tpl = getTemplate(tokens[1]);
            if (!tpl) {
                actor.send("No such template: " + tokens[1] + "\r\n");
                return;
            }
            // Same derivation as startRun's runSlug (area-gen.ts) - deterministic per
            // template seed + caller entityId, so this recomputes rather than needing
            // any id passed in or stashed.
            const runSlug = "oracle-run-" + (tpl.seed >>> 0).toString(16) + "-" + simpleHash(String(actor.entityId)).toString(16);
            const a = (tapestry as any).authoring.getArea ? (tapestry as any).authoring.getArea(runSlug) : null;
            const exists = !!(a && a.exists);
            actor.send("AREA-LIVE: " + (exists ? "true" : "false") + " (" + runSlug + ")\r\n");
            return;
        }

        actor.send("Usage: oracle-admin bake|flip|start|whoami|room|activerun|arealive ...\r\n");
    },
});
