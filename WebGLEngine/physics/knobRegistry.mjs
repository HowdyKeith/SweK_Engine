// WebGLEngine/physics/knobRegistry.mjs — v3286
// ---------------------------------------------------------------------------------------------------------------
// APPLYING THE PROPOSER INTERFACE ACROSS THE LAB — and NOT by registering all forty-four instruments, which was
// the obvious version of this round and the wrong one.
//
// *** WHY NOT ALL FORTY-FOUR. *** registerProposer requires an adjudicator, so a mechanical sweep would have
// produced forty-four adjudicators, and the ones for instruments with no independent key would have had to be
// invented. An invented adjudicator is a CONTROL THAT CANNOT FAIL: it passes whatever the proposer hands it,
// the licence ratchet grants tiers on its evidence, and the whole structure keeps working while meaning
// nothing. This tree already has one of those on the books (plasticBind's prose(), flagged at v3177 and still
// open), and manufacturing forty more to hit a count would be the worst trade in the lab.
//
// SO THE RULE FOR ADMISSION HERE IS THE SAME AS THE CONSISTENCY BOARD'S: an instrument gets a knob proposer when
// it already owns a key the proposer cannot influence -- a closed form, an exact identity, a measured floor.
// Every entry below names its key. Instruments without one are listed at the bottom as NOT REGISTERED, with the
// reason, because a registry that silently omits things is indistinguishable from one that forgot.
//
// AND EVERY ADJUDICATOR HERE IS PROVEN TO REFUSE. The gate exercises each with a knob value that MUST fail and
// one that MUST pass. An adjudicator that has never said no is not evidence that the knob is safe; it is an
// untested branch with a licence attached.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { registerProposer } from "./proposers.mjs";
import { adjudicate as gyroAdjudicate, score as gyroScore, propose as gyroPropose } from "./gyroKnob.mjs";
import { adjudicate as pileAdjudicate, score as pileScore, propose as pilePropose } from "./pileKnob.mjs";
import { adjudicate as vibAdjudicate, score as vibScore, propose as vibPropose } from "./vibrationKnob.mjs";
import { adjudicate as cfgAdjudicate, score as cfgScore, propose as cfgPropose } from "./centrifugeKnob.mjs";
import { yangMagnetisation } from "./statmech/ising.js";
import { wellLevel, levels } from "./quantum/schrodinger1d.js";
import { lzExact, lzSweep } from "./quantum/landauZener.js";
import { crossingProb } from "./percolation/percolation.js";
import { measureR, exactR } from "./sync/kuramoto.js";
import { makeBox, computeForcesPBC, computeForcesImages, makeFluid, wrapAll } from "./md/pbc.js";
import { velocityVerlet, kinetic } from "./md/md.js";

/** Instruments deliberately NOT registered, and why. Read by the gate so this list cannot rot silently. */
export const NOT_REGISTERED = {
    "splat-lab": "renders; its key is a visual comparison a knob search cannot adjudicate headlessly",
    "discovery-lab": "its output IS a discovered law; a knob proposer would be tuning the discoverer against the thing it discovers",
    "cosmic-web": "no closed form at the scales it runs; graded by cross-instrument agreement, not by a per-run key",
    "physics-lab": "an aggregate front door rather than a single measurement with knobs",
    "spatial-agreement": "already an adjudicator itself; registering it would make it grade its own tuning",
    "ising-samples": "ATTEMPTED AND WITHDRAWN. sweepTemperature's row reports magnetisation = 1.0000 at L=16, " +
        "T=1.9 for every sample count from 30 to 6000, against Yang's 0.9383 -- saturated, and until it is " +
        "understood what that field measures there is no honest way to grade a knob against it. Shipping it " +
        "anyway would have meant an adjudicator that refuses everything, which is as useless as one that " +
        "refuses nothing and looks more rigorous. Ising's sampling knobs are already governed by wolff-warmup " +
        "and binder-budget, both with proven adjudicators.",
};

export function registerAll() {
    // ---- SCHRODINGER: grid resolution. KEY: the infinite well's exact levels E_n = n^2 pi^2 / 2 -------------
    // The degenerate pull is obvious -- a coarse grid is fast -- and the finite-difference Laplacian biases
    // every level DOWNWARD, smoothly and plausibly, so nothing looks broken at N = 40.
    registerProposer({
        id: "schrodinger-grid", instrument: "schrodinger", knobs: ["N"], defaultTier: "propose",
        notes: "finite-difference grid points for the 1D solver",
        // MEASURED breakpoints, because the first candidate set was all-passing and therefore untested: worstRel is
        // 0.142 at N=6, 0.0597 at N=10, 0.0254 at N=16, 0.0077 at N=30. N=40 was already converged to 0.5%, so a
        // "coarse" candidate that passes proves nothing about the adjudicator.
        propose: () => [{ N: 10 }, { N: 60 }, { N: 400 }],
        score: (c) => 1 / c.N,
        adjudicate: (c) => {
            const got = levels({ N: c.N, L: 1, count: 3 });
            const want = [1, 2, 3].map((n) => wellLevel(n, 1));
            const worst = Math.max(...got.map((g, i) => Math.abs(g - want[i]) / want[i]));
            return { pass: worst < 0.01, evidence: { N: c.N, worstRel: worst, got: got.map((x) => +x.toFixed(4)), want: want.map((x) => +x.toFixed(4)) } };
        },
    });

    // ---- LANDAU-ZENER: sweep window. KEY: P = exp(-pi D^2 / 2v), exact for an infinite sweep ----------------
    // A short window is cheap and lands on the wrong number because the asymptotic formula has not become true
    // yet -- the failure looks like noise rather than like a bug.
    registerProposer({
        id: "lz-window", instrument: "landau-zener", knobs: ["T"], defaultTier: "propose",
        notes: "half-width of the two-level sweep",
        // MEASURED: rel error 0.207 at T=1, 0.094 at T=2, 0.064 at T=3, 0.020 at T=6, 0.004 at T=40. T=4 already sat
        // inside tolerance, so the original "short window" candidate could not fail.
        propose: () => [{ T: 2 }, { T: 8 }, { T: 40 }],
        score: (c) => 1 / c.T,
        adjudicate: (c) => {
            const D = 1, v = 4;
            const r = lzSweep({ D, v, T: c.T });
            const ex = lzExact(D, v);
            const rel = Math.abs(r.pDiabatic - ex) / ex;
            return { pass: rel < 0.02, evidence: { T: c.T, measured: +r.pDiabatic.toFixed(5), exact: +ex.toFixed(5), rel } };
        },
    });

    // ---- PERCOLATION: ensemble size. KEY: Kesten duality, P(cross) = 1/2 EXACTLY at p = 1/2 ----------------
    // Few realizations is fast, and the binomial error grows as 1/sqrt(reps): the estimate stays unbiased and
    // stops being able to distinguish 1/2 from anything near it. The adjudicator demands the band be TIGHT
    // ENOUGH TO BE A TEST, which is the part a reps-minimizing reward destroys.
    registerProposer({
        id: "percolation-reps", instrument: "percolation", knobs: ["reps"], defaultTier: "propose",
        notes: "realizations per crossing-probability estimate",
        propose: () => [{ reps: 40 }, { reps: 600 }, { reps: 3000 }],
        score: (c) => 1 / c.reps,
        adjudicate: (c) => {
            const r = crossingProb({ L: 24, p: 0.5, reps: c.reps, seed: 124 });
            // the band must be small enough that agreeing with 1/2 MEANS something: 3 sigma under 0.05
            const band = 3 * r.se;
            return { pass: band < 0.05 && Math.abs(r.prob - 0.5) < band,
                     evidence: { reps: c.reps, prob: +r.prob.toFixed(4), band: +band.toFixed(4) } };
        },
    });

    // ---- KURAMOTO: population size. KEY: r(K) = sqrt(1 - Kc/K), exact only as N -> infinity ----------------
    // Small N is fast and sits above the exact branch, because the 1/sqrt(N) noise floor adds coherence that is
    // not there. Cheap, smooth, and biased in a single direction -- the hardest kind to notice.
    registerProposer({
        id: "kuramoto-N", instrument: "kuramoto", knobs: ["N"], defaultTier: "propose",
        notes: "oscillators in the mean-field population",
        propose: () => [{ N: 64 }, { N: 512 }, { N: 4096 }],
        score: (c) => 1 / c.N,
        adjudicate: (c) => {
            const gamma = 0.5, K = 1.5;
            const r = measureR({ K, gamma, N: c.N, seed: 11, transient: 600, samples: 600 });
            const ex = exactR(K, gamma);
            return { pass: Math.abs(r - ex) < 0.03, evidence: { N: c.N, measured: +r.toFixed(4), exact: +ex.toFixed(4) } };
        },
    });

    // ---- MD: timestep. KEY: the shifted-potential energy excursion is second order, and momentum is exact ---
    registerProposer({
        id: "md-timestep", instrument: "md-pbc", knobs: ["dt"], defaultTier: "propose",
        notes: "velocity Verlet timestep for the periodic LJ fluid",
        propose: () => [{ dt: 0.04 }, { dt: 0.012 }, { dt: 0.004 }],
        score: (c) => c.dt,
        adjudicate: (c) => {
            const box = makeBox({ L: 8, cutoff: 3 });
            const f = makeFluid({ n: 3, L: 8, kT: 0.8, seed: 3 });
            const st = { pos: f.pos, vel: f.vel, masses: f.masses, forces: computeForcesPBC(f.pos, f.N, 1, 1, box).forces };
            const e0 = kinetic(st.vel, st.masses) + computeForcesPBC(st.pos, f.N, 1, 1, box).pe;
            let worst = 0;
            const steps = Math.round(2 / c.dt);
            for (let s = 0; s < steps; s++) {
                velocityVerlet(st, c.dt, (pos) => computeForcesPBC(wrapAll(pos, f.N, box.L), f.N, 1, 1, box));
                const e = kinetic(st.vel, st.masses) + computeForcesPBC(st.pos, f.N, 1, 1, box).pe;
                worst = Math.max(worst, Math.abs(e - e0) / Math.abs(e0));
            }
            return { pass: worst < 0.002, evidence: { dt: c.dt, worstRel: worst, steps } };
        },
    });

    // ---- MD: box size against cutoff. KEY: minimum image == an explicit image sum, exactly ------------------
    // The proposer wants the smallest box (fewest pairs). makeBox refuses r_c >= L/2 outright, so this
    // adjudicator checks the thing the constructor cannot: that at the chosen size the shortcut and the literal
    // lattice sum still agree.
    registerProposer({
        id: "md-box", instrument: "md-pbc", knobs: ["L"], defaultTier: "propose",
        notes: "periodic box side for a fixed cutoff",
        // L=5.9 is REFUSED by makeBox itself (cutoff 3 >= L/2 = 2.95), which is the branch worth exercising: the
        // adjudicator must report the constructor's refusal as a failure rather than throwing past it.
        propose: () => [{ L: 5.9 }, { L: 8 }, { L: 11 }],
        score: (c) => 1 / c.L,
        adjudicate: (c) => {
            let box;
            try { box = makeBox({ L: c.L, cutoff: 3 }); }
            catch (e) { return { pass: false, evidence: { L: c.L, refused: String(e.message).slice(0, 90) } }; }
            const f = makeFluid({ n: 3, L: c.L, kT: 1.0, seed: 5 });
            const a = computeForcesPBC(f.pos, f.N, 1, 1, box);
            const b = computeForcesImages(f.pos, f.N, 1, 1, box, { shell: 1 });
            let worst = 0;
            for (let k = 0; k < 3 * f.N; k++) worst = Math.max(worst, Math.abs(a.forces[k] - b.forces[k]));
            return { pass: worst < 1e-12, evidence: { L: c.L, worstForceDiff: worst } };
        },
    });

    // v3591 -- THE FIRST PROPOSER FOR A physics-lab SCENE, after four rounds of triage that registered NOTHING.
    // v3587 assessed twelve scenes, v3588 MEASURED the strongest and withdrew it, v3589-v3590 drove the rest and
    // withdrew two more. This one cleared the bar stated at the top of this file: a key the proposer cannot
    // influence, and an adjudicator exercised with a value that MUST fail.
    //
    // KEY: precession rate * omega must return THE APPLIED TORQUE -- a constant the measurement never sees,
    // because the rate is unwrapped out of the trajectory. *** AND IT REFUSES ON ITS OWN SUBJECT MATTER: *** the
    // fast-top law fails when precession is comparable to spin, so omega = 2 is rejected at 33% error while
    // being a perfectly well-formed spin. An adjudicator that only rejects nonsense has never been tested
    // against the thing it is for.
    registerProposer({
        id: "gyro-spin", instrument: "gyroscope", knobs: ["omega"],
        propose: gyroPropose, score: gyroScore, adjudicate: gyroAdjudicate,
        notes: "precession = tau/(I*omega); rate*omega must return the applied torque. Tolerance is " +
               "0.10*dt*2, DERIVED from the first-order dt floor (3.44e-3, 1.72e-3, 4.30e-4, 1.08e-4 at " +
               "dt = 1/30, 1/60, 1/240, 1/960) rather than chosen -- exact agreement would reject every " +
               "correct answer, and a hand-picked 5% would accept omega = 5 where the law is 6.3% wrong.",
    });

    // v3593 -- THE SECOND lab-scene proposer, and the first to refuse at BOTH ENDS FOR DIFFERENT REASONS.
    // Low mu: the additive offset of ~0.0102 is CONSTANT, so dividing it by a shrinking knob explodes -- 51%
    // relative error at mu = 0.02. High mu: the block is a CUBE and TOPPLES at tan(theta) = 1 whatever the
    // friction, so tan(theta_c) reads 1.01359, 1.01266, 1.01266 at mu = 1.0, 1.3, 2.0 -- IDENTICAL TO FIVE
    // DIGITS. *** THE OBSERVABLE GOES DEAF TO THE KNOB, WHICH IS EXACTLY WHY ORBIT WAS WITHDRAWN AT v3588 --
    // except pile goes deaf only above a boundary the physics NAMES, so it can be refused there and accepted
    // below. *** v3570's adjudicator is reused rather than rebuilt, with both of its findings carried forward.
    registerProposer({
        id: "pile-friction", instrument: "contact-keys", knobs: ["mu"],
        propose: pilePropose, score: pileScore, adjudicate: pileAdjudicate,
        notes: "a block slides iff tan(theta) > mu, bisected on a slide/no-slide BINARY that never consults " +
               "atan(mu). The detector is VELOCITY not displacement (v3570: a settling box creeps, so a " +
               "displacement bound moves the recovered angle with the threshold), and the residual is ADDITIVE " +
               "at ~0.0102 -- so the tolerance is set ABOVE the offset's own drift rather than tighter than it, " +
               "because a bound below a known systematic rejects every correct answer.",
    });

    // v3596 -- THE THIRD lab-scene proposer, and THE ONLY ONE WHOSE HEADLINE KEY PASSES A FAULT OUTRIGHT.
    // The frequency is RECOVERED from the trajectory and compared with the closed form -- two routes, and
    // THEY ALIAS THE SAME WAY: j = 14 on a twelve-mass chain reads relErr 1.14e-5, IDENTICAL to honest mode
    // 12, because sin(14pi/26) = sin(12pi/26). *** TWO INDEPENDENT ROUTES AGREEING IS WORTH NOTHING WHEN THEY
    // SHARE THE ASSUMPTION THAT IS WRONG. *** So the verdict is three parts: the mode must be EXCITED (j =
    // N+1 writes machine zero and the crossing detector still answers), j must be the SMALLEST index giving
    // that frequency, and only then is the frequency graded.
    registerProposer({
        id: "vib-mode", instrument: "vibrations", knobs: ["mode"],
        propose: vibPropose, score: vibScore, adjudicate: vibAdjudicate,
        notes: "omega = 2*sqrt(k/m)*sin(j*pi/(2(N+1))), RECOVERED from zero crossings of the integrated " +
               "chain rather than read from the formula. The tolerance scales as (omega*dt)^2 because that " +
               "is velocity-Verlet's own period error -- measured monotone 1.68e-7 to 1.14e-5 across " +
               "j = 1..12 -- rather than one flat number loose at the bottom and tight at the top. The " +
               "score prefers a HIGH mode because it is CHEAPER TO MEASURE (380 steps per period against " +
               "3128, measured), which walks it straight into the alias region the adjudicator refuses.",
    });

    // v3597 -- THE FOURTH lab-scene proposer, and THE TRIAGE'S PROPOSED KEY WAS FOR A MODEL THIS TREE DOES
    // NOT HAVE: it asked for an exponential concentration profile at sedimentation equilibrium, and
    // physics/centrifuge.js HAS NO DIFFUSION TERM, so there is no equilibrium and no profile. The key here
    // is the TRAJECTORY instead, split into the two claims a single check conflates -- does the stepper
    // reproduce its OWN exact discrete rate (an identity, machine precision), and does it still approximate
    // the CONTINUOUS physics (the departure is the leading series term x/2, predicted not fitted).
    registerProposer({
        id: "cfg-spin", instrument: "centrifuge", knobs: ["omega"],
        propose: cfgPropose, score: cfgScore, adjudicate: cfgAdjudicate,
        notes: "r(t) = r0 exp(s omega^2 t). Forward Euler's EXACT rate is ln(1+x)/dt and not k, so the " +
               "doubling time has TWO right answers and a check against either alone is wrong in a " +
               "different direction. The refusal boundary is ln(1+x)'s RADIUS OF CONVERGENCE rather than a " +
               "chosen tolerance: past x = 1 the leading-order account the key rests on does not exist. The " +
               "score prefers a FAST spin because the doubling time falls as omega^-2 (19.50s at omega 20 " +
               "against 0.786s at 100, measured), which walks it straight past that boundary.",
    });

}
