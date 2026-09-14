// FILE: gpu/fbxLoad.js
// VERSION: v1 -- FBX ingest, round 2 of the work vendoring commit b5fccadb deferred.
//
// *** THE LOADER IS INJECTED, EXACTLY LIKE gpu/gltfDraco.js AND gpu/glbLoad.js. *** `FBXLoaderCtor` is passed
// in by the caller rather than imported here, so this module stays testable with no browser and no three.js
// present for everything except the actual parse call -- normalizeFbxGroup()'s duck-typing logic (the part
// with real bugs to catch) can be exercised against a hand-built fake THREE.Group in plain Node.
//
// *** WHY DUCK-TYPING AND NOT `instanceof THREE.Mesh`. *** Importing 'three' here to check instanceof would
// undo the whole point of injection -- this file would then need three.js present just to be REQUIRED, not
// just to be RUN. three.js objects already expose `.isMesh`, `.isSkinnedMesh`, `.isBone` as own boolean flags
// for exactly this reason (it's the same convention gpu/GLBParser.js's callers and every jsm/ module in this
// tree rely on), so reading those flags is not a workaround -- it's the documented way to ask "what is this"
// without importing the class that answers.
//
// ---- SCOPE, STATED THE WAY GLBParser.js's OWN HEADER STATES ITS v1 LIMITATIONS -----------------------------
//
// normalizeFbxGroup() converts a THREE.Group (FBXLoader's parse() return value) into a GLBParser.parse()-
// shaped object -- same field names, same types -- so gpu/gpuAssetLoader.js's _uploadParsedMesh() can upload
// either one with no branch on which parser produced it. What it does NOT do, on purpose, this round:
//
//   * SINGLE MESH ONLY. Finds the FIRST object in the tree with .isMesh or .isSkinnedMesh true and reads only
//     that one. This matches GLBParser's own original v1 scope (single primitive) before multi-primitive
//     concat was added over many later rounds -- multi-mesh FBX concat is a real follow-up, not attempted here.
//   * NO ANIMATION. FBXLoader DOES attach `group.animations` (an array of THREE.AnimationClip) when the source
//     file has them -- this is set to `null` regardless. A future round should map each clip's `.tracks`
//     (KeyframeTrack: `.times`, `.values`, a binding-path `.name` like `<nodeName>.position`) into GLBParser's
//     `animations: [{name, duration, samplers, channels}]` shape. This round does not, because it could not be
//     verified against a real skinned+animated fixture without either introducing a licensing-uncertain
//     third-party asset into the committed test suite, or hand-authoring FBX animation curve data blind --
//     see gpu/fixtures/PROVENANCE.md for why this tree does not commit an asset whose licence it has not
//     personally verified, and this file's own tools/ship/fbxIngest-selfcheck.mjs header for the one INFORMAL,
//     uncommitted, one-time local spot-check that WAS done against three.js's own Samba Dancing.fbx sample
//     (downloaded to scratch, never committed, its measured numbers never cited as a repo-verified claim).
//   * NORMALS ARE AN APPROXIMATION. The mesh's matrixWorld is baked into normals via its upper-3x3 submatrix,
//     inverse-transposed and renormalized (see _inverseTranspose3x3 below, duplicated in miniature from
//     GLBParser.js's own static method of the same name rather than importing GLBParser -- the two copies are
//     intentionally small enough that duplication costs less than the coupling would). This is the CORRECT
//     transform, not merely "upper-3x3" -- it handles non-uniform scale properly, the same reason GLBParser
//     carries it.
//   * NO TEXTURES, NO VERTEX COLORS, NO MORPH TARGETS, NO MULTI-MATERIAL. FBXLoader does extract embedded or
//     referenced textures onto `mesh.material.map` when present; converting `.map.image` into something
//     `_uploadParsedMesh` can `gl.texImage2D` from was left undone because it could not be verified against a
//     real textured FBX (same licensing constraint as animation, above) -- guessing at texture-extraction code
//     that has never been run is worse than the gap being visible. `texture`, `colors`, `morphTargets`,
//     `morphTargetNames`, `morphWeights`, `primitiveRanges`, and `texturesByMaterial` are all null/0 here.
//
// All of these are reasonable to add in future rounds without breaking this file's API, exactly as GLBParser's
// own header says of its list.

/**
 * Parse an already-fetched FBX ArrayBuffer into a THREE.Group.
 *
 * *** UNLIKE GLTFLoader.parse (callback-based), FBXLoader.parse(FBXBuffer, path) IS SYNCHRONOUS *** and returns
 * the Group directly -- confirmed by reading vendor/three/jsm/loaders/FBXLoader.js's own FBXLoader.parse()
 * (it throws synchronously on a bad file, and load() wraps the sync call in a try/catch to funnel errors to
 * onError -- there is no promise or callback anywhere in parse() itself). Wrapped in an async function here
 * purely so callers get the same `await parseFbx(...)` shape as gpu/gltfDraco.js's `parseGlb`, not because
 * anything here actually awaits.
 *
 * `FBXLoaderCtor` is injected -- see this file's header for why.
 */
export async function parseFbx(buffer, FBXLoaderCtor, opts = {}) {
    const loader = new FBXLoaderCtor();
    const group = loader.parse(buffer, opts?.path || "");
    return group;
}

// Duplicated in miniature from gpu/GLBParser.js's `_inverseTranspose3x3` static method (same math, same
// row-major-9-floats return shape) rather than imported -- see this file's header. Returns identity for a
// degenerate (zero-scale-axis or NaN) matrix so normals pass through unchanged instead of becoming NaN.
function inverseTranspose3x3(m) {
    const a = m[0],  b = m[4],  c = m[8];
    const d = m[1],  e = m[5],  f = m[9];
    const g = m[2],  h = m[6],  i = m[10];

    const A =  (e * i - f * h);
    const B = -(d * i - f * g);
    const C =  (d * h - e * g);

    const det = a * A + b * B + c * C;
    if (!isFinite(det) || Math.abs(det) < 1e-9) return [1, 0, 0,  0, 1, 0,  0, 0, 1];
    const invDet = 1 / det;

    const inv00 =  A * invDet;
    const inv01 = -(b * i - c * h) * invDet;
    const inv02 =  (b * f - c * e) * invDet;
    const inv10 =  B * invDet;
    const inv11 =  (a * i - c * g) * invDet;
    const inv12 = -(a * f - c * d) * invDet;
    const inv20 =  C * invDet;
    const inv21 = -(a * h - b * g) * invDet;
    const inv22 =  (a * e - b * d) * invDet;

    return [
        inv00, inv10, inv20,
        inv01, inv11, inv21,
        inv02, inv12, inv22,
    ];
}

/**
 * Pre-order snapshot of the ENTIRE scene graph rooted at `root` (every Object3D, not only bones/meshes) into
 * a flat array matching GLBParser's `_snapshotNodes` shape: {name, translation, rotation, scale, parent,
 * children}. Needed both so skin.joints can be expressed as node indices (glTF's own convention, which
 * GLBParser's skin shape follows) and because GLBParser.parse()'s own output contract always carries `nodes`.
 *
 * Returns { nodes, indexOf } -- `indexOf` is a Map<Object3D, number> the caller uses to resolve bones to
 * node indices without a second traversal.
 */
function snapshotNodes(root) {
    const nodes = [];
    const indexOf = new Map();

    function visit(obj, parentIndex) {
        const idx = nodes.length;
        indexOf.set(obj, idx);
        nodes.push({
            name: obj.name || "",
            translation: Float32Array.from([obj.position.x, obj.position.y, obj.position.z]),
            rotation: Float32Array.from([obj.quaternion.x, obj.quaternion.y, obj.quaternion.z, obj.quaternion.w]),
            scale: Float32Array.from([obj.scale.x, obj.scale.y, obj.scale.z]),
            parent: parentIndex,
            children: [],
        });
        if (parentIndex >= 0) nodes[parentIndex].children.push(idx);
        for (const child of obj.children) visit(child, idx);
    }
    visit(root, -1);

    return { nodes, indexOf };
}

/**
 * Convert a THREE.Group (FBXLoader's parse() return value) into a GLBParser.parse()-shaped object -- same
 * field names, same types, documented at the top of gpu/GLBParser.js. See this file's header for exactly what
 * v1 does and does not cover.
 *
 * Pure duck-typing throughout (`.isMesh`, `.isSkinnedMesh`, `.isBone`, `.geometry`, `.material`, `.skeleton`)
 * -- no `instanceof`, no import of 'three'. `group` is assumed to already be a real (or shaped-like-real)
 * THREE.Group/Object3D; nothing here constructs three.js objects.
 */
export function normalizeFbxGroup(group) {
    // World matrices must be current before anything below reads matrixWorld.
    group.updateMatrixWorld(true);

    const { nodes, indexOf } = snapshotNodes(group);

    // Single-mesh v1 scope (see header) -- first isMesh/isSkinnedMesh found, pre-order.
    let meshObj = null;
    (function find(obj) {
        if (meshObj) return;
        if (obj.isMesh || obj.isSkinnedMesh) { meshObj = obj; return; }
        for (const child of obj.children) { find(child); if (meshObj) return; }
    })(group);

    const empty = () => ({
        positions: new Float32Array(0),
        normals: null,
        texCoords: null,
        indices: new Uint32Array(0),
        texture: null,
        joints: null,
        weights: null,
        skin: null,
        animations: null,   // deliberate v1 gap -- see this file's header
        nodes,
        colors: null,
        morphTargets: null,
        morphTargetNames: null,
        morphWeights: null,
        morphVertexCount: 0,
        primitiveRanges: null,
        texturesByMaterial: null,
    });

    if (!meshObj || !meshObj.geometry) return empty();

    const geo = meshObj.geometry;
    const posAttr = geo.attributes && geo.attributes.position;
    if (!posAttr || !posAttr.array || posAttr.array.length === 0) return empty();

    const srcPositions = posAttr.array;                 // Float32Array, vec3 per vertex, tightly packed
    const vertexCount  = srcPositions.length / 3;

    // Bake the mesh's matrixWorld (full 4x4, column-major -- three.js's own Matrix4.elements convention)
    // into positions.
    const m = meshObj.matrixWorld.elements;
    const positions = new Float32Array(vertexCount * 3);
    for (let v = 0; v < vertexCount; v++) {
        const x = srcPositions[v * 3], y = srcPositions[v * 3 + 1], z = srcPositions[v * 3 + 2];
        positions[v * 3]     = m[0] * x + m[4] * y + m[8]  * z + m[12];
        positions[v * 3 + 1] = m[1] * x + m[5] * y + m[9]  * z + m[13];
        positions[v * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    }

    // Normals: upper-3x3 inverse-transpose + renormalize (see inverseTranspose3x3 above).
    let normals = null;
    const nrmAttr = geo.attributes && geo.attributes.normal;
    if (nrmAttr && nrmAttr.array && nrmAttr.array.length === vertexCount * 3) {
        const it = inverseTranspose3x3(m);
        const src = nrmAttr.array;
        normals = new Float32Array(vertexCount * 3);
        for (let v = 0; v < vertexCount; v++) {
            const x = src[v * 3], y = src[v * 3 + 1], z = src[v * 3 + 2];
            let nx = it[0] * x + it[1] * y + it[2] * z;
            let ny = it[3] * x + it[4] * y + it[5] * z;
            let nz = it[6] * x + it[7] * y + it[8] * z;
            const len = Math.hypot(nx, ny, nz);
            if (len > 1e-12) { nx /= len; ny /= len; nz /= len; }
            normals[v * 3] = nx; normals[v * 3 + 1] = ny; normals[v * 3 + 2] = nz;
        }
    }

    // texCoords
    let texCoords = null;
    const uvAttr = geo.attributes && geo.attributes.uv;
    if (uvAttr && uvAttr.array && uvAttr.array.length === vertexCount * 2) {
        texCoords = uvAttr.array instanceof Float32Array ? uvAttr.array : new Float32Array(uvAttr.array);
    }

    // indices -- real index buffer if present, else synthesize identity the same way GLBParser.js does
    // when a primitive carries no indices.
    let indices;
    if (geo.index && geo.index.array && geo.index.array.length > 0) {
        indices = geo.index.array instanceof Uint32Array ? geo.index.array : Uint32Array.from(geo.index.array);
    } else {
        indices = new Uint32Array(vertexCount);
        for (let i = 0; i < vertexCount; i++) indices[i] = i;
    }

    // skin -- only for a SkinnedMesh with a real skeleton.
    let skin = null, joints = null, weights = null;
    if (meshObj.isSkinnedMesh && meshObj.skeleton && Array.isArray(meshObj.skeleton.bones)) {
        const bones = meshObj.skeleton.bones;
        const boneInverses = meshObj.skeleton.boneInverses || [];
        const jointIndices = bones.map((b) => {
            const idx = indexOf.get(b);
            return idx === undefined ? -1 : idx;
        });
        const inverseBindMatrices = bones.map((b, i) => {
            const ibm = boneInverses[i];
            return ibm && ibm.elements ? Float32Array.from(ibm.elements) : Float32Array.from([
                1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, 0, 0, 1,
            ]);
        });
        skin = { joints: jointIndices, inverseBindMatrices, skeleton: null };

        const skinIndexAttr  = geo.attributes.skinIndex;
        const skinWeightAttr = geo.attributes.skinWeight;
        if (skinIndexAttr && skinWeightAttr) {
            // Already indexes into skeleton.bones order, which is exactly skin.joints' order -- no remap.
            joints  = skinIndexAttr.array instanceof Uint16Array || skinIndexAttr.array instanceof Uint8Array
                ? skinIndexAttr.array
                : Uint16Array.from(skinIndexAttr.array);
            weights = skinWeightAttr.array instanceof Float32Array
                ? skinWeightAttr.array
                : Float32Array.from(skinWeightAttr.array);
        }
    }

    return {
        positions,
        normals,
        texCoords,
        indices,
        texture: null,              // v1 gap -- see this file's header
        joints,
        weights,
        skin,
        animations: null,           // deliberate v1 gap -- see this file's header
        nodes,
        colors: null,               // v1 gap -- see this file's header
        morphTargets: null,
        morphTargetNames: null,
        morphWeights: null,
        morphVertexCount: 0,
        primitiveRanges: null,
        texturesByMaterial: null,
    };
}
