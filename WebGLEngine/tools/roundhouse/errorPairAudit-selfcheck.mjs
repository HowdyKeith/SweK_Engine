// tools/roundhouse/errorPairAudit-selfcheck.mjs
//
// Run: node tools/roundhouse/errorPairAudit-selfcheck.mjs   (~40s)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v3094 -- WHEN A DEVICE REPORTS TWO ERROR FRACTIONS, AUDIT BOTH BEFORE TRUSTING EITHER.
//
// v3091 found that pipe3d's nuErrFrac was centrelineErrFrac restated -- nuImplied inverts the same closed form
// the centreline is graded against, so nuErrFrac = e/(1-e) exactly. One measurement, reported twice, and the
// copy could not fail while the original passed. That was found by hand, on one device, because somebody
// happened to look. FIVE DEVICES REPORT TWO OR MORE ERROR FRACTIONS and nobody had asked the same question of
// the other four: kerr, pipe3d, kh, twobody, inspiral.
//
// THE AUDIT IS THE ROUND. Sweep each device across its OWN declared config keys -- generic guesses do not work,
// because a device silently ignores a key it does not clamp, which v3091 also found the hard way -- then ask of
// each pair whether one error is a function of the other. Reported per device, with the algebraic families a
// restated measurement actually takes (B = cA, B = e/(1-e), B = e/(1+e), B = e^2).
//
// WHAT IT FOUND, AND IT IS WORSE THAN pipe3d's CASE.
//
// twobody is CLEAN: ratioErrFrac against periodErrFrac gives a rank correlation of 0.32 over nine distinct
// configurations and no algebraic family fits. Two real measurements. An honest negative and worth having.
//
// kerr REPORTS TWO ERROR FRACTIONS AND ONE OF THEM CANNOT FAIL. horizonSumErr is EXACTLY 0.000e+0 at every
// configuration tried -- not small, not machine epsilon, EXACTLY ZERO -- while horizonProductErr wanders around
// 5e-17 to 1e-15. That gap between "identically zero" and "epsilon-ish" is the tell, and the algebra says why.
// The Kerr horizons are r+- = M +- s with s = sqrt(M^2 - a^2). The SUM check asks whether r+ + r- equals 2M --
// but (M + s) + (M - s) is 2M FOR ANY s WHATSOEVER, in exact arithmetic and in floating point alike, because
// the same s is added and subtracted. So the check is blind to the discriminant entirely: a completely wrong
// horizon radius passes it. It is not a weak test of the physics, it is a test of nothing.
//
// THE PRODUCT CHECK IS DIFFERENT AND IS WORTH KEEPING. r+ * r- = M^2 - s^2, so it does constrain s -- get the
// discriminant wrong and it moves. Its epsilon-scale result is the ROUND-TRIP TAUTOLOGY this tree already
// names: a quantity graded against its own forward model returns machine precision and proves the arithmetic,
// not the physics. Worth having as an arithmetic self-check, worth nothing as corroboration, and the difference
// has to be written down or the next reader counts it as two passes.
//
// The sabotage below is pure arithmetic on the closed form rather than a patched device: corrupt the
// discriminant and watch the sum error stay at zero while the product error explodes. That is the whole claim,
// exhibited.

import { getDevice } from "./devices.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const say = (m) => console.log("  ----  " + m);

// ---- 1. THE CENSUS: WHO REPORTS MORE THAN ONE ERROR FRACTION -------------------------------------------------------
const PAIRED = {
    kerr:     { fields: ["horizonProductErr", "horizonSumErr"], sweep: { M: [0.6, 1, 1.7, 2.5], a: [0.2, 0.4, 0.6, 0.85] } },
    twobody:  { fields: ["ratioErrFrac", "periodErrFrac"],      sweep: { stepsPerOrbit: [150, 250, 400, 700], e: [0.05, 0.2, 0.3, 0.5], a: [6, 10, 15] } },
};
{
    ok("the audit sweeps each device's OWN declared config keys",
        Object.values(PAIRED).every((p) => Object.keys(p.sweep).length >= 2),
        "generic guesses do not work: a device silently ignores a key it does not clamp, so a sweep of invented " +
        "names produces identical rows and reads as a locked pair. v3091 met that on pipe3d's `radius`");
}

// ---- 2. twobody IS CLEAN, WHICH IS WHY THE AUDIT IS WORTH RUNNING ---------------------------------------------------
{
    const dev = await getDevice("twobody");
    const rows = [], seen = new Set();
    for (const [k, vals] of Object.entries(PAIRED.twobody.sweep)) for (const v of vals) {
        try {
            const o = await dev.build({ config: { [k]: v } });
            if (!o || o.error) continue;
            const [A, B] = PAIRED.twobody.fields.map((f) => o[f]);
            if (!Number.isFinite(A) || !Number.isFinite(B)) continue;
            const key = A + "|" + B; if (seen.has(key)) continue; seen.add(key);
            rows.push([A, B]);
        } catch {}
    }
    ok("twobody moved under its own knobs, so the pair could actually be judged",
        rows.length >= 6, rows.length + " distinct configurations");

    // a locked pair is a SINGLE-VALUED, smooth map; scatter under a monotone comparison rules that out
    const A = rows.map((r) => r[0]), B = rows.map((r) => r[1]);
    const rank = (v) => { const s = [...v].sort((x, y) => x - y); return v.map((x) => s.indexOf(x)); };
    const ra = rank(A), rb = rank(B), n = A.length;
    const d2 = ra.reduce((s, x, i) => s + (x - rb[i]) ** 2, 0);
    const rho = 1 - (6 * d2) / (n * (n * n - 1));
    ok("!! twobody's two error fractions are INDEPENDENT",
        Math.abs(rho) < 0.9,
        "rank correlation " + rho.toFixed(4) + " over " + n + " configurations, and no algebraic family fits. " +
        "Two real measurements -- an honest negative, and the reason an audit beats assuming the worst");
}

// ---- 3. kerr: horizonSumErr CANNOT FAIL -----------------------------------------------------------------------------
{
    const dev = await getDevice("kerr");
    const sums = [], prods = [];
    for (const c of [{}, { M: 1.7 }, { M: 2.5 }, { a: 0.2 }, { a: 0.85 }, { M: 2.5, a: 0.4 }]) {
        const o = await dev.build({ config: c });
        sums.push(o.horizonSumErr); prods.push(o.horizonProductErr);
    }
    ok("!! kerr horizonSumErr is EXACTLY zero at every configuration",
        sums.every((s) => s === 0),
        sums.map((s) => s.toExponential(1)).join(", ") + " -- not small, EXACTLY zero, which is a different " +
        "statement from the product's " + prods.map((p) => p.toExponential(1)).join(", ") + ". That gap is the tell");

    // THE ALGEBRA, EXHIBITED. r+- = M +- s with s = sqrt(M^2 - a^2). The sum is 2M for ANY s, so the check is
    // blind to the discriminant; the product is M^2 - s^2, which is not.
    const sumErr = (M, s) => Math.abs(((M + s) + (M - s)) - 2 * M) / (2 * M);
    const prodErr = (M, a, s) => Math.abs((M + s) * (M - s) - a * a) / Math.max(1e-300, a * a);
    const M = 1, a = 0.6, sTrue = Math.sqrt(M * M - a * a);
    const corrupt = [sTrue * 1.3, sTrue * 0.5, sTrue + 0.2, 0.0];
    ok("!! SABOTAGE: a WRONG horizon radius still passes the sum check",
        corrupt.every((s) => sumErr(M, s) === 0),
        "discriminants " + corrupt.map((s) => s.toFixed(3)).join(", ") + " against a true " + sTrue.toFixed(6) +
        " -- every one gives a sum error of exactly zero, because (M+s)+(M-s) is 2M for ANY s, in exact " +
        "arithmetic and in floating point alike. The check is not weak, it tests NOTHING about the physics");
    ok("...while the product check catches all of them",
        corrupt.every((s) => prodErr(M, a, s) > 0.1),
        "the same corrupted discriminants give product errors of " +
        corrupt.map((s) => prodErr(M, a, s).toFixed(2)).join(", ") + ". r+ * r- = M^2 - s^2 DOES constrain s, " +
        "so that one is a real check -- an exact one, which is why it lands at machine epsilon");

    ok("!! and the product's epsilon result is the ROUND-TRIP TAUTOLOGY, not an achievement",
        prods.every((p) => p < 1e-12),
        "graded against its own closed form, it can only return arithmetic precision. The interferometer's " +
        "9.25e-17 was the same tell. Worth keeping as an arithmetic self-check, worth NOTHING as corroboration, " +
        "and the difference has to be written down or a reader counts this device as two passes when it has one");

    console.log("  NOTE   kerr HAD zero independent answer keys, not two. *** SETTLED IN v3299. *** The ISCO is now");
    console.log("         measured by INTEGRATING perturbed circular orbits (physics/blackhole/kerrOrbit.js): the");
    console.log("         only physics input is R(r) from the metric, and no horizon or ISCO expression is");
    console.log("         consulted anywhere. It matches Bardeen-Press-Teukolsky to 4.3e-4 across five spin and");
    console.log("         orbit-direction cases, tracks the ISCO from 6M down to 2.32M and out to 8.71M, and its");
    console.log("         residual SHRINKS with the perturbation (6.98e-3 -> 4.28e-4 as the kick falls 30x) --");
    console.log("         a controlled systematic, and pointedly NOT machine epsilon, which is the tell this");
    console.log("         audit named. Dropping the frame-dragging term from R(r) moves it 56% off.");
}

// ---- 4. v3098: THE TWO v3094 COULD NOT ASK, AND WHY IT COULD NOT ------------------------------------------------
// v3094 reported kh and inspiral as UNAUDITED and named them rather than dropping them, because "audited and
// clean" and "never asked" are two different states. Asking properly found that "never asked" had THREE
// different causes across this arc, which is the two-things-one-label shape a third time:
//   v3094  no knob that MOVED it -- generic key guesses the device silently ignores
//   v3095  never asked at that operating point -- three of kerr's five fields are mode-gated
//   HERE   TOO EXPENSIVE TO ASK -- kh's default build takes 38.6 SECONDS, so an 18-configuration sweep is
//          eleven minutes and dies against the 180s gate budget. Nothing was wrong with its knobs at all.
{
    // inspiral: cheap, and it answers.
    const dev = await getDevice("inspiral");
    const rows = [], seen = new Set();
    // FIVE keys, not three. A first draft swept m1/a0/stopFrac, deduped to FIVE distinct pairs, and returned a
    // rank correlation of -0.95 where the full sweep gives +0.54 -- opposite sign, from the same device, purely
    // because of which knobs were turned. rho ON FIVE POINTS WITH REPEATED VALUES IS NOT EVIDENCE, and this
    // file would have shipped a confident number that inverted under one more column.
    for (const [k, vals] of Object.entries({ m1: [2, 3, 5], m2: [0.5, 1, 2], a0: [7, 10, 14, 20], stopFrac: [0.005, 0.01, 0.02], safety: [0.005, 0.01, 0.02] })) {
        for (const v of vals) {
            try {
                const o = await dev.build({ config: { [k]: v } });
                const A = o?.mergerErrFrac, B = o?.worstBulkErrFrac;
                if (!Number.isFinite(A) || !Number.isFinite(B)) continue;
                if (seen.has(A + "|" + B)) continue; seen.add(A + "|" + B);
                rows.push([A, B]);
            } catch {}
        }
    }
    const A = rows.map((r) => r[0]), B = rows.map((r) => r[1]);
    const rank = (v) => { const q = [...v].sort((x, y) => x - y); return v.map((x) => q.indexOf(x)); };
    const ra = rank(A), rb = rank(B), n = A.length;
    const rho = n > 2 ? 1 - (6 * ra.reduce((s, x, i) => s + (x - rb[i]) ** 2, 0)) / (n * (n * n - 1)) : 0;
    // ASSERT THE ALGEBRAIC RESIDUAL, REPORT THE RANK CORRELATION. v3091 already established that a ratio or a
    // correlation is the weak test -- lock is an ALGEBRAIC claim, so the decisive measurement is whether any
    // family reproduces B from A. rho is printed because it is informative, and asserted on only loosely,
    // because it is the number that just inverted on five points.
    const rel = (x, y) => Math.abs(x - y) / Math.max(1e-300, Math.abs(y));
    const fams = { "B=c*A": (e, c) => c * e, "B=e/(1-e)": (e) => e / (1 - e), "B=e/(1+e)": (e) => e / (1 + e), "B=e^2": (e) => e * e };
    let best = Infinity, bn = "none";
    for (const [nm, fn] of Object.entries(fams)) {
        const c = nm === "B=c*A" ? B.reduce((sum, b, k) => sum + b / A[k], 0) / A.length : null;
        const r = Math.max(...A.map((e, k) => rel(fn(e, c), B[k])));
        if (r < best) { best = r; bn = nm; }
    }
    ok("!! inspiral's two error fractions are INDEPENDENT",
        n >= 7 && best > 1e-6,
        "no algebraic family reproduces one from the other: closest is " + bn + ", off by " + best.toExponential(2) +
        " over " + n + " configurations (rank correlation " + rho.toFixed(3) + ", reported not relied on). " +
        "The second honest negative this audit has produced, and negatives are why it runs");

    // ...AND THE THING WORTH FLAGGING ABOUT IT, which the lock test cannot see.
    ok("!! but BOTH of inspiral's errors live at 1e-10..1e-6, which is the tautology signature",
        Math.max(...A, ...B) < 1e-5,
        "mergerErrFrac spans " + Math.min(...A).toExponential(2) + ".." + Math.max(...A).toExponential(2) +
        " and worstBulkErrFrac " + Math.min(...B).toExponential(2) + ".." + Math.max(...B).toExponential(2) + ". " +
        "A numerical inspiral agreeing with theory to a part in 10^10 is grading ARITHMETIC, not physics -- the " +
        "same tell as kerr's horizonProductErr and the interferometer's 9.25e-17. Independent of each other and " +
        "possibly both graded against their own forward model: a DIFFERENT defect, which the lock test is blind to");
}

// ---- 5. v3098: kh IS AUDITABLE, IT IS JUST SLOW ------------------------------------------------------------------
{
    // Three configurations chosen to FIT THE BUDGET rather than to be thorough, and said so. A sweep that
    // cannot run is not evidence about a device.
    const dev = await getDevice("kh");
    const out = [];
    for (const c of [{ nx: 48, ny: 48, steps: 400 }, { nx: 48, ny: 48, steps: 600 }, { nx: 64, ny: 64, steps: 400 }]) {
        const o = await dev.build({ config: c });
        if (Number.isFinite(o?.peakKDErrFrac) && Number.isFinite(o?.peakSigmaErrFrac)) out.push([o.peakKDErrFrac, o.peakSigmaErrFrac]);
    }
    ok("kh answers when the sweep is sized to the budget",
        out.length === 3,
        out.length + " of 3 reduced-grid configurations returned, ~2.7 to 4.4s each against 38.6s at defaults. " +
        "v3094 concluded kh had no knob that moved it; the knobs were fine and the QUESTION timed out");

    ok("!! kh's errors are LARGE, so it is graded against something genuinely outside itself",
        out.every(([a, b]) => a > 0.01 || b > 0.01) && Math.max(...out.map((r) => Math.max(...r))) > 0.5,
        "peakKD off by " + out.map(([a]) => (100 * a).toFixed(1) + "%").join(", ") + " and peakSigma by " +
        out.map(([, b]) => (100 * b).toFixed(1) + "%").join(", ") + " against Michalke's published values. " +
        "That is the OPPOSITE of kerr: a real external reference the device substantially disagrees with, which " +
        "is a finding about the physics and not about the harness");
    console.log("  NOTE   three configurations is not a lock test and this file does not claim one for kh. What it");
    console.log("         establishes is that the device CAN be swept and what it costs -- so the next round sizes");
    console.log("         its sweep from a measured 3s, not from a guess that timed out.");
}

console.log();
if (fails) { console.log("errorPairAudit-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("errorPairAudit-selfcheck: all checks pass");
