// WebGLEngine/tools/emitStrictLibm.mjs — v2628
//
// Assemble the strict-libm standalone deliverable -- the host-Math-free sin/cos/hypot/log2/atan2 set, packaged
// as a drop-in module for Krbn (or anyone who needs cross-platform byte-identical transcendentals).
//
// ---- WHY THIS IS AN EMITTER, NOT A CHECKED-IN COPY -----------------------------------------------------------------
//
// The package's src/ is the engine's OWN gated tools/strictTrig.mjs + tools/strictMath.mjs -- copied at emit time,
// never hand-maintained. If it were a static duplicate, the day someone fixed a coefficient in the engine and not
// in the package, the deliverable would quietly ship stale math. IF I MOVED A FILE, I MOVED ITS ASSUMPTIONS: the
// package carries the gated source by reference (copy-on-emit), so the thing Valeriu receives is exactly the thing
// the engine's verify gate proved. The static wrapper (index/demo/test/README/license) lives in strict-libm-pkg/.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLS = HERE;
const PKG = path.join(HERE, "strict-libm-pkg");

// the two GATED source files that are the substance of the deliverable
const SOURCES = ["strictTrig.mjs", "strictMath.mjs"];
// the static wrapper files that make it a package
const WRAPPER = ["index.mjs", "demo.mjs", "test.mjs", "README.md", "package.json", "LICENSE"];

export function emitStrictLibm(outDir) {
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(outDir, "src"), { recursive: true });
    for (const f of SOURCES) fs.copyFileSync(path.join(TOOLS, f), path.join(outDir, "src", f));
    for (const f of WRAPPER) fs.copyFileSync(path.join(PKG, f), path.join(outDir, f));
    return { dir: outDir, sources: SOURCES.length, wrapper: WRAPPER.length };
}

// CLI: node tools/emitStrictLibm.mjs [outDir]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const out = process.argv[2] || path.join(HERE, "..", "..", "strict-libm");
    const r = emitStrictLibm(out);
    console.log("strict-libm: " + r.sources + " gated sources + " + r.wrapper + " wrapper files -> " + r.dir);
}
