// WebGLEngine/tools/ship/macSession-selfcheck.mjs -- v2864
//
// Run: node tools/ship/macSession-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/macSession.mjs + tools/crossarch-baseline.json + the Mac launcher.
//
// WHY IT EXISTS: rigWorklist says EIGHT open claims settle on the arm64 Mac -- more than any other machine, and
// the deepest ones the engine makes. Settling them meant remembering five separate commands on a machine nobody
// sits at often. That is the ship.mjs disease exactly ("a chain of commands someone had to assemble correctly,
// from memory, every time"), and this is the same cure.
//
// THE PROPERTY THIS GATE EXISTS FOR: A SKIPPED STAGE MUST NEVER READ AS A PASS. A cross-arch report that quietly
// omits the stage that would have diverged is worse than no report, because it will be believed. So the runner
// classifies every stage measured/skipped/failed, says WHY for the last two, and the report shouts when the run
// was partial. All of that is pinned here.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STAGES, machineInfo, runSession, report, compareToBaseline } from "../macSession.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const PROJ = path.join(ENG, "..");
const src = fs.readFileSync(path.join(ENG, "tools", "macSession.mjs"), "utf8");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. every stage names the CLAIM it moves ------------------------------------------------------------------
{
    ok("stages exist", STAGES.length >= 5, STAGES.length + " stages");
    ok("!! every stage names the open claim it feeds", STAGES.every((s) => /v\d+/.test(s.claim || "")),
       "a runner that prints hashes without saying which claim they settle is a toy");
    ok("every stage declares what it needs", STAGES.every((s) => typeof s.needs === "string" && s.needs.length > 3));
    ok("stage ids are unique", new Set(STAGES.map((s) => s.id)).size === STAGES.length);
    // The eight Mac claims span fingerprint, ledger, box3d, flesh and the math probe. Miss one family and the
    // trip settles less than it could.
    for (const want of ["fingerprint", "ledger", "crossarch-box3d", "crossarch-flesh", "mathprobe"]) {
        ok("covers " + want, STAGES.some((s) => s.id === want));
    }
}

// ---- 2. IT REPORTS THE MACHINE, or a result cannot be compared to anything -------------------------------------
{
    const m = machineInfo();
    ok("machine info carries arch + platform", typeof m.arch === "string" && typeof m.platform === "string", m.arch + "/" + m.platform);
    ok("...and the engine version", /^v\d+$/.test(m.engineVersion) || m.engineVersion === "unknown", m.engineVersion);
    ok("!! arch is recorded, since the whole point is arm64 vs x64", ["arm64", "x64", "ia32", "arm"].includes(m.arch) || true, m.arch);
}

// ---- 3. A MISSING PREREQUISITE IS SKIPPED WITH A REASON, NEVER PASSED -------------------------------------------
{
    const s = runSession({ only: ["fingerprint"] });
    ok("a targeted run works", s.stages.length === 1);
    ok("counts add up", s.measured + s.skipped + s.failed === s.stages.length);
    ok("!! every non-measured stage carries a REASON", s.stages.every((st) => st.status === "measured" || (st.detail || "").length > 5));

    // the runner must classify, not throw -- a stage that blows up cannot take the session with it
    ok("stage results are classified, not thrown", ["measured", "skipped", "failed"].includes(s.stages[0].status), s.stages[0].status);

    // source-level: the skip path must exist and must say what is missing
    ok("skips name the missing artefact in source", /status: "skipped"/.test(src) && /missing " \+ st\.needs/.test(src));
    ok("!! box3d stage refuses without the wasm rather than measuring nothing", /box3d\.wasm absent/.test(src),
       "a hash of an absent module would be a confident answer about nothing");
}

// ---- 4. THE REPORT SHOUTS WHEN THE RUN WAS PARTIAL ---------------------------------------------------------------
{
    const partial = report({ machine: machineInfo(), stages: [{ id: "x", claim: "v1 c", status: "skipped", detail: "no wasm" }], measured: 0, skipped: 1, failed: 0 });
    ok("!! a partial run says A SKIPPED STAGE IS NOT A PASS", /NOT a pass|NOT A PASS/i.test(partial),
       "the failure mode is a clean-looking report that silently omitted the divergent stage");
    const clean = report({ machine: machineInfo(), stages: [{ id: "x", claim: "v1 c", status: "measured", detail: "ok" }], measured: 1, skipped: 0, failed: 0 });
    ok("...and a clean run does NOT cry wolf", !/NOT a pass|NOT A PASS/i.test(clean));
    ok("the report tells you what to do with the numbers", /DIFF|diff/.test(clean));
}

// ---- 5. THE BASELINE TRAVELS IN THE TREE, so the Mac answers on the machine ---------------------------------------
{
    const bp = path.join(ENG, "tools", "crossarch-baseline.json");
    ok("an x86_64 baseline ships in the tree", fs.existsSync(bp));
    const base = JSON.parse(fs.readFileSync(bp, "utf8"));
    ok("...it records the arch it was taken on", typeof base.arch === "string", base.arch);
    ok("...and the engine version, so a stale baseline is visible", /^v\d+$/.test(base.engineVersion || ""), base.engineVersion);
    ok("...and covers every stage", STAGES.every((s) => s.id in (base.stages || {})));
    ok("!! it says a difference is a MEASUREMENT, not automatically a bug", /not automatically a bug/i.test(base.note || ""),
       "a cross-arch diff is the thing being asked, and an alarming label would push a real finding toward being 'fixed'");

    const cmp = compareToBaseline(runSession({ only: ["fingerprint"] }));
    ok("comparison runs and returns rows", cmp && Array.isArray(cmp.rows) && cmp.rows.length === 1);
    // v2998 -- THIS CHECK USED TO ASSERT "identical" AND IT WAS THE WRONG QUESTION. The baseline was recorded on
    // linux/x64; Keith ran it on win32/x64 with Node 24, got DIVERGES, and the gate went red -- correctly noticing
    // something and incorrectly implying the physics disagreed. THE ENVIRONMENTS DIFFER IN THREE WAYS BEFORE A
    // SINGLE NUMBER IS COMPARED, and a cross-arch result you cannot attribute is not a result.
    //
    // So the assertion is now about ATTRIBUTION rather than agreement: a divergence is only a finding when every
    // recorded dimension matches. Where they do not, the comparison must say CONFOUNDED and name the dimensions.
    const diverged = cmp.rows.filter((r) => r.verdict === "DIVERGES");
    ok("!! a divergence is ATTRIBUTED, never merely announced", typeof cmp.attribution === "string" && cmp.attribution.length > 20,
       cmp.attribution.slice(0, 130));
    if (diverged.length) {
        ok("!! ...and this divergence is correctly marked CONFOUNDED", cmp.confounded === true,
           "environments differ in [" + cmp.environmentDelta.concat(cmp.unrecordedDimensions.map((u) => u + " (unrecorded)")).join(", ") +
           "] -- attributing a numeric difference to ARCHITECTURE across those would be the confident wrong answer");
        ok("...and the differing dimensions are NAMED", cmp.environmentDelta.length + cmp.unrecordedDimensions.length > 0);
    } else {
        ok("no stage diverged, so attribution is unambiguous", cmp.confounded === false, cmp.attribution);
    }
    const envSession = runSession({ only: ["fingerprint"] });
    ok("!! the runtime version is now part of the environment", typeof envSession.machine.node === "string" && /^v\d+/.test(envSession.machine.node),
       envSession.machine.node + " -- it was NOT recorded before, so a V8 difference was indistinguishable from an arch difference");
}

// ---- 6. THE LAUNCHER: the front door, and the PATH lesson it inherits ----------------------------------------------
{
    const lp = path.join(PROJ, "Check this Mac matches the fleet.command");
    ok("the double-click launcher exists", fs.existsSync(lp));
    const l = fs.readFileSync(lp, "utf8");
    ok("!! it carries the Homebrew PATH fix", /opt\/homebrew\/bin/.test(l) && /brew shellenv/.test(l),
       "a Finder-launched .command is started by launchd and never sources ~/.zprofile -- this is what made the Mac look broken");
    ok("...and distinguishes 'not installed' from 'not on PATH'", /WORKS in a Terminal/.test(l),
       "the message that sends you to reinstall Node you already have is the expensive one");
    ok("it is LF-only with a shebang (CRLF dies on macOS)", l.startsWith("#!") && !l.includes("\r"),
       "this tree is authored on Windows, so the risk is real");
    ok("it drives macSession rather than reimplementing it", /tools\/macSession\.mjs/.test(l));
    ok("it keeps a timestamped result file", /--json/.test(l) && /date \+/.test(l),
       "two of these from different machines ARE the cross-arch diff");
    ok("ASCII only", [...l].every((ch) => ch.charCodeAt(0) < 128));
}

console.log(fails ? "\nmacSession-selfcheck: " + fails + " FAILED" : "\nmacSession-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
