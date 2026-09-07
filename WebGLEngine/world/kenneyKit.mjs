// WebGLEngine/world/kenneyKit.mjs -- Racing city 0 (task 63)
//
// THE MANIFEST OF KENNEY'S TWO STARTER KITS, AS DATA, AND THE ROUTE FROM A .glb TO A gpuDriven FLEET.
//
// vendor/kenney-racing and vendor/kenney-city hold the models of KenneyNL/Starter-Kit-Racing and KenneyNL/Starter-Kit-City-Builder
// (MIT, (c) Kenney; each README calls the models CC0). Nothing else of either Godot project came: no scenes, no scripts, no
// MeshLibrary, no FBX collision hulls. What this tree needs of them is exactly what the racing city's rounds need -- road tiles a
// track is laid from (round 1), cars a brain learns to drive (rounds 2 and 3), small buildings as the reference CityGen's voxel
// buildings stand beside (round 7) -- so the manifest lists every model that was taken with its byte size, the first twelve hex of
// its sha256, its vertex and triangle counts, and its ROLE. tools/ship/kenneyKit-selfcheck.mjs holds the list to the folder in
// both directions: a model on disk that is not listed is an undeclared dependency, a listed one that is not on disk is a stale
// record, and a byte that moved is a different file under the same name.
//
// ---- HOW A KENNEY MODEL BECOMES A LIT MESH, AND WHY THE COLOUR IS BAKED RATHER THAN SAMPLED ---------------------------------------
//
// Every model is UnityGLTF output with POSITION, NORMAL, TANGENT and TEXCOORD_0, one material, one texture: the kit's 512 x 512
// colormap.png, sampled NEAREST (magFilter 9728). The palette is flat colour cells, so each vertex's uv names one texel, and a
// vertex colour read from that texel at load time IS the colour the texture would give -- no filtering is lost because there was
// none. Baking it means the model draws through render/litSphere.mjs's lit pipeline UNCHANGED (p3, colour4, n3 -- gpuDriven's own
// LAYOUTS.lit) in its quat mode, with no texture binding, no sampler and no shader text of this module's own; the dual-language
// census stays where v4514 left it. The two kits' colormaps are NOT the same file (they differ from byte 46), so each kit bakes
// against its own.
//
// The parser is gpu/GLBParser.js through gpu/glbLoad.js's router, which is the tree's front door for a .glb: the router reads the
// header, sees no Draco, and hands the bytes to the plain parser. The parser walks the scene graph and applies the node transforms,
// so a truck's wheels arrive already at (+-0.55, 0.3, -0.657 / 0.857) in the model's frame; the node names and translations are
// kept as `parts` because round 2 hangs wheel joints on them.
//
// ---- THE TWO GRIDS ----------------------------------------------------------------------------------------------------------------
//
// The racing kit's tiles are 10 units square (track-straight spans [-5, 5] on x and z; the Godot GridMap uses 9.99 so adjacent
// tiles do not z-fight) and the finish gate is 14 wide, overhanging its cell by 2 each side. The city kit's tiles are 1 unit square
// with buildings up to 1.75 tall. Both are recorded as KITS.<kit>.cell and the gate measures the footprints against them.
"use strict";
import { loadGlb } from "../gpu/glbLoad.js";
import { GLBParser } from "../gpu/GLBParser.js";
import { packMeshes, LAYOUTS, EXTRA_FLOATS, RECORD_FLOATS } from "../render/gpuDriven.mjs";
import { litPipelineDesc, litBind } from "../render/litSphere.mjs";

/** The two kits: where each lives, what papers it, where its models and colormap are and how big a tile is. */
export const KITS = Object.freeze({
    // `models` and `colormap` are whole specifiers rather than pieces joined at runtime, so tools/ship/importPosition.mjs's rule
    // sees this module DEPEND on the two bodies (a path it handles) instead of filing it as a record that merely names them
    racing: Object.freeze({ dir: "vendor/kenney-racing", licence: "LICENSE", licenceSha: "db2c350e9673", holder: "2023 Kenney",
        upstream: "https://github.com/KenneyNL/Starter-Kit-Racing", commit: "2f2e5f2646dda89cb21d4e8539bab60c6e955dc8",
        models: "vendor/kenney-racing/models", colormap: "vendor/kenney-racing/models/Textures/colormap.png", colormapSha: "02bb3fb87365", cell: 10 }),
    city: Object.freeze({ dir: "vendor/kenney-city", licence: "LICENSE.md", licenceSha: "8e99e4045f71", holder: "2025 Kenney",
        upstream: "https://github.com/KenneyNL/Starter-Kit-City-Builder", commit: "4535092b740b378b700efd9df9e27a631815b84a",
        models: "vendor/kenney-city/models", colormap: "vendor/kenney-city/models/Textures/colormap.png", colormapSha: "106cf02e0d6d", cell: 1 }),
});

export const ROLE = Object.freeze({ TRACK: "track", DECOR: "decor", VEHICLE: "vehicle", ROAD: "road", GROUND: "ground", BUILDING: "building" });

/** Every model taken, with the bytes and hash the gate holds the folder to. `span` is the larger of its x and z extents as parsed
 *  (the gate holds it within 1 %); `tile` says the model fills its kit's cell footprint. */
export const MANIFEST = Object.freeze([
    { kit: "racing", file: "track-straight.glb",           span: 10, role: ROLE.TRACK,    bytes: 11080,  sha: "2d8080df1fe2", verts: 188,  tris: 106,  tile: true },
    { kit: "racing", file: "track-corner.glb",             span: 10.056, role: ROLE.TRACK,    bytes: 103480, sha: "0ffb3d83b604", verts: 1976, tris: 1136, tile: true },
    { kit: "racing", file: "track-finish.glb",             span: 14.035, role: ROLE.TRACK,    bytes: 24544,  sha: "2fec3b681658", verts: 440,  tris: 274,  tile: false },   // 14 wide: the gate overhangs its cell by 2 each side
    { kit: "racing", file: "track-bump.glb",               span: 3.38, role: ROLE.TRACK,    bytes: 17888,  sha: "6db020edc535", verts: 312,  tris: 166,  tile: false },   // a 3.4-unit bump laid ON a tile
    { kit: "racing", file: "track-tents.glb",              span: 10, role: ROLE.TRACK,    bytes: 167988, sha: "eaf68bbb44e3", verts: 3224, tris: 1900, tile: true },
    { kit: "racing", file: "decoration-empty.glb",         span: 10.164, role: ROLE.DECOR,    bytes: 55764,  sha: "3815b26a5274", verts: 1048, tris: 596,  tile: true },
    { kit: "racing", file: "decoration-forest.glb",        span: 10, role: ROLE.DECOR,    bytes: 189784, sha: "664a53f0f709", verts: 3664, tris: 2006, tile: true },
    { kit: "racing", file: "decoration-tents.glb",         span: 10, role: ROLE.DECOR,    bytes: 168004, sha: "19dbf2a778ad", verts: 3224, tris: 1900, tile: true },
    { kit: "racing", file: "vehicle-truck-red.glb",        span: 2.8, role: ROLE.VEHICLE,  bytes: 92436,  sha: "eca99bd9ab0a", verts: 1664, tris: 946,  tile: false },
    { kit: "racing", file: "vehicle-truck-green.glb",      span: 2.903, role: ROLE.VEHICLE,  bytes: 104228, sha: "df362d027a09", verts: 1890, tris: 1104, tile: false },
    { kit: "racing", file: "vehicle-truck-purple.glb",     span: 2.8, role: ROLE.VEHICLE,  bytes: 78552,  sha: "03e32f5abcbb", verts: 1392, tris: 814,  tile: false },
    { kit: "racing", file: "vehicle-truck-yellow.glb",     span: 2.8, role: ROLE.VEHICLE,  bytes: 93480,  sha: "1ebd83174eab", verts: 1681, tris: 989,  tile: false },
    { kit: "racing", file: "vehicle-motorcycle.glb",       span: 2.435, role: ROLE.VEHICLE,  bytes: 97172,  sha: "c97911b8dbc2", verts: 1786, tris: 960,  tile: false },
    { kit: "city",   file: "road-straight.glb",            span: 1, role: ROLE.ROAD,     bytes: 6148,   sha: "008a6305de77", verts: 88,   tris: 54,   tile: true },
    { kit: "city",   file: "road-straight-lightposts.glb", span: 1, role: ROLE.ROAD,     bytes: 18216,  sha: "fc5340621fef", verts: 316,  tris: 190,  tile: true },
    { kit: "city",   file: "road-corner.glb",              span: 1, role: ROLE.ROAD,     bytes: 11096,  sha: "85aec60d66c5", verts: 188,  tris: 126,  tile: true },
    { kit: "city",   file: "road-split.glb",               span: 1, role: ROLE.ROAD,     bytes: 9400,   sha: "31bf582953db", verts: 154,  tris: 100,  tile: true },
    { kit: "city",   file: "road-intersection.glb",        span: 1, role: ROLE.ROAD,     bytes: 13140,  sha: "0212ffe9945b", verts: 228,  tris: 154,  tile: true },
    { kit: "city",   file: "pavement.glb",                 span: 1, role: ROLE.GROUND,   bytes: 3620,   sha: "60152776325d", verts: 40,   tris: 20,   tile: true },
    { kit: "city",   file: "pavement-fountain.glb",        span: 1, role: ROLE.GROUND,   bytes: 14076,  sha: "ea2996089e90", verts: 248,  tris: 152,  tile: true },
    { kit: "city",   file: "grass.glb",                    span: 1, role: ROLE.GROUND,   bytes: 4604,   sha: "3e3ec91132ad", verts: 60,   tris: 30,   tile: true },
    { kit: "city",   file: "grass-trees.glb",              span: 1, role: ROLE.GROUND,   bytes: 38160,  sha: "cb06d03cc1c6", verts: 712,  tris: 380,  tile: true },
    { kit: "city",   file: "grass-trees-tall.glb",         span: 1.072, role: ROLE.GROUND,   bytes: 47016,  sha: "d23e3b722453", verts: 884,  tris: 472,  tile: true },
    { kit: "city",   file: "building-garage.glb",          span: 1, role: ROLE.BUILDING, bytes: 19204,  sha: "7373b558fc9b", verts: 340,  tris: 196,  tile: true },
    { kit: "city",   file: "building-small-a.glb",         span: 1, role: ROLE.BUILDING, bytes: 39660,  sha: "22ce989013bd", verts: 734,  tris: 452,  tile: true },
    { kit: "city",   file: "building-small-b.glb",         span: 1, role: ROLE.BUILDING, bytes: 49764,  sha: "0bc845904597", verts: 926,  tris: 600,  tile: true },
    { kit: "city",   file: "building-small-c.glb",         span: 1, role: ROLE.BUILDING, bytes: 70088,  sha: "3ea0f46fbed4", verts: 1320, tris: 834,  tile: true },
    { kit: "city",   file: "building-small-d.glb",         span: 1.05, role: ROLE.BUILDING, bytes: 39348,  sha: "0ab476fbd795", verts: 728,  tris: 448,  tile: true },
].map(Object.freeze));

/** The wheel and body parts a truck must carry for round 2's joints, at the translations UnityGLTF wrote (the parser applies them). */
export const TRUCK_PARTS = Object.freeze({
    "wheel-front-left":  Object.freeze([0.55, 0.3, 0.857]), "wheel-front-right": Object.freeze([-0.55, 0.3, 0.857]),
    "wheel-back-left":   Object.freeze([0.55, 0.3, -0.657]), "wheel-back-right":  Object.freeze([-0.55, 0.3, -0.657]),
    body: Object.freeze([0, 0.4, 0]), underside: Object.freeze([0, 0.3, 0.1]),
});

/** The path of a manifest entry's bytes, relative to WebGLEngine/. */
export const modelPath = (e) => `${KITS[e.kit].models}/${e.file}`;
/** The manifest entry for a file name, or null. */
export const entryOf = (file) => MANIFEST.find((e) => e.file === file) || null;
/** The entries of one kit, or of one role. */
export const ofKit = (kit) => MANIFEST.filter((e) => e.kit === kit);
export const ofRole = (role) => MANIFEST.filter((e) => e.role === role);

/**
 * Parse one model's bytes through the tree's .glb front door. Returns { ok, route, positions, normals, uvs, indices, bounds, parts,
 * verts, tris } or { ok: false, error }. Post-processing is OFF: the kit's normals are the flat ones its faceted look wants, and a
 * weld would merge the palette's uv islands into one vertex with one colour.
 */
export async function parseKitModel(buffer, { baseUrl = null, parsePlain = null } = {}) {
    // baseUrl lets the parser resolve the model's own "Textures/colormap.png" (a page hands it the model's URL, so the browser does
    // not log a 404 per model); the bitmap it decodes is not used -- the colours are baked below from the kit's colormap directly
    const plain = parsePlain || ((b) => GLBParser.parse(b instanceof ArrayBuffer ? b : b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), { postProcess: false, ...(baseUrl ? { baseUrl } : {}) }));
    const r = await loadGlb(buffer, { parsePlain: plain });
    if (!r.ok) return { ok: false, route: r.route || null, error: r.error };
    const p = r.result;
    if (!p || !p.positions || !p.normals || !p.texCoords || !p.indices) return { ok: false, route: r.route, error: "the parse carries no positions, normals, texCoords or indices" };
    const verts = p.positions.length / 3;
    if (p.normals.length !== verts * 3 || p.texCoords.length !== verts * 2) return { ok: false, route: r.route, error: `attribute lengths disagree: ${verts} positions, ${p.normals.length / 3} normals, ${p.texCoords.length / 2} uvs` };
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.positions.length; i += 3) for (let a = 0; a < 3; a++) { const v = p.positions[i + a]; if (v < min[a]) min[a] = v; if (v > max[a]) max[a] = v; }
    const parts = (p.nodes || []).map((n) => ({ name: n.name || "", translation: Array.from(n.translation || [0, 0, 0]) }));
    return { ok: true, route: r.route, positions: p.positions, normals: p.normals, uvs: p.texCoords, indices: p.indices,
             bounds: { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] }, parts, verts, tris: p.indices.length / 3 };
}

/** The texel a glTF uv names on an image { width, height, channels, data } (uv origin top-left, v down): [r, g, b] in 0..1, nearest. */
export function sampleColormap(img, u, v) {
    const x = Math.min(img.width - 1, Math.max(0, Math.floor(u * img.width))), y = Math.min(img.height - 1, Math.max(0, Math.floor(v * img.height)));
    const o = (y * img.width + x) * img.channels;
    return [img.data[o] / 255, img.data[o + 1] / 255, img.data[o + 2] / 255];
}

/** Per-vertex colours (4 floats each, alpha 1) baked from the model's uvs against the kit's colormap. */
export function bakeColours(model, img) {
    const n = model.verts, out = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { const c = sampleColormap(img, model.uvs[i * 2], model.uvs[i * 2 + 1]); out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 1; }
    return out;
}

/** A model plus its baked colours as the mesh shape packMeshes takes. */
export const kitMesh = (model, colors) => ({ positions: model.positions, normals: model.normals, colors, indices: model.indices, color: [1, 1, 1, 1] });

/** The distinct colours a colour array carries, as "r,g,b" at 8 bits, with counts, most common first. */
export function colourCensus(colors) {
    const m = new Map();
    for (let i = 0; i < colors.length; i += 4) { const k = `${Math.round(colors[i] * 255)},${Math.round(colors[i + 1] * 255)},${Math.round(colors[i + 2] * 255)}`; m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([rgb, count]) => ({ rgb: rgb.split(",").map(Number), count }));
}

/** An { width, height, channels: 4, data } image from a browser ImageData (the page's route; the gate decodes the PNG in node). */
export const imageToColormap = (imageData) => ({ width: imageData.width, height: imageData.height, channels: 4, data: imageData.data });

/** FNV-1a over a packed kit's bytes, so two loads of the same folder against the same colormap hash the same. */
export function kitHash(packed) {
    let h = 0x811c9dc5; const v = new Uint8Array(packed.vertexData.buffer), ix = new Uint8Array(packed.indexData.buffer);
    for (let i = 0; i < v.length; i++) { h ^= v[i]; h = Math.imul(h, 0x01000193); }
    for (let i = 0; i < ix.length; i++) { h ^= ix[i]; h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Load a whole kit: `readBytes(relPath)` returns the file's bytes (ArrayBuffer or Uint8Array), `readImage(relPath)` its colormap as
 * { width, height, channels, data }, `baseUrlOf(relPath)` (optional, a page's) the URL the parser resolves the model's texture from. Returns { kit, image, models: Map(file -> model), colours: Map(file -> Float32Array), meshes,
 * packed, ranges: Map(file -> packMeshes range), hash, failed: [{ file, error }] }. Nothing is thrown for a bad model: it is named.
 */
export async function loadKit(kitName, { readBytes, readImage, baseUrlOf = null, entries = ofKit(kitName) }) {
    const kit = KITS[kitName]; if (!kit) throw new Error(`kenneyKit: no kit named ${JSON.stringify(kitName)}`);
    const image = await readImage(kit.colormap);
    const models = new Map(), colours = new Map(), failed = [], meshes = [], order = [];
    for (const e of entries) {
        const m = await parseKitModel(await readBytes(modelPath(e)), baseUrlOf ? { baseUrl: baseUrlOf(modelPath(e)) } : {});
        if (!m.ok) { failed.push({ file: e.file, error: m.error }); continue; }
        const c = bakeColours(m, image);
        models.set(e.file, m); colours.set(e.file, c); meshes.push(kitMesh(m, c)); order.push(e.file);
    }
    const packed = packMeshes(meshes, LAYOUTS.lit), ranges = new Map();
    order.forEach((f, i) => ranges.set(f, packed.ranges[i]));
    return { kit: kitName, image, models, colours, meshes, packed, ranges, order, hash: kitHash(packed), failed };
}

/** A quaternion [x, y, z, w] for a yaw about +y, the shape litSphere's quat mode and voxelBodies.rotateQ read. */
export const yawQuat = (yaw) => [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];

/**
 * A showcase grid: one placement per model, each kit on its own rows, every model at the same size across (a tile at its kit's cell, a
 * truck or the bump scaled up by its span, the city kit at 10 x so a 1-unit tile sits beside a 10-unit one). Returns [{ file, pos,
 * scale, quat }], `pitch` units apart.
 */
export function kitGrid(entries = MANIFEST, { pitch = 13, perRow = 7, size = 10 } = {}) {
    const out = []; let row = 0, col = 0, kit = null;
    for (const e of entries) {
        if (kit !== null && e.kit !== kit) { row++; col = 0; }
        if (col >= perRow) { row++; col = 0; }
        kit = e.kit;
        // every model shown at `size` units across: a tile at its kit's cell, a truck (2.8 across) at 3.6 x, a city tile at 10 x
        out.push({ file: e.file, pos: [col * pitch, 0, row * pitch], scale: size / (e.tile ? KITS[e.kit].cell : e.span), quat: yawQuat(0) });
        col++;
    }
    return out;
}

/**
 * The placements as a gpuDriven scene: one fleet per distinct model, in first-appearance order, every placement a record (position,
 * uniform scale) with its quaternion in the extras, drawn by litSphere's lit pipeline in quat mode. The records and extras are
 * static Float32Arrays (nothing here moves; a mover brings its own buffer, per round 4's finding). Returns the scene with `fleets`
 * (the file names in fleet order) and `fleetOf` beside it.
 */
export function kitScene(device, loaded, placements, G, L, { light = [600, 1400, 400, 0.38], cull = "back" } = {}) {
    const files = []; for (const p of placements) if (!files.includes(p.file)) files.push(p.file);
    const missing = files.filter((f) => !loaded.ranges.has(f)); if (missing.length) throw new Error(`kenneyKit: placements name models the kit did not load: ${missing.join(", ")}`);
    const count = placements.length, records = new Float32Array(count * RECORD_FLOATS), extras = new Float32Array(count * EXTRA_FLOATS), fleetOf = new Uint32Array(count);
    placements.forEach((p, i) => { records.set([p.pos[0], p.pos[1], p.pos[2], p.scale == null ? 1 : p.scale], i * RECORD_FLOATS); extras.set(p.quat || [0, 0, 0, 1], i * EXTRA_FLOATS); fleetOf[i] = files.indexOf(p.file); });
    const pipeline = L.litPipelineDesc({ cull, extra: "quat" }), bind = L.litBind(light);
    const fleets = files.map((f) => { const m = loaded.models.get(f); return { name: f, lods: [{ name: "only", mesh: kitMesh(m, loaded.colours.get(f)) }], layout: G.LAYOUTS.lit, pipeline, bind }; });
    const scene = G.makeGpuDrivenScene(device, { fleets, fleetOf, thresholds: [], records, headings: extras });
    scene.kitFleets = files; scene.kitFleetOf = fleetOf;
    return scene;
}

export { litPipelineDesc as kitPipelineDesc, litBind as kitBind };
