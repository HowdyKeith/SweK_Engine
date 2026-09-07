#!/usr/bin/env node
// WebGLEngine/tools/ship/kenneyKit-selfcheck.mjs -- Racing city 0 (task 63)
//
// THE VENDORED KENNEY KITS, HELD TO THEIR FOLDERS AND DRAWN ON BOTH BACKENDS: world/kenneyKit.mjs behind kenney-kit.html. Section 1,
// the papers: each kit's licence file hashes to what the manifest recorded, carries the MIT grant, retention and as-is clauses through
// world/licenceBodies.mjs, names Kenney as holder with the year the FILE says (2023 and 2025; each README says 2026, and each
// PROVENANCE.md records that disagreement), and world/vendoredLicences.mjs registers both directories with the same file and the same
// pinned commit. Section 2, the manifest against the folder in both directions: every .glb on disk is listed, every listed one is on
// disk at the recorded bytes and sha256, nothing else is in the directory but the licence, the provenance and the colormap, and the
// two colormaps are different files. Section 3, the parse: every model through gpu/glbLoad.js's router (route "plain": no Draco) and
// gpu/GLBParser.js with post-processing off, vertex and triangle counts as recorded, every model standing on y = 0, the tiles filling
// their kit's cell (10 for the racing kit, 1 for the city kit), the finish gate 14 wide, the four trucks carrying the six named parts
// at UnityGLTF's translations, the uvs inside [0, 1]; a truncated buffer and a non-GLB refused by name. Section 4, the colours: the
// colormap decodes to 512 x 512 RGBA, every baked colour opaque, each truck's body hue the one its file name says and absent from
// the others, the track tile asphalt with red-and-white kerbs, the grass tile green at every vertex, and a bake with v flipped ALL
// BLACK (the palette's lower half is empty, which is why a flipped-v sabotage cannot hide). Section 5, the pack: packMeshes' lit
// layout at 40 bytes, one range per model with the recorded index count, the interleaved colour equal to the baked one, the hash the
// same twice and different per kit; kitGrid and yawQuat. Section 6, ON BOTH BACKENDS: the page's grid loaded through fetch and
// createImageBitmap, drawn from above; every placement's cell has lit pixels, the red truck's cell is red-dominant and the green
// truck's green, the grass cell green and the road cell grey, the finish gate turns with a 90-degree yaw quaternion (its pixel box
// goes from wider than tall to taller than wide), the browser's kit hash equals node's, and the backends agree.
//
// MEASURED AT THE ROUND: 13 racing models (1,204,400 bytes, 22,489 vertices) and 15 city models (383,540 bytes, 6,966 vertices) load and
// bake in 89 to 154 ms here and 290 to 375 ms in the browser, with the same kit hashes (151c8817, b208fbd4) in both runtimes; the red truck
// is 27.9 % red-dominant vertices, the green truck 15.8 % green, the yellow 11.5 % yellow, the purple 10.6 % purple, and no named hue
// reaches 2 % on a truck not named for it (the green truck's 1.7 % red is its lights); track-straight's most common colour is [54, 54, 58]
// (44 of 188 vertices), its second [212, 86, 78] (32); grass.glb is green at 60 of 60 vertices; the colormap sampled with v flipped is
// black at all 1,664 of the red truck's vertices. On both backends all 28 cells are lit, the red truck's cell is 86 to 92 % red and the
// green truck's 51 % green (18 % red: its lights and the kerb of the tile beside it), the finish gate is 24 x 18 pixels flat and 18 x 24
// turned, the backends 54 to 76 pixels apart of 100,000. THE FINDINGS: the two kits' LICENSE files carry years (2023, 2025) their own
// READMEs contradict (2026 in both); and gpu/GLBParser.js set _baseUrl only on the multi-file .gltf path, so a binary GLB naming an
// external image fetched "Textures/colormap.png" relative to the PAGE and logged a 404 per model -- fixed there, the baseUrl now
// honoured on both paths, and this gate's page errors went from three 404s to none.
//
// SABOTAGE (the round; world/kenneyKit.mjs md5 4e8ef2f7bd47323ce94c7a8ee50343ca and world/vendoredLicences.mjs 3e9229e97d1904e908ba6a4483c76f20
// before and after all four):
//   A  the manifest's sha for track-straight.glb off by one hex digit         -> 1 red: the file named, bytes agree, the hash does not.
//   B  bakeColours sampling v from the bottom (1 - v)                          -> FIRST 1 RED AND A CRASH: every colour black, the asphalt census
//                                                                                 one entry long, and the asphalt hold threw on cen[1] -- round 5's
//                                                                                 lesson (a sabotage that throws is not a red by name). The gate
//                                                                                 gained a gate-side twin of the bake and guarded censuses:
//                                                                                 -> 11 red (the twin, every hue hold, asphalt, grass, the cross
//                                                                                 bake, and on both backends the unlit cells, the hues and the
//                                                                                 black finish gate). The browser hash still EQUALS node's under
//                                                                                 B -- both runtimes flip alike -- so that hold is not a twin.
//   C  the vendoredLicences entry for kenney-city naming LICENSE, not LICENSE.md -> 1 red here (the register's file), and 2 red in
//                                                                                 vendoredLicences-selfcheck (the grant file not on disk).
//   D  yawQuat about x instead of y                                             -> 3 red: rotateQ's twin sends (1, 0, 0) to itself, and the finish
//                                                                                 gate's pixel box does not turn on either backend.
//   Each restored and the baseline re-run: 0 red.
//
// Run: node tools/ship/kenneyKit-selfcheck.mjs      (~25 s: both kits here, both backends in the browser)
"use strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { decodePNG } from "./pngCoverage.mjs";
import * as K from "../../world/kenneyKit.mjs";
import { VENDORED, GRANT } from "../../world/vendoredLicences.mjs";
import { operativeBody, holderOf, CLAUSES } from "../../world/licenceBodies.mjs";
import { rotateQ } from "../../render/voxelBodies.mjs";
import * as G from "../../render/gpuDriven.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const sha12 = (buf) => crypto.createHash("sha256").update(buf).digest("hex").slice(0, 12);
const readBytes = async (p) => fs.readFileSync(path.join(ENG, p));
const readImage = async (p) => decodePNG(fs.readFileSync(path.join(ENG, p)));
const quiet = () => { const log = console.log; console.log = (...a) => { if (!/\[GLBParser\]/.test(String(a[0]))) log(...a); }; };
quiet();
const hueShare = (colors, pred) => { let n = 0, t = colors.length / 4; for (let i = 0; i < colors.length; i += 4) if (pred(colors[i], colors[i + 1], colors[i + 2])) n++; return n / t; };
const isRed = (r, g, b) => r > 0.6 && r > g * 1.8 && r > b * 1.8, isGreen = (r, g, b) => g > 0.45 && g > r * 1.8 && g > b * 1.2, isYellow = (r, g, b) => r > 0.9 && g > 0.68 && b < 0.45, isPurple = (r, g, b) => b > 0.7 && b > g * 1.5 && r > g;

// ---------------------------------------------------------------------------------------------------------------------------------
sec("1. the papers: the licence files as read, the register, the provenance");
for (const [name, kit] of Object.entries(K.KITS)) {
    const lic = path.join(ENG, kit.dir, kit.licence), text = fs.existsSync(lic) ? fs.readFileSync(lic, "utf8") : "";
    ok(`${name}: ${kit.dir}/${kit.licence} exists and hashes to the manifest's ${kit.licenceSha}`, text.length > 0 && sha12(fs.readFileSync(lic)) === kit.licenceSha, text.length ? sha12(fs.readFileSync(lic)) : "missing");
    const body = operativeBody(text);
    ok(`  ${name}: the operative body carries the MIT grant, the retention clause and the as-is clause`, CLAUSES.mitGrant.test(body) && CLAUSES.retention.test(body) && CLAUSES.asIs.test(body) && CLAUSES.sublicense.test(body));
    ok(`  ${name}: the holder is "${kit.holder}" (the FILE's year, not the README's 2026)`, holderOf(text) === kit.holder, JSON.stringify(holderOf(text)));
    const prov = path.join(ENG, kit.dir, "PROVENANCE.md"), pt = fs.existsSync(prov) ? fs.readFileSync(prov, "utf8") : "";
    ok(`  ${name}: PROVENANCE.md pins the upstream commit ${kit.commit.slice(0, 12)} and records the README's 2026 against the file's year`, pt.includes(kit.commit) && pt.includes(kit.upstream) && /2026/.test(pt) && pt.includes(kit.holder.slice(0, 4)));
    const reg = VENDORED.find((e) => e.path === kit.dir);
    ok(`  ${name}: world/vendoredLicences.mjs registers ${kit.dir} as MIT with grant file ${kit.licence} and the same pin`, !!reg && reg.spdx === "MIT" && reg.grant === GRANT.LICENCE_FILE && reg.file === kit.licence && reg.pin === kit.commit, reg ? `${reg.file}, ${String(reg.pin).slice(0, 12)}` : "no entry");
}
{
    const a = fs.readFileSync(path.join(ENG, K.KITS.racing.dir, K.KITS.racing.licence), "utf8"), b = fs.readFileSync(path.join(ENG, K.KITS.city.dir, K.KITS.city.licence), "utf8");
    ok("the two files share one operative body (the same MIT text under two years)", operativeBody(a) === operativeBody(b) && a !== b);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("2. the manifest against the folder, both directions");
{
    let total = 0;
    for (const [name, kit] of Object.entries(K.KITS)) {
        const entries = K.ofKit(name), dir = path.join(ENG, kit.dir, "models");
        const onDisk = fs.readdirSync(dir).filter((f) => f.endsWith(".glb")).sort(), listed = entries.map((e) => e.file).sort();
        ok(`${name}: every .glb on disk is in the manifest and every manifest entry is on disk (${onDisk.length})`, JSON.stringify(onDisk) === JSON.stringify(listed), `disk-only ${onDisk.filter((f) => !listed.includes(f)).join(",") || "none"}; listed-only ${listed.filter((f) => !onDisk.includes(f)).join(",") || "none"}`);
        const wrong = [];
        for (const e of entries) { const p = path.join(ENG, K.modelPath(e)); if (!fs.existsSync(p)) { wrong.push(e.file + ": missing"); continue; } const b = fs.readFileSync(p); if (b.length !== e.bytes) wrong.push(`${e.file}: ${b.length} bytes, manifest says ${e.bytes}`); else if (sha12(b) !== e.sha) wrong.push(`${e.file}: sha ${sha12(b)}, manifest says ${e.sha}`); }
        ok(`  ${name}: every entry's bytes and sha256 are the manifest's`, wrong.length === 0, wrong.join("; ") || `${entries.length} files, ${entries.reduce((s, e) => s + e.bytes, 0).toLocaleString()} bytes`);
        const walk = (d, rel = "") => fs.readdirSync(d, { withFileTypes: true }).flatMap((f) => f.isDirectory() ? walk(path.join(d, f.name), rel + f.name + "/") : [rel + f.name]);
        const allowed = new Set([kit.licence, "PROVENANCE.md", kit.colormap.slice(kit.dir.length + 1), ...entries.map((e) => "models/" + e.file)]);
        const stray = walk(path.join(ENG, kit.dir)).filter((f) => !allowed.has(f));
        ok(`  ${name}: nothing else is in ${kit.dir} (the Godot project, the .import sidecars, the FBX hulls stayed upstream)`, stray.length === 0, stray.join(", ") || `${allowed.size} files`);
        const cm = fs.readFileSync(path.join(ENG, kit.colormap));
        ok(`  ${name}: the colormap hashes to ${kit.colormapSha}`, sha12(cm) === kit.colormapSha, sha12(cm));
        total += entries.length;
    }
    ok("28 models in all, 13 racing and 15 city, each in exactly one kit", total === 28 && K.ofKit("racing").length === 13 && K.ofKit("city").length === 15 && new Set(K.MANIFEST.map((e) => e.file)).size === 28);
    const a = fs.readFileSync(path.join(ENG, K.KITS.racing.colormap)), b = fs.readFileSync(path.join(ENG, K.KITS.city.colormap));
    ok("the two colormaps are different files (each kit bakes against its own)", !a.equals(b) && a.length !== b.length, `${a.length} and ${b.length} bytes`);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("3. the parse: every model through glbLoad's router and GLBParser, the footprints, the truck parts");
const kits = {};
{
    const t0 = performance.now();
    for (const name of ["racing", "city"]) kits[name] = await K.loadKit(name, { readBytes, readImage });
    const loadMs = performance.now() - t0;
    ok(`both kits load with no failures in ${loadMs.toFixed(0)} ms`, kits.racing.failed.length === 0 && kits.city.failed.length === 0 && kits.racing.models.size === 13 && kits.city.models.size === 15, JSON.stringify([...kits.racing.failed, ...kits.city.failed]));
    const routes = [], counts = [], floors = [], foot = [], uvs = [], spans = [];
    for (const e of K.MANIFEST) {
        const m = kits[e.kit].models.get(e.file); if (!m) continue;
        if (m.route !== "plain") routes.push(e.file);
        if (m.verts !== e.verts || m.tris !== e.tris) counts.push(`${e.file}: ${m.verts}/${m.tris} not ${e.verts}/${e.tris}`);
        if (!near(m.bounds.min[1], 0, 1e-3)) floors.push(`${e.file}: min y ${m.bounds.min[1].toFixed(3)}`);
        if (!near(Math.max(m.bounds.size[0], m.bounds.size[2]), e.span, e.span * 0.01)) spans.push(`${e.file}: span ${Math.max(m.bounds.size[0], m.bounds.size[2]).toFixed(3)} not ${e.span}`);
        const cell = K.KITS[e.kit].cell, tol = cell * 0.1;
        if (e.tile && !(near(m.bounds.size[0], cell, tol) && near(m.bounds.size[2], cell, tol))) foot.push(`${e.file}: ${m.bounds.size[0].toFixed(2)} x ${m.bounds.size[2].toFixed(2)}`);
        let lo = Infinity, hi = -Infinity; for (const v of m.uvs) { if (v < lo) lo = v; if (v > hi) hi = v; } if (lo < 0 || hi > 1) uvs.push(e.file);
    }
    ok("every model routed \"plain\" (no Draco anywhere in either kit)", routes.length === 0, routes.join(", ") || "28 plain");
    ok("every model's vertex and triangle counts are the manifest's", counts.length === 0, counts.join("; ") || "28 agree");
    ok("every model stands on y = 0 (the parser applied the node transforms)", floors.length === 0, floors.join("; ") || "28 at 0");
    ok("every tile fills its kit's cell footprint within 10 % (10 for racing, 1 for city)", foot.length === 0, foot.join("; ") || `${K.MANIFEST.filter((e) => e.tile).length} tiles`);
    ok("every model's recorded span (its larger horizontal extent) is the parsed one within 1 %", spans.length === 0, spans.join("; ") || "28 agree");
    ok("every uv lies in [0, 1] (the colormap is sampled without wrapping)", uvs.length === 0, uvs.join(", ") || "all inside");
    const fin = kits.racing.models.get("track-finish.glb");
    ok("the finish gate is 14 wide and 7 tall over a 10-deep cell: it overhangs by 2 each side", near(fin.bounds.size[0], 14.03, 0.05) && near(fin.bounds.size[2], 10, 0.01) && near(fin.bounds.size[1], 7.02, 0.05), fin.bounds.size.map((v) => v.toFixed(2)).join(" x "));
    const bump = kits.racing.models.get("track-bump.glb");
    ok("the bump is a 3.4-unit square laid on a tile, not a tile", near(bump.bounds.size[0], 3.38, 0.02) && bump.bounds.size[1] < 0.6, bump.bounds.size.map((v) => v.toFixed(2)).join(" x "));
    for (const f of ["vehicle-truck-red.glb", "vehicle-truck-green.glb", "vehicle-truck-purple.glb", "vehicle-truck-yellow.glb"]) {
        const m = kits.racing.models.get(f), bad = [];
        for (const [part, t] of Object.entries(K.TRUCK_PARTS)) { const p = m.parts.find((q) => q.name === part); if (!p) bad.push(part + " missing"); else if (!(near(p.translation[0], t[0], 1e-3) && near(p.translation[1], t[1], 1e-3) && near(p.translation[2], t[2], 1e-3))) bad.push(`${part} at ${p.translation.map((v) => v.toFixed(3))}`); }
        ok(`  ${f} carries the six parts at TRUCK_PARTS' translations (round 2's wheel joints hang here)`, bad.length === 0 && m.parts.length === 6, bad.join("; ") || m.parts.map((p) => p.name).join(","));
    }
    const moto = kits.racing.models.get("vehicle-motorcycle.glb");
    ok("  the motorcycle carries two wheels, a body and a fork", ["wheel-front", "wheel-back", "body", "fork"].every((n) => moto.parts.some((p) => p.name === n)), moto.parts.map((p) => p.name).join(","));
    // refusals by name
    const whole = fs.readFileSync(path.join(ENG, K.modelPath(K.entryOf("track-straight.glb"))));
    const cut = await K.parseKitModel(whole.subarray(0, 4000));
    ok("a truncated buffer is refused with an error, not thrown", cut.ok === false && typeof cut.error === "string" && cut.error.length > 0, cut.error);
    const junk = await K.parseKitModel(new Uint8Array(64));
    ok("a buffer that is not a GLB is refused by name", junk.ok === false && /GLB|glTF|magic|short/i.test(junk.error), junk.error);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("4. the colours: baked from the kit's own colormap at the uv each vertex names");
{
    const img = kits.racing.image;
    ok("the racing colormap decodes to 512 x 512 RGBA", img.width === 512 && img.height === 512 && img.channels === 4 && kits.city.image.width === 512 && kits.city.image.channels === 4);
    let opaque = true; for (const c of [...kits.racing.colours.values(), ...kits.city.colours.values()]) for (let i = 3; i < c.length; i += 4) if (c[i] !== 1) opaque = false;
    ok("every baked colour is opaque", opaque);
    const HUES = { red: isRed, green: isGreen, yellow: isYellow, purple: isPurple }, table = {};
    for (const h of Object.keys(HUES)) { table[h] = {}; for (const k of Object.keys(HUES)) table[h][k] = hueShare(kits.racing.colours.get(`vehicle-truck-${h}.glb`), HUES[k]); }
    report("hue shares (truck -> red / green / yellow / purple %): " + Object.keys(HUES).map((h) => `${h}: ` + Object.keys(HUES).map((k) => (table[h][k] * 100).toFixed(1)).join(" / ")).join("; "));
    const own = Object.keys(HUES).every((h) => table[h][h] >= 0.08 && Object.keys(HUES).every((k) => k === h || table[h][h] > table[h][k] * 3));
    ok("*** each truck's body is the hue its file name says: at least 8 % of its vertices, and three times any other named hue on it ***", own);
    const red = table.red.red, green = table.green.green;
    ok("  ...and each named hue is under 3 % on the three trucks not named for it", Object.keys(HUES).every((h) => Object.keys(HUES).every((k) => k === h || table[h][k] < 0.03)), `largest stray ${(Math.max(...Object.keys(HUES).flatMap((h) => Object.keys(HUES).filter((k) => k !== h).map((k) => table[h][k]))) * 100).toFixed(1)} %`);
    // *** A GATE-SIDE TWIN OF THE BAKE, so a sampler that flips v is red HERE and not only where a hue happens to be tested. *** The first
    // draft had no twin, and sabotage B (v from the bottom) made every colour black, the asphalt census one entry long, and the asphalt
    // hold THROW on cen[1] -- a crash after one red, not the nine reds predicted. Round 5's lesson again: a sabotage that throws is not
    // a red by name. The twin reads the colormap itself at (u, v) for every vertex and the census holds are guarded against a short list.
    const tw = kits.racing.models.get("track-straight.glb"), twinCols = kits.racing.colours.get("track-straight.glb"); let twinOff = 0;
    for (let i = 0; i < tw.verts; i++) { const c = K.sampleColormap(img, tw.uvs[i * 2], tw.uvs[i * 2 + 1]); for (let k = 0; k < 3; k++) if (Math.abs(c[k] - twinCols[i * 4 + k]) > 1e-6) twinOff++; }
    ok("*** bakeColours equals a gate-side sample of the colormap at (u, v) for every vertex of the track tile ***", twinOff === 0, `${twinOff} channels differ of ${tw.verts * 3}`);
    const cen = K.colourCensus(twinCols);
    ok("track-straight is asphalt with kerbs: the most common colour dark grey, the second red, white among the top four", cen.length >= 4 && cen[0].rgb[0] < 70 && Math.abs(cen[0].rgb[0] - cen[0].rgb[2]) < 10 && cen[1].rgb[0] > 190 && cen[1].rgb[1] < 100 && cen.slice(0, 4).some((c) => c.rgb[0] > 180 && c.rgb[1] > 190 && c.rgb[2] > 220), JSON.stringify(cen.slice(0, 3)));
    ok("grass.glb is green at every vertex", hueShare(kits.city.colours.get("grass.glb"), (r, g, b) => g > r && g > b) === 1, `${kits.city.colours.get("grass.glb").length / 4} vertices`);
    const m = kits.racing.models.get("vehicle-truck-red.glb"), flippedCols = new Float32Array(m.verts * 4);
    for (let i = 0; i < m.verts; i++) { const c = K.sampleColormap(img, m.uvs[i * 2], 1 - m.uvs[i * 2 + 1]); flippedCols.set([c[0], c[1], c[2], 1], i * 4); }
    const fc = K.colourCensus(flippedCols);
    ok("*** the colormap sampled with v flipped is ALL BLACK (a gate-side sample): the palette's lower half is empty, so a flipped-v sampler cannot pass as colour ***", fc.length === 1 && fc[0].rgb.join() === "0,0,0", JSON.stringify(fc.slice(0, 2)));
    const crossCols = K.bakeColours(m, kits.city.image), cross = K.colourCensus(crossCols);
    ok("the red truck baked against the CITY colormap is a different truck (the two palettes are not interchangeable)", cross.length > 0 && (hueShare(crossCols, isRed) !== red || cross[0].rgb.join() !== K.colourCensus(kits.racing.colours.get("vehicle-truck-red.glb"))[0].rgb.join()), `cross red share ${(hueShare(crossCols, isRed) * 100).toFixed(1)} %`);
    const px = K.sampleColormap(img, 0.5, 0.5), edge = K.sampleColormap(img, 1, 1);
    ok("sampleColormap clamps: uv (1, 1) reads the last texel rather than one past it", edge.length === 3 && px.length === 3 && edge.every((v) => v >= 0 && v <= 1));
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("5. the pack, the grid and the quaternion");
{
    const R = kits.racing, P = R.packed;
    ok("packMeshes' lit layout: 40-byte stride, 10 floats, nothing missing", P.stride === 40 && P.floats === 10 && P.missing.length === 0 && P.stride === G.LAYOUTS.lit.reduce((s, a) => s + a.size, 0) * 4);
    const rangeOk = K.MANIFEST.filter((e) => e.kit === "racing").every((e) => { const r = R.ranges.get(e.file); return r && r.indexCount === e.tris * 3; });
    ok("one range per model with the manifest's index count", R.ranges.size === 13 && rangeOk && P.vertexData.length / 10 === [...R.models.values()].reduce((s, m) => s + m.verts, 0), `${P.vertexData.length / 10} vertices, ${P.indexData.length} indices`);
    // the interleaved colour of the red truck's first vertex is its baked colour, between its position and its normal
    const off = R.order.slice(0, R.order.indexOf("vehicle-truck-red.glb")).reduce((s, f) => s + R.models.get(f).verts, 0) * 10, c = R.colours.get("vehicle-truck-red.glb"), m = R.models.get("vehicle-truck-red.glb");
    ok("the interleaved vertex is position, then the baked colour, then the normal", near(P.vertexData[off], m.positions[0]) && near(P.vertexData[off + 3], c[0]) && near(P.vertexData[off + 4], c[1]) && near(P.vertexData[off + 5], c[2]) && near(P.vertexData[off + 6], 1) && near(P.vertexData[off + 7], m.normals[0]));
    const again = await K.loadKit("racing", { readBytes, readImage });
    ok("the kit hash is the same twice and differs between kits", again.hash === R.hash && R.hash !== kits.city.hash, `racing ${R.hash}, city ${kits.city.hash}`);
    const grid = K.kitGrid();
    let close = 0; for (let i = 0; i < grid.length; i++) for (let j = i + 1; j < grid.length; j++) { const d = Math.hypot(grid[i].pos[0] - grid[j].pos[0], grid[i].pos[2] - grid[j].pos[2]); if (d < 13 - 1e-9) close++; }
    ok("kitGrid places 28 models at least a pitch apart, the racing tiles at 1 x, the trucks at 10 / 2.8 and the city kit at 10 x, the city rows below the racing rows", grid.length === 28 && close === 0 && grid.filter((p) => K.entryOf(p.file).tile && K.entryOf(p.file).kit === "racing").every((p) => p.scale === 1) && near(grid.find((p) => p.file === "vehicle-truck-red.glb").scale, 10 / 2.8) && grid.slice(13).every((p) => p.scale === 10) && Math.min(...grid.slice(13).map((p) => p.pos[2])) > Math.max(...grid.slice(0, 13).map((p) => p.pos[2])));
    const q = K.yawQuat(Math.PI / 2), v = rotateQ(q, [1, 0, 0]);
    ok("yawQuat(90 deg) sends +x to -z through rotateQ (the same rotation the shader's quat mode applies)", near(v[0], 0, 1e-6) && near(v[1], 0, 1e-6) && near(v[2], -1, 1e-6), v.map((x) => x.toFixed(3)).join(","));
    ok("  and yawQuat(0) is the identity", K.yawQuat(0).join() === "0,0,0,1");
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("6. ON BOTH BACKENDS: the page's grid from above, every cell lit, the hues where the files put them, the gate turned by its quaternion");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const W = 400, H = 250, FOV = 0.9, eye = [39, 150, 27], target = [39, 0, 26];
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, FOV, eye, target }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const G = await import("/render/gpuDriven.mjs");
            const L = await import("/render/litSphere.mjs");
            const K = await import("/world/kenneyKit.mjs");
            const { W, H, FOV, eye, target } = a; const out = {};
            const readBytes = async (p) => { const r = await fetch("/" + p); if (!r.ok) throw new Error(p + ": HTTP " + r.status); return r.arrayBuffer(); };
            const readImage = async (p) => { const r = await fetch("/" + p); if (!r.ok) throw new Error(p + ": HTTP " + r.status); const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" }); const oc = new OffscreenCanvas(bmp.width, bmp.height), ctx = oc.getContext("2d"); ctx.drawImage(bmp, 0, 0); return K.imageToColormap(ctx.getImageData(0, 0, bmp.width, bmp.height)); };
            const t0 = performance.now(), baseUrlOf = (p) => new URL("/" + p, location.href).href, racing = await K.loadKit("racing", { readBytes, readImage, baseUrlOf }), city = await K.loadKit("city", { readBytes, readImage, baseUrlOf }), loadMs = performance.now() - t0;
            const loaded = { models: new Map([...racing.models, ...city.models]), colours: new Map([...racing.colours, ...city.colours]), ranges: new Map([...racing.ranges, ...city.ranges]) };
            const grid = K.kitGrid();
            const cam = { viewProj: G.multiply(G.perspective(FOV, W / H, 0.5, 600), G.lookAt(eye, target)), eye };
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 300)));
                const sc = K.kitScene(dev, loaded, grid, G, L);
                const f = await sc.frame({ ...cam, read: true, clear: [0, 0, 0, 1] }).pixels;
                // the finish gate alone, flat and turned a quarter
                const flat = K.kitScene(dev, loaded, [{ file: "track-finish.glb", pos: [39, 0, 26], scale: 1, quat: K.yawQuat(0) }], G, L);
                const ff = await flat.frame({ ...cam, read: true, clear: [0, 0, 0, 1] }).pixels;
                const turned = K.kitScene(dev, loaded, [{ file: "track-finish.glb", pos: [39, 0, 26], scale: 1, quat: K.yawQuat(Math.PI / 2) }], G, L);
                const ft = await turned.frame({ ...cam, read: true, clear: [0, 0, 0, 1] }).pixels;
                out[backend] = { path: sc.path, errs, fleets: sc.kitFleets.length, pixels: Array.from(f.pixels), flat: Array.from(ff.pixels), turned: Array.from(ft.pixels) };
                sc.destroy(); flat.destroy(); turned.destroy(); dev.destroy();
            }
            return { ...out, grid, hashes: { racing: racing.hash, city: city.hash }, loadMs, failed: [...racing.failed, ...city.failed] };
        }` });
        ok("both backends loaded both kits in the browser and drew the grid", r.ok && r.result && r.result.webgpu && r.result.webgl2 && r.result.webgpu.errs.length === 0 && r.result.failed.length === 0, r.ok ? ((r.result.webgpu && r.result.webgpu.errs) || []).join(" | ").slice(0, 300) + JSON.stringify(r.result.failed || []) : (r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 400));
        if (r.ok && r.result.webgpu && r.result.webgl2) {
            const R = r.result, N = W * H;
            report(`the browser loaded and baked both kits in ${R.loadMs.toFixed(0)} ms; ${R.webgpu.fleets} fleets on ${R.webgpu.path}, ${R.webgl2.fleets} on ${R.webgl2.path}`);
            ok("*** the browser's kit hashes equal node's: the same bytes, the same colormap texels, the same pack in both runtimes ***", R.hashes.racing === kits.racing.hash && R.hashes.city === kits.city.hash, `browser ${R.hashes.racing}/${R.hashes.city}, node ${kits.racing.hash}/${kits.city.hash}`);
            const vp = G.multiply(G.perspective(FOV, W / H, 0.5, 600), G.lookAt(eye, target));
            const project = (p) => { const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12], y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13], w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15]; return [Math.round((x / w * 0.5 + 0.5) * W), Math.round((1 - (y / w * 0.5 + 0.5)) * H)]; };
            const window_ = (px, cx, cy, half) => { const out = []; for (let y = cy - half; y <= cy + half; y++) for (let x = cx - half; x <= cx + half; x++) if (x >= 0 && y >= 0 && x < W && y < H) { const o = (y * W + x) * 4; out.push([px[o], px[o + 1], px[o + 2]]); } return out; };
            const lit = (c) => c[0] + c[1] + c[2] > 30;
            const bbox = (px) => { let x0 = W, x1 = -1, y0 = H, y1 = -1; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; if (px[o] + px[o + 1] + px[o + 2] > 30) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } } return { w: x1 - x0 + 1, h: y1 - y0 + 1 }; };
            const apart = (A, B) => { let n = 0; for (let p = 0; p < N; p++) if (Math.abs(A[p * 4] - B[p * 4]) > 8 || Math.abs(A[p * 4 + 1] - B[p * 4 + 1]) > 8 || Math.abs(A[p * 4 + 2] - B[p * 4 + 2]) > 8) n++; return n; };
            for (const bk of ["webgpu", "webgl2"]) {
                const px = R[bk].pixels, dark = [];
                for (const g of R.grid) { const [cx, cy] = project([g.pos[0], 1, g.pos[2]]); const w = window_(px, cx, cy, 4), n = w.filter(lit).length; if (n < w.length * 0.5) dark.push(`${g.file} ${n}/${w.length}`); }
                ok(`*** ${bk}: every one of the 28 placements lights its cell (a 9 x 9 window at its centre at least half lit) ***`, dark.length === 0, dark.join("; ") || "28 lit");
                const hue = (file, pred) => { const g = R.grid.find((p) => p.file === file), [cx, cy] = project([g.pos[0], 1, g.pos[2]]), w = window_(px, cx, cy, 5).filter(lit); return w.filter((c) => pred(c[0] / 255, c[1] / 255, c[2] / 255)).length / Math.max(1, w.length); };
                const redCell = hue("vehicle-truck-red.glb", (r_, g_, b_) => r_ > g_ * 1.6 && r_ > b_ * 1.6), greenCell = hue("vehicle-truck-green.glb", (r_, g_, b_) => g_ > r_ * 1.5 && g_ > b_ * 1.1), grassCell = hue("grass.glb", (r_, g_, b_) => g_ > r_ && g_ > b_), roadCell = hue("road-straight.glb", (r_, g_, b_) => Math.abs(r_ - g_) < 0.12 && b_ >= g_ - 0.02);
                const redOnGreen = hue("vehicle-truck-green.glb", (r_, g_, b_) => r_ > g_ * 1.6 && r_ > b_ * 1.6), greenOnRed = hue("vehicle-truck-red.glb", (r_, g_, b_) => g_ > r_ * 1.5 && g_ > b_ * 1.1);
                report(`${bk}: red truck cell ${(redCell * 100).toFixed(0)} % red (${(greenOnRed * 100).toFixed(0)} % green), green truck cell ${(greenCell * 100).toFixed(0)} % green (${(redOnGreen * 100).toFixed(0)} % red), grass cell ${(grassCell * 100).toFixed(0)} % green, road cell ${(roadCell * 100).toFixed(0)} % grey`);
                ok(`  ${bk}: the red truck's cell is red where the green truck's is green, the grass green and the road grey -- the colormap reached the frame`, redCell > 0.5 && greenCell > 0.3 && grassCell > 0.8 && roadCell > 0.6 && redOnGreen < redCell * 0.5 && greenOnRed < greenCell * 0.5, `red on the green cell ${(redOnGreen * 100).toFixed(0)} %, green on the red cell ${(greenOnRed * 100).toFixed(0)} %`);
                const fb = bbox(R[bk].flat), tb = bbox(R[bk].turned);
                ok(`  ${bk}: the finish gate is wider than tall flat and taller than wide turned a quarter -- the quaternion in the extras turns it`, fb.w > fb.h * 1.2 && tb.h > tb.w * 1.2, `flat ${fb.w} x ${fb.h}, turned ${tb.w} x ${tb.h}`);
            }
            ok("  the two backends agree on the grid within 8 of 255 on all but edge pixels (fewer than 3 %)", apart(R.webgpu.pixels, R.webgl2.pixels) < N * 0.03, `${apart(R.webgpu.pixels, R.webgl2.pixels)} apart`);
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: that the README's CC0 claim for the models is a grant (it is Kenney's word in a README, not a licence file; the MIT is what is carried); the FBX collision hulls that stayed upstream; KHR_texture_transform, declared by every model and ignored by the parser (no offset or scale is set in any material, read from the JSON); the page's pick and orbit (eyeballed).");
process.exit(fails ? 1 : 0);
