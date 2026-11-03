// WebGLEngine/fx/fracture/debrisPhysics-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node fx/fracture/debrisPhysics-selfcheck.mjs      (~5 s)
//
// THE GATE OF fx/fracture/debrisPhysics.js ON REAL JOLT, as blob-avatar.html and blob-herd.html use it -- the path no gate ran until the
// spinning body's fourth round (physics/mechanics/SPINNING_BODY_WIP.md) flew it, and found that the herd's debris could slide off its
// floor: on one seed of forty a fragment went over the edge at 4.4 s and fell for good. addGround() has since grown a `rim`, and both
// pages pass one; this gate holds the rim, the pages' use of it, and the pages' debris staying on the floor.
//   1  addGround(): the floor exactly as it always was without a rim; with one, four walls of that height along the floor's edge
//   2  the pages: both pass a 2 m rim with their own floor, and throw the debris as before
//   3  the rim holds: fragment-sized boxes thrown hard at the edge stay on the floor with the pages' rim, and go over without one
//   4  the pages' debris, as the pages make it (the default gyroscopic setting): 40 seeds of each blob on its floor and rim, none lost;
//      and the bug reproduced -- the herd's seed 17 on the bare floor loses a fragment
//
// SABOTAGE LOG (2026-11-03) -- the byte-safe runner against this gate, tools/ship/joltArena-selfcheck.mjs and joltScenes-selfcheck.mjs, every
// file restored byte-identical (sha256); the number is the rows that went red across the three:
//   B1 the rim never built 3 | B2 the rim half as tall 2 | B3 the rim one wall short 1 | B4 the floor itself changed 5 | B5 blob-herd's rim dropped 2 | B6
//   blob-avatar's rim at 0.6 m 1
//   Every row of this gate went red under at least one design (the series' arena and page designs are logged in joltArena-selfcheck).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as D from "./debrisPhysics.js";
import * as L from "../../tools/roundhouse/joltScenes.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now(), J = JSON.stringify, near = (a, b, tol) => Math.abs(a - b) <= tol;
const guard = (n, e) => ok(`section ${n} ran without throwing`, false, String(e && e.stack || e).split("\n").slice(0, 2).join(" ").slice(0, 240));
const bounds = (w, i) => { const bb = w.raw().bodyOf(i).GetWorldSpaceBounds(); return [[bb.mMin.GetX(), bb.mMin.GetY(), bb.mMin.GetZ()], [bb.mMax.GetX(), bb.mMax.GetY(), bb.mMax.GetZ()]]; };
const RIM = 2;   // the pages' rim, held against their source in section 2

console.log("1. addGround(): THE FLOOR, AND THE RIM");
try {
    const J0 = await L.jolt(), w = J0.createWorld({ gravity: [0, -9.8, 0] }), f = D.addGround(w, { y: -2.2, extent: 12 }), n0 = w.bodies.length, fb = bounds(w, f); w.destroy();
    const v = J0.createWorld({ gravity: [0, -9.8, 0] }), g = D.addGround(v, { y: -2.2, extent: 12, rim: RIM }), walls = v.bodies.map((_, i) => i).filter((i) => i !== g), wb = walls.map((i) => bounds(v, i)), gb = bounds(v, g); v.destroy();
    ok("!! without a rim, addGround() builds the one floor it always built: 24 m square, 0.5 m thick, its top at y, and returns it",
        n0 === 1 && f === 0 && near(fb[0][0], -12, 1e-5) && near(fb[1][0], 12, 1e-5) && near(fb[1][1], -2.2, 1e-5) && near(fb[0][1], -2.7, 1e-5) && near(fb[0][2], -12, 1e-5));
    ok("!! with a rim, four static walls of that height stand on the floor's edge, closing it on every side -- and the floor and its handle are the same",
        walls.length === 4 && g === 0 && J(gb) === J(fb) && wb.every((b) => near(b[0][1], -2.2, 1e-5) && near(b[1][1], -2.2 + RIM, 1e-5)) &&
        [[1, 0], [0, 0], [1, 2], [0, 2]].every(([side, ax]) => wb.some((b) => near(side ? b[0][ax] : b[1][ax], side ? 12 : -12, 1e-5) && b[0][2 - ax] <= -12 && b[1][2 - ax] >= 12)),
        `${walls.length} walls, ${RIM} m`);
} catch (e) { guard(1, e); }

console.log("\n2. THE PAGES PASS THE RIM");
try {
    const src = (f) => fs.readFileSync(path.join(ENG, f), "utf8");
    ok("!! both blob pages build their floor with a 2 m rim -- blob-avatar's at y = -1.6, 9 m out; blob-herd's at y = -2.2, 12 m out -- and throw the debris as they did",
        /addGround\(pWorld, \{ y: -1\.6, extent: 9, rim: 2 \}\);/.test(src("blob-avatar.html")) && /addGround\(pWorld, \{ y: -2\.2, extent: 12, rim: 2 \}\);/.test(src("blob-herd.html")) &&
        /makePhysicsDebris\(pWorld, frags, impact, \{ force: 2\.6 \}\)/.test(src("blob-avatar.html")) && /makePhysicsDebris\(pWorld, frags, impact, \{ force: 3\.0 \}\)/.test(src("blob-herd.html")));
} catch (e) { guard(2, e); }

console.log("\n3. THE RIM HOLDS (real Jolt: fragment-sized boxes thrown at the edge)");
try {
    const J0 = await L.jolt(), throwAll = (rim) => { let lost = 0, n = 0;
        for (const half of [[0.1, 0.1, 0.1], [0.3, 0.2, 0.15], [0.6, 0.6, 0.15], [0.6, 0.15, 0.6], [0.4, 0.5, 0.3]]) for (const speed of [4, 8, 12]) for (const up of [0, 3]) for (const spin of [0, 8]) {
            const w = J0.createWorld({ gravity: [0, -9.8, 0] }); D.addGround(w, { y: -2.2, extent: 12, rim });
            const i = w.addBox({ type: "dynamic", pos: [8, -2.2 + half[1] + 0.01, 0], half, density: 1 }); w.setVelocity(i, [speed, up, 0]); w.setAngularVelocity(i, [0, 0, -spin]);
            for (let k = 0; k < 600; k++) w.step(1 / 60, 1);
            if (w.readTransforms()[i * 7 + 1] < -3.2) lost++; n++; w.destroy();
        } return { lost, n }; };
    const withRim = throwAll(RIM), bare = throwAll(0);
    ok("!! thrown along the floor at the edge -- five fragment shapes, at 4, 8 and 12 m/s, flat and lobbed, still and tumbling -- none of 60 goes over the pages' rim; on the bare floor most do",
        withRim.n === 60 && withRim.lost === 0 && bare.lost >= 40, `${withRim.lost} of 60 over the rim, ${bare.lost} of 60 off the bare floor`);
} catch (e) { guard(3, e); }

console.log("\n4. THE PAGES' DEBRIS (real Jolt, the default gyroscopic setting, as the pages make it)");
try {
    const J0 = await L.jolt(), [D1, D2] = L.DEBRIS;
    const fly = (sc, seed, rim) => { const w = J0.createWorld({ gravity: [0, -9.8, 0] }); D.addGround(w, { ...sc.ground, rim });
        const idxs = D.makePhysicsDebris(w, L.fragmentsOf(sc, seed), [...sc.impact], { force: sc.force, rng: L.rng(200 + seed) }).map((b) => b.idx);
        for (let k = 0; k < 900; k++) w.step(1 / 60, 1);
        const xf = w.readTransforms(), lost = idxs.filter((i) => xf[i * 7 + 1] < sc.ground.y - 1).length; w.destroy(); return lost; };
    const seeds = Array.from({ length: 40 }, (_, k) => k + 1), lostHerd = seeds.map((s) => fly(D2, s, RIM)), lostAvatar = seeds.map((s) => fly(D1, s, RIM));
    ok("!! the herd's and the avatar's debris, 40 seeds each for 15 s on their own floors with the pages' rim: not one fragment lost",
        lostHerd.every((x) => x === 0) && lostAvatar.every((x) => x === 0) && D2.ground.extent === 12 && D1.ground.extent === 9, `${lostHerd.reduce((a, b) => a + b, 0)} and ${lostAvatar.reduce((a, b) => a + b, 0)} lost`);
    const bug = fly(D2, 17, 0);
    ok("!! ...and the bug, reproduced: the herd's seed 17 on the bare floor, as the page had it, loses a fragment over the edge", bug === 1, `${bug} lost`);
} catch (e) { guard(4, e); }

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: the pages' own frame time (they step at the frame's, capped at 1/30 s; this at 1/60 s) and box3d, the pages' fallback.");
process.exitCode = fails ? 1 : 0;
