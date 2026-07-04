// sector-compose golden tests - the v3 prose/name layer is pure f(areaSeed, coord),
// so cadence, exclusion, slot filling, naming, and the table codecs are all provable
// under plain node. Run after npm run build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    encodeLandmarksTable, parseLandmarksTable, encodeSectorsTable, parseSectorsTable,
    synthesizeSectors, fallbackLandmarks, FALLBACK_LANDMARK_LINES,
    cadencePlan, pickExcluding, fillSlots, landmarkRefLine,
    composeRoomV3, roomNameV3, titleCase,
} from "../dist/scripts/sector-compose.js";
import { splitmix64 } from "../dist/scripts/prng.js";

function pools(overrides = {}) {
    return {
        qualifier: "flooded",
        openers: ["O1.", "O2.", "O3.", "O4.", "O5.", "O6.", "O7.", "O8."],
        details: ["D1.", "D2.", "D3.", "D4.", "D5.", "D6."],
        sensory: ["S1.", "S2.", "S3.", "S4.", "S5."],
        hooks: ["H1.", "H2.", "H3.", "H4.", "H5."],
        landmarkLines: ["The {landmark} looms {dir} of here."],
        ...overrides,
    };
}

test("landmark table codec round-trips", () => {
    const landmarks = fallbackLandmarks().slice(0, 3);
    const rows = encodeLandmarksTable(landmarks);
    assert.equal(rows.length, 15); // lm + 3 afar variants + boss per landmark
    const back = parseLandmarksTable(rows);
    assert.deepEqual(back, landmarks);
});

test("landmarks codec: afar variants + boss identity rows", () => {
    const lm = [{
        name: "old well", desc: "A well of note.",
        afars: ["A ring.", "A low ring.", "A stone lip."],
        bossName: "the well-keeper", bossDesc: "It waits below.",
    }];
    const rows = encodeLandmarksTable(lm);
    assert.ok(rows.find((r) => r.id === "afar-0-0" && r.desc === "A ring."));
    assert.ok(rows.find((r) => r.id === "afar-0-2" && r.desc === "A stone lip."));
    assert.ok(rows.find((r) => r.id === "boss-0" && r.name === "the well-keeper" && r.desc === "It waits below."));
    const back = parseLandmarksTable(rows);
    assert.deepEqual(back, lm);
});

test("parseLandmarksTable reads the 0.4.0 shape (single afar-<i>, no boss rows)", () => {
    const old = [
        { w: 10, id: "lm-0", name: "great hearth", desc: "A hearth." },
        { w: 10, id: "afar-0", name: "great hearth", desc: "A red glow." },
    ];
    const back = parseLandmarksTable(old);
    assert.equal(back.length, 1);
    assert.equal(back[0].name, "great hearth");
    assert.deepEqual(back[0].afars, ["A red glow."]);
    assert.equal(back[0].bossName, "");
    assert.equal(back[0].bossDesc, "");
});

test("sector table codec round-trips", () => {
    const sectors = [pools(), pools({ qualifier: "outer", hooks: [] })];
    const rows = encodeSectorsTable(sectors);
    const back = parseSectorsTable(rows);
    assert.deepEqual(back, sectors);
});

test("parseLandmarksTable tolerates junk and gaps", () => {
    assert.deepEqual(parseLandmarksTable([]), []);
    assert.deepEqual(parseLandmarksTable(null), []);
    const back = parseLandmarksTable([
        { w: 10, id: "lm-1", name: "arch", desc: "An arch." },
        { w: 10, id: "bogus", name: "x", desc: "y" },
    ]);
    assert.equal(back.length, 2);
    assert.equal(back[0].name, "");     // gap at index 0
    assert.equal(back[1].name, "arch");
    assert.deepEqual(back[1].afars, []);
    assert.equal(back[1].bossName, "");
});

test("synthesizeSectors: k distinct qualifiers, pools from prose tags", () => {
    const prose = [
        { name: "opener", desc: "A." }, { name: "opener", desc: "B." },
        { name: "detail", desc: "C." },
        { name: "atmosphere", desc: "D." },
        { name: "junk", desc: "E." },
    ];
    const sectors = synthesizeSectors(4, prose, 42);
    assert.equal(sectors.length, 4);
    const quals = new Set(sectors.map((s) => s.qualifier));
    assert.equal(quals.size, 4, "qualifiers must be distinct");
    for (const s of sectors) {
        assert.deepEqual(s.openers, ["A.", "B."]);
        assert.deepEqual(s.details, ["C."]);
        assert.deepEqual(s.sensory, ["D."]); // atmosphere maps to sensory
        assert.deepEqual(s.hooks, []);
    }
    // deterministic
    assert.deepEqual(synthesizeSectors(4, prose, 42), sectors);
});

test("cadencePlan: transit terse, landmark band breathes, charged may hook", () => {
    for (let i = 0; i < 50; i++) {
        const rng = splitmix64(i);
        assert.deepEqual(cadencePlan(1, rng), ["openers"]);
        assert.deepEqual(cadencePlan(2, splitmix64(i)), ["openers"]);
        const chamber = cadencePlan(4, splitmix64(i));
        assert.equal(chamber.length, 2);
        assert.equal(chamber[0], "openers");
        const charged = cadencePlan(7, splitmix64(i));
        assert.ok(charged.length === 2 || charged.length === 3);
        assert.deepEqual(cadencePlan(9, splitmix64(i)), ["openers", "details", "sensory"]);
        assert.deepEqual(cadencePlan(10, splitmix64(i)), ["openers", "hooks"]);
    }
});

test("pickExcluding: deterministic, adjacent repeats nearly eliminated (pool 8)", () => {
    // One-level exclusion shifts a room off its neighbors' NATURAL picks; when both
    // rooms of a pair shift, a residual collision is still possible (a perfect
    // guarantee needs radius-2 recursion - not worth it for prose). Baseline
    // adjacent-collision rate with no exclusion is 1/8 = 12.5%; assert the stack
    // holds it under 3% across seeds.
    let collisions = 0;
    let pairs = 0;
    for (const seed of [1234, 987, 424242]) {
        const pool = pools().openers; // 8 entries
        const picks = new Map();
        for (let x = -4; x <= 4; x++) {
            for (let y = -4; y <= 4; y++) {
                const path = `${x},${y},0`;
                const p = pickExcluding(pool, seed, path, "openers");
                assert.equal(p, pickExcluding(pool, seed, path, "openers"));
                picks.set(path, p);
            }
        }
        for (let x = -4; x <= 4; x++) {
            for (let y = -4; y <= 4; y++) {
                for (const [dx, dy] of [[1, 0], [0, 1]]) {
                    const a = picks.get(`${x},${y},0`);
                    const b = picks.get(`${x + dx},${y + dy},0`);
                    if (a === undefined || b === undefined) { continue; }
                    pairs++;
                    if (a === b) { collisions++; }
                }
            }
        }
    }
    assert.ok(pairs > 300);
    const rate = collisions / pairs;
    assert.ok(rate < 0.03, `adjacent repeat rate ${(rate * 100).toFixed(1)}% >= 3% (${collisions}/${pairs})`);
});

test("pickExcluding: small pools skip exclusion but stay deterministic", () => {
    const small = ["a", "b", "c"];
    const p = pickExcluding(small, 9, "0,0,0", "x");
    assert.equal(p, pickExcluding(small, 9, "0,0,0", "x"));
    assert.ok(small.includes(p));
    assert.equal(pickExcluding([], 9, "0,0,0", "x"), "");
});

test("fillSlots replaces every slot occurrence", () => {
    assert.equal(
        fillSlots("The {landmark} looms {dir}; the {landmark} waits.", "broken tower", "east"),
        "The broken tower looms east; the broken tower waits."
    );
});

test("landmarkRefLine: distance-banded gate, afar variants + tail deck, vertical fixed", () => {
    const lm = {
        name: "broken tower", desc: "d",
        afars: ["A snapped tower juts at the sky.", "A broken fang of masonry rises far off.", "The tower's stump leans in the haze."],
        bossName: "", bossDesc: "",
    };
    // determinism
    const a = landmarkRefLine(77, "1,2,0", pools(), lm, "east", false, 2);
    assert.equal(a, landmarkRefLine(77, "1,2,0", pools(), lm, "east", false, 2));
    // always yields a non-empty line
    const forced = landmarkRefLine(77, "1,2,0", pools(), lm, "east", true, 1);
    assert.ok(forced.length > 0);
    assert.ok(forced.includes("east"));
    assert.ok(!forced.includes("{dir}") && !forced.includes("{landmark}"));
    // distance band: near sits at the 0.45 gate, far at 0.25, far strictly quieter
    let nearLoud = 0, farLoud = 0;
    for (let i = 0; i < 400; i++) {
        if (landmarkRefLine(77, `${i},1,0`, pools(), lm, "east", false, 2) !== "") { nearLoud++; }
        if (landmarkRefLine(77, `${i},1,0`, pools(), lm, "east", false, 6) !== "") { farLoud++; }
    }
    assert.ok(nearLoud > 120 && nearLoud < 240, `near ${nearLoud}/400 should sit near the 0.45 gate`);
    assert.ok(farLoud > 50 && farLoud < 150, `far ${farLoud}/400 should sit near the 0.25 gate`);
    assert.ok(farLoud < nearLoud, "far rooms must reference less often");
    // afar VARIANTS: across many always-on rooms every variant appears
    const seen = new Set();
    const tails = new Set();
    for (let i = 0; i < 300; i++) {
        const line = landmarkRefLine(77, `${i},2,0`, pools(), lm, "east", true, 1);
        for (let v = 0; v < lm.afars.length; v++) {
            if (line.indexOf(lm.afars[v]) === 0) {
                seen.add(v);
                tails.add(line.slice(lm.afars[v].length));
            }
        }
    }
    assert.equal(seen.size, 3, "all three afar variants should appear");
    assert.ok(tails.size >= 3, `tail variety too low: ${[...tails].join(" | ")}`);
    // vertical
    const vert = landmarkRefLine(77, "0,0,-1", pools(), lm, "above", true, 1);
    assert.equal(vert, "The broken tower lies somewhere above.");
    // no dir -> silent
    assert.equal(landmarkRefLine(77, "0,0,0", pools(), lm, "", true, 1), "");
    // empty afars -> still works via pool/{dir} lines
    const noAfar = { name: "broken tower", desc: "d", afars: [], bossName: "", bossDesc: "" };
    const line2 = landmarkRefLine(77, "3,3,0", pools(), noAfar, "west", true, 1);
    assert.ok(line2.includes("west") && !line2.includes("{dir}"));
});

test("composeRoomV3: deterministic, cadence-driven length, blend stays composed", () => {
    const p = pools();
    const a = composeRoomV3(5, "2,3,0", 1, p, null);
    assert.equal(a, composeRoomV3(5, "2,3,0", 1, p, null));
    // transit = exactly one fragment
    assert.ok(p.openers.includes(a), `transit room should be a single opener, got "${a}"`);
    // landmark band = three fragments
    const big = composeRoomV3(5, "2,3,0", 9, p, null);
    assert.equal(big.split(" ").filter((w) => w.endsWith(".")).length, 3);
    // blend never crashes and yields fragments from either pool
    const other = pools({ openers: ["X1.", "X2.", "X3.", "X4.", "X5.", "X6.", "X7.", "X8."] });
    const blended = composeRoomV3(5, "4,4,0", 4, p, other);
    assert.ok(blended.length > 0);
    // empty pools -> "" (caller falls back)
    const empty = { qualifier: "", openers: [], details: [], sensory: [], hooks: [], landmarkLines: [] };
    assert.equal(composeRoomV3(5, "1,1,0", 4, empty, null), "");
});

test("roomNameV3: qualifier x place, Upper/Lower override, deterministic", () => {
    const places = ["gallery", "shaft", "hollow", "chasm", "cavern", "crawlway"];
    const name = roomNameV3(11, "2,0,0", "flooded", places);
    assert.ok(name.startsWith("Flooded "), name);
    assert.equal(name, roomNameV3(11, "2,0,0", "flooded", places));
    assert.ok(roomNameV3(11, "2,0,1", "flooded", places).startsWith("Upper "));
    assert.ok(roomNameV3(11, "2,0,-1", "flooded", places).startsWith("Lower "));
    // no qualifier -> bare place
    const bare = roomNameV3(11, "2,0,0", "", places);
    assert.ok(!bare.includes(" "), bare);
    // no places -> qualifier alone survives
    assert.equal(roomNameV3(11, "2,0,0", "flooded", []), "Flooded");
});

test("fallback decks are well-formed", () => {
    const lms = fallbackLandmarks();
    assert.equal(lms.length, 8);
    const names = new Set(lms.map((l) => l.name));
    assert.equal(names.size, 8, "fallback landmark names must be distinct");
    const dirWords = /\b(north|south|east|west|exit|exits)\b/i;
    for (const l of lms) {
        assert.ok(!l.name.startsWith("the "), `name carries article: ${l.name}`);
        assert.ok(l.desc.length > 40);
        assert.equal(l.afars.length, 3, `${l.name} needs 3 afar variants`);
        for (const af of l.afars) {
            assert.ok(af.length > 10 && !dirWords.test(af), `afar problem on ${l.name}: ${af}`);
        }
        assert.ok(l.bossName.startsWith("the "), `boss name should be a title: ${l.bossName}`);
        assert.ok(l.bossDesc.length > 10 && !dirWords.test(l.bossDesc), `bossDesc problem on ${l.name}`);
        assert.ok(!dirWords.test(l.desc), `direction talk in desc: ${l.name}`);
    }
    for (const line of FALLBACK_LANDMARK_LINES) {
        assert.ok(line.includes("{landmark}") && line.includes("{dir}"), line);
    }
    assert.equal(titleCase("walk-in freezer"), "Walk-In Freezer");
});

test("roomNameV3 never stutters the qualifier against the place word", () => {
    const places = ["cold room", "hearth"];
    for (let x = -3; x <= 3; x++) {
        const name = roomNameV3(5, `${x},0,0`, "cold", places);
        assert.ok(!/^Cold Cold/.test(name), name);
        assert.ok(name === "Cold Room" || name === "Cold Hearth", name);
    }
});
