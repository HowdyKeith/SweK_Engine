// WebGLEngine/brain/blobPolicyStore.js -- the store behind the blob flight policy. CJS, like its siblings.
//
// The blob learned to fly in v2436 and then forgot it every time the tab closed, because the weights only ever lived
// in the page. This is where they live now: ~/.voxelbridge/brain, next to the rest of the brain's state.
//
// Three rules, borrowed from csTacticsBridge because they were right there and they were right:
//   - never dress up nothing as learned. A fresh machine has no policy, says so ("baked"), and the client flies its
//     own baked weights. We do not serve an empty object and call it training.
//   - a corrupted or malformed submission is refused, not absorbed. The blob must never be bricked by bad JSON.
//   - BEST WINS. Weights are only replaced by weights that scored better on the held-out set. That makes the store
//     safe to point a whole fleet at: Galaxina can train, the Mac can train, and whoever actually flies best wins --
//     a peer can only ever improve the policy, never degrade it by being the most recent to speak.
//
// It holds no baked copy of its own. The client owns the fallback (fx/avatar/blobGravity.js TRAINED_WEIGHTS), so the
// weights exist in exactly one place and cannot drift from themselves -- the lesson the fire ramp taught.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const STATE_DIR = process.env.BRAIN_STATE_DIR
    ? String(process.env.BRAIN_STATE_DIR).replace(/[\\/]+$/, "")
    : path.join(os.homedir(), ".voxelbridge", "brain");
const FILE = path.join(STATE_DIR, "blob_policy.json");

const SHAPE = { heat: 5, vent: 5, bias: 2 };
const finite = (v) => typeof v === "number" && Number.isFinite(v);
// shape + finiteness. A NaN in one weight is a blob that never flies again, so it is refused at the door.
function isWeights(w) {
    if (!w || typeof w !== "object") return false;
    for (const k of Object.keys(SHAPE)) {
        if (!Array.isArray(w[k]) || w[k].length !== SHAPE[k]) return false;
        for (const v of w[k]) if (!finite(v)) return false;
    }
    return true;
}
function isSubmission(s) { return !!s && isWeights(s.weights) && finite(s.score) && s.score > 0; }
function clone(w) { return { heat: w.heat.slice(), vent: w.vent.slice(), bias: w.bias.slice() }; }

let _cache = null;
function load() {
    if (_cache) return _cache;
    try {
        const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
        if (isSubmission(j)) { _cache = j; return _cache; }        // only trust it if it still validates
    } catch {}                                                      // missing or corrupt -> we simply have nothing learned
    _cache = null; return _cache;
}
function save(sub) {
    if (!isSubmission(sub)) return { ok: false, reason: "malformed weights or score" };
    try { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(sub, null, 2)); _cache = sub; return { ok: true }; }
    catch (e) { return { ok: false, reason: String(e.message || e) }; }
}
// BEST WINS: being newer earns nothing. Only a better held-out score replaces what is there.
function offer(sub) {
    if (!isSubmission(sub)) return { ok: false, accepted: false, reason: "malformed weights or score" };
    const cur = load();
    if (cur && cur.score >= sub.score) return { ok: true, accepted: false, reason: "kept the better policy", score: cur.score, offered: sub.score };
    const r = save({ weights: clone(sub.weights), score: sub.score, iters: sub.iters || 0, by: sub.by || "unknown", at: Date.now() });
    return r.ok ? { ok: true, accepted: true, score: sub.score, was: cur ? cur.score : null } : { ok: false, accepted: false, reason: r.reason };
}
function serve() {
    const cur = load();
    if (!cur) return { source: "baked", weights: null, score: null, by: null };   // honest: nothing learned here yet
    return { source: "learned", weights: clone(cur.weights), score: cur.score, iters: cur.iters || 0, by: cur.by || null, at: cur.at || null };
}
function reset() { try { fs.unlinkSync(FILE); } catch {} _cache = null; return { ok: true }; }
function _forget() { _cache = null; }
module.exports = { isWeights, isSubmission, offer, serve, save, load, reset, FILE, STATE_DIR, _forget };
