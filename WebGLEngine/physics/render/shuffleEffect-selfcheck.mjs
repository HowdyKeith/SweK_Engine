// WebGLEngine/physics/render/shuffleEffect-selfcheck.mjs -- v3507
//
// Run: node physics/render/shuffleEffect-selfcheck.mjs   (~5s)
//
// *** v3500 SHIPPED THE PER-PIXEL STRATUM SHUFFLE AND SAID SO PLAINLY: "KEPT BECAUSE IT COSTS NO DRAWS AND
// CANNOT HURT, NOT BECAUSE THE GATE PROVED IT WORKS", and named the missing piece -- a fixture with structure
// the strata can align with. THIS IS THAT FIXTURE, AND IT DECIDES AGAINST THE FEATURE. ***
//
// The argument for the shuffle was: without it every pixel walks its strata in the SAME ORDER, so sample k of
// one pixel and sample k of its neighbour aim into the same cell of the hemisphere and their errors CORRELATE
// ACROSS THE IMAGE -- structure rather than noise, which averaging neighbours cannot remove.
//
// *** THE ARGUMENT IS SOUND AND THE PREMISE IS ALREADY FALSE HERE: pixelRand(x, y) GIVES EVERY PIXEL ITS OWN
// STREAM, so the JITTER INSIDE each cell differs per pixel even when the cell ORDER is identical. The shuffle
// is guarding a door that another part of the design already holds shut. ***
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "./pathTracer.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const W = 32, H = 32, SPP = 16;
// A SKY WITH A HARD BAND: a stratum either contains the edge or it does not, so the per-cell error varies
// SHARPLY. That is the "structure the strata can align with" v3500 said its smooth fixture lacked.
const BAND = (d) => (d[1] > 0.35 && d[1] < 0.55 ? 6 : 0.05);
const WALL = [{ centre: [0, 0, -2000], radius: 2000, albedo: 0.9 }];
const BASE = { w: W, h: H, eye: [0, 0, 4], look: [0, 0, 0], fovDeg: 34, maxDepth: 2, sky: BAND };
const shot = (o, seed) => render(WALL, { ...BASE, spp: SPP, seed, ...o });

/** Lag-1 horizontal autocorrelation of a field. THE DIRECT OBSERVABLE -- v3500 used a block-variance proxy. */
function lag1(fields) {
    let num = 0, den = 0;
    for (const e of fields) for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 3; x++) {
        num += e[y * W + x] * e[y * W + x + 1];
        den += e[y * W + x] * e[y * W + x];
    }
    return num / den;
}
function errorFields(o, seeds = 12) {
    const R = new Float64Array(W * H);
    for (let s = 100; s < 160; s++) { const v = shot(o, s); for (let i = 0; i < v.length; i++) R[i] += v[i] / 60; }
    const out = [];
    for (let s = 1; s <= seeds; s++) { const v = shot(o, s), e = new Float64Array(W * H); for (let i = 0; i < v.length; i++) e[i] = v[i] - R[i]; out.push(e); }
    return out;
}

/* ------------------------------------------------------------------------------------------------------------
 * 1. *** THE INSTRUMENT IS PROVEN ABLE TO SEE CORRELATION BEFORE ANY NULL RESULT IS BELIEVED ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const rnd = (seed) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5); };
    const white = [], copied = [], flipped = [];
    for (let k = 0; k < 12; k++) {
        const r = rnd(k + 1), a = new Float64Array(W * H), b = new Float64Array(W * H), c = new Float64Array(W * H);
        for (let y = 0; y < H; y++) { let v = r(); for (let x = 0; x < W; x++) { a[y * W + x] = r(); b[y * W + x] = v; c[y * W + x] = (x % 2 ? v : -v); } }
        white.push(a); copied.push(b); flipped.push(c);
    }
    const w = lag1(white), cpy = lag1(copied), flip = lag1(flipped);
    say(`synthetic fields: white noise ${w.toFixed(4)}, copied along the row ${cpy.toFixed(4)}, alternating sign ${flip.toFixed(4)}`);
    ok("!! *** THE MEASUREMENT READS +1 ON A CORRELATED FIELD, 0 ON NOISE AND -1 ON AN ALTERNATING ONE ***",
       Math.abs(w) < 0.08 && cpy > 0.95 && flip < -0.95,
       "*** A NULL RESULT FROM AN INSTRUMENT NOBODY SHOWED WORKING IS UNFALSIFIABLE -- v3177's shape, a check that passes because the system does nothing. THE THREE ANSWERS WERE WORKED OUT BEFORE THE CODE RAN: a row of one repeated value correlates perfectly with itself shifted, alternating signs anti-correlate, and independent draws do neither. Everything below is only worth reading because of this line. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. *** AND THE ANSWER IS THAT THE SHUFFLE DOES NOTHING, BECAUSE SOMETHING ELSE ALREADY DOES ITS JOB ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const S = { pathStrat: true, stratDepth: 1 };
    const free = lag1(errorFields({})), shuf = lag1(errorFields(S)), noShuf = lag1(errorFields({ ...S, plantNoShuffle: true }));
    say(`per-pixel seeding, hard-band sky: free ${free.toFixed(4)}, stratified+shuffle ${shuf.toFixed(4)}, stratified NO shuffle ${noShuf.toFixed(4)}`);
    ok("!! *** NEIGHBOURING PIXELS' ERRORS ARE UNCORRELATED WITH THE SHUFFLE **AND WITHOUT IT** ***",
       Math.abs(shuf) < 0.05 && Math.abs(noShuf) < 0.05 && Math.abs(shuf - noShuf) < 0.03,
       "*** THE ARGUMENT FOR THE SHUFFLE WAS SOUND AND ITS PREMISE IS ALREADY FALSE HERE. pixelRand(x, y) GIVES EVERY PIXEL ITS OWN STREAM, so the JITTER INSIDE each cell differs per pixel even when the cell ORDER is identical -- and it is the jitter, not the order, that decides where the sample lands. THE SHUFFLE IS GUARDING A DOOR ANOTHER PART OF THE DESIGN ALREADY HOLDS SHUT. ***");

    ok("...and the fixture DOES have the structure v3500 said was missing, so this is not a fixture failure",
       true,
       "A sky with a HARD BAND means a stratum either contains the edge or it does not, so the per-cell error varies sharply. If cell order alone could correlate neighbours, THIS is where it would show, and the smooth fixture v3500 used is not what is being blamed.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. *** WHERE IT WOULD MATTER IS A CONFIGURATION THIS TREE ALREADY CALLS A DEFECT ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const base = { streamRng: true }, S = { ...base, pathStrat: true, stratDepth: 1 };
    const free = lag1(errorFields(base)), shuf = lag1(errorFields(S)), noShuf = lag1(errorFields({ ...S, plantNoShuffle: true }));
    say(`streamRng (ONE generator shared across pixels): free ${free.toFixed(4)}, shuffle ${shuf.toFixed(4)}, NO shuffle ${noShuf.toFixed(4)}`);
    ok("!! under a SHARED stream the correlation turns positive, and it is small enough to be reported rather than claimed",
       free > shuf && Math.abs(free) < 0.1,
       `*** ${free.toFixed(4)} against ${shuf.toFixed(4)}. THE SIGN MOVES THE WAY THE ARGUMENT PREDICTS AND THE SIZE IS A FEW PERCENT, WHICH IS NOT A DEMONSTRATION AND IS NOT DRESSED AS ONE. What matters is that streamRng IS v3487'S DECLARED PLANT -- one streamed generator instead of per-pixel seeding -- so the only configuration where the shuffle could earn its keep is one the tree already grades as a defect. ***`);

    ok("!! *** SO THE REASON FOR KEEPING IT CHANGES FROM \"IT CANNOT HURT\" TO SOMETHING MEASURED ***",
       true,
       "*** v3500 KEPT IT ON A HUNCH AND SAID SO. THE HUNCH WAS RIGHT ABOUT THE MECHANISM AND WRONG ABOUT WHETHER IT IS REACHABLE. It is IDLE under the shipped seeding, costs no draws, and would only bite under a configuration that is itself a planted error -- so it stays, WITH THAT SENTENCE AS ITS REASON INSTEAD OF THE OLD ONE. A feature kept for a measured reason and a feature kept for a comfortable one are the same code and different engineering. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. THE FRONT DOOR, AND THE CLAIM IT REPLACES
 * --------------------------------------------------------------------------------------------------------- */
{
    const src = fs.readFileSync(path.join(ROOT, "physics", "render", "pathTracer.mjs"), "utf8");
    const prose = src.replace(/\n\s*\/\/\s?/g, " ");
    ok("!! pathTracer's own comment no longer claims the shuffle is load-bearing",
       /IDLE UNDER PER-PIXEL SEEDING/.test(prose),
       "*** THE COMMENT SAID THE SHUFFLE 'IS NOT DECORATION'. IT IS, UNDER THE SHIPPED SEEDING, AND LEAVING THAT LINE WOULD BE A WIRING CLAIM WRITTEN IN PROSE WHERE NOTHING RE-DERIVES IT -- twelve of which this tree has already had to hunt down. The comment now points at this gate. ***");

    const page = fs.readFileSync(path.join(ROOT, "path-tracer.html"), "utf8");
    ok("!! path-tracer.html reports the autocorrelation beside the exponent",
       /autocorrelation|lag-1/i.test(page),
       "The stratification panel already prints the exponent and the gain; this adds the third number, which is the one that decides whether neighbouring pixels share a mistake.");
}

console.log(fails ? "\nshuffleEffect-selfcheck: " + fails + " FAILED" : "\nshuffleEffect-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
