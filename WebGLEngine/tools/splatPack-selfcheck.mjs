// WebGLEngine/tools/splatPack-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/splatPack-selfcheck.mjs      (seconds)
//
// A SPLAT CAPTURE TO A STREAMABLE FILE, HELD. tools/splatPack.mjs reads a .ply or .splat with the page's parser, builds the level-of-detail octree and packs
// it. A .ply written by engine/plyWriter.mjs (the tree's own writer, so the fields are the 3DGS ones the parser reads) is the capture here.
//
//   1  THE PACK      every splat the parser read is in the file's leaves (bit for bit with --plain; within the quantisation bounds compressed); the compressed
//                    file is smaller than the plain one by the amount its stats say
//   2  THE COMMAND   it writes <in>.swlod beside the input by default, prints what it made and how to open it, honours --leaf and --plain, and refuses an unknown
//                    option, a missing file, a file with no splats, and a leaf below 8
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writePly } from "../engine/plyWriter.mjs";
import { parseSplatFile } from "../engine/splatParser.js";
import * as L from "../render/splatLod.mjs";
import * as P from "./splatPack.mjs";

const CMD = fileURLToPath(new URL("./splatPack.mjs", import.meta.url));
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const h = (i) => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
const gaussians = Array.from({ length: 6000 }, (_, i) => ({ x: (h(i) - 0.5) * 4, y: (h(i + 1e4) - 0.5) * 4, z: (h(i + 2e4) - 0.5) * 4, scale: [Math.log(0.02 + 0.05 * h(i + 3e4)), Math.log(0.03), Math.log(0.04)], rot: [1, h(i + 4e4) - 0.5, 0, 0.2], color: [h(i + 5e4) * 2 - 1, h(i + 6e4) * 2 - 1, 0.3], opacity: (h(i + 7e4) - 0.5) * 6 }));
const plyBytes = writePly(gaussians), ab = plyBytes.buffer.slice(plyBytes.byteOffset, plyBytes.byteOffset + plyBytes.byteLength);
const rows = (recs) => { const out = []; for (let i = 0; i < recs.length / L.FLOATS; i++) out.push(Array.from(recs.subarray(i * L.FLOATS, (i + 1) * L.FLOATS)).join()); return out; };
const leafRecs = async (bytes) => { const s = await L.openLodStream(async (a, b) => bytes.subarray(a, b + 1)); await s.load(s.lod.nodes.map((n) => n.id)); return { s, recs: s.lod.nodes.filter((n) => n.leaf).flatMap((n) => rows(n.records)) }; };

console.log("splatPack-selfcheck -- a .ply to a streamable .swlod\n");

console.log("1. THE PACK");
await section(async () => {
    const cloud = parseSplatFile(ab, "t.ply"), mine = [];
    for (let i = 0; i < cloud.count; i++) mine.push([...cloud.positions.subarray(i * 3, i * 3 + 3), ...cloud.scales.subarray(i * 3, i * 3 + 3), ...cloud.colors.subarray(i * 3, i * 3 + 3), cloud.opacities[i], ...cloud.quats.subarray(i * 4, i * 4 + 4)].join());
    const plain = P.pack(ab, "t.ply", { leaf: 128, plain: true }), q = P.pack(ab, "t.ply", { leaf: 128 });
    const a = await leafRecs(plain.bytes);
    ok("!! --plain: EVERY SPLAT THE PARSER READ IS IN THE FILE'S LEAVES, bit for bit", cloud.count === 6000 && plain.stats.splats === 6000 && a.recs.length === 6000 && a.recs.slice().sort().join("|") === mine.slice().sort().join("|") && !a.s.compressed);
    const b = await leafRecs(q.bytes);
    let worstPos = 0; for (const nd of q.lod.nodes.filter((n) => n.leaf)) { const x = nd.records, y = b.s.lod.nodes[nd.id].records; for (let i = 0; i < x.length; i += L.FLOATS) for (let k = 0; k < 3; k++) worstPos = Math.max(worstPos, Math.abs(x[i + k] - y[i + k])); }
    ok("!! compressed: the same 6000 splats, each position within 1e-4 of the parser's (16 bits across a leaf's box)", b.s.compressed && b.recs.length === 6000 && worstPos < 1e-4, `worst position error ${worstPos.toExponential(2)}`);
    ok("!! the compressed file is smaller than the plain one, and its stats say by how much (the true ratio within 1%)", q.bytes.length < plain.bytes.length && Math.abs(q.stats.plainBytes / q.stats.bytes - plain.bytes.length / q.bytes.length) / (plain.bytes.length / q.bytes.length) < 0.01 && q.stats.leaves > 1 && q.stats.depth >= 1,
        `${(plain.bytes.length / 1024).toFixed(0)} KB plain, ${(q.bytes.length / 1024).toFixed(0)} KB compressed, stats say ${(q.stats.plainBytes / q.stats.bytes).toFixed(2)}x`);
});

await section(async () => {
    // 2026-11-22: a capture with harmonics keeps them through the pack, compressed, and the stats say so
    const gs = gaussians.slice(0, 2000).map((g, i) => ({ ...g, rest: Array.from({ length: 45 }, (_, r) => Math.fround((h(i * 50 + r + 9e4) - 0.5) * 2)) })), pb = writePly(gs), buf = pb.buffer.slice(pb.byteOffset, pb.byteOffset + pb.byteLength);
    const q = P.pack(buf, "sh.ply", { leaf: 128 }), plain = P.pack(buf, "sh.ply", { leaf: 128, plain: true }), s = await L.openLodStream(async (a, b) => q.bytes.subarray(a, b + 1)); await s.load(s.lod.nodes.map((n) => n.id));
    let leaves = 0; for (const n of s.lod.nodes.filter((x) => x.leaf)) leaves += n.sh.length / 45;
    ok("!! A .ply WITH HARMONICS PACKS WITH THEM: degree 3 in the stats and in the file, every splat's coefficients in the leaves, the plain size the plain file's to the byte", q.stats.shDegree === 3 && s.lod.shDegree === 3 && leaves === 2000 && q.stats.plainBytes === plain.bytes.length && q.bytes.length < plain.bytes.length, `${(plain.bytes.length / q.bytes.length).toFixed(2)}x smaller`);
});

console.log("2. THE COMMAND");
await section(() => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "splatpack-")), ply = path.join(tmp, "scene.ply"); fs.writeFileSync(ply, plyBytes);
    const run = (...x) => spawnSync(process.execPath, [CMD, ...x], { encoding: "utf8", timeout: 120000, cwd: tmp });
    const r = run(ply), out = path.join(tmp, "scene.swlod");
    ok("!! it writes scene.swlod beside the input, compressed, and says what it made and how to open it", r.status === 0 && fs.existsSync(out) && new TextDecoder().decode(fs.readFileSync(out).subarray(0, 6)) === "SWLOD2" && /6,000 splats in [\d,]+ nodes/.test(r.stdout) && /smaller than plain f32/.test(r.stdout) && /splat-gpu\.html\?swlod=\/scene\.swlod/.test(r.stdout), r.stderr || r.stdout.split("\n")[0]);
    const r2 = run(ply, path.join(tmp, "p.swlod"), "--plain", "--leaf", "64"), p = fs.readFileSync(path.join(tmp, "p.swlod")), head = JSON.parse(new TextDecoder().decode(p.subarray(10, 10 + new DataView(p.buffer, p.byteOffset).getUint32(6, true))));
    ok("!! an output path, --plain and --leaf are honoured", r2.status === 0 && new TextDecoder().decode(p.subarray(0, 6)) === "SWLOD1" && head.leafSize === 64 && head.encoding === "f32");
    const bad = run(ply, "--speed", "2"), miss = run(path.join(tmp, "none.ply")), small = run(ply, "--leaf", "4"); fs.writeFileSync(path.join(tmp, "empty.splat"), new Uint8Array(0)); const empty = run(path.join(tmp, "empty.splat"));
    ok("!! it refuses an unknown option, a missing file, a leaf below 8, and a file with no splats", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && miss.status === 1 && /does not exist/.test(miss.stderr) && small.status === 2 && /at least 8/.test(small.stderr) && empty.status !== 0 && /no splats|empty/.test(empty.stderr));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG:
// 7 mutants of tools/splatPack.mjs, each in a hard-linked copy of the tree: 6 RED (--plain ignored, --leaf ignored, the stats' ratio wrong, an unknown option
// let through, a leaf below 8 let through, the default output name). ONE GREEN AND EQUIVALENT: the "no splats" refusal removed -- buildLod then refuses the
// empty cloud by name itself ("an empty cloud"), so the command still fails with the same meaning.
