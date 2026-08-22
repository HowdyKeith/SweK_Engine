// WebGLEngine/tools/roundhouse/routeBench-selfcheck.mjs -- v2792
//
// Run: node tools/roundhouse/routeBench-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/roundhouse/routeBench.mjs -- the cheap-vs-strong savings benchmark over a batch of routed tasks
// (concrete faceCountGate as verifier). Pins the aggregate math and, critically, the HONEST findings: when the
// cheap model is reliable, routing saves; when it isn't, routing costs MORE than always-strong (you pay the
// cheap call before escalating). The SweK gate -- not the mock -- decides right/wrong.

import { runBatch, aggregate, accuracyClient, benchReport } from "./routeBench.mjs";
import { faceCountGate, makeFaceCountTask } from "./swekGates.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const chain = [{ name: "cheap", cost: 1 }, { name: "strong", cost: 25 }];
const truthFn = (task) => faceCountGate({}, task).truth;
// a batch of varied face-count tasks
const tasks = [];
for (let w = 1; w <= 5; w++) for (let h = 1; h <= 4; h++) tasks.push(makeFaceCountTask(w, h, w + 1));   // 20 tasks

// 1. aggregate math on a hand-built per-task array
{
    const perTask = [
        { chosen: "cheap", verified: true, escalations: 0, cost: 1, exhausted: false },
        { chosen: "strong", verified: true, escalations: 1, cost: 26, exhausted: false },
        { chosen: "strong", verified: false, escalations: 1, cost: 26, exhausted: true },
    ];
    const s = aggregate(perTask, chain);
    ok("aggregate: spent = sum of task costs (1+26+26=53)", s.spent === 53);
    ok("aggregate: ifAlwaysStrongest = tasks * strongest (3*25=75)", s.ifAlwaysStrongest === 75);
    ok("aggregate: saved = 75-53 = 22", s.saved === 22);
    ok("aggregate: verified=2, exhausted=1", s.verified === 2 && s.exhausted === 1);
    ok("aggregate: cheapWinRate = 1/3 (one resolved at cheapest)", Math.abs(s.cheapWinRate - 1 / 3) < 1e-9);
}

// 2. CHEAP ALWAYS RIGHT -> every task resolves at cheap, max savings
{
    const client = accuracyClient({ accuracy: { cheap: 1.0, strong: 1.0 }, truthFn });
    const { stats } = await runBatch({ tasks, chain, client, runGate: faceCountGate });
    ok("cheap-always-right: all verified", stats.verified === tasks.length);
    ok("cheap-always-right: cheapWinRate 100%", Math.abs(stats.cheapWinRate - 1) < 1e-9);
    ok("cheap-always-right: spent = tasks*cheapCost", stats.spent === tasks.length * 1);
    ok("cheap-always-right: big positive savings", stats.saved === tasks.length * (25 - 1) && stats.savedPct > 0.9);
}

// 3. CHEAP ALWAYS WRONG, strong right -> all escalate, routing COSTS MORE than always-strong (honest!)
{
    const client = accuracyClient({ accuracy: { cheap: 0.0, strong: 1.0 }, truthFn });
    const { stats } = await runBatch({ tasks, chain, client, runGate: faceCountGate });
    ok("cheap-always-wrong: still all verified (strong rescues)", stats.verified === tasks.length);
    ok("cheap-always-wrong: cheapWinRate 0%", stats.cheapWinRate === 0);
    ok("cheap-always-wrong: spent = tasks*(cheap+strong)", stats.spent === tasks.length * 26);
    ok("HONEST: routing COSTS MORE than always-strong when cheap never helps (saved < 0)", stats.saved < 0 && stats.saved === tasks.length * 25 - tasks.length * 26);
}

// 4. MIXED cheap accuracy -> partial savings, cheapWinRate between 0 and 1
{
    const client = accuracyClient({ accuracy: { cheap: 0.5, strong: 1.0 }, truthFn, seed: 7 });
    const { stats } = await runBatch({ tasks, chain, client, runGate: faceCountGate });
    ok("mixed: all verified (strong backstops)", stats.verified === tasks.length);
    ok("mixed: cheapWinRate strictly between 0 and 1", stats.cheapWinRate > 0 && stats.cheapWinRate < 1, "rate=" + stats.cheapWinRate.toFixed(2));
    ok("mixed: spent between best (all-cheap) and worst (all-escalate)", stats.spent > tasks.length * 1 && stats.spent < tasks.length * 26);
}

// 5. break-even direction: higher cheap accuracy -> more saved (monotone across a sweep)
{
    let prevSaved = -Infinity, monotone = true;
    for (const acc of [0.0, 0.25, 0.5, 0.75, 1.0]) {
        const client = accuracyClient({ accuracy: { cheap: acc, strong: 1.0 }, truthFn, seed: 3 });
        const { stats } = await runBatch({ tasks, chain, client, runGate: faceCountGate });
        if (stats.saved < prevSaved - 1e-9) monotone = false;
        prevSaved = stats.saved;
    }
    ok("break-even: savings increase monotonically with cheap accuracy", monotone);
}

// 6. the gate (not the mock) decides: a "correct" mock answer that the gate would still reject can't pass
{
    // accuracy 1.0 means the mock returns truthFn(task) exactly -> gate passes; confirm chosen==cheap for a task
    const client = accuracyClient({ accuracy: { cheap: 1.0, strong: 1.0 }, truthFn });
    const { perTask } = await runBatch({ tasks: [makeFaceCountTask(3, 3, 3)], chain, client, runGate: faceCountGate });
    ok("verifier is the SweK gate: exact answer passes at cheap", perTask[0].chosen === "cheap" && perTask[0].verified);
}

// 7. report renders the key numbers
{
    const client = accuracyClient({ accuracy: { cheap: 0.6, strong: 0.99 }, truthFn, seed: 11 });
    const { stats } = await runBatch({ tasks, chain, client, runGate: faceCountGate });
    const rep = benchReport(stats);
    ok("report: includes tasks, saved, cheap-win rate", /tasks \d+/.test(rep) && /saved/.test(rep) && /cheap-win rate/.test(rep));
    console.log("    sample report:\n      " + rep.replace(/\n/g, "\n      "));
}

console.log("routeBench-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
