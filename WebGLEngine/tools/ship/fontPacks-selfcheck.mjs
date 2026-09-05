#!/usr/bin/env node
// WebGLEngine/tools/ship/fontPacks-selfcheck.mjs -- v4487
//
// THE PRE-PACKED ATLASES, HELD TO A FRESH PACK BYTE FOR BYTE, TO THEIR DIGESTS, TO THE PARSE PATH'S LAYOUT, AND TO THE PARSE
// PATH'S PICTURE ON BOTH BACKENDS (docs/TSL-ROADMAP.md step 7 item 7, task 7). tools/ship/packFonts.mjs bakes every registered
// family's declared alphabet into vendor/fonts/<family>/<Name>.<set>.slug.bin; this gate repacks each from its TrueType in
// memory and any difference is a STALE pack (a red, not a mystery), holds each file to the sha256 text/fontRegistry.mjs
// records, decodes each and holds the decoded font's layout of a phrase to the parsed font's (glyph indices, pen positions,
// kerning source) and its atlas to a fresh packAtlas record for record, and on WebGPU and WebGL2 draws the phrase from the
// pack through render/slugDevice.mjs's fromPack and holds it to the parsed path's picture on every pixel.
//
// THE MEASUREMENT THE WORKER WAS DECIDED ON (v4487, the harness's headless Chromium, the 67-glyph label alphabet, cold / warm):
// Plex 29 / 20 ms (parse 6, outline 3, pack 20), Cinzel 16 / 11, JetBrains Mono 8 / 8, Source Sans 3 10 / 13. About one frame,
// once, per family. A Web Worker would spend more lines on messages than the work it hid; the pack spends none at runtime.
// tools/ship/todo.mjs slug-atlas-worker is the won't-do, with these numbers; section 3 re-measures the Plex cost headless
// and holds it under a loose ceiling so the decision cannot rot without a red.
//
// SABOTAGE (v4487): A  one byte of Cinzel's pack flipped (a curve texel)                     -> exit=1, 5 red: the stale, digest and atlas-record rows, AND the picture on both backends
//                                                                                              (one texel moved 3 of 23,040 pixels: the picture claim reaches a single control point)
//                   B  the label alphabet in CHAR_SETS shortened by one character           -> exit=1, 13 red: the alphabet row, every stale row, every decode and atlas-record row
//                   C  decodePack's kern pairs dropped                                       -> exit=1, 9 red: the layout and picture rows for the three kerning families; JetBrains Mono kerns by 0 and survives
//                   D  fromPack uploading the band texels as the curve texture              -> exit=1, 8 red: the picture rows for every family on both backends
//
// Run: node tools/ship/fontPacks-selfcheck.mjs      (~25 s; sections 1-3 are headless)
"use strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { parseFont } from "../../text/slugFont.js";
import { layoutText } from "../../text/slugText.js";
import { packAtlas } from "../../text/slugAtlas.js";
import { packFont, encodePack, decodePack, PACK_VERSION } from "../../text/slugPack.mjs";
import { FONTS, CHAR_SETS, fontPath, packPath } from "../../text/fontRegistry.mjs";
// ev/esShipLabels.js imports by browser-absolute path ("/text/slugFont.js") and cannot load under node: its alphabet is read from the text
const LABEL_CHARS = (fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../ev/esShipLabels.js"), "utf8").match(/export const LABEL_CHARS = "([^"]+)";/) || [])[1];
import { TODO } from "./todo.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (c, name, detail) => { console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`); if (!c) fails++; };
const report = (name, detail) => console.log(`  ----  ${name}   ${detail}`);
const sec = (t) => console.log("\n" + t);
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const PHRASE = "Sphinx 42% AV";

// ---------------------------------------------------------------------------------------------------------
sec("1. EVERY PACK ON DISK IS A FRESH PACK OF ITS FONT, BYTE FOR BYTE, AND CARRIES THE DIGEST THE REGISTRY RECORDS");
// ---------------------------------------------------------------------------------------------------------
ok(CHAR_SETS.label === LABEL_CHARS, "the registry's `label` alphabet IS ev/esShipLabels.js LABEL_CHARS (two spellings held equal)", `${CHAR_SETS.label.length} characters`);
const fonts = new Map();
for (const f of FONTS) {
    const font = parseFont(new Uint8Array(fs.readFileSync(path.join(ENG, fontPath(f))))); fonts.set(f.family, font);
    ok(Array.isArray(f.packs) && f.packs.length >= 1 && f.packs.every((p) => CHAR_SETS[p.set] && /^[0-9a-f]{64}$/.test(String(p.sha256))), `${f.family}: declares at least one pack, each of a known alphabet with a digest`, (f.packs || []).map((p) => p.set).join());
    for (const p of f.packs || []) {
        const abs = path.join(ENG, packPath(f, p.set));
        if (!fs.existsSync(abs)) { ok(false, `${f.family}/${p.set}: the pack file is on disk`, packPath(f, p.set)); continue; }
        const disk = new Uint8Array(fs.readFileSync(abs));
        const fresh = encodePack(packFont(font, CHAR_SETS[p.set], { logWidth: 12 }));
        ok(disk.length === fresh.length && Buffer.compare(Buffer.from(disk), Buffer.from(fresh)) === 0, `*** ${f.family}/${p.set}: the file is a fresh pack of the font, byte for byte (${(disk.length / 1024).toFixed(1)} KiB) -- not stale ***`, disk.length === fresh.length ? "" : `${disk.length} on disk, ${fresh.length} fresh`);
        ok(sha(disk) === p.sha256, `${f.family}/${p.set}: the digest is the registry's`, sha(disk).slice(0, 12));
    }
}

// ---------------------------------------------------------------------------------------------------------
sec("2. A DECODED PACK LAYS OUT AND INDEXES EXACTLY AS THE PARSED FONT DOES, AND ITS ATLAS IS THE PARSE PATH'S");
// ---------------------------------------------------------------------------------------------------------
for (const f of FONTS) {
    const font = fonts.get(f.family);
    for (const p of f.packs || []) {
        const abs = path.join(ENG, packPath(f, p.set)); if (!fs.existsSync(abs)) continue;
        let pack; try { pack = decodePack(new Uint8Array(fs.readFileSync(abs))); } catch (e) { ok(false, `${f.family}/${p.set}: decodes`, e.message); continue; }
        ok(pack.header.version === PACK_VERSION && pack.header.chars === CHAR_SETS[p.set] && pack.font.packed === true && pack.atlas.logWidth === 12, `${f.family}/${p.set}: decodes as version ${PACK_VERSION}, its alphabet, a packed font, width 4096`);
        const A = layoutText(font, PHRASE, { size: 28 }), B = layoutText(pack.font, PHRASE, { size: 28 });
        const sameGlyphs = A.glyphs.length === B.glyphs.length && A.glyphs.every((g, i) => g.glyphIndex === B.glyphs[i].glyphIndex && Math.abs(g.x - B.glyphs[i].x) < 1e-9 && g.y === B.glyphs[i].y);
        ok(sameGlyphs && Math.abs(A.width - B.width) < 1e-9 && A.kerningSource === B.kerningSource && A.height === B.height, `*** ${f.family}/${p.set}: "${PHRASE}" lays out identically from the pack -- glyph indices, pen positions, width, height, kerning source (${B.kerningSource}) ***`, `${B.width.toFixed(3)} px against ${A.width.toFixed(3)}`);
        ok(Math.abs(pack.font.capHeight - font.capHeight) < 1e-12 && Math.abs(pack.font.ascent - font.ascent) < 1e-12 && pack.font.unitsPerEm === font.unitsPerEm, `${f.family}/${p.set}: the vertical metrics are the font's`);
        const gis = [...new Set([...CHAR_SETS[p.set]].map((c) => font.glyphIndex(c.codePointAt(0))))].sort((a, b) => a - b);
        const freshAtlas = packAtlas(gis.map((gi) => ({ key: gi, contours: font.outline(gi).contours })), { format: "16f", logWidth: 12 });
        const recordsSame = gis.every((gi) => JSON.stringify(freshAtlas.glyphs.get(gi)) === JSON.stringify(pack.atlas.glyphs.get(gi)));
        const texelsSame = Buffer.compare(Buffer.from(freshAtlas.curveData.buffer), Buffer.from(pack.atlas.curveData.buffer)) === 0 && Buffer.compare(Buffer.from(freshAtlas.bandData.buffer), Buffer.from(pack.atlas.bandData.buffer)) === 0;
        ok(recordsSame && texelsSame && pack.atlas.glyphs.size === gis.length, `${f.family}/${p.set}: every glyph record and every texel is what packAtlas builds from the TrueType (${gis.length} glyphs, ${pack.atlas.curveTexels} + ${pack.atlas.bandTexels} rows)`);
        ok(pack.font.glyphIndex(0x4E2D) === 0 && (() => { try { pack.font.outline(1); return false; } catch (e) { return /no outlines/.test(e.message); } })(), `${f.family}/${p.set}: a codepoint outside the alphabet is glyph 0, and outlines are refused by name`);
    }
}
{
    const bad = new Uint8Array([0x53, 0x4C, 0x55, 0x47, 9, 0, 0, 0, 0, 0, 0, 0]);
    let m1 = null, m2 = null; try { decodePack(new Uint8Array(8)); } catch (e) { m1 = e.message; } try { decodePack(bad); } catch (e) { m2 = e.message; }
    ok(/magic/.test(m1 || "") && /version 9/.test(m2 || ""), "REFUSED by name: not a pack; a version this reader does not know", `${m1} | ${m2}`);
}

// ---------------------------------------------------------------------------------------------------------
sec("3. THE COST THE WORKER WAS DECIDED AGAINST, RE-MEASURED HEADLESS");
// ---------------------------------------------------------------------------------------------------------
{
    const bytes = new Uint8Array(fs.readFileSync(path.join(ENG, fontPath(FONTS[0]))));
    const t0 = performance.now(); const font = parseFont(bytes); const t1 = performance.now();
    const fresh = packFont(font, CHAR_SETS.label, { logWidth: 12 }); const t2 = performance.now();
    const t3 = performance.now(); decodePack(encodePack(fresh)); const t4 = performance.now();
    report("Plex, label alphabet, headless", `parse ${(t1 - t0).toFixed(1)} ms, pack ${(t2 - t1).toFixed(1)} ms; decode of the pack ${(t4 - t3).toFixed(1)} ms   (browser at v4487: 29 ms cold, 20 warm)`);
    ok(t2 - t0 < 250, "parse plus pack of the shipped face's alphabet is a one-time cost of frames, not seconds (ceiling 250 ms, ten times the measurement)", `${(t2 - t0).toFixed(1)} ms`);
    ok(t4 - t3 < (t2 - t0), "and decoding the pack is cheaper than making it", `${(t4 - t3).toFixed(1)} against ${(t2 - t0).toFixed(1)} ms`);
    const t = TODO.find((x) => x.id === "slug-atlas-worker");
    ok(!!t && t.status === "wont" && /29/.test(t.reason || "") && /fontPacks-selfcheck/.test(t.evidence || ""), "tools/ship/todo.mjs: slug-atlas-worker is a won't-do carrying the measurement, with this gate as its evidence", t ? t.status : "missing");
}

// ---------------------------------------------------------------------------------------------------------
sec("4. ON BOTH BACKENDS: the phrase drawn FROM THE PACK is the parse path's picture on every pixel");
// ---------------------------------------------------------------------------------------------------------
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const W = 320, H = 72, SIZE = 28, ORIGIN = [10, 50];
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, SIZE, ORIGIN, TEXT: PHRASE, CHARS: CHAR_SETS.label, packs: FONTS.map((f) => ({ family: f.family, font: "/" + fontPath(f), pack: "/" + packPath(f, "label") })) }, timeoutMs: 240000, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js"); const { parseFont } = await import("/text/slugFont.js"); const { decodePack } = await import("/text/slugPack.mjs"); const M = await import("/render/slugDevice.mjs");
        const { W, H, SIZE, TEXT, CHARS } = a; const [px, py] = a.ORIGIN;
        const rows = new Float32Array([2 / W, 0, 0, (2 / W) * px - 1, 0, 2 / H, 0, 1 - (2 / H) * py, 0, 0, 0, 0, 0, 0, 0, 1]);
        const out = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const o = { families: {} };
            try {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
                for (const p of a.packs) {
                    const t0 = performance.now(); const font = parseFont(await (await fetch(p.font)).arrayBuffer()); const fd = new M.SlugFontDevice(dev, font, CHARS, { logWidth: 12 }); const t1 = performance.now();
                    const t2 = performance.now(); const pack = decodePack(await (await fetch(p.pack)).arrayBuffer()); const fp = M.SlugFontDevice.fromPack(dev, pack); const t3 = performance.now();
                    const draw = async (f) => { const b = new M.SlugDeviceBatch(f); b.set(TEXT, { size: SIZE, color: [1, 1, 1, 1] }); const fr = await dev.frame(({ pass }) => { pass.clear([0.1, 0.05, 0.2, 1]); b.draw(pass, rows, [W, H]); }, { read: true }); b.destroy(); return fr.pixels; };
                    const A = await draw(fd), B = await draw(fp);
                    let same = 0, lit = 0; for (let i = 0; i < W * H; i++) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A[i * 4 + c] - B[i * 4 + c])); if (d === 0) same++; if (B[i * 4] > 80) lit++; }
                    o.families[p.family] = { same, lit, total: W * H, parseMs: t1 - t0, packMs: t3 - t2, packedBytes: fp.byteSize };
                    fd.destroy(); fp.destroy();
                }
                o.errs = errs; o.backend = dev.backend;
            } catch (e) { o.error = String(e && e.message || e).slice(0, 500); }
            out[backend] = o;
        }
        return out;
    }` });
    ok(r.ok && r.result && r.result.webgpu && r.result.webgl2 && !r.result.webgpu.error && !r.result.webgl2.error, "the harness ran both backends", r.ok ? JSON.stringify([r.result.webgpu && r.result.webgpu.error, r.result.webgl2 && r.result.webgl2.error]) : r.reason);
    if (r.ok && r.result.webgpu && !r.result.webgpu.error && !r.result.webgl2.error) {
        for (const bk of ["webgpu", "webgl2"]) { const o = r.result[bk];
            for (const f of FONTS) { const q = o.families[f.family];
                ok(q && q.same === q.total && q.lit > 300 && o.errs.length === 0, `*** ${bk}: ${f.family} drawn FROM THE PACK is the parse path's picture on every pixel (${q.same} of ${q.total}, ${q.lit} lit) ***`, q ? `parse+pack ${q.parseMs.toFixed(1)} ms, fetch+decode+upload ${q.packMs.toFixed(1)} ms` : "no result"); } }
        report("browser, parse path against pack path, ms per family (WebGPU)", FONTS.map((f) => { const q = r.result.webgpu.families[f.family]; return `${f.family} ${q.parseMs.toFixed(0)} / ${q.packMs.toFixed(0)}`; }).join("; "));
    }
}

console.log(fails ? `\nFAIL -- ${fails} check(s)` : "\nall checks pass");
console.log("unchecked here: a consumer that FETCHES a pack in a shipped page (ev/esShipLabels.js and orrery-gpu.html still parse the TrueType -- the pack is proven equal and offered, not yet taken); an alphabet beyond `label`; the evenOdd and weight variants; and the raw-WebGL2 SlugFontGPU.fromPack, which mirrors the device's and is exercised by nothing here.");
process.exit(fails ? 1 : 0);
