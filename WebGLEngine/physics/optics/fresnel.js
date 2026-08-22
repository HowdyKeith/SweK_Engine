// physics/optics/fresnel.js
//
// FRESNEL (NEAR-FIELD) DIFFRACTION -- v2809. The existing diffraction lab (physics/optics/diffraction.js) is
// FAR-FIELD only: it propagates to infinity and compares against sinc^2 / Airy. This adds the near field, where
// the pattern still depends on how far away the screen is.
//
// THE ANSWER KEYS, in the lab's tradition of grading against truth we own:
//
//  1. THE FRESNEL INTEGRALS themselves have exact known values: C(0)=S(0)=0, C(inf)=S(inf)=1/2, and tabulated
//     values in between. The integrator is graded against those before anything is built on it.
//
//  2. THE KNIFE EDGE has a famous exact result: at the geometric shadow boundary the intensity is EXACTLY one
//     quarter of the unobstructed intensity -- not approximately, exactly, because C(0)=S(0)=0 makes the
//     amplitude exactly half. Nobody feeds that in; it falls out of the integrals. The first fringe maximum
//     (~1.37 I0 at v~1.217) is a second checkable landmark.
//
//  3. THE CROSS-INSTRUMENT CHECK, which is the strongest one: push the near-field propagator to large distance
//     (Fresnel number -> 0) and it MUST reproduce what the far-field module already computes for the same slit.
//     Two instruments written independently, agreeing in the limit where both are valid. Same discipline as the
//     wind-tunnel Strouhal cross-check: the claim is the agreement, not either one alone.
//
// Pure, no imports, browser-safe. Lengths are in consistent units (use metres, or millimetres throughout).

// --- Fresnel integrals C(x) = int_0^x cos(pi t^2 / 2) dt, S(x) = int_0^x sin(pi t^2 / 2) dt ------------
// Composite Simpson with a step small enough for the oscillation at the upper limit. The integrand oscillates
// faster as t grows (phase ~ t^2), so the step count scales with x^2, not x -- a fixed step silently loses
// accuracy exactly where the physics gets interesting.
export function fresnelCS(x, opts = {}) {
    const sign = x < 0 ? -1 : 1;          // C and S are odd functions
    const a = Math.abs(x);
    if (a === 0) return { C: 0, S: 0 };
    const perUnit = opts.perUnit || 400;
    let n = Math.max(64, Math.ceil(perUnit * a * Math.max(1, a)));
    if (n % 2) n++;                        // Simpson needs an even interval count
    const h = a / n;
    const f = (t) => { const p = Math.PI * t * t / 2; return [Math.cos(p), Math.sin(p)]; };
    let sc = 0, ss = 0;
    const [c0, s0] = f(0), [cn, sn] = f(a);
    sc += c0 + cn; ss += s0 + sn;
    for (let i = 1; i < n; i++) {
        const [c, s] = f(i * h);
        const w = (i % 2) ? 4 : 2;
        sc += w * c; ss += w * s;
    }
    return { C: sign * sc * h / 3, S: sign * ss * h / 3 };
}

// --- straight edge (knife edge) -----------------------------------------------------------------------
// v is the dimensionless coordinate: v = y * sqrt(2 / (lambda * z)). v > 0 is the LIT side, v < 0 the shadow.
// I(v)/I0 = 1/2 [ (1/2 + C(v))^2 + (1/2 + S(v))^2 ]
export function knifeEdgeIntensity(v) {
    const { C, S } = fresnelCS(v);
    const a = 0.5 + C, b = 0.5 + S;
    return 0.5 * (a * a + b * b);
}

// Dimensionless coordinate for a screen at distance z, wavelength lambda, transverse position y.
export const edgeV = (y, lambda, z) => y * Math.sqrt(2 / (lambda * z));

// Sample the knife-edge profile over a range of v.
export function knifeEdgeProfile(vs) { return vs.map(knifeEdgeIntensity); }

// --- single slit in the NEAR field --------------------------------------------------------------------
// Closed form in Fresnel integrals for a slit of width `a` centred on the axis:
//   I(x)/I0 = 1/2 [ (C(v2) - C(v1))^2 + (S(v2) - S(v1))^2 ],  v = sqrt(2/(lambda z)) (x -+ a/2)
export function slitFresnel(a, lambda, z, xs) {
    const k = Math.sqrt(2 / (lambda * z));
    return xs.map((x) => {
        const v1 = k * (x - a / 2), v2 = k * (x + a / 2);
        const A = fresnelCS(v1), B = fresnelCS(v2);
        const dC = B.C - A.C, dS = B.S - A.S;
        return 0.5 * (dC * dC + dS * dS);
    });
}

// Independent route to the same quantity: numerically integrate the Fresnel diffraction integral across the
// aperture. Slower and cruder, but it shares no code with the closed form above -- so agreement between the two
// is evidence, not a tautology.
export function slitFresnelNumeric(a, lambda, z, xs, N = 2000) {
    const dx = a / N;
    return xs.map((x) => {
        let re = 0, im = 0;
        for (let i = 0; i < N; i++) {
            const xp = -a / 2 + (i + 0.5) * dx;
            const phase = Math.PI * (x - xp) * (x - xp) / (lambda * z);
            re += Math.cos(phase) * dx;
            im += Math.sin(phase) * dx;
        }
        // normalise so an unobstructed aperture gives 1: the free-space amplitude is sqrt(lambda z)
        const norm = 1 / (lambda * z);
        return (re * re + im * im) * norm;
    });
}

// Fresnel number: F = a^2 / (lambda z). F >> 1 is deep near field; F << 1 is the far field, where the pattern
// stops changing shape and only scales -- which is where the Fraunhofer module is valid.
export const fresnelNumber = (a, lambda, z) => (a * a) / (lambda * z);

// Regime label, so a page can say which instrument is the right one to trust.
export function regime(a, lambda, z) {
    const F = fresnelNumber(a, lambda, z);
    if (F > 10) return "near field (Fresnel)";
    if (F < 0.1) return "far field (Fraunhofer)";
    return "transition";
}

// --- far-field limit of the SAME near-field formula ----------------------------------------------------
// At large z the near-field profile approaches the Fraunhofer sinc^2. This returns the near-field profile
// sampled at the angles the far-field module uses, so the two can be compared directly.
export function slitFresnelAtAngles(a, lambda, z, sinThetas) {
    return slitFresnel(a, lambda, z, sinThetas.map((s) => s * z));
}

// Normalised RMS difference between two profiles, each scaled to its own peak. Shape comparison, not amplitude.
export function profileRms(p, q) {
    const pk = (arr) => { const m = Math.max(...arr); return m > 0 ? arr.map((v) => v / m) : arr.slice(); };
    const A = pk(p), B = pk(q);
    let s = 0;
    for (let i = 0; i < A.length; i++) s += (A[i] - B[i]) ** 2;
    return Math.sqrt(s / A.length);
}
