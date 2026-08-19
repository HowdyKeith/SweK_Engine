// WebGLEngine/render/panini.js — v2571
//
// THE PANINI (Pannini) PROJECTION. Rectilinear cameras tear the edges apart past ~90 degrees horizontal FOV;
// cylindrical ones bend every vertical line. Panini keeps verticals straight AND the centre rectilinear, and
// buys width by compressing the periphery instead of stretching it.
//
// ---- THE DEFINITION, FROM THE PRIMARY SOURCE -----------------------------------------------------------------
//
// lazarus-pkgs/panini's own USAGE.md (web-verified, not paraphrased from a blog):
//
//     "Bruno Postle recently deduced one very simple but effective way of combining the cylindrical and linear
//      projections by studying a Pannini painting of St. Peter's; so we are calling that the 'Pannini
//      projection'. It is A LINEAR PERSPECTIVE VIEW OF A CYLINDRICAL IMAGE -- the cylindrical analog of the
//      stereographic projection of a sphere."
//
// and, crucially:
//
//     "The linear perspective projection, AT Ez = 0, BELONGS TO BOTH FAMILIES."
//
// That second sentence is why this module can be trusted without a GPU. It is not a design note, it is a
// FALSIFIABLE IDENTITY: at d = 0 this function must reproduce x/-z and y/-z TO THE LAST BIT. A control that
// cannot fail is decoration, and "the wide-angle view looks nicer" is not a test -- but "d=0 equals the
// rectilinear camera exactly" is, and the selfcheck runs it over a grid of directions.
//
// The name honours Gian Paolo Pannini, an 18th century professor of perspective whose wide views of Roman
// interiors "seem to be in true perspective, but can't be: the standard linear perspective projection creates
// serious distortions at much smaller view angles."
//
// ---- THE CONSTRUCTION -----------------------------------------------------------------------------------------
//
// Paint the world on a unit cylinder whose axis is vertical (+y). Put the eye at distance d BEHIND the axis and
// take an ordinary linear perspective view of that cylinder.
//
//     azimuth  th = atan2(x, -z)                 -- angle around the cylinder, 0 = straight ahead
//     height   h  = y / sqrt(x*x + z*z)          -- y per unit of HORIZONTAL distance, which is what makes
//                                                   verticals straight: h does not depend on th
//     scale    S  = (d + 1) / (d + cos th)       -- similar triangles from the eye at (0,0,d) to the cylinder
//     screen   [S*sin th, S*h]
//
// At d = 0: S = 1/cos th, so u = tan th = x/-z. The identity falls out of the algebra rather than being asserted.
// At d = 1: the "Panini" proper, the cylindrical analogue of stereographic.
// As d grows the periphery compresses further, approaching orthographic (USAGE.md: "at Ez = 26, it is very close
// to the orthographic spherical or cylindrical projection").
//
// ---- WHAT THIS MODULE IS AND IS NOT ---------------------------------------------------------------------------
//
// This is the MATH, in plain JS, so it can be tested exactly. paniniGLSL() emits the same arithmetic as a shader
// string for the GPU path. THEY ARE NOT AUTOMATICALLY THE SAME FUNCTION -- one is JS on a CPU and one is GLSL on
// a GPU, and nothing here can run the GPU. The selfcheck gates the JS and CHECKS THE SHADER TEXT AGAINST THE SAME
// CONSTANTS, which is weaker and is labelled as such. RIG: the shader's actual output needs a screenshot.

/**
 * Project a view-space direction to Panini screen coordinates.
 *
 * @param {number} x  view-space x (right)
 * @param {number} y  view-space y (up)
 * @param {number} z  view-space z (forward is NEGATIVE z, OpenGL convention)
 * @param {number} d  eye distance. 0 = rectilinear EXACTLY, 1 = Panini proper, larger = flatter periphery.
 * @returns {[number, number] | null} screen [u, v], or null for directions behind the projection's horizon.
 */
export function paniniProject(x, y, z, d = 1) {
    const th = Math.atan2(x, -z);
    const cosTh = Math.cos(th);
    const denom = d + cosTh;
    // THE HORIZON. As th approaches the angle where d + cos(th) = 0, the projection sends points to infinity --
    // that is the mathematics, not a bug: the eye is INSIDE the cylinder and can never see the point directly
    // behind itself. Returning null is the honest answer. Returning a huge number would look like geometry and
    // would poison any average computed over it.
    if (denom <= 1e-6) return null;
    const S = (d + 1) / denom;
    const horiz = Math.hypot(x, z);
    if (horiz < 1e-12) return null;              // straight up or straight down: azimuth is undefined
    return [S * Math.sin(th), S * (y / horiz)];
}

/** The maximum half-azimuth this d can show, in radians. Past it, denom <= 0 and there is no image. */
export function paniniHorizon(d = 1) {
    if (d >= 1) return Math.PI;                  // the whole circle is visible in principle
    return Math.acos(-d);                        // d=0 -> pi/2 (90 deg half-fov), exactly the rectilinear limit
}

/**
 * Choose d for a target horizontal FOV, given how much of the screen half-width you are willing to spend.
 * Returns null when the target is unreachable rather than a plausible-looking number for an impossible request.
 */
export function paniniFitD(hfovDeg, halfWidth = 1) {
    const th = (hfovDeg * Math.PI) / 360;
    if (th >= Math.PI - 1e-6) return null;
    // solve halfWidth = (d+1)*sin(th) / (d + cos(th))  for d
    const s = Math.sin(th), c = Math.cos(th);
    const den = halfWidth - s;
    if (Math.abs(den) < 1e-9) return null;
    const d = (s - halfWidth * c) / den;
    return d >= 0 && Number.isFinite(d) ? d : null;
}

/** The same arithmetic as a GLSL ES 3.00 snippet. See the caveat in this file's header: THIS IS NOT GATED OUTPUT. */
export function paniniGLSL() {
    return `// Panini projection -- linear perspective view of a cylindrical image (Postle / Pannini).
// uPaniniD = 0.0 is EXACTLY rectilinear; 1.0 is Panini proper; larger flattens the periphery.
vec2 paniniProject(vec3 dir, float d) {
    float th = atan(dir.x, -dir.z);
    float denom = d + cos(th);
    if (denom <= 1e-6) return vec2(1e9);          // behind the horizon: no image exists here
    float S = (d + 1.0) / denom;
    float horiz = length(dir.xz);
    return vec2(S * sin(th), S * (dir.y / max(horiz, 1e-12)));
}`;
}
