// tiers golden tests - the stage-B threat-ladder pure core: MOB-1 banded
// selection, dice-owned disposition distribution, epithets, entry adjacency,
// miniboss fallback identity, stir lines. Run after npm run build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    CONTEXT_BUMP, DISPOSITION_WEIGHTS, rollDisposition,
    DISPOSITION_TEMPLATES, TIER_TEMPLATES, ELITE_EPITHETS, pickEpithet,
    isEntryAdjacent, bandOfEntryId, selectMobEntry,
    defaultMinibossFor, stirLine,
} from "../dist/scripts/tiers.js";
import { parseSixAxisTable } from "../dist/scripts/six-axis.js";
import { splitmix64 } from "../dist/scripts/prng.js";
import { data } from "@tapestry/engine";

const MOB1 = parseSixAxisTable(data.loadYaml("data/six-axis/_default/MOB-1.yaml"));

const BANDED = [
    { w: 50, id: "mb-skulker-rat", name: "rat", desc: "d", balance_ref: "mob" },
    { w: 50, id: "mb-skulker-mouse", name: "mouse", desc: "d", balance_ref: "mob" },
    { w: 50, id: "mb-common-cook", name: "cook", desc: "d", balance_ref: "mob" },
    { w: 50, id: "mb-common-waiter", name: "waiter", desc: "d", balance_ref: "mob" },
    { w: 50, id: "mb-hunter-shade", name: "shade", desc: "d", balance_ref: "mob" },
    { w: 50, id: "mb-apex-beast", name: "beast", desc: "d", balance_ref: "mob" },
];

const FLAT_040 = [
    { w: 60, id: "angry-cook", name: "angry cook", desc: "d", balance_ref: "mob" },
    { w: 40, id: "scullion", name: "scullion", desc: "d", balance_ref: "mob" },
];

test("MOB-1 loads: 1d10 DEGREE table with the four menace bands", () => {
    assert.equal(MOB1.axis, "DEGREE");
    assert.equal(MOB1.dice, "1d10");
    assert.deepEqual(MOB1.bands.map((b) => b.band), ["skulker", "common", "hunter", "apex"]);
});

test("bandOfEntryId parses the mb- prefix and rejects 0.4.0 flat ids", () => {
    assert.equal(bandOfEntryId("mb-skulker-rat"), "skulker");
    assert.equal(bandOfEntryId("mb-apex-chasm-maw"), "apex");
    assert.equal(bandOfEntryId("angry-cook"), null);
    assert.equal(bandOfEntryId("mb-boss-x"), null);
});

test("selectMobEntry: banded selection respects the context bump", () => {
    // bump -2 (transit) can never reach apex on 1d10; bump +99 always lands apex.
    for (let seed = 1; seed <= 300; seed++) {
        const low = selectMobEntry(MOB1, BANDED, -2, splitmix64(seed));
        assert.ok(low && low.id !== "mb-apex-beast", `apex leaked at low bump (seed ${seed})`);
        const top = selectMobEntry(MOB1, BANDED, 99, splitmix64(seed));
        assert.equal(top.id, "mb-apex-beast");
    }
    // charged bump (+2) reaches hunter/apex a meaningful share of the time
    let dangerous = 0;
    for (let seed = 1; seed <= 500; seed++) {
        const e = selectMobEntry(MOB1, BANDED, CONTEXT_BUMP.charged, splitmix64(seed));
        if (e.id === "mb-hunter-shade" || e.id === "mb-apex-beast") { dangerous++; }
    }
    assert.ok(dangerous > 150, `charged rooms should skew dangerous: ${dangerous}/500`);
    // deterministic
    const a = selectMobEntry(MOB1, BANDED, 0, splitmix64(42));
    const b = selectMobEntry(MOB1, BANDED, 0, splitmix64(42));
    assert.equal(a.id, b.id);
});

test("selectMobEntry: 0.4.0 flat tables fall back to the whole-table pick", () => {
    for (let seed = 1; seed <= 50; seed++) {
        const e = selectMobEntry(MOB1, FLAT_040, 2, splitmix64(seed));
        assert.ok(e && (e.id === "angry-cook" || e.id === "scullion"), "flat table must still resolve");
    }
    // no MOB-1 table at all -> flat pick too
    const e2 = selectMobEntry(undefined, BANDED, 2, splitmix64(7));
    assert.ok(e2 && e2.id.startsWith("mb-"));
    // empty entries -> null
    assert.equal(selectMobEntry(MOB1, [], 2, splitmix64(7)), null);
});

test("selectMobEntry: an empty band slice falls back to the whole table", () => {
    const noApex = BANDED.filter((e) => e.id !== "mb-apex-beast");
    for (let seed = 1; seed <= 100; seed++) {
        const e = selectMobEntry(MOB1, noApex, 99, splitmix64(seed));
        assert.ok(e !== null && e.id !== "mb-apex-beast");
    }
});

test("rollDisposition: deterministic, band-weighted (charged aggro, transit timid)", () => {
    assert.equal(rollDisposition("chamber", splitmix64(5)), rollDisposition("chamber", splitmix64(5)));
    const counts = { charged: { aggro: 0, neutral: 0, timid: 0 }, transit: { aggro: 0, neutral: 0, timid: 0 } };
    for (let seed = 1; seed <= 1000; seed++) {
        counts.charged[rollDisposition("charged", splitmix64(seed))]++;
        counts.transit[rollDisposition("transit", splitmix64(seed))]++;
    }
    assert.ok(counts.charged.aggro > 550, `charged skews aggro: ${JSON.stringify(counts.charged)}`);
    assert.ok(counts.transit.timid > 450, `transit skews timid: ${JSON.stringify(counts.transit)}`);
    // unknown band -> chamber mix (all three reachable)
    const mixed = new Set();
    for (let seed = 1; seed <= 200; seed++) { mixed.add(rollDisposition("nonsense", splitmix64(seed))); }
    assert.equal(mixed.size, 3);
});

test("disposition + tier template maps", () => {
    assert.equal(DISPOSITION_TEMPLATES.aggro, "tapestry-oracle:hostile-melee");
    assert.equal(DISPOSITION_TEMPLATES.neutral, "tapestry-oracle:wary-melee");
    assert.equal(DISPOSITION_TEMPLATES.timid, "tapestry-oracle:skittish-melee");
    assert.equal(TIER_TEMPLATES.elite, "tapestry-oracle:swell-elite");
    assert.equal(TIER_TEMPLATES.miniboss, "tapestry-oracle:swell-miniboss");
    assert.equal(TIER_TEMPLATES.boss, "tapestry-oracle:swell-boss");
    // weights sanity: every band's weights sum to 1 (within float noise)
    for (const band in DISPOSITION_WEIGHTS) {
        const w = DISPOSITION_WEIGHTS[band];
        assert.ok(Math.abs(w[0] + w[1] + w[2] - 1) < 1e-9, `${band} weights sum to ${w[0] + w[1] + w[2]}`);
    }
});

test("isEntryAdjacent: exactly the six orthogonal neighbors of entry", () => {
    assert.equal(isEntryAdjacent("1,0,0"), true);
    assert.equal(isEntryAdjacent("-1,0,0"), true);
    assert.equal(isEntryAdjacent("0,1,0"), true);
    assert.equal(isEntryAdjacent("0,-1,0"), true);
    assert.equal(isEntryAdjacent("0,0,1"), true);
    assert.equal(isEntryAdjacent("0,0,-1"), true);
    assert.equal(isEntryAdjacent("0,0,0"), false);
    assert.equal(isEntryAdjacent("1,1,0"), false);
    assert.equal(isEntryAdjacent("2,0,0"), false);
    assert.equal(isEntryAdjacent("garbage"), false);
});

test("pickEpithet is deterministic and draws from the deck", () => {
    const e = pickEpithet(splitmix64(9));
    assert.equal(e, pickEpithet(splitmix64(9)));
    assert.ok(ELITE_EPITHETS.includes(e));
    const seen = new Set();
    for (let seed = 1; seed <= 200; seed++) { seen.add(pickEpithet(splitmix64(seed))); }
    assert.ok(seen.size >= ELITE_EPITHETS.length - 1, "epithet variety");
});

test("defaultMinibossFor synthesizes the 0.4.0-area identity", () => {
    const id = defaultMinibossFor("great hearth");
    assert.equal(id.bossName, "the keeper of the great hearth");
    assert.ok(id.bossDesc.includes("great hearth"));
});

test("stirLine: per-kind arrival dressing", () => {
    assert.equal(stirLine("neutral", "angry cook"), "angry cook stirs at your arrival.");
    assert.ok(stirLine("aggro", "angry cook").includes("rounds on you"));
    assert.ok(stirLine("timid", "scullion").includes("shrinks back"));
    assert.ok(stirLine("elite", "the dire lurker").includes("turns its full attention"));
    assert.ok(stirLine("miniboss", "the frost-warden").includes("rises to meet you"));
    assert.equal(stirLine("boss", "the head chef"), "the head chef stirs at your arrival.");
});

// ---------------------------------------------------------------------------
// B.2 safe entry room: the structural ambient-zero guarantee.
// ---------------------------------------------------------------------------
import { ENTRY_PATH, DENSITY, ambientDensity, entrySafeDensity } from "../dist/scripts/tiers.js";

test("entry room ambient density is ZERO for every band (structural guarantee)", () => {
    for (const band of Object.keys(DENSITY)) {
        assert.equal(ambientDensity(band, ENTRY_PATH), 0, band + " at entry");
    }
    // Unknown band falls back to 1 elsewhere, still 0 at entry.
    assert.equal(ambientDensity("no-such-band", ENTRY_PATH), 0);
});

test("non-entry rooms keep the per-band density table", () => {
    assert.equal(ambientDensity("transit", "1,0,0"), 0);
    assert.equal(ambientDensity("chamber", "1,0,0"), 1);
    assert.equal(ambientDensity("charged", "2,-3,0"), 2);
    assert.equal(ambientDensity("landmark", "0,4,0"), 1);
    assert.equal(ambientDensity("threshold", "-1,-1,1"), 1);
    assert.equal(ambientDensity("no-such-band", "1,0,0"), 1);
});

test("entrySafeDensity zeroes exactly the entry cell (fallback-branch guard)", () => {
    assert.equal(entrySafeDensity(ENTRY_PATH, 2), 0);
    assert.equal(entrySafeDensity("0,0,1", 2), 2);
    assert.equal(entrySafeDensity("1,0,0", 1), 1);
});
