// WebGLEngine/tools/ship/shimCompiles.mjs -- does the box3d shim actually compile?
//
// WHY. v2508 shipped a box3d_shim.c with FIFTEEN redefinition errors in it. Keith's emcc found them in about
// forty-five seconds. I had shipped it three versions running -- v2508, v2509, v2511 -- because nothing in this
// sandbox had ever tried to compile a C file, and I had never checked whether anything could.
//
// gcc was in /usr/bin the whole time.
//
// THE BUG IT CATCHES. Porting the recording block from the standalone repo, I wrote `src[start:]` -- from the
// recording comment TO END OF FILE. In that repo the block sits in the MIDDLE, so the slice took the recording
// code AND the entire rest of the shim behind it: a second swk_world_create, a second swk_transforms, a second
// swk_state_hash. Fourteen functions defined twice. The JS surface check passed happily -- every function the JS
// called existed. Twice.
//
// WHAT IT PROVES: the shim is valid C against box3d's real v0.1.0 headers. Redefinitions, missing braces, wrong
// struct fields, misspelled b3 functions, bad argument types -- all caught here in a second.
// WHAT IT DOES NOT: that it links, that emcc agrees, or that the wasm behaves. gcc is not emcc: no -msimd128, no
// wasm target, no linking. This is a SYNTAX gate. The rig still adjudicates.
//
// THE HEADERS ARE NOT VENDORED. box3d is fetched at a pinned tag by the build script and lives wherever that put
// it. This looks in the usual places and, if it cannot find them, says SKIPPED OUT LOUD rather than passing. A
// check that quietly does nothing is worse than no check -- which is exactly what my first attempt at this did:
// I pointed gcc at a file called shim.bak, gcc dispatches on extension, and it silently compiled NOTHING and
// reported zero errors. Zero errors because zero compilation.
"use strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHIM = path.join(ROOT, "physics", "box3d", "box3d_shim.c");

// Where a fetched box3d might be. The build script clones into $TMPDIR/box3d-wasm-build; the standalone repo's
// checks fetch to /tmp/b3. Both are transient by design.
function findHeaders() {
    const tmp = process.env.TMPDIR || "/tmp";
    const guesses = [
        // v2560 -- the clang build (physics/box3d/build-box3d-wasm-clang.sh) clones here. Added FIRST because
        // that is now the build that actually happens: box3d.wasm is built in the sandbox with clang + wasi-libc,
        // not fetched from emsdk's blocked CDN. This gate printed "SKIPPED -- box3d headers not found. This is
        // NOT a pass." for five versions, and it was telling the truth the whole time.
        path.join(tmp, "box3d-clang-build", "box3d", "include"),
        "/tmp/box3d-clang-build/box3d/include",
        path.join(tmp, "box3d-wasm-build", "box3d", "include"),
        "/tmp/box3d-wasm-build/box3d/include",
    ];
    for (const base of ["/tmp/b3", path.join(tmp, "b3")]) {
        try {
            for (const d of fs.readdirSync(base)) {
                if (d.startsWith("box3d-")) guesses.push(path.join(base, d, "include"));
            }
        } catch {}
    }
    return guesses.find((g) => { try { return fs.existsSync(path.join(g, "box3d", "box3d.h")); } catch { return false; } }) || null;
}

function haveCompiler() {
    for (const c of ["gcc", "cc", "clang"]) {
        try { execFileSync(c, ["--version"], { stdio: "ignore" }); return c; } catch {}
    }
    return null;
}

if (!fs.existsSync(SHIM)) { console.log("shimCompiles: no box3d_shim.c in this tree -- nothing to check"); process.exit(0); }

const cc = haveCompiler();
const inc = findHeaders();

// SKIPPED IS NOT PASSED. Say which, loudly, and exit 0 only because a missing toolchain is not a broken shim --
// but never print anything that reads like a green tick.
if (!cc || !inc) {
    console.log("shimCompiles: SKIPPED -- " + (!cc ? "no C compiler here" : "box3d headers not found (fetch them: build-box3d-wasm.sh clones box3d to $TMPDIR)"));
    console.log("  This is NOT a pass. The shim was not compiled by anything.");
    process.exit(0);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shimcheck-"));
try {
    // gcc dispatches on EXTENSION. Copy to a .c or it silently compiles nothing and reports success -- which is
    // how my first version of this check "passed" a file with fifteen errors in it.
    const target = path.join(tmpDir, "box3d_shim.c");
    fs.copyFileSync(SHIM, target);
    try {
        execFileSync(cc, ["-fsyntax-only", "-I" + inc, target], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
        const errs = String((e && e.stderr) || "").split("\n").filter((l) => /error:/.test(l));
        console.log("\nshimCompiles: box3d_shim.c DOES NOT COMPILE  (" + errs.length + " errors, " + cc + " against " + inc + ")\n");
        for (const l of errs.slice(0, 12)) console.log("  " + l.replace(target, "physics/box3d/box3d_shim.c"));
        if (errs.length > 12) console.log("  ... and " + (errs.length - 12) + " more");
        console.log("");
        process.exit(1);
    }
    const fns = (fs.readFileSync(SHIM, "utf8").match(/^[A-Za-z_][\w \t*]*?\bswk_\w+\s*\(/gm) || []).length;
    console.log("shimCompiles: box3d_shim.c is valid C (" + fns + " swk_ functions, " + cc + " -fsyntax-only against real box3d headers)");
} finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
}
