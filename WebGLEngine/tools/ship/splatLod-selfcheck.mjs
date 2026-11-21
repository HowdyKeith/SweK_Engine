// WebGLEngine/tools/ship/splatLod-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/splatLod-selfcheck.mjs      (seconds, and about a minute more for section 4's headless browser)
//
// SPLATS AT SCALE, HELD. render/splatLod.mjs builds an octree of a splat cloud with merged stand-ins, cuts it to a splat budget for each camera, and streams
// a packed file by Range requests; splat-gpu.html draws the cut with render/splatRendererGPU.mjs's update(). Four things hold it:
//
//   1  THE OCTREE    every splat in exactly one leaf, bit for bit; leaves within leafSize, inner nodes within `proxies` stand-ins, children inside their
//                    parent; a stand-in keeps its splats' opacity-weighted centre and colour and their combined coverage
//   2  THE CUT       never over the budget; far away a handful of stand-ins, near with room every real splat (the whole cloud, bit for bit); nearer never
//                    draws fewer; a stand-in is refined only while its spacing looks bigger than the threshold
//   3  STREAMING     the packed file opens to the same tree; only the root at first; the cut asks for the nodes it wants, load() fetches exactly those byte
//                    ranges (once each, even when asked twice at once), and once everything wanted has come the cut is the in-memory one; a wrong file is refused
//   4  THE PAGE      on WebGPU in a headless browser: ?lod=1 draws within its budget, and its picture is the whole cloud's within a few levels; ?swlod= streams a packed file over HTTP Range and loads more nodes as
//                    it goes, drawing within its budget, with no page error
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as L from "../../render/splatLod.mjs";
import { SPLAT_GENERATORS } from "../../engine/splatGenerator.js";
import { PRESENT_ARGS, webgpuSkipReason } from "./webgpuHarness.mjs";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require = createRequire(import.meta.url), ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const cloud = SPLAT_GENERATORS.nebula({ count: 20000 }), lod = L.buildLod(cloud, { leafSize: 128, proxies: 64 });
const rowsOf = (c) => { const out = []; for (let i = 0; i < c.count; i++) out.push([...c.positions.subarray(i * 3, i * 3 + 3), ...c.scales.subarray(i * 3, i * 3 + 3), ...c.colors.subarray(i * 3, i * 3 + 3), c.opacities[i], ...c.quats.subarray(i * 4, i * 4 + 4)].join()); return out.sort(); };

console.log("splatLod-selfcheck -- the splat octree, its budgeted cut, and streaming\n");

console.log("1. THE OCTREE");
await section(() => {
    const N = lod.nodes, leaves = N.filter((n) => n.leaf), leafRows = [];
    for (const lf of leaves) for (let j = 0; j < lf.records.length / L.FLOATS; j++) leafRows.push(Array.from(lf.records.subarray(j * L.FLOATS, (j + 1) * L.FLOATS)).join());
    ok("!! EVERY SPLAT IN EXACTLY ONE LEAF, bit for bit: the leaves together are the cloud", leafRows.length === cloud.count && leafRows.sort().join("|") === rowsOf(cloud).join("|") && leaves.reduce((t, l) => t + l.count, 0) === cloud.count && N[0].count === cloud.count);
    const inside = (c, p) => [0, 1, 2].every((a) => Math.abs(c.bounds[a] - p.bounds[a]) <= p.bounds[3] / 2 + 1e-9) && Math.abs(c.bounds[3] - p.bounds[3] / 2) < 1e-12;
    const outside = leaves.reduce((t, l) => { for (let j = 0; j < l.records.length / L.FLOATS; j++) for (let a2 = 0; a2 < 3; a2++) if (Math.abs(l.records[j * L.FLOATS + a2] - l.bounds[a2]) > l.bounds[3] * (1 + 1e-6)) return t + 1; return t; }, 0);
    ok("!! every leaf's splats lie inside its own box (the octant a splat goes to is the one its position names)", outside === 0, `${outside} outside`);
    ok("!! leaves within leafSize, inner nodes within 64 stand-ins, every child a half-size octant inside its parent", leaves.every((l) => l.records.length / L.FLOATS <= 128) && N.filter((n) => !n.leaf).every((n) => n.records.length / L.FLOATS <= 64 && n.children.length > 0 && n.children.every((k) => N[k].parent === n.id && inside(N[k], n))), `${N.length} nodes, ${leaves.length} leaves`);
    const sig = (x) => 1 / (1 + Math.exp(-x)), recs = new Float32Array([0, 0, 0, Math.log(0.1), Math.log(0.1), Math.log(0.1), 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, Math.log(0.1), Math.log(0.1), Math.log(0.1), 0, 0, 1, 0, 1, 0, 0, 0]);
    const m = L.mergeRecords(recs, [0.5, 0, 0, 1], 1);
    ok("!! A STAND-IN keeps its splats' opacity-weighted centre and colour (two equal splats: the midpoint, half red half blue), covers their spread, and its opacity is their combined coverage 1 - (1-a)(1-b)", m.length === L.FLOATS && Math.abs(m[0] - 0.5) < 1e-6 && Math.abs(m[6] - 0.5) < 1e-6 && Math.abs(m[8] - 0.5) < 1e-6 && Math.exp(m[3]) > 0.5 && Math.abs(sig(m[9]) - 0.75) < 1e-3);
    ok("!! an empty cloud is refused by name", (() => { try { L.buildLod({ count: 0 }); return false; } catch (e) { return /empty cloud/.test(e.message); } })());
});

console.log("2. THE CUT");
await section(() => {
    const at = (d, budget = 1e9) => L.selectLod(lod, { eye: [0, 0, d], fovy: 0.9, height: 1080 }, { budget });
    const far = at(5000), near = at(3), b = at(3, 5000);
    ok("!! far away a handful of stand-ins; near, with room, EVERY real splat -- the whole cloud, bit for bit", far.splats <= 64 && far.nodes.length <= 9 && near.splats === cloud.count && rowsOf(L.gatherSplats(lod, near)).join("|") === rowsOf(cloud).join("|"), `far ${far.splats}, near ${near.splats}`);
    ok("!! NEVER OVER THE BUDGET, and it says when the budget stopped it", b.splats <= 5000 && b.capped && !near.capped && L.gatherSplats(lod, b).count === b.splats && [500, 2000, 9000].every((x) => at(2, x).splats <= x));
    const ds = [4000, 1000, 300, 100, 30, 10, 3], counts = ds.map((d) => at(d).splats);
    ok("!! NEARER NEVER DRAWS FEWER", counts.every((c, i) => i === 0 || c >= counts[i - 1]), counts.join(" < "));
    const loose = L.selectLod(lod, { eye: [0, 0, 300] }, { budget: 1e9, pixelThreshold: 50 }), tight = L.selectLod(lod, { eye: [0, 0, 300] }, { budget: 1e9, pixelThreshold: 0.5 });
    ok("!! a coarser threshold refines less", loose.splats < tight.splats);
});

console.log("3. STREAMING");
await section(async () => {
    const bytes = L.packLod(lod, { compress: false }), asked = [];   // the plain f32 file: streaming exactly; the compressed one has its own section
    const fetchRange = async (a, b) => { asked.push([a, b]); return bytes.subarray(a, b + 1); };
    const s = await L.openLodStream(fetchRange), N = s.lod.nodes;
    ok("!! the packed file opens to the same tree, with only the root loaded", N.length === lod.nodes.length && N.every((n, i) => n.parent === lod.nodes[i].parent && n.children.join() === lod.nodes[i].children.join() && n.leaf === lod.nodes[i].leaf) && N.filter((n) => n.loaded).length === 1 && Array.from(N[0].records).join() === Array.from(lod.nodes[0].records).join());
    const eye = { eye: [0, 0, 3], height: 1080 }, c0 = L.selectLod(s.lod, eye, { budget: 1e9 });
    ok("!! with only the root, the cut draws the root's stand-ins and asks for its children", c0.nodes.join() === "0" && c0.wanted.slice().sort((a, b) => a - b).join() === lod.nodes[0].children.slice().sort((a, b) => a - b).join());
    asked.length = 0; await Promise.all([s.load(c0.wanted), s.load(c0.wanted)]);
    const ranges = c0.wanted.map((id) => [s.base + N[id].offset, s.base + N[id].offset + N[id].length - 1].join()).sort();
    ok("!! load() fetches EXACTLY those nodes' byte ranges, once each even when asked twice at once", asked.map((r) => r.join()).sort().join("|") === ranges.join("|") && c0.wanted.every((id) => N[id].loaded && Array.from(N[id].records).join() === Array.from(lod.nodes[id].records).join()));
    let cut = L.selectLod(s.lod, eye, { budget: 6000 }), rounds = 0; while (cut.wanted.length && rounds < 50) { await s.load(cut.wanted); cut = L.selectLod(s.lod, eye, { budget: 6000 }); rounds++; }
    ok("!! once everything the camera wants has come, the cut is the in-memory one, and less than the whole file was fetched", cut.nodes.join() === L.selectLod(lod, eye, { budget: 6000 }).nodes.join() && N.some((n) => !n.loaded), `${rounds} rounds, ${N.filter((n) => n.loaded).length} of ${N.length} nodes loaded`);
    const bad = new Uint8Array(bytes); bad[0] = 88;
    ok("!! a file that is not .swlod is refused", await L.openLodStream(async (a, b) => bad.subarray(a, b + 1)).then(() => false, (e) => /not a \.swlod/.test(e.message)));
    const r206 = await L.httpRange("x", async () => ({ status: 206, arrayBuffer: async () => bytes.slice(10, 20).buffer }))(10, 19), r200 = await L.httpRange("x", async () => ({ status: 200, arrayBuffer: async () => bytes.slice().buffer }))(10, 19);
    ok("!! over HTTP: a 206 is the range; a server that ignores Range (200, the whole file) is cut to it", r206.join() === Array.from(bytes.subarray(10, 20)).join() && r200.join() === Array.from(bytes.subarray(10, 20)).join() && await L.httpRange("x", async () => ({ status: 404 }))(0, 1).then(() => false, () => true));
});

console.log("3b. COMPRESSED (q17, the default)");
await section(async () => {
    const plain = L.packLod(lod, { compress: false }), q = L.packLod(lod), s = await L.openLodStream(async (a, b) => q.subarray(a, b + 1));
    ok("!! the compressed file is SWLOD2, 17 bytes a splat, and at least 2.5 times smaller than plain f32", s.compressed && new TextDecoder().decode(q.subarray(0, 6)) === "SWLOD2" && L.Q_BYTES === 17 && plain.length / q.length >= 2.5, `${(plain.length / 1024).toFixed(0)} KB plain, ${(q.length / 1024).toFixed(0)} KB compressed, ${(plain.length / q.length).toFixed(2)}x`);
    await s.load(s.lod.nodes.map((n) => n.id));
    let worst = { pos: 0, scl: 0, col: 0, opa: 0, rot: 0 }, over = 0;
    for (const nd of lod.nodes) {
        const a = nd.records, b = s.lod.nodes[nd.id].records, n = a.length / L.FLOATS, ext = (base) => [0, 1, 2].map((k) => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < n; i++) { const v = a[i * L.FLOATS + base + k]; lo = Math.min(lo, v); hi = Math.max(hi, v); } return hi - lo; });
        const E = { pos: ext(0), scl: ext(3), col: ext(6) }, sig = (x) => 1 / (1 + Math.exp(-x));
        for (let i = 0; i < n; i++) {
            const o = i * L.FLOATS;
            for (let k = 0; k < 3; k++) {
                const dp = Math.abs(a[o + k] - b[o + k]) / (E.pos[k] / 65535 / 2 + 1e-7), ds = Math.abs(a[o + 3 + k] - b[o + 3 + k]) / (E.scl[k] / 255 / 2 + 1e-7), dc = Math.abs(a[o + 6 + k] - b[o + 6 + k]) / (E.col[k] / 255 / 2 + 1e-7);
                worst.pos = Math.max(worst.pos, dp); worst.scl = Math.max(worst.scl, ds); worst.col = Math.max(worst.col, dc); if (dp > 1.01 || ds > 1.01 || dc > 1.01) over++;
            }
            const da = Math.abs(sig(a[o + 9]) - sig(b[o + 9])); worst.opa = Math.max(worst.opa, da); if (da > 1 / 510 + 1e-4) over++;
            const qa = a.subarray(o + 10, o + 14), qb = b.subarray(o + 10, o + 14), la = Math.hypot(...qa), dot = Math.abs((qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3]) / la), deg = (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI;
            worst.rot = Math.max(worst.rot, deg); if (deg > 0.25) over++;
        }
    }
    ok("!! EVERY FIELD WITHIN ITS QUANTISATION BOUND: position within half a step of 65535 across its node's extent, log-scale and colour within half a step of 255 across theirs, opacity within 1/510, rotation within a quarter of a degree", over === 0,
        `worst: position ${worst.pos.toFixed(2)}, scale ${worst.scl.toFixed(2)}, colour ${worst.col.toFixed(2)} (of a half step), opacity ${worst.opa.toFixed(4)}, rotation ${worst.rot.toFixed(3)} degrees`);
    // ROTATIONS: generated clouds all carry the identity, so the tree's records say nothing about the rotation code; 2000 random rotations do, half of them
    // with their largest component negative (q and -q are one rotation: the encoder must flip, not drop, the sign)
    const R = new Float32Array(2000 * L.FLOATS), hh = (i) => { const x = Math.sin(i * 91.7 + 3.1) * 43758.5453; return x - Math.floor(x); };
    for (let i = 0; i < 2000; i++) { const q = [hh(i) - 0.5, hh(i + 5e3) - 0.5, hh(i + 1e4) - 0.5, hh(i + 2e4) - 0.5], l = Math.hypot(...q), sg = i % 2 ? -1 : 1; R.set(q.map((x) => (sg * x) / l), i * L.FLOATS + 10); R[i * L.FLOATS + 9] = 1; }
    const RQ = L.decodeQ(L.encodeQ(R)); let worstDeg = 0;
    for (let i = 0; i < 2000; i++) { const o = i * L.FLOATS, d = Math.abs(R[o + 10] * RQ[o + 10] + R[o + 11] * RQ[o + 11] + R[o + 12] * RQ[o + 12] + R[o + 13] * RQ[o + 13]); worstDeg = Math.max(worstDeg, (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI); }
    ok("!! 2000 RANDOM ROTATIONS, half with a negative largest component: each comes back within 0.3 degrees (smallest three, 10 bits: rebuilding a small largest component magnifies the error; 8 bits would be about a degree)", worstDeg < 0.3, `worst ${worstDeg.toFixed(3)} degrees`);
    const single = L.decodeQ(L.encodeQ(new Float32Array([1, 2, 3, -1, -2, -3, 0.2, 0.4, 0.6, 1.5, 0, 0, 0, -1])));
    ok("!! one splat (every extent zero) comes back exactly where it was; q and -q are the same rotation", single[0] === 1 && single[2] === 3 && single[5] === -3 && Math.abs(single[8] - 0.6) < 1e-6 && Math.abs(Math.abs(single[13]) - 1) < 1e-6);
    const cut = L.selectLod(s.lod, { eye: [0, 0, 3] }, { budget: 6000 }), cutPlain = L.selectLod(lod, { eye: [0, 0, 3] }, { budget: 6000 });
    ok("!! the compressed tree cuts the same as the plain one (the cut reads the tree, not the splats)", cut.nodes.join() === cutPlain.nodes.join());
});

console.log("4. THE PAGE (WebGPU, headless)");
const skip = webgpuSkipReason(require);
if (skip) console.log(`  ----  skipped: ${skip}`);
else await section(async () => {
    const swlod = L.packLod(L.buildLod(SPLAT_GENERATORS.nebula({ count: 60000 })))   /* compressed, the default */, types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript" };
    const srv = http.createServer((q, r) => {
        const u = decodeURIComponent(q.url.split("?")[0]);
        if (u === "/scene.swlod") { const m = /bytes=(\d+)-(\d+)/.exec(q.headers.range || ""); if (!m) { r.writeHead(200); return r.end(Buffer.from(swlod)); } const a = +m[1], b = Math.min(+m[2], swlod.length - 1); r.writeHead(206, { "Content-Range": `bytes ${a}-${b}/${swlod.length}` }); return r.end(Buffer.from(swlod.subarray(a, b + 1))); }
        const f = path.join(ENG, u); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); return r.end(fs.readFileSync(f)); } r.writeHead(404); r.end();
    });
    await new Promise((res) => srv.listen(0, "127.0.0.1", res));
    const { chromium } = resolvePlaywright(require), browser = await chromium.launch({ args: [...PRESENT_ARGS], ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) });
    const open = async (qs, waitMs) => {
        const p = await browser.newPage({ viewport: { width: 320, height: 200 } }), errors = []; p.on("pageerror", (e) => errors.push(e.message));
        await p.goto(`http://127.0.0.1:${srv.address().port}/splat-gpu.html?${qs}`);
        await p.waitForFunction(() => window.__splatGpu && (window.__splatGpu.ready || window.__splatGpu.error), null, { timeout: 90000 });
        const first = await p.evaluate(() => ({ ...window.__splatGpu, capture: undefined }));
        await new Promise((r) => setTimeout(r, waitMs));
        const later = await p.evaluate(async () => { const s = window.__splatGpu; return { st: { ...s, capture: undefined }, cap: s.error ? null : await s.capture() }; });
        await p.close(); return { first, later: later.st, cap: later.cap, errors };
    };
    const a = await open("lod=1&n=50000&budget=8000", 1500);
    ok("!! ?lod=1: on WebGPU, an octree of 50000 splats drawn within its budget of 8000, the frame lit, no page error", a.later.backend === "webgpu" && a.later.lod && a.later.count === 50000 && a.later.drawn > 0 && a.later.drawn <= 8000 && a.cap && a.cap.lit > 0.1 && !a.later.error && a.errors.length === 0, JSON.stringify({ drawn: a.later.drawn, budget: a.later.budget, lit: a.cap && a.cap.lit.toFixed(3), error: a.later.error || a.later.fallback, errors: a.errors.slice(0, 2) }));
    const full = await open("n=50000", 1500);
    let mean = null; if (full.cap && a.cap) { let t = 0; for (let i = 0; i < full.cap.grid.length; i++) t += Math.abs(full.cap.grid[i] - a.cap.grid[i]); mean = t / full.cap.grid.length; }
    ok("!! THE SAME PICTURE FROM A SIXTH OF THE SPLATS: the cut (at most 8000 of 50000) against the whole cloud, on the page's 32 x 20 grid, within 8 levels of 255 on average", mean != null && mean <= 8 && !full.later.lod, `mean ${mean == null ? "-" : mean.toFixed(2)} a channel; ${a.later.drawn} of 50000 drawn; frame ${a.later.frameMs.toFixed(0)} ms against ${full.later.frameMs.toFixed(0)} ms whole (SwiftShader, a CPU: the ratio, not the times)`);
    const b = await open("swlod=/scene.swlod&budget=20000", 3000);
    ok("!! ?swlod=: a packed (compressed) file of 60000 splats streamed over HTTP Range: the root first, MORE NODES LOADED AS IT GOES, drawn within the budget, no page error", b.later.backend === "webgpu" && b.later.lod && b.later.count === 60000 && b.first.loaded >= 1 && b.later.loaded > b.first.loaded && b.later.loaded < b.later.nodeCount && b.later.drawn <= 20000 && b.cap && b.cap.lit > 0.1 && !b.later.error && b.errors.length === 0,
        JSON.stringify({ loadedFirst: b.first.loaded, loadedLater: b.later.loaded, nodes: b.later.nodeCount, drawn: b.later.drawn, error: b.later.error, errors: b.errors.slice(0, 2) }));
    await browser.close(); srv.close();
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG:
// 14 mutants of render/splatLod.mjs, each in a hard-linked copy of the tree: ALL 14 RED, one after a fix (an octant bit lost -- GREEN at first, because the
// gate checked the boxes against each other but not the splats against their box, so section 1 now does --, a leaf dropping a splat, stand-ins unbounded,
// coverage summed instead of combined, colour unweighted, the budget ignored, unloaded nodes refined, the threshold ignored, gathering skipping a splat a node,
// node byte ranges off by four, no de-duplication of a node asked for twice, the magic unchecked, a 200 not cut to the range, the spread averaged over the axes).
// COMPRESSION (2026-11-21, Keith: "5"): 8 more mutants of render/splatLod.mjs, ALL 8 RED, two after a fix (positions in 8 bits, colour without its node's range,
// opacity stored raw, the largest rotation component's sign not fixed -- GREEN at first, and rotations in 8 bits -- GREEN at first: the generated clouds all
// carry the identity rotation, so section 3b now also round-trips 2000 random rotations, half with a negative largest component --, decoding over 65536,
// packing always plain, a compressed file read as plain).
