// drive-brain-worker.js -- trains the driving policy off the main thread so the car keeps driving while the
// GPU Brain learns. Posts {before} up front, {progress} on every iteration through trainDockES's onIter
// observer, and {done, params} at the end.
//
// THE EPISODE BUDGET IS PASSED AND IT MATTERS: trainDockES forwards maxSteps into its own evaluations, and
// an episode here needs 157-267 steps to reach a goal and stop. At evaluate()'s default of 200 no episode
// could finish, so the trainer would optimise a task nobody asked for. See brain/rl/dockPolicy.js.
import { trainDockES, evaluate, FlightPolicy } from "./brain/rl/dockPolicy.js";
import { DriveEnv, ROOF_TURRET } from "./brain/rl/driveEnv.js";

const MAX_STEPS = 400;

self.onmessage = (e) => {
    if (!e.data || e.data.cmd !== "train") return;
    const mounts = e.data.turret ? ROOF_TURRET : [];
    const mk = (o = {}) => new DriveEnv({ maxSteps: MAX_STEPS, mounts, ...o });
    const cfg = { envFactory: mk, obsDim: 8, hidden: [16, 16], maxSteps: MAX_STEPS };
    const seed = e.data.seed || 3;
    const iters = e.data.iters || 200;
    self.postMessage({ before: evaluate(new FlightPolicy({ ...cfg, seed }).getParams(), { ...cfg, episodes: 24 }) });
    const { params } = trainDockES({
        ...cfg, iters, pop: 24, sigma: 0.14, lr: 0.05, trainEps: 10, seed,
        onIter: ({ it, ev }) => self.postMessage({ progress: { it, iters, ...ev } }),
    });
    self.postMessage({ done: true, params: Array.from(params), after: evaluate(params, { ...cfg, episodes: 24 }) });
};
