// WebGLEngine/tools/ship/promptCost-selfcheck.mjs -- v2849
//
// Run: node tools/ship/promptCost-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES the refutation of the second idea mined in v2847. That repo's context-optimization templates claim
// 50-90% token reductions; this pins that the claim DOES NOT TRANSFER to the roundhouse, and pins the numbers
// that say so -- so the idea is not re-argued from intuition in six months.
//
// The point is not that the technique is bad. It is that OPTIMISING TOKENS HERE OPTIMISES THE ONE RESOURCE THAT
// IS NOT SCARCE, and the gate keeps the evidence for that next to the claim.

import { APPROX_TOKENS, MEASURED, savingsFrom, BINDING_CONSTRAINT, isPromptTheBottleneck, costOfCall } from "../roundhouse/promptCost.mjs";
import { prose } from "./sourceScan.mjs";
import { proposerSys, evaluatorSys } from "../roundhouse/ollamaRoleCaller.mjs";
import { getDevice, DEVICE_NAMES } from "../roundhouse/devices.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// 1. THE RECORDED MEASUREMENT MATCHES THE LIVE PROMPTS -- otherwise the refutation rots
{
    let sum = 0;
    for (const n of DEVICE_NAMES) { const d = await getDevice(n); sum += APPROX_TOKENS(proposerSys(d.name, d.observables)); }
    const mean = sum / DEVICE_NAMES.length;
    ok("!! the recorded proposer cost still matches the LIVE prompts", Math.abs(mean - MEASURED.proposerSystemMeanTokens) < 30,
        `live ${Math.round(mean)} vs recorded ${MEASURED.proposerSystemMeanTokens}`);
    ok("...and the evaluator prompt too", Math.abs(APPROX_TOKENS(evaluatorSys) - MEASURED.evaluatorSystemTokens) < 20,
        `live ${APPROX_TOKENS(evaluatorSys)} vs ${MEASURED.evaluatorSystemTokens}`);
    ok("the device count is current", DEVICE_NAMES.length === MEASURED.devices, `${DEVICE_NAMES.length} vs ${MEASURED.devices}`);
}

// 2. THE PROMPT IS SMALL, WHICH IS THE WHOLE ARGUMENT
{
    ok("!! one full round costs a few hundred tokens, not thousands", MEASURED.perRoundTokens < 800, `${MEASURED.perRoundTokens}`);
    const big = savingsFrom(0.9, { rounds: 1 });
    ok("!! even a 90% cut saves under 400 tokens per round", big.perRoundTokens < 400, `${big.perRoundTokens} tokens`);
    // savingsFrom rounds ONCE at the end, which is right; my first check multiplied a pre-rounded per-round
    // figure and expected equality. 399*0.5 = 199.5 rounds to 200, and 200*100 = 20000 while the correct
    // 199.5*100 = 19950. The check was wrong about the arithmetic, not the code.
    const hundred = savingsFrom(0.5, { rounds: 100 });
    ok("savingsFrom scales with rounds, so a matrix can be judged too",
        Math.abs(hundred.totalTokens - savingsFrom(0.5).perRoundTokens * 100) <= 100 && hundred.rounds === 100,
        `${hundred.totalTokens} for 100 rounds`);
}

// 3. AND TOKENS ARE NOT THE BINDING CONSTRAINT ANYWAY -- per tier, with the reason
{
    ok("!! gemini is limited by REQUESTS PER MINUTE, not tokens", BINDING_CONSTRAINT.gemini.tokensBinding === false && /per minute/.test(BINDING_CONSTRAINT.gemini.constraint));
    ok("!! local ollama is limited by COMPUTE", BINDING_CONSTRAINT.ollama.tokensBinding === false && /compute/.test(BINDING_CONSTRAINT.ollama.constraint));
    ok("!! a matrix run is limited by WALL CLOCK", BINDING_CONSTRAINT.matrix.tokensBinding === false && /wall clock/.test(BINDING_CONSTRAINT.matrix.constraint));
    ok("...and the ONE tier where tokens are money says so honestly", BINDING_CONSTRAINT.claude.tokensBinding === true);
    ok("every tier carries a REASON, not just a verdict", Object.values(BINDING_CONSTRAINT).every((b) => b.why && b.why.length > 30));
    ok("an unknown tier says it does not know", isPromptTheBottleneck("nope").known === false);
}

// 4. THE PROXY IS LABELLED A PROXY
{
    ok("costOfCall reports which proxy it used", costOfCall({ system: "abcd", user: "efgh" }).proxy === "chars/4");
    ok("...and the arithmetic is right", costOfCall({ system: "abcd", user: "efghijkl" }).totalTokens === 3);
    const src = (await import("node:fs")).readFileSync(new URL("../roundhouse/promptCost.mjs", import.meta.url), "utf8");
    ok("!! the source says chars/4 is a PROXY and why saying 'tokens' without a tokenizer would be a guess",
        /is a PROXY and is labelled one/.test(prose(src)) && /guess dressed as a measurement/.test(prose(src)));
}

// 5. THE REFUTATION KEEPS ITS REASONING, including where the idea DOES apply
{
    const src = (await import("node:fs")).readFileSync(new URL("../roundhouse/promptCost.mjs", import.meta.url), "utf8");
    ok("the origin of the idea is credited", /awesome-llm-apps/.test(src) && /50-90%/.test(src));
    ok("!! it says the technique is not bad, only mis-aimed here", /Right diagnosis, wrong patient/.test(src));
    ok("!! and names where the same problem DOES bite: code exploration", /470,660 lines/.test(src) && /code-graph tools/.test(src));
    ok("...and credits v2824 for the payloads already being compact", /v2824 ALREADY compacted/.test(src));
}

// ---- v3311 -- THE NUMBER THAT MULTIPLIES NOW ACTUALLY MULTIPLIES ------------------------------------------------
// The count was watched by the staleness gate on the grounds that "the cost model multiplies by this". Nothing
// did. The multiplication lived in a SENTENCE in the header -- "nineteen devices times three runs times four
// rounds across four peers, about 364k tokens" -- and a sentence does not recompute, so at 50 devices the
// example was wrong by 2.6x and nothing could notice.
{
    const { fullMatrixTokens } = await import("../roundhouse/promptCost.mjs");
    const rec = fullMatrixTokens({ devices: MEASURED.devicesMeasured });
    ok("!! fullMatrixTokens reproduces the figure the header recorded in v2849 (912 calls, ~364k tokens)",
       rec.calls === 912 && Math.abs(rec.tokens - 364000) < 1500,
       rec.calls + " calls, " + rec.tokens + " tokens against the recorded ~364k — reproducing a number written seven hundred versions ago is how you know the arithmetic is the arithmetic that was meant");
    const now = fullMatrixTokens({ devices: DEVICE_NAMES.length });
    ok("!! ...and today's registry gives a materially different answer, which is the drift prose could not catch",
       now.tokens > rec.tokens * 2,
       DEVICE_NAMES.length + " devices -> " + now.tokens + " tokens, " + (now.tokens / rec.tokens).toFixed(2) + "x the recorded figure");
    let threw = false;
    try { fullMatrixTokens({}); } catch { threw = true; }
    ok("!! the device count must be SUPPLIED, never baked in (the whole point of the change)",
       threw, "a default would have quietly reintroduced exactly the stale constant this replaced");
    ok("MEASURED separates the SCOPE OF THE MEASUREMENT from the live registry size",
       MEASURED.devicesMeasured === 19 && MEASURED.devices === DEVICE_NAMES.length,
       "devicesMeasured " + MEASURED.devicesMeasured + " (frozen: what v2849 actually covered) vs devices " +
       MEASURED.devices + " (today) — a frozen record with a hand-edited field is not a record");
}

console.log("promptCost-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
