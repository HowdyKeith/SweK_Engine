// headless self-check: the docking policy learns thruster control -- untrained can't dock, trained does.
import { FlightPolicy, evaluate, trainDockES } from "./dockPolicy.js";
const before = evaluate(new FlightPolicy({ hidden: [16, 16], seed: 3 }).getParams(), { episodes: 40 });
// v3969 -- observed so this round's run contributes to the lesson corpus; see dock-hazard-selfcheck.
let _watch = { onIter: undefined, flush: () => {} };
try { const L = await import("./lessons.mjs");
      // v3969 -- THE READ SIDE. What prior runs of this environment got stuck on, worst-first by how
      // long each plateau held. Printed rather than acted on: this is a note to whoever reads the gate
      // output, not an input to the trainer -- a retrieval step that silently changed hyperparameters
      // would make every future run un-reproducible from its own source.
      console.log(L.lessonsBrief("dockEnv"));
      _watch = L.watchTraining({ env: "dockEnv", params: { iters: 60, pop: 20, sigma: 0.12, lr: 0.08, trainEps: 10, seed: 3 } }); } catch {}
const { params, best } = trainDockES({ iters: 60, pop: 20, sigma: 0.12, lr: 0.08, trainEps: 10, seed: 3, onIter: _watch.onIter });
_watch.flush();
const after = evaluate(params, { episodes: 40 });
console.log("UNTRAINED: dockRate " + (before.dockRate * 100).toFixed(0) + "%  avgDist " + before.avgDist.toFixed(0) + "u");
console.log("TRAINED:   dockRate " + (after.dockRate * 100).toFixed(0) + "%  avgDist " + after.avgDist.toFixed(0) + "u");
const learned = after.dockRate >= before.dockRate + 0.25 && after.avgDist < before.avgDist * 0.5;
console.log("result: " + (learned ? "PASS -- policy learned to dock (thruster control with momentum/drift)" : "WEAK"));
process.exit(learned ? 0 : 1);
