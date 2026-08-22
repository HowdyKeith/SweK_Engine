// WebGLEngine/tools/roundhouse/skillProof-selfcheck.mjs -- v3396
//
// *** THE SKILLBOOK'S RATCHET CERTIFIED A USELESS STRATEGY A QUARTER OF THE TIME, AND THE NUMBER IS MEASURED
// HERE RATHER THAN ARGUED. ***
//
// v3395 shipped the persistent Skillbook with a ratchet: PROVEN when the malformed rate dropped by 0.10 or
// more over at least 20 trials. Both arms are Bernoulli samples of the same size, so the difference of two
// rates carries a standard error of about sqrt(2 p (1-p) / n) -- 0.158 at p = 0.5, n = 20. THE BAR SAT INSIDE
// THE NOISE. A strategy that does nothing at all clears it by luck.
//
// THE NULL IS DRIVEN, NOT DESCRIBED: both arms are drawn from the SAME coin, so any drop is noise by
// construction and the correct answer is always "not proven". Whatever fraction gets called PROVEN is the
// false-proof rate, and it is the only number that decides whether the ratchet is worth having.
//
// THE FIX IS NOT A BIGGER CONSTANT -- a fixed bar cannot be right at every n, and raising it just moves the
// defect. The drop is measured against ITS OWN standard error, and the third state is what makes that safe:
// UNDERPOWERED is a real drop that the sample cannot separate from noise. Retiring it would discard something
// that may be true; proving it is the bug. It is neither, and it is NEVER INJECTED.
"use strict";
import { proofStrength, requiredN, deriveState, Z_MIN, MIN_IMPROVEMENT, makeStrategy, hintsFor } from "./skillbook.mjs";
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

// A named generator, so the measurement is deterministic and anyone can re-run it and get these figures.
const mul = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

/** Draw a two-arm trial from ONE coin. Any drop here is noise by construction. */
function nullTrial(seed, n, p) {
    const r = mul(seed);
    let a = 0, b = 0;
    for (let i = 0; i < n; i++) { if (r() < p) a++; if (r() < p) b++; }
    return { before: a / n, after: b / n, n };
}
const oldRule = (ev) => (ev.before - ev.after) >= MIN_IMPROVEMENT;
const newRule = (ev) => oldRule(ev) && proofStrength(ev) >= Z_MIN;

// ---- 1. THE DEFECT, MEASURED ------------------------------------------------------------------------------
const CASES = [[20, 0.5], [20, 0.3], [40, 0.5], [100, 0.5], [200, 0.5]];
const T = 20000;
const rows = CASES.map(([n, p]) => {
    let o = 0, w = 0;
    for (let t = 0; t < T; t++) {
        const ev = nullTrial(t * 7919 + n * 13 + Math.round(p * 100), n, p);
        if (oldRule(ev)) o++;
        if (newRule(ev)) w++;
    }
    return { n, p, old: o / T, now: w / T };
});
say("false-proof rate on a strategy that does NOTHING, " + T + " trials per cell:");
for (const r of rows) say(`  n=${String(r.n).padStart(3)} p=${r.p}   v3395 rule ${(100 * r.old).toFixed(1)}%   ->   v3396 rule ${(100 * r.now).toFixed(2)}%`);
{
    const worstOld = Math.max(...rows.map((r) => r.old));
    ok("!! *** the v3395 rule certified a USELESS strategy up to a quarter of the time ***",
        worstOld > 0.15,
        (100 * worstOld).toFixed(1) + "% at the smallest sample. This is the shipped rule measured against its " +
        "own null, not a criticism of it in prose -- and the figure moves a little with the generator: the " +
        "first probe of this read 32.3% on a differently-seeded draw, same conclusion, different coins");
    ok("!! *** and the v3396 rule holds near its designed 1% tail AT EVERY SAMPLE SIZE ***",
        rows.every((r) => r.now < 0.02),
        rows.map((r) => (100 * r.now).toFixed(2) + "%").join(", ") + ". THE FLATNESS IS THE POINT, not the " +
        "size: the old rate DEPENDED ON n (falling from 26% to 2% as the sample grew), so the same bar meant " +
        "something different at every n. A bar compared to its own standard error means one thing everywhere");
    const improves = rows.every((r) => r.now < r.old);
    ok("...and it is stricter everywhere rather than on average",
        improves, "no sample size gets worse, which a single headline figure could have hidden");
}

// ---- 2. THE THIRD STATE, AND WHY IT IS NOT A DODGE --------------------------------------------------------
{
    const big = { before: 0.60, after: 0.40, n: 20 };     // clears 0.10 easily, z = 1.29
    const same = { before: 0.60, after: 0.60, n: 40 };    // no drop at all
    const real = { before: 0.65, after: 0.05, n: 40 };    // the patch's own PROVEN fixture
    const s = (ev) => deriveState({ evidence: ev }).state;
    say(`z: big-but-thin ${proofStrength(big).toFixed(2)}, identical arms ${proofStrength(same).toFixed(2)}, real effect ${proofStrength(real).toFixed(2)}`);
    ok("!! *** a large drop the sample cannot separate from noise is UNDERPOWERED -- neither proven nor retired ***",
        s(big) === "UNDERPOWERED",
        "0.600 -> 0.400 over 20 trials is a 20-point drop and z = " + proofStrength(big).toFixed(2) + ". " +
        "RETIRING it would throw away something that may well be real; PROVING it is the defect above. The " +
        "measurement was taken and it is too small to decide, which is a THIRD fact and not a softer verdict");
    ok("...and UNDERPOWERED names the number of runs that would settle it",
        /\d+ runs per arm/.test(deriveState({ evidence: big }).why) && requiredN(big) > big.n,
        requiredN(big) + " runs per arm. A verdict of 'not enough' with no quantity attached is advice nobody " +
        "can act on -- the same reason a refusal in this tree always names what it is missing");
    ok("!! and the two ends still land where they did, so this is a sharpening rather than a rewrite",
        s(same) === "RETIRED" && s(real) === "PROVEN",
        "identical arms RETIRED, the 0.650 -> 0.050 fixture PROVEN at z=" + proofStrength(real).toFixed(2) +
        ". The patch's own three fixtures all keep their verdicts");
}

// ---- 3. THE SAFETY PROPERTY IS UNCHANGED: ONLY PROVEN REACHES A PROMPT ------------------------------------
{
    const book = { strategies: [
        { ...makeStrategy({ id: "u", trigger: "comparator-missing", hint: "UNDER" }), state: "UNDERPOWERED" },
        { ...makeStrategy({ id: "p", trigger: "comparator-missing", hint: "PROVEN" }), state: "PROVEN" },
        { ...makeStrategy({ id: "r", trigger: "comparator-missing", hint: "RETIRED" }), state: "RETIRED" },
    ] };
    // SIXTH INSTANCE OF WRITING AGAINST AN ASSUMED SIGNATURE: this was `injectable(book, triggers)` on the
    // first run and the real export is hintsFor(issues, { book }). The gate would not even load. Caught by
    // running it, as every one of the previous five was.
    const got = hintsFor(["claim has no comparator"], { book });
    const hints = got.hints;
    ok("!! *** an UNDERPOWERED strategy is NEVER INJECTED, so adding a state did not open a door ***",
        hints.length === 1 && hints[0] === "PROVEN",
        "injected " + hints.length + " of 3 on a trigger all three match. A new state that quietly became " +
        "injectable would be the worst possible outcome of this round -- the fix would have widened the hole " +
        "it was closing");
}

// ---- 4. THE STRENGTH FUNCTION REFUSES RATHER THAN RETURNING A PLAUSIBLE NUMBER ----------------------------
{
    // MY OWN EXPECTATION WAS WRONG HERE AND THE GATE SAID SO. I asserted that 1.000 -> 0.000 returns Infinity,
    // reasoning that arms which never varied carry no sampling noise. They DO: the POOLED rate is 0.5, which is
    // the most variable value a Bernoulli takes, and the pooling is deliberate -- it estimates the spread under
    // the NULL, where both arms share one rate. So a perfect result is very strong (z = 14.1) and not certain,
    // which is the honest answer for fifty runs. The degenerate case is both arms EQUAL, where the drop is zero.
    ok("a perfect separation is very strong and still finite, and a degenerate variance returns 0 rather than NaN",
        proofStrength({ before: 0, after: 0, n: 50 }) === 0 &&
        proofStrength({ before: 1, after: 1, n: 50 }) === 0 &&
        Number.isFinite(proofStrength({ before: 1, after: 0, n: 50 })) &&
        proofStrength({ before: 1, after: 0, n: 50 }) >= 10,
        "1.000 -> 0.000 over 50 runs gives z = " + proofStrength({ before: 1, after: 0, n: 50 }).toFixed(2) +
        ". Fifty runs cannot make anything certain, and a rule that said otherwise would be the same " +
        "over-claiming this round exists to remove");
    ok("...and requiredN refuses an effect that goes the wrong way",
        requiredN({ before: 0.3, after: 0.5 }) === Infinity,
        "no number of runs proves a strategy that made things worse, and returning a finite one would invite " +
        "somebody to go and collect them");
}

console.log(failed ? "\n[skillProof-selfcheck] FAILED " + failed : "\n[skillProof-selfcheck] all checks pass");
process.exit(failed ? 1 : 0);
