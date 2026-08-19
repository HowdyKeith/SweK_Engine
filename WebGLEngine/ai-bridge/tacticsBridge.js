// WebGLEngine/ai-bridge/tacticsBridge.js — the GPU Brain's tactics producer.
//
// Owns:
//   GET  /ai/brain/tactics          -> { weights, samples, trained, source: "learned"|"hand" }
//   POST /ai/brain/tactics          -> record one decision outcome {chosen, alt, reward}, retrain
//   POST /ai/brain/tactics/reset    -> back to the hand policy (and forget the buffer)
//
// MUST be registered BEFORE gpuBrainBridge: that bridge owns the whole /ai/brain prefix and would
// swallow these routes silently (the exact trap that nearly killed /ai/brain/bench in v2155).
//
// Why the bridge and not brain.js: the bridge is plain Node, so the learner is testable here rather
// than only on the rig; it already persists to the same ~/.voxelbridge/brain state dir; and both the
// engine (which produces outcomes) and the brain (which consumes policy) already talk to it.
//
// Honesty rules baked in:
//   - a policy that has not seen enough data is NOT served. `source` says "hand" and the engine keeps
//     its own defaults. We never dress up untrained numbers as learned ones.
//   - a decision with no counterfactual carries no gradient and is rejected, not silently absorbed.
//   - the sample buffer is capped and persisted, so training is reproducible from disk.

const fs = require("fs");
const os = require("os");
const path = require("path");
const policy = require("../brain/tacticsPolicy.js");

const STATE_DIR = process.env.BRAIN_STATE_DIR
    ? String(process.env.BRAIN_STATE_DIR).replace(/[\\/]+$/, "")
    : path.join(os.homedir(), ".voxelbridge", "brain");
const FILE = path.join(STATE_DIR, "tactics_policy.json");

const MAX_SAMPLES = 4000;     // enough to learn, bounded so the file cannot grow without end
const MIN_SAMPLES = 8;        // below this the policy is not served (see isTrained)
const LR = 0.05;

let state = null;             // { samples: [...], weights: {...} }

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

// Retrain from the whole buffer rather than incrementally, so the served weights are always exactly
// what the recorded history implies. 4000 five-dim updates is microseconds; there is no reason to be
// clever and risk drift between the file and the served vector.
function retrain() {
    const r = policy.trainAll(state.samples, policy.defaultWeights(), LR);
    state.weights = r.weights;
    return r;
}

function isFeat(f) {
    return f && typeof f === "object"
        && ["reach", "weakness", "threat", "isPlayer", "focus"].every((k) => Number.isFinite(Number(f[k])));
}

function owns(url) {
    const u = (url || "").split("?")[0];
    return u === "/ai/brain/tactics" || u === "/ai/brain/tactics/reset";
}

function handle(req, res, ctx = {}) {
    const sendJson = ctx.sendJson || ((o, code = 200) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(o));
    });
    const p = (req.url || "").split("?")[0];
    const st = load();

    if (req.method === "GET" && p === "/ai/brain/tactics") {
        const trained = policy.isTrained(st.weights, st.samples.length, MIN_SAMPLES);
        return sendJson({
            ok: true,
            trained,
            source: trained ? "learned" : "hand",
            samples: st.samples.length,
            minSamples: MIN_SAMPLES,
            // Only hand out weights the engine should actually use. Untrained -> null, and the engine
            // keeps esTactics' own hand policy. Serving half-learned numbers would be worse than none.
            weights: trained ? st.weights : null,
            handWeights: policy.defaultWeights(),
            file: FILE,
        });
    }

    if (req.method === "POST" && p === "/ai/brain/tactics/reset") {
        state = { samples: [], weights: policy.defaultWeights() };
        save();
        return sendJson({ ok: true, reset: true, samples: 0, source: "hand" });
    }

    if (req.method === "POST" && p === "/ai/brain/tactics") {
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
                if (!isFeat(s && s.chosen) || !isFeat(s && s.alt) || !Number.isFinite(r) || r === 0) { rejected++; continue; }
                st.samples.push({ chosen: s.chosen, alt: s.alt, reward: r > 0 ? 1 : -1 });
                taken++;
            }
            if (st.samples.length > MAX_SAMPLES) st.samples = st.samples.slice(-MAX_SAMPLES);
            if (taken) { retrain(); save(); }

            const trained = policy.isTrained(st.weights, st.samples.length, MIN_SAMPLES);
            sendJson({
                ok: true, taken, rejected, samples: st.samples.length,
                trained, source: trained ? "learned" : "hand",
                weights: trained ? st.weights : null,
            });
        });
        return;
    }
}

module.exports = { owns, handle, _load: load, _file: () => FILE };
