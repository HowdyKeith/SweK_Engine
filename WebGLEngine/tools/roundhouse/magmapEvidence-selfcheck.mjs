// tools/roundhouse/magmapEvidence-selfcheck.mjs
//
// Run: node tools/roundhouse/magmapEvidence-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2942 -- ITEM 3 IS CLOSED, AND HERE IS THE HARDWARE THAT CLOSED IT.
//
// The magmap kernel needed one real mobile GPU from a SECOND vendor family to reproduce the f64 reference under
// the registered tolerance (1e-5, set from the emulated f32 floor before any real vendor existed). On
// 2026-07-25 a real ARM/Mali Valhall GPU (Android 10, Chrome 150) did it: full-grid 441/441 cells, worst
// 5.09e-6, real f32 work 1.16x above the floor, not a SwiftShader fallback. That report is saved as evidence and
// this gate grades it every run, so the closure is pinned by an actual hardware artifact -- if a future change
// to the grader would no longer CONFIRM this report, item 3 silently re-opens and this fails.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gradeMagmapReport, isMobileAdapter, gpuFamily } from "./magmapReport.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const here = path.dirname(fileURLToPath(import.meta.url));
const report = JSON.parse(fs.readFileSync(path.join(here, "evidence", "magmap-mali-valhall-CONFIRMED.json"), "utf8"));

// ---- 1. THE VERDICT IS CONFIRMED -----------------------------------------------------------------------------------
{
    const v = gradeMagmapReport(report);
    ok("!! the real Mali Valhall report grades CONFIRMED -- item 3's closing evidence",
        v.verdict === "CONFIRMED",
        v.verdict + ": " + v.why.slice(0, 100));
}

// ---- 2. IT IS A SECOND VENDOR FAMILY -------------------------------------------------------------------------------
{
    const fam = gpuFamily(report.adapter);
    ok("!! the adapter is a real mobile GPU from the ARM/Mali family",
        isMobileAdapter(report.adapter) && fam.family === "ARM/Mali",
        "vendor '" + report.adapter.vendor + "', arch '" + report.adapter.architecture + "' -> " + fam.family +
        ". Item 3 asked for a SECOND vendor family beyond the emulated floor; Mali is a real one, distinct from " +
        "Adreno, Apple, PowerVR, Xclipse");
}

// ---- 3. IT PASSED HONESTLY (the v2927 fullGrid trust gates) ---------------------------------------------------------
{
    const n = report.cfg.n;
    ok("!! the grade is on the COMPLETE full grid, not the provenance sample",
        report.fullGrid.cells === n * n && Number.isFinite(report.fullGrid.worstRelDiff),
        "fullGrid covered " + report.fullGrid.cells + " = " + n + "^2 cells with a finite worst error " +
        report.fullGrid.worstRelDiff.toExponential(3) + ", so the v2927 truncated-walk and null-worst guards are " +
        "cleared -- the grade is on the real full-grid worst, not the friendlier 34-cell sample");

    ok("it is a real GPU, not a SwiftShader fallback",
        report.fellBack === false,
        "fellBack=false -- the numbers came off the Mali silicon, not a CPU rasteriser that would be EXCLUDED");
}

// ---- 4. THE MARGIN IS REAL (under tol, above the floor) ------------------------------------------------------------
{
    const worst = report.fullGrid.worstRelDiff, tol = report.tol, floor = report.floor;
    ok("!! it is genuinely under tolerance AND above the f32 floor -- real work, not a floor artifact",
        worst < tol && worst > floor,
        "worst " + worst.toExponential(3) + " is " + (tol / worst).toFixed(2) + "x under the " + tol.toExponential(1) +
        " tolerance and " + (worst / floor).toFixed(2) + "x above the " + floor.toExponential(3) + " f32 floor. Under " +
        "tol means it passes; above the floor means the f32 hardware did real work rather than sitting at the " +
        "numerical floor where any implementation would score zero");
}

// ---- 5. THE CLOSURE IS RECORDED IN THE REGISTRATION ----------------------------------------------------------------
{
    const reg = fs.readFileSync(path.join(here, "androidPeer.mjs"), "utf8");
    ok("the androidPeer registration records the CONFIRMED closure with its evidence",
        /CONFIRMED v2942 on ARM\/Mali Valhall/.test(reg) && /magmap-mali-valhall-CONFIRMED\.json/.test(reg),
        "the frozen registration now points at the evidence file, so the claim and its proof travel together");
}

console.log();
if (fails) { console.log("magmapEvidence-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("magmapEvidence-selfcheck: all checks pass");
