// WebGLEngine/brain/flyEscapeShow.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// WATCH THE FLY ESCAPE, IN 3D AND THROUGH ITS OWN EYES (Keith, 2026-11-15: "We do need to be able to watch the fly in 3d and also be able to see through fly eyes"). One episode of
// brain/rl/escapeEnv.mjs, kept tick by tick, and two pictures of any tick. Nothing here trains and nothing here measures: the escape rounds did that (tools/ship/flyEscape.mjs and
// tools/ship/flyEscapeReflex.mjs), and this file plays their flies -- the same environment, the same episodes, the weights read from the rounds' own committed results.
//
// THE FLIES (KINDS). Five need no file: the four written by hand (brain/rl/escapeEnv.mjs RULES: freeze, hide, fleeAll, reflex) and `told`, which is told each mover's kind. Five are a round's
// trained arm (FLY, SHUF, PLAIN, FISH, MLP), draw 1 to 16, whose weights are the record's in that round's results file (ROUNDS). Round 5 has its own four flies (VISION_ARMS), round 6 its own
// three (DEGREE_ARMS) on its own draws, 17 to 48, round 7 its own five (SPLIT_ARMS) on draws 49 to 80, and round 8 two of those
// (FIBRES_ARMS) on draws 81 to 208 (drawsOf).
//
// THE PICTURES ARE RAY-CAST FROM THE EPISODE'S OWN VOXELS: a ray a pixel, through the house's blocks (the plan's cells, the same the environment stamped into its world), the ground, the mover (a
// sphere of the environment's radius at the height of the fly's eye) and, in the outside view, the fly. No GPU: the page is to open anywhere, and the gate holds the pictures without a browser.
//   view3d(ep, k, cam, w, h)   from a camera that orbits the site: { az, el, dist } (radians, cells)
//   eyeView(ep, k, w, h)       FROM THE FLY'S EYE, ALL THE WAY ROUND: a column of the picture is a bearing (the middle is straight ahead, the two edges are behind), a row an elevation
//                              (EYE_ELEV: 30 degrees below the horizon to 60 above). A fly's two eyes see nearly the whole sphere at once, coarsely; this is that, one lens a pixel.
//                              THE MOVER'S DISC IN THIS PICTURE IS WHAT THE ENVIRONMENT CALLS ITS ANGULAR SIZE, and how fast it grows is the looming rate.
// Both return { width, height, data (RGBA bytes), hash }.
//
//   ROUNDS, KINDS, ARMS, LABELS, COLOURS, CAM, EYE_ELEV, EYE_HEIGHT; armsOf(round), drawsOf(round)
//   policyFor(round, arm, s)                 that round's untrained fly of an arm and a draw (tools/ship/flyEscape.mjs's policyOf, which a page cannot load: it reads files)
//   flyOf(kind, { round, draw, record })     { kind, round, draw, act(obs, env) }
//   episode(fly, seed, opts)                 { seed, plan, food, frames: [{ t, x, z, heading, home, inRoom, atFood, fed, mover, obs }], ticks, ret, caught, fed, log, hash }
//   saidLines()                              what the page says the pictures are and are not
// Pure: no I/O, no clock, no Math.random.
"use strict";
import { EscapeEnv, RULES, OBS_DIM, ACT_DIM, MAX_STEPS, YARD, YARD_LO, BIRD_RADIUS } from "./rl/escapeEnv.mjs";
import { SITE, LAYERS, BLOCKS } from "./rl/buildEnv.mjs";
import { FlightPolicy } from "./rl/dockPolicy.js";
import * as P from "./rl/paintCircuitPolicy.mjs";
import { ReflexStart } from "./rl/reflexStart.mjs";
import { CarryCircuitPolicy } from "./rl/carryCircuit.mjs";
import { MaskedCircuitPolicy } from "./rl/maskedCircuitPolicy.mjs";
import { degreeShuffle } from "./rl/degreeShuffle.mjs";
import { inShuffle, outShuffle, keepOnto } from "./rl/splitShuffle.mjs";
import * as GFT from "./gfVisualTopology.mjs";
import { unpackWeights, recordsOf } from "./voxelHomeShow.mjs";

export { unpackWeights, recordsOf };
export const ROUNDS = Object.freeze({
    1: Object.freeze({ file: "brain/flyEscapeRound.jsonl", label: "round 1: trained from nothing (they hide)" }),
    2: Object.freeze({ file: "brain/flyEscapeReflexRound.jsonl", start: "reflex", label: "round 2: started at the reflex" }),
    3: Object.freeze({ file: "brain/flyEscapeFreshRound.jsonl", start: "reflex", label: "round 3: started at the reflex, trained on fresh episodes (the best flies)" }),   // 2026-11-16: the same flies, a trainer whose episodes change (tools/ship/flyEscapeFresh.mjs)
    4: Object.freeze({ file: "brain/flyEscapeMemoryRound.jsonl", start: "reflex", memory: true, label: "round 4: round 3 with memory between ticks (no MLP)" }),   // 2026-11-16: brain/rl/carryCircuit.mjs; the MLP has nothing to carry and is not in the round   // 2026-11-15: the fly is half the reflex plus its network (brain/rl/reflexStart.mjs)
    5: Object.freeze({ file: "brain/flyEscapeVisionRound.jsonl", start: "reflex", vision: true, label: "round 5: the real Giant Fiber circuit, seeing only size and looming (its own four flies)" }),   // 2026-11-16: tools/ship/flyEscapeVision.mjs
    6: Object.freeze({ file: "brain/flyEscapeDegreeRound.jsonl", start: "reflex", vision: true, degree: true, draws: Object.freeze([17, 48]), label: "round 6: the real circuit, a shuffle that keeps every cell's counts, and a free shuffle (draws 17 to 48)" }),   // 2026-11-16: tools/ship/flyEscapeDegree.mjs
    7: Object.freeze({ file: "brain/flyEscapeSplitRound.jsonl", start: "reflex", vision: true, split: true, draws: Object.freeze([49, 80]), label: "round 7: five shuffles, each keeping one part of the counts (draws 49 to 80)" }),   // 2026-11-16: tools/ship/flyEscapeSplit.mjs
    8: Object.freeze({ file: "brain/flyEscapeFibresRound.jsonl", start: "reflex", vision: true, fibres: true, draws: Object.freeze([81, 208]), label: "round 8: the Giant Fibers' own inputs kept, against a free shuffle (draws 81 to 208)" }),   // 2026-11-17: tools/ship/flyEscapeFibres.mjs
});
export const ARMS = Object.freeze(["FLY", "SHUF", "PLAIN", "FISH", "MLP"]);
// Round 5's arms (tools/ship/flyEscapeVision.mjs, which a page cannot load): the 42 real cells of brain/gfVisualTopology.mjs, the looming rate (number 2) into each LC4 cell and the size (number 1) into
// each LPLC2 cell, read from the two Giant Fibers; a connection starts at 0.01 x its synapse count; a shuffle puts the same strengths in shuffledEdges(42, 369, 7000 + the draw)'s places.
export const VISION_ARMS = Object.freeze(["GF", "GSHUF", "FREE", "GNONE"]), VISION = Object.freeze({ size: 1, loom: 2, freeUnits: 113, shuffleSeed: 7000, gain: 0.01 });
// Round 6's arms (tools/ship/flyEscapeDegree.mjs): round 5's GF and GSHUF, and GDEG, whose connections are brain/rl/degreeShuffle.mjs's shuffle of the real ones by DEGREE_SEED + the draw.
export const DEGREE_ARMS = Object.freeze(["GF", "GDEG", "GSHUF"]), DEGREE_SEED = 9000;
// Round 7's arms (tools/ship/flyEscapeSplit.mjs): GDEG and GSHUF again, and three shuffles of brain/rl/splitShuffle.mjs by their own seed + the draw: GIN keeps each connection's target, GOUT its
// source, GGF the 42 real connections onto the two Giant Fibers.
// Round 8's two arms (tools/ship/flyEscapeFibres.mjs) are round 7's GGF and GSHUF, built the same way, on draws 81 to 208.
export const FIBRES_ARMS = Object.freeze(["GGF", "GSHUF"]);
export const SPLIT_ARMS = Object.freeze(["GDEG", "GIN", "GOUT", "GGF", "GSHUF"]), SPLIT_SEEDS = Object.freeze({ GIN: 11000, GOUT: 12000, GGF: 13000 });
/** The arms a round's flies come from. */
export const armsOf = (round) => { const R = ROUNDS[round]; if (!R) throw new Error(`flyEscapeShow: no round ${round} (the rounds are ${Object.keys(ROUNDS).join(", ")})`); return R.fibres ? FIBRES_ARMS : R.split ? SPLIT_ARMS : R.degree ? DEGREE_ARMS : R.vision ? VISION_ARMS : R.memory ? ARMS.filter((a) => a !== "MLP") : ARMS; };
/** The first and the last draw a round's flies have: 1 to 16 unless the round says its own. */
export const drawsOf = (round) => { const R = ROUNDS[round]; if (!R) throw new Error(`flyEscapeShow: no round ${round} (the rounds are ${Object.keys(ROUNDS).join(", ")})`); return R.draws ? [...R.draws] : [1, DRAWS]; };
function visionPolicy(arm, s) {
    const inputs = [...GFT.LC4.map((u) => [u, VISION.loom]), ...GFT.LPLC2.map((u) => [u, VISION.size])], units = GFT.NEURON_ORDER.length, start = GFT.SYNAPSES.map((n) => n * VISION.gain), out = [...GFT.GF];
    if (arm === "FREE") return new MaskedCircuitPolicy({ obsDim: OBS_DIM, units: VISION.freeUnits, inputs: Array.from({ length: VISION.freeUnits }, (_, u) => [[u, VISION.loom], [u, VISION.size]]).flat(), edges: [], outputs: Array.from({ length: VISION.freeUnits }, (_, u) => u), seed: s });
    if (arm === "GNONE") return new MaskedCircuitPolicy({ obsDim: OBS_DIM, units, inputs, edges: [], outputs: out, seed: s });
    const real = GFT.EDGES.map((e) => [e[0], e[1]]);
    return new MaskedCircuitPolicy({ obsDim: OBS_DIM, units, inputs, edges: arm === "GF" ? real : arm === "GDEG" ? degreeShuffle(real, DEGREE_SEED + s) : arm === "GIN" ? inShuffle(real, units, SPLIT_SEEDS.GIN + s) : arm === "GOUT" ? outShuffle(real, units, SPLIT_SEEDS.GOUT + s) : arm === "GGF" ? keepOnto(real, units, out, SPLIT_SEEDS.GGF + s) : P.shuffledEdges(units, GFT.EDGES.length, VISION.shuffleSeed + s), outputs: out, edgeStart: start, seed: s });
}
export const KINDS = Object.freeze(["reflex", "fleeAll", "hide", "freeze", "told", ...ARMS, ...VISION_ARMS, "GDEG", "GIN", "GOUT", "GGF"]);
export const LABELS = Object.freeze({ reflex: "written by hand: the reflex (looms on a steady bearing)", fleeAll: "written by hand: flees from everything", hide: "written by hand: never leaves home", freeze: "written by hand: never flees",
    told: "told which movers are strikes", FLY: "trained: the fly's wiring", SHUF: "trained: the fly's wiring, shuffled", PLAIN: "trained: a plain net of its size", FISH: "trained: the fish's wiring", MLP: "trained: a small standard net",
    GF: "rounds 5 and 6: the real Giant Fiber circuit (42 cells)", GSHUF: "rounds 5 to 7: the same cells, connections shuffled freely", GDEG: "rounds 6 and 7: the same cells, shuffled keeping every cell's counts",
    GIN: "round 7: shuffled keeping what each cell receives", GOUT: "round 7: shuffled keeping what each cell sends", GGF: "round 7: shuffled, but the two Giant Fibers keep their real inputs", FREE: "round 5: a free net on the same two numbers", GNONE: "round 5: the cells with no connections (stays the reflex)" });
export const CLOCK = 10;   // the observation's eleventh number is the episode's clock (brain/rl/escapeEnv.mjs); a remembering fly forgets when it reads 0
export const DRAWS = 16, PLAIN_UNITS = 55, MLP_HIDDEN = Object.freeze([16, 16]);
export const COLOURS = Object.freeze({ wall: [185, 178, 163], glass: [127, 200, 255], roof: [181, 83, 60], yard: [58, 92, 62], beyond: [34, 52, 38], food: [232, 196, 64], door: [138, 106, 60], sky: [120, 170, 230], horizon: [200, 222, 245],
    fly: [28, 24, 22], strike: [150, 30, 36], pass: [70, 76, 92], mover: [22, 22, 26] });
export const CAM = Object.freeze({ az: 0.9, el: 0.42, dist: 16, fov: 0.9 }), EYE_ELEV = Object.freeze([-Math.PI / 6, Math.PI / 3]), EYE_HEIGHT = 0.6, FLY_RADIUS = 0.22;

/** See the header. */
export function policyFor(round, arm, s) {
    const R = ROUNDS[round]; if (!R) throw new Error(`flyEscapeShow: no round ${round} (the rounds are ${Object.keys(ROUNDS).join(", ")})`);
    if (!armsOf(round).includes(arm)) throw new Error(R.memory && arm === "MLP" ? `flyEscapeShow.policyFor: round ${round} has no MLP (it has nothing to carry between ticks)` : `flyEscapeShow.policyFor: round ${round} has no arm ${arm} (its arms are ${armsOf(round).join(", ")})`);
    const [lo, hi] = drawsOf(round);
    if (!Number.isInteger(s) || s < lo || s > hi) throw new Error(`flyEscapeShow: round ${round} has no draw ${s} (its draws are ${lo} to ${hi})`);
    const started = (inner, under) => (R.start === "reflex" ? new ReflexStart(inner, { rule: RULES.reflex, tail: under + 1 }) : inner);
    if (R.vision) { const inner = visionPolicy(arm, s); return started(inner, inner.out.length); }
    if (arm === "MLP") return started(new FlightPolicy({ hidden: [...MLP_HIDDEN], obsDim: OBS_DIM, actDim: ACT_DIM, seed: s }), MLP_HIDDEN[MLP_HIDDEN.length - 1]);
    const c = arm === "PLAIN" ? { units: PLAIN_UNITS, edges: [] } : P.ARMS[arm](s);
    return started(R.memory ? new CarryCircuitPolicy({ obsDim: OBS_DIM, actDim: ACT_DIM, units: c.units, edges: c.edges, seed: s, clock: CLOCK }) : new P.CircuitPolicy({ obsDim: OBS_DIM, actDim: ACT_DIM, units: c.units, edges: c.edges, seed: s }), c.units);
}
/** See the header. */
export function flyOf(kind, { round = 1, draw = 1, record = null } = {}) {
    if (!KINDS.includes(kind)) throw new Error(`flyEscapeShow.flyOf: no fly ${kind} (the flies are ${KINDS.join(", ")})`);
    if (kind === "told") return { kind, round: null, draw: null, act: (o, env) => [env.mover && env.mover.kind === "strike" ? 1 : -1] };
    if (Object.hasOwn(RULES, kind)) return { kind, round: null, draw: null, act: (o) => RULES[kind](o) };
    const policy = policyFor(round, kind, draw);
    if (!record || record.arm !== kind || record.s !== draw) throw new Error(`flyEscapeShow.flyOf: ${kind} draw ${draw} of round ${round} needs its record from ${ROUNDS[round].file}`);
    const w = unpackWeights(record.weights);
    if (w.length !== policy.getParams().length || w.length !== record.weightCount) throw new Error(`flyEscapeShow.flyOf: ${kind} draw ${draw} of round ${round} has ${w.length} weights, and its fly takes ${policy.getParams().length}`);
    policy.setParams(w);
    return { kind, round, draw, score: record.score, act: (o) => policy.act(o) };
}

/** See the header. One episode on a fresh environment. */
export function episode(fly, seed, { maxSteps = MAX_STEPS } = {}) {
    if (!Number.isInteger(seed) || seed < 1) throw new Error(`flyEscapeShow.episode: the seed is a whole number from 1 (got ${seed})`);
    const env = new EscapeEnv({ maxSteps }), frames = []; let o = env.reset(seed), done = false, ret = 0, heading = 0, h = 0x811c9dc5;
    const p = env.plan, snap = (home) => ({ t: env.t, x: env.x, z: env.z, heading, home, inRoom: env.inRoom(), atFood: env.atFood(), fed: env.fed, caught: env.caught,
        mover: env.mover ? { kind: env.mover.kind, x: env.mover.x, z: env.mover.z } : null, obs: Array.from(o) });
    frames.push(snap(false));
    while (!done) {
        const a = fly.act(o, env), home = Number.isFinite(a[0]) && a[0] > 0, x0 = env.x, z0 = env.z, r = env.step(a);
        if (env.x !== x0 || env.z !== z0) heading = Math.atan2(env.z - z0, env.x - x0);
        o = r.obs; done = r.done; ret += r.reward; frames.push(snap(home));
        h ^= Math.round(env.x * 64) * 131 + Math.round(env.z * 64) * 7 + (home ? 1 : 0) + (env.mover ? 2 : 0); h = Math.imul(h, 0x01000193) >>> 0;
    }
    return { kind: fly.kind, round: fly.round, draw: fly.draw, seed, maxSteps, plan: { w: p.w, d: p.d, hash: p.hash, cells: p.cells.map((c) => ({ x: c.x, y: c.y, z: c.z, id: c.id })), door: p.door.map((c) => ({ x: c.x, y: c.y, z: c.z })) },
        food: [env.food[0], env.food[1]], frames, ticks: frames.length - 1, ret, caught: env.caught, fed: env.fed, log: env.log.slice(), hash: (h >>> 0).toString(16).padStart(8, "0") };
}

// ---- the ray caster ----
const gridOf = (ep) => { if (!ep._grid) { const g = new Uint8Array(SITE * LAYERS * SITE); for (const c of ep.plan.cells) g[(c.y * SITE + c.z) * SITE + c.x] = c.id; Object.defineProperty(ep, "_grid", { value: g }); } return ep._grid; };
const SHADE = Object.freeze({ top: 1, x: 0.8, z: 0.62 });
/** The nearest thing a ray from (ox, oy, oz) along the unit (dx, dy, dz) meets: writes an [r, g, b] into `out`, and returns what it was ("sky", "ground", "block", "mover", "fly"). */
function cast(ep, f, ox, oy, oz, dx, dy, dz, withFly, eye, out) {
    let best = Infinity, what = "sky", r = 0, g = 0, b = 0;
    // the house's blocks: the site's box, then a step a cell
    const grid = gridOf(ep), inv = [dx !== 0 ? 1 / dx : Infinity, dy !== 0 ? 1 / dy : Infinity, dz !== 0 ? 1 / dz : Infinity];
    let t0 = 0, t1 = Infinity; const lo = [0, 0, 0], hi = [SITE, LAYERS, SITE], o = [ox, oy, oz], d = [dx, dy, dz]; let enter = -1;
    for (let a = 0; a < 3; a++) {
        if (d[a] === 0) { if (o[a] < lo[a] || o[a] > hi[a]) { t1 = -1; break; } continue; }
        let ta = (lo[a] - o[a]) * inv[a], tb = (hi[a] - o[a]) * inv[a]; if (ta > tb) { const s = ta; ta = tb; tb = s; }
        if (ta > t0) { t0 = ta; enter = a; } if (tb < t1) t1 = tb;
    }
    if (t1 >= t0) {
        const e = 1e-6; let cx = Math.min(SITE - 1, Math.max(0, Math.floor(ox + dx * (t0 + e)))), cy = Math.min(LAYERS - 1, Math.max(0, Math.floor(oy + dy * (t0 + e)))), cz = Math.min(SITE - 1, Math.max(0, Math.floor(oz + dz * (t0 + e))));
        const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
        let tx = dx !== 0 ? ((dx > 0 ? cx + 1 : cx) - ox) * inv[0] : Infinity, ty = dy !== 0 ? ((dy > 0 ? cy + 1 : cy) - oy) * inv[1] : Infinity, tz = dz !== 0 ? ((dz > 0 ? cz + 1 : cz) - oz) * inv[2] : Infinity;
        const ddx = Math.abs(inv[0]), ddy = Math.abs(inv[1]), ddz = Math.abs(inv[2]); let t = t0, face = enter;
        for (let n = 0; n < 3 * SITE + LAYERS; n++) {
            const id = grid[(cy * SITE + cz) * SITE + cx];
            if (id) { const col = id === BLOCKS.glass ? COLOURS.glass : id === BLOCKS.roof ? COLOURS.roof : COLOURS.wall, s = face === 1 ? SHADE.top : face === 0 ? SHADE.x : SHADE.z; best = t; what = "block"; r = col[0] * s; g = col[1] * s; b = col[2] * s; break; }
            if (tx <= ty && tx <= tz) { t = tx; tx += ddx; cx += sx; face = 0; if (cx < 0 || cx >= SITE) break; } else if (ty <= tz) { t = ty; ty += ddy; cy += sy; face = 1; if (cy < 0 || cy >= LAYERS) break; } else { t = tz; tz += ddz; cz += sz; face = 2; if (cz < 0 || cz >= SITE) break; }
        }
    }
    // the ground
    if (dy < 0) { const t = -oy / dy; if (t > 0 && t < best) { const px = ox + dx * t, pz = oz + dz * t, cx = Math.floor(px), cz = Math.floor(pz), inYard = cx >= YARD_LO && cz >= YARD_LO && cx < YARD_LO + YARD && cz < YARD_LO + YARD;
        let col = inYard ? COLOURS.yard : COLOURS.beyond; if (inYard && cx === ep.food[0] && cz === ep.food[1]) col = COLOURS.food; else if (inYard && ep.plan.door.some((c) => c.y === 0 && c.x === cx && c.z === cz)) col = COLOURS.door;
        const s = inYard && col !== COLOURS.food && ((cx + cz) & 1) ? 0.9 : 1; best = t; what = "ground"; r = col[0] * s; g = col[1] * s; b = col[2] * s; } }
    // the mover and the fly: spheres
    const sphere = (sx0, sy0, sz0, rad) => { const lx = sx0 - ox, ly = sy0 - oy, lz = sz0 - oz, tc = lx * dx + ly * dy + lz * dz, d2 = lx * lx + ly * ly + lz * lz - tc * tc; if (d2 > rad * rad) return Infinity; const th = Math.sqrt(rad * rad - d2), t = tc - th; return t > 1e-4 ? t : (tc + th > 1e-4 && !eye ? tc + th : Infinity); };
    if (f.mover) { const t = sphere(f.mover.x, EYE_HEIGHT, f.mover.z, BIRD_RADIUS); if (t < best) { const col = eye ? COLOURS.mover : f.mover.kind === "strike" ? COLOURS.strike : COLOURS.pass, s = eye ? 1 : 0.75 + 0.25 * Math.max(0, (oy + dy * t - EYE_HEIGHT) / BIRD_RADIUS); best = t; what = "mover"; r = col[0] * s; g = col[1] * s; b = col[2] * s; } }
    if (withFly) { const t = sphere(f.x, FLY_RADIUS, f.z, FLY_RADIUS); if (t < best) { best = t; what = "fly"; r = COLOURS.fly[0]; g = COLOURS.fly[1]; b = COLOURS.fly[2]; } }
    if (what === "sky") { const k = Math.max(0, Math.min(1, dy * 1.6)); r = COLOURS.horizon[0] + (COLOURS.sky[0] - COLOURS.horizon[0]) * k; g = COLOURS.horizon[1] + (COLOURS.sky[1] - COLOURS.horizon[1]) * k; b = COLOURS.horizon[2] + (COLOURS.sky[2] - COLOURS.horizon[2]) * k; }
    out[0] = r; out[1] = g; out[2] = b;
    return what;
}
const frameOf = (ep, k) => { if (!Number.isInteger(k) || k < 0 || k >= ep.frames.length) throw new Error(`flyEscapeShow: no tick ${k} of this episode (0 to ${ep.frames.length - 1})`); return ep.frames[k]; };
const sizeOf = (w, h) => { if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w * h > 1 << 20) throw new Error(`flyEscapeShow: a picture is a whole number of pixels each way, at most a million (got ${w} x ${h})`); };
const finish = (width, height, data, counts) => { let h = 0x811c9dc5; for (let i = 0; i < data.length; i += 4) { h ^= (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]; h = Math.imul(h, 0x01000193) >>> 0; } return { width, height, data, counts, hash: (h >>> 0).toString(16).padStart(8, "0") }; };

/** See the header. `counts` is how many pixels met each thing. */
export function view3d(ep, k, cam = CAM, width = 320, height = 220) {
    const f = frameOf(ep, k); sizeOf(width, height);
    const az = cam.az ?? CAM.az, el = Math.max(0.05, Math.min(1.5, cam.el ?? CAM.el)), dist = cam.dist ?? CAM.dist, fov = cam.fov ?? CAM.fov, tx = SITE / 2, ty = 1, tz = SITE / 2;
    const ox = tx + dist * Math.cos(el) * Math.cos(az), oy = ty + dist * Math.sin(el), oz = tz + dist * Math.cos(el) * Math.sin(az);
    let fx = tx - ox, fy = ty - oy, fz = tz - oz; const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
    let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz); rx /= rl; rz /= rl;                       // right = forward x up, flat
    const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;                                       // up = right x forward
    const data = new Uint8ClampedArray(width * height * 4), out = [0, 0, 0], counts = { sky: 0, ground: 0, block: 0, mover: 0, fly: 0 }, half = Math.tan(fov / 2), aspect = width / height;
    for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
        const px = ((i + 0.5) / width * 2 - 1) * half * aspect, py = (1 - (j + 0.5) / height * 2) * half;
        let dx = fx + rx * px + ux * py, dy = fy + uy * py, dz = fz + rz * px + uz * py; const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
        counts[cast(ep, f, ox, oy, oz, dx, dy, dz, true, false, out)]++;
        const q = (j * width + i) * 4; data[q] = out[0]; data[q + 1] = out[1]; data[q + 2] = out[2]; data[q + 3] = 255;
    }
    return finish(width, height, data, counts);
}
/** See the header. */
export function eyeView(ep, k, width = 180, height = 45) {
    const f = frameOf(ep, k); sizeOf(width, height);
    const data = new Uint8ClampedArray(width * height * 4), out = [0, 0, 0], counts = { sky: 0, ground: 0, block: 0, mover: 0, fly: 0 };
    for (let j = 0; j < height; j++) { const elev = EYE_ELEV[1] - (j + 0.5) / height * (EYE_ELEV[1] - EYE_ELEV[0]), ce = Math.cos(elev), se = Math.sin(elev);
        for (let i = 0; i < width; i++) { const bearing = f.heading + ((i + 0.5) / width - 0.5) * 2 * Math.PI;
            counts[cast(ep, f, f.x, EYE_HEIGHT, f.z, ce * Math.cos(bearing), se, ce * Math.sin(bearing), false, true, out)]++;
            const q = (j * width + i) * 4; data[q] = out[0]; data[q + 1] = out[1]; data[q + 2] = out[2]; data[q + 3] = 255; } }
    return finish(width, height, data, counts);
}

/** See the header. */
export function saidLines() {
    return [
        "A fly feeds on the yellow tile in the yard of its house. Things fly at it (a strike, drawn red in the outside view) or past it (harmless, drawn grey). A strike catches a fly it reaches that is not inside its room, and it is faster than the fly walks. The fly chooses one thing each tick: go home, or go to the food. Its body finds the way, through the door.",
        "The outside view can be turned: drag it. The colours of the two kinds of mover are for you; the fly is not told the kind.",
        "The lower picture is from the fly's own eye, all the way round: the middle is straight ahead and the two edges are behind it, from 30 degrees below the horizon to 60 above, one lens a dot. The dark disc is the mover. How big it is, how fast it grows (it LOOMS) and how fast it slides sideways are three of the thirteen numbers the fly is given; a thing on a collision course grows while staying where it is in the picture.",
        "What the rounds found: trained from nothing, no fly learned to tell a strike from a harmless fly-by -- they go home for everything and score less than a fly written to do just that. The reflex written by hand (go home for what looms on a steady bearing) does better and is still caught by one strike in ten. Round 2 started every fly AT that reflex and trained a correction to it: most then do a little better than the reflex -- a hundredth and a half -- and still nothing like a fly that is told which movers are strikes. Round 3 gave the trainer new episodes every step: every fly then beats the reflex and is almost never caught (round 3's flies are the ones to watch). Round 4 gave them memory between ticks, which did not help.",
        "Round 5 is another kind of fly: the two Giant Fibers and forty of the real visual cells that feed them (LC4 and LPLC2, from the male fly's connectome), given only how big the mover looks and how fast it looms, with the answer read from the Giant Fibers alone. With the real wiring every training ends at the same good fly; with the same connections shuffled, twelve of sixteen do and four fail. It is the first round in which a real wiring was told from its shuffle -- as a surer training, not a better fly -- and it wants a second round before it is believed.",
        "Round 6 is that second round, on 32 new trainings an arm (draws 17 to 48). The result came again: the real wiring escapes better than a free shuffle of it. But a shuffle that keeps how many connections each cell receives and sends -- and so keeps the heavy drive onto the two Giant Fibers -- could not be told from the real wiring at all. So what round 5 found is the convergence onto the cells that are read, not which cell is wired to which. The difference is small: about a thousandth of the score, and two failed trainings of 32 for the free shuffle against none.",
        "Round 7 took 'the counts' apart, on 32 more trainings an arm (draws 49 to 80). The difference came a third time. But no one part alone could be told from a free shuffle: not what each cell receives, not what each cell sends, not the two Giant Fibers' own inputs. The last of those came closest and looks just like the shuffle that keeps everything, so the round cannot say whether the whole pattern is needed or whether the Giant Fibers' inputs are the answer and 32 trainings were too few to show it.",
        "Round 8 asked that last question again on 128 trainings an arm (draws 81 to 208): a fly whose two Giant Fibers keep their 42 real inputs, and nothing else of the real wiring, against a free shuffle. It escapes better -- surely, and by little: it wins about 72 of 100 pairs, the middle flies differ by about a thousandth of the score, and none of its trainings failed against five of the shuffle's. Round 7's near miss was too few trainings. Taken with rounds 6 and 7, the plainest reading is that the real circuit's edge over a free shuffle is the drive onto the two cells that are read, and nothing finer has been shown.",
        "Not a fly's nervous system at work. The Giant Fiber Circuit is the fruit fly's real escape circuit, and a trained fly here is a small network with that circuit's wiring -- but it walks where a fly would take off, its cells are simple rectified sums and not neurons, and in rounds 1 to 4 its wiring could not be told apart from a shuffle of it. Round 5's forty visual cells are a fifth of the visual input a Giant Fiber has, and each is given one number where the real cell looks at its own patch of the eye.",
    ];
}
