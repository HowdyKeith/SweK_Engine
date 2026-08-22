// FILE: ai-bridge/policyMassBridge.js
//
// v2856 - front door for brain/tools/policy-mass.mjs. That tool was CLI-only (node ... <session.jsonl>) and, by
// Keith's standing rule, therefore unfinished. Its verdict() has always returned {text, cls} where cls is a CSS
// status class (dim/ok/hot/warn) -- it was written for a page from the start. This is that page's server half.
//
// THE MASS-VS-MERIT QUESTION: does the brain put its probability mass on the options that actually work? An
// aggregate hit rate cannot answer it -- a brain at 45% could be learning or could be confidently choosing the
// options that fail, and those look IDENTICAL in a ratio. Ranking mass against merit (Spearman) tells them apart.
//
// TWO HONEST FACTS THIS PAGE IS BUILT AROUND:
//   1. Real trace capture is OFF by default (brain/trace.mjs, BRAIN_TRACE=1) and may never have been flipped on,
//      so a page that could ONLY analyse a real trace would show nothing. The demo path needs no data: it runs
//      known-answer traces (learning / backwards / noise) so the tool can be seen -- and trusted -- before any
//      real session exists.
//   2. This bridge NEVER computes the answer itself. It imports analyseTrace/DEMO_TRACES from the ESM tool and
//      calls them. A bridge that reimplemented the math could disagree with the gate that proves it, and a
//      dashboard that disagrees with the gate is worse than none because it is believed.
//
// CJS like its siblings; the tool is ESM, loaded via await import().

const path = require("path");
const { pathToFileURL } = require("url");

const ENGINE = path.join(__dirname, "..");
const esm = (rel) => import(pathToFileURL(path.join(ENGINE, rel)).href);
const TOOL = "brain/tools/policy-mass.mjs";

const PREFIX = "/policymass";
function owns(url) { return typeof url === "string" && (url === PREFIX || url.startsWith(PREFIX + "/") || url.startsWith(PREFIX + "?")); }

// A pasted session.jsonl can be large (a real trace is ~20 MB capped), but a PASTE is a human action -- 4 MB is
// generous for that and still bounds a hostile body. A real multi-hundred-MB trace belongs on disk, not in a POST.
const MAX_BODY = 4 * 1024 * 1024;

function readRawBody(req, limit = MAX_BODY) {
    return new Promise((resolve) => {
        let s = "", over = false;
        req.on("data", (c) => { s += c; if (s.length > limit) { over = true; req.destroy(); } });
        req.on("end", () => resolve({ text: s, over }));
        req.on("error", () => resolve({ text: s, over }));
    });
}

async function runDemo(which) {
    const { analyseTrace, syntheticTrace, DEMO_TRACES } = await esm(TOOL);
    const keys = which && which !== "all" ? [which] : Object.keys(DEMO_TRACES);
    const out = [];
    for (const k of keys) {
        const spec = DEMO_TRACES[k];
        if (!spec) return { error: "unknown-demo", which: k, available: Object.keys(DEMO_TRACES) };
        out.push({ key: k, label: spec.label, ...analyseTrace(syntheticTrace(spec)) });
    }
    return { demos: out };
}

async function handle(req, res, { sendJson }) {
    const url = new URL(req.url, "http://x");
    const route = url.pathname.slice(PREFIX.length) || "/";

    if (route === "/status" || route === "/") {
        const { DEMO_TRACES } = await esm(TOOL);
        // Report the capture switch honestly. Under the Node server we can only see the env hint; the engine that
        // actually writes traces runs under Deno and gates on the same BRAIN_TRACE=1. Either way: off unless set,
        // and the demo path needs none of this.
        const captureHint = process.env.BRAIN_TRACE === "1";
        return sendJson({
            ok: true,
            tool: TOOL,
            question: "does the brain put its probability mass on the options that actually work?",
            capture: {
                envHint: captureHint,
                howToCapture: "The GPU Brain writes a trace only when BRAIN_TRACE=1 (brain/trace.mjs). It is off by default on purpose -- a brain under load writes thousands of lines a minute. Turn it on, play, then upload the session.jsonl below.",
                note: "No real trace is needed to see the tool: the demos run on known-answer traces.",
            },
            demos: Object.entries(DEMO_TRACES).map(([k, v]) => ({ key: k, label: v.label })),
            reads: "Only mode=='sampled' records carry a softmax p, so this measures the SAMPLED policy only -- usually the minority of decisions. That is a real answer about a real subset.",
        });
    }

    if (route === "/demo") {
        const which = (url.searchParams.get("which") || "all").trim();
        const r = await runDemo(which);
        if (r.error) return sendJson({ ok: false, ...r }, 404);
        return sendJson({ ok: true, ...r });
    }

    if (route === "/analyze" || route === "/analyse") {
        if (req.method !== "POST") return sendJson({ ok: false, error: "method", message: "POST a session.jsonl body to /policymass/analyze" }, 405);
        const { text, over } = await readRawBody(req);
        if (over) return sendJson({ ok: false, error: "too-large", message: "Trace exceeds " + (MAX_BODY / (1024 * 1024)) + " MB for a paste. Run it from the console: node brain/tools/policy-mass.mjs <session.jsonl>" }, 413);
        // The body may be raw jsonl, or {text:"..."} from a JSON fetch. Accept either without guessing wrong.
        let jsonl = text;
        const trimmed = text.trim();
        if (trimmed.startsWith("{") && !trimmed.includes("\n")) {
            try { const o = JSON.parse(trimmed); if (typeof o.text === "string") jsonl = o.text; } catch { /* it was a single jsonl line; use as-is */ }
        }
        if (!jsonl.trim()) return sendJson({ ok: false, error: "empty", message: "No trace text. Paste a session.jsonl (one JSON record per line) or turn on BRAIN_TRACE=1 to capture one." }, 400);

        const { analyseTrace } = await esm(TOOL);
        let a;
        try { a = analyseTrace(jsonl); }
        catch (e) { return sendJson({ ok: false, error: "parse", message: e && e.message ? e.message : String(e) }, 400); }

        // No sampled-with-p records is an ANSWER, not a failure -- the tool's own words. Say so plainly rather than
        // returning an empty table the page renders as "measured: nothing".
        if (!a.sampledN) {
            return sendJson({
                ok: true, empty: true, ...a,
                message: "Parsed " + a.recs + " decisions but none were sampled-with-p. Nothing to rank -- and that is an answer, not a failure. (p is only written on the sampled policy path; an argmax/epsilon-only session has no mass to weigh.)",
            });
        }
        return sendJson({ ok: true, ...a });
    }

    return sendJson({ ok: false, error: "unknown-route", route }, 404);
}

module.exports = { owns, handle, PREFIX, MAX_BODY };
