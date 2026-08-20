// WebGLEngine/tools/bench/fleetBench-selfcheck.mjs -- v2984
//
// Run: node tools/bench/fleetBench-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/bench/fleetBench.mjs -- collecting benchmark SCORES from peers, which the fleet did not do.
//
// It already collects FINGERPRINTS: per-subsystem hashes and measured observables, answering "do we agree?".
// Nothing collected SPEED. And speed on its own is not a collectable quantity, for two reasons that are
// REFUSALS here rather than caveats:
//
//   A FAST WRONG ANSWER IS NOT A GOOD SCORE. A peer finishing in half the time because its build drifted has
//   not won; it is computing something else. So the workload PRODUCES ITS OWN ANSWER KEY -- the same run yields
//   the elapsed time and a Poiseuille residual against the exact parabola. Correctness is not a separate check
//   somebody might skip.
//
//   SCORES FROM DIFFERENT BUILDS ARE NOT THE SAME BENCHMARK. Mixing them is refused, not silently pooled.
import { WORKLOAD, runWorkload, score, rank, VERDICT } from "./fleetBench.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. the workload produces BOTH numbers from one run -----------------------------------------------------
{
    const r = runWorkload();
    ok("a run returns a time", r.ms > 0 && r.stepsPerSec > 0, r.ms + "ms, " + Math.round(r.stepsPerSec) + " steps/s");
    ok("!! ...and a CORRECTNESS residual from the SAME run", Number.isFinite(r.residual),
       "residual " + r.residual.toExponential(2) + " -- the answer key is not a separate step anyone could skip");
    ok("!! the workload actually CONVERGES", r.correct && r.residual < 0.01,
       "0.28% against the exact parabola. My first workload needed 66,000 steps and reported 0.94, which looked like a slow machine and was a wrong size");
    ok("it is deterministic in shape", runWorkload().residual.toFixed(6) === r.residual.toFixed(6),
       "the timing varies, the physics does not");
}

// ---- 2. RANKING REFUSES WHERE IT WOULD MISLEAD -----------------------------------------------------------------
{
    const s = score(WORKLOAD, 1);
    const good = (host, ms, ver = "v2984") => ({ host, arch: "x64", engineVersion: ver, ok: true, score: { ...s, ms } });

    const r = rank([good("fast", 100), good("slow", 210),
                    { host: "wrong", arch: "x64", engineVersion: "v2984", ok: true, score: { ...s, ms: 1, correct: false, residual: 0.9 } },
                    { host: "dead", engineVersion: "v2984", ok: false, error: "timeout" }]);
    const by = (h) => r.rows.find((x) => x.host === h);
    ok("!! a peer with a TIME but a wrong ANSWER is not ranked", by("wrong").verdict === VERDICT.DIVERGED,
       "it was the fastest at 1ms and it is excluded -- a fast wrong answer is not a good score");
    ok("...and the refusal says why", /fast wrong answer/i.test(by("wrong").why || ""));
    ok("an unreachable peer is FAILED, not zero", by("dead").verdict === VERDICT.FAILED,
       "a missing score counted as zero would top the table");
    ok("correct peers are ranked fastest first", r.ranked.length === 2 && r.ranked[0].host === "fast");
    ok("!! the headline is a RATIO, not a league position", r.spread > 2 && /x the slowest/.test(r.note),
       r.note.slice(0, 90));
}

// ---- 3. MIXED BUILDS ARE NOT THE SAME BENCHMARK ------------------------------------------------------------------
{
    const s = score(WORKLOAD, 1);
    const mixed = rank([
        { host: "a", engineVersion: "v2984", ok: true, score: { ...s, ms: 100 } },
        { host: "b", engineVersion: "v2980", ok: true, score: { ...s, ms: 90 } },
    ]);
    ok("!! two engine versions -> INCOMPARABLE, not a ranking", mixed.rows.every((x) => x.verdict === VERDICT.INCOMPARABLE),
       "pooling scores from different builds produces a number describing nothing");
    ok("...and it names the versions found", /v2984/.test(mixed.rows[0].why) && /v2980/.test(mixed.rows[0].why));
    ok("...and nothing is declared fastest", mixed.fastest === null && mixed.ranked.length === 0,
       "refusing to rank is the correct output here, not an error");
}

// ---- 4. the score carries what a reader needs to check it ----------------------------------------------------------
{
    const s = score(WORKLOAD, 2);
    ok("the score names its workload", s.workload === WORKLOAD.label, s.workload);
    ok("!! ...and reports EVERY repetition, not just the best", Array.isArray(s.allMs) && s.allMs.length === 2,
       "best-of-n hides a machine that is erratic; the raw runs do not");
    ok("best-of-n is used, because one timing measures the load", s.ms === Math.min(...s.allMs));
}

console.log(fails ? "\nfleetBench-selfcheck: " + fails + " FAILED" : "\nfleetBench-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
