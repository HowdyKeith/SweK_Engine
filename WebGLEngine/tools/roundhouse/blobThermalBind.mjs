// tools/roundhouse/blobThermalBind.mjs
//
// v2805 -- roundhouse device #4: the blobarium's thermodynamics (physics/blobThermal.js + the Wyvill field from
// simulation/tomo/blobPhantom.js). Fourth device through the deviceBind seam, and the first STATISTICAL one -- its
// truths are ensemble statements, made deterministic by the module's own seeded LCG so a claim is still exactly
// reproducible run to run.
//
// Three kinds of truth, one per mode:
//   "einstein" -- the Einstein relation itself: jitterCentres steps sqrt(2*D*dt) per axis, so an ensemble of M
//                 walkers must satisfy <r^2> = 6*D*t in 3D. dMeasured = <r^2>/(6t) recovers the D that was put in;
//                 dErrFrac is the statistical gap (about sqrt(2/(3M)) relative -- ~2% at M=2000 -- so claims carry
//                 an ensemble-sized tolerance, not a wish).
//   "scheme"   -- the advection scheme's IMPLICIT diffusion (the temperature nobody set): measureAquariumD reads D
//                 off the field's second-moment growth at two horizons. schemeD is the number; dConsistencyFrac is
//                 the agreement between the two horizons -- if the scheme really obeys d<r^2>/dt = 6D, the two
//                 estimates match (measured here: 0.05%), and THAT closeness is the claimable evidence it diffuses
//                 like a heat equation rather than merely blurring.
//   "floor"    -- the invariant the grid does not have: however far the centres wander, the Wyvill field's peak
//                 cannot fall below the tallest single blob's amplitude (u = 1 at its own centre; everything else
//                 only adds). fieldPeak is measured by evaluating the field at every centre after the walk;
//                 peakAboveFloor is the claimable boolean.
//
// All pure JS, deterministic via lcg(seed) -- same cross-arch story as the other devices.

// *** v3715 -- THE PLANT: DROP THE 2 FROM sqrt(2*D*dt). Einstein-Smoluchowski gives <x^2> = 2*D*t per axis;
// sqrt(D*dt) is dimensionally correct, looks right, and silently walks at HALF the commanded diffusion. It is
// the single most common way to get Brownian motion wrong, which is exactly what this census wants.
// MEASURED: dMeasured 0.011330 -> 0.005665 (exactly half), dErrFrac 0.0070 -> 0.5035.
//
// *** AND THE FLOOR MODE IS BLIND TO IT -- CORRECTLY. peakAboveFloor stays TRUE in both arms, because the
// floor is a STRUCTURAL INVARIANT: the Wyvill field at a blob's own centre is 1 and every other blob only
// ADDS, so the peak cannot fall below the tallest amplitude NO MATTER HOW FAR THE CENTRES WANDER. An invariant
// that held only for the right diffusion constant would not be an invariant. THIS IS THE THIRD ROUND RUNNING
// WITH A BLIND OBSERVABLE AND THE FIRST WHERE THE BLINDNESS IS THE POINT RATHER THAN A GAP: v3713's loss
// columns and v3714's round trip were SUPPOSED to see their plants and could not. Do not let "blind
// observable" become a reflex finding -- ask whether the observable ever claimed to look. ***
import { lcg, jitterCentres, peakFloor, measureAquariumD, EINSTEIN_AXIS_FACTOR } from "../../physics/blobThermal.js";
import { blobFieldAt, blobRadonAt } from "../../simulation/tomo/blobPhantom.js";

export const BLOB_OBSERVABLES = [
    "dMeasured", "dErrFrac", "schemeD", "dConsistencyFrac", "fieldPeak", "peakFloorValue", "peakAboveFloor",
    // v2895 -- DISPERSION. The blobarium as the thing a pulsar signal passes THROUGH.
    "dmCentral", "dmCentralExact", "dmErrFrac", "dmProfileExponent", "dmProfileExponentExact", "dmProfileErrFrac",
    "delayExponent", "delayExponentExact", "delayExponentErrFrac", "delayRatio", "delayRatioExact",
    "scaleCommitted", "dmSimUnits",
    // v2896 -- PLASMA LENSING. The blob as optics, and the answer is that it is the WRONG SIGN of lens.
    "bendMeasured", "bendExact", "bendErrFrac", "bendOutward", "lensSign", "focalLength", "diverging",
    // *** v4084 -- COMPLETED, THE SAME DEFECT v3850 FIXED IN THE THERMAL FOUR. *** These keys were RETURNED
    // BY THE BUILDER AND NEVER DECLARED: `kind` on every mode, plus `dInput`/`msd`/`walkers` on `einstein`
    // and `horizons` on `scheme`. An undeclared observable is invisible to every consumer that reads the
    // list rather than the code, which is the whole reason the list exists.
    "kind", "dInput", "msd", "walkers", "horizons",
];

const DEF = { D: 0.01141, dt: 1 / 60, steps: 60, blobCount: 2000, seed: 42, n: 32, ext: 2, schemeSteps: 15, v: 1, dmAmp: 1, dmRadius: 1, nuLo: 0.4, nuHi: 1.4, bImpact: 0.4 };

export function blobDefaults(hyp) {
    const h = { mode: "einstein", ...(hyp || {}) };
    const cfg = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    cfg.D = Math.min(1, Math.max(1e-5, num(cfg.D, DEF.D)));
    cfg.dt = Math.min(0.1, Math.max(1e-4, num(cfg.dt, DEF.dt)));
    cfg.steps = Math.min(2000, Math.max(1, num(cfg.steps, DEF.steps) | 0));
    cfg.blobCount = Math.min(20000, Math.max(10, num(cfg.blobCount, DEF.blobCount) | 0));
    cfg.seed = num(cfg.seed, DEF.seed) | 0;
    cfg.n = Math.min(48, Math.max(8, num(cfg.n, DEF.n) | 0));
    cfg.schemeSteps = Math.min(60, Math.max(2, num(cfg.schemeSteps, DEF.schemeSteps) | 0));
    cfg.v = Math.min(10, Math.max(0.1, num(cfg.v, DEF.v)));
    cfg.dmAmp = Math.min(1e6, Math.max(1e-6, num(cfg.dmAmp, DEF.dmAmp)));
    cfg.dmRadius = Math.min(1e3, Math.max(1e-3, num(cfg.dmRadius, DEF.dmRadius)));
    cfg.nuLo = Math.min(1e3, Math.max(1e-3, num(cfg.nuLo, DEF.nuLo)));
    cfg.nuHi = Math.min(1e4, Math.max(cfg.nuLo * 1.01, num(cfg.nuHi, DEF.nuHi)));
    cfg.bImpact = Math.max(1e-6, num(cfg.bImpact, DEF.bImpact));
    if (!["einstein", "scheme", "floor", "dispersion", "plasmalens"].includes(h.mode)) h.mode = "einstein";
    h.config = cfg;
    if (!h.claim || !h.claim.observable) h.claim = { observable: "dErrFrac", max: 0.05 };
    return h;
}

/** 2 is Einstein-Smoluchowski; 1 is the planted slip. Read from config so BOTH walking modes share one answer. */
function axisFactorFor(cfg) { return cfg && cfg.planted ? 1 : EINSTEIN_AXIS_FACTOR; }

function einsteinRun(cfg) {
    const rnd = lcg(cfg.seed);
    const blobs = Array.from({ length: cfg.blobCount }, () => ({ x: 0, y: 0, z: 0, r: 1, a: 1 }));
    for (let s = 0; s < cfg.steps; s++) jitterCentres(blobs, { D: cfg.D, dt: cfg.dt, rnd, axisFactor: axisFactorFor(cfg) });
    let msd = 0;
    for (const b of blobs) msd += b.x * b.x + b.y * b.y + b.z * b.z;
    msd /= cfg.blobCount;
    const t = cfg.steps * cfg.dt;
    const dMeasured = msd / (6 * t);
    return { dInput: cfg.D, dMeasured, dErrFrac: Math.abs(dMeasured - cfg.D) / cfg.D, msd, walkers: cfg.blobCount };
}

function schemeRun(cfg) {
    const out = measureAquariumD(
        { x: 0, y: 0, z: 0, r: 1, a: 1 },
        { n: cfg.n, ext: cfg.ext, steps: cfg.schemeSteps, v: cfg.v, dt: cfg.dt, rounds: 2 },
    );
    const [s0, s1] = out.samples;
    return {
        schemeD: out.D,
        dConsistencyFrac: Math.abs(s0.D - s1.D) / out.D,
        horizons: out.samples.map((s) => ({ t: s.t, D: s.D })),
    };
}

function floorRun(cfg) {
    const rnd = lcg(cfg.seed);
    // Mixed amplitudes so the floor is set by ONE blob, and starts SPREAD on a grid with spacing 3 (> 2 * max r,
    // so the compact supports begin fully disjoint). With overlapping starts the field peaks at the SUM of dozens
    // of blobs and the invariant is trivially true; isolated starts make it bite -- the measured peak sits just
    // above the tallest single amplitude, and staying >= that floor through the walk is the actual guarantee.
    const count = Math.min(cfg.blobCount, 200);
    const side = Math.ceil(Math.cbrt(count));
    const blobs = Array.from({ length: count }, (_, i) => ({
        x: 3 * (i % side), y: 3 * (Math.floor(i / side) % side), z: 3 * Math.floor(i / (side * side)),
        r: 0.5 + (i % 7) * 0.1, a: 0.2 + ((i * 13) % 9) / 10,
    }));
    for (let s = 0; s < cfg.steps; s++) jitterCentres(blobs, { D: cfg.D, dt: cfg.dt, rnd, axisFactor: axisFactorFor(cfg) });
    let fieldPeak = -Infinity;
    for (const b of blobs) {
        const f = blobFieldAt(b.x, b.y, b.z, blobs);
        if (f > fieldPeak) fieldPeak = f;
    }
    const floor = peakFloor(blobs);
    return { fieldPeak, peakFloorValue: floor, peakAboveFloor: fieldPeak >= floor };
}

// ---------------------------------------------------------------------------------------------------------------
// v2895 -- DISPERSION: THE BLOBARIUM AS SOMETHING A PULSAR SIGNAL PASSES THROUGH
//
// A plasma delays a radio pulse by an amount fixed by the ELECTRON COLUMN DENSITY along the line of sight -- the
// dispersion measure DM = integral of n_e dl -- and the delay goes exactly as nu^-2. That is the most classic
// pulsar observable there is, and the blobarium can produce it because blobPhantom.js already computes the exact
// line integral through a Wyvill blob: blobRadonAt. The 32/35 and the exponent 3.5 in that function ARE the
// closed-form chord integral of (1 - d^2/r^2)^3, so the answer keys were already in the tree.
//
// THE UNIT COMMITMENT IS EXPLICIT, and for exactly the reason blobKelvin.js exists: a DM in sim units is not a
// DM in pc/cm^3 without committing to a length scale, and a device that quietly picked one would be inventing
// physics. So this mode grades ONLY the scale-free facts -- which is not a limitation, because every keyed
// statement about dispersion happens to be scale-free:
//
//   central DM through a blob      = (32/35) * a * r     EXACT (the Wyvill chord integral)
//   DM profile across offset b     proportional to (1 - b^2/r^2)^3.5   EXACT
//   delay vs frequency             t proportional to nu^-2             EXACT (cold plasma dispersion relation)
//
// The absolute delay in seconds needs the scale commitment, and is reported as scaleCommitted:false to say so.

const DM_DELAY_EXPONENT = -2;              // cold-plasma dispersion: t proportional to nu^-2, exactly
const WYVILL_CHORD_CONST = 32 / 35;        // integral of (1-u^2)^3 du over [-1,1]
const WYVILL_PROFILE_EXPONENT = 3.5;       // the offset-chord falloff, (1 - b^2/r^2)^3.5

/** Delay in ARBITRARY units: k * DM / nu^2. The constant is scale-dependent; the exponent is not. */
const dispersionDelay = (dm, nu, k = 1) => k * dm / (nu * nu);

function dispersionRun(cfg) {
    // v2895 CORRECTION, caught in calibration: the first version of this mode graded blobRadonAt against
    // (32/35) a r -- but blobRadonAt IS that formula, so the error came back exactly 0.0 and proved nothing. The
    // same tell as v2894's Roche mode, one round later. A measurement must not be able to agree with its key by
    // construction. So both observables are now obtained the hard way:
    //
    //   DM     -- Simpson quadrature of the ACTUAL field (blobFieldAt) sampled along the chord, compared to the
    //             analytic chord integral. The quadrature does not know the closed form; its error is real.
    //   nu^-2  -- NOT assumed. The signal is propagated through the plasma at group velocity
    //             v_g = c sqrt(1 - n_e/nu^2), and the excess travel time is integrated numerically at several
    //             frequencies. The exponent -2 EMERGES in the dilute limit rather than being written down, and
    //             it degrades measurably as the plasma thickens -- which makes the validity boundary an
    //             observable too, in the spirit of bornBind.
    const a = cfg.dmAmp, r = cfg.dmRadius;
    const blobs = [{ x: 0, y: 0, z: 0, r, a }];

    // --- DM by quadrature vs the analytic chord integral -----------------------------------------------------
    const N = 2000;                                   // even, for Simpson
    const simpson = (f, lo, hi, n) => {
        const h = (hi - lo) / n;
        let acc = f(lo) + f(hi);
        for (let i = 1; i < n; i++) acc += f(lo + i * h) * (i % 2 ? 4 : 2);
        return acc * h / 3;
    };
    const along = (s) => (t) => blobFieldAt(t, s, 0, blobs);       // ray parallel to x at offset s
    const dmCentral = simpson(along(0), -r, r, N);
    const dmCentralExact = blobRadonAt(0, 0, 0, blobs);            // the analytic chord integral

    // --- offset profile exponent, also from quadrature --------------------------------------------------------
    const xs = [], ys = [];
    for (let i = 1; i <= 12; i++) {
        const b = (i / 16) * r;
        const u = 1 - (b * b) / (r * r);
        const dm = simpson(along(b), -r, r, N);
        if (dm > 0 && u > 0) { xs.push(Math.log(u)); ys.push(Math.log(dm / dmCentral)); }
    }
    const n = xs.length;
    const mx = xs.reduce((p, q) => p + q, 0) / n, my = ys.reduce((p, q) => p + q, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) * (xs[i] - mx); }
    const profileExp = den > 0 ? num / den : NaN;

    // --- the frequency law, PROPAGATED rather than assumed -----------------------------------------------------
    // Cold plasma: v_g = c sqrt(1 - omega_p^2/omega^2); in sim units omega_p^2 = n_e. Excess delay over vacuum is
    // integral of (1/v_g - 1) dl. Dilute limit gives DM/(2 nu^2) -- exponent -2, derived here, not written down.
    const excessDelay = (nu) => simpson((t) => {
        const ne = blobFieldAt(t, 0, 0, blobs);
        const x = ne / (nu * nu);
        if (x >= 1) return NaN;                        // below the plasma frequency the signal does not propagate
        return 1 / Math.sqrt(1 - x) - 1;
    }, -r, r, N);

    const nus = [];
    for (let k = 0; k < 6; k++) nus.push(cfg.nuLo * Math.pow(cfg.nuHi / cfg.nuLo, k / 5));
    const lx = [], ly = [];
    for (const nu of nus) {
        const dt = excessDelay(nu);
        if (Number.isFinite(dt) && dt > 0) { lx.push(Math.log(nu)); ly.push(Math.log(dt)); }
    }
    const m2 = lx.length;
    const lmx = lx.reduce((p, q) => p + q, 0) / m2, lmy = ly.reduce((p, q) => p + q, 0) / m2;
    let n2 = 0, d2 = 0;
    for (let i = 0; i < m2; i++) { n2 += (lx[i] - lmx) * (ly[i] - lmy); d2 += (lx[i] - lmx) * (lx[i] - lmx); }
    const delayExp = d2 > 0 ? n2 / d2 : NaN;

    const tLo = excessDelay(cfg.nuLo), tDouble = excessDelay(2 * cfg.nuLo);

    return {
        dmCentral, dmCentralExact,
        dmErrFrac: Math.abs(dmCentral - dmCentralExact) / dmCentralExact,
        dmProfileExponent: profileExp,
        dmProfileExponentExact: WYVILL_PROFILE_EXPONENT,
        dmProfileErrFrac: Math.abs(profileExp - WYVILL_PROFILE_EXPONENT) / WYVILL_PROFILE_EXPONENT,
        delayExponent: delayExp,
        delayExponentExact: DM_DELAY_EXPONENT,
        delayExponentErrFrac: Math.abs(delayExp - DM_DELAY_EXPONENT) / Math.abs(DM_DELAY_EXPONENT),
        delayRatio: tLo / tDouble,
        delayRatioExact: 4,
        dmSimUnits: dmCentral,
        scaleCommitted: false,
    };
}

// ---------------------------------------------------------------------------------------------------------------
// v2896 -- PLASMA LENSING: THE BLOB AS OPTICS, AND WHY IT DEFOCUSES
//
// A plasma's refractive index is n = sqrt(1 - omega_p^2/omega^2), which is LESS THAN 1 -- the opposite of glass.
// Light speeds up in a density clump and therefore bends AWAY from it, so an overdense blob is a DIVERGING lens.
// Wanting to use a blob to magnify something is the one intuition this device exists to refute, and it refutes it
// with a sign rather than an argument.
//
// The deflection has a closed form for a thin lens: alpha(b) = (1/(2 nu^2)) d(DM)/db, and for a Wyvill blob whose
// column density is (32/35) a r (1 - b^2/r^2)^3.5 that differentiates to
//
//     |alpha(b)| = (32/35) * 3.5 * a * b * (1 - b^2/r^2)^2.5 / (nu^2 r)          directed OUTWARD
//
// MEASURED INDEPENDENTLY, per the house rule: the ray is integrated through the gradient-index medium, picking up
// transverse deflection from the numerically-differenced index field. It never sees the formula above, so its
// disagreement with it is real -- and the sign it reports is a measurement, not an assumption.

function plasmaBendRun(cfg) {
    const a = cfg.dmAmp, r = cfg.dmRadius, nu = cfg.nuLo, b = Math.min(0.95 * r, Math.max(1e-6, cfg.bImpact));
    const blobs = [{ x: 0, y: 0, z: 0, r, a }];

    // n(x,y) = 1 - n_e/(2 nu^2) in the dilute limit. Transverse index gradient by central differences.
    const nIndex = (x, y) => 1 - blobFieldAt(x, y, 0, blobs) / (2 * nu * nu);
    const h = r * 1e-4;
    const dndy = (x, y) => (nIndex(x, y + h) - nIndex(x, y - h)) / (2 * h);

    // Eikonal, paraxial: d(theta)/dx = (1/n) dn/dy. Integrate straight through and accumulate the turn.
    const N = 4000, x0 = -4 * r, x1 = 4 * r, dx = (x1 - x0) / N;
    let theta = 0;
    for (let i = 0; i <= N; i++) {
        const x = x0 + i * dx;
        const w = (i === 0 || i === N) ? 1 : (i % 2 ? 4 : 2);          // Simpson weights
        theta += w * (dndy(x, b) / nIndex(x, b));
    }
    theta *= dx / 3;
    // theta is the accumulated dtheta; a POSITIVE value bends the ray toward +y (outward, since b > 0).
    const bendMeasured = theta;

    const u = 1 - (b * b) / (r * r);
    const bendExact = u > 0 ? (32 / 35) * 3.5 * a * b * Math.pow(u, 2.5) / (nu * nu * r) : 0;

    return {
        bendMeasured,
        bendExact,
        bendErrFrac: bendExact !== 0 ? Math.abs(Math.abs(bendMeasured) - bendExact) / bendExact : null,
        // THE HEADLINE: outward means diverging. A converging lens would bend the ray back toward the axis.
        bendOutward: bendMeasured > 0,
        lensSign: bendMeasured > 0 ? "diverging" : "converging",
        // A diverging lens has a NEGATIVE focal length: the ray appears to come from a virtual focus behind it.
        focalLength: bendMeasured !== 0 ? -b / bendMeasured : Infinity,
        diverging: bendMeasured > 0,
    };
}

export function buildBlob(hyp, base = {}) {
    const h = blobDefaults({ ...hyp, config: { ...(base || {}), ...(hyp && hyp.config) } });
    if (h.mode === "scheme") return { kind: "scheme", ...schemeRun(h.config) };
    if (h.mode === "floor") return { kind: "floor", ...floorRun(h.config) };
    if (h.mode === "dispersion") return { kind: "dispersion", ...dispersionRun(h.config) };
    if (h.mode === "plasmalens") return { kind: "plasmalens", ...plasmaBendRun(h.config) };
    return { kind: "einstein", ...einsteinRun(h.config) };
}

export const blobThermalDevice = {
    // *** v3851 -- KNOB, AND IT IS WORTH SAYING WHY IT IS NOT A READER, BECAUSE ITS SHAPE INVITES THAT. ***
    // axisFactor is the 2 in Einstein-Smoluchowski, and a wrong factor in an MSD *inference* would be a
    // reader plant (v3850 planted exactly that on `thermal`: <r^2> = 4*alpha*t read as 2*alpha*t). HERE IT
    // GOES THE OTHER WAY: axisFactor feeds jitterCentres, where sigma = sqrt(axisFactor*D*dt) is THE STEP
    // SIZE OF THE WALK. The particles genuinely move differently; the measurement of them is untouched.
    // SAME CONSTANT, OPPOSITE SIDE OF THE INSTRUMENT, OPPOSITE KIND.
    plantKind: "knob",
    // *** v3851 -- `plantKind` IS THE TAXONOMY; `planted.knob` BELOW IS THE CONFIG KEY. Two different
    // things wearing one word, and gates read the second by name, so it is NOT renamed here. ***
    // WHAT THE PLANT OVERTURNS, as data so plantedCoverage reads it off the device rather than grepping prose.
    // The floor mode is NOT listed: it is blind to this knob BY DESIGN, and claiming it as coverage would be
    // counting an invariant that never looked.
    planted: { knob: "axisFactor", observable: "dErrFrac",
               note: "sqrt(D*dt) instead of sqrt(2*D*dt) -- walks at half the commanded D; dErrFrac 0.0070 -> 0.5035" },
    // v3192 -- EXPORTED. This device reported as ONE-MODE to the census because its own mode names were
    // not in the probe's candidate list -- the LOWER BOUND, biting for the third time. Derived from
    // this file's own default plus every mode its own build() branches on, each verified to give a
    // DISTINCT answer. *** A MODE NOBODY CAN DISCOVER IS A MODE NOBODY WILL USE. ***
    modes: ["einstein", "scheme", "floor", "dispersion", "plasmalens"],
    name: "blobarium-thermal",
    observables: BLOB_OBSERVABLES,
    build: buildBlob,
    defaults: blobDefaults,
};
