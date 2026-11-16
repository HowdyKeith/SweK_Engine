// WebGLEngine/brain/flyRamShow.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// WATCH THE COLLISION REFLEX (Keith, 2026-11-16: "And we do want the page work"). One joust of the 6-DOF collision reflex round (brain/FLY_RAM_REFLEX_WIP.md): the craft -- the fruit fly's
// close-quarters pilot with a reflex over it -- against the PD autopilot, collisions on, kept tick by tick. Nothing here trains and nothing here measures: the round did that
// (tools/ship/flyRam.mjs), and this file plays its craft -- the same duel (brain/pilot6dofPolicy.mjs's, unmodified), the same seeds, the weights read from the round's own committed results.
//
// THE CRAFT (KINDS). Three need no file: `never` (the pilot alone), `hand` (break when contact is under 3 seconds away) and `always` (break whenever the gap is closing) -- brain/rl/ramEnv.mjs's
// RULES. Three are the round's trained arms (GF, GSHUF, FREE), draw 1 to 12, whose weights are the record's in the round's results file.
//
// HOW A TICK IS KEPT WITHOUT TOUCHING THE DUEL: duel() takes a `contacts` resolver in place of the engine's own. This file hands it one that calls the engine's own
// (brain/shipCollision6dof.mjs's resolveShipCollisions) and keeps what it was shown -- both ships, after the step and the contact, at every tick. The gate holds that the duel so watched is the
// round's duel, to the fingerprint.
//
//   KINDS, ARMS, DRAWS, LABELS, RESULTS, UNDER_FILE, CAM, COLOURS, TRAIL, FIRST_JOUST
//   underOf(json)                      the pilot under the reflex, from brain/pilot6dofWeightsClose.json's parsed text
//   policyFor(arm, s)                  the round's untrained network of an arm and a draw (tools/ship/flyRam.mjs's policyOf, which a page cannot load: it reads files)
//   flyOf(kind, { draw, record })      { kind, draw, act(obs, see) }
//   episode(under, fly, seed)          { kind, draw, seed, frames: [{ t, a, b, range, seconds, size, loom, brk, ram (hull points the touch cost), touch }], ticks, reward, fight, ramHp, rams, win, loss, breaks, aHp, bHp, fingerprint, hash }
//   scene(ep, k, cam, w, h)            the outside view of a tick as line segments [x1, y1, x2, y2, colour name], and its hash
//   eyeOf(ep, k)                       what the reflex's eye has at a tick: where the foe is from the craft (bearing, elevation), how big it looks, how fast it looms
//   saidLines()                        what the page says the picture is and is not
// Pure: no I/O, no clock, no Math.random.
"use strict";
import * as E from "./rl/ramEnv.mjs";
import * as P6 from "./pilot6dofPolicy.mjs";
import * as SC from "./shipCollision6dof.mjs";
import { rotateByQuat, worldToBody } from "../physics/mechanics/rigidBody6dof.mjs";
import { foldHash } from "../physics/raceCar.mjs";
import { MaskedCircuitPolicy } from "./rl/maskedCircuitPolicy.mjs";
import { shuffledEdges } from "./rl/paintCircuitPolicy.mjs";
import * as GFT from "./gfVisualTopology.mjs";
import { unpackWeights, recordsOf } from "./voxelHomeShow.mjs";

export { unpackWeights, recordsOf };
export const RESULTS = "brain/flyRamRound.jsonl", UNDER_FILE = "brain/pilot6dofWeightsClose.json", DRAWS = 12;
export const ARMS = Object.freeze(["GF", "GSHUF", "FREE"]), KINDS = Object.freeze(["never", "hand", "always", ...ARMS]);
export const VISION = Object.freeze({ freeUnits: 113, shuffleSeed: 7000, gain: 0.01 });   // round 5's arms (tools/ship/flyEscapeVision.mjs), which the collision round uses as they are
export const LABELS = Object.freeze({ never: "the pilot alone (no reflex)", hand: "written by hand: break when contact is under 3 seconds away", always: "written by hand: break whenever the gap is closing",
    GF: "trained: the real Giant Fiber circuit as the reflex", GSHUF: "trained: the same cells, connections shuffled", FREE: "trained: a free net on the same two numbers" });
export const CAM = Object.freeze({ az: 0.6, el: 0.35, fov: 0.9 }), TRAIL = 45, FIRST_JOUST = 939596;   // the joust the page opens on: the sixth of the round's 200 audit jousts
export const COLOURS = Object.freeze({ craft: "#8fd0ff", breaking: "#ffb347", foe: "#ff6b6b", trail: "#3d5f80", foeTrail: "#7a3b3b", gap: "#2a3a50", ram: "#ffffff" });

/** See the header. */
export function underOf(json) {
    if (!json || !Array.isArray(json.weights) || json.weights.length !== P6.WEIGHT_COUNT) throw new Error(`flyRamShow.underOf: ${UNDER_FILE} has no ${P6.WEIGHT_COUNT} weights`);
    return P6.pilotFor(Float32Array.from(json.weights));
}
/** See the header: the network with its output layer (the weights from its read cells, and the bias) at zero, as the round started it. */
export function policyFor(arm, s) {
    if (!ARMS.includes(arm)) throw new Error(`flyRamShow.policyFor: no arm ${arm} (the arms are ${ARMS.join(", ")})`);
    if (!Number.isInteger(s) || s < 1 || s > DRAWS) throw new Error(`flyRamShow.policyFor: no draw ${s} (the draws are 1 to ${DRAWS})`);
    const units = GFT.NEURON_ORDER.length, inputs = [...GFT.LC4.map((u) => [u, E.LOOM]), ...GFT.LPLC2.map((u) => [u, E.SIZE])], real = GFT.EDGES.map((e) => [e[0], e[1]]), free = VISION.freeUnits;
    const p = arm === "FREE" ? new MaskedCircuitPolicy({ obsDim: E.OBS_DIM, units: free, inputs: Array.from({ length: free }, (_, u) => [[u, E.LOOM], [u, E.SIZE]]).flat(), edges: [], outputs: Array.from({ length: free }, (_, u) => u), edgeStart: null, seed: s })
        : new MaskedCircuitPolicy({ obsDim: E.OBS_DIM, units, inputs, edges: arm === "GF" ? real : shuffledEdges(units, real.length, VISION.shuffleSeed + s), outputs: [...GFT.GF], edgeStart: GFT.SYNAPSES.map((n) => n * VISION.gain), seed: s });
    const w = p.getParams(); w.fill(0, w.length - (p.out.length + 1)); p.setParams(w); return p;
}
/** See the header. */
export function flyOf(kind, { draw = 1, record = null } = {}) {
    if (!KINDS.includes(kind)) throw new Error(`flyRamShow.flyOf: no craft ${kind} (the craft are ${KINDS.join(", ")})`);
    if (Object.hasOwn(E.RULES, kind)) return { kind, draw: null, act: (o, see) => E.RULES[kind].act(o, see) };
    const policy = policyFor(kind, draw);
    if (!record || record.arm !== kind || record.s !== draw) throw new Error(`flyRamShow.flyOf: ${kind} draw ${draw} needs its record from ${RESULTS}`);
    const w = unpackWeights(record.weights);
    if (w.length !== policy.getParams().length || w.length !== record.weightCount) throw new Error(`flyRamShow.flyOf: ${kind} draw ${draw} has ${w.length} weights, and its network takes ${policy.getParams().length}`);
    policy.setParams(w);
    return { kind, draw, score: record.score, act: (o) => policy.act(o) };
}

const snap = (s) => ({ pos: [...s.body.pos], q: [...s.body.q], hp: s.hp });
/** See the header. One joust, the round's (ramEnv.DUEL), watched. */
export function episode(under, fly, seed) {
    if (typeof under !== "function") throw new Error("flyRamShow.episode: the pilot under the reflex is a function (underOf)");
    if (!fly || typeof fly.act !== "function") throw new Error("flyRamShow.episode: a craft's reflex has act(obs, see)");
    if (!Number.isInteger(seed) || seed < 1) throw new Error(`flyRamShow.episode: the seed is a whole number from 1 (got ${seed})`);
    const frames = [], count = { ticks: 0, breaks: 0 }; let cur = null;
    const seen = { act: (o, see) => { const a = fly.act(o, see); cur = { range: see.range, seconds: see.seconds, size: o[E.SIZE], loom: o[E.LOOM], brk: a[0] > 0 }; return a; } };
    const contacts = (ships, half, info) => { const ev = SC.resolveShipCollisions(ships, half); let ram = 0; for (const c of ev) ram += c.dmg; frames.push({ t: info.tick, a: snap(ships[0]), b: snap(ships[1]), ...cur, ram, touch: ev.length > 0 }); return ev; };
    const r = P6.duel(E.craft(under, seen, count), "autopilot", { seed, ...E.DUEL, contacts });
    let h = 0x811c9dc5; for (const f of frames) { for (const v of [...f.a.pos, ...f.a.q, ...f.b.pos, ...f.b.q, f.a.hp, f.b.hp, f.ram]) h = foldHash(h, Math.round(v * 1000) & 0xffffffff); h = foldHash(h, (f.brk ? 1 : 0) + (f.touch ? 2 : 0)); }
    return { kind: fly.kind ?? null, draw: fly.draw ?? null, seed, frames, ticks: r.ticks, reward: r.score, fight: r.score + r.ramHp * E.RAM_PRICE, ramHp: r.ramHp, rams: r.rams, win: r.win, loss: r.winB, breaks: count.breaks, aHp: r.aHp, bHp: r.bHp,
        fingerprint: r.fingerprint, hash: (h >>> 0).toString(16).padStart(8, "0") };
}
const frameOf = (ep, k) => { if (!ep || !Array.isArray(ep.frames) || !Number.isInteger(k) || k < 0 || k >= ep.frames.length) throw new Error(`flyRamShow: no tick ${k} of this joust (it has ${ep && ep.frames ? ep.frames.length : 0})`); return ep.frames[k]; };

const BOX = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
/** See the header. The camera orbits the point midway between the two ships, far enough to hold both: { az, el } in radians. */
export function scene(ep, k, cam = CAM, width = 480, height = 320) {
    const f = frameOf(ep, k);
    if (![width, height].every((n) => Number.isInteger(n) && n > 0)) throw new Error("flyRamShow.scene: a picture is a whole number of pixels");
    const mid = [0, 1, 2].map((i) => (f.a.pos[i] + f.b.pos[i]) / 2), fov = cam.fov ?? CAM.fov, dist = Math.max(14, f.range * 0.5 + 6) / Math.tan(fov / 2);
    const ce = Math.cos(cam.el), eye = [mid[0] + dist * ce * Math.cos(cam.az), mid[1] + dist * Math.sin(cam.el), mid[2] + dist * ce * Math.sin(cam.az)];
    const fw = [mid[0] - eye[0], mid[1] - eye[1], mid[2] - eye[2]].map((v) => v / dist), rt0 = [-fw[2], 0, fw[0]], rn = Math.hypot(rt0[0], rt0[2]) || 1, rt = [rt0[0] / rn, 0, rt0[2] / rn], up = [rt[1] * fw[2] - rt[2] * fw[1], rt[2] * fw[0] - rt[0] * fw[2], rt[0] * fw[1] - rt[1] * fw[0]];
    const focal = (height / 2) / Math.tan(fov / 2);
    const proj = (p) => { const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]], z = d[0] * fw[0] + d[1] * fw[1] + d[2] * fw[2]; if (z < 0.1) return null; return [width / 2 + focal * (d[0] * rt[0] + d[1] * rt[1] + d[2] * rt[2]) / z, height / 2 - focal * (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / z]; };
    const lines = [], seg = (p, q, c) => { const a = proj(p), b = proj(q); if (a && b) lines.push([a[0], a[1], b[0], b[1], c]); };
    const at = (s, v) => { const r = rotateByQuat(s.q, v); return [s.pos[0] + r[0], s.pos[1] + r[1], s.pos[2] + r[2]]; };
    seg(f.a.pos, f.b.pos, "gap");
    for (const [who, c] of [["a", "trail"], ["b", "foeTrail"]]) for (let j = Math.max(1, k - TRAIL + 1); j <= k; j++) seg(ep.frames[j - 1][who].pos, ep.frames[j][who].pos, c);
    for (const [s, c] of [[f.a, f.touch ? "ram" : f.brk ? "breaking" : "craft"], [f.b, f.touch ? "ram" : "foe"]]) {
        const pts = BOX.map((v) => at(s, [v[0] * P6.HALF[0], v[1] * P6.HALF[1], v[2] * P6.HALF[2]]));
        for (const [i, j] of EDGES) seg(pts[i], pts[j], c);
        seg(at(s, [P6.HALF[0], 0, 0]), at(s, [P6.HALF[0] * 2.2, 0, 0]), c);   // the nose: the way it points
    }
    let h = 0x811c9dc5; for (const l of lines) { for (let i = 0; i < 4; i++) h = foldHash(h, Math.round(l[i] * 10) & 0xffffffff); h = foldHash(h, l[4].length); }
    return { width, height, lines, dist, hash: (h >>> 0).toString(16).padStart(8, "0") };
}
/** See the header: { bearing, elevation } (radians, in the craft's own frame: 0, 0 is dead ahead), { size, loom } (the two numbers the reflex is given), range, seconds, brk. */
export function eyeOf(ep, k) {
    const f = frameOf(ep, k), r = worldToBody(f.a.q, [f.b.pos[0] - f.a.pos[0], f.b.pos[1] - f.a.pos[1], f.b.pos[2] - f.a.pos[2]]), n = Math.hypot(r[0], r[1], r[2]) || 1;
    return { bearing: Math.atan2(r[2], r[0]), elevation: Math.asin(Math.max(-1, Math.min(1, r[1] / n))), radius: Math.atan(E.HULL_RADIUS / n), size: f.size, loom: f.loom, range: f.range, seconds: f.seconds, brk: f.brk };
}

/** See the header. */
export function saidLines() {
    return [
        "Two craft joust in open space: they start facing each other, already closing. The blue one is the craft -- the fruit fly's close-quarters pilot, with a collision reflex over it. The red one is the plain autopilot. Both shoot (the shots are not drawn; the hull points fall when they land). When the hulls touch, both lose hull points, and the boxes flash white.",
        "The reflex is given two numbers each tick, the two the fly's escape circuit is given: how big the other craft looks, and how fast that is growing (how fast it looms). If the reflex fires, the craft stops fighting for that tick and breaks away from the line the other craft is coming down; it is drawn orange while it does.",
        "The outside view can be turned: drag it. The camera sits back far enough to hold both craft, so they look small when they are far apart. The lower picture is from the craft's own nose: the middle is dead ahead, the edges are behind it, and the disc is the other craft at the size it looks.",
        "What the round found: a reflex that fires costs this pilot more fighting than the rams it avoids are worth. Trained, all 12 craft with the real Giant Fiber circuit as their reflex learned never to fire -- they fly exactly as the pilot alone does, to the last digit -- and so did 9 of the 12 with shuffled wiring and 7 of the 12 free nets. Of the eight that do fire, six score worse than the pilot alone. The hand-written rule (break under 3 seconds) cuts the ram damage by more than half and loses nearly a fifth of the score.",
        "The joust the page opens on (939596) is the round in one fight. The pilot alone rams the autopilot at tick 68, loses 18 hull points to it, and wins in 178 ticks. With the hand-written rule the craft breaks away, never touches, and still wins -- but it takes 506 ticks and scores 9.85 where the pilot alone scored 16.17.",
        "So most trained craft here look exactly like 'the pilot alone'. To see a reflex fire, pick a hand-written rule, or the free net's draw 3 (the craft that rams least, and the round's worst score) or draw 8 (its best).",
        "Not a fly's nervous system at work, and a craft is not a fly. The break-away manoeuvre was written by hand; the circuit only says when. The round says as much about that manoeuvre and the price of a ram as it does about the circuit.",
    ];
}
