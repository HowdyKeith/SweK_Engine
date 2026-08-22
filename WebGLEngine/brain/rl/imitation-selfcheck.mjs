// headless: record a scripted expert's behavior, clone a policy from the demos alone (no reward), verify it matches.
import { huntExpert, recordDemos, cloneFromDemos } from "./imitation.js";
import { HuntEnv } from "./huntEnv.js";

const OBS = 7, HID = [16, 16], flee = (o) => new HuntEnv({ ...o, mode: "flee" });
// measure any action function's catch rate directly
function rateOf(actFn, mk, K = 40) { let c = 0; for (let e = 0; e < K; e++) { const env = mk({}); let o = env.reset(5000 + e); for (let t = 0; t < env.maxSteps; t++) { const r = env.step(actFn(o)); o = r.obs; if (r.done) { if (r.info.caught) c++; break; } } } return c / K; }
const exRate = rateOf(huntExpert, flee);
console.log("1. scripted expert catches " + (exRate * 100).toFixed(0) + "% (the behavior we're cloning)");

// 2. record demos + clone from them ALONE (no reward)
const demos = recordDemos(huntExpert, flee, { episodes: 40 });
console.log("2. recorded " + demos.obs.length + " (obs,action) pairs from the expert");
const { params, loss } = cloneFromDemos(demos, { obsDim: OBS, actDim: 2, hidden: HID, epochs: 260, lr: 0.05 });
console.log("3. behavioral-clone trained: action MSE " + loss.toFixed(4));

// 3. does the clone reproduce the expert? (catch rate close to the expert's, learned with zero reward)
import { FlightPolicy } from "./dockPolicy.js";
const clone = new FlightPolicy({ obsDim: OBS, actDim: 2, hidden: HID }); clone.setParams(params);
const clRate = rateOf((o) => clone.act(o), flee);
console.log("4. CLONE catches " + (clRate * 100).toFixed(0) + "% (from demos only, no RL) vs expert " + (exRate * 100).toFixed(0) + "%");
console.log("result: " + (loss < 0.05 && clRate >= exRate - 0.15 ? "IMITATION WORKS: the brain learned the behavior from demonstrations" : "check"));
