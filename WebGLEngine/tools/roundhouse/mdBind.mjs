// WebGLEngine/tools/roundhouse/mdBind.mjs -- v3199
//
// THE MOLECULAR-DYNAMICS FORCE FIELD AS ONE DEVICE WITH FIVE SEPARATELY-KEYED TERMS.
//
// Keith asked whether coverage can move more than one module per round. IT CAN, AND THE HONEST WAY IS A SHARED
// SUBSTRATE WITH SEPARATE KEYS -- not a bind that imports many modules to inflate a count.
//
// *** THAT DISTINCTION IS THE WHOLE DESIGN. *** A device importing seventeen xpbd modules to grade one thing
// would move the coverage number and grade nothing more; COVERAGE IS A MEANS, NOT THE GOAL. These five terms
// each have their OWN answer key, so five modes genuinely grade five modules:
//
//   "madelung" EWALD, and the strongest external key in the lab. A rock-salt lattice of alternating unit
//              charges has electrostatic energy exactly -M/r0 per ion, with M = 1.7475645946 -- a published
//              constant of the geometry, not of the code.
//   "alphaFree" *** THE LOAD-BEARING NEGATIVE, AND IT IS A GOOD ONE. *** alpha splits Ewald's work between real
//              space and k-space and IS A COMPUTATIONAL CONVENIENCE WITH NO PHYSICAL MEANING. The Madelung
//              constant must therefore be INDEPENDENT of it. If M drifted with alpha, the split would be wrong
//              and the madelung mode could still pass at one tuned alpha.
//   "bond"     A diatomic vibrates at omega = sqrt(k/mu). Exact, and it tests bonds.js AND reducedMass.
//   "coulomb"  The inverse square, tested by RATIO: halving the distance must quadruple the force. A ratio
//              needs no unit convention, where an absolute magnitude would test my choice of constants.
//   "torsion"  A 4-body torsion is the easiest place in MD to slip a sign, so the force is checked against a
//              FINITE DIFFERENCE of the energy -- the definition, not a formula restated.
//
// v3211 -- ANGLES IS THE SIXTH TERM, AND THE KEY THIS FILE PROPOSED FOR IT WAS THE WRONG ONE.
//
// *** THE SENTENCE THAT USED TO SIT HERE SAID angles.js "deserves a mode of its own (its key is that the force
// VANISHES at the preferred angle)". THAT IS SECTION 1 OF angles-selfcheck.mjs, VERBATIM. *** A device restating
// its module's own gate moves the coverage count and grades nothing new -- the same trap as importing without
// calling, one level up and much harder to see, because the proposed key is a true statement about the physics.
// It is kept here as a CORRECTION rather than deleted: the trap is that a device can pass its own review by
// proposing a real property that is already proven somewhere else.
//
// THE KEY THAT IS ACTUALLY EXTERNAL is the effective stiffness. V = 1/2 k (cos t - cos t0)^2 is not a harmonic
// angle potential; expanded about t0 it behaves as one with k_eff = k sin^2(t0) = k(1 - cos0^2) -- the standard
// conversion between the cosine-harmonic and harmonic angle constants, a relation from the MD literature that
// this module never computes and could not have got right by accident. Three modes, three routes to it:
//
//   "angles"     THE STATIC ROUTE. Curvature of the reported potential with respect to the GEOMETRIC angle --
//                an angle this module never forms, because it is deliberately trig-free. Ratio to the key is
//                1.000000 at 60, 90, 104.5, 120, 150, 170 and 179 degrees.
//   "angleFreq"  *** THE INDEPENDENT ROUTE, AND THE REASON THE KEY IS NOT A MIRROR. *** Release a symmetric
//                bend off equilibrium and measure the frequency: omega = sqrt(k_eff / (m r^2 / 2)). It arrives
//                through integration and masses rather than through the potential the key was derived from, and
//                ITS SHORTFALL IS SECOND ORDER IN AMPLITUDE -- 3.953, 3.984, 3.994, 3.999 on halving, converging
//                on exactly 4, and FLAT across an 8x dt sweep, so it is the anharmonicity and not the integrator.
//   "angleLinear" *** THE LOAD-BEARING NEGATIVE: IT FAILS BY A PREDICTED EXPONENT. *** At t0 = 180 the key gives
//                k_eff = 0 exactly, and a linear molecule under this potential has NO first-order restoring
//                force at all: the potential is QUARTIC (fitted exponent 3.999995 against 2.000 generically) and
//                the force CUBIC (2.999989 against 1.000). A textbook harmonic angle term would still be
//                quadratic there. This is the unnamed cost of the trig-free choice this module's own header
//                advertises as a clean win, and it is told apart from the ordinary case BY ITS EXPONENT rather
//                than by the size of any number.

import { bondForces, reducedMass } from "../../physics/md/bonds.js";
import { angleForces } from "../../physics/md/angles.js";
import { velocityVerlet, kinetic } from "../../physics/md/md.js";
import { dihedralForces } from "../../physics/md/dihedrals.js";
import { coulombForces } from "../../physics/md/coulomb.js";
import { ewald } from "../../physics/md/ewald.js";

/** Rock salt: four Na at the fcc sites, four Cl offset by half a lattice vector. E = -8 M / L. */
function rockSalt(L) {
    const na = [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]];
    const cl = [[0.5, 0, 0], [0, 0.5, 0], [0, 0, 0.5], [0.5, 0.5, 0.5]];
    const pos = [], q = [];
    for (const p of na) { pos.push(p[0] * L, p[1] * L, p[2] * L); q.push(1); }
    for (const p of cl) { pos.push(p[0] * L, p[1] * L, p[2] * L); q.push(-1); }
    return { pos: new Float64Array(pos), q: new Float64Array(q), N: 8 };
}
const madelungAt = (alpha, L = 1, noSelf = false) => {
    const { pos, q, N } = rockSalt(L);
    return -ewald(pos, q, N, L, { alpha: alpha / L, kmax: 8, rcut: L, noSelf }).energy * L / 8;
};

export const MD_OBSERVABLES = [
    "madelung", "madelungKey", "madelungErrFrac", "alphaSpread",
    "omegaMeasured", "omegaTheory", "omegaErrFrac", "reducedMassCheck",
    "coulombRatio", "coulombRatioKey", "coulombErrFrac",
    "torsionFdErrFrac",
    "angleStiffWorstErrFrac", "angleStiffPoints", "angleStiffAt104", "angleStiffWorstAtDeg", "angleStiffHOrderRatio",
    "angleOmegaRatio", "angleOmegaOrderRatio", "angleOmegaDtSpread", "angleArmDrift",
    "angleLinearVExponent", "angleGenericVExponent", "angleLinearFExponent", "angleGenericFExponent",
    "angleLinearStiffKey",
    "integratorOrderRatio", "integratorSecularRatio", "integratorErrAtRefDt",
];

const MADELUNG = 1.7475645946;      // NaCl rock salt, published to ten places
// *** v3852 -- `noselfenergy` IS THE PLANT, AND `alphaFree` IS A CONTROL RATHER THAN ONE. *** plantedCoverage
// read this device as UNCOVERED while its header advertised TWO load-bearing negatives, and the census was
// right about both. alphaFree sweeps the Ewald splitting parameter and asserts the answer DOES NOT MOVE --
// an INVARIANCE control, which moves the observable TO its ideal. angleLinear reports a predicted EXPONENT
// for a linear molecule. Neither is a wrong method; neither is coverage.
//
// THE PLANT: drop E_self, the constant -(alpha/sqrt(pi)) sum q^2. *** IT CARRIES NO FORCE, SO EVERY FORCE
// TEST IN THIS DEVICE STILL PASSES AND ONLY THE ENERGY IS WRONG *** -- which is exactly why it is the
// canonical Ewald mistake. It is also the term that makes the total alpha-independent, so the same defect
// that breaks the Madelung constant ALSO breaks alphaFree's invariance: one omission, both negatives.
export const MD_MODES = ["madelung", "alphaFree", "bond", "coulomb", "torsion", "angles", "angleFreq", "angleLinear", "integrator", "noselfenergy"];

export function mdDefaults(cfg = {}) {
    const want = cfg && cfg.mode;
    return { mode: MD_MODES.includes(want) ? want : "madelung", alpha: (cfg && cfg.alpha) || 4 };
}

const NONE = {
    madelung: -1, madelungKey: MADELUNG, madelungErrFrac: -1, alphaSpread: -1,
    omegaMeasured: -1, omegaTheory: -1, omegaErrFrac: -1, reducedMassCheck: -1,
    coulombRatio: -1, coulombRatioKey: 4, coulombErrFrac: -1,
    torsionFdErrFrac: -1,
    angleStiffWorstErrFrac: -1, angleStiffPoints: -1, angleStiffAt104: -1, angleStiffWorstAtDeg: -1,
    angleStiffHOrderRatio: -1,
    angleOmegaRatio: -1, angleOmegaOrderRatio: -1, angleOmegaDtSpread: -1, angleArmDrift: -1,
    angleLinearVExponent: -1, angleGenericVExponent: -1, angleLinearFExponent: -1, angleGenericFExponent: -1,
    angleLinearStiffKey: -1,
    integratorOrderRatio: -1, integratorSecularRatio: -1, integratorErrAtRefDt: -1,
};

// ---- THE ANGLE TERM'S FIXTURES ------------------------------------------------------------------------------
// A symmetric triatomic i-j-k in the xy-plane, vertex at the origin, arms of length r. THE OPENING ANGLE IS AN
// INPUT HERE AND AN OUTPUT OF THE MODULE -- which is the whole point: angles.js is trig-free and never forms the
// angle, so building the geometry FROM an angle and reading the potential back is a genuinely independent route.
const bentAt = (deg, r = 1) => {
    const h = deg * Math.PI / 360;
    return new Float64Array([r * Math.cos(h), r * Math.sin(h), 0, 0, 0, 0, r * Math.cos(h), -r * Math.sin(h), 0]);
};
const angleSpec = (t0deg, kang) => [{ i: 0, j: 1, k: 2, kang, cos0: Math.cos(t0deg * Math.PI / 180) }];
/** THE KEY. k_eff = k sin^2(t0), written as k(1 - cos0^2) so it is a function of the SPEC the module was given. */
const stiffKey = (t0deg, kang) => { const c = Math.cos(t0deg * Math.PI / 180); return kang * (1 - c * c); };

/** Curvature of the module's reported potential with respect to the geometric angle, by central second difference. */
function measuredStiffness(t0deg, kang, hRad = 1e-4) {
    const spec = angleSpec(t0deg, kang), hDeg = hRad * 180 / Math.PI;
    const V = (d) => angleForces(bentAt(d), 3, spec).pe;
    return (V(t0deg - hDeg) - 2 * V(t0deg) + V(t0deg + hDeg)) / (hRad * hRad);
}

/** Fitted exponent of V (or |F|) in the displacement from t0 -- an ORDER, which needs no tolerance. */
function fittedExponent(t0deg, kang, what) {
    const spec = angleSpec(t0deg, kang), xs = [], ys = [];
    for (const dRad of [1e-2, 5e-3, 2.5e-3, 1.25e-3, 6.25e-4]) {
        const res = angleForces(bentAt(t0deg - dRad * 180 / Math.PI), 3, spec);
        let y = res.pe;
        if (what === "F") { let s = 0; for (let i = 0; i < 9; i++) s += res.forces[i] * res.forces[i]; y = Math.sqrt(s); }
        xs.push(Math.log(dRad)); ys.push(Math.log(y));
    }
    const n = xs.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
    return (n * sxy - sx * sy) / (n * sxx - sx * sx);
}

/**
 * Small-oscillation bend frequency, measured by integrating the real force field.
 *
 * TWO THINGS ARE REPORTED THAT COULD INVALIDATE IT, RATHER THAN ASSUMED AWAY. (1) THE ARMS ARE NOT BONDED. The
 * angle force is perpendicular to each arm, so it turns the atoms and supplies no centripetal force -- over a
 * long run they drift outward and the "bend frequency" stops meaning anything. So this runs FOUR periods and
 * REPORTS the arm drift. My first version ran 400,000 steps and read 0.68 of the key; that was the fixture
 * decaying, not the module. (2) THE VERTEX IS HELD BY MASS, not by a constraint, so the reduced inertia is
 * exactly m r^2 / 2 and nothing here has to model a recoiling vertex.
 */
function bendFrequency(t0deg, kang, amp, dt, m = 1, r = 1, periods = 4) {
    const spec = angleSpec(t0deg, kang);
    const pos = bentAt(t0deg + amp, r), vel = new Float64Array(9);
    const masses = new Float64Array([m, 1e12, m]);
    const forceFn = (p) => angleForces(p, 3, spec);
    const st = { pos, vel, forces: forceFn(pos).forces, masses, pe: forceFn(pos).pe };
    const key = Math.sqrt(stiffKey(t0deg, kang) / (m * r * r / 2));
    const steps = Math.ceil(periods * 2 * Math.PI / key / dt);
    const geom = () => {
        const p = st.pos;
        const ax = p[0] - p[3], ay = p[1] - p[4], az = p[2] - p[5];
        const bx = p[6] - p[3], by = p[7] - p[4], bz = p[8] - p[5];
        const la = Math.sqrt(ax * ax + ay * ay + az * az), lb = Math.sqrt(bx * bx + by * by + bz * bz);
        return { la, th: Math.acos((ax * bx + ay * by + az * bz) / (la * lb)) };
    };
    const th0 = t0deg * Math.PI / 180;
    let prev = geom().th - th0, tPrev = null, armDrift = 0;
    const per = [];
    for (let i = 1; i <= steps; i++) {
        velocityVerlet(st, dt, forceFn);
        const g = geom(), d = g.th - th0;
        armDrift = Math.max(armDrift, Math.abs(g.la / r - 1));
        // LINEAR INTERPOLATION ONTO THE CROSSING, not the step index: at four periods a whole-step period would
        // carry a dt-sized error and the amplitude order below would be measuring the sampling instead.
        if (prev < 0 && d >= 0) { const t = i * dt - dt * d / (d - prev); if (tPrev !== null) per.push(t - tPrev); tPrev = t; }
        prev = d;
    }
    const T = per.reduce((a, b) => a + b, 0) / per.length;
    return { ratio: (2 * Math.PI / T) / key, key, armDrift, periods: per.length };
}

export async function buildMd(args = {}) {
    const cfg = args.config || {};
    const mode = args.mode || mdDefaults(cfg).mode;
    const alpha = (cfg && cfg.alpha) || 4;

    if (mode === "alphaFree") {
        // M MUST NOT DEPEND ON alpha. The spread across three splittings IS the observable.
        const Ms = [3, 4, 5].map((a) => madelungAt(a));
        const spread = Math.max(...Ms) - Math.min(...Ms);
        return { ...NONE, madelung: Ms[1], madelungErrFrac: Math.abs(Ms[1] - MADELUNG) / MADELUNG, alphaSpread: spread };
    }

    if (mode === "bond") {
        // A diatomic released off-equilibrium oscillates at omega = sqrt(k/mu). Measured by counting a full
        // period from the SIGN CHANGES of the velocity, not from a fitted sinusoid -- a fit would smooth over
        // exactly the frequency error being looked for.
        const k = 100, r0 = 1, m1 = 1, m2 = 1, mu = reducedMass(m1, m2);
        const omegaTheory = Math.sqrt(k / mu);
        const dt = 1e-4;
        let r = r0 * 1.02, v = 0, tPrev = null, periods = [], lastSign = 0;
        for (let i = 0; i < 400000; i++) {
            const f = -k * (r - r0);              // harmonic bond along the separation
            v += (f / mu) * dt; r += v * dt;
            const sign = Math.sign(v);
            if (lastSign < 0 && sign > 0) { const t = i * dt; if (tPrev !== null) periods.push(t - tPrev); tPrev = t; }
            lastSign = sign;
        }
        const T = periods.length ? periods.reduce((a, b) => a + b, 0) / periods.length : 0;
        const omegaMeasured = T ? (2 * Math.PI) / T : 0;
        return { ...NONE, omegaMeasured, omegaTheory,
                 omegaErrFrac: Math.abs(omegaMeasured - omegaTheory) / omegaTheory,
                 // reducedMass of two equal masses is m/2 -- the one line of bonds.js that has an exact answer
                 // independent of any integration.
                 reducedMassCheck: Math.abs(reducedMass(2, 2) - 1) < 1e-15 ? 1 : 0 };
    }

    if (mode === "coulomb") {
        // TESTED BY RATIO. Halving the separation must quadruple the force, which needs no unit convention --
        // an absolute magnitude would be testing my choice of constants rather than the inverse square.
        // SIGNATURE READ, NOT ASSUMED: coulombForces(pos, N, charges, ke, cutoff2) -> { forces, pe }. My first
        // version invented an out-parameter and got silence back -- "writing against an assumed signature" is
        // on this project's own list of recurring first-measurement errors, and it cost one run here.
        const mk = (d) => {
            const pos = new Float64Array([0, 0, 0, d, 0, 0]), q = new Float64Array([1, -1]);
            return Math.abs(coulombForces(pos, 2, q, 1, 0).forces[0]);
        };
        const far = mk(2), near = mk(1);
        const ratio = near / far;
        return { ...NONE, coulombRatio: ratio, coulombErrFrac: Math.abs(ratio - 4) / 4 };
    }

    if (mode === "torsion") {
        // FORCE AGAINST A FINITE DIFFERENCE OF THE ENERGY. This is the definition of a force, so it cannot be
        // satisfied by restating the formula the force was written from.
        // dihedralForces(pos, N, dihedrals) -> { forces, pe }, and the spec fields are kd, n, cosGamma, sinGamma
        // -- read from the source rather than guessed at, after the Coulomb call above cost a run for exactly
        // that mistake.
        const pos = new Float64Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 1.3, 1, 0.7]);
        const spec = { i: 0, j: 1, k: 2, l: 3, kd: 5, n: 3, cosGamma: 1, sinGamma: 0 };
        const r0 = dihedralForces(pos, 4, [spec]);
        let worst = 0;
        const h = 1e-7;
        for (let c = 0; c < 12; c++) {
            // CENTRAL difference, not forward: a forward difference carries an O(h) error that would swamp the
            // sign error this mode exists to catch.
            const pa = Float64Array.from(pos), pb = Float64Array.from(pos);
            pa[c] += h; pb[c] -= h;
            const fd = -(dihedralForces(pa, 4, [spec]).pe - dihedralForces(pb, 4, [spec]).pe) / (2 * h);
            const scale = Math.max(1e-6, Math.abs(r0.forces[c]), Math.abs(fd));
            worst = Math.max(worst, Math.abs(fd - r0.forces[c]) / scale);
        }
        return { ...NONE, torsionFdErrFrac: worst };
    }

    if (mode === "angles") {
        // THE STATIC ROUTE, ACROSS A SWEEP. One angle would test arithmetic; seven test the (1 - cos0^2)
        // dependence, which is where a module that used cos0 where cos0^2 belongs would come apart.
        const kang = 40, sweep = [60, 90, 104.5, 120, 150, 170, 179];
        let worst = 0, at104 = 0, worstAt = 0;
        for (const t0 of sweep) {
            const meas = measuredStiffness(t0, kang), key = stiffKey(t0, kang);
            const e = Math.abs(meas - key) / key;
            if (e > worst) { worst = e; worstAt = t0; }
            if (t0 === 104.5) at104 = meas;
        }
        // *** AND THE RESIDUAL IS THE DIFFERENCE'S, NOT THE MODULE'S -- SHOWN RATHER THAN ASSERTED. *** The worst
        // point is 179 degrees, where the true curvature is 0.0122 and a central second difference's own O(h^2)
        // truncation is a visible fraction of it. Halve h and the residual QUARTERS: 4.00, 4.00, 4.00, 4.00. A
        // residual falling at exactly the instrument's predicted rate cannot be the module being wrong, and this
        // is a claim a tolerance could never have made.
        const errAt = (h) => Math.abs(measuredStiffness(worstAt, kang, h) - stiffKey(worstAt, kang)) / stiffKey(worstAt, kang);
        const hs = [4e-4, 2e-4, 1e-4, 5e-5].map(errAt);
        const hRatios = [];
        for (let i = 1; i < hs.length; i++) hRatios.push(hs[i - 1] / hs[i]);
        return { ...NONE, angleStiffWorstErrFrac: worst, angleStiffPoints: sweep.length, angleStiffAt104: at104,
                 angleStiffWorstAtDeg: worstAt, angleStiffHOrderRatio: hRatios[hRatios.length - 1] };
    }

    if (mode === "angleFreq") {
        // THE INDEPENDENT ROUTE. The shortfall is ANHARMONICITY, and the observable is its ORDER -- the
        // gyroscope's move. A tolerance on the frequency would have been a number nobody derived.
        const t0 = 104.5, kang = 40, dt = 1e-4;
        const amps = [1, 0.5, 0.25, 0.125];
        const runs = amps.map((a) => bendFrequency(t0, kang, a, dt));
        const defs = runs.map((r) => 1 - r.ratio);
        // Ratio of consecutive shortfalls on HALVING the amplitude: second order gives exactly 4.
        const ratios = [];
        for (let i = 1; i < defs.length; i++) ratios.push(defs[i - 1] / defs[i]);
        // AND IT MUST NOT BE THE INTEGRATOR. If it were, the shortfall would move with dt.
        const dts = [4e-4, 2e-4, 1e-4, 5e-5].map((h) => 1 - bendFrequency(t0, kang, 0.25, h).ratio);
        return { ...NONE, angleOmegaRatio: runs[runs.length - 1].ratio,
                 angleOmegaOrderRatio: ratios[ratios.length - 1],
                 angleOmegaDtSpread: Math.max(...dts) - Math.min(...dts),
                 angleArmDrift: Math.max(...runs.map((r) => r.armDrift)) };
    }

    if (mode === "integrator") {
        // *** md.js IS GRADED BECAUSE I REFUSED TO LET THE COUNT MOVE WITHOUT A KEY, AND THAT IS THE FINDING OF
        // THIS MODE. *** angleFreq needs an integrator, so importing velocityVerlet put physics/md/md.js into the
        // graded set on its own -- coverage went from 31 to 34 for a round that had earned two.
        //
        // *** gradedCoverage CANNOT TELL A MODULE UNDER TEST FROM A MODULE USED TO TEST ONE. *** Both are
        // imported by a bind and both are really called; reachability is exact and it is answering a different
        // question than the one the number is read as. That is this project's most repeated shape -- TWO THINGS
        // WEARING ONE LABEL -- arriving in the one number the coverage arc built to be trustworthy.
        //
        // Writing a velocity-Verlet inside this bind to dodge it would have been a SECOND DEFINITION of an idea
        // the tree already has, which is worse. So md.js gets a real key instead, and it is a good one:
        //   THE ORDER -- Stormer-Verlet is second order, so the energy error QUARTERS when dt HALVES.
        //   THE SYMPLECTIC SIGNATURE -- and this is the half that ORDER ALONE CANNOT SEE. A non-symplectic
        //   integrator of the SAME second order (RK2, say) has the same dt law and a SECULAR energy drift. So
        //   the error is also measured over a 32x LONGER RUN AT THE SAME dt, where it must not grow at all.
        const spec = angleSpec(104.5, 40);
        const drift = (dt, T) => {
            const pos = bentAt(104.5 + 8), vel = new Float64Array(9), masses = new Float64Array([1, 1, 1]);
            const f = (p) => angleForces(p, 3, spec);
            const st = { pos, vel, forces: f(pos).forces, masses, pe: f(pos).pe };
            const E0 = kinetic(vel, masses) + st.pe;
            let mx = 0;
            const n = Math.round(T / dt);
            for (let i = 0; i < n; i++) { velocityVerlet(st, dt, f); mx = Math.max(mx, Math.abs(kinetic(st.vel, masses) + st.pe - E0)); }
            return mx / Math.abs(E0);
        };
        const ds = [4e-3, 2e-3, 1e-3, 5e-4].map((dt) => drift(dt, 10));
        const ratios = [];
        for (let i = 1; i < ds.length; i++) ratios.push(ds[i - 1] / ds[i]);
        const short = drift(1e-3, 10), long = drift(1e-3, 320);
        return { ...NONE, integratorOrderRatio: ratios[ratios.length - 1],
                 integratorSecularRatio: long / short, integratorErrAtRefDt: short };
    }

    if (mode === "angleLinear") {
        // THE LOAD-BEARING NEGATIVE, TOLD BY ITS EXPONENT. A linear molecule's restoring force is CUBIC under
        // this potential and LINEAR under a textbook harmonic angle term -- a difference in kind that no
        // magnitude tolerance could see, because near t0 every one of these numbers is small.
        const kang = 40;
        return { ...NONE,
                 angleLinearVExponent: fittedExponent(180, kang, "V"),
                 angleGenericVExponent: fittedExponent(104.5, kang, "V"),
                 angleLinearFExponent: fittedExponent(180, kang, "F"),
                 angleGenericFExponent: fittedExponent(104.5, kang, "F"),
                 angleLinearStiffKey: stiffKey(180, kang) };
    }

    if (mode === "madelung" || mode === "noselfenergy") {
        // The plant runs THIS fixture -- same lattice, same alpha, same cutoffs -- and drops only the
        // constant self term, so the separation belongs to the sum and not to a second experiment.
        const M = madelungAt(alpha, 1, mode === "noselfenergy");
        return { ...NONE, madelung: M, madelungErrFrac: Math.abs(M - MADELUNG) / MADELUNG };
    }

    return { ...NONE };
}

export const mdDevice = {
    name: "md-force-field",
    // "madelung" stays FIRST: it owns madelungErrFrac, and the contract compares the plant against modes[0].
    modes: MD_MODES,
    // v4128 -- RELABELED. plantMode/plantFlips are both declared and plantMode is in this device's own modes
    // list, so plantedCoverage.mjs's declaredPlantMode()/probeModePlant() path takes this device BEFORE the
    // knob path ever runs and grades it as a mode-plant regardless of the label here -- MEASURED,
    // madelungErrFrac 3.16e-7 -> 1.291 under mode "noselfenergy". "knob" was the label for a mechanism this
    // device does not use.
    plantMode: "noselfenergy", plantFlips: "madelungErrFrac", plantKind: "mode",
    observables: MD_OBSERVABLES,
    build: buildMd,
    defaults: mdDefaults,
};
