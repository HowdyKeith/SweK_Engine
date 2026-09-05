#!/usr/bin/env node
// WebGLEngine/tools/ship/slugRig-selfcheck.mjs -- v4490
//
// GRADES slug-rig.html AND WHAT A RIG SIGNS (docs/TSL-ROADMAP.md step 7 item 9, task 9). Section 1 holds render/slugRig.mjs
// headless: the plan (five faces, five sizes, three squashes), the atlas statistics read off packAtlas's own band headers,
// the dense-CJK claim MEASURED (a kanji wall's bands walk more curves per band than a Latin wall's), and the grader refusing
// a record that lies -- graded on a lie, as tslRig learned to. Section 2 loads the page here on the WebGL2 route (a presented
// WebGPU frame loses the device on this headless shell, measured at v4319) with the quick plan and holds its JSON's shape:
// every row finite, every face with statistics, the language the page ran, the RIG-PENDING sentence and the file it names.
// Section 3 grades tools/ship/slug-rig.json when the rig has signed one, and says RIG-PENDING until then.
//
// MEASURED AT v4490 on the build box (SwiftShader, WebGL2, CPU-timed -- said so in the row's `source`): see the run's
// report lines; the numbers are this box's and the header does not repeat them as if they were a GPU's. The band
// statistics are not the box's, and the first draft of this header had them wrong: I wrote "Plex about 3 curves per
// band, the kanji wall about twice that" and a 3x curves-per-glyph hold before measuring. MEASURED: Plex's wall walks
// 6.55 curves per band (17 at most), Sawarabi Gothic's kanji wall 8.00 (19 at most) -- 1.22x, not 2x -- and 39 curves a
// glyph against 32, not 3x. The band split does its job on the dense face: a glyph with 22% more curves walks 22% more
// per band, not 3x. The holds below are the measurement's (>1.1x per band, more at most, >1.15x per glyph), and that
// ratio is the finding the band-count question needs before anybody tunes a count.
//
// SABOTAGE (v4490): A  atlasStats reading the band header's OFFSET field as its count                   -> FIRST 0 RED, A FINDING: the offsets read 76 a band and 291 at most (not "thousands", as this line first
//                      guessed) and PASSED every ratio hold, the CJK one included (1.28x). A ratio of two wrong fields is still a ratio. Held since to the atlas's own
//                      arithmetic: no band may count more curves than its glyph has (overCount = 0, max per band <= max per glyph). Re-run -> exit=1, red: the statistics row
//                   B  gradeRig accepting a negative median                                             -> exit=1, red: the lie row (graded on a lie, not on the truth)
//                   C  the page's timing source labelled "gpu" whatever the device granted              -> exit=1, red: the page row holding source to the device's timestamps flag
//                   D  the front door's anchor removed                                                  -> exit=1, red: the reachability row
//
// Run: node tools/ship/slugRig-selfcheck.mjs      (~60 s; section 1 is headless)
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { webgpuSkipReason } from "./webgpuHarness.mjs";
import { parseFont } from "../../text/slugFont.js";
import { layoutText } from "../../text/slugText.js";
import { packAtlas } from "../../text/slugAtlas.js";
import { slugPipelineDesc } from "../../render/slugDevice.mjs";
import { rigPlan, atlasStats, wallPixels, gradeRig, RIG_SIZES, RIG_SQUASHES, RIG_FACES, RIG_TEXT, RIG_TEXT_CJK } from "../../render/slugRig.mjs";
import { FONTS, fontPath } from "../../text/fontRegistry.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RIG_FILE = path.join(ENG, "tools/ship/slug-rig.json");
let fails = 0;
const ok = (c, name, detail) => { console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`); if (!c) fails++; };
const report = (name, detail) => console.log(`  ----  ${name}   ${detail}`);
const sec = (t) => console.log("\n" + t);
const atlasFor = (family, text) => { const f = FONTS.find((x) => x.family === family); const font = parseFont(new Uint8Array(fs.readFileSync(path.join(ENG, fontPath(f)))));
    const gis = [...new Set([...text].map((c) => font.glyphIndex(c.codePointAt(0))))]; return { font, atlas: packAtlas(gis.map((gi) => ({ key: gi, contours: font.outline(gi).contours })), { format: "16f", logWidth: 12 }) }; };

// ---------------------------------------------------------------------------------------------------------
sec("1. HEADLESS: the plan, the atlas's own statistics, the dense-CJK claim measured, the grader graded on a lie");
// ---------------------------------------------------------------------------------------------------------
{
    const plan = rigPlan();
    ok(plan.length === RIG_FACES.length * RIG_SIZES.length * RIG_SQUASHES.length && plan.length === 75 && RIG_FACES.every((f) => FONTS.some((x) => x.family === f)),
        `the plan is every registered rig face at every size and squash: ${plan.length} rows`, `${RIG_FACES.length} faces x ${RIG_SIZES.join("/")} px x squashes ${RIG_SQUASHES.join("/")}`);
    ok(plan.every((p) => fs.existsSync(path.join(ENG, p.url.slice(1)))) && plan.some((p) => p.text === RIG_TEXT_CJK), "every planned face's file is on disk, and Sawarabi Gothic draws the kanji text");
    const plex = atlasFor("IBM Plex Serif", RIG_TEXT), cjk = atlasFor("Sawarabi Gothic", RIG_TEXT_CJK);
    const sp = atlasStats(plex.atlas), sc = atlasStats(cjk.atlas);
    let bandsByHand = 0; for (const e of plex.atlas.glyphs.values()) if (!e.empty) bandsByHand += e.bandMax[0] + 1 + e.bandMax[1] + 1;
    ok(sp.bands === bandsByHand && sp.glyphs > 30 && sp.meanCurvesPerBand > 1 && sp.maxCurvesPerBand >= sp.meanCurvesPerBand && sp.meanBandsPerGlyph > 2
        && sp.overCount === 0 && sc.overCount === 0 && sp.maxCurvesPerBand <= sp.maxGlyphCurves && sp.meanCurvesPerBand < sp.curves / sp.glyphs,
        `atlasStats reads every band header packAtlas wrote: Plex's wall atlas has ${sp.glyphs} glyphs, ${sp.bands} bands, ${sp.meanCurvesPerBand.toFixed(2)} curves per band on average, ${sp.maxCurvesPerBand} at most -- and no band counts more curves than its glyph has (${sp.maxGlyphCurves} at most)`);
    ok(sc.meanCurvesPerBand > sp.meanCurvesPerBand * 1.1 && sc.maxCurvesPerBand > sp.maxCurvesPerBand && sc.curves / sc.glyphs > 1.15 * (sp.curves / sp.glyphs),
        `*** THE DENSE CASE, MEASURED: the kanji wall's bands walk ${(sc.meanCurvesPerBand / sp.meanCurvesPerBand).toFixed(2)}x the curves per band of the Latin wall's (${sc.meanCurvesPerBand.toFixed(2)} against ${sp.meanCurvesPerBand.toFixed(2)}; ${sc.maxCurvesPerBand} at most against ${sp.maxCurvesPerBand}), with ${(sc.curves / sc.glyphs).toFixed(0)} curves a glyph against ${(sp.curves / sp.glyphs).toFixed(0)} ***`);
    const laid = layoutText(plex.font, RIG_TEXT, { size: 20 }), px = wallPixels(laid, (gi) => plex.atlas.glyphs.get(gi), 1), pxSq = wallPixels(laid, (gi) => plex.atlas.glyphs.get(gi), 0.25);
    ok(px > 1000 && Math.abs(pxSq - px * 0.25) < 1e-6, "wallPixels sums the glyph quads' areas, and a squash scales it by the squash", `${px.toFixed(0)} px at 20 px, ${pxSq.toFixed(0)} squashed to a quarter`);
    ok(typeof slugPipelineDesc(12).shaders.wgsl === "string" && typeof slugPipelineDesc(12).shaders.glsl.fragment === "string", "the pipeline the page compiles carries both languages -- the WGSL twin is what WebGPU gets");
    // the grader, graded on lies
    const good = { page: "slug-rig.html", timestamps: false, backend: "webgl2", faces: { A: { meanCurvesPerBand: 3 } }, rows: Array.from({ length: 15 }, (_, i) => ({ face: "A", size: 10 + i, squash: 1, msMedian: 0.5, msMin: 0.4, source: "cpu", pixels: 1000, glyphs: 50, nsPerPixel: 500 })) };
    ok(gradeRig(good).ok && gradeRig({ ...good, quick: true, rows: good.rows.slice(0, 10) }).ok && gradeRig({ ...good, quick: true, rows: good.rows.slice(0, 10) }).quick === true, "CONTROL: a well-formed record grades ok, and a quick run's ten rows grade when the record says quick -- and the grade says quick back");
    const lies = [
        ["a negative median", { ...good, rows: [{ ...good.rows[0], msMedian: -1 }, ...good.rows.slice(1)] }],
        ["a NaN minimum", { ...good, rows: [{ ...good.rows[0], msMin: NaN }, ...good.rows.slice(1)] }],
        ["a quick run's ten rows without saying quick", { ...good, rows: good.rows.slice(0, 10) }],
        ["a source that is neither gpu nor cpu", { ...good, rows: [{ ...good.rows[0], source: "guess" }, ...good.rows.slice(1)] }],
        ["a face with no statistics", { ...good, faces: {} }],
        ["timestamps granted but a row timed by the cpu", { ...good, timestamps: true }],
        ["too few rows", { ...good, rows: good.rows.slice(0, 3) }],
        ["another page's record", { ...good, page: "tsl-rig.html" }],
    ];
    ok(lies.every(([, l]) => !gradeRig(l).ok), "*** the grader refuses eight lies by name: " + lies.map(([n]) => n).join(", ") + " ***", lies.map(([n, l]) => `${n}: ${gradeRig(l).problems[0]}`).join(" | ").slice(0, 200));
    ok(/href="\/slug-rig\.html"/.test(fs.readFileSync(path.join(ENG, "server.html"), "utf8")), "the front door links slug-rig.html, so a rig can reach it");
}

// ---------------------------------------------------------------------------------------------------------
sec("2. THE PAGE HERE: loaded on the WebGL2 route with the quick plan, its JSON has the shape the grader wants");
// ---------------------------------------------------------------------------------------------------------
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const pw = resolvePlaywright(createRequire(import.meta.url));
    const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".json": "application/json", ".ttf": "font/ttf", ".bin": "application/octet-stream" };
    const srv = http.createServer((q, s2) => { const u = decodeURIComponent(String(q.url).split("?")[0]); const f = path.join(ENG, u === "/" ? "slug-rig.html" : u);
        if (!f.startsWith(ENG) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s2.writeHead(404); return s2.end("no"); }
        s2.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); s2.end(fs.readFileSync(f)); });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const br = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
    const pg = await br.newPage({ viewport: { width: 1100, height: 700 } }); const errs = []; pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
    await pg.goto(`http://127.0.0.1:${srv.address().port}/?webgl=1&quick=1`, { waitUntil: "load" });
    let json = null; for (let i = 0; i < 180 && !json; i++) { await pg.waitForTimeout(1000); const v = await pg.evaluate(() => document.getElementById("json").value); if (v) { try { json = JSON.parse(v); } catch (e) { json = null; } } }
    const text = await pg.evaluate(() => document.getElementById("out").textContent);
    await br.close(); srv.close();
    ok(json && !json.failed && json.backend === "webgl2" && json.language === "glsl", "the page ran on WebGL2 and says so, with GLSL as the language it compiled", json ? (json.failed || json.backend) : "no JSON");
    if (json && !json.failed) {
        const want = RIG_FACES.length * 2;
        ok(json.rows.length === want && json.quick === true, `the quick plan ran every face at the smallest and largest size: ${json.rows.length} rows`, `${want} wanted`);
        ok(json.rows.every((r) => Number.isFinite(r.msMedian) && r.msMedian >= 0 && r.pixels > 0 && r.glyphs > 0 && r.frames === 12), "every row carries a finite time, its pixels and glyphs, and twelve frames");
        ok(json.rows.every((r) => r.source === (json.timestamps ? "gpu" : "cpu")), "every row's timing source is what the device's timestamps flag says", `timestamps ${json.timestamps}, source ${json.rows[0] && json.rows[0].source}`);
        ok(RIG_FACES.every((f) => json.faces[f] && json.faces[f].meanCurvesPerBand > 0), "every face reports its atlas statistics");
        ok(json.faces["Sawarabi Gothic"].meanCurvesPerBand > json.faces["IBM Plex Serif"].meanCurvesPerBand, "and the page's own numbers show the CJK wall walking more curves per band than the Latin one", `${json.faces["Sawarabi Gothic"].meanCurvesPerBand.toFixed(2)} against ${json.faces["IBM Plex Serif"].meanCurvesPerBand.toFixed(2)}`);
        ok(/slug-rig\.json/.test(text) && /RIG-PENDING/.test(text) && (json.timestamps || /CPU, not the GPU/.test(text)), "the page names the file to save and says RIG-PENDING, and that a CPU-timed run is not a GPU time");
        ok(errs.length === 0, "the page threw nothing", errs.slice(0, 2).join(" | ") || "clean");
        const g = gradeRig(json); ok(g.ok, "and the grader accepts the page's own record", g.problems.join("; "));
        for (const r of json.rows) report(`${r.face} ${r.size} px`, `${r.msMedian.toFixed(2)} ms median (${r.source}) for ${r.pixels} px, ${r.nsPerPixel.toFixed(0)} ns/px -- SwiftShader's CPU, not a GPU`);
    }
}

// ---------------------------------------------------------------------------------------------------------
sec("3. THE RIG'S NUMBER: tools/ship/slug-rig.json, if a rig has signed one");
// ---------------------------------------------------------------------------------------------------------
{
    if (!fs.existsSync(RIG_FILE)) {
        report("RIG-PENDING", "no tools/ship/slug-rig.json. Open slug-rig.html on the rig, save the JSON as that file, and this section grades it.");
        ok(true, "without the rig's file the gate refuses the cost claim by saying so (not by passing quietly)", "RIG-PENDING");
    } else {
        const j = JSON.parse(fs.readFileSync(RIG_FILE, "utf8")); const g = gradeRig(j);
        ok(g.ok && !g.quick, "*** the rig's record: every row finite, every face with statistics, sources honest, and the full plan (a quick run is not a signature) ***", g.problems.join("; ") || `${j.ua && j.ua.slice(0, 60)} at ${j.when}, ${g.backend}, timestamps ${g.timestamps}, quick ${g.quick}`);
        report("worst row", g.worst ? `${g.worst.face} ${g.worst.size} px squash ${g.worst.squash}: ${g.worst.msMedian.toFixed(3)} ms` : "none");
        report("rows over the plan's 1.5 ms", String(g.over1p5));
        report("ns per pixel, Latin against CJK", `${g.nsPerPixelLatin && g.nsPerPixelLatin.toFixed(0)} against ${g.nsPerPixelCjk && g.nsPerPixelCjk.toFixed(0)}`);
    }
}

console.log(fails ? `\nFAIL -- ${fails} check(s)` : "\nall checks pass");
console.log("unchecked here: the rig itself (this box is SwiftShader on the WebGL2 route, CPU-timed, and every row says so); a presented WebGPU frame (lost on this headless shell); and whether a band count should change, which is the rig's number to answer.");
process.exit(fails ? 1 : 0);
