#!/usr/bin/env node
// WebGLEngine/tools/ship/populationPolicy-selfcheck.mjs -- v4318
//
// GRADES TEN THOUSAND LEARNERS ON THE GPU: a population of trader policies (world/traderPolicy.mjs FlightPolicy
// tanh MLPs) scoring their candidates in ONE compute dispatch on gfx/device.js, against the twin that IS the
// policy -- FlightPolicy.act, learner by learner. The claim is arithmetic: ten thousand learners times eight
// candidates, every score within 1e-4 of the CPU's and every learner's CHOICE the CPU's choice; and a refusal
// on a device without compute, said rather than silently wrong.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { validateWgsl } from "../../render/wgslSpec.mjs";
import * as PP from "../../world/populationPolicy.mjs";
import { paramCount } from "../../world/traderPolicy.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const throwsWith = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const rnd = (seed) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

console.log("\n1. THE PASS AND ITS TWIN: one parameter layout, the policy's own, and a choice per learner");
{
    ok("the population's parameter count is the trader policy's (FlightPolicy over 7 features, hidden 8 and 8)", PP.paramCountOf() === paramCount([8, 8]) && PP.paramCountOf() === 7 * 8 + 8 + 8 * 8 + 8 + 8 + 1, `${PP.paramCountOf()}`);
    const w = PP.populationWgsl();
    ok("the generated WGSL validates, with the sizes baked in as constants and a tanh on every layer", validateWgsl(w).length === 0 && /array<f32, 7>/.test(w) && /array<f32, 8>/.test(w) && (w.match(/tanh\(acc\)/g) || []).length === 3, validateWgsl(w).join("; "));
    const w2 = PP.populationWgsl({ hidden: [4] });
    ok("  other sizes generate other code (hidden [4]: two layers, 4 wide)", validateWgsl(w2).length === 0 && /array<f32, 4>/.test(w2) && (w2.match(/tanh\(acc\)/g) || []).length === 2 && PP.paramCountOf({ hidden: [4] }) === 7 * 4 + 4 + 4 + 1);
    const pop = 16, cands = 5, params = PP.packPopulation(pop, { seed: 11 }), r = rnd(3), obs = new Float32Array(pop * cands * 7); for (let i = 0; i < obs.length; i++) obs[i] = r() * 2 - 1;
    const s = PP.scorePopulationCpu(params, obs, { pop, cands });
    let distinct = 0; for (let p = 1; p < pop; p++) if (s[p * cands] !== s[0]) distinct++;
    ok("the twin scores every learner differently (different seeds, different weights) within (-1, 1)", distinct === pop - 1 && Array.from(s).every((v) => v > -1 && v < 1));
    const ch = PP.chooseBatch(s, pop, cands);
    ok("  chooseBatch takes each learner's best candidate, and null below a floor", ch.every((k, p) => s[p * cands + k] === Math.max(...Array.from(s.subarray(p * cands, (p + 1) * cands)))) && PP.chooseBatch(s, pop, cands, 2).every((k) => k === null));
    ok("REFUSED: a scorer on a device without compute, a cap of zero", throwsWith(() => PP.makePopulationScorer({ backend: "webgl2" }, { popCap: 1, candCap: 1 }), /needs WebGPU/) && throwsWith(() => PP.makePopulationScorer({ backend: "webgpu", compute() {} }, { popCap: 0, candCap: 1 }), /must be positive/));
}

console.log("\n2. TEN THOUSAND LEARNERS ON WEBGPU: one dispatch, every score the twin's, every choice the twin's");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const POP = 10000, CANDS = 8;
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { POP, CANDS }, script: `async (a) => {
        const PP = await import("/world/populationPolicy.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const params = PP.packPopulation(a.POP, { seed: 5 });
        let s = 77; const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        const obs = new Float32Array(a.POP * a.CANDS * 7); for (let i = 0; i < obs.length; i++) obs[i] = rnd() * 2 - 1;
        const scorer = PP.makePopulationScorer(dev, { popCap: a.POP, candCap: a.CANDS });
        const t0 = performance.now(); const gpu = await scorer.score(params, obs, { pop: a.POP, cands: a.CANDS }); const tGpu = performance.now() - t0;
        const t1 = performance.now(); const cpu = PP.scorePopulationCpu(params, obs, { pop: a.POP, cands: a.CANDS }); const tCpu = performance.now() - t1;
        let maxd = 0; for (let i = 0; i < gpu.length; i++) maxd = Math.max(maxd, Math.abs(gpu[i] - cpu[i]));
        const cg = PP.chooseBatch(gpu, a.POP, a.CANDS), cc = PP.chooseBatch(cpu, a.POP, a.CANDS); let agree = 0, ties = 0;
        for (let p = 0; p < a.POP; p++) { if (cg[p] === cc[p]) agree++; else { const row = cpu.subarray(p * a.CANDS, (p + 1) * a.CANDS); const sorted = Array.from(row).sort((x, y) => y - x); if (sorted[0] - sorted[1] < 1e-4) ties++; } }
        // a small run through the same scorer: the cap is a cap, not a size
        const few = await scorer.score(params, obs, { pop: 3, cands: 2 }), fewCpu = PP.scorePopulationCpu(params, obs, { pop: 3, cands: 2 }); let fewOk = true; for (let i = 0; i < 6; i++) if (Math.abs(few[i] - fewCpu[i]) > 1e-4) fewOk = false;
        let refused = null; try { await scorer.score(params, obs, { pop: a.POP + 1, cands: a.CANDS }); } catch (e) { refused = e.message; }
        // WebGL2: the scorer refuses
        const cv2 = document.createElement("canvas"); cv2.width = 8; cv2.height = 8; const dev2 = await requestDevice(cv2, { backend: "webgl2" }); let gl2 = null; try { PP.makePopulationScorer(dev2, { popCap: 1, candCap: 1 }); } catch (e) { gl2 = e.message; }
        return { n: gpu.length, maxd, agree, ties, tGpu, tCpu, fewOk, refused, gl2, sample: Array.from(gpu.slice(0, 3)), sampleCpu: Array.from(cpu.slice(0, 3)) };
    }` });
    ok("the harness ran", r.ok && r.result && r.result.n === POP * CANDS, r.ok ? "" : (r.reason || (r.pageErrors || []).join("; ") || r.error));
    if (r.ok && r.result.n) {
        const R = r.result;
        ok(`*** ${POP.toLocaleString("en-US")} learners x ${CANDS} candidates in ONE dispatch: every score within 1e-4 of the twin's (FlightPolicy.act, learner by learner) ***`, R.maxd < 1e-4, `max |diff| ${R.maxd.toExponential(2)} over ${R.n.toLocaleString("en-US")} scores; first three ${R.sample.map((v) => v.toFixed(5)).join(" ")} vs ${R.sampleCpu.map((v) => v.toFixed(5)).join(" ")}`);
        ok("*** and every learner's CHOICE is the twin's, bar ties the CPU itself could not split (two candidates within 1e-4) ***", R.agree + R.ties === POP && R.agree >= POP * 0.999, `${R.agree} agree, ${R.ties} near-ties, ${POP - R.agree - R.ties} disagree`);
        ok("  the scorer's cap is a cap: three learners through a ten-thousand scorer score the same, and one over the cap is refused", R.fewOk && /exceeds the scorer/.test(R.refused || ""));
        ok("REFUSED on WebGL2: a compute pass has no WebGL2 half, and the module says so", /needs WebGPU/.test(R.gl2 || ""), R.gl2);
        report(`the dispatch and its readback took ${R.tGpu.toFixed(1)} ms on SwiftShader, the twin ${R.tCpu.toFixed(1)} ms on this CPU -- a software GPU against a real CPU, so the ratio is not the finding; the agreement is`);
    }
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4318.
//   A  the tanh dropped from every layer (a linear net) -> exit=1, 5 red: scores part from the twin by 1.31, 1,246 of 10,000
//      learners choose differently, and the source lines that count the tanh calls are red.
//   B  every neuron reading neuron 0's bias -> exit=1, 3 red: scores part by 1.02 and 1,122 learners choose differently. The
//      FIRST measurement of this sabotage was GREEN: FlightPolicy.init zeroes its biases, so a population of fresh policies
//      could not tell the wrong bias from the right one. packPopulation now jitters every parameter (spread 0.3) so the
//      biases matter, and the sabotage is seen. A gate that cannot see a wrong bias is not grading the bias.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the TRAINING. The economy's step() asks its policy synchronously, so a population's economies are not stepped in " +
    "lockstep and this scorer is not inside trainTraderES; what is graded is the forward pass of a population, which is the part a " +
    "GPU does. And a real GPU's tanh() against SwiftShader's.");
process.exit(fails ? 1 : 0);
