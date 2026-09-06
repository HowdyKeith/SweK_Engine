#!/usr/bin/env node
// WebGLEngine/tools/ship/slugNapalm-selfcheck.mjs -- v4502
//
// THE TICKER ON FIRE, WITH A NAPALM TRAIL (task 49): render/slugNapalm.mjs. Section 1, headless: the puddle glyph's box and its atlas;
// the floor plane's rows send (x, y) to world (x, lift, y) exactly; the trail drops a puddle per body every `every` ticks, each at the
// body's x and z at its birth tick (checked against a recorded history), forgets them at maxAge, keeps `cap` a body, fades by the
// square; the trail's glyph records carry the fade as their own colour and buildVertices writes each quad's colour. Section 2, the
// world in node with the trail over it, a snapshot at tick 300. Section 3, both backends: the snapshot's bodies drawn with the fire
// fill (each its own glyph rectangle) over the trail laid flat with the fire fill, the fragment's texcoords captured and fitted to the
// perspective-correct model per quad (bodies AND puddles), then every pixel against the key: colour x fill x coverage composited in
// draw order -- the model's texcoord, slugEval's coverage, the fire's nearest texel -- within 2 of 255 but for texel-boundary
// neighbours; the trail fades from newest to oldest in the picture; the backends together.
//
// MEASURED AT v4502 (the ticker's tick-300 snapshot, 33 bodies over 396 puddles, 320 x 150, the fire 64 x 48 stepped 40 times from seed 7):
// the model per quad reproduces the fragment's texcoord to 2.29e-7 em at 1/16 on both backends over 2,939 lit fragments, none outside it.
// Bodies alone: 48,000 of 48,000 exact on WebGPU, worst 1 on WebGL2. Trail alone and together: 0 unexplained, worst 1 outside the ties.
// THREE THINGS THE KEY LEARNED ON THE WAY, each a measured finding: (1) an f64 composite rounded once sat 5 to 10 levels off a frame the
// two backends agreed on EXACTLY -- the target is rgba8unorm and stores each quad's blend as bytes before the next reads it; rounding per
// layer took WebGPU from 47,802 exact to 47,996; (2) 154 pixel centres (0.3%) lie ON a quad edge, because puddles of one size at nearly
// one z share edge lines on screen -- the fill rule's call, counted by edgeDist and excluded, WebGL2 off the key on 24 of them, WebGPU on
// 2; (3) the last two pixels, at (12, 83) and (308, 83), were the trail's end puddles straddling the viewport's edges, one layer of a
// ten-deep stack in or out: a clipped quad's cut vertices are re-snapped and its edges move by a snap unit, so its tie band is 1/Q.
//
// SABOTAGE (v4502): A  floorMatrix mapping the batch's y to world y (the trail standing up)  -> 5 red: the plane hold (worst 2.1) and both frames
//                                                                                              on both backends (2,470 puddle pixels standing in the
//                                                                                              bodies, the composite off).
//                   B  dropTrail never pruning by age                                          -> 1 red: the maxAge hold (10 puddles where 4 should
//                                                                                              remain). The cap alone kept the snapshot's count.
//                   C  trailGlyphs giving every puddle full colour (no fade)                   -> 2 red: the records' colour and the stream's
//                                                                                              (1.000 .. 1.000). THE FRAMES STAYED GREEN: the page
//                                                                                              draws the records this gate ships, so the fade's
//                                                                                              contract is the headless holds', not the frame's.
//                   D  buildVertices ignoring a glyph's own colour                             -> 1 red: the stream's colour hold (1.000 .. 1.000),
//                                                                                              the frames green for the same reason as C.
//                   Each restored and the baseline re-run: 0 red.
//
// Run: node tools/ship/slugNapalm-selfcheck.mjs      (~90 s)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { nullBackend } from "../../gfx/device.js";
import { parseFont } from "../../text/slugFont.js";
import { slugRender } from "../../text/slugEval.js";
import { buildVertices } from "../../text/slugText.js";
import { SlugFontDevice } from "../../render/slugDevice.mjs";
import { quadTriangles, quadsOf } from "../../render/slugProjective.mjs";
import { mat4, TICKER, glyphBodies, worldFromModule, spawnTicker, tickTicker, cameraFor, bodyRows } from "../../render/slugTicker.mjs";
import { NAPALM, puddleGlyph, puddleAtlas, floorMatrix, floorRows, createTrail, dropTrail, trailAlpha, trailGlyphs, quadColour } from "../../render/slugNapalm.mjs";
import { contourArea } from "../../render/slugMelt.mjs";
import { fireFill, sampleFill, fillUv, nearestTexel, glyphRect } from "../../render/slugFill.mjs";
import { initNode, mod } from "../../physics/box3d/box3dNode.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const W = 320, H = 150, TOL = 2, TIE_PX = 1e-3, SUBPIXEL_CANDIDATES = [4, 8, 16, 32, 64, 128, 256, Infinity], SNAP_TICK = 300, FIRE = { width: 64, height: 48, seed: 7, steps: 40 };
const CHARS = " " + TICKER.text + "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const font = parseFont(new Uint8Array(fs.readFileSync(path.join(ENG, "vendor/fonts/IBMPlexSerif-Regular.ttf"))));
const nb = nullBackend();
let fd = new SlugFontDevice(nb, font, CHARS, { logWidth: 11, fill: true }), gbMain = null, snapshot = null, trailAtSnap = null;

sec("1. HEADLESS: the puddle glyph, the floor plane, the trail's bookkeeping, the fade in the stream");
{
    const pg = puddleGlyph();
    ok("the puddle glyph is one contour wound as an outer, its em box one em wide from the floor to 0.28", pg.contours.length === 1 && contourArea(pg.contours[0]) < 0 && near(pg.bbox.x0, -0.5) && near(pg.bbox.x1, 0.5) && near(pg.bbox.y0, 0) && near(pg.bbox.y1, 0.28));
    const pa = puddleAtlas(11), pe = pa.glyphs.get(0);
    ok("and packs into an atlas of one glyph at key 0 with that box and 48 curves", pa.glyphs.size === 1 && pe && pe.curveCount === 48 && near(pe.bbox.y1, 0.28) && near(pe.bbox.x0, -0.5));
    const PV = cameraFor(W, H), F = floorMatrix(0.002), PVF = mat4.multiply(PV, F);
    let worstF = 0; for (const [x, y] of [[0, 0], [1.3, -0.4], [-2, 0.7], [0.25, 0.25]]) { const a = mat4.apply(PVF, [x, y, 0, 1]), b = mat4.apply(PV, [x, 0.002, y, 1]); for (let i = 0; i < 4; i++) worstF = Math.max(worstF, Math.abs(a[i] - b[i])); }
    const rows = floorRows(PV, 0.002);
    ok("the floor plane sends the batch's (x, y, 0) to the camera's view of world (x, lift, y) exactly, and its rows drop the z column", worstF < 1e-12 && rows.length === 16 && rows[2] === 0 && rows[6] === 0 && rows[14] === 0 && near(rows[3], PVF[3], 1e-6) && near(rows[7], PVF[7], 1e-6), `worst ${worstF.toExponential(1)} (the rows are f32)`);
    // the bookkeeping on a made-up world: two bodies, one drifting in x
    const t = createTrail({ every: 10, maxAge: 150, cap: 12 }), xf = new Float32Array(3 * 7), hist = new Map();
    xf[7] = 1; xf[9] = 0.2; xf[14] = 2; xf[16] = -0.3;
    let counts = [];
    for (let k = 1; k <= 400; k++) { xf[7] += 0.01; if (k % 10 === 0) hist.set(k, [xf[7], xf[9], xf[14], xf[16]]); counts.push(dropTrail(t, k, xf, [1, 2])); }
    ok("a puddle per body every 10 ticks: after 400 ticks each body keeps its newest 12 (the cap), the oldest 110 ticks old, none at or past maxAge", t.drops.length === 24 && t.drops.filter((d) => d.body === 0).length === 12 && 400 - t.drops[0].born === 110 && t.drops.every((d) => 400 - d.born < 150));
    ok("the count grows by two a drop until the cap holds it (2, 4, ... 24 then 24)", counts[9] === 2 && counts[19] === 4 && counts[119] === 24 && counts[399] === 24 && Math.max(...counts) === 24);
    ok("every puddle sits at its body's x and z at its birth tick (the height dropped), newest last", t.drops.every((d) => { const h = hist.get(d.born); return h && near(d.x, h[d.body * 2]) && near(d.z, h[d.body * 2 + 1]); }) && t.drops.every((d, i) => i === 0 || d.born >= t.drops[i - 1].born));
    const t2 = createTrail({ every: 10, maxAge: 35, cap: 100 }); for (let k = 1; k <= 100; k++) dropTrail(t2, k, xf, [1]);
    ok("with maxAge 35 and no cap to speak of, only the puddles younger than 35 ticks remain (4 of 10)", t2.drops.length === 4 && t2.drops.every((d) => 100 - d.born < 35), `${t2.drops.length}`);
    ok("trailAlpha: 1 when dropped, a quarter at half life, 0 at maxAge and after, never rising", trailAlpha(0) === 1 && near(trailAlpha(75, 150), 0.25) && trailAlpha(150) === 0 && trailAlpha(200) === 0 && trailAlpha(10) > trailAlpha(20));
    const gl = trailGlyphs(t, 400, 0.3);
    ok("trailGlyphs: one record a puddle at (x, z - 0.14 world) at 0.3 an em, every channel the fade", gl.length === 24 && gl.every((g, i) => near(g.x, t.drops[i].x) && near(g.y, t.drops[i].z - 0.14 * 0.3) && g.size === 0.3 && g.color.every((c) => near(c, trailAlpha(400 - t.drops[i].born)))));
    const built = buildVertices(gl, () => pe);
    ok("and buildVertices writes each quad's OWN colour (the first is the oldest, the last the newest at 1)", built.quadCount === 24 && near(quadColour(built, 0)[0], trailAlpha(110), 1e-6) && near(quadColour(built, 23)[0], 1) && quadColour(built, 5)[3] === quadColour(built, 5)[0] && quadColour(built, 0)[0] < quadColour(built, 23)[0], `${quadColour(built, 0)[0].toFixed(3)} .. ${quadColour(built, 23)[0].toFixed(3)}`);
    const plain = buildVertices([{ glyphIndex: 0, codepoint: 0, x: 0, y: 0, size: 1 }], () => pe, { color: [0.5, 0.25, 1, 1] });
    ok("CONTROL: a glyph without its own colour still takes opts.color (the streams every other gate holds are unchanged)", near(quadColour(plain, 0)[0], 0.5, 1e-6) && near(quadColour(plain, 0)[1], 0.25, 1e-6));
}

sec("2. THE WORLD IN NODE: the ticker with a trail over it, a snapshot at tick 300");
{
    const st = await initNode();
    ok("the box3d wasm loads in node", st.ready, st.reason || "");
    if (st.ready) {
        const m = mod(); gbMain = glyphBodies(font, (gi) => fd.entryFor(gi));
        const w = worldFromModule(m); const { ids } = spawnTicker(w, gbMain.bodies, gbMain.plan);
        const trail = createTrail(); let wrapped = 0; const hist = new Map();
        for (let t = 1; t <= SNAP_TICK; t++) { const r = tickTicker(w, ids, gbMain.plan); wrapped += r.wrapped; dropTrail(trail, t, r.xf, ids); if (t % trail.every === 0) hist.set(t, Array.from(r.xf));
            if (t === SNAP_TICK) { snapshot = { xf: Array.from(r.xf), ids: ids.slice() }; trailAtSnap = { drops: trail.drops.map((d) => ({ ...d })), every: trail.every, maxAge: trail.maxAge, cap: trail.cap }; } }
        w.destroy();
        ok(`at tick ${SNAP_TICK} the trail holds ${trailAtSnap.drops.length} puddles: ${gbMain.bodies.length} bodies x the cap of ${NAPALM.cap}, none older than ${NAPALM.maxAge - 1} ticks`, trailAtSnap.drops.length === gbMain.bodies.length * NAPALM.cap && trailAtSnap.drops.every((d) => SNAP_TICK - d.born < NAPALM.maxAge), `${wrapped} wraps`);
        ok("every puddle is where its body was on its birth tick", trailAtSnap.drops.every((d) => { const h = hist.get(d.born), o = ids[d.body] * 7; return h && near(d.x, h[o]) && near(d.z, h[o + 2]); }));
        const spread = trailAtSnap.drops.map((d) => d.x); report(`puddles from x ${Math.min(...spread).toFixed(2)} to ${Math.max(...spread).toFixed(2)}, bodies from ${Math.min(...ids.map((i) => snapshot.xf[i * 7])).toFixed(2)} to ${Math.max(...ids.map((i) => snapshot.xf[i * 7])).toFixed(2)}`);
        ok("the trail lies BEHIND the bodies along the conveyor: every puddle's x is at or below its body's x now (or its body has wrapped)", trailAtSnap.drops.every((d) => d.x <= snapshot.xf[ids[d.body] * 7] + 1e-6 || snapshot.xf[ids[d.body] * 7] < d.x - gbMain.plan.loop / 2));
    }
}

const bitsToF32 = (px, i, j) => { const o = (j * W + i) * 4; return new Float32Array(new Uint8Array([px[o], px[o + 1], px[o + 2], px[o + 3]]).buffer)[0]; };
let modelQuads = null;   // in DRAW order: the trail's puddles, then the bodies
function buildModelQuads(pe, trailBuilt) {
    const PV = cameraFor(W, H), rows = floorRows(PV), out = [];
    quadsOf(trailBuilt).forEach((q) => out.push({ q, rows, e: pe, atlas: pe.__atlas, colour: quadColour(trailBuilt, q.q), rect: [pe.bbox.x0, pe.bbox.y0, pe.bbox.x1, pe.bbox.y1] }));
    gbMain.bodies.forEach((b, k) => { const br = bodyRows(PV, snapshot.xf, snapshot.ids[k]); for (const q of quadsOf(b.built)) out.push({ q: { ...q, q: k }, rows: br, e: fd.entryFor(b.glyphIndex), atlas: fd.atlas, colour: quadColour(b.built, q.q), rect: glyphRect(fd.entryFor(b.glyphIndex)) }); });
    return out;
}
// A quad with a corner outside the viewport is CLIPPED: the rasteriser cuts it at the viewport's edge and snaps the cut vertices to
// the subpixel grid, so its edge lines can move by up to one snap unit (1/Q px). The two pixels this found (v4502) were the trail's
// end puddles straddling the left and right edges, one layer in or out of a stack of ten. Such a quad's tie band is 1/Q, not TIE_PX.
function modelTris(Q, which = null) { const tris = []; for (const m of modelQuads) { if (which && !which(m)) continue; const qt = quadTriangles(m.q, m.rows, W, H, Q);
    const clipped = qt.corners.some((c) => c.sx < 0 || c.sx > W || c.sy < 0 || c.sy > H); for (const t of qt.tris) tris.push({ ...t, m, tieBand: clipped && isFinite(Q) ? 1 / Q : TIE_PX }); } return tris; }
function fit(cap) {
    const results = [];
    for (const Q of SUBPIXEL_CANDIDATES) { const tris = modelTris(Q).reverse(); let worst = 0, n = 0, orphan = 0, ties = 0;
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const mtx = bitsToF32(cap.tx, i, j); if (mtx === 0) continue; const x = i + 0.5, y = j + 0.5, mty = bitsToF32(cap.ty, i, j); let hit = false, err = Infinity, tie = false;
            // the last-drawn quad containing the pixel is the fragment the capture kept -- unless the centre is ON an edge (a tie the fill rule
            // decides), in which case any tied candidate may be it: take the best among them, and count the tie
            for (const t of tris) { if (!t.inside(x, y)) continue; const [tx, ty] = t.at(x, y), e = Math.max(Math.abs(tx - mtx), Math.abs(ty - mty)); const onEdge = t.edgeDist(x, y) < t.tieBand;
                if (!hit) { hit = true; err = e; if (!onEdge) break; tie = true; continue; } if (onEdge || tie) { err = Math.min(err, e); if (!onEdge) break; } else break; }
            if (!hit) orphan++; else { n++; if (tie) ties++; worst = Math.max(worst, err); } }
        results.push({ Q, worst, n, orphan, ties }); }
    results.sort((a, b) => a.worst - b.worst); return { best: results[0], all: results };
}
/** the key frame: every quad in draw order, colour x fill x coverage over what is there (premultiplied over) -- plus, per pixel, the neighbouring-texel alternatives */
function expectedFrame(Q, fire, which = null) {
    const tris = modelTris(Q, which), out = new Float32Array(W * H * 3), alt = new Array(W * H).fill(null), trailCov = new Float32Array(W * H), tie = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const x = i + 0.5, y = j + 0.5; let acc = [0, 0, 0]; const alts = [];
        for (const t of tris) { if (!t.inside(x, y)) continue; if (t.edgeDist(x, y) < t.tieBand) tie[j * W + i] = 1; const [tx, ty] = t.at(x, y); const x0 = (i & ~1) + 0.5, y0 = (j & ~1) + 0.5, a = t.at(x0, y0), b = t.at(x0 + 1, y0), c = t.at(x0, y0 + 1);
            const cov = slugRender(t.m.atlas, t.m.e, tx, ty, [Math.abs(b[0] - a[0]) + Math.abs(c[0] - a[0]), Math.abs(b[1] - a[1]) + Math.abs(c[1] - a[1])]);
            if (cov <= 0) continue; if (t.m.e.__isPuddle) trailCov[j * W + i] = Math.max(trailCov[j * W + i], cov * t.m.colour[0]);
            const fill = sampleFill(fire.rgba, fire.w, fire.h, tx, ty, t.m.rect);
            const [u, v] = fillUv(tx, ty, t.m.rect), [fx, fy] = nearestTexel(u, v, fire.w, fire.h);
            const neigh = []; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = Math.min(fire.w - 1, Math.max(0, fx + dx)), yy = Math.min(fire.h - 1, Math.max(0, fy + dy)), oo = (yy * fire.w + xx) * 4; neigh.push([fire.rgba[oo] / 255, fire.rgba[oo + 1] / 255, fire.rgba[oo + 2] / 255]); }
            alts.push({ cov, colour: t.m.colour, fill, neigh, who: t.m.e.__isPuddle ? "puddle" + t.m.q.q : "body" + t.m.q.q, tx, ty });
            acc = over(acc, t.m.colour, fill, cov); }
        out[(j * W + i) * 3] = acc[0]; out[(j * W + i) * 3 + 1] = acc[1]; out[(j * W + i) * 3 + 2] = acc[2]; if (alts.length) alt[j * W + i] = alts; }
    return { out, alt, trailCov, tie };
}
/**
 * One layer over what is there, THE WAY THE TARGET STORES IT: premultiplied over in f64, then rounded to a byte, because the target
 * is rgba8unorm and every primitive's blend result is stored before the next reads it. The first draft composited in f64 and rounded
 * once at the end, and under a stack of ten puddles the two backends agreed with each other and sat 5 to 10 levels off that key.
 */
function over(acc, colour, fill, cov) { return acc.map((v, ch) => Math.round((colour[ch] * fill[ch] * cov + (v / 255) * (1 - colour[3] * cov)) * 255)); }
/** does any single neighbouring-texel substitution (one quad's fill swapped for a neighbour) explain the pixel? */
function explained(alts, got, tol) {
    for (let k = 0; k < alts.length; k++) for (const nf of alts[k].neigh) { let acc = [0, 0, 0];
        alts.forEach((a, idx) => { const f = idx === k ? nf : a.fill; acc = over(acc, a.colour, f, a.cov); });
        if (acc.every((v, ch) => Math.abs(v - got[ch]) <= tol)) return true; }
    return false;
}

sec("3. THE FRAME, ON BOTH BACKENDS: the tick-300 snapshot, bodies on fire over the trail on the floor, against the composited key");
{
    const skip = webgpuSkipReason();
    if (skip || !snapshot) { console.log(`  SKIP  ${skip || "no snapshot"}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const PV = cameraFor(W, H);
        const rowsPerBody = gbMain.bodies.map((b, k) => Array.from(bodyRows(PV, snapshot.xf, snapshot.ids[k]))), rowsFloor = Array.from(floorRows(PV));
        const glyphs = trailGlyphs(trailAtSnap, SNAP_TICK);
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, CHARS, rowsPerBody, rowsFloor, glyphs, FIRE }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const { parseFont } = await import("/text/slugFont.js");
            const M = await import("/render/slugDevice.mjs");
            const { buildVertices } = await import("/text/slugText.js");
            const { glyphBodies } = await import("/render/slugTicker.mjs");
            const { puddleAtlas } = await import("/render/slugNapalm.mjs");
            const { fireFill, fillTexture, glyphRect } = await import("/render/slugFill.mjs");
            const font = parseFont(await (await fetch("/vendor/fonts/IBMPlexSerif-Regular.ttf")).arrayBuffer());
            const { W, H, CHARS, rowsPerBody, rowsFloor, glyphs, FIRE } = a; const out = {}; const fire = fireFill(FIRE);
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const o = { backend: dev.backend, cap: {}, errs: [] };
                const fd = new M.SlugFontDevice(dev, font, CHARS, { fill: true }); o.logWidth = fd.logWidth;
                if (fd.pipeline.compiled) { const err = await fd.pipeline.compiled; if (err) { o.errs.push(err); out[backend] = o; continue; } }
                const tex = fillTexture(dev, fire.rgba, fire.w, fire.h);
                const gb = glyphBodies(font, (gi) => fd.entryFor(gi)); o.bodies = gb.bodies.length;
                if (gb.bodies.length !== rowsPerBody.length) { o.errs.push("body count " + gb.bodies.length + " against " + rowsPerBody.length); out[backend] = o; continue; }
                const pa = puddleAtlas(fd.logWidth), pd = M.SlugFontDevice.fromAtlas(dev, font, pa, { pipeline: fd.pipeline, desc: fd.desc }), pe = pd.entryFor(0);
                o.puddle = { loc: Array.from(pe.loc), curveCount: pe.curveCount };
                const trail = new M.SlugDeviceBatch(pd); trail.setBuilt(buildVertices(glyphs, () => pe));
                const draws = [{ b: trail, rows: new Float32Array(rowsFloor), fd: pd, rect: glyphRect(pe) }].concat(gb.bodies.map((bd, k) => { const b = new M.SlugDeviceBatch(fd); b.setBuilt(bd.built); return { b, rows: new Float32Array(rowsPerBody[k]), fd, rect: glyphRect(fd.entryFor(bd.glyphIndex)) }; }));
                const fr = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); for (const q of draws) q.b.draw(pass, q.rows, [W, H], { texture: tex, rect: q.rect }); }, { read: true }); o.pixels = Array.from(fr.pixels);
                const ft = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); draws[0].b.draw(pass, draws[0].rows, [W, H], { texture: tex, rect: draws[0].rect }); }, { read: true }); o.pixelsTrail = Array.from(ft.pixels);
                const fb = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); for (const q of draws.slice(1)) q.b.draw(pass, q.rows, [W, H], { texture: tex, rect: q.rect }); }, { read: true }); o.pixelsBodies = Array.from(fb.pixels);
                for (const what of ["tx", "ty"]) {
                    let d; try { d = M.slugCaptureDesc(fd.logWidth, what); } catch (e) { o.errs.push(what + ": " + e.message); continue; }
                    const pipe = dev.pipeline(d); if (pipe.compiled) { const err = await pipe.compiled; if (err) { o.errs.push(what + ": " + err); continue; } }
                    const cf = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 0]); pass.use(pipe); for (const q of draws) { for (let i = 0; i < 4; i++) pass.uniform("m" + i, q.rows.subarray(i * 4, i * 4 + 4)); pass.uniform("viewport", [W, H]);
                        pass.texture("curveTexture", q.fd.curveTexture, 0); pass.texture("bandTexture", q.fd.bandTexture, 1); pass.vertices(q.b.vb); pass.indices(q.b.ib); pass.drawIndexed(q.b.indexCount); } }, { read: true });
                    o.cap[what] = Array.from(cf.pixels);
                }
                for (const q of draws) q.b.destroy(); pd.destroy(); fd.destroy(); dev.destroy(); out[backend] = o;
            }
            return out;
        }` });
        ok(`*** both backends drew the ${rowsPerBody.length} bodies on fire over ${glyphs.length} puddles and captured the texcoords ***`, r.ok && r.result && r.result.webgpu && r.result.webgl2 && r.result.webgpu.errs.length === 0 && r.result.webgl2.errs.length === 0, r.ok ? (r.result.webgpu.errs.concat(r.result.webgl2.errs).join(" | ") || "") : (r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 400));
        if (r.ok && r.result.webgpu.errs.length === 0 && r.result.webgl2.errs.length === 0) {
            fd = new SlugFontDevice(nb, font, CHARS, { logWidth: r.result.webgl2.logWidth, fill: true });
            const pa = puddleAtlas(fd.logWidth), pe = pa.glyphs.get(0); pe.__atlas = pa; pe.__isPuddle = true;
            const trailBuilt = buildVertices(glyphs, () => pe); modelQuads = buildModelQuads(pe, trailBuilt);
            const fire = fireFill(FIRE);
            for (const bk of ["webgpu", "webgl2"]) {
                const o = r.result[bk];
                ok(`${bk}: the puddle atlas packed here is the page's (same loc and curve count)`, o.puddle.loc[0] === pe.loc[0] && o.puddle.loc[1] === pe.loc[1] && o.puddle.curveCount === pe.curveCount);
                const f = fit(o.cap);
                report(`${bk}: fit -- ` + f.all.slice(0, 3).map((x) => `1/${x.Q}: ${x.worst.toExponential(2)}`).join("  ") + `; ${f.best.orphan} lit fragments outside every model quad, ${f.best.ties} on an edge (tied)`);
                ok(`*** ${bk}: the perspective-correct model per quad (puddles and bodies) reproduces the fragment's texcoord to 1e-5 em over ${f.best.n} fragments, none lit outside it ***`, f.best.worst < 1e-5 && f.best.n > 2000 && f.best.orphan === 0, `worst ${f.best.worst.toExponential(2)} em at 1/${f.best.Q}`);
                const grade = (pixels, key, label) => { let worst = 0, over = 0, boundary = 0, exact = 0, lit = 0, trailLit = 0, at = -1, ties = 0, tiesOff = 0;
                    for (let i = 0; i < W * H; i++) { const got = [pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]]; let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(got[c] - key.out[i * 3 + c]));
                        if (key.out[i * 3] > 5 || key.out[i * 3 + 1] > 5) lit++; if (key.trailCov[i] > 0.02) trailLit++; if (d === 0) exact++;
                        if (key.tie[i]) { ties++; if (d > TOL) tiesOff++; continue; }   // a pixel centre on a quad edge: the fill rule's call, counted, not held
                        if (d > worst) { worst = d; at = i; }
                        if (d > TOL) { if (key.alt[i] && explained(key.alt[i], got, TOL)) boundary++; else { over++; if (over <= 4) report(`${bk} ${label}: unexplained (${i % W}, ${Math.floor(i / W)}) got ${got.join(",")} key ${[0, 1, 2].map((c) => key.out[i * 3 + c]).join(",")} -- ${(key.alt[i] || []).map((a) => `${a.who} cov ${a.cov.toFixed(3)} col ${a.colour[0].toFixed(2)} fill ${a.fill.map((v) => v.toFixed(2)).join("/")}`).join(" | ")}`); } } }
                    report(`${bk} ${label}: ${exact} of ${W * H} exact, ${boundary} texel-boundary neighbours, ${over} unexplained, worst ${worst} at (${at % W}, ${Math.floor(at / W)}); ${ties} pixel centres on a quad edge (${tiesOff} of them off the key); ${lit} lit by the key, ${trailLit} of them trail`);
                    return { worst, over, boundary, exact, lit, trailLit, ties }; };
                const gT = grade(o.pixelsTrail, expectedFrame(f.best.Q, fire, (m) => m.e.__isPuddle), "trail alone"), gB = grade(o.pixelsBodies, expectedFrame(f.best.Q, fire, (m) => !m.e.__isPuddle), "bodies alone");
                ok(`  ${bk}: the trail alone is its key (${gT.trailLit} puddle pixels, ${gT.lit} lit), and the bodies alone theirs (${gB.lit} lit), within ${TOL} but for texel-boundary neighbours and edge ties`, gT.over === 0 && gB.over === 0 && gT.trailLit > 300 && gB.lit > 700 && gT.ties < W * H * 0.005);
                const g = grade(o.pixels, expectedFrame(f.best.Q, fire), "together"), { over, boundary, lit, trailLit, ties } = g;
                ok(`*** ${bk}: every pixel is the composited key (colour x fire x coverage in draw order) within ${TOL} of 255 but for texel-boundary neighbours (fewer than 1%) and edge ties (fewer than 0.5%) ***`, over === 0 && boundary < W * H * 0.01 && ties < W * H * 0.005 && lit > 1500 && trailLit > 300);
                // the fade in the picture: the trail's newest puddles brighter than its oldest, in the model's own terms (coverage x alpha), which the frame just matched
                const byAge = new Map(); glyphs.forEach((g, q) => { const age = SNAP_TICK - g.born; if (!byAge.has(age)) byAge.set(age, []); byAge.get(age).push(q); });
                ok(`  ${bk}: the trail is drawn (${trailLit} pixels with puddle ink in the key) with ${byAge.size} ages from ${Math.min(...byAge.keys())} to ${Math.max(...byAge.keys())} ticks, the fade ${trailAlpha(Math.min(...byAge.keys())).toFixed(2)} down to ${trailAlpha(Math.max(...byAge.keys())).toFixed(2)}`, trailLit > 300 && byAge.size >= 10 && trailAlpha(Math.max(...byAge.keys())) < 0.2);
            }
            const G = r.result.webgpu.pixels, L = r.result.webgl2.pixels; let po = 0; for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) if (Math.abs(G[i * 4 + c] - L[i * 4 + c]) > TOL) { po++; break; }
            ok(`  the two backends agree within ${TOL} of 255 on all but texel-boundary pixels (fewer than 1%)`, po < W * H * 0.01, `${po} pixels apart`);
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: a depth test between bodies and puddles (the trail is drawn first, no depth); the trail's cost at the page's counts on a rig; a puddle that spreads with age rather than fading.");
process.exit(fails ? 1 : 0);
