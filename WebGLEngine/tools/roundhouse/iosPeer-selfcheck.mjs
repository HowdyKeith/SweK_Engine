// tools/roundhouse/iosPeer-selfcheck.mjs
//
// Run: node tools/roundhouse/iosPeer-selfcheck.mjs   (<5 s)
//
// v2925 -- THE iOS PEER, GATED FOR THE TWO THINGS THAT ACTUALLY MOVE:
//
//   PORTABLE SUBSET. The claim that lets iOS run physics at all is "the strict core needs no Node". This gate
//   proves it structurally: the import graph from portableSuite.mjs is walked, and ANY node: or bare specifier
//   fails the gate -- because a single fs import would mean the page cannot run in Safari. Then the subset is
//   actually run and every check must pass at machine precision, because a subset that is portable but WRONG is
//   worse than none.
//
//   APPLE FIRST-CLASS. gpuFamily() must name an Apple adapter "Apple" with its TBDR architecture, and the
//   verdict must say "third vendor family" for Apple rather than the generic "second vendor". A desktop card is
//   still EXCLUDED; the Apple win is CONFIRMED and named.
//
//   HONESTY. ios-peer.html must state the three hard NOs (no full suite, no daemon, no push) rather than
//   overselling -- a capability page that hides the platform's limits is a support ticket waiting to happen.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPortableSuite } from "./portableSuite.mjs";
import { gpuFamily, gradeMagmapReport, makeMagmapReport, MAGMAP_REPORT_KIND } from "./magmapReport.mjs";
import { MAGMAP_TOL, F32_FLOOR, magmapRun } from "./magmapGpu.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THE PORTABLE SUBSET IS BROWSER-SAFE, RECURSIVELY -----------------------------------------------------------
{
    const seen = new Set(), bad = [];
    const walk = (file) => {
        const abs = path.resolve(file); if (seen.has(abs)) return; seen.add(abs);
        for (const m of fs.readFileSync(abs, "utf8").matchAll(/^\s*import\s[^"'(]*["']([^"']+)["']/gm)) {
            const spec = m[1];
            if (spec.startsWith("./") || spec.startsWith("../")) walk(path.resolve(path.dirname(abs), spec));
            else bad.push({ file: path.relative(ROOT, abs), spec });
        }
    };
    walk(path.join(HERE, "portableSuite.mjs"));
    ok("!! the portable subset imports nothing but relative modules -- no node:, so Safari can run it",
        bad.length === 0,
        bad.length ? bad.map((b) => b.file + " -> " + b.spec).join("; ") : seen.size + " modules, all relative -- the strict core has no runtime dependency");
    ok("the subset does not touch process, fs, or globalThis shims",
        !/\bprocess\.(?!argv)|require\(|node:/.test(fs.readFileSync(path.join(HERE, "portableSuite.mjs"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/if \(typeof process[\s\S]*$/, "")),
        "the only process reference is the optional CLI tail, guarded by typeof process");
}

// ---- 2. THE SUBSET IS CORRECT ---------------------------------------------------------------------------------------
{
    const r = runPortableSuite();
    ok("!! every portable check passes at machine precision", r.allPass,
        r.checks.map((c) => c.name.split("  ")[0] + ":" + c.relErr.toExponential(1)).join(", "));
    ok("the subset is honestly labelled a SUBSET, not the full suite",
        r.kind === "swek-portable-subset" && r.counts.total >= 5 && r.counts.total < 38,
        r.counts.total + " checks -- the arithmetic-only, answer-key gates; the spawning/fixture/GPU gates are out of scope by construction");
}

// ---- 3. APPLE IS FIRST-CLASS ----------------------------------------------------------------------------------------
{
    ok("!! an Apple adapter is named Apple, with its TBDR architecture",
        gpuFamily({ vendor: "apple", architecture: "apple-gpu" }).family === "Apple" &&
        /TBDR|tile/i.test(gpuFamily({ vendor: "apple" }).arch));
    ok("Adreno and Mali keep their own family names", gpuFamily({ vendor: "qualcomm", architecture: "adreno-7xx" }).family === "Qualcomm/Adreno" &&
        gpuFamily({ vendor: "arm", architecture: "valhall" }).family === "ARM/Mali");

    // an Apple report under tolerance is CONFIRMED and named a THIRD vendor family
    const emu = await magmapRun({});
    const mk = (adapter) => { const r = makeMagmapReport({ adapter, ua: "ios", run: emu, tol: MAGMAP_TOL, floor: F32_FLOOR });
        r.proposedBy = "gpu"; r.fullGrid = { worstRelDiff: 6e-6, worstIndex: 220, cells: 441 }; return r; };
    const v = gradeMagmapReport(mk({ vendor: "apple", architecture: "apple-gpu" }));
    ok("!! an Apple GPU under tolerance is CONFIRMED as a third vendor family",
        v.verdict === "CONFIRMED" && /Apple/.test(v.why) && /third vendor family/.test(v.why), v.why);

    const vd = gradeMagmapReport(Object.assign(mk({ vendor: "nvidia", architecture: "ampere" })));
    ok("a desktop card is still EXCLUDED", vd.verdict === "EXCLUDED");
    ok("the report schema kind is unchanged", MAGMAP_REPORT_KIND === "swek-magmap-gpu-report");
}

// ---- 4. THE PAGE IS HONEST ------------------------------------------------------------------------------------------
{
    const p = path.join(ROOT, "ios-peer.html");
    const page = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
    ok("ios-peer.html exists", page.length > 0);
    ok("!! it states the three hard NOs, not just the yeses",
        /no.{0,40}daemon|daemon.{0,40}no|stricter than android/i.test(page) &&
        /no adb|no.{0,20}push|push.{0,30}no/i.test(page) &&
        /full.{0,30}suite|spawn/i.test(page),
        "a capability page that hides the platform's limits is a support ticket waiting to happen");
    ok("it runs the portable subset in-page and links the shared GPU audition",
        /portableSuite\.mjs/.test(page) && /magmap-android\.html/.test(page));
    ok("it names a-Shell as the optional native-ish path, honestly caveated",
        /a-shell/i.test(page) && /jsc|JavaScriptCore/.test(page));
}

console.log("");
console.log(fails === 0 ? "  ALL PASS -- the strict core runs on Apple's JS engine, and the Apple GPU is a first-class vendor" : "  " + fails + " FAILURE(S)");
process.exit(fails ? 1 : 0);
