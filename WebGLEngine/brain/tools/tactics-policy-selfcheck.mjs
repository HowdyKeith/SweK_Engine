// Self-check for brain/tacticsPolicy.js — the learner behind ES combat tactics.
//
// The bar is not "does it run". The bar is: in a world where a behaviour pays off, does the learner
// DISCOVER that behaviour, and does the engine's own scorer then act on it. So the last tests close
// the loop through esTactics.chooseTarget — the code the game actually runs.
//
//   node brain/tools/tactics-policy-selfcheck.mjs

// tacticsPolicy.js is CommonJS on purpose (the bridge requires it). ESM gets it as a default import.
import policy from "../tacticsPolicy.js";
const { defaultWeights, update, trainAll, score, isTrained, featVector } = policy;
import { features, chooseTarget, applyBrainWeights } from "../../ev/esTactics.js";

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n));

const ship = (id, x, shield, armor, dps = 10, opts = {}) => ({
    id, x, y: 0, shield, armor, dps,
    maxShield: opts.maxShield ?? shield, maxArmor: opts.maxArmor ?? armor,
    team: opts.team || "enemy", dead: !!opts.dead,
});

// ---- guards: never invent gradient -------------------------------------------------
{
    const w0 = defaultWeights();
    const f = { reach: 1, weakness: 1, threat: 0, isPlayer: 0, focus: 0 };
    ok("no counterfactual -> no update", update(w0, f, null, 1).applied === false);
    ok("zero reward -> no update", update(w0, f, f, 0).applied === false);
    ok("NaN reward -> no update", update(w0, f, f, NaN).applied === false);
    const same = update(w0, f, f, 1);
    ok("identical chosen/alt -> weights unchanged (difference is zero)",
        same.weights.wWeak === w0.wWeak && same.weights.wThreat === w0.wThreat);
}

// ---- direction: reward pushes toward what distinguished the choice -----------------
{
    const w0 = defaultWeights();
    const wounded = { reach: 0.9, weakness: 1.0, threat: 0.1, isPlayer: 0, focus: 0 };
    const healthy = { reach: 0.9, weakness: 0.0, threat: 0.1, isPlayer: 0, focus: 0 };

    const up = update(w0, wounded, healthy, +1, 0.1).weights;
    ok("rewarding a wounded pick RAISES wWeak", up.wWeak > w0.wWeak);
    ok("...and leaves unrelated weights alone (threat identical in both)", up.wThreat === w0.wThreat);

    const down = update(w0, wounded, healthy, -1, 0.1).weights;
    ok("punishing a wounded pick LOWERS wWeak", down.wWeak < w0.wWeak);

    const pl = update(w0, { reach: .5, weakness: 0, threat: 0, isPlayer: 1, focus: 0 },
                          { reach: .5, weakness: 0, threat: 0, isPlayer: 0, focus: 0 }, +1, 0.1).weights;
    ok("rewarding a player pick raises wPlayer only", pl.wPlayer > w0.wPlayer && pl.wWeak === w0.wWeak);
}

// ---- clamping: one lucky streak must not produce a runaway --------------------------
{
    let w = defaultWeights();
    const a = { reach: 1, weakness: 1, threat: 0, isPlayer: 0, focus: 0 };
    const b = { reach: 1, weakness: 0, threat: 0, isPlayer: 0, focus: 0 };
    for (let i = 0; i < 500; i++) w = update(w, a, b, +1, 0.5).weights;
    ok("weights clamp at the upper band", w.wWeak <= 4 && Number.isFinite(w.wWeak));
    for (let i = 0; i < 1000; i++) w = update(w, a, b, -1, 0.5).weights;
    ok("weights clamp at the lower band", w.wWeak >= -2 && Number.isFinite(w.wWeak));
}

// ---- gating: do not serve a policy that has not seen data ---------------------------
{
    const w = defaultWeights();
    ok("untrained (few samples) -> not served", isTrained(w, 3) === false);
    ok("enough samples -> served", isTrained(w, 8) === true);
    ok("non-finite weight -> never served", isTrained({ ...w, wWeak: NaN }, 100) === false);
}

// ---- THE REAL TEST: learn a world, then act on it ------------------------------------
// World rule: finishing a wounded ship pays (+1); attacking a pristine ship gets you killed (-1).
// The learner sees only (chosen, alt, reward). It must DISCOVER "finish the wounded", and then the
// engine's own chooseTarget must behave differently because of it.
{
    const self = ship(0, 0, 100, 100, 10);
    const woundedFar = ship(2, 900, 2, 3, 10, { maxShield: 100, maxArmor: 100 });
    const pristineNear = ship(1, 120, 100, 100, 10);
    const opts = { range: 1400 };

    // Before learning, the hand policy prefers the near pristine ship (reach gates everything).
    const before = chooseTarget(self, [pristineNear, woundedFar]).target.id;
    ok("hand policy picks the near pristine ship", before === 1);

    // Build the experience: every time it shot the wounded one, that paid off.
    const fW = features(self, woundedFar, opts), fP = features(self, pristineNear, opts);
    const samples = [];
    for (let i = 0; i < 60; i++) {
        samples.push({ chosen: fW, alt: fP, reward: +1 });   // finishing the wounded worked
        samples.push({ chosen: fP, alt: fW, reward: -1 });   // engaging the pristine got us killed
    }
    const t = trainAll(samples, defaultWeights(), 0.05);
    ok("training consumed every sample", t.samples === 120 && t.applied === 120);
    ok("learned wWeak above the hand policy", t.weights.wWeak > defaultWeights().wWeak);

    // Close the loop: hand the learned vector to the ENGINE and watch the decision flip.
    const learned = applyBrainWeights(t.weights);
    const after = chooseTarget(self, [pristineNear, woundedFar], learned).target.id;
    ok("engine now finishes the wounded ship (the learner changed the game)", after === 2);
    ok("...and reports that the brain supplied the weights", learned._brainWeights === 5);

    // The score function in the learner must agree with the engine's ranking.
    const sW = score(t.weights, fW), sP = score(t.weights, fP);
    ok("learner's own score agrees with the engine's pick", sW > sP);
}

// ---- and it must be able to learn the OPPOSITE world ---------------------------------
// A world where chasing wounded ships across the map gets you killed. Same code, inverted rewards:
// if the learner only ever produced "finish the wounded", it would be a constant, not a policy.
{
    const self = ship(0, 0, 100, 100, 10);
    const woundedFar = ship(2, 900, 2, 3, 10, { maxShield: 100, maxArmor: 100 });
    const pristineNear = ship(1, 120, 100, 100, 10);
    const opts = { range: 1400 };
    const fW = features(self, woundedFar, opts), fP = features(self, pristineNear, opts);

    const samples = [];
    for (let i = 0; i < 60; i++) {
        samples.push({ chosen: fW, alt: fP, reward: -1 });   // chasing the wounded got us killed
        samples.push({ chosen: fP, alt: fW, reward: +1 });   // holding the near target worked
    }
    const t = trainAll(samples, defaultWeights(), 0.05);
    ok("inverted world lowers wWeak below the hand policy", t.weights.wWeak < defaultWeights().wWeak);
    const learned = applyBrainWeights(t.weights);
    ok("engine still holds the near target", chooseTarget(self, [pristineNear, woundedFar], learned).target.id === 1);
}

// ---- consistency, not volume ---------------------------------------------------------
// The first learner summed per-sample updates, so 80 identical samples slammed wWeak into the clamp.
// A policy must encode how consistent the evidence is, not how long the game was left running.
{
    const a = { reach: 0.9, weakness: 1, threat: 0, isPlayer: 0, focus: 0 };
    const b = { reach: 0.9, weakness: 0, threat: 0, isPlayer: 0, focus: 0 };
    const rep = (n) => trainAll(Array.from({ length: n }, () => ({ chosen: a, alt: b, reward: +1 })));

    const w10 = rep(10).weights, w1000 = rep(1000).weights;
    ok("10 consistent samples and 1000 give the SAME weights (no saturation by repetition)",
        Math.abs(w10.wWeak - w1000.wWeak) < 1e-9);
    ok("consistent evidence moves the weight, but does not slam the clamp",
        w10.wWeak > defaultWeights().wWeak && w10.wWeak < 4);

    // evenly split evidence should teach nothing
    const split = [];
    for (let i = 0; i < 50; i++) { split.push({ chosen: a, alt: b, reward: +1 }); split.push({ chosen: a, alt: b, reward: -1 }); }
    const ws = trainAll(split).weights;
    ok("contradictory evidence leaves the weight at the hand policy",
        Math.abs(ws.wWeak - defaultWeights().wWeak) < 1e-9);

    // 3:1 in favour should land between "no evidence" and "unanimous"
    const skew = [];
    for (let i = 0; i < 30; i++) skew.push({ chosen: a, alt: b, reward: +1 });
    for (let i = 0; i < 10; i++) skew.push({ chosen: a, alt: b, reward: -1 });
    const wk = trainAll(skew).weights;
    ok("mixed evidence lands between hand policy and unanimous",
        wk.wWeak > defaultWeights().wWeak && wk.wWeak < w10.wWeak);
}

// ---- determinism / no mutation -------------------------------------------------------
{
    const w0 = defaultWeights();
    const a = { reach: 1, weakness: 1, threat: 0, isPlayer: 0, focus: 0 };
    const b = { reach: 1, weakness: 0, threat: 0, isPlayer: 0, focus: 0 };
    const r1 = update(w0, a, b, 1, 0.1).weights, r2 = update(w0, a, b, 1, 0.1).weights;
    ok("update is deterministic", r1.wWeak === r2.wWeak);
    ok("update does not mutate the input weights", w0.wWeak === defaultWeights().wWeak);
    ok("featVector bias term is constant 1", featVector(a)[0] === 1);
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
