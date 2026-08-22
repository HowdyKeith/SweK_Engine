// dock-hazards-worker.js -- runs the evolution-strategy training off the main thread so the demo stays live
// while the GPU Brain learns. Posts {progress} per checkpoint and {done, params} at the end.
import { trainDockES, evaluate, FlightPolicy } from "./brain/rl/dockPolicy.js";
import { DockHazardEnv } from "./brain/rl/dockHazardEnv.js";

const mk = (o) => new DockHazardEnv({ ...o, hazards: 3 });
const cfg = { envFactory: mk, obsDim: 8, hidden: [32, 32] };

self.onmessage = (e) => {
    if (!e.data || e.data.cmd !== "train") return;
    const seed = e.data.seed || 5;
    const before = evaluate(new FlightPolicy({ ...cfg, seed }).getParams(), { ...cfg, episodes: 30 });
    self.postMessage({ before });
    const { params, history } = trainDockES({ ...cfg, iters: e.data.iters || 100, pop: 24, sigma: 0.13, lr: 0.09, trainEps: 10, seed });
    for (const h of history) self.postMessage({ progress: h });
    const after = evaluate(params, { ...cfg, episodes: 40 });
    self.postMessage({ done: true, params: Array.from(params), before, after });
};
