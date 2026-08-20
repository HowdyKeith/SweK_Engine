// WebGLEngine/tools/ship/nextRounds.mjs — v3340
// ---------------------------------------------------------------------------------------------------------------
// THE STANDING LIST OF WHAT IS DEFERRED AND WHY — because a backlog that lives in a conversation is not a backlog.
//
// v3314 audited the tree's fifteen "its own round" notes and found that SEVEN WERE ALREADY SETTLED, FOUR WERE
// NEVER DEFERRALS AT ALL, and one was a refusal recorded as an omission. The failure mode is not forgetting to
// write things down; it is writing them down in prose that nothing ever re-reads, so a finished item keeps
// advertising itself as open and the next reader spends a round rediscovering that.
//
// So each entry here carries a BLOCKER rather than a priority, and the blocker is the thing that can be checked.
// "Needs a rig" is a fact about the world. "High priority" is a fact about somebody's mood last Tuesday.
//
// THE THREE BLOCKER KINDS, and only the first is anyone's to schedule:
//   OPEN      -- doable in the sandbox now. Nothing is stopping it but the work.
//   HARDWARE  -- needs a GPU, a browser, a second machine, or a WASM build that does not exist here.
//   UPSTREAM  -- doable, but worth nothing until something else lands first, and the entry says which.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

export const NEXT_ROUNDS = [
    { id: "population-autopin", state: "CLOSED", note: "DONE at v3553. populationCensus.mjs records the population at ship time and diffs it, and gateReach-selfcheck now reads that record instead of a typed number. The verdicts distinguish routine growth from the thing that should stop a ship: GREW names every addition and reconciles the totals; REMOVALS is treated harder than a gain, because adding physics is routine and physics quietly disappearing is how a deletion ships unnoticed, and the old pin fired identically for both. NO-RECORD is its own verdict rather than a pass. And the gate does NOT rewrite the record it compares against -- writing is a ship step, comparing is the gate, deliberately different programs, because a check that repairs its own expectation can never fail twice." },
    { id: "flip3d-gate", state: "CLOSED", note: "DONE at v3427. Free fall to 1.4e-7, 9216 particles conserved exactly, divergence down 2.1e+4 and -- unlike 2D -- MONOTONICALLY. Two differences from the 2D sibling recorded: the monotone convergence, and that step() is synchronous here while 2D's is async, despite the header calling the pipeline identical." },
    { id: "beer-lambert", state: "CLOSED", note: "DONE at v3426. The exact half holds to 5.6e-17 and optical depths add bit-exactly, which is what makes a line integral the right object for CT. The failing half is measured: with a real spectrum the effective attenuation falls 4.4x with depth and a uniform cylinder cups by 30%. The cost to ct.js is now a number -- 12.0562 against a true line integral of 35.3854 for the same slab." },
    {
        id: "browser-screenshot-floor",
        blocker: "HARDWARE",
        what: "Measure the perceptual floor for browser screenshots, so render-QA's SSIM/pHash/IoU signals can gate instead of merely being recorded.",
        how: "On the rig: run render-qa twice with no code change between runs. The spread between two identical runs IS the floor -- antialiasing, font hinting, compositor timing. Two commands.",
        why: "v3339 wired the signals into all 54 pages as RECORDED, NOT GATING, because the headless floor is exactly zero (Jolt is deterministic) and a browser is not. Gating on an unmeasured number is the failure the whole perceptual line of work exists to avoid.",
    },
    {
        id: "cross-backend-envelope",
        blocker: "HARDWARE",
        what: "Record the box3d-vs-Jolt drift, pixel and perceptual envelope.",
        how: "On a rig where box3d's WASM builds: `node physics/backend-qa-check.mjs --update`. One command.",
        why: "backend-baseline.json has carried \"pairs\": {} since 2026-07-13 because box3d has never loaded wherever --update was run. v3338 made a missing envelope fail as UNMEASURED instead of passing silently, so the first run where box3d loads goes RED and names the command rather than measuring the pair and discarding it.",
    },
    {
        id: "device-verdicts",
        blocker: "HARDWARE",
        what: "Four pages owe a report from real hardware: hmc-bench, ising-bench, magmap-bench, consistency-fleet.",
        how: "Open each page on a machine with a GPU and press submit. They are parked in Arriving Pages with the reason attached, and `node tools/render-qa/deviceOwed.mjs` prints who still owes what.",
        why: "Received kinds: NONE. The ising kernel in particular is graded at ZERO tolerance -- bit-exact or rejected -- so there is no partial credit and no way to infer the answer from here.",
    },
    {
        id: "sys-lag-reading",
        blocker: "HARDWARE",
        what: "One `GET /sys/lag` on Keith's rig after a few minutes of uptime.",
        how: "curl it. The response names each blocking callback by its REGISTRATION site, not its fire site.",
        why: "v3317 re-read the v3278 samples and found the duty cycle FALLS to ~22% and plateaus rather than growing without bound -- so there are two problems, a startup burst and a steady periodic cost, and only a reading tells us which callback owns the second.",
    },
    {
        id: "image-pair-second-side",
        blocker: "UPSTREAM",
        what: "A second, independent renderer for the image-based consistency pair.",
        how: "The render-qa Playwright rig can capture a real render; wiring it to frame the same scene as the headless rasteriser would give two mechanisms.",
        why: "physics/imagePair.mjs declares the pair INCOMPLETE because only one side exists. A pair assembled from one mechanism twice is reproducibility wearing the costume of corroboration, and the board's admission rule does not bend for a pair that would be convenient.",
        upstream: "browser-screenshot-floor -- without a floor there is nothing to gate the pair against",
    },
    {
        id: "ensemble-weighting",
        blocker: "UPSTREAM",
        what: "Weight the soft signals rather than averaging them equally.",
        how: "Fit weights against cases where the right answer is known.",
        why: "Deferred twice for the same reason: there was nothing to tune against. v3340 changed that -- the CT sweep gives labelled degradation against exact ground truth, and it already showed edge overlap is worth far more than pHash there (0.223 vs 4 bits of 63 at 8 angles). An equal average is currently wrong in a measurable direction.",
        upstream: "reconQuality gives the first labelled data; more would come from the browser floor",
    },
    { id: "fbp-gain-normalisation", state: "CLOSED", note: "ANSWERED NO at v3378, and the measurement is in reconQuality.mjs. The gain is NOT a filter constant: it runs 0.4319 to 0.9340 across fixtures, nearly invariant in ANGLE COUNT but tracking N and nDet -- and gain*nDet/N collapses to 0.9456 with a spread of 0.0185. IT IS A SAMPLING RATIO. Correcting 0.649 in the filter would be right at N=96/nDet=140, this gate's own fixture, and wrong everywhere else." },
];

export const byBlocker = (kind) => NEXT_ROUNDS.filter((r) => r.blocker === kind);

export function lines() {
    const out = [];
    for (const kind of ["OPEN", "UPSTREAM", "HARDWARE"]) {
        const rows = byBlocker(kind);
        if (!rows.length) continue;
        out.push(`${kind} (${rows.length}):`);
        for (const r of rows) out.push(`  ${r.id} -- ${r.what}`);
    }
    out.push("");
    out.push("A blocker is a fact about the world. A priority is a fact about somebody's mood last Tuesday.");
    return out;
}

if (import.meta.url === `file://${process.argv[1]}`) for (const l of lines()) console.log(l);
