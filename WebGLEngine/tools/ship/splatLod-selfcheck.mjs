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
    const bytes = L.packLod(lod), asked = [];
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

console.log("4. THE PAGE (WebGPU, headless)");
const skip = webgpuSkipReason(require);
if (skip) console.log(`  ----  skipped: ${skip}`);
else await section(async () => {
    const swlod = L.packLod(L.buildLod(SPLAT_GENERATORS.nebula({ count: 60000 }))), types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript" };
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
    ok("!! ?swlod=: a packed file of 60000 splats streamed over HTTP Range: the root first, MORE NODES LOADED AS IT GOES, drawn within the budget, no page error", b.later.backend === "webgpu" && b.later.lod && b.later.count === 60000 && b.first.loaded >= 1 && b.later.loaded > b.first.loaded && b.later.loaded < b.later.nodeCount && b.later.drawn <= 20000 && b.cap && b.cap.lit > 0.1 && !b.later.error && b.errors.length === 0,
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
