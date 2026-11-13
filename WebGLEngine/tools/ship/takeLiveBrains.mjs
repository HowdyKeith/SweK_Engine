// WebGLEngine/tools/ship/takeLiveBrains.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeLiveBrains.mjs [--seconds 10] [--kind head-on] [--seed 1]      (about a minute; prints, writes nothing)
//
// HOW MANY NETWORKS CAN A FLEET ACTION ASK IN REAL TIME ON THIS BOX? Keith's question ("how much live brains can we achieve"), answered by measurement and for THIS machine only. A LIVE BRAIN is brain/battleshipDuel.mjs's: a network asked for a decision in a tick -- a gun seat's hand, a helm's correction,
// an escort's pilot. Both sides of a brain/battleshipDuel.mjs fight are given the shipped brain files the way a peer's would arrive (sideFromBrains: the fruit fly's gunner and the GPU Brain's dealt round the seats, the fruit fly's pilot and the GPU Brain's round the escorts, a helm network with the zero
// weights -- NO HELM WAS TRAINED, so the helm's network is asked and corrects nothing), the fight is stepped for the first `--seconds` of each fleet size, and each tick is timed.
//
//   seated     the networks the two sides brought (13 seats and a helm a ship, a pilot an escort)
//   peak/mean  the most asked in one tick and the mean a tick: a seat with no target in its arc is not asked, a dead craft's are not
//   ms/tick    the WHOLE tick -- the arena's physics, sights, rounds and hit tests and the networks -- mean and 95th percentile; the budget is 33.3 ms (the arena's 30 Hz)
//   x real     33.3 over the mean: above 1 the fight runs faster than it is watched
//
// WHAT THIS IS NOT: a figure for a browser page (a page also draws), for the rig or any peer (one box, its cores named in the output; the networks run on ONE core here), or for the GPU (brain/seatGunnerGpu.mjs's batch: on a software adapter a read-back costs more than the passes it saves, its own gate says).
// The last table is the networks ALONE, a forward pass of each timed in a loop: it says what the count would be if nothing but the networks ran, and the fleet table says the arena reaches its budget long before that.
"use strict";
import fs from "node:fs";
import os from "node:os";
import * as D from "../../brain/battleshipDuel.mjs";
import * as SA from "../../brain/spaceArena.mjs";
import * as SG from "../../brain/seatGunnerPolicy.mjs";
import * as SM from "../../brain/seatGunnerMlp.mjs";
import * as HP from "../../brain/helmPolicy.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import * as PM from "../../brain/pilot6dofMlp.mjs";

export const BUDGET_MS = 1000 / 30;
export const FLEETS = Object.freeze([[1, 0], [1, 4], [1, 12], [2, 8], [3, 12], [4, 12]]);   // [ships, escorts] a side
const J = (f) => JSON.parse(fs.readFileSync(new URL("../../brain/" + f, import.meta.url), "utf8"));
/** The shipped brains as a peer's files would arrive, plus a helm with the zero weights (the rule: no helm was trained). */
export function shippedBrains() {
    const pil = J("pilot6dofWeightsDefault-d18.json");
    return [J("seatGunnerWeightsDefault.json"), J("seatGunnerMlpWeightsDefault.json"), { ...pil, policy: "helmPolicy", weights: Array.from(HP.handWeights()), by: "the zero weights: the rule (no helm was trained)", score: null }, pil, J("pilot6dofMlpWeightsDefault.json")];
}
/** Step one fleet size for `seconds` and time every tick: { ships, escorts, seated, peak, mean, ms: { mean, p95, max }, xReal, ticks, flying (crafts still flying at the end), crafts }. */
export function measure(ships, escorts, { seconds = 10, kind = "head-on", seed = 1, now = () => performance.now() } = {}) {
    const side = (id) => D.sideFromBrains(id, shippedBrains()).side, A = side("a"), B = side("b"), b = D.build(A, B, seed, kind, { ships, escorts, seconds }), ts = [];
    let peak = 0;
    while (!b.arena.done) { b.count.tick = 0; const t0 = now(); SA.stepSpaceArena(b.arena); ts.push(now() - t0); if (b.count.tick > peak) peak = b.count.tick; }
    const sorted = ts.slice().sort((x, y) => x - y), mean = ts.reduce((x, y) => x + y, 0) / ts.length;
    return { ships, escorts, seated: D.seatedBrains(A, { ships, escorts }).total + D.seatedBrains(B, { ships, escorts }).total, peak, mean: b.count.asked / ts.length, ms: { mean, p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted[sorted.length - 1] }, xReal: BUDGET_MS / mean, ticks: ts.length, flying: b.arena.crafts.filter((c) => !c.dead).length, crafts: b.arena.crafts.length };
}
/** A forward pass of each network, timed alone: [{ name, weights, us }]. */
export function forwardCosts({ n = 50000, now = () => performance.now() } = {}) {
    const x = new Float32Array(12).fill(0.3), W = (f) => Float32Array.from(J(f).weights);
    return [["the fruit fly's gunner", SG, W("seatGunnerWeightsDefault.json")], ["the GPU Brain's gunner (its CPU twin)", SM, W("seatGunnerMlpWeightsDefault.json")], ["the fruit fly's pilot and helm", P6, W("pilot6dofWeightsDefault-d18.json")], ["the GPU Brain's pilot (its CPU twin)", PM, W("pilot6dofMlpWeightsDefault.json")]].map(([name, mod, w]) => {
        for (let i = 0; i < 5000; i++) mod.forward(w, x);
        const t0 = now(); for (let i = 0; i < n; i++) mod.forward(w, x);
        return { name, weights: w.length, us: (now() - t0) * 1000 / n };
    });
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
        const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; }, seconds = Number(arg("seconds", 10)), kind = arg("kind", "head-on"), seed = Number(arg("seed", 1));
        console.log(`[takeLiveBrains] this box: ${os.cpus().length} x ${os.cpus()[0]?.model || "unknown cpu"}, node ${process.version}; the first ${seconds} s of a ${kind} fight, seed ${seed}; networks on one core`);
        console.log("  ships+escorts a side | crafts | seated | asked a tick: peak, mean | ms a tick: mean, p95, max | x real time | flying at the end");
        const rows = FLEETS.map(([s, e]) => { const r = measure(s, e, { seconds, kind, seed }); console.log(`  ${s}+${e} | ${r.crafts} | ${r.seated} | ${r.peak}, ${r.mean.toFixed(1)} | ${r.ms.mean.toFixed(2)}, ${r.ms.p95.toFixed(2)}, ${r.ms.max.toFixed(2)} | ${r.xReal.toFixed(1)} | ${r.flying}`); return r; });
        const inBudget = rows.filter((r) => r.ms.p95 <= BUDGET_MS), best = inBudget.sort((x, y) => y.seated - x.seated)[0];
        console.log(best ? `  THE LARGEST OF THESE THAT KEEPS ITS 95th-PERCENTILE TICK INSIDE 33.3 ms: ${best.ships}+${best.escorts} a side, ${best.seated} networks seated, ${best.peak} asked in its busiest tick` : "  NONE OF THESE keeps its 95th-percentile tick inside 33.3 ms on this box");
        console.log("  the networks alone (one forward pass, timed in a loop):");
        for (const c of forwardCosts()) console.log(`    ${c.name} (${c.weights} weights): ${c.us.toFixed(1)} us -> ${Math.floor(BUDGET_MS * 1000 / c.us)} passes in one 33.3 ms tick on one core`);
        process.exit(0);
    }
}
