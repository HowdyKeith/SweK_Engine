// ui/barycentricWireframe.js
// ---------------------------------------------------------------------------------------------------------------
// THE FIX FOR A REAL, MEASURED CEILING: THREE.LineBasicMaterial's linewidth IS A NO-OP ON ALMOST EVERY BROWSER/GPU
// today (capped at 1px by the native GL line rasterizer -- a WebGL spec quirk inherited from desktop OpenGL's
// Core Profile, which is allowed to support only width 1 and every desktop driver takes that option). This is
// the well-known workaround, from mattdesl/webgl-wireframes' announcement page (MIT) and Florian Bosch's
// original "Easy Wireframe Display with Barycentric Coordinates": bake a per-vertex barycentric coordinate,
// then in the fragment shader take the distance to the nearest edge and smoothstep across it, anti-aliased and
// thickness-controllable in ONE pass -- no native line rasterizer involved at all. HAND-WRITTEN HERE, NOT
// VENDORED: the technique is public and widely published; this is an independent implementation against this
// tree's own r160 THREE.ShaderMaterial conventions, not a port of anyone's source file.
//
// *** "INNER EDGE REMOVAL" (quads stay quads, not X'd triangles) IS DERIVED HERE, NOT COPIED. *** Every triangle
// edge naturally draws under the raw technique (each of a triangle's 3 barycentric components reaches exactly 0
// along the edge opposite it, by construction). To SUPPRESS one edge -- the diagonal a triangulator adds inside
// a flat quad face, which THREE.EdgesGeometry already drops via a dihedral-angle test but WireframeGeometry does
// not -- BOTH of that edge's endpoints are given a SECOND 1, in the slot belonging to the vertex the edge is
// opposite, on top of each one's own one-hot value (barycentricGeometry's per-CORNER loop below: bumping both
// touching corners rather than picking one is what falls out naturally from asking, at each corner, "does
// either of MY two edges need hiding" -- no separate per-edge bookkeeping to decide which single endpoint wins).
// Verified by hand, component by component, before this was trusted, for BOTH the single- and double-bump case:
// for a triangle v0=(1,0,0), v1=(0,1,0), v2=(0,0,1), bumping v1 AND v2 to (1,1,0) and (1,0,1) leaves edges
// (v0,v1) [shared zero at component 2] and (v2,v0) [shared zero at component 1] untouched, while edge (v1,v2)
// now has NO component simultaneously zero at both ends -- parametrised as (t,1-t,t) with the double-bumped
// endpoints, its own minimum peaks at 0.5 at its midpoint (the largest an interior barycentric value gets) --
// so it reads as "far from any edge" exactly where a diagonal should vanish. Which physical edge counts as a
// "diagonal" is not guessed from THREE's own internal vertex order (fragile, undocumented, and specific to
// whichever primitive generator wrote it) -- it is DERIVED the same way THREE.EdgesGeometry derives it: two
// triangles sharing an edge (matched by endpoint POSITION, since an indexed primitive like BoxGeometry gives
// each face's corner its own vertex for its own normal) whose face normals are within a small angle are
// coplanar, and a coplanar shared edge is the artifact this hides.
//
// Gated in tools/ship/pipboyWireframe-selfcheck.mjs: the diagonal classification is cross-checked directly
// against THREE.EdgesGeometry's own output on a real THREE.BoxGeometry (same 12 edges, found two ways), and the
// shader is graded on a real WebGL2 context in headless Chromium -- thickness measurably changes lit pixel
// count, and turning hideDiagonals on measurably removes the coplanar diagonals from the count while leaving
// the box's 12 true edges alone.
"use strict";

const round = (v) => Math.round(v * 1e5) / 1e5;   // float-noise guard for position-based edge matching
const posKey = (x, y, z) => round(x) + "," + round(y) + "," + round(z);
const edgeKey = (a, b) => { const ka = posKey(a[0], a[1], a[2]), kb = posKey(b[0], b[1], b[2]); return ka < kb ? ka + "|" + kb : kb + "|" + ka; };

/**
 * Which of each triangle's 3 local edges (opposite local vertex 0, 1, 2 respectively) are coplanar diagonals --
 * shared with exactly one other triangle whose face normal agrees within `thresholdDeg`. Pure geometry, no
 * THREE dependency: `positions` is a flat [x,y,z, x,y,z, ...] array indexed by `index` (one entry per triangle
 * corner, length a multiple of 3). Exported so the selfcheck can call it directly on known fixtures.
 */
export function classifyDiagonals(positions, index, thresholdDeg = 1) {
    const triCount = index.length / 3;
    const P = (i) => { const b = index[i] * 3; return [positions[b], positions[b + 1], positions[b + 2]]; };
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cosThresh = Math.cos(thresholdDeg * Math.PI / 180);

    const faceNormal = new Array(triCount);
    const localVerts = new Array(triCount);   // [p0, p1, p2] per triangle, cached
    const byEdge = new Map();                 // edgeKey -> [{tri, local}]
    for (let t = 0; t < triCount; t++) {
        const p0 = P(t * 3), p1 = P(t * 3 + 1), p2 = P(t * 3 + 2);
        localVerts[t] = [p0, p1, p2];
        faceNormal[t] = norm(cross(sub(p1, p0), sub(p2, p0)));
        const edges = [[p1, p2, 0], [p2, p0, 1], [p0, p1, 2]];   // edge index = the LOCAL vertex it's opposite
        for (const [a, b, opp] of edges) {
            const k = edgeKey(a, b);
            if (!byEdge.has(k)) byEdge.set(k, []);
            byEdge.get(k).push({ tri: t, opp });
        }
    }

    const result = new Array(triCount);
    for (let t = 0; t < triCount; t++) result[t] = [false, false, false];
    for (const entries of byEdge.values()) {
        if (entries.length !== 2) continue;   // a boundary edge (1) or a non-manifold one (3+): never a diagonal
        const [e0, e1] = entries;
        if (e0.tri === e1.tri) continue;      // degenerate: a triangle sharing an edge with itself
        if (dot(faceNormal[e0.tri], faceNormal[e1.tri]) >= cosThresh) {
            result[e0.tri][e0.opp] = true;
            result[e1.tri][e1.opp] = true;
        }
    }
    return result;
}

/**
 * A new, non-indexed THREE.BufferGeometry carrying `position` (copied per-triangle-corner, so no two triangles
 * share a vertex -- the barycentric technique needs each corner free to carry its own value) and `barycentric`
 * (vec3, one-hot per corner, with the "inner edge removal" two-hot bump applied where classifyDiagonals says a
 * coplanar diagonal sits and `hideDiagonals` is true).
 */
export function barycentricGeometry(THREE, sourceGeometry, { hideDiagonals = false, thresholdDeg = 1 } = {}) {
    const srcPos = sourceGeometry.attributes.position;
    const srcIndex = sourceGeometry.index
        ? sourceGeometry.index.array
        : Uint32Array.from({ length: srcPos.count }, (_, i) => i);   // already-unindexed source: identity index
    const triCount = srcIndex.length / 3;
    const diagonals = hideDiagonals ? classifyDiagonals(srcPos.array, srcIndex, thresholdDeg) : null;

    const outPos = new Float32Array(triCount * 3 * 3);
    const outBary = new Float32Array(triCount * 3 * 3);
    const ONE_HOT = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let t = 0; t < triCount; t++) {
        const hide = diagonals ? diagonals[t] : null;
        for (let c = 0; c < 3; c++) {
            const vi = srcIndex[t * 3 + c], po = (t * 3 + c) * 3, sp = vi * 3;
            outPos[po] = srcPos.array[sp]; outPos[po + 1] = srcPos.array[sp + 1]; outPos[po + 2] = srcPos.array[sp + 2];
            const b = ONE_HOT[c].slice();
            if (hide) {
                // this corner's OWN one-hot slot is c; bump it into the slot of whichever local edge (opposite
                // vertex 0, 1 or 2) touches corner c and is flagged hidden -- corner c is an endpoint of the two
                // edges NOT opposite itself, i.e. opposite indices (c+1)%3 and (c+2)%3.
                const oppA = (c + 1) % 3, oppB = (c + 2) % 3;
                if (hide[oppA]) b[oppA] = 1;
                if (hide[oppB]) b[oppB] = 1;
            }
            outBary[po] = b[0]; outBary[po + 1] = b[1]; outBary[po + 2] = b[2];
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(outPos, 3));
    geo.setAttribute("barycentric", new THREE.BufferAttribute(outBary, 3));
    return geo;
}

export const WIREFRAME_VERT_GLSL = /* glsl */ `
attribute vec3 barycentric;
varying vec3 vBarycentric;
void main() {
    vBarycentric = barycentric;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// screen-space (fwidth-scaled) edge test -- mattdesl's own computeScreenSpaceWireframe shape, the one their own
// reference names as the "fixed width regardless of z-depth" route: thickness is a constant NUMBER OF PIXELS at
// any zoom, matching the CURRENT LineBasicMaterial output's own invariant (a GL line is exactly 1px at any zoom).
export const WIREFRAME_FRAG_GLSL = /* glsl */ `
precision mediump float;
varying vec3 vBarycentric;
uniform vec3 color;
uniform float opacity;
uniform float thickness;
void main() {
    vec3 d = fwidth(vBarycentric);
    // *** THE LOWER BOUND MUST NEVER GO NEGATIVE -- MEASURED, NOT ASSUMED SAFE. *** At thickness < 1 the naive
    // d*(thickness*0.5 - 0.5) is negative, and since a barycentric coordinate is never negative, smoothstep's
    // t = clamp((x-edge0)/(edge1-edge0), 0, 1) is then ALREADY partway to 1 at x = 0 (exactly on a real edge) --
    // measured on a real box: thickness 0.5 rendered MORE lit pixels than thickness 1.0 (4486 vs 806, the
    // opposite of what "thinner" should do), because whole faces read as "always inside the transition" wherever
    // fwidth is large (steeply foreshortened triangles, common at a box's own silhouette). max(0.0, ...) pins
    // edge0 at 0 so a point exactly on an edge is always the true start of the transition.
    vec3 lo = max(vec3(0.0), d * (thickness * 0.5 - 0.5));
    vec3 s = smoothstep(lo, lo + d, vBarycentric);
    float edge = 1.0 - min(min(s.x, s.y), s.z);
    float a = edge * opacity;
    if (a <= 0.003) discard;
    gl_FragColor = vec4(color, a);
}`;

export function wireframeMaterial(THREE, { color = 0xffffff, thickness = 2.0, opacity = 1 } = {}) {
    return new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: opacity }, thickness: { value: thickness } },
        vertexShader: WIREFRAME_VERT_GLSL, fragmentShader: WIREFRAME_FRAG_GLSL,
        transparent: true, depthWrite: true, depthTest: true, side: THREE.DoubleSide,
    });
}

/** geometry + material + Mesh, in one call -- the drop-in replacement for wireBox/wireCyl's own
 *  EdgesGeometry/WireframeGeometry + LineBasicMaterial + LineSegments shape. */
export function wireframeMesh(THREE, sourceGeometry, opts = {}) {
    const geometry = barycentricGeometry(THREE, sourceGeometry, opts);
    const material = wireframeMaterial(THREE, opts);
    return { mesh: new THREE.Mesh(geometry, material), geometry, material };
}
