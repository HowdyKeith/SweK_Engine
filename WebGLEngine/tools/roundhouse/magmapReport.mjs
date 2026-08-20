// tools/roundhouse/magmapReport.mjs
//
// v2921 -- ONE SCHEMA, TWO CONSUMERS, ZERO DRIFT. The browser page (magmap-android.html) WRITES this report and
// androidVerdict.mjs READS it, and both import their half from here -- the same discipline as buildName.js: one
// place that knows what the artifact is, so the writer and the grader cannot quietly disagree about a field name.
//
// BROWSER-SAFE BY CONTRACT. This module may import nothing but other browser-safe modules; the selfcheck walks
// the import graph and fails the gate if node: ever appears reachable from here. The page runs on a phone, and a
// phone does not get a polyfill.
//
// WHAT MAKES A VENDOR COUNT. The claim is magmapPassesOnMobileGpuAtRegisteredTol -- a MOBILE GPU, because the
// kernel has only ever met one desktop vendor and the point of item 3 is a SECOND, differently-shaped one. So a
// report from the desktop card (however green) is EXCLUDED: it would confirm nothing the lab does not already
// know. WebGPU adapter vendor strings are short and vendor-stable ("qualcomm", "arm", "apple", "imgtec"...);
// the architecture string carries the family ("adreno-7xx", "valhall"...). Both are matched, case-insensitive.

export const MAGMAP_REPORT_KIND = "swek-magmap-gpu-report";

// vendor OR architecture matching any of these counts as mobile. \barm\b is deliberate -- "arm" appears inside
// too many words to match unanchored, and Mali adapters report vendor "arm" exactly.
export const MOBILE_GPU_RE = /adreno|mali|valhall|bifrost|qualcomm|\barm\b|apple|powervr|imgtec|img-|xclipse|samsung/i;

export function isMobileAdapter(adapter = {}) {
    const s = [adapter.vendor, adapter.architecture, adapter.device, adapter.description]
        .filter(Boolean).join(" ");
    return MOBILE_GPU_RE.test(s);
}

// v2925 -- name the vendor FAMILY, so the verdict can say "Apple" or "Qualcomm/Adreno" rather than a generic
// "mobile GPU". Apple is first-class here: an iPad/iPhone GPU is a genuinely distinct third vendor for the
// magmap kernel -- a tile-based deferred architecture unlike either desktop or the Android Adreno/Mali it was
// first proven against -- and a tolerance set before it existed is exactly the discipline that makes it a test.
export const GPU_FAMILIES = [
    { family: "Apple", re: /apple/i, arch: "tile-based deferred (TBDR)" },
    { family: "Qualcomm/Adreno", re: /adreno|qualcomm/i, arch: "mobile" },
    { family: "ARM/Mali", re: /mali|valhall|bifrost|\barm\b/i, arch: "mobile" },
    { family: "Imagination/PowerVR", re: /powervr|imgtec|img-/i, arch: "mobile" },
    { family: "Samsung Xclipse", re: /xclipse|samsung/i, arch: "mobile (RDNA-derived)" },
];
export function gpuFamily(adapter = {}) {
    const s = [adapter.vendor, adapter.architecture, adapter.device, adapter.description].filter(Boolean).join(" ");
    for (const f of GPU_FAMILIES) if (f.re.test(s)) return { family: f.family, arch: f.arch };
    return { family: "unknown", arch: "" };
}

/**
 * The writer. `run` is magmapRun()'s return value; `tol`/`floor` are pinned INTO the report so the artifact is
 * self-describing -- a report graded years later does not depend on remembering what the tolerance was in v2903.
 */
export function makeMagmapReport({ adapter = {}, ua = "", run, tol, floor }) {
    if (!run || !run.verdict) throw new Error("makeMagmapReport: needs a magmapRun() result");
    return {
        kind: MAGMAP_REPORT_KIND, version: 2921, at: new Date().toISOString(),
        adapter: {
            vendor: adapter.vendor || "", architecture: adapter.architecture || "",
            device: adapter.device || "", description: adapter.description || "",
        },
        ua,
        cfg: { n: run.n, span: run.span, rho: run.rho, nR: run.nR, nT: run.nT },
        proposedBy: run.proposedBy,
        tol, floor,
        adjudication: {
            accepted: run.verdict.accepted, checked: run.verdict.checked,
            disagreed: run.verdict.disagreed, worstRelDiff: run.verdict.worstRelDiff,
            worstIndex: run.verdict.worstIndex,
        },
        // full-grid worst error is filled by the page (it walks all n*n cells against the f64 reference);
        // the adjudication above is the 34-cell provenance sample. Both are recorded; the FULL one is graded.
        fullGrid: null,
        gradedPeak: { peakErrFrac: run.graded.peakErrFrac, source: run.graded.source },
        fellBack: run.fellBack,
    };
}

/** The reader. Returns { verdict, why } in androidVerdict's four-word vocabulary. */
export function gradeMagmapReport(report, { tol } = {}) {
    if (!report) return { verdict: "AWAITING",
        why: "browser-side -- needs magmap-android.html run in Chrome-for-Android, report saved and passed to the verdict" };
    if (report.kind !== MAGMAP_REPORT_KIND) return { verdict: "EXCLUDED", why: "not a " + MAGMAP_REPORT_KIND };

    const T = tol ?? report.tol;
    if (report.proposedBy !== "gpu") return { verdict: "EXCLUDED",
        why: "report was produced by " + report.proposedBy + " -- the emulator proves the harness, not the hardware" };
    if (!isMobileAdapter(report.adapter)) return { verdict: "EXCLUDED",
        why: "adapter '" + (report.adapter.vendor || "?") + " / " + (report.adapter.architecture || "?") +
             "' is not a mobile GPU -- a desktop card passing confirms nothing item 3 asked" };

    // FULL-GRID TRUST, v2927. The graded number is the full-grid worst error; the 34-cell adjudication is only a
    // provenance sample. Two ways a real phone report can present a BROKEN full grid that earlier code waved
    // through by silently falling back to the sample (both found by adversarial probing before any hardware ran):
    //   (a) fullGrid present but worstRelDiff null/NaN -- the walk started and did not produce a number;
    //   (b) fullGrid.cells != n*n -- the walk covered only part of the grid (crash, timeout, early return).
    // In both cases the report CLAIMS a full-grid pass it did not earn. Falling back to the sample would CONFIRM
    // a phone on 34 cells while pretending to have checked 441, which is exactly the "passes because the
    // experiment did not run" failure the whole magmap apparatus exists to refuse. So a malformed full grid is
    // EXCLUDED, not quietly downgraded.
    let worst, scope;
    if (report.fullGrid) {
        const fg = report.fullGrid;
        const expected = (report.cfg && report.cfg.n) ? report.cfg.n * report.cfg.n : null;
        if (!Number.isFinite(fg.worstRelDiff)) return { verdict: "EXCLUDED",
            why: "report carries a fullGrid with no finite worstRelDiff -- the full-grid walk did not complete, " +
                 "and grading the 34-cell provenance sample instead would confirm the phone on a fraction of the grid" };
        if (expected != null && Number.isFinite(fg.cells) && fg.cells !== expected) return { verdict: "EXCLUDED",
            why: "fullGrid covered " + fg.cells + " cells but the config is n=" + report.cfg.n + " (" + expected +
                 " cells) -- a truncated walk cannot be graded as full-grid, and the sample is not a substitute" };
        worst = fg.worstRelDiff; scope = "full-grid";
    } else {
        worst = report.adjudication.worstRelDiff; scope = "sampled";
    }
    if (!Number.isFinite(worst)) return { verdict: "EXCLUDED", why: "no finite worst error in report" };

    const fam = gpuFamily(report.adapter);
    if (worst <= T && report.adjudication.accepted) {
        return { verdict: "CONFIRMED",
            why: fam.family + " GPU '" + report.adapter.vendor + (report.adapter.architecture ? " / " + report.adapter.architecture : "") +
                 "' lands " + scope + " worst " + worst.toExponential(2) + " under tol " + T.toExponential(0) +
                 " -- a tolerance set from the emulated floor before this vendor existed. The kernel gains " +
                 (fam.family === "Apple" ? "a third vendor family (" + fam.arch + ")" : "its second vendor") };
    }
    return { verdict: "FALSIFIED",
        why: scope + " worst " + worst.toExponential(2) + " exceeds the registered tol " + T.toExponential(0) +
             " on " + fam.family + " '" + report.adapter.vendor + "' -- and per v2903 the tolerance does NOT move; the finding is the finding" };
}
