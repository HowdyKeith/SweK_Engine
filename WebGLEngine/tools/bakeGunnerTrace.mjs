// WebGLEngine/tools/bakeGunnerTrace.mjs
//
// Run: node tools/bakeGunnerTrace.mjs [--write]
//
// Records two real duels through brain/gunnerPolicy.mjs's real box3d physics simulation, capturing the
// gunner's actual per-tick hidden-layer activation (the 34 real GFC-circuit units, post-recurrence -- what
// actually feeds the decoder) via duel()'s onTick hook -- for fly-connectome.html's gunner-replay mode, which
// colors the real 3D neuron render by these real numbers rather than a static per-type color.
//
// TWO TRACES, ON PURPOSE, AND THE CONTRAST IS THE WHOLE POINT: the "hand" gunner (handWeights()) leaves the
// recurrent core's weights at zero, which brain/gunnerPolicy.mjs's own header proves is an exact identity --
// its trace will show exactly 8 of the 34 units ever nonzero, always the same 8. The "trained" gunner (a
// fixed-seed ES run) is free to use the connectome-masked core, and measurably does: a 30-iteration run at
// seed 7 was checked by hand before this tool existed and engaged 15-19 of the 34 units, not just 8. Baking
// both lets the replay page show, in real numbers rather than a claim, what "the recurrent core reaches a
// TRAINED gunner and not a designed one" actually looks like.
//
// Deterministic: TRAIN_SEED fixes the ES search (brain/gunnerPolicy-selfcheck.mjs already established that the
// same seed trains the same weights), DUEL_SEED fixes the recorded duel's track and RNG. Reproducing this file
// byte-for-byte is `node tools/bakeGunnerTrace.mjs --write` on an unmodified brain/gunnerPolicy.mjs.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initNode, mod } from "../physics/box3d/box3dNode.mjs";
import { worldFromModule } from "../render/slugTicker.mjs";
import { mlpLayerCpu } from "../render/brainTsl.mjs";
import * as G from "../brain/gunnerPolicy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = path.join(ROOT, "brain", "gunnerTraceDemo.json");

const TRAIN_SEED = 7, TRAIN_ITERS = 30, TRAIN_SECONDS = 15;
const DUEL_SEED = 1, DUEL_SECONDS = 10;
const ROUND = (v) => Math.round(v * 1000) / 1000;

async function main() {
    const st = await initNode();
    if (!st.ready) { console.error("bakeGunnerTrace: box3d wasm not available -- " + st.reason); process.exit(1); }
    const m = mod(), worldFrom = () => worldFromModule(m, [0, -9.81, 0]);

    function recordDuel(weights, label) {
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
        const nonzeroUnits = new Set();
        let sumAbs = 0, nAbs = 0;
        for (const tk of ticks) tk.hidden.forEach((v, i) => { if (Math.abs(v) > 1e-3) { nonzeroUnits.add(i); sumAbs += Math.abs(v); nAbs++; } });
        // meanActivation: the mean magnitude of every nonzero hidden value in this trace, baked in as the
        // per-trace color scale. TWO DIFFERENT RATIOS, NOT ONE -- worth keeping apart: the hand gunner's
        // recurrent core is an identity, so its hidden values never leave the ~[0,1] range its encoder's own
        // feature inputs live in, while the trained gunner's core amplifies them into the hundreds. Measured
        // on this baked file: the two traces' PEAK values differ by ~263x (1.0 vs 263.285), but the MEAN of
        // nonzero values -- the number actually baked here and used as activationColor()'s `scale` -- differs
        // by ~126x (0.662 vs 83.512). Either way a single fixed color scale would leave one trace looking
        // flat; this baked mean, not the peak, is what render/maleCnsLoader.mjs's activationColor() actually
        // takes as `scale` so each trace's own TYPICAL activation reads as clearly lit.
        const meanActivation = nAbs ? ROUND(sumAbs / nAbs) : 1;
        console.log(`[bakeGunnerTrace] ${label}: ${result.hits} hits of ${result.shots} shots, ${result.drops} drops, ${ticks.length} ticks, ${nonzeroUnits.size}/${G.HIDDEN} hidden units ever nonzero, mean|activation| ${meanActivation}`);
        return { label, hits: result.hits, shots: result.shots, drops: result.drops, burned: result.burned, score: ROUND(result.score), fingerprint: result.fingerprint, nonzeroUnitCount: nonzeroUnits.size, meanActivation, ticks };
    }

    const trained = G.train(worldFrom, { seed: TRAIN_SEED, iters: TRAIN_ITERS, seconds: TRAIN_SECONDS });
    console.log(`[bakeGunnerTrace] trained gunner: score ${trained.trainScore.toFixed(2)}, ${trained.accepted} accepted over ${TRAIN_ITERS} iters`);

    const out = {
        dt: 1 / 60,
        duelSeed: DUEL_SEED, duelSeconds: DUEL_SECONDS, trainSeed: TRAIN_SEED, trainIters: TRAIN_ITERS,
        hiddenCount: G.HIDDEN, outputNames: G.OUTPUT_NAMES,
        traces: [
            recordDuel(G.handWeights(), "hand"),
            recordDuel(trained.weights, "trained"),
        ],
    };

    if (process.argv.includes("--write")) {
        fs.writeFileSync(OUT_PATH, JSON.stringify(out));
        console.log(`[bakeGunnerTrace] wrote ${path.relative(ROOT, OUT_PATH)} (${(fs.statSync(OUT_PATH).size / 1024).toFixed(0)} KB)`);
    } else {
        console.log(`[bakeGunnerTrace] dry run (pass --write to write ${path.relative(ROOT, OUT_PATH)})`);
    }
}

main();
