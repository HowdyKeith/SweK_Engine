#!/usr/bin/env node
// WebGLEngine/tools/ship/slugShatter-selfcheck.mjs -- v4503
//
// A TICKER GLYPH SHATTERS INTO RECTANGULAR SHARDS (task 50): render/slugShatter.mjs. Section 1, headless: splitRect tiles the box
// exactly (the cells' areas sum to the box's, none overlap, the last column and row end on the box's edges); a shard's stream is one
// quad whose texcoords are the cell's corners and whose positions are the cell scaled and centred on the origin, carrying the glyph's
// atlas words; the plan's halves and offsets; placeOffset against a hand quaternion; the generator seeded twice the same; nearestBody.
// Section 2, the world in node: the ticker to tick 300, the body nearest the centre shattered, its shards where its cells were, the
// glyph parked; the shards spread and rise over the burst and are parked at `life` with the glyph back at the near end and moving; the
// pool reuses its bodies on a second shatter (none made); two runs hash the same. Section 3, both backends: the tick-312 snapshot --
// the shards mid-burst among the other bodies -- with the fragment's texcoords fitted to the perspective-correct model per quad, every
// pixel the coverage key (white over black, rounded per layer as the target stores it), the shards' ink spread wider than the
// glyph's box was, the parked glyph absent; the backends together.
//
// MEASURED AT v4503 (the ticker to tick 300, body 11 -- an 'r' lying on its side -- shattered 3 x 3, 320 x 150): the cells tile the box
// to 1e-12; one tick after the burst every shard is within 0.057 units of its cell; the mean distance from the burst grows 0.052 -> 1.675
// over 90 ticks and a shard rises to 0.42 above a centre at 0.04; at life all nine are parked at y -60 with the glyph back at its spawn
// at vx 1.20; the second shatter makes no body (9, 9); two runs hash the same; 43 bodies. On both backends the tick-312 frame fits the
// model per quad to 3.28e-6 em at 1/16 over 2,408 fragments, none outside; WebGPU 48,000 of 48,000 exact, WebGL2 worst 1; the shards'
// ink spans 16 x 27 px (a whole glyph quad here is about 7); the backends 0 apart. A first draft let the second shatter overwrite the
// first's recorded cells and read tick 301's shards against tick 410's cells: a 0.58-unit "jump" that was the conveyor's travel.
//
// SABOTAGE (v4503): A  shardStream writing the whole em box as every shard's texcoords  -> 1 red: the stream hold, by name. THE FRAMES STAYED
//                                                                                          GREEN: the page and the key both build the stream
//                                                                                          from the same function, so what the sub-rectangle IS
//                                                                                          is the headless contract; the frames hold that the
//                                                                                          device draws whatever quad it was given exactly.
//                   B  placeOffset ignoring the rotation (offsets added unrotated)       -> 2 red: the quarter-turn hold ((2, 2, 3) for (1, 3, 3))
//                                                                                          and the tick-301 hold (worst 0.063: the body lay on its
//                                                                                          side, so an unrotated offset swaps x and y).
//                   C  tickShatter never parking (life ignored)                           -> 5 red: the pool (18 bodies made), the parking, the
//                                                                                          return, the hash (52 bodies), the snapshot.
//                   D  splitRect's cells overlapping (each half a cell wider)             -> 4 red: the tiling (6 overlaps), the plan's offsets, and
//                                                                                          both frames' spread hold (10 x 27: the shards overlap).
//                   Each restored and the baseline re-run: 0 red.
//
// Run: node tools/ship/slugShatter-selfcheck.mjs      (~90 s)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { nullBackend } from "../../gfx/device.js";
import { parseFont } from "../../text/slugFont.js";
import { slugRender } from "../../text/slugEval.js";
import { SlugFontDevice } from "../../render/slugDevice.mjs";
import { quadTriangles, quadsOf } from "../../render/slugProjective.mjs";
import { mat4, TICKER, glyphBodies, worldFromModule, spawnTicker, tickTicker, cameraFor, bodyRows } from "../../render/slugTicker.mjs";
import { SHATTER, splitRect, shardStream, shardPlan, rng, placeOffset, createPool, shatterBody, tickShatter, nearestBody } from "../../render/slugShatter.mjs";
import { initNode, mod } from "../../physics/box3d/box3dNode.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const W = 320, H = 150, TOL = 2, TIE_PX = 1e-3, SUBPIXEL_CANDIDATES = [4, 8, 16, 32, 64, 128, 256, Infinity], SHATTER_TICK = 300, SNAP_TICK = 312;
const CHARS = " " + TICKER.text + "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const font = parseFont(new Uint8Array(fs.readFileSync(path.join(ENG, "vendor/fonts/IBMPlexSerif-Regular.ttf"))));
const nb = nullBackend();
let fd = new SlugFontDevice(nb, font, CHARS, { logWidth: 11 }), gbMain = null, snapshot = null, shatterK = -1, plan = null;

sec("1. HEADLESS: the cells, the shard stream, the plan, the placement, the generator");
{
    const bb = { x0: 0.06, y0: -0.012, x1: 0.54, y1: 0.71 }, cells = splitRect(bb, 3, 3);
    const area = (c) => (c.x1 - c.x0) * (c.y1 - c.y0);
    let overlap = 0; for (let a = 0; a < cells.length; a++) for (let b = a + 1; b < cells.length; b++) { const A = cells[a], B = cells[b]; if (Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0) > 1e-12 && Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0) > 1e-12) overlap++; }
    ok("splitRect: nine cells whose areas sum to the box's to 1e-12, none overlapping, the last column and row ending on the box's edges", cells.length === 9 && near(cells.reduce((s, c) => s + area(c), 0), area(bb), 1e-12) && overlap === 0 && cells[2].x1 === bb.x1 && cells[8].y1 === bb.y1 && cells[0].x0 === bb.x0 && cells[0].y0 === bb.y0, `${overlap} overlaps`);
    gbMain = glyphBodies(font, (gi) => fd.entryFor(gi));
    const body = gbMain.bodies[0], e = fd.entryFor(body.glyphIndex), p = shardPlan(body, e, TICKER.size, TICKER.depth);
    const q4 = quadsOf(p[4].built)[0], c4 = p[4].cell;
    ok("a shard's stream is ONE quad: texcoords the cell's corners, positions the cell scaled by the size and centred on the origin, normals the diagonals",
        p[4].built.quadCount === 1 && near(q4.corners[0].tex[0], c4.x0, 1e-6) && near(q4.corners[0].tex[1], c4.y0, 1e-6) && near(q4.corners[2].tex[0], c4.x1, 1e-6) && near(q4.corners[2].tex[1], c4.y1, 1e-6) &&
        near(q4.corners[0].pos[0], -(c4.x1 - c4.x0) / 2 * TICKER.size, 1e-6) && near(q4.corners[2].pos[1], (c4.y1 - c4.y0) / 2 * TICKER.size, 1e-6) && q4.corners[0].pos[2] === -1 && q4.corners[2].pos[3] === 1 && near(q4.corners[0].jac[0], 1 / TICKER.size, 1e-6));
    const f = new Float32Array(p[4].built.buffer), u = new Uint32Array(p[4].built.buffer), g0 = new Uint32Array(body.built.buffer), g0f = new Float32Array(body.built.buffer);
    ok("and carries the glyph's own atlas words (loc, flags) and band transform, as the body's stream does", u[6] === g0[6] && u[7] === g0[7] && f[12] === g0f[12] && f[15] === g0f[15]);
    ok("the plan's halves are the cells' halves at the size with the body's depth, and the offsets tile the body's box (their sum is the centre, 0)", p.length === 9 && p.every((s) => near(s.half[0], (s.cell.x1 - s.cell.x0) / 2 * TICKER.size, 1e-12) && s.half[2] === TICKER.depth) && near(p.reduce((s, x) => s + x.offset[0], 0), 0, 1e-9) && near(p.reduce((s, x) => s + x.offset[1], 0), 0, 1e-9) && near(p[8].offset[0], body.half[0] - p[8].half[0], 1e-9));
    const w = placeOffset([1, 2, 3], [0, 0, Math.SQRT1_2, Math.SQRT1_2], [1, 0, 0]);
    ok("placeOffset: a quarter turn about z carries an x offset to +y (1, 2, 3) + (0, 1, 0)", near(w[0], 1, 1e-9) && near(w[1], 3, 1e-9) && near(w[2], 3, 1e-9), w.map((v) => v.toFixed(4)).join(","));
    const a = rng(7), b = rng(7), c = rng(8);
    ok("rng seeded the same is the same sequence and seeded differently is not, in [0, 1)", a() === b() && a() === b() && a() !== c() && [a(), a(), a()].every((v) => v >= 0 && v < 1));
    const xf = new Float32Array(4 * 7); xf[7] = -1.2; xf[14] = 0.3; xf[21] = 2;
    ok("nearestBody picks the body nearest x = 0 and skips a busy one", nearestBody(xf, [1, 2, 3]) === 1 && nearestBody(xf, [1, 2, 3], new Set([1])) === 0);
}

sec("2. THE WORLD IN NODE: the ticker to tick 300, the centre body shattered, the burst, the parking, the return, the pool");
{
    const st = await initNode();
    ok("the box3d wasm loads in node", st.ready, st.reason || "");
    if (st.ready) {
        const m = mod(), runs = [];
        for (let run = 0; run < 2; run++) {
            const w = worldFromModule(m); const { ids } = spawnTicker(w, gbMain.bodies, gbMain.plan); const pool = createPool(w); let shatters = [], made = [], spread = [], top = [], wrapped = 0;
            let k = -1, centre = null, at301 = null, back = null, cellsAt301 = null;
            for (let t = 1; t <= SHATTER_TICK + SHATTER.life + 40; t++) {
                const r = tickTicker(w, ids, gbMain.plan); wrapped += r.wrapped;
                shatters = tickShatter(w, pool, shatters, t, gbMain.plan);
                if (t === SHATTER_TICK || t === SHATTER_TICK + SHATTER.life + 20) {
                    k = t === SHATTER_TICK ? nearestBody(r.xf, ids) : k; const id = ids[k], e = fd.entryFor(gbMain.bodies[k].glyphIndex);
                    plan = shardPlan(gbMain.bodies[k], e, TICKER.size, TICKER.depth);
                    const o = id * 7, c = [r.xf[o], r.xf[o + 1], r.xf[o + 2]], q = [r.xf[o + 3], r.xf[o + 4], r.xf[o + 5], r.xf[o + 6]];
                    // the FIRST shatter's centre and cells are what the holds below read; a first draft let the second overwrite them and
                    // held tick 301's shards against tick 410's cells (worst 0.58 units, which was the conveyor's travel, not a jump)
                    if (t === SHATTER_TICK) { centre = c; cellsAt301 = plan.map((s) => placeOffset(c, q, s.offset)); }
                    shatters.push(shatterBody(w, pool, k, id, plan, r.xf, w.readVelocities(), t, { spawn: gbMain.bodies[k].spawn }));
                    made.push(pool.made);
                }
                if (t === SHATTER_TICK + 1) at301 = { xf: Array.from(r.xf) };
                if (t > SHATTER_TICK && t <= SHATTER_TICK + SHATTER.life && shatters.length) { const xf = r.xf; let d = 0, y = -Infinity; for (const sh of shatters[0].shards) { const o = sh.idx * 7; d += Math.hypot(xf[o] - centre[0], xf[o + 1] - centre[1], xf[o + 2] - centre[2]); y = Math.max(y, xf[o + 1]); } spread.push(d / shatters[0].shards.length); top.push(y); }
                if (t === SNAP_TICK && run === 0) snapshot = { xf: Array.from(r.xf), ids: ids.slice(), shards: shatters[0].shards.map((sh) => ({ idx: sh.idx, cell: sh.cell })), k };
                if (t === SHATTER_TICK + SHATTER.life + 1) back = { xf: Array.from(r.xf), vel: Array.from(w.readVelocities()), live: pool.live.size, free: pool.free.length };
            }
            runs.push({ ids, k, centre, at301, cellsAt301, spread, top, back, made, hash: w.stateHash(), bodies: w.bodyCount(), wrapped }); w.destroy();
        }
        const [a, b] = runs; shatterK = a.k;
        ok(`two runs hash the same with a shatter in each: deterministic (${a.bodies} bodies: the floor, ${gbMain.bodies.length} glyphs, ${a.bodies - 1 - gbMain.bodies.length} shards)`, a.hash === b.hash && a.k === b.k && a.bodies === 1 + gbMain.bodies.length + plan.length, `hash ${a.hash}, body ${a.k} ('${String.fromCodePoint(gbMain.bodies[a.k].codepoint)}')`);
        const sh0 = snapshot.shards;
        let worstSpawn = 0; sh0.forEach((sh, i) => { const o = sh.idx * 7; worstSpawn = Math.max(worstSpawn, Math.hypot(a.at301.xf[o] - a.cellsAt301[i][0], a.at301.xf[o + 1] - a.cellsAt301[i][1], a.at301.xf[o + 2] - a.cellsAt301[i][2])); });
        // one tick after the burst a shard has moved by its velocity times dt (up to ~0.05 units); the spawn is the cell's place
        ok("one tick after the shatter every shard is within 0.06 units of where its cell was (the body's centre plus its rotated offset)", worstSpawn < 0.06, `worst ${worstSpawn.toFixed(4)}`);
        const gid = a.ids[a.k] * 7;
        ok("the shattered glyph is parked: static, far below the floor", a.at301.xf[gid + 1] < SHATTER.park + 1 && a.at301.xf[gid + 1] > SHATTER.park - 40);
        ok(`the shards spread: the mean distance from the burst's centre grows from ${a.spread[0].toFixed(3)} to ${a.spread[a.spread.length - 1].toFixed(3)} over the life, and one rises above the glyph's centre by more than 0.1 (${Math.max(...a.top).toFixed(3)} against ${a.centre[1].toFixed(3)})`, a.spread[a.spread.length - 1] > a.spread[0] * 3 && a.spread[a.spread.length - 1] > 0.3 && Math.max(...a.top) > a.centre[1] + 0.1);
        ok(`at life the shards are parked (static, at y ${SHATTER.park}) and the pool holds them free`, sh0.every((sh) => Math.abs(a.back.xf[sh.idx * 7 + 1] - SHATTER.park) < 1e-3) && a.back.live === 0 && a.back.free === plan.length);
        const sp = gbMain.bodies[a.k].spawn;
        ok("and the glyph is back at its spawn (its layout place at the near end, the drop height), dynamic and moving at the conveyor's speed", Math.abs(a.back.xf[gid] - sp[0]) < 0.05 && a.back.xf[gid + 1] > 0 && a.back.xf[gid + 1] < sp[1] + 0.01 && Math.abs(a.back.vel[a.ids[a.k] * 3] - gbMain.plan.speed) < 0.3, `x ${a.back.xf[gid].toFixed(2)} (spawn ${sp[0].toFixed(2)}) y ${a.back.xf[gid + 1].toFixed(2)} vx ${a.back.vel[a.ids[a.k] * 3].toFixed(2)}`);
        ok("the second shatter took its shards from the pool: no body was made", a.made[0] === plan.length && a.made[1] === plan.length, a.made.join(","));
        ok("a snapshot at tick 312 was taken for the frame", !!snapshot && snapshot.xf.length === a.bodies * 7 && snapshot.shards.length === plan.length);
    }
}

const bitsToF32 = (px, i, j) => { const o = (j * W + i) * 4; return new Float32Array(new Uint8Array([px[o], px[o + 1], px[o + 2], px[o + 3]]).buffer)[0]; };
let modelQuads = null;
function buildModelQuads() {
    const PV = cameraFor(W, H), out = [];
    gbMain.bodies.forEach((b, k) => { if (k === snapshot.k) return; const rows = bodyRows(PV, snapshot.xf, snapshot.ids[k]); for (const q of quadsOf(b.built)) out.push({ q, rows, e: fd.entryFor(b.glyphIndex), shard: false }); });
    const e = fd.entryFor(gbMain.bodies[snapshot.k].glyphIndex);
    snapshot.shards.forEach((sh) => { const rows = bodyRows(PV, snapshot.xf, sh.idx); for (const q of quadsOf(shardStream(e, sh.cell, TICKER.size))) out.push({ q, rows, e, shard: true }); });
    return out;
}
function modelTris(Q) { const tris = []; for (const m of modelQuads) { const qt = quadTriangles(m.q, m.rows, W, H, Q); const clipped = qt.corners.some((c) => c.sx < 0 || c.sx > W || c.sy < 0 || c.sy > H); for (const t of qt.tris) tris.push({ ...t, m, tieBand: clipped && isFinite(Q) ? 1 / Q : TIE_PX }); } return tris; }
function fit(cap) {
    const results = [];
    for (const Q of SUBPIXEL_CANDIDATES) { const tris = modelTris(Q).reverse(); let worst = 0, n = 0, orphan = 0, ties = 0;
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const mtx = bitsToF32(cap.tx, i, j); if (mtx === 0) continue; const x = i + 0.5, y = j + 0.5, mty = bitsToF32(cap.ty, i, j); let hit = false, err = Infinity, tie = false;
            for (const t of tris) { if (!t.inside(x, y)) continue; const [tx, ty] = t.at(x, y), e = Math.max(Math.abs(tx - mtx), Math.abs(ty - mty)); const onEdge = t.edgeDist(x, y) < t.tieBand;
                if (!hit) { hit = true; err = e; if (!onEdge) break; tie = true; continue; } if (onEdge || tie) { err = Math.min(err, e); if (!onEdge) break; } else break; }
            if (!hit) orphan++; else { n++; if (tie) ties++; worst = Math.max(worst, err); } }
        results.push({ Q, worst, n, orphan, ties }); }
    results.sort((a, b) => a.worst - b.worst); return { best: results[0], all: results };
}
/** white over black in draw order, stored as bytes after every layer (the target's arithmetic, the napalm gate's finding) */
function expectedFrame(Q) {
    const tris = modelTris(Q), out = new Uint8Array(W * H), tie = new Uint8Array(W * H), shardInk = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const x = i + 0.5, y = j + 0.5; let acc = 0;
        for (const t of tris) { if (!t.inside(x, y)) continue; if (t.edgeDist(x, y) < t.tieBand) tie[j * W + i] = 1; const [tx, ty] = t.at(x, y); const x0 = (i & ~1) + 0.5, y0 = (j & ~1) + 0.5, a = t.at(x0, y0), b = t.at(x0 + 1, y0), c = t.at(x0, y0 + 1);
            const cov = slugRender(fd.atlas, t.m.e, tx, ty, [Math.abs(b[0] - a[0]) + Math.abs(c[0] - a[0]), Math.abs(b[1] - a[1]) + Math.abs(c[1] - a[1])]);
            if (cov <= 0) continue; if (t.m.shard && cov > 0.1) shardInk[j * W + i] = 1; acc = Math.round((cov + (acc / 255) * (1 - cov)) * 255); }
        out[j * W + i] = acc; }
    return { out, tie, shardInk };
}

sec("3. THE FRAME, ON BOTH BACKENDS: the tick-312 snapshot, nine shards mid-burst among the other bodies, against the model");
{
    const skip = webgpuSkipReason();
    if (skip || !snapshot) { console.log(`  SKIP  ${skip || "no snapshot"}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const PV = cameraFor(W, H);
        const rowsPerBody = gbMain.bodies.map((b, k) => k === snapshot.k ? null : Array.from(bodyRows(PV, snapshot.xf, snapshot.ids[k])));
        const shards = snapshot.shards.map((sh) => ({ cell: sh.cell, rows: Array.from(bodyRows(PV, snapshot.xf, sh.idx)) }));
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, CHARS, rowsPerBody, shards, k: snapshot.k }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const { parseFont } = await import("/text/slugFont.js");
            const M = await import("/render/slugDevice.mjs");
            const { glyphBodies } = await import("/render/slugTicker.mjs");
            const { shardStream } = await import("/render/slugShatter.mjs");
            const font = parseFont(await (await fetch("/vendor/fonts/IBMPlexSerif-Regular.ttf")).arrayBuffer());
            const { W, H, CHARS, rowsPerBody, shards, k } = a; const out = {};
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const o = { backend: dev.backend, cap: {}, errs: [] };
                const fd = new M.SlugFontDevice(dev, font, CHARS); o.logWidth = fd.logWidth;
                const gb = glyphBodies(font, (gi) => fd.entryFor(gi));
                if (gb.bodies.length !== rowsPerBody.length) { o.errs.push("body count " + gb.bodies.length + " against " + rowsPerBody.length); out[backend] = o; continue; }
                const e = fd.entryFor(gb.bodies[k].glyphIndex);
                const draws = gb.bodies.map((bd, i) => rowsPerBody[i] ? { b: (() => { const b = new M.SlugDeviceBatch(fd); b.setBuilt(bd.built); return b; })(), rows: new Float32Array(rowsPerBody[i]) } : null).filter(Boolean)
                    .concat(shards.map((sh) => { const b = new M.SlugDeviceBatch(fd); b.setBuilt(shardStream(e, sh.cell, 0.22)); return { b, rows: new Float32Array(sh.rows) }; }));
                o.draws = draws.length;
                const fr = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); for (const q of draws) q.b.draw(pass, q.rows, [W, H]); }, { read: true }); o.pixels = Array.from(fr.pixels);
                for (const what of ["tx", "ty"]) {
                    let d; try { d = M.slugCaptureDesc(fd.logWidth, what); } catch (e) { o.errs.push(what + ": " + e.message); continue; }
                    const pipe = dev.pipeline(d); if (pipe.compiled) { const err = await pipe.compiled; if (err) { o.errs.push(what + ": " + err); continue; } }
                    const cf = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 0]); pass.use(pipe); for (const q of draws) { for (let i = 0; i < 4; i++) pass.uniform("m" + i, q.rows.subarray(i * 4, i * 4 + 4)); pass.uniform("viewport", [W, H]);
                        pass.texture("curveTexture", fd.curveTexture, 0); pass.texture("bandTexture", fd.bandTexture, 1); pass.vertices(q.b.vb); pass.indices(q.b.ib); pass.drawIndexed(q.b.indexCount); } }, { read: true });
                    o.cap[what] = Array.from(cf.pixels);
                }
                for (const q of draws) q.b.destroy(); fd.destroy(); dev.destroy(); out[backend] = o;
            }
            return out;
        }` });
        ok(`*** both backends drew ${gbMain.bodies.length - 1} bodies and ${shards.length} shards and captured the texcoords ***`, r.ok && r.result && r.result.webgpu && r.result.webgl2 && r.result.webgpu.errs.length === 0 && r.result.webgl2.errs.length === 0 && r.result.webgpu.draws === gbMain.bodies.length - 1 + shards.length, r.ok ? (r.result.webgpu.errs.concat(r.result.webgl2.errs).join(" | ") || "") : (r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 400));
        if (r.ok && r.result.webgpu.errs.length === 0 && r.result.webgl2.errs.length === 0) {
            fd = new SlugFontDevice(nb, font, CHARS, { logWidth: r.result.webgl2.logWidth }); modelQuads = buildModelQuads();
            // the shards' spread on screen against the glyph's box: the shard quads' screen centres span wider than the glyph's quad would at the burst centre
            for (const bk of ["webgpu", "webgl2"]) {
                const o = r.result[bk], f = fit(o.cap);
                report(`${bk}: fit -- ` + f.all.slice(0, 3).map((x) => `1/${x.Q}: ${x.worst.toExponential(2)}`).join("  ") + `; ${f.best.orphan} lit fragments outside every model quad, ${f.best.ties} tied`);
                ok(`*** ${bk}: the perspective-correct model per quad (bodies and shards) reproduces the fragment's texcoord to 1e-5 em over ${f.best.n} fragments, none lit outside it ***`, f.best.worst < 1e-5 && f.best.n > 800 && f.best.orphan === 0, `worst ${f.best.worst.toExponential(2)} em at 1/${f.best.Q}`);
                const key = expectedFrame(f.best.Q); let worst = 0, over = 0, exact = 0, lit = 0, shardLit = 0, ties = 0, tiesOff = 0, at = -1;
                for (let i = 0; i < W * H; i++) { const got = o.pixels[i * 4], d = Math.abs(got - key.out[i]); if (key.out[i] > 5) lit++; if (key.shardInk[i]) shardLit++; if (d === 0) exact++;
                    if (key.tie[i]) { ties++; if (d > TOL) tiesOff++; continue; } if (d > worst) { worst = d; at = i; } if (d > TOL) over++; }
                report(`${bk}: ${exact} of ${W * H} exact, ${over} over ${TOL}, worst ${worst} at (${at % W}, ${Math.floor(at / W)}); ${ties} on a quad edge (${tiesOff} off); ${lit} lit by the key, ${shardLit} of them shard ink`);
                ok(`*** ${bk}: every pixel within ${TOL} of 255 of slugEval through the model, white over black stored per layer, edge ties aside ***`, over === 0 && ties < W * H * 0.005 && lit > 700 && shardLit >= 20);
                // the shards are apart: their ink's screen extent against the glyph's own quad placed at the burst centre (the unshattered body would be one quad there)
                let sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity, sy1 = -Infinity; for (let i = 0; i < W * H; i++) if (key.shardInk[i]) { sx0 = Math.min(sx0, i % W); sx1 = Math.max(sx1, i % W); sy0 = Math.min(sy0, Math.floor(i / W)); sy1 = Math.max(sy1, Math.floor(i / W)); }
                const gq = quadTriangles(quadsOf(gbMain.bodies[snapshot.k].built)[0], bodyRows(PV, snapshot.xf, snapshot.ids[snapshot.k]), W, H, 16);
                // measured 16 x 17 px at v4503 against a whole glyph quad of about 7 px at this distance (0.48 em x 0.22 units over 4.7 units across 320 px)
                ok(`  ${bk}: the shards' ink spans ${sx1 - sx0} x ${sy1 - sy0} px on screen -- more than 10 px each way, wider than the whole glyph quad at this distance (about ${Math.round(0.48 * 0.22 * 320 / 4.7)} px) -- and the parked glyph draws nothing (its quad projects at y ${gq.corners[0].sy.toFixed(0)}, off the frame)`, sx1 - sx0 > 10 && sy1 - sy0 > 10 && (gq.corners[0].sy > H || gq.corners[0].sy < 0));
            }
            const G = r.result.webgpu.pixels, L = r.result.webgl2.pixels; let po = 0; for (let i = 0; i < W * H; i++) if (Math.abs(G[i * 4] - L[i * 4]) > TOL) po++;
            ok(`  the two backends agree within ${TOL} of 255 on all but edge ties (fewer than 0.5%)`, po < W * H * 0.005, `${po} pixels apart`);
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: a pooled shard body keeps its first shape, so a reused shard's box may be a little off its cell (the picture is the quad's, not the box's); shards colliding with other glyphs (they do, in the solver, unheld); the burst's look on a rig.");
process.exit(fails ? 1 : 0);
