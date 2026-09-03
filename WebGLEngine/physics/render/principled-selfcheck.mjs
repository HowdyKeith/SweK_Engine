// WebGLEngine/physics/render/principled-selfcheck.mjs
//
// Run: node physics/render/principled-selfcheck.mjs   (~4s -- MEASURED)
//
// v4432 -- *** THE COMPOSITION DOUBLE-COUNTS AT THE SEAMS, AND THE FURNACE SAYS BY HOW MUCH: 1.0796. ***
//
// docs/EXPLAIN-ITSELF.md item 9, from reading knightcrawler25/GLSL-PathTracer (MIT, C++/OpenGL, Disney BSDF).
// That renderer ships the model; this tree had every PIECE of one and no composition, and item 9 predicted in
// writing that the interesting question would be whether the lobes conserve energy where they meet. THEY DO
// NOT. On a white surface at metallic 0, roughness 1, cosO 0.15, Disney's weighting returns a directional
// albedo of 1.0796 -- EIGHT PER CENT MORE LIGHT THAN ARRIVED -- because the diffuse lobe is scaled only by
// (1 - metallic) and Schlick's grazing term rides on top of it.
//
// THAT IS NOT A BUG IN DISNEY'S MODEL, IT IS ITS STATED TRADE: the interface reflection is not removed from
// what reaches the substrate, for artist-controllability. So both weightings ship and are named, and each is
// held to what it actually is: `coupled` scales the diffuse by (1 - F) and conserves at 0.99997; the default
// does not and is asserted to be exactly as non-conserving as measured, rather than quietly bounded by 1.
//
// THE OTHER THREE FINDINGS ARE ABOUT INSTRUMENTS, NOT MODELS:
//   * `specular: 0` does not remove the specular lobe -- Schlick at F0 = 0 keeps its grazing term -- so the
//     diffuse-limit check disagreed with roughDiffuse by 2.1e-2 at cosO 0.3 and 1.0e-4 at 0.95, an error
//     growing exactly where that term lives. With `lobes: "diffuse"` the two agree to 1.2e-15.
//   * albedoSplit isolated the specular lobe by ZEROING baseColour, which also zeroes a metal's F0: it would
//     have read 0 for every metal while looking like a split. Second parameter-trick in one file.
//   * the mirror limit reads ZERO at roughness 0.001, and that is the GRID, not the model. See section 3.
//
// SABOTAGES (4, all logged, MEASURED 1/1/1/3 by name):
//   A. one-sided coupling, (1 - F(cosO)) alone -> the coupled-reciprocity row goes red. THAT ROW EXISTS
//      BECAUSE OF THIS SABOTAGE: an earlier run made `coupled` the default and reciprocity broke by 1.6e-1,
//      which is how the one-sidedness was found at all. The check now runs on both weightings.
//   B. alpha = roughness instead of roughness^2 -> the grid-refinement row goes red, because the lobe stops
//      being where the resolution argument says it is.
//   C. metals get a diffuse lobe (drop the 1 - metallic) -> the furnace row goes red, energy above the range.
//   D. the specular lobe loses its 1/(4 cosO cosI) denominator -> 3 red.
"use strict";
import * as P from "./principled.mjs";
import { schlick } from "./fresnel.mjs";
import { directionalAlbedo as roughDiffuseAlbedo } from "./roughDiffuse.mjs";
import { gateReport } from "../../tools/ship/gateReport.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const REPORT = gateReport("physics/render/principled-selfcheck.mjs");
const white = (extra) => ({ baseColour: [1, 1, 1], specular: 0.5, sigma: 0, ...extra });

console.log("\n1. THE COMPOSED MODEL IS THE PIECES AT THEIR LIMITS, or the keys grade a different renderer");
{
    // *** THE STRONGEST CHECK IN THE FILE. *** physics/render/pathTracer.mjs's rule is that a renderer is
    // assembled FROM the graded modules rather than beside them. This is that rule made falsifiable: at
    // metallic 0 with only the diffuse lobe, the composed model must BE roughDiffuse, to floating point.
    let worst = 0, at = null;
    for (const sigma of [0, 0.2, 0.4]) {
        for (const cosO of [0.15, 0.3, 0.55, 0.7, 0.95]) {
            const mine = P.directionalAlbedo({ baseColour: [0.8, 0.8, 0.8], ...P.LIMITS.diffuseOnly, sigma }, cosO, { N: 128, M: 64 });
            const ref = 0.8 * roughDiffuseAlbedo(cosO, sigma, { N: 128, M: 64 });
            const d = Math.abs(mine - ref);
            if (d > worst) { worst = d; at = { sigma, cosO, mine, ref }; }
        }
    }
    ok("!! *** at the diffuse limit the composed BSDF IS roughDiffuse, not merely close to it ***", worst < 1e-12,
        `worst absolute difference ${worst.toExponential(2)} across 15 (sigma, cosO) pairs` +
        (at ? ` -- at sigma ${at.sigma}, cosO ${at.cosO}: ${at.mine.toFixed(9)} against ${at.ref.toFixed(9)}` : ""));
    ok("!! ...and the limit needed `lobes: \"diffuse\"`, because `specular: 0` does NOT remove the lobe",
        (() => { const withZero = P.directionalAlbedo(white({ metallic: 0, roughness: 1, specular: 0 }), 0.3, { N: 128, M: 64 });
                 const isolated = P.directionalAlbedo(white({ ...P.LIMITS.diffuseOnly }), 0.3, { N: 128, M: 64 });
                 return Math.abs(withZero - isolated) > 1e-3; })(),
        "Schlick is F0 + (1 - F0)(1 - cos)^5: at F0 = 0 the constant term goes and the GRAZING term stays. " +
        "A knob that happens to suppress a term is not the same as naming the term");
}

console.log("\n2. THE FURNACE: what the composition does to energy, measured rather than assumed");
const GRID = { m: [0, 0.5, 1], r: [0.05, 0.2, 0.5, 0.8, 1], c: [0.15, 0.4, 0.7, 0.95] };
const sweep = (coupled) => {
    let worst = 0, at = null;
    for (const m of GRID.m) for (const r of GRID.r) for (const cosO of GRID.c) {
        const a = P.directionalAlbedo(white({ metallic: m, roughness: r, coupled }), cosO, { N: 96, M: 48 });
        if (a > worst) { worst = a; at = { m, r, cosO }; }
    }
    return { worst, at };
};
{
    const disney = sweep(false), coupled = sweep(true);
    ok("!! *** Disney's weighting CREATES ENERGY, and the number is the finding rather than a worry ***",
        disney.worst > 1.05 && disney.worst < 1.15,
        `worst directional albedo ${disney.worst.toFixed(5)} at metallic ${disney.at.m}, roughness ${disney.at.r}, ` +
        `cosO ${disney.at.cosO} -- ${((disney.worst - 1) * 100).toFixed(1)}% more light than arrived. THE DIFFUSE ` +
        "LOBE IS NOT SCALED BY (1 - F), which is Disney's stated trade for artist-controllability, not an error " +
        "in the port. It is asserted as a RANGE so that a change either way is a red rather than a silence");
    ok("!! *** and the coupled weighting conserves: no parameter in the grid returns more than it received ***",
        coupled.worst <= 1 && coupled.worst > 0.9,
        `worst ${coupled.worst.toFixed(5)} at metallic ${coupled.at.m}, roughness ${coupled.at.r}, cosO ${coupled.at.cosO}. ` +
        "Removing what the interface took is the whole difference between the two");
    ok("...and the coupled model is never BRIGHTER than the uncoupled one, which is the direction (1 - F) can move it",
        GRID.c.every((cosO) => P.directionalAlbedo(white({ metallic: 0, roughness: 0.8, coupled: true }), cosO, { N: 96, M: 48 })
                             <= P.directionalAlbedo(white({ metallic: 0, roughness: 0.8, coupled: false }), cosO, { N: 96, M: 48 })),
        "a coupling that made a surface brighter somewhere would be a sign error, and that is a cheap thing to rule out");
    REPORT.table("directional albedo across the parameter grid", ["weighting", "worst albedo", "metallic", "roughness", "cosO"],
        [["Disney (default)", disney.worst.toFixed(5), String(disney.at.m), String(disney.at.r), String(disney.at.cosO)],
         ["coupled (1 - F)", coupled.worst.toFixed(5), String(coupled.at.m), String(coupled.at.r), String(coupled.at.cosO)]],
        "60 parameter combinations each. Above 1.0 is light the surface did not receive.");
}

console.log("\n3. THE MIRROR LIMIT, and how to tell an instrument failure from a model failure");
{
    // *** THE FIRST DRAFT READ 0.0000 AT roughness 0.001 AND CALLED IT A FAILED LIMIT. *** It is a failed
    // INTEGRAL: a GGX lobe at alpha = 1e-6 is very nearly a delta, and a fixed hemisphere grid steps straight
    // over it. The way to tell the two apart is to REFINE THE INSTRUMENT AND SEE IF THE ANSWER MOVES -- a model
    // failure does not care how finely you integrate, and this one does.
    const spec = (r, N) => P.directionalAlbedo(white({ metallic: 1, roughness: r, specular: 1, lobes: "specular" }), 0.7, { N, M: N / 2 });
    const rows = [1, 0.6, 0.4, 0.3, 0.2, 0.15, 0.1, 0.05].map((r) => [r, spec(r, 192), spec(r, 768)]);
    const target = schlick(0.7, 1);
    const bestCoarse = Math.max(...rows.map((x) => x[1])), bestFine = Math.max(...rows.map((x) => x[2]));
    ok("!! *** as roughness falls the specular albedo approaches the Fresnel value: the mirror limit is reached ***",
        bestFine > 0.99 && Math.abs(target - 1) < 1e-9,
        `best ${bestFine.toFixed(4)} against schlick(0.7, F0 = 1) = ${target.toFixed(4)}`);
    const cliffCoarse = rows.find((x) => x[1] < 0.9 * target && x[0] < 0.3);
    const cliffFine = rows.find((x) => x[2] < 0.9 * target && x[0] < 0.3);
    ok("!! *** and the collapse below it MOVES when the grid refines, which is how it is known to be the grid ***",
        !!cliffCoarse && !!cliffFine && cliffFine[0] < cliffCoarse[0],
        `at N=192 the integral falls apart below roughness ${cliffCoarse ? cliffCoarse[0] : "?"}; at N=768, below ` +
        `${cliffFine ? cliffFine[0] : "?"}. A LIMIT THAT MOVES WHEN YOU REFINE THE INSTRUMENT IS THE INSTRUMENT. ` +
        "The model is not asserted below the roughness the grid resolves, and that is stated rather than papered");
    REPORT.table("specular albedo against grid resolution", ["roughness", "N=192", "N=768"],
        rows.map((x) => [String(x[0]), x[1].toFixed(4), x[2].toFixed(4)]),
        "Both columns integrate the same model. Where they disagree, the coarse one is wrong.");
}

console.log("\n4. the lobes are separable and the model is reciprocal");
{
    let worstSum = 0;
    for (const m of [0, 0.4, 1]) for (const cosO of [0.3, 0.7]) {
        const s = P.albedoSplit(white({ metallic: m, roughness: 0.5 }), cosO, { N: 96, M: 48 });
        worstSum = Math.max(worstSum, s.sums);
    }
    ok("specular + diffuse = total, so the split is a decomposition and not two separate renders", worstSum < 1e-12,
        `worst residual ${worstSum.toExponential(2)} across six (metallic, cosO) pairs`);
    let worstRec = 0;
    const p = { baseColour: [0.7, 0.5, 0.3], metallic: 0.3, roughness: 0.4, specular: 0.5, sigma: 0.2 };
    for (const a of [0.2, 0.5, 0.8]) for (const b of [0.25, 0.6, 0.9]) {
        const f1 = P.evaluate(p, a, b, 0.95, 0.7, 0), f2 = P.evaluate(p, b, a, 0.95, 0.7, 0);
        worstRec = Math.max(worstRec, Math.abs(f1 - f2) / Math.max(1e-12, Math.abs(f1)));
    }
    // *** AND THE COUPLED MODEL IS CHECKED TOO, BECAUSE A SABOTAGE SHOWED IT WAS THE ONE AT RISK. ***
    // Making `coupled` the default broke reciprocity by 1.6e-1: the first version scaled the diffuse by
    // (1 - F(cosO)) alone, and a factor that depends on only one of the two directions cannot be symmetric in
    // them. Light loses the interface reflection going in and coming out, so it is both -- and the row that
    // would have caught it only ran on the uncoupled model, which is why it runs on both now.
    let worstRecC = 0;
    const pc = { ...p, coupled: true };
    for (const a of [0.2, 0.5, 0.8]) for (const b of [0.25, 0.6, 0.9]) {
        const f1 = P.evaluate(pc, a, b, 0.95, 0.7, 0), f2 = P.evaluate(pc, b, a, 0.95, 0.7, 0);
        worstRecC = Math.max(worstRecC, Math.abs(f1 - f2) / Math.max(1e-12, Math.abs(f1)));
    }
    ok("!! ...and the COUPLED model is reciprocal too, which the one-sided first version was not",
        worstRecC < 1e-12, `worst relative difference ${worstRecC.toExponential(2)} with (1 - F(cosO))(1 - F(cosI))`);
    ok("!! f(wo, wi) = f(wi, wo): the BSDF is reciprocal", worstRec < 1e-12,
        `worst relative difference ${worstRec.toExponential(2)}. NOTE THE LIMIT: this swaps the two cosines at a ` +
        "FIXED half-vector, which is what an isotropic lobe pair allows; it is not a full-vector reciprocity test");
}

say("WHAT THIS DOES NOT CLAIM. That the model is Disney's, in full: this composes the diffuse and specular " +
    "lobes and has NO sheen, NO clearcoat, NO anisotropy, NO transmission and NO subsurface, which are five of " +
    "the parameters that make that model what it is. That rough metals are right: the specular lobe is " +
    "SINGLE-SCATTER GGX, so a white metal at roughness 1 returns 0.379 of what it receives, and the tree's own " +
    "energyCompensation.mjs -- a multi-scatter table already graded -- is NOT WIRED IN. That is the next round " +
    "of this item and the reason the furnace numbers above are ceilings rather than answers. And that the " +
    "sampler is correct: sample() exists and nothing here checks that its pdf integrates to one or that a Monte " +
    "Carlo estimate through it agrees with these integrals, which is a real gap and is why every number on this " +
    "page comes from quadrature instead.");

REPORT.write();
console.log(`\nprincipled-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
