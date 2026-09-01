// tools/roundhouse/blackHoleBind.mjs
//
// v2803 -- roundhouse device #2: the Paczynski-Wiita black hole (physics/blackHole.js). Proves the deviceBind seam
// generalizes: same loop, different lab, and again the exit condition is a number the SIMULATION measured -- with the
// bonus that this device carries a known exact truth to crystallize against: the ISCO sits at exactly 6GM/c^2 in the
// PW potential (that is the whole point of PW), so a capture-onset bisection has a ground-truth answer the way the
// LBM rig's Re_c does not.
//
// Modes:
//   "orbit" -- one particle, r0 and v0Frac (fraction of circular speed). Measured observables:
//              captured (bool), rMin, rMax, precessionPerOrbit (rad; mean wrapped gap between consecutive apoapsis
//              angles -- 0 for a Newtonian ellipse, > 0 here), energyDriftFrac (integrator health; PW energy is
//              conserved, so drift is pure integration error), orbits (apoapsis count).
//   "onset" -- bisect r0 (each start at slightly-under-circular speed, deterministic perturbation to break the
//              unstable equilibria inside the ISCO) for the capture/no-capture boundary. Measured observables:
//              captureOnsetR, captureOnsetRBracket, iscoTheory (= 6GM/c^2, reported for the evaluator's benefit --
//              crystallization still only checks the claim's numbers).
//
// Units default to G = M = c = 1 -> rs = 2, photon sphere 3, ISCO 6. Pure arithmetic, deterministic, cross-arch.

import {
    schwarzschildRadius, iscoRadius, circularSpeed, makeParticle, step, run, energy,
} from "../../physics/blackHole.js";

export const BH_OBSERVABLES = [
    "nsMass", "nsRadiusKm", "rsKm", "compactness", "iscoKm", "photonSphereKm",
    "iscoOutside", "photonSphereOutside", "escapeFrac",
    "captured", "rMin", "rMax", "precessionPerOrbit", "energyDriftFrac", "orbits", "captureOnsetR",
    "escapeV", "escapeErrFrac",
    // v4085 -- COMPLETED: these keys were returned by the builder and never declared -- `kind` and `r0` on
    // every mode, `captureOnsetRBracket`/`iscoTheory` on `onset`, `escapeVBracket`/`escapeTheory` on `escape`.
    // Same defect as v3850/v4082/v4084.
    "kind", "r0", "captureOnsetRBracket", "iscoTheory", "escapeVBracket", "escapeTheory",
];

// v0Frac 0.999 for orbit runs (visible eccentricity -> clean apoapsis detection). Onset runs override to 0.99999:
// the capture boundary for an under-circular start sits OUTSIDE the exact ISCO by an amount that shrinks with the
// perturbation (measured here: 0.999 -> 6.38, 0.9999 -> 6.11, 0.99999 -> 6.04, exact 6.00; step-count-insensitive,
// so it is a physical bias, not integration error). 0.99999 keeps the boundary within 0.05 of theory while still
// deterministically tipping the unstable inside-ISCO orbits.
const DEF = {
    // v3435 -- DECLARED, NOT ADDED: every key below was ALREADY READ by this bind and ALREADY had this
    // exact fallback. defaults() simply never said so, and strictBuild therefore REJECTED A PARAMETER THAT
    // DEMONSTRABLY WORKS -- blackhole's iscoKm moves 12.40 -> 17.72 when nsMass is set. THE GUARD WAS
    // BLOCKING THE THING IT WAS BUILT TO PROTECT. Declaring costs nothing at run time because the value is
    // the one the code already fell back to; what it buys is that the contract now matches the behaviour.
    nsMass: 1.4,
    nsRadiusKm: 11,
 G: 1, M: 1, c: 1, dt: 0.02, steps: 200000, v0Frac: 0.999, onsetV0Frac: 0.99999, onsetLo: null, onsetHi: null, onsetTol: 0.02, escRFar: 800, escSteps: 1200000, escTol: 1e-4 };
// v2932 -- escSteps default RAISED 600000 -> 1200000 (adopting v2919). At the old default the bisection stopped
// with the escape speed still on its way down through the theory line, reporting escapeErrFrac 1.569e-3 -- a
// number that looked good precisely BECAUSE the transient had not settled. escapeV converges to 0.532157195734
// (bit-identical from escSteps 1.2M through 4.8M), where the honest residual to the Paczynski-Wiita theory is
// 4.425e-3. That residual is the FINITE-escRFar offset the v2806 comment already documents, not integrator error.
// The reported number got numerically LARGER and epistemically HONEST: a measurement that has not converged is
// not a measurement, and 1.569e-3 was the transient crossing the answer, not the answer. 1.2M is the smallest
// budget on the plateau, so convergence costs no extra steps beyond what it takes to reach it.

// Clamp/fill a sloppy hypothesis so it still builds -- the local-model aid. Numbers are forced finite and into
// physical range (r0 must start OUTSIDE the horizon; dt/steps bounded so a wild proposal cannot hang the builder).
// v3421 -- ONE DEFINITION, third bind in two rounds to need it.
export const BH_MODES = ["orbit", "onset", "escape", "neutronstar"];

import { schwarzschildRadiusKm, compactness, iscoKm, photonSphereKm, iscoOutsideSurface,
         photonSphereOutsideSurface, escapeFraction } from "../../physics/neutronStar.js";

// *** v3708 -- THE PLANTED ERROR: rs = GM/c^2 INSTEAD OF 2GM/c^2, THE MOST TEMPTING SLIP IN THIS CORNER OF
// PHYSICS. *** Drop the factor of two in the Schwarzschild radius and EVERY SHAPE-OF-THE-ANSWER CHECK SURVIVES:
// the potential is still -GM/(r - rs), orbits still bind, they still precess, energy still conserves to
// integrator accuracy, capture still happens at SOME radius. Nothing looks wrong. WHAT DOES NOT SURVIVE IS THE
// ONE EXACT TRUTH THIS DEVICE CARRIES -- the ISCO sits at exactly 3 rs, and the onset mode BISECTS FOR THAT
// BOUNDARY FROM THE SIMULATION without ever reading the closed form.
// THE PLANT REPLACES A CONSTANT IN A DEFINITION, NOT A LAW, which is why it is believable: a wrong law tends to
// look wrong, and a wrong constant tends to look like an answer.
//
// ONE FUNCTION, NOT FIVE SPELLINGS. rs was computed identically in five places; v3421's note in this same file
// records what a third spelling already cost here once.
function horizon(cfg) {
    return cfg.planted ? schwarzschildRadius(cfg.M, cfg.G, cfg.c) / 2
                       : schwarzschildRadius(cfg.M, cfg.G, cfg.c);
}

export function bhDefaults(hyp) {
    const h = { mode: "orbit", ...(hyp || {}) };
    const cfg = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    cfg.G = num(cfg.G, 1); cfg.M = num(cfg.M, 1); cfg.c = num(cfg.c, 1);
    cfg.dt = Math.min(0.1, Math.max(1e-4, num(cfg.dt, DEF.dt)));
    cfg.steps = Math.min(2e6, Math.max(1000, num(cfg.steps, DEF.steps) | 0));
    cfg.v0Frac = Math.min(1.5, Math.max(0.1, num(cfg.v0Frac, DEF.v0Frac)));
    cfg.onsetV0Frac = Math.min(0.999999, Math.max(0.99, num(cfg.onsetV0Frac, DEF.onsetV0Frac)));
    cfg.onsetTol = Math.min(0.5, Math.max(0.005, num(cfg.onsetTol, DEF.onsetTol)));
    cfg.escRFar = Math.min(5000, Math.max(50, num(cfg.escRFar, DEF.escRFar)));
    cfg.escSteps = Math.min(2e6, Math.max(10000, num(cfg.escSteps, DEF.escSteps) | 0));
    cfg.escTol = Math.min(0.01, Math.max(1e-5, num(cfg.escTol, DEF.escTol)));
    const rs = horizon(cfg);
    // *** v3712 -- onsetHi WAS A TYPED 12 WITH A TYPED FLOOR OF 8, AND NEITHER SCALED WITH rs. That is the
    // same defect v3708 cured on the LOWER bound, left standing on the upper one: a bound that does not move
    // with the mass can only bracket the boundary for the masses somebody happened to try. MEASURED at v3709:
    // onset was readable to M <= 1.5 and REFUSED BY NAME from M = 2 up, because ISCO = 6M crosses 12 -- a
    // NAMED LIMIT rather than a silent hole, which is the only reason this was never urgent.
    // hi DEFAULTS TO TWICE THE ISCO IMPLIED BY THE rs IN PLAY (3*rs), i.e. 6*rs, and 6*rs IS 12 AT rs = 2, so
    // the nominal run is unchanged BY CONSTRUCTION rather than by luck. The floor is the implied ISCO itself:
    // a surviving-side bound at or below where the boundary lives is not a bracket endpoint, and the
    // "onset-hi-captured" refusal catches whatever the floor lets through.
    // *** WHEN THIS GOES RED, re-derive the multiple from the rs IN PLAY -- NEVER type a number back in. ***
    cfg.onsetHi = Math.max(3 * rs, num(cfg.onsetHi, 6 * rs));

    // *** v4050 -- onsetLo WAS RESOLVED AT THE BUILD SITE INSTEAD OF HERE, AND THAT MADE IT INVISIBLE. ***
    // Its default stayed `null` in the config every caller reads, and the real value (3*rs*0.9) was computed
    // inline where the bisection starts. knobLiveness reports a knob it cannot perturb as UNPROBED rather
    // than as still -- "no ordering to perturb the default along" -- so this knob has been in the census's
    // ADMISSION list since it was written, never in a verdict. THE READING WAS CORRECT AND THE KNOB WAS NOT
    // DEAD: nothing had ever asked it anything. Resolving it here is the same cure v3712 applied to onsetHi
    // one line above, left undone on the lower bound for the same reason it was left undone there.
    //
    // *** AND IT IS DELIBERATELY NOT CLAMPED, WHICH IS WHERE IT DIFFERS FROM onsetHi. *** A floor of rs would
    // read as symmetry with the line above and would DISARM A LOAD-BEARING GUARD: "onset-lo-inside-horizon"
    // exists precisely to refuse a lower bound inside the horizon, and blackHoleBind-selfcheck proves it
    // fires by passing onsetLo = rs/2. Clamping would make that value unreachable, the guard unreachable, and
    // the selfcheck's negative vacuous -- a pass that means nothing, which is the failure this lab names most
    // often. onsetHi can carry a floor because its floor sits ABOVE where the boundary lives; onsetLo's guard
    // is the whole question of what lies BELOW.
    cfg.onsetLo = num(cfg.onsetLo, 3 * rs * 0.9);
    h.r0 = Math.max(rs * 1.05, num(h.r0, iscoRadius(cfg.M, cfg.G, cfg.c) * 1.5));
    if (!BH_MODES.includes(h.mode)) h.mode = "orbit";
    h.config = cfg;
    if (!h.claim || !h.claim.observable) h.claim = { observable: "captured", equals: false };
    return h;
}

// Orbit run with UNWRAPPED angle tracking. Near the hole PW precession exceeds pi per orbit (r0=8 gives ~+4.7 rad),
// so a wrapped atan2 gap is ambiguous (+4.7 reads as -1.6). Accumulating the per-step angle increment (always small,
// so its own wrap is safe) gives the true cumulative angle; the gap between consecutive apoapses minus 2*pi is the
// unambiguous precession per orbit. This is why the bind steps the particle itself instead of using
// blackHole.apoapsisAngles -- the device module stays untouched, per the RIG-BIND convention.
function orbitRun(r0, cfg) {
    const rs = horizon(cfg);
    const v0 = cfg.v0Frac * circularSpeed(r0, cfg.M, cfg.G, rs);
    const p = makeParticle(r0, v0);
    const e0 = energy(p, cfg.M, cfg.G, rs);
    let thPrev = Math.atan2(p.r[1], p.r[0]);
    let cum = 0;
    let rPrev = r0, rising = false;
    const apo = [];                               // cumulative angle at each apoapsis
    for (let i = 0; i < cfg.steps && !p.captured; i++) {
        step(p, cfg.dt, cfg.M, cfg.G, rs);
        const th = Math.atan2(p.r[1], p.r[0]);
        let d = th - thPrev;                      // per-step increment: small, wrap-safe
        while (d <= -Math.PI) d += 2 * Math.PI;
        while (d > Math.PI) d -= 2 * Math.PI;
        cum += d;
        thPrev = th;
        const r = Math.sqrt(p.r[0] * p.r[0] + p.r[1] * p.r[1]);
        if (r > rPrev) rising = true;
        else if (rising && r < rPrev) { apo.push(cum); rising = false; }
        rPrev = r;
    }
    let prec = null;
    if (apo.length >= 2) {
        let sum = 0;
        for (let i = 1; i < apo.length; i++) sum += (apo[i] - apo[i - 1]) - 2 * Math.PI;
        prec = sum / (apo.length - 1);
    }
    const e1 = p.captured ? null : energy(p, cfg.M, cfg.G, rs);
    return {
        captured: p.captured,
        rMin: p.rMin,
        rMax: p.rMax,
        orbits: apo.length,
        precessionPerOrbit: prec,
        energyDriftFrac: e1 === null ? null : Math.abs((e1 - e0) / e0),
    };
}

// Does a slightly-under-circular start at r0 survive `steps` without capture? Inside the ISCO circular orbits are
// UNSTABLE -- the deterministic v0Frac < 1 perturbation tips them into the plunge; outside they persist. Bisecting the
// survives/captured boundary therefore measures the ISCO from dynamics alone.
function survives(r0, cfg) {
    const rs = horizon(cfg);
    const v0 = cfg.onsetV0Frac * circularSpeed(r0, cfg.M, cfg.G, rs);
    const p = makeParticle(r0, v0);
    run(p, cfg.steps, cfg.dt, cfg.M, cfg.G, rs);
    return !p.captured;
}

function onsetRun(cfg) {
    const rs = horizon(cfg);
    // Default LOWER endpoint: 0.7 * ISCO -- comfortably inside the unstable band but away from the near-horizon
    // regime where circular speeds (~ sqrt(GMr)/(r-rs)) blow up past what dt=0.02 can resolve (an r0 = 1.1*rs start
    // moves ~0.15 units per step and the integrator error can fling it OUTWARD -- "survives" for the wrong reason;
    // that is a discretization artifact, not physics, so the endpoint stays where the integrator is honest).
    // *** v3708 -- 0.7 OF THE ISCO IMPLIED BY THE rs IN PLAY, NOT OF THE TEXTBOOK ONE. *** This bound was
    // ALWAYS meant to be a fraction of the ISCO -- it just reached for iscoRadius(M,G,c), which recomputes
    // 6GM/c^2 from the constants and therefore IGNORES the rs the simulation is actually using. Nominal is
    // UNCHANGED (3*rs*0.7 = 4.2 when rs = 2, exactly what it was), and under the planted rs the bracket
    // follows the physics down instead of sitting above a boundary that moved. A SEARCH WHOSE BOUNDS COME FROM
    // A CONSTANT THE RUN DOES NOT USE CAN ONLY FIND ANSWERS NEAR THE ONE ASSUMED.
    // *** AND 0.9, NOT 0.7, BECAUSE CAPTURE IS A BAND AND NOT A HALF-LINE -- MEASURED, NOT ASSUMED. *** The
    // bisection's premise is monotonic: everything below the boundary captures, everything above survives. It
    // is FALSE NEAR THE HORIZON. Swept at v3708 in units of the ISCO: at rs = 2 the particle captures at 0.7
    // and 0.9 and SURVIVES AGAIN AT 0.5; at rs = 1 it captures at 0.9 and survives at 0.7 and 0.5. So the
    // captured side is an interval whose lower edge moves with rs, and 0.7 sat inside it for the textbook rs
    // only by luck. 0.9 CAPTURES FOR BOTH, and the bisection converges to the same boundary from either -- the
    // nominal answer is unchanged at 6.0357 against a theory of 6.
    // *** THE NON-MONOTONICITY IS A REAL LIMIT OF THIS MEASUREMENT AND IS RECORDED RATHER THAN WORKED AROUND:
    // a bisection over a non-monotonic predicate is only trustworthy while its lower bound is inside the band,
    // and nothing here checks that it is. onsetLo is exposed so a caller can move it, and "onset-lo-survives"
    // is REPORTED BY NAME rather than being returned as a number, which is what saved this round. ***
    let lo = cfg.onsetLo;                     // captured side -- RESOLVED IN defaults() SINCE v4050,
                                              // so the config the census reads is the config this uses
    let hi = cfg.onsetHi;                     // surviving side
    // *** v3709 -- "CAPTURED" WAS TWO THINGS WEARING ONE LABEL, AND THE BAND CHECK ONLY EVER WANTED ONE OF
    // THEM. *** survives(lo) === false is satisfied by a start inside the CAPTURING BAND *and* by a start
    // already INSIDE THE EVENT HORIZON, where nothing has been measured because nothing was ever going to come
    // back. The comment above says the bisection is trustworthy only while its lower bound is inside the band;
    // the test written for that says "did it capture", and a hole captures everything. MEASURED at v3709 with
    // rs = 2: onsetLo of 0.5, 1.0 and 1.9 ALL PASS the captured test and the bisection returns a plausible
    // 6.03, while 2.0 and 2.1 -- outside the horizon, below the band's lower edge -- refuse correctly. So the
    // one region that could never be a bracket endpoint was the one region the guard admitted.
    // *** WHEN THIS LINE GOES RED the fix is to move onsetLo OUT past the horizon, NEVER to lower the multiple
    // or to drop the test: a bound inside rs is not a bracket endpoint, it is a hole the search starts in. ***
    if (!(lo > horizon(cfg))) return { error: "onset-lo-inside-horizon: lower r0 " + lo + " is not outside rs " + horizon(cfg) };
    if (survives(lo, cfg)) return { error: "onset-lo-survives: lower r0 " + lo + " did not capture" };
    if (!survives(hi, cfg)) return { error: "onset-hi-captured: upper r0 " + hi + " did not survive" };
    while (hi - lo > cfg.onsetTol) {
        const mid = 0.5 * (lo + hi);
        if (survives(mid, cfg)) hi = mid; else lo = mid;
    }
    return {
        captureOnsetR: 0.5 * (lo + hi),
        captureOnsetRBracket: [lo, hi],
        iscoTheory: iscoRadius(cfg.M, cfg.G, cfg.c),
    };
}

// v2806 -- "escape" mode: bisect the radial launch speed at r0 for the reaches-rFar-within-T boundary. PW escape
// speed has a closed form, v_esc = sqrt(2GM/(r0-rs)), but "escaped" is measured as a FINITE-HORIZON event (reached
// escRFar within escSteps), so the measured boundary sits BELOW theory by an amount that shrinks as the horizon
// grows -- measured at r0=8: escRFar 200 -> 0.573792, 400 -> 0.573792, 800 -> 0.575180, theory 0.57735 (0.38%
// at the default, which IS escRFar 800). Same honest-convergent-bias family as the ISCO onset; escapeErrFrac
// carries the residual so claims state what the horizon earned.
//
// *** v4303 -- ALL THREE RUNGS WERE STALE AND THE 200/400 STEP HAS GONE FLAT. *** This line read
// "200 -> 0.5717, 400 -> 0.5730, 800 -> 0.5766 ... (0.13% at the default)", a clean monotone convergence.
// Re-run: 200 and 400 now return the SAME boundary, BIT-IDENTICAL, and that is not the bisection giving up --
// it holds at escTol 1e-5, ten times finer than the 1e-4 default. The trajectory that marginally escapes
// overshoots both thresholds, so the finite-horizon bias is QUANTISED BY THE ORBIT rather than smooth in
// escRFar. The claim survives -- 0.573792 -> 0.575180 still climbs toward 0.57735 as the horizon grows -- but
// it is now exhibited by ONE step of the three, not by all of them, and the residual at the default is 0.38%
// rather than the 0.13% this line has been quoting.
//
// AND THE KNOB IS `escRFar`, NOT `rFar`. The prose said rFar and the config key is escRFar; a sweep written
// from the comment passes a key defaults() ignores and gets three identical numbers that look like a dead
// knob. Named correctly above so the next reader measures the thing the sentence is about.
function escapeRun(hypR0, cfg) {
    const rs = horizon(cfg);
    const theory = Math.sqrt(2 * cfg.G * cfg.M / (hypR0 - rs));
    const escapes = (v) => {
        const p = makeParticle(hypR0, 0);
        p.v = [v, 0];                                     // radial launch, outward
        run(p, cfg.escSteps, cfg.dt, cfg.M, cfg.G, rs);
        return !p.captured && p.rMax > cfg.escRFar;
    };
    let lo = 0.2 * theory, hi = 2 * theory;
    if (escapes(lo)) return { error: "escape-lo-escapes: 0.2*v_esc reached rFar -- horizon too short or rFar too small" };
    if (!escapes(hi)) return { error: "escape-hi-bound: 2*v_esc did not reach rFar within the step budget" };
    while (hi - lo > cfg.escTol) {
        const mid = 0.5 * (lo + hi);
        if (escapes(mid)) hi = mid; else lo = mid;
    }
    const escapeV = 0.5 * (lo + hi);
    return {
        escapeV,
        escapeVBracket: [lo, hi],
        escapeTheory: theory,
        escapeErrFrac: Math.abs(escapeV - theory) / theory,
    };
}

export function buildBH(hyp, base = {}) {
    const h = bhDefaults({ ...hyp, config: { ...(base || {}), ...(hyp && hyp.config) } });
    if (h.mode === "neutronstar") {
        // *** THE KEY IS A PAIR OF BOOLEANS THAT MUST DISAGREE, AND A WRONG COMPACTNESS FLIPS THEM TOGETHER. ***
        // For the canonical 1.4-solar-mass, 11-km star the ISCO at 3 r_s sits OUTSIDE the surface while the
        // photon sphere at 1.5 r_s sits INSIDE it. Either alone is one number near a threshold; the two
        // together bracket the compactness from both sides, and no single scale error can satisfy both.
        const cfg = h.config || {};
        const M = Math.min(3, Math.max(0.5, Number(cfg.nsMass) || 1.4));
        const R = Math.min(30, Math.max(5, Number(cfg.nsRadiusKm) || 11));
        return {
            nsMass: M, nsRadiusKm: R,
            rsKm: schwarzschildRadiusKm(M), compactness: compactness(M, R),
            iscoKm: iscoKm(M), photonSphereKm: photonSphereKm(M),
            iscoOutside: iscoOutsideSurface(M, R), photonSphereOutside: photonSphereOutsideSurface(M, R),
            escapeFrac: escapeFraction(M, R),
        };
    }

    if (h.mode === "onset") return { kind: "onset", ...onsetRun(h.config) };
    if (h.mode === "escape") return { kind: "escape", r0: h.r0, ...escapeRun(h.r0, h.config) };
    return { kind: "orbit", r0: h.r0, ...orbitRun(h.r0, h.config) };
}

// The device descriptor deviceBind.mjs consumes.
export const blackHoleDevice = {
    plantKind: "knob",   // v3708 -- config.planted halves rs; THE ONSET BISECTION is what separates it
    // v4091 -- NAMED, THE SAME COMPLETION v3851/v4088-v4090 gave born/chaos/box3d/acoustics/seismic/nuclear.
    // MEASURED, onset mode both arms: captureOnsetR 6.025 -> 2.900, against an iscoTheory of 6 that never moves
    // (the plant halves rs in the SIMULATION, not in the closed form the bisection is graded against).
    planted: { knob: "planted", observable: "captureOnsetR",
               note: "rs halved in the definition, not the law -- orbit still integrates, capture still happens at SOME radius, and only the onset bisection (which never reads the closed form) shows the ISCO has moved off its exact 6M" },
    // v3191 -- EXPORTED so nothing has to GUESS. A probed mode count is a LOWER BOUND: you can only ask
    // about a mode you already thought of, and these names were in nobody's candidate list, so this
    // device reported as having NO DISCOVERABLE MODES. Derived from this file's own default plus every
    // mode its own build() branches on, each verified to produce a DISTINCT answer first.
    // v3421 -- AND THIS WAS A THIRD SPELLING: the guard read ["orbit","onset","escape"] and this line read
    // ["orbit","escape","onset"] -- SAME SET, DIFFERENT ORDER, so a search for one text never found the other
    // and my first edit silently missed it. TWO COPIES THAT AGREE ON CONTENT STILL DISAGREE AS TEXT.
    modes: BH_MODES,
    name: "paczynski-wiita-black-hole",
    observables: BH_OBSERVABLES,
    build: buildBH,
    defaults: bhDefaults,
};
