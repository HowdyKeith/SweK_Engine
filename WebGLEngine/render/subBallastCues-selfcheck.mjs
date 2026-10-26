// WebGLEngine/render/subBallastCues-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). (~5 s with a browser; the arithmetic alone ~0.2 s)
//
// Run: node render/subBallastCues-selfcheck.mjs
//
// THE BALLAST YOU CAN SEE. render/subBallastCues.mjs draws a sub's tank (a gauge on the hull, bubbles while it is blown, a weight that falls when it is dropped) and writes the list line; this gate holds it:
//   1  THE GAUGE     fill is (level + 1) / 2 clamped, air is the bottle's fraction, low under a quarter; no tank is no gauge; a NaN level reads as half
//   2  THE BUBBLES   they rise at 6 m/s, go at the surface and at 8 s, are born at about 40 a second per blowing hull and not at all with none, are capped at 400, and the same frames always make the same bubbles
//   3  THE WEIGHT    it accelerates to 9 m/s and no faster, stops at the floor and lies there, is gone after 30 s, and a frame of no time or NaN time moves nothing
//   4  THE LINE      the list line names the event, the water in the tank, the air, the weight and a blow in progress; a plain sub gets an empty line
//   5  THE HULL      (real three.js, no GL) attachCues adds a gauge and a slab, hidden; poseCues fills the gauge to the tank, turns it amber when the bottle is low, shows the slab only while the weight is on, and hides
//                    everything for a row with no tank; the gauge stands above the hull and aft of the tower; a SURFACED sub (depth 0.564 m) has its conning tower and scope above the water line and a sub at 14 m has them below
//   6  THE DRAW      (a browser with WebGL; SKIPPED, and said, without one) the live view sheds bubbles while a row is blowing and none after, makes ONE falling weight on the tick a row's weight is released, that weight falls and lies on the
//                    floor, and a sub with a tank draws more pixels than the same sub without
//   7  THE PAGE      sub-aquarium.html has the four event buttons wired to tank.setEvent on the selected sub, and a tank line in every row filled by readout
//
// SABOTAGE LOG -- TWENTY-SEVEN, each applied in place, the gate run, the file restored; every one red by name (rows red in brackets):
//   render/subBallastCues.mjs: C1 fill is level/2 6 | C2 low under a half 1 | C3 bubbles rise at 3 m/s 2 | C4 no removal at the surface 1 | C5 bubble life 80 s 1 | C6 no cap 1 | C7 no bubbles ever born 3 | C8 no terminal speed 1
//   C9 the weight does not stop at the floor 4 | C10 it lies 3 s 2 | C11 weight line inverted 3 | C12 slab always shown 1 | C13 no amber 1 | C14 gauge low on the hull 1 | C15 no sliver for an empty tank 1 | C16 a frame clip of 5 s 1 | C17 gauge forward of the tower 1
//   render/subAquarium3d.mjs: D1 the hull never posed 1 | D2 bubbles from every tank, not just blowing ones 1 | D3 no weight ever spawned 1 | D4 a weight every frame 1 | D5 the weights not stepped 1 | D6 no cues attached 1 | D7 the points' draw range never set 1
//   sub-aquarium.html: P1 the flood button not wired 1 | P2 the tank line never filled 1 | P3 no selected-sub guard 1
// D7 and C16 were not caught the first time: the draw range was never read (view.cues() counted the list and not what is drawn; it now reports `drawn`), and C16 crashed the clip row with no FAIL line (the row now reads a missing bubble as NaN).
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as C from "./subBallastCues.mjs";
import * as V3 from "./subAquarium3d.mjs";
import * as THREE from "../vendor/three/three.module.js";
import { createTank } from "./subAquariumSim.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL, webglLaunchArgs } from "../tools/ship/playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
const T = (o = {}) => ({ level: 0, air: 1.5, airMax: 1.5, released: false, blowing: false, ...o });

console.log("subBallastCues-selfcheck -- the ballast you can see\n");

console.log("1. THE GAUGE");
{
    ok("!! no tank is no gauge; level -1 is an empty tank (fill 0), 0 is half, +1 is full; levels outside are clamped", C.gauge(null) === null && C.gauge(T({ level: -1 })).fill === 0 && C.gauge(T({ level: 0 })).fill === 0.5 && C.gauge(T({ level: 1 })).fill === 1 && C.gauge(T({ level: -5 })).fill === 0 && C.gauge(T({ level: 5 })).fill === 1);
    ok("!! the air is the bottle's fraction (0.75 of 1.5 is 0.5) and LOW only strictly under a quarter: 0.375 of 1.5 is exactly a quarter and not low, 0.37 is low", C.gauge(T({ air: 0.75 })).air === 0.5 && !C.gauge(T({ air: 0.5 })).low && C.gauge(T({ air: 0.3 })).low && !C.gauge(T({ air: 0.375 })).low && C.gauge(T({ air: 0.37 })).low);
    ok("a NaN level reads as half, a bottle with no limit as full air and never low, an infinite air likewise", C.gauge(T({ level: NaN })).fill === 0.5 && C.gauge(T({ airMax: null, air: 0 })).air === 1 && !C.gauge(T({ airMax: null, air: 0 })).low && C.gauge(T({ air: Infinity })).air === 1);
}

console.log("\n2. THE BUBBLES");
{
    let st = { list: [], counter: 0 };
    for (let i = 0; i < 60; i++) st = C.bubbleStep(st.list, 1 / 30, [[10, -20, 5]], st.counter);
    ok("!! two seconds of one blowing hull make bubbles at about 40 a second less the ones that have gone (between 40 and 90 alive), all inside 8 m of the hull's x and 4 m of its z", st.list.length > 40 && st.list.length < 90 && st.list.every((b) => Math.abs(b.x - 10) < 4.5 && Math.abs(b.z - 5) < 2.5), `${st.list.length} alive`);
    const a = { list: [{ x: 0, y: -10, z: 0, age: 0 }], counter: 0 }, b = C.bubbleStep(a.list, 0.25, [], 0);
    ok("!! a bubble rises at 6 m/s (0.25 s: 1.5 m), ages by the step, and the input list is not edited", Math.abs(b.list[0].y - (-8.5)) < 1e-9 && b.list[0].age === 0.25 && a.list[0].y === -10 && a.list[0].age === 0);
    ok("!! a bubble that reaches the surface is gone, and one older than 8 s is gone", C.bubbleStep([{ x: 0, y: -0.2, z: 0, age: 0 }], 0.1, [], 0).list.length === 0 && C.bubbleStep([{ x: 0, y: -40, z: 0, age: 7.95 }], 0.1, [], 0).list.length === 0 && C.bubbleStep([{ x: 0, y: -40, z: 0, age: 7.5 }], 0.1, [], 0).list.length === 1);
    ok("!! with no hull blowing none are born, and the pool empties on its own", (() => { let q = { list: st.list, counter: st.counter }; for (let i = 0; i < 300; i++) q = C.bubbleStep(q.list, 1 / 30, [], q.counter); return q.list.length === 0; })() && C.bubbleStep([], 1, null, 0).list.length === 0);
    let big = { list: [], counter: 0 }; for (let i = 0; i < 40; i++) big = C.bubbleStep(big.list, 0.25, Array.from({ length: 20 }, () => [0, -45, 0]), big.counter);
    ok("!! the pool is capped at 400 however many hulls blow", big.list.length <= C.BUBBLE_MAX && big.list.length === C.BUBBLE_MAX, `${big.list.length}`);
    const run = () => { let q = { list: [], counter: 0 }; for (let i = 0; i < 90; i++) q = C.bubbleStep(q.list, 1 / 30, [[1, -30, 2]], q.counter); return JSON.stringify(q); };
    ok("!! the same frames always make the same bubbles", run() === run());
    ok("a negative or NaN frame time moves nothing and a long one is clipped to a quarter second", JSON.stringify(C.bubbleStep(a.list, -1, [], 0).list) === JSON.stringify(a.list) && JSON.stringify(C.bubbleStep(a.list, NaN, [], 0).list) === JSON.stringify(a.list) && Math.abs(((C.bubbleStep(a.list, 99, [], 0).list[0]) || { y: NaN }).y - (-10 + 1.5)) < 1e-9);
}

console.log("\n3. THE WEIGHT");
{
    let w = { x: 0, y: -10, z: 0, v: 0, rest: -1 }, vmax = 0, steps = 0;
    while (w.rest < 0 && steps < 5000) { w = C.dropStep(w, 1 / 30, -49.6); vmax = Math.max(vmax, w.v); steps++; }
    ok("!! it accelerates to 9 m/s and no faster, and stops AT the floor (-49.6) and rests there", Math.abs(vmax - C.WEIGHT_TERMINAL) < 1e-9 && w.y === -49.6 && w.rest === 0 && w.v === 0, `reached the floor in ${(steps / 30).toFixed(1)} s`);
    ok("!! a weight released from rest has moved less than 0.2 m after the first tick (it falls, it does not jump)", C.dropStep({ x: 0, y: -10, z: 0, v: 0, rest: -1 }, 1 / 30, -49.6).y > -10.2);
    let r = w; for (let i = 0; i < 30 * 29; i++) r = C.dropStep(r, 1 / 30, -49.6);
    let r2 = r; for (let i = 0; i < 4; i++) r2 = C.dropStep(r2, 0.25, -49.6);
    ok("!! it lies on the floor for 30 s and is gone then, not before (not gone at 29 s, gone at 30)", !r.gone && r2.gone === true && r.y === -49.6 && !C.dropStep(r, 0.25, -49.6).gone, `rest ${r.rest.toFixed(2)} s then ${r2.rest.toFixed(2)} s`);
    ok("a frame of no time, a negative time or NaN time moves nothing", C.dropStep(w, 0, -49.6).rest === 0 && C.dropStep({ ...w, rest: -1, v: 3, y: -20 }, NaN, -49.6).y === -20 && C.dropStep({ ...w, rest: -1, v: 3, y: -20 }, -1, -49.6).y === -20);
}

console.log("\n4. THE LINE");
{
    ok("!! a plain sub (no event, no tank) gets an empty line; null does too", C.readout({ event: null, tank: null }) === "" && C.readout(null) === "");
    const f = C.readout({ event: "flood", tank: T({ level: -0.2, air: 0.45, released: true, blowing: true }) });
    ok("!! a flooded sub's line names the event, the water (40%), the air (0.45/1.5), the dropped weight and the blow", f === "FLOOD · tank 40% water · air 0.45/1.5 · weight DROPPED · BLOWING", f);
    ok("the other events and a bottle with no limit", C.readout({ event: "sink", tank: T() }).startsWith("SINKING · tank 50% water") && C.readout({ event: "surface", tank: T({ air: 1, level: -1 }) }).startsWith("SURFACING · tank 0% water · air 1.00/1.5 · weight on") && C.readout({ event: "surface", tank: T({ airMax: null }) }).includes("air unlimited"));
}

console.log("\n5. THE HULL (real three.js, no GL)");
{
    const mat = new THREE.MeshBasicMaterial(), geo = {}, g = V3.buildSub(THREE, mat, geo), cues = C.attachCues(THREE, g, geo, V3.HULL_LENGTH);
    ok("!! attachCues adds a gauge frame, a gauge fill and a weight slab to the sub, all hidden until a tank is posed", g.userData.cues === cues && !cues.frame.visible && !cues.fill.visible && !cues.slab.visible && g.children.includes(cues.slab));
    C.poseCues(g, { tank: T({ level: -0.5, air: 1.5 }) });
    ok("!! a tank at level -0.5 fills the gauge to a quarter, blue, and shows frame, fill and the slab (weight on)", Math.abs(cues.fill.scale.y - 0.25) < 1e-12 && cues.fillMat.color.getHex() === 0x59d1ff && cues.frame.visible && cues.fill.visible && cues.slab.visible);
    C.poseCues(g, { tank: T({ level: 0.5, air: 0.2, released: true }) });
    ok("!! a low bottle turns the gauge amber, a full tank fills it to three quarters, and a released weight hides the slab", cues.fillMat.color.getHex() === 0xf6a623 && Math.abs(cues.fill.scale.y - 0.75) < 1e-12 && !cues.slab.visible && cues.frame.visible);
    C.poseCues(g, { tank: T({ level: -1 }) });
    ok("an empty tank still draws a sliver (2%) so the gauge is not mistaken for missing", cues.fill.scale.y === 0.02);
    C.poseCues(g, { tank: null });
    ok("!! a row with no tank hides everything again", !cues.frame.visible && !cues.fill.visible && !cues.slab.visible);
    const P = g.userData.parts; g.updateMatrixWorld(true);
    const box = (m) => new THREE.Box3().setFromObject(m), hull = box(P.hull), tower = box(P.tower), frame = box(cues.frame);
    ok("!! the gauge stands above the hull's top and AFT of the tower (behind its rear face), on the centreline", frame.min.y > hull.max.y * 0.9 && frame.max.x < tower.min.x && Math.abs((frame.min.z + frame.max.z) / 2) < 1e-9, `gauge x ${frame.min.x.toFixed(2)}..${frame.max.x.toFixed(2)}, tower from ${tower.min.x.toFixed(2)}`);
    const above = (depth) => { const m = V3.buildSub(THREE, mat, geo), p = V3.subPose({ x: 0, y: 0, depth, heading: 0, pitch: 0 }); m.position.set(p.x, p.y, p.z); m.updateMatrixWorld(true); return { tower: box(m.userData.parts.tower).max.y, scope: box(m.userData.parts.scope).max.y, hull: box(m.userData.parts.hull).max.y }; };
    const surfaced = above(0.564), deep = above(14);
    ok("!! a SURFACED sub (centre 0.564 m down) has its conning tower and its periscope standing out of the water (above y = 0), and a sub at 14 m has everything below it", surfaced.tower > 0 && surfaced.scope > surfaced.tower && surfaced.hull > 0 && deep.scope < 0 && deep.tower < 0, `scope top ${surfaced.scope.toFixed(2)} m above the sea surfaced, ${deep.scope.toFixed(2)} at 14 m`);
    mat.dispose(); for (const k of Object.keys(geo)) geo[k].dispose();
}

console.log("\n6. THE DRAW");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) { report("live half SKIPPED -- " + skip); report("*** THAT IS A SKIP AND NOT A PASS: sections 1-5 are arithmetic and geometry; only a draw shows the bubbles and the falling weight in the view"); }
    else {
        const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript" };
        const server = http.createServer((req, res) => {
            const u = decodeURIComponent(req.url.split("?")[0]);
            if (u === "/__bc.html") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<!doctype html><meta charset=utf-8><body style='margin:0'><canvas id=c width=320 height=200></canvas></body>"); }
            const fp = path.join(ENG, u);
            if (fp.startsWith(ENG) && fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { "Content-Type": types[path.extname(fp)] || "text/plain" }); return res.end(fs.readFileSync(fp)); }
            res.writeHead(404); res.end("not found");
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const br = await chromium.launch({ executablePath: HEADLESS_SHELL, args: webglLaunchArgs().args });
        try {
            const pg = await (await br.newContext()).newPage(); const errs = [];
            pg.on("pageerror", (e) => errs.push(String(e.message))); pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
            await pg.goto("http://127.0.0.1:" + server.address().port + "/__bc.html", { waitUntil: "load" });
            const r = await pg.evaluate(async () => {
                const THREE = await import("/vendor/three/three.module.js"), V = await import("/render/subAquarium3d.mjs"), cv = document.getElementById("c");
                const view = V.createView3d(THREE, cv, { length: 500, width: 300, depthMax: 50 }); view.resize(320, 200);
                const gl = view.renderer.getContext(), W = 320, H = 200;
                const grab = () => { const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
                const row = (o = {}) => ({ id: "a", hue: 30, x: 250, y: 150, depth: 25, heading: 0, pitch: 0, cmd: { pitch: 0, yaw: 0, thrust: 0, ballast: 0 }, event: null, tank: null, ...o });
                const tank = (o = {}) => ({ level: 0, air: 1.5, airMax: 1.5, released: false, blowing: false, ...o });
                view.sea.mesh.visible = false; view.setView(0.3, 1.0, 40);
                let t = 0; const frame = (rows, n = 1) => { for (let i = 0; i < n; i++) { t += 1 / 30; view.render(rows, t); } };
                frame([row()], 3); const plain = grab();
                frame([row({ event: "flood", tank: tank({ level: -0.5 }) })], 2); const withTank = grab();
                let px = 0; for (let i = 0; i < plain.length; i += 4) if (Math.abs(plain[i] - withTank[i]) + Math.abs(plain[i + 1] - withTank[i + 1]) + Math.abs(plain[i + 2] - withTank[i + 2]) > 30) px++;
                frame([row({ event: "flood", tank: tank({ level: -0.5 }) })], 3); const quiet = view.cues();
                frame([row({ event: "flood", tank: tank({ level: -0.5, blowing: true }) })], 60); const blowing = view.cues();
                frame([row({ event: "flood", tank: tank({ level: -1, blowing: false }) })], 300); const after = view.cues();
                frame([row({ event: "flood", tank: tank({ level: -0.5 }) })], 1); const w0 = view.cues();
                frame([row({ event: "flood", tank: tank({ level: -0.5, released: true }) })], 1); const w1 = view.cues();
                frame([row({ event: "flood", tank: tank({ level: -0.5, released: true }) })], 90); const w2 = view.cues();
                frame([row({ event: "flood", tank: tank({ level: -0.5, released: true }) })], 400); const w3 = view.cues();
                return { px, quiet, blowing, after, w0, w1, w2, w3 };
            });
            ok("!! a sub with a tank draws more pixels than the same sub without: " + r.px + " pixels differ (the gauge, the slab)", r.px > 15);
            ok("!! and every bubble is DRAWN (the points' draw range follows the list: " + r.blowing.drawn + " of " + r.blowing.bubbles + " while blowing, " + r.after.drawn + " after)", r.blowing.drawn === r.blowing.bubbles && r.after.drawn === 0 && r.blowing.drawn > 0);
            ok("!! no bubbles while nothing is blown (" + r.quiet.bubbles + "), plenty while a row is blowing (" + r.blowing.bubbles + "), none again 10 s after it stops (" + r.after.bubbles + ")", r.quiet.bubbles === 0 && r.blowing.bubbles > 20 && r.after.bubbles === 0);
            ok("!! no falling weight before the release (" + r.w0.weights + "), ONE on the tick the row's weight is released (" + r.w1.weights + "), still one 3 s on and lying on the floor by 15 s (" + r.w3.resting + " resting of " + r.w3.weights + ")", r.w0.weights === 0 && r.w1.weights === 1 && r.w1.resting === 0 && r.w2.weights === 1 && r.w3.weights === 1 && r.w3.resting === 1);
            ok("  no page or console error", errs.length === 0, errs.join(" | ").slice(0, 200));
        } finally { await br.close(); server.close(); }
    }
}

console.log("\n7. THE PAGE");
{
    const aq = fs.readFileSync(path.join(ENG, "sub-aquarium.html"), "utf8");
    ok("!! the page has four event buttons (flood, sink, surface, restore) wired to tank.setEvent on the SELECTED sub, and says so when none is picked", ["floodBtn", "sinkBtn", "surfaceBtn", "clearBtn"].every((id) => new RegExp(`id="${id}"`).test(aq)) && /tank\.setEvent\(selected, ev\)/.test(aq) && /if \(!selected\)/.test(aq) && /setEvent\("flood"\)/.test(aq) && /setEvent\("sink"\)/.test(aq) && /setEvent\("surface"\)/.test(aq) && /setEvent\(null\)/.test(aq));
    ok("!! every list row carries a tank line, filled from the snapshot by readout()", /id = "t_" \+ s\.id/.test(aq) && /textContent = readout\(s\)/.test(aq) && /import \{ readout \} from "\/render\/subBallastCues\.mjs"/.test(aq));
    const t = createTank(); t.sync([{ id: "x", name: "x", hue: 10, pilot: "pd", from: "x", local: true }]); for (let i = 0; i < 1200; i++) t.step(1 / 30); t.setEvent("x", "surface"); for (let i = 0; i < 30; i++) t.step(1 / 30);
    ok("!! the real tank's row for a surfacing sub gives the line a tank: " + C.readout(t.snapshot()[0]), /^SURFACING · tank \d+% water · air [\d.]+\/1\.5 · weight on/.test(C.readout(t.snapshot()[0])));
}

console.log(`\nsubBallastCues-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
