// WebGLEngine/mesh/carve.mjs -- v4371
//
// *** THE SECOND SCULPTOR, AND THE ONE THAT ASSUMES LESS THAN THE LATHE. ***
//
// v4255 built mesh/lathe.mjs and said its own honest limit in its header: "A LATHE DOES NOT RECOVER A SHAPE
// FROM A PHOTOGRAPH. IT ASSUMES ONE." Revolving a profile can only ever produce a solid of revolution, and the
// front-view IoU that scores it is high almost by construction -- an L-bracket still measured 0.62 against a
// vase's 0.99, a gap of a third where the shapes have nothing in common.
//
// A SILHOUETTE CARVE assumes nothing about the shape. It is the other technique img2threejs (Apache-2.0) names
// -- "optional multi-view silhouette carving intersects orthographic views into bounded meshes" -- and this
// tree took its JUDGE at v3337 and its first sculptor at v4255 without ever taking this. No code is copied
// here either; what is taken is the idea, and the licence entry has been in world/reachedLicences.mjs since
// v3337.
//
// ---- WHAT A CARVE IS, AND WHY ITS ERROR HAS A DIRECTION -------------------------------------------------------
//
// Each silhouette is a shadow. Un-projecting it gives an infinite cone (a slab, under orthographic views) that
// certainly CONTAINS the object. Intersecting the cones of every view gives the VISUAL HULL: the smallest set
// consistent with every shadow. Two facts follow, and they are the whole reason this is worth building:
//
//   1. THE HULL CONTAINS THE OBJECT. Always, for any number of views from any directions. So the error is
//      one-signed -- a carve is never too small, only too big -- which is a far better property than a score
//      that can be wrong in either direction and does not say which.
//   2. THE HULL SHRINKS AS VIEWS ARE ADDED, and never grows. Adding a view can only intersect one more slab.
//
// Both are asserted in the gate as PROPERTIES over every fixture and view count, not as an arrangement that
// happened to hold once -- and fact 2 needs its statement read carefully, because the obvious version of it is
// false. The hull shrinks when a view is ADDED TO A SET. It does NOT shrink with the view COUNT: a cube is
// EXACT from two views at 0 and 90 degrees and 25.0% over from three at 0, 60 and 120, because those sets are
// not nested. More views is not better. The right views are better, and the gate measures both halves.
//
// WHAT IS NOT CLAIMED, having nearly been: that the discrete hull bounds the CONTINUOUS visual hull. Two errors
// of opposite sign are in play -- a finite view set inflates the hull, a half-pixel shadow deflates it -- and
// neither dominates at all resolutions. The cross's 32-azimuth hull measures 30.0%, 35.0% and 42.2% over at
// n = 32, 64 and 96 against its continuous convex hull's 40.0%, crossing it between the last two. "Approaches
// from below" was written into this header on the strength of one resolution and deleted after three.
//
// ---- THE LIMIT, STATED BEFORE THE CODE, AS THE LATHE'S WAS -----------------------------------------------------
//
// *** A CARVE CANNOT SEE A CONCAVITY THAT NO SILHOUETTE REVEALS, AND NO NUMBER COMPUTED FROM SILHOUETTES CAN
// TELL YOU THAT IT MISSED ONE. *** A cube with a sealed cavity inside it casts exactly the shadow of a solid
// cube from every direction in space -- measured, identical on 48 of 48 directions across yaw AND elevation,
// not merely similar. Its visual hull IS the solid cube. Every score the judge can compute -- reprojection IoU
// against the inputs, IoU against a HELD-OUT view, scale delta, centroid shift -- is perfect, because the
// hull's shadows and the object's shadows are the same pictures. The volume is wrong by the whole cavity and
// nothing in the loop can notice.
//
// A BLIND HOLE IS THE SAME PROBLEM WEARING AN EVERYDAY SHAPE, and this round predicted the opposite. A cup was
// put in the fixture set expecting one view from above to recover its bore. It does not: a cup has a FLOOR, so
// the ray down its axis hits material and the top shadow is a disc (measured area 448 against a full disc's
// 452). The bore survives from every direction and 16 azimuths plus a top view still read 53.4% over. What
// separates the recoverable case from the unrecoverable one is not the size of the concavity but whether any
// ray passes CLEAN THROUGH it: drill the cup's floor out and the same object is exact from three views.
//
// The lathe at least had ONE number that tested its assumption (asymmetry: exactly 0 for a revolvable input
// against 0.91 for an L-bracket). *** THIS ROUND LOOKED FOR THE EQUIVALENT AND THE ANSWER IS THAT THERE ISN'T
// ONE. *** That is a finding, not a gap to be filled later: the gate proves it by exhibiting two solids with
// identical silhouettes from every direction and different volumes, which is a counterexample to the existence
// of any such number rather than a failure to have found it. Detecting the cavity requires a signal that is not
// a silhouette -- depth, shading, or a prior -- which is what img2threejs's optional Depth-Anything stage is
// for, and this module does not pretend otherwise.
//
// ---- THE PAIRING THAT MAKES THE BOUND EXACT --------------------------------------------------------------------
//
// silhouetteOf() marches a ray per pixel through the SAME grid the carve tests voxel centres in. So if a voxel
// centre is solid, the ray through it hits a solid point and the pixel is marked -- which means the carve can
// never clear a truly-solid voxel. Fact 1 above is then exact at this resolution rather than approximate, and
// it is the pairing that buys it. A rasteriser that filled projected voxel footprints instead would over-cover
// at the corners and make the hull silently fatter; that bias is avoided rather than tolerated.
//
// Gated in tools/ship/carve-selfcheck.mjs.
"use strict";

/**
 * The view convention, shared by silhouetteOf() and carve() so they cannot disagree.
 *
 * A grid is n x n x n voxels; voxel (i, j, k) has its centre at (i + 0.5, j + 0.5, k + 0.5). Views are
 * ORTHOGRAPHIC, taken at azimuth `yaw` about the vertical (y) axis through the grid's centre -- a turntable,
 * which is the capture a single orbiting camera actually gives you. The image is n x n: u across, v = y up.
 *
 * `elev` tilts the camera above the horizon, so a top view is elev = PI/2. It exists because WHERE a view is
 * taken from turns out to matter far more than HOW MANY there are, and a module that could only express a
 * turntable could not measure that: a tube is 90.0% over from sixteen azimuths and EXACTLY RIGHT from two
 * azimuths plus one view from above.
 */
export function project(x, y, z, n, yaw = 0, elev = 0) {
    return projectFlat(x, y, z, n, Math.cos(yaw), Math.sin(yaw), Math.cos(elev), Math.sin(elev), (v) => v);
}

/**
 * *** THE SAME PROJECTION AT f32, AND IT IS NOT A CONVENIENCE. ***
 *
 * render/carveTsl.mjs runs this arithmetic on a device, where every value is IEEE binary32. Everywhere else in
 * this tree an f32/f64 disagreement is an ulp that stays an ulp; HERE IT ENDS IN A floor(), which is
 * discontinuous, so a voxel projecting within an ulp of a pixel boundary lands in a DIFFERENT PIXEL on the two
 * machines -- and is then solid on one and carved on the other. No tolerance expresses that: a voxel is or is
 * not. So the device is held to THIS, and the f32-versus-f64 gap is measured separately instead of being
 * swallowed by a threshold nobody chose.
 *
 * ONE implementation with ONE knob, which is tools/roundhouse/hmcGpu.mjs's idiom (leapfrogF64Flat and
 * leapfrogF32 are the same flat code with a rounder), so the two cannot drift apart. The four trig values are
 * rounded FIRST because that is what the device receives: they are computed on the CPU and uploaded as f32.
 */
export function projectF32(x, y, z, n, yaw = 0, elev = 0) {
    const r = Math.fround;
    return projectFlat(x, y, z, n, r(Math.cos(yaw)), r(Math.sin(yaw)), r(Math.cos(elev)), r(Math.sin(elev)), r);
}

function projectFlat(x, y, z, n, cy, sy, ce, se, r) {
    const c = r(n / 2);
    const dx = r(x - c), dy = r(y - c), dz = r(z - c);
    const rx = r(r(dx * cy) - r(dz * sy));        // horizontal, after the turntable spin
    const rz = r(r(dx * sy) + r(dz * cy));        // toward the camera
    const ry = r(r(dy * ce) - r(rz * se));        // vertical, after the tilt
    return { u: r(rx + c), v: r(ry + c) };
}

/** The inverse of project() along the view ray: the world point at depth t (t measured from the grid centre). */
export function unproject(u, v, t, n, yaw = 0, elev = 0) {
    const c = n / 2;
    const ru = u - c, rv = v - c;
    const ce = Math.cos(elev), se = Math.sin(elev);
    const ry = rv * ce + t * se;                  // undo the tilt
    const rz = -rv * se + t * ce;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    return { x: c + ru * cy + rz * sy, y: c + ry, z: c - ru * sy + rz * cy };
}

/**
 * The orthographic silhouette of a solid, as an n x n occupancy mask: the pixel every solid voxel's CENTRE
 * projects into is occupied.
 *
 * *** THIS WAS A RAY MARCH FIRST, AND THE CUBE MEASURED -0.7% -- A HULL SMALLER THAN THE OBJECT IT CONTAINS. ***
 * A visual hull cannot be smaller than its object; the bound is the one thing a carve has that a lathe does not,
 * and the first pairing broke it. The cause is that a ray march samples the ray through the PIXEL CENTRE while
 * the carve tests the VOXEL CENTRE, and those are not the same point: a solid voxel projecting into the corner
 * of a pixel can be missed by a ray down that pixel's middle, the pixel reads empty, and the carve then clears
 * a voxel that was solid. THE SILHOUETTE AND THE CARVE MUST BE EXACT DUALS OR THE BOUND IS ONLY APPROXIMATE,
 * and "approximate" is worth nothing here -- the whole value of a carve is that its error has a known sign.
 * So the silhouette is built by the SAME projection the carve tests, and containment is then exact at this
 * resolution rather than nearly true. Found by the number, not by the reasoning: the reasoning had already been
 * written down, in this file, as an argument for the ray march.
 *
 * *** AND THE GAP-CLOSER THIS FILE SHIPPED WITH IS OFF BY DEFAULT, BECAUSE IT WAS MEASURED. *** The reasoning
 * was sound on its face: a real silhouette off a photograph is a filled region, not a set of projected centres,
 * so interior gaps where no voxel centre lands would make the hull tighter than a true visual hull. MEASURED,
 * fillRows() ADDS EXACTLY ZERO PIXELS on all five fixtures at two different angles -- with n^3 voxel centres
 * landing in n^2 pixels there are about n of them per pixel, and the gaps the argument predicted do not occur.
 * *** AND TURNING IT ON COSTS THE ONE SHADOW THAT CARRIES THE MOST INFORMATION IN THE WHOLE FIXTURE SET: *** the
 * top view of the cup is an ANNULUS, which is not row-convex, so spanning each row between its extremes fills
 * the bore in and hands the carve a disc. A fix for a problem that does not happen, which breaks a case that
 * does. It stays exported, and fillGain() is what says it earns nothing, so the next person to reach for it
 * gets a number instead of the same argument.
 */
export function silhouetteOf(solid, n, { yaw = 0, elev = 0, fill = false, proj = project } = {}) {
    const m = new Uint8Array(n * n);
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        if (!solid(i, j, k)) continue;
        const p = proj(i + 0.5, j + 0.5, k + 0.5, n, yaw, elev);
        const u = Math.floor(p.u), v = Math.floor(p.v);
        if (u >= 0 && v >= 0 && u < n && v < n) m[v * n + u] = 1;
    }
    if (fill) fillRows(m, n);
    return m;
}

/** Close each row of a mask between its own extremes. Exact for a row-convex shadow; stated, not assumed. */
export function fillRows(m, n) {
    for (let v = 0; v < n; v++) {
        let lo = -1, hi = -1;
        for (let u = 0; u < n; u++) if (m[v * n + u]) { if (lo < 0) lo = u; hi = u; }
        for (let u = lo; u <= hi && lo >= 0; u++) m[v * n + u] = 1;
    }
    return m;
}

/** How many pixels row-filling ADDED -- the gap count, so a fixture that needs it says so with a number. */
export function fillGain(solid, n, view = {}) {
    const raw = silhouetteOf(solid, n, Object.assign({}, view, { fill: false }));
    let before = 0; for (let i = 0; i < raw.length; i++) before += raw[i];
    const filled = fillRows(Uint8Array.from(raw), n);
    let after = 0; for (let i = 0; i < filled.length; i++) after += filled[i];
    return { before, after, added: after - before };
}

/**
 * The visual hull: start solid everywhere and clear every voxel any view says is empty.
 *
 * `views` is [{ m, yaw, elev }] -- masks from silhouetteOf() (or from a photograph, which is where the
 * segmentation problem this module does NOT solve would enter). Returns the occupancy grid.
 *
 * *** WHAT HAPPENS TO A VOXEL THAT PROJECTS OFF THE EDGE OF THE IMAGE, AND THIS FILE SHIPPED THE WRONG ANSWER.
 * *** The first version CLEARED it, with a reason written beside it that reads perfectly well: an object which
 * overflows its frame has no shadow evidence beyond the border, and keeping it would let the hull grow with the
 * frame rather than with the object. The sabotage that flipped it went 0 RED -- and the reason was that no
 * fixture ever reached the branch, so the argument had never been tested by anything. GIVEN A FIXTURE THAT DOES
 * REACH IT (a box wide enough that 2640 of its 75264 voxels project past the border at 45 degrees) CLEARING
 * BREAKS CONTAINMENT: the hull comes out 7.0% SMALLER than the object it is supposed to contain.
 *
 * The physics says which way it goes. A carve INTERSECTS CONSTRAINTS, and a pixel outside the image is not a
 * pixel that says "empty" -- it is a view with nothing to say. A constraint with no evidence must not be
 * applied. So the default is KEEP, containment survives, and the honest cost is stated instead of hidden: the
 * hull then extends to the grid's edge in any direction no view constrained, which is what "we did not look
 * there" ought to look like. `outside: "clear"` keeps the old behaviour reachable, because the gate measures
 * both and a policy nobody can run is a policy nobody can check.
 */
export function carve(views, n, { outside = "keep", proj = project } = {}) {
    const g = new Uint8Array(n * n * n).fill(1);
    const clearOutside = outside === "clear";
    for (const view of views) {
        const { m, yaw = 0, elev = 0 } = view;
        for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
            const o = i + n * (j + n * k);
            if (!g[o]) continue;
            const p = proj(i + 0.5, j + 0.5, k + 0.5, n, yaw, elev);
            const u = Math.floor(p.u), v = Math.floor(p.v);
            const off = u < 0 || v < 0 || u >= n || v >= n;
            if (off ? clearOutside : !m[v * n + u]) g[o] = 0;
        }
    }
    return g;
}

/** Occupied voxel count -- the volume, in voxels, of a grid or of a solid predicate over one. */
export function volumeOf(gridOrFn, n) {
    const f = typeof gridOrFn === "function" ? gridOrFn : (i, j, k) => gridOrFn[i + n * (j + n * k)];
    let c = 0;
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (f(i, j, k)) c++;
    return c;
}

/** Turntable azimuths: `count` views evenly spaced over a half turn, because a silhouette at yaw and yaw+PI is the same picture. */
export function turntable(count) {
    return Array.from({ length: count }, (_, i) => (i * Math.PI) / count);
}

/** Does grid A contain grid B everywhere? The containment fact, checkable rather than assumed. */
export function contains(a, b) {
    for (let i = 0; i < b.length; i++) if (b[i] && !a[i]) return false;
    return true;
}
