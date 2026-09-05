// physics/render/samplerCheck-selfcheck.mjs -- v4437 -- the gate for physics/render/samplerCheck.mjs.
//
// *** WHAT IS GRADED HERE IS A SAMPLER THAT RETURNED NaN FOR FIVE ROUNDS AND A QUADRATURE THAT WAS WRONG BY
// HALF AT ITS OWN DEFAULT GRID. *** Both were found by the same move: put a SECOND estimator beside the first
// and make them disagree out loud. v4432 and v4436 each shipped an honest note saying the sampler was
// unchecked; neither said it was broken, because neither had run it.
//
// ---- *** FOUR SABOTAGES, RESULTS BY NAME *** ------------------------------------------------------------
//
//  A. Restore the `h.cosTheta ?? Math.cos(h.theta)` read (the original NaN bug)  -> 6 RED
//  B. Return the CHOSEN lobe's pdf instead of the mixture's                      -> 3 RED
//  C. Drop the reflection to the small-angle `dot = cosO * cosM` stand-in        -> 3 RED
//  D. Let monteCarloAlbedo divide by `used` instead of by `n`                    -> 4 RED
//     D is the one that would have shipped quietly: dividing by the samples that SURVIVED turns a sampler
//     that rejects half its draws into one that looks unbiased, and it is the same arithmetic that made the
//     first probe of this round report 0.00000 for a metal instead of NaN.
//
// ---- *** WHAT THIS DOES NOT CLAIM *** ---------------------------------------------------------------------
//
// That the sampler is efficient. It is not measured for variance, only for CORRECTNESS -- an estimator can be
// unbiased and still need a hundred times the samples, and nothing here would notice. That the quadrature is
// fixed: it is not, it is CHARACTERISED, and GRID_FAILS_AT_V4437 records where not to believe it. And that
// the GPU port shares this fix -- physics/render/pathTracerGpu.mjs has its own sampler and this round does
// not touch it, which is exactly the independence that made the CPU bug invisible to it.

import { rng, monteCarloAlbedo, agreement, refineLadder, noiseOf, GRID_FAILS_AT_V4437 } from "./samplerCheck.mjs";
import { sample, directionalAlbedo } from "./principled.mjs";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const say = (m) => console.log("  ----  " + m);

console.log("samplerCheck-selfcheck -- two estimators, and each one caught the other\n");

// ---- 1. THE SAMPLER RETURNS NUMBERS AT ALL --------------------------------------------------------------
console.log("1. the bug that hid behind 'ungraded' for five rounds");

const r = rng(4);
let nan = 0, total = 0, specular = 0;
for (const metallic of [0, 0.5, 1]) {
    for (const roughness of [0.05, 0.3, 0.7, 1]) {
        for (let k = 0; k < 400; k++) {
            const s = sample({ baseColour: [1, 1, 1], metallic, roughness, specular: 0.5 }, 0.6, r(), r(), r());
            total++;
            if (s.lobe === "specular") specular++;
            if (Number.isNaN(s.pdf) || Number.isNaN(s.cosI) || Number.isNaN(s.cosM)) nan++;
        }
    }
}
ok("sample() returns no NaN across 4800 draws", nan === 0, `${nan} NaN of ${total}`);
ok("...and the specular branch is actually being taken, so the zero above means something",
   specular > total * 0.4, `${specular} of ${total} draws took the specular lobe`);
// *** THE ROW THAT WOULD HAVE CAUGHT IT: the estimator must report its NaN count rather than skip them. ***
const nanReport = monteCarloAlbedo({ baseColour: [1, 1, 1], metallic: 1, roughness: 0.3, specular: 1 }, 0.7,
                                   { n: 5000 });
ok("monteCarloAlbedo reports nan and zeroPdf counts rather than dropping them",
   nanReport.nan === 0 && typeof nanReport.zeroPdf === "number" && nanReport.used > 0,
   `nan ${nanReport.nan}, zeroPdf ${nanReport.zeroPdf}, used ${nanReport.used} of ${nanReport.n}`);

// ---- 2. THE TWO ESTIMATORS AGREE, ACROSS THE PARAMETER SPACE --------------------------------------------
console.log("\n2. quadrature against Monte Carlo -- 27 configurations, no shared code but the BSDF");

let worst = { ratio: 1 }, agreed = 0, checked = 0;
for (const metallic of [0, 0.5, 1]) {
    for (const roughness of [0.2, 0.5, 0.9]) {
        for (const cosO of [0.35, 0.7, 0.95]) {
            const params = { baseColour: [1, 1, 1], metallic, roughness, specular: 0.5 };
            const a = agreement(params, cosO, { n: 120000, seed: 11, N: 1024, M: 512 });
            checked++;
            if (Math.abs(a.ratio - 1) < 0.01) agreed++;
            if (Math.abs(a.ratio - 1) > Math.abs(worst.ratio - 1)) worst = { ...a, metallic, roughness, cosO };
        }
    }
}
say(`worst ratio ${worst.ratio.toFixed(5)} at metallic ${worst.metallic}, roughness ${worst.roughness}, cosO ${worst.cosO}`);
ok("!! all 27 configurations agree within 1 per cent, on a CONVERGED quadrature grid",
   agreed === checked, `${agreed} of ${checked}`);
// *** THE BOUND IS MEASURED RATHER THAN CHOSEN. *** The first version asserted "within half a per cent" and
// went red at 0.68% on a rough metal -- a number picked because it looked tight, on an estimator whose noise
// nobody had measured. Eight seeds at the same sample count give a relative standard deviation, and the bound
// is three of those. A Monte Carlo check with a hand-picked tolerance passes or fails by taste.
const noise = noiseOf({ baseColour: [1, 1, 1], metallic: 1, roughness: 0.9, specular: 0.5 }, 0.35,
                      { n: 120000, seeds: 8 });
say(`estimator noise at n=120k, 8 seeds: relative sd ${noise.relSd.toExponential(2)} -- bound is 3 sd = ` +
    `${(3 * noise.relSd * 100).toFixed(2)}%`);
ok("...and the worst deviation is inside three measured standard deviations, so it is noise and not bias",
   Math.abs(worst.ratio - 1) < 3 * noise.relSd,
   `${(Math.abs(worst.ratio - 1) / noise.relSd).toFixed(2)} sd`);

// ---- 3. THE DISAGREEMENT THAT CONVICTED THE QUADRATURE ---------------------------------------------------
console.log("\n3. the instrument-versus-model ladder, and this time the instrument lost");

const hard = { baseColour: [1, 1, 1], metallic: 1, roughness: 0.2, specular: 0.5 };
const ladder = refineLadder(hard, 0.35);
say(`quadrature ladder: ${ladder.values.map((v) => v.toFixed(6)).join("  ")}`);
const mcHard = monteCarloAlbedo(hard, 0.35, { n: 400000, seed: 5 });
say(`Monte Carlo at 400k: ${mcHard.value.toFixed(6)}`);
ok("!! the DEFAULT quadrature grid is wrong by half here", ladder.values[0] < 0.6 && ladder.converged > 0.98,
   `${ladder.values[0].toFixed(6)} against a converged ${ladder.converged.toFixed(6)} -- and directionalAlbedo ` +
   "defaults to N=96, M=48, which is this row");
ok("...and the Monte Carlo agreed with the CONVERGED value all along",
   Math.abs(mcHard.value - ladder.converged) / ladder.converged < 0.005,
   "the estimator that needed no refinement was the one that looked like the approximation");
ok("the ladder has actually converged by its last two rungs", ladder.tailDrift < 1e-5,
   `tail drift ${ladder.tailDrift.toExponential(2)}`);
// The rule is a PRODUCT of two conditions, and both halves are asserted so neither can be dropped.
ok("!! a tight lobe alone is not enough -- roughness 0.2 at cosO 0.95 reads correctly on the default grid",
   Math.abs(directionalAlbedo(hard, 0.95, { N: 96, M: 48 }) / directionalAlbedo(hard, 0.95, { N: 2048, M: 1024 }) - 1) < 0.01);
ok("!! ...and an oblique angle alone is not enough -- roughness 0.9 at cosO 0.35 does too",
   Math.abs(directionalAlbedo({ ...hard, roughness: 0.9 }, 0.35, { N: 96, M: 48 }) /
            directionalAlbedo({ ...hard, roughness: 0.9 }, 0.35, { N: 2048, M: 1024 }) - 1) < 0.01);

// ---- 4. THE CLAIM v4432 MADE, RE-CHECKED WITH THE INSTRUMENT NOW KNOWN TO BE FALLIBLE --------------------
console.log("\n4. and the number v4432 shipped, checked rather than assumed safe");

const headline = { baseColour: [1, 1, 1], metallic: 0, roughness: 1, specular: 0.5 };
const hl = refineLadder(headline, 0.15);
say(`v4432's 1.0796, refined: ${hl.values.map((v) => v.toFixed(6)).join("  ")}`);
ok("!! v4432's headline holds under refinement -- it was not taken where the instrument fails",
   hl.drift < 1e-4 && Math.abs(hl.converged - 1.0795) < 1e-3,
   `drift ${hl.drift.toExponential(2)} across the whole ladder; roughness 1 is a broad lobe`);
const hlMc = monteCarloAlbedo(headline, 0.15, { n: 300000, seed: 9 });
ok("...and the second estimator confirms it independently",
   Math.abs(hlMc.value - hl.converged) / hl.converged < 0.01,
   `Monte Carlo ${hlMc.value.toFixed(5)} against quadrature ${hl.converged.toFixed(5)}`);

// ---- 5. THE RECORD -------------------------------------------------------------------------------------
console.log("\n5. the record is a record");

ok("GRID_FAILS_AT_V4437's worst case still reads what it says at the default grid",
   Math.abs(directionalAlbedo(hard, GRID_FAILS_AT_V4437.worst.cosO,
                              { ...GRID_FAILS_AT_V4437.defaultGrid }) -
            GRID_FAILS_AT_V4437.worst.atDefaultGrid) < 1e-4);
ok("...and its converged value too",
   Math.abs(ladder.converged - GRID_FAILS_AT_V4437.worst.converged) < 1e-4);
ok("the headline values in the record match a fresh ladder",
   GRID_FAILS_AT_V4437.headlineStillGood.values.every((v, i) => Math.abs(v - hl.values[i]) < 1e-5));
ok("rng is deterministic -- a reported Monte Carlo number is the same one next run",
   (() => { const a = rng(3), b = rng(3); for (let i = 0; i < 50; i++) if (a() !== b()) return false; return true; })());

console.log(`\nsamplerCheck-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
