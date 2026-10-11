#!/usr/bin/env node
// WebGLEngine/tools/ship/pairedStats-selfcheck.mjs -- v4684
//
// Run: node tools/ship/pairedStats-selfcheck.mjs
//
// *** A p-VALUE NOTHING CHECKS IS A DECORATION WITH A DECIMAL POINT. ***
//
// Four pre-registered rounds of this tree -- v4658, v4660, v4665, v4671 -- fixed a hypothesis and a threshold
// in advance, collected paired frames, and computed their tests in a throwaway driver. The discipline was
// real; the arithmetic reached the tree only as prose. tools/ship/pairedStats.mjs is that arithmetic, and this
// gate grades it three ways that do not depend on it being right:
//
//   1. against PUBLISHED t-TABLES -- values a reader can look up in any statistics text;
//   2. against EXACT RATIONALS -- the sign test's p is a fraction with a power of two underneath, and it is
//      asserted as that fraction and not to a tolerance;
//   3. against THIS TREE'S OWN PUBLISHED NUMBER -- v4665's commit message says "sign test 43/51 (p = 3.4e-7)",
//      computed by a script that no longer exists. If the module disagrees, either it or that number is
//      wrong, and finding out which is worth more than any row below.
//
// *** AND THE POSITIVE CONTROLS MATTER MORE HERE THAN ANYWHERE. *** A statistics module that returned 0.5 for
// everything would pass any row that only asked "is p below alpha" on a strong sample and above it on a weak
// one, as long as the rows were chosen kindly. Section 3 is the samples chosen unkindly.
"use strict";
import { pairedT, signTest, pairedBoth, ibeta } from "./pairedStats.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l) => console.log(`  ----  ${l}`);
const threw = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
/** A sample with a chosen mean and sd, so a t can be driven to a chosen value exactly. */
const sample = (n, mean, sd) => {
    // n values, symmetric about `mean`, with sample sd exactly `sd`: +-sd*sqrt((n-1)/n) scaled pairs
    const base = [];
    for (let i = 0; i < n; i++) base.push(i % 2 === 0 ? 1 : -1);
    const m0 = base.reduce((s, v) => s + v, 0) / n;
    const s0 = Math.sqrt(base.reduce((s, v) => s + (v - m0) * (v - m0), 0) / (n - 1));
    return base.map((v) => mean + (v - m0) * sd / s0);
};

console.log("pairedStats-selfcheck -- the first recomputable statistics in this tree\n");

console.log("1. THE t-TEST AGAINST PUBLISHED TABLES");
{
    // *** THE CRITICAL VALUES OF STUDENT'S t AT alpha = 0.05, ONE-SIDED. *** Any table gives these to three
    // decimals; a module that agreed with itself and not with them would be a private convention.
    const TABLE = [[1, 6.314], [2, 2.920], [5, 2.015], [9, 1.833], [19, 1.729], [29, 1.699], [49, 1.677], [99, 1.660]];
    let worst = 0;
    for (const [df, tc] of TABLE) {
        const n = df + 1;
        // drive the sample so that t is exactly tc, then the one-sided p must be 0.05
        const d = sample(n, tc / Math.sqrt(n), 1);
        const r = pairedT(d);
        worst = Math.max(worst, Math.abs(r.p - 0.05));
        say(`df ${String(df).padStart(3)}  t = ${r.t.toFixed(4)} (table ${tc})  ->  p = ${r.p.toFixed(5)}`);
    }
    ok("!! *** every published one-sided 5% critical value comes back as p = 0.05, to better than 0.0005 ***",
       worst < 5e-4,
       `worst |p - 0.05| = ${worst.toExponential(2)} over ${TABLE.length} degrees of freedom from 1 to 99. ` +
       `The table is three decimals, so agreement closer than that is agreement with the rounding.`);
    // *** AND THE DIRECTION IS PART OF THE ANSWER, WHICH AN ABSOLUTE-VALUE t WOULD LOSE. ***
    const up = pairedT(sample(20, 0.5, 1)), dn = pairedT(sample(20, -0.5, 1));
    ok("!! *** a sample with a NEGATIVE mean gives p above a half, so a harmful effect cannot clear a one-sided test ***",
       up.p < 0.05 && dn.p > 0.95 && Math.abs(up.p + dn.p - 1) < 1e-12,
       `mean +0.5 -> p ${up.p.toExponential(3)};  mean -0.5 -> p ${dn.p.toFixed(6)};  they sum to ${(up.p + dn.p).toFixed(12)}. ` +
       `A module taking |t| would report both as significant, which is how a regression gets published as a win.`);
    ok("...and a mean of exactly zero is p = 0.5, which is the only value it can be",
       Math.abs(pairedT(sample(30, 0, 1)).p - 0.5) < 1e-12, `${pairedT(sample(30, 0, 1)).p}`);
}

console.log("\n2. THE SIGN TEST AGAINST EXACT FRACTIONS");
{
    // *** THE ANSWER IS A RATIONAL WITH A POWER OF TWO UNDERNEATH, SO IT IS ASSERTED AS ONE. ***
    const CASES = [[9, 1, 11 / 1024, "11/1024"], [10, 0, 1 / 1024, "1/1024"], [1, 1, 0.75, "3/4"],
                   [2, 0, 0.25, "1/4"], [3, 3, 42 / 64, "42/64"], [0, 4, 1, "1"]];
    let allExact = true;
    for (const [u, dn, want, label] of CASES) {
        const r = signTest([...Array(u).fill(1), ...Array(dn).fill(-1)]);
        const hit = r.p === want;
        if (!hit) allExact = false;
        say(`${u} up / ${dn} down  ->  p = ${r.p}   want ${label} = ${want}   ${hit ? "EXACT" : "MISS"}`);
    }
    ok("!! *** every case is the exact rational, by === and not by tolerance ***",
       allExact,
       `Six cases from n = 2 to n = 10. The first draft summed in log space and read 0.01074218750000378 for ` +
       `nine of ten where the answer is 11/1024; that is four parts in 10^15 and changes no verdict, and it ` +
       `also makes this row impossible to write. BigInt to n = 1024, which is every window this tree declares.`);
    ok("...and ties are discarded and counted rather than folded into either side",
       (() => { const r = signTest([1, 1, 0, 0, -1]); return r.up === 2 && r.down === 1 && r.ties === 2 && r.n === 3; })(),
       JSON.stringify(signTest([1, 1, 0, 0, -1])));
    ok("...and the exact path reports that it IS the exact path, so a caller past n = 1024 can see it changed",
       signTest(Array(50).fill(1)).exact === true && signTest(Array(1100).fill(1)).exact === false,
       `n = 50 exact ${signTest(Array(50).fill(1)).exact};  n = 1100 exact ${signTest(Array(1100).fill(1)).exact} -- and the two agree to ` +
       `${Math.abs(signTest(Array(1100).fill(1)).p).toExponential(2)}, which is zero from both routes`);
}

console.log("\n3. *** THIS TREE'S OWN PUBLISHED NUMBERS, RECOMPUTED ***");
{
    // v4665's commit message and fsr.html's own prose both say: "mean +1.7992 dB, sd 1.9086, 43 frames up and
    // 8 DOWN; paired t = 6.73 (p = 7.9e-9), sign test 43/51 (p = 3.4e-7)". The sign test needs only the
    // counts, so it can be recomputed exactly. The t-test needs the mean and sd, which the record also gives.
    const s = signTest([...Array(43).fill(1), ...Array(8).fill(-1)]);
    say(`v4665's sign test, 43 of 51  ->  p = ${s.p.toExponential(4)}   published 3.4e-7`);
    ok("!! *** the module reproduces v4665's PUBLISHED sign test from the counts alone, four rounds after a script that no longer exists computed it ***",
       Math.abs(s.p - 3.4e-7) / 3.4e-7 < 0.02 && s.exact,
       `${s.p.toExponential(4)} against the published 3.4e-7 -- agreement to ${(100 * Math.abs(s.p - 3.4e-7) / 3.4e-7).toFixed(1)}%, ` +
       `which is the published value's own two significant figures. Had these disagreed, one of them was wrong and that would have mattered more than this gate.`);
    // and the t, from the record's own mean and sd
    const n51 = 51, mean = 1.7992, sd = 1.9086;
    const tRec = mean / (sd / Math.sqrt(n51));
    const r = pairedT(sample(n51, mean, sd));
    say(`v4665's t from its own mean ${mean} and sd ${sd} over ${n51} frames  ->  t = ${tRec.toFixed(3)}   published 6.73`);
    ok("!! ...and its PUBLISHED t is what its own published mean and sd imply, so the record is internally consistent",
       Math.abs(tRec - 6.73) < 0.01 && Math.abs(r.t - tRec) < 1e-9,
       `t = ${tRec.toFixed(4)} against the published 6.73, and the module gets the same t from a constructed sample with that mean and sd (${r.t.toFixed(4)}). ` +
       `p = ${r.p.toExponential(2)} against the published 7.9e-9.`);
}

console.log("\n4. THE CONJUNCTION, AND WHY IT IS NOT AN `&&` IN A CALLER");
{
    // *** v4665 DECLARED THIS RULE BECAUSE v4658's TESTS DISAGREED. *** Its t cleared at twenty-one frames
    // while its sign test did not, and the round could have quoted whichever it preferred. The conjunction is
    // in the module so a caller cannot reach for one test alone without writing that choice down.
    // A sample crafted so the t clears and the sign test does not: a few large wins among many small losses.
    const split = [...Array(6).fill(4), ...Array(15).fill(-0.4)];
    const b = pairedBoth(split);
    say(`6 wins of +4 and 15 losses of -0.4: mean ${b.t.mean.toFixed(3)}, t p = ${b.t.p.toExponential(3)}, sign ${b.sign.up}/${b.sign.n} p = ${b.sign.p.toFixed(4)}`);
    ok("!! *** a sample whose t-test clears and whose sign test does not is reported as NOT cleared ***",
       b.t.p < 0.05 && b.sign.p > 0.05 && b.cleared === false,
       `t p ${b.t.p.toExponential(3)} clears, sign p ${b.sign.p.toFixed(4)} does not, cleared = ${b.cleared}. ` +
       `This is v4658's exact situation, reconstructed: a mean carried by six frames out of twenty-one.`);
    // *** AND THE "CLEARS BOTH" SAMPLE HAS TO BE MOSTLY POSITIVE, NOT MERELY POSITIVE ON AVERAGE. *** The
    // first draft used mean 0.6 with sd 1, which is 1.588 and -0.388 alternating: a real positive mean and an
    // exactly even sign split, so the t cleared and the sign test read 20/40. That was the row being wrong and
    // the module being right, and it is the same confusion the conjunction exists to prevent.
    const both = pairedBoth(sample(40, 1.5, 1));
    ok("...and a sample that clears both is reported as cleared",
       both.cleared === true && both.t.p < 0.05 && both.sign.p < 0.05,
       `mean ${both.t.mean.toFixed(2)}, sd ${both.t.sd.toFixed(2)}: t p ${both.t.p.toExponential(3)}, sign ${both.sign.up}/${both.sign.n} p ${both.sign.p.toExponential(3)}`);
    // *** AND AN UNTESTABLE SAMPLE DOES NOT CLEAR, WHICH IS THE NaN TRAP FROM v4682 IN A NEW PLACE. ***
    const flat = pairedBoth(Array(20).fill(0.3));
    ok("!! *** a sample with ZERO variance has no t, and an absent p does NOT clear -- an untestable sample is not a passed test ***",
       flat.t.t === null && flat.t.p === null && flat.cleared === false && /zero variance/.test(flat.t.why || ""),
       `twenty identical differences of +0.3: t ${flat.t.t}, p ${flat.t.p}, cleared ${flat.cleared}. ` +
       `*** THIS ROW FOUND A DEFECT IN THE MODULE. *** The guard was \`sd > 0\`, and twenty copies of 0.3 have a ` +
       `sample sd of 1.7e-17 rather than 0 -- because they sum to 6.000000000000001. The first draft reported ` +
       `t = 2.4e16 with p = 1e-300: a constant sample presented as the most significant result in the tree's history. ` +
       `A deterministic pipeline can produce exactly this, and v4682's H2 row PASSED on a table of NaN for the mirror-image reason.`);
    // and the near-constant case the same defect covered: spread that is rounding error, not spread
    // *** AND THIS SAMPLE TOOK TWO TRIES TOO. *** 0.3 + 1e-17 IS 0.3: the increment is below the ULP of 0.3
    // (about 5.5e-17), so the values really were all equal and the constant branch fired. A spread has to be
    // REPRESENTABLE to be negligible -- 1e-9 beside 1e6 is both.
    const near = pairedBoth([1e6, 1e6 + 1e-9, 1e6, 1e6, 1e6 + 1e-9, 1e6, 1e6, 1e6]);
    ok("!! ...and a sample whose spread is NEGLIGIBLE BESIDE ITS OWN MEAN is refused too, which exact equality alone would not catch",
       near.t.t === null && near.cleared === false && /negligible variance/.test(near.t.why || ""),
       `${near.t.why}  -- the values are NOT all equal, so the constant test does not fire. ` +
       `A relative threshold does, because a denominator of pure rounding error is not a spread whatever the values look like.`);
    ok("...and a sample of all ties has no signs to test and does not clear either",
       pairedBoth(Array(10).fill(0)).cleared === false && pairedBoth(Array(10).fill(0)).sign.p === null,
       JSON.stringify(pairedBoth(Array(10).fill(0)).sign));
}

console.log("\n5. WHAT IT REFUSES");
{
    ok("a single observation is refused -- a paired test on one pair has no variance and no signs",
       /at least 2 paired observations/.test(threw(() => pairedT([1])) || ""), threw(() => pairedT([1])));
    ok("*** a NaN in the sample is refused rather than propagated, because a NaN effect is not a small effect ***",
       /must be finite/.test(threw(() => pairedT([1, 2, NaN])) || "")
       && /must be finite/.test(threw(() => signTest([1, NaN])) || ""),
       threw(() => pairedT([1, 2, NaN])));
    ok("an alpha outside (0, 1) is refused",
       /alpha must be in/.test(threw(() => pairedBoth([1, 2, 3], 1)) || ""), threw(() => pairedBoth([1, 2, 3], 1)));
    ok("ibeta outside [0, 1] is refused",
       /x must be in/.test(threw(() => ibeta(1, 1, 1.5)) || ""), threw(() => ibeta(1, 1, 1.5)));
    ok("...and ibeta's endpoints are exact, which is what makes the t-test's tails right",
       ibeta(2, 3, 0) === 0 && ibeta(2, 3, 1) === 1, `I_0 = ${ibeta(2, 3, 0)}, I_1 = ${ibeta(2, 3, 1)}`);
    // *** AND THE NON-CONVERGENCE PATH IS REACHED RATHER THAN ASSUMED UNREACHABLE. *** A sabotage that made
    // the continued fraction return its last iterate instead of throwing scored 0 red, so an input that
    // actually defeats it was looked for and found: a = b = 10^6 at the pivot runs past 500 iterations.
    // That is df = 2,000,000 -- two million paired frames, a window this tree will never declare -- so the
    // guard is not on the path any real call takes, and it is a TESTED behaviour rather than a hopeful comment.
    const nc = threw(() => ibeta(1e6, 1e6, 0.5));
    ok("*** an incomplete beta that does not converge THROWS, naming its arguments, rather than returning its 500th guess as a p-value ***",
       /did not converge at a=1000000, b=1000000, x=0.5/.test(nc || "") && /no p-value is returned/.test(nc || ""),
       `${nc}  -- reached at df = 2,000,000, which no window here approaches, so this is defence in depth that is nevertheless exercised.`);
}

// ---- THE SABOTAGE LOG ------------------------------------------------------------------------------------
//
// *** A CONTROL THAT CANNOT FAIL IS DECORATION, AND IN A STATISTICS MODULE A KINDLY-CHOSEN ROW HIDES
// EVERYTHING. *** Eight mutations, each reverted.
//
//   S1  the t-test drops its direction, so a harmful effect reads significant  -> 1 red (1)
//   S2  the sd divides by n instead of n-1                                     -> 2 red (1, 3)
//   S3  the t forgets the sqrt(n)                                              -> 5 red (1, 3, 4)
//   S4  the sign test excludes the observed count (> instead of >=)             -> 2 red (2, 3)
//   S5  ties are counted as successes                                          -> 2 red (2, 4)
//   S6  the conjunction becomes a disjunction                                  -> 3 red (4)
//   S7  the zero-variance guard goes back to `sd > 0`                          -> 2 red (4)
//   S8  the continued fraction returns its last guess instead of throwing      -> 1 red (5), AFTER A ROW
//
// *** S8 SCORED 0 RED FIRST, AND THE RESPONSE WAS TO GO LOOKING FOR AN INPUT THAT DEFEATS THE FRACTION. ***
// One exists: a = b = 10^6 at the pivot runs past 500 iterations. That is df = 2,000,000, which is two million
// paired frames and a window this tree will never declare -- so the guard is off the path any real call takes,
// and it is now exercised anyway rather than left as a hopeful comment. The alternative was to record it as
// defence in depth the way v4675 and v4677 recorded theirs; it turned out not to need that.
//
// *** AND TWO ROWS WERE WRONG BEFORE THE MODULE WAS. *** The "clears both" row first used mean 0.6 with sd 1,
// which alternates 1.588 and -0.388: a real positive mean with an exactly even sign split, so the sign test
// read 20/40 and the row failed while the module was right -- the very confusion the conjunction exists to
// prevent, committed by the gate for it. And the negligible-variance row first used 0.3 + 1e-17, which IS 0.3,
// because the increment is below the ULP; a spread must be representable to be negligible.
//
// *** THE ONE DEFECT IN THE MODULE WAS FOUND BY A POSITIVE CONTROL, WHICH IS WHAT THEY ARE FOR. *** `sd > 0`
// does not detect a constant sample: twenty copies of 0.3 sum to 6.000000000000001, so the sd is 1.7e-17 and
// the first draft reported t = 2.4e16 with p = 1e-300 -- a constant sample presented as the most significant
// result in this tree's history. A deterministic render pipeline produces constant deltas routinely.

console.log(`\npairedStats-selfcheck: ${fails ? `${fails} FAILED` : "ALL GREEN"}`);
console.log("unchecked here: ANY TEST THIS TREE HAS NOT DECLARED. Two one-sided paired tests is exactly what " +
    "v4658, v4660, v4665 and v4671 asked for, and a general library would be surface nothing measures. " +
    "MULTIPLICITY: nothing here corrects for testing several cells, and this tree's pre-registrations handle " +
    "that by declaring ONE primary rather than by adjusting alpha -- a choice, not an absence. THE OTHER THREE " +
    "ROUNDS' NUMBERS: v4658's, v4660's and v4671's t-values were published without the sd beside them, so only " +
    "v4665's could be recomputed here; the sign tests could all be checked if their up/down counts were in the " +
    "records, and two of them are not. AND NO POWER ANALYSIS: the windows in this tree are set by what the rig " +
    "can hold on screen, which v4684's pre-registration derives rather than chooses, and nothing computes what " +
    "effect size those windows could detect.");
process.exit(fails ? 1 : 0);
