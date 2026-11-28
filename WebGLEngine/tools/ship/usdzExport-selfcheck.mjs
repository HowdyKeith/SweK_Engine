// WebGLEngine/tools/ship/usdzExport-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/usdzExport-selfcheck.mjs      (a second or two; no browser)
//
// USDZ EXPORT, HELD (tools/export/usdz.mjs; Keith, 2026-11-27: "lets do 1 through 6", 6 being USDZ export). An iPhone opens a .usdz in AR Quick Look only
// if the archive is laid out as the USDZ spec says and the stage is one it can read; neither can be seen in this sandbox, so each is taken apart here:
//
//   1  THE ARCHIVE      every file STORED (not deflated), its data at a multiple of 64 bytes, its CRC-32 right, the stage first; the local headers and the central
//                       directory agree; and Python's own zipfile (a second, independent reader) opens it, tests every CRC and lists the same files, all stored
//   2  THE STAGE        Y up, metres, a default prim; every face a triangle; the points and indices read back are the mesh's, the extent its bounds
//   3  THE COLOURS      per-vertex colour to materials: the subsets PARTITION the faces (each exactly once), each face's material is its colour in 8 bits; 1000 colours
//                       are merged to at most 256 materials, each face within the merge step of its colour
//   4  FROM A GLB       the world's own GLB (writeGlb) comes back as the same triangles; a hand-built GLB with node transforms (a turn, a scale, a MIRROR), indices,
//                       normals, a texture and a line primitive: points and normals transformed, the mirror's faces wound back, st = (u, 1 - v), the PNG in the archive
//                       byte for byte and named by the material, the lines skipped and said so
//   5  THE WORLD        a hand-built voxel world through world/worldGlbExport.js worldMeshes, as swekExport.usdz() does (main.js)
//   6  THE SCENE        (2026-11-28) the scene export's GLB (props placed twice, a camera) as swekExport.scene({ usdz: true }) converts it: each placement where it is put,
//                       the camera left out and said so
//   7  SPLATS           (2026-11-28) a .splat capture through splatsToMeshes: the opacity floor, the budget by opacity x volume, each splat an octahedron along its own axes,
//                       every face outward, turned or flipped
//
// What is NOT held here: that Quick Look shows it. Pixar's checker (usdchecker --arkit) is not in this sandbox; docs/RIG_RUNS_2026-11-27.md has the rig's command.
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as U from "../export/usdz.mjs";
import { writeGlb, packGlb } from "../export/voxelGlb.mjs";
import { worldMeshes, exportSceneGlb } from "../../world/worldGlbExport.js";
import { parseSplatFile } from "../../engine/splatParser.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = (fn) => { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
console.log("usdzExport-selfcheck -- SweK models as .usdz for AR Quick Look\n");

/** The archive taken apart: [{ name, method, dataOffset, size, crc, data }] from the local headers, checked against the central directory. */
function unzip(b) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), dec = new TextDecoder(), local = [];
    let off = 0;
    while (dv.getUint32(off, true) === 0x04034b50) {
        const method = dv.getUint16(off + 8, true), crc = dv.getUint32(off + 14, true), csize = dv.getUint32(off + 18, true), size = dv.getUint32(off + 22, true), nl = dv.getUint16(off + 26, true), xl = dv.getUint16(off + 28, true);
        const name = dec.decode(b.subarray(off + 30, off + 30 + nl)), dataOffset = off + 30 + nl + xl;
        local.push({ name, method, dataOffset, size, csize, crc, data: b.subarray(dataOffset, dataOffset + csize), localAt: off }); off = dataOffset + csize;
    }
    let e = b.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    const n = dv.getUint16(e + 10, true), cd = dv.getUint32(e + 16, true), central = [];
    for (let i = 0, p = cd; i < n; i++) { const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true); central.push({ name: dec.decode(b.subarray(p + 46, p + 46 + nl)), crc: dv.getUint32(p + 16, true), size: dv.getUint32(p + 24, true), localAt: dv.getUint32(p + 42, true) }); p += 46 + nl + xl + cl; }
    return { local, central };
}
const close = (a, b, eps = 1e-6) => a && b && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= eps);

// a small two-colour mesh, indexed, with normals
const quad = { name: "quad", positions: [0, 0, 0, 2, 0, 0, 0, 3, 0, 2, 3, 0.5], indices: [0, 1, 2, 1, 3, 2], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], colors: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0.5, 1] };

console.log("1. THE ARCHIVE");
section(() => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array.from({ length: 37 }, (_, i) => i * 7 & 255)]);
    const r = U.meshesToUsdz([quad, { name: "textured", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], uvs: [0, 0, 1, 0, 0, 1], texture: { name: "t", mime: "image/png", bytes: png } }], { name: "Probe" });
    const z = unzip(r.bytes), aligned = z.local.every((f) => f.dataOffset % 64 === 0), stored = z.local.every((f) => f.method === 0 && f.csize === f.size), crcs = z.local.every((f) => U.crc32(f.data) === f.crc);
    const agree = z.central.length === z.local.length && z.central.every((c, i) => c.name === z.local[i].name && c.crc === z.local[i].crc && c.size === z.local[i].size && c.localAt === z.local[i].localAt);
    ok("!! EVERY FILE STORED, ITS DATA ON A 64-BYTE BOUNDARY, ITS CRC-32 RIGHT, THE STAGE FIRST; the central directory agrees with the local headers", aligned && stored && crcs && agree && z.local[0].name === "Probe.usda" && z.local.length === 2 && /^textures\/.*\.png$/.test(z.local[1].name), z.local.map((f) => `${f.name}@${f.dataOffset}`).join(", "));
    const tmp = path.join(os.tmpdir(), `usdz-selfcheck-${process.pid}.usdz`); fs.writeFileSync(tmp, r.bytes);
    // 2026-11-27 (the publish merge) -- the second reader is whichever of python3 and python this machine has: Windows often has only `python`, and a red
    // for a missing interpreter says nothing about the archive. With neither, the row is a NAMED SKIP below, and the structural checks above have run.
    // SABOTAGED, restored byte for byte: U1 the second reader handed a path that is not the archive -> 1 red.
    const runPy = (exe) => spawnSync(exe, ["-I", "-c", "import sys, zipfile, json; z = zipfile.ZipFile(sys.argv[1]); print(json.dumps({'bad': z.testzip(), 'names': z.namelist(), 'stored': all(i.compress_type == 0 for i in z.infolist()), 'offsets': [i.header_offset for i in z.infolist()]}))", tmp], { encoding: "utf8" });
    const exeFound = ["python3", "python"].find((e) => { const v = spawnSync(e, ["-c", "import sys; print(sys.version_info[0])"], { encoding: "utf8" }); return v.status === 0 && v.stdout.trim() === "3"; }), py = exeFound ? runPy(exeFound) : null;
    fs.unlinkSync(tmp);
    const pr = py && py.status === 0 ? JSON.parse(py.stdout) : null;
    if (!exeFound) console.log("  SKIP  PYTHON'S zipfile, the second reader, did not run: neither python3 nor python (3.x) is on this machine's PATH -- the archive's structure was checked above; this row was NOT");
    else ok("!! PYTHON'S zipfile, A SECOND READER, OPENS IT: every CRC tested good, the same files in the same order, all stored", pr && pr.bad === null && pr.stored && JSON.stringify(pr.names) === JSON.stringify(z.local.map((f) => f.name)), pr ? JSON.stringify(pr) : (py.stderr || "python3 did not run").slice(0, 200));
    let refused = false; try { U.packUsdz([{ name: "a.png", bytes: png }]); } catch { refused = true; }
    ok("!! an archive whose first file is not a stage is refused", refused);
});

console.log("2. THE STAGE");
section(() => {
    const r = U.meshesToUsdz([quad], { name: "Probe" }), m = U.readUsda(r.usda)[0];
    ok("!! Y UP, METRES, A DEFAULT PRIM THAT EXISTS", /upAxis = "Y"/.test(r.usda) && /metersPerUnit = 1\n/.test(r.usda) && /defaultPrim = "Probe"/.test(r.usda) && /\ndef Xform "Probe"/.test(r.usda) && r.usda.startsWith("#usda 1.0"));
    ok("!! THE MESH READS BACK AS ITSELF: every face a triangle, the points, the indices and the normals the mesh's, the extent its bounds", m.faceVertexCounts.every((c) => c === 3) && m.faceVertexCounts.length === 2 && close(m.points, quad.positions) && close(m.faceVertexIndices, quad.indices, 0) && close(m.normals, quad.normals) && close(m.extent, [0, 0, 0, 2, 3, 0.5]), JSON.stringify({ i: m.faceVertexIndices, e: m.extent }));
});

console.log("3. THE COLOURS");
section(() => {
    const r = U.meshesToUsdz([quad], { name: "Probe" }), m = U.readUsda(r.usda)[0];
    const diffuse = (p) => { const nm = p.split("/").pop(), b = new RegExp(`def Material "${nm}"[\\s\\S]*?diffuseColor = \\(([^)]*)\\)`).exec(r.usda); return b ? b[1].split(",").map(Number) : null; };
    const faces = m.subsets.flatMap((s) => s.faces).sort((a, b) => a - b);
    const tri1 = [1, 3, 2].map((v) => quad.colors.slice(v * 3, v * 3 + 3)).reduce((s, c) => s.map((x, i) => x + c[i] / 3), [0, 0, 0]).map((v) => Math.round(v * 255) / 255);
    ok("!! THE SUBSETS PARTITION THE FACES, AND EACH FACE'S MATERIAL IS ITS THREE VERTICES' MEAN COLOUR IN 8 BITS", JSON.stringify(faces) === "[0,1]" && /familyType = "partition"/.test(r.usda) && close(diffuse(m.subsets.find((s) => s.faces.includes(0)).material), [1, 0, 0], 1e-6) && close(diffuse(m.subsets.find((s) => s.faces.includes(1)).material), tri1, 1e-6), `${JSON.stringify(m.subsets.map((s) => [s.faces, diffuse(s.material)]))}; want ${tri1}`);
    // 1000 distinct colours, one a triangle
    const n = 1000, P = [], C = []; for (let t = 0; t < n; t++) { P.push(t, 0, 0, t + 1, 0, 0, t, 1, 0); const c = [(t % 10) / 9, (Math.floor(t / 10) % 10) / 9, Math.floor(t / 100) / 9]; C.push(...c, ...c, ...c); }
    const big = U.meshesToUsdz([{ name: "many", positions: P, colors: C }]), bm = U.readUsda(big.usda)[0], step = big.stats.colourStep;
    let worst = 0; for (const s of bm.subsets) { const nm = s.material.split("/").pop(), d = new RegExp(`def Material "${nm}"[\\s\\S]*?diffuseColor = \\(([^)]*)\\)`).exec(big.usda)[1].split(",").map(Number); for (const f of s.faces) for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(d[k] - C[f * 9 + k])); }
    const covered = bm.subsets.reduce((s, x) => s + x.faces.length, 0);
    ok("!! 1000 COLOURS ARE MERGED TO AT MOST 256 MATERIALS, every face still covered once and within the merge step of its own colour", big.stats.materials <= 256 && big.stats.materials > 64 && step > 1 && covered === n && worst <= step / 255 / 2 + 1e-6 + (step > 1 ? step / 255 / 2 : 0), `${big.stats.materials} materials at a step of ${step}; worst ${worst.toFixed(4)}`);
});

console.log("4. FROM A GLB");
section(() => {
    // the world's own writer: non-indexed triangles with vertex colours
    const src = [{ name: "floor", positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1]), colors: new Float32Array([0.2, 0.6, 0.2, 0.2, 0.6, 0.2, 0.2, 0.6, 0.2, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]) }];
    const g1 = U.glbToUsdz(writeGlb(src)), m1 = U.readUsda(g1.usda)[0];
    const tris = (m) => Array.from({ length: m.faceVertexIndices.length / 3 }, (_, t) => [0, 1, 2].flatMap((k) => m.points.slice(m.faceVertexIndices[t * 3 + k] * 3, m.faceVertexIndices[t * 3 + k] * 3 + 3)));
    ok("!! THE ENGINE'S OWN GLB (writeGlb) COMES BACK AS THE SAME TRIANGLES IN THE SAME ORDER, two colours as two materials", close(tris(m1).flat(), Array.from(src[0].positions), 1e-6) && g1.stats.materials === 2 && g1.skipped.length === 0, `${g1.stats.triangles} triangles, ${g1.stats.materials} materials`);
    // a hand-built GLB: a triangle used by two nodes (turned 90 degrees about y and doubled; mirrored in x), indexed, normals, uvs, an embedded PNG, a line primitive
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
    const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), nor = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), uv = new Float32Array([0, 0, 1, 0, 0, 0.25]), idx = new Uint16Array([0, 1, 2, 0]);
    const parts = [pos, nor, uv, idx, png], views = []; let off = 0; const chunks = [];
    for (const a of parts) { off = (off + 3) & ~3; const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); chunks.push({ bytes, byteOffset: off }); views.push({ buffer: 0, byteOffset: off, byteLength: a.byteLength }); off += a.byteLength; }
    const s2 = Math.SQRT1_2, gltf = { asset: { version: "2.0" }, buffers: [{ byteLength: (off + 3) & ~3 }], bufferViews: views,
        accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }, { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" }, { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" }, { bufferView: 3, componentType: 5123, count: 3, type: "SCALAR" }, { bufferView: 3, componentType: 5123, count: 2, type: "SCALAR", byteOffset: 4 }],
        images: [{ bufferView: 4, mimeType: "image/png", name: "paint" }], textures: [{ source: 0 }], materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.5, 1, 1, 1], baseColorTexture: { index: 0 } } }],
        meshes: [{ name: "tri", primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }, { attributes: { POSITION: 0 }, indices: 4, mode: 1 }] }],
        nodes: [{ children: [1, 2], translation: [10, 0, 0] }, { mesh: 0, rotation: [0, s2, 0, s2], scale: [2, 2, 2] }, { mesh: 0, scale: [-1, 1, 1] }], scenes: [{ nodes: [0] }], scene: 0 };
    const g2 = U.glbToUsdz(packGlb(gltf, chunks, off), { name: "Hand" }), ms = U.readUsda(g2.usda);
    // node 1: world = T(10,0,0) R(90 about y) S(2): (x, y, z) -> (10 + 2z, 2y, -2x); node 2: T(10,0,0) S(-1,1,1): (x, y, z) -> (10 - x, y, z)
    const a = ms[0], b = ms[1], wantA = [10, 0, 0, 10, 0, -2, 10, 2, 0], wantB = [10, 0, 0, 9, 0, 0, 10, 1, 0];
    const faceN = (m) => { const p = (k) => m.points.slice(m.faceVertexIndices[k] * 3, m.faceVertexIndices[k] * 3 + 3), [p0, p1, p2] = [0, 1, 2].map(p), u = p1.map((v, i) => v - p0[i]), w = p2.map((v, i) => v - p0[i]); return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; };
    const dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
    ok("!! NODE TRANSFORMS BAKED IN: a turn and a doubling, and a mirror -- the points where the transforms put them", ms.length === 2 && close(a.points, wantA, 1e-5) && close(b.points, wantB, 1e-5), `${a && a.points} | ${b && b.points}`);
    ok("!! NORMALS BY THE INVERSE TRANSPOSE, UNIT LENGTH; THE MIRROR'S FACE WOUND BACK so the face still turns toward its normal", close(a.normals.slice(0, 3), [1, 0, 0], 1e-6) && close(b.normals.slice(0, 3), [0, 0, 1], 1e-6) && dot(faceN(a), a.normals.slice(0, 3)) > 0 && dot(faceN(b), b.normals.slice(0, 3)) > 0 && close(b.faceVertexIndices, [0, 2, 1], 0), `mirror's indices ${b && b.faceVertexIndices}`);
    const z = unzip(g2.bytes), texFile = z.local.find((f) => /\.png$/.test(f.name));
    ok("!! THE TEXTURE: st = (u, 1 - v); the PNG in the archive byte for byte, named by a UsdUVTexture that multiplies by the base colour factor", close(a.st, [0, 1, 1, 1, 0, 0.75], 1e-6) && texFile && Buffer.compare(Buffer.from(texFile.data), Buffer.from(png)) === 0 && g2.usda.includes(`asset inputs:file = @${texFile.name}@`) && /float4 inputs:scale = \(0\.5, 1, 1, 1\)/.test(g2.usda) && /UsdPrimvarReader_float2/.test(g2.usda), texFile ? texFile.name : "no png");
    ok("!! THE LINE PRIMITIVE IS SKIPPED AND SAID SO", g2.skipped.length === 2 && g2.skipped.every((s) => /mode 1/.test(s)), JSON.stringify(g2.skipped));
});

console.log("5. THE WORLD");
section(() => {
    const S = 16, H = 8, chunk = (extra) => { const v = new Uint8Array(S * H * S); for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) v[x + S * (z + S * 0)] = 3; if (extra) v[2 + S * (2 + S * 1)] = 1; return { voxels: v }; };
    const meshes = worldMeshes({ chunkSize: S, chunks: new Map([["0,0", chunk(true)], ["1,0", chunk(false)]]) }), r = U.meshesToUsdz(meshes, { name: "SweK_world" }), back = U.readUsda(r.usda);
    const tri = meshes.reduce((s, m) => s + m.positions.length / 9, 0), z = unzip(r.bytes);
    ok("!! A VOXEL WORLD (worldMeshes, as swekExport.usdz() exports it): every chunk a mesh, every triangle written, the palette as materials, a valid archive", back.length === meshes.length && r.stats.triangles === tri && back.every((m) => m.faceVertexCounts.length * 3 === m.faceVertexIndices.length) && r.stats.materials >= 2 && z.local[0].dataOffset % 64 === 0, `${meshes.length} meshes, ${tri} triangles, ${r.stats.materials} materials, ${r.bytes.length} bytes`);
    const main = fs.readFileSync(path.join(ENG, "main.js"), "utf8");
    ok("!! main.js's swekExport.usdz() exports those meshes through meshesToUsdz", /async usdz\(o = \{\}\)[\s\S]{0,600}worldMeshes\(world, o\)[\s\S]{0,200}meshesToUsdz\(meshes/.test(main));
});

console.log("6. THE SCENE EXPORT (2026-11-28)");
section(() => {
    // the scene export: chunks, a prop placed twice (turned and moved), a camera -- as swekExport.scene({ usdz: true }) converts it
    const S = 16, H = 8, chunk = () => { const v = new Uint8Array(S * H * S); for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) v[x + S * (z + S * 0)] = 3; return { voxels: v }; };
    const prop = { name: "crate", positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), colors: new Float32Array([0.9, 0.5, 0.1, 0.9, 0.5, 0.1, 0.9, 0.5, 0.1]) };
    const s2 = Math.SQRT1_2, r = exportSceneGlb({ chunkSize: S, chunks: new Map([["0,0", chunk()]]) }, { props: [{ mesh: prop, placements: [{ translation: [5, 2, 5] }, { translation: [8, 2, 3], rotation: [0, s2, 0, s2] }] }], camera: { position: [0, 10, 20], forward: [0, -0.4, -1], yfov: 0.9, znear: 0.1, zfar: 500 } });
    const chunkTris = worldMeshes({ chunkSize: S, chunks: new Map([["0,0", chunk()]]) }).reduce((a, m) => a + m.positions.length / 9, 0);
    const u = U.glbToUsdz(r.bytes, { name: "SweK_scene" }), ms = U.readUsda(u.usda), crates = ms.filter((m) => /crate/.test(m.name));
    ok("!! THE SCENE'S GLB BECOMES A USDZ: every chunk triangle and each prop placement once, the prop where its placement puts it (moved; turned a quarter about y), the camera left out and said so", u.stats.triangles === chunkTris + 2 && crates.length === 2 && close(crates[0].points, [5, 2, 5, 6, 2, 5, 5, 3, 5], 1e-5) && close(crates[1].points, [8, 2, 3, 8, 2, 2, 8, 3, 3], 1e-5) && u.skipped.length === 1 && /camera/.test(u.skipped[0]), `${u.stats.triangles} triangles (${chunkTris} + 2); ${crates.map((c) => c.points.map((v) => +v.toFixed(3)).join(",")).join(" | ")}; ${JSON.stringify(u.skipped)}`);
    const main = fs.readFileSync(path.join(ENG, "main.js"), "utf8");
    ok("!! main.js's swekExport.scene({ usdz: true }) sends that scene's GLB through glbToUsdz", /if \(o\.usdz\) \{[\s\S]{0,200}glbToUsdz\(r\.bytes/.test(main));
});

console.log("7. SPLAT CAPTURES (2026-11-28)");
section(() => {
    // four splats in a .splat file (32 bytes each: position, linear scale, RGBA, quaternion as (q + 1) x 128): one big and opaque turned a quarter about z, one small,
    // one faint (under the opacity floor), one big and opaque but further down the list
    const rows = [[[0, 0, 0], [0.5, 0.2, 0.1], [255, 0, 0, 250], [s2q(Math.SQRT1_2), 128, 128, s2q(Math.SQRT1_2)]], [[3, 0, 0], [0.05, 0.05, 0.05], [0, 255, 0, 250], [255, 128, 128, 128]], [[0, 3, 0], [1, 1, 1], [0, 0, 255, 20], [255, 128, 128, 128]], [[0, 0, 3], [0.3, 0.3, 0.3], [255, 255, 0, 230], [255, 128, 128, 128]]];
    function s2q(v) { return Math.round((v + 1) * 128); }
    const buf = new ArrayBuffer(32 * rows.length), dv = new DataView(buf);
    rows.forEach(([p, sc, c, q], i) => { const b = i * 32; p.forEach((v, k) => dv.setFloat32(b + k * 4, v, true)); sc.forEach((v, k) => dv.setFloat32(b + 12 + k * 4, v, true)); c.forEach((v, k) => dv.setUint8(b + 24 + k, v)); q.forEach((v, k) => dv.setUint8(b + 28 + k, Math.min(255, v))); });
    const cloud = parseSplatFile(buf, "probe.splat"), all = U.splatsToMeshes(cloud, { budget: 10, size: 1 }), two = U.splatsToMeshes(cloud, { budget: 2, size: 1 }), flip = U.splatsToMeshes(cloud, { budget: 10, size: 1, flip: true });
    const m = all[0], verts = (mm, j) => Array.from({ length: 6 }, (_, k) => [0, 1, 2].map((a) => mm.positions[(j * 6 + k) * 3 + a]));
    ok("!! THE OPACITY FLOOR AND THE BUDGET: the faint splat dropped; with a budget of two, the two with the most opacity x volume kept (the big red and the yellow), in file order", all.kept === 3 && all.eligible === 3 && all.total === 4 && two.kept === 2 && close(Array.from(two[0].colors.slice(0, 3)), [1, 0, 0], 0.01) && close(Array.from(two[0].colors.slice(18, 21)), [1, 1, 0], 0.01), `${all.kept} of ${all.total}; budget 2: ${Array.from(two[0].colors.filter((_, i) => i % 18 < 3)).map((v) => v.toFixed(2))}`);
    const v0 = verts(m, 0), axes = v0.map((v) => Math.hypot(...v));
    ok("!! EACH SPLAT AN OCTAHEDRON ALONG ITS OWN AXES: the first (scale 0.5, 0.2, 0.1, turned a quarter about z) reaches 0.5 along y, 0.2 along x, 0.1 along z", close(v0[0], [0, 0.5, 0], 0.02) && close(v0[2], [-0.2, 0, 0], 0.02) && close(v0[4], [0, 0, 0.1], 0.02), JSON.stringify(v0.map((v) => v.map((x) => +x.toFixed(3)))) + " " + axes.map((x) => x.toFixed(2)));
    const outward = (mm) => { let good = 0, n = 0; for (let t = 0; t < mm.indices.length / 3; t++) { const [a, b, c] = [0, 1, 2].map((k) => Array.from(mm.positions.slice(mm.indices[t * 3 + k] * 3, mm.indices[t * 3 + k] * 3 + 3))), j = Math.floor(mm.indices[t * 3] / 6), cen = [0, 1, 2].map((k) => verts(mm, j).reduce((s, v) => s + v[k], 0) / 6), u = b.map((x, k) => x - a[k]), w = c.map((x, k) => x - a[k]), nrm = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], mid = [0, 1, 2].map((k) => (a[k] + b[k] + c[k]) / 3 - cen[k]); n++; if (nrm[0] * mid[0] + nrm[1] * mid[1] + nrm[2] * mid[2] > 0) good++; } return [good, n]; };
    const [g1, n1] = outward(m), [g2, n2] = outward(flip[0]);
    ok("!! EVERY FACE WINDS OUTWARD (counter-clockwise from outside), turned or flipped; the flip puts y up (the splat at y 3 would go to -3; the one at z 3 to -3)", g1 === n1 && g2 === n2 && n1 === 24 && close(verts(flip[0], 2).reduce((s, v) => s.map((x, k) => x + v[k] / 6), [0, 0, 0]), [0, 0, -3], 1e-5), `${g1}/${n1}, flipped ${g2}/${n2}`);
    const z = U.meshesToUsdz(all, { name: "SweK_splats" }), back = U.readUsda(z.usda)[0];
    ok("!! AND THEY GO OUT AS A USDZ LIKE ANY MESH: 24 triangles, three colours as three materials", z.stats.triangles === 24 && z.stats.materials === 3 && back.faceVertexIndices.length === 72, `${z.stats.triangles} triangles, ${z.stats.materials} materials`);
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG (2026-11-27): 12 mutants of tools/export/usdz.mjs. ALL 12 RED -- data off the 64-byte boundary, a CRC wrong, st not flipped, a mirror's winding not fixed,
// a mirror's normals left inward, subsets overlapping, the texture's factor dropped, colours never merged, node transforms in the wrong order, metres not stated, a stage
// not required first, a face's colour from its first vertex only. BEFORE THE SABOTAGE the gate found a real bug: a mirroring node's normals came out turned inward (the
// cofactor matrix is det times the inverse transpose), and its 1000-colour row had only 256 distinct colours.
