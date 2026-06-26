import { test } from "node:test";
import assert from "node:assert/strict";
import { roomBiasedDegree, degreeFor, registerDegreeAdapter } from "../dist/scripts/degree.js";
import { splitmix64 } from "../dist/scripts/prng.js";

const SPAN = [1, 10]; // a 1d10 table

function sample(depth, seed, n) {
    const rng = splitmix64(seed);
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push(roomBiasedDegree({ depth, pressure: 0, rng, span: SPAN }));
    }
    return out;
}

test("roomBiasedDegree never returns the reserved top value (threshold stays a tail)", () => {
    const vals = sample(99, 7, 200); // very deep
    for (let i = 0; i < vals.length; i++) {
        assert.ok(vals[i] >= 1 && vals[i] <= 9); // span.max-1 = 9, never 10
    }
});

test("roomBiasedDegree biases the distribution upward with depth", () => {
    const shallow = sample(0, 42, 300);
    const deep = sample(12, 42, 300);
    const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    assert.ok(avg(deep) > avg(shallow)); // deeper re-weights upward
});

test("roomBiasedDegree keeps same-depth variety (not a deterministic lookup)", () => {
    const vals = sample(4, 123, 200);
    const distinct = new Set(vals);
    assert.ok(distinct.size >= 2); // rooms at the same depth can land in adjacent bands
});

test("degreeFor dispatches to the registered rooms adapter", () => {
    const d = degreeFor("rooms", { depth: 0, pressure: 0, rng: splitmix64(1), span: SPAN });
    assert.ok(d >= 1 && d <= 9);
});

test("degreeFor throws on an unregistered domain", () => {
    assert.throws(() => degreeFor("combat", {}), /domain/);
});

test("registerDegreeAdapter adds a new domain", () => {
    registerDegreeAdapter("test-domain", (ctx) => ctx.a * 2);
    assert.equal(degreeFor("test-domain", { a: 5 }), 10);
});
