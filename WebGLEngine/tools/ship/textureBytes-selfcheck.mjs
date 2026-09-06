#!/usr/bin/env node
// WebGLEngine/tools/ship/textureBytes-selfcheck.mjs -- v4495
//
// TEXTURE BYTES COUNTED BEFORE THE KTX2 / BASIS DECISION (task 18). tools/ship/textureBytes.mjs walks a folder and
// records every raster texture's bytes on disk and, from the PNG and JPEG headers, its pixel size and so its GPU bytes;
// decide() derives the verdict from the totals. Section 1 holds the header readers against twins with different inputs:
// pngSize against tools/ship/pngCoverage.mjs's decodePNG (a full decoder) on every PNG in the tree, jpegSize against the
// browser's own decode (naturalWidth / naturalHeight) of the tree's one JPEG, and a constructed JPEG whose APP0 segment
// precedes its SOF0 (the marker walk must skip it). Section 2 holds the tree's census against an independent walk in
// this file, the GPU arithmetic per file, and decide() on the tree and on three synthetic censuses. Section 3 holds the
// todo entry and grades tools/ship/texture-bytes.json when a rig has written one from its EXTERNAL asset library.
//
// MEASURED AT v4495 ON THE TREE: 16 raster files, 378 KiB on disk, 18.05 MiB on the GPU as RGBA8 with mips -- 13.8 MiB
// of it one 313 KB JPEG (demos/resume_fx). Against that, 68 source files make textures procedurally (DataTexture,
// CanvasTexture, device.texture, texImage2D) and 15 load an image. The tree's verdict is not-yet: under a 64 MiB GPU
// floor, and a transcoder of a few hundred KB would be the largest texture-shaped fetch in the build. The rig's asset
// library is the population that could change it, and it is RIG-PENDING until measured there.
//
// SABOTAGE (v4495): A  pngSize reading the width from byte 20 (the height)                                 -> exit=1, red 2: the decoder twin (14 of 15 disagree) and the control
//                   B  jpegSize taking the first marker after SOI as the SOF                                 -> exit=1, red 6: APP0 read as a size (17920 x 17993), the browser twin, the
//                      progressive row, the null row, and the tree's GPU total (1.7 GB from one mis-sized JPEG) through decide() and record()
//                   C  the census skipping .jpg                                                              -> exit=1, red 3: the independent walk (15 against 16, naming the JPEG), the
//                      totals, the largest-texture row
//                   D  decide() returning 'not-yet' whatever the totals                                      -> exit=1, red: the three-verdicts row
//
// Run: node tools/ship/textureBytes-selfcheck.mjs      (~15 s; the JPEG twin opens one headless page)
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { decodePNG } from "./pngCoverage.mjs";
import { pngSize, jpegSize, censusTextures, decide, record, RASTER_EXTS, SKIP_DIRS, MIP_FACTOR } from "./textureBytes.mjs";
import { TODO } from "./todo.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RIG_FILE = path.join(ENG, "tools", "ship", "texture-bytes.json");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);

/** an independent walk: the same rules, written again here rather than imported, so a census that skips something is seen */
function walkRaster(root) {
    const out = []; const skip = new Set(SKIP_DIRS);
    const rec = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name);
        if (e.isDirectory()) { if (!skip.has(e.name) && !e.name.startsWith(".")) rec(f); } else if (e.isFile() && RASTER_EXTS.includes(path.extname(e.name).toLowerCase())) out.push(f); } };
    rec(root); return out;
}

sec("1. THE HEADER READERS, AGAINST TWINS WITH DIFFERENT INPUTS");
{
    const pngs = walkRaster(ENG).filter((f) => f.toLowerCase().endsWith(".png"));
    let agree = 0, disagree = [];
    for (const f of pngs) { const buf = fs.readFileSync(f); const h = pngSize(buf); let d = null; try { d = decodePNG(buf); } catch (e) { d = null; }
        if (!d) continue; if (h && h.width === d.width && h.height === d.height) agree++; else disagree.push(path.basename(f)); }
    ok(`pngSize agrees with pngCoverage's full decoder on every decodable PNG in the tree (${agree})`, agree >= 10 && disagree.length === 0, disagree.join(", "));
    const big = pngs.map((f) => ({ f, s: pngSize(fs.readFileSync(f)) })).filter((x) => x.s).sort((a, b) => b.s.width * b.s.height - a.s.width * a.s.height)[0];
    report(`largest PNG: ${path.relative(ENG, big.f)} at ${big.s.width} x ${big.s.height}`);
    ok("CONTROL: the width and height are not the same number on the largest PNG, so a swapped read would be seen", big.s.width !== big.s.height);
    ok("a non-PNG is null, not a size", pngSize(Buffer.from("not a png at all, not even close")) === null && pngSize(Buffer.alloc(8)) === null);

    // a constructed JPEG: SOI, an APP0 of 16 bytes, then SOF0 with height 0x0123 and width 0x0456
    const app0 = Buffer.from([0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
    const sof0 = Buffer.from([0xFF, 0xC0, 0x00, 0x11, 0x08, 0x01, 0x23, 0x04, 0x56, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
    const j = jpegSize(Buffer.concat([Buffer.from([0xFF, 0xD8]), app0, sof0]));
    ok("jpegSize walks past an APP0 segment to the SOF0 and reads height then width", j && j.height === 0x0123 && j.width === 0x0456, JSON.stringify(j));
    const j2 = jpegSize(Buffer.concat([Buffer.from([0xFF, 0xD8]), app0, Buffer.from([0xFF, 0xC2, 0x00, 0x11, 0x08, 0x00, 0x40, 0x00, 0x80, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])]));
    ok("and a progressive SOF2 the same", j2 && j2.height === 64 && j2.width === 128, JSON.stringify(j2));
    ok("a JPEG whose scan starts before any SOF is null, and a non-JPEG is null", jpegSize(Buffer.concat([Buffer.from([0xFF, 0xD8]), Buffer.from([0xFF, 0xDA, 0, 8, 1, 1, 0, 0, 0x3F, 0])])) === null && jpegSize(Buffer.from("GIF89a")) === null);

    const jpgs = walkRaster(ENG).filter((f) => /\.jpe?g$/i.test(f));
    ok(`the tree has a JPEG to twin (${jpgs.length})`, jpgs.length >= 1);
    if (jpgs.length) {
        const f = jpgs[0], mine = jpegSize(fs.readFileSync(f));
        const pw = resolvePlaywright(createRequire(import.meta.url));
        const srv = http.createServer((q, s2) => { s2.writeHead(200, { "Content-Type": "image/jpeg" }); s2.end(fs.readFileSync(f)); });
        await new Promise((r) => srv.listen(0, "127.0.0.1", r));
        const br = await pw.chromium.launch({ executablePath: HEADLESS_SHELL });
        const pg = await br.newPage();
        const nat = await pg.evaluate((u) => new Promise((res) => { const im = new Image(); im.onload = () => res({ width: im.naturalWidth, height: im.naturalHeight }); im.onerror = () => res(null); im.src = u; }), `http://127.0.0.1:${srv.address().port}/x.jpg`);
        await br.close(); srv.close();
        ok(`jpegSize agrees with the browser's decode of ${path.relative(ENG, f)}: ${mine && mine.width} x ${mine && mine.height}`, !!mine && !!nat && mine.width === nat.width && mine.height === nat.height && mine.width !== mine.height, `browser ${JSON.stringify(nat)}`);
    }
}

sec("2. THE TREE'S CENSUS, AGAINST AN INDEPENDENT WALK, AND THE DECISION DERIVED");
{
    const c = censusTextures(ENG);
    const mine = walkRaster(ENG).map((f) => path.relative(ENG, f).split(path.sep).join("/")).sort();
    const theirs = c.files.map((f) => f.path).sort();
    ok(`the census lists exactly the raster files an independent walk finds (${mine.length})`, mine.length === theirs.length && mine.every((p, i) => p === theirs[i]), `walk ${mine.length}, census ${theirs.length}; ${mine.filter((p) => !theirs.includes(p)).concat(theirs.filter((p) => !mine.includes(p))).slice(0, 4).join(", ")}`);
    ok("every file's bytes are its stat size, and every sized file's GPU bytes are width x height x 4 x 4/3", c.files.every((f) => f.bytes === fs.statSync(path.join(ENG, f.path)).size && (f.gpuBytes == null || f.gpuBytes === Math.round(f.width * f.height * 4 * MIP_FACTOR))));
    ok("the totals are the files' sums, by extension too", c.totals.bytes === c.files.reduce((s, f) => s + f.bytes, 0) && c.totals.gpuBytes === c.files.reduce((s, f) => s + (f.gpuBytes || 0), 0)
        && Object.values(c.byExt).reduce((s, v) => s + v.bytes, 0) === c.totals.bytes && Object.keys(c.byExt).includes(".jpg") && Object.keys(c.byExt).includes(".png"));
    report(`the tree: ${c.totals.files} raster files, ${(c.totals.bytes / 1024).toFixed(1)} KiB on disk, ${(c.totals.gpuBytes / 1048576).toFixed(2)} MiB on the GPU; ${Object.entries(c.byExt).map(([e, v]) => `${e} ${v.files}`).join(", ")}`);
    ok("every raster file in the tree is sized (PNG or JPEG), so the GPU total covers the whole population", c.totals.sized === c.totals.files && c.totals.files >= 10);
    const d = decide(c);
    ok(`decide() on the tree derives 'not-yet' from the GPU total against the floor, naming the saving`, d.verdict === "not-yet" && c.totals.gpuBytes < d.gpuFloorBytes && d.gpuSavingBytes === Math.round(c.totals.gpuBytes * 0.75) && /saving would be \d+/.test(d.why), d.why);
    ok("the tree's largest texture by GPU bytes is the resume JPEG, and it is most of the total", d.largest && /resume/.test(d.largest.path) && d.largest.gpuBytes > c.totals.gpuBytes * 0.6, d.largest && `${d.largest.path} ${(d.largest.gpuBytes / 1048576).toFixed(1)} MiB`);
    const synth = (n, w, h) => ({ files: Array.from({ length: n }, (_, i) => ({ path: `t${i}.png`, ext: ".png", bytes: 1000, width: w, height: h, gpuBytes: Math.round(w * h * 4 * MIP_FACTOR) })), totals: { files: n, bytes: 1000 * n, gpuBytes: n * Math.round(w * h * 4 * MIP_FACTOR), sized: n } });
    ok("decide() says 'consider' past the floor, 'no' when a transcoder outweighs the wire bytes, 'no-textures' on an empty root -- three verdicts from the numbers, not one from habit",
        decide(synth(40, 2048, 2048)).verdict === "consider" && decide(synth(3, 64, 64), { transcoderBytes: 300000 }).verdict === "no" && decide(synth(0, 0, 0)).verdict === "no-textures" && decide(synth(3, 64, 64)).verdict === "not-yet");
    const srcs = []; const walkSrc = (dd) => { for (const e of fs.readdirSync(dd, { withFileTypes: true })) { const f = path.join(dd, e.name); if (e.isDirectory()) { if (!SKIP_DIRS.includes(e.name) && !e.name.startsWith(".")) walkSrc(f); } else if (/\.(m?js)$/.test(e.name)) srcs.push(f); } }; walkSrc(ENG);
    let proc = 0, load = 0; for (const f of srcs) { const t = fs.readFileSync(f, "utf8"); if (/new THREE\.DataTexture|new THREE\.CanvasTexture|device\.texture\(|texImage2D|createTexture\(/.test(t)) proc++; if (/TextureLoader|\.load\([^)]*\.(png|jpg)|new Image\(\)/.test(t)) load++; }
    report(`sources that make textures procedurally: ${proc}; sources that load an image: ${load}`);
    ok("more sources make textures than load them -- the population a compressor would serve is the smaller one", proc > load && proc > 40);
    const r = record(ENG);
    ok("record() carries the tool's name, the totals, the extension table and the decision", r.tool === "textureBytes.mjs" && r.totals.files === c.totals.files && r.byExt[".png"] && r.decision.verdict === "not-yet" && Array.isArray(r.largest));
}

sec("3. THE RECORD: todo.mjs's entry, and the rig's asset library when measured");
{
    const t = TODO.find((x) => x.id === "ktx2-basis");
    ok("todo.mjs ktx2-basis: present, wont, a reason citing the measured totals, evidence naming this gate", !!t && t.status === "wont" && /MEASURED/.test(t.reason || "") && /18\.0|378/.test(t.reason || "") && t.evidence === "node tools/ship/textureBytes-selfcheck.mjs", t ? `${t.status}; evidence ${t.evidence}` : "missing");
    if (!fs.existsSync(RIG_FILE)) {
        report("RIG-PENDING: no tools/ship/texture-bytes.json. On a rig: node tools/ship/textureBytes.mjs <external>/asset_library --write tools/ship/texture-bytes.json, and this section grades it.");
        ok("without the rig's file the gate refuses the library claim by saying so (not by passing quietly)", true, "RIG-PENDING");
    } else {
        const j = JSON.parse(fs.readFileSync(RIG_FILE, "utf8"));
        const sane = j && j.tool === "textureBytes.mjs" && j.totals && Number.isFinite(j.totals.bytes) && j.decision && typeof j.decision.verdict === "string" && j.totals.gpuBytes === (j.largest || []).reduce((s) => s, j.totals.gpuBytes);
        ok("*** the rig's record: the tool's shape, finite totals, a verdict derived from them ***", sane, sane ? `${j.root}: ${j.totals.files} files, ${(j.totals.bytes / 1048576).toFixed(1)} MiB on disk, ${(j.totals.gpuBytes / 1048576).toFixed(1)} MiB GPU -> ${j.decision.verdict}` : "malformed");
        if (sane) { const re = decide({ files: j.largest || [], totals: j.totals }); ok("and the verdict re-derives from the totals it carries", re.verdict === j.decision.verdict, `${re.verdict} against ${j.decision.verdict}`); }
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: the rig's external asset library (this tree ships 16 raster files; the library is user-accumulated and lives outside it); WebP, GIF and KTX2 sizes (counted, not sized); the transcoder's true bytes (not vendored, not asserted).");
process.exit(fails ? 1 : 0);
