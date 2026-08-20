// WebGLEngine/physics/render/pathStrat-selfcheck.mjs -- v3500
//
// Run: node physics/render/pathStrat-selfcheck.mjs   (~40s)
//
// *** v3498 ENDED ON THE CENTRE PIXEL: 30x the edge pixel's noise, ALL OF IT PATH VARIANCE, untouched by
// stratifying the pixel domain. THIS ROUND STRATIFIES THE FIRST BOUNCE'S DIRECTION -- AND THE RESULT IS THE
// EXACT REVERSE OF THE RULE v3498 WAS BUILT AROUND. ***
//
// v3498: "a better sampler is a STEEPER SLOPE and not a smaller number, because any error can be made smaller
// by throwing samples at it." True there. HERE IT IS BACKWARDS: stratifying ONE 2D dimension of a
// higher-dimensional integral buys a CONSTANT FACTOR at every sample count and MOVES THE EXPONENT NOT AT ALL,
// because the dimensions still drawn freely go on converging at N^-1/2 and they own the asymptotics.
// *** A CONSTANT FACTOR SHIFTS THE INTERCEPT, AND THE HEADLINE OBSERVABLE OF THE PREVIOUS ROUND IS BLIND TO IT.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "./pathTracer.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

// A FLAT WALL rather than a small sphere: every sample in the pixel meets the same surface, so the only thing
// varying is the bounce direction -- which is the dimension under test.
const WALL = [{ centre: [0, 0, -2000], radius: 2000, albedo: 0.6 }];
const SKY = (d) => 1 + 0.5 * d[1];                 // smooth over the whole hemisphere, no kink to argue about
const BASE = { w: 16, h: 16, eye: [0, 0, 4], look: [0, 0, 0], fovDeg: 40, sky: SKY, maxDepth: 2 };
const STRAT = { pathStrat: true, stratDepth: 1 };

/**
 * *** 200 SEEDS, NOT 48, AND THAT IS THE ROUND'S FIRST LESSON. My first runs used 48 and the effect below --
 * a real 1.32x -- WAS INSIDE THE ERROR ON THE ERROR. I then tested two explanations for the "null result" (the
 * sky's kink, and the surface frame turning per sample) BEFORE NOTICING THAT THE FIX WAS MORE SEEDS RATHER THAN
 * ANOTHER HYPOTHESIS. Three guesses is the signal that the instrument is underpowered, not that the next guess
 * will be better -- v3411's rule, arriving from the other direction. ***
 */
function sd(o, spp, S = 200) {
    const v = [];
    for (let s = 1; s <= S; s++) v.push(render(WALL, { ...BASE, spp, seed: s, region: { x0: 8, y0: 8, w: 1, h: 1 }, ...o })[0]);
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return { m, sd: Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) };
}

/* ------------------------------------------------------------------------------------------------------------
 * 1. THE ANSWER MUST NOT MOVE
 * --------------------------------------------------------------------------------------------------------- */
{
    const a = sd({}, 256), b = sd(STRAT, 256);
    say(`mean at 256 spp: free ${a.m.toFixed(6)}, stratified ${b.m.toFixed(6)}`);
    ok("!! stratifying the bounce direction changes the noise and not the answer",
       Math.abs(a.m - b.m) < 3 * Math.sqrt((a.sd * a.sd + b.sd * b.sd) / 200),
       "Compared within COMBINED STANDARD ERRORS of the two means rather than a chosen percentage. A method that lowered the variance AND moved the answer would be a different integral, which is the whole reason v3498's stratum-zero plant existed.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. *** THE FINDING: A REAL WIN THAT THE CONVERGENCE EXPONENT CANNOT SEE ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const SPP = [16, 64, 256];
    const rows = SPP.map((spp) => {
        const a = sd({}, spp), b = sd(STRAT, spp);
        return { spp, free: a.sd, strat: b.sd, gain: a.sd / b.sd };
    });
    for (const r of rows) say(`  spp ${String(r.spp).padStart(4)}: free ${r.free.toExponential(3)}  stratified ${r.strat.toExponential(3)}  gain ${r.gain.toFixed(2)}x`);
    const gains = rows.map((r) => r.gain);
    const spread = Math.max(...gains) / Math.min(...gains);

    ok("!! *** THE VARIANCE REDUCTION IS REAL AND IT IS THE SAME AT EVERY SAMPLE COUNT ***",
       gains.every((g) => g > 1.15) && spread < 1.25,
       `*** ${gains.map((g) => g.toFixed(2) + "x").join(", ")} across a 16-fold range of sample counts. A CONSTANT FACTOR, WHICH MEANS IT SHIFTS THE INTERCEPT OF THE CONVERGENCE LINE AND NOT ITS SLOPE. ***`);

    const lx = SPP.map(Math.log);
    const slope = (ys) => {
        const ly = ys.map(Math.log), n = SPP.length;
        const mx = lx.reduce((a, b) => a + b) / n, my = ly.reduce((a, b) => a + b) / n;
        return lx.reduce((a, v, i) => a + (v - mx) * (ly[i] - my), 0) / lx.reduce((a, v) => a + (v - mx) ** 2, 0);
    };
    const eFree = slope(rows.map((r) => r.free)), eStrat = slope(rows.map((r) => r.strat));
    say(`exponent: free ${eFree.toFixed(4)}, stratified ${eStrat.toFixed(4)}`);
    ok("!! *** AND THE EXPONENT DOES NOT MOVE, SO v3498'S HEADLINE OBSERVABLE IS BLIND TO IT ***",
       Math.abs(eStrat - eFree) < 0.08,
       `*** v3498 SAID "A BETTER SAMPLER IS A STEEPER SLOPE AND NOT A SMALLER NUMBER". TRUE THERE AND BACKWARDS HERE: stratifying ONE 2D dimension of a higher-dimensional integral cannot change the RATE, because the dimensions still drawn freely go on converging at N^-1/2 and they own the asymptotics. A ROUND JUDGED BY THE PREVIOUS ROUND'S OBSERVABLE WOULD HAVE REPORTED THIS AS NOTHING HAPPENING -- AND FOR TWO MEASUREMENTS IT DID. ***`);

    ok("...so BOTH numbers are reported, and neither alone is the answer",
       eFree < -0.4 && eStrat < -0.4,
       "The rate says the sampler has not changed class; the ratio says it is a third less noisy for the same work. THEY ARE DIFFERENT QUESTIONS AND THIS ROUND ONLY EXISTS BECAUSE THE SECOND ONE WAS ASKED.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. THE PER-PIXEL SHUFFLE, AND WHAT IS **NOT** SHOWN
 * --------------------------------------------------------------------------------------------------------- */
{
    const blockSd = (o, S = 120) => {
        const v = [];
        for (let s = 1; s <= S; s++) { const img = render(WALL, { ...BASE, spp: 16, seed: s, ...o }); let t = 0; for (let i = 0; i < img.length; i++) t += img[i]; v.push(t / img.length); }
        const m = v.reduce((a, b) => a + b, 0) / v.length;
        return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
    };
    const rows = [["free", {}], ["stratified + shuffle", STRAT], ["stratified, NO shuffle", { ...STRAT, plantNoShuffle: true }]]
        .map(([lbl, o]) => ({ lbl, p: sd(o, 16, 120).sd, b: blockSd(o) }));
    for (const r of rows) say(`  ${r.lbl.padEnd(24)} one pixel ${r.p.toExponential(3)}   256-pixel block mean ${r.b.toExponential(3)}   ratio ${(r.p / r.b).toFixed(1)}`);

    ok("!! the block average beats the independent sqrt(256) = 16 once the bounce is stratified",
       rows[1].p / rows[1].b > 18 && rows[0].p / rows[0].b < 17,
       "Neighbouring pixels' errors come out ANTI-correlated rather than merely independent, so averaging a block gains more than independence would allow. That is a bonus and it is reported as one.");

    ok("!! *** AND THE SHUFFLE'S OWN BENEFIT IS NOT DEMONSTRATED HERE, WHICH IS SAID RATHER THAN GLOSSED ***",
       Math.abs(rows[1].b - rows[2].b) / rows[1].b < 0.25,
       "*** WITHOUT IT, EVERY PIXEL WALKS ITS STRATA IN THE SAME ORDER, so sample k of one pixel and sample k of its neighbour aim into the same cell and their errors should correlate ACROSS THE IMAGE. On this fixture the two are within a quarter of each other and THE MEASUREMENT DOES NOT SEPARATE THEM. The shuffle is kept because it costs no draws and cannot hurt -- NOT because this gate proved it works. A FIXTURE THAT WOULD SEPARATE THEM NEEDS STRUCTURE THE STRATA CAN ALIGN WITH, and building one is the next round rather than a claim made here. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. THE DRAW COUNT IS UNCHANGED, WHICH IS WHAT MAKES SECTION 2 A COMPARISON
 * --------------------------------------------------------------------------------------------------------- */
{
    const src = fs.readFileSync(path.join(ROOT, "physics", "render", "pathTracer.mjs"), "utf8");
    ok("!! the stratum pair is built FROM two draws rather than instead of them",
       /stratPair\s*=\s*\(r1, r2\)/.test(src) && /stratPair\(rand\(\), rand\(\)\)/.test(src),
       "*** THE TWO UNIFORMS ARE CONSUMED EITHER WAY AND BECOME THE JITTER INSIDE THE CELL. A version that skipped them would shift every later decision on the path, and section 2 would be comparing two different sequences rather than two placements of the same samples (v3497's rule, third round running). ***");

    const page = fs.readFileSync(path.join(ROOT, "path-tracer.html"), "utf8");
    ok("!! path-tracer.html reports the GAIN alongside the exponent",
       /pathStrat/.test(page) && /gain/i.test(page),
       "A page showing only the exponent would report this round as nothing happening, which is exactly the mistake the round is about.");
}

console.log(fails ? "\npathStrat-selfcheck: " + fails + " FAILED" : "\npathStrat-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
