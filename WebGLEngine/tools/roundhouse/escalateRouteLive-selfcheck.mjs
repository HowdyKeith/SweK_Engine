// WebGLEngine/tools/roundhouse/escalateRouteLive-selfcheck.mjs -- v2785
//
// Run: node tools/roundhouse/escalateRouteLive-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/roundhouse/escalateRouteLive.mjs -- the live wiring of escalateRoute to a model-routing Anthropic
// caller + a SweK-gate verifier. A MOCK client + a real runGate drive it headless (no API key). Pins: the
// routing caller calls the NAMED model and parses JSON; the SweK-gate verifier is load-bearing (accepts only
// gate-passing output, escalating past cheap models that fail, and reports escalationExhausted honestly when the
// gate rejects everyone); savings are computed.

import { modelRoutingCaller, swekGateVerifier, routeWithSwekGate, DEFAULT_CHAIN } from "./escalateRouteLive.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// mock Anthropic client: each model returns a different JSON "answer". cheap models are wrong; strong is right.
function mockClient(answers) {
    const calls = [];
    return {
        calls,
        messages: {
            create: async ({ model, messages }) => {
                calls.push({ model, content: messages[0].content });
                const val = answers[model] ?? "none";
                return { content: [{ type: "text", text: `here you go: {"value":"${val}"}` }] };
            },
        },
    };
}

const chain = [
    { name: "cheap", cost: 1 },
    { name: "mid", cost: 5 },
    { name: "strong", cost: 25 },
];

// 1. routing caller calls the named model + parses the JSON answer
{
    const client = mockClient({ cheap: "A", mid: "B", strong: "C" });
    const call = modelRoutingCaller(client);
    const out = await call("mid", { q: 1 });
    ok("routing caller: calls the NAMED model", client.calls[0].model === "mid");
    ok("routing caller: parses the model's JSON output", out && out.value === "B", JSON.stringify(out));
    ok("routing caller: serializes an object task to the message content", typeof client.calls[0].content === "string" && client.calls[0].content.includes("\"q\""));
}

// 2. SweK-gate verifier: accepts boolean and { pass } shapes
{
    const vBool = swekGateVerifier(() => true);
    const vObj = swekGateVerifier(() => ({ pass: false }));
    ok("verifier: boolean gate result honored", (await vBool({}, {}, "m")) === true);
    ok("verifier: { pass } gate result honored", (await vObj({}, {}, "m")) === false);
    let threw = false; try { swekGateVerifier(null); } catch { threw = true; }
    ok("verifier: refuses a non-function gate (no routing without a verifier)", threw);
}

// 3. ESCALATION: cheap+mid fail the gate, strong passes -> routes to strong, verified, savings computed
{
    const client = mockClient({ cheap: "wrong", mid: "wrong", strong: "42" });
    // SweK gate: only the answer "42" passes
    const runGate = (output) => ({ pass: output && output.value === "42" });
    const res = await routeWithSwekGate({ task: { q: "meaning?" }, chain, client, runGate });
    ok("escalation: routes to the strong model when cheap+mid fail the gate", res.chosen === "strong" && res.verified === true);
    ok("escalation: escalations counts the two failed hops", res.escalations === 2);
    ok("escalation: tried cheap -> mid -> strong in order", client.calls.map(c => c.model).join(",") === "cheap,mid,strong");
    ok("escalation: savings vs always-strongest computed", res.savings && res.savings.spent === 31 && res.savings.ifAlwaysStrongest === 25 && res.savings.saved === 25 - 31);
}

// 4. CHEAP-WINS: cheap passes the gate -> no escalation, big savings
{
    const client = mockClient({ cheap: "42", mid: "42", strong: "42" });
    const runGate = (o) => o.value === "42";
    const res = await routeWithSwekGate({ task: "q", chain, client, runGate });
    ok("cheap-wins: cheapest passing model chosen, 0 escalations", res.chosen === "cheap" && res.escalations === 0);
    ok("cheap-wins: only ONE model was called", client.calls.length === 1);
    ok("cheap-wins: saved the strong-minus-cheap cost", res.savings.saved === 25 - 1);
}

// 5. EXHAUSTED: nobody passes -> strongest returned, flagged verified:false + escalationExhausted (honest)
{
    const client = mockClient({ cheap: "no", mid: "no", strong: "no" });
    const res = await routeWithSwekGate({ task: "q", chain, client, runGate: () => false });
    ok("exhausted: returns the strongest attempt", res.chosen === "strong");
    ok("exhausted: flagged verified:false + escalationExhausted (unverified, not a silent lie)", res.verified === false && res.escalationExhausted === true);
}

// 6. DEFAULT_CHAIN is cheap->strong with real model strings
{
    const costs = DEFAULT_CHAIN.map(m => m.cost);
    ok("DEFAULT_CHAIN ordered cheap->strong", costs.every((c, i) => i === 0 || c > costs[i - 1]));
    ok("DEFAULT_CHAIN uses real API model strings", DEFAULT_CHAIN.every(m => /claude-/.test(m.name)));
}

console.log("escalateRouteLive-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
