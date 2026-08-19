// WebGLEngine/tools/ship/qaAssert-selfcheck.mjs -- v2866
//
// Run: node tools/ship/qaAssert-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES the render-QA `assert` mechanism + the voxel-viewer mesher hook it was built for.
//
// WHY IT EXISTS: eleven of the 28 open claims settle by "Keith loads the page and looks". Some of those genuinely
// need eyes -- whether a render looks right is not a boolean. But several have a fact THE PAGE CAN STATE ABOUT
// ITSELF, and those do not need a human, they need someone to ask. v2579 is the clearest: ?mesher=greedy must
// actually run the greedy mesher, and the danger the claim names is a SILENT FALLBACK that "renders the old mesh
// and reports the new one".
//
// THE DESIGN DECISION THIS GATE PROTECTS: `assert` is a SEPARATE THING from `probe`, and probe stays data-only.
// The existing comment is right -- "a number nobody has a threshold for yet is still worth collecting, and a page
// that renders correctly should not fail because a debug hook moved". Turning probes into verdicts would have
// made every exploratory hook load-bearing. So assertions are opt-in, explicit, and named.
//
// AND THE RULE THAT MATTERS MOST: AN ASSERT THAT THROWS IS A FAILURE, NOT A SKIP. A probe tolerates a moved hook
// because it is exploratory; an assert that silently stopped running would be a check not in the gate, which is
// the oldest lesson in this tree.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const qa = fs.readFileSync(path.join(ENG, "tools", "render-qa", "render-qa.mjs"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "render-qa", "manifest.json"), "utf8"));
const pages = manifest.pages || manifest;
const viewer = fs.readFileSync(path.join(ENG, "voxel-viewer.html"), "utf8");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. probe stays data-only; assert is the verdict -----------------------------------------------------------
{
    ok("the probe-is-data rule is still stated", /A probe is DATA, not a verdict/.test(qa));
    ok("!! ...and probe still never flips the verdict", !/probeResult[\s\S]{0,200}rec\.ok = false/.test(qa),
       "turning exploratory hooks into verdicts would make every debug hook load-bearing");
    ok("assert exists and IS a verdict", /if \(pg\.assert\)/.test(qa) && /rec\.ok = false/.test(qa));
    ok("assert pushes a named check row", /type: "assert"/.test(qa));
}

// ---- 2. THE THREE RULES ------------------------------------------------------------------------------------------
{
    ok("!! rule 1: an assert that THROWS fails, it does not skip", /assert THREW/.test(qa),
       "a renamed hook must break the run loudly, or the check silently stops running");
    ok("rule 2: the claim is carried into the result", /rec\.assertClaim/.test(qa));
    ok("...and into the failure message", /claim: " \+ \(a\.claim/.test(qa));
    ok("!! rule 3: absent assert means unchanged behaviour", /if \(pg\.assert\) \{/.test(qa),
       "no existing page becomes newly failable by adding this mechanism");
}

// ---- 3. the wired assertion is real and points at a real hook ------------------------------------------------------
{
    const withAssert = pages.filter((p) => p.assert);
    ok("at least one page carries an assert", withAssert.length >= 1, withAssert.length + " page(s)");
    for (const p of withAssert) {
        ok("assert on " + p.name + " names a claim", /v\d+/.test(p.assert.claim || ""), p.assert.claim);
        ok("...and gives a reason", (p.assert.why || "").length > 20);
        ok("...and has an expression", (p.assert.expr || "").length > 10);
    }
    const greedy = pages.find((p) => p.name === "voxel-viewer-greedy");
    ok("the greedy-mesher page is registered", !!greedy);
    ok("...pointed at the flag it tests", /mesher=greedy/.test(greedy.url));
    ok("!! ...and asserts REQUESTED === USED, not merely that a mesher ran",
       /requested === 'greedy'/.test(greedy.assert.expr) && /used === 'greedy'/.test(greedy.assert.expr),
       "the failure this claim names is a fallback that reports the new mesher while running the old one");
}

// ---- 4. THE HOOK THE ASSERT DEPENDS ON MUST ACTUALLY EXIST ----------------------------------------------------------
//
// An assertion naming a hook that is not there would fail every run for the wrong reason -- and worse, would look
// like the flag was broken when the harness was.
{
    ok("voxel-viewer exposes __swekMesher", /window\.__swekMesher\s*=/.test(viewer));
    ok("...it records what was REQUESTED", /__swekMesher\.requested\s*=/.test(viewer));
    ok("...and what was USED", /__swekMesher\.used\s*=\s*'greedy'/.test(viewer) && /__swekMesher\.used\s*=\s*'default'/.test(viewer));
    ok("!! the fallback path sets used='default' while requested stays 'greedy'",
       /console\.warn\([\s\S]{0,200}did not load/.test(viewer) && /__swekMesher\.used = 'default'/.test(viewer),
       "that mismatch IS the bug the claim describes, and now it is observable rather than only logged");
    ok("the default path is still the default", /return buildVoxelMesh|buildVoxelMesh\(voxels\)/.test(viewer));
    ok("the page is still a plain script, not a module", !/<script[^>]*type="module"[^>]*>[\s\S]*pickMesher/.test(viewer),
       "the file says converting it would defer every function and silently break every onclick");
}

// ---- 5. the page still parses (engine's own parser, not one written here) ---------------------------------------------
{
    const { execFileSync } = await import("node:child_process");
    let out = "", ranOk = true;
    try {
        out = execFileSync(process.execPath, ["--experimental-vm-modules", "tools/ship/pageParse.mjs"],
                           { cwd: ENG, encoding: "utf8", timeout: 180000, stdio: ["ignore", "pipe", "ignore"] });
    } catch (e) { ranOk = false; out = String((e && e.stdout) || e.message || ""); }
    const m = out.match(/pageParse: (\d+) inline scripts in (\d+) pages parse/);
    ok("every inline script parses", ranOk && !!m, m ? m[1] + " scripts in " + m[2] + " pages" : out.slice(-160).trim());
}

console.log(fails ? "\nqaAssert-selfcheck: " + fails + " FAILED" : "\nqaAssert-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
