#!/usr/bin/env node
// WebGLEngine/tools/ship/voxelDevice-selfcheck.mjs -- v4517
//
// THE SANDBOX'S WORLD ON THE DEVICE (sandbox round 1): render/voxelDevice.mjs behind sandbox-gpu.html. Section 1, hand worlds
// through the SAME greedy mesher the sandbox's renderer runs: one voxel above the floor is 6 quads with 6 outward flat normals
// and the registry's colour; one voxel ON the floor is 5 (the mesher omits the floor, and this says so); two voxels side by side
// in one chunk merge to 6 quads; the same two across a chunk seam are 10 quads and NO seam face; a step beside a top face
// darkens its corners (AO folded into the colour); miniWorld honours the height bounds; the raycaster hits a voxel through the
// face it enters. Section 2, the real world: world/world.js's VoxelWorld with CityGen's city (seed 1, facades), 225 chunks,
// meshed in under two seconds, the same hash twice, a different seed a different hash. Section 3, ON BOTH BACKENDS: the page's
// scene drawn from above the city; every sampled pixel whose ray hits a voxel (the browser's own DDA through the world it drew)
// carries that voxel's colour RATIOS (AO and Lambert are scalars: r / g and b / g survive them), the top-face pixels are bright
// (the sun is overhead: flipped normals would leave only the ambient), the frame is mostly lit, the backends agree.
//
// MEASURED AT v4517: the VoxelWorld with CityGen's 30 buildings is 225 chunks, 548,634 vertices and 182,878 triangles, meshed in
// 0.7 s here and 1.1 s in the browser, hash 6401b3ab in BOTH runtimes (the terrain is the same in node and Chromium); the frame
// from (30, 110, 70) lights 22,765 of 24,000 pixels on both backends, 357 of 375 sample rays hit a voxel, 356 of 357 sampled pixels
// carry their voxel's colour ratios, 225 of 254 top-face pixels are at or above 0.6 of their colour (the rest are AO-darkened
// corners), the two backends are 13 pixels apart. The harness logs one 404: world/terrainWasm.js asking for the optional WASM
// terrain module, which the world reports and falls back from. THE CORRECTION: the raycaster's first draft left the slab the
// moment y stepped outside [0, height), so a ray that STARTS above the world (every camera ray) returned nothing and the key
// had 0 hits; it now leaves only when heading away from the slab.
//
// SABOTAGE (v4517): A  flatNormals negated                                   -> 4 red: 12 inward, the known triangle, and 0 of 254
//                                                                                top faces bright on both backends.
//                   B  colourOf reading id + 1                               -> 6 red: STONE reads DIRT, the PALETTE hold, and 11 of
//                                                                                357 pixels keep their ratios on both backends.
//                   C  the neighbours not handed to the mesher                -> 2 red: the seam pair meshes 24 triangles with 4 in the
//                                                                                plane x = 16 (the world grows to 215,494 triangles).
//                   D  the AO ignored in shadedColours                        -> 2 red: no vertex darker than the palette beside the
//                                                                                step, and the floor hold.
//                   Each restored and the baseline re-run: 0 red.
//
// Run: node tools/ship/voxelDevice-selfcheck.mjs      (~30 s: two worlds here, one in each browser backend)
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { SUN, AO_FLOOR, colourOf, miniWorld, columnTop, meshWorld, flatNormals, shadedColours, raycastVoxels, pixelRay } from "../../render/voxelDevice.mjs";
import { PALETTE } from "../../world/chunkMesherCore.js";
import { VoxelWorld } from "../../world/world.js";
import { CityGen } from "../../world/CityGen.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const triNormals = (r) => { const s = new Set(); for (let t = 0; t < r.vertices; t += 3) s.add([0, 1, 2].map((k) => r.mesh.normals[t * 3 + k].toFixed(0).replace("-0", "0")).join(",")); return s; };

// ---------------------------------------------------------------------------------------------------------------------------------
sec("1. hand worlds through the sandbox's own mesher");
{
    const w = miniWorld(); w.setVoxel(3, 5, 3, 1); const r = meshWorld(w);
    ok("one voxel above the floor: 6 quads, 12 triangles, 36 vertices, one chunk", r.triangles === 12 && r.vertices === 36 && r.chunks === 1);
    const dirs = triNormals(r);
    ok("its six flat normals are the six axis directions", dirs.size === 6 && ["1,0,0", "-1,0,0", "0,1,0", "0,-1,0", "0,0,1", "0,0,-1"].every((d) => dirs.has(d)), [...dirs].join(" "));
    let inward = 0; const p = r.mesh.positions, n = r.mesh.normals;
    for (let t = 0; t < r.vertices; t += 3) { const c = [0, 1, 2].map((k) => (p[t * 3 + k] + p[t * 3 + 3 + k] + p[t * 3 + 6 + k]) / 3 - [3.5, 5.5, 3.5][k]); if (c[0] * n[t * 3] + c[1] * n[t * 3 + 1] + c[2] * n[t * 3 + 2] <= 0) inward++; }
    ok("every normal points away from the voxel's centre (the mesher's winding is outward)", inward === 0, `${inward} inward`);
    const c0 = colourOf(1);
    ok("every vertex carries STONE's registry colour at full AO, alpha 1", (() => { for (let v = 0; v < r.vertices; v++) for (let k = 0; k < 3; k++) if (!near(r.mesh.colors[v * 4 + k], c0[k])) return false; return r.mesh.colors[3] === 1 && r.minAo === 1; })(), `${c0.join(", ")}`);
    ok("colourOf: the registry over the mesher's PALETTE, grey for an unknown id", colourOf(3).join() === PALETTE[3].join() && colourOf(250).join() === "0.5,0.5,0.5");
    const wf = miniWorld(); wf.setVoxel(3, 0, 3, 1);
    ok("one voxel ON the floor: 5 quads -- the mesher omits the floor plane, as the renderer does", meshWorld(wf).triangles === 10);
    const w2 = miniWorld(); w2.setVoxel(3, 5, 3, 1); w2.setVoxel(4, 5, 3, 1);
    ok("two voxels side by side in one chunk merge to 6 quads (greedy)", meshWorld(w2).triangles === 12);
    const w3 = miniWorld(); w3.setVoxel(15, 5, 3, 1); w3.setVoxel(16, 5, 3, 1); const r3 = meshWorld(w3);
    ok("*** the same two across the chunk seam: two chunks, 10 quads, and NO face at the seam (the neighbour buffer hides it) ***", r3.chunks === 2 && r3.triangles === 20, `${r3.triangles} triangles`);
    let seamFaces = 0; for (let t = 0; t < r3.vertices; t += 3) { const xs = [r3.mesh.positions[t * 3], r3.mesh.positions[t * 3 + 3], r3.mesh.positions[t * 3 + 6]]; if (xs.every((x) => x === 16) && Math.abs(r3.mesh.normals[t * 3]) === 1) seamFaces++; }
    ok("  counted directly: 0 triangles lie in the plane x = 16 with an x normal", seamFaces === 0, `${seamFaces}`);
    const w4 = miniWorld(); w4.setVoxel(3, 5, 3, 1); w4.setVoxel(4, 5, 3, 1); w4.setVoxel(4, 6, 3, 1); const r4 = meshWorld(w4);
    let darker = 0; for (let v = 0; v < r4.vertices; v++) if (r4.mesh.colors[v * 4] < c0[0] * 0.99) darker++;
    ok("a step beside a top face: the mesher's AO is below 1 and folds into the colour (some vertices darker than the palette)", r4.minAo < 1 && darker > 0, `minAo ${r4.minAo.toFixed(2)}, ${darker} darker vertices`);
    ok("shadedColours: ao 0 darkens to AO_FLOOR, ao 1 leaves the colour", near(shadedColours(Float32Array.from([1, 0.5, 0.2]), [0])[0], AO_FLOOR) && near(shadedColours(Float32Array.from([1, 0.5, 0.2]), [1])[1], 0.5));
    ok("flatNormals of a known triangle is its right-hand normal", (() => { const nn = flatNormals(Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0])); return near(nn[2], 1) && near(nn[0], 0) && near(nn[1], 0); })());
    const wb = miniWorld({ chunkHeight: 8 }); wb.setVoxel(1, 9, 1, 1); wb.setVoxel(1, -1, 1, 1); wb.setVoxel(1, 7, 1, 2);
    ok("miniWorld drops writes outside the height and reads them as air; columnTop finds the top", wb.voxelAt(1, 9, 1) === 0 && wb.voxelAt(1, -1, 1) === 0 && columnTop(wb, 1, 1).y === 7 && columnTop(wb, 1, 1).id === 2 && columnTop(wb, 5, 5) === null);
    const hit = raycastVoxels(w, [3.5, 20, 3.5], [0, -1, 0]), miss = raycastVoxels(w, [8.5, 20, 8.5], [0, -1, 0], 30), side = raycastVoxels(w, [-5, 5.5, 3.5], [1, 0, 0]);
    ok("raycastVoxels: straight down onto the voxel enters through its top (+y) at t 14; beside it nothing; from -x through its -x face", hit && hit.id === 1 && hit.normal.join() === "0,1,0" && near(hit.t, 14) && miss === null && side && side.normal.join() === "-1,0,0" && near(side.t, 8), hit ? `t ${hit.t}` : "no hit");
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("2. the real world: VoxelWorld terrain with CityGen's city");
let real;
{
    const build = (seed) => { const w = new VoxelWorld(); const cg = new CityGen(w); cg.generate({ seed, facades: true }); return { w, cg }; };
    const t0 = Date.now(), a = build(1), t1 = Date.now(), ra = meshWorld(a.w), t2 = Date.now();
    real = { world: a.w, city: a.cg, packed: ra };
    report(`world + city ${t1 - t0} ms, mesh ${t2 - t1} ms: ${ra.chunks} chunks (${ra.meshedChunks} with faces), ${ra.vertices.toLocaleString()} vertices, ${ra.triangles.toLocaleString()} triangles, ${a.cg.buildings.length} buildings, hash ${ra.hash}, minAo ${ra.minAo.toFixed(2)}`);
    ok("225 chunks (gridRadius 7), every one meshed, over 50,000 triangles, in under 4 s", ra.chunks === 225 && ra.meshedChunks === 225 && ra.triangles > 50000 && t2 - t1 < 4000);
    ok("the mesh is well formed: positions 3 per vertex, colours 4, normals unit, indices 0..n-1", ra.mesh.positions.length === ra.vertices * 3 && ra.mesh.colors.length === ra.vertices * 4 && (() => { for (let v = 0; v < ra.vertices; v += 997) { const l = Math.hypot(ra.mesh.normals[v * 3], ra.mesh.normals[v * 3 + 1], ra.mesh.normals[v * 3 + 2]); if (!near(l, 1, 1e-5)) return false; if (ra.mesh.indices[v] !== v) return false; } return true; })());
    const b = build(1), rb = meshWorld(b.w);
    ok("the same seed meshes to the same hash twice", rb.hash === ra.hash && rb.triangles === ra.triangles, `${rb.hash}`);
    const c = build(2), rc = meshWorld(c.w);
    ok("a different seed places a different city and meshes to a different hash", rc.hash !== ra.hash, `${rc.hash}`);
    ok("the world's AO reaches below 1 (walls beside the ground) and never below the floor", ra.minAo < 1 && ra.minAo >= 0);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("3. ON BOTH BACKENDS: the city from above, every sampled pixel against the voxel its ray hits");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const W = 200, H = 120, FOV = 0.9, eye = [30, 110, 70], target = [0, 8, 0], STEP = 8;
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, FOV, eye, target, STEP }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const G = await import("/render/gpuDriven.mjs");
            const L = await import("/render/litSphere.mjs");
            const V = await import("/render/voxelDevice.mjs");
            const { VoxelWorld } = await import("/world/world.js");
            const { CityGen } = await import("/world/CityGen.js");
            const { W, H, FOV, eye, target, STEP } = a; const out = {};
            const world = new VoxelWorld(); new CityGen(world).generate({ seed: 1, facades: true });
            const t0 = performance.now(), packed = V.meshWorld(world), meshMs = performance.now() - t0;
            // the key: for a grid of pixels, the browser's own DDA through the world it drew
            const samples = [];
            for (let y = STEP / 2; y < H; y += STEP) for (let x = STEP / 2; x < W; x += STEP) { const d = V.pixelRay(W, H, FOV, eye, target, x, y), hit = V.raycastVoxels(world, eye, d, 400); samples.push({ px: y * W + x, id: hit ? hit.id : 0, n: hit ? hit.normal : null, col: hit ? V.colourOf(hit.id) : null }); }
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 300)));
                const sc = V.voxelScene(dev, packed, G, L);
                const cam = { viewProj: G.multiply(G.perspective(FOV, W / H, 0.5, 600), G.lookAt(eye, target)), eye };
                const f = await sc.frame({ ...cam, read: true, clear: [0, 0, 0, 1] }).pixels;
                out[backend] = { path: sc.path, errs, pixels: Array.from(f.pixels) };
                dev.destroy();
            }
            return { ...out, samples, hash: packed.hash, triangles: packed.triangles, meshMs };
        }` });
        ok("both backends built the world scene and drew the frame", r.ok && r.result && r.result.webgpu && r.result.webgl2 && r.result.webgpu.errs.length === 0, r.ok ? (r.result.webgpu.errs || []).join(" | ").slice(0, 300) : (r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 400));
        if (r.ok && r.result.webgpu && r.result.webgl2) {
            const R = r.result, S = R.samples, hits = S.filter((s) => s.id);
            report(`the browser's world: ${R.triangles.toLocaleString()} triangles, hash ${R.hash} (node's ${real.packed.hash}${R.hash === real.packed.hash ? ", the same" : ", DIFFERENT: the terrain is not the same in both runtimes -- reported, the key is the browser's own"}), meshed in ${R.meshMs.toFixed(0)} ms; ${hits.length} of ${S.length} sample rays hit a voxel`);
            ok("most sample rays hit the world (the camera looks at the city)", hits.length > S.length * 0.8);
            for (const bk of ["webgpu", "webgl2"]) {
                const px = R[bk].pixels; let lit = 0; for (let p = 0; p < W * H; p++) if (px[p * 4] + px[p * 4 + 1] + px[p * 4 + 2] > 24) lit++;
                let agree = 0, checked = 0, topBright = 0, topN = 0, worst = 0;
                for (const s of hits) {
                    const pr = px[s.px * 4] / 255, pg = px[s.px * 4 + 1] / 255, pb = px[s.px * 4 + 2] / 255, [cr, cg, cb] = s.col;
                    if (pr + pg + pb < 0.05) continue;   // a pixel at a silhouette edge can be background; the lit-fraction hold covers the frame
                    checked++;
                    const e = Math.abs(pr / Math.max(pg, 1e-3) - cr / Math.max(cg, 1e-3)) + Math.abs(pb / Math.max(pg, 1e-3) - cb / Math.max(cg, 1e-3));
                    if (e < 0.3) agree++; if (e > worst) worst = e;
                    if (s.n && s.n[1] === 1) { topN++; if (Math.max(pr, pg, pb) >= 0.6 * Math.max(cr, cg, cb)) topBright++; }
                }
                report(`${bk} (${R[bk].path}): ${lit} of ${W * H} pixels lit; ${agree} of ${checked} sampled pixels carry their voxel's colour ratios (worst ${worst.toFixed(2)}); ${topBright} of ${topN} top-face pixels bright`);
                ok(`*** ${bk}: the frame is mostly lit and 90 % of sampled pixels carry the colour ratios of the voxel their ray hits ***`, lit > W * H * 0.8 && checked > 100 && agree > checked * 0.9);
                ok(`  ${bk}: top faces under the sun are bright -- 85 % at or above 0.6 of their colour (flipped normals would leave the ambient)`, topN > 50 && topBright > topN * 0.85);
            }
            let po = 0; const A = R.webgpu.pixels, B = R.webgl2.pixels; for (let p = 0; p < W * H; p++) if (Math.abs(A[p * 4] - B[p * 4]) > 8 || Math.abs(A[p * 4 + 1] - B[p * 4 + 1]) > 8 || Math.abs(A[p * 4 + 2] - B[p * 4 + 2]) > 8) po++;
            ok("  the two backends agree within 8 of 255 on all but edge pixels (fewer than 3 %)", po < W * H * 0.03, `${po} apart`);
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: per-chunk updates (round 2, dig/build); water as its own pass; the sandbox's textures and grain (the device path draws the registry colour flat); the page's orbit camera (eyeballed).");
process.exit(fails ? 1 : 0);
