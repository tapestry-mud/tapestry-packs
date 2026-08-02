// seal-state.ts - pure state math for the lair seal (spec 5.3).
//
// The boss lair is sealed until every landmark miniboss in the run is dead.
// This module owns the counter and its table encoding and nothing else - it has
// zero engine imports so it is golden-testable under plain node, the same split
// as spawn-level.ts and run-entry.ts. seal.ts owns the engine side.
//
// WHY A SIDE-CAR TABLE, NOT AN AREA PROPERTY: authoring.setAreaAttribute
// whitelists exactly level_range/reset_interval/wip/seed and rejects anything
// else, and a run area lives in a runtime-created destination pack that has no
// loaded manifest on reboot and therefore validates STRICT, so a pack-declared
// property on it fails the boot. Frozen oracle tables ride AuthoredOracleLoader
// instead: no entity properties, no validator surface, reload-safe. Same
// mechanism population.ts uses for "visited".
//
// ASCII; braces on all control flow.

export interface SealState {
    /** Minibosses this run placed. Fixed at mint. */
    total: number;
    /** How many of them are dead. */
    slain: number;
    /** True once the lair is open. Never regresses on its own. */
    broken: boolean;
}

/** No readable table: FAIL OPEN. Nothing counted, lair open.
 *
 *  This is the F4 call and it is deliberate. A missing table could mean "the run
 *  has not been sealed yet" (harmless, the lair is empty anyway until the player
 *  walks there) or "the write failed and the state is lost" (fatal if we seal).
 *  Sealing on the ambiguous case costs a player their whole run; opening on it
 *  costs a free boss in a single-player game. Spec 5.3's requirement is literally
 *  "not soft-locking," so the ambiguous case opens. Only a table that positively
 *  says keepers remain will hold a lair shut. */
export const EMPTY_SEAL: SealState = { total: 0, slain: 0, broken: true };

export function encodeSeal(state: SealState): Array<{ w: number; id: string; name: string; desc: string }> {
    return [
        { w: 1, id: "total", name: "seal", desc: String(state.total) },
        { w: 1, id: "slain", name: "seal", desc: String(state.slain) },
    ];
}

function readInt(entries: any[], id: string): number | null {
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (e && String(e.id) === id) {
            const n = parseInt(String(e.desc), 10);
            if (!isNaN(n) && n >= 0) {
                return n;
            }
        }
    }
    return null;
}

/** Decode a frozen seal table. `broken` is DERIVED, never stored, so the two can
 *  never disagree on disk. A table that is absent, unreadable, or missing either
 *  row decodes to EMPTY_SEAL, which is OPEN (see the constant, and F4). */
export function decodeSeal(entries: any[] | null | undefined): SealState {
    if (!entries || !Array.isArray(entries)) {
        return EMPTY_SEAL;
    }
    const total = readInt(entries, "total");
    const slain = readInt(entries, "slain");
    if (total === null || slain === null) {
        return EMPTY_SEAL;
    }
    const capped = slain > total ? total : slain;
    return { total, slain: capped, broken: capped >= total };
}

/** One miniboss died. Saturates at total; a broken seal stays broken. */
export function recordSlain(state: SealState): SealState {
    if (state.slain >= state.total) {
        return { total: state.total, slain: state.slain, broken: true };
    }
    const slain = state.slain + 1;
    return { total: state.total, slain, broken: slain >= state.total };
}
