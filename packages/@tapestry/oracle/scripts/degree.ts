// degree.ts - the generic degree-input seam. The degree (the magnitude the DEGREE
// axis reads) is computed by a per-domain adapter; the resolver (resolveBands) only
// ever sees a plain number. The rooms adapter rolls a DEPTH-BIASED degree over the die
// span (not a deterministic depth->band lookup, which saturates the top band and kills
// per-depth variety - validate-plan finding 6). Combat/items register their own adapters
// in deferred phases. Adapters are separate by design so the foundation stays
// domain-agnostic.
//
// PURE given the supplied rng. ASCII; braces on all control flow.

export interface RoomDegreeCtx {
    depth: number;
    pressure: number;
    rng: () => number;
    span: [number, number];
}

// Levels of descent per +1 of upward bias. Tunable; the F4 playtest validates it.
const DEPTH_STEP = 3;

const _adapters: Record<string, (ctx: any) => number> = {};

export function registerDegreeAdapter(domain: string, fn: (ctx: any) => number): void {
    _adapters[domain] = fn;
}

export function degreeFor(domain: string, ctx: any): number {
    const fn = _adapters[domain];
    if (!fn) {
        throw new Error("degree: no adapter registered for domain '" + domain + "'");
    }
    return fn(ctx);
}

export function roomBiasedDegree(ctx: RoomDegreeCtx): number {
    const lo = ctx.span[0];
    // Reserve the top value (the threshold band) for the boss clock - this roll covers
    // only [lo, hi] where hi = span.max - 1, so depth can never auto-select threshold.
    const hi = ctx.span[1] - 1;
    if (hi <= lo) {
        return lo;
    }
    const width = hi - lo + 1;
    const base = lo + Math.floor(ctx.rng() * width);
    const maxBias = hi - lo;
    let bias = Math.floor((ctx.depth + ctx.pressure) / DEPTH_STEP);
    if (bias > maxBias) {
        bias = maxBias;
    }
    let d = base + bias;
    if (d < lo) { d = lo; }
    if (d > hi) { d = hi; }
    return d;
}

registerDegreeAdapter("rooms", function (ctx: RoomDegreeCtx): number {
    return roomBiasedDegree(ctx);
});
