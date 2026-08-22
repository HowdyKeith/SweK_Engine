// WebGLEngine/tools/roundhouse/callLog.mjs -- v3039
//
// CAPTURE BEFORE ANALYSIS. Frugon prices LLM call logs, and this tree has none: the roundhouse makes real
// messages.create calls in escalateRouteLive / runLive / run-device / roundhouse.mjs, and NOTHING records the
// model, the tokens, or the outcome. Grepping for input_tokens across the whole tree returns zero hits. So
// "implement frugon" cannot begin with frugon -- there is no input. This is the input.
//
// WHY NOT frugon capture. Frugon ships a local proxy shim for exactly this, and it is the right tool when you
// do not own the call site. We DO own it -- one seam, in our own process. A proxy in front of our own code adds
// a port, a process and a failure mode to obtain what the call already has in hand.
//
// WE WRITE FRUGON'S FORMAT DIRECTLY, NOT OURS. A SweK-shaped log plus a converter is two representations of one
// fact, and the converter is where they drift. The line that lands on disk is the line frugon reads.
//
// WE NEVER PRICE ANYTHING. Frugon owns pricing -- it re-syncs from the LiteLLM registry weekly, and a second
// price table here would be stale the first time a model changed. Capture is the whole job. The gate asserts
// there is no cost arithmetic in this file.
"use strict";
import fs from "node:fs";
import path from "node:path";

// OFF BY DEFAULT, like BRAIN_TRACE. A log of model calls is a log of PROMPTS, and prompts carry whatever the
// caller put in them. Opting in is a decision, not a default.
export const ENABLED = () => process.env.SWEK_CALL_LOG === "1";
// Prompt TEXT is a second, separate opt-in. Frugon can price from token counts alone, so the useful log is also
// the safe one -- and the unsafe version should cost an extra deliberate act, not ride along free.
export const WITH_PROMPTS = () => process.env.SWEK_CALL_LOG_PROMPTS === "1";

/**
 * Build one JSONL record. PURE -- the gate gets to check the shape without touching a disk or an API.
 *
 * THE NULL RULE, AND IT IS THE POINT OF THE WHOLE FILE. When a response carries no usage block, tokens are
 * recorded as null, NEVER as 0. A zero prices as FREE, so a run whose usage was missing would come back as a
 * call that cost nothing -- understating the bill and, worse, looking like a saving. Null is unpriceable and
 * frugon will say so; zero is a confident wrong answer. This is the same failure as an empty mask rendering as
 * "the model has no cross-section".
 */
export function record(call) {
    const u = call && call.usage;
    const has = !!u && (typeof u.input_tokens === "number" || typeof u.output_tokens === "number");
    const rec = {
        ts: new Date(call.at || Date.now()).toISOString(),
        model: call.model || null,
        usage: {
            input_tokens: has && typeof u.input_tokens === "number" ? u.input_tokens : null,
            output_tokens: has && typeof u.output_tokens === "number" ? u.output_tokens : null,
        },
        latency_ms: typeof call.ms === "number" ? Math.round(call.ms) : null,
        // SweK's own columns, which frugon ignores and we do not. This is what makes the log worth more here
        // than a bill: escalateRoute already knows whether a cheap model's answer PASSED A GATE. Frugon infers
        // sufficiency from difficulty heuristics; we can record whether it was actually right.
        swek: {
            role: call.role || null,
            verified: typeof call.verified === "boolean" ? call.verified : null,
            escalated: typeof call.escalated === "boolean" ? call.escalated : null,
            gate: call.gate || null,
        },
    };
    if (!rec.model) throw new Error("callLog.record: a call with no model cannot be priced, and logging it as null model would put an unattributable row in the analysis");
    if (WITH_PROMPTS() && call.messages) rec.messages = call.messages;
    return rec;
}

// v3039 -- THE GATE FOUND A REAL BUG HERE ON ITS FIRST RUN. This memoised a SINGLE _path, so the first caller
// won and every later call silently wrote to that first root no matter what root it passed. A test pointing at
// a temp dir would have appended to the live log, and a second engine root would have been invisible. Cache
// PER ROOT, or do not cache.
const _paths = new Map();
export function logPath(root) {
    const key = root || process.cwd();
    if (_paths.has(key)) return _paths.get(key);
    const dir = path.join(key, "brain", "logs");
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    const p = path.join(dir, "calls.jsonl");
    _paths.set(key, p);
    return p;
}

/** Append one call. Never throws into the caller's path -- a logging failure must not kill a model run. */
export function append(call, root) {
    if (!ENABLED()) return false;
    try { fs.appendFileSync(logPath(root), JSON.stringify(record(call)) + "\n", "utf8"); return true; }
    catch (e) { console.warn("[callLog]", e && e.message); return false; }
}

/** Read back, skipping blank lines. Used by the gate and by whatever front door drives frugon. */
export function read(root) {
    const p = logPath(root);
    let text = "";
    try { text = fs.readFileSync(p, "utf8"); } catch { return []; }
    return text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}

/** What frugon would refuse to price, counted honestly rather than quietly dropped. */
export function unpriceable(rows) {
    return rows.filter((r) => !r.model || r.usage.input_tokens === null || r.usage.output_tokens === null).length;
}
