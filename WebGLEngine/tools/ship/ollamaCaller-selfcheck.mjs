// WebGLEngine/tools/ship/ollamaCaller-selfcheck.mjs -- v2808
//
// Run: node tools/ship/ollamaCaller-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/roundhouse/ollamaCaller.mjs -- the LOCAL model tier. fetchImpl is injectable, so the whole adapter
// is proven here with NO Ollama running and no network: request shape, JSON extraction, mixed-chain dispatch, and
// clean degradation when the local runtime is absent.
//
// THE POINT OF THE TIER: a local model answers free; if it is wrong the SweK gate catches it and the route
// escalates to a paid tier. The gate below proves BOTH halves -- a right local answer stops the route, a wrong
// one escalates past it -- because a local tier that could not be overruled would just be a cheaper way to be
// confidently wrong.

import { ollamaCaller, listLocalModels, localFirstChain, mixedCaller, DEFAULT_OLLAMA } from "../../tools/roundhouse/ollamaCaller.mjs";
import { recordRoute, replayRoute } from "../../tools/roundhouse/agentTrace.mjs";
import { faceCountGate, makeFaceCountTask } from "../../tools/roundhouse/swekGates.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const TASK = makeFaceCountTask(3, 4, 5);
const TRUTH = faceCountGate({}, TASK).truth;
const jsonRes = (obj) => async () => ({ ok: true, json: async () => obj });

// 1. REQUEST SHAPE -- what actually goes to Ollama
{
    let seen = null;
    const fetchImpl = async (url, init) => { seen = { url, body: JSON.parse(init.body), method: init.method }; return { ok: true, json: async () => ({ response: '{"faceCount":94}' }) }; };
    const call = ollamaCaller("http://localhost:11434/", { fetchImpl });
    await call("qwen2.5:7b", TASK);
    ok("posts to /api/generate", seen.method === "POST" && seen.url === "http://localhost:11434/api/generate", seen.url);
    ok("sends the chosen model name", seen.body.model === "qwen2.5:7b");
    ok("streaming is OFF (we need one whole answer)", seen.body.stream === false);
    ok("format:json constrains decoding to valid JSON", seen.body.format === "json");
    ok("temperature 0 -- this is arithmetic, not prose", seen.body.options.temperature === 0);
    ok("trailing slash on the base URL does not double up", !/\/\/api/.test(seen.url.replace("http://", "")));
}

// 2. ANSWER EXTRACTION, including the ways small models wrap output
{
    const call = (resp) => ollamaCaller("http://x", { fetchImpl: jsonRes({ response: resp }) });
    ok("parses a bare JSON answer", (await call('{"faceCount":94}')("m", TASK)).faceCount === 94);
    ok("parses JSON with surrounding prose", (await call('Sure! {"faceCount":94} hope that helps')("m", TASK)).faceCount === 94);
    ok("parses JSON inside a code fence", (await call('```json\n{"faceCount":94}\n```')("m", TASK)).faceCount === 94);
    const nonJson = await call("ninety four")("m", TASK);
    ok("non-JSON degrades to {text} instead of throwing", nonJson && typeof nonJson.text === "string");
}

// 3. TRANSPORT FAILURES surface, they do not silently look like a wrong answer
{
    const bad = ollamaCaller("http://x", { fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }) });
    let threw = false; try { await bad("m", TASK); } catch { threw = true; }
    ok("an HTTP error throws rather than returning a fake answer", threw);
}

// 4. ABSENT OLLAMA is an ordinary state
{
    ok("listLocalModels returns [] when the runtime is unreachable", (await listLocalModels("http://127.0.0.1:59999", { timeoutMs: 300 })).length === 0);
    ok("listLocalModels maps names/size/family when present", (await listLocalModels("http://x", { fetchImpl: jsonRes({ models: [{ name: "qwen2.5:7b", size: 4700000000, details: { family: "qwen2" } }] }) }))[0].name === "qwen2.5:7b");
    ok("DEFAULT_OLLAMA is the conventional local port", DEFAULT_OLLAMA === "http://localhost:11434");
}

// 5. CHAIN CONSTRUCTION -- local goes at the cheap end, and cost expresses LATENCY not money
{
    const api = [{ name: "haiku", cost: 1 }, { name: "sonnet", cost: 5 }];
    ok("no local model -> chain unchanged", JSON.stringify(localFirstChain(null, api)) === JSON.stringify(api));
    const c = localFirstChain("qwen2.5:7b", api, 0.2);
    ok("local is first and marked local", c[0].name === "qwen2.5:7b" && c[0].local === true && c[0].cost === 0.2);
    ok("local cost is NONZERO (it spends seconds even when it spends no money)", c[0].cost > 0);
    ok("the API tiers survive in order", c[1].name === "haiku" && c[2].name === "sonnet");
}

// 6. MIXED DISPATCH -- one caller, two backends, routed by chain membership
{
    const chain = [{ name: "local1", cost: 0.2, local: true }, { name: "api1", cost: 5 }];
    const seen = [];
    const call = mixedCaller({ chain, localCall: async (m) => { seen.push("local:" + m); return { faceCount: 1 }; }, apiCall: async (m) => { seen.push("api:" + m); return { faceCount: 2 }; } });
    await call("local1", TASK); await call("api1", TASK);
    ok("local entries go to the local caller, others to the API caller", seen.join(",") === "local:local1,api:api1", seen.join(","));
    let threw = false;
    try { await mixedCaller({ chain, localCall: null, apiCall: async () => ({}) })("local1", TASK); } catch { threw = true; }
    ok("a chain with a local tier and no local caller refuses loudly", threw);
    let threw2 = false;
    try { await mixedCaller({ chain, localCall: async () => ({}), apiCall: null })("api1", TASK); } catch { threw2 = true; }
    ok("a chain needing an API tier with no key refuses loudly", threw2);
}

// 7. THE WHOLE POINT: a local tier is verified by the gate like anything else
{
    // right local answer -> the route stops there, no key, no client
    const right = ollamaCaller("http://x", { fetchImpl: jsonRes({ response: JSON.stringify({ faceCount: TRUTH }) }) });
    const chainL = [{ name: "local1", cost: 0.2, local: true }, { name: "api1", cost: 5 }];
    const a = await recordRoute({ task: TASK, chain: chainL, runGate: faceCountGate, callModel: mixedCaller({ chain: chainL, localCall: right, apiCall: async () => ({ faceCount: TRUTH }) }) });
    ok("a CORRECT local answer wins the route with no key and no client", a.result.chosen === "local1" && a.result.verified === true);
    ok("that route still replays consistently", (await replayRoute(a.trace, { runGate: faceCountGate })).consistent === true);

    // wrong local answer -> the gate overrules it and the route escalates
    const wrong = ollamaCaller("http://x", { fetchImpl: jsonRes({ response: JSON.stringify({ faceCount: TRUTH + 7 }) }) });
    const b = await recordRoute({ task: TASK, chain: chainL, runGate: faceCountGate, callModel: mixedCaller({ chain: chainL, localCall: wrong, apiCall: async () => ({ faceCount: TRUTH }) }) });
    ok("a WRONG local answer is overruled and the route escalates", b.result.chosen === "api1" && b.result.verified === true);
    ok("the trace records the local FAILURE, not a quiet skip", b.trace.steps[0].model === "local1" && b.trace.steps[0].verified === false);
}

// 8. recordRoute's seam is real (it was invented before it existed -- this pins it)
{
    let threw = false;
    try { await recordRoute({ task: TASK, chain: [{ name: "x", cost: 1 }], runGate: faceCountGate }); } catch { threw = true; }
    ok("recordRoute refuses with neither a client nor an injected callModel", threw);
}

// 9. browser/worker-safe
{
    const src = (await import("node:fs")).readFileSync(new URL("../../tools/roundhouse/ollamaCaller.mjs", import.meta.url), "utf8");
    ok("ollamaCaller imports nothing and uses no DOM", !/^\s*import\s/m.test(src) && !/\bwindow\.|\bdocument\./.test(src));
}

console.log("ollamaCaller-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
