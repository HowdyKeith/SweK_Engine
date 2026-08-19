// tools/roundhouse/ollamaRoleCaller-selfcheck.mjs
//
// Run: node tools/roundhouse/ollamaRoleCaller-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The Ollama seam checked WITHOUT an Ollama server: fetchImpl is injectable, so a fake server exercises every
// robustness path a small local model actually hits -- fenced JSON, garbage-then-valid retries, hard failures --
// and the request bodies are inspected to prove the context-budget aids (schema attached, history compacted to
// numbers, num_ctx set) really go over the wire. Then the whole thing drives the REAL black-hole device end to end
// with a fake model, proving the caller's output shape is what roundhouseDevice needs.

import { ollamaCaller, salvageJson, PROPOSER_SCHEMA } from "./ollamaRoleCaller.mjs";
import { roundhouseDevice } from "./deviceBind.mjs";
import { blackHoleDevice } from "./blackHoleBind.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const fakeServer = (responses) => {
    const sent = [];
    let i = 0;
    const impl = async (url, opts) => {
        sent.push({ url, body: JSON.parse(opts.body) });
        const r = responses[Math.min(i++, responses.length - 1)];
        if (r instanceof Error) throw r;
        return { ok: true, status: 200, json: async () => ({ message: { content: r } }) };
    };
    return { impl, sent };
};

// ---- 1. salvage parse: the three ways a small model mangles JSON ------------------------------------------------
{
    ok("clean JSON parses", salvageJson('{"a":1}').a === 1);
    ok("!! fenced JSON is salvaged", salvageJson('```json\n{"a":2}\n```').a === 2,
        "the classic small-model tic -- fences around perfectly good JSON");
    ok("!! chatty preamble around JSON is salvaged", salvageJson('Sure! Here you go: {"a":3} hope that helps').a === 3);
    ok("hopeless text returns null (not a throw)", salvageJson("no json here at all") === null);
}

// ---- 2. the wire: schema, compact history, num_ctx actually sent ------------------------------------------------
{
    const history = Array.from({ length: 8 }, (_, round) => ({
        round,
        hyp: { mode: "onset", claim: { observable: "captureOnsetR", target: 6, tol: 0.1 } },
        verdict: { done: false, measured: 6.4, delta: 0.4 },
        critique: { reading: "a long prose critique that should never reach a 2k-context model ".repeat(20) },
    }));
    const { impl, sent } = fakeServer(['{"mode":"onset","claim":{"observable":"captureOnsetR","target":6,"tol":0.1}}']);
    const caller = ollamaCaller({ fetchImpl: impl, numCtx: 4096 });
    await caller("proposer", { device: "paczynski-wiita-black-hole", observables: ["captureOnsetR"], history });
    const body = sent[0].body;
    const userMsg = JSON.parse(body.messages[1].content);
    ok("!! the structured-output schema rides the request", body.format === PROPOSER_SCHEMA || (body.format && body.format.required && body.format.required.includes("claim")),
        "constrained decoding is aid #1 -- the model CANNOT emit invalid JSON");
    ok("!! history is compacted to the last 3 rounds of numbers", Array.isArray(userMsg.history) && userMsg.history.length === 3 && !JSON.stringify(userMsg.history).includes("prose critique"),
        "8 rounds with bulky critiques went in; 3 numeric rounds went over the wire -- aid #3 for small num_ctx");
    ok("!! num_ctx is explicit", body.options && body.options.num_ctx === 4096,
        "Ollama's 2048 default truncates from the TOP -- the system prompt dies first; never rely on it");
    ok("proposer temperature explores, per-role", body.options.temperature > 0);
}

// ---- 3. failure ladder: retry, salvage-retry, and the keep-the-loop-alive fallback ------------------------------
{
    const { impl } = fakeServer([new Error("ECONNRESET"), '{"mode":"orbit","r0":8,"claim":{"observable":"captured","equals":false}}']);
    const h = await ollamaCaller({ fetchImpl: impl })("proposer", { history: [] });
    ok("!! a transient network failure is retried once and recovers", h.mode === "orbit" && h.r0 === 8);

    const { impl: impl2 } = fakeServer(["complete garbage, no json", '{"mode":"orbit","claim":{"observable":"rMin","min":2}}']);
    const h2 = await ollamaCaller({ fetchImpl: impl2 })("proposer", { history: [] });
    ok("!! an unparseable sample is re-sampled once and recovers", h2.claim && h2.claim.observable === "rMin");

    const { impl: impl3 } = fakeServer(["garbage", "more garbage", "still garbage"]);
    const h3 = await ollamaCaller({ fetchImpl: impl3 })("proposer", { history: [] });
    ok("!! total model failure degrades to a conservative buildable proposal, not a crash",
        h3 && h3.claim && h3.claim.observable === "captured",
        "the loop keeps turning; the device clamp + numeric verdict handle it from there");
}

// ---- 4. END TO END: fake local model drives the REAL black-hole device through the loop -------------------------
{
    // round 1 proposes a wrong target (echoing what a cold local model does); round 2 uses the measured value.
    const { impl } = fakeServer([
        '{"mode":"onset","claim":{"observable":"captureOnsetR","target":5,"tol":0.1}}',   // proposer r1: wrong
        '{"reading":"measured ~6.04, claim missed; aim at 6"}',                            // evaluator r1
        '{"mode":"onset","claim":{"observable":"captureOnsetR","target":6,"tol":0.1}}',   // proposer r2: refined
        '{"reading":"crystallized on the measurement"}',                                   // evaluator r2
    ]);
    const out = await roundhouseDevice({
        callModel: ollamaCaller({ fetchImpl: impl }),
        device: blackHoleDevice,
        question: "Where does capture set in?",
        maxRounds: 4,
    });
    ok("!! the ollama seam drives the real device end to end -- wrong claim refused, refined claim crystallizes",
        out.crystallized === true && out.rounds === 2 && Math.abs(out.verdict.measured - 6.036) < 0.05,
        "round 1 claimed 5 (sim said no), round 2 claimed 6 (sim said yes at " + out.verdict.measured.toFixed(3) + ")");
}

console.log();
if (fails) { console.log("ollamaRoleCaller-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("ollamaRoleCaller-selfcheck: all checks pass");
