// policy.js -- the v2 "aggression" policy for the SweK GPU Brain.
//
// One scalar per kaiju in [0,1]: how long it should keep fighting before
// retreating. Consumed by Kaiju.js PATCH-B5, which scales the retreat
// energy threshold (0.5 = the engine's stock behavior exactly).
//
// HONESTY NOTE: these weights are HAND-SET, not trained -- this is a
// designed utility function expressed in network form. That is
// deliberate: the whole inference path (feature extraction -> batched
// GPU forward -> per-id publish -> engine consumption) is the deliverable;
// a trained policy later is a one-file weight swap right here. The single
// sigmoid layer is intentionally interpretable -- every weight below
// reads as a sentence.
//
// Feature vector (order matters, keep in sync with buildFeatures):
//   0 energy        0..1   healthy kaiju fight longer
//   1 tierNorm      0..1   absorbTier/10 -- veterans are braver
//   2 localThreat   0..1   1 - threatDist/horizon -- crowded fights scare
//   3 goalNear      0..1   1 - distToNearestGoal/horizon -- prey in reach
//                          emboldens
//   4 isFlying      0/1    sky/space/tech disengage easily -> braver
//   5 isWater       0/1    can flee into the sea -> braver
//   6 isHell        0/1    hellspawn are fanatics
//   7 isTech        0/1    calculating -- slightly timid
//   8 isSpace       0/1    aloof -- neutral
//   9 bias          1.0

export const FEATURES = 10;
export const HORIZON_CELLS = 24;      // threat/goal normalization horizon

export function buildLayers() {
    // logit = 1.4*energy + 0.8*tier - 1.1*localThreat + 0.6*goalNear
    //       + 0.3*flying + 0.3*water + 0.9*hell - 0.25*tech + 0.0*space
    //       - 0.9 (bias centers a mid-energy, mid-threat kaiju near 0.5)
    const W = Float32Array.from([1.4, 0.8, -1.1, 0.6, 0.3, 0.3, 0.9, -0.25, 0.0, -0.9]);
    const b = Float32Array.from([0.0]);
    return [{ nIn: FEATURES, nOut: 1, W, b, act: "sigmoid" }];
    // Trained-policy drop-in: return multiple layers here, e.g.
    // [{nIn:10,nOut:16,W,b,act:"relu"},{nIn:16,nOut:1,W,b,act:"sigmoid"}]
    // -- BatchedMLP handles any depth/width, nothing else changes.
}

// snapshot kaiju entry: { id, kind, energy, tier, x, z }
// threatDistAt(x, z) -> cost-weighted distance to nearest OTHER threat
// goalDistAt(x, z)   -> euclidean distance to nearest goal (world units)
export function buildFeatures(k, threatDistAt, goalDistAt, cell) {
    const horizon = HORIZON_CELLS * cell;
    const td = threatDistAt(k.x, k.z);
    const gd = goalDistAt(k.x, k.z);
    const kind = k.kind || "";
    return [
        Math.max(0, Math.min(1, k.energy ?? 1)),
        Math.max(0, Math.min(1, (k.tier ?? 0) / 10)),
        td == null ? 0 : Math.max(0, Math.min(1, 1 - td / horizon)),
        gd == null ? 0 : Math.max(0, Math.min(1, 1 - gd / horizon)),
        (kind === "sky" || kind === "space" || kind === "tech") ? 1 : 0,
        kind === "water" ? 1 : 0,
        kind === "hell" ? 1 : 0,
        kind === "tech" ? 1 : 0,
        kind === "space" ? 1 : 0,
        1.0,
    ];
}


// ============================================================
// v3 -- attack selection policy. One row per (kaiju, legal attack);
// argmax per kaiju wins. Same honesty note as the aggro policy: hand-set,
// sentence-readable weights in network form; trained weights drop into
// buildAttackLayers with nothing else changing.
//
// Feature vector (keep in sync with buildAttackFeatures):
//   0 inRange       0/1   target inside attack range (dominant)
//   1 rangeFit      0..1  distance sits near the attack's sweet spot
//   2 famBeam       0/1   hitscan -- reliable at range
//   3 famProjectile 0/1
//   4 famAoe        0/1
//   5 dmgNorm       0..1  damage / 0.6 clamped
//   6 cluster       0..1  goal density near the target (splash payoff)
//   7 aoeCluster    0..1  famAoe * cluster        (interaction terms let a
//   8 projCluster   0..1  famProjectile * cluster  single layer express
//   9 beamFar       0..1  famBeam * distNorm       "AoE wants crowds")
//  10 myEnergy      0..1
//  11 king          0/1
//  12 bias          1.0
// ============================================================

// v8 -- cross-policy features: the attack net now sees the threat field
// the way civdef does. Indices 0-11 unchanged; NEW 12 threatAtSelf and
// 13 threatAtTarget; bias moves 12 -> 14 (loadDeepWeights migrates old
// weight files by relocating the bias column and zero-filling the new
// ones, so a migrated net is bit-equivalent until the new features move).
// v15 -- NEW 14 targetMoving (normalized target speed; the dungeon's
// player-velocity signal -- "he was strafing when I fired"). Bias moves
// 14 -> 15; loadDeepWeights migration generalized to any shorter row.
export const ATK_FEATURES = 16;

export function buildAttackLayers() {
    const W = Float32Array.from([
        2.6,   // inRange -- being able to hit at all dominates
        0.9,   // rangeFit
        0.25,  // beams slightly preferred baseline (no travel time)
        0.0,   // projectile baseline
        -0.2,  // AoE slightly discouraged vs single targets...
        1.1,   // ...but damage counts
        0.3,   // clusters are generally good targets
        1.6,   // AoE into a crowd is the whole point
        0.6,   // splashy projectiles like crowds too
        0.7,   // beams shine at long range
        0.2,   // healthy kaiju can afford flashier picks
        0.3,   // kings showboat
        0.0,   // v8 threatAtSelf -- no prior; learning decides if crowds change picks
        0.0,   // v8 threatAtTarget
        0.0,   // v15 targetMoving -- no prior; outcomes decide if leading matters
        -2.2,  // bias -- out-of-range rows sink toward 0
    ]);
    const b = Float32Array.from([0.0]);
    return [{ nIn: ATK_FEATURES, nOut: 1, W, b, act: "sigmoid" }];
}

// k: roster entry {x, z, tx, tz, energy, king}; a: {name, family, range,
// damage}; goals: [{x, z}] (civ centers)
export function buildAttackFeatures(k, a, goals, threatAt = null) {
    const tx = k.tx ?? k.x, tz = k.tz ?? k.z;
    const dist = Math.hypot(tx - k.x, tz - k.z);
    const range = Math.max(1, a.range ?? 30);
    const inRange = dist <= range ? 1 : 0;
    const rangeFit = Math.max(0, 1 - Math.abs(dist - range * 0.7) / range);
    const beam = a.family === "beam" ? 1 : 0;
    const proj = a.family === "projectile" ? 1 : 0;
    const aoe = a.family === "aoe" ? 1 : 0;
    const dmg = Math.min(1, (a.damage ?? 0) / 0.6);
    let near = 0;
    for (const g of goals) if (Math.hypot(g.x - tx, g.z - tz) < 18) near++;
    const cluster = Math.min(1, near / 3);
    const distNorm = Math.min(1, dist / 70);
    // v8 -- threat context (0 when no sampler / out of grid): distance to
    // the nearest OTHER kaiju, inverted and normalized to a 96u horizon
    const tnorm = (v) => (v == null ? 0 : Math.max(0, Math.min(1, 1 - v / 96)));
    const thSelf = threatAt ? tnorm(threatAt(k.x, k.z)) : 0;
    const thTgt  = threatAt ? tnorm(threatAt(tx, tz)) : 0;
    return [
        inRange, rangeFit, beam, proj, aoe, dmg, cluster,
        aoe * cluster, proj * cluster, beam * distNorm,
        Math.max(0, Math.min(1, k.energy ?? 1)),
        k.king ? 1 : 0,
        thSelf, thTgt,
        Math.min(1, (k.tspd ?? 0) / 8),   // v15 -- target speed, 8 u/s horizon
        1.0,
    ];
}


// ============================================================
// v5 -- deep attack policy (13 -> 16 relu -> 1 sigmoid).
//
// DISTILLATION INIT: hidden units 0 and 1 are set to +HAND and -HAND
// with output weights +1/-1, so relu(h0) - relu(h1) == HAND . x for
// every input sign -- the network starts EXACTLY equal to the hand
// policy and then learns beyond it. The other 14 units start as small
// seeded-random features (new capacity, deterministic across runs).
// The v4 linear learner topped out at 88% oracle agreement -- the
// linear expressiveness ceiling this net exists to crack.
// ============================================================

export const ATK_HIDDEN = 16;

// deterministic LCG so distill inits are reproducible
function seededRand(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5);
}

export function buildAttackLayersDeep(handW) {
    const H = ATK_HIDDEN, F = ATK_FEATURES;
    const hand = handW ?? buildAttackLayers()[0].W;
    const rnd = seededRand(1985);
    const W1 = new Float32Array(H * F);
    const b1 = new Float32Array(H);
    for (let i = 0; i < F; i++) {
        W1[0 * F + i] = hand[i];       // h0 = relu(+hand.x)
        W1[1 * F + i] = -hand[i];      // h1 = relu(-hand.x)
    }
    for (let o = 2; o < H; o++)
        for (let i = 0; i < F; i++) W1[o * F + i] = rnd() * 0.30;
    const W2 = new Float32Array(1 * H);
    const b2 = new Float32Array(1);
    W2[0] = 1.0; W2[1] = -1.0;         // out = h0 - h1 (+ small random taps)
    for (let o = 2; o < H; o++) W2[o] = rnd() * 0.05;
    return [
        { nIn: F, nOut: H, W: W1, b: b1, act: "relu" },
        { nIn: H, nOut: 1, W: W2, b: b2, act: "sigmoid" },
    ];
}


// ============================================================
// v6 -- civ-defense policy, now LEARNABLE. v5 scored shoot/hold with a
// fixed formula; v6 expresses that same prior as weights (behavior-
// identical at init when tier/dist priors are neutral-ish) and trains on
// bolt outcomes (PATCH-B10 attribution: hit a kaiju = 1, splash = 0).
// Features:
//   0 threatNear    0..1  1 - threatDist/60 (from the GPU threat grid)
//   1 healthy       0..1  civ energy
//   2 nearTierNorm  0..1  nearest kaiju's absorbTier / 10
//   3 nearDistNorm  0..1  nearest kaiju distance / 45 (== shot distance;
//                          the feature that lets it learn "long shots miss")
//   4 bias          1.0
// ============================================================

export const CIVDEF_FEATURES = 5;

export function buildCivDefWeights() {
    // v5 heuristic was sigmoid(2.2*threatNear + 1.2*healthy - 1.6);
    // tier/dist start with small priors (big kaiju worth shooting,
    // distant shots slightly discouraged) for the learner to correct.
    return Float32Array.from([2.2, 1.2, 0.3, -0.6, -1.6]);
}

export function buildCivDefFeatures(threatNear, healthy, nearTier, nearDist) {
    return [
        Math.max(0, Math.min(1, threatNear)),
        Math.max(0, Math.min(1, healthy)),
        Math.max(0, Math.min(1, (nearTier ?? 0) / 10)),
        Math.max(0, Math.min(1, (nearDist ?? 45) / 45)),
        1.0,
    ];
}


// ============================================================
// v7 -- civ-defense TARGET selection: which kaiju to shoot, not just
// whether. One row per (civ, kaiju-in-range); argmax wins. Reward is
// per-shot truth: the impact event carries targetKaijuId (PATCH-B10b),
// so "did the bolt aimed at THAT kaiju connect" labels THAT row.
//
// Features (keep in sync with buildCivTargetFeatures):
//   0 distNorm      0..1  shot distance / 45   (long shots miss)
//   1 tierNorm      0..1  candidate absorbTier / 10
//   2 kEnergy       0..1  candidate energy (prior: prefer finishing
//                          the wounded)
//   3 king          0/1
//   4 civHealthy    0..1
//   5 threatNear    0..1  pressure on the shooter
//   6 closeAndBig   0..1  (1 - distNorm) * tierNorm  (interaction:
//                          the prime target is the big one at the gate)
//   7 bias          1.0
// ============================================================

export const CIVTARGET_FEATURES = 8;

export function buildCivTargetWeights() {
    return Float32Array.from([-1.2, 1.0, -0.6, 0.5, 0.2, 0.4, 0.8, -0.2]);
}

export function buildCivTargetFeatures(distNorm, tierNorm, kEnergy, king, civHealthy, threatNear) {
    const d = Math.max(0, Math.min(1, distNorm));
    const tn = Math.max(0, Math.min(1, tierNorm));
    return [d, tn, Math.max(0, Math.min(1, kEnergy)), king ? 1 : 0,
            Math.max(0, Math.min(1, civHealthy)), Math.max(0, Math.min(1, threatNear)),
            (1 - d) * tn, 1.0];
}
