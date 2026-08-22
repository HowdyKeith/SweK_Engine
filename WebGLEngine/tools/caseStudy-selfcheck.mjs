// tools/caseStudy-selfcheck.mjs
//
// Run: node tools/caseStudy-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The case study is the portfolio artifact, and the one thing a portfolio must not do is overclaim -- so the gate holds
// the page to the same honesty the engine holds its physics to. It must compute the fingerprint live from the real
// module rather than printing a number that could go stale; its subsystem count and gate count must match reality; it
// must link to the working console and lab; and it must state plainly what the results are NOT -- that the Riemann work
// does not prove the Hypothesis, and that the cross-architecture claim is a hardware comparison still to be run, not a
// promise. The sabotage injects an overclaim ("proves the Riemann Hypothesis"), and the gate fails, because a portfolio
// that lies is worse than no portfolio.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeFingerprint } from "./fingerprint/fingerprint.mjs";
import { countGateFiles } from "./ship/staleness.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const dir = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(dir, "..", "case-study.html"), "utf8");

// ---- 1. LIVE fingerprint: the page imports the real compute, not a baked master --------------------------
{
    ok("!! the case study computes the fingerprint live from the real module", html.includes("computeFingerprint") && html.includes("./tools/fingerprint/fingerprint.mjs") && html.includes('id="master"'),
       "the page imports computeFingerprint and fills the master element in the browser -- the headline number is computed on load, so it cannot go stale or be faked.");
}

// ---- 2. ACCURATE COUNTS: the baked subsystem and gate numbers match reality -----------------------------
{
    const { subsystems } = computeFingerprint();
    // v3036 -- this used to walk the tree itself, and it disagreed with staleness.mjs by exactly one file
    // (staleness counted the RUNNER, selfchecks.mjs, as a gate). Two counters, one page, so re-baking the
    // number could only ever satisfy whichever one was consulted last. Import the walker; do not own a copy.
    const gateCount = countGateFiles();
    const subOk = html.includes(">" + subsystems.length + "<");
    const gateOk = html.includes(">" + gateCount + "<");
    // v3922 -- *** WHEN THIS FAILS IT MUST NAME THE ONE COMMAND THAT FIXES IT. *** These numbers are plain text
    // in the markup ON PURPOSE (v3531) and `staleness --fix` re-derives them; v3087 decided just as deliberately
    // that --fix NEVER RUNS DURING A CHECK, so a ritual that auto-fixed before asserting would be a gate that
    // agrees with whatever shipped. That leaves one human step -- and the failure never said what it was. Keith's
    // rig reported "the page shows 50 subsystems and 1108 gates" as a FAILURE, which reads like the page is
    // wrong about the engine rather than three gates behind, and names nothing to do about it. It was stale by
    // exactly the three gates added since the last re-bake, and one command closed it.
    ok("!! the baked subsystem and gate counts match reality", subOk && gateOk,
       (subOk && gateOk
         ? "the page shows " + subsystems.length + " subsystems and " + gateCount + " gates, matching the live engine -- the numbers a reader sees are the numbers that are true."
         : "the page is STALE: the engine has " + subsystems.length + " subsystems and " + gateCount + " gates" +
           (gateOk ? "" : ", and the markup does not carry >" + gateCount + "<") +
           (subOk ? "" : ", and the markup does not carry >" + subsystems.length + "<") +
           ". THE FIX IS ONE COMMAND: node tools/ship/staleness.mjs --fix -- it re-derives these from the tree " +
           "and writes them into the page. Adding a gate makes this red every time, by design: the number is " +
           "plain text so a reader can trust it without running anything."));
}

// ---- 3. REAL LINKS: the page links to the working console and lab ----------------------------------------
{
    ok("!! the page links to the live console and the lab", html.includes("./verify.html") && html.includes("./physics-lab.html"),
       "the call to action opens verify.html and physics-lab.html -- a reader can click straight from the story to the thing proving itself.");
}

// ---- 4. HONEST SCOPE: it states what the results are NOT ------------------------------------------------
{
    const rhHonest = /does not.{0,40}prove.{0,20}(Riemann|Hypothesis)/i.test(html) || /cannot prove the Riemann/i.test(html);
    const archHonest = /hardware comparison/i.test(html) && /cross-architecture/i.test(html);
    ok("!! the page states plainly what the results are not", rhHonest && archHonest,
       "it says the zeta work does not prove the Riemann Hypothesis and that the cross-architecture claim is a hardware comparison still to run -- scope stated, not blurred.");
}

// ---- 5. NO OVERCLAIM: the page makes no false strong claim ----------------------------------------------
{
    const overclaims = [/proves the Riemann Hypothesis/i, /solved the Riemann/i, /proven identical on all (architectures|machines)/i, /guaranteed bug-free/i];
    const bad = overclaims.find((re) => re.test(html));
    ok("!! the page makes no overclaim", !bad,
       "no sentence claims a proof of the Riemann Hypothesis or a cross-architecture identity that has not been earned -- the portfolio is exactly as strong as the evidence, no stronger.");
}

console.log(fails ? "\ncaseStudy-selfcheck: " + fails + " FAILED" : "\ncaseStudy-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
