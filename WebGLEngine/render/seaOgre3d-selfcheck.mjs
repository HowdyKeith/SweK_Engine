// WebGLEngine/render/seaOgre3d-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/seaOgre3d-selfcheck.mjs      (~12 s with the browser half; the arithmetic half alone is instant)
//
// THE SEA OGRE IN THREE DIMENSIONS (render/seaOgre3d.mjs, over render/subAquarium3d.mjs):
//   1  THE TANK      big enough for the fight: never under 1500 x 1000 m, the replay's bounds plus 200 m rounded UP to 100 m, the replay's corner is the tank's origin so every replay point is inside it
//   2  THE FRAME     toTank, scenePos and forwardOf hand-worked (heading 0 is +X, pi/2 is -Z, pitch up is +Y, unit length); snapshotOf takes only living boats, in tank coordinates, with their own hues
//   3  THE EYE       the first-person pose of a defender: 0.45 hulls ahead of the centre (hulls at the drawn size), a little up, looking along the nose 400 m; a sunk or unknown boat has none; the heading and the pitch turn it
//   4  THE OGRE      the zones lie along its heading at their offsets; the camera menu has the overview, an orbit and a bow for every defender and the OGRE; the overlay text says what it sees and why not
//   5  THE DRAW      in a real browser: a traced fight drawn through createSeaOgre3d -- the frame lights most of the canvas; the bow camera puts the camera ON the eye pose and hides that boat's own hull, every
//                    other camera shows it; a sunk boat's bow camera falls back to the overview with its reason; the OGRE and the zone colours are in the scene; the module reads no input
//
// SABOTAGES (each mutant breaks the thing a row guards; the row that went red, by name; an entry that went 0 red is a finding, and was fixed):
//   render/seaOgre3d.mjs: T1 minimum tank 1000 x 700 (2) | T2 round to 50 (2) | T3 round down (2) | T4 no 200 m padding (2) | T5 tank corner at the centre (3) | T6 toTank y by x0 (4) | T7 the dead drawn (2) | T8 one hue (1) |
//   T9 depth up (3) | T10 forward z sign (2) | T11 forward y by cos (5) | T12 eye 0.2 hulls (2) | T13 eye 0.5 hulls up (1) | T14 eye ignores the drawn size (0 red THE FIRST TIME: the source text had been searched for
//   wrongly; then 3) | T15 look 40 m (1) | T16 a sunk boat has an eye (2) | T17 zones reversed (1) | T18 no bows in the menu (1) | T19 hit points unrounded (0 red THE FIRST TIME: the boat had exactly 80; 79.6 now, 1) | T20 heading in
//   radians (1) | T21 sunk label lost (2) | T22 own hull not hidden (1) | T23 pov not passed (1) | T24 hidden hull stays hidden (1) | T25 an input listener (1) | T26 zone colour fixed (0 red THE FIRST TIME: the colours were
//   never read back; the scene's zone meshes are read now, 1) | T26b zone half size lost (1) | T27 OGRE never hidden (1) | T28 OGRE at the origin (0 red THE FIRST TIME, then 1) | T29 OGRE heading ignored (0 red THE FIRST TIME, then 1).
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as V from "./seaOgre3d.mjs";
import * as G from "../brain/seaOgre.mjs";
import { HULL_LENGTH } from "./subAquarium3d.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL, webglLaunchArgs } from "../tools/ship/playwrightResolve.mjs";

const require_ = createRequire(import.meta.url), ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t;
const frame = (over = {}) => ({ tick: 0, boats: [{ id: 1, x: 100, y: 50, depth: 30, heading: 0, pitch: 0, hp: 79.6, alive: true, ammo: 5 }, { id: 2, x: -200, y: 0, depth: 20, heading: Math.PI / 2, pitch: 0.2, hp: 0, alive: false, ammo: 0 }, { id: 3, x: 0, y: -300, depth: 25, heading: 3, pitch: 0, hp: 100, alive: true, ammo: 6 }],
    torps: [], escorts: [], probes: [], fix: null, hq: 100, ogre: { x: 400, y: 100, depth: 14, heading: 0, speed: 2.3, hull: 200, surfaced: false, phase: 1, zones: { tubes: 120, sonar: 30, cannon: 0, engine: 150 } }, ...over });
const tank = V.tankFor({ x0: -750, x1: 750, y0: -500, y1: 500 });

console.log("seaOgre3d-selfcheck -- the Sea OGRE in 3D\n");
console.log("1. THE TANK");
{
    ok("!! never under 1500 x 1000 m (a small replay and no replay both get the minimum), 60 m deep", V.tankFor({ x0: 0, x1: 100, y0: 0, y1: 100 }).length === 1500 && V.tankFor(null).width === 1000 && V.tankFor(null).depthMax === 60);
    const big = V.tankFor({ x0: -900, x1: 1300, y0: -300, y1: 1250 });
    ok("!! a big replay: width of the bounds plus 200 rounded UP to 100 (2200 + 200 = 2400; 1550 + 200 = 1750 -> 1800)", big.length === 2400 && big.width === 1800, `${big.length} x ${big.width}`);
    ok("the 100 m rounding goes UP: 2201 m of bounds is 2500 m of tank", V.tankFor({ x0: 0, x1: 2201, y0: 0, y1: 10 }).length === 2500);
    ok("!! every point of the replay is inside the tank (its corner is the origin, centred on the bounds)", [[-900, -300], [1300, 1250], [200, 475], [-900, 1250]].every(([x, y]) => { const [a, b] = V.toTank(big, x, y); return a >= 0 && a <= big.length && b >= 0 && b <= big.width; }));
    ok("the bounds are centred in the tank (the middle of the replay is the middle of the tank)", near(V.toTank(big, 200, 475)[0], big.length / 2) && near(V.toTank(big, 200, 475)[1], big.width / 2));
}

console.log("\n2. THE FRAME");
{
    const f0 = V.forwardOf(0, 0), f90 = V.forwardOf(Math.PI / 2, 0), fu = V.forwardOf(0, Math.PI / 2), f45 = V.forwardOf(Math.PI / 4, Math.PI / 6);
    ok("!! heading 0 points +X; pi/2 (a right turn) points -Z (the tank's +y is Z, the vessel's left); straight up is +Y", near(f0[0], 1) && near(f0[2], 0) && near(f90[0], 0, 1e-12) && near(f90[2], -1) && near(fu[1], 1) && near(fu[0], 0, 1e-12));
    ok("it is a unit vector", near(Math.hypot(...f45), 1, 1e-12) && f45[1] > 0.49 && f45[1] < 0.51);
    ok("scenePos is (x, -depth, y)", JSON.stringify(V.scenePos(5, 7, 30)) === "[5,-30,7]");
    const snap = V.snapshotOf(frame(), tank);
    ok("!! only the LIVING boats, in tank coordinates, ids d1 and d3, with different hues and no command", snap.length === 2 && snap[0].id === "d1" && snap[1].id === "d3" && near(snap[0].x, 100 + 750 + (tank.length - 1500) / 2) === true && snap[0].hue !== snap[1].hue && snap[0].cmd === null);
    ok("the boat's depth, heading and pitch pass through", snap[1].depth === 25 && snap[1].heading === 3 && snap[0].pitch === 0);
    ok("an empty or missing frame is no boats", V.snapshotOf(null, tank).length === 0 && V.snapshotOf({ boats: [] }, tank).length === 0);
}

console.log("\n3. THE EYE");
{
    const tk = { x0: -750, y0: -500, length: 1500, width: 1000, depthMax: 60 }, fr = frame(), k = HULL_LENGTH * 3;
    const p = V.povPose(fr, 1, tk, { subScale: 3 });
    ok("!! boat 1 at replay (100, 50), 30 m down, heading 0: the eye is 0.45 hulls (48 x 0.45 = 21.6 m) ahead of the centre, 0.12 hulls up, at the boat's y", p && near(p.pos[0], 850 + 0.45 * k, 1e-9) && near(p.pos[1], -30 + 0.12 * k, 1e-9) && near(p.pos[2], 550, 1e-9), p ? p.pos.map((v) => v.toFixed(2)).join() : "none");
    ok("!! it looks along the nose, 400 m out (the same height as the eye at pitch 0)", p && near(p.look[0] - p.pos[0], 400) && near(p.look[1], p.pos[1]) && near(p.look[2], p.pos[2]));
    const p3 = V.povPose(fr, 3, tk, { subScale: 3 }), f3 = V.forwardOf(3, 0);
    ok("a heading of 3 rad turns the eye with it (the eye is ahead of the centre by 0.45 hulls along the forward vector)", near(p3.pos[0] - (0 + 750), 0.45 * k * f3[0], 1e-9) && near(p3.pos[2] - (-300 + 500), 0.45 * k * f3[2], 1e-9));
    ok("!! a sunk boat and an unknown boat have no eye", V.povPose(fr, 2, tk) === null && V.povPose(fr, 9, tk) === null && V.povPose(null, 1, tk) === null);
    const up = V.povPose(frame({ boats: [{ id: 1, x: 0, y: 0, depth: 30, heading: 0, pitch: 0.5, hp: 1, alive: true, ammo: 1 }] }), 1, tk, { subScale: 1, ahead: 100 });
    ok("the pitch lifts the look-at (0.5 rad over 100 m is 100 sin 0.5 = 47.9 m up)", near(up.look[1] - up.pos[1], 100 * Math.sin(0.5), 1e-9));
    const big = V.povPose(fr, 1, tk, { subScale: 6 }); ok("the drawn size moves the eye (twice the scale, twice the offset)", near(big.pos[0] - 850, 2 * (p.pos[0] - 850), 1e-9));
}

console.log("\n4. THE OGRE, THE MENU, THE LABEL");
{
    const o = V.ogreScene(frame().ogre, tank), z = o.zones;
    const [ox] = V.toTank(tank, 400, 100);
    ok("!! at heading 0 the tubes are 14 m ahead of the hull centre, the engine 14 m astern, the sonar 7 and the cannon -7, all at the OGRE's depth", near(z.tubes[0] - o.hull[0], 14) && near(z.engine[0] - o.hull[0], -14) && near(z.sonar[0] - o.hull[0], 7) && near(z.cannon[0] - o.hull[0], -7) && z.tubes[1] === -14 && near(o.hull[0], ox));
    const q = V.ogreScene({ ...frame().ogre, heading: Math.PI / 2 }, tank);
    ok("at pi/2 the tubes are 14 m toward -Z", near(q.zones.tubes[2] - q.hull[2], -14) && near(q.zones.tubes[0] - q.hull[0], 0, 1e-9));
    const c = V.cameraChoices(3);
    ok("!! the menu: overview, an orbit and a bow for each of three defenders, and the OGRE (8 entries, unique ids)", c.length === 8 && new Set(c.map((x) => x.id)).size === 8 && c[0].id === "tank" && c.at(-1).id === "orbit:ogre" && c.filter((x) => x.id.startsWith("bow:")).length === 3 && c.filter((x) => x.id.startsWith("orbit:d")).length === 3 && V.cameraChoices(1).length === 4);
    ok("every bow label says first person", c.filter((x) => x.id.startsWith("bow:")).every((x) => /first person/.test(x.label)));
    const L = (id) => V.povLabel(frame(), id, ["alpha", "beta", "gamma"]);
    ok("!! the overlay text: the live boat's name, hit points, depth, compass heading and torpedoes", /^alpha {2}80 hp {2}depth 30 m {2}heading 0 {2}5 torpedoes$/.test(L(1)) && /gamma.*heading 172/.test(L(3)), L(1) + " | " + L(3));
    ok("a sunk boat says so and a stranger says it is not there", /beta: SUNK -- no view/.test(L(2)) && /d9: no such boat/.test(L(9)));
}

console.log("\n5. THE DRAW");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_), skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    const src = fs.readFileSync(path.join(ENG, "render", "seaOgre3d.mjs"), "utf8").replace(/^\s*\/\/.*$/gm, "");
    ok("!! the module reads no input: no listener, no pointer, no key, no gamepad -- the camera is chosen by the page, the fight is a recording", !/addEventListener|pointer|keydown|keyup|gamepad|getUserMedia|onclick/i.test(src));
    if (skip) { console.log("  live half SKIPPED -- " + skip + "\n  *** THAT IS A SKIP AND NOT A PASS: sections 1-4 are arithmetic; only a draw shows the OGRE, the boats and the eye agree"); }
    else {
        const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript" };
        const server = http.createServer((req, res) => {
            const u = decodeURIComponent(req.url.split("?")[0]);
            if (u === "/__so.html") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<!doctype html><meta charset=utf-8><body style='margin:0'><canvas id=c width=400 height=240></canvas></body>"); }
            const fp = path.join(ENG, u);
            if (fp.startsWith(ENG) && fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { "Content-Type": types[path.extname(fp)] || "text/plain" }); return res.end(fs.readFileSync(fp)); }
            res.writeHead(404); res.end("not found");
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const br = await chromium.launch({ executablePath: HEADLESS_SHELL, args: webglLaunchArgs().args });
        try {
            const pg = await (await br.newContext()).newPage(), errs = [];
            pg.on("pageerror", (e) => errs.push(String(e.message))); pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
            await pg.goto("http://127.0.0.1:" + server.address().port + "/__so.html", { waitUntil: "load" });
            const r = await pg.evaluate(async () => {
                const THREE = await import("/vendor/three/three.module.js"), V = await import("/render/seaOgre3d.mjs"), G = await import("/brain/seaOgre.mjs"), T = await import("/brain/subTournament.mjs"), VW = await import("/render/seaOgreView.mjs");
                const cv = document.getElementById("c"), tr = [], th = { fireRange: 420, blindSnr: 22, pingAfter: 1, trackSpeed: 2.5 };
                const res = G.fight(Array.from({ length: 3 }, (_, i) => T.makeSide("d" + i, { theta: th }).side()), G.scenario(3, 3), { trace: tr, squad: { probes: [0, 1, 2] }, seconds: 200 });
                const b = VW.boundsOf(tr), s3 = V.createSeaOgre3d(THREE, cv, b); s3.view.resize(400, 240);
                const gl = s3.view.renderer.getContext(), grab = () => { const px = new Uint8Array(400 * 240 * 4); gl.readPixels(0, 0, 400, 240, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
                const lit = (px) => { let n = 0; for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 15) n++; return n; };
                const tr2 = [], res2 = G.fight(Array.from({ length: 3 }, (_, i) => T.makeSide("e" + i, { theta: th }).side()), G.scenario(5, 3), { trace: tr2 }), early = VW.frameAt(tr, 20), late = tr2.at(-1), sunk = late.boats.find((q) => !q.alive);
                const out = { n: res.outcome, lost: res.lost, frames: tr.length };
                const o = s3.update(early, 1, "tank", ["a", "b", "c"]); out.overview = { label: o.label, pov: o.pov, lit: lit(grab()), hid: [...s3.view.subs.values()].filter((m) => !m.visible).length, subs: s3.view.subs.size };
                const w = s3.update(early, 1, "bow:1", ["a", "b", "c"]); const eye = V.povPose(early, 1, s3.tank, { subScale: s3.subScale });
                out.bow = { label: w.label, pov: w.pov, pos: s3.view.camera.position.toArray(), eye: eye.pos, hid1: !s3.view.subs.get("d1").visible, hid2: !s3.view.subs.get("d2").visible, lit: lit(grab()) };
                const ob = s3.update(early, 1, "orbit:d2", ["a", "b", "c"]); out.orbit = { label: ob.label, pov: ob.pov, allVisible: [...s3.view.subs.values()].every((m) => m.visible) };
                const og = s3.update(early, 1, "orbit:ogre", []); out.ogre = { label: og.label, focus: true };
                out.sunk = sunk ? (() => { const x = s3.update(late, 2, "bow:" + sunk.id, ["a", "b", "c"]); return { id: sunk.id, label: x.label, pov: x.pov }; })() : null;
                s3.update(early, 3, "tank", []); const sceneKids = s3.view.scene.children.length; const cols = new Set(); s3.view.scene.traverse((m) => { if (m.material && m.material.color && m.geometry && m.geometry.type === "SphereGeometry" && m.geometry.parameters.radius === 2.2) cols.add(m.material.color.getHex()); });
                const zf = { ...early, ogre: { ...early.ogre, hull: 120, zones: { tubes: 120, sonar: 30, cannon: 0, engine: 15 } } }; s3.update(zf, 3, "tank", []); const hx = (m) => m.material.color.getHex();
                out.zc = { tubes: hx(s3.zones.tubes), sonar: hx(s3.zones.sonar), cannon: hx(s3.zones.cannon), engine: hx(s3.zones.engine), cannonScale: s3.zones.cannon.scale.x, tubesScale: s3.zones.tubes.scale.x, vis: s3.ogre.visible, pos: s3.ogre.position.toArray(), want: V.ogreScene(zf.ogre, s3.tank).hull, rotY: s3.ogre.rotation.y, wantRot: zf.ogre.heading };
                const dead = { ...early, ogre: { ...early.ogre, hull: 0 } }; s3.update(dead, 4, "tank", []); out.deadVisible = s3.ogre.visible; s3.update(early, 5, "tank", []);
                out.zoneColours = [...cols].length >= 1; out.sceneKids = sceneKids; out.tank = [s3.tank.length, s3.tank.width];
                return out;
            });
            ok("!! a traced fight is flown in the page and the overview draws it: " + r.overview.lit + " of " + 400 * 240 + " pixels lit, " + r.overview.subs + " boats in the scene, the camera 'overview'", r.overview.lit > 400 * 240 * 0.5 && r.overview.label === "overview" && r.overview.pov === false && r.overview.subs === 3 && r.overview.hid === 0, JSON.stringify(r.overview));
            ok("!! the bow camera IS the eye pose: the renderer's camera sits at povPose to within a millimetre, the label is the boat's gauges, and boat 1's own hull is hidden while boat 2's is not", r.bow.pov && r.bow.pos.every((v, i) => Math.abs(v - r.bow.eye[i]) < 1e-3) && /^a {2}\d+ hp/.test(r.bow.label) && r.bow.hid1 && !r.bow.hid2 && r.bow.lit > 400 * 240 * 0.3, JSON.stringify(r.bow).slice(0, 220));
            ok("every other camera shows every hull again (orbit: all visible, no pov)", r.orbit.allVisible && !r.orbit.pov && /following b/.test(r.orbit.label) && /OGRE/.test(r.ogre.label));
            ok("!! a sunk boat's bow camera has no eye and says why (a seed-5 defence that loses all three boats: one is there to ask)", r.sunk !== null && !r.sunk.pov && /SUNK/.test(r.sunk.label), JSON.stringify(r.sunk));
            ok("!! the zones are lit by what is left of them in the scene: tubes whole (green), sonar 30/100 (amber), cannon gone (grey, half size), engine 15/150 (red); the OGRE stands where the frame has it and vanishes at hull 0", r.zc.tubes === 0x5fe08a && r.zc.sonar === 0xf6a623 && r.zc.cannon === 0x3a4658 && r.zc.engine === 0xff5a5a && r.zc.cannonScale === 0.5 && r.zc.tubesScale === 1 && r.zc.vis === true && r.deadVisible === false && r.zc.pos.every((v, i) => Math.abs(v - r.zc.want[i]) < 1e-6) && Math.abs(r.zc.rotY - r.zc.wantRot) < 1e-9, JSON.stringify(r.zc));
            ok("the OGRE's zone spheres are in the scene and the tank is as big as the fight needs (" + r.tank.join(" x ") + ")", r.zoneColours && r.tank[0] >= 1500 && r.tank[1] >= 1000);
            ok("no page or console error", errs.length === 0, errs.join(" | ").slice(0, 200));
        } finally { await br.close(); server.close(); }
    }
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
