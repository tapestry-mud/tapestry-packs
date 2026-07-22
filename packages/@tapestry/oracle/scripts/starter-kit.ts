// starter-kit.ts - PLAYTEST SCAFFOLDING (stage B). Stage C (items six-axis)
// and stage E (gear isolation / onboarding NPC) own the real design; this is a
// stopgap so a BRAND-NEW character can fight the stage-B tier ladder without
// gearing up in the overworld first (Travis 2026-07-04).
//
// Shape: on a player's first entry to a solo area they receive one weapon +
// head/hands/feet armor, stats rolled from the master balance table at the
// AREA'S MIN LEVEL (wear/wield carry no level gates - verified in core, so a
// level-1 character can always equip the kit). Items freeze through the same
// writeItemTemplate side-car machinery as mob loot and deliver through
// items.spawnToInventory (the proven core-loaditem / tinkers-craft seam).
//
// Grant gating: once per player per area - an in-memory per-area set mirrored
// by the frozen "grants" oracle table (the visited-table pattern), so reloads
// and re-entries never double-grant. Mark-first posture: a mid-grant failure
// leaves a partial kit and a used mark (safe) rather than risking duplicates.
//
// ASCII; braces on all control flow.

import * as tapestry from "@tapestry/engine";
import { rngFor } from "./resolver.js";
import { statsFor } from "./balance-table.js";

const KIT_ARMOR_SLOTS: string[] = ["head", "hands", "feet"];
const KIT_NAMES: Record<string, string> = {
    wield: "a traveler's blade",
    head: "a traveler's cap",
    hands: "a pair of traveler's gloves",
    feet: "a pair of traveler's boots",
};
const KIT_DESCS: Record<string, string> = {
    wield: "Plain, balanced, and sharp enough to start with.",
    head: "A sturdy cap of boiled leather.",
    hands: "Worn leather gloves, still serviceable.",
    feet: "Road-worn boots with life left in them.",
};

// In-memory per-area granted-player sets, hydrated lazily from the frozen
// "grants" oracle table (restored at boot by AuthoredOracleLoader).
const _granted = new Map<string, Set<string>>();

function grantedSet(areaId: string): Set<string> {
    let s = _granted.get(areaId);
    if (!s) {
        s = new Set<string>();
        try {
            const t = (tapestry as any).oracle.table(areaId + ":grants");
            if (t && t.entries) {
                for (let i = 0; i < t.entries.length; i++) {
                    const id = String((t.entries[i] && t.entries[i].id) || "");
                    if (id !== "") { s.add(id); }
                }
            }
        } catch (_err) {
            // graceful: an unreadable table never blocks the grant gate.
        }
        _granted.set(areaId, s);
    }
    return s;
}

function persistGrants(areaId: string, s: Set<string>): void {
    try {
        const ids: string[] = [];
        s.forEach(function (k: string): void { ids.push(k); });
        ids.sort();
        const entries: Array<{ w: number; id: string; name: string; desc: string }> = [];
        for (let i = 0; i < ids.length; i++) {
            entries.push({ w: 1, id: ids[i], name: "starter-kit", desc: "" });
        }
        (tapestry as any).authoring.writeOracleTable({ areaId, kind: "grants", entries });
    } catch (_err) {
        // graceful: the in-memory set still guards this session.
    }
}

/** Teardown: drop the granted-player set for a discarded area. The frozen "grants"
 *  oracle table goes with the area directory, so nothing needs rewriting. Items already
 *  in a player's inventory are real entities on the player file and stay (Decision C). */
export function removeGranted(areaId: string): void {
    _granted.delete(areaId);
}

/**
 * Grant the starter kit to playerId for areaId, once. Returns the player-facing
 * lines to send ([] when already granted or nothing could be delivered).
 */
export function grantStarterKit(
    areaId: string,
    areaSeed: number,
    playerId: string,
    minLevel: number
): string[] {
    const lines: string[] = [];
    const s = grantedSet(areaId);
    if (s.has(playerId)) { return lines; }
    s.add(playerId);
    persistGrants(areaId, s);

    const rng = rngFor(areaSeed, "starter-kit:" + playerId);
    const level = minLevel > 0 ? minLevel : 1;

    // Weapon.
    const weaponStats = statsFor("weapon", level, rng);
    const weaponId = areaId + ":kit-" + playerId + "-wield";
    const wroteWeapon = (tapestry as any).authoring.writeItemTemplate({
        areaId,
        id: weaponId,
        base: "tapestry-oracle:weapon-melee",
        name: KIT_NAMES.wield,
        desc: KIT_DESCS.wield,
        type: "item",
        properties: { rarity: "common", slot: "wield", damage_dice: String(weaponStats.damage) },
    });
    if (wroteWeapon) {
        const spawned = (tapestry as any).items.spawnToInventory(weaponId, playerId);
        if (spawned) { lines.push("You receive " + KIT_NAMES.wield + "."); }
    }

    // Armor: the low-level slot trio, one AC roll shared (same balance row).
    const armorStats = statsFor("armor", level, rng);
    const acVal = Number((armorStats as any).ac) || 0;
    for (let i = 0; i < KIT_ARMOR_SLOTS.length; i++) {
        const slot = KIT_ARMOR_SLOTS[i];
        const itemId = areaId + ":kit-" + playerId + "-" + slot;
        const wrote = (tapestry as any).authoring.writeItemTemplate({
            areaId,
            id: itemId,
            base: "tapestry-oracle:armor-" + slot,
            name: KIT_NAMES[slot],
            desc: KIT_DESCS[slot],
            type: "item",
            properties: {
                rarity: "common",
                slot,
                ac: { slash: acVal, pierce: acVal, bash: acVal, exotic: acVal },
            },
        });
        if (!wrote) { continue; }
        const spawned = (tapestry as any).items.spawnToInventory(itemId, playerId);
        if (spawned) { lines.push("You receive " + KIT_NAMES[slot] + "."); }
    }

    if (lines.length > 0) {
        lines.unshift("The oracle provides for the road ahead:");
    }
    return lines;
}
