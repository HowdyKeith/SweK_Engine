// WebGLEngine/tools/strictLibm-package-selfcheck.mjs — v2628
//
// Run: node tools/strictLibm-package-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Proves the strict-libm DELIVERABLE is (1) assembled from the live gated source, not a stale copy, and (2)
// passes its own test after assembly -- so what Valeriu would receive is exactly what the engine's gate proved.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { emitStrictLibm } from "./emitStrictLibm.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const OUT = path.join(os.tmpdir(), "strict-libm-pkgcheck-" + process.pid);
const r = emitStrictLibm(OUT);

// ---- 1. src/ IS BYTE-IDENTICAL TO THE ENGINE'S GATED SOURCE -------------------------------------------------------
{
    let drift = [];
    for (const f of ["strictTrig.mjs", "strictMath.mjs"]) {
        const a = fs.readFileSync(path.join(HERE, f), "utf8");
        const b = fs.readFileSync(path.join(OUT, "src", f), "utf8");
        if (a !== b) drift.push(f);
    }
    ok("!! the package's src/ is byte-identical to the gated engine source", drift.length === 0,
       drift.length ? "DRIFT in " + drift.join(", ") : "src/strictTrig.mjs and src/strictMath.mjs match tools/ exactly -- the deliverable carries the gated math by copy-on-emit, so it cannot ship stale.");
}

// ---- 2. THE PACKAGE PASSES ITS OWN TEST AFTER ASSEMBLY ------------------------------------------------------------
{
    let passed = false, out = "";
    try { out = execFileSync(process.execPath, [path.join(OUT, "test.mjs")], { encoding: "utf8", timeout: 60000 }); passed = /all checks pass/.test(out); }
    catch (e) { out = String((e && e.stdout) || e); passed = false; }
    ok("!! the assembled package passes node test.mjs (grep guarantee + accuracy + determinism)", passed,
       passed ? "the deliverable's own gate is green: no host transcendental in src, every function at machine epsilon, fingerprint reproducible." : "package test FAILED: " + out.split("\n").filter((l) => /FAIL/.test(l)).slice(0, 2).join(" | "));
}

// ---- 3. THE WRAPPER IS COMPLETE ----------------------------------------------------------------------------------
{
    const need = ["index.mjs", "demo.mjs", "test.mjs", "README.md", "package.json", "LICENSE", "src/strictTrig.mjs", "src/strictMath.mjs"];
    const missing = need.filter((f) => !fs.existsSync(path.join(OUT, f)));
    ok("!! the deliverable is a complete, self-contained package", missing.length === 0,
       missing.length ? "missing " + missing.join(", ") : need.length + " files present -- a stranger can unzip, `node test.mjs`, and `import` it with no other setup.");
}

fs.rmSync(OUT, { recursive: true, force: true });
console.log(fails ? "\nstrictLibm-package-selfcheck: " + fails + " FAILED" : "\nstrictLibm-package-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
