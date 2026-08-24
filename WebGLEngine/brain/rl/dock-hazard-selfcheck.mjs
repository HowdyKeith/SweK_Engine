// headless self-check: the policy learns to dock a MOVING target through an ASTEROID field. Untrained it can't
// reach the drifting dock at all; trained it threads the field and docks the majority of the time.
import { FlightPolicy, evaluate, trainDockES } from "./dockPolicy.js";
import { DockHazardEnv } from "./dockHazardEnv.js";
const mk = (o) => new DockHazardEnv({ ...o, hazards: 3 });
const cfg = { envFactory: mk, obsDim: 8, hidden: [32, 32] };
const before = evaluate(new FlightPolicy({ ...cfg, seed: 5 }).getParams(), { ...cfg, episodes: 40 });
// v3969 -- THIS GATE TRAINS EVERY SHIP ROUND AND CONTRIBUTED NOTHING TO THE LESSON CORPUS. That was the real
// "cadence gap": not that nothing runs on a timer, but that the things which DO run were not observed. The
// import is dynamic and its failure is swallowed -- a gate about docking must not go red because a lesson file
// could not be written.
let _watch = { onIter: undefined, flush: () => {} };
try { const L = await import("./lessons.mjs");
      // v3969 -- THE READ SIDE. What prior runs of this environment got stuck on, worst-first by how
      // long each plateau held. Printed rather than acted on: this is a note to whoever reads the gate
      // output, not an input to the trainer -- a retrieval step that silently changed hyperparameters
      // would make every future run un-reproducible from its own source.
      console.log(L.lessonsBrief("dockHazardEnv"));
      _watch = L.watchTraining({ env: "dockHazardEnv", params: { iters: 100, pop: 24, sigma: 0.13, lr: 0.09, trainEps: 10, seed: 5, hazards: 3 } }); } catch {}
const { params } = trainDockES({ ...cfg, iters: 100, pop: 24, sigma: 0.13, lr: 0.09, trainEps: 10, seed: 5, onIter: _watch.onIter });
_watch.flush();
const after = evaluate(params, { ...cfg, episodes: 40 });
console.log("UNTRAINED: dock " + (before.dockRate * 100).toFixed(0) + "%  avgDist " + before.avgDist.toFixed(0) + "u");
console.log("TRAINED:   dock " + (after.dockRate * 100).toFixed(0) + "%  avgDist " + after.avgDist.toFixed(0) + "u");
const learned = after.dockRate >= 0.4 && after.avgDist < before.avgDist * 0.2;
console.log("result: " + (learned ? "PASS -- learned to dock a moving target through a hazard field" : "WEAK"));
process.exit(learned ? 0 : 1);
