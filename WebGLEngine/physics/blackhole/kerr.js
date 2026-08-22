// physics/blackhole/kerr.js
//
// KERR (ROTATING) BLACK HOLE -- v2810. The existing instrument (physics/blackhole/geodesic.js) is Schwarzschild:
// non-rotating, equatorial, and perfectly symmetric. Real black holes spin, and spin breaks that symmetry --
// frame dragging makes a photon going WITH the rotation behave differently from one going AGAINST it, so the
// shadow is no longer a circle.
//
// ANSWER KEYS, all closed-form and derivable from the metric -- nothing recalled from a table:
//
//   HORIZONS      r± = M ± sqrt(M² - a²).            a=0 -> 2M (Schwarzschild), a=M -> M (extremal).
//   ERGOSPHERE    r_E(θ) = M + sqrt(M² - a² cos²θ).  Touches the horizon at the poles, bulges at the equator;
//                                                    at a=0 it collapses onto the horizon everywhere.
//   PHOTON ORBITS r_ph = 2M{1 + cos[(2/3) arccos(∓a/M)]}, upper sign prograde.
//                                                    a=0 -> BOTH 3M (the photon sphere splits only when spinning);
//                                                    a=M -> prograde M, retrograde 4M.
//   ISCO          the Bardeen-Press-Teukolsky closed form. a=0 -> 6M.
//
// THE CROSS-INSTRUMENT CHECK, same discipline as the Fresnel round: set a=0 and every Kerr quantity must
// reproduce the Schwarzschild module exactly -- horizon 2M, photon sphere 3M, shadow 3sqrt(3)M. A rotating
// solution that does not contain the non-rotating one as its a->0 limit is wrong, and that is checkable to
// machine precision rather than by eye.
//
// SCOPE, stated rather than implied: equatorial photon motion, Boyer-Lindquist coordinates, geometric units
// G=c=1. No off-equatorial ray tracing, no accretion disk, no redshift map -- those are separate instruments,
// and claiming them here would be decoration.
//
// Pure, no imports, browser-safe.

// --- horizons and static limit -------------------------------------------------------------------------
// |a| <= M or there is no horizon at all (a naked singularity, which the cosmic censorship conjecture forbids).
export const isSubExtremal = (M, a) => Math.abs(a) <= M + 1e-15;

// v3392 -- THE PLANTED ERROR: A LINEARISED DISCRIMINANT.
//
// r+- = M +- sqrt(M^2 - a^2). The plant replaces that square root with M - |a|, which is the shape somebody
// reaches for when they remember the horizons collapse at extremality and do not re-derive how. It is right at
// a = 0 and right at a = M, and WRONG EVERYWHERE BETWEEN -- the sort of slip that survives two spot checks.
//
// *** THE POINT IS WHICH KEY NOTICES. horizonSumErr IS (M+s) + (M-s) - 2M, WHICH IS ZERO FOR ANY s WHATEVER.
// IT CANNOT SEE THIS PLANT, OR ANY PLANT OF THIS SHAPE, AT ANY SIZE. *** v3299's errorPairAudit found that and
// said so in prose; the plant turns it into a measurement. horizonProductErr, graded against a^2, catches it.
export function horizons(M, a, { planted = false } = {}) {
    const d = M * M - a * a;
    if (d < 0) return { outer: NaN, inner: NaN, naked: true };
    const s = planted ? M - Math.abs(a) : Math.sqrt(d);
    return { outer: M + s, inner: M - s, naked: false, planted };
}
export const outerHorizon = (M, a) => horizons(M, a).outer;

// Static limit / ergosphere outer boundary. Inside it nothing can remain at rest: spacetime itself is dragged.
export const ergosphere = (M, a, theta) => M + Math.sqrt(Math.max(0, M * M - a * a * Math.cos(theta) * Math.cos(theta)));

// The ergosphere's equatorial bulge beyond the horizon -- zero when not spinning.
export const ergosphereThickness = (M, a) => ergosphere(M, a, Math.PI / 2) - outerHorizon(M, a);

// --- frame dragging -------------------------------------------------------------------------------------
// Angular velocity of a zero-angular-momentum observer, omega = 2 M a r / (Sigma^2-ish); equatorial form below.
// It falls off as 1/r^3 far away and is nonzero ONLY when a != 0.
export function frameDragging(M, a, r) {
    const r2 = r * r, a2 = a * a;
    const A = (r2 + a2) * (r2 + a2) - a2 * (r2 - 2 * M * r + a2);   // equatorial Sigma^2 factor
    return A > 0 ? (2 * M * a * r) / A : NaN;
}
// Horizon angular velocity: Omega_H = a / (2 M r+).
export const horizonAngularVelocity = (M, a) => { const rp = outerHorizon(M, a); return rp > 0 ? a / (2 * M * rp) : NaN; };

// --- equatorial circular photon orbits ------------------------------------------------------------------
// r_ph = 2M {1 + cos[(2/3) arccos(-+ a/M)]}. Prograde (co-rotating) sits closer in; retrograde further out.
// This split IS the frame dragging, expressed as geometry.
export function photonOrbits(M, a) {
    const x = Math.max(-1, Math.min(1, a / M));
    const prograde = 2 * M * (1 + Math.cos((2 / 3) * Math.acos(-x)));
    const retrograde = 2 * M * (1 + Math.cos((2 / 3) * Math.acos(x)));
    return { prograde, retrograde };
}

// Critical impact parameters for the two senses. b = -(r^3 - ... ) closed form for equatorial photons:
//   b_ph = -(r^3 - 3 M r^2 + a^2 r + a^2 M) / (a (r - M))  is singular at a=0, so use the equivalent form
//   b = (r^2 + a^2 - 2 a sqrt(M r)) / (r - 2M + ... ). Simplest robust route: for a circular photon orbit at r,
//   b = ( r^2 + a^2 ∓ 2 a sqrt(M r) ) / ( sqrt(M r) ∓ a ) * ... -- instead we use the standard result
//   b_crit = (r_ph^2 + a^2 - 2 a sqrt(M r_ph)) / (r_ph - 2M) ... which also degenerates. The stable closed form
//   for equatorial Kerr shadow edges is:
//       b_pro  =  6M cos[ (1/3) arccos(-a/M) ] - a
//       b_ret  =  6M cos[ (1/3) arccos( a/M) ] + a
// At a=0 both give 6M cos(pi/6) = 6M (sqrt(3)/2) = 3 sqrt(3) M -- the Schwarzschild shadow radius.
export function criticalImpacts(M, a) {
    const x = Math.max(-1, Math.min(1, a / M));
    const prograde = 6 * M * Math.cos((1 / 3) * Math.acos(-x)) - a;
    const retrograde = 6 * M * Math.cos((1 / 3) * Math.acos(x)) + a;
    return { prograde, retrograde };
}

// The shadow's asymmetry: prograde and retrograde edges sit at different distances from the axis, so the
// silhouette is flattened on one side -- the "D shape" the EHT images show for a spinning hole.
export function shadowAsymmetry(M, a) {
    const b = criticalImpacts(M, a);
    const width = b.prograde + b.retrograde;          // full extent across the spin axis direction
    const offset = (b.retrograde - b.prograde) / 2;   // how far the silhouette centre is displaced
    return { ...b, width, offset, asymmetry: width > 0 ? (2 * offset) / width : 0 };
}

// --- ISCO (innermost stable circular orbit) for massive particles ----------------------------------------
// Bardeen-Press-Teukolsky. Prograde shrinks toward M as a -> M; retrograde grows toward 9M.
export function isco(M, a, prograde = true) {
    const x = a / M;
    const Z1 = 1 + Math.cbrt(1 - x * x) * (Math.cbrt(1 + x) + Math.cbrt(1 - x));
    const Z2 = Math.sqrt(3 * x * x + Z1 * Z1);
    const s = prograde ? -1 : 1;
    return M * (3 + Z2 + s * Math.sqrt((3 - Z1) * (3 + Z1 + 2 * Z2)));
}

// --- summary for a page ----------------------------------------------------------------------------------
export function kerrSummary(M, a) {
    const h = horizons(M, a);
    const p = photonOrbits(M, a);
    const s = shadowAsymmetry(M, a);
    return {
        M, a, spin: a / M,
        naked: h.naked,
        outerHorizon: h.outer, innerHorizon: h.inner,
        ergoEquator: ergosphere(M, a, Math.PI / 2),
        ergoPole: ergosphere(M, a, 0),
        ergoThickness: ergosphereThickness(M, a),
        photonPrograde: p.prograde, photonRetrograde: p.retrograde,
        bPrograde: s.prograde, bRetrograde: s.retrograde,
        shadowAsymmetry: s.asymmetry,
        omegaHorizon: horizonAngularVelocity(M, a),
        iscoPrograde: isco(M, a, true), iscoRetrograde: isco(M, a, false),
    };
}

/**
 * v3095 -- A SECOND ROUTE TO THE ISCO, SO THE FIRST ONE CAN BE WRONG.
 *
 * v3094 audited what kerr grades itself against and found nothing usable at general spin. horizonSumErr asks
 * whether r+ + r- equals 2M, which is 2M for ANY discriminant -- blind. horizonProductErr does constrain the
 * discriminant but is graded against its own closed form, so it returns machine epsilon and grades arithmetic.
 * The three schwarz*Err checks live only in mode "limit", which FORCES a = 0, and each returns exactly zero
 * because the Kerr expressions reduce algebraically at that point. Five error fields, none of them a measurement
 * of a ROTATING black hole.
 *
 * isco() above is the Bardeen-Press-Teukolsky closed form: a root of the marginal-stability condition, written
 * through Z1 and Z2 with their cube roots. NOTHING GRADED IT.
 *
 * iscoNumeric FINDS THE SAME RADIUS A DIFFERENT WAY. The ISCO is the innermost radius at which a circular
 * equatorial orbit is stable, which is where the specific energy of that orbit stops falling and turns --
 * dE/dr = 0. E(r) comes from the orbit's conserved energy, not from the stability polynomial, so the two share
 * no algebra beyond the metric they both describe. A mistake in either moves them apart; that is the whole
 * point, and it is what none of the five existing checks could do.
 *
 * WHY THIS AGREES TO 1e-8 AND NOT 1e-16, WHICH IS THE GOOD NEWS RATHER THAN THE BAD. Near a minimum E(r) is
 * quadratic, so a position is only ever recoverable to about the square root of the precision on the value --
 * the classic sqrt(eps) floor of ANY minimum-finder. A check that came back at 1e-16 here would mean the two
 * routes were not independent after all. THE MACHINE-PRECISION ANSWER IS THE TELL, AND THIS ONE CORRECTLY
 * DOES NOT GIVE IT.
 */
export function iscoNumeric(M, a, prograde = true, iters = 300) {
    const s = prograde ? 1 : -1;
    const E = (r) => {
        if (!(r > 0)) return NaN;
        const w = a * Math.sqrt(M / (r * r * r));
        const A = 1 - 2 * M / r + s * w;
        const B = 1 - 3 * M / r + 2 * s * w;
        return B <= 0 ? NaN : A / Math.sqrt(B);
    };
    // Golden section rather than a derivative root-find: dE/dr near the ISCO is the quantity going to zero, and
    // differencing it numerically would reintroduce exactly the cancellation this check exists to avoid.
    const g = (Math.sqrt(5) - 1) / 2;
    let lo = 1.0001 * M, hi = 12 * M, c = hi - g * (hi - lo), d = lo + g * (hi - lo);
    for (let i = 0; i < iters; i++) {
        const fc = E(c), fd = E(d);
        if (!(fc > fd)) { hi = d; d = c; c = hi - g * (hi - lo); }
        else { lo = c; c = d; d = lo + g * (hi - lo); }
    }
    return (lo + hi) / 2;
}
