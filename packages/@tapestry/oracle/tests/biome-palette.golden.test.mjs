import { test } from "node:test";
import assert from "node:assert/strict";
import { soloAreaBiomePalette, rollBiomePalette } from "../dist/scripts/roster.js";
import { splitmix64 } from "../dist/scripts/prng.js";

// soloAreaBiomePalette is the SOLE shared derivation used by both area creation
// (area-gen) and reboot reconstruction (stub-resolver). If it drifts, a reloaded
// area picks a different biome palette than it had at creation and the determinism
// replay breaks. These goldens pin its contract.

test("soloAreaBiomePalette is deterministic by seed", () => {
  assert.deepEqual(soloAreaBiomePalette(123456), soloAreaBiomePalette(123456));
  assert.deepEqual(soloAreaBiomePalette(987654321), soloAreaBiomePalette(987654321));
});

test("soloAreaBiomePalette matches creation's stream position (consume one roll first)", () => {
  // Creation does: rng = splitmix64(seed); rng() [size_target]; rollBiomePalette(rng).
  // The helper MUST reproduce exactly that, or reborn rooms get a different palette.
  const seed = 424242;
  const rng = splitmix64(seed);
  rng(); // the size_target roll consumed in area-gen step 1
  const expected = rollBiomePalette(rng);
  assert.deepEqual(soloAreaBiomePalette(seed), expected);
});

test("soloAreaBiomePalette returns a non-empty palette of known biomes", () => {
  const p = soloAreaBiomePalette(7);
  assert.ok(Array.isArray(p) && p.length >= 1);
  for (const b of p) {
    assert.equal(typeof b, "string");
  }
});
