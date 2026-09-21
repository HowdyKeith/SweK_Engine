// WebGLEngine/tools/gunnerTraceDemo-selfcheck.mjs
//
// Run: node tools/gunnerTraceDemo-selfcheck.mjs
//
// GATES brain/gunnerTraceDemo.json (tools/bakeGunnerTrace.mjs's baked output, fly-connectome.html's
// gunner-replay mode) two ways: structural shape checks against the committed file (fast), and a full
// re-run of the bake tool's own logic (real box3d physics, ~10s) compared byte-for-byte against what's
// committed -- the same "don't trust a baked number, re-derive it" discipline
// tools/maleCnsLoader-selfcheck.mjs already holds vendor/male-cns/giant-fiber-circuit.json to.
//
// THE STRUCTURAL CLAIM THIS FILE EXISTS TO PROVE: the hand gunner's recurrent core is an exact identity
// (brain/gunnerPolicy.mjs's own header proves this mathematically), so its trace must show EXACTLY units
// 0-7 ever active and NEVER any of 8-33 -- not "mostly 8", not "about 8", exactly {0,1,2,3,4,5,6,7}. The
// trained gunner is free to use the connectome core and measurably does, so its nonzero-unit count must be
// STRICTLY GREATER than the hand gunner's -- not pinned to today's exact 23, since ES training is sensitive
// to brain/gunnerPolicy.mjs's own code and a future change there would legitimately move that number without
// it being a regression, the way changing WEIGHT_COUNT already does.
//
// SABOTAGE LOG:
//   N  handWeights() given one nonzero recurrent weight by hand (w[FEATURES*HIDDEN+HIDDEN] = 3, breaking the
//      identity claim) -> 3 red across two files, not the 2 a first guess assumed: brain/gunnerPolicy-
//      selfcheck.mjs's own "Wrec=0 -> exact identity" check AND its "hand gunner's rule reads off its outputs
//      UNCHANGED" check (both go red immediately, reading gunnerPolicy.mjs live) -- but THIS file's section 2
//      ("exactly units 0-7") stayed GREEN, because it reads the STATIC committed brain/gunnerTraceDemo.json,
//      which the sabotage never touched. Only section 3, which reruns the duel fresh, caught it -- on the
//      "byte-identical to committed" check specifically, not on hits/shots (a small recurrent leak shifted
//      the trajectory without changing which shots happened to land). Measured, not assumed: a static-file
//      check and a re-derive-from-scratch check are not redundant, and this sabotage is why section 3 exists
//      even though section 2 already looks thorough.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initNode, mod } from "../physics/box3d/box3dNode.mjs";
import { worldFromModule } from "../render/slugTicker.mjs";
import { mlpLayerCpu } from "../render/brainTsl.mjs";
import * as G from "../brain/gunnerPolicy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TRACE_PATH = path.join(ROOT, "brain", "gunnerTraceDemo.json");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

console.log("gunnerTraceDemo-selfcheck -- the baked gunner-replay trace, structurally and re-derived from scratch\n");

console.log("1. *** THE BAKED FILE'S OWN SHAPE ***");
let data = null;
{
    ok("brain/gunnerTraceDemo.json exists", fs.existsSync(TRACE_PATH));
    if (fs.existsSync(TRACE_PATH)) {
        data = JSON.parse(fs.readFileSync(TRACE_PATH, "utf8"));
        ok("dt is 1/60 (the physics tick this whole engine steps at)", Math.abs(data.dt - 1 / 60) < 1e-9);
        ok("hiddenCount matches brain/gunnerPolicy.mjs's own HIDDEN", data.hiddenCount === G.HIDDEN, `${data.hiddenCount} vs ${G.HIDDEN}`);
        ok("two traces, hand and trained", data.traces.length === 2 && data.traces.map((t) => t.label).sort().join() === "hand,trained");
        for (const t of data.traces) {
            ok(`${t.label}: ticks.length matches duelSeconds/dt`, t.ticks.length === Math.round(data.duelSeconds / data.dt), `${t.ticks.length} vs ${Math.round(data.duelSeconds / data.dt)}`);
            ok(`${t.label}: every tick carries ${G.HIDDEN} hidden values and ${G.OUTPUTS} outputs`, t.ticks.every((tk) => tk.hidden.length === G.HIDDEN && tk.output.length === G.OUTPUTS));
            ok(`${t.label}: hits/shots/drops/burned are non-negative integers, score is finite`, Number.isInteger(t.hits) && t.hits >= 0 && Number.isInteger(t.shots) && t.shots >= 0 && Number.isInteger(t.drops) && t.drops >= 0 && Number.isInteger(t.burned) && t.burned >= 0 && Number.isFinite(t.score));
        }
    }
}

console.log("\n2. *** THE STRUCTURAL CLAIM: THE HAND GUNNER'S TRACE NEVER LEAVES ITS 8 CHANNELS, THE TRAINED ONE DOES ***");
if (data) {
    const hand = data.traces.find((t) => t.label === "hand"), trained = data.traces.find((t) => t.label === "trained");
    const nonzeroUnits = (trace) => { const s = new Set(); for (const tk of trace.ticks) tk.hidden.forEach((v, i) => { if (Math.abs(v) > 1e-3) s.add(i); }); return s; };
    const handUnits = nonzeroUnits(hand), trainedUnits = nonzeroUnits(trained);
    ok("!! *** the hand gunner's trace is active in EXACTLY units 0-7, never 8 or later -- the identity claim, measured against the actual recorded duel, not just asserted about the weights ***",
        [...handUnits].sort((a, b) => a - b).join() === "0,1,2,3,4,5,6,7", `active units: ${[...handUnits].sort((a, b) => a - b).join(",")}`);
    ok("hand.nonzeroUnitCount (baked) agrees with a fresh count over the baked ticks", hand.nonzeroUnitCount === handUnits.size);
    ok("!! *** the trained gunner's trace reaches strictly more units than the hand gunner's -- the connectome core is genuinely exercised by training, not just present ***",
        trainedUnits.size > handUnits.size, `trained ${trainedUnits.size} vs hand ${handUnits.size}`);
    report(`measured this run: hand ${handUnits.size}/${G.HIDDEN}, trained ${trainedUnits.size}/${G.HIDDEN} -- exact counts, not bounds, and worth re-reading if brain/gunnerPolicy.mjs's training ever changes`);
    ok("meanActivation is baked and positive for both (fly-connectome.html's per-trace color scale)", hand.meanActivation > 0 && trained.meanActivation > 0);
    ok("!! the two traces' meanActivation differ by more than an order of magnitude -- exactly why a single fixed color scale would leave one of them looking flat",
        trained.meanActivation / hand.meanActivation > 10, `${trained.meanActivation} / ${hand.meanActivation} = ${(trained.meanActivation / hand.meanActivation).toFixed(1)}x`);
}

console.log("\n3. *** RE-DERIVED FROM SCRATCH: THE SAME BAKE, RUN AGAIN, MUST MATCH THE COMMITTED FILE EXACTLY ***");
{
    const st = await initNode();
    if (!st.ready) { console.log("  FAIL  box3d wasm: " + st.reason + " -- the wasm is the substrate this trace was recorded on"); fails++; }
    else {
        const m = mod(), worldFrom = () => worldFromModule(m, [0, -9.81, 0]);
        const TRAIN_SEED = 7, TRAIN_ITERS = 30, TRAIN_SECONDS = 15, DUEL_SEED = 1, DUEL_SECONDS = 10;
        const ROUND = (v) => Math.round(v * 1000) / 1000;
        const recordDuel = (weights) => {
            const ticks = [];
            const result = G.duel(worldFrom, weights, {
                seed: DUEL_SEED, seconds: DUEL_SECONDS,
                onTick: (t, x, cmd) => {
                    const layers = G.layersOf(weights);
                    let h = Float32Array.from(x);
                    for (let i = 0; i < layers.length - 1; i++) h = mlpLayerCpu(layers[i], h, 1);
                    ticks.push({ t, hidden: Array.from(h, ROUND), output: [cmd.yaw, cmd.pitch, cmd.fire, cmd.drop, cmd.ignite].map(ROUND) });
                },
            });
            return { result, ticks };
        };
        const trained = G.train(worldFrom, { seed: TRAIN_SEED, iters: TRAIN_ITERS, seconds: TRAIN_SECONDS });
        const freshHand = recordDuel(G.handWeights()), freshTrained = recordDuel(trained.weights);

        const sameTicks = (a, b) => a.length === b.length && a.every((tk, i) => tk.hidden.every((v, k) => v === b[i].hidden[k]) && tk.output.every((v, k) => v === b[i].output[k]));
        ok("!! the hand duel re-run reaches the SAME fingerprint and hit count as the baked trace implies",
            freshHand.result.hits === data.traces.find((t) => t.label === "hand").hits && freshHand.result.shots === data.traces.find((t) => t.label === "hand").shots);
        ok("!! ...and its full per-tick activation trace is BYTE-IDENTICAL to what's committed, not just the summary", sameTicks(freshHand.ticks, data.traces.find((t) => t.label === "hand").ticks));
        // A byte-identical trained trace already IMPLIES the ES retrained to the identical weights (a different
        // weight vector would almost certainly produce a different activation sequence) -- a separate weight-hash
        // comparison would be redundant with this, not an extra guarantee, so it is not asserted twice.
        ok("!! the trained duel re-run's full activation trace is BYTE-IDENTICAL to what's committed -- which is only possible if the ES retrained to the identical weights AND the duel replayed identically",
            sameTicks(freshTrained.ticks, data.traces.find((t) => t.label === "trained").ticks));
    }
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
