// FILE: ai-bridge/skillbookBridge.js
//
// v3398 - THE FRONT DOOR FOR THE SKILLBOOK. Keith: "am i able to test a run through from a page and button with
// process statistics?" -- the front-door law, asked about the one module that had a caller (v3397) and still no
// page. A MODULE WITH NO PAGE IS A MODULE ONLY A GATE HAS EVER SEEN.
//
// WHAT THE BUTTON ACTUALLY RUNS: a REAL two-arm trial through tools/roundhouse/skillTrial.mjs, against a REAL
// device from the registry, graded by the REAL deterministic critic. Nothing here re-implements the trial or the
// verdict -- the bridge builds an `attempt` function and hands it over, and the STATE comes back from
// deriveState. If this file computed a verdict of its own there would be two definitions of PROVEN.
//
// *** THE PROPOSER IS A DETERMINISTIC MOCK AND THE PAGE SAYS SO IN THE RESULT ITSELF, NOT IN A FOOTNOTE. ***
// There is no model in the sandbox and there may be none on the rig either, so the trial is driven by a seeded
// pseudo-proposer whose malformed rate is a KNOWN INPUT. That makes the numbers a test OF THE HARNESS -- does a
// real effect come back PROVEN, does a null come back RETIRED, does a thin sample come back UNDERPOWERED -- and
// NOT a measurement of whether a hint helps a real model. Reporting it as the latter would be the overclaim
// v3397 refused; `proposer: "mock"` travels in the JSON so no reader can lose that distinction.
//
// SECURITY: GET routes only, no writes, no spawn, no file paths from the request. The device name must be one the
// registry already knows and the trial size is clamped, because an unbounded n is a way to hang the server from
// a URL bar.
//
// v3415 -- *** THE PROPOSER GAINS A REAL PATH BESIDE THE MOCK, AND THE MOCK IS KEPT. *** `caller=ollama` runs the
// same trial against the LOCAL MODEL, through tools/roundhouse/skillProposer.mjs -- which composes the shipping
// ollamaRoleCaller, the shipping deviceCritic and the shipping skillTrial rather than writing a second anything.
// `proposer` now travels as the CALLER KIND with the model and host beside it, so a reader can never mistake one
// run for the other. The mock stays because it is the only proposer whose effect size is a known input, which is
// what makes it a harness check; the model is the only one that can fill the book.
//
// WHERE THE MODEL LIVES IS NOT DECIDED HERE. The host comes from the server's own `_ollamaBase` (the llmHost
// setting) exactly as ragBridge and gpuBrainBridge take it, so pointing the fleet at the GPU box moves this too.
// A second notion of where the model lives is the defect this tree names most often.
//
// AND THE CLOCK IS PART OF THE CLAMP NOW. A mock trial is microseconds per call; a local model is seconds, and
// 2n of them from a URL bar is a hang. n is clamped harder for the model path and a wall-clock budget refuses a
// partially completed trial rather than reporting it.

const path = require("path");
const PREFIX = "/skill";
const ENGINE = path.join(__dirname, "..");
function owns(url) { return typeof url === "string" && (url === PREFIX || url.startsWith(PREFIX + "/") || url.startsWith(PREFIX + "?")); }

const N_MIN = 20, N_MAX = 400;          // 20 is skillTrial's own floor; the cap keeps a URL from hanging the loop.
const N_MAX_MODEL = 120;                // a model trial is 2n network calls at seconds each, not microseconds.
const BUDGET_MS = 10 * 60 * 1000;       // wall clock for the whole model trial; a truncated trial is refused, not reported.

/** Deterministic generator, so a trial re-run with the same seed returns the same statistics. */
function mulberry(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

/**
 * The mock proposer, as an `attempt` for skillTrial. `baseRate` is how often it names an observable the device
 * does not have; `hintEffect` is how much a hint reduces that. BOTH ARE INPUTS, which is the point: the trial's
 * job is to recover them, and a harness that could not recover a known effect could not be trusted with an
 * unknown one.
 */
function makeAttempt({ device, seed, baseRate, hintEffect }) {
    const observables = (device && device.observables) || [];
    let n = 0;
    return async (question, hints) => {
        const r = mulberry(seed + (n++) * 7919);
        const rate = (hints && hints.length) ? Math.max(0, baseRate - hintEffect) : baseRate;
        // A malformed claim names something off the menu; a well-formed one names a real observable.
        const obs = r() < rate ? "notAnObservable" : (observables[0] || "alpha");
        const { critiqueClaim } = await import("file://" + path.join(ENGINE, "tools", "roundhouse", "deviceCritic.mjs"));
        return critiqueClaim({ observable: obs, max: 1 }, observables);
    };
}

/**
 * Where the local model lives, and what is pulled there. Three states are kept apart by ollamaReadiness --
 * NOT-RUNNING, RUNNING-WITH-NO-MODELS and PINNED-MODEL-MISSING -- because the third one only bites at the first
 * call, mid-run, after a device has already been built.
 */
async function modelConfig(ctx) {
    let host = process.env.OLLAMA_HOST || "http://localhost:11434";
    try { if (typeof ctx.ollamaBase === "function") host = ctx.ollamaBase() || host; } catch {}
    let model = process.env.OLLAMA_MODEL || null;
    if (!model) { try { if (typeof ctx.ollamaModelName === "function") model = await ctx.ollamaModelName(); } catch {} }
    return { host, model: model || null };
}

async function modelStatus(ctx) {
    const { host, model } = await modelConfig(ctx);
    const R = await import("file://" + path.join(ENGINE, "tools", "roundhouse", "ollamaReadiness.mjs"));
    const r = await R.readiness({ base: host, pinned: model });
    return { ok: true, host, model, ready: r.verdict === R.READY.OK, ...r };
}

async function runTrial(q, ctx = {}) {
    const D = await import("file://" + path.join(ENGINE, "tools", "roundhouse", "devices.mjs"));
    const T = await import("file://" + path.join(ENGINE, "tools", "roundhouse", "skillTrial.mjs"));
    const S = await import("file://" + path.join(ENGINE, "tools", "roundhouse", "skillbook.mjs"));

    const name = String(q.device || D.DEVICE_NAMES[0]);
    if (!D.DEVICE_NAMES.includes(name)) {
        return { ok: false, error: "unknown-device", message: `"${name}" is not a registered device.`, known: D.DEVICE_NAMES.length };
    }
    const P = await import("file://" + path.join(ENGINE, "tools", "roundhouse", "skillProposer.mjs"));

    const kind = String(q.caller || "mock");
    if (!P.PROPOSER_KINDS.includes(kind)) {
        return { ok: false, error: "unknown-caller", message: `"${kind}" is not a proposer this bridge runs.`, known: P.PROPOSER_KINDS };
    }
    const isModel = kind !== "mock";
    const cap = isModel ? N_MAX_MODEL : N_MAX;
    const n = Math.max(N_MIN, Math.min(cap, parseInt(q.n, 10) || 40));
    const seed = parseInt(q.seed, 10) || 1;
    const baseRate = Math.max(0, Math.min(1, q.base === undefined ? 0.65 : Number(q.base)));
    const hintEffect = Math.max(0, Math.min(1, q.effect === undefined ? 0.60 : Number(q.effect)));

    const device = await D.getDevice(name);
    const strategy = S.makeStrategy({
        id: "trial-" + name,
        trigger: "observable-unknown",
        hint: "Name an observable from the menu the critic gave you.",
    });
    const questions = Array.from({ length: n }, (_, i) => ({ device: name, i }));

    // The model path is REFUSED BEFORE THE TRIAL rather than during it. Discovering a missing model on call one
    // of eighty is the moment ollamaReadiness exists to move earlier.
    let ledger = null, host = null, model = null, attempt;
    if (isModel) {
        const st = await modelStatus(ctx);
        host = st.host; model = st.model;
        if (!st.ready) {
            return { ok: false, error: "model-not-ready", verdict: st.verdict, message: st.why, fix: st.fix,
                     host, model, models: st.models || null };
        }
        const { ollamaCaller } = await import("file://" + path.join(ENGINE, "tools", "roundhouse", "ollamaRoleCaller.mjs"));
        const made = P.makeModelAttempt({
            device, deviceName: name,
            caller: ollamaCaller({ host, model }),
            deadlineMs: BUDGET_MS,
        });
        attempt = made.attempt; ledger = made.log;
    } else {
        attempt = makeAttempt({ device, seed, baseRate, hintEffect });
    }

    const t0 = Date.now();
    let res;
    try {
        res = await T.trial({ strategy, questions, attempt });
    } catch (err) {
        // A named refusal from the proposer -- unreachable, or out of wall clock. NOT a rate.
        return { ok: false, error: err && err.refusal ? err.refusal : "proposer-failed",
                 message: (err && err.message) || String(err), proposer: kind, host, model,
                 calls: err && err.calls, ms: Date.now() - t0 };
    }
    if (!res.ok) return { ok: false, error: "refused", message: res.why };

    // *** THE SAMPLING CHECK, AND IT REFUSES RATHER THAN CAVEATS. *** z assumes n independent samples per arm. A
    // model pinned to temperature 0 answers identically every time, so the arm carries ONE sample and a large z
    // off one observation still prints the word PROVEN. That is the v3396 defect in a new dress, and a verdict
    // with a footnote beside it is a green tick with nothing behind it.
    let sampling = null;
    if (ledger) {
        sampling = P.sampling(ledger);
        const bad = P.degenerateArms(sampling);
        if (bad.length) {
            return { ok: false, error: P.REFUSALS.DEGENERATE, arms: bad, sampling,
                     message: P.DEGENERATE_WHY, proposer: kind, host, model, device: name, n,
                     observed: { before: res.evidence.before, after: res.evidence.after, wouldHaveSaid: res.state },
                     ms: Date.now() - t0 };
        }
    }

    // THE STATISTICS, ALL DERIVED FROM THE MODULE THAT OWNS THEM -- this file adds no arithmetic of its own.
    return {
        ok: true,
        proposer: kind,                         // the CALLER KIND, never a word like "model" that hides which one.
        host, model,                            // null for the mock; a reader can always tell the runs apart.
        device: name, seed, n,
        // What the MOCK was told, beside what the trial recovered. The model path has no such input -- nobody
        // tells a model its malformed rate -- so the field is absent rather than filled with a lie.
        input: isModel ? null : { baseRate, hintEffect },
        sampling,                               // distinct claims per arm: the model path's n, audited.
        before: res.evidence.before, after: res.evidence.after, drop: res.drop,
        z: S.proofStrength(res.evidence),
        zMin: S.Z_MIN, bar: res.bar,
        requiredN: S.requiredN(res.evidence),
        state: res.state, why: res.why,
        arms: res.evidence.arms,
        ms: Date.now() - t0,
    };
}

async function handle(req, res, ctx) {
    const { sendJson } = ctx;
    const u = new URL(req.url, "http://localhost");
    const q = Object.fromEntries(u.searchParams.entries());
    const route = u.pathname;

    if (route === PREFIX + "/trial") return sendJson(await runTrial(q, ctx));

    // What the local model situation IS, before anyone presses run. The page can then offer the model path or
    // say exactly why it cannot -- rather than offering a button whose failure arrives eighty calls later.
    if (route === PREFIX + "/model") return sendJson(await modelStatus(ctx));

    if (route === PREFIX + "/book") {
        const S = await import("file://" + path.join(ENGINE, "tools", "roundhouse", "skillbook.mjs"));
        const book = S.load();
        // MISSING and EMPTY are reported as different facts. A book nobody has written and a book whose every
        // strategy was retired are not the same state, and one number cannot tell them apart.
        return sendJson({ ok: true, missing: !!book.missing, strategies: book.strategies, summary: S.summary(book) });
    }

    if (route === PREFIX || route === PREFIX + "/") {
        return sendJson({ ok: true, routes: [PREFIX + "/trial", PREFIX + "/book", PREFIX + "/model"],
                                nMin: N_MIN, nMax: N_MAX, nMaxModel: N_MAX_MODEL, budgetMs: BUDGET_MS });
    }
    return sendJson({ ok: false, error: "no-such-route", message: route + " is not a route this bridge serves." }, 404);
}

module.exports = { owns, handle, PREFIX, N_MIN, N_MAX, N_MAX_MODEL, BUDGET_MS, mulberry };
