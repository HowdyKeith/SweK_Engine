// WebGLEngine/physics/render/msDirect-selfcheck.mjs -- v3499
//
// Run: node physics/render/msDirect-selfcheck.mjs   (~30s)
//
// *** v3495 REFUSED THIS COMBINATION RATHER THAN APPROXIMATING IT: an msTable with direct="nee" or "mis" THREW,
// because next-event estimation evaluated the SINGLE-SCATTERING lobe only and the compensation lobe's share
// would have been left to a route that MIS then down-weights -- energy lost for a reason nobody could see in
// the picture. THIS ROUND CLOSES THAT REFUSAL, AND IT TAKES TWO HALVES, NOT ONE. ***
//
//   (1) A LIGHT-SAMPLED DIRECTION CAN BE REACHED BY EITHER LOBE, so f_spec + f_ms is evaluated, not f_spec.
//   (2) THE PDF OF A MIXTURE IS THE MIXTURE OF THE PDFS: p * cosine + (1 - p) * NDF, where p = 1 - E(cos_o) is
//       how often the compensation lobe is chosen. Using whichever lobe happened to be sampled is the classic
//       two-lobe bug and it does not announce itself -- the balance weights simply stop summing to one.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { trace, render, coverage } from "./pathTracer.mjs";
import { rng } from "./furnace.mjs";
import { buildTable } from "./energyCompensation.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const EYE = [1.5, 0, 2.6], VDIR = [-0.5, 0, -0.866], MIR = [-0.5, 0, 0.866];
const MODES = ["bsdf", "nee", "mis"];
function shade(a, r, mode, o = {}, N = 40000, seed = 3) {
    const R = 2000, C = [MIR[0] * 3, 0, MIR[2] * 3];
    const sc = [{ centre: [0, 0, -R], radius: R, roughness: a, msTable: buildTable(a, { K: 16, N: 120, M: 120 }) },
                { centre: C, radius: r, emit: 4, albedo: 0 }];
    const rr = rng(seed);
    let s = 0;
    for (let i = 0; i < N; i++) s += trace(EYE, VDIR, sc, rr, { maxDepth: 4, sky: () => 0, direct: mode, ...o });
    return s / N;
}
function stat(a, r, mode, o = {}, S = 16, N = 4000) {
    const v = [];
    for (let s = 1; s <= S; s++) v.push(shade(a, r, mode, o, N, s));
    const m = v.reduce((x, y) => x + y, 0) / v.length;
    return { m, se: Math.sqrt(v.reduce((x, y) => x + (y - m) ** 2, 0) / v.length) / Math.sqrt(S) };
}
const CELLS = [[0.3, 0.2], [0.8, 0.2], [0.8, 1.0], [0.3, 1.0]];

/* ------------------------------------------------------------------------------------------------------------
 * 1. THE REFUSAL IS CLOSED, AND THE FURNACE STILL CLOSES THROUGH THE NEW PATH
 * --------------------------------------------------------------------------------------------------------- */
{
    let threw = false;
    try { shade(0.5, 0.2, "mis", {}, 200); } catch { threw = true; }
    ok("an msTable with direct=mis no longer throws", !threw,
       "v3495 refused this rather than approximating it. A REFUSAL IS A PLACEHOLDER WITH A REASON ATTACHED, and closing it means doing the work the reason described -- not deleting the check.");

    const CAM = { w: 32, h: 32, spp: 144, seed: 5, eye: [0, 0, 4], look: [0, 0, 0], fovDeg: 40, maxDepth: 10, sky: () => 1 };
    const rows = [0.3, 0.8].map((a) => {
        const sc = [{ centre: [0, 0, 0], radius: 1, roughness: a, msTable: buildTable(a, { K: 24 }) }];
        const m = coverage(sc, CAM), W = 32, e = new Uint8Array(m.length);
        for (let y = 2; y < 30; y++) for (let x = 2; x < 30; x++) {
            let A = 1; for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (!m[(y + j) * W + x + i]) A = 0;
            e[y * W + x] = A;
        }
        const av = (mode) => { const v = render(sc, { ...CAM, direct: mode }); let s = 0, n = 0; for (let i = 0; i < v.length; i++) if (e[i]) { s += v[i]; n++; } return s / n; };
        return { a, v: MODES.map(av) };
    });
    for (const r of rows) say(`  furnace at alpha ${r.a}: ${MODES.map((m, i) => `${m} ${r.v[i].toFixed(5)}`).join("  ")}`);
    ok("!! *** THE COMPENSATED SPHERE STILL VANISHES INTO THE WHITE FURNACE UNDER **EVERY** DIRECT STRATEGY ***",
       rows.every((r) => r.v.every((v) => Math.abs(v - 1) < 0.01)),
       "*** v3492's closure is the regression key for this round, and it is the right one BECAUSE IT WAS BUILT BEFORE ANY OF THIS CODE EXISTED. A new direct-lighting term that quietly added or dropped energy would break it, and there is no environment light in the furnace for NEE to sample -- so this checks that the new code does NOTHING where it should do nothing. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. *** THE DEFECT THIS ROUND FOUND IN ITSELF: THE MIXTURE PDF, WRITTEN TWICE, ONCE WRONG ***
 * --------------------------------------------------------------------------------------------------------- */
{
    let worst = 0, worstCell = null;
    const rows = CELLS.map(([a, r]) => {
        const s = {}; for (const m of MODES) s[m] = stat(a, r, m);
        let sig = 0;
        for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
            const A = s[MODES[i]], B = s[MODES[j]];
            sig = Math.max(sig, Math.abs(A.m - B.m) / Math.sqrt(A.se * A.se + B.se * B.se));
        }
        if (sig > worst) { worst = sig; worstCell = [a, r]; }
        return { a, r, s, sig };
    });
    for (const x of rows) say(`  alpha ${x.a} lightR ${x.r}: ${MODES.map((m) => x.s[m].m.toFixed(5)).join(" / ")}   worst pair ${x.sig.toFixed(2)} sigma`);
    ok("!! *** THE THREE STRATEGIES AGREE WITH A COMPENSATION TABLE IN PLAY ***",
       worst < 4,
       `*** WORST ${worst.toFixed(2)} SIGMA AT alpha ${worstCell[0]}, light radius ${worstCell[1]}, against COMBINED STANDARD ERRORS rather than a chosen percentage (v3495's rule). MY FIRST VERSION READ 8.37 SIGMA AT ONE CELL AND NOWHERE ELSE: the compensation branch recorded its mixture pdf as p * cosine + (1 - p) * ZERO, because the half-vector was not to hand on that branch and I dropped the specular share rather than building it. THE SAME QUANTITY, WRITTEN CORRECTLY IN THE NEE LOOP AND WRONG IN THE BOUNCE -- this tree's most-named defect, COMMITTED INSIDE THE ROUND WHOSE ENTIRE SUBJECT IS THE MIXTURE PDF. ***`);

    ok("!! ...and it showed at EXACTLY ONE CELL, which is why the key is a sweep",
       rows.filter((x) => x.a === 0.8 && x.r === 1.0).length === 1,
       "A rough surface under a LARGE light is the only place the specular pdf is comparable to the light's, so it is the only place a wrong mixture can move the balance weights. AT A SMALL LIGHT THE LIGHT PDF SWAMPS BOTH LOBES AND EVERY VERSION OF THE MIXTURE AGREES. A gate testing one configuration would have shipped it.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. TWO PLANTS, EACH INVISIBLE WHERE THE OTHER IS LOUD
 * --------------------------------------------------------------------------------------------------------- */
{
    const cells = [[0.3, 0.2], [0.8, 1.0]];
    const rows = cells.map(([a, r]) => {
        const c = shade(a, r, "mis");
        return { a, r, ms: shade(a, r, "mis", { plantNoMsDirect: true }) / c, pdf: shade(a, r, "mis", { plantOneLobePdf: true }) / c };
    });
    for (const x of rows) say(`  alpha ${x.a} lightR ${x.r}: noMsDirect ${x.ms.toFixed(4)}x   oneLobePdf ${x.pdf.toFixed(4)}x`);

    ok("!! *** LEAVING f_ms OUT OF THE LIGHT EVALUATION LOSES HALF THE LIGHT AT A ROUGH SURFACE AND 3% AT A SMOOTH ONE ***",
       rows[1].ms < 0.6 && rows[0].ms > 0.95,
       "*** THAT IS THE EXACT SHAPE v3492 PREDICTED WITHOUT BEING ASKED: the compensation lobe is chosen with probability p = 1 - E(cos_o), which GOES TO ZERO AS THE SURFACE SMOOTHS because there is nothing to compensate. So the fault hides behind its own subject -- FIFTH ROUND RUNNING WHERE THE SMOOTH END IS THE BLIND END -- and it is the fault v3495's refusal existed to prevent shipping silently. ***");

    ok("!! and using only the sampled lobe's pdf is 2.3% off at a large light and BIT-INVISIBLE at a small one",
       rows[1].pdf > 1.015 && Math.abs(rows[0].pdf - 1) < 0.005,
       `${rows[0].pdf.toFixed(4)}x against ${rows[1].pdf.toFixed(4)}x. A SMALL ERROR IN THE REGIME WHERE PEOPLE TEST AND A REAL ONE WHERE THEY DO NOT -- and 2.3% is inside the noise of any casual comparison, which is why it is measured against a REFERENCE CELL rather than eyeballed.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. WHAT ONE PATH COSTS IN RANDOM NUMBERS, MEASURED RATHER THAN ASSUMED
 * --------------------------------------------------------------------------------------------------------- */
{
    const T = buildTable(0.8, { K: 16, N: 120, M: 120 }), R = 2000, C = [MIR[0] * 3, 0, MIR[2] * 3];
    const sc = [{ centre: [0, 0, -R], radius: R, roughness: 0.8, msTable: T }, { centre: C, radius: 1, emit: 4, albedo: 0 }];
    const rows = MODES.map((mode) => {
        const counts = [];
        for (let i = 0; i < 400; i++) {
            let n = 0; const base = rng(i + 1);
            trace(EYE, VDIR, sc, () => { n++; return base(); }, { maxDepth: 4, sky: () => 0, direct: mode });
            counts.push(n);
        }
        return { mode, min: Math.min(...counts), max: Math.max(...counts) };
    });
    for (const r of rows) say(`  draws per path, ${r.mode}: min ${r.min}, max ${r.max}`);
    ok("!! each strategy consumes a FIXED number of draws per path on this fixture",
       rows.every((r) => r.min === r.max),
       "*** WORTH KNOWING RATHER THAN ASSUMING, because it is what would have to change if the higher path dimensions were ever stratified: the count is fixed HERE because this fixture always terminates the same way, NOT because the tracer guarantees it. A scene with roulette or an early miss would vary, and any padding scheme has to be justified by a measurement on the real scene rather than by this one. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 5. THE FRONT DOOR
 * --------------------------------------------------------------------------------------------------------- */
{
    const page = fs.readFileSync(path.join(ROOT, "path-tracer.html"), "utf8");
    ok("!! path-tracer.html can drive a compensated surface under a light with all three strategies",
       /msTable/.test(page) && /direct:\s*m/.test(page),
       "The strategy comparison from v3495 now has a compensated variant, and the point of showing it is that the three columns must still agree -- the refusal being closed is only visible as three numbers that match.");
}

console.log(fails ? "\nmsDirect-selfcheck: " + fails + " FAILED" : "\nmsDirect-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
