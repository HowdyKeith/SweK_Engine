// tools/roundhouse/perfLedger.mjs
//
// v2940 -- THE PERFORMANCE LEDGER. The runner already times every check ({name, status, ms} per run); nothing
// kept those timings across runs, so a device that silently got 10x slower would never show up -- every gate is
// about CORRECTNESS, none about SPEED. This appends each run's per-check timings to a ledger and flags a check
// whose time has REGRESSED, with one overriding piece of discipline built in from the start:
//
// TIMING IS NOISY, AND THE THRESHOLD IS MEASURED, NOT CHOSEN. The same check on the same machine varies run to
// run from scheduling, thermal throttling, and background load. Measured on the reference box: coefficient of
// variation 13%, and a 35% spread between the fastest and slowest of five identical runs. So a regression alarm
// that fired on a single slow run, or on anything under ~40%, would fire constantly on pure noise and be worse
// than useless -- operators would learn to ignore it. This ledger therefore:
//   - compares a MEDIAN of recent runs against a MEDIAN of the baseline runs, not single samples;
//   - flags a regression only when the recent median exceeds the baseline median by more than REGRESS_FACTOR,
//     set to 2.0 -- comfortably above the measured 1.35 worst-case noise range, so a flagged check has really
//     changed, not just landed on a slow scheduler tick;
//   - needs a MINIMUM number of runs on each side before it will judge at all, because a median of one or two
//     noisy samples is itself noise.
// The cost of this conservatism is that a small real slowdown (say 1.5x) will not trip the alarm. That is the
// right trade: a performance ledger that cries wolf is ignored, and a 10x regression -- the thing that actually
// matters, an unwired cache or an accidental O(n^2) -- clears 2x with room to spare.

export const REGRESS_FACTOR = 2.0;     // recent median must exceed baseline median by this to flag (noise range is ~1.35)
export const IMPROVE_FACTOR = 0.5;     // recent median below this * baseline flags a (welcome) speedup worth noting
export const MIN_RUNS_EACH = 3;        // need at least this many runs on each side before judging -- a median of noise is noise

const median = (xs) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Fold one runner transcript into a ledger. The ledger is keyed by check name; each entry holds an array of
 * {at, ms, status, host} samples. Only PASSING checks are recorded -- a failed or timed-out check's time is
 * meaningless (it may have died early or been killed at the budget), and mixing those into the timing would
 * corrupt the median. Returns the updated ledger (pure; caller persists it).
 */
export function foldRun(ledger, transcript) {
    const out = ledger && typeof ledger === "object" ? { ...ledger } : { kind: "swek-perf-ledger", checks: {} };
    if (!out.checks) out.checks = {};
    const at = transcript.at || new Date().toISOString();
    const hostKey = transcript.host ? `${transcript.host.platform || "?"}/${transcript.host.arch || "?"}/${transcript.host.libc || "?"}` : "unknown";
    for (const c of transcript.checks || []) {
        if (c.status !== "pass") continue;                 // only time a check that actually completed
        if (!Number.isFinite(c.ms)) continue;
        const key = c.name;
        (out.checks[key] ||= []).push({ at, ms: c.ms, host: hostKey });
    }
    return out;
}

/**
 * Grade a ledger for regressions, PER HOST (a slow phone is not a regression against a fast desktop -- only a
 * given machine getting slower than its own history is). For each (check, host) with enough samples, split into
 * baseline (all but the most recent `recentN`) and recent (the last `recentN`), compare medians, and classify.
 *
 * Returns { regressions, improvements, stable, insufficient } -- arrays of per-(check,host) verdicts. A
 * regression is only emitted when recent/baseline > REGRESS_FACTOR AND both sides have >= MIN_RUNS_EACH samples,
 * so the noise floor measured on the reference box cannot produce a false alarm.
 */
export function gradePerf(ledger, { recentN = 3, regressFactor = REGRESS_FACTOR, improveFactor = IMPROVE_FACTOR } = {}) {
    const regressions = [], improvements = [], stable = [], insufficient = [];
    const checks = (ledger && ledger.checks) || {};
    for (const [name, samples] of Object.entries(checks)) {
        // partition by host so a machine is only ever compared to itself
        const byHost = {};
        for (const s of samples) (byHost[s.host] ||= []).push(s);
        for (const [host, hs] of Object.entries(byHost)) {
            if (hs.length < MIN_RUNS_EACH + 1) { insufficient.push({ name, host, samples: hs.length, why: `need >= ${MIN_RUNS_EACH + 1} runs on this host, have ${hs.length}` }); continue; }
            const recent = hs.slice(-recentN).map((s) => s.ms);
            const baseline = hs.slice(0, -recentN).map((s) => s.ms);
            if (baseline.length < MIN_RUNS_EACH || recent.length < MIN_RUNS_EACH) { insufficient.push({ name, host, samples: hs.length, why: `not enough on both sides (baseline ${baseline.length}, recent ${recent.length}), need ${MIN_RUNS_EACH} each` }); continue; }
            const mb = median(baseline), mr = median(recent);
            const ratio = mr / mb;
            const rec = { name, host, baselineMedianMs: mb, recentMedianMs: mr, ratio, baselineN: baseline.length, recentN: recent.length };
            if (ratio > regressFactor) regressions.push({ ...rec, verdict: "REGRESSED", why: `recent median ${mr.toFixed(0)}ms is ${ratio.toFixed(2)}x the baseline ${mb.toFixed(0)}ms -- above the ${regressFactor}x threshold (noise range ~1.35x), so this is a real slowdown` });
            else if (ratio < improveFactor) improvements.push({ ...rec, verdict: "IMPROVED", why: `recent median ${mr.toFixed(0)}ms is ${ratio.toFixed(2)}x the baseline ${mb.toFixed(0)}ms -- a real speedup` });
            else stable.push({ ...rec, verdict: "stable", why: `ratio ${ratio.toFixed(2)}x is within the noise band` });
        }
    }
    return { regressions, improvements, stable, insufficient };
}

/** One-line human summary, regressions first because they are the point. */
export function perfLines(g) {
    const lines = [];
    for (const r of g.regressions) lines.push(`  REGRESSED  ${r.name} [${r.host}] -- ${r.ratio.toFixed(2)}x slower (${r.baselineMedianMs.toFixed(0)} -> ${r.recentMedianMs.toFixed(0)}ms)`);
    for (const r of g.improvements) lines.push(`  improved   ${r.name} [${r.host}] -- ${r.ratio.toFixed(2)}x (${r.baselineMedianMs.toFixed(0)} -> ${r.recentMedianMs.toFixed(0)}ms)`);
    if (!g.regressions.length) lines.push(`  no regressions across ${g.stable.length} stable checks (${g.insufficient.length} awaiting more runs)`);
    return lines;
}

// ---- CLI: fold a transcript into a ledger, then grade -------------------------------------------------------------
// Usage:
//   node tools/roundhouse/perfLedger.mjs fold <transcript.json> <ledger.json>   -- append a run, write the ledger
//   node tools/roundhouse/perfLedger.mjs grade <ledger.json>                     -- report regressions
// Kept as a SEPARATE tool rather than folded into every runner invocation, so accumulating timing is an explicit
// operator choice and a normal correctness run is unchanged. A transcript is the runner's own output; the ledger
// grows across as many runs as you fold into it.
import { fileURLToPath as _fu } from "node:url";
import _path from "node:path";
import _fs from "node:fs";
if (process.argv[1] && _fu(import.meta.url) === _path.resolve(process.argv[1])) {
    const [cmd, a, b] = process.argv.slice(2);
    if (cmd === "fold") {
        if (!a || !b) { console.error("usage: perfLedger.mjs fold <transcript.json> <ledger.json>"); process.exit(2); }
        const transcript = JSON.parse(_fs.readFileSync(a, "utf8"));
        const ledger = _fs.existsSync(b) ? JSON.parse(_fs.readFileSync(b, "utf8")) : {};
        const updated = foldRun(ledger, transcript);
        _fs.writeFileSync(b, JSON.stringify(updated, null, 2));
        const n = Object.values(updated.checks).reduce((s, arr) => s + arr.length, 0);
        console.log(`folded ${(transcript.checks || []).filter((c) => c.status === "pass").length} passing timings; ledger now holds ${n} samples across ${Object.keys(updated.checks).length} checks`);
    } else if (cmd === "grade") {
        if (!a) { console.error("usage: perfLedger.mjs grade <ledger.json>"); process.exit(2); }
        const ledger = JSON.parse(_fs.readFileSync(a, "utf8"));
        const g = gradePerf(ledger);
        for (const ln of perfLines(g)) console.log(ln);
        if (g.regressions.length) process.exit(1);   // a regression is a nonzero exit, so CI can gate on it
    } else {
        console.error("usage: perfLedger.mjs <fold|grade> ...");
        process.exit(2);
    }
}
