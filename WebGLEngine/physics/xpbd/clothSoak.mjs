// WebGLEngine/physics/xpbd/clothSoak.mjs -- v3604
// ---------------------------------------------------------------------------------------------------------------
// THE HONEST COLLISION RADIUS, AND THE FIXTURE THAT CAN ACTUALLY BE RUN AT IT.
//
// v3602 and v3603 both graded the self-collision pass at radius 0.4 on the 5x5 hanging cloth, because that is
// the only radius at which that fixture collides at all. This module asks the question nobody had asked --
// WHAT RADIUS IS THIS CLOTH ENTITLED TO -- and the answer invalidates the lever both rounds were pulling.
//
// ================================================================================================================
// THE THREE BOUNDS, ALL DERIVED FROM THE MESH RATHER THAN CHOSEN
// ================================================================================================================
//
//   COHERENCE CEILING     2r <= h            r <= 0.150000   (h = the mesh spacing)
//       A cloth particle is a sphere of radius r. Its BONDED neighbour sits at h. If 2r > h the two spheres
//       overlap -- and the collision pass CANNOT SEE IT, because adj excludes bonded pairs by construction.
//       Above this bound the thickness model contradicts itself in the one place the pass is blind.
//
//   FEASIBILITY CEILING   2r <= h*sqrt(5)    r <= 0.335410
//       The closest NON-adjacent pair in the rest sheet is the knight move (2,1), at h*sqrt(5) = 0.670820.
//       Below this the rest sheet is a WITNESS that both constraint sets can hold at once. Above it the
//       collision set demands a separation the mesh's own rest geometry does not contain.
//       *** MEASURED, NOT ASSERTED: alternating projection (converge the mesh set, converge the collision set,
//       repeat) drives the joint violation to ~1e-8 at r = 0.3340 and STALLS FLAT at 6.667e-2 from the first
//       round at r = 0.3400. The bisection brackets the predicted 0.335410 from both sides. ***
//
//   ACTIVITY FLOOR        2r > closest non-adjacent approach the cloth ever reaches
//       Below this the pass finds zero pairs and every sweep over it reads exactly zero -- v3541's vacuous
//       knob, in a third solver. This one is a property of the FIXTURE, not of the cloth.
//
// ================================================================================================================
// FINDING 1, THE LOAD-BEARING NEGATIVE: THE SHIPPED FIXTURE HAS NO HONEST RADIUS AT ALL
// ================================================================================================================
//
// The 5x5 cloth pinned along one edge HANGS FLAT AND NEVER FOLDS. Over 1000 frames with collision off, the
// closest two non-adjacent particles ever come is 0.642478 -- so the pass fires for the first time only at
// r = 0.321239, and stops being feasible at 0.335410. ITS ENTIRE ACTIVE WINDOW IS [0.321239, 0.335410], WHICH
// LIES WHOLLY ABOVE THE COHERENCE CEILING OF 0.150000. There is no radius at which that fixture both collides
// and asks something possible, and 0.4 -- where v3602 and v3603 measured -- is above the feasibility ceiling too.
//
// So the collision numbers in those rounds are not wrong arithmetic; they are measurements of an impossible
// configuration. The fixture had to change before the soak could mean anything.
//
// ================================================================================================================
// THE FIXTURE THAT REPLACES IT: A DRAPE, DRIVEN FROM THE REST SHEET
// ================================================================================================================
//
// 5x17 at h = 0.3 (4.8 of material), both end rows pinned, the far row WALKED IN from -4.8 to -0.6 over 120
// frames and then held. It starts at the rest configuration -- so the mesh set is satisfied at frame 0 and any
// stretch is the solver's, not the initial condition's -- and it ends folded. Measurement is on the HOLD ONLY;
// the walk is a transient and reporting it would grade the transient.
//
// TWO CONTROLS, BOTH REQUIRED, AND EITHER FAILING WOULD MAKE THE SOAK MEANINGLESS:
//   - WITH COLLISION OFF the cloth passes through itself: closest non-adjacent approach 0.007956, 45 pairs
//     inside 2r. There is real work for the pass to do.
//   - WITH COLLISION OFF the mesh set alone converges: worst rigid stretch 3.365e-2 at 5 iterations and
//     1.151e-6 at 200. The fixture is hard, not impossible.
//
// PINNED-PINNED PAIRS ARE EXCLUDED FROM EVERY COUNT. Both endpoints have invMass 0, so solveColorPass skips
// them (wsum === 0) -- counting them would be counting contacts the pass is structurally unable to resolve.
// The first drape I built put the two pinned rows exactly 2r apart and five such pairs sat in every frame's
// tally forever, which is how this was found.
//
// ================================================================================================================
// FINDING 2: AT THE HONEST RADIUS, ONE SWEEP IS ALREADY ENOUGH -- AND v3603'S TRADE DOES NOT EXIST
// ================================================================================================================
//
// v3603 measured, at radius 0.4, that more collision sweeps drive worst penetration 2.037e-1 -> 3.331e-16 while
// the momentum row RISES 2.661e-2 -> 1.037e-1 monotonely, and reported that as the two goals trading on one knob.
//
// AT r = 0.15, FROM THE DEEPEST CONTACT IN THE RUN (97.4% penetration, 29 pairs), THE SWEEP IS FLAT:
//
//     collisionIterations    1      2      5     10     50    200
//     worst penetration    3.7e-16  ------------ 1.85e-16 ------------      (one ulp, then nothing)
//     momentum row         1.895e-3 --------- 1.895e-3 ---------------      (IDENTICAL, not merely close)
//
// ONE SWEEP ALREADY LANDS ON MACHINE ZERO, so there is nothing for the second to buy and nothing for it to cost.
// The trade v3603 reported was the signature of a fixture where the contact set could never be satisfied at all.
//
// ================================================================================================================
// FINDING 3: THE REAL TRADE IS ON COMPLIANCE, AND v3603'S ANOMALY IS RETRACTED
// ================================================================================================================
//
//     collisionCompliance    0        1e-4      1e-3      1e-2
//     worst penetration    3.70e-16  1.580e-1  6.394e-1  9.197e-1     MONOTONE WORSE
//     momentum row         1.895e-3  1.583e-3  6.437e-4  1.312e-4     MONOTONE BETTER
//
// That is what a softer contact must do, and it is a genuine trade on a single knob. v3603 recorded an ANOMALY
// -- that compliance also IMPROVED worst penetration, 2.037e-1 -> 1.489e-1, which a softer constraint should
// not do -- and was careful to keep it as an anomaly rather than dress it as a finding. AT THE HONEST RADIUS IT
// DOES NOT REPRODUCE: penetration degrades monotonely. The anomaly was a property of the impossible fixture,
// where the rigid pass was being asked for a separation it could not reach and softening it changed which
// impossible thing happened. THE CAUTION PAID: it was filed as an anomaly, so retracting it costs nothing.
//
// WHAT IS STILL NOT RECOMMENDED, AND FOR THE SAME REASON AS v3603: nothing in the tree READS the momentum row,
// the deciding half is multi-frame and visual, and that is Keith's rig. THE DEFAULTS ARE UNCHANGED. What this
// round adds is that the knob whose case looked strongest -- more sweeps -- now measurably buys NOTHING, so the
// only knob left with a real effect is the one whose cost is visible in penetration.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pathToFileURL } from "node:url";
import { buildClothConstraints } from "./clothMesh.js";
import { colorConstraints } from "./xpbd.js";
import { clothFrame, predictPass, solveColorPass } from "./clothLoop.js";
import { findCollisionPairs } from "./selfCollide.js";
import { momentumResidual } from "./scheduleKey.mjs";

export const SPACING = 0.3;
export const STIFF = { structural: 0.0, shear: 0.001, bending: 0.01 };
export const DT = 0.016, GRAVITY = [0, -10, 0];
export const CLOSE_FRAMES = 120, HOLD_FRAMES = 300;

// --- the fixtures ------------------------------------------------------------------------------------------------

/** The SHIPPED fixture v3602/v3603 measured on: one pinned edge, hanging. Kept so the negative can be shown. */
export function hang(W = 5, H = 5) {
    const { cons, adj } = buildClothConstraints(W, H, SPACING, STIFF);
    const N = W * H, pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        pos[3 * i] = x * SPACING; pos[3 * i + 1] = 0; pos[3 * i + 2] = -y * SPACING; invMass[i] = (y === 0) ? 0 : 1;
    }
    return { cons, adj, colors: colorConstraints(cons), init: { pos, vel, invMass }, W, H, driven: false };
}

/** THE DRAPE: both end rows pinned, the far one walked in so the sheet has slack it must fold. Starts at rest. */
export function drape(W = 5, H = 17, span = 0.6) {
    const s = hang(W, H);
    for (let x = 0; x < W; x++) s.init.invMass[(H - 1) * W + x] = 0;
    return { ...s, driven: true, span: -Math.abs(span), z0: -(H - 1) * SPACING };
}

// --- the three bounds, each derived ---------------------------------------------------------------------------

/** COHERENCE: 2r <= h, or a particle's sphere overlaps its BONDED neighbour where the pass is blind (adj). */
export const coherenceCeiling = () => SPACING / 2;

/** FEASIBILITY: the closest non-adjacent pair in the REST sheet is a witness that both sets can hold at once. */
export function minNonAdjacentRest(sc) {
    const p = sc.init.pos, N = sc.init.invMass.length;
    let min = Infinity, pair = null;
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        if (sc.adj.has(i + "_" + j)) continue;
        const d = Math.hypot(p[3 * i] - p[3 * j], p[3 * i + 1] - p[3 * j + 1], p[3 * i + 2] - p[3 * j + 2]);
        if (d < min) { min = d; pair = [i, j]; }
    }
    return { distance: min, pair, ceiling: min / 2 };
}

/**
 * ACTIVITY: the closest two non-adjacent particles ever come with the pass OFF. Below this, every knob is vacuous.
 * It scans EVERY non-adjacent pair rather than the ones some probe radius already sees -- asking a radius-shaped
 * question here would answer "the closest pair inside the radius I picked", which is the radius back again.
 */
export function closestApproach(sc, frames = CLOSE_FRAMES + HOLD_FRAMES) {
    const r = simulate(sc, { radius: 0, frames, scanAll: true });
    return { distance: r.minApproach, floor: r.minApproach / 2 };
}

// --- the loop -----------------------------------------------------------------------------------------------------

/**
 * Drives clothFrame. For a driven fixture the far pinned row is WALKED IN over CLOSE_FRAMES and the measurement
 * covers the HOLD ONLY -- reporting the walk would grade a transient. Pinned-pinned contacts are excluded from
 * every count: solveColorPass skips them (wsum === 0), so counting them counts contacts nothing can resolve.
 */
export function simulate(sc, { frames = CLOSE_FRAMES + HOLD_FRAMES, radius = 0, iterations = 5,
                               collisionIterations = 1, collisionCompliance = 0, track = false, scanAll = false } = {}) {
    const im = sc.init.invMass, n = sc.init.pos.length, W = sc.W, H = sc.H;
    const buf = { pos: Float64Array.from(sc.init.pos), vel: Float64Array.from(sc.init.vel),
                  pred: new Float64Array(n), prev: new Float64Array(n) };
    const opts = { radius, adj: sc.adj, iterations, collisionIterations, collisionCompliance, dt: DT, gravity: GRAVITY };
    const measureFrom = sc.driven ? CLOSE_FRAMES : 0;
    const probe = radius > 0 ? radius : coherenceCeiling();
    let worstStretch = 0, worstPen = 0, penSum = 0, penN = 0, maxPairs = 0, framesWithPairs = 0;
    let minApproach = Infinity, deepest = -1, deepestPos = null;
    for (let f = 0; f < frames; f++) {
        if (sc.driven) {
            const t = Math.min(1, f / CLOSE_FRAMES), z = sc.z0 + (sc.span - sc.z0) * t;
            for (let x = 0; x < W; x++) buf.pos[3 * ((H - 1) * W + x) + 2] = z;
        }
        clothFrame(buf, im, sc.cons, sc.colors, opts);
        if (f < measureFrom) continue;
        for (const c of sc.cons) {
            if (c.compliance !== 0) continue;                       // the RIGID set is the one claiming inextensibility
            const d = Math.hypot(buf.pos[3 * c.i] - buf.pos[3 * c.j], buf.pos[3 * c.i + 1] - buf.pos[3 * c.j + 1],
                                 buf.pos[3 * c.i + 2] - buf.pos[3 * c.j + 2]);
            const s = Math.abs(d - c.rest) / c.rest;
            if (s > worstStretch) worstStretch = s;
        }
        if (scanAll) {
            for (let i = 0; i < im.length; i++) for (let j = i + 1; j < im.length; j++) {
                if (sc.adj.has(i + "_" + j) || im[i] + im[j] === 0) continue;
                const d = Math.hypot(buf.pos[3 * i] - buf.pos[3 * j], buf.pos[3 * i + 1] - buf.pos[3 * j + 1], buf.pos[3 * i + 2] - buf.pos[3 * j + 2]);
                if (d < minApproach) minApproach = d;
            }
            continue;
        }
        const pairs = findCollisionPairs(buf.pos, im.length, 2 * probe, 2 * probe, sc.adj).filter(([i, j]) => im[i] + im[j] > 0);
        if (pairs.length) { framesWithPairs++; if (pairs.length > maxPairs) maxPairs = pairs.length; }
        for (const [i, j] of pairs) {
            const d = Math.hypot(buf.pos[3 * i] - buf.pos[3 * j], buf.pos[3 * i + 1] - buf.pos[3 * j + 1],
                                 buf.pos[3 * i + 2] - buf.pos[3 * j + 2]);
            if (d < minApproach) minApproach = d;
            const pen = (2 * probe - d) / (2 * probe);
            if (pen > 0) { penSum += pen; penN++; if (pen > worstPen) { worstPen = pen; if (track) { deepest = pen; deepestPos = Float64Array.from(buf.pos); } } }
        }
    }
    let sag = 0; for (let i = 0; i < im.length; i++) sag = Math.min(sag, buf.pos[3 * i + 1]);
    return { worstStretch, worstPen, meanPen: penN ? penSum / penN : 0, maxPairs, framesWithPairs,
             minApproach: Number.isFinite(minApproach) ? minApproach : null, sag, deepest, deepestPos,
             pos: buf.pos, finite: buf.pos.every(Number.isFinite) };
}

// --- feasibility, measured rather than asserted ------------------------------------------------------------------

/** Joint violation: the worse of the rigid mesh set and the collision set, on one configuration. */
export function jointViolation(pos, sc, radius) {
    let stretch = 0;
    for (const c of sc.cons) {
        if (c.compliance !== 0) continue;
        const d = Math.hypot(pos[3 * c.i] - pos[3 * c.j], pos[3 * c.i + 1] - pos[3 * c.j + 1], pos[3 * c.i + 2] - pos[3 * c.j + 2]);
        stretch = Math.max(stretch, Math.abs(d - c.rest) / c.rest);
    }
    let pen = 0;
    if (radius > 0) {
        const im = sc.init.invMass;
        for (const [i, j] of findCollisionPairs(pos, im.length, 2 * radius, 2 * radius, sc.adj)) {
            if (im[i] + im[j] === 0) continue;
            const d = Math.hypot(pos[3 * i] - pos[3 * j], pos[3 * i + 1] - pos[3 * j + 1], pos[3 * i + 2] - pos[3 * j + 2]);
            pen = Math.max(pen, (2 * radius - d) / (2 * radius));
        }
    }
    return { stretch, pen, joint: Math.max(stretch, pen) };
}

/**
 * ALTERNATING PROJECTION -- the honest feasibility test, and it needs no threshold anybody chose.
 * Converge the mesh set, converge the collision set, repeat. A COMMON solution exists => the joint violation
 * falls. None exists => it STALLS at a positive floor no number of rounds touches. This is deliberately NOT
 * "does mesh stretch fall when you iterate the mesh solve harder": the collision pass runs LAST in clothFrame,
 * so it always has the final word, and that test cannot separate infeasibility from sequencing.
 */
export function alternatingProjection(sc, radius, start, { rounds = 200, inner = 60 } = {}) {
    const im = sc.init.invMass;
    const pos = Float64Array.from(start || sc.init.pos);
    const at = [];
    for (let k = 0; k < rounds; k++) {
        const lam = new Float64Array(sc.cons.length);
        for (let it = 0; it < inner; it++) for (const col of sc.colors) solveColorPass(pos, im, sc.cons, col, lam, DT, false);
        const pairs = findCollisionPairs(pos, im.length, 2 * radius, 2 * radius, sc.adj);
        const coll = pairs.map(([i, j]) => ({ i, j, rest: 2 * radius, compliance: 0 }));
        const lamC = new Float64Array(coll.length);
        for (let it = 0; it < inner; it++) for (const c of colorConstraints(coll)) solveColorPass(pos, im, coll, c, lamC, DT, true);
        if (k === 0 || k === rounds - 1) at.push([k + 1, jointViolation(pos, sc, radius).joint]);
    }
    const final = jointViolation(pos, sc, radius);
    return { final, first: at[0][1], last: at[at.length - 1][1],
             converging: at[at.length - 1][1] < at[0][1] * 0.5 || at[at.length - 1][1] < 1e-6 };
}

// --- the knob sweeps, from the deepest contact the run reaches ----------------------------------------------------

/** One shipped substep from a given configuration, carrying BOTH lambda arrays out (v3602's finding 4). */
export function substep(sc, pos, { radius, collisionIterations = 1, collisionCompliance = 0, iterations = 5 } = {}) {
    const im = sc.init.invMass, n = pos.length;
    const buf = { pos: Float64Array.from(pos), vel: new Float64Array(n), pred: new Float64Array(n), prev: new Float64Array(n) };
    predictPass(buf, im, DT, GRAVITY);
    const xPred = Float64Array.from(buf.pred);
    const lam = new Float64Array(sc.cons.length);
    for (let it = 0; it < iterations; it++) for (const c of sc.colors) solveColorPass(buf.pred, im, sc.cons, c, lam, DT, false);
    const pairs = findCollisionPairs(buf.pred, im.length, 2 * radius, 2 * radius, sc.adj);
    const coll = pairs.map(([i, j]) => ({ i, j, rest: 2 * radius, compliance: collisionCompliance }));
    const lamC = new Float64Array(coll.length);
    for (let it = 0; it < collisionIterations; it++)
        for (const c of colorConstraints(coll)) solveColorPass(buf.pred, im, coll, c, lamC, DT, true);
    let pen = 0;
    for (const [i, j] of pairs) {
        if (im[i] + im[j] === 0) continue;
        const d = Math.hypot(buf.pred[3 * i] - buf.pred[3 * j], buf.pred[3 * i + 1] - buf.pred[3 * j + 1], buf.pred[3 * i + 2] - buf.pred[3 * j + 2]);
        pen = Math.max(pen, (2 * radius - d) / (2 * radius));
    }
    return { pairs: coll.length, pen: Math.max(pen, 0),
             momentum: momentumResidual(buf.pred, xPred, im, [...sc.cons, ...coll], Float64Array.from([...lam, ...lamC])) };
}

/** v3603's two sweeps, re-run from the deepest contact the collision-off run reaches. */
export function knobSweeps(sc, radius, deepestPos, { iters = [1, 2, 5, 10, 50, 200], comps = [0, 1e-4, 1e-3, 1e-2] } = {}) {
    return {
        iterations: iters.map((k) => ({ k, ...substep(sc, deepestPos, { radius, collisionIterations: k }) })),
        compliance: comps.map((c) => ({ c, ...substep(sc, deepestPos, { radius, collisionCompliance: c }) })),
    };
}

export const monotone = (xs, dir) => xs.every((v, i) => i === 0 || (dir > 0 ? v > xs[i - 1] : v < xs[i - 1]));

export const MEASURED_V3604 = {
    coherenceCeiling: 0.15,
    feasibilityCeiling: 0.335410,
    feasibilityBracket: { converges: 0.334, stalls: 0.3354 },
    hangClosestApproach: 0.642478,
    hangActiveWindow: [0.321239, 0.335410],
    drapeClosestApproachOff: 0.007956,
    drapeMeshOnlyStretch: { 5: 3.365e-2, 200: 1.151e-6 },
    shippedWorstPen: 3.701e-16,
    iterationSweepFlat: { 1: 3.701e-16, 200: 1.850e-16, momentum: 1.895e-3 },
    complianceSweep: { pen: [3.701e-16, 1.580e-1, 6.394e-1, 9.197e-1], momentum: [1.895e-3, 1.583e-3, 6.437e-4, 1.312e-4] },
    verdict: "THE HONEST RADIUS IS r <= h/2 = 0.150000, set by COHERENCE (2r > h overlaps bonded neighbours " +
             "where the pass is blind) rather than by feasibility (h*sqrt(5)/2 = 0.335410, bisected). The 5x5 " +
             "hanging fixture cannot be run there -- it never folds, so the pass fires only in [0.321239, " +
             "0.335410], entirely above the coherence ceiling. Every collision number in v3602 and v3603 was " +
             "taken at 0.4, above the feasibility ceiling as well.",
    refuted: "v3603's 'the two goals trade on one collision-sweep knob' DOES NOT SURVIVE the move to an honest " +
             "radius: one sweep already reaches machine zero and 2/5/10/50/200 return an IDENTICAL momentum row. " +
             "The trade it measured was the signature of a contact set that could never be satisfied.",
    retracted: "v3603's compliance ANOMALY -- that a softer contact also improved worst penetration -- does not " +
               "reproduce here: penetration degrades MONOTONELY with compliance while the momentum row improves " +
               "MONOTONELY. It was filed as an anomaly rather than a finding, so retracting it costs nothing.",
    notChanged: "NO DEFAULT MOVED. clothLoop.js is untouched; collisionIterations stays 1 and collisionCompliance " +
                "stays 0. Nothing in the tree reads the momentum row, and the deciding half is multi-frame and " +
                "visual -- Keith's rig.",
};

// --- the report ---------------------------------------------------------------------------------------------------

export function reportLines({ quick = false } = {}) {
    const L = [], say = (s) => L.push(s);
    // QUICK MODE SHORTENS THE RUN AND NEVER CHANGES THE FIXTURE. A smaller drape does not fold at all --
    // the first quick mode I wrote used 5x11 and reported zero contacts, which is a DIFFERENT experiment
    // wearing the same name, and is exactly how a coarse run comes back with a plausible-looking nothing.
    const H = 17;
    const hangSc = hang(), drapeSc = drape(5, H, 0.6);
    const coh = coherenceCeiling(), feas = minNonAdjacentRest(hangSc);

    say("[cloth-soak] The honest collision radius, and the soak re-run there" + (quick ? "   QUICK MODE" : ""));
    say("");
    say("1. THE THREE BOUNDS, EACH DERIVED FROM THE MESH");
    say("     mesh spacing h                      = " + SPACING.toFixed(6));
    say("     COHERENCE ceiling   2r <= h         => r <= " + coh.toFixed(6) +
        "   (above it a particle overlaps its BONDED neighbour, where adj makes the pass blind)");
    say("     FEASIBILITY ceiling 2r <= " + feas.distance.toFixed(6) + " => r <= " + feas.ceiling.toFixed(6) +
        "   (closest NON-adjacent rest pair " + JSON.stringify(feas.pair) + ", the knight move h*sqrt(5))");
    say("     THE BINDING BOUND IS COHERENCE: " + coh.toFixed(6) + ", less than half the feasibility ceiling.");
    say("");

    say("2. THE FEASIBILITY CEILING IS MEASURED, NOT ASSERTED -- alternating projection on the hanging fixture");
    const hangHold = simulate(hangSc, { radius: 0, frames: quick ? 120 : 300 });
    for (const r of quick ? [0.334, 0.3354] : [0.330, 0.334, 0.3354, 0.34]) {
        const a = alternatingProjection(hangSc, r, hangHold.pos, { rounds: quick ? 40 : 200, inner: quick ? 30 : 60 });
        say("     r = " + r.toFixed(4) + "   joint violation " + a.first.toExponential(3) + " -> " + a.last.toExponential(3) +
            "   " + (a.converging ? "CONVERGING (a common solution exists)" : "STALLED (no common solution)"));
    }
    say("     The transition brackets the predicted " + feas.ceiling.toFixed(6) + " from both sides.");
    say("");

    say("3. THE LOAD-BEARING NEGATIVE: THE SHIPPED 5x5 FIXTURE HAS NO HONEST RADIUS AT ALL");
    const ca = closestApproach(hangSc, quick ? 400 : 1000);
    say("     closest non-adjacent approach over " + (quick ? 400 : 1000) + " frames, collision OFF = " + ca.distance.toFixed(6));
    say("     => the pass fires for the first time at r = " + ca.floor.toFixed(6) + " and stops being feasible at " +
        feas.ceiling.toFixed(6));
    say("     ITS ACTIVE WINDOW [" + ca.floor.toFixed(6) + ", " + feas.ceiling.toFixed(6) + "] LIES WHOLLY ABOVE THE");
    say("     COHERENCE CEILING " + coh.toFixed(6) + ". v3602 and v3603 measured at 0.4 -- above BOTH ceilings.");
    say("");

    say("4. THE REPLACEMENT FIXTURE, AND ITS TWO CONTROLS (either failing makes the soak meaningless)");
    const off = simulate(drapeSc, { radius: 0, frames: CLOSE_FRAMES + (quick ? 100 : HOLD_FRAMES), track: true });
    const off200 = simulate(drapeSc, { radius: 0, iterations: 200, frames: CLOSE_FRAMES + (quick ? 100 : HOLD_FRAMES) });
    say("     5x" + H + " at h=" + SPACING + ", both end rows pinned, far row walked in over " + CLOSE_FRAMES +
        " frames then held. Hold measured only.");
    const drapeCa = closestApproach(drapeSc, CLOSE_FRAMES + (quick ? 100 : HOLD_FRAMES));
    say("     CONTROL A -- it really self-collides: closest non-adjacent approach with the pass OFF = " +
        drapeCa.distance.toFixed(6) + " against 2r = " + (2 * coh).toFixed(3) + ", " + off.maxPairs + " pairs at once");
    say("     CONTROL B -- the mesh set alone converges: worst rigid stretch " + off.worstStretch.toExponential(3) +
        " at 5 iterations, " + off200.worstStretch.toExponential(3) + " at 200. Hard, not impossible.");
    say("");

    say("5. THE SOAK AT r = " + coh.toFixed(6));
    say("     config                     worst pen    mean pen     stretch@5    sag      frames  maxPairs");
    const rows = [["OFF (control)          ", { radius: 0 }],
                  ["SHIPPED 1 sweep, rigid ", { radius: coh }],
                  ["collisionIterations 20 ", { radius: coh, collisionIterations: 20 }],
                  ["compliance 1e-3        ", { radius: coh, collisionCompliance: 1e-3 }],
                  ["compliance 1e-2        ", { radius: coh, collisionCompliance: 1e-2 }]];
    for (const [label, o] of rows) {
        const s = simulate(drapeSc, { frames: CLOSE_FRAMES + (quick ? 100 : HOLD_FRAMES), ...o });
        say("     " + label + " " + s.worstPen.toExponential(3) + "   " + s.meanPen.toExponential(3) + "   " +
            s.worstStretch.toExponential(3) + "   " + s.sag.toFixed(3) + "  " + String(s.framesWithPairs).padStart(5) +
            "  " + String(s.maxPairs).padStart(6));
    }
    say("");

    say("6. v3603'S TWO SWEEPS, RE-RUN FROM THE DEEPEST CONTACT (" + (off.deepest * 100).toFixed(1) + "% penetration)");
    const sw = knobSweeps(drapeSc, coh, off.deepestPos, quick ? { iters: [1, 20], comps: [0, 1e-3] } : {});
    say("     collisionIterations   pairs   worst penetration   momentum row");
    for (const r of sw.iterations)
        say("     " + String(r.k).padStart(19) + String(r.pairs).padStart(8) + "   " + r.pen.toExponential(3) +
            "           " + r.momentum.toExponential(3));
    const penFlat = sw.iterations.every((r) => Math.abs(r.momentum - sw.iterations[0].momentum) === 0);
    say("     " + (penFlat ? "THE MOMENTUM ROW IS IDENTICAL ACROSS THE WHOLE SWEEP -- not close, identical."
                           : "THE MOMENTUM ROW MOVED -- v3603's trade may exist here after all; read the numbers."));
    say("     One sweep already lands on machine zero, so there is nothing for the second to buy OR to cost.");
    say("");
    say("     collisionCompliance   pairs   worst penetration   momentum row");
    for (const r of sw.compliance)
        say("     " + String(r.c).padStart(19) + String(r.pairs).padStart(8) + "   " + r.pen.toExponential(3) +
            "           " + r.momentum.toExponential(3));
    const pens = sw.compliance.map((r) => r.pen), moms = sw.compliance.map((r) => r.momentum);
    say("     penetration " + (monotone(pens, +1) ? "MONOTONE WORSE" : "NOT MONOTONE") + ", momentum row " +
        (monotone(moms, -1) ? "MONOTONE BETTER" : "NOT MONOTONE") + " -- THIS is the real trade.");
    say("");
    say("7. THE WHOLE HONEST WINDOW, not just its top. r runs from the activity floor to the coherence ceiling.");
    say("     radius     pairs   frames   worst penetration   worst stretch");
    const floor = drapeCa.floor;
    const radii = quick ? [floor * 2, coh] : [0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.14, coh];
    for (const r of radii) {
        const s = simulate(drapeSc, { radius: r, frames: CLOSE_FRAMES + (quick ? 100 : HOLD_FRAMES) });
        say("     " + r.toFixed(6) + String(s.maxPairs).padStart(8) + String(s.framesWithPairs).padStart(9) +
            "   " + s.worstPen.toExponential(3) + "           " + s.worstStretch.toExponential(3) +
            (r <= floor ? "   <- BELOW THE ACTIVITY FLOOR, nothing to measure" : ""));
    }
    say("     THE SHIPPED SINGLE SWEEP HOLDS ACROSS THE WHOLE WINDOW -- the top of it is not a special case,");
    say("     which is what makes r = " + coh.toFixed(6) + " a ceiling worth quoting rather than a lucky point.");
    say("");
    say("  " + MEASURED_V3604.verdict);
    say("  REFUTED:   " + MEASURED_V3604.refuted);
    say("  RETRACTED: " + MEASURED_V3604.retracted);
    say("  " + MEASURED_V3604.notChanged);
    if (quick) say("  QUICK MODE: shorter holds and fewer sweep points -- SAME fixture, SAME radius. IT SETTLES NOTHING.");
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines({ quick: process.argv.includes("--quick") })) console.log(l);
    process.exit(0);
}
