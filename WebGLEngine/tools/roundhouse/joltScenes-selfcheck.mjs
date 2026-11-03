// WebGLEngine/tools/roundhouse/joltScenes-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/roundhouse/joltScenes-selfcheck.mjs      (~3 s)
//
// THE GATE OF tools/roundhouse/joltScenes.mjs (and its command, joltScenesRun.mjs): the new gyroscopic default in the engine's
// own Jolt scenes, as physics/mechanics/SPINNING_BODY_WIP.md registers its fourth round.
// *** NOTHING HERE STARTS THE COMMAND, AND NOTHING HERE FLIES A REGISTERED SEED. *** The plumbing flies seeds 501 to 503 and
// the miniature seeds 1001 and 1002, for half a second; the registered seeds are 1 to 40. The command's guards are held as
// library functions and as the order of its source.
//
//   1  THE REGISTRATION, AS CODE: the three settings, the seeds, the line, the cohesion line; the arena's and the debris
//      scenes' numbers; the statistics and the seven primary ones; what makes a run the registered one; the round's order
//   2  THE READING ON MADE-UP CASES: the exact sign test against binomial sums built here, at the edge of its line, with
//      ties and none; the rest time, the spread, the median and the seeded stream
//   3  THE PLUMBING (real Jolt): C-page on the pages and on an edited one; each setting reaching every body, the modules'
//      too; the crew where the seed puts them and the nudge on the first alone; the blob's meshes; the debris the same
//      fracture for F and F'; C-setting, and C-setting able to fail
//   4  THE ROUND ON A MINIATURE: every control, flight and reading in order; C-page, C-setting and C-determinism able to
//      stop or fail it; the results file's format
//   5  THE COMMAND: it never overwrites, refuses an option it does not know, and prints no score
//
// SABOTAGE LOG (2026-11-03) -- each applied with the byte-safe runner against this gate, every file restored byte-identical (sha256); the
// number is the rows that went red, by name:
//   G1 F nudged too 3 | G2 D handed a key (the default never passed through) 5 | G3 F handed Jolt's own force 5 | G4 the crew's jitter doubled 2 | G5 the
//   jitter drawn y first 1 | G6 the nudge on every crew member 2 | G7 the nudge entering the fracture 1 | G8 every setting thrown from the nudged impact 2
//   | G9 the rest time not reset when a body wakes 1 | G10 the rest time a step early 1 | G11 the spread counting the height 1 | G12 the sign test
//   one-sided 2 | G13 ties counted as down 1 | G14 none counted as zero 2 | G15 the line at 0.05 2 | G16 the median dropping none 1 | G17 A2's cohesion
//   not primary 1 | G18 A1's window 5 s 1 | G19 the registered flag without the debris window 1 | G20 C-determinism on the last seed 2 | G21 C-page
//   skipping the herd page 1 | G22 C-page not stopping the round 2 | G23 C-setting never refusing 2 | G24 C-determinism comparing only A1's rest time 1 |
//   G25 the nudge counted D against F 1 | G26 the cohesion of the first crew member only 1 | G27 the wall never updated after the fling 2 | G28 the crew
//   flung away from the wall 2 | G29 the debris gone at the ground itself 1 | G30 the meshes never cached 1 | G31 the herd from another seed 2 | G32 the
//   debris rest time over the first fragment only 1 | G33 the command never refusing an existing file 1 | G34 the command printing the result 1 | G35 the
//   command accepting any option 1
//   FOUND BY THEM: G7 (the nudge entering the fracture) went 0 red on the first run. The row compared F's and F''s fragments, which a nudge
//   of 1e-5 m in the sites cannot move: no triangle changes its nearest site. buildDebris() now returns its fracture, and the row compares the
//   sites themselves, F's and F''s, against the seed's own unnudged fracture. The whole series was run again, and the counts above are that run's.
//   FOUND BEFORE THEM, while designing them: three rows that could not have gone red (see the note).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "./joltScenes.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now(), J = JSON.stringify;
const guard = (n, e) => ok(`section ${n} ran without throwing`, false, String(e && e.stack || e).split("\n").slice(0, 2).join(" ").slice(0, 240));
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const lib = fs.readFileSync(path.join(HERE, "joltScenes.mjs"), "utf8");
const spyWorld = async (seen) => { const w = (await L.jolt()).createWorld({ gravity: [0, -9.8, 0] }); return new Proxy(w, { get(t, k) {
    if (k === "addBox") return (o) => { seen.push({ ...o }); return t.addBox(o); };
    const v = t[k]; return typeof v === "function" ? v.bind(t) : v; } }); };

console.log("1. THE REGISTRATION, AS CODE");
try {
    ok("!! the three settings, in order: D the new default (no key), F false on every body, F' false nudged by 1e-5 m -- frozen",
        J(L.SETTINGS.map((s) => [s.id, s.gyroscopic, s.nudge])) === J([["D", "default", 0], ["F", false, 0], ["F'", false, 1e-5]]) && L.NUDGE === 1e-5 && Object.isFrozen(L.SETTINGS) && Object.isFrozen(L.SETTINGS[2]));
    ok("!! the seeds are 1 to 40, the sign test's line p < 0.01, and the cohesion line the ragdoll gate's 2",
        L.SEEDS.length === 40 && L.SEEDS.every((s, k) => s === k + 1) && Object.isFrozen(L.SEEDS) && L.P_LINE === 0.01 && L.HOLD === 2);
    const A = L.ARENA;
    ok("!! the arena: its ground strip and 7 x 6 wall, three crew at x = 3.5, 4.9 and 6.3 and y = 1.6 at scale 0.85, moved up to 0.2 m in x and raised up to 0.4 m, flung (dir 30, 7, 0) with spin 5, stepped at 1/60 s with two substeps, for 10 s and then 20 s; gone below y = -5",
        J(A) === J({ ground: { pos: [0, -0.5, 0], half: [40, 0.5, 0.5] }, wall: { x: 0, y: 0, z: 0, cols: 7, rows: 6, half: 0.5 }, crew: { n: 3, x0: 3.5, dx: 1.4, y: 1.6, z: 0, scale: 0.85, jitterX: 0.2, raiseY: 0.4 },
            fling: { speed: 30, up: 7, spin: 5 }, dt: 1 / 60, substeps: 2, addedT: 10, flungT: 20, goneY: -5 }) && Object.isFrozen(A.crew) && Object.isFrozen(A.ground.pos));
    ok("!! the debris: D1 the avatar (16 sites at bias 0.6 toward (1.2, 0.6, 0), force 2.6, ground -1.6 and 9, 38 cells over +-3.35) and D2 the herd (22 at 0.5 toward (0, 0.4, 0), 3.0, -2.2 and 12, 32 cells over +-4.4, five members from seed 7); 1/60 s, one substep, 15 s; gone 1 m under the ground",
        J(L.DEBRIS.map((d) => [d.id, d.page, d.sites, d.bias, d.impact, d.force, d.ground, d.N, d.LO, d.HI, d.iso, d.herd])) === J([
            ["D1", "blob-avatar.html", 16, 0.6, [1.2, 0.6, 0], 2.6, { y: -1.6, extent: 9 }, 38, -3.35, 3.35, 1, null],
            ["D2", "blob-herd.html", 22, 0.5, [0, 0.4, 0], 3, { y: -2.2, extent: 12 }, 32, -4.4, 4.4, 1, { n: 5, orbitR: 3.1, separation: 1.35, seed: 7 }]]) &&
        J(L.DEBRIS_RUN) === J({ dt: 1 / 60, substeps: 1, T: 15, goneBelow: 1 }) && Object.isFrozen(L.DEBRIS[1].herd));
    ok("!! the statistics of each scene, and the primary ones the registration lists -- seven, though it says six: A1 the rest time; A2 the wall's broken joints and the cohesion; D1 and D2 the rest time and the spread",
        J(L.STATS) === J({ A1: ["restTime", "height", "cohesion"], A2: ["broken", "cohesion", "gone", "peakSpeed", "peakSpin"], D1: ["restTime", "spread", "height", "gone", "peakSpeed"], D2: ["restTime", "spread", "height", "gone", "peakSpeed"] }) &&
        J(L.PRIMARY) === J({ A1: ["restTime"], A2: ["broken", "cohesion"], D1: ["restTime", "spread"], D2: ["restTime", "spread"] }) && Object.values(L.PRIMARY).flat().length === 7);
    ok("!! a run is the registered one only with seeds 1 to 40 and the three registered windows",
        /registered: JSON\.stringify\(seeds\) === JSON\.stringify\(SEEDS\) && addedT === ARENA\.addedT && flungT === ARENA\.flungT && debrisT === DEBRIS_RUN\.T/.test(lib));
    const body = lib.slice(lib.indexOf("export async function run("));
    const order = ["pageControl(", "if (!result.page.ok)", "settingControl(", "if (!result.setting.ok)", "arenaFlight(seed", "debrisFlight(sc, seed", "determinismControl(result.flights", "testsOf(result.flights)"].map((s) => body.indexOf(s));
    ok("!! the round's order: C-page, stopping on it; C-setting, stopping on it; every seed of the arena and of the debris with each setting; C-determinism on the first seed; the readings",
        order.every((p, k) => p > 0 && (k === 0 || p > order[k - 1])) && /seed: seeds\[0\]/.test(body), J(order));
    ok("!! the nudge reaches F' alone, and only the first crew member's x, or only the impact the debris is thrown from -- never the fracture",
        /x: A\.crew\.x0 \+ k \* A\.crew\.dx \+ jx \+ \(k === 0 \? setting\.nudge : 0\)/.test(lib) && /from = \[scene\.impact\[0\] \+ setting\.nudge, scene\.impact\[1\], scene\.impact\[2\]\]/.test(lib) &&
        /impact: \[\.\.\.scene\.impact\], bias: scene\.bias, rng: rng\(100 \+ seed\)/.test(lib) && !/fragmentsOf\(scene, seed, setting/.test(lib));
    // found while designing the sabotages: nothing held how a statistic is taken -- over which bodies, after which update
    ok("!! the statistics are taken as registered: the cohesion over ALL the crew, the wall's update() after every step of both windows, the crew flung as the page flings them, the peaks over every part, and the rest time over every part or fragment",
        /const cohesion = \(\) => Math\.max\(\.\.\.rags\.map\(\(g\) => g\.cohesion\(\)\)\);/.test(lib) && (lib.match(/w\.step\(A\.dt, A\.substeps\); S\.update\(\);/g) || []).length === 2 &&
        /g\.fling\(\(c\[0\] >= 0 \? -1 : 1\) \* A\.fling\.speed, A\.fling\.up, 0, A\.fling\.spin\)/.test(lib) && /for \(const i of parts\) \{ peakSpeed = Math\.max\(peakSpeed, Math\.hypot\(v\[i \* 3\]/.test(lib) &&
        /asleep\.push\(!awakeAny\(w, parts\)\)/.test(lib) && /asleep\.push\(!awakeAny\(w, idxs\)\)/.test(lib) && /for \(const i of idxs\) peakSpeed = Math\.max/.test(lib));
} catch (e) { guard(1, e); }

console.log("\n2. THE READING ON MADE-UP CASES (no engine)");
try {
    // the binomial tail built here in exact integers, against the sign test's own floating sum
    const C = (n, k) => { let c = 1n; for (let i = 0n; i < BigInt(k); i++) c = (c * (BigInt(n) - i)) / (i + 1n); return c; };
    const tail = (n, k) => { let s = 0n; for (let i = 0; i <= k; i++) s += C(n, i); return Number(s) / 2 ** n; };
    const pair = (up, down, ties = 0) => [Array(up).fill(2).concat(Array(down).fill(0), Array(ties).fill(1)), Array(up + down + ties).fill(1)];
    const t29 = L.signTest(...pair(29, 11)), t28 = L.signTest(...pair(28, 12)), t11 = L.signTest(...pair(11, 29));
    ok("!! the exact two-sided sign test is twice the binomial tail built here in exact integers: 29 of 40 up is p = 0.0064 and CHANGES it upward; 28 of 40 is 0.0166, no change; 11 of 40 changes it downward",
        near(t29.p, 2 * tail(40, 11), 1e-12) && t29.p.toFixed(4) === "0.0064" && t29.reading === "changes it upward" && near(t28.p, 2 * tail(40, 12), 1e-12) && t28.p.toFixed(4) === "0.0166" && t28.reading === "no change" &&
        t11.reading === "changes it downward" && near(t11.p, t29.p, 1e-15), `${t29.p.toFixed(6)} / ${t28.p.toFixed(6)}`);
    const tt = L.signTest(...pair(9, 0, 31)), none = L.signTest([null, null, 3, null], [5, null, 4, 2]), all = L.signTest([1, 2], [1, 2]);
    ok("!! ties are set aside (9 up, 31 ties: p = 2/512 = 0.0039, changes), none counts as later than any number (and two nones tie), and a test of nothing but ties is p = 1, no change",
        tt.ties === 31 && near(tt.p, 2 / 512, 1e-15) && tt.reading === "changes it upward" && none.up === 2 && none.down === 1 && none.ties === 1 && all.p === 1 && all.reading === "no change", J(none));
    ok("!! the rest time is the time from which every body STAYS asleep to the end: a body that wakes again resets it, and a scene awake at the end has none",
        L.restTimeOf([false, true, true, false, true, true, true], 0.5) === 2.5 && L.restTimeOf([true, true], 0.5) === 0.5 && L.restTimeOf([true, true, false], 0.5) === null && L.restTimeOf([], 0.5) === null);
    ok("!! the spread is the RMS horizontal distance from the centroid, the height ignored",
        L.spreadOf([[1, 0, 0], [-1, 0, 0]]) === 1 && L.spreadOf([[0, 5, 1], [0, -3, -1]]) === 1 && near(L.spreadOf([[3, 0, 4], [3, 9, 4]]), 0, 1e-15));
    ok("!! the median counts none as later than any, and is none itself when the middle is",
        L.median([3, null, 1]) === 3 && L.median([null, null, 1]) === null && L.median([1, 2, 3, 4]) === 2.5 && L.median([]) === null);
    const r1 = L.rng(1), a = [r1(), r1(), r1()], b = L.rng(1), c = L.rng(2)();
    ok("!! the seeded stream: the same seed gives the same numbers, in [0, 1), a different seed others -- the LCG written out here",
        a[0] === b() && a[1] === b() && a.every((x) => x >= 0 && x < 1) && c !== a[0] && a[0] === ((Math.imul(1, 1664525) + 1013904223) >>> 0) / 4294967296);
    // found while designing the sabotages: on the miniature both D and F' differ from F on both seeds, so a count of the wrong pair passed
    const mk = (end, rest) => ({ restTime: rest, height: 0, cohesion: 0.5, gone: 0, finite: true, end }), dk = (end, rest) => ({ fragments: 3, restTime: rest, spread: 1, height: 0, gone: 0, peakSpeed: 1, finite: true, end });
    const fake = { A: [{ seed: 1, D: { A1: mk("a", 1), A2: { ...mk("b", 1), broken: 1, peakSpeed: 1, peakSpin: 1 } }, F: { A1: mk("a", 2), A2: { ...mk("b", 1), broken: 1, peakSpeed: 1, peakSpin: 1 } }, "F'": { A1: mk("z", 2), A2: { ...mk("b", 1), broken: 1, peakSpeed: 1, peakSpin: 1 } } }],
        D1: [{ seed: 1, D: dk("q", null), F: dk("q", 3), "F'": dk("q", 3) }], D2: [{ seed: 1, D: dk("x", 2), F: dk("y", 2), "F'": dk("y", 2) }] };
    const ft = L.testsOf(fake);
    ok("!! the readings' counts on made-up flights: the nudge counted F' against F (not D), a rest time of none unsettled, a cohesion under 2 held",
        ft.A1.nudged === 1 && ft.A2.nudged === 0 && ft.D1.nudged === 0 && ft.D2.nudged === 0 && J(ft.D1.settled) === J({ D: 0, F: 1, "F'": 1 }) && J(ft.A1.held) === J({ D: 1, F: 1, "F'": 1 }) &&
        ft.A1.stats.restTime.default.down === 1 && ft.D1.stats.restTime.default.up === 1, J({ A1: ft.A1.nudged, D1: ft.D1.settled }));
    const f1 = new Float32Array([1, 2, 3]), f2 = new Float32Array([1, 2, 3]), f3 = new Float32Array([1, 2, 3 + 2 ** -21]);
    ok("!! the end's fingerprint: 16 hex digits of the transforms' bytes, the same for the same bytes and not for one bit moved",
        /^[0-9a-f]{16}$/.test(L.fingerprint(f1)) && L.fingerprint(f1) === L.fingerprint(f2) && L.fingerprint(f1) !== L.fingerprint(f3));
} catch (e) { guard(2, e); }

console.log("\n3. THE PLUMBING (real Jolt; seeds 501 to 503, nothing stepped past a second)");
try {
    const pg = L.pageControl(), real = (f) => fs.readFileSync(path.join(ENG, f), "utf8");
    const edited = L.pageControl({ read: (f) => (f === "blob-herd.html" ? real(f).replace("bias: 0.5 }", "bias: 0.4 }") : real(f)) });
    ok("!! C-page: the scenes' 25 numbers are the pages' own, read from their source -- and a page with one number changed is refused, by name",
        pg.ok && pg.checked === 25 && edited.ok === false && J(edited.missing) === J(["blob-herd.html#1"]), J(pg));
    const [D, F, Fn] = L.SETTINGS, seenD = [], seenF = [];
    const sd = await spyWorld(seenD), ad = L.buildArena(await L.worldOf(D, { makeWorld: () => sd }), 501, D), dd = L.buildDebris(await L.worldOf(D, { makeWorld: () => sd }), L.DEBRIS[0], 501, D);
    const sf = await spyWorld(seenF), af = L.buildArena(await L.worldOf(F, { makeWorld: () => sf }), 501, F), df = L.buildDebris(await L.worldOf(F, { makeWorld: () => sf }), L.DEBRIS[0], 501, F);
    sd.destroy(); sf.destroy();
    const bodies = 1 + 42 + 21 + 1 + dd.n;
    ok("!! each setting reaches EVERY body, the modules' too: with D no body is handed a gyroscopic key; with F all of them -- ground, wall, crew, ground, fragments -- are handed false",
        seenD.length === bodies && seenD.every((o) => !("gyroscopic" in o)) && seenF.length === bodies && seenF.every((o) => o.gyroscopic === false) && ad.parts.length === 21 && af.wall.length === 42,
        `${seenD.length} bodies`);
    // the crew where the seed puts them: each pelvis (a part centred on the figure's origin) at x0 + k dx + jitter, y + raise
    const pos = async (st, seed) => { const w = await L.worldOf(st), a = L.buildArena(w, seed, st), xf = w.readTransforms(), out = { pel: a.rags.map((g) => [xf[g.idxs()[0] * 7], xf[g.idxs()[0] * 7 + 1]]), all: Array.from(xf) }; w.destroy(); return out; };
    const r = L.rng(502), want = [0, 1, 2].map((k) => { const jx = (r() - 0.5) * 0.4, ry = r() * 0.4; return [3.5 + k * 1.4 + jx, 1.6 + ry]; });
    const pD = await pos(D, 502), pF = await pos(F, 502), pN = await pos(Fn, 502);
    const moved = pN.all.map((v, k) => Math.abs(v - pF.all[k])).map((d, k) => (d > 0 ? k : -1)).filter((k) => k >= 0);
    const first = (await (async () => { const w = await L.worldOf(F), a = L.buildArena(w, 502, F), ids = a.rags[0].idxs(); w.destroy(); return ids; })()).map((i) => i * 7);
    ok("!! the crew stand where the seed puts them, the same for D and F; F' moves ONLY the first crew member, and only by 1e-5 m in x",
        pD.pel.every((p, k) => near(p[0], want[k][0], 1e-6) && near(p[1], want[k][1], 1e-6)) && J(pD.all) === J(pF.all) && J(moved) === J(first) &&
        first.every((o) => near(pN.all[o] - pF.all[o], 1e-5, 1e-6)), `moved ${moved.length} numbers`);
    const m1 = L.meshOf(L.DEBRIS[0]), m2 = L.meshOf(L.DEBRIS[1]);
    ok("!! the blob's meshes, marched as the pages march them: the avatar's rest pose (2,020 triangles) and the avatar with its herd (1,752), the same object every time it is asked for",
        m1.positions.length / 9 === 2020 && m2.positions.length / 9 === 1752 && L.meshOf(L.DEBRIS[0]) === m1, `${m1.positions.length / 9} and ${m2.positions.length / 9}`);
    const deb = async (st, seed) => { const w = await L.worldOf(st), d = L.buildDebris(w, L.DEBRIS[1], seed, st), xf = Array.from(w.readTransforms()), v = Array.from(w.readVelocities()); w.destroy(); return { n: d.n, xf, v, sites: J(d.frags.map((f) => f.sitePos)) }; };
    const eF = await deb(F, 503), eN = await deb(Fn, 503), eO = await deb(F, 501);
    // G7 found that the same fragments in the same places could not see a nudge in the fracture: 1e-5 m moves the sites too little to move a
    // triangle. The sites themselves are compared now, F's and F''s, against the seed's own unnudged fracture.
    const own = J(L.fragmentsOf(L.DEBRIS[1], 503).map((f) => f.sitePos));
    ok("!! F and F' break the blob the same way -- the very same sites, the seed's own fracture, so the same fragments in the same places -- and F' only throws them from an impact 1e-5 m away; another seed breaks it differently",
        eF.sites === own && eN.sites === own && eF.n === eN.n && J(eF.xf) === J(eN.xf) && J(eF.v) !== J(eN.v) && eF.v.every((x, k) => near(x, eN.v[k], 1e-3)) && (eO.n !== eF.n || J(eO.xf) !== J(eF.xf)), `${eF.n} fragments`);
    const sc = await L.settingControl();
    ok("!! C-setting on real Jolt: with D the 21 ragdoll parts and every fragment take the step, the wall's 42 cubes have the setting but are skipped, the grounds have none; with F no body has a setting",
        sc.ok && sc.stepping.A === 21 && sc.stepping.wall === 42 && sc.stepping.D1 === 16 && sc.stepping.D2 > 0, J(sc.stepping));
    const asTrue = await (async () => { const J0 = await L.jolt(); return L.settingControl({ makeWorld: () => { const w = J0.createWorld({ gravity: [0, -9.8, 0] }); return new Proxy(w, { get(t, k) {
        if (k === "addBox") return (o) => t.addBox({ ...o, gyroscopic: o.gyroscopic === false ? false : true }); const v = t[k]; return typeof v === "function" ? v.bind(t) : v; } }); } }); })();
    ok("!! C-setting can fail: handed worlds that give the scenes' bodies Jolt's own force in place of the default, it refuses", asTrue.ok === false);
    const fa = await L.arenaFlight(501, D, { addedT: 0.5, flungT: 0.5 }), fd = await L.debrisFlight(L.DEBRIS[0], 501, D, { T: 0.5 });
    ok("!! one short flight of each kind reports its statistics: A1's rest time, height, cohesion and end; A2's broken joints, cohesion, gone and peaks -- the fling far faster than the drop, and into the wall; the debris' rest time, spread, height, gone and peak",
        ["restTime", "height", "cohesion", "gone", "finite", "end"].every((k) => k in fa.A1) && ["broken", "cohesion", "gone", "peakSpeed", "peakSpin", "finite", "end"].every((k) => k in fa.A2) &&
        fa.A2.peakSpeed > 50 && fa.A2.broken > 0 && fa.A1.finite && fa.A2.finite && fa.A1.end !== fa.A2.end && ["fragments", "restTime", "spread", "height", "gone", "peakSpeed", "finite", "end"].every((k) => k in fd) && fd.fragments === L.fragmentsOf(L.DEBRIS[0], 501).length,
        `fling peak ${fa.A2.peakSpeed.toFixed(0)} m/s`);
} catch (e) { guard(3, e); }

console.log("\n4. THE ROUND ON A MINIATURE (seeds 1001 and 1002, half a second of each window)");
try {
    const mini = { seeds: [1001, 1002], addedT: 0.5, flungT: 0.5, debrisT: 0.5 }, r = await L.run(mini), tests = r.tests || {};
    ok("!! the round runs C-page and C-setting, every scene with each setting on every seed, then C-determinism on its first seed and the readings -- and says it is not the registered run",
        r.registered === false && !r.stopped && r.page.ok && r.setting.ok && !!r.flights && ["A", "D1", "D2"].every((s) => r.flights[s].length === 2 && r.flights[s].every((row) => L.SETTINGS.every((st) => !!row[st.id]))) &&
        r.determinism.ok === true && r.determinism.seed === 1001 && r.determinism.flights === 9, r.stopped || "");
    ok("!! every statistic of every scene is read D against F and F' against F, with its medians, the primary ones marked; and each scene counts what the nudge changed, what settled, held, stayed finite and left",
        Object.keys(L.STATS).every((s) => !!tests[s] && L.STATS[s].every((k) => { const t = tests[s].stats[k]; return t && t.primary === L.PRIMARY[s].includes(k) && "p" in t.default && "p" in t.chaos && "D" in t.median && "F'" in t.median; }) &&
            tests[s].seeds === 2 && Number.isInteger(tests[s].nudged) && !!tests[s].finite && !!tests[s].gone) &&
        !!tests.A1.settled && !!tests.D1.settled && !!tests.A1.held && !!tests.A2.held && !tests.A2.settled);
    const A = r.flights.A[0], sameOf = (x, y) => J(x) === J(y);
    ok("!! the readings are the flights': the sign test on A2's broken joints and the rest-time medians, recomputed here from the miniature's own flights",
        sameOf(tests.A2.stats.broken.default, L.signTest(r.flights.A.map((x) => x.D.A2.broken), r.flights.A.map((x) => x.F.A2.broken))) &&
        tests.D1.stats.restTime.median.F === L.median(r.flights.D1.map((x) => x.F.restTime)) && tests.A1.nudged === r.flights.A.filter((x) => x["F'"].A1.end !== x.F.A1.end).length && !!A.D.A2);
    const stopped = await L.run({ ...mini, page: (f) => fs.readFileSync(path.join(ENG, f), "utf8").replace("fling(dir * 30, 7, 0, 5)", "fling(dir * 20, 7, 0, 5)") });
    ok("!! C-page can stop the round: handed an arena page whose fling changed, it says so and flies nothing", stopped.page.ok === false && /C-page failed/.test(stopped.stopped || "") && !stopped.flights && !stopped.setting);
    const J0 = await L.jolt(), trueWorld = () => { const w = J0.createWorld({ gravity: [0, -9.8, 0] }); return new Proxy(w, { get(t, k) {
        if (k === "addBox") return (o) => t.addBox({ ...o, gyroscopic: o.gyroscopic === false ? false : true }); const v = t[k]; return typeof v === "function" ? v.bind(t) : v; } }); };
    const st2 = await L.run({ ...mini, settingWorld: trueWorld });
    ok("!! C-setting can stop the round: handed worlds whose default bodies have Jolt's own force, it says so and flies nothing", st2.setting && st2.setting.ok === false && /C-setting failed/.test(st2.stopped || "") && !st2.flights);
    const drift = () => J0.createWorld({ gravity: [0, -9.81, 0] });
    const dc = await L.determinismControl(r.flights, { seed: 1001, opts: { arena: { addedT: 0.5, flungT: 0.5 }, debris: { T: 0.5 } }, makeWorld: drift });
    ok("!! C-determinism can tell: flown again in a world whose gravity is 9.81, every flight of the seed is refused, by name", dc.ok === false && dc.off.length === 9 && dc.off.includes("A/D") && dc.off.includes("D2/F'"), J(dc.off.slice(0, 3)));
    const text = L.serialize(r);
    ok("  the results file's text: JSON.parse gives back the result exactly, and every array of numbers sits on one line",
        J(JSON.parse(text)) === J(r) && /"seeds": \[[^\n\]]*\]/.test(text) && /"impact": \[[^\n\]]*\]/.test(text) && !/"seeds": \[\n/.test(text), `${text.length} bytes`);
} catch (e) { guard(4, e); }

console.log("\n5. THE COMMAND (never executed)");
try {
    const cmd = fs.readFileSync(path.join(HERE, "joltScenesRun.mjs"), "utf8"), code = cmd.replace(/\/\/.*$/gm, "");
    const atOpt = code.indexOf("unknown option"), atRefuse = code.indexOf("refuseExisting(results)"), atRun = code.indexOf("await run()");
    ok("!! the command refuses an option it does not know, then a results file that exists, before it runs the round, exiting 2 on either -- and refuseExisting() is the library's",
        atOpt > 0 && atRefuse > atOpt && atRun > atRefuse && /unknown option[^\n]*\); process\.exit\(2\);/.test(code) && /refuseExisting\(results\); if \(refused\) \{ console\.error\([^)]*\); process\.exit\(2\); \}/.test(code) &&
        /never overwritten/.test(L.refuseExisting("/any/r.json", () => true) || "") && L.refuseExisting("/any/r.json", () => false) === null && /from "\.\/joltScenes\.mjs"/.test(code));
    ok("  ...and it prints no score: the result goes to the file through serialize(), and the console says only where",
        !/\.tests\b|\.flights\b|\.reading|\.median|\.page\b|\.setting\b|\.determinism\b/.test(code) && /fs\.writeFileSync\(results, serialize\(result\)\)/.test(code) && /commit it before reading it/.test(code) && (code.match(/console\.log\(/g) || []).length === 1);
} catch (e) { guard(5, e); }

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: the round itself -- the registered run writes physics/mechanics/joltScenesResults.json, committed before it is read, and its verdict becomes section 6.");
process.exitCode = fails ? 1 : 0;
