// WebGLEngine/ai-bridge/bzTacticsBridge.js — the GPU Brain's TANK tactics producer.
//
// Owns:
//   GET  /ai/brain/bz/tactics          -> { weights, samples, trained, source: "learned"|"hand" }
//   POST /ai/brain/bz/tactics          -> record one decision outcome {chosen, alt, reward}, retrain
//   POST /ai/brain/bz/tactics/reset    -> back to the hand policy (and forget the buffer)
//
// The twin of tacticsBridge.js, with a different schema and its own file on disk. It must be registered
// BEFORE gpuBrainBridge, which owns the whole /ai/brain prefix and would swallow these routes silently --
// the exact trap that nearly killed /ai/brain/bench in v2155.
//
// SEPARATE ON PURPOSE. A tank's features are not a ship's, and `brain/bzTacticsPolicy.js`'s `isFeat`
// rejects a ship's sample the way `brain/tacticsPolicy.js`'s rejects a tank's. Sharing one buffer would
// have poisoned a trained model with numbers that are not about anything; sharing one route would have
// meant one `isFeat` and no wall at all.
//
// Honesty rules, the same three:
//   - a policy that has not seen enough data is NOT served. `source` says "hand" and the pilot keeps its
//     own defaults. We never dress up untrained numbers as learned ones.
//   - a decision with no counterfactual carries no gradient and is rejected, not silently absorbed.
//   - the sample buffer is capped and persisted, so training is reproducible from disk.

const fs = require("fs");
const os = require("os");
const path = require("path");
const policy = require("../brain/bzTacticsPolicy.js");

const STATE_DIR = process.env.BRAIN_STATE_DIR
    ? String(process.env.BRAIN_STATE_DIR).replace(/[\\/]+$/, "")
    : path.join(os.homedir(), ".voxelbridge", "brain");
const FILE = path.join(STATE_DIR, "bz_tactics_policy.json");

const MAX_SAMPLES = 4000;
const MIN_SAMPLES = 8;
const LR = 0.05;
const ROUTE = "/ai/brain/bz/tactics";

let state = null;

function load() {
    if (state) return state;
    try {
        const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
        if (j && Array.isArray(j.samples)) { state = { samples: j.samples, weights: j.weights || policy.defaultWeights() }; return state; }
    } catch {}
    state = { samples: [], weights: policy.defaultWeights() };
    return state;
}

function save() {
    try {
        fs.mkdirSync(STATE_DIR, { recursive: true });
        fs.writeFileSync(FILE, JSON.stringify({ weights: state.weights, samples: state.samples, savedAt: Date.now() }));
    } catch {}
}

// Retrain from the whole buffer rather than incrementally, so the served weights are always exactly what
// the recorded history implies.
function retrain() {
    const r = policy.trainAll(state.samples, policy.defaultWeights(), LR);
    state.weights = r.weights;
    return r;
}

function owns(url) {
    const u = (url || "").split("?")[0];
    return u === ROUTE || u === ROUTE + "/reset";
}

function handle(req, res, ctx = {}) {
    const sendJson = ctx.sendJson || ((o, code = 200) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(o));
    });
    const p = (req.url || "").split("?")[0];
    const st = load();

    if (req.method === "GET" && p === ROUTE) {
        const trained = policy.isTrained(st.weights, st.samples.length, MIN_SAMPLES);
        return sendJson({
            ok: true, policy: "bz",
            trained,
            source: trained ? "learned" : "hand",
            samples: st.samples.length,
            minSamples: MIN_SAMPLES,
            // Untrained -> null, and the pilot keeps bz/bzPilot.js's own hand policy. Serving
            // half-learned numbers would be worse than none.
            weights: trained ? st.weights : null,
            handWeights: policy.defaultWeights(),
            features: policy.F_KEYS,
            file: FILE,
        });
    }

    if (req.method === "POST" && p === ROUTE + "/reset") {
        state = { samples: [], weights: policy.defaultWeights() };
        save();
        return sendJson({ ok: true, reset: true, samples: 0, source: "hand" });
    }

    if (req.method === "POST" && p === ROUTE) {
        let body = "";
        req.on("data", (c) => { body += c; if (body.length > 262144) body = body.slice(0, 262144); });
        req.on("end", () => {
            let batch = [];
            try {
                const j = JSON.parse(body || "{}");
                batch = Array.isArray(j.samples) ? j.samples : (j.chosen ? [j] : []);
            } catch { return sendJson({ ok: false, error: "bad JSON" }, 400); }

            let taken = 0, rejected = 0;
            for (const s of batch) {
                const r = Number(s && s.reward);
                // policy.isFeat is the wall. A ship's sample -- `reach`, `weakness`, `threat` -- has none
                // of a tank's features and is rejected here rather than averaged into the weights.
                if (!policy.isFeat(s && s.chosen) || !policy.isFeat(s && s.alt) || !Number.isFinite(r) || r === 0) { rejected++; continue; }
                st.samples.push({ chosen: s.chosen, alt: s.alt, reward: r > 0 ? 1 : -1 });
                taken++;
            }
            if (st.samples.length > MAX_SAMPLES) st.samples = st.samples.slice(-MAX_SAMPLES);
            if (taken) { retrain(); save(); }

            const trained = policy.isTrained(st.weights, st.samples.length, MIN_SAMPLES);
            sendJson({
                ok: true, policy: "bz", taken, rejected, samples: st.samples.length,
                trained, source: trained ? "learned" : "hand",
                weights: trained ? st.weights : null,
            });
        });
        return;
    }
}

module.exports = { owns, handle, _load: load, _file: () => FILE, _route: ROUTE };
