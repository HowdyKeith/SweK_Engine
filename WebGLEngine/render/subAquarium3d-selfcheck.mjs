// WebGLEngine/render/subAquarium3d-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). (~4 s with a browser; section 1 alone ~0.1 s)
//
// Run: node render/subAquarium3d-selfcheck.mjs
//
// THE TANK IN THREE DIMENSIONS, HELD TO ITS COORDINATES AND TO A REAL DRAW:
//   1  THE POSE     subPose maps the tank's (x, y, depth, heading, pitch) to the scene's (X = x, Y = -depth, Z = y, rotation Y = heading, Z = pitch): depth goes DOWN, heading 0 is +x, a right turn (the
//                   tank's heading increases) turns the hull's nose from +x toward the scene's -z, which is what the plan view's `g.rotate(-heading)` on a y-down canvas draws;
//   2  THE DRAW     (needs a browser with WebGL; SKIPPED, and said, without one) in headless Chromium: the view renders four subs the page snapshot describes under the physics sea, the frame is lit and not
//                   flat; a sub at 14 m is more saturated than the same sub at 40 m (the tint, seen through the real renderer); the hull's long axis follows the heading (a sub at heading 0 is wider on
//                   screen along x than one at heading pi/2 seen from straight above); a sub that leaves the snapshot leaves the scene; the sea moves between two times;
//   3  THE PAGE     sub-aquarium.html builds the view with createView3d and renders it from the same frame loop that draws the 2D views.
//   2b THE TOWER AND THE TAIL  the sub is built here with the real three.js: a conning tower above the hull and forward, a periscope above that, a stern plane pair and a rudder aft, each hinged at its leading edge; the
//                   drawn trailing edges are TIED TO THE PHYSICS, not to a comment: at speed, pitch +1 makes a tail force DOWN (subModel6dof.forcesAndMoments) and the planes' trailing edges go UP, yaw +1 makes a tail force LEFT
//                   and the rudder's trailing edge goes RIGHT; full command is the model's own finMax; the tank's snapshot carries each pilot's command; the live render poses the fins from it.
//   SABOTAGED (each run alone, restored; red BY NAME): A plane sign flipped -> 3 red; B rudder sign flipped -> 1; C tower under the hull -> 1; D fins at the nose -> 1; F finMax doubled -> 2; G the snapshot drops cmd -> 1;
//   E render() stops posing the fins -> 0 red AT FIRST (the hand-called poseFins test cannot see the render path), which is what section 2's live row "the live render poses the fins from each row's command" was added for -> 1 red.
//   2c THE FOLLOW CAMERA (v4899)  cameraPose at the tank's centre is the pose the page always had; followStep is an exponential approach with k clamped; live: setFollow comes in to FOLLOW_DIST, the centre eases onto the sub, stopping restores the
//                   distance and the centre eases home, an unknown id and a sub that leaves follow nothing; the page has the followBox wired through syncFollow and a .cmd readout line in every row.
//   SABOTAGED (each alone, restored): the pose offset moved -> 1 red; k unclamped -> 1; no zoom-in -> 1; no distance restore -> 1; the centre never leaving home -> 1; the follow kept after the sub leaves -> the live evaluate THROWS (exit 1, no FAIL line:
//   the followed sub's position is read from a map it is no longer in); syncFollow without the fromBox guard -> 0 at first (the source row matched the signature), which is why the row now matches the condition itself -> 1; the readout removed -> 1.
// NOT GRADED, said plainly: that it looks like a tank, any timing, a real GPU, and the pilots (the subs here are rows of numbers).
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as V3 from "./subAquarium3d.mjs";
import * as THREE from "../vendor/three/three.module.js";
import * as SM from "../physics/mechanics/subModel6dof.mjs";
import { createTank } from "./subAquariumSim.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL, webglLaunchArgs } from "../tools/ship/playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);

console.log("subAquarium3d-selfcheck -- the tank in three dimensions\n");
console.log("1. THE POSE");
{
    const p = V3.subPose({ x: 120, y: 80, depth: 22, heading: 0.7, pitch: -0.1 });
    ok("!! subPose: X = x, Y = -depth (down is negative), Z = y, rotation Y = heading, rotation Z = pitch", p.x === 120 && p.y === -22 && p.z === 80 && p.rotY === 0.7 && p.rotZ === -0.1);
    // a hull's nose is +x in its own frame; rotation about Y by h carries +x to (cos h, 0, -sin h): a right turn (h > 0) swings the nose toward -z
    const nose = (h) => [Math.cos(h), 0, -Math.sin(h)];
    ok("!! heading 0 points the nose along +x; a positive heading (a right turn) swings it toward -z, the way the plan view's rotate(-heading) on a y-down canvas draws it", nose(0)[0] === 1 && nose(0.3)[2] < 0 && nose(0.3)[0] > 0);
    // v4899 -- the follow camera's arithmetic: at the tank's centre the pose is the one the page always had, a follow step is an exponential approach, and FOLLOW_DIST puts the whole hull in view
    const oldPose = (L, W, v) => [L / 2 + v.dist * Math.sin(v.yaw) * Math.cos(v.pitch), v.dist * Math.sin(v.pitch) - 10, W / 2 + v.dist * Math.cos(v.yaw) * Math.cos(v.pitch)];
    const cp = V3.cameraPose({ x: 250, y: -15, z: 150 }, { yaw: 0.6, pitch: 0.55, dist: 430 }), op = oldPose(500, 300, { yaw: 0.6, pitch: 0.55, dist: 430 });
    ok("!! cameraPose at the tank's centre is exactly the pose the page has always had, and it looks at the centre",
        cp.pos.every((v, i) => Math.abs(v - op[i]) < 1e-9) && cp.look.join() === "250,-15,150", `${cp.pos.map((v) => v.toFixed(1)).join(", ")}`);
    const fs1 = V3.followStep({ x: 0, y: 0, z: 0 }, { x: 100, y: -20, z: 50 }, 0.25), fs2 = V3.followStep({ x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 10 }, 5), fs3 = V3.followStep({ x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 10 }, -1);
    ok("!! followStep moves a fraction of the way to the target (0.25 of (100,-20,50) is (25,-5,12.5)), k is clamped to 0..1 so a bad k can neither overshoot nor run away, and k = 0 stays put",
        fs1.x === 25 && fs1.y === -5 && fs1.z === 12.5 && fs2.x === 10 && fs3.x === 0, JSON.stringify(fs1));
    ok("  following comes in to a distance where a 32 m hull fills the view (FOLLOW_DIST " + V3.FOLLOW_DIST + " m, between the 25 m zoom floor and the 150 m 'far' threshold)", V3.FOLLOW_DIST > 25 && V3.FOLLOW_DIST < 150);
    ok("  the on-screen length is larger than life and the water colour and tint density are the ones the bench report prints", V3.HULL_LENGTH === 16 && V3.WATER_COLOUR === 0x0a3b46 && V3.TINT_DENSITY === 0.045 && V3.reportLines()[0].includes("14 m 47%"));
}

console.log("\n2. THE DRAW");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: section 1 is arithmetic; only a draw shows the sea, the hulls and the tint agree");
    } else {
        const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript" };
        const server = http.createServer((req, res) => {
            const u = decodeURIComponent(req.url.split("?")[0]);
            if (u === "/__v3.html") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<!doctype html><meta charset=utf-8><body style='margin:0'><canvas id=c width=320 height=200></canvas></body>"); }
            const fp = path.join(ENG, u);
            if (fp.startsWith(ENG) && fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { "Content-Type": types[path.extname(fp)] || "text/plain" }); return res.end(fs.readFileSync(fp)); }
            res.writeHead(404); res.end("not found");
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const base = "http://127.0.0.1:" + server.address().port;
        const br = await chromium.launch({ executablePath: HEADLESS_SHELL, args: webglLaunchArgs().args });
        try {
            const pg = await (await br.newContext()).newPage(); const errs = [];
            pg.on("pageerror", (e) => errs.push(String(e.message))); pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
            await pg.goto(base + "/__v3.html", { waitUntil: "load" });
            const r = await pg.evaluate(async () => {
                const THREE = await import("/vendor/three/three.module.js"), V = await import("/render/subAquarium3d.mjs"), cv = document.getElementById("c");
                const view = V.createView3d(THREE, cv, { length: 500, width: 300, depthMax: 50 }); view.resize(320, 200);
                const gl = view.renderer.getContext(), W = 320, H = 200;
                const grab = () => { const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
                const lit = (px) => { let n = 0; const seen = new Set(); for (let i = 0; i < px.length; i += 4) { if (px[i] + px[i + 1] + px[i + 2] > 15) n++; seen.add((px[i] >> 4) + "," + (px[i + 1] >> 4) + "," + (px[i + 2] >> 4)); } return { n, colours: seen.size }; };
                const sat = (px) => { let m = 0; for (let i = 0; i < px.length; i += 4) m = Math.max(m, Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2])); return m; };
                const four = [0, 1, 2, 3].map((i) => ({ id: "s" + i, hue: 30 + i * 70, x: 100 + i * 90, y: 90 + (i % 2) * 90, depth: 16 + i * 8, heading: i * 0.5, pitch: 0 }));
                view.setView(0.4, 0.7, 600); view.render(four, 0); const a = grab(), A = lit(a), count4 = view.subs.size;
                view.render(four, 6.5); const a2 = grab(); let diff = 0; for (let i = 0; i < a.length; i++) if (a[i] !== a2[i]) diff++;
                // saturation of one sub alone, sea hidden, camera straight above, 14 m vs 40 m down
                view.sea.mesh.visible = false; view.setView(0, 1.5, 420);
                view.render([], 0); const empty = grab();
                // the sub alone: the pixels that differ from the empty tank (floor and edges cancel out)
                const one = (depth, heading) => { view.render([{ id: "x", hue: 0, x: 250, y: 150, depth, heading, pitch: 0 }], 0); const px = grab(), mask = new Uint8Array(W * H); let n = 0, mx = 0, dist = 0, minx = W, maxx = -1, miny = H, maxy = -1;
                    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const o = (j * W + i) * 4; if (Math.abs(px[o] - empty[o]) + Math.abs(px[o + 1] - empty[o + 1]) + Math.abs(px[o + 2] - empty[o + 2]) > 24) { n++; dist += Math.abs(px[o] - 10) + Math.abs(px[o + 1] - 59) + Math.abs(px[o + 2] - 70); minx = Math.min(minx, i); maxx = Math.max(maxx, i); miny = Math.min(miny, j); maxy = Math.max(maxy, j); } }
                    return { n, dist: dist / Math.max(1, n), w: maxx - minx + 1, h: maxy - miny + 1 }; };
                const sh = one(14, 0), dp = one(40, 0), h0 = one(14, 0), h90 = one(14, Math.PI / 2);
                const shallow = Math.round(sh.dist), deep = Math.round(dp.dist);
                view.render(four.slice(0, 2), 0); const count2 = view.subs.size;
                // the render path itself poses the fins from the row's command (not only poseFins when called by hand)
                const cm = (cmd) => { view.render([{ ...four[0], cmd }], 0); const P = view.subs.get(four[0].id).userData.parts; return [P.planes.rotation.z, P.rudder.rotation.y]; };
                const fins = { up: cm({ pitch: 1, yaw: 0 }), right: cm({ pitch: 0, yaw: 1 }), none: cm(undefined) };
                // v4899 -- follow: setFollow moves in, the centre eases onto the sub, stopping puts the distance back and the centre returns, an unknown id follows nothing, a sub that leaves ends it
                const sub0 = { ...four[0], x: 400, y: 50, depth: 30, cmd: { pitch: 0, yaw: 0 } };
                view.setView(0.4, 0.7, 600); view.render([sub0, four[1]], 0);
                const f0 = view.setFollow(sub0.id), dIn = view.getView().dist;
                for (let i = 0; i < 60; i++) view.render([sub0, four[1]], 0);
                const cIn = view.getCentre();
                const f1 = view.setFollow(null), dBack = view.getView().dist;
                for (let i = 0; i < 80; i++) view.render([sub0, four[1]], 0);
                const cHome = view.getCentre();
                const fBad = view.setFollow("no-such-sub");
                view.setFollow(sub0.id); view.render([four[1]], 0);
                const fGone = view.getFollow();
                const follow = { f0, dIn, cIn, f1, dBack, cHome, fBad, fGone };
                return { follow, fins, A, count4, diff, total: a.length, shallow, deep, h0: [h0.w, h0.h], h90: [h90.w, h90.h], n: [sh.n, dp.n], count2 };
            });
            ok("!! the view draws: " + r.A.n + " of " + 320 * 200 + " pixels lit, " + r.A.colours + " distinct colours, four subs in the scene", r.A.n > 320 * 200 * 0.5 && r.A.colours > 12 && r.count4 === 4);
            ok("!! the live render poses the fins from each row's command: pitch +1 sets the stern planes to -finMax (" + r.fins.up[0].toFixed(3) + ") and leaves the rudder straight; yaw +1 sets the rudder to -finMax (" + r.fins.right[1].toFixed(3) + "); a row with no command draws them straight",
                Math.abs(r.fins.up[0] + V3.FIN_MAX) < 1e-9 && r.fins.up[1] === 0 && Math.abs(r.fins.right[1] + V3.FIN_MAX) < 1e-9 && r.fins.right[0] === 0 && r.fins.none[0] === 0 && r.fins.none[1] === 0);
            { const F = r.follow;
              ok("!! following a sub: setFollow answers its id, comes in to FOLLOW_DIST (" + F.dIn + "), the camera's centre eases onto the sub (" + F.cIn.x.toFixed(1) + ", " + F.cIn.y.toFixed(1) + ", " + F.cIn.z.toFixed(1) + " against the sub at 400, -30, 50), and stopping puts the distance back to 600 (" + F.dBack + ") and the centre eases home to the tank's middle (" + F.cHome.x.toFixed(1) + ", " + F.cHome.z.toFixed(1) + ")",
                 F.f0 === "s0" && F.dIn === V3.FOLLOW_DIST && Math.abs(F.cIn.x - 400) < 1 && Math.abs(F.cIn.y + 30) < 1 && Math.abs(F.cIn.z - 50) < 1 && F.f1 === null && F.dBack === 600 && Math.abs(F.cHome.x - 250) < 1 && Math.abs(F.cHome.z - 150) < 1);
              ok("  an unknown id follows nothing (null), and a followed sub that leaves the tank ends the follow", F.fBad === null && F.fGone === null, `unknown -> ${F.fBad}; after it left -> ${F.fGone}`); }
            ok("!! the sea moves between two times (" + r.diff + " of " + r.total + " channel values differ)", r.diff > r.total * 0.002);
            ok("!! the tint is seen through the real renderer: one sub's mean distance from the water colour (0x0a3b46) is " + r.shallow + " at 14 m and " + r.deep + " at 40 m (deeper is closer to the water; the sub is isolated by differencing against the empty tank, " + r.n.join(" and ") + " pixels)", r.n[0] > 30 && r.n[1] > 30 && r.shallow > r.deep + 30, "");
            ok("!! the hull follows its heading: from straight above a sub at heading 0 is wider along x than along z (" + r.h0.join("x") + " px) and at heading pi/2 the other way round (" + r.h90.join("x") + " px)", r.h0[0] > r.h0[1] * 1.5 && r.h90[1] > r.h90[0] * 1.5);
            ok("  a sub that leaves the snapshot leaves the scene (4 -> " + r.count2 + " after two are dropped)", r.count2 === 2);
            ok("  no page or console error", errs.length === 0, errs.join(" | ").slice(0, 200));
        } finally { await br.close(); server.close(); }
    }
}

console.log("\n2b. THE CONNING TOWER AND THE TAIL: built here with the real three.js (geometry needs no GL), and tied to the physics' fin forces");
{
    const mat = new THREE.MeshBasicMaterial(), geo = {}, g = V3.buildSub(THREE, mat, geo), P = g.userData.parts;
    g.updateMatrixWorld(true);
    const box = (m) => new THREE.Box3().setFromObject(m), hull = box(P.hull), tower = box(P.tower), planes = box(P.planes), rudder = box(P.rudder);
    ok("!! the sub has a conning tower: a sail standing ABOVE the hull's top (its top is higher than the hull's), forward of amidships (its centre ahead of x = 0), with a periscope higher still",
        tower.max.y > hull.max.y && (tower.min.x + tower.max.x) / 2 > 0 && box(P.scope).max.y > tower.max.y,
        `hull top ${hull.max.y.toFixed(2)}, tower top ${tower.max.y.toFixed(2)} at x ${((tower.min.x + tower.max.x) / 2).toFixed(2)}, scope top ${box(P.scope).max.y.toFixed(2)}`);
    ok("!! the tail's control surfaces are AFT (both entirely behind amidships), the stern planes span the beam (wider across than the hull) and the rudder spans the height (taller than the hull is deep)",
        planes.max.x < 0 && rudder.max.x < 0 && planes.max.z - planes.min.z > hull.max.z - hull.min.z && rudder.max.y - rudder.min.y > (hull.max.y - hull.min.y) * 0.9,
        `planes x ${planes.min.x.toFixed(1)}..${planes.max.x.toFixed(1)} span ${(planes.max.z - planes.min.z).toFixed(1)} vs beam ${(hull.max.z - hull.min.z).toFixed(1)}; rudder height ${(rudder.max.y - rudder.min.y).toFixed(1)}`);
    ok("  at no command the fins are straight (angles exactly 0) and a missing, NaN or out-of-range command is read as 0 or clamped to +-1, not drawn", (() => {
        const z = V3.finAngles({ pitch: 0, yaw: 0 }), n = V3.finAngles({ pitch: NaN, yaw: "x" }), e = V3.finAngles(null), big = V3.finAngles({ pitch: 9, yaw: -9 });
        return z.plane === 0 && z.rudder === 0 && n.plane === 0 && n.rudder === 0 && e.plane === 0 && e.rudder === 0 && Math.abs(big.plane) === V3.FIN_MAX && Math.abs(big.rudder) === V3.FIN_MAX;
    })());
    ok("  full command is the MODEL's own deflection limit (finMax " + SM.EXPLORER.finMax + " rad), not a number chosen for looks", V3.FIN_MAX === SM.EXPLORER.finMax && Math.abs(V3.finAngles({ pitch: 1, yaw: 1 }).plane) === SM.EXPLORER.finMax);
    // the trailing edge is the fin's aft end: the point of its box at the smallest x
    // the trailing edge, measured directly: the middle of the fin's aft edge carried through its hinge and the group into the scene
    const aftPoint = (m) => { m.updateWorldMatrix(true, false); m.geometry.computeBoundingBox(); return m.localToWorld(new THREE.Vector3(m.geometry.boundingBox.min.x, 0, 0)); };   // the middle of the aft edge, in the scene
    V3.poseFins(g, { pitch: 0, yaw: 0 }); g.updateMatrixWorld(true);
    const t0p = aftPoint(P.planes), t0r = aftPoint(P.rudder);
    // the physics: at speed, the force each fin makes for a command, and which way it pushes the TAIL
    const model = SM.createSubModel(SM.EXPLORER), st = SM.createState({ depth: 30, speed: 3, model });
    const fins = (c) => SM.forcesAndMoments(model, st, c).fins;
    const fp = fins({ pitch: 1, yaw: 0, thrust: 0, ballast: 0 }).plane, fr = fins({ pitch: 0, yaw: 1, thrust: 0, ballast: 0 }).rudder;
    // a fin pushes the water toward its trailing edge and is pushed the OTHER way: plane force along body +Z(up), rudder force along body +Y(left)
    V3.poseFins(g, { pitch: 1, yaw: 0 }); g.updateMatrixWorld(true);
    const dy = aftPoint(P.planes).y - t0p.y;
    V3.poseFins(g, { pitch: 0, yaw: 1 }); g.updateMatrixWorld(true);
    const dz = aftPoint(P.rudder).z - t0r.z;   // scene +Z is the vessel's LEFT
    ok("!! pitch +1 (nose up): the physics pushes the tail DOWN and the drawn stern planes' trailing edges go UP (the water is thrown up, the tail pushed down)",
        fp < 0 && dy > 0, `plane force ${fp.toFixed(1)} N (body +Z up), trailing edge moved ${dy.toFixed(2)} (up is +)`);
    ok("!! yaw +1 (nose right): the physics pushes the tail LEFT and the drawn rudder's trailing edge goes RIGHT (the water is thrown right, the tail pushed left)",
        fr > 0 && dz < 0, `rudder force ${fr.toFixed(1)} N (body +Y left), trailing edge moved ${dz.toFixed(2)} (left is +)`);
    V3.poseFins(g, { pitch: -1, yaw: -1 }); g.updateMatrixWorld(true);
    ok("  and the opposite command swings each the opposite way, by the same amount (symmetric about straight)",
        Math.abs((aftPoint(P.planes).y - t0p.y) + dy) < 1e-6 && Math.abs((aftPoint(P.rudder).z - t0r.z) + dz) < 1e-6 && dy > 0.5,
        `plane +-${dy.toFixed(2)}, rudder +-${Math.abs(dz).toFixed(2)} at ${SM.EXPLORER.finMax} rad on a ${(P.planes.geometry.parameters.width).toFixed(1)}-long chord`);
    V3.poseFins(g, { pitch: 0.5, yaw: 0 });
    ok("  a half command is a half deflection", Math.abs(P.planes.rotation.z + 0.5 * SM.EXPLORER.finMax) < 1e-12 && P.rudder.rotation.y === 0);
    // the tank hands the page the pilot's command
    const tank = createTank(); tank.sync([{ id: "a", name: "a", hue: 10, pilot: "pd", from: "x", local: true }]); tank.step(2);
    const row = tank.snapshot()[0], c = row.cmd;
    ok("!! the tank's snapshot carries the pilot's command each sub was flown with (four finite numbers within -1..+1), so the page draws the fins from what the pilot asked, not from the attitude",
        c && ["pitch", "yaw", "thrust", "ballast"].every((k) => Number.isFinite(c[k]) && Math.abs(c[k]) <= 1) && (Math.abs(c.pitch) + Math.abs(c.yaw) + Math.abs(c.thrust) > 0),
        JSON.stringify(c));
    mat.dispose(); for (const k of Object.keys(geo)) geo[k].dispose();
}

console.log("\n3. THE PAGE");
{
    const aq = fs.readFileSync(path.join(ENG, "sub-aquarium.html"), "utf8");
    ok("!! the page has the follow control and the readout: a followBox checkbox wired to view3d.setFollow through syncFollow (ticking it with nothing selected picks the first sub, deselecting does not), and every list row carries a .cmd line filled from the snapshot's cmd",
        /id="followBox"/.test(aq) && /view3d\.setFollow\(on \? selected : null\)/.test(aq) && /on && !selected && fromBox/.test(aq) && /className = "cmd"/.test(aq) && /s\.cmd\) \{/.test(aq) && /pitch \$\{f\(s\.cmd\.pitch/.test(aq));
    ok("!! sub-aquarium.html builds the 3D view with createView3d from the same tank and renders it from the frame loop that draws the 2D views; a page without WebGL keeps its 2D views", /import \{ createView3d \} from "\/render\/subAquarium3d\.mjs"/.test(aq) && /createView3d\(THREE, cv, \{ length: LENGTH, width: WIDTH/.test(aq) && /view3d\.render\(snap/.test(aq) && /catch \(e\) \{ view3d = null;/.test(aq));
}

console.log(`\nsubAquarium3d-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
