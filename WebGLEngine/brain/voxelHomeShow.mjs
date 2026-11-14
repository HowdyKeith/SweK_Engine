// WebGLEngine/brain/voxelHomeShow.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// WATCH A BUILDER PUT UP A HOUSE (backlog `voxel-home`, V3; Keith, 2026-11-14: "Do item 1"). One build of brain/rl/buildEnv.mjs's BuildEnv, kept step by step, and the picture of it after any step.
// Nothing here trains and nothing here measures: the three rounds did that (tools/ship/voxelHome.mjs and the two beside it), and this file plays their builders -- the same environment, the same
// plans, the same weights, read from the rounds' own committed results files -- so that what the page shows is what the rounds scored.
//
// THE BUILDERS (KINDS). Three need no file:
//   rule     buildEnv's greedyColumn: the first column whose next block can be placed. It always finishes.
//   lean     no network: 1 for every column the observation says still needs a block, -1 for the rest; the column is drawn. The rounds' floor "the lean to the unfinished columns".
//   random   two numbers a step that name a column, as the rounds' random builders did -- but NOT their stream: the rounds ran one stream through all 200 plans, which a page showing one plan cannot
//            replay, so this one is mulberry32 seeded by the draw (1..16) and the plan. On the 200 audit plans it builds what the rounds' did (0.57), and the gate holds that.
// and five are a round's trained arm (FLY, SHUF, PLAIN, FISH, MLP), draw 1..16, whose weights are the record's in that round's results file (ROUNDS: 1 names a column, 150 iterations; 2 draws it,
// 150; 3 draws it, 1,000).
//
//   ROUNDS, KINDS, ARMS, LABELS
//   unpackWeights(b64)                 a record's weights (little-endian float32s in base64), with no Buffer: this file loads in a page
//   recordsOf(text)                    a results file's draws by "ARM s"
//   policyFor(round, arm, s)           that round's untrained builder of an arm and a draw (tools/ship/voxelHome.mjs's policyOf, which a page cannot load: it reads files)
//   builderOf(kind, { round, draw, record })   { kind, round, draw, choice, act(obs, env) }; a trained kind needs its record, and the record's weight count must be the policy's
//   build(builder, planSeed, opts)     one episode: { plan, steps: [{ t, col, placed, why, wanted, need, chances }], placed, rejected, blocks, share, check (buildEnv's homeCheck), hash }
//   cellsAt(b, k)                      the blocks standing after k steps
//   scene(b, k, opts)                  the picture after k steps: { width, height, faces: [{ points, fill, alpha, stroke, kind }] } back to front, for a 2D canvas -- and for the gate, which holds it without one
//   saidLines()                        what the page says the picture is and is not
//
// THE PICTURE is drawn from the build's own blocks, three faces a block, looking down on the site from its near corner. It is NOT the engine's voxel mesh (render/voxelDeviceEdit.mjs's editVoxel needs
// a WebGPU device, and this page is to open anywhere); the env does write real voxels into a miniWorld, and homeCheck reads the home off those.
// Pure: no I/O, no clock, no Math.random.
"use strict";
import { BuildEnv, SITE, LAYERS, OBS_DIM, ACT_DIM, MAX_STEPS, BLOCKS, homeCheck, greedyColumn } from "./rl/buildEnv.mjs";
import { FlightPolicy } from "./rl/dockPolicy.js";
import * as P from "./rl/paintCircuitPolicy.mjs";

export const ROUNDS = Object.freeze({
    1: Object.freeze({ choice: "named", plainUnits: 41, iters: 150, file: "brain/voxelHomeRound.jsonl", label: "round 1: names a column, 150 iterations" }),
    2: Object.freeze({ choice: "drawn", plainUnits: 38, iters: 150, file: "brain/voxelHomeDrawnRound.jsonl", label: "round 2: the column is drawn, 150 iterations" }),
    3: Object.freeze({ choice: "drawn", plainUnits: 38, iters: 1000, file: "brain/voxelHomeLongRound.jsonl", label: "round 3: the column is drawn, 1,000 iterations" }),
});
export const ARMS = Object.freeze(["FLY", "SHUF", "PLAIN", "FISH", "MLP"]);
export const KINDS = Object.freeze(["rule", "lean", "random", ...ARMS]);
export const LABELS = Object.freeze({ rule: "the rule (always finishes)", lean: "the lean, no network", random: "a random builder", FLY: "trained: the fly's wiring", SHUF: "trained: the fly's wiring, shuffled",
    PLAIN: "trained: a plain net of its size", FISH: "trained: the fish's wiring", MLP: "trained: a small standard net" });
export const DRAWS = 16, MLP_HIDDEN = Object.freeze([16, 16]);
export const COLOURS = Object.freeze({ [BLOCKS.wall]: "#b9b2a3", [BLOCKS.glass]: "#7fc8ff", [BLOCKS.roof]: "#b5533c", ground: "#2f4433", plot: "#4a5a45", door: "#8a6a3c", placed: "#ffe27a", refused: "#ff5a4f" });
export const SHADE = Object.freeze({ top: 1, left: 0.8, right: 0.62 });
export const VIEW = Object.freeze({ width: 720, height: 560 });

/** See the header. */
export function unpackWeights(b64) {
    const bin = atob(b64); if (bin.length % 4) throw new Error("voxelHomeShow.unpackWeights: not a whole number of float32s");
    const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const view = new DataView(bytes.buffer), out = new Float32Array(bin.length / 4); for (let i = 0; i < out.length; i++) out[i] = view.getFloat32(i * 4, true);
    return out;
}
/** See the header. */
export function recordsOf(text) {
    const out = new Map();
    for (const line of String(text).split("\n")) { if (!line) continue; const r = JSON.parse(line); if (r && r.kind === "draw") out.set(`${r.arm} ${r.s}`, r); }
    return out;
}
const roundOf = (round) => { const R = ROUNDS[round]; if (!R) throw new Error(`voxelHomeShow: no round ${round} (the rounds are 1, 2, 3)`); return R; };
const drawOf = (draw) => { if (!Number.isInteger(draw) || draw < 1 || draw > DRAWS) throw new Error(`voxelHomeShow: no draw ${draw} (the draws are 1 to ${DRAWS})`); return draw; };
/** See the header. */
export function policyFor(round, arm, s) {
    const R = roundOf(round), actDim = R.choice === "drawn" ? SITE * SITE : ACT_DIM; drawOf(s);
    if (!ARMS.includes(arm)) throw new Error(`voxelHomeShow.policyFor: no arm ${arm} (the arms are ${ARMS.join(", ")})`);
    if (arm === "MLP") return new FlightPolicy({ hidden: [...MLP_HIDDEN], obsDim: OBS_DIM, actDim, seed: s });
    const c = arm === "PLAIN" ? { units: R.plainUnits, edges: [] } : P.ARMS[arm](s);
    return new P.CircuitPolicy({ obsDim: OBS_DIM, actDim, units: c.units, edges: c.edges, seed: s });
}
/** See the header. */
export function builderOf(kind, { round = 3, draw = 1, record = null } = {}) {
    if (!KINDS.includes(kind)) throw new Error(`voxelHomeShow.builderOf: no builder ${kind} (the builders are ${KINDS.join(", ")})`);
    if (kind === "rule") return { kind, round: null, draw: null, choice: "named", act: (o, env) => greedyColumn(env) };
    if (kind === "lean") return { kind, round: null, draw: null, choice: "drawn", act: (o) => Float32Array.from({ length: SITE * SITE }, (_, c) => (o[c] > 0 ? 1 : -1)) };
    drawOf(draw);
    if (kind === "random") return { kind, round: null, draw, choice: "named", fresh: (planSeed) => { const r = P.mulberry32((Math.imul(draw, 0x9e3779b1) ^ planSeed) >>> 0); return () => [r() * 2 - 1, r() * 2 - 1]; } };
    const R = roundOf(round), policy = policyFor(round, kind, draw);
    if (!record || record.arm !== kind || record.s !== draw) throw new Error(`voxelHomeShow.builderOf: ${kind} draw ${draw} of round ${round} needs its record from ${R.file}`);
    const w = unpackWeights(record.weights);
    if (w.length !== policy.getParams().length || w.length !== record.weightCount) throw new Error(`voxelHomeShow.builderOf: ${kind} draw ${draw} of round ${round} has ${w.length} weights, and its builder takes ${policy.getParams().length}`);
    policy.setParams(w);
    return { kind, round, draw, choice: R.choice, score: record.score, homes: record.homes, act: (o) => policy.act(o) };
}

/** See the header. One episode on a fresh environment; the build is its builder's and its plan's, and nothing else's. */
export function build(builder, planSeed, { maxSteps = MAX_STEPS } = {}) {
    if (!Number.isInteger(planSeed) || planSeed < 1) throw new Error(`voxelHomeShow.build: the plan's seed is a whole number from 1 (got ${planSeed})`);
    const env = new BuildEnv({ maxSteps, choice: builder.choice }), act = builder.fresh ? builder.fresh(planSeed) : builder.act, steps = [];
    let o = env.reset(planSeed), done = false, h = 0x811c9dc5;
    while (!done) {
        const need = Array.from(o.subarray(0, SITE * SITE)), a = act(o, env), chances = builder.choice === "drawn" ? Array.from(env.chancesFor(a)) : null, r = env.step(a), last = r.info.last;
        const c = last.placed, wanted = !c && last.why === "nothing to hold the block up" ? env.nextOf(last.col) : null;
        steps.push({ t: steps.length, col: last.col, placed: c ? { x: c.x, y: c.y, z: c.z, id: c.id } : null, why: last.why, wanted: wanted ? { x: wanted.x, y: wanted.y, z: wanted.z, id: wanted.id } : null, need, chances });
        h ^= last.col * 2 + (c ? 1 : 0); h = Math.imul(h, 0x01000193) >>> 0;
        o = r.obs; done = r.done;
    }
    const p = env.plan, check = homeCheck(env.world, p, env.at);
    return { kind: builder.kind, round: builder.round, draw: builder.draw, choice: builder.choice, planSeed, maxSteps,
        plan: { seed: p.seed, w: p.w, d: p.d, blocks: p.blocks, windows: p.windows, hash: p.hash, cells: p.cells.map((c) => ({ x: c.x, y: c.y, z: c.z, id: c.id })), door: p.door.map((c) => ({ x: c.x, y: c.y, z: c.z })) },
        steps, placed: env.placed, rejected: env.rejected, blocks: p.blocks, share: 1 - env.missing(), check, hash: (h >>> 0).toString(16).padStart(8, "0") };
}
const frameOf = (b, k) => { if (!Number.isInteger(k) || k < 0 || k > b.steps.length) throw new Error(`voxelHomeShow: no step ${k} of this build (0 to ${b.steps.length})`); return k; };
/** See the header. */
export function cellsAt(b, k) { frameOf(b, k); const out = []; for (let i = 0; i < k; i++) if (b.steps[i].placed) out.push(b.steps[i].placed); return out; }

const shade = (hex, f) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * f).toString(16).padStart(2, "0")).join("");
/** See the header. The step just made (k - 1) is marked: its block outlined, or -- refused -- the place it asked for outlined in the refusal's colour. */
export function scene(b, k, { width = VIEW.width, height = VIEW.height } = {}) {
    frameOf(b, k);
    const a = Math.min(width / (2 * SITE + 4.5), height / (SITE + LAYERS + 2.2)), cx = width / 2, oy = (height - a * (SITE + LAYERS)) / 2 + a * LAYERS - a * 0.2;
    const at = (x, y, z) => [cx + (x - z) * a, oy + (x + z) * a * 0.5 - y * a], faces = [];
    const cube = (c, fill, alpha, stroke, kind) => {
        const { x, y, z } = c;
        faces.push({ kind, face: "left", points: [at(x, y, z + 1), at(x + 1, y, z + 1), at(x + 1, y + 1, z + 1), at(x, y + 1, z + 1)], fill: fill && shade(fill, SHADE.left), alpha, stroke });
        faces.push({ kind, face: "right", points: [at(x + 1, y, z + 1), at(x + 1, y, z), at(x + 1, y + 1, z), at(x + 1, y + 1, z + 1)], fill: fill && shade(fill, SHADE.right), alpha, stroke });
        faces.push({ kind, face: "top", points: [at(x, y + 1, z), at(x + 1, y + 1, z), at(x + 1, y + 1, z + 1), at(x, y + 1, z + 1)], fill: fill && shade(fill, SHADE.top), alpha, stroke });
    };
    const doorAt = new Set(b.plan.door.filter((c) => c.y === 0).map((c) => c.z * SITE + c.x));
    for (let z = -1; z <= SITE; z++) for (let x = -1; x <= SITE; x++) {
        const inPlot = x >= 0 && z >= 0 && x < b.plan.w && z < b.plan.d, fill = inPlot && doorAt.has(z * SITE + x) ? COLOURS.door : inPlot ? COLOURS.plot : COLOURS.ground;
        faces.push({ kind: "ground", face: "top", points: [at(x, 0, z), at(x + 1, 0, z), at(x + 1, 0, z + 1), at(x, 0, z + 1)], fill, alpha: 1, stroke: "#22301f" });
    }
    const last = k > 0 ? b.steps[k - 1] : null, cells = cellsAt(b, k).slice().sort((p, q) => (p.x + p.z) - (q.x + q.z) || p.y - q.y || p.x - q.x);
    for (const c of cells) {
        const isLast = !!last && last.placed === c;
        cube(c, COLOURS[c.id], c.id === BLOCKS.glass ? 0.55 : 1, isLast ? COLOURS.placed : "#00000055", isLast ? "placed" : "block");
    }
    if (last && !last.placed) {
        let spot = last.wanted;
        if (!spot) { const x = last.col % SITE, z = Math.floor(last.col / SITE); let top = -1; for (const c of cells) if (c.x === x && c.z === z && c.y > top) top = c.y; spot = { x, y: top + 1, z }; }
        cube(spot, null, 1, COLOURS.refused, "refused");
    }
    return { width, height, faces, step: k, blocks: cells.length };
}

/** See the header. */
export function saidLines() {
    return [
        "A house from the engine's building grammar, 50 to 94 blocks on a 6 by 6 site: three layers of wall with windows and a door, then a roof. A builder has 96 steps. Each step it picks a column, and the plan's next block for that column goes in -- the builder never picks the block or its height.",
        "A block must be held up: on the ground, on the block under it, or against a block beside it. A pick that cannot be placed (the column is finished, is outside the house, or the block would hang in the air) is a step spent; it is outlined in red.",
        "The two small grids are the builder's view. Left: how much each column still needs (what the builder is shown). Right: where it leans -- the chance it gives each column -- or, for a builder that names a column, the one it named.",
        "The trained builders are the three rounds' own, played from the rounds' committed results. What the rounds found: naming a column, every trained builder built less than a random one; with the column drawn they build more (about 0.69 of a house, a random builder 0.57); 6.7 times the training added 0.01 to 0.02; the lean that needs no network builds 0.92 and finishes 123 houses of 200; two trained builders finished one house each in 16,000 builds.",
        "Not a fly building a house. The fly's Giant Fiber Circuit is an escape circuit; a builder here is a small network with that circuit's wiring, trained by trial and error, and in four rounds its wiring could not be told apart from a shuffle of it.",
    ];
}
