#!/usr/bin/env node
// WebGLEngine/tools/ship/aggroHazardFeature-selfcheck.mjs
//
// Gates brain/policy.js's task-board-#90 growth: the aggro/retreat policy's feature vector 10 -> 11, a new
// `hazard` feature (index 9, bias relocated 9 -> 10) fed from real capsule-collision pressure computed live in
// simulation/KaijuManager.js's _resolveGroundKaijuPosition (task #89's terrain collider). No Deno shim needed
// here -- brain/policy.js has zero Deno dependency (pure feature/weight arithmetic), so this runs directly.
//
// SABOTAGE-VERIFIED, three tries. (1) Flipping the hazard weight's sign (-0.7 -> +0.7) turned section 3's
// monotonicity and delta-size checks red by name (aggro went UP with hazard instead of down). (2) Dropping
// the clamp around k.hazard (`k.hazard ?? 0` instead of `Math.max(0, Math.min(1, k.hazard ?? 0))`) turned
// section 2's two out-of-range checks red by name. (3) Swapping the order of the hazard feature and the bias
// constant (bias before hazard, instead of after) turned FIVE checks red by name across sections 1, 2 and 4 --
// not just a shape check, because every downstream score also shifted once bias and hazard were reading each
// other's intended slot. Restored, gate re-confirmed all-green after each of the three.
"use strict";
import { FEATURES, HORIZON_CELLS, buildLayers, buildFeatures } from "../../brain/policy.js";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const score = (W, b, x) => { let z = b[0]; for (let i = 0; i < W.length; i++) z += W[i] * x[i]; return sigmoid(z); };

const noThreat = () => null, noGoal = () => null;
const baseKaiju = (over = {}) => ({ id: "k1", kind: "hell", energy: 0.8, tier: 3, x: 0, z: 0, ...over });

console.log("aggroHazardFeature-selfcheck -- task #90's new terrain-hazard feature on the live aggro policy\n");

// ---------------------------------------------------------------------------
console.log("1. SHAPE: FEATURES is 11, buildLayers/buildFeatures agree with it");
{
    ok("!! FEATURES === 11", FEATURES === 11);
    const layers = buildLayers();
    ok("!! buildLayers() reports nIn matching FEATURES", layers[0].nIn === FEATURES, `nIn=${layers[0].nIn}`);
    ok("!! buildLayers()'s own weight vector is exactly FEATURES long", layers[0].W.length === FEATURES, `W.length=${layers[0].W.length}`);
    const x = buildFeatures(baseKaiju(), noThreat, noGoal, 4);
    ok("!! buildFeatures(...) returns exactly FEATURES numbers", x.length === FEATURES, `got ${x.length}`);
    ok("bias is still the LAST element (relocated, not dropped)", x[FEATURES - 1] === 1.0);
}

// ---------------------------------------------------------------------------
console.log("\n2. hazard READS k.hazard, CLAMPED TO [0,1], DEFAULTING TO 0 WHEN ABSENT");
{
    const xNone = buildFeatures(baseKaiju(), noThreat, noGoal, 4);
    ok("!! no k.hazard at all -> feature reads 0 (same 'nothing to report' default every other optional field gets)", xNone[9] === 0);
    const xHalf = buildFeatures(baseKaiju({ hazard: 0.6 }), noThreat, noGoal, 4);
    ok("!! k.hazard=0.6 passes through unchanged", xHalf[9] === 0.6, `x[9]=${xHalf[9]}`);
    const xOver = buildFeatures(baseKaiju({ hazard: 1.4 }), noThreat, noGoal, 4);
    ok("!! k.hazard > 1 is clamped to 1", xOver[9] === 1, `x[9]=${xOver[9]}`);
    const xNeg = buildFeatures(baseKaiju({ hazard: -0.3 }), noThreat, noGoal, 4);
    ok("!! k.hazard < 0 is clamped to 0", xNeg[9] === 0, `x[9]=${xNeg[9]}`);
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE HAND POLICY'S OWN CLAIM, CHECKED NUMERICALLY: RISING hazard LOWERS aggro ***");
{
    const layers = buildLayers();
    const { W, b } = layers[0];
    const k = baseKaiju();
    let prev = null, monotone = true;
    const steps = [0, 0.25, 0.5, 0.75, 1.0];
    const scores = steps.map((h) => score(W, b, buildFeatures({ ...k, hazard: h }, noThreat, noGoal, 4)));
    for (const s of scores) { if (prev !== null && s > prev + 1e-9) monotone = false; prev = s; }
    report("aggro at hazard=0,0.25,0.5,0.75,1.0", scores.map((s) => s.toFixed(4)).join("  "));
    ok("!! *** aggro is monotonically non-increasing in hazard, holding every other feature fixed ***", monotone,
        "matches buildLayers()'s own comment: '-0.7*hazard (wedged-in or unstable footing is a reason to disengage)'");
    ok("!! and the swing from 0 to 1 is a REAL, non-trivial effect, not a rounding-sized nudge",
        scores[0] - scores[scores.length - 1] > 0.05, `delta=${(scores[0] - scores[scores.length - 1]).toFixed(4)}`);
}

// ---------------------------------------------------------------------------
console.log("\n4. REGRESSION: THE 9 PRE-EXISTING FEATURES' OWN WEIGHTS ARE UNCHANGED BY THE GROWTH");
{
    // The exact 10 weights this file carried before task #90 (energy..isSpace, then bias) -- pinned here so a
    // future edit to the OLD priors is a deliberate, visible diff against this list, not silently absorbed
    // into "well the array is a different length now anyway".
    const OLD = [1.4, 0.8, -1.1, 0.6, 0.3, 0.3, 0.9, -0.25, 0.0, -0.9];
    const W = buildLayers()[0].W;
    let same = true;
    for (let i = 0; i < 9; i++) if (Math.abs(W[i] - OLD[i]) > 1e-6) same = false;
    ok("!! the first 9 weights (energy..isSpace) are unchanged from their pre-growth values (within float32 rounding)", same);
    ok("!! the bias weight (now index 10) still carries its old value, just relocated", Math.abs(W[10] - OLD[9]) < 1e-6, `W[10]=${W[10]}, was W[9]=${OLD[9]}`);

    // And a kaiju with hazard=0 (the default for anything that never reported one) scores EXACTLY what the
    // pre-growth 10-feature policy would have, since the new term contributes 0*(-0.7) = 0 to the logit.
    const oldLayer = { W: Float32Array.from(OLD), b: Float32Array.from([0.0]) };
    const oldFeatures = (k) => {
        const kind = k.kind || "";
        return [Math.max(0, Math.min(1, k.energy ?? 1)), Math.max(0, Math.min(1, (k.tier ?? 0) / 10)), 0, 0,
            (kind === "sky" || kind === "space" || kind === "tech") ? 1 : 0, kind === "water" ? 1 : 0,
            kind === "hell" ? 1 : 0, kind === "tech" ? 1 : 0, kind === "space" ? 1 : 0, 1.0];
    };
    const k = baseKaiju();
    const before = score(oldLayer.W, oldLayer.b, oldFeatures(k));
    const after = score(buildLayers()[0].W, buildLayers()[0].b, buildFeatures(k, noThreat, noGoal, HORIZON_CELLS));
    ok("!! *** a kaiju with no hazard signal scores EXACTLY what the pre-#90 policy would have ***",
        Math.abs(before - after) < 1e-6, `before=${before.toFixed(6)} after=${after.toFixed(6)}`);
}

console.log(fails ? `\naggroHazardFeature-selfcheck: ${fails} FAILED` : "\naggroHazardFeature-selfcheck: all checks pass");
console.log("unchecked here: brain/brain.js's own Deno orchestration (imports FEATURES/buildLayers/buildFeatures as opaque symbols and was not " +
    "otherwise touched -- confirmed by grep, no hardcoded '10' anywhere downstream); brain/learn.js's loadWeights against a REAL pre-#90 10-length " +
    "AGGRO_W_PATH save file (exact-length-only, no migration path for this single-layer policy -- stated in this file's own header, not simulated " +
    "here); simulation/KaijuManager.js's k._hazard computation itself, gated separately in kaijuGroundCollider-selfcheck.mjs; main.js's snapshot " +
    "payload wiring (a live browser boot, not available in this sandbox).");
process.exit(fails ? 1 : 0);
