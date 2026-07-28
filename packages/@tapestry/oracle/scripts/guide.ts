// guide.ts - the entry-room guide NPC (stage B.2).
//
// A friendly, non-attackable (no_kill) guide spawns at the entry room on area
// creation and hands over the starter provisions ON INTERACTION - the player
// SEES the handoff instead of the stage-B silent auto-grant. Two channels:
//   - starter kit: the existing grantStarterKit, gate unchanged (the frozen
//     "grants" oracle table, once per player per area, mark-first).
//   - starter abilities: kick + bash at novice-cap proficiency via the engine
//     abilities.learn seam (the same call core's admin-learn uses). The gate
//     is idempotency - only granted when ABSENT, so a player who trained past
//     25 is never clobbered.
//
// SAFE-ROOM SEPARATION (danger zone 2): the entry room's ambient-zero rule
// lives in tiers.ambientDensity (dice path); the guide rides this separate
// NPC spawn path. ensureGuideAt is presence-checked by template_id, so the
// creation spawn and the post-reboot respawn (spawnMob mobs are transient)
// can never double-spawn.
//
// Generic identity is deliberate: stage E owns the real onboarding design.
// ASCII; braces on all control flow.

import * as tapestry from "@tapestry/engine";
import { ensureAreaContext } from "./area-context.js";
import { getAreaState } from "./area-state.js";
import { grantStarterKit } from "./starter-kit.js";

export const GUIDE_TEMPLATE = "tapestry-oracle:guide";

/** Novice-tier cap: immediately usable, and exactly the ceiling a fresh
 *  character could practice to anyway - nothing to clobber, nothing skipped. */
const STARTER_PROFICIENCY = 25;

/** Class-agnostic core skills: a damage spender and a stun - two real combat
 *  decisions for any level-1 character. */
const STARTER_ABILITIES: Array<{ id: string; line: string }> = [
    { id: "kick", line: "The guide walks you through a short, brutal kick. You will not forget it." },
    { id: "bash", line: "The guide shows you how to drive your shoulder into a staggering bash." },
];

/**
 * Spawn the guide at roomId unless one is already there. Presence check by
 * template_id makes this safe to call on creation AND on every post-reboot
 * arrival at the entry room (reconstruction path - transient mobs are gone
 * after a reboot, the visited marker is not).
 */
export function ensureGuideAt(areaId: string, roomId: string): void {
    try {
        const npcs = (tapestry as any).world.getEntitiesInRoom(roomId, "npc") || [];
        for (let i = 0; i < npcs.length; i++) {
            const tid = (tapestry as any).world.getProperty(npcs[i].id, "template_id");
            if (tid === GUIDE_TEMPLATE) { return; }
        }
        (tapestry as any).mobs.spawnMob({ template: GUIDE_TEMPLATE, roomId });
    } catch (_err) {
        // graceful: a failed guide spawn never blocks population.
    }
}

function deliverProvisions(mob: any, player: any): void {
    const areaId = ensureAreaContext(mob.roomId);
    if (!areaId) { return; }
    const st = getAreaState(areaId);
    if (!st) { return; }
    const playerId = String(player.entityId);

    // Kit: gate lives in grantStarterKit (grants table) - returns [] when
    // this player already collected it in this area.
    const kitLines = grantStarterKit(areaId, st.areaSeed, playerId, st.levelRange[0]);
    let gaveKit = kitLines.length > 0;
    if (gaveKit) {
        (tapestry as any).mobs.command(mob.entityId, "say Take these - the road ahead is unkind to empty hands.");
        for (let i = 0; i < kitLines.length; i++) {
            (tapestry as any).world.send(playerId, kitLines[i] + "\r\n");
        }
    }

    // Abilities: grant only when ABSENT (getProficiency null) - idempotent,
    // never clobbers trained progress. Definitions ship in @tapestry/core.
    let gaveAbility = false;
    for (let i = 0; i < STARTER_ABILITIES.length; i++) {
        const ab = STARTER_ABILITIES[i];
        try {
            if (!(tapestry as any).abilities.getDefinition(ab.id)) { continue; }
            const prof = (tapestry as any).abilities.getProficiency(playerId, ab.id);
            if (prof !== null && prof !== undefined) { continue; }
            (tapestry as any).abilities.learn(playerId, ab.id, { proficiency: STARTER_PROFICIENCY });
            (tapestry as any).world.send(playerId, ab.line + "\r\n");
            gaveAbility = true;
        } catch (_err) {
            // graceful: a missing ability definition never blocks the rest.
        }
    }

    if (gaveKit || gaveAbility) {
        (tapestry as any).mobs.command(mob.entityId, "say KICK and BASH will serve when steel alone will not. Go well.", 2);
    } else {
        (tapestry as any).mobs.command(mob.entityId, "say You carry all I can give. Ask for a HINT if the pattern confuses you.");
    }
}

export function registerGuideHooks(): void {
    (tapestry as any).mobs.registerScript(GUIDE_TEMPLATE, {
        onSay: function (mob: any, player: any, text: string): void {
            try {
                const lower = String(text || "").toLowerCase();
                if (/\b(hello|hi|hey|help|kit|gear|train|learn|ready|start|begin)\b/.test(lower)) {
                    deliverProvisions(mob, player);
                    return;
                }
                if (/\b(hint|hints|where|lost|way|road|landmark|boss)\b/.test(lower)) {
                    (tapestry as any).mobs.command(mob.entityId, "say Follow the roads - they run straight to the landmarks, and something worth fighting holds each one.");
                    (tapestry as any).mobs.command(mob.entityId, "say CONSIDER what you meet before you swing, and it will size things up for you. The deep chambers are not kind.", 1.5);
                    return;
                }
                (tapestry as any).mobs.command(mob.entityId, "say Say HELLO when you are ready to be outfitted, or ask for a HINT.");
            } catch (_err) {
                // graceful: never throw into the hook dispatcher.
            }
        },
    });
}

registerGuideHooks();
