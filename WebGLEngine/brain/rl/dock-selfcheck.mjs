// headless self-check: the docking policy learns thruster control -- untrained can't dock, trained does.
import { FlightPolicy, evaluate, trainDockES } from "./dockPolicy.js";
const before = evaluate(new FlightPolicy({ hidden: [16, 16], seed: 3 }).getParams(), { episodes: 40 });
const { params, best } = trainDockES({ iters: 60, pop: 20, sigma: 0.12, lr: 0.08, trainEps: 10, seed: 3 });
const after = evaluate(params, { episodes: 40 });
console.log("UNTRAINED: dockRate " + (before.dockRate * 100).toFixed(0) + "%  avgDist " + before.avgDist.toFixed(0) + "u");
console.log("TRAINED:   dockRate " + (after.dockRate * 100).toFixed(0) + "%  avgDist " + after.avgDist.toFixed(0) + "u");
const learned = after.dockRate >= before.dockRate + 0.25 && after.avgDist < before.avgDist * 0.5;
console.log("result: " + (learned ? "PASS -- policy learned to dock (thruster control with momentum/drift)" : "WEAK"));
process.exit(learned ? 0 : 1);
