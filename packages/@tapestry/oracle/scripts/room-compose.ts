// room-compose.ts - multi-table composition. A generic core (composeAxes) resolves a
// named DEGREE table; per-domain composer adapters (registered, like the degree seam)
// hold the domain-specific mapping. rooms is the first adapter; combat registers its own
// over CMB-* tables against the same core. Keep-generic split per validate-plan finding 5.
//
// PURE (composeAxes / composeRoomProse) given inputs + rng. The rooms composer rolls the
// depth-biased degree (F3) so it needs an rng in ctx. ASCII; braces on all control flow.

import { type SixAxisTable, type BandEntry, resolveBands, diceSpan } from "./six-axis.js";
import { degreeFor } from "./degree.js";
import { pick } from "./prng.js";

export interface AxisBundle { band: BandEntry; }

export function composeAxes(
    tables: Record<string, SixAxisTable>,
    degreeTableId: string,
    degree: number
): AxisBundle | null {
    const t = tables[degreeTableId];
    if (!t) {
        return null;
    }
    return { band: resolveBands(t, degree) };
}

export interface RoomComposition { band: string; spawnDensity: number; }

// Spawn density per room band. transit is a breather (0); charged is the densest (2).
// No threshold entry: the depth-biased degree never reaches the threshold band - the
// boss arena stays on the boss clock (room-gen.ts), not the degree roll.
const DENSITY: Record<string, number> = { transit: 0, chamber: 1, charged: 2, landmark: 1 };

const _composers: Record<string, (tables: any, ctx: any) => any> = {};

export function registerComposer(domain: string, fn: (tables: any, ctx: any) => any): void {
    _composers[domain] = fn;
}

export function composeFor(domain: string, tables: Record<string, SixAxisTable>, ctx: any): any {
    const fn = _composers[domain];
    if (!fn) {
        throw new Error("compose: no composer registered for domain '" + domain + "'");
    }
    return fn(tables, ctx);
}

export function composeRoomProse(tables: Record<string, SixAxisTable>, rng: () => number): string {
    const room2 = tables["ROOM-2"];
    if (!room2) {
        return "";
    }
    const parts: string[] = [];
    const order = ["openers", "details", "atmosphere"];
    for (let i = 0; i < order.length; i++) {
        const pool = room2.subtables[order[i]];
        if (pool && pool.length > 0) {
            parts.push(pick(pool, rng));
        }
    }
    return parts.join(" ");
}

registerComposer("rooms", function (tables: Record<string, SixAxisTable>, ctx: any): RoomComposition | null {
    const room1 = tables["ROOM-1"];
    if (!room1) {
        return null;
    }
    const span = diceSpan(room1.dice);
    const degree = degreeFor("rooms", { depth: ctx.depth, pressure: ctx.pressure, rng: ctx.rng, span });
    const axes = composeAxes(tables, "ROOM-1", degree);
    if (!axes) {
        return null;
    }
    const band = axes.band.band;
    const density = Object.prototype.hasOwnProperty.call(DENSITY, band) ? DENSITY[band] : 1;
    return { band, spawnDensity: density };
});
