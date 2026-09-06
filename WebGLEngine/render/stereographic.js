// WebGLEngine/render/stereographic.js -- v4463
//
// THE STEREOGRAPHIC PROJECTION -- the "little planet" -- WHICH render/panini.js HAS BEEN NAMING SINCE v2571
// WITHOUT THIS TREE EVER HAVING IT.
//
// panini.js quotes its own primary source (lazarus-pkgs/panini, USAGE.md), verbatim, in its header:
//
//     "It is A LINEAR PERSPECTIVE VIEW OF A CYLINDRICAL IMAGE -- the cylindrical analog of THE STEREOGRAPHIC
//      PROJECTION OF A SPHERE."
//
// and says so again in its own words at line 41: "At d = 1: the 'Panini' proper, the cylindrical analogue of
// stereographic." The tree has held the CYLINDRICAL member of that family for 1,892 versions and has never
// held the SPHERICAL one. This is that one. Nothing is ported: the projection is four hundred years old and
// the construction below is three lines of similar triangles.
//
// ---- *** "ANALOG" IS EXACT ON ONE CURVE AND WRONG BY 35 DEGREES EVERYWHERE ELSE, AND BOTH HALVES ARE HERE *** -
//
// The word "analog" in that sentence is doing two jobs and the gate separates them.
//
// EXACT, TO THE LAST BIT: on the horizon (y = 0, where the cylinder and the sphere are the same surface),
// stereographic and Panini-at-d=1 are THE SAME FUNCTION. Both are 2*tan(th/2). Measured before this file was
// written, against the real paniniProject():
//
//        th      panini d=1        2*tan(th/2)      |diff|        panini d=0.5    panini d=2
//        15    0.263304995      0.263304995        0.0e+0        0.264835069   0.261792499
//        45    0.828427125      0.828427125        0.0e+0        0.878679656   0.783611625
//        90    2.000000000      2.000000000       2.2e-16        3.000000000   1.500000000
//       150    7.464101615      7.464101615       1.8e-15             null     1.322780956
//
// It is an identity, not a coincidence -- Panini's S*sin(th) at d=1 is 2*sin(th)/(1+cos(th)), which IS the
// half-angle formula -- and it holds at d = 1 AND NOWHERE ELSE, which is what makes it a test rather than a
// tautology. d = 0.5 and d = 2 miss it in opposite directions at every angle.
//
// AND WRONG EVERYWHERE ELSE: *** STEREOGRAPHIC IS CONFORMAL AND PANINI IS NOT, BY UP TO 35 DEGREES. *** Take
// two perpendicular tangent directions at a point on the sphere and project both. Stereographic returns them
// still perpendicular; Panini does not:
//
//        direction                 stereographic    panini d=1
//        ( 0.30,  0.20, -1.00)          0 deg         1.61 deg off a right angle
//        ( 0.70,  0.50, -1.00)          0 deg         7.36 deg
//        ( 1.00,  0.60, -0.60)          0 deg        16.24 deg
//        ( 1.00,  1.00, -0.30)          0 deg        35.48 deg
//        ( 0.05, -0.90,  0.30)          0 deg   ***  88.00 deg  ***   <-- near the NADIR
//
// *** AND THE WORST DIRECTION IS THE ONE A LITTLE PLANET IS MADE OF. *** The first draft of this header
// stopped at 35.48 degrees, because the first sweep used six directions and the gate uses seven; the seventh
// is near-vertical and reads 87.998 -- a right angle flattened to two degrees. That is not an outlier, it is
// structural: Panini's height term is y/hypot(x,z), which diverges at the poles, and panini.js returns null at
// exactly vertical for that reason. A LITTLE PLANET LOOKS STRAIGHT DOWN. So the cylinder fails hardest at
// precisely the orientation the picture is built on, and a reader who took "cylindrical analog" to mean
// "basically the same" would reach for the cylinder and get a smear where the planet should be.
//
// (The correction is left visible rather than tidied: a frozen number taken over a different sample than the
// check runs is the same defect v4462 found in its own census, one round earlier, in this same session.)
//
// ---- THE CONSTRUCTION, WHICH HAS NO TRIGONOMETRY IN IT ---------------------------------------------------------
//
// Unit direction d = (x, y, z), OpenGL convention: forward is NEGATIVE z, so the front pole is (0, 0, -1).
// Put the eye at the BACK pole N = (0, 0, +1) and draw the line from N through d onto the plane z = -1, which
// is tangent to the sphere at the front pole. Solving 1 + t(z - 1) = -1 gives t = 2/(1 - z), hence
//
//     u = 2x / (1 - z)        v = 2y / (1 - z)
//
// No atan, no tan, no sqrt. The radius falls out as 2*sin(phi)/(1 + cos(phi)) = 2*tan(phi/2) where phi is the
// angle from forward, which is where the Panini identity above comes from.
//
// *** AND THE ABSENCE OF TRIGONOMETRY IS NOT A TIDINESS ARGUMENT, IT IS ONE ULP. *** Both paths to the horizon
// landmark were measured. The trig-free one is EXACT -- stereoProject(1,0,0) returns the integer 2, and
// littlePlanetLonLat(2,0) returns a latitude of exactly 0 -- because u = 2x/(1-z) with z = 0 is just 2x. The
// trig convenience path is not: stereoRadiusFor(Math.PI/2) returns 1.9999999999999998, ONE ULP SHORT OF 2,
// because Math.PI/2 is not pi/2 and tan of it is not 1. Same landmark, same algebra, different last bit. The
// gate asserts the landmarks through the exact path and holds the trig helpers to a tolerance, rather than
// quietly using whichever one happens to pass.
//
// The back pole itself (z = 1, the direction straight behind) is the one point with no image: t divides by
// zero. THIS FILE RETURNS null THERE.
// panini.js made the same choice for the same reason and wrote down why -- "returning a huge number would look
// like geometry and would poison any average computed over it" -- and that reasoning transfers exactly.
//
// ---- WHAT THIS MODULE IS AND IS NOT ------------------------------------------------------------------------
//
// The same split panini.js declared: this is the MATH, in plain JS, so it can be tested exactly. stereoGLSL()
// emits the same arithmetic as a shader string. *** THEY ARE NOT AUTOMATICALLY THE SAME FUNCTION *** -- one is
// JS on a CPU and one is GLSL on a GPU, and nothing here can run the GPU. The selfcheck gates the JS and
// CHECKS THE SHADER TEXT AGAINST THE SAME CONSTANTS, which is weaker and is labelled as such. RIG: the
// shader's actual output needs a screenshot.
"use strict";

/**
 * Project a view-space direction to stereographic screen coordinates.
 *
 * @param {number} x  view-space x (right)
 * @param {number} y  view-space y (up)
 * @param {number} z  view-space z (forward is NEGATIVE z, OpenGL convention)
 * @returns {[number, number] | null} screen [u, v], or null for the one direction with no image.
 */
export function stereoProject(x, y, z) {
    const n = Math.hypot(x, y, z);
    if (!(n > 0) || !Number.isFinite(n)) return null;      // the zero vector has no direction
    const zn = z / n;
    const k = 1 - zn;
    // THE ONE POINT WITH NO IMAGE: straight behind the eye. The line from the projection pole through it never
    // meets the plane, because it IS the projection pole. null is the honest answer; see the header.
    if (k <= 1e-12) return null;
    return [(2 * (x / n)) / k, (2 * (y / n)) / k];
}

/**
 * The exact inverse. Given a plane point, the unit direction that projects to it.
 * Derived, not fitted: |N + t(Q - N)| = 1 with N = (0,0,1), Q = (u,v,-1) gives t = 4/(s + 4), s = u^2 + v^2.
 */
export function stereoUnproject(u, v) {
    const s = u * u + v * v;
    const t = 4 / (s + 4);
    return [t * u, t * v, (s - 4) / (s + 4)];
}

/**
 * The local magnification -- the scalar the projection multiplies every tangent vector by, in every direction,
 * which is the whole content of the word "conformal". Exactly 2/(1-z) on the unit sphere.
 */
export function stereoScale(x, y, z) {
    const n = Math.hypot(x, y, z);
    if (!(n > 0)) return null;
    const k = 1 - z / n;
    return k <= 1e-12 ? null : 2 / k;
}

/**
 * The ANALYTIC tangent map (Jacobian applied to a tangent vector), which is what makes conformality checkable
 * rather than merely plausible. Differentiating u = 2x/(1-z), v = 2y/(1-z):
 *
 *     du = 2[tx(1-z) + x*tz] / (1-z)^2      dv = 2[ty(1-z) + y*tz] / (1-z)^2
 *
 * *** THE FINITE-DIFFERENCE VERSION OF THIS READS 1e-5 AND THE ANALYTIC ONE READS 1e-16. *** Both were run.
 * A central difference at eps = 1e-6 leaves truncation error four orders of magnitude above zero, which is
 * large enough to HIDE a real defect of that size -- so the gate asserts against this function, and the
 * finite-difference reading is recorded as the weaker instrument it is rather than quietly used instead.
 *
 * @param {number[]} p  a UNIT direction on the sphere
 * @param {number[]} t  a tangent vector at p (t . p = 0)
 */
export function stereoTangent(p, t) {
    const [x, y, z] = p, [tx, ty, tz] = t;
    const k = 1 - z;
    if (k <= 1e-12) return null;
    const k2 = k * k;
    return [(2 * (tx * k + x * tz)) / k2, (2 * (ty * k + y * tz)) / k2];
}

/** Screen radius for a given angle off forward, in radians. The half-angle formula, stated once. */
export function stereoRadiusFor(phiRad) {
    if (!(phiRad >= 0) || phiRad >= Math.PI - 1e-12) return null;   // pi is the pole: no image
    return 2 * Math.tan(phiRad / 2);
}

/** The inverse: what angle off forward lands at this screen radius. Total, unlike Panini -- every radius maps. */
export function stereoAngleAt(radius) {
    return 2 * Math.atan(radius / 2);
}

/**
 * Choose the screen radius that shows a given field of view. Mirrors paniniFitD's job, and differs in a way
 * worth saying: PANINI HAS A HORIZON AND THIS DOES NOT. paniniHorizon(d) returns acos(-d) for d < 1 -- past
 * that angle there is no image at all -- whereas stereographic maps every direction but one, so this returns
 * null only for a request of a full 360 degrees.
 */
export function stereoFitRadius(hfovDeg) {
    const phi = (hfovDeg * Math.PI) / 360;
    return stereoRadiusFor(phi);
}

// ---- THE EQUIRECTANGULAR PAIR, AND THE LITTLE PLANET ITSELF ------------------------------------------------
//
// world/procPlanet.js already BAKES an equirectangular texture ("a biome rule paints an EQUIRECTANGULAR
// texture"), and render/nebulaSkybox.js, render/cubeBake.js and render/skyRenderer.js all deal in the same
// spherical domain. So the consumer for this projection existed before the projection did.

/** World direction -> equirectangular (lon, lat) in radians. lon from -pi..pi, lat from -pi/2..pi/2. */
export function dirToLonLat(x, y, z) {
    const n = Math.hypot(x, y, z);
    if (!(n > 0)) return null;
    const yn = Math.max(-1, Math.min(1, y / n));
    return [Math.atan2(x / n, -z / n), Math.asin(yn)];
}

/** The exact inverse of dirToLonLat, for a unit direction. */
export function lonLatToDir(lon, lat) {
    const c = Math.cos(lat);
    return [c * Math.sin(lon), Math.sin(lat), -c * Math.cos(lon)];
}

/**
 * *** THE LITTLE PLANET. *** Stereographic with the projection's forward axis pointed at the NADIR, which is
 * the only thing that separates "a stereographic view" from the picture everyone recognises: the ground curls
 * into a ball at the centre, the horizon becomes a circle, and the zenith is the point at infinity you can
 * never reach.
 *
 * The rotation that does it is (vx, vy, vz) -> (vx, vz, -vy): view-forward (0,0,-1) becomes world-down
 * (0,-1,0). It is a proper rotation (determinant +1), which the gate checks rather than assumes.
 *
 * The three landmarks are exact and are asserted as such:
 *     radius 0        -> the nadir,   lat = -90 deg
 *     radius 2        -> the horizon, lat =   0 deg      (because 2*tan(45 deg) = 2)
 *     radius -> inf   -> the zenith,  lat = +90 deg, never attained
 */
export function littlePlanetDir(u, v) {
    const [vx, vy, vz] = stereoUnproject(u, v);
    return [vx, vz, -vy];
}

/** Screen point -> equirectangular (lon, lat) for a little-planet lookup into a spherical source. */
export function littlePlanetLonLat(u, v) {
    return dirToLonLat(...littlePlanetDir(u, v));
}

/** The same arithmetic as a GLSL ES 3.00 snippet. See the caveat in this file's header: THIS IS NOT GATED OUTPUT. */
export function stereoGLSL() {
    return `// Stereographic projection -- the spherical member of the family render/panini.js is the cylindrical
// member of. At d = 1 Panini equals this ON THE HORIZON EXACTLY, and nowhere else in the image.
vec2 stereoProject(vec3 dir) {
    vec3 d = normalize(dir);
    float k = 1.0 - d.z;
    if (k <= 1e-12) return vec2(1e9);             // straight behind: the one direction with no image
    return vec2(2.0 * d.x / k, 2.0 * d.y / k);
}
vec3 stereoUnproject(vec2 p) {
    float s = dot(p, p);
    float t = 4.0 / (s + 4.0);
    return vec3(t * p.x, t * p.y, (s - 4.0) / (s + 4.0));
}`;
}

/**
 * *** THE SAME ARITHMETIC AS WGSL, SO THE PROJECTION EXISTS ON THE BACKEND gfx/device.js IS BUILDING TOWARD. ***
 *
 * v4463 emitted GLSL alone and closed by saying the shader's real output "needs a screenshot". v4483 took that
 * seriously and found the screenshot is the problem: a WebGL2 readback is RGBA8, so the finest thing a GLSL
 * result can be compared at is one 8-bit step -- 1/255 -- unless the float is PACKED across the channels first.
 * WGSL has no such limit. A compute shader writes f32 to a storage buffer and the harness reads the bits back
 * exactly, so this emitter is not a second copy for its own sake: it is the only path on which the arithmetic
 * can be graded at full precision, and tools/ship/stereoDevice-selfcheck.mjs grades all three against each other.
 *
 * *** THE TWO TEXTS ARE NOT ASSERTED TO MATCH -- THEIR VALUES ARE. *** #118's rule for this tree, in its own
 * words: "the JS and GLSL Ashima simplex are NOT the same function, and no gate has ever compared their VALUES".
 * A regex over two shader strings tests the regex.
 */
export function stereoWGSL() {
    return `// Stereographic projection -- the spherical member of the family render/panini.js is the cylindrical
// member of. Same arithmetic as stereoGLSL(); graded against it and against the JS BY VALUE, not by text.
fn stereoProject(dir: vec3<f32>) -> vec2<f32> {
    let d = normalize(dir);
    let k = 1.0 - d.z;
    if (k <= 1e-12) { return vec2<f32>(1e9, 1e9); }   // straight behind: the one direction with no image
    return vec2<f32>(2.0 * d.x / k, 2.0 * d.y / k);
}
fn stereoUnproject(p: vec2<f32>) -> vec3<f32> {
    let s = dot(p, p);
    let t = 4.0 / (s + 4.0);
    return vec3<f32>(t * p.x, t * p.y, (s - 4.0) / (s + 4.0));
}`;
}

/** What v4463 measured. Re-take with: node tools/ship/stereographic-selfcheck.mjs */
export const MEASURED_AT_V4463 = Object.freeze({
    // The identity with panini.js, measured against the real paniniProject over the horizon.
    paniniAgreeD: 1,                    // and ONLY d = 1
    paniniMaxAbsDiffOnHorizon: 5e-11,   // over azimuths 0..179 deg; the 179 sample dominates, at 4.38e-11
    paniniDisagreeAtHalfD: 1.0,         // d=0.5 at 90 deg reads 3.0 against stereographic's 2.0
    // Conformality, from the ANALYTIC tangent map. Not the finite-difference reading -- see stereoTangent.
    stereoMaxRightAngleErrorDeg: 1e-12,
    stereoFiniteDiffErrorDeg: 5e-5,     // the WEAKER instrument, recorded so the gap is on the record
    // Over the gate's SEVEN directions. The oblique sample is 35.476; the near-nadir one is the real answer.
    paniniMaxRightAngleErrorDeg: 87.998,
    paniniWorstDir: Object.freeze([0.05, -0.9, 0.3]),   // near the nadir -- where a little planet points
    paniniObliqueErrorDeg: 35.476,                      // (1,1,-0.3), which the first draft mistook for the worst
    // Landmarks of the little planet.
    horizonRadius: 2,                   // 2*tan(45 deg) -- EXACTLY 2 through stereoProject, and
    horizonRadiusViaTrig: 1.9999999999999998,   // ...one ulp short through stereoRadiusFor. See the header.
    horizonRadiusUlpGap: 1,
    nadirLatDeg: -90,
    zenithUnreachable: true,
});
