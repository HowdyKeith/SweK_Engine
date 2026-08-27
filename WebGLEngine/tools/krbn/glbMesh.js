// tools/krbn/glbMesh.js -- v4046
// ---------------------------------------------------------------------------------------------------------------
// ONE glTF -> MeshInput CONVERTER, because there are now two pages that need it.
//
// v4044 built this inline in krbn-compare.html for Keith's "lets add a skinning pass". v4046 adds a Krbn avatar
// surface to server.html, which needs the identical thing: bytes in, { positions, triangles } out, posed. Copying
// it would be the second-copy defect this tree names more than any other -- and it would be the WORST kind,
// because every one of the four corrections below is invisible when wrong. A drifted copy would not crash; it
// would draw a bind pose, or a figure on its back, or throw deep inside Krbn's half-edge builder, on ONE of the
// two pages, and look like a bug in that page.
//
// THE FOUR THINGS THIS KNOWS, EACH MEASURED RATHER THAN ASSUMED:
//
//   1. SKINNING. A glTF's POSITION attribute is in BIND space. RobotExpressive.glb read raw measures
//      0.066 x 0.026 x 0.017 with the limbs splayed; the same vertices pushed through their joint matrices
//      measure 3.099 x 2.628 x 4.497. face/avatarStage.js's v4032 note measured the identical gap from the
//      other side (~0.026 bind against ~4.5 posed). A bind pose is not a slightly-wrong figure, it is a
//      different object.
//   2. THE POSE COMES FROM A CLIP. Bone matrices mean nothing until the skeleton is placed, so an
//      AnimationMixer plays the idle clip and is stepped to t=0 -- deterministic, and the pose the asset was
//      authored to be seen in. *** THE MIXER MUST RUN BEFORE updateMatrixWorld, *** or the rest pose is baked
//      and the clip is silently lost.
//   3. Y-UP -> Z-UP. glTF is Y-up; this tree is Z-up and says so in portfolio/krbn/swek-ragdoll.krbn.ts
//      ("SweK is Y-up and Krbn is Z-up, so the mapping is (x, y, z) -> (x, z, y)"), which
//      tools/krbn/sceneMeshes.js already applies. Without it a loaded model renders lying on its back.
//   4. DEGENERATE TRIANGLES. Krbn's half-edge builder does `tB.find(vi => vi !== v0 && vi !== v1)` at
//      mesh/halfedge.js:183 and dereferences positions[undefined] when a triangle's indices are not three
//      distinct vertices. RobotExpressive carries 3 such slivers. KRBN'S OWN parseOBJ/parseSTL DOCUMENT
//      DROPPING ZERO-AREA FACES -- its loaders sanitise before its mesh builder sees the data, and a glTF
//      path that converts three.js buffers directly inherits the requirement without inheriting the fix.
//
// three.js is passed IN rather than imported here: both callers already resolve it (one lazily, on the click
// that needs it), and this module has no business deciding when a 1.2 MB dependency loads.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

/**
 * Remove triangles Krbn's half-edge builder cannot survive. Idempotent, and applied to EVERY format by the
 * callers rather than only to glTF: one sanitiser that always runs beats a second rule about which paths need it.
 */
export function dropDegenerate(m) {
    const kept = [];
    let byIndex = 0, byArea = 0;
    for (const t of m.triangles) {
        const [i, j, k] = t;
        if (i === j || j === k || i === k) { byIndex++; continue; }      // the crash: not three distinct vertices
        const A = m.positions[i], B = m.positions[j], C = m.positions[k];
        if (!A || !B || !C) { byIndex++; continue; }                     // an index past the end is not geometry
        const ux = B[0]-A[0], uy = B[1]-A[1], uz = B[2]-A[2];
        const vx = C[0]-A[0], vy = C[1]-A[1], vz = C[2]-A[2];
        const cx = uy*vz - uz*vy, cy = uz*vx - ux*vz, cz = ux*vy - uy*vx;
        if (!(Math.hypot(cx, cy, cz) > 1e-20)) { byArea++; continue; }   // distinct indices, collinear points
        kept.push(t);
    }
    return (byIndex || byArea) ? { ...m, triangles: kept, dropped: byIndex + byArea } : m;
}

/**
 * A parsed glTF (three.js `gltf` object) -> Krbn MeshInput, posed and axis-corrected.
 * @param {object} gltf   the result of GLTFLoader.parse
 * @param {object} THREE  the three module (Vector3 + AnimationMixer are what is used)
 * @returns {{positions:number[][], triangles:number[][], skinned:boolean, posedBy:string, dropped?:number}}
 */
export function gltfToMeshInput(gltf, THREE) {
    const positions = [], triangles = [];
    let skinned = false, posedBy = "";

    // (2) place the skeleton FIRST -- see the header for why the ordering is load-bearing
    if (gltf.animations && gltf.animations.length) {
        const idle = gltf.animations.find((a) => /idle|breath|stand/i.test(a.name || "")) || gltf.animations[0];
        try {
            const mx = new THREE.AnimationMixer(gltf.scene);
            mx.clipAction(idle).play();
            mx.update(0);                       // t=0: the clip's first frame, deterministic
            posedBy = idle.name || "(unnamed clip)";
        } catch (e) { posedBy = ""; }
    }
    gltf.scene.updateMatrixWorld(true);         // AFTER the mixer, so bones carry the clip's rotations

    gltf.scene.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        const g3 = o.geometry, pos = g3.getAttribute("position");
        if (!pos) return;
        const isSkin = !!o.isSkinnedMesh && !!o.skeleton && !!g3.getAttribute("skinIndex");
        if (isSkin) { skinned = true; try { o.skeleton.update(); } catch (e) {} }
        const off = positions.length, v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            if (isSkin) o.applyBoneTransform(i, v);   // (1) bind space -> posed LOCAL space, three's own skinning
            v.applyMatrix4(o.matrixWorld);            // ...and both paths then go to world space
            positions.push([v.x, v.z, v.y]);          // (3) Y-up -> Z-up
        }
        const idx = g3.getIndex();
        if (idx) for (let i = 0; i + 2 < idx.count; i += 3) triangles.push([off + idx.getX(i), off + idx.getX(i+1), off + idx.getX(i+2)]);
        else for (let i = 0; i + 2 < pos.count; i += 3) triangles.push([off + i, off + i + 1, off + i + 2]);
    });

    if (!positions.length) throw new Error("no mesh geometry found in that glTF");
    return dropDegenerate({ positions, triangles, skinned, posedBy });   // (4)
}

/** Bounding-box centre and bounding-sphere radius. The centroid is a DENSITY measure and frames empty space. */
export function computeFit(m) {
    if (!m.positions.length) return { center: [0,0,0], radius: 1 };
    const lo = [Infinity,Infinity,Infinity], hi = [-Infinity,-Infinity,-Infinity];
    for (const p of m.positions) for (let i=0;i<3;i++) { if (p[i]<lo[i]) lo[i]=p[i]; if (p[i]>hi[i]) hi[i]=p[i]; }
    const c = [0,1,2].map(i => (lo[i]+hi[i])/2);
    let r = 0; for (const p of m.positions) { const d = Math.hypot(p[0]-c[0], p[1]-c[1], p[2]-c[2]); if (d > r) r = d; }
    return { center: c, radius: r || 1 };
}

/**
 * Orbit distance DERIVED FROM THE FRUSTUM rather than tuned. A bounding sphere of radius r subtends asin(r/d),
 * so it fits when d >= r/sin(halfFov). With one focal length for both axes the VERTICAL half-FOV is exactly
 * `scale` and the horizontal is wider -- but the avatar panel is PORTRAIT (143x210), where the horizontal is the
 * narrower one, so the min() is not decoration: it is what makes this correct in both orientations.
 */
export function fitDistance(r, scale, view, margin = 1.06) {
    const halfV = scale;
    const halfH = Math.atan((view.width / view.height) * Math.tan(scale));
    return (r / Math.sin(Math.min(halfV, halfH))) * margin;
}
