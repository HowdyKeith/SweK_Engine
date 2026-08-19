// tools/roundhouse/runLive.mjs
//
// The rig entrypoint for the roundhouse agent stack (v2798). Everything underneath is already gated and
// mock-driven; this is the one file that reaches for a real Anthropic client so the API key is the ONLY thing
// that has to be supplied.
//
//   node tools/roundhouse/runLive.mjs --dry          # no key, no network: mock client, proves the wiring
//   node tools/roundhouse/runLive.mjs                # one routed + traced + replayed task
//   node tools/roundhouse/runLive.mjs --bench 12     # a batch, for REAL cheap-vs-strong savings
//
// The SDK is imported LAZILY inside makeLiveClient, so this module loads (and gates) on a machine where
// @anthropic-ai/sdk is not installed -- the dry run needs neither the package nor a key.
//
// Billing note kept next to the code that spends money: Claude API usage is billed separately from a claude.ai
// Pro/Max subscription; a key comes from the Console, funded by prepaid credits.

import { routeWithSwekGate, DEFAULT_CHAIN } from "./escalateRouteLive.mjs";
import { faceCountGate, makeFaceCountTask } from "./swekGates.mjs";
import { recordRoute, replayRoute, traceStats, serializeTrace } from "./agentTrace.mjs";
import { runBatch, benchReport } from "./routeBench.mjs";
import { ollamaCaller, listLocalModels, localFirstChain, mixedCaller, DEFAULT_OLLAMA } from "./ollamaCaller.mjs";

// Real client. Lazy import so this file is usable (and gateable) without the dependency installed.
export async function makeLiveClient() {
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY is not set. Create a key in the Anthropic Console and export it, or run with --dry.");
    }
    let Anthropic;
    try {
        ({ default: Anthropic } = await import("@anthropic-ai/sdk"));
    } catch {
        throw new Error("@anthropic-ai/sdk is not installed. Run: npm i @anthropic-ai/sdk   (or use --dry)");
    }
    return new Anthropic();   // reads ANTHROPIC_API_KEY from the environment
}

// Offline stand-in: answers correctly with probability `accuracy` per model, so --dry exercises the real routing,
// tracing and replay paths end to end. The SweK gate -- not this mock -- still decides right from wrong.
export function makeDryClient({ accuracy = { "claude-haiku-4-5-20251001": 0.4 }, defaultAccuracy = 1 } = {}) {
    const calls = [];
    const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
    return {
        calls,
        messages: {
            create: async ({ model, messages }) => {
                calls.push(model);
                const content = messages[0].content;
                const task = JSON.parse(content);
                const truth = faceCountGate({}, task).truth;
                const acc = accuracy[model] ?? defaultAccuracy;
                const correct = hash(model + content) < acc;
                return { content: [{ type: "text", text: `{"faceCount": ${correct ? truth : truth + 3}}` }] };
            },
        },
    };
}

// Build a client-like object whose messages.create dispatches by model name across a mixed local/API chain.
// escalateRouteLive's modelRoutingCaller expects an SDK-shaped client, so for mixed chains we bypass it and hand
// escalateRoute a caller directly through recordRoute's seams.
export async function makeMixedSetup({ localModel, localBase = DEFAULT_OLLAMA, apiChain = DEFAULT_CHAIN, localCost = 0.2, client = null }) {
    const chain = localFirstChain(localModel, apiChain, localCost);
    const localCall = localModel ? ollamaCaller(localBase) : null;
    let apiCall = null;
    if (client) {
        const { modelRoutingCaller } = await import("./escalateRouteLive.mjs");
        apiCall = modelRoutingCaller(client);
    }
    return { chain, callModel: mixedCaller({ chain, localCall, apiCall }) };
}

// One task: route cheap->strong against the real SweK gate, record the trace, then AUDIT it by replay.
export async function runOne({ client, chain = DEFAULT_CHAIN, task = makeFaceCountTask(3, 4, 5) }) {
    const { result, trace } = await recordRoute({ task, chain, client, runGate: faceCountGate });
    const audit = await replayRoute(trace, { runGate: faceCountGate });
    return { result, trace, audit, stats: traceStats(trace), truth: faceCountGate({}, task).truth };
}

// A batch, for the savings number that actually applies to this chain.
export async function runBench({ client, chain = DEFAULT_CHAIN, count = 12 }) {
    const tasks = [];
    for (let i = 0; i < count; i++) tasks.push(makeFaceCountTask(1 + (i % 5), 1 + (i % 4), 2 + (i % 3)));
    return runBatch({ tasks, chain, client, runGate: faceCountGate });
}

// ---- CLI (pathToFileURL main detection per the WINDOWS PATH LAW) ------------------------------------
import { pathToFileURL } from "node:url";
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const argv = process.argv.slice(2);
    const dry = argv.includes("--dry");
    const benchIdx = argv.indexOf("--bench");
    const benchCount = benchIdx >= 0 ? parseInt(argv[benchIdx + 1] || "12", 10) : 0;

    let client;
    try {
        client = dry ? makeDryClient() : await makeLiveClient();
    } catch (e) {
        // A missing key or missing SDK is an ordinary setup state, not a crash -- say what to do, no stack trace.
        console.error("\n  " + (e && e.message ? e.message : e) + "\n");
        console.error("  Get a key:  https://console.anthropic.com  (Claude API billing is separate from a");
        console.error("              claude.ai Pro/Max subscription; fund it with prepaid credits.)");
        console.error("  Try first:  node tools/roundhouse/runLive.mjs --dry\n");
        process.exit(1);
    }
    console.log(dry ? "[dry run] mock client -- no key, no network. Routing/tracing/replay are real.\n"
        : "[live] using ANTHROPIC_API_KEY\n");
    console.log("chain: " + DEFAULT_CHAIN.map((m) => `${m.name}(${m.cost})`).join("  ->  ") + "\n");

    if (benchCount > 0) {
        const { stats } = await runBench({ client, count: benchCount });
        console.log(benchReport(stats));
        console.log("\n(cost figures are the chain's RELATIVE weights, not dollars)");
    } else {
        const { result, stats, audit, truth } = await runOne({ client });
        console.log(`task: exposed faces of a 3x4x5 box   SweK truth = ${truth}`);
        for (const s of stats.perStep) console.log(`  ${s.model.padEnd(30)} gate ${s.verified ? "PASS" : "FAIL"}`);
        console.log(`\nchosen: ${result.chosen}   verified: ${result.verified}   escalations: ${stats.escalations}`);
        console.log(`spent ${stats.totalCost} vs always-strongest ${stats.ifAlwaysStrongest}  ->  saved ${stats.saved}`);
        console.log(`replay audit: ${audit.consistent ? "CONSISTENT (recorded verdicts reproduce)" : "INCONSISTENT"}`);
        if (argv.includes("--save-trace")) {
            const fs = await import("node:fs");
            fs.writeFileSync("route-trace.json", serializeTrace((await runOne({ client })).trace));
            console.log("trace written to route-trace.json");
        }
    }
}
