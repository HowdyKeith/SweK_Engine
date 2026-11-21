#!/usr/bin/env node
// WebGLEngine/tools/splatPack.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A SPLAT CAPTURE TO A STREAMABLE FILE. Keith: "4" -- turn a real .ply (or .splat) into a .swlod that splat-gpu.html?swlod= streams, so a big capture opens
// coarse at once and sharpens as the camera moves. It reads the file with the page's own parser (engine/splatParser.js), builds the level-of-detail octree
// (render/splatLod.mjs buildLod) and packs it, compressed by default (17 bytes a splat; --plain writes f32, 56).
//
//   node tools/splatPack.mjs <in.ply|in.splat> [out.swlod] [--leaf 256] [--proxies 64] [--plain]
//
// Then open:  splat-gpu.html?swlod=/path/to/out.swlod&budget=300000   (the bridge serves files with Range requests; any static server that answers Range works)
// It prints what it made: splats, nodes, depth, the file's size and how much smaller than plain f32. Held by tools/splatPack-selfcheck.mjs.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseSplatFile } from "../engine/splatParser.js";
import { buildLod, packLod, FLOATS } from "../render/splatLod.mjs";

/** Pack a capture's bytes. Returns { bytes, stats }. Pure apart from the parser. */
export function pack(arrayBuffer, fileName, { leaf = 256, proxies = 64, plain = false } = {}) {
    const cloud = parseSplatFile(arrayBuffer, fileName);
    if (!(cloud && cloud.count > 0)) throw new Error(`splatPack: ${fileName} holds no splats`);
    const lod = buildLod(cloud, { leafSize: leaf, proxies }), bytes = packLod(lod, { compress: !plain });
    const depthOf = (id) => { let d = 0; for (let n = lod.nodes[id]; n.parent >= 0; n = lod.nodes[n.parent]) d++; return d; };
    const stats = { splats: cloud.count, nodes: lod.nodes.length, leaves: lod.nodes.filter((n) => n.leaf).length, depth: Math.max(...lod.nodes.filter((n) => n.leaf).map((n) => depthOf(n.id))), bytes: bytes.length, plainBytes: plain ? bytes.length : null, compressed: !plain };
    if (!plain) stats.plainBytes = lod.nodes.reduce((t, n) => t + n.records.length * 4, 0) + (bytes.length - lod.nodes.reduce((t, n) => t + (n.records.length / FLOATS) * 17 + 72, 0));
    return { bytes, stats, lod };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), opt = (k, d) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; };
    const known = ["leaf", "proxies", "plain"], bad = rest.filter((x) => x.startsWith("--") && !known.includes(x.slice(2)));
    if (bad.length) { console.error(`splatPack: unknown option ${bad.join(", ")}`); process.exit(2); }
    const files = rest.filter((x, i) => !x.startsWith("--") && !(i > 0 && ["--leaf", "--proxies"].includes(rest[i - 1])));
    if (!files.length) { console.error("usage: node tools/splatPack.mjs <in.ply|in.splat> [out.swlod] [--leaf 256] [--proxies 64] [--plain]"); process.exit(2); }
    const input = files[0], output = files[1] || input.replace(/\.(ply|splat)$/i, "") + ".swlod";
    if (!fs.existsSync(input)) { console.error(`splatPack: ${input} does not exist`); process.exit(1); }
    const buf = fs.readFileSync(input), t0 = Date.now();
    const leaf = Number(opt("leaf", 256)), proxies = Number(opt("proxies", 64));
    if (!(leaf >= 8 && proxies >= 8)) { console.error("splatPack: --leaf and --proxies must be at least 8"); process.exit(2); }
    const { bytes, stats } = pack(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), path.basename(input), { leaf, proxies, plain: rest.includes("--plain") });
    fs.writeFileSync(output, bytes);
    console.log(`wrote ${output}: ${stats.splats.toLocaleString()} splats in ${stats.nodes.toLocaleString()} nodes (${stats.leaves.toLocaleString()} leaves, depth ${stats.depth}), ${(stats.bytes / 1e6).toFixed(2)} MB${stats.compressed ? ` -- ${(stats.plainBytes / stats.bytes).toFixed(2)}x smaller than plain f32` : " (plain f32)"}, in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    console.log(`open it: splat-gpu.html?swlod=/${path.relative(process.cwd(), output).split(path.sep).join("/")}&budget=300000`);
}
