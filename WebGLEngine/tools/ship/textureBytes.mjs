#!/usr/bin/env node
// WebGLEngine/tools/ship/textureBytes.mjs -- v4495
//
// *** TEXTURE BYTES MEASURED BEFORE ANY KTX2 / BASIS DECISION (task 18). *** A compressed-texture pipeline is a
// transcoder (a WASM fetched before the first texture decodes) plus a build step plus a loader; it pays for itself
// only when the textures it compresses outweigh it, on the GPU and on the wire. Nobody had counted. This tool
// walks a folder -- the engine tree by default, the EXTERNAL asset library on a rig (`node tools/ship/textureBytes.mjs
// <folder> --write tools/ship/texture-bytes.json`) -- and for every raster texture file records its bytes on disk
// and, for PNG and JPEG, its pixel size from the file header, from which the GPU bytes follow (RGBA8, with a mip
// chain: w * h * 4 * 4/3). It aggregates by extension and by folder and writes a record the gate grades. The
// decision is derived from the numbers (decide()), not typed beside them.
//
// Library: censusTextures(root, opts) -> { root, files: [{ path, ext, bytes, width, height, gpuBytes }], byExt, byDir,
// totals: { files, bytes, gpuBytes, sized }, skipped }. pngSize(buf) / jpegSize(buf) read the headers.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RASTER_EXTS = Object.freeze([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".ktx2", ".basis", ".hdr", ".exr", ".dds", ".tga"]);
export const SKIP_DIRS = Object.freeze(["node_modules", ".git", "vendor", ".cache", "target"]);
export const MIP_FACTOR = 4 / 3;

/** PNG: the IHDR chunk is always first, width at byte 16, height at byte 20 (big-endian). null when not a PNG. */
export function pngSize(buf) {
    if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString("ascii", 12, 16) !== "IHDR") return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** JPEG: walk the markers from SOI to the first SOFn (C0..CF except C4, C8, CC); height then width, big-endian, after the length and precision. */
export function jpegSize(buf) {
    if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
    let p = 2;
    while (p + 9 < buf.length) {
        if (buf[p] !== 0xFF) { p++; continue; }
        const m = buf[p + 1];
        if (m === 0xFF) { p++; continue; }                                  // fill byte
        if (m === 0xD8 || (m >= 0xD0 && m <= 0xD7) || m === 0x01) { p += 2; continue; }   // standalone markers
        const len = buf.readUInt16BE(p + 2);
        if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { height: buf.readUInt16BE(p + 5), width: buf.readUInt16BE(p + 7) };
        if (m === 0xDA) return null;                                          // scan data before any SOF: not a size we can read
        p += 2 + len;
    }
    return null;
}

export function sizeOf(ext, buf) {
    if (ext === ".png") return pngSize(buf);
    if (ext === ".jpg" || ext === ".jpeg") return jpegSize(buf);
    return null;
}

/** Walk `root` for raster files. opts: { skipDirs, maxFiles, sizes: true } */
export function censusTextures(root, opts = {}) {
    const skip = new Set(opts.skipDirs || SKIP_DIRS);
    const files = [], skipped = [];
    const walk = (dir, depth) => {
        let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { skipped.push(dir); return; }
        for (const e of ents) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { if (!skip.has(e.name) && !e.name.startsWith(".")) walk(full, depth + 1); continue; }
            if (!e.isFile()) continue;
            const ext = path.extname(e.name).toLowerCase();
            if (!RASTER_EXTS.includes(ext)) continue;
            const bytes = fs.statSync(full).size;
            let width = null, height = null;
            if (opts.sizes !== false && (ext === ".png" || ext === ".jpg" || ext === ".jpeg")) {
                try { const fd = fs.openSync(full, "r"); const head = Buffer.alloc(Math.min(bytes, 65536)); fs.readSync(fd, head, 0, head.length, 0); fs.closeSync(fd);
                    const s = sizeOf(ext, head); if (s) { width = s.width; height = s.height; } } catch (e) { /* unsized */ }
            }
            const gpuBytes = width && height ? Math.round(width * height * 4 * MIP_FACTOR) : null;
            files.push({ path: path.relative(root, full).split(path.sep).join("/"), ext, bytes, width, height, gpuBytes });
            if (opts.maxFiles && files.length >= opts.maxFiles) return;
        }
    };
    walk(root, 0);
    const byExt = {}, byDir = {};
    for (const f of files) {
        const x = byExt[f.ext] || (byExt[f.ext] = { files: 0, bytes: 0, gpuBytes: 0, sized: 0 });
        x.files++; x.bytes += f.bytes; if (f.gpuBytes) { x.gpuBytes += f.gpuBytes; x.sized++; }
        const d = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : ".";
        const y = byDir[d] || (byDir[d] = { files: 0, bytes: 0, gpuBytes: 0 });
        y.files++; y.bytes += f.bytes; if (f.gpuBytes) y.gpuBytes += f.gpuBytes;
    }
    const totals = files.reduce((t, f) => ({ files: t.files + 1, bytes: t.bytes + f.bytes, gpuBytes: t.gpuBytes + (f.gpuBytes || 0), sized: t.sized + (f.gpuBytes ? 1 : 0) }), { files: 0, bytes: 0, gpuBytes: 0, sized: 0 });
    return { root: path.resolve(root), files, byExt, byDir, totals, skipped };
}

/**
 * The decision, derived. A transcoder is a fetch of its own (Basis Universal's is a few hundred KB of WASM; the number is
 * NOT vendored here and is not asserted -- `transcoderBytes` is the caller's, default 0 meaning "unknown, count it as
 * free"). KTX2 with UASTC transcodes to BC7 / ASTC at 1 byte a pixel (against RGBA8's 4), ETC1S to about half that; the
 * GPU saving is the RGBA8 GPU bytes times (1 - 1/4) at best. The verdict is 'measure the rig' when the population is
 * tiny, 'consider' when the GPU bytes clear a floor, 'no' when the transcoder outweighs the wire bytes it could save.
 */
export function decide(census, { transcoderBytes = 0, gpuFloorBytes = 64 * 1024 * 1024 } = {}) {
    const t = census.totals;
    const gpuSavingBytes = Math.round(t.gpuBytes * (1 - 1 / 4));
    const largest = census.files.slice().sort((a, b) => (b.gpuBytes || 0) - (a.gpuBytes || 0))[0] || null;
    let verdict, why;
    if (t.files === 0) { verdict = "no-textures"; why = "no raster texture file under the root"; }
    else if (transcoderBytes > 0 && transcoderBytes > t.bytes) { verdict = "no"; why = `a ${transcoderBytes}-byte transcoder outweighs the ${t.bytes} bytes of textures on the wire`; }
    else if (t.gpuBytes < gpuFloorBytes) { verdict = "not-yet"; why = `${t.gpuBytes} GPU bytes across ${t.sized} sized files is under the ${gpuFloorBytes}-byte floor; the saving would be ${gpuSavingBytes}`; }
    else { verdict = "consider"; why = `${t.gpuBytes} GPU bytes; UASTC would save about ${gpuSavingBytes} on the GPU`; }
    return { verdict, why, gpuSavingBytes, largest, transcoderBytes, gpuFloorBytes };
}

export function record(root, opts = {}) {
    const census = censusTextures(root, opts);
    const decision = decide(census, opts);
    return { tool: "textureBytes.mjs", at: "v4495", when: new Date().toISOString(), root: census.root, totals: census.totals, byExt: census.byExt,
             topDirs: Object.entries(census.byDir).sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 12).map(([dir, v]) => ({ dir, ...v })),
             largest: census.files.slice().sort((a, b) => (b.gpuBytes || 0) - (a.gpuBytes || 0)).slice(0, 8), decision, skipped: census.skipped.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2), wi = args.indexOf("--write");
    const out = wi >= 0 ? args[wi + 1] : null;
    const root = args.find((a, i) => !a.startsWith("--") && (wi < 0 || i !== wi + 1)) || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
    const r = record(root);
    console.log(`[textureBytes] ${r.root}: ${r.totals.files} raster files, ${(r.totals.bytes / 1024).toFixed(1)} KiB on disk, ${(r.totals.gpuBytes / 1024 / 1024).toFixed(2)} MiB on the GPU (RGBA8 + mips) across ${r.totals.sized} sized files`);
    for (const [ext, v] of Object.entries(r.byExt)) console.log(`  ${ext}: ${v.files} files, ${(v.bytes / 1024).toFixed(1)} KiB, ${(v.gpuBytes / 1024 / 1024).toFixed(2)} MiB GPU`);
    for (const d of r.topDirs) console.log(`  ${d.dir}: ${d.files} files, ${(d.bytes / 1024).toFixed(1)} KiB`);
    console.log(`  decision: ${r.decision.verdict} -- ${r.decision.why}`);
    if (out) { fs.writeFileSync(out, JSON.stringify(r, null, 1)); console.log(`  wrote ${out}`); }
}
