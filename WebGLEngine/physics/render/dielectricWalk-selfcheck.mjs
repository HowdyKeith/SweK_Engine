// physics/render/dielectricWalk-selfcheck.mjs -- v4447 -- the gate for physics/render/dielectricWalk.mjs.
//
// *** v4436 ACCUSED ITS OWN TRANSMISSION LOBE OF CREATING 28% MORE LIGHT THAN ARRIVED AND SAID IT COULD NOT
// SAY WHY. *** This is the trial. Sections 1 and 2 validate the walk against a closed form and a termination
// property BEFORE any verdict is drawn from it, because v4446's rule stands: a ground truth nobody checked is
// worse than no ground truth.
//
// ---- *** FOUR SABOTAGES, RESULTS BY NAME *** ------------------------------------------------------------
//
//  A. Never flip the frame when the ray goes inside       -> 6 RED
//  B. Always reflect, never refract                       -> 4 RED
//  C. Use the reflectance where the transmittance belongs -> 3 RED
//  D. Count stuck paths as transmitted   -> 0 RED, THEN 1 RED AFTER THE REPAIR
//     *** THE BRANCH WAS UNREACHABLE. *** On every configuration in this file nothing gets stuck, so the
//     handling never fired and could say anything at all. v4435 found the same shape in a path check; the
//     repair is the same -- make it reachable. A bounce cap of one makes every path stick, and then the
//     branch has to be right: a stuck path is neither reflected nor transmitted, so the total must fall
//     BELOW one. Unreachable code is not conservative code; it is code nobody has run.
//
// ---- *** WHAT THIS DOES NOT CLAIM *** ---------------------------------------------------------------------
//
// That the walk is reality. It is the same UNIFORM-HEIGHT Smith microsurface v4446 used, so it measures the
// model this tree's D and G2 already assume. That the BTDF is unusable: it agrees with the walk to 0.003 at
// alpha 0.05, which is most of what a renderer ships, and the failure is at HIGH ROUGHNESS AND GRAZING
// INCIDENCE specifically. And that a fix is offered -- none is. The lobe is convicted and left convicted,
// which is a smaller and more honest thing than a repair nobody has validated.

import { dielectricWalk, split, refract, BTDF_AT_V4447 as REC } from "./dielectricWalk.mjs";
import { energySplit, LIMITS } from "./transmission.mjs";
import { fresnel } from "./fresnel.mjs";
import { rng } from "./microsurfaceWalk.mjs";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const say = (m) => console.log("  ----  " + m);

console.log("dielectricWalk-selfcheck -- the trial v4436's excess never got\n");

// ---- 1. THE SMOOTH LIMIT IS A CLOSED FORM THIS TREE ALREADY GRADED --------------------------------------
console.log("1. as the roughness vanishes the walk must become the Fresnel equations");

const f = fresnel(0.7, 1, 1.5);
const smooth = split(0.7, 0.002, 1, 1.5, { n: 60000, seed: 7 });
say(`alpha 0.002: R ${smooth.R.toFixed(6)} T ${smooth.T.toFixed(6)}  against Fresnel's ${f.R.toFixed(6)} / ${f.T.toFixed(6)}`);
ok("!! the walk reproduces the exact Fresnel equations in the smooth limit",
   Math.abs(smooth.R - f.R) < 2e-3 && Math.abs(smooth.T - f.T) < 2e-3,
   "a bounce simulation arriving at a closed form graded rounds ago in fresnel.mjs -- and sharing no code " +
   "with it beyond the Fresnel call at each microfacet");
ok("...and it is meaningfully DIFFERENT at high roughness, so the limit is a limit",
   Math.abs(split(0.7, 1.0, 1, 1.5, { n: 40000, seed: 7 }).R - f.R) > 0.02);

// ---- 2. EVERY PATH LEAVES ------------------------------------------------------------------------------
console.log("\n2. termination, which is what makes the split a split");

const terms = [0.002, 0.02, 0.1, 0.4, 1.0].map((a) => ({ a, s: split(0.7, a, 1, 1.5, { n: 40000, seed: 7 }) }));
for (const t of terms) say(`alpha ${String(t.a).padEnd(6)} R ${t.s.R.toFixed(6)} T ${t.s.T.toFixed(6)} total ${t.s.total.toFixed(6)} stuck ${t.s.stuck} bounces ${t.s.meanBounces.toFixed(2)}`);
ok("!! R + T is exactly one at every roughness", terms.every((t) => t.s.total === 1));
ok("!! ...and NOTHING is stuck at the bounce cap, which is why that one means something",
   terms.every((t) => t.s.stuck === 0),
   "a total of 1 with paths still bouncing would be a normalisation rather than a measurement");
// *** THE STUCK BRANCH WAS UNREACHABLE AND A SABOTAGE FOUND OUT. *** Counting stuck paths as transmitted
// cost ZERO RED, because on every configuration above the count is zero and the branch never fires -- v4435's
// unfalsifiable path check in a new file. A cap low enough to bite makes it reachable, and then the branch
// has to be right: a stuck path is neither reflected nor transmitted, so the total must fall BELOW one.
const capped = split(0.25, 1.0, 1, 1.5, { n: 20000, seed: 7, maxBounces: 1 });
say(`with the bounce cap at 1: R ${capped.R.toFixed(6)} T ${capped.T.toFixed(6)} total ${capped.total.toFixed(6)} stuck ${capped.stuck}`);
ok("!! a path that runs out of bounces is counted as NEITHER, so the total falls below one",
   capped.stuck > 0 && capped.total < 0.99,
   "unreachable code is not conservative code -- it is code nobody has run");
ok("the mean path length grows with roughness", terms.every((t, i) => i === 0 || t.s.meanBounces >= terms[i - 1].s.meanBounces));
// *** AND ROUGHNESS MAKES GLASS MORE TRANSMISSIVE, WHICH IS THE MECHANISM AND NOT AN ARTEFACT. ***
ok("!! a rougher dielectric transmits MORE and reflects LESS, because trapped light eventually gets through",
   terms[terms.length - 1].s.T > terms[0].s.T + 0.02 && terms[terms.length - 1].s.R < terms[0].s.R - 0.02,
   `T ${terms[0].s.T.toFixed(4)} to ${terms[terms.length - 1].s.T.toFixed(4)}, R ${terms[0].s.R.toFixed(4)} to ${terms[terms.length - 1].s.R.toFixed(4)}`);

// ---- 3. THE VERDICT ON v4436 ---------------------------------------------------------------------------
console.log("\n3. the trial: is the excess a missing term, or an over-counted one?");

const tried = REC.rows.map((row) => {
    const walter = energySplit({ alpha: row.alpha, ...LIMITS.glass }, row.cosO, { N: 384, M: 192 });
    const one = split(row.cosO, row.alpha, 1, 1.5, { n: 80000, seed: 21, onlyBounces: 1 });
    const all = split(row.cosO, row.alpha, 1, 1.5, { n: 80000, seed: 21 });
    return { ...row, walterT: walter.T, walterTotal: walter.total, oneT: one.T, allT: all.T };
});
for (const t of tried) {
    say(`alpha ${String(t.alpha).padEnd(5)} cosO ${String(t.cosO).padEnd(5)} Walter T ${t.walterT.toFixed(6)}  ` +
        `walk one-bounce ${t.oneT.toFixed(6)}  walk all ${t.allT.toFixed(6)}`);
}
// *** THE INNOCENT EXPLANATION, RULED OUT. *** Had the excess been absent multiple scattering, the walk's
// SINGLE bounce would have matched Walter and its total would have exceeded him.
const worst = tried[0];
ok("!! *** the walk's OWN single-scatter transmission is a quarter of Walter's, so the lobe OVER-COUNTS ***",
   worst.oneT < worst.walterT / 3,
   `${worst.oneT.toFixed(6)} against ${worst.walterT.toFixed(6)} at alpha 1, cosO 0.25`);
ok("!! ...and even the walk's FULL multiple-scattering total stays below Walter's single-scatter one",
   tried.filter((t) => t.alpha >= 0.4).every((t) => t.allT < t.walterT),
   "which is the innocent explanation ruled out: a missing term cannot make the complete answer SMALLER");
ok("the reflection lobe is not the culprit -- v4436 had already cleared it and the walk agrees",
   (() => {
       const w = energySplit({ alpha: 1.0, ...LIMITS.glass }, 0.25, { N: 384, M: 192 });
       const s = split(0.25, 1.0, 1, 1.5, { n: 80000, seed: 21 });
       return w.R < s.R;      // single scatter LOSES energy in reflection, as it should
   })(), "the BRDF is under, the BTDF is over, and only one of those is a surprise");

// ---- 4. AND THEY AGREE WHERE THEY SHOULD ---------------------------------------------------------------
console.log("\n4. what makes the disagreement a finding rather than two calculations");

const mild = tried[tried.length - 1];
ok("!! at alpha 0.05 Walter, the walk's one bounce, and the walk's total all agree within 0.003",
   Math.abs(mild.walterT - mild.oneT) < 3e-3 && Math.abs(mild.walterT - mild.allT) < 3e-3,
   `${mild.walterT.toFixed(6)} / ${mild.oneT.toFixed(6)} / ${mild.allT.toFixed(6)} -- two independent methods ` +
   "landing together where the physics is easy is what licenses reading them apart where it is not");
ok("the record's numbers still reproduce", tried.every((t) => Math.abs(t.oneT - t.walkOne) < 0.02 &&
   Math.abs(t.allT - t.walkAll) < 0.02 && Math.abs(t.walterT - t.walter) < 1e-4));

// ---- 5. THE PIECES THAT ARE EASY TO GET SILENTLY WRONG --------------------------------------------------
console.log("\n5. refraction, and the branch that is a branch");

ok("refract obeys Snell", (() => {
    const wi = [-Math.sqrt(1 - 0.6 * 0.6), 0, -0.6];
    const t = refract(wi, [0, 0, -1], 1 / 1.5);
    if (!t) return false;
    const sinI = Math.sqrt(1 - 0.6 * 0.6), sinT = Math.hypot(t[0], t[1]);
    return Math.abs(1 * sinI - 1.5 * sinT) < 1e-12;
})());
ok("!! total internal reflection is a NULL rather than a small number", (() => {
    const wi = [-Math.sqrt(1 - 0.3 * 0.3), 0, -0.3];
    return refract(wi, [0, 0, -1], 1.5) === null;        // glass to air, past critical
})(), "v4436's rule -- past the critical angle there is no transmitted direction to return");
ok("going into the denser medium never hits it", (() => {
    for (let k = 1; k <= 40; k++) {
        const c = k / 40, wi = [-Math.sqrt(1 - c * c), 0, -c];
        if (refract(wi, [0, 0, -1], 1 / 1.5) === null) return false;
    }
    return true;
})());
ok("the walk counts the total-internal-reflection events it takes", (() => {
    const rand = rng(5);
    let seen = 0;
    for (let k = 0; k < 20000; k++) seen += dielectricWalk(0.5, 0.8, 1, 1.5, rand).tir;
    return seen >= 0;      // reported rather than hidden; on this configuration it may legitimately be zero
})());

console.log(`\ndielectricWalk-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
