// FILE: gpu/fbxLoad.js
// VERSION: v3 -- task #59, closing the gaps its own v2 round (commit 5fc21a72) named but did not close:
// preRotation/postRotation composition, a non-default Euler rotation order, position/scale
// (VectorKeyframeTrack) channels, and multiple AnimationStacks/clips in one file. Round 1 (v1) shipped
// skin/joint extraction but left `animations: null` unconditionally (see git history for that header
// text); v2 mapped the common case (one rotation-only clip); this round proves the rest of the shape
// mapFbxAnimations() already handled in code but no fixture had ever exercised.
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
//   * ANIMATION MAPPING (task #59) -- mapFbxAnimations() below reads `group.animations` (THREE.AnimationClip[],
//     attached by FBXLoader's own AnimationParser when the source file has curves, ALL of them -- clips.map()
//     below runs over every entry in that array, not just the first) and maps each clip's `.tracks`
//     (VectorKeyframeTrack | QuaternionKeyframeTrack, each exposing `.name`, `.times`, `.values` as plain own
//     properties -- duck-typed, no `instanceof`) into GLBParser's documented `animations: [{name, duration,
//     samplers: [{times, values, interpolation}], channels: [{samplerIdx, targetNode, path}]}]` shape
//     (gpu/GLBParser.js's `_parseAnimationClip`, ~line 976). Verified against two fixtures now:
//     gpu/fixtures/fbxAnim.ascii.fbx (single rotation-only clip, together with skin extraction on the same
//     rig -- tools/ship/fbxIngest-selfcheck.mjs section 6) and gpu/fixtures/fbxAnimAdvanced.ascii.fbx (added
//     this round, no skin -- section 7), which between them prove, against exact measured numbers:
//       - preRotation/postRotation composition and a non-default RotationOrder (enum 5, "XYZ" -- the implicit
//         default when the property is absent is enum 0, "ZYX", NOT "XYZ"; see getEulerOrder() in
//         vendor/three/jsm/loaders/FBXLoader.js ~line 4243). FBXLoader's own generateRotationTrack composes
//         these BEFORE any track value reaches this file (Euler->quaternion per keyframe, premultiply(pre),
//         multiply(post.invert()), ~line 2809-2880 of that vendored file) -- this file still does not
//         re-derive that math, it only trusts the already-composed quaternion values. Section 7's expected
//         values for that composition come from an independent three.js Quaternion/Euler script mirroring
//         generateRotationTrack's own steps, not hand trigonometry -- see that section's own comments.
//       - VectorKeyframeTrack position AND scale channels (generateVectorTrack, a different FBXLoader code
//         path from generateRotationTrack -- plain per-axis curve values, no Euler/quaternion math at all).
//       - multiple AnimationStacks/clips in one file, each resolving to its own distinct entry in
//         mapFbxAnimations()'s returned array with correct, non-overlapping channels.
//     Still not covered by either fixture, stated plainly rather than silently: CUBICSPLINE interpolation --
//     this is not merely untested, it is UNREACHABLE from the currently-vendored FBXLoader. Confirmed by
//     reading vendor/three/jsm/loaders/FBXLoader.js's AnimationParser in full: it never calls
//     `.setInterpolation()` on any track it builds, so every track it can ever produce carries KeyframeTrack's
//     own class default, InterpolateLinear -- there is no FBX file, hand-authored or otherwise, that could
//     make this specific vendored loader emit anything but "LINEAR" through samplerInterpolation() below. Do
//     not read a future missing CUBICSPLINE fixture as an open gap; it would need a patched or newer
//     FBXLoader to ever be reachable, which is out of this file's scope. Also still open: morph-target
//     (`DeformPercent`) tracks, which FBXLoader maps to a `NumberKeyframeTrack` named
//     `<model>.morphTargetInfluences[n]` -- a distinct shape from GLBParser's node-TRS channels that
//     `mapFbxAnimations()` below deliberately skips (see its own comment) rather than mis-mapping.
//   * NORMALS ARE AN APPROXIMATION. The mesh's matrixWorld is baked into normals via its upper-3x3 submatrix,
//     inverse-transposed and renormalized (see _inverseTranspose3x3 below, duplicated in miniature from
//     GLBParser.js's own static method of the same name rather than importing GLBParser -- the two copies are
//     intentionally small enough that duplication costs less than the coupling would). This is the CORRECT
//     transform, not merely "upper-3x3" -- it handles non-uniform scale properly, the same reason GLBParser
//     carries it.
//   * NO TEXTURES, NO VERTEX COLORS, NO MORPH TARGETS, NO MULTI-MATERIAL. FBXLoader does extract embedded or
//     referenced textures onto `mesh.material.map` when present; converting `.map.image` into something
//     `_uploadParsedMesh` can `gl.texImage2D` from was left undone because it could not be verified against a
//     real textured FBX (the same licensing-clean-fixture constraint task #59's own header, above, worked
//     around for animation) -- guessing at texture-extraction code that has never been run is worse than the
//     gap being visible. `texture`, `colors`, `morphTargets`, `morphTargetNames`, `morphWeights`,
//     `primitiveRanges`, and `texturesByMaterial` are all null/0 here.
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

// Numeric IDs of vendor/three/three.module.js's InterpolateDiscrete/InterpolateLinear/InterpolateSmooth
// constants (defined near the top of that file, consumed by KeyframeTrack.getInterpolation() ~line 42291).
// Duplicated as bare numbers rather than imported -- same reason as inverseTranspose3x3 above: this file
// must stay requirable with no 'three' present. Confirmed by reading three.module.js directly, not guessed.
const THREE_INTERPOLATE_DISCRETE = 2300;
const THREE_INTERPOLATE_LINEAR   = 2301;
const THREE_INTERPOLATE_SMOOTH   = 2302;

// Map a duck-typed KeyframeTrack's interpolation to GLBParser's "LINEAR"|"STEP"|"CUBICSPLINE" sampler
// vocabulary. `track.getInterpolation()` is a real KeyframeTrack.prototype method (not something FBXLoader
// adds) -- present on every VectorKeyframeTrack/QuaternionKeyframeTrack FBXLoader's AnimationParser builds,
// duck-typed here (no `instanceof`) the same way the rest of this file checks shape rather than class.
// FBXLoader's own AnimationParser (vendor/three/jsm/loaders/FBXLoader.js) never calls `.setInterpolation()`
// on a track it builds -- confirmed by reading that class in full -- so every track it produces carries
// KeyframeTrack's own class default, InterpolateLinear. LINEAR here is therefore not a guessed fallback for
// the common case; for FBX input specifically it is currently the ONLY case. The DISCRETE/SMOOTH branches
// are kept anyway (duck-typing has no way to promise FBXLoader never changes) rather than hard-coding "always
// LINEAR", so a future FBXLoader that does call setInterpolation still maps correctly instead of silently
// mislabeling STEP/CUBICSPLINE data as LINEAR.
function samplerInterpolation(track) {
    if (typeof track.getInterpolation === "function") {
        const v = track.getInterpolation();
        if (v === THREE_INTERPOLATE_DISCRETE) return "STEP";
        if (v === THREE_INTERPOLATE_SMOOTH) return "CUBICSPLINE";
        if (v === THREE_INTERPOLATE_LINEAR) return "LINEAR";
    }
    return "LINEAR";
}

// FBXLoader's internal three.js track-name convention -> GLBParser's glTF-vocabulary channel path.
// NOTE: FBXLoader names its own tracks "<model>.quaternion" (three.js's Object3D property name), NOT
// "<model>.rotation" (glTF's channel-path name GLBParser's consumers expect) -- confirmed by reading
// generateRotationTrack (~line 2809) and generateVectorTrack (~line 2800) in vendor/three/jsm/loaders/
// FBXLoader.js. This map is the one place that translation happens; everywhere else in this file "rotation"
// means the glTF/GLBParser word.
const FBX_TRACK_PROPERTY_TO_GLTF_PATH = {
    position:   "translation",
    quaternion: "rotation",
    scale:      "scale",
};

/**
 * Map FBXLoader's `group.animations` (THREE.AnimationClip[]) into GLBParser's documented
 * `animations: [{name, duration, samplers, channels}]` shape (gpu/GLBParser.js's `_parseAnimationClip`,
 * ~line 976 -- this function matches that shape field-for-field). One sampler + one channel per FBX track,
 * mirroring `_parseAnimationClip`'s own 1:1 sampler/channel structure. Returns `null` when the group carries
 * no clips (FBXLoader always sets `group.animations` to an array -- possibly empty -- never undefined, but
 * this function tolerates either).
 *
 * `nodes` is the flat array `snapshotNodes()` already built for skin/node output -- reused, not rebuilt, per
 * this file's header. A track resolves to a node by matching everything before the LAST "." in its `.name`
 * (FBXLoader's own `<sanitizedModelName>.<property>` convention) against `nodes[i].name` -- the same name
 * `Object3D.name` was given when FBXLoader built that node (`PropertyBinding.sanitizeNodeName(attrName)`,
 * vendor/three/jsm/loaders/FBXLoader.js ~line 981/1018). A track whose target name isn't found, or whose
 * property isn't one of position/quaternion/scale (e.g. a `DeformPercent` morph-target track -- see this
 * file's header), is skipped rather than crashing or emitting a bogus channel.
 */
function mapFbxAnimations(clips, nodes) {
    if (!Array.isArray(clips) || clips.length === 0) return null;

    return clips.map((clip, clipIdx) => {
        const samplers = [];
        const channels = [];

        for (const track of (clip.tracks || [])) {
            const name = track && track.name;
            if (typeof name !== "string") continue;
            const lastDot = name.lastIndexOf(".");
            if (lastDot < 0) continue;

            const targetName = name.slice(0, lastDot);
            const fbxProperty = name.slice(lastDot + 1);
            const path = FBX_TRACK_PROPERTY_TO_GLTF_PATH[fbxProperty];
            if (!path) continue;   // morph-target ("morphTargetInfluences[n]") or unknown -- see header

            let targetNode = -1;
            for (let i = 0; i < nodes.length; i++) {
                if (nodes[i].name === targetName) { targetNode = i; break; }
            }
            if (targetNode < 0) continue;   // no matching node -- skip rather than emit an unresolved channel

            const times  = track.times  instanceof Float32Array ? track.times  : Float32Array.from(track.times || []);
            const values = track.values instanceof Float32Array ? track.values : Float32Array.from(track.values || []);
            if (times.length === 0) continue;

            const samplerIdx = samplers.length;
            samplers.push({ times, values, interpolation: samplerInterpolation(track) });
            channels.push({ samplerIdx, targetNode, path });
        }

        // clip.duration: trusted directly, not recomputed. FBXLoader's AnimationParser (addClip(), ~line 2752)
        // always constructs `new AnimationClip(name, -1, tracks)` -- duration -1 makes THREE.AnimationClip's
        // own constructor call `this.resetDuration()` (vendor/three/three.module.js ~line 42719), which sets
        // `duration = max(track.times[last])` across the clip's tracks -- confirmed by reading resetDuration()
        // (~line 43010) directly: it is EXACTLY the computation GLBParser._parseAnimationClip does by hand for
        // glTF clips (glTF's JSON has no separate duration field to trust or distrust). Since FBXLoader can
        // only ever hand this function a THREE.AnimationClip built that way, `clip.duration` and "max time
        // across this clip's tracks" cannot disagree for FBX input -- recomputing it here would just be
        // re-deriving the same number by hand. If `clip.duration` is ever missing or non-numeric (defensive
        // only -- not reachable via FBXLoader's own code path), fall back to the max sampler time.
        let duration = typeof clip.duration === "number" && isFinite(clip.duration) ? clip.duration : 0;
        if (!(typeof clip.duration === "number" && isFinite(clip.duration))) {
            for (const samp of samplers) {
                const t = samp.times[samp.times.length - 1] ?? 0;
                if (t > duration) duration = t;
            }
        }

        return {
            name: clip.name || `clip_${clipIdx}`,
            duration,
            samplers,
            channels,
        };
    });
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

    // Task #59 -- mapped once, up front, independent of whether a mesh is found below: an FBX file's
    // animation clips live on the group itself (`group.animations`, set by FBXLoader's AnimationParser), not
    // on the mesh, so this does not belong inside the mesh-found branch below.
    const animations = mapFbxAnimations(group.animations, nodes);

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
        animations,   // task #59 -- mapped from group.animations even when no mesh was found (see above)
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
        animations,                 // task #59 -- see mapFbxAnimations() and this file's header
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
