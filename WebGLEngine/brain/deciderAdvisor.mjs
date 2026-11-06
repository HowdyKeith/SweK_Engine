// WebGLEngine/brain/deciderAdvisor.mjs -- UNNUMBERED (the version is chosen at ship time) (the gate is brain/deciderAdvisor-selfcheck.mjs)
//
// ROUND 14 of brain/NEEDS_AND_LIMITS.md, registered before this file existed: a DECIDER chip, the advisor socket of Round 4 filled by a model that answers TYPED QUESTIONS WITH PROBABILITIES (Mapika/decider: a state, questions, and
// per option a probability from one forward pass; no text is generated, so there is nothing to parse). A seat (ctx) -> seat(st, obs) -> a decision { surface, station, cap, pump, repair }, flown by brain/advisorChip.mjs.
// WHAT IS NEW OVER brain/advisorTranscript.mjs (Round 5): a field is advised ONLY when its option's probability reaches `tau`; below it the field is NEUTRAL (surface/pump/repair false, cap NEUTRAL_CAP which the brain's 0.9 never
// exceeds, station null), which the VETO combination leaves as the brain's own. tau is applied at REPLAY, never recorded and never shown to the model, so two thresholds read the same recorded probabilities.
// THE MODEL IS KEPT OUT OF THE GRADED PATH, as in Round 5: RECORD calls `deciderFn(state, questions) -> answers` (SYNCHRONOUS, supplied by the caller: this file has no network, process or file) and stores the answers under a
// key of (model, params, prompt); REPLAY never calls a model and a situation the transcript lacks is a refusal (TranscriptMiss), never an invented answer. An answer is { probs: { <option label>: p } } per question id; a missing or
// malformed one makes THAT field neutral and is counted. What the model sees is the pilot's observation and nothing else (no seed, kind, `unreachable` flag, true charge or comparator name; the gate holds this).
// Pure: no clock, no Math.random, no network, no process, no file.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import { keyOf, TranscriptMiss } from "./advisorTranscript.mjs";

export { TranscriptMiss };
export const SCHEMA = 1, EVERY = 600;
/** The registered thresholds (section 4): DECIDER-T50 and DECIDER-T80. Fixed, not tuned. */
export const TAUS = Object.freeze({ T50: 0.5, T80: 0.8 });
export const CAP_LEVELS = Object.freeze([0.5, 0.6, 0.7, 0.8, 0.9]);
/** The cap of a silent cap question: above the brain's HULL_DEPTH (0.9), so min(brain, advisor) is the brain's. */
export const NEUTRAL_CAP = 0.95;
export const MODES = Object.freeze(["record", "replay"]);
/** The registered sets (section 5): D1, D2, D3, four kinds each. The ONE place these seeds are written; the gate holds them disjoint from every other round's. */
export const DECIDER_AUDITS = Object.freeze([[1301, 1312], [1321, 1332], [1341, 1352]]);
const NEUTRAL = Object.freeze({ surface: false, station: null, cap: NEUTRAL_CAP, pump: false, repair: false });

const r0 = (v) => Math.round(v), r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const wrapDeg = (d) => { let x = d % 360; if (x > 180) x -= 360; if (x < -180) x += 360; return x; };

/** The state a pilot at the helm sees, as rounded numbers. `obs.r.frac` is the GAUGE reading (noisy under a noisy gauge); nothing about the scenario is here. Deterministic. */
export function stateOf(st, obs) {
    const r = obs.r, heading = (S.attitude(st).heading * 180) / Math.PI;
    return {
        time_s: r0(obs.t), of_s: 600, depth_m: r2(r.depth), charge_gauge: r2(r.frac), hull_strain: r2(r.strain), damage: r2(r.damage), flooding: r3(r.flood), collapse_depth_m: r0(r.collapseDepth),
        stations: obs.stations.map((q, i) => {
            const dx = q.x - st.pos[0], dy = q.y - st.pos[1];
            return { station: i, visited: !!q.visited, distance_m: r0(Math.hypot(dx, dy)), bearing_deg: r0(wrapDeg((Math.atan2(-dy, dx) * 180) / Math.PI - heading)), depth_m: r0(q.depth) };
        }),
    };
}
/** The typed questions for this situation (schema 1). Station options are the unvisited stations by index, and "none"; with none unvisited there is no station question. */
export function questionsOf(obs) {
    const open = obs.stations.map((q, i) => (q.visited ? null : String(i))).filter((x) => x !== null);
    // Decider's Choice needs 2..255 options (measured: "choice criteria: a map of 2..255 options"); with every station visited the only option is "none", so the station question is NOT ASKED (Round 14 Amendment 2). The decision's station stays null, which is the brain's own then.
    const station = open.length ? [{ id: "station", type: "choice", text: "Which unvisited station should the boat go to next?", options: [...open, "none"] }] : [];
    return [
        { id: "surface", type: "noul", text: "Should the submarine go up to the surface and stay there to recharge now?" },
        { id: "pump", type: "noul", text: "Is the bilge pump needed now (is the boat flooding)?" },
        { id: "repair", type: "noul", text: "Should the hull be repaired now (at the surface, with damage)?" },
        { id: "cap", type: "choice", text: "How deep may the boat go, as a fraction of its hull collapse depth?", options: CAP_LEVELS.map(String) },
        ...station,
    ];
}
/** The text a model is asked, and the transcript key is made of. */
export const promptOf = (st, obs) => JSON.stringify({ schema: SCHEMA, state: stateOf(st, obs), questions: questionsOf(obs) });

const isProb = (p) => typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= 1;
/** A valid answer to `q`: probs an object whose labels are among the options (noul: "yes"/"no") and whose values are probabilities; a choice must have at least one label. */
function probsOf(a, q) {
    const probs = a && typeof a === "object" ? a.probs : null;
    if (!probs || typeof probs !== "object") return null;
    const allowed = q.type === "noul" ? ["yes", "no"] : q.options, keys = Object.keys(probs);
    if (!keys.length || !keys.every((k) => allowed.includes(k) && isProb(probs[k]))) return null;
    if (q.type === "noul" && !("yes" in probs)) return null;
    return probs;
}
/** How many of `questions` (as they stand in a prompt) have no valid answer in `answers`. 0 means the ask was fully answered. The audit's ANSWER RATE is the share of asks with 0. */
export const invalidQuestions = (answers, questions) => questions.filter((q) => !probsOf(answers && answers[q.id], q)).length;
const best = (probs) => { let k = null; for (const key of Object.keys(probs)) if (k === null || probs[key] > probs[k]) k = key; return k; };

/**
 * One decision from the recorded answers at threshold tau: each field is advised only when its probability reaches tau (a Noul on P(yes); a Choice on its best option), else it is NEUTRAL. Returns { decision, invalid }
 * where `decision.station` is the CURRENT observation's station object or null, and `invalid` is the number of questions with no valid answer. tau above 1 advises nothing.
 */
export function decide(answers, obs, tau) {
    const qs = questionsOf(obs), d = { ...NEUTRAL }; let invalid = 0;
    for (const q of qs) {
        const probs = probsOf(answers && answers[q.id], q);
        if (!probs) { invalid++; continue; }
        if (q.type === "noul") { if (probs.yes >= tau) d[q.id] = true; continue; }
        const k = best(probs); if (probs[k] < tau) continue;
        if (q.id === "cap") d.cap = Number(k);
        else d.station = k === "none" ? null : obs.stations[Number(k)] || null;
    }
    return { decision: d, invalid };
}

// ---- the transcript ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** A transcript: { header: { kind, schema, model: { id, params }, every }, entries: Map key -> { key, prompt, reply } } where reply is the answers as json text. */
export function createTranscript({ model, every = EVERY } = {}) {
    if (!model || typeof model.id !== "string" || !model.id) throw new Error("deciderAdvisor.createTranscript: a model with an id (and its params) is required");
    if (!Number.isInteger(every) || every < 1) throw new Error("deciderAdvisor.createTranscript: every must be a whole number of ticks of 1 or more");
    return { header: { kind: "decider-transcript", schema: SCHEMA, model: { id: model.id, params: model.params || {} }, every }, entries: new Map() };
}
export const serialize = (tr) => [JSON.stringify(tr.header), ...[...tr.entries.values()].map((e) => JSON.stringify(e))].join("\n") + "\n";
export function parseTranscript(text) {
    const lines = String(text).split("\n").filter((l) => l.trim());
    if (!lines.length) throw new Error("deciderAdvisor.parseTranscript: empty");
    let h; try { h = JSON.parse(lines[0]); } catch { throw new Error("deciderAdvisor.parseTranscript: the first line is not json"); }
    if (!h || h.kind !== "decider-transcript") throw new Error("deciderAdvisor.parseTranscript: the first line is not a decider-transcript header");
    if (h.schema !== SCHEMA) throw new Error(`deciderAdvisor.parseTranscript: schema ${h.schema}, this code reads ${SCHEMA}`);
    const tr = createTranscript({ model: h.model, every: h.every });
    for (const l of lines.slice(1)) {
        let e; try { e = JSON.parse(l); } catch { throw new Error("deciderAdvisor.parseTranscript: an entry is not json"); }
        if (!e || typeof e.key !== "string" || typeof e.prompt !== "string" || typeof e.reply !== "string") throw new Error("deciderAdvisor.parseTranscript: a malformed entry");
        if (keyOf(tr.header.model, e.prompt) !== e.key) throw new Error(`deciderAdvisor.parseTranscript: key ${e.key} does not match its prompt`);
        const old = tr.entries.get(e.key); if (old && old.reply !== e.reply) throw new Error(`deciderAdvisor.parseTranscript: key ${e.key} twice with different replies`);
        tr.entries.set(e.key, e);
    }
    return tr;
}

// ---- the seat ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/**
 * The seat factory: ({ transcript, mode, tau, deciderFn }) -> (ctx) -> seat(st, obs) -> a decision. Every `transcript.header.every` ticks it asks (record: deciderFn(state, questions), stored) or looks up (replay: never
 * calls a model; a miss throws TranscriptMiss); between asks it holds the last answers and re-resolves the station against the CURRENT observation every tick. `seat.stats` = { ticks, asks, calls, hits, invalid (questions
 * without a valid answer), advised: { surface, pump, repair, cap, station } (ticks on which the field was advised) }.
 */
export function deciderSeat({ transcript, mode, tau, deciderFn = null }) {
    if (!transcript || !transcript.header) throw new Error("deciderAdvisor.deciderSeat: a transcript is required");
    if (!MODES.includes(mode)) throw new Error(`deciderAdvisor.deciderSeat: mode ${JSON.stringify(mode)} (${MODES.join(" or ")})`);
    if (typeof tau !== "number" || !Number.isFinite(tau) || tau <= 0) throw new Error("deciderAdvisor.deciderSeat: tau must be a positive number");
    if (mode === "record" && typeof deciderFn !== "function") throw new Error("deciderAdvisor.deciderSeat: record mode needs deciderFn(state, questions) -> answers");
    const every = transcript.header.every, model = transcript.header.model;
    return () => {
        const stats = { ticks: 0, asks: 0, calls: 0, hits: 0, invalid: 0, advised: { surface: 0, pump: 0, repair: 0, cap: 0, station: 0 } };
        let n = 0, answers = null, fresh = false;
        const seat = (st, obs) => {
            fresh = n % every === 0;
            if (fresh) {
                const prompt = promptOf(st, obs), key = keyOf(model, prompt); stats.asks++;
                let e = transcript.entries.get(key);
                if (e && e.prompt !== prompt) throw new Error(`deciderAdvisor: key ${key} collides with a different prompt`);
                if (e) stats.hits++;
                else if (mode === "replay") throw new TranscriptMiss(key);
                else { stats.calls++; e = { key, prompt, reply: JSON.stringify(deciderFn(stateOf(st, obs), questionsOf(obs)) ?? null) }; transcript.entries.set(key, e); }
                try { answers = JSON.parse(e.reply); } catch { answers = null; }
            }
            n++; stats.ticks++;
            const { decision: d, invalid } = decide(answers, obs, tau);
            if (fresh) stats.invalid += invalid;
            for (const f of ["surface", "pump", "repair"]) if (d[f]) stats.advised[f]++;
            if (d.cap !== NEUTRAL_CAP) stats.advised.cap++;
            if (d.station) stats.advised.station++;
            return d;
        };
        Object.defineProperty(seat, "stats", { get: () => stats });
        return seat;
    };
}
