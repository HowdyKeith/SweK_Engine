#!/usr/bin/env node
// WebGLEngine/tools/ship/threeUpstreamPaths-selfcheck.mjs -- v4773
//
// THE PATCHES ON THE PATHS THEIR DRAFTS' REPRODUCTIONS DO NOT TAKE. tools/ship/threeUpstream-selfcheck.mjs (v4771) runs each
// draft's reproduction on r185's build with the draft's patch; each reproduction takes one path through the code its patch
// touches. Here each patch meets the others, on r185's build and on the patched one, both backends, one browser frame a step
// and velocity read through MRT (drawn by the material for 04's):
//   01  an InstancedMesh whose matrices are a StorageInstancedBufferAttribute -- written on the CPU, and written by a compute pass
//   02  a BatchedMesh grown by setInstanceCount, which re-makes its matrices texture -- its material updated after, as three
//       needs to draw a grown batch at all (three keeps drawing it from the old texture otherwise)
//   03  three relative morph targets moving a mesh in x and y; the same as absolute targets; and per-instance morphs
//   04  the velocity node drawn by the material's colorNode, not its fragmentNode
// Each draft's "paths" block states what these print, character for character, and says which paths the patch does not reach.
// *** NOTHING HERE POSTS ANYTHING. ***
"use strict";
import fs from "node:fs";
import path from "node:path";
// rig run 12 (option a): the two-backend launch takes PARITY_ARGS, so on Windows both backends run on the GPU
// (tools/ship/webgpuHarness.mjs); this gate holds no row to a model of SwiftShader's rasterisation
import { runInEngineOrigin, webgpuSkipReason, PARITY_ARGS } from "./webgpuHarness.mjs";
import { ENG, BUNDLE, apply, patchTexts, rootWithBuilds } from "./threePatch.mjs";

const DIR = path.join(ENG, "docs", "upstream-three");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const CASES = [["storageCPU", "01"], ["storageGPU", "01"], ["grown", "02"], ["multi", "03"], ["absolute", "03"], ["perInstance", "03"], ["colorNode", "04"]];
const DRAFT = { "01": "01-velocity-instancedmesh.md", "02": "02-velocity-batchedmesh.md", "03": "03-velocity-morph.md", "04": "04-velocity-outside-mrt.md" };

console.log("\n1. THE PATCHED BUILDS: each draft's patch alone on r185's build, every hunk found once");
const bundle = fs.readFileSync(BUNDLE, "utf8"), texts = patchTexts(), builds = {};
for (const slot of Object.keys(DRAFT)) {
    const a = apply(texts[slot] || "", bundle); builds[slot] = a.text;
    ok(`  patch ${slot}: ${a.found.length} hunk(s), each found exactly once in r185's build: [${a.found.join(", ")}]`, a.found.length > 0 && a.found.every((n) => n === 1) && a.text !== bundle);
}

console.log("\n2. ON THE DEVICE: the paths, on r185's build and on the patched one, both backends");
const skip = webgpuSkipReason();
let res = null;
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** The paths' numbers are the device's."); fails++; }
else {
    const { root, dispose } = rootWithBuilds(builds);
    try {
        const r = await runInEngineOrigin({ launchArgs: PARITY_ARGS, engineRoot: root, timeoutMs: 600000, args: { CASES }, script: `async (a) => {
  const out = {};
  for (const [name, slot] of a.CASES) for (const [build, dir] of [["r185", "/vendor/three-webgpu"], ["patched", "/three-patched/" + slot]]) {
    const THREE = await import(dir + "/three.webgpu.js"), T = await import(dir + "/three.tsl.js"), frame = () => new Promise((q) => requestAnimationFrame(q));
    const res = {};
    for (const forceWebGL of [false, true]) { try {
      const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
      const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, forceWebGL }); await renderer.init();
      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50); camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
      const D = 64, target = new THREE.RenderTarget(D, D, { type: THREE.FloatType, count: 2 }); target.textures[0].name = "output"; target.textures[1].name = "velocity";
      const drawn = name === "colorNode", single = new THREE.RenderTarget(D, D, { type: THREE.FloatType });
      renderer.setMRT(drawn ? null : T.mrt({ output: T.output, velocity: T.velocity }));
      const material = () => { const m = new THREE.MeshBasicNodeMaterial(); m.blending = THREE.NoBlending; if (drawn) m.colorNode = T.vec3(T.velocity, 0.0); return m; };
      // velocity's mean over the pixels drawn, x and y, in pixels, after n frames -- one render per browser frame; null where none is drawn
      const velocityOf = async (scene, step, n = 3) => {
        const tg = drawn ? single : target;
        for (let k = 0; k < n; k++) { await frame(); await step(k); renderer.setRenderTarget(tg); await renderer.renderAsync(scene, camera); }
        const c = await renderer.readRenderTargetPixelsAsync(tg, 0, 0, D, D, 0), v = drawn ? c : await renderer.readRenderTargetPixelsAsync(tg, 0, 0, D, D, 1); let m = 0, x = 0, y = 0;
        for (let i = 0; i < D * D; i++) if (c[i * 4 + 3] > 0.5) { m++; x += v[i * 4] * D / 2; y += v[i * 4 + 1] * D / 2; }
        return m ? [+(x / m).toFixed(3), +(y / m).toFixed(3)] : null;
      };
      const box = () => new THREE.BoxGeometry(0.6, 0.6, 0.6), M = new THREE.Matrix4(), o = {};
      // the reference: a plain mesh where the case's mesh is, making the same motion -- 0.3 a frame in x, and 0.2 in y where the
      // case moves in y (a box's side faces show at other depths off the axis, so where it is matters to the mean, not only how far)
      const plainMesh = new THREE.Mesh(box(), material()), ps = new THREE.Scene(); ps.add(plainMesh);
      const xy = (name === "multi" || name === "absolute") ? (k) => [0.2 + 0.3 * k, 0.1 + 0.2 * k] : (k) => [-0.5 + 0.3 * k, 0];
      o.plain = await velocityOf(ps, (k) => { plainMesh.position.set(...xy(k), 0); plainMesh.updateMatrixWorld(); });
      const sc = new THREE.Scene();
      if (name === "colorNode") {
        const g = box(), n = g.attributes.position.count;
        g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0), 4));
        g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(Array.from({ length: n * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)), 4));
        const bone = new THREE.Bone(), mesh = new THREE.SkinnedMesh(g, material()); sc.add(bone); sc.add(mesh); mesh.bind(new THREE.Skeleton([bone]));
        o.it = await velocityOf(sc, (k) => { bone.position.x = -0.5 + 0.3 * k; bone.updateMatrixWorld(true); });
      } else if (name === "storageCPU") {
        const mesh = new THREE.InstancedMesh(box(), material(), 1); mesh.instanceMatrix = new THREE.StorageInstancedBufferAttribute(new Float32Array(16), 16); sc.add(mesh);
        o.it = await velocityOf(sc, (k) => { mesh.setMatrixAt(0, M.makeTranslation(-0.5 + 0.3 * k, 0, 0)); mesh.instanceMatrix.needsUpdate = true; });
      } else if (name === "storageGPU") {
        const mats = new THREE.StorageInstancedBufferAttribute(new Float32Array(16), 16), mesh = new THREE.InstancedMesh(box(), material(), 1); mesh.instanceMatrix = mats; sc.add(mesh);
        const xU = T.uniform(0), node = T.storage(mats, "mat4", 1), write = T.Fn(() => { node.element(0).assign(T.mat4(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, xU, 0, 0, 1)); })().compute(1);
        o.it = await velocityOf(sc, async (k) => { xU.value = -0.5 + 0.3 * k; await renderer.computeAsync(write); });
      } else if (name === "grown") {
        // one instance moving; the batch grows -- re-making its matrices texture -- before the third frame, its material updated
        const run = async (n) => { const bm = new THREE.BatchedMesh(1, 100, 300, material()), id = bm.addInstance(bm.addGeometry(box())); bm.frustumCulled = false; bm.perObjectFrustumCulled = false;
          const s2 = new THREE.Scene(); s2.add(bm);
          return velocityOf(s2, (k) => { if (k === 2) { bm.setInstanceCount(64); bm.material.needsUpdate = true; } bm.setMatrixAt(id, M.makeTranslation(-0.5 + 0.3 * k, 0, 0)); }, n); };
        o.atGrowth = await run(3); o.after = await run(4);
      } else if (name === "multi" || name === "absolute") {
        const g = box(), n = g.attributes.position.count, rel = name === "multi", tx = new Float32Array(n * 3), ty = new Float32Array(n * 3), tz = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { const b = rel ? [0, 0, 0] : [g.attributes.position.getX(i), g.attributes.position.getY(i), g.attributes.position.getZ(i)];
          tx.set([b[0] + 1, b[1], b[2]], i * 3); ty.set([b[0], b[1] + 1, b[2]], i * 3); tz.set([b[0], b[1], b[2] + 1], i * 3); }
        g.morphAttributes.position = [tx, ty, tz].map((d) => new THREE.Float32BufferAttribute(d, 3)); g.morphTargetsRelative = rel;
        const mesh = new THREE.Mesh(g, material()); sc.add(mesh); mesh.morphTargetInfluences = [0, 0, 0];
        // influences that never sum to 0, so an absolute target's base weight (1 less their sum) is never 1
        o.it = await velocityOf(sc, (k) => { mesh.morphTargetInfluences[0] = 0.2 + 0.3 * k; mesh.morphTargetInfluences[1] = 0.1 + 0.2 * k; mesh.morphTargetInfluences[2] = 0; });
      } else if (name === "perInstance") {
        // three morphs per instance only where an InstancedMesh draws more than one: the second is scaled to nothing
        const g = box(), n = g.attributes.position.count, d = new Float32Array(n * 3); for (let i = 0; i < n; i++) d[i * 3] = 1;
        g.morphAttributes.position = [new THREE.Float32BufferAttribute(d, 3)]; g.morphTargetsRelative = true;
        const mesh = new THREE.InstancedMesh(g, material(), 2), dummy = new THREE.Mesh(g); dummy.morphTargetInfluences = [0]; sc.add(mesh); mesh.setMatrixAt(1, M.makeScale(0, 0, 0));
        o.it = await velocityOf(sc, (k) => { dummy.morphTargetInfluences[0] = -0.5 + 0.3 * k; mesh.setMorphAt(0, dummy); dummy.morphTargetInfluences[0] = 0; mesh.setMorphAt(1, dummy); mesh.morphTexture.needsUpdate = true; });
      }
      res[forceWebGL ? "webgl2" : "webgpu"] = o; renderer.dispose();
    } catch (e) { res[forceWebGL ? "webgl2" : "webgpu"] = { err: String(e && e.message || e).slice(0, 160) }; } }
    out[name + " " + build] = res;
  }
  return out; }` });
        res = r.ok ? r.result : null;
        if (!r.ok) ok("the page ran", false, r.reason || (r.pageErrors || []).join("; "));
    } finally { dispose(); }
}

if (res) {
    const px = (v) => v.toFixed(3), eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const at = (name, build, mode) => (res[`${name} ${build}`] || {})[mode] || {};
    // the same on both backends, and each case's own reference
    const both = (name, build, k) => eq(at(name, build, "webgpu")[k], at(name, build, "webgl2")[k]) ? at(name, build, "webgpu")[k] : undefined;
    const plainOf = (name) => both(name, "r185", "plain");
    const said = {};
    // 01
    {   const cpuR = at("storageCPU", "r185", "webgpu"), cpuP = at("storageCPU", "patched", "webgpu"), gpuR = at("storageGPU", "r185", "webgpu"), gpuP = at("storageGPU", "patched", "webgpu");
        const glCpu = [at("storageCPU", "r185", "webgl2"), at("storageCPU", "patched", "webgl2")], glGpu = [at("storageGPU", "r185", "webgl2"), at("storageGPU", "patched", "webgl2")];
        const ran = [cpuR, cpuP, gpuR, gpuP].every((o) => o.it && o.plain) && glCpu.every((o) => o.plain) && glGpu.every((o) => o.err);
        ok(`  01: every storage case ran -- drawn on WebGPU; on WebGL2 the CPU-written mesh drawn in neither build and the compute-written one throwing in both`,
            ran && glCpu.every((o) => o.it === null), JSON.stringify({ glCpu, glGpu }).slice(0, 300));
        if (ran) {
            ok(`*** 01, storage matrices written on the CPU: the patch reaches them -- r185 ${px(cpuR.it[0])}, patched ${px(cpuP.it[0])} px, the plain mesh ${px(cpuP.plain[0])} (WebGPU) ***`,
                eq(cpuP.it, cpuP.plain) && !eq(cpuR.it, cpuR.plain));
            ok(`  01, storage matrices written by a compute pass: NOT reached -- r185 ${px(gpuR.it[0])}, patched ${px(gpuP.it[0])} px, the plain mesh ${px(gpuP.plain[0])} (WebGPU)`,
                eq(gpuR.it, gpuP.it) && !eq(gpuP.it, gpuP.plain), "the patch copies the CPU array, and a compute pass writes the GPU's; the previous matrices would need a copy on the GPU before the pass");
            said["01"] = [`storage matrices written on the CPU: r185 ${px(cpuR.it[0])}, patched ${px(cpuP.it[0])} (px, WebGPU); WebGL2 draws the mesh in neither`,
                `storage matrices written by a compute pass: r185 ${px(gpuR.it[0])}, patched ${px(gpuP.it[0])} (px, WebGPU) -- not reached; WebGL2 throws in both`].join("\n");
        }
    }
    // 02
    {   const R = { at: both("grown", "r185", "atGrowth"), after: both("grown", "r185", "after") }, P = { at: both("grown", "patched", "atGrowth"), after: both("grown", "patched", "after") }, pl = plainOf("grown");
        const ran = [R.at, R.after, P.at, P.after, pl].every(Boolean);
        ok(`*** 02, a batch grown by setInstanceCount (its material updated): the patch keeps the last draw's matrices across the growth -- ${ran ? `patched ${px(P.at[0])} then ${px(P.after[0])} px, the plain mesh ${px(pl[0])}; r185 ${px(R.at[0])} then ${px(R.after[0])}` : "did not run alike on both backends"} ***`,
            ran && eq(P.at, pl) && eq(P.after, pl) && !eq(R.at, pl));
        if (ran) said["02"] = `a batch grown by setInstanceCount, its material then updated: r185 ${px(R.at[0])} then ${px(R.after[0])}, patched ${px(P.at[0])} then ${px(P.after[0])} (px, both backends)`;
    }
    // 03
    {   const lines = [];
        for (const [name, what] of [["multi", "three relative targets, moving it in x and y"], ["absolute", "the same as absolute targets"]]) {
            const R = both(name, "r185", "it"), P = both(name, "patched", "it"), pl = plainOf(name);
            const ran = [R, P, pl].every(Boolean);
            ok(`*** 03, ${what}: ${ran ? `patched ${px(P[0])}, ${px(P[1])} px, the plain mesh ${px(pl[0])}, ${px(pl[1])}; r185 ${px(R[0])}, ${px(R[1])}` : "did not run alike on both backends"} ***`,
                ran && eq(P, pl) && !eq(R, pl));
            if (ran) lines.push(`${what}: r185 ${px(R[0])}, ${px(R[1])}, patched ${px(P[0])}, ${px(P[1])} (px x, y, both backends)`);
        }
        const R = both("perInstance", "r185", "it"), P = both("perInstance", "patched", "it"), pl = plainOf("perInstance"), ran = [R, P, pl].every(Boolean);
        ok(`  03, per-instance morphs (an InstancedMesh's morphTexture): NOT reached -- ${ran ? `r185 ${px(R[0])}, patched ${px(P[0])} px, the plain mesh ${px(pl[0])}` : "did not run alike"}`,
            ran && eq(R, P) && !eq(P, pl), "the patch morphs positionPrevious only where a mesh has one set of influences");
        if (ran) lines.push(`per-instance morphs (an InstancedMesh's morphTexture): r185 ${px(R[0])}, patched ${px(P[0])} (px, both backends) -- not reached`);
        if (lines.length === 3) said["03"] = lines.join("\n");
    }
    // 04
    {   const R = both("colorNode", "r185", "it"), P = both("colorNode", "patched", "it"), pl = plainOf("colorNode"), ran = [R, P, pl].every(Boolean);
        ok(`*** 04, the velocity node drawn by the material's colorNode: ${ran ? `patched ${px(P[0])} px, the plain mesh ${px(pl[0])}; r185 ${px(R[0])}` : "did not run alike"} ***`,
            ran && eq(P, pl) && !eq(R, pl), "the patch looks through every node the material holds, not the fragmentNode alone");
        if (ran) said["04"] = `the velocity node drawn by the colorNode: r185 ${px(R[0])}, patched ${px(P[0])} (px, both backends)`;
    }

    console.log("\n3. THE DRAFTS: each one's paths block is what the paths print");
    const between = (s, a, b) => { const i = s.indexOf(a), j = s.indexOf(b, i + a.length); return i < 0 || j < 0 ? null : s.slice(i + a.length, j); };
    for (const [slot, f] of Object.entries(DRAFT)) {
        const text = fs.existsSync(path.join(DIR, f)) ? fs.readFileSync(path.join(DIR, f), "utf8") : "", block = between(text, "<!-- paths:begin -->\n", "\n<!-- paths:end -->");
        ok(`  ${f}: its paths block is what they print: "${(block || "").replace(/\n/g, " | ")}"`, !!said[slot] && block === said[slot], `printed: "${(said[slot] || "").replace(/\n/g, " | ")}"`);
    }
}

// ---- v4773 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against the patches (and tools/ship/threeUpstream-selfcheck.mjs, 0 on every one: its reproductions take none of these paths):
// S1 01's previous storage matrices not marked for upload -> 2; S2 02's copy not re-made when the batch grows -> 2; S3 02's last
// draw's matrices not kept across the growth -> 2; S4 03's absolute targets' base not weighed -> 2 -- and 0 until the influences
// were made never to sum to 0, where the base is 1 and its weight nothing; S5 03's previous influence of the first target only ->
// 3; S6 04 looking in the fragmentNode only -> 2. Against the gate: G1 the grown batch's material not updated -> 1 (three then
// draws it from the old texture); G2 the reference's y motion dropped -> 3; and D1 a paths number edited -> 1. None green.
// *** THE FIRST DRAFT OF 02'S GROWTH ROW PASSED FOR THE WRONG REASON. *** It grew the batch without updating its material, so three
// drew it from the old texture -- the current matrices frozen -- and the patch's copy, re-made in place at a new size, was never
// uploaded either: both frozen, one frame apart, read as the right 5.612. With the material updated the patch read 11.224; the
// copy is a new texture now, the last draw's matrices kept as its first entries.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a batch grown WITHOUT its material updated -- three itself draws it from the old texture then, and no " +
    "patch here changes that; many morph targets past the uniform buffer; the patches with each other -- each is run alone, " +
    "tools/ship/threeUpstream-selfcheck.mjs applies all six together as text only; and a real GPU.");
process.exitCode = fails ? 1 : 0;
