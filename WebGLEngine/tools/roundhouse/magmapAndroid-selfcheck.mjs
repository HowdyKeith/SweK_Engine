// tools/roundhouse/magmapAndroid-selfcheck.mjs
//
// Run: node tools/roundhouse/magmapAndroid-selfcheck.mjs   (~30 s: import-graph walk + one emulated full run)
//
// v2921 -- THE EXPERIMENT IS GATED BEFORE THE PHONE OPENS IT. Four things can silently rot a browser experiment
// between the desk and the device, and each gets a check:
//
//   1. A node: import creeping into the kernel's module graph -- the page would 404 on the phone. The gate walks
//      the graph from magmapGpu.mjs recursively and fails on any non-relative specifier.
//   2. The page embedding its own COPY of the WGSL -- two kernels drift, the gated one and the shipped one. The
//      gate greps the page: it must import magmapGpu.mjs and must NOT contain a compute shader of its own.
//   3. The harness lying about headroom -- if a CORRECT f32 kernel no longer fits under MAGMAP_TOL, the phone
//      would fail for reasons that are not the phone's. The emulator (f32-on-CPU, the same one that set the
//      floor in v2903) reruns the FULL pipeline including the page's full-grid walk, and must land in the
//      window (floor/2, tol).
//   4. The grader accepting the wrong things -- a desktop card, an emulator run, a schema stranger. Synthetic
//      reports drive every branch, including the one where the phone LOSES and the tolerance stays put.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { magmapRun, magmapEmulated, adjudicate, MAGMAP_TOL, F32_FLOOR } from "./magmapGpu.mjs";
import { sampleTable, referenceCell } from "./magmapKernel.mjs";
import { makeMagmapReport, gradeMagmapReport, isMobileAdapter, MAGMAP_REPORT_KIND } from "./magmapReport.mjs";
import { grade } from "./androidVerdict.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THE MODULE GRAPH IS BROWSER-SAFE, RECURSIVELY --------------------------------------------------------------
{
    const seen = new Set(), bad = [];
    const walk = (file) => {
        const abs = path.resolve(file);
        if (seen.has(abs)) return; seen.add(abs);
        const src = fs.readFileSync(abs, "utf8");
        for (const m of src.matchAll(/^\s*import\s[^"'(]*["']([^"']+)["']/gm)) {
            const spec = m[1];
            if (spec.startsWith("./") || spec.startsWith("../")) walk(path.resolve(path.dirname(abs), spec));
            else bad.push({ file: path.relative(ROOT, abs), spec });
        }
    };
    walk(path.join(HERE, "magmapGpu.mjs"));
    walk(path.join(HERE, "magmapReport.mjs"));
    ok("!! every module the page reaches is a relative import -- no node:, no bare specifiers",
        bad.length === 0,
        bad.length ? bad.map((b) => b.file + " -> " + b.spec).join("; ")
            : seen.size + " modules walked from magmapGpu.mjs + magmapReport.mjs; a phone's browser can load all of them");
}

// ---- 2. THE PAGE USES THE GATED KERNEL, NOT A COPY -----------------------------------------------------------------
{
    const pagePath = path.join(ROOT, "magmap-android.html");
    const page = fs.existsSync(pagePath) ? fs.readFileSync(pagePath, "utf8") : "";
    ok("magmap-android.html exists at the engine root", page.length > 0, pagePath);
    ok("!! the page IMPORTS the WGSL and does not embed a copy",
        /from\s+["']\.\/tools\/roundhouse\/magmapGpu\.mjs["']/.test(page) && !/@compute/.test(page),
        "one kernel, gated in magmapGpu.mjs; the page carrying its own @compute shader would be the drift this file exists to prevent");
    ok("...and imports the shared report schema, so writer and grader cannot disagree",
        /magmapReport\.mjs/.test(page));
}

// ---- 3. THE POSITIVE CONTROL: A CORRECT f32 KERNEL STILL HAS HEADROOM ----------------------------------------------
{
    const run = await magmapRun({});   // no device -> emulator proposes, CPU adjudicates, CPU grades
    ok("the emulated pipeline is ACCEPTED by its own adjudication",
        run.proposedBy === "cpu-f32-emulator" && run.verdict.accepted,
        "sampled worst " + run.verdict.worstRelDiff.toExponential(2) + " on " + run.verdict.checked + " cells");

    // the page's full-grid walk, reproduced exactly
    const { n, span, rho, nR, nT } = run;
    const table = sampleTable(nT);
    const raw = run.map.value;
    let worst = 0;
    for (let k = 0; k < n * n; k++) {
        const cpu = referenceCell(k, { n, span, rho, table, nR });
        worst = Math.max(worst, Math.abs(raw[k] - cpu) / Math.max(Math.abs(cpu), 1e-300));
    }
    ok("!! full-grid worst error of a CORRECT f32 kernel sits in (floor/2, tol) -- the phone has real headroom",
        worst > F32_FLOOR / 2 && worst < MAGMAP_TOL,
        "full-grid worst " + worst.toExponential(3) + " vs floor " + F32_FLOOR + " and tol " + MAGMAP_TOL +
        " -- if this window ever closes, the phone would fail for reasons that are not the phone's, and THIS gate fails first");
}

// ---- 4. THE GRADER, EVERY BRANCH, BOTH DIRECTIONS ------------------------------------------------------------------
{
    const emu = await magmapRun({});
    const mk = (adapter, patch = {}) => {
        const r = makeMagmapReport({ adapter, ua: "synthetic", run: emu, tol: MAGMAP_TOL, floor: F32_FLOOR });
        r.proposedBy = "gpu";   // synthetic: pretend the numbers came from hardware
        r.fullGrid = { worstRelDiff: 5e-6, worstIndex: 220, cells: 441 };
        return Object.assign(r, patch);
    };

    let v = gradeMagmapReport(mk({ vendor: "qualcomm", architecture: "adreno-7xx" }));
    ok("!! an Adreno under tolerance is CONFIRMED, and the why names the margin",
        v.verdict === "CONFIRMED" && /adreno/i.test(v.why), v.why);

    v = gradeMagmapReport(mk({ vendor: "arm", architecture: "valhall" },
        { fullGrid: { worstRelDiff: 3e-4, worstIndex: 220, cells: 441 } }));
    ok("!! a Mali OVER tolerance is FALSIFIED with the number, and the tolerance does not move",
        v.verdict === "FALSIFIED" && /3\.00e-4/.test(v.why) && /does NOT move/.test(v.why),
        "v2903's rule survives contact with a disappointing phone: widen-until-green is the one move this grader cannot make");

    v = gradeMagmapReport(mk({ vendor: "nvidia", architecture: "ampere" }));
    ok("!! the desktop card is EXCLUDED however green -- item 3 asked for a SECOND vendor",
        v.verdict === "EXCLUDED" && /not a mobile GPU/.test(v.why));

    const emuReport = makeMagmapReport({ adapter: { vendor: "qualcomm" }, ua: "x", run: emu, tol: MAGMAP_TOL, floor: F32_FLOOR });
    v = gradeMagmapReport(emuReport);
    ok("the emulator cannot impersonate hardware -- proposedBy is checked",
        v.verdict === "EXCLUDED" && /emulator/.test(v.why),
        "same rule as v2903's adapter tag: a harness that could pass as a GPU would make every green light meaningless");

    ok("no report at all stays AWAITING, wording unchanged from v2920",
        gradeMagmapReport(null).verdict === "AWAITING");
    ok("vendor matching is anchored -- 'arm' matches, 'smarmy-gpu-co' does not",
        isMobileAdapter({ vendor: "arm" }) && !isMobileAdapter({ vendor: "smarmy-gpu-co" }));

    // ---- v2927: a BROKEN full grid must not be graded on the sample instead --------------------------------------
    // Found by adversarial probing during review, before any hardware ran. The graded number is the full-grid
    // worst error; the 34-cell adjudication is only a provenance sample. Two malformed-fullGrid shapes used to
    // fall through to the sample and CONFIRM a phone that never completed the full walk -- the exact "passes
    // because the experiment did not finish" failure this apparatus refuses everywhere else.
    const adreno = { vendor: "qualcomm", architecture: "adreno-7xx" };
    const okCfg = { kind: MAGMAP_REPORT_KIND, proposedBy: "gpu", tol: 1e-5, cfg: { n: 21 },
        adjudication: { accepted: true, worstRelDiff: 4e-6, checked: 34 }, graded: { peakErrFrac: 1e-7 }, adapter: adreno };
    {
        const nullGrid = gradeMagmapReport({ ...okCfg, fullGrid: { worstRelDiff: null, cells: 441 } });
        ok("!! a fullGrid whose worst error is null is EXCLUDED, not silently graded on the 34-cell sample",
            nullGrid.verdict === "EXCLUDED" && /did not complete/.test(nullGrid.why),
            nullGrid.why);
        const truncated = gradeMagmapReport({ ...okCfg, fullGrid: { worstRelDiff: 5e-6, cells: 200 } });
        ok("!! a truncated walk (200 of 441 cells) is EXCLUDED -- a partial grid is not a full grid",
            truncated.verdict === "EXCLUDED" && /truncated walk|200/.test(truncated.why),
            truncated.why);
        // and the correct shapes still route correctly, so the guard did not over-reject
        ok("...while a complete full grid still CONFIRMs or FALSIFIEs on its own number",
            gradeMagmapReport({ ...okCfg, fullGrid: { worstRelDiff: 5e-6, cells: 441 } }).verdict === "CONFIRMED" &&
            gradeMagmapReport({ ...okCfg, fullGrid: { worstRelDiff: 5e-4, cells: 441 } }).verdict === "FALSIFIED",
            "441-cell grids under and over tol route as before");
    }

    // ---- integration: the verdict CLI path, end to end -------------------------------------------------------------
    const T = (host) => ({ kind: "swek-android-transcript", version: 2920, budgetMs: 1, host, probes: null,
        checks: [{ name: "a", status: "pass", ms: 1, exitCode: 0, tail: "" }], counts: {} });
    const full = grade(T({ libc: "glibc 2.39" }), T({ libc: "bionic (termux)", platform: "android", arch: "arm64", node: "v22" }),
        { magmapReport: mk({ vendor: "qualcomm", architecture: "adreno-7xx" }) });
    ok("!! grade(ref, phone, {magmapReport}) flips item 3 from AWAITING to a real verdict",
        full.verdicts.magmapPassesOnMobileGpuAtRegisteredTol.verdict === "CONFIRMED",
        "and with no extras the v2920 behaviour is unchanged: " +
        grade(T({ libc: "glibc 2.39" }), T({ libc: "bionic (termux)" })).verdicts.magmapPassesOnMobileGpuAtRegisteredTol.verdict);
    ok("the schema kind is pinned", emuReport.kind === MAGMAP_REPORT_KIND);
}

console.log("");
console.log(fails === 0 ? "  ALL PASS -- the experiment is gated; the phone's GPU can now audition" : "  " + fails + " FAILURE(S)");
process.exit(fails ? 1 : 0);
