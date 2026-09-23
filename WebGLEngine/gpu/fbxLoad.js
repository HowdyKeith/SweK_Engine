// FILE: gpu/fbxLoad.js
// VERSION: v4 -- closes four gaps v3's own header named as open: multi-mesh/multi-material concat,
// embedded-texture extraction, morph-target (DeformPercent) animation tracks, and rotation curves spanning
// >=180 degrees between keyframes. Three of these are real new code (below); the fourth is NOT -- see its own
// note further down, it needed a fixture, not a line changed here.
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
// either one with no branch on which parser produced it. *** IT IS NOW async *** (v3 was sync) -- texture
// extraction needs createImageBitmap(), which is inherently async, and there is no honest way to make one
// part of this function's output async and the rest not. The one real caller (gpu/gpuAssetLoader.js's
// _loadFBX) already awaited parseFbx(); it now also awaits this.
//
//   * MULTI-MESH CONCAT (v4). Walks the WHOLE tree collecting every .isMesh/.isSkinnedMesh object, pre-order
//     -- not just the first, matching GLBParser's own multi-primitive concat (gpu/GLBParser.js, "second pass:
//     concat with vertex-base offsets on indices"). Each mesh becomes its own vertex range in the
//     concatenated buffers, same primData/vOff pattern GLBParser uses.
//   * MULTI-MATERIAL CONCAT (v4), WITHIN one mesh, via `geometry.groups` (three.js's own convention for FBX's
//     LayerElementMaterial -- FBXLoader's GeometryParser calls `geometry.addGroup(...)` per contiguous run of
//     same-material-index polygons; a mesh with no groups gets one synthetic group covering everything, same
//     as GLBParser treats a primitive with no material as one implicit range). A synthetic, deduplicated-by-
//     object-identity materials list is built once across ALL meshes in the group (FBX has no `json.materials`
//     array the way glTF does), and `primitiveRanges`/`texturesByMaterial` key off that list's index --
//     shaped exactly like GLBParser's own `primitiveRanges: [{indexStart, indexCount, materialIdx, vertexStart,
//     vertexCount}]` / `texturesByMaterial: {idx: ImageBitmap}`, so gpu/gpuAssetLoader.js's _uploadParsedMesh
//     (shared with GLBParser's output, "nothing below this point knows or cares which source format produced
//     it") needs no changes.
//   * MIXED SKIN SCOPE -- NAMED PLAINLY, AND ITS PRACTICAL SEVERITY NAMED PLAINLY TOO (an adversarial review
//     of this round found the risk here was real but understated by an earlier, softer wording of this same
//     paragraph -- corrected below rather than left reading gentler than it is). Skin data is taken from the
//     FIRST SkinnedMesh found and its skeleton ONLY. Any other mesh in the same group -- plain Mesh, or a
//     SkinnedMesh with a DIFFERENT skeleton object -- contributes synthetic joints=[0,0,0,0]/weights=
//     [1,0,0,0] rows. *** THIS IS NOT "STAYS STATIC AT BIND POSE" -- IT IS "INHERITS JOINT 0'S ENTIRE
//     ANIMATED MOTION." *** The mesh's own vertices are baked to their correct WORLD-SPACE bind pose first,
//     then the render-time skinning shader multiplies that by joint 0's CURRENT (animated) world matrix times
//     its inverse bind matrix -- identity only at rest pose. The moment joint 0 (typically a character's
//     root/hip bone) animates at all, any secondary mesh sharing that FBX gets rigidly dragged/orbited around
//     joint 0's bind-pose origin: an unrelated static prop bundled in the same file visibly swings with the
//     character's root motion, and a mesh actually meant to follow a DIFFERENT bone (e.g. a held weapon meant
//     to track a wrist) instead follows the root and visibly detaches whenever wrist and root diverge. This is
//     a real, deliberate simplification -- not glTF's own considerably more involved "walk the node parent
//     chain to the nearest joint ancestor, bake the bind-pose local transform" logic (GLBParser.js's own
//     `unskinnedPrims` handling), not attempted here -- but it is NOT gated end to end with an animating joint
//     0 plus a second mesh together; no fixture in this tree exercises that combination (see
//     tools/ship/fbxIngest-selfcheck.mjs's own header). A single skinned mesh (this file's v1-v3 scope) is
//     unaffected: it IS the reference skeleton, with no secondary mesh to drag.
//   * EMBEDDED-TEXTURE EXTRACTION (v4). `parseFbx`'s new `opts.manager` (an injected THREE.LoadingManager
//     instance -- injected for the same reason FBXLoaderCtor is, see this file's own header) is awaited via
//     its `onLoad` callback before returning, but ONLY if the parsed group actually references any texture at
//     all (`_groupHasAnyTextureMap`) -- an FBX with no textures needs no wait, and manager.onLoad would in
//     fact never fire for it (LoadingManager's own itemEnd only calls onLoad once itemsLoaded===itemsTotal,
//     and itemsTotal never leaves 0 if nothing was ever itemStart()-ed -- confirmed by reading
//     vendor/three/three.core.js's LoadingManager directly, not assumed). Once that resolves,
//     `mesh.material.map.image` (an HTMLImageElement TextureLoader/ImageLoader populated ASYNCHRONOUSLY --
//     confirmed directly: `TextureLoader.load()` assigns `texture.image = image` INSIDE the image's own load
//     callback, not synchronously when the Texture object is constructed and returned, so reading `.image`
//     before the manager settles would see `undefined`) is guaranteed populated, and
//     `createImageBitmap(mat.map.image)` produces the same ImageBitmap shape GLBParser's own
//     `_extractBaseColorImage` returns -- no re-fetch of the underlying data: URI/blob: URL needed, since the
//     already-decoded `<img>` element itself is a valid createImageBitmap() source.
//   * MORPH-TARGET (DeformPercent) TRACKS (v4). See mapFbxAnimations()'s own updated comment and the new
//     `FBX_TRACK_PROPERTY_TO_GLTF_PATH`-adjacent morph handling below for the animation-CURVE half; static
//     morph target DELTA extraction (geometry.morphAttributes.position -> GLBParser's own
//     `morphTargets: [{positions, normals}]` shape) is built per-mesh, matching GLBParser's `_readMorphTargets`
//     field names exactly, including that it is DELTAS (relative), not absolute positions -- confirmed against
//     FBXLoader's own GeometryParser: `geometry.morphTargetsRelative = true` is set unconditionally wherever it
//     builds morphAttributes, so this file makes no relative/absolute decision of its own, it inherits
//     FBXLoader's.
//   * ROTATION CURVES SPANNING >=180 DEGREES -- *** NOT A CODE CHANGE. VERIFICATION ONLY. *** FBXLoader's own
//     interpolateRotations() (vendor/three/jsm/loaders/FBXLoader.js) already subdivides a >=180-degree
//     interval into multiple slerp-interpolated intermediate keyframes BEFORE the resulting
//     QuaternionKeyframeTrack ever reaches this file -- exactly the same shape as task #59's own
//     preRotation/postRotation finding ("FBXLoader's own generateRotationTrack composes these before any
//     track value reaches this file"). mapFbxAnimations() below reads `track.times`/`track.values` as opaque
//     arrays with no assumption about how many samples exist -- there was nothing in this file's own code that
//     COULD have been wrong here. What was actually unverified is whether that pass-through is faithful (does
//     not truncate or misalign the extra subdivided samples) -- tools/ship/fbxIngest-selfcheck.mjs's new
//     section proves it by comparing this file's own sampler output against FBXLoader's raw track directly,
//     read in the same browser script, for exact agreement.
//   * NORMALS ARE AN APPROXIMATION. The mesh's matrixWorld is baked into normals via its upper-3x3 submatrix,
//     inverse-transposed and renormalized (see _inverseTranspose3x3 below, duplicated in miniature from
//     GLBParser.js's own static method of the same name rather than importing GLBParser -- the two copies are
//     intentionally small enough that duplication costs less than the coupling would). This is the CORRECT
//     transform, not merely "upper-3x3" -- it handles non-uniform scale properly, the same reason GLBParser
//     carries it.
//   * STILL NOT COVERED: vertex colors (`colors` stays null -- FBXLoader does read LayerElementColor into
//     `geometry.attributes.color`, this file just does not extract it yet); CUBICSPLINE interpolation
//     (unreachable from the currently-vendored FBXLoader -- see mapFbxAnimations()'s own comment, unchanged
//     from v3).
//
// All of these are reasonable to add in future rounds without breaking this file's API, exactly as GLBParser's
// own header says of its list.

/**
 * Parse an already-fetched FBX ArrayBuffer into a THREE.Group.
 *
 * *** UNLIKE GLTFLoader.parse (callback-based), FBXLoader.parse(FBXBuffer, path) IS SYNCHRONOUS *** and returns
 * the Group directly -- confirmed by reading vendor/three/jsm/loaders/FBXLoader.js's own FBXLoader.parse()
 * (it throws synchronously on a bad file, and load() wraps the sync call in a try/catch to funnel errors to
 * onError -- there is no promise or callback anywhere in parse() itself).
 *
 * `FBXLoaderCtor` is injected -- see this file's header for why. `opts.manager`, if given, is a
 * THREE.LoadingManager instance (also injected, same reason) passed to `new FBXLoaderCtor(manager)`; if the
 * parsed group references any texture at all, this function awaits that manager's `onLoad` before returning,
 * so `normalizeFbxGroup()` can safely read `mesh.material.map.image` afterward -- see this file's header for
 * why that read is unsafe before the manager settles. Omitting `opts.manager` reproduces v1-v3's behavior
 * exactly: textures, if any, are left for the caller with no wait and no guarantee `.image` is populated.
 */
export async function parseFbx(buffer, FBXLoaderCtor, opts = {}) {
    const manager = opts.manager || null;
    const loader = manager ? new FBXLoaderCtor(manager) : new FBXLoaderCtor();
    const group = loader.parse(buffer, opts?.path || "");
    if (manager && _groupHasAnyTextureMap(group)) {
        await new Promise((resolve) => { manager.onLoad = resolve; });
    }
    return group;
}

// Duck-typed walk: does ANY mesh in this group reference a texture at all (`material.map` truthy -- the
// Texture OBJECT itself is constructed and assigned synchronously by TextureLoader.load(), see this file's
// header; only its `.image` is the part that arrives late). Guards parseFbx()'s manager-wait: awaiting
// manager.onLoad when nothing was ever itemStart()-ed would hang forever (see this file's header).
function _groupHasAnyTextureMap(root) {
    let found = false;
    (function walk(obj) {
        if (found) return;
        if (obj.isMesh || obj.isSkinnedMesh) {
            const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
            for (const m of mats) if (m && m.map) { found = true; return; }
        }
        for (const child of obj.children) { walk(child); if (found) return; }
    })(root);
    return found;
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
// adds) -- present on every VectorKeyframeTrack/QuaternionKeyframeTrack/NumberKeyframeTrack FBXLoader's
// AnimationParser builds, duck-typed here (no `instanceof`) the same way the rest of this file checks shape
// rather than class. FBXLoader's own AnimationParser (vendor/three/jsm/loaders/FBXLoader.js) never calls
// `.setInterpolation()` on a track it builds -- confirmed by reading that class in full -- so every track it
// produces carries KeyframeTrack's own class default, InterpolateLinear. LINEAR here is therefore not a
// guessed fallback for the common case; for FBX input specifically it is currently the ONLY case. The
// DISCRETE/SMOOTH branches are kept anyway (duck-typing has no way to promise FBXLoader never changes) rather
// than hard-coding "always LINEAR", so a future FBXLoader that does call setInterpolation still maps
// correctly instead of silently mislabeling STEP/CUBICSPLINE data as LINEAR.
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
// means the glTF/GLBParser word. Morph tracks ("<geometryOrMeshName>.morphTargetInfluences[n]") are handled
// separately in mapFbxAnimations() below -- their target isn't a node/TRS channel at all, so they cannot go
// through this same {targetNode, path} shape; see that function's own comment.
const FBX_TRACK_PROPERTY_TO_GLTF_PATH = {
    position:   "translation",
    quaternion: "rotation",
    scale:      "scale",
};

// Matches FBXLoader's own morph-influence track name, e.g. "someMesh.morphTargetInfluences[2]" -- confirmed
// against AnimationParser's morph-track construction (search "morphTargetInfluences" in
// vendor/three/jsm/loaders/FBXLoader.js): the track name is built as
// `${object.name}.morphTargetInfluences[${morphNum}]` where `object` is the MESH (not a node in the
// position/quaternion/scale sense), and `morphNum` is that mesh's own morph target index.
const MORPH_TRACK_RE = /^(.*)\.morphTargetInfluences\[(\d+)\]$/;

/**
 * Map FBXLoader's `group.animations` (THREE.AnimationClip[]) into GLBParser's documented
 * `animations: [{name, duration, samplers, channels}]` shape (gpu/GLBParser.js's `_parseAnimationClip`,
 * ~line 976 -- this function matches that shape field-for-field). One sampler + one channel per FBX track,
 * mirroring `_parseAnimationClip`'s own 1:1 sampler/channel structure. Returns `null` when the group carries
 * no clips (FBXLoader always sets `group.animations` to an array -- possibly empty -- never undefined, but
 * this function tolerates either).
 *
 * `nodes` is the flat array `snapshotNodes()` already built for skin/node output -- reused, not rebuilt, per
 * this file's header. A position/quaternion/scale track resolves to a node by matching everything before the
 * LAST "." in its `.name` (FBXLoader's own `<sanitizedModelName>.<property>` convention) against
 * `nodes[i].name` -- the same name `Object3D.name` was given when FBXLoader built that node
 * (`PropertyBinding.sanitizeNodeName(attrName)`, vendor/three/jsm/loaders/FBXLoader.js ~line 981/1018).
 *
 * v4 -- MORPH TRACKS. A track matching MORPH_TRACK_RE (`<mesh>.morphTargetInfluences[n]`) is a DIFFERENT
 * channel shape from position/quaternion/scale: its target is a MORPH TARGET INDEX on a given mesh, not a
 * node's TRS. GLBParser's own animation-channel vocabulary has no "weights" path for this (glTF's
 * `channel.target.path` CAN be "weights" for morph animation, but GLBParser's `_parseAnimationClip` was never
 * extended to read it -- confirmed by grepping that function, it only ever emits translation/rotation/scale).
 * Rather than invent a channel shape nothing downstream reads, this function emits a `morphChannels` array
 * SEPARATE from `channels` -- `{samplerIdx, targetMeshName, morphIndex}` -- additive to the existing shape
 * (present only when at least one morph track exists; absent/undefined otherwise, so every EXISTING caller
 * that only reads `channels` is unaffected). `_uploadParsedMesh` does not currently consume it -- see
 * gpu/fbxLoad.js's own header on what is and is not wired end to end.
 */
function mapFbxAnimations(clips, nodes) {
    if (!Array.isArray(clips) || clips.length === 0) return null;

    return clips.map((clip, clipIdx) => {
        const samplers = [];
        const channels = [];
        const morphChannels = [];

        for (const track of (clip.tracks || [])) {
            const name = track && track.name;
            if (typeof name !== "string") continue;

            const morphMatch = MORPH_TRACK_RE.exec(name);
            if (morphMatch) {
                const times  = track.times  instanceof Float32Array ? track.times  : Float32Array.from(track.times || []);
                const values = track.values instanceof Float32Array ? track.values : Float32Array.from(track.values || []);
                if (times.length === 0) continue;
                const samplerIdx = samplers.length;
                samplers.push({ times, values, interpolation: samplerInterpolation(track) });
                morphChannels.push({ samplerIdx, targetMeshName: morphMatch[1], morphIndex: parseInt(morphMatch[2], 10) });
                continue;
            }

            const lastDot = name.lastIndexOf(".");
            if (lastDot < 0) continue;

            const targetName = name.slice(0, lastDot);
            const fbxProperty = name.slice(lastDot + 1);
            const path = FBX_TRACK_PROPERTY_TO_GLTF_PATH[fbxProperty];
            if (!path) continue;   // unknown property -- skip rather than emit a bogus channel

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

        const out = {
            name: clip.name || `clip_${clipIdx}`,
            duration,
            samplers,
            channels,
        };
        if (morphChannels.length > 0) out.morphChannels = morphChannels;
        return out;
    });
}

/**
 * Per-mesh static morph-target extraction -- geometry.morphAttributes.position (an array of BufferAttribute,
 * FBXLoader's own GeometryParser builds these from Geometry::Shape nodes) into GLBParser's `_readMorphTargets`
 * return shape: `{targets: [{positions, normals}], names, weights, count, vertexCount}`. `positions` are
 * DELTAS relative to the base mesh, matching GLBParser's own convention -- confirmed, not assumed: FBXLoader
 * sets `geometry.morphTargetsRelative = true` unconditionally wherever it builds morph attributes (searched
 * the whole file for that property name), so this function never has to choose between relative/absolute, it
 * inherits FBXLoader's own choice, which already matches GLBParser's.
 *
 * `names` comes from `geometry.morphAttributes.position[i].name` when FBXLoader set one (it names each
 * BufferAttribute after the Shape's own FBX name); falls back to `morph_i` otherwise, matching
 * GLBParser._readMorphTargets's own fallback exactly. `weights` comes from `meshObj.morphTargetInfluences`
 * (three.js's own per-mesh initial-weight array, populated by FBXLoader alongside the attributes) if present
 * and the right length, else a zero array -- same shape as GLBParser's own `meshDef.weights` fallback.
 */
function readFbxMorphTargets(meshObj) {
    const geo = meshObj.geometry;
    const posAttrs = geo && geo.morphAttributes && geo.morphAttributes.position;
    if (!Array.isArray(posAttrs) || posAttrs.length === 0) return null;

    const targets = posAttrs.map((attr) => {
        if (!attr || !attr.array || attr.array.length === 0) return null;
        const positions = attr.array instanceof Float32Array ? attr.array : Float32Array.from(attr.array);
        return { positions, normals: null };
    });
    const names = posAttrs.map((attr, i) => (attr && typeof attr.name === "string" && attr.name) ? attr.name : `morph_${i}`);
    const weights = (Array.isArray(meshObj.morphTargetInfluences) && meshObj.morphTargetInfluences.length === targets.length)
        ? Float32Array.from(meshObj.morphTargetInfluences)
        : new Float32Array(targets.length);
    const vertexCount = (() => { for (const t of targets) if (t && t.positions) return t.positions.length / 3; return 0; })();

    return { targets, names, weights, count: targets.length, vertexCount };
}

/**
 * Convert a THREE.Group (FBXLoader's parse() return value) into a GLBParser.parse()-shaped object -- same
 * field names, same types, documented at the top of gpu/GLBParser.js. See this file's header for exactly what
 * this version does and does not cover.
 *
 * Pure duck-typing throughout (`.isMesh`, `.isSkinnedMesh`, `.isBone`, `.geometry`, `.material`, `.skeleton`)
 * -- no `instanceof`, no import of 'three'. `group` is assumed to already be a real (or shaped-like-real)
 * THREE.Group/Object3D; nothing here constructs three.js objects, EXCEPT createImageBitmap() for texture
 * extraction, a browser global rather than a three.js class, needing no import either way.
 */
export async function normalizeFbxGroup(group) {
    // World matrices must be current before anything below reads matrixWorld.
    group.updateMatrixWorld(true);

    const { nodes, indexOf } = snapshotNodes(group);

    // Task #59 -- mapped once, up front, independent of whether a mesh is found below: an FBX file's
    // animation clips live on the group itself (`group.animations`, set by FBXLoader's AnimationParser), not
    // on the mesh, so this does not belong inside the mesh-found branch below.
    const animations = mapFbxAnimations(group.animations, nodes);

    const empty = () => ({
        positions: new Float32Array(0),
        normals: null,
        texCoords: null,
        indices: new Uint32Array(0),
        texture: null,
        joints: null,
        weights: null,
        skin: null,
        animations,
        nodes,
        colors: null,
        morphTargets: null,
        morphTargetNames: null,
        morphWeights: null,
        morphVertexCount: 0,
        primitiveRanges: null,
        texturesByMaterial: null,
    });

    // v4 -- MULTI-MESH: walk the whole tree, pre-order, collecting every .isMesh/.isSkinnedMesh (was: first
    // only). See this file's header for why.
    const meshList = [];
    (function find(obj) {
        if (obj.isMesh || obj.isSkinnedMesh) meshList.push(obj);
        for (const child of obj.children) find(child);
    })(group);

    if (meshList.length === 0) return empty();

    // v4 -- synthetic materials list, deduplicated by object identity, first-encounter order across ALL
    // meshes. FBX has no `json.materials` array the way glTF does, so this file builds the equivalent.
    const materialsList = [];
    const materialIndexOf = new Map();
    for (const meshObj of meshList) {
        const mats = Array.isArray(meshObj.material) ? meshObj.material : (meshObj.material ? [meshObj.material] : []);
        for (const m of mats) {
            if (m && !materialIndexOf.has(m)) {
                materialIndexOf.set(m, materialsList.length);
                materialsList.push(m);
            }
        }
    }

    // v4 -- embedded-texture extraction. Only reachable with a populated `.map.image` -- see parseFbx()'s own
    // manager-wait, which this function does not itself perform (normalizeFbxGroup has no browser-load
    // concept, only parseFbx does). A caller that never passed opts.manager to parseFbx() gets `texture: null`
    // / `texturesByMaterial: {}` here exactly as v1-v3 always did, not a crash or a hang.
    let texture = null;
    const texturesByMaterial = {};
    for (let i = 0; i < materialsList.length; i++) {
        const mat = materialsList[i];
        if (!mat || !mat.map || !mat.map.image) continue;
        try {
            const bmp = await createImageBitmap(mat.map.image);
            texturesByMaterial[i] = bmp;
            if (!texture) texture = bmp;
        } catch { /* unreadable image -- leave this material's texture absent rather than throw */ }
    }

    // v4 -- reference skin: the FIRST SkinnedMesh's skeleton. See this file's header on the deliberate
    // "mixed skin scope" this simplification accepts.
    let refSkeleton = null;
    for (const meshObj of meshList) {
        if (meshObj.isSkinnedMesh && meshObj.skeleton && Array.isArray(meshObj.skeleton.bones)) { refSkeleton = meshObj.skeleton; break; }
    }
    let skin = null;
    if (refSkeleton) {
        const bones = refSkeleton.bones;
        const boneInverses = refSkeleton.boneInverses || [];
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
    }

    // v4 -- first pass: per-mesh vertex data (positions/normals/uv/indices/skin/groups/morph), unconcatenated.
    const primData = [];
    let allHaveNormals = true, allHaveUVs = true;
    let morphResult = null;   // v4 -- first mesh that carries morph targets, matching GLBParser's own
                               // "first primitive that carries them" v1391 convention (see that file's header).
    let morphOwnerVertexStart = 0;

    for (const meshObj of meshList) {
        const geo = meshObj.geometry;
        const posAttr = geo && geo.attributes && geo.attributes.position;
        if (!posAttr || !posAttr.array || posAttr.array.length === 0) continue;   // skip an empty/malformed mesh

        const srcPositions = posAttr.array;
        const vertexCount = srcPositions.length / 3;

        const m = meshObj.matrixWorld.elements;
        const positions = new Float32Array(vertexCount * 3);
        for (let v = 0; v < vertexCount; v++) {
            const x = srcPositions[v * 3], y = srcPositions[v * 3 + 1], z = srcPositions[v * 3 + 2];
            positions[v * 3]     = m[0] * x + m[4] * y + m[8]  * z + m[12];
            positions[v * 3 + 1] = m[1] * x + m[5] * y + m[9]  * z + m[13];
            positions[v * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
        }

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
        if (!normals) allHaveNormals = false;

        let texCoords = null;
        const uvAttr = geo.attributes && geo.attributes.uv;
        if (uvAttr && uvAttr.array && uvAttr.array.length === vertexCount * 2) {
            texCoords = uvAttr.array instanceof Float32Array ? uvAttr.array : new Float32Array(uvAttr.array);
        }
        if (!texCoords) allHaveUVs = false;

        let indices;
        if (geo.index && geo.index.array && geo.index.array.length > 0) {
            indices = geo.index.array instanceof Uint32Array ? geo.index.array : Uint32Array.from(geo.index.array);
        } else {
            indices = new Uint32Array(vertexCount);
            for (let i = 0; i < vertexCount; i++) indices[i] = i;
        }

        // v4 -- per-mesh skin: only meshes sharing the REFERENCE skeleton contribute real joints/weights;
        // every other mesh in a skinned group gets synthetic joint-0/full-weight rows -- which DRAGS with
        // joint 0's full animated motion at render time, not "stays static" (see this file's header's own
        // corrected wording on the practical severity here).
        let joints = null, weights = null;
        if (skin) {
            if (meshObj.isSkinnedMesh && meshObj.skeleton === refSkeleton && geo.attributes.skinIndex && geo.attributes.skinWeight) {
                const skinIndexAttr = geo.attributes.skinIndex, skinWeightAttr = geo.attributes.skinWeight;
                joints  = skinIndexAttr.array instanceof Uint16Array || skinIndexAttr.array instanceof Uint8Array
                    ? skinIndexAttr.array
                    : Uint16Array.from(skinIndexAttr.array);
                weights = skinWeightAttr.array instanceof Float32Array
                    ? skinWeightAttr.array
                    : Float32Array.from(skinWeightAttr.array);
            } else {
                joints = new Uint16Array(vertexCount * 4);          // all-zero -> follows joint 0's full motion
                weights = new Float32Array(vertexCount * 4);
                for (let v = 0; v < vertexCount; v++) weights[v * 4] = 1;   // full weight on joint 0
            }
        }

        // v4 -- multi-material groups within this mesh. geometry.groups is three.js's own convention for
        // FBX's LayerElementMaterial (FBXLoader's GeometryParser calls geometry.addGroup() per contiguous
        // same-material-index polygon run). No groups -> one synthetic group covering the whole mesh.
        const mats = Array.isArray(meshObj.material) ? meshObj.material : (meshObj.material ? [meshObj.material] : []);
        const groups = (geo.groups && geo.groups.length > 0)
            ? geo.groups
            : [{ start: 0, count: indices.length, materialIndex: 0 }];

        // v4 -- morph targets: first mesh that carries them, matching GLBParser's own "first primitive" rule.
        if (!morphResult) {
            const mr = readFbxMorphTargets(meshObj);
            if (mr) { morphResult = mr; morphOwnerVertexStart = -1; /* resolved below once vOff is known */ }
        }

        primData.push({ pos: positions, norm: normals, uv: texCoords, idx: indices, vc: vertexCount, joints, weights, groups, mats, meshObj });
    }

    if (primData.length === 0) return empty();

    const totalVerts = primData.reduce((s, pd) => s + pd.vc, 0);
    const totalIndices = primData.reduce((s, pd) => s + pd.idx.length, 0);

    const positions = new Float32Array(totalVerts * 3);
    const normals   = allHaveNormals ? new Float32Array(totalVerts * 3) : null;
    const texCoords = allHaveUVs     ? new Float32Array(totalVerts * 2) : null;
    const indices   = new Uint32Array(totalIndices);
    const jointsOut  = skin ? new Uint16Array(totalVerts * 4) : null;
    const weightsOut = skin ? new Float32Array(totalVerts * 4) : null;

    const primitiveRanges = [];
    let vOff = 0, iOff = 0;
    for (const pd of primData) {
        positions.set(pd.pos, vOff * 3);
        if (normals && pd.norm) normals.set(pd.norm, vOff * 3);
        if (texCoords && pd.uv) texCoords.set(pd.uv, vOff * 2);
        if (jointsOut && pd.joints) jointsOut.set(pd.joints, vOff * 4);
        if (weightsOut && pd.weights) weightsOut.set(pd.weights, vOff * 4);
        for (let i = 0; i < pd.idx.length; i++) indices[iOff + i] = pd.idx[i] + vOff;

        if (morphResult && morphOwnerVertexStart === -1 && pd.meshObj && readFbxMorphTargets(pd.meshObj)) {
            // The mesh that owns morphResult is being visited now -- resolved here (not at collection time,
            // where vOff was not yet known) the same way GLBParser's v4112 resolves morphVertexOffset.
            morphOwnerVertexStart = vOff;
        }

        for (const g of pd.groups) {
            const localMat = pd.mats[g.materialIndex] ?? pd.mats[0] ?? null;
            const globalMatIdx = localMat ? materialIndexOf.get(localMat) : null;
            primitiveRanges.push({
                indexStart: iOff + g.start,
                indexCount: g.count,
                materialIdx: (globalMatIdx != null) ? globalMatIdx : null,
                vertexStart: vOff,
                vertexCount: pd.vc,
            });
        }

        vOff += pd.vc;
        iOff += pd.idx.length;
    }

    return {
        positions,
        normals,
        texCoords,
        indices,
        texture,
        joints: jointsOut,
        weights: weightsOut,
        skin,
        animations,
        nodes,
        colors: null,
        morphTargets: morphResult ? morphResult.targets : null,
        morphTargetNames: morphResult ? morphResult.names : null,
        morphWeights: morphResult ? morphResult.weights : null,
        morphVertexCount: morphResult ? morphResult.vertexCount : 0,
        morphVertexOffset: morphResult ? Math.max(0, morphOwnerVertexStart) : 0,
        morphPlaced: morphResult ? (morphOwnerVertexStart >= 0) : false,
        primitiveRanges,
        texturesByMaterial,
    };
}
