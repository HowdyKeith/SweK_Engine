// WebGLEngine/physics/mesh/glb.mjs -- v2874
//
// A MINIMAL GLB READER AND WRITER, so a real model can be put in the wind tunnel.
//
// WHY WRITE ONE. The engine already has three.js, which parses GLB perfectly well -- in a BROWSER. The wind
// tunnel's solver is headless Node: gates, rig jobs and the LBM itself never touch a DOM. Pulling three.js and a
// GLTFLoader into a Node measurement path to read a vertex array would be a large dependency for a small job,
// and the job really is small: positions and indices out of a binary container. Everything else in a glTF file --
// materials, animations, skins, textures -- is irrelevant to a flow solver, which only ever asks "is this cell
// inside the body".
//
// THE WRITER EXISTS FOR THE ANSWER KEY, NOT FOR EXPORT. There is no .glb anywhere in this tree (the models live
// in an external assets directory, by design since v978), so a reader graded only against real files could not
// be graded here at all. Instead the writer emits a mesh of a KNOWN ANALYTIC SHAPE -- a sphere of radius R --
// and the pipeline is graded against (4/3)piR^3. The model is the test, and the test has an exact answer.
//
// SCOPE, stated rather than discovered later: little-endian, glTF 2.0, a single BIN chunk, POSITION as
// float32 vec3, indices as uint16 or uint32, no sparse accessors, no node transforms applied. That covers what a
// solver needs and refuses everything else LOUDLY rather than silently reading zeros.
"use strict";

const MAGIC = 0x46546c67;      // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942;  // "BIN\0"

const COMP = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };   // componentType -> bytes
const NUMC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/**
 * Parse a GLB into { positions: Float64Array (x,y,z triples), indices: Uint32Array, counts }.
 * Throws with a specific reason rather than returning something empty -- a mesh that silently reads as zero
 * triangles would voxelize to an empty tunnel and look like "the model has no drag".
 */
export function parseGLB(buffer) {
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (u8.byteLength < 20) throw new Error("not a GLB: shorter than a header");
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (dv.getUint32(0, true) !== MAGIC) throw new Error("not a GLB: bad magic (a .gltf JSON file is not a .glb)");
    const version = dv.getUint32(4, true);
    if (version !== 2) throw new Error("unsupported glTF version " + version + " (this reads 2.0)");

    let off = 12, json = null, bin = null;
    while (off + 8 <= u8.byteLength) {
        const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
        const start = off + 8;
        if (start + len > u8.byteLength) throw new Error("truncated GLB chunk");
        if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(u8.subarray(start, start + len)));
        else if (type === CHUNK_BIN) bin = u8.subarray(start, start + len);
        off = start + len + ((4 - (len % 4)) % 4);
    }
    if (!json) throw new Error("GLB has no JSON chunk");
    if (!bin) throw new Error("GLB has no BIN chunk (external .bin buffers are not supported)");

    const readAccessor = (ai) => {
        const acc = json.accessors[ai];
        if (!acc) throw new Error("missing accessor " + ai);
        if (acc.sparse) throw new Error("sparse accessors are not supported");
        const bv = json.bufferViews[acc.bufferView];
        if (!bv) throw new Error("accessor " + ai + " has no bufferView");
        const comps = NUMC[acc.type];
        const bytes = COMP[acc.componentType];
        if (!comps || !bytes) throw new Error("unsupported accessor type " + acc.type + "/" + acc.componentType);
        const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
        const stride = bv.byteStride || comps * bytes;
        const out = new Float64Array(acc.count * comps);
        const d = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
        for (let i = 0; i < acc.count; i++) {
            for (let c = 0; c < comps; c++) {
                const at = base + i * stride + c * bytes;
                out[i * comps + c] = acc.componentType === 5126 ? d.getFloat32(at, true)
                    : acc.componentType === 5125 ? d.getUint32(at, true)
                    : acc.componentType === 5123 ? d.getUint16(at, true)
                    : acc.componentType === 5121 ? d.getUint8(at)
                    : acc.componentType === 5122 ? d.getInt16(at, true)
                    : d.getInt8(at);
            }
        }
        return out;
    };

    // Every primitive in every mesh, concatenated. A flow solver does not care which submesh a triangle came
    // from -- it cares about the union of solid.
    const pos = [], idx = [];
    let vertBase = 0, prims = 0;
    for (const mesh of json.meshes || []) {
        for (const p of mesh.primitives || []) {
            if (p.mode !== undefined && p.mode !== 4) continue;          // 4 = TRIANGLES; ignore lines/points
            if (!p.attributes || p.attributes.POSITION === undefined) continue;
            const P = readAccessor(p.attributes.POSITION);
            for (let i = 0; i < P.length; i++) pos.push(P[i]);
            const nVerts = P.length / 3;
            if (p.indices !== undefined) {
                const I = readAccessor(p.indices);
                for (let i = 0; i < I.length; i++) idx.push(vertBase + I[i]);
            } else {
                for (let i = 0; i < nVerts; i++) idx.push(vertBase + i);  // unindexed: triangles in order
            }
            vertBase += nVerts;
            prims++;
        }
    }
    if (!prims) throw new Error("GLB contains no triangle primitives with POSITION");
    if (idx.length % 3) throw new Error("index count " + idx.length + " is not a multiple of 3");
    return { positions: Float64Array.from(pos), indices: Uint32Array.from(idx), primitives: prims,
             vertices: pos.length / 3, triangles: idx.length / 3 };
}

/** Axis-aligned bounds of a parsed mesh. */
export function bounds(mesh) {
    const p = mesh.positions;
    if (!p.length) return null;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) {
        for (let c = 0; c < 3; c++) { if (p[i + c] < lo[c]) lo[c] = p[i + c]; if (p[i + c] > hi[c]) hi[c] = p[i + c]; }
    }
    return { lo, hi, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] };
}

// ---- writer: models with KNOWN analytic answers ----------------------------------------------------------------
/**
 * UV sphere of radius r. Its volume is exactly (4/3)pi r^3, which is what grades the voxelizer.
 *
 * PROPERLY CLOSED, and the first version was not. Generating seg+1 columns duplicates the seam vertices and
 * fans both poles from a whole ring, which leaves 160 boundary edges on a 24x16 sphere -- an OPEN surface. That
 * matters here more than it would in a renderer: ray-parity voxelisation of an open surface fills half the
 * domain with confident nonsense. isClosed() caught it, which is the only reason this comment exists.
 * So: one vertex per pole, and the seam column is welded by taking j modulo seg.
 */
export function sphereMesh(r = 1, seg = 24, rings = 16) {
    const pos = [0, r, 0];                                  // 0 = north pole
    for (let i = 1; i < rings; i++) {                       // interior rings only
        const phi = (i / rings) * Math.PI;
        for (let j = 0; j < seg; j++) {                     // NOT seg+1: the seam is welded, not duplicated
            const th = (j / seg) * 2 * Math.PI;
            pos.push(r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
        }
    }
    pos.push(0, -r, 0);                                     // last = south pole
    const south = pos.length / 3 - 1;
    const ring = (i, j) => 1 + (i - 1) * seg + (j % seg);    // i in 1..rings-1
    const idx = [];
    for (let j = 0; j < seg; j++) idx.push(0, ring(1, j + 1), ring(1, j));                       // north fan
    for (let i = 1; i < rings - 1; i++) {
        for (let j = 0; j < seg; j++) {
            const a = ring(i, j), b = ring(i, j + 1), c = ring(i + 1, j), d = ring(i + 1, j + 1);
            idx.push(a, b, c, b, d, c);
        }
    }
    for (let j = 0; j < seg; j++) idx.push(south, ring(rings - 1, j), ring(rings - 1, j + 1));   // south fan
    return { positions: Float64Array.from(pos), indices: Uint32Array.from(idx) };
}

/** Axis-aligned box, volume exactly w*h*d -- a second shape so a sphere-tuned voxelizer cannot pass alone. */
export function boxMesh(w = 1, h = 1, d = 1) {
    const x = w / 2, y = h / 2, z = d / 2;
    const pos = [-x,-y,-z, x,-y,-z, x,y,-z, -x,y,-z, -x,-y,z, x,-y,z, x,y,z, -x,y,z];
    const idx = [0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7];
    return { positions: Float64Array.from(pos), indices: Uint32Array.from(idx) };
}

/** Serialise a {positions, indices} mesh to a GLB buffer. */
export function writeGLB(mesh) {
    const pos = Float32Array.from(mesh.positions);
    const idx = Uint32Array.from(mesh.indices);
    const posBytes = pos.byteLength, idxBytes = idx.byteLength;
    const padTo4 = (n) => (4 - (n % 4)) % 4;
    const binLen = posBytes + padTo4(posBytes) + idxBytes + padTo4(idxBytes);
    const bin = new Uint8Array(binLen);
    bin.set(new Uint8Array(pos.buffer), 0);
    bin.set(new Uint8Array(idx.buffer), posBytes + padTo4(posBytes));

    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) for (let c = 0; c < 3; c++) { if (pos[i+c] < lo[c]) lo[c] = pos[i+c]; if (pos[i+c] > hi[c]) hi[c] = pos[i+c]; }

    const json = {
        asset: { version: "2.0", generator: "SweK glb.mjs" },
        scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }],
        buffers: [{ byteLength: binLen }],
        bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962 },
            { buffer: 0, byteOffset: posBytes + padTo4(posBytes), byteLength: idxBytes, target: 34963 },
        ],
        accessors: [
            { bufferView: 0, componentType: 5126, count: pos.length / 3, type: "VEC3", min: lo, max: hi },
            { bufferView: 1, componentType: 5125, count: idx.length, type: "SCALAR" },
        ],
    };
    const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
    const jsonPad = padTo4(jsonBytes.length);
    const jsonLen = jsonBytes.length + jsonPad;
    const total = 12 + 8 + jsonLen + 8 + binLen;
    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, MAGIC, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
    dv.setUint32(12, jsonLen, true); dv.setUint32(16, CHUNK_JSON, true);
    out.set(jsonBytes, 20);
    for (let i = 0; i < jsonPad; i++) out[20 + jsonBytes.length + i] = 0x20;   // JSON pads with SPACES
    const binHdr = 20 + jsonLen;
    dv.setUint32(binHdr, binLen, true); dv.setUint32(binHdr + 4, CHUNK_BIN, true);
    out.set(bin, binHdr + 8);
    return out;
}
