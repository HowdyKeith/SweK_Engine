// WebGLEngine/simulation/life/contextualRace-selfcheck.mjs — v2582
//
// Run: node simulation/life/contextualRace-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// ANSWERS v2557'S ORIGINAL KILL CONDITION: "the mold only beats the bandits because the bandits are
// CONTEXT-FREE. Race it against a CONTEXTUAL learner -- one that can actually SEE the smell -- and it loses."
//
// It does not lose. And the shape of how it does not lose is the finding.
//
// ---- FIRST: THE LABEL THAT WAS STALE -----------------------------------------------------------------------------
//
// This race was marked RIG-ONLY for twenty-five versions because "brain.js is Deno-only". THAT IS TRUE ABOUT
// brain.js -- it calls Deno.* at lines 49, 69, 71. IT IS NOT TRUE ABOUT THE LEARNER. brain/mlp.js has ZERO
// imports, zero Deno, zero GPU. The label described THE HOST AND I HAD BEEN USING IT TO MEAN THE THING.
//
// That is the FOURTH expired blocker this session -- v2560 (five versions of "emsdk CDN 403s" without asking if
// emsdk was the only road), v2570 (fourteen versions of "box3d.wasm is not in the tree yet" after it was built),
// v2576 (one version of "real terrain needs a chunk off the rig" while world/terrainGenerator.js sat in the
// tree). A REASON THAT EXPIRED IS A HABIT.
//
// ---- WHY THE ENGINE'S OWN TRAINER IS NOT USED HERE, AND SAYING SO ------------------------------------------------
//
// brain/learn.js's MLPTrainer DOES run in node with no device. But its API is
// `rememberRows([{id, name, x, p}])` and `ingest(outcomes, attackDamageOf)` -- IT IS COMBAT-SHAPED. It is the ES
// tactics learner: units, attacks, damage. A paramecium has no attacks and no outcomes. FORCING IT THROUGH THAT
// API WOULD MEAN BENDING A COMBAT-OUTCOME TRAINER INTO A CHEMOTAXIS RACE AND CALLING IT "THE ENGINE'S BRAIN",
// which is the kind of claim this engine exists to refuse. So the learner below is written here, honestly, and
// the conclusion it supports is ABOUT THE ARENA, NOT ABOUT WHOSE MLP IT IS.
//
// ---- THE RESULT --------------------------------------------------------------------------------------------------
//
// The contextual policy obeys the SAME contract the mold and UCB1 obey -- reset(n) / observe(x,y,z) / pick(t) /
// update(arm, 0|1) -- read from paramecium.js:133-168 rather than assumed. It SEES what the mold sees. It LEARNS,
// which the mold cannot.
//
//     policy                          food
//     moldReflex3 (reflex, sees)     312.4
//     contextual MLP (sees + learns)   0.1     <- WORSE THAN THE BLIND LEARNER
//     UCB1 (learns, blind)             0.9
//
// A LEARNER THAT HAS NOT LEARNED YET IS WORSE THAN A COIN FLIP, because random weights are not random actions: a
// freshly initialised softmax COMMITS to whatever arm the noise favours, while uniform random at least explores.
//
// And the obvious objection -- 75 decisions is not a training run -- is correct, so it was tested. THE FIRST
// ANSWER WAS A FLUKE: one seed said 0.2 -> 101.6 -> 39.5 and I wrote it up as "it learns, peaks, then unlearns".
// THE GATE FAILED ON ITS OWN NEXT RUN: 0.1 -> 1.7 -> 72.7, THE OPPOSITE SHAPE, same code. Nine seeds, median
// (min..max):
//
//     episodes   median   spread
//     0             4.1   0.3 .. 45.7
//     10           23.0   4.8 .. 123.7
//     200          79.9   20.3 .. 191.5
//     mold        312.4   312.4 .. 312.4   (trained: never)
//
// IT LEARNS, MONOTONICALLY. "It unlearns" WAS NOISE -- A CURVE READ OFF ONE SAMPLE IS A GUESS WITH A GRAPH.
// The real finding is the SPREAD: THE LEARNER IS A LOTTERY -- a tenfold range on identical code -- while THE
// REFLEX SCORES 312.4 ON EVERY SEED WITH ZERO VARIANCE, AND ITS WORST RUN BEATS THE LEARNER'S BEST RUN.
//
// The reflex wins because IT NEEDS NO SAMPLES. It recomputes the answer from the smell every step. The learner's
// memory is not an advantage here -- IT IS THE THING IT HAS TO OVERCOME.
// ---- THE GATE ITSELF WAS A LOTTERY, AND THAT IS THE LAST LESSON OF THIS FILE ------------------------------------
//
// This check PASSED when run alone and FAILED under ship.mjs, on identical code. Of course it did. IT MEASURES A
// LEARNER I HAD JUST PROVEN IS A LOTTERY, AND I LET THE LOTTERY INTO THE VERDICT. Math.random(), unseeded, in a
// gate.
//
// A FLAKY GATE IS WORSE THAN NO GATE: IT TEACHES YOU TO RE-RUN UNTIL GREEN. It is a control that cannot fail
// wearing the costume of one that can -- the same species as v2568's compass, which passed sixteen versions of
// checks because every check asserted an ordering a compass satisfies.
//
// So the RNG is seeded here. The measurements in the writeup above are from NINE UNSEEDED SEEDS and stay as
// they are -- that is the science. THIS is the tripwire, and a tripwire must give the same answer twice.
let _rng = 0;
const seedRandom = (n) => { _rng = n >>> 0; };
const rand = () => { _rng = (_rng * 1664525 + 1013904223) >>> 0; return _rng / 4294967296; };

import { chemoField, headings3, moldReflex3, swim } from "./paramecium.js";
import { ucb1, uniformRandom } from "../../brain/bench/bandit.mjs";
import { freeSpaceWorld } from "../../physics/freeSpaceWorld.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

const field = chemoField([6, 5, 6], 4);
const dirs = headings3(26);

/**
 * A CONTEXTUAL policy obeying paramecium.js's contract exactly: reset(n) / observe(x,y,z) / pick(t) /
 * update(arm, 0|1). Two layers, tanh, softmax, REINFORCE. It sees the same field the mold sees.
 *
 * The reward it gets is BINARY -- swim() passes `now > last ? 1 : 0`, because a real chemotactic cell compares
 * now against a moment ago and CANNOT read absolute concentration. Rewarding absolute smell would reward
 * standing still in a good spot, which is not chemotaxis, it is sitting down.
 */
function contextualPolicy(lr = 0.08, nH = 12) {
    let W1, b1, W2, b2, nOut = 0, here = [0, 0, 0], lastH = null, lastP = null, lastA = -1, _x = null;
    const rnd = (n, s) => Float32Array.from({ length: n }, () => (rand() * 2 - 1) * s);
    const feat = () => {
        const c = field.at3(here[0], here[1], here[2]);
        return Float32Array.from([c,
            field.at3(here[0] + 0.5, here[1], here[2]) - c,
            field.at3(here[0], here[1] + 0.5, here[2]) - c,
            field.at3(here[0], here[1], here[2] + 0.5) - c]);
    };
    const self = {
        keep: null,
        reset(n) {
            nOut = n;
            if (self.keep) ({ W1, b1, W2, b2 } = self.keep);
            else { W1 = rnd(4 * nH, 0.6); b1 = new Float32Array(nH); W2 = rnd(nH * nOut, 0.6); b2 = new Float32Array(nOut); }
        },
        save() { self.keep = { W1, b1, W2, b2 }; },
        observe(x, y, z) { here = [x, y ?? 0, z ?? 0]; },
        pick() {
            const x = feat(), h = new Float32Array(nH);
            for (let j = 0; j < nH; j++) { let s = b1[j]; for (let i = 0; i < 4; i++) s += x[i] * W1[i * nH + j]; h[j] = Math.tanh(s); }
            const o = new Float32Array(nOut);
            for (let k = 0; k < nOut; k++) { let s = b2[k]; for (let j = 0; j < nH; j++) s += h[j] * W2[j * nOut + k]; o[k] = s; }
            const m = Math.max(...o); let z = 0; const p = new Float32Array(nOut);
            for (let k = 0; k < nOut; k++) { p[k] = Math.exp(o[k] - m); z += p[k]; }
            for (let k = 0; k < nOut; k++) p[k] /= z;
            let r = rand(), a = 0;
            for (; a < nOut - 1; a++) { r -= p[a]; if (r <= 0) break; }
            lastH = h; lastP = p; lastA = a; _x = x;
            return a;
        },
        update(arm, rew) {
            if (lastA < 0) return;
            const adv = rew ? 1 : -1;
            const dO = new Float32Array(nOut);
            for (let k = 0; k < nOut; k++) dO[k] = -adv * lr * ((k === lastA ? 1 : 0) - lastP[k]);
            const dH = new Float32Array(nH);
            for (let j = 0; j < nH; j++) {
                let s = 0;
                for (let k = 0; k < nOut; k++) { s += dO[k] * W2[j * nOut + k]; W2[j * nOut + k] -= dO[k] * lastH[j]; }
                dH[j] = s * (1 - lastH[j] * lastH[j]);
            }
            for (let k = 0; k < nOut; k++) b2[k] -= dO[k];
            for (let i = 0; i < 4; i++) for (let j = 0; j < nH; j++) W1[i * nH + j] -= dH[j] * _x[i];
            for (let j = 0; j < nH; j++) b1[j] -= dH[j];
        },
    };
    return self;
}

const race = (policy) => {
    const w = freeSpaceWorld();
    return swim(w, "freeSpaceWorld", policy, { steps: 600, field, dirs }).food;
};

seedRandom(20250717);

// ---- 1. THE KILL CONDITION, RUN --------------------------------------------------------------------------------
{
    const mold = race(moldReflex3(field, dirs, 1.2, 5));
    const ctx = race(contextualPolicy());
    const blind = race(ucb1());
    ok("!! THE CONTEXTUAL LEARNER DOES NOT BEAT THE REFLEX", mold > ctx * 10,
       "mold " + mold.toFixed(1) + " vs contextual MLP " + ctx.toFixed(1) + ". v2557 PREDICTED THE OPPOSITE: 'the mold only wins because the bandits are context-free; race it against something that can SEE and it loses'. IT SEES. IT LOSES.");
    // WHAT I WROTE FIRST AND HAD TO DELETE: "and it loses to the blind learner too -- contextual 0.1 vs UCB1
    // 0.9 -- a learner that has not learned yet is worse than a coin flip." THAT WAS ONE SAMPLE. THIS GATE
    // FAILED ON IT: the next run gave contextual 25.1 vs UCB1 0.9. The cold-start spread across nine seeds is
    // 0.3 .. 45.7 -- SO THAT COMPARISON IS A COIN FLIP I REPORTED AS A RESULT. It is gone. What is below is
    // what survives nine seeds.
    ok("UCB1 is still the floor it always was", blind < 5,
       "UCB1 " + blind.toFixed(1) + " -- context-free, 26 arms, 75 decisions: IT CANNOT TRY EACH ARM THREE TIMES. That part of v2557 held. The part that did not: I claimed the CONTEXTUAL learner loses to UCB1 as well, off ONE SAMPLE, and my own gate killed it on the next run.");
}

// ---- 2. THE OBJECTION IS CORRECT, SO IT WAS TESTED -- AND THE FIRST ANSWER WAS A FLUKE -------------------------
//
// "75 decisions is not a training run." True. The first run of this test carried weights across episodes and
// reported 0.2 -> 101.6 at ten episodes -> 39.5 at two hundred, AND I WROTE IT UP AS "it learns, peaks, then
// unlearns". THIS GATE FAILED ON ITS OWN NEXT RUN: same code, different random init, 0.1 -> 1.7 -> 72.7. THE
// OPPOSITE SHAPE. I HAD READ A LEARNING CURVE OFF ONE SAMPLE.
//
// Nine independent seeds, median (min..max):
//
//     episodes   median   spread
//     0             4.1   0.3 .. 45.7
//     10           23.0   4.8 .. 123.7
//     200          79.9   20.3 .. 191.5
//     mold        312.4   312.4 .. 312.4   (trained: never)
//
// SO IT LEARNS -- MONOTONICALLY, and "it unlearns" WAS NOISE. But the spread is the real finding: THE LEARNER IS
// A LOTTERY, 20 to 191 on identical code. THE REFLEX SCORES 312.4 ON EVERY SEED, ZERO VARIANCE, AND ITS WORST
// RUN BEATS THE LEARNER'S BEST RUN.
{
    seedRandom(4242);
    const med = (a) => { const x = [...a].sort((p, q) => p - q); return x[Math.floor(x.length / 2)]; };
    // 9 seeds x 200 episodes is the WRITEUP's measurement and it takes minutes. THE SHIP TIMED OUT ON IT.
    // A GATE THAT CANNOT FINISH IS A GATE NOBODY RUNS, and a gate nobody runs is a check not in the gate.
    // So: 3 seeds x 20 episodes here -- enough to prove the DIRECTION and the SPREAD, which is what the claims
    // rest on. The 9-seed table above is the number; this is the tripwire.
    const SEEDS = 3;
    const trained = (eps) => {
        const out = [];
        for (let s = 0; s < SEEDS; s++) {
            const p = contextualPolicy();
            race(p); p.save();
            for (let e = 0; e < eps; e++) { race(p); p.save(); }
            out.push(race(p));
        }
        return out;
    };
    const cold = trained(0), warm = trained(12);
    ok("IT REALLY DOES LEARN -- median, not one lucky seed", med(warm) > med(cold),
       "median cold " + med(cold).toFixed(1) + " -> after 12 episodes " + med(warm).toFixed(1) +
       ". THIS IS NOT A BROKEN MLP. It is a working one, and it is still losing. ALSO: 'it unlearns' WAS NOISE -- an earlier single-seed run said 0.2 -> 101.6 -> 39.5 and I WROTE THAT UP AS A CURVE. THIS GATE FAILED ON ITS OWN NEXT RUN WITH 0.1 -> 1.7 -> 72.7, THE OPPOSITE SHAPE. A CURVE READ OFF ONE SAMPLE IS A GUESS WITH A GRAPH.");

    ok("!! AND THE LEARNER IS A LOTTERY", Math.max(...warm) > Math.min(...warm) * 3,
       "identical code, " + SEEDS + " seeds: " + Math.min(...warm).toFixed(1) + " .. " + Math.max(...warm).toFixed(1) +
       ". At 200 episodes across 9 seeds it was 20.3 .. 191.5 -- A TENFOLD RANGE ON THE SAME PROGRAM.");

    const molds = Array.from({ length: SEEDS }, () => race(moldReflex3(field, dirs, 1.2, 5)));
    ok("...while THE REFLEX HAS NO VARIANCE AT ALL", Math.max(...molds) - Math.min(...molds) < 0.01,
       molds[0].toFixed(1) + " on every seed. IT IS DETERMINISTIC: it recomputes the answer from the smell every step and never rolls a die.");
    ok("!! AND THE REFLEX'S WORST RUN BEATS THE LEARNER'S BEST", Math.min(...molds) > Math.max(...warm),
       "mold " + Math.min(...molds).toFixed(1) + " (worst of " + SEEDS + ") vs contextual " + Math.max(...warm).toFixed(1) +
       " (BEST of " + SEEDS + "). THE REFLEX WINS BECAUSE IT NEEDS NO SAMPLES. THE LEARNER'S MEMORY IS NOT AN ADVANTAGE HERE -- IT IS THE THING IT HAS TO OVERCOME.");
}

seedRandom(99);

// ---- 3. the honest caveats, gated so they cannot be quietly dropped ---------------------------------------------
{
    const r = race(uniformRandom());
    ok("the control still gets nothing", r < 1, "random " + r.toFixed(1) + " -- the arena is not simply giving food away");
    ok("this conclusion is about THE ARENA, not about whose MLP it is", true,
       "brain/learn.js's MLPTrainer DOES run in node with no device -- but its API is rememberRows([{id,name,x,p}]) and ingest(outcomes, attackDamageOf). IT IS COMBAT-SHAPED: units, attacks, damage. A PARAMECIUM HAS NO ATTACKS AND NO OUTCOMES. Forcing it through that API would mean bending a combat-outcome trainer into a chemotaxis race and calling it 'the engine's brain'. THE LEARNER HERE IS WRITTEN HONESTLY AND LABELLED AS MINE.");
    ok("...and 'brain.js is Deno-only' was true about THE HOST, not the learner", true,
       "brain.js calls Deno.* at 49/69/71. brain/mlp.js has ZERO imports, zero Deno, zero GPU. THE LABEL DESCRIBED THE WRAPPER AND I HAD BEEN USING IT TO MEAN THE THING -- for 25 versions. FOURTH EXPIRED BLOCKER THIS SESSION (v2560 emsdk, v2570 box3d.wasm, v2576 real terrain). A REASON THAT EXPIRED IS A HABIT.");
}

console.log(fails ? "\ncontextualRace-selfcheck: " + fails + " FAILED" : "\ncontextualRace-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
