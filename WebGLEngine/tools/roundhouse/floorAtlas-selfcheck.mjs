// tools/roundhouse/floorAtlas-selfcheck.mjs — v3284
//
// Run: node tools/roundhouse/floorAtlas-selfcheck.mjs   (~1s — MEASURED; pure folding, no physics)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// The atlas has one job that is easy to get subtly wrong: aggregating measurements that must NOT be aggregated.
// A float gap from the leapfrog kernel and an integer count of differing spins from the zero-tolerance Ising
// kernel are both "the worst thing this adapter did", and pooling them would produce a number with no meaning
// that would look entirely reasonable in a table. The gate spends most of its checks on that boundary.
//
// The reports folded here are SYNTHETIC and say so. No real device has submitted to this atlas yet, and the
// gate proves the machinery rather than any claim about silicon -- the empty-atlas case is checked explicitly
// so the honest "nothing measured yet" state is a tested state and not an accident.

import { foldReport, gradeAtlas, atlasLines, adapterKey, KERNEL_SPECS, TIGHT_MARGIN } from "./floorAtlas.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 0. THE HONEST EMPTY STATE ------------------------------------------------------------------------------------
{
    const g = gradeAtlas({ kind: "swek-floor-atlas", entries: {} });
    ok("an atlas with no device reports grades cleanly and SAYS it is empty",
       g.rows === 0 && g.adapters === 0 && atlasLines(g).some((l) => l.includes("awaits real silicon")),
       atlasLines(g).join(" | "));
}

// ---- 1. FOLDING, and the worst-ever rule --------------------------------------------------------------------------
let atlas = null;
{
    // same adapter, same kernel, three runs -- the atlas must keep the WORST, not the latest and not the median
    atlas = foldReport(atlas, { kind: "swek-hmc-bench", at: "2026-08-01T00:00:00Z", version: 3284,
        adapter: { vendor: "acme", architecture: "gpu-1" }, worst: 1.0e-5, tol: 5e-5 });
    atlas = foldReport(atlas, { kind: "swek-hmc-bench", at: "2026-08-01T01:00:00Z", version: 3284,
        adapter: { vendor: "acme", architecture: "gpu-1" }, worst: 4.1e-5, tol: 5e-5 });
    atlas = foldReport(atlas, { kind: "swek-hmc-bench", at: "2026-08-01T02:00:00Z", version: 3284,
        adapter: { vendor: "acme", architecture: "gpu-1" }, worst: 2.0e-5, tol: 5e-5 });
    const e = atlas.entries["hmc-leapfrog :: acme/gpu-1"];
    ok("!! three runs fold to ONE entry holding the WORST gap ever seen, not the latest and not the median",
       e.runs === 3 && e.worst === 4.1e-5 && e.latest === 2.0e-5,
       "worst " + e.worst.toExponential(2) + " (latest " + e.latest.toExponential(2) +
       ") over " + e.runs + " runs — a tolerance has to cover the bad day, and the median would have hidden it");
}

// ---- 2. THE RULE THAT MATTERS: float gaps and exact counts are NEVER POOLED ---------------------------------------
{
    atlas = foldReport(atlas, { kind: "swek-ising-bench", at: "2026-08-01T03:00:00Z", version: 3284,
        adapter: { vendor: "acme", architecture: "gpu-1" }, spinsDiffer: 0, L: 64, sweeps: 400 });
    const fl = atlas.entries["hmc-leapfrog :: acme/gpu-1"], ex = atlas.entries["ising-checkerboard :: acme/gpu-1"];
    ok("!! the SAME adapter carries two entries with different metrics — they are never merged into one number",
       fl.metric === "float-gap" && ex.metric === "exact-count" && fl.adapter === ex.adapter,
       "one adapter, two kernels: " + fl.metric + " (" + fl.worst.toExponential(2) + ") and " +
       ex.metric + " (" + ex.worst + ") — the average of these two would look perfectly reasonable and mean nothing");
    const g = gradeAtlas(atlas);
    ok("!! grading gives the exact-count kernel NO margin, because 0-or-rejected has no margin to give",
       g.exact.length === 1 && g.exact[0].margin === null && g.exact[0].worst === 0,
       g.exact[0].note);
}

// ---- 3. MARGIN GRADING on the float kernels ----------------------------------------------------------------------
{
    // comfortable: gap far under tolerance
    atlas = foldReport(atlas, { kind: "swek-hmc-bench", adapter: { vendor: "bolt", architecture: "gpu-9" },
        worst: 3.0e-6, tol: 5e-5, version: 3284 });
    // tight: holding, but with less headroom than the reference box earned
    atlas = foldReport(atlas, { kind: "swek-magmap-bench", adapter: { vendor: "cinder", architecture: "gpu-3" },
        results: [{ worstRelDiff: 1.0e-4 }, { worstRelDiff: 3.4e-4 }], tol: 5e-4, version: 3284 });
    // failing: gap exceeds tolerance outright
    atlas = foldReport(atlas, { kind: "swek-magmap-bench", adapter: { vendor: "dross", architecture: "gpu-0" },
        results: [{ worstRelDiff: 9.0e-4 }], tol: 5e-4, version: 3284 });
    const g = gradeAtlas(atlas);
    const comfy = g.comfortable.find((e) => e.adapter === "bolt/gpu-9");
    const tight = g.tight.find((e) => e.adapter === "cinder/gpu-3");
    const bad = g.failures.find((e) => e.adapter === "dross/gpu-0");
    ok("!! a comfortable adapter, a TIGHT one, and a FAILING one are separated by measured margin alone",
       comfy && tight && bad && comfy.margin > TIGHT_MARGIN && tight.margin >= 1 && tight.margin < TIGHT_MARGIN && bad.margin < 1,
       "bolt " + comfy.margin.toFixed(1) + "x, cinder " + tight.margin.toFixed(2) + "x, dross " + bad.margin.toFixed(2) +
       "x — 'tolerance with 2x margin' stops being a policy and becomes a per-vendor number");
    ok("...and magmap's floor is the worst across ALL its variants, not the first one reported",
       tight.worst === 3.4e-4, "worst variant gap " + tight.worst.toExponential(2) + " of two reported");
    ok("failures sort first by severity, so the worst adapter is never buried",
       g.failures.length === 1 && g.failures[0].adapter === "dross/gpu-0" && atlasLines(g)[1].includes("FAILING"),
       atlasLines(g).find((l) => l.includes("FAILING")));
}

// ---- 4. UNKNOWN KINDS ARE REPORTED, NEVER SILENTLY DROPPED --------------------------------------------------------
{
    const a2 = foldReport(atlas, { kind: "swek-some-future-bench", adapter: { vendor: "acme" }, worst: 1e-5 });
    ok("!! a kernel with no floor spec lands in `skipped` WITH a reason (a kernel submitting into a void is the failure mode)",
       a2.skipped.some((s) => s.kind === "swek-some-future-bench"),
       a2.skipped.map((s) => s.kind + ": " + s.why).join("; "));
    const a3 = foldReport(atlas, { kind: "swek-hmc-bench", adapter: { vendor: "acme" } });   // no worst field
    ok("...and so does a report of a KNOWN kind that carried no floor measurement",
       a3.skipped.some((s) => s.why.includes("no floor measurement")));
}

// ---- 5. adapter identity ------------------------------------------------------------------------------------------
{
    ok("adapters missing an architecture still get a stable key rather than colliding on 'undefined'",
       adapterKey({ adapter: { vendor: "acme" } }) === "acme" &&
       adapterKey({}) === "unknown" &&
       adapterKey({ adapter: { vendor: "acme", architecture: "gpu-1" } }) === "acme/gpu-1");
    ok("every declared kernel spec can read a floor and a tolerance out of its own report shape",
       Object.values(KERNEL_SPECS).every((s) => typeof s.floorOf === "function" && typeof s.tolOf === "function" &&
           ["float-gap", "exact-count"].includes(s.metric)),
       Object.entries(KERNEL_SPECS).map(([k, v]) => v.kernel + "=" + v.metric).join(", "));
}

// ---- 6. purity --------------------------------------------------------------------------------------------------
{
    const before = JSON.stringify(atlas);
    foldReport(atlas, { kind: "swek-hmc-bench", adapter: { vendor: "zzz" }, worst: 1e-9, tol: 5e-5 });
    ok("foldReport never mutates the atlas it was handed (the caller owns persistence)",
       JSON.stringify(atlas) === before);
}

// ---- 7. v3285 -- THE ATLAS IS FED, WHICH IS THE HALF v3284 FORGOT -----------------------------------------------
// The atlas shipped with a gate, a page, and NO FEEDER: foldReport was called only by floor-atlas.html, so real
// device measurements would have sat in submission files while the atlas stayed empty. That is precisely the
// v2973 perf-ledger defect ("nothing ever called perfLedger.fold") committed again, one round after a changelog
// criticising decorative modules. These checks read the SHIPPING submit path, not this module.
{
    const fs = await import("node:fs");
    const src = fs.readFileSync(new URL("../../ai-bridge/androidPeerBridge.js", import.meta.url), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    ok("!! the submit path IMPORTS floorAtlas and folds on arrival (a module with no caller is a claim, not a capability)",
       /import\(\s*["']\.\.\/tools\/roundhouse\/floorAtlas\.mjs["']\s*\)/.test(code) && /foldReport\(/.test(code));
    ok("!! ...and it persists the folded atlas rather than computing it and dropping it",
       /floor-atlas\.json/.test(code) && /writeFileSync\([\s\S]{0,80}?JSON\.stringify\(next/.test(code));
    ok("!! ...and only kinds with a declared floor spec are folded (an unknown kind is recorded, never invented)",
       /KERNEL_SPECS\[j\.kind\]/.test(code));
    ok("the device is told what its submission did to the fleet grading",
       /atlas:\s*atlasNote/.test(code),
       "a submission that silently changes a fleet-wide grading is a thing to find out about now, not next month");
}

console.log(fails ? ("[floorAtlas-selfcheck] FAILED " + fails) : "[floorAtlas-selfcheck] all passed");
process.exit(fails ? 1 : 0);
