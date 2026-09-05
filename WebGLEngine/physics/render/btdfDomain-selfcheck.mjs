// physics/render/btdfDomain-selfcheck.mjs -- v4455 -- the gate for physics/render/btdfDomain.mjs.
//
// *** THE CHARGE IS THAT WALTER'S BTDF IS EVALUATED OUTSIDE ITS OWN DOMAIN, AND THE ONLY WAY TO PROVE THAT
// RATHER THAN ASSERT IT IS A BOUND THE FORMULA BREAKS. *** So section 1 checks the INSTRUMENT -- the VNDF must
// integrate to 1 -- before section 2 is allowed to convict anything with it. v4446's rule: a ground truth
// nobody checked is worse than no ground truth.
//
// ---- *** SIX SABOTAGES, RESULTS BY NAME, AND NONE OF THEM WENT ZERO-RED *** --------------------------------
//
//  A. Drop (D2) and keep (D1)                             -> 8 RED
//  B. Make `flipBoundary` a fitted constant 0.15          -> 4 RED
//  C. Let `classify` call everything honest               -> 9 RED
//  D. Enforce (D1) by folding h upward instead of
//     rejecting -- i.e. APPLY THE BUG AS THE FIX          -> 9 RED
//  E. Read the FLIPPED half-vector in `classify`, which
//     is what importing `halfVectorT` would have given    -> 6 RED
//  F. Grade section 8 with the SHIPPED G2 instead of the
//     beta one, i.e. claim chi+ alone reaches the walk    -> 1 RED, THEN 2 RED AFTER THE REPAIR
//     *** ONE RED WAS TOO FEW AND THE REASON IS A SECOND COPY. *** The section named the fixed lobe twice --
//     once in the headline comparison and once, spelled out again, inside the multi-configuration check --
//     so reverting one left the other grading a configuration the sabotage never reached. Not a wrong
//     answer, a NARROW one: half the section was measuring something else. There is one frozen FIXED object
//     now and every check in the section reads it, so a single revert reds the point and its control both.
//
// *** THAT ALL SIX WENT RED IS THE PART WORTH RECORDING, BECAUSE THE LAST SIX ROUNDS EACH FOUND ONE THAT DID
// NOT. *** v4443 and v4445 both found a check that re-derived the thing under test and then graded its own
// copy; v4435, v4436 and v4447 each found a check nothing reached. Every section here is pinned instead to a
// number arrived at by a DIFFERENT ROUTE -- section 1 to a half-vector-space integral that never applies the
// Jacobian, section 4 to the shipped `btdf` itself, section 5 to a Monte Carlo walk that shares no line of
// code with the formula. A sabotage can move one route or the other, and moving both to the same wrong place
// is a much harder thing to do by accident. D is the sharpest case: it IS the defect this file convicts,
// re-applied as though it were the repair, and it lands 9 RED because section 2 compares the enforced integral
// to an ABSOLUTE ceiling rather than to the as-written value it is supposed to differ from.
//
// ---- *** WHAT THIS GATE DOES NOT CLAIM *** ----------------------------------------------------------------
//
// That the enforced lobe is correct -- it is 2.17x the walk's single-scatter truth, section 6 says so out loud
// rather than quietly not testing it, and section 8 shows what the remaining 2.17x actually was. That the walk is reality; it is the same uniform-height Smith
// microsurface the tree's D and G2 already assume. And that transmission.mjs has been repaired: it has not
// been touched, on purpose, so the two can be measured against each other.

import {
    rawHalfVector, flipBoundary, classify, btdfDomain, domainSplit, vndfCeiling, walkBins,
    DOMAIN, OVERCOUNT_AT_V4455 as REC,
} from "./btdfDomain.mjs";
import { btdf, energySplit, LIMITS } from "./transmission.mjs";
import { dielectricWalk } from "./dielectricWalk.mjs";
import { rng } from "./microsurfaceWalk.mjs";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const say = (m) => console.log("  ----  " + m);

const AT = { alpha: 1, nAbove: 1, nBelow: 1.5 };
const COS_I = 0.25;

console.log("btdfDomain-selfcheck -- where the transmission lobe over-counts\n");

// ---- 1. THE INSTRUMENT, GRADED BEFORE IT IS BELIEVED ------------------------------------------------------
console.log("1. the visible-normal distribution is a probability density, and that is the whole argument");

const ceil = vndfCeiling(COS_I, { ...AT, N: 1024, M: 512 });
say(`h-space: VNDF mass ${ceil.mass.toFixed(6)}, (1-F) weighted ${ceil.weighted.toFixed(6)}`);
ok("!! the VNDF integrates to one, so anything it bounds cannot exceed one",
    Math.abs(ceil.mass - 1) < 3e-3, `got ${ceil.mass.toFixed(6)}`);
ok("the instrument is exact at the roughness the finding is stated at, at every incidence", (() => {
    for (const c of [0.1, 0.25, 0.5, 0.9]) for (const [N, M] of [[256, 128], [1024, 512]])
        if (Math.abs(vndfCeiling(c, { ...AT, alpha: 1, N, M }).mass - 1) > 1e-4) return false;
    return true;
})(), "alpha 1 gives 1.000000 at every resolution tried -- pinned, not converging");
// *** AND AT alpha 0.05 IT DOES NOT, WHICH IS SAID HERE RATHER THAN AVOIDED BY NOT TESTING IT. *** A uniform
// cosine grid cannot resolve a near-delta VNDF: the mass reads 0.50 at 256x128, 0.87 at 1024x512, 0.96 at
// 2048x1024. v4432's rule reads that correctly -- a number that MOVES when you refine the grid is the GRID,
// not the model -- and it is the reason the conviction in section 2 is stated at alpha 1 and nowhere else.
ok("at the smooth end the number moves with refinement, so it is the grid and the gate says so", (() => {
    const m = [[256, 128], [1024, 512], [2048, 1024]]
        .map(([N, M]) => vndfCeiling(0.25, { ...AT, alpha: 0.05, N, M }).mass);
    say(`alpha 0.05 VNDF mass by grid: ${m.map((v) => v.toFixed(6)).join(" -> ")}`);
    return m[0] < m[1] && m[1] < m[2] && m[2] < 1 && m[0] < 0.7;
})(), "a ceiling this instrument cannot compute is a ceiling this round does not convict against");
ok("the ceiling is below one because Fresnel reflects some of it",
    ceil.weighted < ceil.mass && ceil.weighted > 0.85);

// ---- 2. THE CONVICTION ------------------------------------------------------------------------------------
console.log("\n2. with masking alone, eq. 21 is exactly the (1-F)-weighted VNDF -- and as written it doubles it");

const mask = domainSplit(COS_I, { ...AT, g: "masking", N: 1024, M: 512 });
say(`o-space, masking: as written ${mask.all.toFixed(6)}, domain enforced ${mask.honest.toFixed(6)}`);
say(`the ceiling it may not exceed: ${ceil.weighted.toFixed(6)}`);
ok("!! the change of variables is EXACT once the domain is enforced",
    Math.abs(mask.honest - ceil.weighted) < 5e-3,
    `enforced ${mask.honest.toFixed(6)} vs ceiling ${ceil.weighted.toFixed(6)}`);
ok("!! AS WRITTEN IT EXCEEDS A PROBABILITY, which is the over-count and not a tolerance argument",
    mask.all > 1.5 && mask.all / ceil.weighted > 1.9,
    `${mask.all.toFixed(6)} = ${(mask.all / ceil.weighted).toFixed(3)}x the ceiling`);
ok("the enforced value is pinned to the ceiling in ABSOLUTE terms and not only relative to the broken one",
    mask.honest > 0.88 && mask.honest < 0.95,
    "sabotage D: this is the check that makes folding-h-upward a failure rather than a smaller gap");

// ---- 3. THE TWO ABS()ES, EACH LOCALISED TO ITS OWN SET OF DIRECTIONS ---------------------------------------
console.log("\n3. the domain has two failures and they are different failures");

const wi = [Math.sqrt(1 - COS_I * COS_I), 0, COS_I];
const dirBelow = (ct, phi = 0) => {
    const st = Math.sqrt(Math.max(0, 1 - ct * ct));
    return [st * Math.cos(phi), st * Math.sin(phi), -ct];
};
const bound = flipBoundary(COS_I, AT.nAbove, AT.nBelow);
say(`flipBoundary(cosI ${COS_I}, eta 1.5) = ${bound.toFixed(6)}`);
ok("!! the flip boundary is a closed form and the classification changes exactly across it", (() => {
    for (let k = 1; k <= 60; k++) {                      // sweep phi too: the boundary must not depend on it
        const phi = (2 * Math.PI * k) / 60;
        const under = classify(wi, dirBelow(bound * 0.98, phi), AT);
        const over = classify(wi, dirBelow(bound * 1.02, phi), AT);
        if (under !== DOMAIN.flipped && under !== DOMAIN.both) return false;
        if (over === DOMAIN.flipped || over === DOMAIN.both) return false;
    }
    return true;
})(), "|wo.n| < (nAbove/nBelow)|wi.n| and nothing else");
ok("the boundary tracks the indices rather than sitting at a fitted number", (() => {
    for (const [nA, nB] of [[1, 1.33], [1, 1.5], [1, 2.4], [1, 1.0001]]) {
        const b = flipBoundary(0.4, nA, nB);
        if (Math.abs(b - (nA / nB) * 0.4) > 1e-12) return false;
        const under = classify([Math.sqrt(1 - 0.16), 0, 0.4], dirBelow(b * 0.9), { nAbove: nA, nBelow: nB });
        if (under !== DOMAIN.flipped && under !== DOMAIN.both) return false;
    }
    return true;
})(), "sabotage B: a constant 0.15 is right at eta 1.5 and cosI 0.225 and nowhere else");
ok("!! near-normal exit fails (D2) and not (D1) -- a lit-face failure, not an existence failure",
    classify(wi, dirBelow(0.95), AT) === DOMAIN.backfacing,
    "the facet exists; the light arrives on its other side");
ok("the raw half-vector really does point down below the boundary, and up above it",
    rawHalfVector(wi, dirBelow(bound * 0.9), AT.nAbove, AT.nBelow)[2] < 0 &&
    rawHalfVector(wi, dirBelow(bound * 1.1), AT.nAbove, AT.nBelow)[2] > 0);
ok("both failures are present and neither alone accounts for the excess", (() => {
    const s = domainSplit(COS_I, { ...AT, g: "g2", N: 512, M: 256 });
    say(`g2 at alpha 1: flipped ${(100 * s.flipped / s.all).toFixed(2)}%, backfacing ` +
        `${(100 * s.backfacing / s.all).toFixed(2)}%, both ${(100 * s.both / s.all).toFixed(2)}%`);
    return s.flipped / s.all > 0.05 && s.backfacing / s.all > 0.2 && s.impossible / s.all > 0.4;
})(), "sabotage A: dropping (D2) leaves most of the invented energy in place");

// ---- 4. THE MODULE IS MEASURING THE SHIPPED LOBE AND NOT A REWRITE OF IT -----------------------------------
console.log("\n4. with the domain not enforced this is transmission.mjs, to the last bit");

ok("!! enforce:false reproduces the shipped btdf exactly", (() => {
    let worst = 0;
    for (let a = 0; a < 37; a++) for (let b = 1; b < 40; b++) {
        const ci = b / 40, w = [Math.sqrt(1 - ci * ci), 0, ci];
        const phi = (2 * Math.PI * a) / 37, ct = ((a * 7) % 40 + 0.5) / 40;
        const st = Math.sqrt(Math.max(0, 1 - ct * ct));
        const wo = [st * Math.cos(phi), st * Math.sin(phi), -ct];
        const x = btdf(w, wo, AT), y = btdfDomain(w, wo, { ...AT, g: "g2", enforce: false });
        worst = Math.max(worst, Math.abs(x - y) / Math.max(1e-12, Math.abs(x)));
    }
    say(`worst relative disagreement ${worst.toExponential(2)}`);
    return worst < 1e-10;
})(), "otherwise the comparison grades a copy rather than the shipped code -- v4443's species");
ok("enforcing the domain only ever removes energy, never adds it and never reweights it", (() => {
    for (let b = 1; b < 30; b++) {
        const ci = b / 30, w = [Math.sqrt(1 - ci * ci), 0, ci];
        for (let c = 1; c < 30; c++) {
            const wo = dirBelow(c / 30, 0.7);
            const off = btdfDomain(w, wo, { ...AT, g: "g2", enforce: false });
            const on = btdfDomain(w, wo, { ...AT, g: "g2", enforce: true });
            if (on > off + 1e-12) return false;
            if (on !== 0 && Math.abs(on - off) > 1e-12) return false;   // inside the domain, bit for bit
        }
    }
    return true;
})(), "the finding is a domain restriction, not a reweighting");
ok("classify partitions: every pair lands in exactly one named case and all of them are reached", (() => {
    const seen = new Set();
    for (let b = 1; b < 25; b++) {
        const ci = b / 25, w = [Math.sqrt(1 - ci * ci), 0, ci];
        for (let c = 1; c < 25; c++) for (const s of [1, -1]) for (let a = 0; a < 16; a++) {
            const ct = s * (c / 25), st = Math.sqrt(Math.max(0, 1 - ct * ct));
            const phi = (2 * Math.PI * a) / 16;
            const k = classify(w, [st * Math.cos(phi), st * Math.sin(phi), ct], AT);
            if (!Object.values(DOMAIN).includes(k)) return false;
            seen.add(k);
        }
    }
    say(`cases reached: ${[...seen].sort().join(", ")}`);
    return seen.size === Object.keys(DOMAIN).length;
})(), "sabotage C: 'everything is honest' still returns a legal value from the enum");

// ---- 5. THE WALK PUTS EXACT ZEROS WHERE THE ABS()ES PUT ENERGY ---------------------------------------------
console.log("\n5. single scattering provably cannot reach the directions the formula pays out in");

const bins = walkBins(COS_I, { ...AT, walk: dielectricWalk, rand: rng(101), n: 120000, bins: 10 });
say(`walk: ${bins.nSingle} single-scatter and ${bins.nMulti} multi-scatter transmissions of ${bins.n}`);
say(`bin 0 single ${bins.single[0]} multi ${bins.multi[0]} | bin 9 single ${bins.single[9]} multi ${bins.multi[9]}`);
ok("!! the single-scatter walk is EXACTLY ZERO in the bin where (D1) fails",
    bins.single[0] === 0, "not few -- zero, and the flip boundary is that bin");
ok("!! the single-scatter walk is EXACTLY ZERO in the bin where (D2) fails",
    bins.single[9] === 0, "not few -- zero, and every path there needs a second bounce");
ok("multiple scattering DOES reach both, so the zeros are the model's and not the walk's",
    bins.multi[0] > 0 && bins.multi[9] > 0,
    "an absence with no positive control beside it is v4402's absence-read-as-a-pass");
ok("the walk populates the bins in between, so it is not simply empty",
    bins.single.slice(2, 8).every((v) => v > 0));
ok("Walter pays out in both zero bins", (() => {
    const N = 512, M = 256;
    let b0 = 0, b9 = 0, all = 0;
    for (let a = 0; a < N; a++) {
        const phi = (2 * Math.PI * (a + 0.5)) / N;
        for (let b = 0; b < M; b++) {
            const ct = (b + 0.5) / M;
            const v = btdf(wi, dirBelow(ct, phi), AT) * ct * ((2 * Math.PI) / (N * M));
            all += v;
            if (ct < 0.1) b0 += v; else if (ct >= 0.9) b9 += v;
        }
    }
    say(`Walter's share of its own total: bin 0 ${(100 * b0 / all).toFixed(2)}%, bin 9 ${(100 * b9 / all).toFixed(2)}%`);
    return b0 / all > 0.02 && b9 / all > 0.02;
})());

// ---- 6. WHAT THE FINDING DOES NOT FIX, TESTED SO IT CANNOT BE OVERSTATED -----------------------------------
console.log("\n6. the domain is about half the excess and the round says so rather than implying more");

const g2 = domainSplit(COS_I, { ...AT, g: "g2", N: 1024, M: 512 });
say(`g2: as written ${g2.all.toFixed(6)} (${(g2.all / REC.walkSingleScatter).toFixed(2)}x truth), ` +
    `enforced ${g2.honest.toFixed(6)} (${(g2.honest / REC.walkSingleScatter).toFixed(2)}x truth)`);
ok("enforcing the domain roughly halves the excess",
    g2.honest / g2.all > 0.45 && g2.honest / g2.all < 0.6);
ok("!! and does NOT reach the walk, which is the next round and not this one",
    g2.honest / REC.walkSingleScatter > 1.8, "the masking model is still wrong at alpha 1");
ok("at production roughness the impossible domains are negligible, which is why nobody caught it", (() => {
    for (const c of [0.1, 0.25, 0.5, 0.9]) {
        const s = domainSplit(c, { ...AT, alpha: 0.05, g: "g2", N: 512, M: 256 });
        if (s.impossible / s.all > 0.075) return false;
    }
    return true;
})(), "a high-roughness defect, invisible in every smooth-glass render");
ok("G is not the culprit: a five-fold change in the total, almost none in the defect", (() => {
    const shares = ["g2", "separable", "masking", "none"].map((g) => {
        const s = domainSplit(COS_I, { ...AT, g, N: 512, M: 256 });
        return { g, total: s.all, share: s.impossible / s.all };
    });
    say(shares.map((s) => `${s.g} ${s.total.toFixed(3)}/${(100 * s.share).toFixed(1)}%`).join("  "));
    const totals = shares.map((s) => s.total), sh = shares.map((s) => s.share);
    return Math.max(...totals) / Math.min(...totals) > 4 && Math.max(...sh) - Math.min(...sh) < 0.08;
})());

// ---- 7. THE RECORD, AND THE TRAP IT REMEMBERS ---------------------------------------------------------------
console.log("\n7. the frozen record, checked against what the code does now");

ok("the record's ceiling is what the instrument reports", Math.abs(REC.ceiling - ceil.weighted) < 5e-3);
ok("the record's as-written masking figure is what the code produces", Math.abs(REC.maskingAsWritten - mask.all) < 5e-3);
ok("the record's g2 figures are what the code produces",
    Math.abs(REC.g2AsWritten - g2.all) < 5e-3 && Math.abs(REC.g2Enforced - g2.honest) < 5e-3);
ok("the record's flip boundary is the closed form at the recorded configuration",
    Math.abs(REC.flipBoundaryHere - flipBoundary(REC.at.cosI, REC.at.nAbove, REC.at.nBelow)) < 1e-6,
    "the record carries six figures of a number that has none -- 1/6 does not terminate");
ok("!! the reverse-transport trap is recorded with the arithmetic that exposed it",
    Math.abs(REC.reverseTransportTrap.got * REC.reverseTransportTrap.times - REC.reverseTransportTrap.gives) < 1e-3 &&
    Math.abs(REC.reverseTransportTrap.times - (AT.nBelow / AT.nAbove) ** 2) < 1e-12,
    "0.553 looked healthier than 1.244 and was the broken measurement");
ok("the record is frozen", (() => {
    try { REC.ceiling = 0; } catch { /* strict mode throws, which is the pass */ }
    return REC.ceiling !== 0 && Object.isFrozen(REC);
})());

// ---- 8. THE OTHER BRANCH'S FIX, HELD AGAINST THIS FILE'S WALK -----------------------------------------------
//
// *** THE SAME QUESTION WENT TO TWO LINES AT ONCE AND THEY CONVICTED THE SAME chi+ FROM DIFFERENT
// INSTRUMENTS. *** transmission.mjs now carries `chiPlus` (the domain this file convicts, under Walter's own
// name for it) and `g2: "beta"` (the Smith uniform-height masking-shadowing form for directions on OPPOSITE
// sides, which is the half THIS round did not solve). Neither shares a line with the walk below. Two
// independent routes to one number is worth more than either route twice, so it is checked here rather than
// taken on trust -- and it is the check that would go red if a later round quietly reverted either parameter.
console.log("\n8. transmission.mjs's chiPlus and beta G2, graded against the Monte Carlo walk");

{
    const truth = REC.walkSingleScatter;                 // 0.306083, this file's own measurement
    const at = { alpha: 1, ...LIMITS.glass };
    const T = (opt) => energySplit({ ...at, ...opt }, COS_I, { N: 512, M: 256 }).T;
    // ONE definition of "the fixed lobe", used by every check below -- section 8's own sabotage found that a
    // second copy of the option object leaves half the section grading something the sabotage never touched.
    const FIXED = Object.freeze({ chiPlus: true, g2: "beta" });
    const shipped = T({}), chi = T({ chiPlus: true }), beta = T(FIXED);
    say(`shipped ${shipped.toFixed(6)} | chiPlus ${chi.toFixed(6)} | chiPlus+beta ${beta.toFixed(6)} | walk ${truth.toFixed(6)}`);
    ok("!! the other branch's chi+ reproduces THIS file's enforced domain, from unshared code",
        Math.abs(chi - g2.honest) < 5e-3,
        `theirs ${chi.toFixed(6)} vs this file's ${g2.honest.toFixed(6)} -- two routes, one number`);
    ok("!! chi+ AND the beta G2 together reach the walk, which chi+ alone does not",
        Math.abs(beta - truth) < 5e-3 && Math.abs(chi - truth) > 0.25,
        `beta ${beta.toFixed(6)} vs walk ${truth.toFixed(6)}; chi+ alone is still ${(chi / truth).toFixed(2)}x`);
    ok("the separable G1G1 would NOT have been the fix, so 'use Walter's own G' was not the answer either",
        Math.abs(T({ chiPlus: true, g2: "separable" }) - truth) > 0.15,
        "0.4834 against 0.3061 -- the obvious repair overshoots by 58%");
    ok("the defaults are unchanged, so this round and that one moved no rendered pixel",
        Math.abs(shipped - REC.g2AsWritten) < 5e-3,
        "chiPlus and g2 are opt-in parameters; the bright lobe is still what ships");
    ok("and the agreement is not an artefact of one configuration", (() => {
        for (const [alpha, cosI] of [[1, 0.7], [0.4, 0.25]]) {
            const b = energySplit({ alpha, ...LIMITS.glass, ...FIXED }, cosI, { N: 384, M: 192 }).T;
            const w = walkBins(cosI, {
                alpha, ...LIMITS.glass, walk: dielectricWalk, rand: rng(7), n: 60000, bins: 1,
            });
            const got = w.nSingle / w.n;
            say(`alpha ${alpha} cosI ${cosI}: beta ${b.toFixed(6)} vs walk ${got.toFixed(6)}`);
            if (Math.abs(b - got) > 0.01) return false;
        }
        return true;
    })(), "a fix that only lands at the one point it was tuned at is a fit");
}

console.log(`\nbtdfDomain-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
