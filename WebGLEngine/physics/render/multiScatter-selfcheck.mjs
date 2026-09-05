// physics/render/multiScatter-selfcheck.mjs -- v4445 -- the gate for the multi-scatter term in principled.mjs.
//
// *** v4432 SHIPPED THE SPECULAR LOBE AS SINGLE-SCATTER GGX AND SAID SO IN ITS OWN HONEST SCOPE: *** "a white
// metal at roughness 1 returns 0.379 of what it receives, and this tree's own energyCompensation.mjs -- a
// multi-scatter table already graded -- IS NOT WIRED IN. That makes every furnace number above a CEILING
// rather than an answer." v4436 repeated it. This is the wiring, and the ceiling becomes an answer: 0.378889
// to 0.999817.
//
// ---- *** FOUR SABOTAGES, RESULTS BY NAME *** ------------------------------------------------------------
//
//  A. Scale the lobe by F0 instead of Kulla-Conty's F_ms   -> 0 RED, THEN 3 RED AFTER THE REPAIR
//     *** SECTION 4 COMPARED THE TWO SCALINGS ARITHMETICALLY, WHICH IS TRUE WHATEVER THE MODULE DOES. ***
//     It computed F0 and F_ms and compared them to each other, so swapping the module back cost NOTHING --
//     v4443's defect exactly, a check that re-derives both candidates and grades the copy. Repaired to test
//     BEHAVIOUR: F0 scaling pushes a coloured metal up to roughly F_avg, and the series leaves it well below.
//  B. Drop the (1 - F_avg(1 - Eavg)) denominator from F_ms    -> 1 RED
//  C. Add the multi-scatter term to the DIFFUSE lobe too      -> 1 RED
//  D. Make msLobe asymmetric in its two directions            -> 5 RED
//
// ---- *** WHAT THIS DOES NOT CLAIM *** ---------------------------------------------------------------------
//
// That a coloured metal is now CORRECT. Two exact bounds are asserted -- the compensated value can never fall
// below the uncompensated one, and can never exceed F_avg, which is a hard ceiling because every bounce
// attenuates by at most F_avg -- and the value between them is MEASURED rather than claimed. Pinning it would
// need a random-walk ground truth on a GGX microsurface, which is NOT here and is the honest next step. That
// the table is chromatic: it is not, it is one achromatic table scaled by a scalar F_ms, so a metal with a
// strongly coloured F0 gets one compensation for all three channels rather than three. And nothing here
// touches the DIFFUSE lobe, whose own energy question roughDiffuse.mjs answers separately.

import { evaluate, directionalAlbedo, alphaOf } from "./principled.mjs";
import { buildTable, msLobe, albedoAt } from "./energyCompensation.mjs";
import { schlick } from "./fresnel.mjs";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const say = (m) => console.log("  ----  " + m);
const white = (r) => ({ baseColour: [1, 1, 1], metallic: 1, specular: 1, roughness: r, lobes: "specular" });
const fAvgOf = (f0) => f0 + (1 - f0) / 21;

console.log("multiScatter-selfcheck -- the ceiling v4432 named, turned into an answer\n");

// ---- 1. THE CEILING BECOMES AN ANSWER -------------------------------------------------------------------
console.log("1. the number v4432 and v4436 both reported as a ceiling");

const rows = [0.2, 0.4, 0.6, 0.8, 1.0].map((r) => {
    const T = buildTable(alphaOf(r), { K: 24 });
    return {
        r,
        un: directionalAlbedo(white(r), 0.7, { N: 384, M: 192 }),
        comp: directionalAlbedo({ ...white(r), msTable: T }, 0.7, { N: 384, M: 192 }),
    };
});
for (const x of rows) say(`roughness ${String(x.r).padEnd(4)} uncompensated ${x.un.toFixed(6)}  compensated ${x.comp.toFixed(6)}`);
ok("!! *** the white metal conserves energy at EVERY roughness, where it lost 62% at the worst ***",
   rows.every((x) => Math.abs(x.comp - 1) < 5e-4),
   `worst |1 - albedo| is ${Math.max(...rows.map((x) => Math.abs(x.comp - 1))).toExponential(2)}`);
ok("...and v4432's 0.379 is still reproducible on demand, so the change is visible and not silent",
   Math.abs(rows[rows.length - 1].un - 0.3789) < 1e-3,
   `${rows[rows.length - 1].un.toFixed(6)} -- the control, unchanged`);
ok("the compensation does nothing where there was nothing to fix",
   Math.abs(rows[0].comp - rows[0].un) < 4e-3,
   "at roughness 0.2 single scatter already returns 0.997, so a term that moved it would be manufacturing " +
   "energy rather than restoring it");

// ---- 2. OMITTING THE TABLE MUST CHANGE NOTHING AT ALL ---------------------------------------------------
console.log("\n2. opt-in means bit-identical when it is not opted into");

let worstDrift = 0;
for (const m of [0, 0.5, 1]) {
    for (const r of [0.1, 0.5, 1]) {
        for (const c of [0.2, 0.6, 0.95]) {
            const p = { baseColour: [0.8, 0.8, 0.8], metallic: m, roughness: r, specular: 0.5 };
            const a = evaluate(p, c, 0.6, 0.9, 1, 0);
            const b = evaluate({ ...p, msTable: null }, c, 0.6, 0.9, 1, 0);
            worstDrift = Math.max(worstDrift, Math.abs(a - b));
        }
    }
}
ok("!! passing no table is BIT-IDENTICAL to the pre-v4445 model, across 27 configurations", worstDrift === 0,
   "an exact zero -- every furnace number the earlier rounds reported can still be reproduced");

// ---- 3. THE TWO EXACT BOUNDS ----------------------------------------------------------------------------
console.log("\n3. two bounds that hold by physics, and the measured value between them");

const T1 = buildTable(alphaOf(1.0), { K: 24 });
const coloured = [1, 0.9, 0.5, 0.2, 0.1, 0.04, 0].map((f0) => {
    const base = { baseColour: [f0, f0, f0], metallic: 1, specular: 1, roughness: 1.0, lobes: "specular" };
    return {
        f0,
        un: directionalAlbedo(base, 0.7, { N: 384, M: 192 }),
        comp: directionalAlbedo({ ...base, msTable: T1 }, 0.7, { N: 384, M: 192 }),
        fAvg: fAvgOf(f0),
    };
});
for (const x of coloured) say(`F0 ${String(x.f0).padEnd(5)} uncomp ${x.un.toFixed(6)}  comp ${x.comp.toFixed(6)}  F_avg ${x.fAvg.toFixed(6)}`);
ok("!! compensation never REMOVES energy -- the compensated value is never below the uncompensated one",
   coloured.every((x) => x.comp >= x.un - 1e-12));
ok("!! and never exceeds F_avg, which is a hard ceiling because every bounce attenuates by at most F_avg",
   coloured.every((x) => x.comp <= x.fAvg + 1e-3));
ok("a black conductor gains essentially nothing, because there is nothing to bounce",
   coloured[coloured.length - 1].comp < 0.01);

// *** F_avg's CLOSED FORM IS ASSERTED AGAINST QUADRATURE, because the whole scaling rests on it. ***
let worstF = 0;
for (const f0 of [0, 0.04, 0.5, 0.9, 1]) {
    let s = 0; const N = 200000;
    for (let i = 0; i < N; i++) { const mu = (i + 0.5) / N; s += schlick(mu, f0) * 2 * mu / N; }
    worstF = Math.max(worstF, Math.abs(s - fAvgOf(f0)));
}
ok("!! F_avg = F0 + (1 - F0)/21 exactly, checked against quadrature", worstF < 1e-7,
   `worst ${worstF.toExponential(2)} -- INT (1-mu)^5 2 mu dmu is exactly 1/21, so this is a closed form and ` +
   "not a fit");

// ---- 4. THE CHEAP SCALING, MEASURED SO IT IS NOT MISTAKEN FOR THE RIGHT ONE -----------------------------
console.log("\n4. why the scaling is Kulla-Conty's and not F0");

// *** THIS SECTION FIRST COMPARED THE TWO SCALINGS ARITHMETICALLY AND A SABOTAGE READ ZERO RED. *** It
// computed F0 and F_ms and compared them to each other, which is true whatever the module does -- so swapping
// the module back to F0 scaling cost NOTHING. A check that re-derives both candidates and compares them is
// v4443's defect exactly: it grades the copy. What distinguishes them is BEHAVIOUR, and the behaviours are
// far apart: F0 scaling pushes a coloured metal up to roughly F_avg, and Kulla-Conty leaves it well below,
// because each extra bounce is attenuated again.
const mid = coloured.find((x) => x.f0 === 0.5);
say(`at F0 = 0.5: compensated ${mid.comp.toFixed(6)}, F0 ${mid.f0}, F_avg ${mid.fAvg.toFixed(6)}`);
ok("!! a coloured metal compensates to well BELOW F0, which only the geometric series does",
   mid.comp < mid.f0 * 0.75,
   `${mid.comp.toFixed(6)} against F0 ${mid.f0} -- scaling by F0 instead lands at 0.5007, near the F_avg ` +
   "ceiling, because it charges the attenuation once where the light pays it on every bounce");
ok("...and the gap widens as the material darkens, which is the series compounding",
   (() => {
       const dark = coloured.find((x) => x.f0 === 0.1);
       return dark.comp / dark.f0 < mid.comp / mid.f0;
   })());
ok("F_avg is a CEILING and not a target -- nothing reaches it except the white mirror",
   coloured.filter((x) => x.f0 < 1).every((x) => x.comp < x.fAvg * 0.9) &&
   Math.abs(coloured[0].comp - coloured[0].fAvg) < 5e-4,
   "a material returns F_avg only if every bounce is free, and every bounce is not");

// ---- 5. RECIPROCITY SURVIVES ---------------------------------------------------------------------------
console.log("\n5. the added lobe must not break the law the model already obeyed");

let worstRec = 0;
for (const cO of [0.2, 0.5, 0.9]) {
    for (const cI of [0.3, 0.7, 0.95]) {
        const p = { ...white(1.0), msTable: T1 };
        worstRec = Math.max(worstRec, Math.abs(evaluate(p, cO, cI, 0.9, 1, 0) - evaluate(p, cI, cO, 0.9, 1, 0)));
    }
}
// *** THE FIRST VERSION ASSERTED BIT-EXACTNESS FOR THE COMPOSITION AND THAT WAS NEVER TRUE. *** It went red
// at 5.6e-17, and the BASE model without any multi-scatter term is already 2.8e-17 asymmetric at the same
// inputs -- the specular lobe divides by 4 cosO cosI, and a division whose operands arrive in a different
// order rounds differently. So the claim decomposes: THE ADDED LOBE IS BIT-EXACT, which is a property of its
// construction, and THE COMPOSITION IS SYMMETRIC TO ONE ULP, which is a property of IEEE 754. Asserting the
// stronger thing about the weaker one would have been blaming this round for the arithmetic it inherited.
let baseRec = 0;
for (const cO of [0.2, 0.5, 0.9]) {
    for (const cI of [0.3, 0.7, 0.95]) {
        const p = white(1.0);
        baseRec = Math.max(baseRec, Math.abs(evaluate(p, cO, cI, 0.9, 1, 0) - evaluate(p, cI, cO, 0.9, 1, 0)));
    }
}
say(`reciprocity residual: base model ${baseRec.toExponential(2)}, with multi-scatter ${worstRec.toExponential(2)}`);
ok("!! msLobe itself is symmetric BIT FOR BIT, which is what its construction promises",
   msLobe(T1, 0.2, 0.3) === msLobe(T1, 0.3, 0.2) && msLobe(T1, 0.05, 0.99) === msLobe(T1, 0.99, 0.05),
   "(1 - E(muO))(1 - E(muI)) is symmetric by construction, so an exact zero is the honest test HERE");
ok("...and the composed model stays reciprocal to one ulp, no worse than it already was",
   worstRec < 1e-15 && worstRec <= baseRec * 4,
   "the base model is already asymmetric at 2.8e-17 because the specular lobe divides by 4 cosO cosI -- the " +
   "added term does not make it worse, which is the claim this round is entitled to");
ok("the multi-scatter term is specular-only and never reaches the diffuse lobe", (() => {
    const p = { baseColour: [1, 1, 1], metallic: 0, roughness: 1, specular: 0.5, lobes: "diffuse" };
    return evaluate({ ...p, msTable: T1 }, 0.7, 0.6, 0.9, 1, 0) === evaluate(p, 0.7, 0.6, 0.9, 1, 0);
})(), "roughDiffuse.mjs answers the diffuse lobe's own energy question separately");

console.log(`\nmultiScatter-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
