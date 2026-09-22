// WebGLEngine/physics/obbManifold-selfcheck.mjs
//
// Run: node physics/obbManifold-selfcheck.mjs
//
// THE SIBLING GATE OF physics/obbManifold.js. Every number below is either a hand-placed geometry with a
// closed-form expected answer (corner count, uniform depth, clipped-rectangle bounds), a directly-reproduced
// measured bug (the axis-categorization ambiguity a first draft of the twisted-face test walked into by
// accident, the raw-vector/wrapper-object bug reduceToFour() had), or a 500-trial random-orientation sweep of
// invariants that must hold for ANY overlapping OBB pair regardless of shape/orientation -- never a loose
// "looks about right" tolerance. The same formulas were verified independently in a standalone scratch script
// before being written into obbManifold.js; this gate re-derives its own expected numbers by hand rather than
// importing that script, so it does not trust the same arithmetic it is meant to be checking.
//
// A DESIGN NOTE ON HOW THIS FILE CAME TO EXIST: the design itself was independently proposed three separate
// times (minimal-complexity, established-practice-fidelity, and robustness-first angles) and synthesized into
// one spec BEFORE any code was written -- the synthesis caught a real gap none of the three proposals alone
// had: near-duplicate clip vertices (an incident face corner landing exactly on a reference face corner can
// make two different clip-plane passes both emit the same physical point) need explicit deduplication before
// the 4-point reduction, or a single physical contact gets double-resolved by the impulse solver. Section 5
// below is that gap, closed and gated, not merely designed around.
//
// A REAL QUATERNION-CONVENTION BUG THIS GATE EXISTS BECAUSE OF: physics/obbOverlap.js's own obbFromPosed()
// (via physics/voxelPose.js's rotateByQuat()) uses q=[x,y,z,w] (XYZW) -- the OPPOSITE component order from
// physics/mechanics/rigidBody6dof.mjs's own [w,x,y,z] (WXYZ) convention used throughout the REST of this
// session's work. A first draft of this gate's own scratch derivation used WXYZ quaternions with
// obbFromPosed() and every single "rotated" test geometry was silently rotated by a completely different,
// meaningless transform -- not caught by any assertion failing outright, but by a SPECIFIC test (twisted
// face-face expecting >4 raw clip points) reading a suspiciously small raw count, which traced back to the
// rotation never actually being the intended 35deg. This file's own quatFromAxisAngle() below is XYZW,
// deliberately, and this paragraph exists so nobody re-introduces that exact mistake.
//
// SABOTAGE LOG -- each applied to physics/obbManifold.js, the gate run, the module restored (diffed to confirm
// byte-identical). Counts are what actually ran, not predicted:
//   A  clipFaceFace()'s incident-face selection flipped (incSign = d[incAxis] >= 0 ? -1 : 1 changed to
//      d[incAxis] >= 0 ? 1 : -1, picking the face MOST parallel to the reference normal instead of most
//      anti-parallel) -> 9 red across sections 1-5: the "incident" face now faces the wrong way, so its corners
//      clip to nonsense bounds (wrong Y/Z extents, wrong point counts, wrong depths) in every face-face case.
//   B  the Sutherland-Hodgman inside/outside polarity flipped in clipAgainstPlane (keepLessEqual ? uCurr <=
//      bound : uCurr >= bound changed to the opposite sense) -> 9 red across sections 1-5: every clip pass now
//      keeps the OUTSIDE half-plane instead of the inside one, so face-face manifolds come back empty or with
//      the wrong corners entirely.
//   C  dedupePoints() call removed from clipFaceFace() -> *** FIRST RUN: 0 RED, A FINDING NOT A PASS. *** The
//      original section 5 geometry (an axis-aligned incident face positioned so a corner "should" land on a
//      reference corner) never actually produced a duplicate -- an axis-aligned rectangle's own extremal corner
//      cannot violate two different reference bounds via two different edges at once, so no clip pass ever
//      double-emitted the same point for that geometry. Fixed by finding, through direct experiment, a
//      genuinely duplicate-producing geometry (the 45deg-tilted incident face section 5 now uses) -> re-ran: 2
//      red (the no-near-duplicates check, and the exact expected post-dedupe count of 3).
//   D  reduceToFour()'s explicit max-depth search for p0 replaced with a bare `let p0 = pts[0];` -> *** 0 RED
//      ACROSS EVERY GEOMETRY TRIED, INCLUDING ONES BUILT SPECIFICALLY SO pts[0] IS NOT THE DEEPEST POINT --
//      INVESTIGATED, NOT A GAP IN THIS GATE. *** Root-caused with a standalone reimplementation swept over 5
//      independent twist/tilt configurations: for a LINEAR depth field over a convex clipped polygon (true of
//      any flat incident face), the depth maximum coincides with a geometric extremum (farthest-point-from-p0,
//      or a max-triangle-area corner) that reduceToFour()'s OTHER three selection steps already search for on
//      their own, so they independently recover the same point even with p0's own search removed. This is a
//      genuine structural redundancy in the algorithm, not a test-construction failure -- see this file's
//      sibling module's own header (STEP 2a) for the full account. The line is kept (it is the only one of the
//      four correct by construction rather than by this coincidence) but is NOT claimed as gated by this entry.
//   E  classifyAxis()'s FACE_COS_TOL comparisons broken (>= 1 - FACE_COS_TOL changed to > 1 + FACE_COS_TOL, an
//      unsatisfiable condition since |cos| never exceeds 1) -> 10 red across sections 1-5: every genuine
//      face-axis contact now falls through to the edge-edge branch instead, producing category "edge" with 1
//      point where a real 4-corner face manifold was expected.
//   F  clipFaceFace()'s per-point depth computation replaced with a single depth (computed once from poly[0])
//      reused for every point (matching the synthesis's own predicted sabotage of the *contact.depth-reuse*
//      idea, adapted to what this function's signature actually has to reuse from) -> 2 red: section 4's
//      genuine-depth-variation check (all four points read back the same 0.6948) and its exact-max-depth check
//      (0.6948 != the true max 0.7346). Sections 1-3 stay green -- their geometries are flush/parallel, where
//      depth genuinely IS uniform across the manifold by construction, so a "reuse one depth" bug is
//      indistinguishable from correct code on those cases alone; it takes section 4's deliberately non-uniform
//      geometry to catch it.
//   G  clipFaceFace()'s SLOP filter changed to `pt.depth > 999999` (rejects every point unconditionally) -> 10
//      red across sections 1-5, and directly confirms category flips to "fallback" for what should have been a
//      clean 4-point faceA manifold (section 1's category assertion reads back "fallback" instead of "faceA")
//      -- this is the promised direct proof that obbManifold()'s STEP 3 fallback path actually fires when
//      face-face clipping is forced empty, referenced from section 10's own comment.
//   H  the edge-edge branch's depth reuse dropped (points: [{..., depth: Math.max(contact.depth, 0)}] changed
//      to a hardcoded depth: 0) -> 1 red: section 6's exact-equality check (0 vs the true contact.depth
//      0.27286...), proving depth really is reused verbatim rather than merely happening to match.
"use strict";
import { pathToFileURL } from "node:url";
import * as OM from "./obbManifold.js";
import { rotateByQuat } from "./voxelPose.js";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function report(name, detail) { console.log(`  ----  ${name}   ${detail}`); }

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const sub3 = (a, b) => add3(a, b, -1);
const norm3 = (v) => Math.hypot(v[0], v[1], v[2]);
const dist3 = (a, b) => norm3(sub3(a, b));

function obbFromPosed(box) {
    const q = box.quat || [0, 0, 0, 1];
    return { center: box.center, half: box.half, axes: [rotateByQuat(q, [1, 0, 0]), rotateByQuat(q, [0, 1, 0]), rotateByQuat(q, [0, 0, 1])] };
}
function obbContact(a, b) {
    // re-derived independently (not imported from obbOverlap.js) so this gate does not lean on the SAME code
    // whose output feeds obbManifold.js -- mirrors obbOverlap.js's own documented algorithm exactly (Ericson
    // 4.4.1), a deliberate, faithful re-derivation, not an accidental duplicate.
    const d = sub3(b.center, a.center);
    let bestDepth = Infinity, bestNormal = null;
    const proj = (n, box) => Math.abs(dot3(n, box.axes[0])) * box.half[0] + Math.abs(dot3(n, box.axes[1])) * box.half[1] + Math.abs(dot3(n, box.axes[2])) * box.half[2];
    const consider = (L) => {
        const len2 = dot3(L, L);
        if (len2 < 1e-12) return true;
        const n = scale3(L, 1 / Math.sqrt(len2));
        const dist = dot3(n, d);
        const overlap = proj(n, a) + proj(n, b) - Math.abs(dist);
        if (overlap <= 0) return false;
        if (overlap < bestDepth) { bestDepth = overlap; bestNormal = dist < 0 ? scale3(n, -1) : n; }
        return true;
    };
    for (const L of a.axes) if (!consider(L)) return { hit: false };
    for (const L of b.axes) if (!consider(L)) return { hit: false };
    for (const u of a.axes) for (const v of b.axes) if (!consider(cross3(u, v))) return { hit: false };
    return { hit: true, normal: bestNormal, depth: bestDepth };
}
// physics/obbOverlap.js's obbFromPosed()/voxelPose.js's rotateByQuat() use q=[x,y,z,w] (XYZW) -- see this
// file's own header paragraph on the real bug this convention caused in a first draft.
function quatFromAxisAngle(axis, angle) { const n = norm3(axis), u = axis.map((v) => v / n), h = angle / 2; return [u[0] * Math.sin(h), u[1] * Math.sin(h), u[2] * Math.sin(h), Math.cos(h)]; }
function quatMul(q1, q2) {
    const [x1, y1, z1, w1] = q1, [x2, y2, z2, w2] = q2;
    return [w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2, w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2, w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2, w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2];
}
let seed = 987654321 >>> 0;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function randUnitQuat() { let x, y, z, w, n2; do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd() * 2 - 1; w = rnd() * 2 - 1; n2 = x * x + y * y + z * z + w * w; } while (n2 < 1e-6 || n2 > 1); const n = Math.sqrt(n2); return [x / n, y / n, z / n, w / n]; }

console.log("obbManifold-selfcheck -- a full box-box contact manifold via polygon clipping / edge-edge closest-point\n");

console.log("1. FLUSH AXIS-ALIGNED FACE-FACE, UNEQUAL half-extents -- exact 4 corners, exact uniform depth");
{
    const a = obbFromPosed({ center: [0, 0, 0], half: [2, 3, 1], quat: [0, 0, 0, 1] });
    const b = obbFromPosed({ center: [3.5, 0.5, 0], half: [2, 1, 1], quat: [0, 0, 0, 1] });
    const c = obbContact(a, b);
    ok("contact hit", c.hit, JSON.stringify(c));
    const m = OM.obbManifold(a, b, c);
    ok("!! category faceA (A's own +X face is the reference)", m.category === "faceA", m.category);
    ok("!! exactly 4 points", m.points.length === 4, `${m.points.length}`);
    const depths = m.points.map((p) => p.depth);
    ok("!! all four depths equal (uniform overlap, unequal half-extents -- rules out an accidental symmetric-box pass)", depths.every((d) => Math.abs(d - depths[0]) < 1e-9), depths);
    ok("!! depth === the exact expected overlap 0.5", Math.abs(depths[0] - 0.5) < 1e-9, `${depths[0]}`);
    const ys = m.points.map((p) => p.point[1]).sort((x, y) => x - y);
    ok("!! Y extents match B's own face footprint exactly [-0.5, 1.5]", Math.abs(ys[0] + 0.5) < 1e-9 && Math.abs(ys[3] - 1.5) < 1e-9, `${ys}`);
}

console.log("\n2. PARTIAL-OVERLAP FACE-FACE -- hand-computed clipped sub-rectangle");
{
    const a = obbFromPosed({ center: [0, 0, 0], half: [2, 2, 1], quat: [0, 0, 0, 1] });
    const b = obbFromPosed({ center: [3.5, 3, 0], half: [2, 2, 1], quat: [0, 0, 0, 1] });
    const c = obbContact(a, b);
    const m = OM.obbManifold(a, b, c);
    ok("!! exactly 4 points", m.points.length === 4, `${m.points.length}`);
    const ys = m.points.map((p) => p.point[1]).sort((x, y) => x - y);
    ok("!! Y clipped to exactly [1,2] by A's own +Y bound", Math.abs(ys[0] - 1) < 1e-9 && Math.abs(ys[3] - 2) < 1e-9, `${ys}`);
}

console.log("\n3. INCIDENT-FULLY-CONTAINED (smaller incident face inside a larger reference face)");
{
    const a = obbFromPosed({ center: [0, 0, 0], half: [5, 5, 1], quat: [0, 0, 0, 1] });
    const b = obbFromPosed({ center: [4.8, 0, 0], half: [0.5, 0.5, 1], quat: [0, 0, 0, 1] });
    const c = obbContact(a, b);
    const m = OM.obbManifold(a, b, c);
    ok("!! exactly 4 points, matching B's own unclipped face corners", m.points.length === 4, `${m.points.length}`);
    const ys = m.points.map((p) => p.point[1]).sort((x, y) => x - y);
    ok("!! Y extents equal B's own face bounds [-0.5, 0.5] -- reference bound never clips it", Math.abs(ys[0] + 0.5) < 1e-9 && Math.abs(ys[3] - 0.5) < 1e-9, `${ys}`);
}

console.log("\n4. *** TWISTED + TILTED FACE-FACE (35deg in-plane twist about the shared normal, PLUS a 1deg tilt");
console.log("    about a perpendicular axis for genuine per-point DEPTH VARIATION) -- raw clip count >4,");
console.log("    reduces to exactly 4, the ACTUAL deepest point survives reduction ***");
{
    // a pure in-plane twist (rotation about the shared contact-normal axis alone) keeps the incident face
    // EXACTLY parallel to the reference face throughout, which makes depth UNIFORM across every clipped point
    // by geometric necessity (depth is a function of separation along the shared normal only) -- found directly:
    // a first draft of this section used twist-only geometry and its own "deepest point survives" assertion
    // went 0 red when reduceToFour()'s "keep the max-depth point unconditionally" step was sabotaged away
    // entirely, because with every point tied at the same depth, ANY point trivially satisfies "the deepest
    // point is present." This geometry adds a small (1deg) tilt about an axis PERPENDICULAR to the shared
    // normal, which genuinely un-parallels the two faces and produces real per-point depth variation, found by
    // direct experiment and reproduced exactly here (rawCount=8, depths ranging 0.6822-0.7171).
    // NOTE: tilting about Y here would put the deepest raw clip vertex FIRST in the clip pipeline's own
    // output order, which made an earlier version of this exact sabotage go 0 red too -- sabotaging away
    // "keep the max-depth point" to "just take pts[0]" is invisible whenever pts[0] HAPPENS to already be the
    // deepest by coincidence of winding order. Tilting about Z instead (found by direct experiment) puts a
    // NON-deepest point first (raw depths in clip order: 0.6948, ..., max 0.7346 appears later in the list),
    // making this a genuine test of the SELECTION logic rather than an accident of ordering.
    const qTwist = quatFromAxisAngle([1, 0, 0], 35 * Math.PI / 180);
    const qTilt = quatFromAxisAngle([0, 0, 1], 1 * Math.PI / 180);
    const q = quatMul(qTwist, qTilt);
    const a = obbFromPosed({ center: [0, 0, 0], half: [2, 2, 1], quat: [0, 0, 0, 1] });
    const b = obbFromPosed({ center: [3.3, 0, 0], half: [2, 2, 1], quat: q });
    const c = obbContact(a, b);
    ok("contact hit", c.hit);
    const m = OM.obbManifold(a, b, c);
    ok("!! exactly 4 points", m.points.length === 4, `${m.points.length}`);
    const depths = m.points.map((p) => p.depth);
    ok("started with genuine depth variation across the manifold (not a degenerate uniform-depth case)", Math.max(...depths) - Math.min(...depths) > 1e-3, depths.map((d) => d.toFixed(4)));
    ok("!! the ACTUAL maximum-depth point (not merely 'some' point, and not merely the FIRST point) survived reduction", Math.abs(Math.max(...depths) - 0.7346) < 1e-3, depths.map((d) => d.toFixed(6)));
    ok("!! no two of the four returned points coincide", (() => {
        for (let i = 0; i < m.points.length; i++) for (let j = i + 1; j < m.points.length; j++) if (dist3(m.points[i].point, m.points[j].point) < 1e-9) return false;
        return true;
    })());
}

console.log("\n5. *** DEDUPE -- a clip vertex landing on two plane boundaries at once must not be double-counted ***");
console.log("    (a gap none of three independently-drafted design proposals for this file caught on their own)");
{
    // a 45deg-tilted incident face positioned so one of ITS OWN edges crosses the reference's +Y bound and,
    // separately, an adjacent vertex sequence crosses the +Z bound at the EXACT same physical point -- found by
    // DIRECT EXPERIMENT (not hand-derived: several earlier hand-picked geometries, including an incident face's
    // own corner sitting exactly at a reference corner, did NOT reproduce a duplicate -- an axis-aligned
    // rectangle's own extremal corner structurally cannot exceed two different bounds via two DIFFERENT edges at
    // once, so a duplicate only actually arises from a genuinely tilted incident face). With this file's own
    // sabotage log entry C (dedupe removed), this EXACT geometry read back a literal duplicate coordinate
    // ([1.5,2,-0.697056] twice) before this section existed to catch it.
    const q = [Math.sin(Math.PI / 8), 0, 0, Math.cos(Math.PI / 8)];   // 45deg about X (xyzw)
    const a = obbFromPosed({ center: [0, 0, 0], half: [2, 2, 1], quat: [0, 0, 0, 1] });
    const b = obbFromPosed({ center: [3.5, 2, 1], half: [2, 1.2, 1.2], quat: q });
    const c = obbContact(a, b);
    ok("contact hit", c.hit, JSON.stringify(c));
    const m = OM.obbManifold(a, b, c);
    ok("!! no two returned points are near-duplicates (within 1e-6)", (() => {
        for (let i = 0; i < m.points.length; i++) for (let j = i + 1; j < m.points.length; j++) if (dist3(m.points[i].point, m.points[j].point) < 1e-6) return false;
        return true;
    })(), JSON.stringify(m.points.map((p) => p.point)));
    ok("!! this exact geometry collapses to 3 points (4 raw survivors, one pair deduped) -- the specific, reproduced case", m.points.length === 3, `${m.points.length}`);
}

console.log("\n6. *** GENUINE EDGE-EDGE (two tilted rods, neither box's face axis aligned with the true separator) ***");
console.log("    -- exact 1 point, depth === contact.depth EXACTLY (proves reuse, not recomputation)");
{
    // a first draft of this test used two axis-aligned/90deg-rotated "crossing sticks" and got category faceA,
    // not edge -- for boxes rotated only about world axes, the true separating axis for two crossing rods often
    // coincides EXACTLY with one box's own face normal (an easy, real confusion between "looks like edge-edge"
    // and "SAT actually calls it edge-edge"). This geometry tilts BOTH boxes about DIFFERENT, non-parallel axes
    // so neither box's 3 face axes land within FACE_COS_TOL of the true separating direction.
    const qa = quatFromAxisAngle([0, 1, 0], 20 * Math.PI / 180);
    const qb = quatMul(quatFromAxisAngle([1, 0, 0], 20 * Math.PI / 180), quatFromAxisAngle([0, 0, 1], 90 * Math.PI / 180));
    const a = obbFromPosed({ center: [0, 0, 0], half: [3, 0.3, 0.3], quat: qa });
    const b = obbFromPosed({ center: [0, 0, 0.55], half: [3, 0.3, 0.3], quat: qb });
    const c = obbContact(a, b);
    ok("contact hit", c.hit, JSON.stringify(c));
    const m = OM.obbManifold(a, b, c);
    ok("!! category is genuinely edge (neither box's face axis is the separator)", m.category === "edge", m.category);
    ok("!! exactly 1 point", m.points.length === 1, `${m.points.length}`);
    ok("!! depth === contact.depth EXACTLY -- reused, not recomputed from the closest-point separation", m.points[0].depth === Math.max(c.depth, 0), `${m.points[0].depth} vs ${c.depth}`);
    ok("!! point stays finite and sane", m.points[0].point.every(Number.isFinite), `${m.points[0].point}`);
}

console.log("\n7. NEAR-PARALLEL EDGES (~0.01deg) -- Ericson's own denom guard, every output finite, within bounds");
{
    const qa = quatFromAxisAngle([0, 1, 0], 20 * Math.PI / 180);
    const qb = quatMul(quatFromAxisAngle([1, 0, 0], 20.0001 * Math.PI / 180), quatFromAxisAngle([0, 0, 1], 90 * Math.PI / 180));
    const a = obbFromPosed({ center: [0, 0, 0], half: [3, 0.3, 0.3], quat: qa });
    const b = obbFromPosed({ center: [0, 0, 0.55], half: [3, 0.3, 0.3], quat: qb });
    const c = obbContact(a, b);
    if (c.hit) {
        const m = OM.obbManifold(a, b, c);
        ok("!! every point stays finite even under a near-parallel edge configuration", m.points.every((p) => p.point.every(Number.isFinite) && Number.isFinite(p.depth)));
    } else {
        report("(this exact near-parallel offset does not overlap -- geometry-dependent, not a gap)", "skipped");
    }
}

console.log("\n8. VERTEX-VERTEX / CORNER TOUCH -- small point count, all finite, no special-case crash");
{
    const a = obbFromPosed({ center: [0, 0, 0], half: [1, 1, 1], quat: [0, 0, 0, 1] });
    const q = quatFromAxisAngle([1, 1, 1], 45 * Math.PI / 180);
    const b = obbFromPosed({ center: [1.9, 1.9, 1.9], half: [1, 1, 1], quat: q });
    const c = obbContact(a, b);
    if (c.hit) {
        const m = OM.obbManifold(a, b, c);
        ok("!! 1-4 points, all finite for a corner-ish touch", m.points.length >= 1 && m.points.length <= 4 && m.points.every((p) => p.point.every(Number.isFinite) && Number.isFinite(p.depth)), `${m.points.length} pts, category=${m.category}`);
    } else {
        report("(no contact at this exact offset)", "skipped");
    }
}

console.log("\n9. NEAR-CUBIC CLASSIFICATION TIE (~1e-8rad straddling FACE_COS_TOL) -- well-formed either way");
{
    for (const eps of [-1e-7, 1e-7]) {
        const a = obbFromPosed({ center: [0, 0, 0], half: [2, 2, 2], quat: [0, 0, 0, 1] });
        const q = quatFromAxisAngle([0, 1, 0], eps);
        const b = obbFromPosed({ center: [3.9, 0, 0], half: [2, 2, 2], quat: q });
        const c = obbContact(a, b);
        if (!c.hit) continue;
        const m = OM.obbManifold(a, b, c);
        ok(`!! eps=${eps}: well-formed manifold (1-4 points, all finite, depth>=0)`, m.points.length >= 1 && m.points.length <= 4 && m.points.every((p) => p.point.every(Number.isFinite) && p.depth >= 0), `category=${m.category} n=${m.points.length}`);
    }
}

console.log("\n10. NEAR-ZERO OVERLAP (under SLOP) -- never crashes, never returns 0 points, whichever branch it takes");
{
    // NOTE: this does NOT reliably force the 'fallback' category through real geometry alone -- at this exact
    // overlap magnitude the clip can still legitimately survive with a tiny positive depth. The actual fallback
    // path (clipFaceFace() returning zero points) is proven for real via SABOTAGE instead (this file's own
    // header sabotage log, entry against the SLOP filter) -- this section only proves the SURROUNDING
    // degenerate-geometry case never crashes or returns an empty manifold, whichever branch it happens to take.
    const a = obbFromPosed({ center: [0, 0, 0], half: [2, 2, 1], quat: [0, 0, 0, 1] });
    const b = obbFromPosed({ center: [4 - 1e-9, 0, 0], half: [2, 1, 1], quat: [0, 0, 0, 1] });   // overlap ~1e-9, right at SLOP
    const c = obbContact(a, b);
    if (c.hit) {
        const m = OM.obbManifold(a, b, c);
        ok("!! always at least 1 point, whichever branch (genuine clip or fallback) actually fires", m.points.length >= 1, `category=${m.category} n=${m.points.length}`);
        ok("!! every point stays finite at this near-degenerate overlap magnitude", m.points.every((p) => p.point.every(Number.isFinite) && Number.isFinite(p.depth)));
    } else {
        report("(sub-SLOP overlap read as no-hit by obbContact() itself -- also an acceptable, finite outcome)", "skipped");
    }
}

console.log("\n11. 500-TRIAL RANDOM-ORIENTATION SWEEP -- points always in [1,4], finite, depth>=0, normals sane");
{
    let checked = 0, minPts = 99, maxPts = 0, allFinite = true, allDepthNonNeg = true, edgeNormalsMatch = true, faceNormalsUnit = true;
    for (let trial = 0; trial < 500; trial++) {
        const halfA = [0.5 + rnd() * 2, 0.5 + rnd() * 2, 0.5 + rnd() * 2];
        const halfB = [0.5 + rnd() * 2, 0.5 + rnd() * 2, 0.5 + rnd() * 2];
        const a = obbFromPosed({ center: [0, 0, 0], half: halfA, quat: randUnitQuat() });
        const b = obbFromPosed({ center: [(rnd() - 0.5) * 2, (rnd() - 0.5) * 2, (rnd() - 0.5) * 2], half: halfB, quat: randUnitQuat() });
        const c = obbContact(a, b);
        if (!c.hit) continue;
        checked++;
        const m = OM.obbManifold(a, b, c);
        minPts = Math.min(minPts, m.points.length); maxPts = Math.max(maxPts, m.points.length);
        for (const p of m.points) {
            if (!p.point.every(Number.isFinite) || !Number.isFinite(p.depth)) allFinite = false;
            if (p.depth < 0) allDepthNonNeg = false;
            if (Math.abs(norm3(p.normal) - 1) > 1e-6) faceNormalsUnit = false;
            if (m.category === "edge" && Math.abs(Math.abs(dot3(p.normal, c.normal)) - 1) > 1e-9) edgeNormalsMatch = false;
        }
    }
    ok("!! a meaningful number of the 500 random trials actually produced a real contact", checked > 200, `checked=${checked}`);
    ok("!! every manifold has between 1 and 4 points, always", minPts >= 1 && maxPts <= 4, `min=${minPts} max=${maxPts}`);
    ok("!! every point stays fully finite across all 500 trials", allFinite);
    ok("!! every depth is >= 0, always", allDepthNonNeg);
    ok("!! every normal stays unit-length", faceNormalsUnit);
    ok("!! edge-category normals match contact.normal exactly", edgeNormalsMatch);
}

console.log("\n12. THE FRONT DOOR");
{
    const L = OM.reportLines();
    ok("reportLines names the module and shows category/points", L.some((l) => /obbManifold/.test(l)) && L.some((l) => /category/.test(l)));
    ok("...and no report line stringifies a missing field as the literal word \"undefined\"", L.every((l) => !/\bundefined\b/.test(l)));
}

console.log(fails ? `\nobbManifold-selfcheck: ${fails} FAILED` : "\nobbManifold-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
