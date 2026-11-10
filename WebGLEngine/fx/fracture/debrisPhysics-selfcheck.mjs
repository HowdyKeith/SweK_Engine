// WebGLEngine/fx/fracture/debrisPhysics-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node fx/fracture/debrisPhysics-selfcheck.mjs      (~12 s)
//
// THE GATE OF fx/fracture/debrisPhysics.js ON REAL JOLT AND REAL box3d, as blob-avatar.html and blob-herd.html use it -- the path no gate
// ran until the spinning body's fourth round (physics/mechanics/SPINNING_BODY_WIP.md) flew it, and found that the herd's debris could
// slide off its floor: on one seed of forty a fragment went over the edge at 4.4 s and fell for good. addGround() has since grown a
// `rim`, and both pages pass one; this gate holds the rim, the pages' use of it, and the pages' debris staying on the floor.
//   1  addGround(): the floor exactly as it always was without a rim; with one, four walls of that height along the floor's edge
//   2  the pages: both pass a 2 m rim with their own floor, and throw the debris as before
//   3  the rim holds: fragment-sized boxes thrown hard at the edge stay on the floor with the pages' rim, and go over without one
//   4  the pages' debris, as the pages make it (the default gyroscopic setting): 40 seeds of each blob on its floor and rim, none lost;
//      the bug reproduced -- the herd's seed 17 on the bare floor loses a fragment; and the spin cap (section 5) never engaging on Jolt
//   5  (2026-11-03, Keith: "Test the blob pages on box3d. They fall back to it when Jolt isn't available") THE PAGES' FALLBACK, box3d:
//      it is really box3d that is flown; box3d puts no cap on an angular impulse and Jolt does, which is why the module caps it; the bug
//      reproduced with the cap off (slivers spun to millions of rad/s, fragments thrown at hundreds of m/s, fragments lost); and the
//      cap, as the pages have it: nothing lost, each sliver's tumble kept about its own axis
//   6  the pages' longest frame: they step at the frame's time, capped at 1/30 s; the 80 flights at 1/30 s on both backends
//   (2026-11-04) SECTION 5 RESTATED AFTER box3d's FACADE GREW A CAP of its own (physics/box3d/box3dLoader.js, SPIN CAP, which the census of
//      its callers decided on: physics/mechanics/BOX3D_ANGULAR_IMPULSE_CAP_WIP.md). The world as it was is box3d's raw export; the module's cap, the
//      facade's alone and both together each fly the 80 flights byte for byte as the module's cap did before, pinned from this gate's own run at
//      cadec101 -- as are section 6's box3d flights.
//
// SABOTAGE LOG (2026-11-03) -- the byte-safe runner against this gate, tools/ship/joltArena-selfcheck.mjs and joltScenes-selfcheck.mjs, every
// file restored byte-identical (sha256); the number is the rows that went red across the three:
//   B1 the rim never built 3 | B2 the rim half as tall 2 | B3 the rim one wall short 1 | B4 the floor itself changed 5 | B5 blob-herd's rim dropped 2 | B6
//   blob-avatar's rim at 0.6 m 1
//   Every row of this gate went red under at least one design (the series' arena and page designs are logged in joltArena-selfcheck).
// SABOTAGE LOG, THE PAGES ON box3d (2026-11-03) -- the same runner and the same three gates, every file restored byte-identical (sha256):
//   F1 the cap never applied 3 | F2 the cap a hundred times Jolt's 4 | F3 the slack under one (the cap reaches Jolt's own spins) 2 | F4 the cap's scale upside
//   down 3 | F5 the cap stops the tumble dead 1 | F6 maxSpin ignored (the cap cannot be turned off) 2 | F7 only the first fragment capped 3 | F8 every body says
//   it was not capped 2 | F9 the facade asked for box3d hands back Jolt 6 | F10 the pages' fallback dropped (Jolt or nothing) 1 | F11 blob-herd asks for box3d
//   first 6 (1 here, 5 in joltScenes-selfcheck's C-page) | F12 Jolt's angular impulse ten thousand times weaker 5 | F13 box3d never adopted in node (the facade
//   falls back to Jolt silently) 6 | F14 the slack ten times (the cap engages only past 150 pi) 2 | R1 B1 again, over the restructured section 4: 3
//   Every new row went red under at least one design. A FINDING ON THE WAY: the first run was stopped after F4, because F3 showed section 5's cap rows
//   using the module's own SPIN_SLACK as their tolerance -- so a slack loosened tenfold would have loosened the gate with it. The gate took its own (OVER,
//   1.001), and the series was run again from F1 with F14 added; F14 is that loosened slack, and it goes red.
// SABOTAGE LOG, THE FACADE'S CAP (2026-11-04) -- section 5 restated around box3d's raw export, and section 6 pinned; the same runner, every file restored
// byte-identical (sha256), every one red by name. D against this gate's own rows, and F' -- the series above again, over the restated section 5:
//   D1 the module's pinned bytes one digit off 3 | D2 the uncapped flights' pinned bytes one digit off 1 | D3 section 6's box3d bytes one digit off 1
//   D4 the world as it was flown on the facade (no raw export) 3 | D5 the throw-by-throw row compares the module's cap, not no cap at all 1 | F1' the cap never applied 1
//   F2' the cap a hundred times Jolt's 2 | F3' the slack under one (the cap reaches Jolt's own spins) 5 | F4' the cap's scale upside down 1 | F5' the cap stops the tumble dead 1
//   F6' maxSpin ignored (the cap cannot be turned off) 2 | F7' only the first fragment capped 1 | F8' every body says it was not capped 1 | F9' the facade asked for box3d hands back Jolt 3
//   F10' the pages' fallback dropped (Jolt or nothing) 1 | F11' blob-herd asks for box3d first 1 | F12' Jolt's angular impulse ten thousand times weaker 2
//   F13' box3d never adopted in node (the facade falls back to Jolt silently) 3 | F14' the slack ten times (the cap engages only past 150 pi) 1
//   Of box3dLoader.js's cap (K1-K15, logged in tools/roundhouse/angularImpulseCensus-selfcheck.mjs, which they were run against with this gate), the rows red
//   here: K1 4 | K2 5 | K4 3 | K5 4 | K6 5 | K7 5 | K8 3 | K10 4 | K12 3 | K14 4 | K15 4; K3, K9, K11 and K13 red there and not here: none changes a spin the debris throws (no fragment's lies inside the slack, and the other three change neither the cap's arithmetic nor a world this small).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as D from "./debrisPhysics.js";
import * as L from "../../tools/roundhouse/joltScenes.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now(), J = JSON.stringify, near = (a, b, tol) => Math.abs(a - b) <= tol;
const guard = (n, e) => ok(`section ${n} ran without throwing`, false, String(e && e.stack || e).split("\n").slice(0, 2).join(" ").slice(0, 240));
const bounds = (w, i) => { const bb = w.raw().bodyOf(i).GetWorldSpaceBounds(); return [[bb.mMin.GetX(), bb.mMin.GetY(), bb.mMin.GetZ()], [bb.mMax.GetX(), bb.mMax.GetY(), bb.mMax.GetZ()]]; };
const src = (f) => fs.readFileSync(path.join(ENG, f), "utf8");
const RIM = 2;                        // the pages' rim, held against their source in section 2
const JOLT_CAP = 15 * Math.PI;        // Jolt's default max angular velocity (a quarter turn per 1/60 s step), read back from Jolt in section 5
const OVER = 1.001;                   // the most a spin at the throw may stand above Jolt's cap -- the gate's own, never the module's slack
const SEEDS = Array.from({ length: 40 }, (_, k) => k + 1), sum = (rs, k) => rs.reduce((a, r) => a + r[k], 0), most = (rs, k) => Math.max(...rs.map((r) => r[k]));
const spinOf = (W, i) => Math.hypot(W[i * 3], W[i * 3 + 1], W[i * 3 + 2]);
const bytesOf = (rs) => createHash("sha256").update(rs.map((r) => r.bytes).join("|")).digest("hex").slice(0, 16);   // the flights' end transforms, all of them

// One flight of a blob's debris on a world from `mk`, as the pages make it: its floor (the pages' rim unless `rim` says otherwise), the
// throw, then 15 s at `dt`. Returns the fragments lost below the floor, how many had their spin capped, the fastest spin at the throw,
// the fastest fragment above the floor (only if `track`: reading every step costs), and the end transforms' bytes.
function flight(mk, sc, seed, { rim = RIM, dt = 1 / 60, maxSpin = null, track = false } = {}) {
    const w = mk(); D.addGround(w, { ...sc.ground, rim });
    const bodies = D.makePhysicsDebris(w, L.fragmentsOf(sc, seed), [...sc.impact], { force: sc.force, rng: L.rng(200 + seed), ...(maxSpin == null ? {} : { maxSpin }) });
    const W = w.readAngularVelocities(), spin = Math.max(...bodies.map((b) => spinOf(W, b.idx)));
    let fastest = 0;
    for (let k = 0, n = Math.round(15 / dt); k < n; k++) {
        w.step(dt, 1);
        if (track) { const V = w.readVelocities(), X = w.readTransforms(); for (const b of bodies) if (X[b.idx * 7 + 1] > sc.ground.y - 0.5) fastest = Math.max(fastest, Math.hypot(V[b.idx * 3], V[b.idx * 3 + 1], V[b.idx * 3 + 2])); }
    }
    const X = w.readTransforms(), out = { lost: bodies.filter((b) => X[b.idx * 7 + 1] < sc.ground.y - 1).length, capped: bodies.filter((b) => b.spinCapped).length,
        n: bodies.length, spin, fastest, bytes: Buffer.from(X.buffer, X.byteOffset, X.byteLength).toString("base64") };
    w.destroy();
    return out;
}
// The spins at the throw, no stepping: [idx, spin vector] for each fragment, and which were capped.
function throwOf(mk, sc, seed, maxSpin = null) {
    const w = mk(); D.addGround(w, { ...sc.ground, rim: RIM });
    const bodies = D.makePhysicsDebris(w, L.fragmentsOf(sc, seed), [...sc.impact], { force: sc.force, rng: L.rng(200 + seed), ...(maxSpin == null ? {} : { maxSpin }) });
    const W = w.readAngularVelocities(), out = bodies.map((b) => ({ idx: b.idx, w: [W[b.idx * 3], W[b.idx * 3 + 1], W[b.idx * 3 + 2]], capped: b.spinCapped }));
    w.destroy();
    return out;
}

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
    const J0 = await L.jolt(), [D1, D2] = L.DEBRIS, mk = () => J0.createWorld({ gravity: [0, -9.8, 0] });
    const herd = SEEDS.map((s) => flight(mk, D2, s)), avatar = SEEDS.map((s) => flight(mk, D1, s));
    ok("!! the herd's and the avatar's debris, 40 seeds each for 15 s on their own floors with the pages' rim: not one fragment lost",
        herd.every((r) => r.lost === 0) && avatar.every((r) => r.lost === 0) && D2.ground.extent === 12 && D1.ground.extent === 9, `${sum(herd, "lost")} and ${sum(avatar, "lost")} lost`);
    const bug = flight(mk, D2, 17, { rim: 0 }).lost;
    ok("!! ...and the bug, reproduced: the herd's seed 17 on the bare floor, as the page had it, loses a fragment over the edge", bug === 1, `${bug} lost`);
    // 2026-11-03: the spin cap (section 5) on Jolt. The flight chosen for the bytes is the first of each blob whose throw has a fragment
    // at Jolt's own cap -- where the cap's slack is what keeps the module's hands off it.
    const atCap = (sc) => SEEDS.find((s) => throwOf(mk, sc, s, Infinity).some((f) => Math.hypot(...f.w) > 0.999 * JOLT_CAP));
    const same = [[D1, avatar], [D2, herd]].map(([sc, rs]) => { const s = atCap(sc); return s != null && rs[s - 1].bytes === flight(mk, sc, s, { maxSpin: Infinity }).bytes ? s : null; });
    const all = [...herd, ...avatar];
    ok("!! on Jolt the spin cap never engages: none of the 80 flights' fragments is capped -- Jolt caps the throw itself -- and the first flight of each blob with a fragment thrown at Jolt's cap ends byte for byte as it does with the cap off",
        sum(all, "capped") === 0 && sum(all, "n") > 1000 && same.every((s) => s != null), `${sum(all, "capped")} of ${sum(all, "n")} capped; the avatar's seed ${same[0]}, the herd's ${same[1]}`);
} catch (e) { guard(4, e); }

console.log("\n5. THE PAGES' FALLBACK, box3d (the vendored wasm, loaded the way node can, through the pages' own facade)");
try {
    const { adoptBox3dInNode } = await import("../../physics/backendNode.mjs"), { selectBackend } = await import("../../physics/backend.js");
    const st = await adoptBox3dInNode(), be = await selectBackend({ prefer: "box3d" }), J0 = await L.jolt(), [D1, D2] = L.DEBRIS;
    const probe = be.createWorld({ gravity: [0, -9.8, 0] }), id = probe.backendId(), angular = probe.supportsAngular(); probe.destroy();
    ok("!! it is box3d that is flown: the pages ask the facade for Jolt, whose order puts box3d second; box3d is adopted from the vendored wasm, the facade hands it back when asked first, and its worlds say box3d and can read and set spin",
        ["blob-avatar.html", "blob-herd.html"].every((f) => /selectBackend\(\{ prefer: "jolt" \}\)/.test(src(f))) && /else if \(prefer === "jolt"\) order = \["jolt", "box3d"\];/.test(src("physics/backend.js")) &&
        !!(st && st.ready) && be.name === "box3d" && id === "box3d" && angular === true, `${be.name}, ${st && st.via}`);
    const mkB = () => be.createWorld({ gravity: [0, -9.8, 0] }), mkJ = () => J0.createWorld({ gravity: [0, -9.8, 0] });
    // 2026-11-04 -- RESTATED AFTER box3d's FACADE GREW A CAP OF ITS OWN (physics/box3d/box3dLoader.js, SPIN CAP; the census of its callers,
    // physics/mechanics/BOX3D_ANGULAR_IMPULSE_CAP_WIP.md, decided it). angularImpulse() on box3d now leaves 15 pi at most, as Jolt's does, so the
    // world the pages had before it -- box3d's own impulse, no cap at the impulse -- is that world with angularImpulse() on box3d's raw export
    // (mkR). The bytes pinned below are these rows' own, from this gate's run at cadec101, before the facade's cap was written.
    const mkR = () => { const w = mkB(); w.angularImpulse = (i, v) => w._m._swk_body_ang_impulse(i, v[0], v[1], v[2]); return w; };
    const BYTES = Object.freeze({ off: "c0603c4edc712ec1", module: "cc43625e2ae639be" });
    const sliver = (mk) => { const w = mk(), i = w.addBox({ type: "dynamic", pos: [0, 0, 0], half: [0.03, 0.09, 0.06], density: 1 }); w.angularImpulse(i, [0.2, 0.1, -0.15]);
        const at = spinOf(w.readAngularVelocities(), i); w.step(1 / 60, 1); const after = spinOf(w.readAngularVelocities(), i); w.destroy(); return { at, after }; };
    const sj = sliver(() => J0.createWorld({ gravity: [0, 0, 0] })), sb = sliver(() => be.createWorld({ gravity: [0, 0, 0] })), sr = sliver(() => { const w = be.createWorld({ gravity: [0, 0, 0] }); w.angularImpulse = (i, v) => w._m._swk_body_ang_impulse(i, v[0], v[1], v[2]); return w; });
    ok("!! the cap is Jolt's own, and now box3d's facade's: a 6 x 18 x 12 cm sliver given a hard angular impulse reads back at once at 15 pi rad/s on Jolt -- the module's MAX_SPIN -- and on box3d's facade; on box3d's raw export, as the facade was, it reads far above it, and box3d brings it down to the same 15 pi only inside the next step",
        near(sj.at, JOLT_CAP, 1e-4) && D.MAX_SPIN === JOLT_CAP && near(sb.at, JOLT_CAP, 1e-4) && sr.at > 100 * JOLT_CAP && sr.after <= JOLT_CAP * OVER && sr.after > 0.9 * JOLT_CAP,
        `Jolt ${sj.at.toFixed(4)} rad/s at once; box3d's facade ${sb.at.toFixed(4)}; box3d's own ${sr.at.toFixed(0)} at once, ${sr.after.toFixed(4)} after one step`);
    const fly80 = (mk, o = {}) => [...SEEDS.map((s) => flight(mk, D2, s, { ...o, track: true })), ...SEEDS.map((s) => flight(mk, D1, s, { ...o, track: true }))];
    const off = fly80(mkR, { maxSpin: Infinity });
    ok("!! the bug, reproduced -- box3d's own impulse and the module's cap off, as both were: box3d's 80 flights throw slivers spinning at millions of rad/s, fling fragments at hundreds of m/s, and lose fragments through the floor or over the rim -- byte for byte the flights the facade flew before its cap",
        most(off, "spin") > 100 * JOLT_CAP && most(off, "fastest") > 50 && sum(off, "lost") >= 5 && sum(off, "capped") === 0 && bytesOf(off) === BYTES.off,
        `spun to ${most(off, "spin").toFixed(0)} rad/s, the fastest ${most(off, "fastest").toFixed(1)} m/s, ${sum(off, "lost")} of ${sum(off, "n")} lost, bytes ${bytesOf(off)}`);
    const mod = fly80(mkR);
    ok("!! the module's cap, as the pages had it before the facade's: on box3d's own impulse the same 80 flights throw nothing faster than Jolt's cap, the fastest fragment stays under 20 m/s, and not one is lost -- byte for byte as they were",
        most(mod, "spin") <= JOLT_CAP * OVER && sum(mod, "capped") > 0 && most(mod, "fastest") < 20 && sum(mod, "lost") === 0 && sum(mod, "n") === sum(off, "n") && bytesOf(mod) === BYTES.module,
        `${sum(mod, "capped")} of ${sum(mod, "n")} capped, spun to ${most(mod, "spin").toFixed(3)} rad/s at most, the fastest ${most(mod, "fastest").toFixed(1)} m/s, ${sum(mod, "lost")} lost, bytes ${bytesOf(mod)}`);
    const fac = fly80(mkB, { maxSpin: Infinity }), on = fly80(mkB);
    ok("!! the facade's cap alone (the module's off) flies the same 80 flights byte for byte as the module's cap did -- the same spins at the throw, by the same expression",
        most(fac, "spin") <= JOLT_CAP * OVER && sum(fac, "capped") === 0 && sum(fac, "lost") === 0 && bytesOf(fac) === BYTES.module, `spun to ${most(fac, "spin").toFixed(3)} rad/s at most, ${sum(fac, "lost")} lost, bytes ${bytesOf(fac)}`);
    ok("!! and the pages as they are now, both caps on: byte for byte the same again, the module's cap finding nothing above Jolt's left to cap, as on Jolt",
        sum(on, "capped") === 0 && most(on, "fastest") < 20 && sum(on, "lost") === 0 && sum(on, "n") === sum(off, "n") && bytesOf(on) === BYTES.module,
        `${sum(on, "capped")} of ${sum(on, "n")} capped by the module, the fastest ${most(on, "fastest").toFixed(1)} m/s, ${sum(on, "lost")} lost, bytes ${bytesOf(on)}`);
    // the cap's work, throw by throw: the same seeded throws on box3d's own impulse with no cap at all, and as the pages make them now
    let pairs = 0, kept = 0, over = 0, atCapOk = 0, axisOk = 0, flagged = 0;
    for (const sc of [D1, D2]) for (const s of SEEDS.slice(0, 10)) {
        const a = throwOf(mkR, sc, s, Infinity), b = throwOf(mkB, sc, s);
        a.forEach((f, k) => { const g = b[k], sa = Math.hypot(...f.w), sg = Math.hypot(...g.w); pairs++; if (g.capped) flagged++;
            if (sa <= JOLT_CAP * OVER) { if (J(f.w) === J(g.w)) kept++; return; }
            over++; if (near(sg, JOLT_CAP, 1e-3 * JOLT_CAP)) atCapOk++;
            if ((f.w[0] * g.w[0] + f.w[1] * g.w[1] + f.w[2] * g.w[2]) / (sa * sg) > 0.99999) axisOk++; });
    }
    ok("!! the cap keeps each sliver's tumble: on 20 throws, a fragment box3d's own impulse spins past the cap spins at Jolt's cap about the axis the throw gave it, and every other fragment is left exactly as it was thrown",
        over > 0 && atCapOk === over && axisOk === over && kept === pairs - over && flagged === 0, `${over} of ${pairs} past the cap (${atCapOk} at it now, ${axisOk} on their axis), ${kept} left as thrown`);
} catch (e) { guard(5, e); }

console.log("\n6. THE PAGES' LONGEST FRAME (they step at the frame's time, capped at 1/30 s)");
try {
    const { adoptBox3dInNode } = await import("../../physics/backendNode.mjs"), { selectBackend } = await import("../../physics/backend.js");
    await adoptBox3dInNode(); const be = await selectBackend({ prefer: "box3d" }), J0 = await L.jolt(), [D1, D2] = L.DEBRIS;
    const fly30 = (mk) => [...SEEDS.map((s) => flight(mk, D2, s, { dt: 1 / 30 })), ...SEEDS.map((s) => flight(mk, D1, s, { dt: 1 / 30 }))];
    const b30 = be.name === "box3d" ? fly30(() => be.createWorld({ gravity: [0, -9.8, 0] })) : [], j30 = fly30(() => J0.createWorld({ gravity: [0, -9.8, 0] }));
    // 2026-11-04: box3d's flights pinned to the bytes this row's own run gave at cadec101, before the facade's cap (section 5)
    ok("!! at 1/30 s a step, the 80 flights lose nothing on box3d, and nothing on Jolt -- box3d's byte for byte as they were before the facade's cap",
        b30.length === 80 && sum(b30, "lost") === 0 && j30.length === 80 && sum(j30, "lost") === 0 && bytesOf(b30) === "76e802054ae62d0c", `box3d ${sum(b30, "lost")} of ${sum(b30, "n")} lost, Jolt ${sum(j30, "lost")} of ${sum(j30, "n")}, box3d bytes ${bytesOf(b30)}`);
} catch (e) { guard(6, e); }

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: the pages' frame times between 1/60 and 1/30 s (only the two ends are flown). box3d's facade caps every caller's angular impulse" +
    " since 2026-11-04 (physics/box3d/box3dLoader.js, SPIN CAP); this module's own cap stays, for a world that does not.");
process.exitCode = fails ? 1 : 0;
