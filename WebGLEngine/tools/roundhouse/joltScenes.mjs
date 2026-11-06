// WebGLEngine/tools/roundhouse/joltScenes.mjs -- UNNUMBERED (the version is chosen at ship time)
// ---------------------------------------------------------------------------------------------------------------
// THE NEW DEFAULT IN THE ENGINE'S OWN JOLT SCENES, as physics/mechanics/SPINNING_BODY_WIP.md registers its fourth round
// (Keith's pick, 2026-11-03, before shipping). The two shipped scenes whose dynamic Jolt bodies have unequal moments:
//   A  the arena's crew (jolt-arena.html) -- A1 three ragdolls added beside the wall, A2 the same crew flung into it;
//   D1 the avatar shattered (blob-avatar.html) and D2 the herd shattered (blob-herd.html), the blob's Voronoi debris.
// Each on 40 seeds, three times: D the new default (no gyroscopic key), F false on every body (what ships today), and
// F' false nudged by 1e-5 m (the chaos control). Every statistic is read D against F by an exact two-sided sign test.
// The command is joltScenesRun.mjs (it prints no score); the gate is joltScenes-selfcheck.mjs.
"use strict";
import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as SB from "./spinningBody.mjs";
import { createRagdoll } from "../../physics/jolt/joltRagdoll.js";
import { createStructures } from "../../physics/jolt/joltStructures.js";
import { makeSites, fractureMesh, _bounds } from "../../fx/fracture/cellFracture.js";
import { makePhysicsDebris, addGround } from "../../fx/fracture/debrisPhysics.js";
import { makeAvatar } from "../../fx/avatar/blobAvatar.js";
import { makeHerd } from "../../fx/avatar/herd.js";
import { metaField } from "../../fx/avatar/pet.js";
import { marchScalarField } from "../../simulation/MarchingCubes.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
const freeze = (o) => { if (o && typeof o === "object") { for (const v of Object.values(o)) freeze(v); Object.freeze(o); } return o; };
export const REGISTRATION = "physics/mechanics/SPINNING_BODY_WIP.md (the new default in the engine's own Jolt scenes)";
export const DEFAULT_RESULTS = path.join(ENG, "physics", "mechanics", "joltScenesResults.json");
/** The registered seeds (1 to 40), the nudge, the sign test's line and the ragdoll gate's cohesion line. */
export const SEEDS = freeze(Array.from({ length: 40 }, (_, k) => k + 1)), NUDGE = 1e-5, P_LINE = 0.01, HOLD = 2;
/** The three settings, in order. D passes NO gyroscopic key: the loader's own default is what is measured. */
export const SETTINGS = freeze([
    { id: "D", gyroscopic: "default", nudge: 0, label: "the new default: no gyroscopic key, so the wrapper's implicit step" },
    { id: "F", gyroscopic: false, nudge: 0, label: "false on every body: what ships today" },
    { id: "F'", gyroscopic: false, nudge: NUDGE, label: "false, nudged by 1e-5 m: the chaos control" },
]);
/** The arena (jolt-arena.html): its ground strip, its 7 x 6 wall, its crew and their fling, its step; the seed's jitter; the windows. */
export const ARENA = freeze({
    ground: { pos: [0, -0.5, 0], half: [40, 0.5, 0.5] }, wall: { x: 0, y: 0, z: 0, cols: 7, rows: 6, half: 0.5 },
    crew: { n: 3, x0: 3.5, dx: 1.4, y: 1.6, z: 0, scale: 0.85, jitterX: 0.2, raiseY: 0.4 }, fling: { speed: 30, up: 7, spin: 5 },
    dt: 1 / 60, substeps: 2, addedT: 10, flungT: 20, goneY: -5,
});
/** The debris scenes (blob-avatar.html, blob-herd.html): the blob, how it is marched, the fracture, the throw and the ground. */
export const DEBRIS = freeze([
    { id: "D1", page: "blob-avatar.html", herd: null, N: 38, LO: -3.35, HI: 3.35, iso: 1.0, sites: 16, bias: 0.6, impact: [1.2, 0.6, 0], force: 2.6, ground: { y: -1.6, extent: 9 } },
    { id: "D2", page: "blob-herd.html", herd: { n: 5, orbitR: 3.1, separation: 1.35, seed: 7 }, N: 32, LO: -4.4, HI: 4.4, iso: 1.0, sites: 22, bias: 0.5, impact: [0, 0.4, 0], force: 3.0, ground: { y: -2.2, extent: 12 } },
]);
/** The debris pages step at their frame time capped at 1/30 s, one substep; here at 1/60 s. "Gone" is more than 1 m below the ground. */
export const DEBRIS_RUN = freeze({ dt: 1 / 60, substeps: 1, T: 15, goneBelow: 1 });
/** Every statistic of each scene, and the primary ones. The registration lists SEVEN and says "six": the count was a slip, and the seven listed are read. */
export const STATS = freeze({ A1: ["restTime", "height", "cohesion"], A2: ["broken", "cohesion", "gone", "peakSpeed", "peakSpin"],
    D1: ["restTime", "spread", "height", "gone", "peakSpeed"], D2: ["restTime", "spread", "height", "gone", "peakSpeed"] });
export const PRIMARY = freeze({ A1: ["restTime"], A2: ["broken", "cohesion"], D1: ["restTime", "spread"], D2: ["restTime", "spread"] });

// ---- the pieces ---------------------------------------------------------------------------------------------------
/** The seeded stream: a 32-bit linear congruential generator (Numerical Recipes' constants), in [0, 1). */
export function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
/** The end state's fingerprint: the first 16 hex digits of the sha256 of the world's transforms, as Jolt holds them. */
export const fingerprint = (xf) => createHash("sha256").update(Buffer.from(xf.buffer, xf.byteOffset, xf.byteLength)).digest("hex").slice(0, 16);
/** The median, a missing value (none) counting as later than any; none when the median itself is. */
export function median(xs) { const s = xs.map((x) => (x === null ? Infinity : x)).sort((a, b) => a - b), n = s.length; if (!n) return null;
    const m = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; return Number.isFinite(m) ? m : null; }
/**
 * THE READING: an exact two-sided sign test of `a` against `b`, seed by seed. A pair that is equal is set aside; none counts
 * as later than any number. p = min(1, 2 P(X <= min(up, down))) for X binomial(n, 1/2). Below the line it "changes" the
 * statistic, upward or downward; otherwise "no change".
 */
export function signTest(a, b, line = P_LINE) {
    let up = 0, down = 0;
    for (let k = 0; k < a.length; k++) { const x = a[k] === null ? Infinity : a[k], y = b[k] === null ? Infinity : b[k]; if (x > y) up++; else if (x < y) down++; }
    const n = up + down, lo = Math.min(up, down);
    let term = Math.pow(0.5, n), cum = 0;   // P(X = 0), then P(X = i + 1) = P(X = i) (n - i) / (i + 1)
    for (let i = 0; i <= lo; i++) { cum += term; term *= (n - i) / (i + 1); }
    const p = n === 0 ? 1 : Math.min(1, 2 * cum);
    return { up, down, ties: a.length - n, p, reading: p < line ? (up > down ? "changes it upward" : "changes it downward") : "no change" };
}
/** The rest time from a per-step "all asleep" trace: the time from which every body stays asleep to the end; none if not asleep at the end. */
export function restTimeOf(asleep, dt) { let at = null; for (let n = 0; n < asleep.length; n++) { if (asleep[n]) { if (at === null) at = (n + 1) * dt; } else at = null; } return at; }
/** The spread: the RMS horizontal (x, z) distance of the points from their centroid. */
export function spreadOf(ps) { const cx = ps.reduce((s, p) => s + p[0], 0) / ps.length, cz = ps.reduce((s, p) => s + p[2], 0) / ps.length;
    return Math.sqrt(ps.reduce((s, p) => s + (p[0] - cx) ** 2 + (p[2] - cz) ** 2, 0) / ps.length); }

let _jolt = null;
/** Jolt through ITS OWN loader -- never physics/backend.js's selectBackend(), which falls back without a word. */
export async function jolt() { if (!_jolt) { const { createJoltBackend } = await import("../../physics/jolt/joltLoader.js"); _jolt = await createJoltBackend(); } return _jolt; }
/** A world for a setting: D hands addBox no gyroscopic key (the loader's default); F and F' hand false to EVERY body, the modules' too. */
export async function worldOf(setting, { makeWorld = null } = {}) {
    const w = makeWorld ? makeWorld() : (await jolt()).createWorld({ gravity: [0, -9.8, 0] });
    if (setting.gyroscopic === "default") return w;
    return new Proxy(w, { get(t, k) {
        if (k === "addBox") return (o) => t.addBox({ ...o, gyroscopic: setting.gyroscopic });
        const v = t[k]; return typeof v === "function" ? v.bind(t) : v; } });
}
const awakeAny = (w, idxs) => { const bi = w.raw().bi; return idxs.some((i) => bi.IsActive(w.bodies[i].id)); };
/** Each body's setting and whether it holds an inertia for the step (C-setting reads it). */
const settingsOf = (w, idxs) => idxs.map((i) => [w.gyroscopicOf(i), w.bodies[i].I !== null]);

// ---- the scenes ---------------------------------------------------------------------------------------------------
/** The arena as the page builds it: its ground, its wall, and its three crew moved by the seed (F' moves the first one 1e-5 m more). */
export function buildArena(w, seed, setting) {
    const A = ARENA, r = rng(seed), ground = w.addBox({ type: "static", pos: [...A.ground.pos], half: [...A.ground.half] });
    const S = createStructures(w), wall = S.addWall({ ...A.wall }), rags = [];
    for (let k = 0; k < A.crew.n; k++) {
        const jx = (r() - 0.5) * 2 * A.crew.jitterX, ry = r() * A.crew.raiseY;
        rags.push(createRagdoll(w, { x: A.crew.x0 + k * A.crew.dx + jx + (k === 0 ? setting.nudge : 0), y: A.crew.y + ry, z: A.crew.z, scale: A.crew.scale }));
    }
    return { S, wall: wall.idxs, rags, parts: rags.flatMap((g) => g.idxs()), ground };
}
const _meshes = new Map();
/** The page's blob, marched as the page marches it, and the same for every seed: the avatar's rest pose, and for D2 its herd. */
export function meshOf(scene) {
    if (_meshes.has(scene.id)) return _meshes.get(scene.id);
    const avatar = makeAvatar({ _now: () => 0 }).step(0), h = scene.herd;
    const balls = h ? avatar.concat(makeHerd({ n: h.n, orbitR: h.orbitR, separation: h.separation, rng: rng(h.seed), _now: () => 0 }).allBalls()) : avatar;
    const { N, LO, HI } = scene, span = HI - LO, f = new Float32Array(N * N * N);
    for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) f[(z * N + y) * N + x] = metaField(balls, LO + (span * x) / (N - 1), LO + (span * y) / (N - 1), LO + (span * z) / (N - 1));
    const mesh = marchScalarField(f, N, N, N, scene.iso, { origin: [LO, LO, LO], cellSize: span / (N - 1) });
    _meshes.set(scene.id, mesh); return mesh;
}
/** The seed's fracture of the blob: its sites biased toward the page's impact -- never nudged, so F' breaks the blob as F does. */
export function fragmentsOf(scene, seed) { const mesh = meshOf(scene); return fractureMesh(mesh, makeSites(_bounds(mesh.positions), scene.sites, { impact: [...scene.impact], bias: scene.bias, rng: rng(100 + seed) })); }
/** The debris as the page throws it (F' throws it from an impact 1e-5 m away), onto the page's ground. */
export function buildDebris(w, scene, seed, setting) {
    const ground = addGround(w, { ...scene.ground }), frags = fragmentsOf(scene, seed), from = [scene.impact[0] + setting.nudge, scene.impact[1], scene.impact[2]];
    const bodies = makePhysicsDebris(w, frags, from, { force: scene.force, rng: rng(200 + seed) });
    return { idxs: bodies.map((b) => b.idx), ground, n: frags.length, frags };   // frags: so a gate can see the fracture itself
}

// ---- the flights ----------------------------------------------------------------------------------------------------
/** A1 then A2 on one seed and setting: the crew added for `addedT`, then flung as the page flings them for `flungT`. */
export async function arenaFlight(seed, setting, { addedT = ARENA.addedT, flungT = ARENA.flungT, makeWorld = null } = {}) {
    const A = ARENA, w = await worldOf(setting, { makeWorld }), sc = buildArena(w, seed, setting), { S, rags, parts } = sc;
    const cohesion = () => Math.max(...rags.map((g) => g.cohesion()));
    const asleep = [], n1 = Math.round(addedT / A.dt); let coh = 0;
    for (let n = 0; n < n1; n++) { w.step(A.dt, A.substeps); S.update(); coh = Math.max(coh, cohesion()); asleep.push(!awakeAny(w, parts)); }
    const x1 = w.readTransforms();
    // `gone` is P5's, not a registered statistic of A1: the parts below A2's line at A1's end
    const a1 = { restTime: restTimeOf(asleep, A.dt), height: parts.reduce((s, i) => s + x1[i * 7 + 1], 0) / parts.length, cohesion: coh, gone: parts.filter((i) => x1[i * 7 + 1] < A.goneY).length,
                 finite: x1.every(Number.isFinite), end: fingerprint(x1) };
    for (const g of rags) { const c = g.center(); g.fling((c[0] >= 0 ? -1 : 1) * A.fling.speed, A.fling.up, 0, A.fling.spin); }
    const n2 = Math.round(flungT / A.dt); let coh2 = 0, peakSpeed = 0, peakSpin = 0;
    for (let n = 0; n < n2; n++) {
        w.step(A.dt, A.substeps); S.update(); coh2 = Math.max(coh2, cohesion());
        const v = w.readVelocities(), av = w.readAngularVelocities();
        for (const i of parts) { peakSpeed = Math.max(peakSpeed, Math.hypot(v[i * 3], v[i * 3 + 1], v[i * 3 + 2])); peakSpin = Math.max(peakSpin, Math.hypot(av[i * 3], av[i * 3 + 1], av[i * 3 + 2])); }
    }
    const x2 = w.readTransforms();
    const a2 = { broken: S.brokenCount(), cohesion: coh2, gone: parts.filter((i) => x2[i * 7 + 1] < A.goneY).length, peakSpeed, peakSpin, finite: x2.every(Number.isFinite), end: fingerprint(x2) };
    w.destroy();
    return { A1: a1, A2: a2 };
}
/** One debris scene on one seed and setting, for T seconds. */
export async function debrisFlight(scene, seed, setting, { T = DEBRIS_RUN.T, makeWorld = null } = {}) {
    const R = DEBRIS_RUN, w = await worldOf(setting, { makeWorld }), { idxs, n } = buildDebris(w, scene, seed, setting);
    const asleep = [], steps = Math.round(T / R.dt); let peakSpeed = 0;
    for (let k = 0; k < steps; k++) {
        w.step(R.dt, R.substeps); asleep.push(!awakeAny(w, idxs));
        const v = w.readVelocities(); for (const i of idxs) peakSpeed = Math.max(peakSpeed, Math.hypot(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]));
    }
    const xf = w.readTransforms(), ps = idxs.map((i) => [xf[i * 7], xf[i * 7 + 1], xf[i * 7 + 2]]);
    const out = { fragments: n, restTime: restTimeOf(asleep, R.dt), spread: spreadOf(ps), height: ps.reduce((s, p) => s + p[1], 0) / ps.length,
                  gone: ps.filter((p) => p[1] < scene.ground.y - R.goneBelow).length, peakSpeed, finite: xf.every(Number.isFinite), end: fingerprint(xf) };
    w.destroy();
    return out;
}

// ---- the controls -------------------------------------------------------------------------------------------------
/** C-PAGE: the scenes' numbers, read from the pages' own source. `read` lets a gate hand in an edited page to see it refused. */
export function pageControl({ read = (f) => fs.readFileSync(path.join(ENG, f), "utf8") } = {}) {
    const want = {
        "jolt-arena.html": [/world\.addBox\(\{ type: "static", pos: \[0, -0\.5, 0\], half: \[40, 0\.5, 0\.5\] \}\);\s+\/\/ ground/, /S\.addWall\(\{ x: 0, y: 0, z: 0, cols: 7, rows: 6, half: 0\.5 \}\)/,
            /for \(let k = 0; k < 3; k\+\+\) ragdolls\.push\(createRagdoll\(world, \{ x: 3\.5 \+ k \* 1\.4, y: 1\.6, z: 0, scale: 0\.85 \}\)\)/,
            /const dir = c\[0\] >= 0 \? -1 : 1; rag\.fling\(dir \* 30, 7, 0, 5\);/, /world\.step\(1 \/ 60, 2\); S\.update\(\);/, /createWorld\(\{ gravity: \[0, -9\.8, 0\] \}\)/],
        "blob-avatar.html": [/makeSites\(_bounds\(lastMesh\.positions\), 16, \{ impact, bias: 0\.6 \}\)/, /addGround\(pWorld, \{ y: -1\.6, extent: 9 \}\)/,
            /makePhysicsDebris\(pWorld, frags, impact, \{ force: 2\.6 \}\)/, /shatter\(threats\.length \? threats\[0\]\.p : \[1\.2, 0\.6, 0\]\)/,
            /const N = 38, LO = -3\.35, HI = 3\.35,/, /marchScalarField\(field, N, N, N, 1\.0, \{ origin: \[LO, LO, LO\], cellSize: cell \}\)/,
            /selectBackend\(\{ prefer: "jolt" \}\)/, /pWorld\.step\(Math\.min\(dt, 1 \/ 30\), 1\)/, /createWorld\(\{ gravity: \[0, -9\.8, 0\] \}\)/],
        "blob-herd.html": [/const impact = \[0, 0\.4, 0\];/, /makeSites\(_bounds\(lastMesh\.positions\), 22, \{ impact, bias: 0\.5 \}\)/, /addGround\(pWorld, \{ y: -2\.2, extent: 12 \}\)/,
            /makePhysicsDebris\(pWorld, frags, impact, \{ force: 3\.0 \}\)/, /const N = 32, LO = -4\.4, HI = 4\.4,/, /marchScalarField\(buildField\(all\), N, N, N, 1\.0, \{ origin: \[LO, LO, LO\], cellSize: cell \}\)/,
            /let herdN = 5, herd = makeHerd\(\{ n: herdN, orbitR: 3\.1, separation: 1\.35 \}\);/, /selectBackend\(\{ prefer: "jolt" \}\)/, /pWorld\.step\(Math\.min\(dt, 1 \/ 30\), 1\)/,
            /createWorld\(\{ gravity: \[0, -9\.8, 0\] \}\)/],
    };
    const missing = [];
    for (const [f, res] of Object.entries(want)) { const src = read(f); res.forEach((re, k) => { if (!re.test(src)) missing.push(`${f}#${k}`); }); }
    return { ok: missing.length === 0, checked: Object.values(want).reduce((s, r) => s + r.length, 0), missing };
}
/**
 * C-SETTING: each scene built on seed 1 (nothing stepped) with D and with F. With D every ragdoll part and fragment has "implicit" and an
 * inertia for the step, the wall's cubes "implicit" and none, the ground false; with F no body has a setting. Counts the bodies that take the step.
 */
export async function settingControl({ makeWorld = null } = {}) {
    const [D, F] = SETTINGS, out = {}, every = (xs, s, I) => xs.every(([g, i]) => g === s && i === I);
    for (const st of [D, F]) {
        const w = await worldOf(st, { makeWorld }), a = buildArena(w, 1, st);
        const parts = settingsOf(w, a.parts), wall = settingsOf(w, a.wall), ground = settingsOf(w, [a.ground]); w.destroy();
        const deb = [];
        for (const sc of DEBRIS) { const v = await worldOf(st, { makeWorld }), d = buildDebris(v, sc, 1, st); deb.push({ id: sc.id, frags: settingsOf(v, d.idxs), ground: settingsOf(v, [d.ground]) }); v.destroy(); }
        out[st.id] = { parts, wall, ground, debris: deb };
    }
    const d = out.D, f = out.F;
    const ok = every(d.parts, "implicit", true) && every(d.wall, "implicit", false) && every(d.ground, false, false) && d.debris.every((x) => every(x.frags, "implicit", true) && every(x.ground, false, false)) &&
               every([...f.parts, ...f.wall, ...f.ground], false, false) && f.debris.every((x) => every([...x.frags, ...x.ground], false, false));
    return { ok, stepping: { A: d.parts.filter(([, i]) => i).length, wall: d.wall.length, D1: d.debris[0].frags.length, D2: d.debris[1].frags.length } };
}
/** C-DETERMINISM: seed `seed` of every scene flown again with each setting, against the run's own flights, to the bit. */
export async function determinismControl(flights, { seed = 1, opts = {}, makeWorld = null } = {}) {
    const off = [];
    for (const st of SETTINGS) {
        const a = await arenaFlight(seed, st, { ...opts.arena, makeWorld }), was = flights.A.find((r) => r.seed === seed)[st.id];
        if (JSON.stringify(a) !== JSON.stringify(was)) off.push(`A/${st.id}`);
        for (const sc of DEBRIS) { const d = await debrisFlight(sc, seed, st, { ...opts.debris, makeWorld }), dw = flights[sc.id].find((r) => r.seed === seed)[st.id];
            if (JSON.stringify(d) !== JSON.stringify(dw)) off.push(`${sc.id}/${st.id}`); }
    }
    return { ok: off.length === 0, seed, flights: SETTINGS.length * (1 + DEBRIS.length), off };
}

// ---- the readings --------------------------------------------------------------------------------------------------
/** Each scene's statistics read: D against F and F' against F (C-chaos), the medians, and how many seeds the nudge changed at all. */
export function testsOf(flights) {
    const out = {};
    for (const scene of Object.keys(STATS)) {
        const rows = (scene[0] === "A" ? flights.A : flights[scene]).map((r) => { const o = {}; for (const st of SETTINGS) o[st.id] = scene[0] === "A" ? r[st.id][scene] : r[st.id]; return o; });
        const t = { stats: {}, nudged: rows.filter((r) => r["F'"].end !== r.F.end).length, seeds: rows.length };
        for (const s of STATS[scene]) {
            const col = (id) => rows.map((r) => r[id][s]);
            t.stats[s] = { primary: PRIMARY[scene].includes(s), default: signTest(col("D"), col("F")), chaos: signTest(col("F'"), col("F")), median: { D: median(col("D")), F: median(col("F")), "F'": median(col("F'")) } };
        }
        if (STATS[scene].includes("restTime")) t.settled = Object.fromEntries(SETTINGS.map((st) => [st.id, rows.filter((r) => r[st.id].restTime !== null).length]));
        if (STATS[scene].includes("cohesion")) t.held = Object.fromEntries(SETTINGS.map((st) => [st.id, rows.filter((r) => r[st.id].cohesion < HOLD).length]));
        t.finite = Object.fromEntries(SETTINGS.map((st) => [st.id, rows.filter((r) => r[st.id].finite).length]));
        t.gone = Object.fromEntries(SETTINGS.map((st) => [st.id, rows.reduce((s, r) => s + (r[st.id].gone ?? 0), 0)]));
        out[scene] = t;
    }
    return out;
}

/**
 * THE ROUND. C-page and C-setting first (the scenes are the pages', and the default reaches their bodies), then every seed of every
 * scene with each setting, then C-determinism, then the readings. `opts.seeds`, `opts.addedT`, `opts.flungT` and `opts.debrisT`
 * replace the registered ones for a gate's miniature; `opts.page` hands C-page an edited page.
 */
export async function run(opts = {}) {
    const seeds = opts.seeds ?? SEEDS, addedT = opts.addedT ?? ARENA.addedT, flungT = opts.flungT ?? ARENA.flungT, debrisT = opts.debrisT ?? DEBRIS_RUN.T;
    const result = { registration: REGISTRATION, seeds: [...seeds], nudge: NUDGE, pLine: P_LINE, hold: HOLD, settings: SETTINGS.map((s) => ({ ...s })), arena: JSON.parse(JSON.stringify(ARENA)),
        debris: JSON.parse(JSON.stringify(DEBRIS)), debrisRun: { ...DEBRIS_RUN }, stats: JSON.parse(JSON.stringify(STATS)), primary: JSON.parse(JSON.stringify(PRIMARY)), at: new Date().toISOString(),
        registered: JSON.stringify(seeds) === JSON.stringify(SEEDS) && addedT === ARENA.addedT && flungT === ARENA.flungT && debrisT === DEBRIS_RUN.T, addedT, flungT, debrisT };
    result.page = pageControl(opts.page ? { read: opts.page } : {});
    if (!result.page.ok) { result.stopped = "C-page failed: a scene's numbers are not its page's"; return result; }
    result.setting = await settingControl(opts.settingWorld ? { makeWorld: opts.settingWorld } : {});
    if (!result.setting.ok) { result.stopped = "C-setting failed: the default does not reach the scenes' bodies as registered"; return result; }
    result.flights = { A: [], D1: [], D2: [] };
    for (const seed of seeds) { const row = { seed }; for (const st of SETTINGS) row[st.id] = await arenaFlight(seed, st, { addedT, flungT }); result.flights.A.push(row); }
    for (const sc of DEBRIS) for (const seed of seeds) { const row = { seed }; for (const st of SETTINGS) row[st.id] = await debrisFlight(sc, seed, st, { T: debrisT }); result.flights[sc.id].push(row); }
    result.determinism = await determinismControl(result.flights, { seed: seeds[0], opts: { arena: { addedT, flungT }, debris: { T: debrisT } }, makeWorld: opts.againWorld || null });
    result.tests = testsOf(result.flights);
    return result;
}

/** The results file's text: the spinning body's format. */
export const serialize = SB.serialize;
/** The command's first act: refuse a results file that exists. */
export const refuseExisting = SB.refuseExisting;
