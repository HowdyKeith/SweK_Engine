// WebGLEngine/tools/ship/runLive-selfcheck.mjs -- v2798
//
// Run: node tools/ship/runLive-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/roundhouse/runLive.mjs -- the rig entrypoint that reaches for a real Anthropic client. The point of
// gating it is that it must be PROVEN BEFORE THE KEY EXISTS: the whole path (route -> SweK gate -> escalate ->
// trace -> replay -> benchmark) is exercised here with an injected mock, so the only untested variable on the rig
// is the network call itself. Also pins the model chain, because a stale model string fails a live run outright
// and that failure would look like a code bug at the worst moment.

import { runOne, runBench, makeDryClient, makeLiveClient } from "../roundhouse/runLive.mjs";
import { DEFAULT_CHAIN } from "../roundhouse/escalateRouteLive.mjs";
import { faceCountGate, makeFaceCountTask } from "../roundhouse/swekGates.mjs";
import fs from "node:fs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const SRC = fs.readFileSync(new URL("../roundhouse/runLive.mjs", import.meta.url), "utf8");

// 1. THE CHAIN: current, ordered, and distinct. A stale identifier is a live-run failure, so pin the shape.
{
    ok("chain: ordered cheap -> strong", DEFAULT_CHAIN.every((m, i) => i === 0 || m.cost > DEFAULT_CHAIN[i - 1].cost));
    ok("chain: every entry is a claude-* identifier with a cost", DEFAULT_CHAIN.every((m) => /^claude-[a-z0-9-]+$/.test(m.name) && typeof m.cost === "number"));
    ok("chain: no duplicate models", new Set(DEFAULT_CHAIN.map((m) => m.name)).size === DEFAULT_CHAIN.length);
    // the two identifiers that were stale before v2798 must not come back
    const retired = DEFAULT_CHAIN.filter((m) => /claude-sonnet-4-6|claude-opus-4-1$/.test(m.name));
    ok("chain: retired model strings are gone (sonnet-4-6 / opus-4-1)", retired.length === 0, retired.map((m) => m.name).join(","));
    ok("chain: source points at the live models doc for re-verification", /docs\.claude\.com[^\s]*models/.test(fs.readFileSync(new URL("../roundhouse/escalateRouteLive.mjs", import.meta.url), "utf8")));
}

// 2. THE WHOLE PATH, offline: route -> gate -> escalate -> trace -> replay
{
    const client = makeDryClient({ accuracy: { "claude-haiku-4-5-20251001": 0 }, defaultAccuracy: 1 });   // cheap always wrong
    const { result, stats, audit, truth } = await runOne({ client });
    ok("runOne: SweK truth is computed from the engine, not the model", truth === 94, `truth=${truth}`);
    ok("runOne: a wrong cheap answer escalates and the strong answer verifies", result.verified === true && stats.escalations >= 1, `chosen=${result.chosen} esc=${stats.escalations}`);
    ok("runOne: the trace replays consistently (audit re-verifies recorded outputs)", audit.consistent === true);
    ok("runOne: reports savings vs always-strongest", typeof stats.saved === "number" && stats.ifAlwaysStrongest > 0);
}

// 3. cheap-wins path: no escalation, one call
{
    const client = makeDryClient({ accuracy: {}, defaultAccuracy: 1 });   // everyone right
    const { result, stats } = await runOne({ client });
    ok("runOne: a correct cheap answer stops at the cheapest model", result.chosen === DEFAULT_CHAIN[0].name && stats.escalations === 0);
    ok("runOne: cheap win saves the strong-minus-cheap cost", stats.saved === DEFAULT_CHAIN[DEFAULT_CHAIN.length - 1].cost - DEFAULT_CHAIN[0].cost);
}

// 4. the batch benchmark runs and its arithmetic holds
{
    const { stats } = await runBench({ client: makeDryClient(), count: 8 });
    ok("runBench: every task resolves verified", stats.tasks === 8 && stats.verified === 8);
    ok("runBench: spent + saved == always-strongest", Math.abs(stats.spent + stats.saved - stats.ifAlwaysStrongest) < 1e-9);
    ok("runBench: cheap-win rate is a fraction", stats.cheapWinRate >= 0 && stats.cheapWinRate <= 1);
}

// 5. the mock never decides correctness -- the SweK gate does
{
    const client = makeDryClient({ accuracy: {}, defaultAccuracy: 1 });
    const task = makeFaceCountTask(2, 2, 2);
    const { result } = await runOne({ client, task });
    ok("the gate adjudicates: a 2x2x2 box has 24 exposed faces", faceCountGate({}, task).truth === 24);
    ok("verified only because the answer matched that truth", result.verified === true);
}

// 6. NO KEY REQUIRED to load this module, and the SDK is imported lazily
{
    ok("source: @anthropic-ai/sdk is NOT imported at module scope (gates without the package)", !/^\s*import[^\n]*@anthropic-ai\/sdk/m.test(SRC) && /await import\("@anthropic-ai\/sdk"\)/.test(SRC));
    let msg = "";
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try { await makeLiveClient(); } catch (e) { msg = e.message; }
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    ok("makeLiveClient: refuses without a key, and says what to do", /ANTHROPIC_API_KEY/.test(msg) && /--dry/.test(msg), msg.slice(0, 60));
}

// 7. CLI hygiene: Windows-safe main detection, and setup failures exit cleanly instead of stack-tracing
{
    ok("CLI: main-module detection uses pathToFileURL (WINDOWS PATH LAW)", /pathToFileURL\(process\.argv\[1\]/.test(SRC) && !/file:\/\/\$\{process\.argv\[1\]\}/.test(SRC));
    ok("CLI: a missing key exits 1 with guidance, not a stack trace", /process\.exit\(1\)/.test(SRC) && /console\.error/.test(SRC));
    ok("CLI: offers a --dry mode that needs neither key nor network", /--dry/.test(SRC));
}

console.log("runLive-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
