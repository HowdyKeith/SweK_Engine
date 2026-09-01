// WebGLEngine/render/atmosphere.mjs -- v4237
//
// PRECOMPUTED ATMOSPHERIC SCATTERING, AND THE REASON TO TAKE IT IS THAT IT CAN BE HELD TO A NUMBER.
//
// The model is Bruneton and Neyret's precomputed scattering, in the shape takram-design-engineering's
// three-geospatial packages it (MIT, development concluded March 2025 -- a finished reference rather than a
// moving target). What is taken is the METHOD and the LUT parameterisation, not the code: that repo is a
// three.js monorepo assuming a globe, 3d-tiles-renderer and astronomy-engine, and this tree is not a GIS.
//
// *** THE GAP WAS CHECKED BEFORE ANY OF THIS WAS WRITTEN: grep for atmosphericScatter / aerialPerspective /
// Bruneton / "precomputed atmospheric" across every .js and .mjs in the tree returns NOTHING. *** There is a
// sky, there is a day/night cycle, there is CloudVolume.js -- and there is no scattering model of any kind.
// Rayleigh and Mie are simply absent.
//
// ---- WHY THIS ONE AND NOT ANOTHER SKY SHADER --------------------------------------------------------------
//
// Most sky shaders can only be graded by looking at them. This one has CLOSED FORMS to be held to, and they
// are what the gate is built out of:
//
//   1. STRAIGHT UP, THE OPTICAL DEPTH IS ANALYTIC. The integral of exp(-h/H) dh from (r - Rg) to infinity is
//      H * exp(-(r - Rg) / H), exactly. So transmittance at mu = 1 has a closed form at every altitude, and a
//      numeric integrator that disagrees with it is wrong rather than merely different.
//   2. TRANSMITTANCE IS MULTIPLICATIVE. T(a -> c) = T(a -> b) * T(b -> c), because it is the exponential of
//      an integral. Any parameterisation that breaks this is broken, and the error is measurable.
//   3. A PHASE FUNCTION INTEGRATES TO ONE OVER THE SPHERE. Rayleigh's 3/(16 pi) * (1 + cos^2) and the
//      Cornette-Shanks Mie both do, by construction, and an implementation that dropped a normalisation
//      constant would still LOOK like a sky.
//   4. AWAY FROM THE HORIZON THE OPTICAL DEPTH APPROACHES THE SECANT LAW, H * exp(-h/H) / mu, and the
//      deviation grows in a known direction as mu -> 0. That deviation IS the curvature of the planet.
//
// *** AND THE MEASUREMENT THE WHOLE PRECOMPUTATION EXISTS TO JUSTIFY: WHAT DOES THE LUT COST? *** A table is
// only worth having if reading it is close to integrating. buildTransmittanceLUT + lookupTransmittance are
// graded here against direct integration over the whole domain, so "precomputed" is a measured trade rather
// than an assumed one.
//
// SCOPE, STATED RATHER THAN IMPLIED: single scattering only. Multiple scattering is what carries twilight and
// the horizon in Bruneton's full model and it is NOT here. The gate says so in its closing note rather than
// leaving a reader to infer it from the absence of a function.
//
// UNITS ARE KILOMETRES throughout, because the scale heights and the planet radius are conventionally quoted
// that way and mixing them with metres is the one arithmetic mistake this file could make silently.
"use strict";

/** Earth, as the reference model quotes it. Lengths in km, coefficients in 1/km. */
export const EARTH = {
    Rg: 6360.0,                 // ground radius
    Rt: 6420.0,                 // top of atmosphere
    Hr: 8.0,                    // Rayleigh scale height
    Hm: 1.2,                    // Mie scale height
    // Rayleigh scattering at 680 / 550 / 440 nm, and Mie's grey coefficient
    betaR: [5.8e-3, 13.5e-3, 33.1e-3],
    betaMs: 21e-3,              // Mie SCATTERING
    betaMe: 21e-3 / 0.9,        // Mie EXTINCTION -- scattering over the single-scattering albedo 0.9
    mieG: 0.76,                 // Cornette-Shanks asymmetry
};

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

/** Height above the ground, in km, at radius r. */
export const heightAt = (r, p = EARTH) => r - p.Rg;

/**
 * Distance from radius r, along a ray whose cosine to the zenith is mu, to the top of the atmosphere.
 *
 * *** THE DISCRIMINANT IS CLAMPED AT ZERO, AND SABOTAGE SAYS THAT GUARD IS DEFENSIVE ON EVERY PATH ANYTHING
 * HERE ACTUALLY WALKS. *** For r a hair above Rt through float error, r*r*(mu*mu - 1) + Rt*Rt goes very
 * slightly negative and sqrt returns NaN, which then propagates through every LUT entry that touched it --
 * one NaN in a transmittance table is a black hole in the sky, invisible in the table itself. That failure
 * is real. What is NOT true is that the table build reaches it: buildTransmittanceLUT goes through
 * rMuFromUv, which never returns r above Rt, so removing the clamp leaves the whole gate green. The gate
 * therefore asks distanceToTop about r > Rt DIRECTLY rather than assuming the table build covers it, and
 * this comment says which of the two it is.
 */
export function distanceToTop(r, mu, p = EARTH) {
    const disc = r * r * (mu * mu - 1.0) + p.Rt * p.Rt;
    return Math.max(0.0, -r * mu + Math.sqrt(Math.max(0.0, disc)));
}

/** Distance to the ground along the same ray, or Infinity if the ray misses the planet. */
export function distanceToGround(r, mu, p = EARTH) {
    const disc = r * r * (mu * mu - 1.0) + p.Rg * p.Rg;
    if (disc < 0.0 || mu > 0.0) return Infinity;
    return -r * mu - Math.sqrt(disc);
}

/** Does a ray from r with cosine mu meet the ground before leaving the atmosphere? */
export const hitsGround = (r, mu, p = EARTH) => mu < 0.0 && r * r * (mu * mu - 1.0) + p.Rg * p.Rg >= 0.0;

/**
 * Optical depth of one exponential species along the ray to the top of the atmosphere.
 *
 * Trapezoid over `steps` samples. The integrand is exp(-h/H) and h is NOT linear in the path parameter --
 * that curvature is the whole difference between this and the secant law.
 */
export function opticalDepth(r, mu, H, p = EARTH, steps = 512) {
    const d = distanceToTop(r, mu, p);
    if (!(d > 0)) return 0.0;
    const dx = d / steps;
    let sum = 0.0;
    for (let i = 0; i <= steps; i++) {
        const t = i * dx;
        const ri = Math.sqrt(Math.max(p.Rg * p.Rg, r * r + t * t + 2.0 * r * mu * t));
        const w = (i === 0 || i === steps) ? 0.5 : 1.0;
        sum += w * Math.exp(-(ri - p.Rg) / H);
    }
    return sum * dx;
}

/**
 * *** THE CLOSED FORM, WHICH IS WHAT opticalDepth IS GRADED AGAINST. *** Straight up from radius r there is
 * no curvature to integrate: h runs linearly with the path, and the integral of exp(-h/H) from (r - Rg) to
 * infinity is exactly H * exp(-(r - Rg) / H).
 */
export const opticalDepthVerticalExact = (r, H, p = EARTH) => H * Math.exp(-(r - p.Rg) / H);

/**
 * *** AND THE SHARPER ONE, WHICH IS THE REFERENCE THE INTEGRATOR IS ACTUALLY OWED. *** opticalDepth() stops
 * at the TOP OF THE ATMOSPHERE; the closed form above runs to INFINITY. Comparing them leaves a gap that
 * looks like integrator error and is not: it is the truncated tail, H * exp(-(Rt - Rg) / H), which for Earth
 * and Rayleigh is 8 * exp(-7.5) = 0.00443 out of 8. Measured, the gap is 0.00428 -- so the tail explains
 * 97% of it and the trapezoid explains the remaining 1.4e-4.
 *
 * Grading against THIS instead turns a 5e-4 relative agreement into a 2.6e-5 one, and more importantly turns
 * "close enough" into "the difference is accounted for".
 */
export const opticalDepthVerticalTruncated = (r, H, p = EARTH) =>
    H * (Math.exp(-(r - p.Rg) / H) - Math.exp(-(p.Rt - p.Rg) / H));

/** The secant law: the optical depth a FLAT planet would have. Wrong near the horizon, by a known amount. */
export const opticalDepthSecant = (r, mu, H, p = EARTH) => opticalDepthVerticalExact(r, H, p) / Math.max(1e-6, mu);

/**
 * Transmittance from radius r along mu to the top of the atmosphere, as [R, G, B].
 * exp(-(betaR * odR + betaMe * odM)) -- Beer-Lambert with two species.
 */
export function transmittance(r, mu, p = EARTH, steps = 512) {
    const odR = opticalDepth(r, mu, p.Hr, p, steps);
    const odM = opticalDepth(r, mu, p.Hm, p, steps);
    return [0, 1, 2].map((i) => Math.exp(-(p.betaR[i] * odR + p.betaMe * odM)));
}

// ---- THE PARAMETERISATION, WHICH IS THE ONLY REASON A TABLE THIS SMALL WORKS AT ALL -------------------------
//
// A LUT linear in mu spends almost every row on directions where nothing changes and almost none near the
// horizon, where everything does. Bruneton's mapping instead measures the DISTANCE TO THE TOP along the ray
// and normalises it between its shortest (straight up) and longest (grazing) values, which puts the samples
// where the function actually bends.

/** (r, mu) -> (u, v) in [0,1]^2. */
export function uvFromRMu(r, mu, p = EARTH) {
    const Hatm = Math.sqrt(p.Rt * p.Rt - p.Rg * p.Rg);
    const rho = Math.sqrt(Math.max(0.0, r * r - p.Rg * p.Rg));
    const d = distanceToTop(r, mu, p);
    const dMin = p.Rt - r, dMax = rho + Hatm;
    const u = dMax > dMin ? clamp((d - dMin) / (dMax - dMin), 0, 1) : 0;
    return [u, clamp(rho / Hatm, 0, 1)];
}

/** (u, v) -> (r, mu). The exact inverse of uvFromRMu, which the gate asserts by round-tripping. */
export function rMuFromUv(u, v, p = EARTH) {
    const Hatm = Math.sqrt(p.Rt * p.Rt - p.Rg * p.Rg);
    const rho = v * Hatm;
    const r = Math.sqrt(rho * rho + p.Rg * p.Rg);
    const dMin = p.Rt - r, dMax = rho + Hatm;
    const d = dMin + u * (dMax - dMin);
    // mu from d by inverting distanceToTop: d^2 + 2*r*mu*d + r^2 - Rt^2 = 0
    const mu = d === 0 ? 1.0 : clamp((Hatm * Hatm - rho * rho - d * d) / (2.0 * r * d), -1, 1);
    return [r, mu];
}

/**
 * Build the transmittance table. Row-major, w * h * 3 floats, RGB per texel, at texel CENTRES.
 *
 * *** TEXEL CENTRES, NOT CORNERS, AND GETTING THAT WRONG IS A HALF-TEXEL SHIFT NOBODY SEES. *** The value
 * stored at index i covers [i/w, (i+1)/w), so it belongs at (i + 0.5) / w, and GL_LINEAR later assumes
 * exactly that. A table built on corners renders a sky that is subtly wrong everywhere and obviously wrong
 * nowhere.
 */
export function buildTransmittanceLUT(p = EARTH, { w = 256, h = 64, steps = 512 } = {}) {
    const data = new Float32Array(w * h * 3);
    for (let j = 0; j < h; j++) {
        const v = (j + 0.5) / h;
        for (let i = 0; i < w; i++) {
            const u = (i + 0.5) / w;
            const [r, mu] = rMuFromUv(u, v, p);
            const t = transmittance(r, mu, p, steps);
            const o = (j * w + i) * 3;
            data[o] = t[0]; data[o + 1] = t[1]; data[o + 2] = t[2];
        }
    }
    return { w, h, data, p };
}

/** Bilinear read, clamped at the edges the way GL_CLAMP_TO_EDGE reads it. */
export function lookupTransmittance(lut, r, mu) {
    const [u, v] = uvFromRMu(r, mu, lut.p);
    const x = clamp(u * lut.w - 0.5, 0, lut.w - 1), y = clamp(v * lut.h - 0.5, 0, lut.h - 1);
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, lut.w - 1), y1 = Math.min(y0 + 1, lut.h - 1);
    const fx = x - x0, fy = y - y0;
    const at = (xi, yi, c) => lut.data[(yi * lut.w + xi) * 3 + c];
    return [0, 1, 2].map((c) =>
        (at(x0, y0, c) * (1 - fx) + at(x1, y0, c) * fx) * (1 - fy) +
        (at(x0, y1, c) * (1 - fx) + at(x1, y1, c) * fx) * fy);
}

// ---- PHASE FUNCTIONS, EACH OF WHICH INTEGRATES TO ONE ------------------------------------------------------

/** Rayleigh. 3/(16 pi) * (1 + cos^2 t). */
export const rayleighPhase = (cosT) => (3.0 / (16.0 * Math.PI)) * (1.0 + cosT * cosT);

/** Cornette-Shanks Mie, the form Bruneton uses. At g = 0 it reduces to Rayleigh's shape. */
export function miePhase(cosT, g = EARTH.mieG) {
    const g2 = g * g;
    return (3.0 / (8.0 * Math.PI)) * ((1.0 - g2) * (1.0 + cosT * cosT)) /
           ((2.0 + g2) * Math.pow(1.0 + g2 - 2.0 * g * cosT, 1.5));
}

/** Integrate a phase function over the sphere. Must be 1. */
export function phaseIntegral(fn, steps = 20000) {
    let sum = 0.0;
    for (let i = 0; i < steps; i++) {
        const cosT = -1.0 + 2.0 * (i + 0.5) / steps;
        sum += fn(cosT) * (2.0 / steps);
    }
    return sum * 2.0 * Math.PI;
}

/**
 * SINGLE-SCATTERED radiance along a view ray, as [R, G, B].
 *
 * At each step: the light reaching that point from the sun, times how much of it scatters into the view
 * direction, times how much of THAT survives the trip back to the eye. Both legs read the transmittance LUT
 * when one is given, which is what makes this the consumer the table exists for.
 *
 * A sample whose ray to the sun is blocked by the planet contributes nothing. That test is the terminator,
 * and omitting it makes the ground glow at night.
 */
export function singleScattering(r, mu, muSun, nu, p = EARTH, { lut = null, steps = 96, sunIrradiance = 1.0 } = {}) {
    const ground = hitsGround(r, mu, p);
    const d = ground ? distanceToGround(r, mu, p) : distanceToTop(r, mu, p);
    if (!(d > 0) || !isFinite(d)) return [0, 0, 0];
    const T = lut ? (rr, mm) => lookupTransmittance(lut, rr, mm) : (rr, mm) => transmittance(rr, mm, p, 128);
    const Teye = T(r, mu);
    const dx = d / steps;
    const accR = [0, 0, 0]; let accM = 0.0;
    for (let i = 0; i <= steps; i++) {
        const t = i * dx;
        const ri = Math.sqrt(Math.max(p.Rg * p.Rg, r * r + t * t + 2.0 * r * mu * t));
        const muI = clamp((r * mu + t) / ri, -1, 1);
        const muSunI = clamp((r * muSun + t * nu) / ri, -1, 1);
        if (hitsGround(ri, muSunI, p)) continue;               // in the planet's own shadow
        // T(eye -> sample) = T(eye -> top) / T(sample -> top), which is the multiplicative property used
        // rather than a second integration per step.
        const Tsample = T(ri, muI), Tsun = T(ri, muSunI);
        const w = (i === 0 || i === steps) ? 0.5 : 1.0;
        const dr = Math.exp(-(ri - p.Rg) / p.Hr), dm = Math.exp(-(ri - p.Rg) / p.Hm);
        for (let c = 0; c < 3; c++) {
            const Tview = Tsample[c] > 0 ? Math.min(1, Teye[c] / Tsample[c]) : 0;
            accR[c] += w * Tview * Tsun[c] * dr;
            if (c === 1) accM += w * Tview * Tsun[c] * dm;
        }
    }
    const pr = rayleighPhase(nu), pm = miePhase(nu, p.mieG);
    return [0, 1, 2].map((c) =>
        sunIrradiance * (accR[c] * dx * p.betaR[c] * pr + accM * dx * p.betaMs * pm));
}

// ---- THE GLSL, WHICH IS THE SAME ARITHMETIC AND MUST PROVE IT ----------------------------------------------
//
// *** THE CPU MODEL ABOVE IS THE REFERENCE AND THIS IS WHAT IS GRADED AGAINST IT, ON A REAL WEBGL2 CONTEXT.
// *** That is the same instrument the SwiftUIShaders port uses, and for the same reason: a shader that is
// only READ has been checked for plausibility, not for agreement. The one difference that matters here is
// PRECISION -- the CPU integrates in float64 and the GPU in float32, and the transmittance of a grazing ray
// is exp(-large), where a relative error in the exponent is amplified. The gate measures that rather than
// assuming it away.

/** Shared with the CPU model above, line for line. Every constant arrives as a uniform so neither copy can drift. */
export const ATMOSPHERE_GLSL = `
uniform float uRg, uRt, uHr, uHm, uBetaMe, uBetaMs, uMieG;
uniform vec3 uBetaR;
uniform sampler2D uTransmittance;
uniform sampler2D uMultiScatter;   // v4240: psi, over (sun cosine, altitude). Zero-filled = single only.
uniform float uMultiOn;

float atm_distanceToTop(float r, float mu) {
    float disc = r * r * (mu * mu - 1.0) + uRt * uRt;
    return max(0.0, -r * mu + sqrt(max(0.0, disc)));
}
bool atm_hitsGround(float r, float mu) {
    return mu < 0.0 && r * r * (mu * mu - 1.0) + uRg * uRg >= 0.0;
}
float atm_distanceToGround(float r, float mu) {
    float disc = r * r * (mu * mu - 1.0) + uRg * uRg;
    return -r * mu - sqrt(max(0.0, disc));
}
vec2 atm_uvFromRMu(float r, float mu) {
    float Hatm = sqrt(uRt * uRt - uRg * uRg);
    float rho = sqrt(max(0.0, r * r - uRg * uRg));
    float d = atm_distanceToTop(r, mu);
    float dMin = uRt - r, dMax = rho + Hatm;
    float u = dMax > dMin ? clamp((d - dMin) / (dMax - dMin), 0.0, 1.0) : 0.0;
    return vec2(u, clamp(rho / Hatm, 0.0, 1.0));
}
vec3 atm_transmittance(float r, float mu) {
    return texture(uTransmittance, atm_uvFromRMu(r, mu)).rgb;
}
vec3 atm_multiScatter(float r, float muSun) {
    // the table's own parameterisation, and it is LINEAR in both axes: psi is smooth in altitude and sun
    // cosine, which is why 8x6 measures within a factor of 1.4 of 40x24 and the budget belongs in rays.
    vec2 uv = vec2(clamp((muSun + 1.0) * 0.5, 0.0, 1.0), clamp((r - uRg) / (uRt - uRg), 0.0, 1.0));
    return texture(uMultiScatter, uv).rgb;
}
float atm_rayleighPhase(float c) { return (3.0 / (16.0 * 3.14159265358979)) * (1.0 + c * c); }
float atm_miePhase(float c, float g) {
    float g2 = g * g;
    return (3.0 / (8.0 * 3.14159265358979)) * ((1.0 - g2) * (1.0 + c * c)) /
           ((2.0 + g2) * pow(1.0 + g2 - 2.0 * g * c, 1.5));
}
vec3 atm_singleScattering(float r, float mu, float muSun, float nu, int steps) {
    bool ground = atm_hitsGround(r, mu);
    float d = ground ? atm_distanceToGround(r, mu) : atm_distanceToTop(r, mu);
    if (!(d > 0.0)) return vec3(0.0);
    vec3 Teye = atm_transmittance(r, mu);
    float dx = d / float(steps);
    vec3 accR = vec3(0.0), accMS = vec3(0.0); float accM = 0.0;
    for (int i = 0; i <= steps; i++) {
        float t = float(i) * dx;
        float ri = sqrt(max(uRg * uRg, r * r + t * t + 2.0 * r * mu * t));
        float muI = clamp((r * mu + t) / ri, -1.0, 1.0);
        float muSunI = clamp((r * muSun + t * nu) / ri, -1.0, 1.0);
        if (atm_hitsGround(ri, muSunI)) continue;
        vec3 Tsample = atm_transmittance(ri, muI);
        vec3 Tsun = atm_transmittance(ri, muSunI);
        float w = (i == 0 || i == steps) ? 0.5 : 1.0;
        float dr = exp(-(ri - uRg) / uHr), dm = exp(-(ri - uRg) / uHm);
        vec3 Tview = vec3(
            Tsample.r > 0.0 ? min(1.0, Teye.r / Tsample.r) : 0.0,
            Tsample.g > 0.0 ? min(1.0, Teye.g / Tsample.g) : 0.0,
            Tsample.b > 0.0 ? min(1.0, Teye.b / Tsample.b) : 0.0);
        accR += w * Tview * Tsun * dr;
        accM += w * Tview.g * Tsun.g * dm;
        // *** THE MULTIPLE-SCATTERING SOURCE, ADDED ISOTROPICALLY -- which is the approximation the whole
        // 2D table rests on, and is named in the module header rather than hidden in this loop. ***
        if (uMultiOn > 0.5) {
            vec3 ms = atm_multiScatter(ri, muSunI);
            accMS += w * Tview * ms * (uBetaR * dr + vec3(uBetaMs * dm));
        }
    }
    float pr = atm_rayleighPhase(nu), pm = atm_miePhase(nu, uMieG);
    return accR * dx * uBetaR * pr + vec3(accM * dx * uBetaMs * pm) + accMS * dx;
}`;

// ============================================================================================================
// MULTIPLE SCATTERING (v4240) -- the orders v4237 shipped without, and the series that sums them
// ============================================================================================================
//
// *** v4237's CLOSING NOTE SAID SINGLE SCATTERING WOULD READ AS A SKY THAT GOES BLACK TOO FAST AT DUSK, AND
// THE BASELINE WAS MEASURED BEFORE ANY OF THIS WAS WRITTEN. *** At 0.5 km up, total radiance at the zenith:
//
//     sun +40 deg  2.832e-2      sun  0 deg  3.933e-3
//     sun +10 deg  1.396e-2      sun -2 deg  1.515e-3
//     sun  +5 deg  1.012e-2      sun -4 deg  2.972e-4
//
// An order of magnitude per two degrees once the sun is down. Real twilight does not do that, and what keeps
// it alive is light that has scattered more than once.
//
// ---- THE APPROXIMATION, STATED RATHER THAN IMPLIED ----------------------------------------------------------
//
// Orders two and up are treated as ISOTROPIC -- phase 1/(4 pi) -- which is the shape Hillaire's technique uses
// and is why a table over (altitude, sun cosine) suffices instead of Bruneton's full 4D (r, mu, muSun, nu).
// That is a real approximation and not a detail: multiply-scattered light HAS lost most of its directionality,
// but not all of it, so the second order is the least isotropic of the ones being lumped together and is the
// one this treats worst.
//
// What it buys is tractability. Bruneton's 4D table at 32 x 128 x 32 x 8 is a million texels; this is 32 x 32
// and builds on the CPU in a gate. The trade is stated here so the next reader knows which of the two they
// have.
//
// ---- AND IT IS A GEOMETRIC SERIES, WHICH IS THE PART THAT CAN BE GRADED ---------------------------------------
//
// Light that scatters once more is the same problem again with a dimmer source. If F is the fraction of
// uniform surrounding radiance that scatters back toward a point, and L2 is the light arriving there having
// been scattered exactly once from the sun, then the whole tail is
//
//     L2 * (1 + F + F^2 + ...) = L2 / (1 - F)
//
// *** WHICH CONVERGES IF AND ONLY IF F < 1, AND F < 1 IS A PHYSICAL FACT THAT THE TABLE MUST EXHIBIT RATHER
// THAN A CONDITION THE CODE ASSUMES. *** A single-scattering albedo below one means every bounce loses
// energy; if F ever reached 1 the atmosphere would be a laser. The gate asserts it over the whole table, and
// asserts that the partial sums actually walk to the closed form rather than merely being replaced by it.

/** Deterministic near-uniform directions on the sphere. A Fibonacci spiral, so the table is reproducible. */
export function sphereDirections(n) {
    const out = [], ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
        const z = 1 - (2 * i + 1) / n;
        const rho = Math.sqrt(Math.max(0, 1 - z * z));
        const th = i * ga;
        out.push([rho * Math.cos(th), rho * Math.sin(th), z]);
    }
    return out;
}

/**
 * At one point in the atmosphere: how much once-scattered sunlight arrives (L2), and what fraction of a
 * uniform surrounding radiance scatters back toward it (F).
 *
 * Both are integrals over the whole sphere of directions, marched outward. They share every step, which is
 * why they are computed together: F is the same walk as L2 with the sun term removed.
 *
 * The GROUND term is what makes albedo matter. A direction that meets the planet picks up whatever the
 * ground reflects, Lambertian over pi, and that is the only route by which the surface lights the sky.
 */
export function multiScatterAt(r, muSun, p = EARTH, { lut = null, dirs = 32, steps = 24, groundAlbedo = 0.3 } = {}) {
    const T = lut ? (rr, mm) => lookupTransmittance(lut, rr, mm) : (rr, mm) => transmittance(rr, mm, p, 128);
    const sun = [Math.sqrt(Math.max(0, 1 - muSun * muSun)), 0, muSun];   // zenith is +z
    const dirsList = sphereDirections(dirs);
    const L2 = [0, 0, 0], F = [0, 0, 0];
    const pu = 1 / (4 * Math.PI);
    for (const w of dirsList) {
        const mu = w[2];
        const nu = w[0] * sun[0] + w[1] * sun[1] + w[2] * sun[2];
        const ground = hitsGround(r, mu, p);
        const d = ground ? distanceToGround(r, mu, p) : distanceToTop(r, mu, p);
        if (!(d > 0) || !isFinite(d)) continue;
        const Teye = T(r, mu);
        const dx = d / steps;
        for (let i = 0; i <= steps; i++) {
            const t = i * dx;
            const ri = Math.sqrt(Math.max(p.Rg * p.Rg, r * r + t * t + 2 * r * mu * t));
            const muI = clamp((r * mu + t) / ri, -1, 1);
            const muSunI = clamp((r * muSun + t * nu) / ri, -1, 1);
            const Tsample = T(ri, muI);
            const wt = (i === 0 || i === steps) ? 0.5 : 1.0;
            const dr = Math.exp(-(ri - p.Rg) / p.Hr), dm = Math.exp(-(ri - p.Rg) / p.Hm);
            const shadowed = hitsGround(ri, muSunI, p);
            const Tsun = shadowed ? [0, 0, 0] : T(ri, muSunI);
            for (let c = 0; c < 3; c++) {
                const Tv = Tsample[c] > 0 ? Math.min(1, Teye[c] / Tsample[c]) : 0;
                const sigma = p.betaR[c] * dr + p.betaMs * dm;      // SCATTERING, not extinction
                F[c] += wt * Tv * sigma * pu * dx;
                L2[c] += wt * Tv * sigma * pu * Tsun[c] * dx;
            }
        }
        // *** THE GROUND, AND THE TRANSMITTANCE TO IT IS NOT T(r, mu). *** For a DOWNWARD ray that meets the
        // planet, distanceToTop() returns where the line would leave the atmosphere going backwards THROUGH
        // the planet -- a path no light takes. The first version of this used it and the ground term came out
        // 700 times too small, which showed up as a ground albedo that moved the sky by 0.07% across its whole
        // range. The segment is recovered from the multiplicative property along the REVERSED ray, which
        // points up and is therefore well defined at both ends:
        //     T(x -> ground) = T(ground -> top) / T(x -> top), both taken in the UPWARD direction.
        if (ground && groundAlbedo > 0) {
            const rg = p.Rg;
            const muG = clamp((r * mu + d) / rg, -1, 1);              // still descending at the surface
            const muSunG = clamp((r * muSun + d * nu) / rg, -1, 1);
            if (muSunG > 0) {
                const TgTop = T(rg, -muG), TxTop = T(r, -mu), Tsun = T(rg, muSunG);
                for (let c = 0; c < 3; c++) {
                    const Txg = TxTop[c] > 0 ? Math.min(1, TgTop[c] / TxTop[c]) : 0;
                    // Lambertian: albedo/pi times the cosine of the sun at the surface
                    L2[c] += Txg * (groundAlbedo / Math.PI) * muSunG * Tsun[c];
                }
            }
        }
    }
    const scale = 4 * Math.PI / dirsList.length;       // the sphere measure, from a mean over directions
    return {
        L2: L2.map((x) => x * scale),
        F: F.map((x) => x * scale),
        psi: L2.map((x, c) => (F[c] * scale < 1 ? x * scale / (1 - F[c] * scale) : Infinity)),
    };
}

/**
 * The partial sums, written out, so the closed form can be checked against the thing it replaces.
 * order 2 is L2; order k is L2 * F^(k-2). Returns the per-order totals and the running sum.
 */
export function scatteringOrders(L2, F, n = 8) {
    const orders = [], running = [];
    let term = L2.slice(), sum = [0, 0, 0];
    for (let k = 0; k < n; k++) {
        orders.push(term.slice());
        for (let c = 0; c < 3; c++) sum[c] += term[c];
        running.push(sum.slice());
        term = term.map((x, c) => x * F[c]);
    }
    return { orders, running };
}

/** The 2D table: rows are altitude, columns are the sun's cosine. Texel CENTRES, as the transmittance one is. */
export function buildMultiScatterLUT(p = EARTH, { w = 32, h = 32, lut = null, dirs = 32, steps = 24,
                                                  groundAlbedo = 0.3 } = {}) {
    const T = lut || buildTransmittanceLUT(p, { w: 128, h: 32, steps: 256 });
    const data = new Float32Array(w * h * 3);
    let worstF = 0;
    for (let j = 0; j < h; j++) {
        const r = p.Rg + (p.Rt - p.Rg) * (j + 0.5) / h;
        for (let i = 0; i < w; i++) {
            const muSun = -1 + 2 * (i + 0.5) / w;
            const m = multiScatterAt(r, muSun, p, { lut: T, dirs, steps, groundAlbedo });
            const o = (j * w + i) * 3;
            for (let c = 0; c < 3; c++) {
                data[o + c] = Number.isFinite(m.psi[c]) ? m.psi[c] : 0;
                if (m.F[c] > worstF) worstF = m.F[c];
            }
        }
    }
    return { w, h, data, p, worstF, groundAlbedo };
}

/** Bilinear read of the multiple-scattering table, clamped at the edges. */
export function lookupMultiScatter(mlut, r, muSun) {
    const p = mlut.p;
    const u = clamp((muSun + 1) / 2, 0, 1);
    const v = clamp((r - p.Rg) / (p.Rt - p.Rg), 0, 1);
    const x = clamp(u * mlut.w - 0.5, 0, mlut.w - 1), y = clamp(v * mlut.h - 0.5, 0, mlut.h - 1);
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, mlut.w - 1), y1 = Math.min(y0 + 1, mlut.h - 1);
    const fx = x - x0, fy = y - y0;
    const at = (xi, yi, c) => mlut.data[(yi * mlut.w + xi) * 3 + c];
    return [0, 1, 2].map((c) =>
        (at(x0, y0, c) * (1 - fx) + at(x1, y0, c) * fx) * (1 - fy) +
        (at(x0, y1, c) * (1 - fx) + at(x1, y1, c) * fx) * fy);
}

/**
 * The eye integral again, with the multiple-scattering source added at every step.
 *
 * Single scattering keeps its real phase functions -- that is the order whose directionality still matters.
 * The multiple-scattering table is added isotropically, which is the approximation this whole section rests
 * on and which is named at the top.
 */
export function skyRadiance(r, mu, muSun, nu, p = EARTH,
                            { lut = null, mlut = null, steps = 96, sunIrradiance = 1.0 } = {}) {
    const single = singleScattering(r, mu, muSun, nu, p, { lut, steps, sunIrradiance });
    if (!mlut) return single;
    const T = lut ? (rr, mm) => lookupTransmittance(lut, rr, mm) : (rr, mm) => transmittance(rr, mm, p, 128);
    const ground = hitsGround(r, mu, p);
    const d = ground ? distanceToGround(r, mu, p) : distanceToTop(r, mu, p);
    if (!(d > 0) || !isFinite(d)) return single;
    const Teye = T(r, mu);
    const dx = d / steps;
    const acc = [0, 0, 0];
    for (let i = 0; i <= steps; i++) {
        const t = i * dx;
        const ri = Math.sqrt(Math.max(p.Rg * p.Rg, r * r + t * t + 2 * r * mu * t));
        const muI = clamp((r * mu + t) / ri, -1, 1);
        const muSunI = clamp((r * muSun + t * nu) / ri, -1, 1);
        const Tsample = T(ri, muI);
        const ms = lookupMultiScatter(mlut, ri, muSunI);
        const wt = (i === 0 || i === steps) ? 0.5 : 1.0;
        const dr = Math.exp(-(ri - p.Rg) / p.Hr), dm = Math.exp(-(ri - p.Rg) / p.Hm);
        for (let c = 0; c < 3; c++) {
            const Tv = Tsample[c] > 0 ? Math.min(1, Teye[c] / Tsample[c]) : 0;
            const sigma = p.betaR[c] * dr + p.betaMs * dm;
            acc[c] += wt * Tv * sigma * ms[c] * dx;
        }
    }
    return single.map((x, c) => x + sunIrradiance * acc[c]);
}
