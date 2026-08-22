// WebGLEngine/brain/cs/tools/cs-selfcheck.mjs — proves the Counter-Strike tactics integration.
//
// No rendering, no retail game: pure numbers. It checks that the feature geometry is right, that the
// schema wall rejects another game's samples, that the reach gate can never pick an unhittable enemy,
// and -- the point of the whole thing -- that the contrastive learner recovers the environment's hidden
// target priority, so the learned policy shoots the right enemy more often (and wins more rounds) than
// the hand policy it started from.
//
//   run: deno run --allow-read brain/cs/tools/cs-selfcheck.mjs
//    or: node brain/cs/tools/cs-selfcheck.mjs

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const env = require("../csEnv.js");
const cs = require("../../csTacticsPolicy.js");
const bz = require("../../bzTacticsPolicy.js");

let pass = 0, total = 0;
const ok = (name, cond, detail = "") => { total++; if (cond) { pass++; console.log(`  ok   ${name}`); } else { console.log(`  FAIL ${name}${detail ? "  -- " + detail : ""}`); } };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

console.log("cs-selfcheck: geometry");
{
    const f = env.featsOf({ dist: 0.2, bearingDeg: 0, cover: 0.0, hp: 100, aiming: true, weaponThreat: 1, objective: true });
    ok("dead-ahead close exposed -> crosshair 1", near(f.crosshair, 1));
    ok("full body out of cover -> exposed 1", near(f.exposed, 1));
    ok("in range + clear -> reach 1", f.reach === 1);
    ok("full hp -> lowHp 0", near(f.lowHp, 0));
    ok("objective flagged -> objective 1", f.objective === 1);

    ok("90 deg off aim -> crosshair 0", near(env.featsOf({ dist: 0.5, bearingDeg: 90, cover: 0, hp: 50, aiming: false, weaponThreat: 0, objective: false }).crosshair, 0));
    ok("180 deg (behind) -> crosshair 0", near(env.featsOf({ dist: 0.5, bearingDeg: 180, cover: 0, hp: 50, aiming: false, weaponThreat: 0, objective: false }).crosshair, 0));

    const covered = env.featsOf({ dist: 0.4, bearingDeg: 10, cover: 0.99, hp: 100, aiming: true, weaponThreat: 1, objective: false });
    ok("fully behind cover -> reach 0", covered.reach === 0);
    ok("fully behind cover -> exposed ~0", covered.exposed < 0.02);

    const far = env.featsOf({ dist: 1.29, bearingDeg: 0, cover: 0, hp: 100, aiming: true, weaponThreat: 1, objective: false });
    ok("out of effective range -> reach 0", far.reach === 0);
}

console.log("cs-selfcheck: reach gate");
{
    const w = cs.defaultWeights();
    const tempting = { reach: 0, near: 1, crosshair: 1, exposed: 1, lowHp: 1, threat: 1, objective: 1 };
    ok("unhittable enemy scores exactly 0 no matter how tempting", cs.score(w, tempting) === 0);
}

console.log("cs-selfcheck: schema wall (isFeat both ways)");
{
    const csFeat = env.featsOf(env.randEnemy(env.mulberry32(7)));
    const bzFeat = { near: 0.5, ahead: 0.5, exposed: 0.5, airborne: 0 };
    ok("cs policy accepts a cs feature object", cs.isFeat(csFeat));
    ok("cs policy REJECTS a bz feature object", !cs.isFeat(bzFeat));
    ok("bz policy REJECTS a cs feature object", !bz.isFeat(csFeat));
}

console.log("cs-selfcheck: pick never returns an unhittable enemy");
{
    const rng = env.mulberry32(42);
    let bad = 0;
    for (let k = 0; k < 500; k++) {
        const round = env.makeRound(rng, 4);
        const p = env.pick(round, cs.defaultWeights());
        if (p && round.feats[p.chosen].reach !== 1) bad++;
    }
    ok("500 rounds, chosen is always hittable", bad === 0, `${bad} unhittable picks`);
}

console.log("cs-selfcheck: the learner recovers the hidden priority");
{
    const hand = cs.defaultWeights();

    // Baseline: how the hand policy does.
    const handEval = env.runEpisodes(hand, 4000, 101);

    // Gather experience under the hand policy, then retrain from the whole buffer.
    const train = env.runEpisodes(hand, 6000, 202);
    const learned = cs.trainAll(train.samples, hand, 0.05).weights;

    // Evaluate the learned policy on a FRESH seed (no peeking at training rounds).
    const learnedEval = env.runEpisodes(learned, 4000, 303);

    console.log(`         hand:    win ${(handEval.winRate * 100).toFixed(1)}%  best-target ${(handEval.bestRate * 100).toFixed(1)}%`);
    console.log(`         learned: win ${(learnedEval.winRate * 100).toFixed(1)}%  best-target ${(learnedEval.bestRate * 100).toFixed(1)}%`);
    console.log(`         weights: obj ${hand.wObjective.toFixed(2)}->${learned.wObjective.toFixed(2)}  threat ${hand.wThreat.toFixed(2)}->${learned.wThreat.toFixed(2)}  near ${hand.wNear.toFixed(2)}->${learned.wNear.toFixed(2)}`);

    ok("learned shoots the right enemy more often than the hand", learnedEval.bestRate > handEval.bestRate + 0.02,
        `hand ${handEval.bestRate.toFixed(3)} vs learned ${learnedEval.bestRate.toFixed(3)}`);
    ok("learned wins at least as many rounds as the hand", learnedEval.winRate >= handEval.winRate - 0.005,
        `hand ${handEval.winRate.toFixed(3)} vs learned ${learnedEval.winRate.toFixed(3)}`);
    ok("learner raised the bomb-carrier weight toward the true meta", learned.wObjective > hand.wObjective,
        `${hand.wObjective} -> ${learned.wObjective}`);
    ok("learner raised the threat weight toward the true meta", learned.wThreat > hand.wThreat,
        `${hand.wThreat} -> ${learned.wThreat}`);
}

console.log("cs-selfcheck: contrastive update needs a counterfactual");
{
    const f = env.featsOf(env.randEnemy(env.mulberry32(9)));
    const r = cs.update(cs.defaultWeights(), f, null, 1, 0.05);
    ok("no runner-up -> no update", r.applied === false);
}

console.log(`\ncs-selfcheck: ${pass}/${total} passed`);
if (pass !== total) { if (typeof process !== "undefined" && process.exit) process.exit(1); }
