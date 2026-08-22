// WebGLEngine/brain/cs/csEnv.js — a headless Counter-Strike engagement generator.
//
// The GPU Brain does not play retail CS (there is no open bot API the way BZFlag ships bzfs). What it
// CAN learn is the decision that actually wins CS rounds: given several enemies you could shoot in the
// half-second a peek gives you, WHICH one do you shoot first. This module manufactures those moments --
// a spread of visible enemies with real geometry (range, angle-off-crosshair, how much body is exposed),
// health, threat, and whether they are on the bomb -- and resolves the engagement against a HIDDEN "true"
// target priority. The agent picks with brain/csTacticsPolicy.js; the contrastive learner then has to
// recover that hidden priority from wins and losses alone.
//
// Nothing here is CS-specific code inside the brain: it is the same target-scoring shape as Endless Sky
// and BZFlag, with a schema that means "enemy in an FPS". cs/tools/cs-selfcheck.mjs is the proof it learns.

"use strict";

const policy = require("../csTacticsPolicy.js");

const EFF_RANGE = 1.0;   // normalized effective weapon range; past this you cannot reliably hit

// Deterministic RNG so the selfcheck is reproducible.
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// The environment's HIDDEN target priority -- the "meta" the agent must discover. Deliberately NOT the
// hand policy: this meta values the bomb carrier and the AWP more than a fresh player would guess, and
// cares a little less about pure range. If the learner recovers this, win-rate climbs above the hand.
function trueWeights() {
    return { wBias: 0.0, wNear: 0.40, wCross: 0.75, wExposed: 0.95, wLowHp: 0.55, wThreat: 1.05, wObjective: 1.25 };
}

// One raw enemy -> its feature object, computed from geometry (not hand-set), so the selfcheck can pin
// the geometry independently of the policy.
function featsOf(e) {
    const inRange = e.dist <= EFF_RANGE;
    const behindCover = e.cover >= 0.98;               // fully behind a wall -> cannot be shot
    const reach = (inRange && !behindCover) ? 1 : 0;
    const near = clamp01(1 - e.dist / EFF_RANGE);
    const bearing = Math.abs(e.bearingDeg);            // degrees off your current aim, 0..180
    const crosshair = clamp01(1 - bearing / 90);       // 1 dead ahead, 0 at 90+ deg
    const exposed = clamp01(1 - e.cover);              // 1 fully out of cover, 0 fully behind it
    const lowHp = clamp01(1 - e.hp / 100);
    const threat = clamp01((e.aiming ? 0.6 : 0.15) + 0.4 * e.weaponThreat);
    const objective = e.objective ? 1 : 0;
    return { reach, near, crosshair, exposed, lowHp, threat, objective };
}

function randEnemy(rng) {
    return {
        dist: rng() * 1.3,
        bearingDeg: (rng() * 2 - 1) * 180,
        cover: rng() < 0.15 ? 0.99 : rng() * 0.85,     // ~15% fully behind cover (unhittable)
        hp: 1 + rng() * 99,
        aiming: rng() < 0.45,
        weaponThreat: rng(),
        objective: rng() < 0.18,                        // ~1 in 6 is on the bomb
    };
}

// A round: several visible enemies, guaranteeing at least one is actually hittable (else the decision is
// vacuous). Returns the feature objects plus the raw enemies for geometry checks.
function makeRound(rng, n = 4) {
    const enemies = [];
    for (let i = 0; i < n; i++) enemies.push(randEnemy(rng));
    let feats = enemies.map(featsOf);
    if (!feats.some(f => f.reach === 1)) { enemies[0].cover = 0.2; enemies[0].dist = 0.5; feats = enemies.map(featsOf); }
    return { enemies, feats };
}

// The agent's pick and its runner-up, under a given weight vector. Only hittable enemies (reach 1) are
// eligible -- the gate is enforced here as well as in score(), because an unhittable "best" is a bug.
function pick(round, weights) {
    const scored = round.feats.map((f, i) => ({ i, s: policy.score(weights, f) }))
        .filter(o => round.feats[o.i].reach === 1)
        .sort((a, b) => b.s - a.s);
    if (!scored.length) return null;
    return { chosen: scored[0].i, alt: scored[1] ? scored[1].i : scored[0].i, scored };
}

// The engagement's truth: the hittable enemy with the highest TRUE score is the right first shot. Win
// probability scales with how close the agent's pick is to that, so a right pick trades the round and a
// wrong one (whiffing a slivered enemy, or killing a harmless body while the AWP kills you) loses it.
function resolve(round, chosenIdx, rng) {
    const trueScores = round.feats.map(f => policy.score(trueWeights(), f));
    const eligible = round.feats.map((f, i) => i).filter(i => round.feats[i].reach === 1);
    const vals = eligible.map(i => trueScores[i]);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const bestIdx = eligible.reduce((b, i) => (trueScores[i] > trueScores[b] ? i : b), eligible[0]);
    const norm = hi > lo ? (trueScores[chosenIdx] - lo) / (hi - lo) : 1;   // 0..1
    const winProb = 0.06 + 0.88 * norm;
    const win = rng() < winProb;
    return { win, reward: win ? 1 : -1, bestIdx, isBest: chosenIdx === bestIdx };
}

// Run n engagements under `weights`. Returns the round-win rate (how often the agent survives the round),
// the true-best hit rate (how often it shot the objectively right enemy), and the contrastive samples
// {chosen, alt, reward} for training.
function runEpisodes(weights, n, seed = 1) {
    const rng = mulberry32(seed);
    let wins = 0, best = 0, decided = 0;
    const samples = [];
    for (let k = 0; k < n; k++) {
        const round = makeRound(rng, 3 + Math.floor(rng() * 3));
        const p = pick(round, weights);
        if (!p) continue;
        const r = resolve(round, p.chosen, rng);
        decided++; if (r.win) wins++; if (r.isBest) best++;
        samples.push({ chosen: round.feats[p.chosen], alt: round.feats[p.alt], reward: r.reward });
    }
    return { winRate: decided ? wins / decided : 0, bestRate: decided ? best / decided : 0, decided, samples };
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

module.exports = {
    EFF_RANGE, mulberry32, trueWeights, featsOf, randEnemy, makeRound, pick, resolve, runEpisodes,
};
