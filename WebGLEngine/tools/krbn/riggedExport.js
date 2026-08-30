// tools/krbn/riggedExport.js -- v4048
// ---------------------------------------------------------------------------------------------------------------
// STEP 2: the rigged pencil drawing as a real .glb that plays anywhere.
//
// Keith: "would we be able to export the krbn skinned model and export it rigged and then play that?" -- step 1
// was in-engine (krbn-rigged.html); this is the export.
//
// *** THE SHAPE OF THE PROBLEM, MEASURED ON THE ACTUAL ASSET RATHER THAN ASSUMED. *** RobotExpressive.glb:
//   4 skinned meshes and 15 UNSKINNED ones -- and all 15 hang off an existing bone, one hop up.
//   All skinned meshes share ONE bone set and ONE bind matrix, and that matrix is IDENTITY.
//   43 bones, 14 animation clips, and maxInfluencesPerVertex is ALREADY 4.
// Each of those decided something below, and none of them were guesses.
//
// *** THE FOUR-INFLUENCE CEILING IS THE REAL CONSTRAINT, AND IT BINDS HERE. *** A glTF JOINTS_0/WEIGHTS_0 set
// carries FOUR influences per vertex. A stroke point is a barycentric blend of THREE mesh vertices, each with up
// to four -- so up to TWELVE distinct joints, which must be culled to the top four and RENORMALISED or the limb
// weights silently stop summing to 1 and the mesh shrinks toward the origin as it animates. The source already
// uses all four slots, so this is not a theoretical ceiling: it is hit on real vertices.
//
// *** AND THE RIGID PARTS ARE NOT A SPECIAL CASE, THEY ARE A ONE-LINE CASE. *** An unskinned primitive parented
// to a bone is just a vertex with weight 1.0 to that bone. Because all 15 resolve to bones already in the 43,
// no synthetic joints are needed and the exported skeleton is the original one, unchanged.
//
// WHAT THIS DOES NOT DO: re-derive silhouettes. The drawing carries the outline of the pose it was drawn in,
// which krbn-rigged.html says on screen and which stays true of the exported file. Hatch and creases are
// surface-attached and animate correctly anywhere; the outline is a baked mark travelling with the surface.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

/**
 * Per-vertex (joints, weights) for the MERGED vertex list glbMesh.js produces, in the skeleton's own bone
 * index space. Traversal order is identical to skinnedGeometry()'s, because the triangle indices the strokes
 * were pinned with address this same list.
 * @returns {{joints:Int32Array, weights:Float32Array, bones:object[]}} 4 entries per vertex
 */
export function vertexSkinning(gltf, THREE) {
    // the bone list to index against: every skinned mesh shares one set (measured), so the first is the source
    let skeleton = null;
    gltf.scene.traverse((o) => { if (!skeleton && o.isSkinnedMesh && o.skeleton) skeleton = o.skeleton; });
    if (!skeleton) throw new Error("this glTF has no skinned mesh, so it carries no skeleton to bind to");
    const bones = skeleton.bones;
    const boneIndex = new Map(bones.map((b, i) => [b.uuid, i]));

    const J = [], W = [];
    gltf.scene.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        const g3 = o.geometry, pos = g3.getAttribute("position");
        if (!pos) return;
        const si = g3.getAttribute("skinIndex"), sw = g3.getAttribute("skinWeight");
        const isSkin = !!o.isSkinnedMesh && !!o.skeleton && !!si && !!sw;
        if (isSkin) {
            // the mesh's OWN skinIndex is an index into ITS skeleton's bones; remap to the shared list rather
            // than trusting the two orders to coincide
            const mine = o.skeleton.bones;
            for (let i = 0; i < pos.count; i++) for (let k = 0; k < 4; k++) {
                const local = si.getComponent(i, k), b = mine[local];
                J.push(b && boneIndex.has(b.uuid) ? boneIndex.get(b.uuid) : 0);
                W.push(sw.getComponent(i, k));
            }
        } else {
            // rigid: walk up to the first ancestor that IS a bone, and weight 1.0 to it
            let n = o.parent, hops = 0, idx = -1;
            while (n && hops < 16) { if (boneIndex.has(n.uuid)) { idx = boneIndex.get(n.uuid); break; } n = n.parent; hops++; }
            if (idx < 0) idx = 0;   // unparented geometry follows the root rather than being dropped
            for (let i = 0; i < pos.count; i++) { J.push(idx, 0, 0, 0); W.push(1, 0, 0, 0); }
        }
    });
    return { joints: Int32Array.from(J), weights: Float32Array.from(W), bones };
}

/**
 * Bind-pose (rest) positions in the skeleton's own space, in the SAME merged order. The strokes' triangle
 * indices address this list, so a stroke point's bind position is the barycentric blend of its triangle's
 * three entries here.
 *
 * NOTE the axes are NOT swapped. glbMesh.js emits Z-up for this tree's cameras; an exported glTF must stay in
 * the source's own Y-up space or every consumer will import it lying on its back.
 */
export function bindPositions(gltf, THREE) {
    let sk = null;
    gltf.scene.traverse((o) => { if (!sk && o.isSkinnedMesh && o.skeleton) sk = o.skeleton; });
    if (sk) sk.pose();                       // restore the BIND pose -- not whatever clip was last applied
    gltf.scene.updateMatrixWorld(true);
    const out = [];
    gltf.scene.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        const pos = o.geometry.getAttribute("position");
        if (!pos) return;
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            // A skinned mesh's geometry is ALREADY in bind space (its bindMatrix is identity here, measured).
            // A rigid mesh's is in its own local space, so its rest world matrix carries it into that space.
            if (!o.isSkinnedMesh) v.applyMatrix4(o.matrixWorld);
            out.push([v.x, v.y, v.z]);
        }
    });
    return out;
}

/**
 * Blend three corner influence sets by barycentric weight, then cull to the FOUR a glTF set allows.
 * *** THE RENORMALISE IS NOT TIDINESS. *** Dropping influences without rescaling leaves the remaining weights
 * summing to less than 1, and linear blend skinning reads a short sum as "move this vertex toward the origin"
 * -- the mesh visibly deflates as it animates, worst exactly where the rig is most complex.
 */
export function blendInfluences(joints, weights, tri, bary) {
    const acc = new Map();
    for (let c = 0; c < 3; c++) {
        const base = tri[c] * 4, bw = bary[c];
        if (!(bw > 0)) continue;
        for (let k = 0; k < 4; k++) {
            const w = weights[base + k] * bw;
            if (!(w > 0)) continue;
            const j = joints[base + k];
            acc.set(j, (acc.get(j) || 0) + w);
        }
    }
    const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    let sum = 0; for (const [, w] of top) sum += w;
    const J = [0, 0, 0, 0], W = [0, 0, 0, 0];
    if (!sum) { W[0] = 1; return { J, W }; }          // a point with no influence follows the root, not nothing
    for (let i = 0; i < top.length; i++) { J[i] = top[i][0]; W[i] = top[i][1] / sum; }
    return { J, W };
}

/**
 * Turn pinned strokes into a skinned TUBE geometry: a small n-gon ring per stroke point, every ring vertex
 * inheriting that point's blended influences. Tubes rather than LINES because a glTF LINES primitive is valid
 * but nothing skins it -- three's own line materials have no skinning path, so it would export "correctly" and
 * sit motionless in every viewer, which is the worst of both.
 */
export function buildStrokeTubes(THREE, rigged, triangles, bind, skin, { radius = 0.012, sides = 3 } = {}) {
    const P = [], JJ = [], WW = [], IDX = [];
    const bp = (tri, bary) => {
        const a = bind[tri[0]], b = bind[tri[1]], c = bind[tri[2]], [u, v, w] = bary;
        return new THREE.Vector3(u*a[0]+v*b[0]+w*c[0], u*a[1]+v*b[1]+w*c[1], u*a[2]+v*b[2]+w*c[2]);
    };
    for (const stroke of rigged) {
        const pts = stroke.pins.map((p) => bp(triangles[p.tri], p.bary));
        if (pts.length < 2) continue;
        const inf = stroke.pins.map((p) => blendInfluences(skin.joints, skin.weights, triangles[p.tri], p.bary));
        const ringStart = P.length / 3;
        for (let i = 0; i < pts.length; i++) {
            const prev = pts[Math.max(0, i-1)], next = pts[Math.min(pts.length-1, i+1)];
            const dir = new THREE.Vector3().subVectors(next, prev);
            if (dir.lengthSq() < 1e-20) dir.set(0, 0, 1);
            dir.normalize();
            const up = Math.abs(dir.z) > 0.9 ? new THREE.Vector3(1,0,0) : new THREE.Vector3(0,0,1);
            const n1 = new THREE.Vector3().crossVectors(dir, up).normalize();
            const n2 = new THREE.Vector3().crossVectors(dir, n1).normalize();
            for (let s = 0; s < sides; s++) {
                const a = (s / sides) * Math.PI * 2;
                P.push(pts[i].x + (n1.x*Math.cos(a) + n2.x*Math.sin(a)) * radius,
                       pts[i].y + (n1.y*Math.cos(a) + n2.y*Math.sin(a)) * radius,
                       pts[i].z + (n1.z*Math.cos(a) + n2.z*Math.sin(a)) * radius);
                JJ.push(...inf[i].J); WW.push(...inf[i].W);
            }
        }
        for (let i = 0; i + 1 < pts.length; i++) for (let s = 0; s < sides; s++) {
            const a = ringStart + i*sides + s, b = ringStart + i*sides + (s+1)%sides;
            const c = a + sides, d = b + sides;
            IDX.push(a, b, c, b, d, c);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(JJ, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(WW, 4));
    g.setIndex(IDX);
    g.computeVertexNormals();
    return g;
}

/**
 * Assemble a THREE.Scene GLTFExporter can serialize: the ORIGINAL bone hierarchy (reused, not cloned --
 * cloning would sever the animation clips' target UUIDs, and gltf.animations is passed through unchanged
 * below) plus ONE new SkinnedMesh made of the stroke tubes, bound to it.
 *
 * The original visible meshes are removed from the export graph rather than kept alongside: Keith asked for
 * the pencil drawing rigged, not the pencil drawing layered over the shaded model it was traced from.
 */
/**
 * *** GENERAL SINCE v4157: THE GEOMETRY AND ITS NAMES ARE PARAMETERS, NOT KRBN'S. ***
 * This function never knew what it was binding -- it takes a BufferGeometry carrying JOINTS/WEIGHTS in the
 * skeleton's index space and attaches it. The only Krbn in it was three hardcoded strings and a colour, which
 * is the difference between "the Krbn exporter" and "the reskin exporter". Defaults are exactly the old values,
 * so krbn-rigged.html's output is unchanged.
 */
export function buildRiggedExportScene(THREE, gltf, tubeGeometry, opts = {}) {
    let sourceSkin = null;
    gltf.scene.traverse((o) => { if (!sourceSkin && o.isSkinnedMesh) sourceSkin = o; });
    if (!sourceSkin) throw new Error("no skinned mesh in the source -- nothing to bind the drawing to");

    const scene = new THREE.Scene();
    scene.name = opts.sceneName || "krbn-rigged";
    // detach the root bone from the ORIGINAL scene graph and re-parent under a FRESH scene, so the export
    // graph is exactly {root bone hierarchy, new mesh} -- not the original scene's now-empty mesh nodes too.
    const rootBone = sourceSkin.skeleton.bones.find((b) => !sourceSkin.skeleton.bones.includes(b.parent)) || sourceSkin.skeleton.bones[0];
    let top = rootBone; while (top.parent && top.parent.isBone) top = top.parent;
    scene.add(top);

    const material = opts.material || new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.DoubleSide });
    const mesh = new THREE.SkinnedMesh(tubeGeometry, material);
    mesh.name = opts.meshName || "krbn-pencil-strokes";
    // bindMatrix identity: measured on the source (bindMatrixIsIdentity=true) and bindPositions() above builds
    // vertices directly in the skeleton's own space for exactly that reason -- no second transform to invert.
    mesh.bind(sourceSkin.skeleton, new THREE.Matrix4());
    scene.add(mesh);
    return scene;
}

/**
 * *** THE RESKIN EXPORTER. *** Any geometry already bound to the source skeleton, out as a .glb that keeps every
 * bone and every clip.
 *
 * This is the second half of exportRiggedGLB, lifted out at v4157 so the GEOMETRY SOURCE IS A PARAMETER. Krbn
 * strokes are now one caller of it rather than the only thing it can do -- tools/export/reskin.js's glyph quads
 * and vertex colours are others.
 *
 * *** `animations` IS THE LINE THAT MATTERS AND IT IS EASY TO DROP. *** GLTFExporter does NOT walk the scene for
 * clips; it serialises the array it is handed. Omitting it exports a model that looks right, binds right, and
 * has NOTHING TO PLAY -- with no error anywhere, which is the failure this whole file exists to avoid.
 */
export async function exportReskinnedGLB(THREE, GLTFExporter, gltf, geometry, opts = {}) {
    const exportScene = buildRiggedExportScene(THREE, gltf, geometry, opts);
    return await new Promise((res, rej) => new GLTFExporter().parse(
        exportScene,
        (out) => res(out),
        (err) => rej(err),
        { binary: true, animations: gltf.animations || [], includeCustomExtensions: false }
    ));
}

/**
 * The whole pipeline, glTF bytes in, rigged-drawing glTF bytes out. `onProgress` is optional and called with
 * short strings -- Krbn's render is the ~500ms step in here and a caller may want to say so on screen.
 *
 * v4157: the last two steps are now exportReskinnedGLB above. This function is what makes KRBN geometry; it is
 * no longer what knows how to export it.
 */
export async function exportRiggedGLB(THREE, GLTFExporter, K, gltf, mesh, cam, onProgress = () => {}) {
    onProgress("drawing with Krbn…");
    const scene = new K.Scene({ light: { direction: [-0.4,-0.5,-0.7] }, style: { wobble: 0.4 },
                                abstraction: { minFeaturePx: 14 } });
    scene.add(new K.Mesh(mesh)).setImportance(0.45, { role: "subject" })
         .style({ weight: 1.1, hatch: { mode: "cross", angle: 20, spacingPx: 9, field: true } });
    const res = scene.render({ ...cam, projection: "perspective", scale: cam.scale * 2 });

    onProgress("pinning strokes to the surface…");
    const { liftStrokesRigged, classifyRenderStrokes } = await import("./strokeLift.js");
    const paths = res.renderStrokes.map((s) => s.path);
    const kinds = classifyRenderStrokes(paths, res.strokes);
    const rigged = liftStrokesRigged(paths, mesh, cam, kinds);

    onProgress("blending skin weights (barycentric, culled to 4)…");
    const skin = vertexSkinning(gltf, THREE);
    const bind = bindPositions(gltf, THREE);
    const tubes = buildStrokeTubes(THREE, rigged, mesh.triangles, bind, skin);

    onProgress("building the export scene…");
    onProgress("serialising .glb…");
    const buf = await exportReskinnedGLB(THREE, GLTFExporter, gltf, tubes);
    return { glb: buf, strokeCount: rigged.length, silhouetteCount: kinds.filter((k) => k === "silhouette").length };
}
