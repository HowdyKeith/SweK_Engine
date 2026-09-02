// WebGLEngine/world/populationPolicy.mjs -- v4318
//
// TEN THOUSAND LEARNERS ON THE GPU. world/traderPolicy.mjs scores a docked ship's candidate legs with one
// FlightPolicy (brain/rl/dockPolicy.js: a tanh MLP, seven features in, one score out) and the evolution strategy
// evaluates a POPULATION of them, one after another, on the CPU. The forward pass is the same arithmetic for
// every learner with different weights, which is what a compute pass is for: this module packs a population's
// parameters (FlightPolicy.getParams() order, per learner) and every learner's candidates' features into two
// storage buffers and scores learner p's candidate c in one invocation -- ten thousand learners, eight
// candidates each, one dispatch. The twin is FlightPolicy.act itself, learner by learner.
//
// What it is NOT: a trainer. The economy's step() asks its policy synchronously, so a population's economies
// are not stepped in lockstep and the scorer is not yet inside trainTraderES; the gate measures the pass and
// says so. WebGPU only -- a compute pass has no WebGL2 half; the module refuses on any other backend.
"use strict";

import { FlightPolicy } from "../brain/rl/dockPolicy.js";
import { OBS_DIM } from "./traderPolicy.mjs";

/** The layer sizes a population shares: [obsDim, ...hidden, 1]. */
export function sizesOf({ obsDim = OBS_DIM, hidden = [8, 8] } = {}) { return [obsDim, ...hidden, 1]; }
export function paramCountOf(opts) { const s = sizesOf(opts); let n = 0; for (let i = 0; i < s.length - 1; i++) n += s[i] * s[i + 1] + s[i + 1]; return n; }

/** The population pass, generated for its sizes so every loop bound is a constant and every activation an array. */
export function populationWgsl(opts = {}) {
    const sizes = sizesOf(opts), P = paramCountOf(opts);
    let body = `  var a0: array<f32, ${sizes[0]}>;\n  for (var k = 0u; k < ${sizes[0]}u; k = k + 1u) { a0[k] = obs[(p * info.cands + c) * ${sizes[0]}u + k]; }\n  var o = p * ${P}u;\n`;
    for (let l = 0; l < sizes.length - 1; l++) {
        const nIn = sizes[l], nOut = sizes[l + 1], last = l === sizes.length - 2;
        body += `  var a${l + 1}: array<f32, ${nOut}>;\n  for (var j = 0u; j < ${nOut}u; j = j + 1u) { var acc = params[o + ${nOut * nIn}u + j]; for (var k = 0u; k < ${nIn}u; k = k + 1u) { acc = acc + params[o + j * ${nIn}u + k] * a${l}[k]; } a${l + 1}[j] = tanh(acc); }\n  o = o + ${nOut * nIn + nOut}u;\n`;
        if (last) body += `  scores[i] = a${l + 1}[0];\n`;
    }
    return `struct Info { pop: u32, cands: u32, params: u32, pad: u32 };
@group(0) @binding(0) var<uniform> info: Info;
@group(0) @binding(1) var<storage, read> params: array<f32>;
@group(0) @binding(2) var<storage, read> obs: array<f32>;
@group(0) @binding(3) var<storage, read_write> scores: array<f32>;

@compute @workgroup_size(64) fn score(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x;
  if (i >= info.pop * info.cands) { return; }
  let p = i / info.cands; let c = i % info.cands;
${body}}
`;
}
/**
 * A population's parameters: `pop` FlightPolicies from seeds, packed [pop x paramCount], every parameter -- the
 * biases included -- jittered by `spread` so no bias is 0. (FlightPolicy.init zeroes its biases, and a population
 * of zero biases cannot tell a shader that reads the wrong bias from one that reads the right one: measured at
 * v4318 by a sabotage the gate could not see until the biases were made to matter.)
 */
export function packPopulation(pop, opts = {}) {
    const P = paramCountOf(opts), out = new Float32Array(pop * P), hidden = opts.hidden || [8, 8], spread = opts.spread == null ? 0.3 : opts.spread;
    let s = ((opts.seed || 1) * 2654435761) >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    for (let p = 0; p < pop; p++) { const base = new FlightPolicy({ hidden, obsDim: sizesOf(opts)[0], actDim: 1, seed: (opts.seed || 1) + p * 7919 }).getParams(); for (let i = 0; i < P; i++) base[i] += (rnd() * 2 - 1) * spread; out.set(base, p * P); }
    return out;
}
/** The twin: FlightPolicy.act, learner by learner, candidate by candidate. */
export function scorePopulationCpu(params, obs, { pop, cands, hidden = [8, 8], obsDim = OBS_DIM } = {}) {
    const P = paramCountOf({ hidden, obsDim }), out = new Float32Array(pop * cands), net = new FlightPolicy({ hidden, obsDim, actDim: 1 });
    for (let p = 0; p < pop; p++) { net.setParams(params.subarray(p * P, (p + 1) * P)); for (let c = 0; c < cands; c++) out[p * cands + c] = net.act(obs.subarray((p * cands + c) * obsDim, (p * cands + c + 1) * obsDim))[0]; }
    return out;
}
/** Every learner's choice: the best-scoring candidate, or null below `floor`. */
export function chooseBatch(scores, pop, cands, floor = -Infinity) { const out = new Array(pop); for (let p = 0; p < pop; p++) { let k = null, best = floor; for (let c = 0; c < cands; c++) { const s = scores[p * cands + c]; if (s > best) { best = s; k = c; } } out[p] = k; } return out; }
/**
 * The scorer on a gfx/device.js device (WebGPU only): { score(params, obs, { pop, cands }) -> Promise<Float32Array>, destroy() }.
 * Buffers are sized to `popCap x candCap` once and rewritten per call.
 */
export function makePopulationScorer(device, { popCap, candCap, hidden = [8, 8], obsDim = OBS_DIM } = {}) {
    if (!device || device.backend !== "webgpu" || typeof device.compute !== "function") throw new Error(`populationPolicy: the population pass is a compute pass and needs WebGPU (this device is ${device ? device.backend : "nothing"})`);
    if (!(popCap > 0) || !(candCap > 0)) throw new Error("populationPolicy: popCap and candCap must be positive");
    const P = paramCountOf({ hidden, obsDim });
    const pipe = device.compute({ wgsl: populationWgsl({ hidden, obsDim }), entryPoint: "score" });
    const info = device.buffer({ size: 16, usage: "uniform" }), pbuf = device.buffer({ size: popCap * P * 4, usage: "storage" }), obuf = device.buffer({ size: popCap * candCap * obsDim * 4, usage: "storage" }), sbuf = device.buffer({ size: popCap * candCap * 4, usage: "storage" });
    pipe.bind("info", info).bind("params", pbuf).bind("obs", obuf).bind("scores", sbuf);
    return {
        paramCount: P, popCap, candCap,
        async score(params, obs, { pop, cands }) {
            if (pop > popCap || cands > candCap) throw new Error(`populationPolicy: ${pop} x ${cands} exceeds the scorer's ${popCap} x ${candCap}`);
            if (params.length < pop * P) throw new Error(`populationPolicy: ${pop} learners need ${pop * P} parameters, got ${params.length}`);
            if (obs.length < pop * cands * obsDim) throw new Error(`populationPolicy: ${pop} x ${cands} candidates need ${pop * cands * obsDim} features, got ${obs.length}`);
            info.write(new Uint32Array([pop, cands, P, 0])); pbuf.write(params.subarray(0, pop * P)); obuf.write(obs.subarray(0, pop * cands * obsDim));
            device.frame(({ pass }) => pass.dispatch(pipe, Math.ceil(pop * cands / 64)));
            return new Float32Array(await device.read(sbuf)).subarray(0, pop * cands);
        },
        destroy() { for (const b of [info, pbuf, obuf, sbuf]) { try { b.destroy(); } catch (e) {} } },
    };
}
