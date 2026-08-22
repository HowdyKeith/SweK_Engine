// WebGLEngine/ev/tools/es-arena-selfcheck.mjs — v2250
//
// The arena is only a useful training/eval ground if it is (1) fair (a mirror match is ~50/50, so a win
// means the policy, not the setup), (2) decisive (ships actually kill each other), (3) policy-sensitive
// (a better policy beats the book by a clear margin), and (4) deterministic (same seed -> same fight, so
// the brain's reward signal is stable). This checks all four against fixed seeds.
//
//   run: node ev/tools/es-arena-selfcheck.mjs

import { runBattle, runSeries, PRESETS, EV_CLASSES } from "./es-arena.mjs";

let pass = 0, total = 0;
const ok = (n, c, d = "") => { total++; if (c) { pass++; console.log(`  ok   ${n}`); } else { console.log(`  FAIL ${n}${d ? "  -- " + d : ""}`); } };

console.log("es-arena-selfcheck: deterministic");
{
    const a = runBattle({ weightsA: PRESETS.hand, weightsB: PRESETS.scatter, seed: 42, count: 6 });
    const b = runBattle({ weightsA: PRESETS.hand, weightsB: PRESETS.scatter, seed: 42, count: 6 });
    ok("same seed -> identical winner/survivors/ticks", a.winner === b.winner && a.survA === b.survA && a.survB === b.survB && a.ticks === b.ticks, JSON.stringify(a) + " vs " + JSON.stringify(b));
    const c = runBattle({ weightsA: PRESETS.hand, weightsB: PRESETS.scatter, seed: 43, count: 6 });
    ok("a different seed can change the outcome", a.ticks !== c.ticks || a.survA !== c.survA || a.survB !== c.survB);
}

console.log("es-arena-selfcheck: decisive (ships fire and die)");
{
    const r = runBattle({ weightsA: PRESETS.scatter, weightsB: PRESETS.hand, seed: 7, count: 6 });
    ok("shots were fired", r.shotsFired > 0);
    ok("shots connected", r.hits > 0);
    ok("attrition happened (someone died)", (r.survA + r.survB) < (r.countA + r.countB));
    ok("battle terminated within the cap", r.seconds <= 60.001);
    ok("no NaN in the result", Number.isFinite(r.survA) && Number.isFinite(r.survB) && Number.isFinite(r.ticks));
}

console.log("es-arena-selfcheck: fair (mirror match is balanced)");
{
    const m = runSeries({ weightsA: PRESETS.hand, weightsB: PRESETS.hand, n: 80, count: 6, seed: 1 });
    ok("both sides win a real share (>=30% each)", m.aWins >= 0.30 * m.n && m.bWins >= 0.30 * m.n, JSON.stringify(m));
    ok("neither side dominates the mirror (<=66%)", Math.max(m.aWins, m.bWins) <= 0.66 * m.n, JSON.stringify(m));
    const mm = runSeries({ weightsA: PRESETS.brawler, weightsB: PRESETS.brawler, n: 80, count: 6, seed: 3 });
    ok("a second mirror (brawler) is also balanced", Math.max(mm.aWins, mm.bWins) <= 0.66 * mm.n, JSON.stringify(mm));
}

console.log("es-arena-selfcheck: policy-sensitive (a better policy beats the book)");
{
    const s = runSeries({ weightsA: PRESETS.scatter, weightsB: PRESETS.hand, n: 80, count: 6, seed: 1 });
    ok("scatter decisively beats the hand book", s.aWins > s.bWins && (s.aWinRate - s.bWinRate) >= 0.20, JSON.stringify(s));
    // The reverse assignment must flip too: the same policy edge shows up on side B.
    const s2 = runSeries({ weightsA: PRESETS.hand, weightsB: PRESETS.scatter, n: 80, count: 6, seed: 1 });
    ok("...and the edge is the policy, not the side (flips when swapped)", s2.bWins > s2.aWins, JSON.stringify(s2));
}

console.log("es-arena-selfcheck: EV fleet runs on the same arena (game-agnostic)");
{
    const r = runBattle({ classesA: EV_CLASSES, classesB: EV_CLASSES, weightsA: PRESETS.scatter, weightsB: PRESETS.hand, seed: 9, count: 6 });
    ok("EV ships fire, connect, and take losses", r.shotsFired > 0 && r.hits > 0 && (r.survA + r.survB) < (r.countA + r.countB));
    ok("EV battle terminates within the cap", r.seconds <= 60.001 && Number.isFinite(r.ticks));
    const s = runSeries({ classesA: EV_CLASSES, classesB: EV_CLASSES, weightsA: PRESETS.scatter, weightsB: PRESETS.hand, n: 60, count: 6, seed: 1 });
    ok("the policy edge holds with EV ships too (scatter > hand)", s.aWins > s.bWins, JSON.stringify(s));
}

console.log(`\nes-arena-selfcheck: ${pass}/${total} passed`);
if (pass !== total && typeof process !== "undefined" && process.exit) process.exit(1);
