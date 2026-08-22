// tools/roundhouse/floorAtlas.mjs — v3284
// ---------------------------------------------------------------------------------------------------------------
// THE FLOOR ATLAS — turning "tolerance with 2x margin" from a policy into a per-vendor MEASUREMENT.
//
// Every WGSL kernel in this lab ships with a tolerance earned from a floor measured on the reference box: the
// worst f64-vs-f32 gap over a seeded batch, doubled. That is honest as far as it goes, and it goes exactly one
// machine. The fleet has been quietly accumulating the same measurement from real silicon -- every submitted
// bench report carries the adapter that produced it and the worst gap it saw -- and nothing was reading it.
// This does.
//
// WHAT IT IS NOT: a leaderboard. Speed is already handled by perfLedger.mjs and belongs there; mixing the two
// would produce a table where a fast wrong answer outranks a slow right one.
//
// THE ONE RULE THAT MATTERS HERE: FLOORS FROM DIFFERENT KERNELS ARE NOT COMMENSURABLE AND ARE NEVER POOLED.
//   - magmap and hmc-bench report a FLOATING-POINT GAP: a real number, comparable within its own kernel.
//   - ising-bench reports a COUNT OF DIFFERING SPINS at tolerance zero: an integer, where 0 is pass and
//     anything else is rejection. There is no "small" value of it.
// Averaging an integer rejection count with a float gap would produce a number that means nothing, so the atlas
// keeps them in separate columns and labels the kind. The aggregate an atlas WANTS to compute is exactly the
// aggregate that would be meaningless, which is why the rule is written down rather than assumed.
//
// A vendor's floor is the WORST gap it has ever reported, not the median: a tolerance has to cover the bad day.
// Medians are for timing, where the outlier is usually a background process; here the outlier is the finding.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

// which kernels report what, and how a floor is read out of each report
export const KERNEL_SPECS = {
    "swek-magmap-bench": {
        kernel: "magmap", metric: "float-gap",
        floorOf: (r) => {
            const vals = (r.results || []).map((x) => x.worstRelDiff).filter((x) => Number.isFinite(x));
            return vals.length ? Math.max(...vals) : null;
        },
        tolOf: (r) => (Number.isFinite(r.tol) ? r.tol : null),
    },
    "swek-hmc-bench": {
        kernel: "hmc-leapfrog", metric: "float-gap",
        floorOf: (r) => (Number.isFinite(r.worst) ? r.worst : null),
        tolOf: (r) => (Number.isFinite(r.tol) ? r.tol : null),
    },
    "swek-ising-bench": {
        kernel: "ising-checkerboard", metric: "exact-count",
        floorOf: (r) => (Number.isFinite(r.spinsDiffer) ? r.spinsDiffer : null),
        tolOf: () => 0,
    },
};

export const adapterKey = (r) => {
    const a = r && r.adapter ? r.adapter : {};
    const v = (a.vendor || "unknown").toString().trim() || "unknown";
    const arch = (a.architecture || "").toString().trim();
    return arch ? v + "/" + arch : v;
};

/**
 * Fold one submitted bench report into an atlas. Pure; the caller persists. Unknown kinds are REPORTED rather
 * than dropped -- a kernel that starts submitting and is never read would otherwise be invisible.
 */
export function foldReport(atlas, report) {
    const out = atlas && typeof atlas === "object" ? { ...atlas } : { kind: "swek-floor-atlas", entries: {}, skipped: [] };
    out.entries = { ...(out.entries || {}) };
    out.skipped = [...(out.skipped || [])];
    const spec = KERNEL_SPECS[report && report.kind];
    if (!spec) { out.skipped.push({ kind: (report && report.kind) || "(none)", why: "no floor spec for this kind" }); return out; }
    const floor = spec.floorOf(report);
    if (floor == null) { out.skipped.push({ kind: report.kind, why: "report carried no floor measurement" }); return out; }
    const key = spec.kernel + " :: " + adapterKey(report);
    const prev = out.entries[key];
    const tol = spec.tolOf(report);
    out.entries[key] = {
        kernel: spec.kernel, adapter: adapterKey(report), metric: spec.metric,
        // THE WORST EVER SEEN, not the median -- a tolerance has to cover the bad day
        worst: prev ? Math.max(prev.worst, floor) : floor,
        latest: floor, runs: (prev ? prev.runs : 0) + 1,
        tol: tol != null ? tol : (prev ? prev.tol : null),
        lastAt: report.at || null,
        version: report.version != null ? report.version : (prev ? prev.version : null),
    };
    return out;
}

/**
 * Grade the atlas. For float-gap kernels the useful number is the MARGIN: tol / worst. Below 1 the device has
 * already failed; between 1 and 2 the tolerance is holding with less headroom than the reference box was given,
 * which is a finding worth surfacing before it becomes a failure on someone's desk.
 * For exact-count kernels there is no margin to compute -- 0 or rejected -- and pretending otherwise is the
 * error this function exists to avoid.
 */
export const TIGHT_MARGIN = 2.0;
export function gradeAtlas(atlas) {
    const rows = Object.values((atlas && atlas.entries) || {});
    const failures = [], tight = [], comfortable = [], exact = [];
    for (const e of rows) {
        if (e.metric === "exact-count") {
            (e.worst === 0 ? exact : failures).push({ ...e, margin: null,
                note: e.worst === 0 ? "bit-exact on every run" : e.worst + " differing spins: REJECTED (tolerance is zero)" });
            continue;
        }
        if (e.tol == null) { tight.push({ ...e, margin: null, note: "no tolerance recorded in the report" }); continue; }
        const margin = e.worst > 0 ? e.tol / e.worst : Infinity;
        const row = { ...e, margin };
        if (margin < 1) failures.push({ ...row, note: "worst gap EXCEEDS the shipped tolerance" });
        else if (margin < TIGHT_MARGIN) tight.push({ ...row, note: "holding, with less headroom than the reference box was given" });
        else comfortable.push({ ...row, note: "comfortable" });
    }
    const bySeverity = (a, b) => (a.margin ?? 0) - (b.margin ?? 0);
    return { failures: failures.sort(bySeverity), tight: tight.sort(bySeverity), comfortable: comfortable.sort(bySeverity),
             exact, adapters: new Set(rows.map((r) => r.adapter)).size, kernels: new Set(rows.map((r) => r.kernel)).size,
             rows: rows.length };
}

export function atlasLines(g) {
    const out = [];
    out.push(`floor atlas: ${g.rows} (kernel, adapter) pairs across ${g.adapters} adapters and ${g.kernels} kernels`);
    for (const [label, list] of [["FAILING", g.failures], ["tight", g.tight]]) {
        for (const e of list) out.push(`  ${label}: ${e.kernel} on ${e.adapter} — worst ${typeof e.worst === "number" && e.metric === "float-gap" ? e.worst.toExponential(2) : e.worst}` +
            (e.tol != null && e.metric === "float-gap" ? ` vs tol ${e.tol.toExponential(2)} (margin ${e.margin === Infinity ? "inf" : e.margin.toFixed(2)}x)` : "") + ` — ${e.note}`);
    }
    for (const e of g.exact) out.push(`  exact: ${e.kernel} on ${e.adapter} — ${e.note} over ${e.runs} run(s)`);
    if (!g.rows) out.push("  (no device reports folded yet — every kernel still awaits real silicon)");
    return out;
}
