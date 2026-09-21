// WebGLEngine/brain/peerBrain.mjs
//
// A portable export/import format for a trained policy's weight vector -- "a fly brain", in the sense race-brain.html
// trains one for brain/drivePolicy.mjs and brain/gunnerPolicy.mjs -- so one peer's locally-trained brain can be shared
// with another and raced against theirs (brain/drivePolicy.mjs's race()/brain/gunnerPolicy.mjs's raceWithGunners()
// already accept any weight vector of the right shape; nothing about racing itself needs to change).
//
// Deliberately generic over WHICH policy: exportBrain/importBrain take a small descriptor `{ id, FEATURES, HIDDEN,
// OUTPUTS, WEIGHT_COUNT }` -- a policy module's own live exports, tagged with a short id string -- rather than
// importing brain/drivePolicy.mjs or brain/gunnerPolicy.mjs directly. Same "hold the shape, not the module" pattern
// render/carViews.mjs's activationsOf() already uses, so a third policy needs no change here to use this format.
//
// VALIDATION MIRRORS driveStore()/gunnerStore()'s OWN RULE, restated here because those stores check a weight count
// baked into their own module at load time, while this module is generic over whichever policy descriptor a caller
// passes: malformed input (wrong format, wrong policy, wrong length, any non-finite value) is refused at the door,
// same as a local training offer -- and importBrain NEVER throws, so a caller can hand it untrusted peer or file
// input directly without wrapping every call in its own try/catch.
"use strict";

export const FORMAT = "swek-brain-v1";

/** A portable snapshot of a trained policy's weights, tagged with what circuit it's for and (optionally) how it scored. */
export function exportBrain(policy, weights, { score = null, by = null, citation = null } = {}) {
    if (!policy || !policy.id || !Number.isFinite(policy.WEIGHT_COUNT)) throw new Error("peerBrain.exportBrain: policy descriptor needs at least { id, WEIGHT_COUNT }");
    if (!weights || weights.length !== policy.WEIGHT_COUNT) throw new Error(`peerBrain.exportBrain: weights.length (${weights && weights.length}) must equal policy.WEIGHT_COUNT (${policy.WEIGHT_COUNT})`);
    return {
        format: FORMAT,
        policy: policy.id,
        features: policy.FEATURES ?? null,
        hidden: policy.HIDDEN ?? null,
        outputs: policy.OUTPUTS ?? null,
        weightCount: policy.WEIGHT_COUNT,
        weights: Array.from(weights),
        score,
        by,
        citation,
        exportedAt: new Date().toISOString(),
    };
}

/**
 * Validate and unpack an imported blob against a policy descriptor. Returns { ok: true, weights: Float32Array, meta }
 * or { ok: false, reason } -- never throws. Refuses: the wrong format tag, a policy id mismatch (a gunner blob fed
 * to a driver importer), a weight-count mismatch (including a stale export from before a topology re-vendor changed
 * WEIGHT_COUNT), a wrong array shape, and any non-finite value.
 */
export function importBrain(policy, blob) {
    if (!policy || !policy.id || !Number.isFinite(policy.WEIGHT_COUNT)) return { ok: false, reason: "no policy descriptor to import into" };
    if (!blob || typeof blob !== "object") return { ok: false, reason: "not a brain export" };
    if (blob.format !== FORMAT) return { ok: false, reason: `unknown format ${JSON.stringify(blob.format)} (expected ${JSON.stringify(FORMAT)})` };
    if (blob.policy !== policy.id) return { ok: false, reason: `this brain is for ${JSON.stringify(blob.policy)}, not ${JSON.stringify(policy.id)}` };
    if (!Array.isArray(blob.weights) || blob.weights.length !== policy.WEIGHT_COUNT) return { ok: false, reason: `weight count ${blob.weights && blob.weights.length} does not match ${policy.id}'s current ${policy.WEIGHT_COUNT} (a stale export from before a topology change?)` };
    if (blob.weights.some((v) => typeof v !== "number" || !Number.isFinite(v))) return { ok: false, reason: "a weight is not a finite number" };
    return { ok: true, weights: Float32Array.from(blob.weights), meta: { score: blob.score ?? null, by: blob.by ?? null, citation: blob.citation ?? null, exportedAt: blob.exportedAt ?? null } };
}

/** The { id, FEATURES, HIDDEN, OUTPUTS, WEIGHT_COUNT } descriptor exportBrain/importBrain need, read off a live policy module. */
export function describePolicy(id, mod) {
    return { id, FEATURES: mod.FEATURES, HIDDEN: mod.HIDDEN, OUTPUTS: mod.OUTPUTS, WEIGHT_COUNT: mod.WEIGHT_COUNT };
}
