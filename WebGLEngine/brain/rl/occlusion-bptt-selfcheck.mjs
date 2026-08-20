// headless: BPTT the occlusion memory win. A "cheating" expert that sees the target THROUGH the asteroid provides a
// pursuit trajectory; we record the BLANKED observations the real policy would see, paired with the expert's action,
// and BPTT-clone the recurrent MemoryPolicy to reproduce those actions. To match the expert while blind, the memory
// policy must carry the target's motion in its pages. A reflex policy (same demos, behavioral cloning) cannot.
import { MemoryPolicy } from "./memoryPolicy.js";
import { bpttTrain } from "./bptt.js";
import { FlightPolicy } from "./dockPolicy.js";
import { cloneFromDemos } from "./imitation.js";
import { OccludedHuntEnv } from "./occludedHuntEnv.js";

const mk = (o) => new OccludedHuntEnv({ ...o, astR: 200, maxSteps: 150 });
// expert sees the TRUE target (even occluded): lead-pursuit, full thrust
function cheatExpert(env) { const lx = env.tx + env.tvx * 0.35, ly = env.ty + env.tvy * 0.35; let da = Math.atan2(ly - env.y, lx - env.x) - env.h; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283; return [Math.max(-1, Math.min(1, da * 1.8)), 1]; }

// record expert episodes: the blanked obs the policy sees, paired with the expert's action
const episodes = [], flatObs = [], flatAct = [];
for (let e = 0; e < 30; e++) { const env = mk({}); let o = env.reset(200 + e); const inputs = [], targets = [], mask = [];
    for (let t = 0; t < env.maxSteps; t++) { const a = cheatExpert(env); inputs.push(Float32Array.from(o)); targets.push(Float32Array.from(a)); mask.push(1); flatObs.push(Float32Array.from(o)); flatAct.push(Float32Array.from(a)); const r = env.step(a); o = r.obs; if (r.done) break; }
    episodes.push({ inputs, targets, mask }); }
console.log("recorded " + episodes.length + " expert episodes through occlusion");

// BPTT-clone the recurrent memory policy
const mem = new MemoryPolicy(8, 2, { slots: 4, slotDim: 4, hidden: 20, seed: 3 });
bpttTrain(mem, episodes, { epochs: 500, lr: 0.08 });
// behavioral-clone a reflex policy on the same (obs,action) pairs
const { params: reflexParams } = cloneFromDemos({ obs: flatObs, act: flatAct }, { obsDim: 8, actDim: 2, hidden: [20, 20], epochs: 250, lr: 0.05 });
const reflex = new FlightPolicy({ obsDim: 8, actDim: 2, hidden: [20, 20] }); reflex.setParams(reflexParams);

function catchRate(policy, K = 50) { let c = 0; for (let e = 0; e < K; e++) { if (policy.reset) policy.reset(); const env = mk({}); let o = env.reset(9000 + e); for (let t = 0; t < env.maxSteps; t++) { const r = env.step(policy.act(o)); o = r.obs; if (r.done) { if (r.info.caught) c++; break; } } } return c / K; }
const mRate = catchRate(mem), rRate = catchRate(reflex);
console.log("hunt-through-occlusion catch rate (both cloned from the same expert):");
console.log("  reflex clone:        " + (rRate * 100).toFixed(0) + "%");
console.log("  MEMORY clone (BPTT): " + (mRate * 100).toFixed(0) + "%");
console.log("result: " + (mRate > rRate + 0.12 ? "MEMORY WINS THE COMBAT TASK: BPTT taught it to track the target through cover -- the payoff ES could not reach" : "memory " + (mRate * 100).toFixed(0) + " vs reflex " + (rRate * 100).toFixed(0)));
