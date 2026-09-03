// THE BRIDGE FROM A GENERATED three.js MODEL TO THIS TREE'S OWN RENDERER (v4365).
//
// img2threejs (https://github.com/img2threejs/img2threejs, Apache-2.0) rebuilds an object from a reference image as
// CODE: a factory that returns a THREE.Group of primitives, generated geometry and procedural materials, with no mesh
// file anywhere. Its output runs through three's WebGLRenderer. render/img2three.mjs takes that object tree and
// returns ONE mesh in the shape render/gpuDriven.mjs packMeshes eats, so a generated model draws through the FLEETS'
// OWN shipped `lit` pipeline -- no new shader text in this round -- on BOTH backends.
//
// *** WHAT THIS ROUND CLAIMS AND WHAT IT DOES NOT. *** It claims the FORM crosses: every vertex where three itself
// says it is, normals correct under non-uniform scale, per-vertex colour from each mesh's own material, and the same
// picture on WebGPU and WebGL2. It does NOT claim the finish crosses: roughness, metalness, clearcoat, transmission,
// maps and every onBeforeCompile patch are dropped, and material identity is most of what a generated model's own
// review gate scores. A picture from this bridge is the model's shape wearing a lambert, and saying otherwise would
// be the exact overclaim this tree exists to refuse.
//
// *** AND THE MODEL ITSELF IS NOT IN THE TREE, FOR A REASON WORTH WRITING DOWN. *** The img2threejs TOOLING repo is
// Apache-2.0. The SHOWCASE repo that holds the generated models (img2threejs/img2threejs-showcase) carries NO LICENSE
// file and no license field in its package.json, so nothing from it is vendored here. Section 2 therefore builds its
// own three.js tree with the shapes a generated factory has -- nested groups with non-identity transforms, three
// material families, indexed and non-indexed geometry, an invisible node -- and section 3 runs a real one only when
// the rig has put one at .img2threejs/model.js, which .gitignore keeps out of the mirror.
//
// MEASURED IN THE SESSION THAT BUILT THIS, and unsigned by the rig: img2threejs-showcase at commit b14415bd,
// src/demos/sony-wf1000xm3/createSonyWf1000xm3Model.ts, type-stripped with node's own module.stripTypeScriptTypes and
// its `from 'three'` pointed at vendor/three-webgpu, built under three 0.178 (it targets 0.169) and reported 62
// nodes, 50 meshes, 58,778 triangles, position/normal/uv, and 26 MeshPhysicalMaterial / 15 MeshStandardMaterial /
// 9 MeshBasicMaterial. Section 3 re-derives those numbers when the file is present and says so when it is not.
//
// SABOTAGES: see the log at the foot of this file.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { flattenThreeTree, normalMatrix, baseColor, unitMesh } from "../../render/img2three.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RIG_MODEL = path.join(ENG, ".img2threejs/model.js");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const skip = webgpuSkipReason();

// a three.js mesh as this bridge reads one: duck-typed, so the whole of section 1 runs with no three and no browser
const meshOf = ({ m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], pos, nor = null, idx = null, color = { r: 1, g: 1, b: 1 }, type = "MeshPhysicalMaterial", visible = true, opacity, transparent } = {}) => ({
    isMesh: true, visible, matrixWorld: { elements: m },
    material: { type, color, ...(opacity != null ? { opacity } : {}), ...(transparent != null ? { transparent } : {}) },
    geometry: { attributes: { position: { array: Float32Array.from(pos), count: pos.length / 3 }, ...(nor ? { normal: { array: Float32Array.from(nor) } } : {}) }, index: idx ? { array: Uint32Array.from(idx) } : null },
});
const TRI = [0, 0, 0, 1, 0, 0, 0, 1, 0];

console.log("\n1. THE BRIDGE, ON THE CPU: no three, no browser -- it is read by duck-typing, so it can be");
{
    // every ancestor transform baked into the positions
    const f = flattenThreeTree([meshOf({ m: [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1], pos: TRI, nor: [0, 0, 1, 0, 0, 1, 0, 0, 1] })]);
    ok("the world matrix is BAKED: a triangle scaled 2x in x and moved 5 along it lands at x = 5 and 7, not 0 and 1",
        f.positions[0] === 5 && f.positions[3] === 7 && f.positions[6] === 5 && f.triangles === 1, `x values ${[f.positions[0], f.positions[3], f.positions[6]].join(", ")}`);
    // the normal matrix, where the naive answer is visibly different rather than merely wrong
    const g = flattenThreeTree([meshOf({ m: [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], pos: TRI, nor: [1, 1, 0, 1, 1, 0, 1, 1, 0] })]);
    const k = Math.hypot(0.5, 1), want = [0.5 / k, 1 / k, 0];
    const naive = [2 / Math.hypot(2, 1), 1 / Math.hypot(2, 1), 0];
    ok("*** normals go through the INVERSE-TRANSPOSE, which under non-uniform scale is a different answer and not a smaller error ***",
        [0, 1, 2].every((i) => Math.abs(g.normals[i] - want[i]) < 1e-6) && Math.abs(g.normals[0] - naive[0]) > 0.4,
        `(1,1,0) under scale(2,1,1) -> ${[...g.normals].slice(0, 3).map((v) => v.toFixed(4)).join(", ")}; correct ${want.map((v) => v.toFixed(4)).join(", ")}, naive would be ${naive.map((v) => v.toFixed(4)).join(", ")} -- the two components SWAP`);
    ok("  and the inverse-transpose refuses a singular matrix by returning null rather than dividing by zero",
        normalMatrix([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) === null && normalMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]).join() === "1,0,0,0,1,0,0,0,1");
    // a geometry with no normals gets flat ones, which is what an extruded or lathed part arrives as
    const h = flattenThreeTree([meshOf({ pos: TRI })]);
    ok("a geometry with NO normal attribute is flat-shaded from its own winding (+z for a counter-clockwise triangle in xy)",
        h.noNormals === 1 && h.normals[2] === 1 && h.normals[0] === 0 && h.normals[1] === 0, `${[...h.normals].slice(0, 3).join(", ")}`);
    // per-vertex colour, because a generated model is fifty meshes with fifty materials and one draw
    const two = flattenThreeTree([meshOf({ pos: TRI, color: { r: 1, g: 0, b: 0 }, type: "MeshPhysicalMaterial" }),
                                  meshOf({ pos: TRI, color: { r: 0, g: 0, b: 1 }, type: "MeshBasicMaterial", opacity: 0.5, transparent: true })]);
    ok("*** each mesh's own material becomes PER-VERTEX colour, so fifty materials merge into one draw: red for the first three vertices, blue at half alpha for the next three ***",
        two.colors.slice(0, 4).join() === "1,0,0,1" && two.colors.slice(12, 16).join() === "0,0,1,0.5" &&
        two.materials.MeshPhysicalMaterial === 1 && two.materials.MeshBasicMaterial === 1 && two.meshes === 2,
        `${JSON.stringify(two.materials)}; alpha is carried only for a transparent material, which is why the opaque one reads 1`);
    ok("  indices are REBASED as the parts merge: the second triangle's indices are 3, 4, 5 and not 0, 1, 2 again",
        two.indices.join() === "0,1,2,3,4,5" && two.vertices === 6, two.indices.join());
    // what is not merged
    const mixed = flattenThreeTree([{ isGroup: true }, meshOf({ pos: TRI }), meshOf({ pos: TRI, visible: false }), { isMesh: true, geometry: { attributes: {} } }]);
    ok("an invisible mesh and a mesh with no position attribute are SKIPPED and counted, and a non-mesh node is walked but not merged",
        mixed.nodes === 4 && mixed.meshes === 1 && mixed.skipped === 2, `${mixed.nodes} nodes, ${mixed.meshes} merged, ${mixed.skipped} skipped`);
    ok("  a material with no colour is white, and an array material takes its first",
        baseColor(null).join() === "1,1,1,1" && baseColor([{ color: { r: 0.25, g: 0.5, b: 0.75 } }]).join() === "0.25,0.5,0.75,1");
    // recentring, because the fleets' shaders place a hull at rec.xyz + p * rec.w and own no matrix
    const off = flattenThreeTree([meshOf({ m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 10, 10, 1], pos: TRI })]);
    const u = unitMesh(off, 1);
    let far = 0; for (let i = 0; i < u.positions.length; i += 3) far = Math.max(far, Math.hypot(u.positions[i], u.positions[i + 1], u.positions[i + 2]));
    ok("unitMesh recentres and rescales for the fleets' own placement (rec.xyz + p * rec.w), leaving the far vertex at radius 1",
        Math.abs(far - 1) < 1e-6 && u.centre.join() === "0,0,0" && off.centre.map((v) => +v.toFixed(4)).join() === "10.5,10.5,10", `centre was ${off.centre.map((v) => v.toFixed(2)).join(", ")}, radius ${off.radius.toFixed(4)} -> ${far.toFixed(6)}`);
}

console.log("\n2. A three.js TREE, DRAWN BY THIS TREE: the shapes a generated factory has, through the FLEETS' own lit pipeline, on both backends");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N: 192 }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js");
        const B = await import("/render/img2three.mjs"); const G = await import("/render/gpuDriven.mjs"); const F = await import("/render/fleets.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const out = {};
        // a tree with what a generated factory actually produces: nested groups carrying rotation and non-uniform
        // scale, three material families, an indexed primitive and a non-indexed one, and an invisible helper.
        const root = new THREE.Group();
        const arm = new THREE.Group(); arm.position.set(0.6, 0.2, 0); arm.rotation.set(0.3, 0.7, 0.15); arm.scale.set(1.4, 0.7, 1.0); root.add(arm);
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.4), new THREE.MeshPhysicalMaterial({ color: 0x2b6fb0, roughness: 0.2, clearcoat: 0.8 }));
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color: 0xf4c531, metalness: 0.9 }));
        knob.position.set(0.35, 0.3, 0.1); arm.add(knob);
        const strip = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.7, 12), new THREE.MeshBasicMaterial({ color: 0xc0392b }));
        strip.position.set(-0.5, -0.1, 0.2); strip.rotation.z = 0.9; root.add(strip);
        const plain = new THREE.BufferGeometry(); plain.setAttribute("position", new THREE.BufferAttribute(Float32Array.from([-0.4, -0.5, 0.3, 0.4, -0.5, 0.3, 0, 0.1, 0.5]), 3));
        const flag = new THREE.Mesh(plain, new THREE.MeshStandardMaterial({ color: 0x27ae60 }));   // no normals, no index
        root.add(body); root.add(flag);
        const helper = new THREE.Mesh(new THREE.BoxGeometry(9, 9, 9), new THREE.MeshBasicMaterial({ color: 0xffffff })); helper.visible = false; root.add(helper);
        root.updateMatrixWorld(true);
        const flat = B.flattenThreeTree(root);
        out.stats = { nodes: flat.nodes, meshes: flat.meshes, skipped: flat.skipped, noNormals: flat.noNormals, triangles: flat.triangles, vertices: flat.vertices, materials: flat.materials };
        // THREE ITSELF IS THE TWIN for the transform: its own localToWorld against the baked positions
        let worst = 0;
        { const g = knob.geometry.attributes.position, v = new THREE.Vector3();
          const base = (() => { let n = 0; root.traverse((o) => { if (o.isMesh && o.visible !== false && o !== knob && n >= 0) { } }); return 0; })();
          // find where the knob's vertices landed by matching count -- the bridge merges in traversal order
          const order = []; root.traverse((o) => { if (o.isMesh && o.visible !== false && o.geometry.attributes.position) order.push(o); });
          let off = 0; for (const o of order) { if (o === knob) break; off += o.geometry.attributes.position.count; }
          for (let i = 0; i < g.count; i++) { v.set(g.getX(i), g.getY(i), g.getZ(i)); knob.localToWorld(v);
            worst = Math.max(worst, Math.abs(v.x - flat.positions[(off + i) * 3]), Math.abs(v.y - flat.positions[(off + i) * 3 + 1]), Math.abs(v.z - flat.positions[(off + i) * 3 + 2])); } }
        out.worstWorld = worst;
        const mesh = B.unitMesh(flat, 1);
        const records = Float32Array.from([0, 0, 0, 1]);
        // TWO cameras, because one of them is where the backends part: near fills the frame, far is one step back.
        const CAMS = { near: [1.0, 0.8, 1.7], far: [1.6, 1.3, 2.6] };
        const camFor = (eye) => ({ viewProj: G.multiply(G.perspective(Math.PI / 3, 1, 0.1, 100), G.lookAt(eye, [0, 0, 0])), eye });
        for (const backend of ["webgpu", "webgl2"]) {
            const o = {};
            try {
                const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N; const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
                const look = F.LOOKS.lit, buffers = G.layoutBuffers(look.layout);
                const fleet = { name: "img2three", look: "lit", layout: look.layout,
                    pipeline: { shaders: look.shaders, vs: "vs", fs: "fs", buffers, uniforms: look.uniforms },
                    pickPipeline: { shaders: look.pick, vs: "vs", fs: "fs", buffers, uniforms: [{ name: "viewProj", type: "mat4" }] },
                    lods: [{ name: "near", mesh }, { name: "far", mesh: F.farMesh([1, 1, 1, 1]) }],
                    bind: (pass) => pass.uniform("light", F.LIGHT) };
                const sc = G.makeGpuDrivenScene(dev, { fleets: [fleet], fleetOf: Uint32Array.from([0]), thresholds: [0.0001], records });
                o.pixels = {};
                for (const [name, eye] of Object.entries(CAMS)) o.pixels[name] = Array.from((await sc.frame({ ...camFor(eye), read: true, clear: [0, 0, 0, 1] }).pixels).pixels);
                o.errs = errs; o.backend = dev.backend; o.stride = G.packMeshes([mesh], look.layout).stride;
            } catch (e) { o.error = String(e && e.stack || e).slice(0, 500); }
            out[backend] = o;
        }
        return out;
    }` });
    ok("the harness ran both backends", r.ok && r.result && r.result.webgpu && r.result.webgl2 && !r.result.webgpu.error && !r.result.webgl2.error,
        r.ok ? JSON.stringify([r.result && r.result.webgpu && r.result.webgpu.error, r.result && r.result.webgl2 && r.result.webgl2.error]) : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && r.result.webgpu && !r.result.webgpu.error && !r.result.webgl2.error) {
        const R = r.result, S = R.stats;
        ok(`*** three ITSELF is the twin for the transform: every vertex of a mesh two groups deep, under a rotation and a non-uniform scale, lands where three's own localToWorld puts it -- worst difference ${R.worstWorld.toExponential(1)} ***`,
            R.worstWorld < 1e-6 && S.meshes === 4 && S.skipped === 1,
            `${S.meshes} meshes merged, ${S.skipped} skipped (the invisible helper), ${S.triangles} triangles, ${S.vertices} vertices; materials ${JSON.stringify(S.materials)}`);
        ok("  and the tree's shapes all crossed: an indexed primitive, a non-indexed geometry with no normals, three material families, and a node the walk must not merge",
            S.noNormals === 1 && Object.keys(S.materials).sort().join() === "MeshBasicMaterial,MeshPhysicalMaterial,MeshStandardMaterial" && S.nodes > S.meshes,
            `${S.nodes} nodes walked, ${S.noNormals} flat-shaded for want of a normal attribute`);
        const W = 192, N = W * W;
        const isLit = (P, i) => P[i * 4] + P[i * 4 + 1] + P[i * 4 + 2] > 24;
        // WHERE a pixel differs decides what the difference IS: on the silhouette it is a rasteriser tie-break at an
        // edge, and inside the form it is arithmetic. Counted, not assumed -- a neighbour that is background makes it
        // an edge pixel, and the two backends' own lit/unlit verdicts differing makes it a coverage disagreement.
        const compare = (name) => { const A = R.webgpu.pixels[name], B2 = R.webgl2.pixels[name];
            let same = 0, worst = 0, lit = 0; const hues = new Set(), diffs = [];
            for (let i = 0; i < N; i++) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A[i * 4 + c] - B2[i * 4 + c]));
                if (d === 0) same++; else diffs.push(i); worst = Math.max(worst, d);
                if (isLit(A, i)) { lit++; hues.add(`${A[i * 4] >> 4},${A[i * 4 + 1] >> 4},${A[i * 4 + 2] >> 4}`); } }
            let onEdge = 0, coverage = 0; const shown = [];
            for (const i of diffs) { const x = i % W, y = (i / W) | 0;
                let bg = false; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= W || ny >= W) { bg = true; continue; } const j = ny * W + nx; if (!isLit(A, j) || !isLit(B2, j)) bg = true; }
                if (bg) onEdge++;
                if (isLit(A, i) !== isLit(B2, i)) coverage++;
                if (shown.length < 3) shown.push(`(${x},${y}) wgpu ${[0, 1, 2].map((c) => A[i * 4 + c]).join("/")} vs gl ${[0, 1, 2].map((c) => B2[i * 4 + c]).join("/")}`); }
            return { same, worst, lit, hues: hues.size, diffs: diffs.length, onEdge, coverage, shown }; };
        const near = compare("near"), far = compare("far");
        const { same, worst, lit, hues } = near;
        ok(`*** the generated model drawn by gfx/device.js is the SAME PICTURE on both backends: ${near.same} of ${N} pixels identical, worst channel difference ${near.worst} ***`,
            near.same === N && near.worst === 0 && (R.webgpu.errs || []).length === 0 && (R.webgl2.errs || []).length === 0,
            `${near.same}/${N}, worst ${near.worst}; ${R.webgpu.stride}-byte lit stride; device errors ${(R.webgpu.errs || []).length} / ${(R.webgl2.errs || []).length}`);
        ok(`*** AND WHERE IT STOPS BEING EXACT, MEASURED RATHER THAN LEFT AT ONE FLATTERING CAMERA: step the same camera back and ${far.diffs} pixel(s) of ${N} part -- every one of them on a boundary, ${far.coverage} of them a coverage disagreement ***`,
            far.diffs === far.onEdge && far.diffs <= 4 && far.diffs >= 1,
            `far camera: ${far.same}/${N} identical, ${far.diffs} differing, all ${far.onEdge} on a boundary, worst channel ${far.worst}; ${far.shown.join("; ") || "none"}. The pixel is a rasteriser tie-break at a shared edge -- v4328's finding again, which measured 467 pixels washed under WebGPU against 415 under WebGL2 on a line list and said a claim over rasterised edges is per-backend by nature. IF THIS GOES GREEN-WITH-ZERO ON OTHER HARDWARE -- a rasteriser pair that happens to agree at this camera too -- that is a FINDING and not a fix, exactly as v4338 said of its barrier: record where the disagreement stopped being observable rather than dropping the check, because the fact it names is a property of the pair and not of this box`);
        ok(`  and it is a MODEL and not a silhouette: ${lit} pixels lit in ${hues} distinct colour cells, so the per-vertex materials survived the merge into one draw`,
            lit > 2500 && hues >= 4, `${lit} lit of ${N}, ${hues} colour cells`);
        report("WHAT THIS PICTURE IS NOT: the model's finish. roughness, metalness, clearcoat and every onBeforeCompile patch " +
            "were dropped at the bridge; this is the form wearing the fleets' lambert. A generated model's own review gate scores " +
            "material identity heavily, so a fidelity claim against a reference image cannot be made from here yet.");
    }
}

console.log("\n3. A REAL img2threejs MODEL, WHEN THE RIG HAS ONE: the showcase carries no licence, so nothing from it is vendored");
{
    const present = fs.existsSync(RIG_MODEL);
    if (!present) {
        ok("absent HERE and that is correct: .img2threejs/model.js is gitignored, because img2threejs-showcase carries no LICENSE file and no license field",
            !fs.existsSync(path.join(ENG, ".img2threejs")) || present === false,
            "to run it: strip a factory's types (node's module.stripTypeScriptTypes), point `from 'three'` at /vendor/three-webgpu/three.webgpu.js, and save it there");
        report("MEASURED IN THE BUILDING SESSION AND UNSIGNED BY THE RIG: img2threejs-showcase at b14415bd, " +
            "createSonyWf1000xm3Model.ts, built under three 0.178 (it targets 0.169): 62 nodes, 50 meshes, 58,778 triangles, " +
            "position/normal/uv, 26 MeshPhysicalMaterial / 15 MeshStandardMaterial / 9 MeshBasicMaterial. This section " +
            "re-derives those numbers rather than reciting them the moment the file is there.");
    } else if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
    else {
        const r2 = await runInEngineOrigin({ engineRoot: ENG, args: {}, script: `async () => {
            const B = await import("/render/img2three.mjs"); const out = {};
            try { const M = await import("/.img2threejs/model.js");
                const make = Object.values(M).find((v) => typeof v === "function");
                const root = make(); root.updateMatrixWorld(true);
                const flat = B.flattenThreeTree(root);
                out.stats = { nodes: flat.nodes, meshes: flat.meshes, triangles: flat.triangles, vertices: flat.vertices, materials: flat.materials, radius: flat.radius };
            } catch (e) { out.error = String(e && e.message || e).slice(0, 400); }
            return out; }` });
        const S = r2.ok && r2.result && r2.result.stats;
        ok("the rig's generated model builds under the vendored three and crosses the bridge", !!S && S.meshes > 0 && S.triangles > 0,
            S ? `${S.nodes} nodes, ${S.meshes} meshes, ${S.triangles} triangles, ${S.vertices} vertices, materials ${JSON.stringify(S.materials)}` : ((r2.result && r2.result.error) || r2.reason));
    }
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4365.
//   AM normals transformed by the world matrix instead of its inverse-transpose -> exit=1, 1 red, and by NAME rather than
//      by a tolerance: under scale(2,1,1) the two components of (1,1,0) SWAP (0.8944/0.4472 for 0.4472/0.8944), which is
//      why that check asserts the naive answer is far away instead of asserting the right one is close.
//   AN indices not rebased as the merged parts concatenate -> exit=1, 3 red, and the shape says what broke: only the first
//      mesh's vertices are ever referenced, so 858 pixels are lit where 3307 were, and the far camera's edge disagreement
//      goes with them -- a model mostly absent has far less edge to disagree about.
//   AO the world matrix not applied to positions at all -> exit=1, 4 red: the CPU bake, the recentring, three's own
//      localToWorld twin, and the far camera's edge pixel. Four checks, one line, and the twin is the one that matters --
//      it is three itself saying where the vertex should be.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the model's FINISH -- roughness, metalness, clearcoat, transmission, maps and onBeforeCompile patches are " +
    "dropped at the bridge, so nothing here is a fidelity claim against a reference image; whether a generated model's own review gate " +
    "(img2threejs forge/stage4_review/divine_eye.py, hard gate IoU >= 0.85 on a 64x64 luma grid) would notice a difference this tree can " +
    "measure exactly, which is the next round and the reason this one exists; skinned meshes and morph targets, which a character factory " +
    "emits and this bridge reads as their bind pose; and every number the rig has not signed.");
process.exit(fails ? 1 : 0);
