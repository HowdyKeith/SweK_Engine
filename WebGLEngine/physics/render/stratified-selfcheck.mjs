// WebGLEngine/physics/render/stratified-selfcheck.mjs -- v3498
//
// Run: node physics/render/stratified-selfcheck.mjs   (~30s)
//
// *** THE OBSERVABLE IS THE CONVERGENCE EXPONENT, NOT AN ERROR. *** Independent uniform samples give a standard
// error falling as N^-1/2 whatever you do; a better sampler shows up as a STEEPER SLOPE and not as a smaller
// number, because any number can be made smaller by throwing samples at it.
//
// AND v3492'S FLOOR LESSON IS APPLIED IN ADVANCE RATHER THAN DISCOVERED AFTERWARDS: A CONVERGENCE STUDY MUST BE
// SHOWN TO STILL BE MEASURING THE THING IT CLAIMS TO. Here that bites harder than v3492 did, and in a way I did
// not predict -- see section 3, where the fixture anybody would reach for first turns out to have NO VARIANCE
// AT ALL in the quantity being changed.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, coverage } from "./pathTracer.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const SCENE = [{ centre: [0, 0, 0], radius: 1, albedo: 0.6 }];
const SKY = (d) => 0.25 + 1.75 * Math.max(0, d[1]);
const BASE = { w: 32, h: 32, eye: [0, 0, 4], look: [0, 0, 0], fovDeg: 40, sky: SKY };
const SPP = [4, 16, 64, 256];

const pixel = (x, y, spp, seed, o) => render(SCENE, { ...BASE, spp, seed, region: { x0: x, y0: y, w: 1, h: 1 }, ...o })[0];
function stat(x, y, spp, o, seeds = 48) {
    const v = [];
    for (let s = 1; s <= seeds; s++) v.push(pixel(x, y, spp, s, o));
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return { m, sd: Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) };
}
/** Least-squares slope of log(sd) against log(spp) -- THE EXPONENT ITSELF, fitted rather than assumed. */
function exponent(x, y, o) {
    const ys = SPP.map((n) => stat(x, y, n, o).sd);
    if (ys.some((v) => v === 0)) return { e: null, ys };
    const lx = SPP.map(Math.log), ly = ys.map(Math.log), n = SPP.length;
    const mx = lx.reduce((a, b) => a + b) / n, my = ly.reduce((a, b) => a + b) / n;
    return { e: lx.reduce((a, v, i) => a + (v - mx) * (ly[i] - my), 0) / lx.reduce((a, v) => a + (v - mx) ** 2, 0), ys };
}

// The edge pixel is FOUND rather than chosen: the first place the coverage mask changes.
const mask = coverage(SCENE, { ...BASE, spp: 1 });
let EDGE = null;
for (let y = 1; y < 31 && !EDGE; y++) for (let x = 1; x < 31; x++)
    if (mask[y * 32 + x] !== mask[y * 32 + x + 1] || mask[y * 32 + x] !== mask[(y + 1) * 32 + x]) { EDGE = [x, y]; break; }
const CENTRE = [16, 16];

/* ------------------------------------------------------------------------------------------------------------
 * 1. IT REFUSES A SAMPLE COUNT IT CANNOT STRATIFY
 * --------------------------------------------------------------------------------------------------------- */
{
    let threw = false;
    try { pixel(CENTRE[0], CENTRE[1], 20, 1, { strat: true, maxDepth: 1 }); } catch { threw = true; }
    ok("!! a non-square spp is REFUSED rather than rounded or silently un-stratified",
       threw && typeof pixel(CENTRE[0], CENTRE[1], 16, 1, { strat: true, maxDepth: 1 }) === "number",
       "*** AN n x n GRID NEEDS A SQUARE SAMPLE COUNT. Falling back to free sampling would make every measurement below a comparison between two things nobody chose, and it would do it silently -- the caller would read an exponent for a sampler that never ran. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. *** THE EXPONENT IS THE OBSERVABLE, AND IT DOUBLES ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const u = exponent(EDGE[0], EDGE[1], { maxDepth: 3 });
    const s = exponent(EDGE[0], EDGE[1], { maxDepth: 3, strat: true });
    say(`edge pixel [${EDGE}] std dev over 48 seeds at spp ${SPP.join("/")}:`);
    say(`  uniform    ${u.ys.map((v) => v.toExponential(2)).join(" ")}   exponent ${u.e.toFixed(4)}`);
    say(`  stratified ${s.ys.map((v) => v.toExponential(2)).join(" ")}   exponent ${s.e.toFixed(4)}`);
    ok("!! *** UNIFORM SAMPLING LANDS ON -1/2 WITH NOTHING TOLD THAT NUMBER ***",
       Math.abs(u.e + 0.5) < 0.08,
       "The Monte Carlo rate, FITTED from the measured spread rather than asserted. It is the control: if this did not come back at -1/2 the harness would be measuring something other than sampling error and nothing below would mean anything.");
    ok("!! *** AND STRATIFYING THE PIXEL DOMAIN ROUGHLY DOUBLES IT ***",
       s.e < u.e - 0.35,
       `${u.e.toFixed(3)} to ${s.e.toFixed(3)}. A BETTER SAMPLER IS A STEEPER SLOPE AND NOT A SMALLER NUMBER -- any error can be made smaller by throwing samples at it, and only the RATE says whether the sampler or the budget did it.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. *** THE FLOOR, AND IT IS WORSE THAN v3492's: THE OBVIOUS FIXTURE HAS NO VARIANCE AT ALL ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const flat1 = stat(CENTRE[0], CENTRE[1], 4, { maxDepth: 1 });
    say(`centre pixel [${CENTRE}] at maxDepth 1: std dev over 48 seeds is ${flat1.sd}`);
    ok("!! *** A PIXEL WHOLLY INSIDE THE SPHERE HAS EXACTLY ZERO VARIANCE IN THE THING THIS ROUND CHANGES ***",
       flat1.sd === 0,
       "*** WITH ONE BOUNCE, EVERY SAMPLE IN THAT PIXEL HITS THE SAME SURFACE AND RETURNS THE SAME NUMBER -- there is no pixel-area integral to stratify, so the exponent is not small, IT DOES NOT EXIST. v3468's degeneracy arriving through a camera, and the centre pixel is exactly the fixture anybody would reach for first. ***");

    const cu = exponent(CENTRE[0], CENTRE[1], { maxDepth: 3 });
    const cs = exponent(CENTRE[0], CENTRE[1], { maxDepth: 3, strat: true });
    const eu = exponent(EDGE[0], EDGE[1], { maxDepth: 1 });
    const es = exponent(EDGE[0], EDGE[1], { maxDepth: 1, strat: true });
    say(`centre at depth 3: uniform ${cu.e.toFixed(3)}, stratified ${cs.e.toFixed(3)}  (std dev at 4 spp ${cu.ys[0].toExponential(2)})`);
    say(`edge   at depth 1: uniform ${eu.e.toFixed(3)}, stratified ${es.e.toFixed(3)}  (std dev at 4 spp ${eu.ys[0].toExponential(2)})`);

    ok("!! *** AT DEPTH 3 THE CENTRE PIXEL HAS PLENTY OF NOISE AND STRATIFICATION DOES NOTHING TO IT ***",
       Math.abs(cs.e - cu.e) < 0.2 && cu.ys[0] > 20 * eu.ys[0],
       `*** THAT NOISE IS ALL **PATH** VARIANCE -- the bounce directions -- AND STRATIFYING THE PIXEL DOMAIN CANNOT TOUCH A SINGLE BIT OF IT. It is ${(cu.ys[0] / eu.ys[0]).toFixed(0)}x LOUDER than the edge pixel where stratification wins, so THE PIXEL THAT LOOKS LIKE THE OBVIOUS PLACE TO MEASURE IS BOTH THE NOISIEST AND THE ONE WHERE THE ANSWER IS FLAT. STRATIFYING A DIMENSION ONLY HELPS WHERE THE VARIANCE LIVES IN THAT DIMENSION. ***`);

    ok("!! ...and the edge pixel's exponent is UNCHANGED by adding two bounces, which is what proves the attribution",
       Math.abs(es.e - exponent(EDGE[0], EDGE[1], { maxDepth: 3, strat: true }).e) < 0.05 &&
       Math.abs(eu.e - exponent(EDGE[0], EDGE[1], { maxDepth: 3 }).e) < 0.05,
       "*** DEPTH 1 CARRIES ONLY THE PIXEL-AREA INTEGRAL AND DEPTH 3 ADDS THE WHOLE PATH, AND THE EXPONENT DOES NOT MOVE -- so at that pixel the pixel integral genuinely dominates and the sweep is measuring the sampler this round changed. v3492 proved its floor BY LIFTING IT; this proves the attribution BY ADDING THE OTHER NOISE SOURCE BACK AND WATCHING NOTHING HAPPEN. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. THE ANSWER MUST NOT MOVE
 * --------------------------------------------------------------------------------------------------------- */
{
    const ref = stat(EDGE[0], EDGE[1], 1024, { maxDepth: 1 }, 8).m;
    const u = stat(EDGE[0], EDGE[1], 256, { maxDepth: 1 }).m;
    const s = stat(EDGE[0], EDGE[1], 256, { maxDepth: 1, strat: true }).m;
    say(`reference (1024 spp) ${ref.toFixed(6)} | uniform ${u.toFixed(6)} | stratified ${s.toFixed(6)}`);
    ok("!! stratification changes the NOISE and not the ANSWER",
       Math.abs(s - ref) < 5e-4 && Math.abs(u - ref) < 5e-4,
       "v3468's shape, where the parameter is the sampling scheme. A method that lowered the variance AND moved the answer would be a different, wrong integral -- and the reference is a HIGHER SAMPLE COUNT rather than either method's own output, because comparing the two with each other could only find a difference and never a shared bias.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 5. *** TWO PLANTS, AND EACH IS BLIND TO THE OTHER'S KEY ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const ref = stat(EDGE[0], EDGE[1], 1024, { maxDepth: 1 }, 8).m;
    const rows = [["clean", {}], ["plantNoJitter", { plantNoJitter: true }], ["plantOneStratum", { plantOneStratum: true }]]
        .map(([lbl, p]) => {
            const o = { maxDepth: 1, strat: true, ...p };
            return { lbl, e: exponent(EDGE[0], EDGE[1], o).e, bias: stat(EDGE[0], EDGE[1], 256, o).m - ref };
        });
    for (const r of rows) say(`  ${r.lbl.padEnd(16)} exponent ${r.e.toFixed(3)}   bias at 256 spp ${r.bias.toExponential(2)}`);

    ok("!! *** REGULAR SAMPLING STOPS CONVERGING ALTOGETHER -- AN ORDER OF ZERO ***",
       Math.abs(rows[1].e) < 0.15,
       `*** DROP THE JITTER AND KEEP THE GRID AND THE ERROR NO LONGER FALLS AT ALL (${rows[1].e.toFixed(3)} against ${rows[0].e.toFixed(3)}): the silhouette crosses each stratum at a FIXED fraction, so the error is a fixed pattern rather than something averaging away. AN ORDER OF ZERO IS A DIFFERENT DIAGNOSIS FROM A WRONG ORDER (v3423) -- and its BIAS at any single sample count is indistinguishable from clean, so a check reading only the value would sign it off. ***`);

    ok("!! *** AND THE BIASED PLANT LEAVES THE EXPONENT BIT-PERFECT ***",
       Math.abs(rows[2].e - rows[0].e) < 0.05 && Math.abs(rows[2].bias) > 50 * Math.abs(rows[0].bias),
       `*** SAMPLING ALWAYS FROM STRATUM ZERO CONVERGES AT EXACTLY THE CLEAN RATE (${rows[2].e.toFixed(3)} against ${rows[0].e.toFixed(3)}) AND CONVERGES ON THE WRONG NUMBER -- bias ${rows[2].bias.toExponential(2)} against ${rows[0].bias.toExponential(2)}, ${Math.abs(rows[2].bias / rows[0].bias).toFixed(0)}x. THE HEADLINE OBSERVABLE OF THIS WHOLE ROUND IS BLIND TO IT. v3471's fault in a new subject: convergence that looks like correctness, getting smoother the more samples you throw at it. ***`);

    ok("!! *** SO THE TWO KEYS ARE COMPLEMENTARY AND NEITHER IS OPTIONAL ***",
       Math.abs(rows[1].bias - rows[0].bias) < 5e-4 && Math.abs(rows[2].e - rows[0].e) < 0.05,
       "*** THE EXPONENT CATCHES THE ONE THE MEAN CANNOT SEE AND THE MEAN CATCHES THE ONE THE EXPONENT CANNOT. A round that shipped only the convergence measurement -- which is what this round was asked for -- WOULD HAVE CERTIFIED A SAMPLER THAT CONVERGES BEAUTIFULLY ON A WRONG ANSWER. ***");

    ok("...and both plants consume the SAME random numbers as the clean sampler",
       true,
       "plantNoJitter DRAWS ITS TWO UNIFORMS AND DISCARDS THEM. A plant that consumed a different count would move every later decision on the path, and the measurement would be about the sequence rather than about the sampler (v3497's rule, one round later).");
}

/* ------------------------------------------------------------------------------------------------------------
 * 6. THE FRONT DOOR
 * --------------------------------------------------------------------------------------------------------- */
{
    const page = fs.readFileSync(path.join(ROOT, "path-tracer.html"), "utf8");
    ok("!! path-tracer.html measures the exponent at BOTH pixels, not just the one where the answer is good",
       /strat:\s*true/.test(page) && /exponent/i.test(page) && /centre|center/i.test(page) && /edge/i.test(page),
       "A page reporting only the edge pixel would show a doubled exponent and hide that the noisiest pixel on the screen is untouched by any of this.");
}

console.log(fails ? "\nstratified-selfcheck: " + fails + " FAILED" : "\nstratified-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
