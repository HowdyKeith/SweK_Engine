// WebGLEngine/tools/makeIncremental-selfcheck.mjs — v2631
//
// Run: node tools/makeIncremental-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The producer is only correct if what it emits is what the ENGINE ingests. So this doesn't check the package
// against my own idea of the format -- it feeds the produced package through the RECEIVER's own parseManifest ->
// planUpdate -> applyPlan into a throwaway install root, and checks the bytes land. Producer and consumer, closed loop.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { makeIncremental } from "./makeIncremental.mjs";

const require = createRequire(import.meta.url);
const inc = require("../ai-bridge/incrementalUpdate.js");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// produce a package that writes two real files from this tree and deletes one made-up path
const pkg = makeIncremental({
    toVersion: "v9999", fromVersion: "v0001", note: "selfcheck",
    writes: ["WebGLEngine/tools/makeIncremental.mjs", "WebGLEngine/lan.html"],
    deletes: ["WebGLEngine/__delete_me__.tmp"],
});

// ---- 1. THE RECEIVER RECOGNISES THE PRODUCED PACKAGE -------------------------------------------------------------
{
    const parsed = inc.parseManifest(pkg);
    ok("!! the receiver's parseManifest accepts the produced package", parsed && parsed.ok !== false,
       parsed && parsed.ok !== false ? "type/toVersion/files all pass the receiver's own manifest check -- the producer speaks the receiver's language." : "REJECTED: " + (parsed && parsed.error));
}

// ---- 2. A ROUND-TRIP APPLY LANDS THE RIGHT BYTES -----------------------------------------------------------------
{
    const INSTALL = path.join(os.tmpdir(), "swek-inc-rt-" + process.pid);
    fs.rmSync(INSTALL, { recursive: true, force: true });
    // seed the install with an OLD copy of one target + the file the package will delete
    fs.mkdirSync(path.join(INSTALL, "WebGLEngine", "tools"), { recursive: true });
    fs.writeFileSync(path.join(INSTALL, "WebGLEngine", "lan.html"), "OLD CONTENT");
    fs.writeFileSync(path.join(INSTALL, "WebGLEngine", "__delete_me__.tmp"), "remove me");
    const plan = inc.planUpdate(pkg, "v0001");
    const applied = inc.applyPlan(plan, INSTALL);
    const landed = fs.readFileSync(path.join(INSTALL, "WebGLEngine", "lan.html"), "utf8");
    const original = fs.readFileSync(path.join(ROOT, "WebGLEngine", "lan.html"), "utf8");
    const deleted = !fs.existsSync(path.join(INSTALL, "WebGLEngine", "__delete_me__.tmp"));
    ok("!! a round-trip apply writes the true bytes and honours the delete", landed === original && deleted && applied,
       "lan.html in the install now byte-matches the source (" + (landed === original) + "), __delete_me__.tmp is gone (" + deleted + "). What the producer emitted, the receiver applied, exactly.");
    fs.rmSync(INSTALL, { recursive: true, force: true });
}

// ---- 3. A STALE PACKAGE IS REJECTED BY THE RECEIVER --------------------------------------------------------------
{
    const stale = makeIncremental({ toVersion: "v2000", writes: ["WebGLEngine/lan.html"] });
    const plan = inc.planUpdate(stale, "v2500");     // current is newer than the package
    ok("!! the receiver refuses a package that is not strictly newer", plan && plan.ok === false,
       "planUpdate(v2000 onto current v2500) -> refused. A CONTROL THAT CANNOT FAIL IS DECORATION: an update that goes backwards must be stopped by the receiver, and the producer cannot force it.");
}

// ---- 4. THE PRODUCER REFUSES TO EMIT AN UNSAFE PATH --------------------------------------------------------------
{
    let threw = false;
    try { makeIncremental({ toVersion: "v9999", writes: ["../../etc/passwd"] }); } catch { threw = true; }
    let threw2 = false;
    try { makeIncremental({ toVersion: "v9999", writes: ["/etc/hosts"] }); } catch { threw2 = true; }
    ok("!! the producer refuses absolute and traversal paths (receiver's own guard)", threw && threw2,
       "../../etc/passwd and /etc/hosts both throw at PRODUCE time, using the receiver's safeRelPath -- a bad path never even reaches a package, and the two ends share one definition of 'safe'.");
}

// ---- 5. EVERY WRITE CARRIES BASE64 CONTENT THAT DECODES TO THE SOURCE --------------------------------------------
{
    const w = pkg.files.find((f) => f.action === "write" && f.path.endsWith("lan.html"));
    const decoded = Buffer.from(w.content, "base64").toString("utf8");
    const original = fs.readFileSync(path.join(ROOT, "WebGLEngine", "lan.html"), "utf8");
    ok("!! write entries carry base64 that decodes to the exact source", decoded === original,
       "the package is self-contained: lan.html's content is base64 in the JSON and decodes byte-for-byte to the tree file. No second fetch, no drift.");
}

// ---- 6. CUMULATIVE: THE LATEST PACKAGE ALONE CARRIES EVERY ROUND SINCE THE BASELINE -------------------------------
{
    // simulate two incremental rounds on top of a baseline, then prove the SECOND package alone -- applied by
    // someone who skipped the first -- lands BOTH rounds' files.
    const { resetBaseline, accumulate, emitCumulative } = await import("./makeIncremental.mjs");
    const tmpMan = path.join(os.tmpdir(), "inc-man-" + process.pid + ".json");
    fs.rmSync(tmpMan, { force: true });
    // baseline v100; round1 changes makeIncremental.mjs; round2 changes lan.html
    resetBaseline("v100", tmpMan);
    accumulate({ writes: ["WebGLEngine/tools/makeIncremental.mjs"] }, tmpMan);   // round 1 (skipped by the user)
    accumulate({ writes: ["WebGLEngine/lan.html"] }, tmpMan);                     // round 2 (the only one downloaded)
    const pkg2 = emitCumulative({ toVersion: "v102" }, tmpMan);
    const paths = pkg2.files.filter((f) => f.action === "write").map((f) => f.path);
    const hasBoth = paths.includes("WebGLEngine/tools/makeIncremental.mjs") && paths.includes("WebGLEngine/lan.html");
    // apply pkg2 ALONE onto a fresh install seeded at the baseline
    const INSTALL = path.join(os.tmpdir(), "inc-cum-" + process.pid);
    fs.rmSync(INSTALL, { recursive: true, force: true });
    const plan = inc.planUpdate(pkg2, "v100");
    inc.applyPlan(plan, INSTALL);
    const landedR1 = fs.existsSync(path.join(INSTALL, "WebGLEngine", "tools", "makeIncremental.mjs"));
    const landedR2 = fs.existsSync(path.join(INSTALL, "WebGLEngine", "lan.html"));
    ok("!! the latest package alone lands every round since the baseline", hasBoth && landedR1 && landedR2 && pkg2.fromVersion === "v100",
       "round-1 and round-2 files both present in the v102 package (" + hasBoth + ") and both land when v102 is applied alone onto the baseline (r1=" + landedR1 + ", r2=" + landedR2 + "), fromVersion=" + pkg2.fromVersion + ". SKIP AN INTERMEDIATE INCREMENTAL AND YOU STILL GET EVERYTHING -- the whole reason it is cumulative.");
    fs.rmSync(INSTALL, { recursive: true, force: true });
    fs.rmSync(tmpMan, { force: true });
}

console.log(fails ? "\nmakeIncremental-selfcheck: " + fails + " FAILED" : "\nmakeIncremental-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
