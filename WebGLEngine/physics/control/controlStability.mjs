// WebGLEngine/physics/control/controlStability.mjs -- v3572
// ---------------------------------------------------------------------------------------------------------------
// TWO INDEPENDENT ROUTES TO ONE INTEGER: HOW MANY ROOTS OF A POLYNOMIAL LIE IN THE RIGHT HALF-PLANE.
//
// Routh--Hurwitz answers it WITHOUT FINDING A SINGLE ROOT -- it builds a table of ratios from the coefficients and
// counts SIGN CHANGES DOWN THE FIRST COLUMN. A root-finder answers it by locating every root and looking at the
// real parts. The two share no line of code and no idea, and they must return THE SAME INTEGER. *** AN INTEGER
// AGREEMENT IS THE SHARPEST SHAPE THIS LAB HAS: there is no tolerance to argue about and no magnitude for a
// compensating error to hide in. ***
//
// THE SECOND ROUTE HAD TO BE WRITTEN, WHICH IS WHY IT IS INDEPENDENT RATHER THAN CONVENIENT. The tree's only
// eigenvalue routine is symEigenvalues in physics/quantum/rmt.js, and its own header says SYMMETRIC: Householder
// tridiagonalisation then implicit-shift QL, which is valid only for a symmetric matrix. A COMPANION MATRIX IS
// NOT SYMMETRIC. Reusing it would have returned confident nonsense, so the root-finder here is Durand--Kerner,
// new code -- and new code needs its own key, which is Vieta: reconstruct the coefficients FROM the roots and
// they must come back. A root-finder graded only against the thing it was used to check is a mirror.
//
// ================================================================================================================
// WHY THIS IS NOT A TOY: THE WELD JOINT IS A SECOND-ORDER PLANT, IN THE ENGINE, WITH A CLOSED FORM
// ================================================================================================================
//
// v3567 looked for somewhere in this tree that Routh--Hurwitz could honestly grade and reported that the Endless
// Sky autopilot was the wrong answer -- combat.js:23-32 is a three-valued RELAY WITH A DEADBAND feeding a
// saturating plant, and Routh--Hurwitz grades the characteristic polynomial of a LINEAR system. That reading
// stands. *** THE RIGHT ANSWER WAS IN box3d ALL ALONG: swk_joint_weld TAKES hertz AND damping, WHICH IS A
// SPRING-DAMPER, WHICH IS s^2 + 2*zeta*omega*s + omega^2 WITH omega = 2*pi*hertz. *** A real LTI plant, shipped,
// whose stability question Routh--Hurwitz answers and whose behaviour the wasm exhibits. Three routes to one
// verdict rather than two: the Routh table, the root-finder, and 970 KB of clang-built solver.
//
// ================================================================================================================
// AND THE TWO PLACES WHERE CONTROL THEORY GRADES SHIPPED CODE THAT IS NOT LINEAR
// ================================================================================================================
//
// (1) THE ES RELAY'S DEADBAND ORDERING, WHICH IS AN INTEGER INVARIANT WITH NO TOLERANCE AT ALL. stepAI returns
// three decisions gated on three constants typed independently in one return statement: turn outside +-4 degrees,
// fire inside 12, thrust inside 35. THE ORDERING 4 < 12 < 35 IS LOAD-BEARING AND NOTHING IN THE TREE CHECKS IT.
// If the turn deadband ever exceeds the firing cone, a settled ship sits permanently unable to fire -- it aims
// perfectly and never shoots -- and every existing test would pass.
//
// (2) THE RELAY CHATTER PREDICATE, WHICH IS ALSO EXACT. Heading is a pure integrator driven by a relay, so a tick
// moves it turnRate*dt. The null zone is 8 degrees wide. If turnRate*dt >= 8 the controller steps clean across
// from one side to the other and CAN NEVER SETTLE. Against the shipped classes at TURN_SCALE 3 this is not a
// defect and the useful output is the margin, derived rather than guessed -- the shape the entropy round ended
// up in.
//
// ================================================================================================================
// THE PART EVERY NAIVE ROUTH IMPLEMENTATION GETS WRONG, AND IT IS WHERE THE INTERESTING POLYNOMIALS LIVE
// ================================================================================================================
//
// The table divides by the first element of the row above. TWO SINGULAR CASES BREAK IT AND BOTH ARE PHYSICAL:
//   A ZERO IN THE FIRST COLUMN with a nonzero row -- handled by an infinitesimal, and the sign of what follows
//   depends on the limit rather than on the zero.
//   A WHOLE ROW OF ZEROS -- which happens EXACTLY WHEN THERE ARE ROOTS SYMMETRIC ABOUT THE ORIGIN, and for a
//   physical plant that means A CONJUGATE PAIR ON THE IMAGINARY AXIS: an undamped oscillator, the marginal case,
//   the one a stability test exists to find. It is handled by differentiating the auxiliary polynomial.
// *** A ROUTH THAT DIVIDES BY ZERO ON THE MARGINAL CASE IS BROKEN PRECISELY WHERE IT MATTERS MOST, and an
// implementation that never met one would look perfect. ***
"use strict";
import { pathToFileURL } from "node:url";

// =================================================================================================================
// ROUTE 1 -- THE ROUTH TABLE. NO ROOT IS EVER COMPUTED.
// =================================================================================================================
/**
 * Coefficients HIGHEST POWER FIRST: [a_n, ..., a_0].
 * Returns { rhp, marginal, rows, note } where `rhp` is the number of right-half-plane roots.
 */
export function routhHurwitz(coeffs, { eps = 1e-30 } = {}) {
    const a = coeffs.slice();
    while (a.length && a[0] === 0) a.shift();          // leading zeros are not part of the polynomial
    const n = a.length - 1;
    if (n < 1) return { rhp: 0, marginal: false, rows: [], note: "degree < 1" };

    const width = Math.floor(n / 2) + 1;
    const rows = [];
    rows.push(Array.from({ length: width }, (_, i) => a[2 * i] ?? 0));
    rows.push(Array.from({ length: width }, (_, i) => a[2 * i + 1] ?? 0));

    let marginal = false, note = "";
    for (let r = 2; r <= n; r++) {
        const up = rows[r - 2], cur = rows[r - 1];
        // A WHOLE ROW OF ZEROS: roots symmetric about the origin. Replace it with the derivative of the auxiliary
        // polynomial formed from the row above. This is the marginal case and it is the one that matters.
        if (cur.every((v) => Math.abs(v) < eps)) {
            marginal = true;
            note = "row of zeros at r=" + (r - 1) + " -- roots symmetric about the origin (imaginary-axis pair)";
            const order = n - (r - 2);
            for (let i = 0; i < width; i++) cur[i] = up[i] * (order - 2 * i);
        }
        // A LONE ZERO IN THE FIRST COLUMN: substitute an infinitesimal. The SIGN of the rows below depends on the
        // limit, not on the zero, so the epsilon has to be small AND positive rather than merely nonzero.
        if (Math.abs(cur[0]) < eps) { cur[0] = eps; if (!note) note = "first-column zero at r=" + (r - 1); }
        const next = new Array(width).fill(0);
        for (let i = 0; i + 1 < width; i++) next[i] = (cur[0] * (up[i + 1] ?? 0) - up[0] * (cur[i + 1] ?? 0)) / cur[0];
        rows.push(next);
    }

    // The count of RHP roots is the number of SIGN CHANGES down the first column.
    //
    // *** AND A ZERO IS NOT A SIGN. *** The first version counted Math.sign(col[i]) !== Math.sign(col[i-1]),
    // which makes a ZERO ENTRY read as a sign change against anything positive, because Math.sign(0) is 0. It
    // survived 4200 randomised polynomials and failed on the FIRST physically interesting case it met: the
    // discrete oscillatory boundary z = -1 transforms to the polynomial 2w, whose single root sits AT the
    // origin, and the table reported one RHP root where the truth is zero-and-marginal. A ZERO IN THE FIRST
    // COLUMN MEANS A ROOT ON THE AXIS, WHICH IS NEITHER LEFT NOR RIGHT -- so the zeros are dropped and their
    // presence is reported as `marginal` instead. Random coefficients essentially never produce an exact zero;
    // THE CASES THAT DO ARE THE ONES A STABILITY TEST EXISTS TO FIND, which is why the sweep could not catch it.
    let rhp = 0, sawZero = false;
    const col = rows.slice(0, n + 1).map((r) => r[0]);
    const nz = [];
    for (const v of col) { if (Math.abs(v) <= eps) sawZero = true; else nz.push(v); }
    for (let i = 1; i < nz.length; i++) if (Math.sign(nz[i]) !== Math.sign(nz[i - 1])) rhp++;
    if (sawZero) marginal = true;
    return { rhp, marginal, rows, firstColumn: col, note };
}

// =================================================================================================================
// ROUTE 2 -- DURAND-KERNER. EVERY ROOT, THEN LOOK AT THE REAL PARTS.
// =================================================================================================================
const cAdd = (x, y) => [x[0] + y[0], x[1] + y[1]];
const cSub = (x, y) => [x[0] - y[0], x[1] - y[1]];
const cMul = (x, y) => [x[0] * y[0] - x[1] * y[1], x[0] * y[1] + x[1] * y[0]];
const cDiv = (x, y) => { const d = y[0] * y[0] + y[1] * y[1];
    return [(x[0] * y[0] + x[1] * y[1]) / d, (x[1] * y[0] - x[0] * y[1]) / d]; };
const cAbs = (x) => Math.hypot(x[0], x[1]);

/** Horner in the complex plane. */
export function polyEval(coeffs, z) {
    let acc = [0, 0];
    for (const c of coeffs) acc = cAdd(cMul(acc, z), [c, 0]);
    return acc;
}

/**
 * All n roots by simultaneous iteration. The start points are on a spiral of irrational angle so no two ever
 * coincide -- identical starts make the update divide by zero, which is the classic way this method fails.
 */
export function durandKerner(coeffs, { iters = 500, tol = 1e-14 } = {}) {
    const a = coeffs.slice();
    while (a.length && a[0] === 0) a.shift();
    const n = a.length - 1;
    if (n < 1) return [];
    const monic = a.map((c) => c / a[0]);
    let z = Array.from({ length: n }, (_, k) => {
        const ang = 0.4 + 2 * Math.PI * k / n;
        return [0.4 + Math.cos(ang), Math.sin(ang)];
    });
    for (let it = 0; it < iters; it++) {
        let moved = 0;
        for (let i = 0; i < n; i++) {
            let den = [1, 0];
            for (let j = 0; j < n; j++) if (j !== i) den = cMul(den, cSub(z[i], z[j]));
            const step = cDiv(polyEval(monic, z[i]), den);
            z[i] = cSub(z[i], step);
            moved = Math.max(moved, cAbs(step));
        }
        if (moved < tol) break;
    }
    return z;
}

/** The same integer, by the other road. A root exactly on the axis is NEITHER left nor right and is counted apart. */
export function rhpCountNumeric(coeffs, { axisTol = 1e-8, ...opts } = {}) {
    const roots = durandKerner(coeffs, opts);
    let rhp = 0, axis = 0;
    for (const r of roots) {
        if (Math.abs(r[0]) <= axisTol) axis++;
        else if (r[0] > 0) rhp++;
    }
    return { rhp, axis, roots };
}

/**
 * VIETA -- THE ROOT-FINDER'S OWN KEY, and it must not be the polynomial it was asked about.
 * Rebuild the coefficients by multiplying (z - r) over every root; they must return the input.
 */
export function vietaResidual(coeffs, roots) {
    let poly = [[1, 0]];
    for (const r of roots) {
        const next = new Array(poly.length + 1).fill(null).map(() => [0, 0]);
        for (let i = 0; i < poly.length; i++) {
            next[i] = cAdd(next[i], poly[i]);
            next[i + 1] = cSub(next[i + 1], cMul(poly[i], r));
        }
        poly = next;
    }
    const lead = coeffs[0];
    let worst = 0;
    for (let i = 0; i < coeffs.length; i++) {
        const want = coeffs[i] / lead;
        worst = Math.max(worst, Math.abs(poly[i][0] - want), Math.abs(poly[i][1]));
    }
    return worst;
}

// =================================================================================================================
// THE DISCRETE COUSIN -- JURY, FOR THE LEARNER THAT IS ACTUALLY IN THE TREE
// =================================================================================================================
/**
 * brain/linearPolicy.js updates by `w[i] += lr * reward * d`, a discrete-time linear recursion, and whether the
 * weight vector converges or oscillates is an EIGENVALUES-INSIDE-THE-UNIT-CIRCLE question rather than a
 * left-half-plane one. For the scalar recursion w <- (1 - lr*g) w the closed form is exact: stable iff
 * 0 < lr*g < 2, and OSCILLATORY-BUT-CONVERGENT for 1 < lr*g < 2, which is the regime that looks like a bug.
 */
export function scalarUpdateStability(lr, gain) {
    const rho = Math.abs(1 - lr * gain);
    return { rho, stable: rho < 1, oscillatory: 1 - lr * gain < 0, critical: 2 / gain };
}

/** Roots inside the unit circle, via the same two routes mapped through the bilinear transform w = (s+1)/(s-1). */
export function insideUnitCircle(coeffs) {
    const n = coeffs.length - 1;
    // z = (1+w)/(1-w) maps the unit disc to the left half-plane, so a Routh count on the transformed polynomial
    // counts roots OUTSIDE the disc. Built by binomial expansion rather than by evaluating anywhere.
    const out = new Array(n + 1).fill(0);
    for (let k = 0; k <= n; k++) {
        const c = coeffs[k], p = n - k;                     // c * z^p  ->  c * (1+w)^p * (1-w)^(n-p)
        const A = binomExpand(p, 1), B = binomExpand(n - p, -1);
        for (let i = 0; i <= p; i++) for (let j = 0; j <= n - p; j++) out[i + j] += c * A[i] * B[j];
    }
    // *** THE ACCUMULATOR IS INDEXED IN ASCENDING POWERS AND routhHurwitz TAKES HIGHEST POWER FIRST. *** The
    // first version handed it over unreversed, which reads the polynomial backwards -- and it still returned the
    // right stable/unstable verdict on ordinary gains, because reversing a polynomial maps its roots to their
    // reciprocals and INSIDE-THE-UNIT-CIRCLE IS PRESERVED UNDER THAT MAP. It is wrong exactly ON the circle,
    // which is the boundary this function exists to locate. A CONVENTION ERROR THAT IS INVISIBLE EVERYWHERE
    // EXCEPT THE ONE PLACE THE ANSWER MATTERS.
    out.reverse();
    // AND THE TRANSFORM'S OWN BLIND SPOT, NAMED RATHER THAN HIDDEN: z = -1 maps to w = infinity, so a root
    // exactly there DROPS THE DEGREE of the transformed polynomial. Not an edge case for a learner -- z = -1 is
    // the OSCILLATORY stability boundary, lr*gain = 2 exactly, the thing a learning rate is checked against.
    let deg = out.length - 1;
    while (deg > 0 && Math.abs(out[0]) < 1e-30) { out.shift(); deg--; }
    const droppedAtMinusOne = deg < n;
    const r = routhHurwitz(out);
    const marginal = r.marginal || droppedAtMinusOne;
    return { outside: r.rhp, inside: n - r.rhp - (marginal ? 1 : 0), marginal, droppedAtMinusOne,
             transformed: out };
}
function binomExpand(p, sign) {
    const o = [1];
    for (let i = 1; i <= p; i++) o.push(o[i - 1] * (p - i + 1) / i * sign);
    return o;
}

// =================================================================================================================
// THE PLANT THAT IS ACTUALLY IN THE ENGINE
// =================================================================================================================
/** box3d's weld joint: hertz and damping give s^2 + 2*zeta*omega*s + omega^2 with omega = 2*pi*hertz. */
export function weldCharacteristic(hertz, dampingRatio) {
    const omega = 2 * Math.PI * hertz;
    return { coeffs: [1, 2 * dampingRatio * omega, omega * omega], omega, zeta: dampingRatio };
}

// =================================================================================================================
// THE SHIPPED RELAY, WHICH IS NOT LINEAR AND STILL HAS TWO EXACT PREDICATES
// =================================================================================================================
export const ES_TURN_DEADBAND = 4;    // combat.js stepAI: turn is +-1 outside this
export const ES_FIRING_CONE = 12;     // ...and firing is gated inside this
export const ES_THRUST_CONE = 35;     // ...and thrust inside this
export const ES_TURN_SCALE = 3;       // flightModel.js: maneuver -> deg/sec

/** The ordering that must hold or a settled ship can never fire. Three integers, no tolerance. */
export function relayConeOrdering() {
    return {
        deadband: ES_TURN_DEADBAND, firing: ES_FIRING_CONE, thrust: ES_THRUST_CONE,
        settledCanFire: ES_TURN_DEADBAND < ES_FIRING_CONE,
        fireImpliesThrust: ES_FIRING_CONE < ES_THRUST_CONE,
    };
}

/**
 * A relay on a pure integrator settles only if one tick cannot cross the whole null zone. The zone is
 * 2*deadband wide, so the predicate is turnRate*dt < 2*deadband -- exact, and the margin is the useful number.
 */
export function chatterMargin(maneuver, dt = 1 / 60) {
    const turnRate = maneuver * ES_TURN_SCALE;
    const zone = 2 * ES_TURN_DEADBAND;
    const perTick = turnRate * dt;
    return { turnRate, perTick, zone, settles: perTick < zone, margin: zone / perTick,
             criticalFps: turnRate / zone };
}

export const MEASURED_V3572 = {
    twoRoutesOneInteger:
        "Routh--Hurwitz counts RHP roots from the COEFFICIENTS by sign changes down the first column and never " +
        "computes a root; Durand--Kerner finds every root and looks at the real parts. THE SAME INTEGER BY TWO " +
        "ROADS THAT SHARE NO IDEA. An integer agreement has no tolerance to argue about and no magnitude for a " +
        "compensating error to hide in.",
    theRootFinderIsNewCodeOnPurpose:
        "physics/quantum/rmt.js's symEigenvalues is SYMMETRIC-ONLY -- Householder plus implicit-shift QL, and " +
        "its own header says so. A COMPANION MATRIX IS NOT SYMMETRIC, so reusing it would have returned " +
        "confident nonsense. Durand--Kerner is new code and therefore needs its own key: VIETA, rebuilding the " +
        "coefficients from the roots. A root-finder graded only against the thing it was used to check is a " +
        "mirror.",
    theMarginalCaseIsTheOneThatBreaksIt:
        "The Routh table divides by the first element of the row above, and a WHOLE ROW OF ZEROS appears exactly " +
        "when roots are symmetric about the origin -- for a physical plant, A CONJUGATE PAIR ON THE IMAGINARY " +
        "AXIS, the undamped oscillator, the marginal case a stability test exists to find. A naive Routh divides " +
        "by zero PRECISELY WHERE IT MATTERS MOST and looks perfect until it meets one.",
    theAutopilotIsStillNotLinear:
        "v3567's reading stands: combat.js stepAI is a three-valued RELAY WITH A DEADBAND feeding a saturating " +
        "plant, and Routh--Hurwitz grades a LINEAR system's characteristic polynomial. *** THE HONEST HOME WAS " +
        "IN box3d ALL ALONG: swk_joint_weld takes hertz and damping, which IS s^2 + 2 zeta omega s + omega^2. *** " +
        "A real LTI plant, shipped, with three routes to one verdict -- the table, the root-finder, and the wasm.",
};

export async function reportLines() {
    const L = [];
    L.push("[control/stability] Routh--Hurwitz against root-finding: two routes, one integer");
    L.push("");
    const cases = [
        ["stable 3rd order", [1, 6, 11, 6]],
        ["one RHP root", [1, 1, -2]],
        ["two RHP roots", [1, -3, 3, -1]],
        ["MARGINAL, imaginary pair", [1, 0, 1]],
        ["marginal inside a cubic", [1, 2, 1, 2]],
    ];
    L.push("  case                        Routh   roots   Vieta residual");
    for (const [name, c] of cases) {
        const r = routhHurwitz(c), n = rhpCountNumeric(c);
        L.push("  " + name.padEnd(26) + String(r.rhp).padStart(4) + String(n.rhp).padStart(8) +
               "   " + vietaResidual(c, n.roots).toExponential(2));
    }
    L.push("");
    const o = relayConeOrdering();
    L.push("  ES RELAY (combat.js stepAI): deadband " + o.deadband + " < firing " + o.firing +
           " < thrust " + o.thrust + "  -> settled ship can fire: " + o.settledCanFire);
    for (const [n, m] of [["Corsair", 14], ["Raider", 11], ["Marauder", 8]]) {
        const c = chatterMargin(m);
        L.push("    " + n.padEnd(9) + m + " maneuver = " + c.turnRate + " deg/s   " + c.perTick.toFixed(2) +
               " deg/tick of an " + c.zone + " deg zone   margin " + c.margin.toFixed(1) +
               "x   chatters below " + c.criticalFps.toFixed(1) + " fps");
    }
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of await reportLines()) console.log(l);
    process.exit(0);
}
