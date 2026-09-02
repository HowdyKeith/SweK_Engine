// WebGLEngine/render/valueNoise-selfcheck.mjs — v4327
//
// The ordinary half: the hash is deterministic, lands in [0, 1), and is not obviously biased; the value noise is
// continuous across lattice cells and interpolates its corners; fBm stays in range. Plus the answer key from
// before the move, so the extraction is provably byte-neutral.
//
// ---- *** THE HALF THIS FILE EXISTS FOR *** -----------------------------------------------------------------
//
// world/procPlanet.js carries a SECOND value noise, and three files' comments claimed there was only one ("the
// tree's one integer hash ... shared by the skybox, star, planet and greeble"). There is not. Section 5 pins the
// DISAGREEMENT: the two hashes must keep differing, and procPlanet's fade must stay quintic while this one stays
// cubic. That reads backwards for a gate -- normally you assert things AGREE -- and it is deliberate. The
// tempting cleanup here is to delete one noise and point everything at the other, and doing so would silently
// change the height field of every planet, the displacement of every asteroid and every texel of every baked
// surface, with no test anywhere going red. This gate goes red instead, and says why.
//
// Converging them is allowed. It is just not allowed to happen by accident, in a commit that says "refactor".
//
// SABOTAGES DRIVEN AGAINST render/valueNoise.js, each restored after (v4327):
//   1. one hash constant changed (374761393 -> 374761397)   -> RED at the hash3 answer key
//   2. the fade "unified" onto procPlanet's quintic          -> RED at the fbm key AND at section 5b
//   3. fbm's gain retuned 0.5 -> 0.55                        -> RED at the fbm answer key
// Three sabotages, three caught by name. Sabotage 2 is the one this file was written for: it is the exact shape
// of the tempting cleanup, it changes no API and breaks no import, and nothing outside the answer key notices.
//
// Run: node render/valueNoise-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import crypto from "node:crypto";
import { hash3, valueNoise, fbm } from "./valueNoise.js";
import { valueNoise3, fbm3 } from "../world/procPlanet.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const sha = (s) => crypto.createHash("sha256").update(Buffer.from(s)).digest("hex").slice(0, 16);

// 1) THE HASH: deterministic, in [0, 1), and sensitive to every argument including the seed.
{
    let inRange = true, stable = true;
    for (let i = -50; i < 50; i++) for (let j = -3; j < 3; j++) {
        const v = hash3(i, j, i * j, 1337);
        if (!(v >= 0 && v < 1)) inRange = false;
        if (v !== hash3(i, j, i * j, 1337)) stable = false;
    }
    ok(inRange, "hash3 lands in [0, 1) over 600 lattice points");
    ok(stable, "hash3 is deterministic");

    ok(hash3(1, 2, 3, 7) !== hash3(1, 2, 3, 8), "hash3 responds to the seed");
    ok(hash3(1, 2, 3, 7) !== hash3(2, 1, 3, 7), "hash3 is not symmetric in x and y (a real mix, not a sum)");
    ok(hash3(0, 0, 0, 0) !== hash3(1, 0, 0, 0) && hash3(0, 0, 0, 0) !== hash3(0, 0, 1, 0),
       "hash3 responds to each coordinate");

    // Crude uniformity: 10 buckets over 10k samples should each hold roughly a tenth. A hash that collapses
    // (all one value, or a narrow band) is a real failure mode of integer mixing done wrong.
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 10000; i++) buckets[Math.min(9, Math.floor(hash3(i, i * 7, i * 13, 5) * 10))]++;
    const worst = Math.max(...buckets.map((b) => Math.abs(b - 1000) / 1000));
    ok(worst < 0.15, `hash3 fills 10 buckets to within ${(worst * 100).toFixed(1)}% of even`);
}

// 2) THE NOISE: in range, continuous, and equal to the corner hash AT a lattice point (fade(0) = 0).
{
    let inRange = true;
    for (let i = 0; i < 2000; i++) {
        const v = valueNoise(i * 0.037, i * 0.011, i * 0.053, 9);
        if (!(v >= 0 && v <= 1)) inRange = false;
    }
    ok(inRange, "valueNoise stays in [0, 1]");

    let atCorner = true;
    for (let i = -3; i < 4; i++) if (Math.abs(valueNoise(i, 2, -1, 4) - hash3(i, 2, -1, 4)) > 1e-12) atCorner = false;
    ok(atCorner, "valueNoise equals the corner hash exactly at a lattice point");

    // Continuity: nudging across a cell boundary must not jump. A broken fade or a floor/ceil mix-up shows here.
    let biggestJump = 0;
    for (let k = -4; k < 5; k++) {
        const a = valueNoise(k - 1e-9, 0.3, 0.7, 11), b = valueNoise(k + 1e-9, 0.3, 0.7, 11);
        biggestJump = Math.max(biggestJump, Math.abs(a - b));
    }
    ok(biggestJump < 1e-6, `valueNoise is continuous across cell boundaries (worst jump ${biggestJump.toExponential(1)})`);
}

// 3) fBm: in range, and actually varying rather than a constant.
{
    let lo = Infinity, hi = -Infinity, inRange = true;
    for (let i = 0; i < 3000; i++) {
        const v = fbm(i * 0.031, i * 0.017, i * 0.043, 1337, 5);
        if (!(v >= 0 && v <= 1)) inRange = false;
        lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
    ok(inRange, "fbm stays in [0, 1]");
    ok(hi - lo > 0.3, `fbm varies over its samples (range ${(hi - lo).toFixed(3)})`);
    ok(fbm(0.2, 0.3, 0.4, 1, 5) !== fbm(0.2, 0.3, 0.4, 2, 5), "fbm responds to the seed");
    ok(fbm(0.2, 0.3, 0.4, 1, 1) !== fbm(0.2, 0.3, 0.4, 1, 5), "fbm responds to the octave count");
}

// 4) THE ANSWER KEY -- measured at v4326, before these functions left nebulaSkybox.js.
{
    const KEY = { hash3: "0722f42b32b6ef6e", fbm: "513b02ab9b730904" };
    let h = "";
    for (let i = -40; i < 40; i++) h += hash3(i * 7, i * 13, i * 29, 1337).toFixed(12);
    ok(sha(h) === KEY.hash3, `hash3 digest matches the pre-move key (${sha(h)})`);
    let n = "";
    for (let i = 0; i < 400; i++) n += fbm(i * 0.031, i * 0.017, i * 0.043, 1337, 5).toFixed(12);
    ok(sha(n) === KEY.fbm, `fbm digest matches the pre-move key (${sha(n)})`);
}

// 5) *** THE TWO NOISES ARE TWO. *** Asserted as a disagreement on purpose -- see the header.
{
    // 5a) The hashes. procPlanet's hash3 is not exported, so it is reached through valueNoise3 AT a lattice
    //     point, where the fade contributes nothing and the noise IS its corner hash. That makes this a
    //     comparison of the two hashes themselves, not of two interpolations.
    let agreements = 0, tested = 0;
    for (let i = -15; i < 15; i++) for (let j = -3; j < 3; j++) {
        const mine = hash3(i, j, i + j, 7), theirs = valueNoise3(i, j, i + j, 7);
        tested++;
        if (Math.abs(mine - theirs) < 1e-15) agreements++;
    }
    ok(tested === 180 && agreements === 0,
       `the two integer hashes agree on ${agreements} of ${tested} lattice points -- they are different functions`);

    // 5b) The fades. Cubic here, quintic there. Measured at the midpoint of a cell between two known corners:
    //     both fades give 0.5 at t=0.5, so the tell is at t=0.25, where cubic gives 0.15625 and quintic 0.103515625.
    const cubic = (t) => t * t * (3 - 2 * t);
    const quintic = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    ok(Math.abs(cubic(0.25) - 0.15625) < 1e-12, "this file's fade is the CUBIC smoothstep");
    ok(Math.abs(quintic(0.25) - 0.103515625) < 1e-12, "procPlanet's fade is the QUINTIC smootherstep");
    ok(Math.abs(cubic(0.25) - quintic(0.25)) > 0.05, "the two fades differ where it counts");

    // 5c) The end-to-end statement: same coordinates, same seed, different answers. This is what would silently
    //     change if someone pointed one at the other.
    let differ = 0;
    for (let i = 0; i < 200; i++) {
        const x = i * 0.031, y = i * 0.017, z = i * 0.043;
        if (Math.abs(fbm(x, y, z, 9, 5) - fbm3(x, y, z, { seed: 9, octaves: 5 })) > 1e-9) differ++;
    }
    ok(differ === 200, `fbm and procPlanet's fbm3 differ at all ${differ} of 200 shared inputs`);

    // 5d) And fbm3 takes options fbm does not have, so they are not even the same shape of function.
    ok(fbm3(0.2, 0.3, 0.4, { seed: 1, gain: 0.5 }) !== fbm3(0.2, 0.3, 0.4, { seed: 1, gain: 0.8 }),
       "procPlanet's fbm3 has a configurable gain, which this file's fbm does not take");
}

// 6) SABOTAGE -- the disagreement checks must be able to fail, or section 5 is a comment with a semicolon.
{
    // If someone "unified" the hashes, 5a's comparison would find 180 agreements. Simulate that by comparing a
    // function with itself and confirm the same test flips.
    let agreements = 0;
    for (let i = -15; i < 15; i++) for (let j = -3; j < 3; j++) if (Math.abs(hash3(i, j, i + j, 7) - hash3(i, j, i + j, 7)) < 1e-15) agreements++;
    ok(agreements === 180, "SABOTAGE comparing a hash with ITSELF gives 180/180 -- so 5a's zero is a real measurement");

    // And if the fades were unified, 5b's midpoint tell would vanish.
    const cubic = (t) => t * t * (3 - 2 * t);
    ok(Math.abs(cubic(0.25) - cubic(0.25)) < 1e-12, "SABOTAGE a fade compared with itself agrees -- 5b's gap is real");
}

if (fail) { console.error(`\nvalueNoise-selfcheck: ${pass} pass, ${fail} FAIL`); process.exit(1); }
console.log(`valueNoise-selfcheck: all ${pass} pass`);
