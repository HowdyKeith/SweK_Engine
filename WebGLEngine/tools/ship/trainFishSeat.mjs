// WebGLEngine/tools/ship/trainFishSeat.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE COMMAND that trains the fish's gun seat (brain/seatGunnerFish.mjs) with tools/ship/trainSeatGunner.mjs's own procedure -- its run(): the searches from the hand weights, the champion on the held-out fights, the audit fights read once, the same fights, sight (green) and recipe the fruit fly's and the GPU Brain's
// hands were trained with -- so that the three can be set side by side. That library's command (trainGunnerSeat.mjs) and its file-writer know two networks by name; this is the third, and its control.
//
//     node tools/ship/trainFishSeat.mjs --net fish                 # report only (about forty minutes of one core)
//     node tools/ship/trainFishSeat.mjs --net control              # the random circuit of the fish's size: report only, NEVER written (it is a control, not a brain to seat)
//     node tools/ship/trainFishSeat.mjs --net fish --write         # write brain/seatGunnerFishWeightsDefault.json when the champion qualifies
//
// *** NO EXPORTS ON PURPOSE: a command-line entry point and not a module. The libraries it imports are what the gates hold. ***
"use strict";
import fs from "node:fs";
import * as TS from "./trainSeatGunner.mjs";
import * as SF from "../../brain/seatGunnerFish.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const argv = process.argv.slice(2), flag = (k) => argv.includes("--" + k), val = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const known = ["net", "runs", "iters", "seed", "write", "out"], bad = argv.filter((a) => a.startsWith("--") && !known.includes(a.slice(2)));
const which = val("net", "fish");
if (bad.length || !["fish", "control"].includes(which)) { console.error(`trainFishSeat: ${bad.length ? `unknown option ${bad.join(", ")} (known: ${known.map((k) => "--" + k).join(", ")})` : `--net is fish or control (got ${which})`}`); process.exit(2); }
if (which === "control" && flag("write")) { console.error("trainFishSeat: the control is never written (it is a control, not a brain to seat)"); process.exit(2); }
const net = which === "fish" ? SF : SF.control, opts = { ...TS.RECIPE, runs: Number(val("runs", TS.RECIPE.runs)), iters: Number(val("iters", TS.RECIPE.iters)), seed: Number(val("seed", TS.RECIPE.seed)) }, out = val("out", new URL("../../brain/seatGunnerFishWeightsDefault.json", import.meta.url).pathname);
console.log(`the ${which === "fish" ? "fish's circuit (the Fish1 TEN core)" : `control (a random circuit of the fish's size, seed ${SF.CONTROL_SEED})`} in the gun seats: ${opts.runs} searches of ${opts.iters} iterations from seed ${opts.seed}`);
/** What the wiring did, said in the file: how many of the circuit's synapses carry a weight in the champion. With none, the champion is the same gunner over ANY wiring of this size. */
const synapseLine = (w) => { const from = net.FEATURES * net.HIDDEN + net.HIDDEN; let n = 0; for (let k = 0; k < net.REC_EDGES; k++) if (w[from + k] !== 0) n++; return n ? `${n} of the circuit's ${net.REC_EDGES} synapses carry a weight` : `NOT ONE of the circuit's ${net.REC_EDGES} synapses carries a weight: every weight that moved is on the hand path, so this is the same gunner over any wiring of this size and the fish's wiring did nothing here`; };
const result = TS.run(net, opts, (m) => console.log(m));
console.log("the champion: " + synapseLine(result.champion.weights));
if (flag("write")) {
    if (!result.verdict.ok) { console.log("not written: " + result.verdict.reasons.join("; ")); process.exit(1); }
    const c = result.champion, f = (l) => l.map((x) => x.kind + x.seed).join(",");
    const by = `tools/ship/trainSeatGunner.mjs's procedure on the fish's circuit (tools/ship/trainFishSeat.mjs): sparse-mutation (1+1)-ES from the hand weights, seed ${c.seed} of ${opts.runs} runs (${opts.seed}..${opts.seed + opts.runs - 1}), sigma ${opts.sigma}, 1-${opts.maxK} weights per child, ${opts.iters} iterations (strict improvements only; ${Math.round(opts.liveShare * 100)}% of the children bred from the ${net.liveIndices().length} live weights) over the train fights (${f(TS.TRAIN_FIGHTS)}; ${TS.SECONDS} s, the ${TS.SIGHT} sight, PD-autopilot fighters), then pruned (at most ${opts.passes} passes): ${c.kept} of ${net.WEIGHT_COUNT} weights differ from the hand gunner; ` +
        `champion picked on held-out (${f(TS.HELD_OUT_FIGHTS)}); behind the ${TS.SIGHT} sight: held-out ${TS.describeEval(c.heldOut)}, audit (${f(TS.AUDIT_FIGHTS)}) ${TS.describeEval(c.audit)}; the hand gunner scores ${TS.describeEval(result.hand.audit)} on the same audit; behind the sights it was NOT trained for, on the audit fights (the hand gunner's score -> the champion's): ${TS.describeOthers(result.others)}; ${synapseLine(c.weights)}`;
    const blob = PB.exportBrain(PB.describePolicy("seatGunnerFish", SF), c.weights, { score: Number(c.heldOut.score.toFixed(3)), by, citation: "Fish1 larval-zebrafish EM connectome, the TEN analysis set's 34-neuron core (vendor/zebrafish/PROVENANCE.md)" });
    fs.writeFileSync(out, JSON.stringify(blob) + "\n");
    console.log(`wrote ${out}: ${blob.weightCount} weights, hash ${weightsHash(c.weights)}`);
}
