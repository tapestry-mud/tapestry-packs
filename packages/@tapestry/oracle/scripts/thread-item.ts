// thread-item.ts - the thread: an item that is a key (spec 7).
//
// Beating a thread's normal-mode boss yields that thread, granted in the clear
// cutscene's onComplete. Carrying it back through that same portal walks the same
// area in Unraveling mode. "Enter the portal holding the thread" explains itself,
// and the game's own title does the work.
//
// TWO BINDINGS (spec 7.4):
//   - soulbound to the player, so a veteran cannot hand a fresh character a
//     week-twenty Unraveling key. The vector is the existing `give` command; the
//     give.ts refusal gated on the `soulbound` tag is a later task's work - this
//     file's job is only to make the tag stick to the item.
//   - keyed to its template, carried as the thread_template property, and the
//     portal refuses a thread that is not its own. That second binding
//     self-enforces the level gate for free: to hold week twenty's thread you must
//     have cleared week twenty's normal run, which mints at its own floor.
//
// NEVER CONSUMED, at any week, including the Unraveling's death (spec 7.3). One
// rule learned once. The cost of an attempt is the walk and the full reset.
//
// Items freeze through the same writeItemTemplate side-car machinery mob loot and
// the old starter kit used, and deliver through items.spawnToInventory.
//
// VERIFIED (read-and-decide, engine repo WorldAuthoringModule.cs:328-342): the
// writeItemTemplate JS binding reads areaId/id/base/name/desc/type/properties/
// modifiers off the options object only - a `tags` key is never read. Tags on the
// WRITTEN template come solely from `baseTemplate.Tags` (WriteItemTemplateSideCar,
// same file, ~line 915: `Tags = new List<string>(baseTemplate.Tags)`), so the only
// way tags travel through this call is by living on the base template or by being
// applied to the live entity after spawn. This file does the latter - addTag after
// items.spawnToInventory - mirroring seal.ts's own addTag-after-the-fact pattern.
//
// `base` is also load-bearing and NOT optional, discovered the same way: without
// it WriteItemTemplateSideCar's `_itemRegistry.GetTemplate(baseId)` never resolves
// and the whole write returns null - silently, so the thread would just never be
// created. Every existing caller (resolver.ts's mintItemInstance, the now-deleted
// starter-kit.ts) always pointed `base` at a real registered template - an
// armor-<slot> or weapon-melee. Neither fits a non-equippable keepsake, so this
// adds one more in the same shape: tapestry-oracle:misc
// (templates/items/misc.yaml), a plain no-slot behavior-only base.
//
// ASCII; braces on all control flow.

import * as tapestry from "@tapestry/engine";

export const THREAD_TEMPLATE_PROPERTY = "thread_template";

const THREAD_BASE_ID = "tapestry-oracle:misc";

/** Stable per-template so a re-clear reuses the same frozen item template rather
 *  than writing a new one on every run. */
function threadItemId(areaId: string, templateId: string): string {
    return areaId + ":thread-" + templateId;
}

/** True when this player is carrying the thread keyed to templateId. getContents
 *  returns { id, name } only, so the keying property is read per item. */
export function heldThreadFor(playerId: string, templateId: string): boolean {
    try {
        const contents = (tapestry as any).inventory.getContents(playerId) || [];
        for (let i = 0; i < contents.length; i++) {
            const held = (tapestry as any).world.getProperty(contents[i].id, THREAD_TEMPLATE_PROPERTY);
            if (held && String(held) === templateId) {
                return true;
            }
        }
    } catch (_err) {
        // graceful: an unreadable inventory reads as not holding it, which routes
        // the player to the normal run - the safe direction.
    }
    return false;
}

/**
 * Mint and hand over the thread for templateId. Idempotent by inspection: a player
 * who already holds it is not given a second one (spec 7.3 - never consumed, so a
 * re-clear must not stack duplicates). Returns whether a new thread was granted.
 */
export function grantThread(playerId: string, templateId: string, templateName: string, areaId: string): boolean {
    if (heldThreadFor(playerId, templateId)) {
        return false;
    }
    const itemId = threadItemId(areaId, templateId);
    const wrote = (tapestry as any).authoring.writeItemTemplate({
        areaId,
        id: itemId,
        base: THREAD_BASE_ID,
        name: "the thread of " + templateName,
        desc: "A length of the weave, still warm, wound tight around itself. It remembers the "
            + "shape of the place you pulled it from. Carry it back through that door and the "
            + "place remembers you.",
        type: "item",
        properties: {
            rarity: "rare",
            weight: 0,
            value: 0,
            thread_template: templateId,
        },
        modifiers: [],
    });
    if (!wrote) {
        return false;
    }
    const spawned = (tapestry as any).items.spawnToInventory(itemId, playerId);
    if (!spawned) {
        return false;
    }
    try {
        (tapestry as any).world.addTag(spawned.id, "soulbound");
        (tapestry as any).world.addTag(spawned.id, "no_sell");
    } catch (_tagErr) {
        // The item still reaches the player - a failed tag application never
        // blocks the grant - but the anti-share/anti-sell binding is now
        // degraded, silently, on a give-away key item. Loud, because nothing
        // downstream has any other way to learn the gate did not apply.
        try {
            (tapestry as any).system?.warn(
                "[oracle] grantThread: soulbound/no_sell tag failed to apply to "
                + spawned.id + " (thread of " + templateName + ", player " + playerId
                + "); the item is NOT bound. " + ((_tagErr as any) && (_tagErr as any).message ? (_tagErr as any).message : String(_tagErr))
            );
        } catch (_warnErr) {
            // graceful: a missing warn binding never blocks the grant.
        }
    }
    return true;
}
