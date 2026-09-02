#!/usr/bin/env node
// WebGLEngine/tools/ship/fleets-selfcheck.mjs -- v4301 (Level 15)
//
// GRADES FLEETS IN THEIR OWN ARCHITECTURES: one GPU-driven scene whose instances belong to ten fleets, each fleet
// culled into its own (fleet, LOD) regions and drawn through its own meshes, layout and shader pair -- flat quads,
// a lit 3D hull, a sprite, that sprite lofted solid, the radar's voxel jet, an extruded SVG hologram, a Krbn-
// skinned hull on a line-list, glyph quads pinned to a hull, and a hull seen through ASCII cells -- on both
// backends, each built by a re-skinner the tree already had. The CPU twin is the oracle for the region counts;
// the pick picture is the oracle for WHERE each fleet's pixels are (every pixel that names a fleet names a record that belongs to it); the colour picture says
// the fleets look different from each other. Then the user's own models: an OBJ and a GLB through a mock fetch,
// and the two storage keys the person may already have filled.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { validateWgsl } from "../../render/wgslSpec.mjs";
import * as G from "../../render/gpuDriven.mjs";
import * as F from "../../render/fleets.mjs";
import { toOBJ } from "../krbn/strokeLift.js";
import { writeGLB, boxMesh } from "../../physics/mesh/glb.mjs";
import { nullBackend } from "../../gfx/device.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const throwsWith = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const SIDE = 15, N = 256, CAM = { eye: [0, 0, 8], target: [0, 0, 0], fov: Math.PI / 3, near: 0.1, far: 100 };
const viewProj = G.multiply(G.perspective(CAM.fov, 1, CAM.near, CAM.far), G.lookAt(CAM.eye, CAM.target));
const records = G.gridScene({ side: SIDE, z: -2, spacing: 1, radii: [0.34] });
const COUNT = records.length / 4, FLEETS = F.RACES.length;
const fleetOf = Uint32Array.from({ length: COUNT }, (_, i) => i % FLEETS);
const AREA = ["Union", "Wedge", "Pixel", "Loft", "Holo", "Cells", "Chaos"];   // fleets whose hull has area at its centre; Krbn is strokes, Glyph is sparse quads, Voxel's centre is between voxels

console.log("\n1. THE SCENE KNOWS FLEETS: regions per (fleet, LOD), the twin agrees, and the refusals are by name");
{
    const u = G.packCullUniforms({ planes: G.frustumPlanes(viewProj), eye: CAM.eye, thresholds: [0.03], count: COUNT, lodCount: 2, cap: COUNT, fleetCount: FLEETS });
    const twin = G.cullLodCpu(records, u, fleetOf), one = G.cullLodCpu(records, G.packCullUniforms({ planes: G.frustumPlanes(viewProj), eye: CAM.eye, thresholds: [0.03], count: COUNT, lodCount: 2, cap: COUNT }));
    ok("the twin makes lodCount x fleetCount regions", twin.regions === 2 * FLEETS && twin.counts.length === twin.regions, `${twin.regions} regions`);
    const perLod = [0, 1].map((l) => Array.from({ length: FLEETS }, (_, f) => twin.counts[f * 2 + l]).reduce((a, b) => a + b, 0));
    ok("  summed over fleets, each LOD's count is the one-fleet count (fleets partition; they do not add)", perLod[0] === one.counts[0] && perLod[1] === one.counts[1], `${perLod.join("/")} vs ${Array.from(one.counts).join("/")}`);
    let right = true; for (let r = 0; r < twin.regions; r++) for (let s = 0; s < twin.counts[r]; s++) { const o = (r * COUNT + s) * G.OUT_RECORD_FLOATS; if (twin.compact[o + 7] !== Math.floor(r / 2) || fleetOf[twin.compact[o + 4]] !== twin.compact[o + 7] || twin.compact[o + 5] !== r % 2) right = false; }
    ok("  every compacted record carries its fleet in ident.w, and it is the fleet its id was given", right);
    const u1 = G.packCullUniforms({ planes: G.frustumPlanes(viewProj), eye: CAM.eye, thresholds: [0.03], count: COUNT, lodCount: 2, cap: COUNT }), u0 = Float32Array.from(u1); u0[27] = 0;
    ok("  the fleet count rides in eye.w (1 by default); a 0 there, the pre-Level-15 padding, reads as one fleet", u1[27] === 1 && G.cullLodCpu(records, u0).fleetCount === 1 && G.cullLodCpu(records, u0).counts.length === 2 && G.CULL_UNIFORM_FLOATS === 40);
    ok("decodePick unpacks lod + fleet * 8 from blue", JSON.stringify(G.decodePick(new Uint8Array([7, 0, 1 + 8 * 5, 128]), 0)) === JSON.stringify({ id: 7, lod: 1, fleet: 5 }) && G.MAX_FLEETS === 32);
    const wgsl = G.cullLodWgsl({ fleets: true }), wgslOcc = G.cullLodWgsl({ fleets: true, occlusion: true });
    ok("the fleet cull shader validates, binds fleetOf, and the no-fleet text is unchanged from Level 11", validateWgsl(wgsl).length === 0 && validateWgsl(wgslOcc).length === 0 && /fleetOf: array<u32>/.test(wgsl) && /binding\(7\) var<storage, read> fleetOf/.test(wgslOcc) && !/fleetOf/.test(G.cullLodWgsl()));
    const dev = nullBackend();
    const lods = () => [{ name: "near", mesh: G.quadMesh(2) }, { name: "far", mesh: G.quadMesh(1) }];
    ok("REFUSED: a record naming a fleet the scene does not have", throwsWith(() => G.makeGpuDrivenScene(dev, { fleets: [{ name: "a", lods: lods() }, { name: "b", lods: lods() }], fleetOf: Uint32Array.from([0, 1, 2, 0]), thresholds: [0.03], records: G.gridScene({ side: 2 }) }), /names fleet 2, and there are 2 fleets/));
    ok("REFUSED: fleets without a fleetOf", throwsWith(() => G.makeGpuDrivenScene(dev, { fleets: [{ name: "a", lods: lods() }], thresholds: [0.03], records: G.gridScene({ side: 2 }) }), /need a fleetOf/));
    ok("REFUSED: a fleet on a different ladder (three levels beside two)", throwsWith(() => G.makeGpuDrivenScene(dev, { fleets: [{ name: "a", lods: lods() }, { name: "b", lods: [...lods(), { name: "x", mesh: G.quadMesh(3) }] }], fleetOf: new Uint32Array(4), thresholds: [0.03], records: G.gridScene({ side: 2 }) }), /same ladder|thresholds, got/));
    ok("REFUSED: more fleets than the pick picture can name", throwsWith(() => G.makeGpuDrivenScene(dev, { fleets: Array.from({ length: 33 }, (_, i) => ({ name: String(i), lods: lods() })), fleetOf: new Uint32Array(4), thresholds: [0.03], records: G.gridScene({ side: 2 }) }), /at most 32/));
    const sc = G.makeGpuDrivenScene(dev, { fleets: [{ name: "a", lods: lods() }, { name: "b", lods: lods(), layout: G.LAYOUTS.lit }], fleetOf: Uint32Array.from([0, 1, 1, 0]), thresholds: [0.03], records: G.gridScene({ side: 2 }) });
    ok("a two-fleet scene on the null device: 4 regions, ranges per region, the lit fleet's stride is 40 bytes and it says what its meshes lacked", sc.regionCount === 4 && sc.ranges.length === 4 && sc.fleets[1].layout === G.LAYOUTS.lit && G.packMeshes([G.quadMesh(1)], G.LAYOUTS.lit).stride === 40 && sc.fleets[1].missing.includes("normals"), JSON.stringify(sc.fleets.map((f) => f.missing)));
    const lb = G.layoutBuffers(G.LAYOUTS.sprite);
    ok("  layout locations: p 0, color 1, the instance slot 2, 3 and (v4317) 5 for the heading, extras from 4 -- so a richer layout never moves rec/ident", lb[0].attributes.map((a) => a.location).join() === "0,1,4" && lb[1].attributes.map((a) => a.location).join() === "2,3,5");
}

console.log("\n2. THE ARCHITECTURES, ON THE CPU: hulls, skins, sprites, glyphs, and the user's files");
{
    for (const k of ["LIT_WGSL", "SPRITE_WGSL", "HOLO_WGSL", "INK_WGSL", "ASCII_WGSL", "SPIN_PICK_WGSL", "SPRITE_PICK_WGSL"]) ok(`${k} validates`, validateWgsl(F[k]).length === 0, validateWgsl(F[k]).join("; "));
    const enc = /o\.id = [^\n]*;/.exec(G.PICK_WGSL)[0];
    ok("the looks' pick shaders carry gpuDriven's identity encoding line verbatim (lifted by pattern, not retyped) and the same spin as their looks", F.SPIN_PICK_WGSL.includes(enc) && F.SPRITE_PICK_WGSL.includes(enc) && F.SPIN_PICK_WGSL.includes("turned(p, extra.x)") && F.LIT_WGSL.includes("turned(p, extra.x)") && F.SPIN_PICK_VERTEX_GLSL.includes(/vId = [^\n]*;/.exec(G.PICK_VERTEX_GLSL)[0]));
    const w = F.wedgeMesh();
    let unit = true; for (let i = 0; i < w.normals.length; i += 3) if (Math.abs(Math.hypot(w.normals[i], w.normals[i + 1], w.normals[i + 2]) - 1) > 1e-5) unit = false;
    let far = 0; for (let i = 0; i < w.positions.length; i += 3) far = Math.max(far, Math.hypot(w.positions[i], w.positions[i + 1], w.positions[i + 2]));
    ok("the wedge: six faces flat-shaded (18 unwelded vertices), unit normals, normalised to radius 1", w.indices.length === 18 && unit && Math.abs(far - 1) < 1e-5);
    const h = F.svgHullMesh();
    const edges = new Map(); for (let t = 0; t < h.indices.length; t += 3) for (let k = 0; k < 3; k++) { const a = h.positions.subarray(h.indices[t + k] * 3, h.indices[t + k] * 3 + 3), b = h.positions.subarray(h.indices[t + (k + 1) % 3] * 3, h.indices[t + (k + 1) % 3] * 3 + 3); const ka = Array.from(a).map((v) => v.toFixed(5)).join(","), kb = Array.from(b).map((v) => v.toFixed(5)).join(","); const key = ka < kb ? ka + "|" + kb : kb + "|" + ka; edges.set(key, (edges.get(key) || 0) + 1); }
    const open = Array.from(edges.values()).filter((c) => c !== 2).length;
    ok("the SVG hull is a CLOSED extrusion: every edge shared by exactly two faces", open === 0 && h.indices.length / 3 > 20, `${h.indices.length / 3} triangles, ${open} open edges`);
    ok("  mesh/extrudePolygon.mjs raised it and says so: watertight, every edge shared", h.watertight.ok && h.watertight.unshared === 0 && h.outline > 8, JSON.stringify(h.watertight));
    const loft = F.loftMesh(F.spriteBitmap(0)), vox = F.voxelPlaneMesh("jet");
    let loftFar = 0; for (let i = 0; i < loft.positions.length; i += 3) loftFar = Math.max(loftFar, Math.hypot(loft.positions[i], loft.positions[i + 1], loft.positions[i + 2]));
    ok("LOFT: the Pixel race's own bitmap through fx/spritemesh (alpha mask, radial contour, extrusion): a closed solid, radius 1", loft.kind === "hull" && loft.contour === 48 && loft.indices.length === 48 * 4 * 3 && Math.abs(loftFar - 1) < 1e-5, `${loft.indices.length / 3} triangles`);
    const ext = [0, 0, 0]; for (let i = 0; i < vox.positions.length; i += 3) for (let k = 0; k < 3; k++) ext[k] = Math.max(ext[k], Math.abs(vox.positions[i + k]));
    ok("VOXEL: the radar's jet through gpu/voxelCreature.js, re-axed so up is z (the thin axis) and the plane lies in the XY plane every hull here lies in; per-vertex colours kept", vox.kind === "hull" && vox.voxels === 19 && vox.colors.length === vox.positions.length / 3 * 4 && ext[2] < ext[0] && ext[2] < ext[1], `${vox.voxels} voxels, ${vox.indices.length / 3} triangles, extents ${ext.map((v) => v.toFixed(2)).join("/")}`);
    const gq = F.glyphSkinMesh(F.wedgeMesh(), { count: 100 });
    // every quad's centre lies on a face of the wedge (the tangent-plane quad is centred at its surface sample)
    const kw = F.toKrbnMesh(F.wedgeMesh()); let onFace = 0;
    for (let q = 0; q < gq.quads; q++) { const c = [0, 1, 2].map((k) => (gq.positions[q * 12 + k] + gq.positions[q * 12 + 3 + k] + gq.positions[q * 12 + 6 + k] + gq.positions[q * 12 + 9 + k]) / 4); let best = Infinity;
        for (const [i, j, k] of kw.triangles) { const A = kw.positions[i], B = kw.positions[j], C = kw.positions[k]; const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
            const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n) || 1; best = Math.min(best, Math.abs(((c[0] - A[0]) * n[0] + (c[1] - A[1]) * n[1] + (c[2] - A[2]) * n[2]) / l)); }
        if (best < 1e-4) onFace++; }
    ok("GLYPH: tools/export/reskin.js pins one glyph quad per surface sample, every quad centred on a face of the hull, uvs into the shared ramp", gq.kind === "glyphs" && gq.quads === 100 && onFace === 100 && gq.uvs.length === 800 && gq.levels.length === F.ASCII_RAMP.length && F.ASCII_RAMP === " .:-=+*#%@", `levels ${gq.levels.join(",")}`);
    const skin = F.krbnSkin(F.wedgeMesh()), km = F.toKrbnMesh(F.wedgeMesh());
    // every lifted point lies ON a face of the raised hull: within 1e-3 of some triangle's plane, inside its bounds
    let onSurface = 0, total = 0;
    for (const poly of skin.lifted) for (const p of poly) { total++; let best = Infinity;
        for (const [i, j, k] of km.triangles) { const A = km.positions[i], B = km.positions[j], C = km.positions[k]; const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
            const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n) || 1; best = Math.min(best, Math.abs(((p[0] - A[0]) * n[0] + (p[1] - A[1]) * n[1] + (p[2] - A[2]) * n[2]) / l)); }
        if (best < 1e-3) onSurface++; }
    ok("KRBN SKIN: the hull is raised first, the hatching is drawn over it, and every lifted point lies on a face of the hull", onSurface === total && total > 30, `${total} points on ${skin.lifted.length} polylines, ${skin.mesh.segments} segments; ${skin.drawn} drawn, ${total} landed (the rest missed the silhouette)`);
    ok("  the strokes lie along no hull edge: hatching, not a wireframe echo", skin.lifted.some((poly) => poly.length > 3));
    const obj = F.parseObj(toOBJ(skin.lifted)), back = F.objToMesh(obj);
    ok("  the skin round-trips through strokeLift's OBJ: parseObj reads its `l` records back as the same segments", obj.polylines === skin.mesh.segments && back.kind === "strokes" && obj.vertices === total);
    const sb = F.spriteBitmap(0), ga = F.asciiAtlas();
    ok("the sprite is a 16x16 bitmap with ink at its centre (so a centre pick lands)", sb.width === 16 && sb.height === 16 && sb.data[(8 * 16 + 8) * 4 + 3] === 255 && sb.filled > 50);
    ok("the ASCII atlas: ten glyphs, ink non-decreasing along the ramp after the blank", ga.ramp === " .:-=+*#%@" && ga.inkPerGlyph[0] === 0 && ga.inkPerGlyph[9] >= ga.inkPerGlyph[1] && ga.inkPerGlyph[8] > ga.inkPerGlyph[3], ga.inkPerGlyph.join(","));
    ok("fleetForName: one owner is one race, deterministic, and 'hauler of X' hashes as its own name", F.fleetForName("but0n/a") === F.fleetForName("but0n/b") && F.fleetForName("But0n/z") === F.fleetForName("but0n/a") && F.fleetForName("portsmouth/x", 6) < 6 && F.fleetsForNames(["a", "b"]).length === 2);
    const owners = ["but0n", "portsmouth", "redcamel", "kalcode", "jamie", "hauler of SweK", "octocat", "torvalds"].map((o) => F.fleetForName(o));
    ok("  eight owners land on more than two races", new Set(owners).size > 2, owners.join(","));
    // the user's models: a mock storage with both keys filled, then a mock fetch serving an OBJ and a GLB
    const storage = { getItem: (k) => ({ [F.USER_MODEL_KEYS.ships]: JSON.stringify({ raider: { url: "/GPU_Assets/ships/raider.glb", yaw: 90 }, corsair: { url: "sprite:/art/corsair.png", yaw: 0 }, marauder: { url: "blob:http://x/1", yaw: 0 } }),
                                           [F.USER_MODEL_KEYS.planes]: JSON.stringify({ A320: "/GPU_Assets/a320.obj", F15: "asset-lib-f15" }) })[k] || null };
    const src = F.userModelSources(storage);
    ok("userModelSources reads the EV ship key and the radar plane key", src.length === 5 && src.filter((s) => s.loadable).length === 2, src.map((s) => `${s.kind}/${s.cls}:${s.loadable ? s.format : "no (" + s.why.split(" --")[0] + ")"}`).join("; "));
    ok("  a sprite loft, a dead blob URL and an asset-library id are each refused with their own reason", src.find((s) => s.cls === "corsair").why.includes("sprite loft") && src.find((s) => s.cls === "marauder").why.includes("blob") && src.find((s) => s.cls === "F15").why.includes("asset-library"));
    const glb = writeGLB(boxMesh(2, 1, 0.5)), objText = "v 0 0 0\nv 1 0 0\nv 0 1 0\nv 0 0 1\nf 1 2 3\nf 1 3 4\nf 1 4 2\nf 2 4 3\n";
    const fetchFn = async (url) => ({ ok: /\.glb|\.obj/.test(url), status: 200, arrayBuffer: async () => glb.buffer ? glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) : glb, text: async () => objText });
    const box = await F.loadUserModel(src.find((s) => s.cls === "raider"), { fetchFn }), tet = await F.loadUserModel(src.find((s) => s.cls === "A320"), { fetchFn });
    let boxFar = 0; for (let i = 0; i < box.positions.length; i += 3) boxFar = Math.max(boxFar, Math.hypot(box.positions[i], box.positions[i + 1], box.positions[i + 2]));
    ok("a user's .glb loads through physics/mesh/glb.mjs into a flat-shaded hull normalised to radius 1", box.kind === "hull" && box.indices.length === 36 && box.normals.length === box.positions.length && Math.abs(boxFar - 1) < 1e-5, `${box.triangles} triangles`);
    ok("a user's .obj loads through parseObj into a hull (a tetrahedron: 4 faces, 12 unwelded vertices)", tet.kind === "hull" && tet.indices.length === 12 && tet.positions.length === 36);
    let refused = false; try { await F.loadUserModel(src.find((s) => s.cls === "corsair"), { fetchFn }); } catch (e) { refused = /sprite loft/.test(e.message); }
    ok("  loading an unloadable source refuses with the reason the listing gave", refused);
    const std = F.standardFleets(nullBackend(), { userHull: box });
    const byName = Object.fromEntries(std.fleets.map((f) => [f.name, f]));
    ok("standardFleets: ten fleets (v4315: Chaos, swk_lyapunov as a look), two levels each; the Wedge, Krbn, Glyph and Cells races all built on the user's hull", std.fleets.length === 10 && std.fleets.every((f) => f.lods.length === 2) && byName.Wedge.userHull && byName.Wedge.lods[0].mesh.indices.length === 36 && byName.Krbn.topology === "line-list" && byName.Krbn.lods[0].mesh.kind === "strokes" && byName.Glyph.userHull && byName.Cells.userHull && !byName.Loft.userHull, std.fleets.map((f) => `${f.name}:${f.look}`).join(" "));
}

console.log("\n3. ON BOTH BACKENDS: each fleet in its own architecture, its pixels where its records are, the counts the twin's");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const u = G.packCullUniforms({ planes: G.frustumPlanes(viewProj), eye: CAM.eye, thresholds: [0.03], count: COUNT, lodCount: 2, cap: COUNT, fleetCount: FLEETS });
    const twin = G.cullLodCpu(records, u, fleetOf);
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N, CAM, records: Array.from(records), fleetOf: Array.from(fleetOf) }, script: `async (a) => {
        const G = await import("/render/gpuDriven.mjs"); const F = await import("/render/fleets.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const records = new Float32Array(a.records), fleetOf = Uint32Array.from(a.fleetOf), count = records.length / 4;
        const viewProj = G.multiply(G.perspective(a.CAM.fov, 1, a.CAM.near, a.CAM.far), G.lookAt(a.CAM.eye, a.CAM.target));
        const out = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N;
            const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
            const std = F.standardFleets(dev, { clock: () => 0.5 });
            const sc = G.makeGpuDrivenScene(dev, { fleets: std.fleets, fleetOf, thresholds: [0.03], records });
            const fr = sc.frame({ viewProj, eye: a.CAM.eye, read: true, clear: [0, 0, 0, 1] });
            const pix = await fr.pixels;
            const counts = await sc.readCounts(), byFleet = await sc.readCountsByFleet();
            const pp = await sc.pickPicture();
            // per fleet: the pixels the pick names, how many of them the colour picture left dark (a discard the pick did not make), and the mean colour of the lit ones
            const perFleet = std.fleets.map(() => ({ pixels: 0, wrong: 0, dark: 0, lit: 0, rgb: [0, 0, 0] }));
            for (let i = 0; i < pp.hits.length; i++) { const h = pp.hits[i]; if (!h) continue; const pf = perFleet[h.fleet]; if (!pf) continue; pf.pixels++; if (fleetOf[h.id] !== h.fleet) pf.wrong++;
                const r = pix.pixels[i * 4], g = pix.pixels[i * 4 + 1], b = pix.pixels[i * 4 + 2]; if (r + g + b === 0) { pf.dark++; continue; } pf.lit++; pf.rgb[0] += r; pf.rgb[1] += g; pf.rgb[2] += b; }
            for (const pf of perFleet) if (pf.lit) pf.rgb = pf.rgb.map((v) => Math.round(v / pf.lit));
            const centre = std.fleets.map(() => ({ tried: 0, hit: 0 }));
            for (let i = 0; i < count; i++) { const p = G.project(viewProj, [records[i * 4], records[i * 4 + 1], records[i * 4 + 2]]); if (Math.abs(p[0]) >= 0.95 || Math.abs(p[1]) >= 0.95) continue;
                const h = await sc.pick((p[0] * 0.5 + 0.5) * a.N, (1 - (p[1] * 0.5 + 0.5)) * a.N); centre[fleetOf[i]].tried++; if (h && h.id === i && h.fleet === fleetOf[i]) centre[fleetOf[i]].hit++; }
            let lit = 0; for (let i = 0; i < pix.pixels.length; i += 4) if (pix.pixels[i] + pix.pixels[i + 1] + pix.pixels[i + 2] > 0) lit++;
            const errors = sc.fleets.map((f) => f.pipe && f.pipe.error).filter(Boolean);
            out[backend] = { backend: dev.backend, path: sc.path, counts, byFleet, perFleet, centre, lit, errors, names: std.fleets.map((f) => f.name), missing: sc.fleets.map((f) => f.missing) };
        }
        return out;
    }` });
    ok("the harness ran both backends", r.ok && r.result && r.result.webgpu && r.result.webgl2, r.ok ? "" : (r.reason || (r.pageErrors || []).join("; ") || r.error));
    if (r.ok && r.result.webgpu && r.result.webgl2) {
        for (const b of ["webgpu", "webgl2"]) {
            const R = r.result[b];
            ok(`${b}: ${R.path}, no pipeline failed to compile, no fleet's mesh lacked a field its layout wanted`, R.backend === b && R.errors.length === 0 && R.missing.every((m) => m.length === 0), R.errors.join("; ") || JSON.stringify(R.missing));
            ok(`  ${b}: the region counts are the twin's, region for region (${FLEETS} fleets x 2 LODs)`, R.counts.join() === Array.from(twin.counts).join(), `${R.counts.join(",")} vs ${Array.from(twin.counts).join(",")}`);
            ok(`  ${b}: every fleet drew`, R.perFleet.every((p) => p.pixels > 0), R.names.map((n, i) => `${n} ${R.perFleet[i].pixels}px`).join(", "));
            ok(`  ${b}: every pixel that names a fleet names a record OF that fleet`, R.perFleet.every((p) => p.wrong === 0), R.perFleet.map((p) => p.wrong).join(","));
            const ce = R.names.indexOf("Cells");
            ok(`  ${b}: the pick picture is where the colour is -- at most 1 in 50 named pixels is dark in the picture, except Cells, whose pick names the hull between its glyphs by design`, R.perFleet.every((p, i) => i === ce || p.dark <= Math.max(2, p.pixels / 50)), R.names.map((n, i) => `${n} ${R.perFleet[i].dark}/${R.perFleet[i].pixels} dark`).join(", "));
            const area = R.names.map((n, i) => ({ n, ...R.centre[i] })).filter((c) => AREA.includes(c.n));
            ok(`  ${b}: a pick at the centre of a hull-with-area names that record and its fleet (all of them)`, area.every((c) => c.tried > 0 && c.hit === c.tried), area.map((c) => `${c.n} ${c.hit}/${c.tried}`).join(", "));
            const k = R.names.indexOf("Krbn");
            const un = R.names.indexOf("Union"), gl = R.names.indexOf("Glyph");
            ok(`  ${b}: the Krbn race is strokes and the Glyph race sparse quads -- each fewer pixels than the Union control; a centre pick is not promised for either`, R.perFleet[k].pixels > 0 && R.perFleet[k].pixels < R.perFleet[un].pixels && R.perFleet[gl].pixels < R.perFleet[un].pixels, `Krbn ${R.perFleet[k].pixels}px (centre ${R.centre[k].hit}/${R.centre[k].tried}), Glyph ${R.perFleet[gl].pixels}px, Union ${R.perFleet[un].pixels}px`);
            let distinct = true, closest = Infinity; for (let i = 0; i < FLEETS; i++) for (let j = i + 1; j < FLEETS; j++) { const d = [0, 1, 2].reduce((s, c) => s + Math.abs(R.perFleet[i].rgb[c] - R.perFleet[j].rgb[c]), 0); closest = Math.min(closest, d); if (d < 40) distinct = false; }
            ok(`  ${b}: the fleets look different (mean colour of each fleet's own lit pixels, closest pair)`, distinct, `closest pair differs by ${closest}/765; ` + R.names.map((n, i) => `${n} ${R.perFleet[i].rgb.join("/")}`).join(", "));
        }
        const A = r.result.webgpu, B = r.result.webgl2;
        ok("WebGPU and WebGL2 agree on every region's count", A.counts.join() === B.counts.join());
        const near = A.perFleet.every((p, i) => Math.abs(p.pixels - B.perFleet[i].pixels) <= Math.max(12, 0.25 * Math.max(p.pixels, B.perFleet[i].pixels)));
        ok("  and on each fleet's footprint within a quarter (rasterisation of thin strokes and glyph cells differs between backends)", near, A.names.map((n, i) => `${n} ${A.perFleet[i].pixels}/${B.perFleet[i].pixels}`).join(", "));
    }
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at Level 15.
//   A  the cull's region written as `u32(lod)` instead of `fleet * lodCount + lod` (every fleet into fleet 0's
//      regions) -> exit=1, 4 red: the WebGPU counts read 89,80,0,0,... against the twin's 11,7,10,12,...; every
//      fleet's mean colour is Union's 255/217/89 (closest pair 0/765); the backends disagree on every region and
//      on every footprint (Wedge 2443 px on WebGPU, 605 on WebGL2). WebGL2 stays green on its own lines, since the
//      twin is what it draws from -- which is why the two backends are graded separately.
//   B  ident.w written as 0.0 in the cull (the fleet dropped from the record) -> exit=1, 7 red: the pick picture
//      names 8,441 pixels as Union and 5,721 of them belong to other fleets; Wedge..Cells draw 0 px by the pick's
//      account; the centre picks of every hull but Union fail (0/11, 0/15, ...).
//   C  the Krbn skin's lift replaced by the flat strokes at z = 0 -> exit=1, 1 red: 0 of 202 points on a face of
//      the hull (and every stroke "lands", which is the tell: a lift that never misses the silhouette is not a lift).
//   0  (found, not planted) gpuDriven's default pick shader drew every fleet UNSPUN under looks that spin their
//      hulls, so the identity picture named pixels beside the colour: the Wedge's mean colour over "its" pixels
//      came out 71/76/85 for a hull lit to 140/149/167. Each look now brings a pick shader with its own vertex
//      motion (and the sprite looks discard where the sprite is transparent); the "dark named pixels" line is the
//      check that would have caught it, and 0 of 605 is its answer.
//   00 (found, not planted) the vertex-layout extras were numbered after the instance slot, so a lit fleet's
//      normal took location 2 and `rec` moved to 3. Locations are explicit now (p 0, color 1, rec 2, ident 3,
//      extras 4+), and section 1 reads them back.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a heading in the record (the spin is the golden angle times the id, a stand-in); the Cells race " +
    "against a real text renderer (it is graded as an impression: it draws, its pixels are its own, it looks unlike the others, and " +
    "its pick names the hull between the glyphs); a user's .glb over the network (the fetch is mocked with physics/mesh/glb.mjs's own " +
    "writer); the EV sprite loft, which does not travel here; and how the ten look on a screen, which only a person can say.");
process.exit(fails ? 1 : 0);
