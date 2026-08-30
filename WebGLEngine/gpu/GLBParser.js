// FILE: gpu/GLBParser.js
// VERSION: v1
//
// Minimal GLB binary parser. Loads a .glb file's first mesh primitive
// and any embedded base-color texture. Sufficient for static creatures,
// civ markers, and props authored in Blender / typical GLB exporters.
//
// Returns:
//   {
//     positions:  Float32Array,                  // vec3 per vertex
//     normals:    Float32Array | null,           // vec3 per vertex
//     texCoords:  Float32Array | null,           // vec2 per vertex
//     indices:    Uint32Array,                   // triangle indices
//     texture:    ImageBitmap | null,            // base-color texture
//     // Round 19 — skeletal data
//     joints:     Uint16Array | Uint8Array | null,    // uvec4 per vertex
//     weights:    Float32Array | null,           // vec4 per vertex
//     skin:       { joints: number[], inverseBindMatrices: Float32Array[], skeleton: number|null } | null,
//     animations: { name, duration, samplers, channels }[] | null,
//     nodes:      { translation, rotation, scale, parent, children }[],
//   }
//
// LIMITATIONS (intentional, for parser size + clarity):
//   * Reads only the first mesh's first primitive
//   * Only TRIANGLES topology (no points/lines/strips)
//   * Only base-color texture (no metallic-roughness, normal maps,
//     emissive, ambient occlusion, etc.)
//   * Only PNG / JPEG embedded images. KTX2 / Basis textures rejected.
//   * No animations, skinning, morph targets
//   * No external buffer/image URI references — only embedded BIN chunk
//
// All of these are reasonable to add in future rounds without breaking
// the v1 API.

const GLB_MAGIC      = 0x46546C67;   // "glTF"
const CHUNK_TYPE_JSON = 0x4E4F534A;   // "JSON"
const CHUNK_TYPE_BIN  = 0x004E4942;   // "BIN\0"

// glTF 2.0 componentType codes → typed array constructors + sizes
const CT_BYTE          = 5120;
const CT_UBYTE         = 5121;
const CT_SHORT         = 5122;
const CT_USHORT        = 5123;
const CT_UINT          = 5125;
const CT_FLOAT         = 5126;

const COMPONENT_BYTES = {
    [CT_BYTE]:   1, [CT_UBYTE]:  1,
    [CT_SHORT]:  2, [CT_USHORT]: 2,
    [CT_UINT]:   4, [CT_FLOAT]:  4,
};

const COMPONENT_CTOR = {
    [CT_BYTE]:   Int8Array,
    [CT_UBYTE]:  Uint8Array,
    [CT_SHORT]:  Int16Array,
    [CT_USHORT]: Uint16Array,
    [CT_UINT]:   Uint32Array,
    [CT_FLOAT]:  Float32Array,
};

// glTF 2.0 type → number of components per element
const TYPE_COMPS = {
    "SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4,
    "MAT2":   4, "MAT3": 9, "MAT4":  16,
};

export class GLBParser {

    /**
     * Parse a GLB ArrayBuffer.
     *
     * @param {ArrayBuffer} arrayBuffer
     * @param {Object} [opts]
     * @param {boolean} [opts.postProcess=true]  v364 — weld duplicate
     *   vertices and recompute smooth normals after parse. Default ON
     *   for static meshes (helps AI-generated meshes a lot); skipped
     *   for skinned meshes. Pass `false` to disable.
     * @param {number} [opts.weldEpsilon=1e-4]   weld tolerance
     * @param {boolean} [opts.recomputeNormals=true] when post-processing,
     *   override file normals with welded smooth normals. Set false to
     *   preserve baked normals (and just dedupe).
     */
    static async parse(arrayBuffer, opts = {}) {
        const dv = new DataView(arrayBuffer);

        // v729 — detect format. Binary GLB starts with "glTF" magic (0x46546C67).
        // Anything else: try to parse as text JSON (multi-file .gltf, where
        // geometry buffers + textures live in separate files referenced by URI).
        // Multi-file mode requires opts.baseUrl so we can resolve relative URIs.
        const magic = arrayBuffer.byteLength >= 4 ? dv.getUint32(0, true) : 0;
        let json = null;
        let bin  = null;

        if (magic === GLB_MAGIC) {
            // ---- Existing binary GLB path ----
            const version = dv.getUint32(4, true);
            if (version !== 2) {
                throw new Error(`unsupported GLB version ${version} (need 2)`);
            }
            const totalLength = dv.getUint32(8, true);
            let offset = 12;
            while (offset < totalLength && offset < arrayBuffer.byteLength) {
                const chunkLength = dv.getUint32(offset, true);
                const chunkType   = dv.getUint32(offset + 4, true);
                const dataStart   = offset + 8;
                if (chunkType === CHUNK_TYPE_JSON) {
                    const bytes = new Uint8Array(arrayBuffer, dataStart, chunkLength);
                    json = JSON.parse(new TextDecoder("utf-8").decode(bytes));
                } else if (chunkType === CHUNK_TYPE_BIN) {
                    bin = new Uint8Array(arrayBuffer, dataStart, chunkLength);
                }
                offset = dataStart + chunkLength;
            }
            if (!json) throw new Error("no JSON chunk in GLB");
            if (!bin)  throw new Error("no BIN chunk in GLB");
        } else {
            // ---- v729 multi-file .gltf path ----
            // Treat the bytes as UTF-8 JSON. If parsing fails, fall through
            // to the original GLB error so the user sees a clear message.
            let text;
            try {
                text = new TextDecoder("utf-8").decode(new Uint8Array(arrayBuffer));
                json = JSON.parse(text);
            } catch {
                throw new Error("not a GLB file (magic mismatch) and not valid JSON either");
            }
            // For multi-file mode we need a baseUrl to resolve buffer/image
            // URIs. Without it, we can only handle data: URIs (embedded base64).
            const baseUrl = opts.baseUrl || "";
            // Fetch each buffer referenced by URI. Most assets only have one
            // buffer (the .bin sidecar). Embedded base64 buffers also resolve
            // here ("data:application/octet-stream;base64,...").
            if (Array.isArray(json.buffers) && json.buffers.length > 0) {
                const fetched = [];
                for (let i = 0; i < json.buffers.length; i++) {
                    const b = json.buffers[i];
                    if (!b.uri) {
                        throw new Error(`buffer[${i}] has no uri in multi-file gltf`);
                    }
                    if (b.uri.startsWith("data:")) {
                        // data URI — decode inline (no fetch)
                        const comma = b.uri.indexOf(",");
                        const base64 = b.uri.slice(comma + 1);
                        const binStr = atob(base64);
                        const arr = new Uint8Array(binStr.length);
                        for (let k = 0; k < binStr.length; k++) arr[k] = binStr.charCodeAt(k);
                        fetched.push(arr);
                    } else {
                        if (!baseUrl) {
                            throw new Error("multi-file .gltf needs opts.baseUrl to resolve buffer URIs");
                        }
                        const url = new URL(b.uri, baseUrl).href;
                        const r = await fetch(url);
                        if (!r.ok) throw new Error(`failed to fetch buffer ${url}: HTTP ${r.status}`);
                        const ab = await r.arrayBuffer();
                        fetched.push(new Uint8Array(ab));
                    }
                }
                // Most assets use buffer 0 for everything; the rest of the
                // parser already assumes that. For the rare multi-buffer
                // case we'd need to track per-bufferView buffer index.
                bin = fetched[0];
                // Stash all buffers on the json so per-bufferView code paths
                // can opt-in to the correct one (the existing parser uses
                // a single `bin` variable so multi-buffer multi-file assets
                // beyond buffer 0 may still fail — honest gap).
                json._buffers = fetched;
                json._baseUrl = baseUrl;
            }
            if (!json || !json.asset) {
                throw new Error("text gltf missing required asset section");
            }
        }

        // Round 64 — Multi-primitive concatenation for full skinned mesh
        // rendering. Previously (Round 61) we picked the FIRST primitive
        // with JOINTS_0+WEIGHTS_0 and rendered just that, which meant a
        // multi-material rig like RobotExpressive showed only one body
        // part. This pass collects EVERY skinned primitive across ALL
        // meshes, then concatenates positions / normals / UVs / joints /
        // weights / indices into one large set. Indices are offset by
        // each primitive's vertex-base to remain valid in the combined
        // buffer. The first skinned primitive is still treated as the
        // "reference" for skin/material lookup, since:
        //   - All primitives of a skinned character share the same skin
        //     (joints/IBMs are skin-level, not primitive-level).
        //   - Materials are per-primitive but the current renderer is
        //     single-material; using primitive 0's material is a
        //     reasonable approximation until multi-material is added.
        // If NO primitive in the file is skinned, we fall back to the
        // pre-Round 61 behavior of reading meshes[0]/primitives[0] as a
        // single static mesh.
        const meshes = json.meshes || [];
        if (meshes.length === 0) throw new Error("no meshes in GLB");

        const skinnedPrims = [];
        // Round 115 — also collect NON-skinned primitives. Previously
        // these were silently dropped, which for RobotExpressive.glb
        // meant only the arms rendered (the torso, head, legs, and
        // face details lack JOINTS_0/WEIGHTS_0 because they're not
        // weighted to bones — they hang off bone nodes as static
        // attachments). For each one we'll:
        //   1. Find the node that owns this primitive's mesh
        //   2. Walk up the parent chain to find the deepest ancestor
        //      node that is in the skin's joints[] array — that's the
        //      bone this primitive should follow
        //   3. Bake the bind-pose local transform between the owning
        //      node and that bone into the vertices
        //   4. Assign synthetic JOINTS_0 = [boneIdx, 0, 0, 0] and
        //      WEIGHTS_0 = [1, 0, 0, 0] so the primitive rigidly
        //      tracks that bone at runtime.
        // Fallback: if no ancestor is a joint, bind to joint 0 (root)
        // — at least it'll appear in roughly the right place.
        const unskinnedPrims = [];
        for (let mi = 0; mi < meshes.length; mi++) {
            const prims = meshes[mi].primitives || [];
            for (let pi = 0; pi < prims.length; pi++) {
                const a = prims[pi].attributes || {};
                if (a.JOINTS_0 != null && a.WEIGHTS_0 != null) {
                    skinnedPrims.push({ meshIdx: mi, primIdx: pi, prim: prims[pi] });
                } else if (a.POSITION != null) {
                    unskinnedPrims.push({ meshIdx: mi, primIdx: pi, prim: prims[pi] });
                }
            }
        }

        let meshIdx = 0;
        let primIdx = 0;
        let positions, normals, texCoords, indices, joints, weights, colors;
        let prim;   // "reference" primitive for material/texture lookup

        // Round 115 — parse the skin EARLY (was at line ~410) so we
        // can append synthetic joints for unskinned-primitive owning
        // nodes during the concat pass. The shader's joint matrix
        // uniform is capped at 64 slots; if we'd exceed that, we fall
        // back to the simpler "bind to deepest joint ancestor" path.
        let skin = null;
        if (json.skins && json.nodes && skinnedPrims.length > 0) {
            const refMeshIdx = skinnedPrims[0].meshIdx;
            for (const node of json.nodes) {
                if (node.mesh === refMeshIdx && node.skin != null) {
                    skin = this._parseSkin(json, bin, node.skin);
                    break;
                }
            }
            if (!skin && json.skins.length > 0) {
                skin = this._parseSkin(json, bin, 0);
            }
        }

        if (skinnedPrims.length > 0) {
            // ---- Skinned: concat path ----
            const ref = skinnedPrims[0];
            meshIdx = ref.meshIdx;
            primIdx = ref.primIdx;
            prim    = ref.prim;
            // Mode check on every primitive — refuse non-triangles
            for (const sp of skinnedPrims) {
                const m = sp.prim.mode != null ? sp.prim.mode : 4;
                if (m !== 4) {
                    throw new Error(`primitive at meshes[${sp.meshIdx}].primitives[${sp.primIdx}] has mode ${m}, only TRIANGLES (4) supported`);
                }
            }

            // Decide attribute presence globally — drop attributes that
            // any primitive lacks (consistency across the combined VBO).
            let allHaveNormals = true;
            let allHaveUVs     = true;
            for (const sp of skinnedPrims) {
                const a = sp.prim.attributes || {};
                if (a.NORMAL     == null) allHaveNormals = false;
                if (a.TEXCOORD_0 == null) allHaveUVs     = false;
            }

            // First pass: read every primitive's geometry. Records what
            // we need to compute final array sizes + later concat.
            const primData = [];
            let totalVerts   = 0;
            let totalIndices = 0;
            for (const sp of skinnedPrims) {
                const a = sp.prim.attributes || {};
                const pos = this._readAccessor(json, bin, a.POSITION);
                const norm = allHaveNormals ? this._readAccessor(json, bin, a.NORMAL)     : null;
                const uv   = allHaveUVs     ? this._readAccessor(json, bin, a.TEXCOORD_0) : null;
                const j    = this._readAccessor(json, bin, a.JOINTS_0);
                const w    = this._readAccessor(json, bin, a.WEIGHTS_0);

                let idx;
                if (sp.prim.indices != null) {
                    const raw = this._readAccessor(json, bin, sp.prim.indices);
                    idx = raw instanceof Uint32Array ? raw : new Uint32Array(raw);
                } else {
                    const n = pos.length / 3;
                    idx = new Uint32Array(n);
                    for (let i = 0; i < n; i++) idx[i] = i;
                }

                // Round 118 — per-primitive material color baked into a
                // per-vertex aColor attribute. We pull baseColorFactor
                // from each primitive's material (default [1,1,1] for
                // primitives lacking material), expand to per-vertex,
                // and concat alongside positions. The downstream
                // shader multiplies vertex color into the instance
                // tint so each robot part renders with its own color
                // (silver body, gray accents, dark joints, etc.).
                //
                // Round 119 — also read COLOR_0 attribute if present.
                // RobotExpressive and many Three.js example models
                // store per-vertex color variation here independently
                // of the material's baseColorFactor — without reading
                // it the whole mesh appears bland. Final per-vertex
                // color = COLOR_0 × baseColorFactor.
                const baseColor = this._materialBaseColor(json, sp.prim.material);
                const vcSkinned = pos.length / 3;
                const colors = new Float32Array(vcSkinned * 3);
                if (a.COLOR_0 != null) {
                    const srcCol = this._readAccessor(json, bin, a.COLOR_0);
                    const acc = json.accessors[a.COLOR_0];
                    const compsPerVert = (acc.type === "VEC4") ? 4 : 3;
                    // Source may be normalized uint8/uint16 — typed-array
                    // already exposes raw values; we normalize ourselves.
                    const isU8  = srcCol instanceof Uint8Array;
                    const isU16 = srcCol instanceof Uint16Array;
                    const norm  = isU8 ? 1 / 255 : isU16 ? 1 / 65535 : 1.0;
                    for (let v = 0; v < vcSkinned; v++) {
                        const r = srcCol[v * compsPerVert + 0] * norm;
                        const g = srcCol[v * compsPerVert + 1] * norm;
                        const b = srcCol[v * compsPerVert + 2] * norm;
                        colors[v * 3 + 0] = r * baseColor[0];
                        colors[v * 3 + 1] = g * baseColor[1];
                        colors[v * 3 + 2] = b * baseColor[2];
                    }
                } else {
                    for (let v = 0; v < vcSkinned; v++) {
                        colors[v * 3 + 0] = baseColor[0];
                        colors[v * 3 + 1] = baseColor[1];
                        colors[v * 3 + 2] = baseColor[2];
                    }
                }

                primData.push({ pos, norm, uv, j, w, idx, vc: vcSkinned, color: colors, materialIdx: sp.prim.material ?? null, prim: sp.prim });
                totalVerts   += vcSkinned;
                totalIndices += idx.length;
            }

            // Round 115 — also read unskinned primitives. For each one
            // we register its owning node as a NEW JOINT in the skin
            // (with identity inverse-bind-matrix) and bind every vertex
            // to that joint with weight 1.0. The runtime animator
            // already walks the full node hierarchy and applies any
            // translation/rotation/scale animation channels — by
            // making the owning node a joint, those animations apply
            // automatically. This is critical for RobotExpressive
            // because face-detail nodes have translation channels that
            // animate the mouth/nose during the speaking clip; baking
            // the bind pose would freeze the face at base pose while
            // the runtime expects it to move with the channel.
            //
            // Shader joint limit is 64. If appending more joints would
            // exceed that, we fall back to binding to the deepest
            // joint ancestor (the face will look static during talk
            // animations but at least renders correctly in T-pose).
            const SHADER_JOINT_LIMIT = 64;
            const skinJoints = (skin?.joints) || [];
            const skinIBMs   = (skin?.inverseBindMatrices) || [];
            const jointIndexByNode = new Map();
            for (let j = 0; j < skinJoints.length; j++) {
                jointIndexByNode.set(skinJoints[j], j);
            }
            const nodeSnap = json.nodes || [];
            // Precompute parents for hierarchy walks
            const parentByNode = new Array(nodeSnap.length).fill(-1);
            for (let ni = 0; ni < nodeSnap.length; ni++) {
                const children = nodeSnap[ni].children || [];
                for (const ci of children) parentByNode[ci] = ni;
            }
            // Find owning node for each mesh (first match wins)
            const nodeByMesh = new Map();
            for (let ni = 0; ni < nodeSnap.length; ni++) {
                const m = nodeSnap[ni].mesh;
                if (m != null && !nodeByMesh.has(m)) nodeByMesh.set(m, ni);
            }

            for (const up of unskinnedPrims) {
                const a = up.prim.attributes || {};
                const m = up.prim.mode != null ? up.prim.mode : 4;
                if (m !== 4) continue;       // skip lines/points/strips

                const ownerNode = nodeByMesh.get(up.meshIdx);
                let bindJointIdx = 0;
                let bakedMatrix = null;   // null = no vertex pre-transform

                if (ownerNode != null) {
                    // First try: register owner node as a new joint
                    if (jointIndexByNode.has(ownerNode)) {
                        bindJointIdx = jointIndexByNode.get(ownerNode);
                    } else if (skinJoints.length < SHADER_JOINT_LIMIT && skin) {
                        // Append owner node as new joint with identity IBM.
                        // At runtime the animator computes the node's
                        // world matrix (including any animated TRS
                        // channels on it OR its ancestors). With IBM =
                        // identity, the joint matrix IS the node world
                        // matrix, so vertex-in-local * jointMatrix =
                        // vertex-in-world. Perfect rigid attachment
                        // with full inherited animation.
                        const newIdx = skinJoints.length;
                        skinJoints.push(ownerNode);
                        const ibm = new Float32Array(16);
                        ibm[0] = ibm[5] = ibm[10] = ibm[15] = 1;
                        skinIBMs.push(ibm);
                        jointIndexByNode.set(ownerNode, newIdx);
                        bindJointIdx = newIdx;
                    } else {
                        // Joint limit hit — fall back: walk up to find
                        // deepest joint ancestor + bake the relative
                        // transform into vertices. (Older code path.)
                        let cur = ownerNode;
                        let mat = this._identityMat4();
                        while (cur !== -1) {
                            if (jointIndexByNode.has(cur)) {
                                bindJointIdx = jointIndexByNode.get(cur);
                                bakedMatrix = mat;
                                break;
                            }
                            const nodeMat = this._nodeLocalMatrix(nodeSnap[cur]);
                            mat = this._mat4Mul(nodeMat, mat);
                            cur = parentByNode[cur];
                        }
                        if (cur === -1) bakedMatrix = mat;   // root fallback
                    }
                }

                // Read positions (transform if baking, otherwise leave local)
                const srcPos = this._readAccessor(json, bin, a.POSITION);
                const vc = srcPos.length / 3;
                let pos;
                if (bakedMatrix) {
                    pos = new Float32Array(srcPos.length);
                    for (let v = 0; v < vc; v++) {
                        const x = srcPos[v * 3 + 0];
                        const y = srcPos[v * 3 + 1];
                        const z = srcPos[v * 3 + 2];
                        pos[v * 3 + 0] = bakedMatrix[0]*x + bakedMatrix[4]*y + bakedMatrix[8] *z + bakedMatrix[12];
                        pos[v * 3 + 1] = bakedMatrix[1]*x + bakedMatrix[5]*y + bakedMatrix[9] *z + bakedMatrix[13];
                        pos[v * 3 + 2] = bakedMatrix[2]*x + bakedMatrix[6]*y + bakedMatrix[10]*z + bakedMatrix[14];
                    }
                } else {
                    pos = srcPos instanceof Float32Array ? srcPos.slice() : new Float32Array(srcPos);
                }
                // Read + transform normals (rotation part only, no translate)
                let norm = null;
                if (allHaveNormals && a.NORMAL != null) {
                    const srcNorm = this._readAccessor(json, bin, a.NORMAL);
                    if (bakedMatrix) {
                        norm = new Float32Array(srcNorm.length);
                        for (let v = 0; v < vc; v++) {
                            const x = srcNorm[v * 3 + 0];
                            const y = srcNorm[v * 3 + 1];
                            const z = srcNorm[v * 3 + 2];
                            norm[v * 3 + 0] = bakedMatrix[0]*x + bakedMatrix[4]*y + bakedMatrix[8] *z;
                            norm[v * 3 + 1] = bakedMatrix[1]*x + bakedMatrix[5]*y + bakedMatrix[9] *z;
                            norm[v * 3 + 2] = bakedMatrix[2]*x + bakedMatrix[6]*y + bakedMatrix[10]*z;
                        }
                    } else {
                        norm = srcNorm instanceof Float32Array ? srcNorm.slice() : new Float32Array(srcNorm);
                    }
                } else if (allHaveNormals) {
                    norm = new Float32Array(vc * 3);
                    for (let v = 0; v < vc; v++) norm[v * 3 + 1] = 1;    // up
                }
                let uv = null;
                if (allHaveUVs && a.TEXCOORD_0 != null) {
                    uv = this._readAccessor(json, bin, a.TEXCOORD_0);
                } else if (allHaveUVs) {
                    uv = new Float32Array(vc * 2);    // zeros
                }
                // Synthetic skin data — single joint with full weight
                const j = new Uint16Array(vc * 4);
                const w = new Float32Array(vc * 4);
                for (let v = 0; v < vc; v++) {
                    j[v * 4 + 0] = bindJointIdx;
                    w[v * 4 + 0] = 1.0;
                }
                // Round 118/119 — bake material baseColorFactor (× COLOR_0
                // if present) as per-vertex color
                const baseColor = this._materialBaseColor(json, up.prim.material);
                const colors = new Float32Array(vc * 3);
                if (a.COLOR_0 != null) {
                    const srcCol = this._readAccessor(json, bin, a.COLOR_0);
                    const acc = json.accessors[a.COLOR_0];
                    const compsPerVert = (acc.type === "VEC4") ? 4 : 3;
                    const isU8  = srcCol instanceof Uint8Array;
                    const isU16 = srcCol instanceof Uint16Array;
                    const normFactor = isU8 ? 1 / 255 : isU16 ? 1 / 65535 : 1.0;
                    for (let v = 0; v < vc; v++) {
                        colors[v * 3 + 0] = srcCol[v * compsPerVert + 0] * normFactor * baseColor[0];
                        colors[v * 3 + 1] = srcCol[v * compsPerVert + 1] * normFactor * baseColor[1];
                        colors[v * 3 + 2] = srcCol[v * compsPerVert + 2] * normFactor * baseColor[2];
                    }
                } else {
                    for (let v = 0; v < vc; v++) {
                        colors[v * 3 + 0] = baseColor[0];
                        colors[v * 3 + 1] = baseColor[1];
                        colors[v * 3 + 2] = baseColor[2];
                    }
                }
                // Indices
                let idx;
                if (up.prim.indices != null) {
                    const raw = this._readAccessor(json, bin, up.prim.indices);
                    idx = raw instanceof Uint32Array ? raw : new Uint32Array(raw);
                } else {
                    idx = new Uint32Array(vc);
                    for (let i = 0; i < vc; i++) idx[i] = i;
                }
                primData.push({ pos, norm, uv, j, w, idx, vc, color: colors, materialIdx: up.prim.material ?? null, prim: up.prim });
                totalVerts   += vc;
                totalIndices += idx.length;
            }

            // Allocate combined buffers. Use Uint16Array for joints
            // (UNSIGNED_SHORT) since it covers any rig size up to 65535
            // joints and gpuAssetLoader.js already maps Uint16Array →
            // gl.UNSIGNED_SHORT. Upcasting from Uint8Array primitives
            // is a no-op via TypedArray.set().
            positions = new Float32Array(totalVerts * 3);
            normals   = allHaveNormals ? new Float32Array(totalVerts * 3) : null;
            texCoords = allHaveUVs     ? new Float32Array(totalVerts * 2) : null;
            joints    = new Uint16Array(totalVerts * 4);
            weights   = new Float32Array(totalVerts * 4);
            indices   = new Uint32Array(totalIndices);
            // Round 118 — per-vertex colors (always present since every
            // primData entry now sets one, defaulting to [1,1,1] if the
            // primitive lacks a material).
            const colorsCombined = new Float32Array(totalVerts * 3);

            // Second pass: concat with vertex-base offsets on indices.
            // Round 122 — also track per-primitive index ranges so the
            // renderer can do multi-pass draws when primitives have
            // different textures. primitiveRanges[i] = {indexStart,
            // indexCount, materialIdx}. The renderer can either draw
            // each range with its own texture bind, OR (default path)
            // just call drawElements once on the full index buffer if
            // there's only one texture in play.
            const primitiveRanges = [];
            // v4112 -- *** A MORPH TARGET BELONGS TO ONE PRIMITIVE, AND THIS ARRAY IS ALL OF THEM CONCATENATED. ***
            // _readMorphTargets reads deltas from a SINGLE primitive, so its delta array is that primitive's own
            // vertex count -- 302 for RobotExpressive's head against 7214 for the whole concatenated mesh. Until
            // now nothing recorded WHERE those 302 land, so any consumer adding delta[i] to positions[i] would
            // have deformed the first 302 vertices of the concatenation, which are a different primitive
            // entirely. The vertex start is already being computed here to offset the indices; it just was not
            // being kept.
            const primVertexStart = new Map();
            let vOff = 0;
            let iOff = 0;
            for (const pd of primData) {
                positions.set(pd.pos, vOff * 3);
                if (normals)   normals.set(pd.norm,   vOff * 3);
                if (texCoords) texCoords.set(pd.uv,   vOff * 2);
                // joints/weights are 4-wide per vertex
                joints.set(pd.j, vOff * 4);
                weights.set(pd.w, vOff * 4);
                // Round 118 — per-vertex colors
                if (pd.color) colorsCombined.set(pd.color, vOff * 3);
                // indices with offset
                for (let i = 0; i < pd.idx.length; i++) {
                    indices[iOff + i] = pd.idx[i] + vOff;
                }
                // Range entry for this primitive
                primitiveRanges.push({
                    indexStart: iOff,
                    indexCount: pd.idx.length,
                    materialIdx: pd.materialIdx ?? null,
                    vertexStart: vOff,          // v4112
                    vertexCount: pd.vc,         // v4112
                });
                if (pd.prim) primVertexStart.set(pd.prim, vOff);   // v4112
                vOff += pd.vc;
                iOff += pd.idx.length;
            }
            this._lastPrimVertexStart = primVertexStart;   // v4112
            // Expose concat outputs through outer-scope vars; the
            // primitiveRanges array is added to the return shape below.
            colors = colorsCombined;
            // Stash on outer-scope so the return statement can include it
            this._lastPrimitiveRanges = primitiveRanges;

            if (skinnedPrims.length > 1 || unskinnedPrims.length > 0) {
                console.log(`[GLBParser] concat ${skinnedPrims.length} skinned + ${unskinnedPrims.length} unskinned primitives: ${totalVerts} verts, ${totalIndices} indices`);
            } else if (meshIdx !== 0 || primIdx !== 0) {
                console.log(`[GLBParser] selected skinned primitive at meshes[${meshIdx}].primitives[${primIdx}]`);
            }
        } else {
            // ---- Static scene-graph walk (v768, round 30 follow-up) ----
            //
            // Round 50-ish original "fallback": read meshes[0].primitives[0]
            // and call it done. This worked for single-mesh AI-generated
            // GLBs (Trellis output is one big primitive) but missed everything
            // about multi-mesh glTF authored content. Specifically the
            // Quaternius Downtown pack: each building's .gltf has a parent
            // node with multiple child mesh nodes for floors, walls, windows,
            // roof — and only the FOOTPRINT plane was meshes[0].primitives[0].
            // Result: every building rendered as a flat 12-vert square at
            // y=0, totally invisible. (v764 worked around this by detecting
            // bbox.sy < 0.5 and substituting obelisks; this is the real fix.)
            //
            // The walker visits each scene root, recurses into children,
            // accumulates parent transforms (matrix from node.matrix or
            // composed from node.translation/rotation/scale), and when a
            // node points at a mesh, BAKES every primitive's vertices by
            // the accumulated matrix. Resulting positions/normals/UVs/
            // indices/material ranges are merged into the parser's standard
            // single-mesh output format so downstream renderers don't need
            // to know about the scene graph at all.
            //
            // Normals must be transformed by the matrix's upper-left 3x3
            // (rotation + non-uniform-scale safe IF we re-normalize); we
            // do the simple "transform + renormalize" path which is good
            // enough for the renderer's lighting. Positions get the full
            // 4x4 matrix multiply.
            const scenes = json.scenes || [];
            const sceneIdx = (json.scene != null) ? json.scene : 0;
            const rootNodes = (scenes[sceneIdx] && Array.isArray(scenes[sceneIdx].nodes))
                ? scenes[sceneIdx].nodes
                : Object.keys(json.nodes || {}).map(k => +k);

            // Collected vertex/index arrays + per-primitive ranges
            const allPositions = [];
            const allNormals   = [];
            const allUVs       = [];
            const allIndices   = [];
            const primRanges   = [];  // [{indexStart, indexCount, materialIdx}]
            let haveNormals = true;   // becomes false if any primitive lacks normals
            let haveUVs     = true;
            let vertexBase  = 0;

            // Reference primitive for material lookup compatibility — set
            // to the first encountered primitive so existing texture-
            // extraction logic (which reads `prim.material`) still works.
            let firstPrim = null;
            let firstPrimMeshIdx = 0;
            let firstPrimPrimIdx = 0;

            const visit = (nodeIdx, parentMat) => {
                const node = (json.nodes || [])[nodeIdx];
                if (!node) return;
                const localMat = GLBParser._nodeLocalMatrix(node);
                const worldMat = parentMat ? GLBParser._mat4Mul(parentMat, localMat) : localMat;

                if (node.mesh != null) {
                    const mesh = (json.meshes || [])[node.mesh];
                    if (mesh && Array.isArray(mesh.primitives)) {
                        // Inverse-transpose of worldMat upper-left 3x3 would
                        // be ideal for normals, but for the common case
                        // (rigid transforms + uniform scale, like Quaternius
                        // assets) re-normalizing after a direct upper-3x3
                        // multiply is sufficient. We use that here for speed.
                        const m = worldMat;
                        for (let pi = 0; pi < mesh.primitives.length; pi++) {
                            const p = mesh.primitives[pi];
                            const a = p.attributes || {};
                            const mode = p.mode != null ? p.mode : 4;
                            if (mode !== 4) continue;   // skip non-triangle primitives silently
                            if (a.POSITION == null) continue;

                            if (firstPrim == null) {
                                firstPrim = p;
                                firstPrimMeshIdx = node.mesh;
                                firstPrimPrimIdx = pi;
                            }

                            // Bake positions through worldMat
                            const srcPos = this._readAccessor(json, bin, a.POSITION);
                            const vCount = srcPos.length / 3;
                            const dstPos = new Float32Array(srcPos.length);
                            for (let v = 0; v < vCount; v++) {
                                const x = srcPos[v*3], y = srcPos[v*3+1], z = srcPos[v*3+2];
                                dstPos[v*3]     = m[0]*x + m[4]*y + m[8]*z  + m[12];
                                dstPos[v*3 + 1] = m[1]*x + m[5]*y + m[9]*z  + m[13];
                                dstPos[v*3 + 2] = m[2]*x + m[6]*y + m[10]*z + m[14];
                            }
                            allPositions.push(dstPos);

                            // v771 — Normals transformed by inverse-transpose
                            // of worldMat's upper-3x3 (correct for non-uniform
                            // scale). v768 used simple upper-3x3 + renormalize
                            // which only worked under rigid + uniform-scale.
                            // Compute once per primitive, reuse per vertex.
                            if (a.NORMAL != null) {
                                const srcN = this._readAccessor(json, bin, a.NORMAL);
                                const dstN = new Float32Array(srcN.length);
                                const nMat = GLBParser._inverseTranspose3x3(m);
                                for (let v = 0; v < vCount; v++) {
                                    const nx = srcN[v*3], ny = srcN[v*3+1], nz = srcN[v*3+2];
                                    let tx = nMat[0]*nx + nMat[1]*ny + nMat[2]*nz;
                                    let ty = nMat[3]*nx + nMat[4]*ny + nMat[5]*nz;
                                    let tz = nMat[6]*nx + nMat[7]*ny + nMat[8]*nz;
                                    const len = Math.sqrt(tx*tx + ty*ty + tz*tz) || 1;
                                    dstN[v*3]     = tx / len;
                                    dstN[v*3 + 1] = ty / len;
                                    dstN[v*3 + 2] = tz / len;
                                }
                                allNormals.push(dstN);
                            } else {
                                haveNormals = false;
                                allNormals.push(new Float32Array(vCount * 3));
                            }

                            // UVs pass through unchanged
                            if (a.TEXCOORD_0 != null) {
                                allUVs.push(this._readAccessor(json, bin, a.TEXCOORD_0));
                            } else {
                                haveUVs = false;
                                allUVs.push(new Float32Array(vCount * 2));
                            }

                            // Indices — offset by accumulated vertexBase
                            let srcIdx;
                            if (p.indices != null) {
                                const raw = this._readAccessor(json, bin, p.indices);
                                srcIdx = raw instanceof Uint32Array ? raw : new Uint32Array(raw);
                            } else {
                                srcIdx = new Uint32Array(vCount);
                                for (let i = 0; i < vCount; i++) srcIdx[i] = i;
                            }
                            const offIdx = new Uint32Array(srcIdx.length);
                            for (let i = 0; i < srcIdx.length; i++) offIdx[i] = srcIdx[i] + vertexBase;
                            const rangeStart = allIndices.reduce((acc, arr) => acc + arr.length, 0);
                            allIndices.push(offIdx);
                            primRanges.push({
                                indexStart: rangeStart,
                                indexCount: offIdx.length,
                                materialIdx: p.material ?? null,
                            });
                            vertexBase += vCount;
                        }
                    }
                }

                if (Array.isArray(node.children)) {
                    for (const childIdx of node.children) visit(childIdx, worldMat);
                }
            };

            // Walk every scene root with identity parent
            for (const ridx of rootNodes) visit(ridx, null);

            if (allPositions.length === 0) {
                // Nothing found in the scene graph — fall back to the
                // pre-v768 single-primitive read so we never regress on
                // single-mesh AI GLBs that lack a scenes[] entry.
                const primitives = meshes[0].primitives || [];
                if (primitives.length === 0) throw new Error("first mesh has no primitives");
                prim = primitives[0];
                const a = prim.attributes || {};
                positions = this._readAccessor(json, bin, a.POSITION);
                normals   = a.NORMAL     != null ? this._readAccessor(json, bin, a.NORMAL)     : null;
                texCoords = a.TEXCOORD_0 != null ? this._readAccessor(json, bin, a.TEXCOORD_0) : null;
                if (prim.indices != null) {
                    const raw = this._readAccessor(json, bin, prim.indices);
                    indices = raw instanceof Uint32Array ? raw : new Uint32Array(raw);
                } else {
                    const n = positions.length / 3;
                    indices = new Uint32Array(n);
                    for (let i = 0; i < n; i++) indices[i] = i;
                }
                this._lastPrimitiveRanges = [{
                    indexStart: 0, indexCount: indices.length, materialIdx: prim.material ?? null,
                }];
            } else {
                // Merge all the per-primitive arrays into single typed arrays.
                // Total vertex count = sum of all primitive vertex counts;
                // total index count = sum of all primitive index counts.
                let totalVerts = 0, totalIdx = 0;
                for (const pa of allPositions) totalVerts += pa.length / 3;
                for (const ia of allIndices)   totalIdx   += ia.length;

                positions = new Float32Array(totalVerts * 3);
                normals   = haveNormals ? new Float32Array(totalVerts * 3) : null;
                texCoords = haveUVs ? new Float32Array(totalVerts * 2) : null;
                indices   = new Uint32Array(totalIdx);

                let voff = 0, ioff = 0, uvoff = 0;
                for (let i = 0; i < allPositions.length; i++) {
                    positions.set(allPositions[i], voff);
                    if (normals)   normals.set(allNormals[i], voff);
                    if (texCoords) texCoords.set(allUVs[i],   uvoff);
                    voff += allPositions[i].length;
                    uvoff += (allUVs[i]?.length || 0);
                }
                for (const ia of allIndices) {
                    indices.set(ia, ioff);
                    ioff += ia.length;
                }

                prim = firstPrim;   // for material lookup compat
                meshIdx = firstPrimMeshIdx;
                primIdx = firstPrimPrimIdx;
                joints = null;
                weights = null;
                this._lastPrimitiveRanges = primRanges;
                console.log(`[GLBParser] scene-graph walk: ${primRanges.length} primitive(s), ${totalVerts} verts, ${totalIdx} indices`);
            }
        }

        // ---- Material/texture ----
        // Round 119 — scan ALL primitives (skinned + unskinned + static
        // fallback) for a base-color texture, not just the reference
        // primitive. RobotExpressive's primitive 0 has no texture but
        // a sibling primitive might (face details, eye textures). We
        // use the first non-null texture we find; multi-texture
        // atlasing across primitives is a deeper polish that needs
        // per-primitive draw calls (out of scope for v2.119).
        //
        // Round 122 — also extract a per-primitive textures map
        // (materialIdx → ImageBitmap). The single `texture` return
        // field stays for backwards compat with renderers that don't
        // know about multi-draw, but consumers that DO can use
        // `texturesByMaterial` to bind per-primitive textures when
        // walking primitiveRanges.
        let texture = null;
        const texturesByMaterial = {};
        if (json.materials) {
            const tryMat = async (matIdx) => {
                if (matIdx == null) return null;
                if (texturesByMaterial[matIdx]) return texturesByMaterial[matIdx];
                try {
                    const img = await this._extractBaseColorImage(json, bin, matIdx);
                    if (img) texturesByMaterial[matIdx] = img;
                    return img;
                } catch { return null; }
            };
            // Reference primitive first (preserves prior behavior)
            if (prim && prim.material != null) {
                texture = await tryMat(prim.material);
            }
            // Then any other primitive that has one — extract ALL of
            // them now (we used to break on first). For models with
            // multiple textured primitives, this populates the full
            // texturesByMaterial map.
            for (const m of meshes) {
                for (const pr of (m.primitives || [])) {
                    if (pr.material == null) continue;
                    const img = await tryMat(pr.material);
                    if (!texture && img) texture = img;
                }
            }
        }

        // Round 19/115 — skin is already parsed earlier (above the
        // concat block) so the unskinned-primitive path could append
        // synthetic joints. Nothing to do here.

        // Round 19 — animation clips. Each clip is a set of channels
        // (target node + path) sampling output values from samplers.
        let animations = null;
        if (json.animations && json.animations.length > 0) {
            animations = json.animations.map((clip, idx) =>
                this._parseAnimationClip(json, bin, clip, idx)
            );
        }

        // Round 19 — node hierarchy snapshot. Captures the rest pose
        // (default translation/rotation/scale per node) and parent
        // links, used by the runtime to compose joint matrices.
        const nodes = this._snapshotNodes(json);

        // v1391 — morph targets (additive; first primitive that carries them).
        let _morph = null;
        try {
            let mp = (typeof prim !== "undefined" && prim && prim.targets && prim.targets.length) ? prim : null;
            let mMeshIdx = -1;
            if (!mp) {
                const all = [].concat(skinnedPrims || [], unskinnedPrims || []);
                for (const e of all) { if (e && e.prim && e.prim.targets && e.prim.targets.length) { mp = e.prim; mMeshIdx = e.meshIdx; break; } }
            }
            if (mp) {
                if (mMeshIdx < 0) { const all = [].concat(skinnedPrims || [], unskinnedPrims || []); const hit = all.find(e => e && e.prim === mp); mMeshIdx = hit ? hit.meshIdx : 0; }
                _morph = this._readMorphTargets(json, bin, mp, (json.meshes && json.meshes[mMeshIdx]) || null);
                // v4112 -- WHERE those vertices sit in the concatenated array. Zero is the honest default: a
                // single-primitive mesh really does start at 0, and a lookup miss means we could not place the
                // deltas, which a consumer must be able to tell apart from a real 0 -- so morphVertexOffset is
                // reported and morphPlaced says whether it was actually FOUND rather than assumed.
                const _mStart = (this._lastPrimVertexStart && this._lastPrimVertexStart.get(mp));
                if (_morph) {
                    _morph.vertexOffset = (_mStart != null) ? _mStart : 0;
                    _morph.placed = (_mStart != null);
                    console.log(`[GLBParser] morph targets: ${_morph.count} (${_morph.names.slice(0, 6).join(", ")}${_morph.count > 6 ? ", ..." : ""}) on ${_morph.vertexCount} verts @ vertex ${_morph.vertexOffset}${_morph.placed ? "" : " (offset NOT resolved -- single-primitive assumption)"}`);
                }
            }
        } catch (e) {}

        const result = {
            positions, normals, texCoords, indices, texture,
            morphTargets: _morph ? _morph.targets : null,
            morphTargetNames: _morph ? _morph.names : null,
            morphWeights: _morph ? _morph.weights : null,
            morphVertexCount: _morph ? _morph.vertexCount : 0,
            morphVertexOffset: _morph ? (_morph.vertexOffset || 0) : 0,   // v4112
            morphPlaced: _morph ? !!_morph.placed : false,                // v4112
            joints, weights, skin, animations, nodes, colors,
            hybrid: !!(unskinnedPrims && unskinnedPrims.length),   // v1015 — rigid bone-parented parts present (e.g. RobotExpressive)
            // Round 122 — multi-primitive metadata. primitiveRanges is
            // an array of {indexStart, indexCount, materialIdx} for
            // multi-pass rendering. texturesByMaterial maps each
            // material index to its ImageBitmap (subset of materials
            // that have a baseColorTexture). Single-pass renderers can
            // ignore both fields — `texture` still carries the primary
            // ImageBitmap.
            primitiveRanges: this._lastPrimitiveRanges || null,
            texturesByMaterial,
        };

        // v364 — auto post-process for static (non-skinned) meshes.
        // Weld duplicate verts + recompute smooth normals. Default ON.
        // Skinned meshes skip automatically inside postProcessGlbMesh.
        if (opts.postProcess !== false) {
            try {
                const { postProcessGlbMesh } = await import("./glbPostProcess.js");
                const processed = postProcessGlbMesh(result, {
                    epsilon: opts.weldEpsilon ?? 1e-4,
                    recomputeNormals: opts.recomputeNormals !== false,
                });
                return processed;
            } catch (e) {
                console.warn("[GLBParser] post-process failed, returning raw mesh:", e?.message ?? e);
                return result;
            }
        }
        return result;
    }

    // Round 118 — pull baseColorFactor (linear RGB, alpha discarded)
    // from a glTF material index. Defaults to white when material is
    // absent or doesn't define a base color factor.
    static _materialBaseColor(json, materialIdx) {
        if (materialIdx == null || !json.materials) return [1, 1, 1];
        const m = json.materials[materialIdx];
        const f = m?.pbrMetallicRoughness?.baseColorFactor;
        return f ? [f[0], f[1], f[2]] : [1, 1, 1];
    }

    // Round 19 — parse a single skin definition.
    static _parseSkin(json, bin, skinIdx) {
        const s = json.skins[skinIdx];
        if (!s) return null;
        const ibmFlat = s.inverseBindMatrices != null
            ? this._readAccessor(json, bin, s.inverseBindMatrices)
            : null;
        const jointCount = s.joints?.length ?? 0;
        // Pack inverse-bind-matrices as an array of Float32Array(16),
        // one per joint. If absent, default to identity per joint.
        const inverseBindMatrices = new Array(jointCount);
        for (let j = 0; j < jointCount; j++) {
            const mat = new Float32Array(16);
            if (ibmFlat) {
                for (let k = 0; k < 16; k++) mat[k] = ibmFlat[j * 16 + k];
            } else {
                mat[0] = mat[5] = mat[10] = mat[15] = 1;     // identity
            }
            inverseBindMatrices[j] = mat;
        }
        return {
            joints: s.joints?.slice() ?? [],   // node indices in joint order
            inverseBindMatrices,
            skeleton: s.skeleton ?? null,       // root node of the skeleton (optional)
        };
    }

    // Round 19 — parse one animation clip.
    static _parseAnimationClip(json, bin, clip, idx) {
        const samplers = (clip.samplers || []).map(samp => {
            const input  = this._readAccessor(json, bin, samp.input);    // times
            const output = this._readAccessor(json, bin, samp.output);   // values
            // Convert input to plain Float32Array if not already
            const times = input instanceof Float32Array ? input : new Float32Array(input);
            const values = output instanceof Float32Array ? output : new Float32Array(output);
            return {
                times, values,
                interpolation: samp.interpolation || "LINEAR",   // LINEAR | STEP | CUBICSPLINE
            };
        });
        const channels = (clip.channels || []).map(ch => ({
            samplerIdx: ch.sampler,
            targetNode: ch.target?.node,        // node index
            path: ch.target?.path,              // "translation"|"rotation"|"scale"|"weights"
        }));
        // Compute clip duration as max time across samplers
        let duration = 0;
        for (const samp of samplers) {
            const t = samp.times[samp.times.length - 1] ?? 0;
            if (t > duration) duration = t;
        }
        // Round 53 - read animation events from glTF clip.extras.events.
        // Convention: [{ time: 0.4, name: "muzzle_flash", data?: {...} }, ...].
        // glTF doesn't standardize animation events; extras.events is our
        // chosen schema (matches the procedural test rig's clip format).
        // Falls back to empty array if missing or malformed.
        let events = null;
        const rawEv = clip.extras?.events;
        if (Array.isArray(rawEv)) {
            events = [];
            for (const e of rawEv) {
                if (typeof e?.time === "number" && typeof e?.name === "string") {
                    events.push({ time: e.time, name: e.name, data: e.data ?? undefined });
                }
            }
            // Sort by time so the animator can scan linearly
            events.sort((a, b) => a.time - b.time);
        }
        return {
            name: clip.name || `clip_${idx}`,
            duration,
            samplers,
            channels,
            events,
        };
    }

    // Round 19 — snapshot node hierarchy. Each entry: {translation,
    // rotation, scale, parent, children}. Parent is back-derived from
    // children arrays in the JSON.
    static _snapshotNodes(json) {
        const nodes = json.nodes || [];
        const out = nodes.map(n => ({
            // Round 306 — preserve node name for limb-severance heuristics
            // and general debugging. May be undefined for unnamed nodes.
            name: n.name ?? "",
            translation: n.translation ? new Float32Array(n.translation) : new Float32Array([0, 0, 0]),
            rotation:    n.rotation    ? new Float32Array(n.rotation)    : new Float32Array([0, 0, 0, 1]),  // quat (xyzw)
            scale:       n.scale       ? new Float32Array(n.scale)       : new Float32Array([1, 1, 1]),
            parent: -1,
            children: n.children ? n.children.slice() : [],
        }));
        // Back-derive parents
        for (let i = 0; i < out.length; i++) {
            for (const childIdx of out[i].children) {
                if (out[childIdx]) out[childIdx].parent = i;
            }
        }
        return out;
    }

    // Round 115 — small mat4 helpers used by the unskinned-primitive
    // baking path. Column-major 4x4 layout matches the runtime
    // SkeletalAnimator output. Kept inline so GLBParser stays a
    // standalone module with no math-utility dependency.
    static _identityMat4() {
        const m = new Float32Array(16);
        m[0] = m[5] = m[10] = m[15] = 1;
        return m;
    }

    static _mat4Mul(a, b) {
        // out = a * b   (column-major)
        const out = new Float32Array(16);
        for (let col = 0; col < 4; col++) {
            for (let row = 0; row < 4; row++) {
                out[col * 4 + row] =
                    a[0 * 4 + row] * b[col * 4 + 0] +
                    a[1 * 4 + row] * b[col * 4 + 1] +
                    a[2 * 4 + row] * b[col * 4 + 2] +
                    a[3 * 4 + row] * b[col * 4 + 3];
            }
        }
        return out;
    }

    // v771 — inverse-transpose of the upper-left 3x3 of a column-major
    // 4x4 matrix. Used for transforming normals under non-uniform scale.
    //
    // Background: positions transform by the full 4x4 worldMat. Normals
    // transform by (worldMat^-T)[3x3] — the inverse-transpose of the
    // upper-left 3x3. For rigid + uniform scale, the upper-3x3 itself
    // works (after renormalize). For non-uniform scale (Quaternius
    // assets, some glTF samples) the simple upper-3x3 path tilts
    // normals away from their geometric surfaces, producing wrong
    // lighting (dark patches on slanted faces, washed-out highlights).
    //
    // Returns a 9-float array in row-major order [r0c0, r0c1, r0c2,
    // r1c0, ...]. Used by the scene-graph walker's normal transform.
    //
    // Degenerate (det near zero from a zero-scale axis): returns
    // identity 3x3 so normals stay unchanged rather than NaN out.
    static _inverseTranspose3x3(m) {
        // Extract upper-3x3 from column-major 4x4 (skipping m[3], m[7], m[11], m[12..15])
        const a = m[0],  b = m[4],  c = m[8];   // column 0/1/2 row 0
        const d = m[1],  e = m[5],  f = m[9];   // column 0/1/2 row 1
        const g = m[2],  h = m[6],  i = m[10];  // column 0/1/2 row 2

        // Cofactors (used for both determinant and inverse)
        const A =  (e * i - f * h);
        const B = -(d * i - f * g);
        const C =  (d * h - e * g);

        const det = a * A + b * B + c * C;
        if (!isFinite(det) || Math.abs(det) < 1e-9) {
            // Zero-scale axis or NaN — return identity so normals pass through
            return [1, 0, 0,  0, 1, 0,  0, 0, 1];
        }
        const invDet = 1 / det;

        // Inverse 3x3 (transpose of cofactor matrix / det). Storing as
        // [r0c0, r0c1, r0c2, r1c0, r1c1, r1c2, r2c0, r2c1, r2c2] —
        // row-major, indexed as row*3 + col.
        const inv00 =  A * invDet;
        const inv01 = -(b * i - c * h) * invDet;
        const inv02 =  (b * f - c * e) * invDet;
        const inv10 =  B * invDet;
        const inv11 =  (a * i - c * g) * invDet;
        const inv12 = -(a * f - c * d) * invDet;
        const inv20 =  C * invDet;
        const inv21 = -(a * h - b * g) * invDet;
        const inv22 =  (a * e - b * d) * invDet;

        // Transpose: [r,c] becomes [c,r]. Returns row-major.
        return [
            inv00, inv10, inv20,
            inv01, inv11, inv21,
            inv02, inv12, inv22,
        ];
    }

    // Build a glTF node's local TRS matrix. If node.matrix is provided
    // (it overrides T/R/S in glTF spec), use it directly. Quaternion is
    // xyzw, glTF convention.
    static _nodeLocalMatrix(node) {
        if (node.matrix) return new Float32Array(node.matrix);
        const t = node.translation || [0, 0, 0];
        const r = node.rotation    || [0, 0, 0, 1];
        const s = node.scale       || [1, 1, 1];
        const m = new Float32Array(16);
        const x = r[0], y = r[1], z = r[2], w = r[3];
        const xx = x * x, yy = y * y, zz = z * z;
        const xy = x * y, xz = x * z, yz = y * z;
        const wx = w * x, wy = w * y, wz = w * z;
        m[0]  = (1 - 2 * (yy + zz)) * s[0];
        m[1]  = (2 * (xy + wz)) * s[0];
        m[2]  = (2 * (xz - wy)) * s[0];
        m[3]  = 0;
        m[4]  = (2 * (xy - wz)) * s[1];
        m[5]  = (1 - 2 * (xx + zz)) * s[1];
        m[6]  = (2 * (yz + wx)) * s[1];
        m[7]  = 0;
        m[8]  = (2 * (xz + wy)) * s[2];
        m[9]  = (2 * (yz - wx)) * s[2];
        m[10] = (1 - 2 * (xx + yy)) * s[2];
        m[11] = 0;
        m[12] = t[0];
        m[13] = t[1];
        m[14] = t[2];
        m[15] = 1;
        return m;
    }

    // Read a glTF accessor into a typed array. Handles both tightly-packed
    // and interleaved bufferViews via byteStride.
    // v1391 — morph-target (blendshape) reader. Additive: reads a primitive's
    // targets[] (POSITION + optional NORMAL deltas) and the owning mesh's
    // extras.targetNames + default weights. Does NOT touch the position/skin
    // concat above, so it cannot regress skinned-mesh parsing.
    static _readMorphTargets(json, bin, prim, meshDef) {
        if (!prim || !Array.isArray(prim.targets) || prim.targets.length === 0) return null;
        const targets = [];
        for (const tgt of prim.targets) {
            if (!tgt || tgt.POSITION == null) { targets.push(null); continue; }
            let positions = null, normals = null;
            try { positions = this._readAccessor(json, bin, tgt.POSITION); } catch (e) { positions = null; }
            if (tgt.NORMAL != null) { try { normals = this._readAccessor(json, bin, tgt.NORMAL); } catch (e) {} }
            targets.push(positions ? { positions, normals } : null);
        }
        const names = (meshDef && meshDef.extras && Array.isArray(meshDef.extras.targetNames))
            ? meshDef.extras.targetNames.slice()
            : targets.map((_, i) => `morph_${i}`);
        const weights = (meshDef && Array.isArray(meshDef.weights) && meshDef.weights.length)
            ? new Float32Array(meshDef.weights)
            : new Float32Array(targets.length);
        const vCount = (() => { for (const t of targets) if (t && t.positions) return t.positions.length / 3; return 0; })();
        return { targets, names, weights, count: targets.length, vertexCount: vCount };
    }

    /**
     * v4163 -- WHY THIS ERROR NAMES DRACO.
     *
     * A Draco-compressed primitive's accessors carry NO bufferView: the vertex data lives in one compressed
     * blob under `extensions.KHR_draco_mesh_compression`, and the accessors survive only to declare type,
     * count and bounds. So the first thing this parser hit on a Draco file was the line below, and it said
     * "accessor 0 has no bufferView" -- TRUE, USELESS, AND THE LAST THING SOMEBODY SEES BEFORE GIVING UP.
     * The file is not corrupt and the accessor is not wrong; this reader simply does not decode Draco.
     *
     * The message now says which extension is in the way and where the path that DOES handle it lives --
     * three r160's GLTFLoader, vendored here, which implements KHR_draco_mesh_compression in full and needed
     * nothing but a decoder instance. Detecting it costs one property lookup on a failure path.
     */
    static _dracoBlocked(json) {
        const req = json && json.extensionsRequired, used = json && json.extensionsUsed;
        const named = (Array.isArray(req) && req.includes("KHR_draco_mesh_compression")) ||
                      (Array.isArray(used) && used.includes("KHR_draco_mesh_compression"));
        if (named) return true;
        for (const m of (json && json.meshes) || []) for (const pr of m.primitives || []) {
            if (pr.extensions && pr.extensions["KHR_draco_mesh_compression"]) return true;
        }
        return false;
    }

    static _readAccessor(json, bin, accessorIdx) {
        const acc = json.accessors[accessorIdx];
        if (!acc) throw new Error(`accessor ${accessorIdx} missing`);
        if (acc.bufferView == null) {
            if (GLBParser._dracoBlocked(json)) {
                throw new Error(
                    `this GLB is Draco-compressed (KHR_draco_mesh_compression) and gpu/GLBParser.js does not ` +
                    `decode it -- accessor ${accessorIdx} has no bufferView because its vertex data is in the ` +
                    `compressed blob. Load it through three's GLTFLoader instead, which handles the extension ` +
                    `in full: gpu/gltfDraco.js attaches the decoder only for files that need it.`);
            }
            throw new Error(`accessor ${accessorIdx} has no bufferView`);
        }

        const view = json.bufferViews[acc.bufferView];
        if (!view) throw new Error(`bufferView ${acc.bufferView} missing`);

        const Ctor = COMPONENT_CTOR[acc.componentType];
        if (!Ctor) throw new Error(`unsupported componentType ${acc.componentType}`);
        const compBytes = COMPONENT_BYTES[acc.componentType];
        const compCount = TYPE_COMPS[acc.type];
        if (!compCount) throw new Error(`unsupported accessor type "${acc.type}"`);

        const elementBytes = compBytes * compCount;
        const baseOffset   = (view.byteOffset || 0) + (acc.byteOffset || 0);
        const stride       = view.byteStride || elementBytes;
        const count        = acc.count;

        if (stride === elementBytes) {
            // Tightly packed — direct typed-array view onto BIN slice
            return new Ctor(bin.buffer, bin.byteOffset + baseOffset, count * compCount);
        }

        // Interleaved — copy element-by-element
        const out = new Ctor(count * compCount);
        for (let i = 0; i < count; i++) {
            const src = new Ctor(bin.buffer, bin.byteOffset + baseOffset + i * stride, compCount);
            out.set(src, i * compCount);
        }
        return out;
    }

    // Extract base-color texture image as ImageBitmap (decoded, ready
    // to upload to GL). Returns null if material has no base-color
    // texture, or if it references something we can't decode.
    static async _extractBaseColorImage(json, bin, materialIdx) {
        const mat = json.materials[materialIdx];
        const texInfo = mat?.pbrMetallicRoughness?.baseColorTexture;
        if (!texInfo) return null;
        const tex = json.textures?.[texInfo.index];
        if (!tex) return null;
        const imgIdx = tex.source;
        if (imgIdx == null) return null;
        const img = json.images[imgIdx];
        if (!img) return null;

        let blob;
        if (img.bufferView != null) {
            // Embedded image — slice from BIN
            const view = json.bufferViews[img.bufferView];
            const start = (view.byteOffset || 0);
            const slice = bin.slice(start, start + view.byteLength);
            const mime = img.mimeType || GLBParser._sniffMime(slice);
            if (mime !== "image/png" && mime !== "image/jpeg") {
                console.warn(`[GLBParser] image mime "${mime}" not supported; skipping texture`);
                return null;
            }
            blob = new Blob([slice], { type: mime });
        } else if (img.uri) {
            // External image — relative path. Resolve against the gltf's
            // base URL (v729 multi-file mode) so we hit the right host.
            try {
                let imgUrl = img.uri;
                if (json._baseUrl && !imgUrl.startsWith("data:") && !imgUrl.startsWith("http")) {
                    imgUrl = new URL(imgUrl, json._baseUrl).href;
                }
                const res = await fetch(imgUrl);
                if (!res.ok) return null;
                blob = await res.blob();
            } catch {
                return null;
            }
        } else {
            return null;
        }

        try {
            return await createImageBitmap(blob);
        } catch (e) {
            console.warn(`[GLBParser] createImageBitmap failed: ${e.message}`);
            return null;
        }
    }

    // Detect image format from magic bytes.
    static _sniffMime(bytes) {
        if (bytes.length < 4) return "application/octet-stream";
        if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return "image/png";
        if (bytes[0] === 0xFF && bytes[1] === 0xD8) return "image/jpeg";
        return "application/octet-stream";
    }
}
