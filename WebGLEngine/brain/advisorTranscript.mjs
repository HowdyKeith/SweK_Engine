// WebGLEngine/brain/advisorTranscript.mjs -- UNNUMBERED (the version is chosen at ship time) (the gate is brain/advisorTranscript-selfcheck.mjs)
//
// THE RECORDED-DECISION SEAT: the socket a LANGUAGE-MODEL chip plugs into, so that a model's advice can be graded by the same machinery as a rule's (brain/advisorChip.mjs, brain/NEEDS_AND_LIMITS.md Round 4) and the grading is REPRODUCIBLE although the model is not.
// A live model is non-deterministic, costs a call per decision and answers late; a seat that calls one cannot be gated or audited twice. So the model is kept OUT of the graded path:
//   RECORD  the seat renders what the pilot sees as a text prompt (renderPrompt), hands it to `modelFn(prompt) -> reply string` (SYNCHRONOUS: the caller supplies it; this file has no network, no process, no file), parses the reply STRICTLY into a decision (parseReply)
//           and stores { key, prompt, reply, decision } in a transcript, keyed by a hash of (model, params, prompt). A situation seen twice is asked once.
//   REPLAY  the seat NEVER calls a model: it looks the prompt up in the transcript and answers what was recorded, byte for byte; a prompt the transcript does not hold is a REFUSAL (TranscriptMiss), never an invented answer.
// So the graded run is the recorded run, and replaying it any number of times gives the same score: the number is the model's AS RECORDED, said so. What the model sees is exactly the pilot's observation (the gauge reading, not the true charge; no scenario, no seed); the prompt is
// versioned (PROMPT_SCHEMA) and the reply format is fixed (REPLY_FORMAT). The seat decides every `every` ticks (default 30: once a second) and holds its decision between; the station is held as an INDEX and resolved against the current observation every tick (a visited flag stays current).
// An invalid reply is not guessed at: the seat is SILENT for that step (decision null), which brain/advisorChip.mjs reads as "no advice" (the brain's decision stands); the count of invalid replies is in the stats. A silent seat is an ADVISOR only: it is not a brain.
// Pure: no clock, no Math.random, no network, no process, no file.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";

export const PROMPT_SCHEMA = 1, TRANSCRIPT_SCHEMA = 1, EVERY = 30;
export const CAP_RANGE = Object.freeze({ lo: 0.5, hi: 0.95 });
export const REPLY_FORMAT = '{"surface": true|false, "station": 0|1|2|null, "cap": number between 0.5 and 0.95, "pump": true|false, "repair": true|false}';
export const MODES = Object.freeze(["record", "replay"]);

const r0 = (v) => Math.round(v), r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const wrapDeg = (d) => { let x = d % 360; if (x > 180) x -= 360; if (x < -180) x += 360; return x; };

/**
 * The prompt of one observation: what a pilot at the helm of the survey run sees, as numbers rounded to what a person would read off a gauge, and NOTHING else. `obs.r` carries the gauge reading `frac` (under a noisy gauge it is the noisy one); the true charge, the scenario and
 * the seed are not in `obs` and cannot reach the prompt. Deterministic: the same (st, obs) is the same text.
 */
export function renderPrompt(st, obs) {
    const r = obs.r, heading = (S.attitude(st).heading * 180) / Math.PI;
    const lines = [
        `SURVEY RUN (prompt schema ${PROMPT_SCHEMA}). You advise the helm of a small submarine. Visit the stations (any order), then return to the surface before the time runs out. Do not let the hull go deeper than it can bear; the charge only refills at the surface.`,
        `time ${r0(obs.t)} s of 600. depth ${r2(r.depth)} m. charge gauge reads ${r2(r.frac)} (it is noisy). hull strain ${r2(r.strain)} of its limit (1.0 collapses). damage ${r2(r.damage)}. flooding ${r3(r.flood)}. hull collapse depth ${r0(r.collapseDepth)} m.`,
    ];
    obs.stations.forEach((q, i) => {
        const dx = q.x - st.pos[0], dy = q.y - st.pos[1], bearing = wrapDeg((Math.atan2(-dy, dx) * 180) / Math.PI - heading);
        lines.push(`station ${i}: ${q.visited ? "VISITED" : "not visited"}, ${r0(Math.hypot(dx, dy))} m away, bearing ${r0(bearing)} deg (0 = ahead, positive = to starboard), depth ${r0(q.depth)} m.`);
    });
    lines.push(`Reply with ONE json object and nothing else: ${REPLY_FORMAT}. surface = go up and stay up; station = which unvisited station to go to (null = none); cap = the deepest you will let the boat go as a fraction of its collapse depth; pump = bail the flood; repair = mend the hull (only works at the surface).`);
    return lines.join("\n");
}

/** The first json object in a reply (a model wraps it in prose or a code fence), as text; null when there is none. */
function firstObject(text) {
    const s = String(text), start = s.indexOf("{"); if (start < 0) return null;
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
        const c = s[i];
        if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
        if (c === '"') inStr = true; else if (c === "{") depth++; else if (c === "}") { depth--; if (depth === 0) return s.slice(start, i + 1); }
    }
    return null;
}
/**
 * A reply parsed STRICTLY: the first json object must have surface, pump and repair as booleans, station as null or an integer in 0..stations-1, cap as a finite number (clamped to CAP_RANGE). Anything else is { ok: false, why }. Extra fields are ignored.
 * Returns { ok: true, decision: { surface, station (an index or null), cap, pump, repair } }.
 */
export function parseReply(reply, stations = 3) {
    const t = firstObject(reply); if (t === null) return { ok: false, why: "no json object" };
    let o; try { o = JSON.parse(t); } catch { return { ok: false, why: "not valid json" }; }
    for (const f of ["surface", "pump", "repair"]) if (typeof o[f] !== "boolean") return { ok: false, why: `${f} is not a boolean` };
    if (!(o.station === null || (Number.isInteger(o.station) && o.station >= 0 && o.station < stations))) return { ok: false, why: "station is not null or a valid index" };
    if (typeof o.cap !== "number" || !Number.isFinite(o.cap)) return { ok: false, why: "cap is not a number" };
    return { ok: true, decision: { surface: o.surface, station: o.station, cap: Math.min(CAP_RANGE.hi, Math.max(CAP_RANGE.lo, o.cap)), pump: o.pump, repair: o.repair } };
}

// ---- the transcript ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const fnv = (s, seed) => { let h = seed >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); };
/** The key of a situation: two independent 32-bit hashes of (model id, params, prompt). A lookup also compares the stored prompt, so a collision is an error and not a wrong answer. */
export const keyOf = (model, prompt) => { const s = `${model.id}\n${JSON.stringify(model.params || {})}\n${prompt}`; return fnv(s, 0x811c9dc5) + fnv(s, 0x9747b28c); };

export class TranscriptMiss extends Error { constructor(key) { super(`advisorTranscript: the transcript has no recorded answer for this situation (key ${key}); a replay never invents one`); this.key = key; } }

/** A transcript: { header: { kind, schema, model: { id, params }, every, promptSchema }, entries: Map key -> { key, prompt, reply, decision | null } }. */
export function createTranscript({ model, every = EVERY } = {}) {
    if (!model || typeof model.id !== "string" || !model.id) throw new Error("advisorTranscript.createTranscript: a model with an id (and its params) is required");
    if (!Number.isInteger(every) || every < 1) throw new Error("advisorTranscript.createTranscript: every must be a whole number of ticks of 1 or more");
    return { header: { kind: "advisor-transcript", schema: TRANSCRIPT_SCHEMA, promptSchema: PROMPT_SCHEMA, model: { id: model.id, params: model.params || {} }, every }, entries: new Map() };
}
/** The transcript as text: the header line, then one json line per entry, in the order recorded. */
export const serialize = (tr) => [JSON.stringify(tr.header), ...[...tr.entries.values()].map((e) => JSON.stringify(e))].join("\n") + "\n";
/** A transcript from text; refuses a missing or foreign header, another schema, a malformed entry, a key that does not match its prompt, or the same key twice with different answers. */
export function parseTranscript(text) {
    const lines = String(text).split("\n").filter((l) => l.trim());
    if (!lines.length) throw new Error("advisorTranscript.parseTranscript: empty");
    let header; try { header = JSON.parse(lines[0]); } catch { throw new Error("advisorTranscript.parseTranscript: the first line is not json"); }
    if (!header || header.kind !== "advisor-transcript") throw new Error("advisorTranscript.parseTranscript: the first line is not an advisor-transcript header");
    if (header.schema !== TRANSCRIPT_SCHEMA || header.promptSchema !== PROMPT_SCHEMA) throw new Error(`advisorTranscript.parseTranscript: schema ${header.schema}/${header.promptSchema}, this code reads ${TRANSCRIPT_SCHEMA}/${PROMPT_SCHEMA}`);
    const tr = createTranscript({ model: header.model, every: header.every });
    for (const l of lines.slice(1)) {
        let e; try { e = JSON.parse(l); } catch { throw new Error("advisorTranscript.parseTranscript: an entry is not json"); }
        if (!e || typeof e.key !== "string" || typeof e.prompt !== "string" || typeof e.reply !== "string" || !("decision" in e)) throw new Error("advisorTranscript.parseTranscript: a malformed entry");
        if (keyOf(tr.header.model, e.prompt) !== e.key) throw new Error(`advisorTranscript.parseTranscript: key ${e.key} does not match its prompt`);
        const old = tr.entries.get(e.key); if (old && old.reply !== e.reply) throw new Error(`advisorTranscript.parseTranscript: key ${e.key} twice with different replies`);
        tr.entries.set(e.key, e);
    }
    return tr;
}

// ---- the seat ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/**
 * The seat: (ctx) -> seat(st, obs) -> a decision { surface, station (the CURRENT observation's station object, or null), cap, pump, repair }, or null when the model's reply was invalid. `transcript` is createTranscript's; `mode` is "record" (needs `modelFn`) or "replay"
 * (never calls one). Every `transcript.header.every` ticks it asks (record) or looks up (replay); between asks it holds the last decision. `seat.stats` = { ticks, asks, calls (model calls made: record only), hits (replay or a repeated prompt), invalid }.
 */
export function llmSeat({ transcript, mode, modelFn = null }) {
    if (!transcript || !transcript.header) throw new Error("advisorTranscript.llmSeat: a transcript is required");
    if (!MODES.includes(mode)) throw new Error(`advisorTranscript.llmSeat: mode ${JSON.stringify(mode)} (${MODES.join(" or ")})`);
    if (mode === "record" && typeof modelFn !== "function") throw new Error("advisorTranscript.llmSeat: record mode needs modelFn(prompt) -> reply");
    const every = transcript.header.every, model = transcript.header.model;
    return () => {
        const stats = { ticks: 0, asks: 0, calls: 0, hits: 0, invalid: 0 };
        let n = 0, held = null;   // held: { decision, silent }
        const seat = (st, obs) => {
            if (n % every === 0) {
                const prompt = renderPrompt(st, obs), key = keyOf(model, prompt); stats.asks++;
                let e = transcript.entries.get(key);
                if (e && e.prompt !== prompt) throw new Error(`advisorTranscript: key ${key} collides with a different prompt`);
                if (e) stats.hits++;
                else if (mode === "replay") throw new TranscriptMiss(key);
                else {
                    stats.calls++;
                    const reply = String(modelFn(prompt)), p = parseReply(reply, obs.stations.length);
                    e = { key, prompt, reply, decision: p.ok ? p.decision : null }; transcript.entries.set(key, e);
                }
                if (!e.decision) stats.invalid++;
                held = e.decision;
            }
            n++; stats.ticks++;
            if (!held) return null;
            const q = held.station === null ? null : obs.stations[held.station] || null;
            return { surface: held.surface, station: q, cap: held.cap, pump: held.pump, repair: held.repair };
        };
        Object.defineProperty(seat, "stats", { get: () => stats });
        return seat;
    };
}
