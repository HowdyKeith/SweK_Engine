#!/usr/bin/env node
// WebGLEngine/tools/ship/slugMelt-selfcheck.mjs -- v4501
//
// A FIRE-FILLED GLYPH MELTS TO A PUDDLE (task 48): render/slugMelt.mjs's puddle target for the task 44 morph, with the task 47
// fill riding along. Section 1, headless: the puddle contour closes, is wound as the font winds its OUTER contours, encloses
// exactly what an N-gon inscribed in its ellipse encloses, and sits on the floor; a pinhole is wound as a hole; the target for
// an 8 is one puddle and two pinholes; the melt pairs every subpath; t = 0 is the 8, t = 1 one puddle of the key's area with
// the pinholes shrunk to nothing, t = 0.5 between; the fill rectangle is the union with the floor shared; the CONTROL says
// what the pinholes are for. Section 2, both backends: t = 0, 0.5, 1 packed per frame through fromAtlas with ONE shared fill
// pipeline, each frame slugEval x the fire's nearest texel through the flat model on the atlas packed here; the puddle's ink
// lies within its height of the floor and is whiter than the glyph's (the fire's source rows); the backends together.
//
// MEASURED AT v4501 (Plex '8', 64 points a subpath, 64 px, the fire 64 x 48 stepped 40 times from seed 7): the puddle's area is the
// inscribed 64-gon's to 1e-12; the melt pairs 3 with 3; t = 1 is one puddle within 0.3% of the key (-0.07206 vs -0.07227) with the
// pinholes at 0; the 0 melted to the puddle ALONE winds to 0.00000 at t = 1. On both backends the three frames are coverage x the
// fire's nearest texel on 9,216 of 9,216 pixels, 0 apart -- AFTER A CORRECTION TO v4500's FRAGMENTS: the first run had WebGPU dark
// (7 of 255) on 69 pixels at t = 0.5 where the key and WebGL2 said 255. They were rows 77..80, BELOW the floor: the polar
// interpolation sags the outer under the puddle's floor mid-melt, the fill uv clamps to 0 there and the FLIPPED coordinate is
// exactly 1.0, which WebGPU's sampler wraps to row 0 and WebGL2's clamps to the last row. The 8 of the fill gate never showed it
// because its coverage on that edge is 0. Both fragments now clamp the sample coordinate to the texel centres. The puddle's lit
// pixels have mean green 176 against the glyph's 113 (it sits in the fire's source rows); two a-priori holds were wrong and
// replaced by what was measured: "whiter" (14 of 329 white: only the source row is) and "fewer lit pixels at t = 0.5" (686 vs 672:
// the sag).
//
// SABOTAGE (v4501): A  the puddle wound positive (the hole winding)                -> 1 red: the winding hold. THE FRAMES STAYED GREEN:
//                                                                                     morphicons walks the target in the direction that
//                                                                                     costs least against the source, so the target's own
//                                                                                     winding never reaches the atlas -- the contract the
//                                                                                     headless hold states is this module's, not the frame's.
//                   B  meltTarget without its pinholes                              -> 5 red: the target, the pairing (3 with 1), t = 1 three
//                                                                                     polylines, t = 0.5, and the CONTROL.
//                   C  meltRect the glyph's bound alone                             -> 1 red: the rectangle hold (the key and the page agree
//                                                                                     on any rectangle; the floor and the spread are the contract).
//                   D  the melt frames through fromAtlas without the fill descriptor -> 1 red: the device refuses by name ("draw() was given a
//                                                                                     fill but this font device's pipeline was built without one").
//                   Each restored and the baseline re-run: 0 red.
//
// Run: node tools/ship/slugMelt-selfcheck.mjs      (~60 s)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { parseFont } from "../../text/slugFont.js";
import { slugRender } from "../../text/slugEval.js";
import { glyphMorph, packMorphed, polygonArea } from "../../render/slugMorph.mjs";
import { puddleContour, inscribedEllipseArea, pinholeContour, contourArea, meltTarget, meltRect, meltMorph, meltEase } from "../../render/slugMelt.mjs";
import { fireFill, flatModel, gradeFilled } from "../../render/slugFill.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const near = (a, b, eps = 1e-12) => Math.abs(a - b) < eps;
const W = 96, H = 96, SIZE = 64, ORIGIN = [16, 76], TOL = 2, N = 64, FIRE = { width: 64, height: 48, seed: 7, steps: 40 }, COLOUR = [1, 1, 1, 1];
const font = parseFont(new Uint8Array(fs.readFileSync(path.join(ENG, "vendor/fonts/IBMPlexSerif-Regular.ttf"))));
const outline = (ch) => font.outline(font.glyphIndex(ch.codePointAt(0)));

sec("1. HEADLESS: the puddle, the pinhole, the target, the melt's endpoints, the rectangle, the control");
{
    const P = { cx: 0.3, floor: -0.012, width: 0.6, height: 0.12, N };
    const pud = puddleContour(P);
    const last = pud[pud.length - 1];
    ok(`the puddle is ${N} curves that close (the last curve ends on the first's start)`, pud.length === N && last[4] === pud[0][0] && last[5] === pud[0][1]);
    const xs = pud.map((q) => q[0]), ys = pud.map((q) => q[1]);
    ok("and sits on the floor inside its width and height", near(Math.min(...ys), P.floor, 1e-12) && near(Math.max(...ys), P.floor + P.height, 1e-12) && near(Math.min(...xs), P.cx - P.width / 2, 1e-12) && near(Math.max(...xs), P.cx + P.width / 2, 1e-12));
    const eight = outline("8"), outer8 = eight.contours.reduce((a, c) => (Math.abs(contourArea(c)) > Math.abs(contourArea(a)) ? c : a));
    ok("wound as the font winds an OUTER contour (the 8's largest contour and the puddle both negative), and its area is exactly the inscribed N-gon's",
        contourArea(outer8) < 0 && contourArea(pud) < 0 && near(contourArea(pud), inscribedEllipseArea(P.width, P.height, N), 1e-12), `${contourArea(pud).toFixed(6)} vs ${inscribedEllipseArea(P.width, P.height, N).toFixed(6)}`);
    const pin = pinholeContour(0.3, 0.05, 1e-3);
    ok("a pinhole is wound as a HOLE (positive, like the 8's two small contours) and encloses under 1e-5", contourArea(pin) > 0 && contourArea(pin) < 1e-5 && eight.contours.filter((c) => contourArea(c) > 0).length === 2, contourArea(pin).toExponential(2));
    const tg = meltTarget(eight);
    ok("the 8's target is one puddle and two pinholes, 1.6 times the glyph's width, on the glyph's floor, 0.12 em tall", tg.contours.length === 3 && tg.holes === 2 && near(tg.bbox.x1 - tg.bbox.x0, (eight.bbox.x1 - eight.bbox.x0) * 1.6, 1e-12) && tg.bbox.y0 === eight.bbox.y0 && near(tg.bbox.y1 - tg.bbox.y0, 0.12, 1e-12));
    const m = meltMorph(eight, { N });
    ok("the melt pairs every subpath (3 with 3, none duplicated)", m.morph.subpaths.a === 3 && m.morph.subpaths.b === 3 && m.morph.subpaths.paired === 3);
    const areas = (t) => m.at(t).polylines.map(polygonArea);
    const a0 = areas(0), a1 = areas(1), ah = areas(0.5);
    const big = (a) => a.reduce((x, y) => (Math.abs(y) > Math.abs(x) ? y : x), 0);
    ok("t = 0 is the 8: three polylines, the outer's area within 2% of the font's contour (a 64-point resample)", a0.length === 3 && Math.abs(big(a0) - contourArea(outer8)) < 0.02 * Math.abs(contourArea(outer8)), `${big(a0).toFixed(5)} vs ${contourArea(outer8).toFixed(5)}`);
    const key1 = inscribedEllipseArea(tg.puddle.width, tg.puddle.height, N);
    ok("t = 1 is ONE puddle within 1% of the key's area, everything else shrunk under 1e-5 (the pinholes; coincident ones deduped)", a1.filter((a) => Math.abs(a) > 1e-5).length === 1 && Math.abs(big(a1) - key1) < 0.01 * Math.abs(key1) && a1.every((a) => Math.abs(a) > 1e-5 || Math.abs(a) < 1e-5), `${big(a1).toFixed(5)} vs ${key1.toFixed(5)}, ${a1.length} polylines`);
    ok("t = 0.5 is between: the outer's area between the glyph's and the puddle's, the holes shrinking", Math.abs(big(ah)) < Math.abs(big(a0)) && Math.abs(big(ah)) > Math.abs(big(a1)) && ah.filter((a) => a > 0).every((a) => a < 0.076 && a > 0));
    const rect = meltRect(eight, tg);
    ok("the fill rectangle is the union: the floor shared, the puddle's spread outside the glyph, the glyph's top", rect[1] === eight.bbox.y0 && rect[0] < eight.bbox.x0 && rect[2] > eight.bbox.x1 && rect[3] === eight.bbox.y1 && m.rect.join() === rect.join(), rect.map((v) => v.toFixed(3)).join(","));
    // CONTROL: the puddle alone as the target. morphicons pairs each hole with a DUPLICATE of the puddle and walks it in the direction
    // that costs least -- the hole's own -- so at t = 1 the hole is a puddle wound POSITIVE over a puddle wound negative: the 0's winding
    // sums to zero and it draws NOTHING. Measured at v4501: 0 -> puddle sums to 0.00000 at t = 1; 8 -> puddle to +0.07206 (two positive
    // puddles over one negative, ink by accident). The pinholes are what make a hole shrink instead.
    const zero = outline("0"), tz = meltTarget(zero), noPin = glyphMorph(zero, { contours: [tz.contours[0]], bbox: tz.bbox }, { N });
    const sumNo = noPin.at(1).polylines.reduce((s, p) => s + polygonArea(p), 0), sumPin = meltMorph(zero, { N }).at(1).polylines.reduce((s, p) => s + polygonArea(p), 0);
    const keyZ = inscribedEllipseArea(tz.puddle.width, tz.puddle.height, N);
    ok("CONTROL: the 0 melted to the puddle ALONE winds to zero at t = 1 (its hole became a reversed puddle: nothing would draw); with its pinhole it winds to its own puddle", Math.abs(sumNo) < 1e-9 && Math.abs(sumPin - keyZ) < 0.01 * Math.abs(keyZ) && keyZ < 0, `${sumNo.toFixed(5)} vs ${sumPin.toFixed(5)} (key ${keyZ.toFixed(5)})`);
    const e = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map(meltEase);
    ok("meltEase: 0 to 1, monotone, sagging slowly first (0.25 -> 0.104) and dropping after", e[0] === 0 && e[6] === 1 && e.every((v, i) => i === 0 || v > e[i - 1]) && e[2] < 0.11 && e[4] > 0.89, e.map((v) => v.toFixed(3)).join(" "));
}

sec("2. THE FRAME, ON BOTH BACKENDS: t = 0, 0.5, 1 through fromAtlas with one shared FILL pipeline, each slugEval x the fire");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, SIZE, ORIGIN, N, FIRE, COLOUR }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const { parseFont } = await import("/text/slugFont.js");
            const M = await import("/render/slugDevice.mjs");
            const { buildVertices } = await import("/text/slugText.js");
            const { packMorphed } = await import("/render/slugMorph.mjs");
            const { meltMorph } = await import("/render/slugMelt.mjs");
            const { fireFill, fillTexture } = await import("/render/slugFill.mjs");
            const font = parseFont(await (await fetch("/vendor/fonts/IBMPlexSerif-Regular.ttf")).arrayBuffer());
            const { W, H, SIZE, ORIGIN, N, FIRE, COLOUR } = a; const [px, py] = ORIGIN; const out = {};
            const rows = new Float32Array([2 / W, 0, 0, (2 / W) * px - 1, 0, 2 / H, 0, 1 - (2 / H) * py, 0, 0, 0, 0, 0, 0, 0, 1]);
            const g8 = font.glyphIndex(56), fire = fireFill(FIRE);
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const o = { backend: dev.backend, frames: {}, entries: {}, pipelines: 0 };
                const fd = new M.SlugFontDevice(dev, font, " 8", { fill: true }); o.logWidth = fd.logWidth;
                if (fd.pipeline.compiled) { const err = await fd.pipeline.compiled; if (err) { o.error = err; out[backend] = o; continue; } }
                const tex = fillTexture(dev, fire.rgba, fire.w, fire.h);
                const m = meltMorph(font.outline(g8), { N }); o.rect = m.rect;
                const origPipeline = dev.pipeline.bind(dev); let made = 0; dev.pipeline = (d) => { made++; return origPipeline(d); };
                for (const t of [0, 0.5, 1]) {
                    const atlas = packMorphed(m.at(t).contours, { logWidth: fd.logWidth });
                    const fdm = M.SlugFontDevice.fromAtlas(dev, font, atlas, { pipeline: fd.pipeline, desc: fd.desc });
                    const b = new M.SlugDeviceBatch(fdm); b.setBuilt(buildVertices([{ glyphIndex: 0, codepoint: 0, x: 0, y: 0, size: SIZE }], (gi) => fdm.entryFor(gi), { color: COLOUR }));
                    const fr = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); b.draw(pass, rows, [W, H], { texture: tex, rect: m.rect }); }, { read: true }); o.frames["t" + t] = Array.from(fr.pixels);
                    const e = fdm.entryFor(0); o.entries["t" + t] = { loc: Array.from(e.loc), curveCount: e.curveCount, bbox: e.bbox };
                    b.destroy(); fdm.destroy();
                }
                o.pipelines = made; dev.pipeline = origPipeline;
                fd.destroy(); dev.destroy(); out[backend] = o;
            }
            return out;
        }` });
        ok("*** both backends built the fill pipeline and drew the melt at t = 0, 0.5, 1 ***", r.ok && r.result && r.result.webgpu && r.result.webgl2 && !r.result.webgpu.error && !r.result.webgl2.error, r.ok ? ((r.result.webgpu && r.result.webgpu.error) || (r.result.webgl2 && r.result.webgl2.error) || "") : (r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 400));
        if (r.ok && !r.result.webgpu.error && !r.result.webgl2.error) {
            const fire = fireFill(FIRE), m = meltMorph(outline("8"), { N });
            const floorPx = ORIGIN[1] - m.target.bbox.y0 * SIZE, topPx = floorPx - m.target.puddle.height * SIZE;
            for (const bk of ["webgpu", "webgl2"]) {
                const o = r.result[bk];
                ok(`${bk}: the three melt frames shared the font device's fill pipeline (none built per frame), and the page's rectangle is the melt's`, o.pipelines === 0 && o.rect.every((v, i) => Math.abs(v - m.rect[i]) < 1e-9), `${o.pipelines} built, rect ${o.rect.map((v) => v.toFixed(3)).join(",")}`);
                // NOT "whiter": the first draft held that the puddle is white and 14 of its 329 lit pixels were -- the puddle is 8 of the fire's
                // 48 rows and only the source row itself is white; the rows above it are yellow. Hotter is what the palette says: green rises
                // toward the source (render/doomFire.mjs PALETTE), so the hold is the mean green of the lit pixels.
                const heat = (px) => { let lit = 0, g = 0; for (let i = 0; i < W * H; i++) { if (px[i * 4] > 32) { lit++; g += px[i * 4 + 1]; } } return { lit, g: lit ? g / lit : 0 }; };
                const stats = {};
                for (const t of [0, 0.5, 1]) {
                    const atlas = packMorphed(m.at(t).contours, { logWidth: o.logWidth }), e = atlas.glyphs.get(0), ent = o.entries["t" + t];
                    ok(`  ${bk}: the atlas packed here at t = ${t} is the atlas the page packed (same loc and curve count)`, ent.loc[0] === e.loc[0] && ent.loc[1] === e.loc[1] && ent.curveCount === e.curveCount, `${e.curveCount} curves`);
                    const texAt = flatModel(e.bbox, SIZE, ORIGIN);
                    const g = gradeFilled(o.frames["t" + t], W, H, texAt, (tx, ty, fw) => slugRender(atlas, e, tx, ty, fw), fire, m.rect, COLOUR, TOL);
                    stats[t] = g;
                    report(`${bk} t = ${t}: ${g.exact} of ${W * H} exact, ${g.boundary} texel-boundary neighbours, ${g.unexplained} unexplained, worst ${g.worst}, ${g.lit} lit`);
                    ok(`*** ${bk}: the t = ${t} frame is coverage x the fire's nearest texel within ${TOL} of 255 on every pixel but texel-boundary neighbours (fewer than 0.5%) ***`, g.unexplained === 0 && g.boundary < W * H * 0.005 && g.lit > 20);
                }
                let above = 0, lit1 = 0; for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (o.frames.t1[(j * W + i) * 4] > 32) { lit1++; if (j + 0.5 < topPx - 1 || j + 0.5 > floorPx + 1) above++; }
                ok(`  ${bk}: the puddle's ink lies within its height of the floor (rows ${topPx.toFixed(1)}..${floorPx.toFixed(1)}), none above or below by more than a pixel`, above === 0 && lit1 > 100, `${lit1} lit, ${above} outside`);
                const h0 = heat(o.frames.t0), h1 = heat(o.frames.t1);
                ok(`  ${bk}: the puddle is hotter than the glyph -- it sits in the fire's source rows, so its lit pixels' mean green is higher by 40 of 255 or more`, h1.g > h0.g + 40, `mean green ${h1.g.toFixed(1)} over ${h1.lit} lit at t = 1 vs ${h0.g.toFixed(1)} over ${h0.lit} at t = 0`);
                // NOT "fewer lit pixels than t = 0": the first draft held that and the polar interpolation sags the outer BELOW the floor at
                // t = 0.5 (686 lit against 672), which is what found the sampler wrap at v = 1.0. The hold is that the middle is its own picture.
                const apart = (a, b) => { let n = 0; for (let i = 0; i < W * H; i++) if (Math.abs(a[i * 4] - b[i * 4]) > 32) n++; return n; };
                ok(`  ${bk}: t = 0.5 has ink and is neither endpoint (more than 200 pixels from each)`, stats[0.5].lit > 100 && apart(o.frames["t0.5"], o.frames.t0) > 200 && apart(o.frames["t0.5"], o.frames.t1) > 200, `${stats[0.5].lit} lit, ${apart(o.frames["t0.5"], o.frames.t0)} / ${apart(o.frames["t0.5"], o.frames.t1)} apart`);
            }
            for (const t of [0, 0.5, 1]) {
                let po = 0; for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) if (Math.abs(r.result.webgpu.frames["t" + t][i * 4 + c] - r.result.webgl2.frames["t" + t][i * 4 + c]) > TOL) { po++; break; }
                ok(`  the two backends agree at t = ${t} within ${TOL} of 255 on all but texel-boundary pixels (fewer than 0.5%)`, po < W * H * 0.005, `${po} pixels apart`);
            }
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: a glyph with two outer contours (its puddle is duplicated and deduped at t = 1, the winding lens in between is the morph gate's); the melt's timing on the page; a puddle that spreads over time rather than a fixed ellipse.");
process.exit(fails ? 1 : 0);
