// WebGLEngine/tools/roundhouse/liftedIdeas-selfcheck.mjs — v3527
//
// Run: node tools/roundhouse/liftedIdeas-selfcheck.mjs   (~0.1s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// TWO IDEAS TAKEN FROM PUBLISHED WORK, WITH NO CODE LIFTED FROM EITHER, and both adapted rather than adopted.
//
// QeRL (NVlabs, Apache-2.0, ICLR 2026) claims quantization noise IMPROVES exploration and schedules it
// deliberately. That is a nuisance parameter claimed as a BENEFIT -- the exact inverse of criterion 2, which
// says a knob carrying no physics must not move the answer. Both claims are only meaningful if the effect is
// bigger than the scatter the knob already produces, and NOTHING here had ever compared a TREND against a seed
// spread. corroborate() computes the spread at a single point; a sweep was always read by eye.
//
// LightReasoner (HKUDS, MIT, ACL 2026 Oral) uses the disagreement between a strong and a weak model as the
// signal, with no ground-truth labels. The disagreement is already being produced here and thrown away:
// routeBench escalates when the SweK gate fails a cheap attempt, records chosen/verified/escalations/cost, and
// never records the CONTRAST. *** AND THE VERSION HERE IS LABELLED, WHICH IS THE ONLY REASON IT IS ADOPTABLE:
// the gate has already ruled on every attempt, so the contrast is a partition of graded outcomes rather than a
// proxy for a grade. *** An unlabelled contrast is what this lab refuses everywhere else.

import { trendVsNoise, noiseHelps } from "./trendVsNoise.mjs";
import { contrast, discriminatingSet, contrastIsInformative, anomalyReport } from "./routeContrast.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const rng = (s) => { let x = s >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };
const noisy = (slope, amp, off = 0) => ({ value, seed }) => {
    const r = rng(seed * 7919 + value * 104729 + off * 13); r();
    return slope * value + amp * (r() - 0.5);
};

// ---- 1. THE THREE VERDICTS, EACH DEMONSTRATED ------------------------------------------------------------------
{
    ok("!! a trend far larger than its scatter is RESOLVED",
       trendVsNoise({ measure: noisy(1, 0.1), values: [1, 2, 3, 4, 5] }).verdict === "RESOLVED");
    const buried = trendVsNoise({ measure: noisy(0.01, 1), values: [1, 2, 3, 4, 5] });
    ok("!! a real but small effect inside a large scatter is UNRESOLVED -- which is NOT 'no effect'",
       buried.verdict === "UNRESOLVED" && /cannot tell/.test(buried.why),
       "ratio " + buried.ratio.toFixed(2) + " against a margin of 3. The slope really is nonzero here and the " +
       "measurement still cannot see it, so the verdict says so rather than reporting an absence");
    const vac = trendVsNoise({ measure: () => 42, values: [1, 2, 3] });
    ok("!! seeds returning bit-identical values are VACUOUS, not perfectly precise",
       vac.verdict === "VACUOUS",
       "a zero denominator is not infinite confidence -- the same house rule as corroborate's seedVacuous and suspiciousZero");
}

// ---- 2. *** THE ising.L SHAPE: A BEAUTIFUL CONVERGENCE THAT IS NOISE. *** ------------------------------------------
// This is the standing case the lab already owns, reproduced here as a fixture so the instrument is tested
// against the failure it exists to prevent rather than only against clean cases.
{
    const pure = trendVsNoise({ measure: noisy(0, 1, 3), values: [1, 2, 3, 4, 5], seeds: [1, 2, 3, 4, 5] });
    ok("!! a MONOTONE, entirely convincing sequence generated from PURE NOISE is refused",
       pure.monotone && pure.verdict === "UNRESOLVED",
       "means " + pure.points.map((p) => p.mean.toFixed(4)).join(" -> ") + " — cleanly rising, and the underlying " +
       "slope is exactly ZERO. Change " + pure.change.toFixed(4) + " against scatter " + pure.noise.toFixed(4) +
       " gives a ratio of " + pure.ratio.toFixed(2) + ". THIS is the shape that gets believed");
    ok("!! ...and monotonicity is reported but deliberately NOT used to decide",
       pure.monotone === true && pure.verdict !== "RESOLVED",
       "a monotone sequence of noise is still noise. Letting the shape of the curve vote would be exactly how " +
       "ising.L became a standing example");
}

// ---- 3. THE INVERTED CLAIM, PUT DIRECTLY ------------------------------------------------------------------------------
{
    const unsupported = noiseHelps({ measure: noisy(0, 1, 3), noiseLevels: [1, 2, 3, 4, 5], seeds: [1, 2, 3, 4, 5] });
    ok("!! 'adding noise helps' comes back UNSUPPORTED when the sweep cannot resolve it",
       unsupported.helps === null && /not refuted/.test(unsupported.claim),
       "and UNSUPPORTED IS NOT REFUTED -- the claim may be true and this measurement cannot say. That distinction " +
       "is the whole reason the middle verdict exists");
    const contradicted = noiseHelps({ measure: noisy(-1, 0.1), noiseLevels: [1, 2, 3, 4, 5], better: "higher" });
    ok("!! ...and a resolved sweep in the WRONG direction is CONTRADICTED, which is a stronger result",
       contradicted.helps === false && /CONTRADICTED/.test(contradicted.claim),
       "the metric moved the wrong way by more than the scatter — a real finding, where an unresolved sweep is only an absence of one");
    let threw = false;
    try { trendVsNoise({ measure: noisy(1, 1), values: [1, 2, 3], seeds: [7] }); } catch { threw = true; }
    ok("!! a single seed THROWS rather than reporting a trend with no scatter to compare it to",
       threw, "one seed has no within-point spread, and the entire question is that spread");
}

// ---- 4. THE ROUTE CONTRAST, PARTITIONED BY THE GATE ----------------------------------------------------------------------
{
    const recs = [
        { task: "a", weak: { verified: true }, strong: { verified: true } },
        { task: "b", weak: { verified: true }, strong: { verified: true } },
        { task: "c", weak: { verified: false }, strong: { verified: true } },
        { task: "d", weak: { verified: false }, strong: { verified: true } },
        { task: "e", weak: { verified: true }, strong: { verified: false } },
        { task: "f", weak: { verified: false }, strong: { verified: false } },
    ];
    const c = contrast(recs);
    ok("!! the four cells are named by what the GATE said, not by whether the models agreed",
       c.counts.bothPass === 2 && c.counts.weakFails === 2 && c.counts.strongFails === 1 && c.counts.bothFail === 1,
       JSON.stringify(c.counts) + " — every cell carries a verdict, so this is a partition of graded outcomes " +
       "rather than a proxy for a grade. LightReasoner's contrast is unlabelled by design; this one cannot be");
    ok("!! the discriminating set is exactly the tasks the cheap route failed and the strong one passed",
       discriminatingSet(c).join(",") === "c,d",
       "which is what escalation exists for, and what a harder bench should be made of — routeBench produces these " +
       "events on every run and has never recorded them");
    const a = anomalyReport(c);
    ok("!! ...and the cell worth reading hardest is CHEAP-PASSED-STRONG-FAILED, reported per task rather than as a rate",
       a.anomalies === 1 && /read this one/.test(a.lines[0]),
       "either the task is misleadingly easy or the gate let a wrong answer through, and both are findings about " +
       "the HARNESS rather than about the models. A rate would invite watching it; a list invites reading it");
}

// ---- 5. AND THE CHECK THAT KEEPS THE CONTRAST HONEST ---------------------------------------------------------------------
{
    const allPass = contrast([
        { task: "a", weak: { verified: true }, strong: { verified: true } },
        { task: "b", weak: { verified: true }, strong: { verified: true } },
    ]);
    const info = contrastIsInformative(allPass);
    ok("!! a contrast where NOTHING ever fails the gate is reported UNINFORMATIVE, not as agreement",
       !info.informative && /indistinguishable from two excellent models/.test(info.why),
       "an empty contrast from a gate that never fails looks exactly like two excellent routes, and the difference " +
       "matters — this is the same objection the lab makes to any check that cannot fail");
    const real = contrast([
        { task: "a", weak: { verified: false }, strong: { verified: true } },
        { task: "b", weak: { verified: true }, strong: { verified: true } },
    ]);
    ok("...and one that does discriminate is reported informative, with the counts",
       contrastIsInformative(real).informative,
       contrastIsInformative(real).why);
}

// ---- 6. PROVENANCE IS RECORDED, INCLUDING WHAT WAS REFUSED -----------------------------------------------------------------
{
    // *** READ THROUGH prose(), NOT WITH A RAW REGEX -- WHICH IS THE MISTAKE THIS CHECK MADE FIRST. ***
    // "No code is lifted" and "an unlabelled signal is what this lab refuses" both WRAP ACROSS COMMENT LINES, so
    // a regex over the raw source sees "No code" and "// is lifted" and matches neither. That is precisely the
    // defect tools/ship/sourceScan.mjs was built for at v3298, and the lensCorroborated check fell into it too.
    // The tool exists; using it is the fix.
    const fs = await import("node:fs");
    const { prose } = await import("../ship/sourceScan.mjs");
    const t = prose(fs.readFileSync("tools/roundhouse/trendVsNoise.mjs", "utf8"));
    const r = prose(fs.readFileSync("tools/roundhouse/routeContrast.mjs", "utf8"));
    ok("!! both files name their source, its licence, and the fact that no code was lifted",
       /QeRL.*Apache-2\.0/s.test(t) && /no code is lifted/i.test(t) &&
       /LightReasoner.*MIT/s.test(r) && /No code is lifted/i.test(r),
       "QeRL is CUDA on an H100 and this lab trains nothing; LightReasoner is a fine-tuning pipeline. The SHAPE " +
       "of each claim transferred and none of the implementation did");
    ok("!! ...and the route contrast records WHY the unlabelled version was not adopted",
       /unlabelled signal is what this lab refuses/i.test(r),
       "the caution is in the file rather than in a commit message, because that is where the next reader looks");
}

console.log(fails ? ("[liftedIdeas-selfcheck] FAILED " + fails) : "[liftedIdeas-selfcheck] all passed");
process.exit(fails ? 1 : 0);
