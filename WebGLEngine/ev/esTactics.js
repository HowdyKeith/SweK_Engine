// WebGLEngine/ev/esTactics.js — decision layer for hostile ships: WHO to shoot, and WHETHER to fight.
//
// Today flightView picks the nearest thing and attacks it forever. That is not tactics, it is a
// magnet. This module sits ABOVE combat.js's stepAI (which stays pure: it only turns, thrusts and
// fires toward whatever target it is handed) and answers two questions per ship per tick:
//
//     chooseTarget(self, candidates, w)  -> the target worth shooting
//     shouldFlee(self, threats, w)       -> is this fight already lost
//
// Both are PURE and deterministic: same inputs, same answer, no clock, no RNG. That is what makes
// them testable, and it is why the GPU Brain can drive them -- the brain does not fly the ship, it
// supplies the WEIGHTS. This mirrors what the flow-field benchmark taught us in v2156: the brain's
// value is the policy, not the pathfinding. A 96x96 field solve to chase a ship across open space
// would cost ~31ms of readback to answer a question that a dot product answers in nanoseconds.
//
// The weight vector is the whole policy. Hand-set defaults below are a sane opening book; the brain
// can replace them wholesale (see applyBrainWeights) once it has learned better ones from outcomes.

"use strict";

// Every weight is signed so its sign states its intent. Raising a weight must make the behaviour it
// names MORE likely, or the vector is lying.
const DEFAULT_W = {
    // --- target selection (higher score wins) ---
    wClose: 1.00,    // prefer nearer targets
    wWeak: 0.80,     // prefer targets that are already hurt (finish the kill)
    wThreat: 0.55,   // prefer targets that can hurt me most (remove the danger)
    wPlayer: 0.35,   // bias toward the player (they are the story)
    wFocus: 0.25,    // stickiness: keep shooting last tick's target rather than dithering

    // --- flee decision ---
    fleeHealth: 0.30,   // start considering flight below this health fraction
    fleeOdds: 0.55,     // ...and only if my strength / local enemy strength is below this
    fleeHyst: 0.12,     // must recover this much above fleeHealth to re-engage (no flicker)
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Health as a fraction of a ship's own maximum. Ships arrive with wildly different scales, so an
// absolute HP number tells us nothing about how close to death a ship is.
function healthFrac(s) {
    const maxS = s.maxShield ?? s.stats?.shield ?? s.shield ?? 0;
    const maxA = s.maxArmor ?? s.stats?.armor ?? s.armor ?? 0;
    const max = maxS + maxA;
    if (!(max > 0)) return 1;
    return clamp01(((s.shield || 0) + (s.armor || 0)) / max);
}

// What this ship can still bring to a fight: current durability x how hard it hits. A crippled
// battleship is not a battleship.
function strength(s) {
    const dur = (s.shield || 0) + (s.armor || 0);
    const dmg = s.dps ?? s.stats?.dps ?? 1;
    return Math.max(0, dur) * Math.max(0.1, dmg);
}

function dist2(a, b) { const dx = b.x - a.x, dy = b.y - a.y; return dx * dx + dy * dy; }

// Score a single candidate. `range` normalises distance so weights stay comparable across systems.
//
// v2166 -- the first version summed the terms independently, with closeness decaying linearly over
// 2*range. Its own selfcheck caught the consequence: a nearly-dead ship 1200 units away still scored
// 0.571 closeness and outranked the pristine ship shooting you at point-blank. That is not tactics.
// Correct model: REACHABILITY GATES EVERYTHING. You can only finish a wounded ship, chase the player,
// or answer a threat if you can actually get there, so the whole preference sum is scaled by a smooth
// proximity factor range/(range+d) -- 1 at contact, 0.5 at one range, never a hard zero.
// v2167 -- THE feature vector, exported. The learner must train on exactly the numbers the engine
// scores with; two copies of this arithmetic would silently drift and the brain would optimise a
// policy the game never runs. Order matches FEATURE_KEYS and the weight vector.
const FEATURE_KEYS = ["reach", "weakness", "threat", "isPlayer", "focus"];

function features(self, t, opts = {}) {
    const range = opts.range || 1400;
    const d = Math.sqrt(dist2(self, t));
    return {
        reach: range / (range + d),                        // 1 = on top of me, ->0 far away
        weakness: 1 - healthFrac(t),                       // 1 = nearly dead
        threat: clamp01(strength(t) / Math.max(1, strength(self) + strength(t))),
        isPlayer: (t.team === "player" || t.isPlayer) ? 1 : 0,
        focus: (opts.lastTargetId != null && t.id === opts.lastTargetId) ? 1 : 0,
    };
}

function scoreTarget(self, t, w, opts = {}) {
    const f = features(self, t, opts);
    const desire = w.wClose + w.wWeak * f.weakness + w.wThreat * f.threat + w.wPlayer * f.isPlayer + w.wFocus * f.focus;
    return f.reach * desire;
}

// Pick the best candidate. Returns null when there is nothing shootable -- callers must handle that
// rather than receive a bogus target.
function chooseTarget(self, candidates, w = DEFAULT_W, opts = {}) {
    let best = null, bestScore = -Infinity, runnerUp = null, runnerScore = -Infinity;
    for (const t of candidates) {
        if (!t || t.dead || t === self) continue;
        const s = scoreTarget(self, t, w, opts);
        if (s > bestScore) { runnerUp = best; runnerScore = bestScore; bestScore = s; best = t; }
        else if (s > runnerScore) { runnerUp = t; runnerScore = s; }
    }
    if (!best) return null;
    // The runner-up is the counterfactual: "what I would have shot instead". The learner needs it to
    // do a contrastive update -- reward alone cannot say which feature made the choice good.
    return {
        target: best, score: bestScore,
        feat: features(self, best, opts),
        altFeat: runnerUp ? features(self, runnerUp, opts) : null,
    };
}

// Should this ship break off? Two conditions, both required: it is hurt, AND it is losing.
// Hysteresis prevents the flee/engage flicker that makes AI look broken: once fleeing, a ship must
// climb `fleeHyst` above the threshold before it will turn and fight again.
function shouldFlee(self, threats, w = DEFAULT_W, opts = {}) {
    const hp = healthFrac(self);
    const wasFleeing = !!opts.wasFleeing;
    const bar = wasFleeing ? w.fleeHealth + w.fleeHyst : w.fleeHealth;
    if (hp >= bar) return false;

    let mine = strength(self), theirs = 0;
    for (const t of threats) { if (t && !t.dead && t !== self) theirs += strength(t); }
    if (theirs <= 0) return false;                      // nobody to flee from
    const odds = mine / (mine + theirs);
    return odds < w.fleeOdds;
}

// A ship that flees still needs somewhere to point. stepAI closes on whatever it is handed, so hand
// it a mirror point: directly away from the threat, far enough that it keeps running.
function fleePoint(self, threat, away = 4000) {
    const dx = self.x - threat.x, dy = self.y - threat.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: self.x + (dx / len) * away, y: self.y + (dy / len) * away, team: "flee", _flee: true };
}

// The brain serves a weight vector; we accept only known keys and only finite numbers, so a bad
// payload degrades to the hand policy instead of producing a ship that does nothing.
function applyBrainWeights(served, base = DEFAULT_W) {
    const out = { ...base };
    if (!served || typeof served !== "object") return out;
    let applied = 0;
    for (const k of Object.keys(base)) {
        const v = served[k];
        if (typeof v === "number" && Number.isFinite(v)) { out[k] = v; applied++; }
    }
    out._brainWeights = applied;   // 0 means "the brain sent nothing usable" — the UI can say so
    return out;
}

// One call per ship per tick. Returns exactly what flightView needs and nothing it doesn't.
function decide(self, candidates, w = DEFAULT_W, opts = {}) {
    const alive = candidates.filter((c) => c && !c.dead && c !== self);
    if (!alive.length) return { target: null, engaging: false, fleeing: false };

    const fleeing = shouldFlee(self, alive, w, opts);
    if (fleeing) {
        // run from the single biggest threat, not the centroid: you escape a ship, not an average
        let worst = alive[0], worstS = -1;
        for (const t of alive) { const s = strength(t); if (s > worstS) { worstS = s; worst = t; } }
        return { target: fleePoint(self, worst), engaging: false, fleeing: true, from: worst };
    }
    const pick = chooseTarget(self, alive, w, opts);
    if (!pick) return { target: null, engaging: false, fleeing: false };
    return { target: pick.target, engaging: true, fleeing: false, score: pick.score, feat: pick.feat, altFeat: pick.altFeat };
}

export { DEFAULT_W, FEATURE_KEYS, features, decide, chooseTarget, shouldFlee, fleePoint, applyBrainWeights, healthFrac, strength };

// Dual export: the CJS bridge learns from the SAME feature code the ESM engine scores with.
if (typeof module !== "undefined" && module.exports)
    module.exports = { DEFAULT_W, FEATURE_KEYS, features, decide, chooseTarget, shouldFlee, fleePoint, applyBrainWeights, healthFrac, strength };
