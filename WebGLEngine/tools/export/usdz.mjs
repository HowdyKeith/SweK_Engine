// FILE: tools/export/usdz.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// USDZ EXPORT, SO AN iPHONE OPENS A SWEK MODEL IN AR QUICK LOOK. Backlog: render/BACKLOG_2026-11-21_PLAYCANVAS.md, `usdz-export` (PlayCanvas
// src/extras/exporters/usdz-exporter.js). Keith, 2026-11-27: "lets do 1 through 6" -- 6 being USDZ export, parked since 2026-11-22.
//
// A .usdz is a ZIP that is NOT compressed and whose every file's data starts on a 64-BYTE BOUNDARY (Pixar's USDZ spec: the files are read in place,
// memory-mapped, so a deflated or misaligned file is refused); the FIRST file is the stage (here USD's text form, .usda) and the rest are what it points at
// (here textures, PNG or JPEG only -- the two image types the spec allows). Written by hand, like tools/export/voxelGlb.mjs, so it runs in node with no
// dependency and the gate can take the archive apart byte by byte.
//
//   meshesToUsda(meshes, opts) -> { usda, files, stats }      the stage's text, the textures it names, and counts
//   packUsdz([{ name, bytes }]) -> Uint8Array                 the archive (stored, 64-byte aligned, CRC-32 checked by any unzip)
//   meshesToUsdz(meshes, opts) -> { bytes, stats }            both
//   glbToUsdz(glbBytes, opts) -> { bytes, stats, skipped }    any GLB the engine writes or loads (tools/export/glbConformance.mjs reads it): every node's
//                                                             TRIANGLES primitives with the node's world transform baked in, base colour factor and texture
//   splatsToMeshes(cloud, opts) -> meshes                     (2026-11-28) a Gaussian splat capture (engine/splatParser.js's cloud) as meshes Quick Look can draw
//   readUsda(text) -> [{ name, points, faceVertexIndices, ... }]   the gate's reader for this file's own output (not a general USD parser)
// SPLATS (2026-11-28, Keith: "lets do 3, 4, 5 and 6" -- 4 USDZ from the other exporters). AR Quick Look draws meshes, not Gaussians, so a capture goes as A COARSE LIKENESS:
//   each kept splat an octahedron along its own three axes (its scale, times `size`, turned by its quaternion), in its base colour (spherical harmonics band 0), the splats
//   kept those at least `minOpacity` opaque, the `budget` with the most opacity x volume (8 triangles each: 25,000 splats is 200,000 triangles). No view-dependent colour,
//   no transparency, no blending: a solid hull of the capture's bigger blobs. `flip` turns the capture 180 degrees about x (y down to y up, as many captures need).
//
// A MESH: { name, positions (VEC3, Float32Array or array), indices? (else consecutive triangles), normals?, uvs? (glTF's: v down), colors? (per vertex,
//   RGB or RGBA, 0..1, linear), color? ([r, g, b] linear, the whole mesh), texture? ({ name, bytes, mime: "image/png" | "image/jpeg" }) }
// THE FILE: Y up, metres (upAxis "Y", metersPerUnit 1: glTF's and the engine's own), counter-clockwise front faces (USD's "rightHanded", glTF's too), one
//   UsdPreviewSurface material per colour. AR QUICK LOOK DOES NOT SHOW VERTEX COLOURS (primvars:displayColor is written for other viewers), so per-vertex
//   colour -- the voxel world's whole palette -- becomes MATERIALS: each triangle takes its three vertices' mean colour in 8 bits, triangles of one colour
//   form a GeomSubset bound to that colour's material (at most `maxMaterials`, 256 by default; past that, colours are merged at coarser steps until they fit).
//   glTF's texture v runs down the image and USD's st up it: st = (u, 1 - v).
// NOT HERE: animation, skins, morph targets, lights, cameras, emissive, metallic-roughness and normal maps (a base colour and a roughness only), KHR extensions
//   (Draco and others: such a primitive is skipped, and listed). Held by tools/ship/usdzExport-selfcheck.mjs.
"use strict";
import { splitGlb, readAccessor } from "./glbConformance.mjs";

const fmt = (v) => { if (!Number.isFinite(v)) return "0"; const r = Math.abs(v) < 1e-12 ? 0 : v; return String(Math.round(r * 1e7) / 1e7); };
const tup = (a, i, n) => `(${Array.from({ length: n }, (_, k) => fmt(a[i + k])).join(", ")})`;
const ident = (s, i) => { const t = String(s || "").replace(/[^A-Za-z0-9_]/g, "_"); return /^[A-Za-z_]/.test(t) && t.length ? t : `mesh${i}`; };

// ---- the colours: per triangle, 8 bits, merged until they fit ----
function triangleColours(m, triCount, idx) {
    const c = m.colors, stride = c ? (c.length / (m.positions.length / 3) >= 3.5 ? 4 : 3) : 0, out = new Array(triCount);
    for (let t = 0; t < triCount; t++) {
        if (!c) { out[t] = m.color || [0.8, 0.8, 0.8]; continue; }
        const s = [0, 0, 0]; for (let k = 0; k < 3; k++) { const v = idx(t * 3 + k); for (let q = 0; q < 3; q++) s[q] += c[v * stride + q] / 3; } out[t] = s;
    }
    return out;
}
function quantize(cols, maxMaterials) {
    for (let step = 1; step <= 128; step *= 2) {
        const key = (c) => c.map((v) => Math.min(255, Math.round(Math.min(1, Math.max(0, v)) * 255 / step) * step)), map = new Map(), of = new Array(cols.length);
        for (let i = 0; i < cols.length; i++) { const k = key(cols[i]).join(","); if (!map.has(k)) map.set(k, map.size); of[i] = map.get(k); }
        if (map.size <= maxMaterials) return { step, palette: [...map.keys()].map((k) => k.split(",").map((v) => Number(v) / 255)), of };
    }
    return { step: 256, palette: [[0.8, 0.8, 0.8]], of: cols.map(() => 0) };
}

/** The stage's text. */
export function meshesToUsda(meshes, { name = "SweK", maxMaterials = 256, roughness = 0.8, doubleSided = false } = {}) {
    const list = (meshes || []).filter((m) => m && m.positions && m.positions.length >= 9);
    if (!list.length) throw new Error("usdz: nothing to write (a mesh needs at least one triangle)");
    const root = ident(name, 0), files = [], mats = [], meshText = [], used = new Set(), stats = { meshes: 0, triangles: 0, vertices: 0, materials: 0, textures: 0, colourStep: 1 };
    const material = (key, body) => { const i = mats.findIndex((x) => x.key === key); if (i >= 0) return mats[i].path; const nm = `m${mats.length}`, p = `/${root}/Materials/${nm}`; mats.push({ key, path: p, text: body(nm, p) }); return p; };
    const surface = (nm, p, diffuse) => `        def Material "${nm}"\n        {\n            token outputs:surface.connect = <${p}/PreviewSurface.outputs:surface>\n            def Shader "PreviewSurface"\n            {\n                uniform token info:id = "UsdPreviewSurface"\n${diffuse}                float inputs:roughness = ${fmt(roughness)}\n                float inputs:metallic = 0\n                token outputs:surface\n            }\n        }\n`;
    list.forEach((m, mi) => {
        let nm = ident(m.name, mi); while (used.has(nm)) nm += "_"; used.add(nm);
        const pos = m.positions, vcount = Math.floor(pos.length / 3), idxArr = m.indices && m.indices.length ? m.indices : null, idx = (k) => (idxArr ? idxArr[k] : k);
        const triCount = Math.floor((idxArr ? idxArr.length : vcount) / 3);
        const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < vcount; i++) for (let k = 0; k < 3; k++) { const v = pos[i * 3 + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
        const L = [];
        L.push(`    def Mesh "${nm}" (\n        prepend apiSchemas = ["MaterialBindingAPI"]\n    )\n    {`);
        L.push(`        uniform bool doubleSided = ${doubleSided ? 1 : 0}`);
        L.push(`        float3[] extent = [${tup(mn, 0, 3)}, ${tup(mx, 0, 3)}]`);
        L.push(`        int[] faceVertexCounts = [${new Array(triCount).fill(3).join(", ")}]`);
        L.push(`        int[] faceVertexIndices = [${Array.from({ length: triCount * 3 }, (_, k) => idx(k)).join(", ")}]`);
        L.push(`        point3f[] points = [${Array.from({ length: vcount }, (_, i) => tup(pos, i * 3, 3)).join(", ")}]`);
        if (m.normals && m.normals.length >= vcount * 3) L.push(`        normal3f[] normals = [${Array.from({ length: vcount }, (_, i) => tup(m.normals, i * 3, 3)).join(", ")}] (\n            interpolation = "vertex"\n        )`);
        if (m.uvs && m.uvs.length >= vcount * 2) L.push(`        texCoord2f[] primvars:st = [${Array.from({ length: vcount }, (_, i) => `(${fmt(m.uvs[i * 2])}, ${fmt(1 - m.uvs[i * 2 + 1])})`).join(", ")}] (\n            interpolation = "vertex"\n        )`);
        L.push(`        uniform token subdivisionScheme = "none"`);
        if (m.texture && m.uvs) {
            const ext = m.texture.mime === "image/jpeg" ? "jpg" : "png", file = `textures/${ident(m.texture.name || "tex", files.length)}_${files.length}.${ext}`, f = m.color || [1, 1, 1];
            files.push({ name: file, bytes: m.texture.bytes }); stats.textures++;
            const p = material(`tex:${file}`, (mn2, mp) => `        def Material "${mn2}"\n        {\n            token outputs:surface.connect = <${mp}/PreviewSurface.outputs:surface>\n            def Shader "PreviewSurface"\n            {\n                uniform token info:id = "UsdPreviewSurface"\n                color3f inputs:diffuseColor.connect = <${mp}/Texture.outputs:rgb>\n                float inputs:roughness = ${fmt(roughness)}\n                float inputs:metallic = 0\n                token outputs:surface\n            }\n            def Shader "Primvar"\n            {\n                uniform token info:id = "UsdPrimvarReader_float2"\n                string inputs:varname = "st"\n                float2 outputs:result\n            }\n            def Shader "Texture"\n            {\n                uniform token info:id = "UsdUVTexture"\n                asset inputs:file = @${file}@\n                float2 inputs:st.connect = <${mp}/Primvar.outputs:result>\n                token inputs:wrapS = "repeat"\n                token inputs:wrapT = "repeat"\n                float4 inputs:scale = (${fmt(f[0])}, ${fmt(f[1])}, ${fmt(f[2])}, 1)\n                float3 outputs:rgb\n            }\n        }\n`);
            L.push(`        rel material:binding = <${p}>`);
        } else {
            const cols = triangleColours(m, triCount, idx), q = quantize(cols, maxMaterials); stats.colourStep = Math.max(stats.colourStep, q.step);
            if (m.colors) { const stride = m.colors.length / vcount >= 3.5 ? 4 : 3; L.push(`        color3f[] primvars:displayColor = [${Array.from({ length: vcount }, (_, i) => tup(m.colors, i * stride, 3)).join(", ")}] (\n            interpolation = "vertex"\n        )`); }
            const paths = q.palette.map((c) => material(`c:${c.map((v) => Math.round(v * 255)).join(",")}`, (mn2, mp) => surface(mn2, mp, `                color3f inputs:diffuseColor = ${tup(c, 0, 3)}\n`)));
            if (paths.length === 1) L.push(`        rel material:binding = <${paths[0]}>`);
            else {
                L.push(`        rel material:binding = <${paths[0]}>`);
                L.push(`        uniform token subsetFamily:materialBind:familyType = "partition"`);
                paths.forEach((p, k) => { const faces = []; for (let t = 0; t < triCount; t++) if (q.of[t] === k) faces.push(t);
                    L.push(`        def GeomSubset "colour${k}" (\n            prepend apiSchemas = ["MaterialBindingAPI"]\n        )\n        {\n            uniform token elementType = "face"\n            uniform token familyName = "materialBind"\n            int[] indices = [${faces.join(", ")}]\n            rel material:binding = <${p}>\n        }`); });
            }
        }
        L.push("    }");
        meshText.push(L.join("\n"));
        stats.meshes++; stats.triangles += triCount; stats.vertices += vcount;
    });
    stats.materials = mats.length;
    const usda = `#usda 1.0\n(\n    customLayerData = {\n        string creator = "SweK Engine, tools/export/usdz.mjs"\n    }\n    defaultPrim = "${root}"\n    metersPerUnit = 1\n    upAxis = "Y"\n)\n\ndef Xform "${root}" (\n    kind = "component"\n)\n{\n    def Scope "Materials"\n    {\n${mats.map((x) => x.text).join("")}    }\n\n${meshText.join("\n\n")}\n}\n`;
    return { usda, files, stats };
}

// ---- the archive ----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
export const ALIGN = 64;
/** A stored (uncompressed) ZIP with every file's data at a multiple of 64 bytes; the first entry is the stage. */
export function packUsdz(entries) {
    if (!entries.length || !/\.usd[ac]?$/.test(entries[0].name)) throw new Error("usdz: the first file must be the stage (.usda, .usdc or .usd)");
    const enc = new TextEncoder(), parts = [], central = []; let off = 0;
    for (const e of entries) {
        const name = enc.encode(e.name), data = e.bytes instanceof Uint8Array ? e.bytes : enc.encode(e.bytes), crc = crc32(data);
        let extra = 0; const base = off + 30 + name.length; if (base % ALIGN) { extra = ALIGN - (base % ALIGN); if (extra < 4) extra += ALIGN; }
        const h = new Uint8Array(30 + name.length + extra), dv = new DataView(h.buffer);
        dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0, true); dv.setUint16(8, 0, true); dv.setUint16(10, 0, true); dv.setUint16(12, 0x21, true);
        dv.setUint32(14, crc, true); dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true); dv.setUint16(26, name.length, true); dv.setUint16(28, extra, true);
        h.set(name, 30); if (extra) { dv.setUint16(30 + name.length, 0x1986, true); dv.setUint16(32 + name.length, extra - 4, true); }   // the padding as an extra field (id 0x1986, as Pixar's own writer marks it)
        central.push({ name, crc, size: data.length, off }); parts.push(h, data); off += h.length + data.length;
    }
    const cdStart = off;
    for (const c of central) {
        const h = new Uint8Array(46 + c.name.length), dv = new DataView(h.buffer);
        dv.setUint32(0, 0x02014b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 20, true); dv.setUint16(8, 0, true); dv.setUint16(10, 0, true); dv.setUint16(12, 0, true); dv.setUint16(14, 0x21, true);
        dv.setUint32(16, c.crc, true); dv.setUint32(20, c.size, true); dv.setUint32(24, c.size, true); dv.setUint16(28, c.name.length, true); dv.setUint32(42, c.off, true); h.set(c.name, 46);
        parts.push(h); off += h.length;
    }
    const end = new Uint8Array(22), dv = new DataView(end.buffer);
    dv.setUint32(0, 0x06054b50, true); dv.setUint16(8, central.length, true); dv.setUint16(10, central.length, true); dv.setUint32(12, off - cdStart, true); dv.setUint32(16, cdStart, true); parts.push(end);
    const out = new Uint8Array(off + 22); let p = 0; for (const x of parts) { out.set(x, p); p += x.length; } return out;
}

export function meshesToUsdz(meshes, opts = {}) {
    const { usda, files, stats } = meshesToUsda(meshes, opts), stage = `${ident(opts.name || "SweK", 0)}.usda`;
    const bytes = packUsdz([{ name: stage, bytes: new TextEncoder().encode(usda) }, ...files]);
    return { bytes, usda, stats: { ...stats, byteLength: bytes.length, files: [stage, ...files.map((f) => f.name)] } };
}

// ---- from a GLB ----
const mat4Mul = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
function nodeMatrix(n) {
    if (n.matrix) return n.matrix.slice();
    const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
    return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0, 2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0, 2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
const NORM_DIV = { 5121: 255, 5123: 65535, 5120: 127, 5122: 32767 };
/** Any GLB to USDZ: every scene node's TRIANGLES primitives, world transform baked into points and normals, base colour factor, texture, vertex colour. */
export function glbToUsdz(glb, opts = {}) {
    const s = splitGlb(glb instanceof Uint8Array ? glb : new Uint8Array(glb));
    if (!s.ok) throw new Error("usdz: not a readable GLB -- " + s.issues.map((i) => i.code).join(", "));
    const g = s.json, bin = s.bin, meshes = [], skipped = [];
    const read = (i) => { const a = g.accessors[i], v = readAccessor(g, bin, i); if (!v) return null; return a.normalized && NORM_DIV[a.componentType] ? v.map((x) => Math.max(-1, x / NORM_DIV[a.componentType])) : v; };
    const image = (texIndex) => { const t = g.textures?.[texIndex], im = t && g.images?.[t.source]; if (!im || im.bufferView == null || !/^image\/(png|jpeg)$/.test(im.mimeType || "")) return null; const bv = g.bufferViews[im.bufferView]; return { name: im.name || `image${t.source}`, mime: im.mimeType, bytes: bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength) }; };
    const walk = (ni, parent) => {
        const n = g.nodes[ni], M = mat4Mul(parent, nodeMatrix(n));
        if (n.camera != null) skipped.push(`${n.name || "node" + ni}: a camera (Quick Look places its own)`);
        if (n.mesh != null) (g.meshes[n.mesh].primitives || []).forEach((pr, pi) => {
            const label = `${g.meshes[n.mesh].name || "mesh" + n.mesh}${pi ? "_" + pi : ""}`;
            if ((pr.mode ?? 4) !== 4) return skipped.push(`${label}: mode ${pr.mode} (not triangles)`);
            if (pr.extensions && Object.keys(pr.extensions).length) return skipped.push(`${label}: ${Object.keys(pr.extensions).join(", ")}`);
            const P = read(pr.attributes.POSITION); if (!P) return skipped.push(`${label}: no readable POSITION`);
            const Nn = pr.attributes.NORMAL != null ? read(pr.attributes.NORMAL) : null, UV = pr.attributes.TEXCOORD_0 != null ? read(pr.attributes.TEXCOORD_0) : null, C = pr.attributes.COLOR_0 != null ? read(pr.attributes.COLOR_0) : null;
            const I = pr.indices != null ? read(pr.indices) : null, pos = new Float32Array(P.length), nor = Nn ? new Float32Array(Nn.length) : null;
            for (let i = 0; i < P.length; i += 3) for (let r = 0; r < 3; r++) pos[i + r] = M[r] * P[i] + M[4 + r] * P[i + 1] + M[8 + r] * P[i + 2] + M[12 + r];
            const det = M[0] * (M[5] * M[10] - M[6] * M[9]) - M[4] * (M[1] * M[10] - M[2] * M[9]) + M[8] * (M[1] * M[6] - M[2] * M[5]);
            if (nor) { // the inverse transpose of the upper 3 x 3, by cofactors -- which are det times it: a mirror (det < 0) would turn every normal inward, so its sign is taken out
                const a = M, sg = det < 0 ? -1 : 1, cof = [a[5] * a[10] - a[6] * a[9], a[6] * a[8] - a[4] * a[10], a[4] * a[9] - a[5] * a[8], a[2] * a[9] - a[1] * a[10], a[0] * a[10] - a[2] * a[8], a[1] * a[8] - a[0] * a[9], a[1] * a[6] - a[2] * a[5], a[2] * a[4] - a[0] * a[6], a[0] * a[5] - a[1] * a[4]];
                for (let i = 0; i < Nn.length; i += 3) { const v = [0, 1, 2].map((r) => sg * (cof[r] * Nn[i] + cof[3 + r] * Nn[i + 1] + cof[6 + r] * Nn[i + 2])), l = Math.hypot(...v) || 1; for (let r = 0; r < 3; r++) nor[i + r] = v[r] / l; }
            }
            let idx = I ? I.slice() : null; if (det < 0) { if (!idx) idx = Array.from({ length: P.length / 3 }, (_, k) => k); for (let t = 0; t + 2 < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]]; }   // a mirroring transform turns the faces inside out: wind them back
            const mt = pr.material != null ? g.materials?.[pr.material] : null, pbr = mt?.pbrMetallicRoughness || {}, f = pbr.baseColorFactor || [1, 1, 1, 1];
            const tex = pbr.baseColorTexture ? image(pbr.baseColorTexture.index) : null; if (pbr.baseColorTexture && !tex) skipped.push(`${label}: its base colour texture (not an embedded PNG or JPEG) -- the factor alone`);
            const cs = C ? C.length / (P.length / 3) : 0, colors = C ? Float32Array.from(C, (v, k) => (k % cs < 3 ? v * f[k % cs] : v)) : null;   // glTF: the base colour is the factor times the vertex colour
            meshes.push({ name: label, positions: pos, normals: nor, indices: idx, uvs: tex ? UV : null, colors, color: f.slice(0, 3), texture: tex && UV ? tex : null });
        });
        for (const c of n.children || []) walk(c, M);
    };
    const scene = g.scenes?.[g.scene ?? 0], roots = scene ? scene.nodes : (g.nodes || []).map((_, i) => i);
    for (const r of roots || []) walk(r, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    if (!meshes.length) throw new Error("usdz: the GLB has no triangles this exporter can write" + (skipped.length ? " (skipped: " + skipped.join("; ") + ")" : ""));
    const r = meshesToUsdz(meshes, opts);
    return { ...r, skipped };
}

// ---- splats ----
const OCT_FACES = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]];   // +x -x +y -y +z -z; counter-clockwise from outside
/** A splat cloud as meshes of octahedra (see the header); { budget, minOpacity, size, flip, perMesh } */
export function splatsToMeshes(cloud, { budget = 25000, minOpacity = 0.3, size = 1.2, flip = false, perMesh = 20000 } = {}) {
    const n = cloud.count, sig = (x) => 1 / (1 + Math.exp(-x)), keep = [];
    for (let i = 0; i < n; i++) { const a = sig(cloud.opacities[i]); if (a >= minOpacity) keep.push([i, a * Math.exp(cloud.scales[i * 3] + cloud.scales[i * 3 + 1] + cloud.scales[i * 3 + 2])]); }
    keep.sort((p, q) => q[1] - p[1] || p[0] - q[0]);
    const chosen = keep.slice(0, budget).map((k) => k[0]).sort((p, q) => p - q), meshes = [];
    for (let m0 = 0; m0 < chosen.length; m0 += perMesh) {
        const part = chosen.slice(m0, m0 + perMesh), P = new Float32Array(part.length * 18), N = new Float32Array(part.length * 18), C = new Float32Array(part.length * 18), I = new Uint32Array(part.length * 24);
        part.forEach((i, j) => {
            let [w, x, y, z] = cloud.quats.slice(i * 4, i * 4 + 4); const ql = Math.hypot(w, x, y, z) || 1; w /= ql; x /= ql; y /= ql; z /= ql;
            const R = [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y), 2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x), 2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)];   // columns: the splat's axes
            const c = cloud.positions.slice(i * 3, i * 3 + 3), F = flip ? [1, -1, -1] : [1, 1, 1];
            for (let a = 0; a < 3; a++) {
                const r = Math.exp(cloud.scales[i * 3 + a]) * size, ax = [R[a * 3], R[a * 3 + 1], R[a * 3 + 2]];
                for (const sgn of [1, -1]) { const v = j * 6 + a * 2 + (sgn > 0 ? 0 : 1); for (let k = 0; k < 3; k++) { P[v * 3 + k] = (c[k] + sgn * r * ax[k]) * F[k]; N[v * 3 + k] = sgn * ax[k] * F[k]; C[v * 3 + k] = cloud.colors[i * 3 + k]; } }
            }
            OCT_FACES.forEach((f, t) => { for (let k = 0; k < 3; k++) I[j * 24 + t * 3 + k] = j * 6 + f[k]; });
            // the axes from a quaternion are right-handed, so these faces wind outward; a flip (two axes negated) keeps that
        });
        meshes.push({ name: `splats${meshes.length}`, positions: P, normals: N, colors: C, indices: I });
    }
    return Object.assign(meshes, { kept: chosen.length, eligible: keep.length, total: n });
}

// ---- the gate's reader: this file's own output, back into numbers ----
const nums = (s) => (s.match(/-?[\d.]+(?:e[-+]?\d+)?/gi) || []).map(Number);
export function readUsda(text) {
    const out = [], re = /def Mesh "([^"]+)"[\s\S]*?\n    }\n/g; let m;
    while ((m = re.exec(text))) {
        const b = m[0], arr = (key) => { const r = new RegExp(`${key} = \\[([^\\]]*)\\]`).exec(b); return r ? nums(r[1]) : null; };
        const subsets = [...b.matchAll(/def GeomSubset "([^"]+)"[\s\S]*?int\[\] indices = \[([^\]]*)\][\s\S]*?rel material:binding = <([^>]+)>/g)].map((x) => ({ name: x[1], faces: nums(x[2]), material: x[3] }));
        out.push({ name: m[1], faceVertexCounts: arr("int\\[\\] faceVertexCounts"), faceVertexIndices: arr("int\\[\\] faceVertexIndices"), points: arr("point3f\\[\\] points"), normals: arr("normal3f\\[\\] normals"), st: arr("texCoord2f\\[\\] primvars:st"), extent: arr("float3\\[\\] extent"), binding: (/\n        rel material:binding = <([^>]+)>/.exec(b) || [])[1] || null, subsets });
    }
    return out;
}

// ---- the command line: node tools/export/usdz.mjs <in.glb> <out.usdz>   or   node tools/export/usdz.mjs --demo <out.usdz> (a small voxel world, as the gate builds) ----
if (typeof process !== "undefined" && process.argv[1] && /usdz\.mjs$/.test(process.argv[1])) {
    const [a, b] = process.argv.slice(2), fs = await import("node:fs");
    try {
        let r;
        if (a === "--demo" && b) {
            const { worldMeshes } = await import("../../world/worldGlbExport.js"), S = 16, H = 8;
            const chunk = (extra) => { const v = new Uint8Array(S * H * S); for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) v[x + S * (z + S * 0)] = 3; if (extra) for (let y = 1; y < 4; y++) v[5 + S * (5 + S * y)] = 1; return { voxels: v }; };
            r = meshesToUsdz(worldMeshes({ chunkSize: S, chunks: new Map([["0,0", chunk(true)], ["1,0", chunk(false)]]) }), { name: "SweK_demo" });
        } else if (a && b && /\.(ply|splat)$/i.test(a)) {
            const { parseSplatFile } = await import("../../engine/splatParser.js"), rest = process.argv.slice(4), opt = (k, d) => { const i = rest.indexOf("--" + k); return i >= 0 ? Number(rest[i + 1]) : d; };
            const buf = fs.readFileSync(a), cloud = parseSplatFile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), a);
            const meshes = splatsToMeshes(cloud, { budget: opt("budget", 25000), minOpacity: opt("min-opacity", 0.3), size: opt("size", 1.2), flip: rest.includes("--flip") });
            r = meshesToUsdz(meshes, { name: "SweK_splats" }); console.log(`${meshes.kept} of ${meshes.total} splats kept (${meshes.eligible} opaque enough), as octahedra`);
        } else if (a && b) r = glbToUsdz(fs.readFileSync(a), { name: "SweK" });
        else { console.error("usage: node tools/export/usdz.mjs <in.glb> <out.usdz>   |   <in.ply|in.splat> <out.usdz> [--budget 25000] [--min-opacity 0.3] [--size 1.2] [--flip]   |   --demo <out.usdz>"); process.exit(2); }
        fs.writeFileSync(b, r.bytes);
        console.log(`wrote ${b}: ${r.stats.meshes} meshes, ${r.stats.triangles} triangles, ${r.stats.materials} materials, ${r.stats.textures} textures, ${r.bytes.length} bytes${r.skipped && r.skipped.length ? "; skipped: " + r.skipped.join("; ") : ""}`);
    } catch (e) { console.error(e.message); process.exit(1); }
}
