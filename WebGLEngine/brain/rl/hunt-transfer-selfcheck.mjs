// headless: train a policy to HUNT (fleeing target), then show it TRANSFERS to INTERCEPT (crossing target) --
// better than random immediately, and fine-tunes to competence faster than training intercept from scratch.
import { createTrainer } from "./idleTrainer.js";
import { evaluate, FlightPolicy } from "./dockPolicy.js";
import { HuntEnv } from "./huntEnv.js";

const OBS = 7, HID = [16, 16];
const flee = (o) => new HuntEnv({ ...o, mode: "flee" });
const cross = (o) => new HuntEnv({ ...o, mode: "cross" });
const catchRate = (params, mk) => evaluate(params, { envFactory: mk, obsDim: OBS, hidden: HID, episodes: 40 }).dockRate;

// 1. train the hunt policy (fleeing target)
const hunter = createTrainer({ envFactory: flee, obsDim: OBS, hidden: HID, seed: 5, pop: 16, trainEps: 6 });
for (let i = 0; i < 34; i++) hunter.step(1);
const huntPolicy = hunter.best();
console.log("1. trained HUNT (flee): catch " + (catchRate(huntPolicy, flee) * 100).toFixed(0) + "% on its own task");

// 2. zero-shot transfer to intercept (crossing target) vs a random policy
const rnd = new FlightPolicy({ hidden: HID, seed: 99, obsDim: OBS }).getParams();
const rndCross = catchRate(rnd, cross), transferCross = catchRate(huntPolicy, cross);
console.log("2. INTERCEPT (cross), zero-shot: random " + (rndCross * 100).toFixed(0) + "% vs transferred hunt policy " + (transferCross * 100).toFixed(0) + "% -> " + (transferCross > rndCross + 0.15 ? "POSITIVE TRANSFER (hunt skill helps intercept)" : "weak transfer"));

// 3. fine-tune from the transferred policy vs from scratch, same small budget
const BUDGET = 12;
const ft = createTrainer({ envFactory: cross, obsDim: OBS, hidden: HID, seed: 7, pop: 16, trainEps: 6 }); ft.setParams(huntPolicy);
for (let i = 0; i < BUDGET; i++) ft.step(1);
const scratch = createTrainer({ envFactory: cross, obsDim: OBS, hidden: HID, seed: 7, pop: 16, trainEps: 6 });
for (let i = 0; i < BUDGET; i++) scratch.step(1);
const ftRate = catchRate(ft.best(), cross), scRate = catchRate(scratch.best(), cross);
console.log("3. fine-tune intercept " + BUDGET + " iters: from-hunt " + (ftRate * 100).toFixed(0) + "% vs from-scratch " + (scRate * 100).toFixed(0) + "% -> " + (ftRate > scRate + 0.1 ? "TRANSFER CONVERGES FASTER (warm start wins)" : "similar"));
console.log("result: " + (transferCross > rndCross + 0.15 && ftRate >= scRate ? "SHARED-ENCODER TRANSFER WORKS: one skill seeds another task" : "check"));
