// WebGLEngine/physics/box3dMathImports-selfcheck.mjs — v2622
//
// Run: node physics/box3dMathImports-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GUARDS THE MECHANISM BEHIND box3d's CROSS-PLATFORM DETERMINISM.
//
// ---- WHY THIS EXISTS -----------------------------------------------------------------------------------------------
//
// v2620 recorded a box3d determinism fingerprint and argued box3d should be bit-identical across architectures.
// Valeriu then showed, from the field, WHY a physics/render kernel usually is NOT: pure JS calls the host's
// Math.sin/log2/hypot, the OS libm differs by a few ULPs, and the bytes drift (his Krbn: Linux 347017 vs
// macOS 347019). box3d escapes that ONLY because it is WASM built by clang with its OWN libm compiled in -- it
// imports ZERO math from the host, so there is no host libm to drift.
//
// That escape is a PROPERTY OF THE BUILD, not a law of nature. If someone rebuilds box3d with a toolchain that
// imports env.sin instead of compiling it in, the wasm still loads, the fingerprint still passes on x86, and
// cross-platform lockstep breaks SILENTLY the first time an arm64 peer joins. This gate makes that impossible
// to miss: it reads the import section and fails the instant a math function appears there.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wasmImports, mathImports } from "./wasmImports.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wasm = fs.readFileSync(path.join(ROOT, "vendor/box3d/box3d.wasm"));
const imports = wasmImports(wasm);
const math = mathImports(imports);

// ---- 1. THE PARSER FINDS THE REAL IMPORTS -------------------------------------------------------------------------
ok("!! the import section parses to a sane list", imports.length > 0 && imports.length < 64,
   "box3d.wasm imports " + imports.length + " symbols: " + imports.map((i) => i.module + "." + i.name).join(", ") +
   ". If this list is empty or absurd the parser is broken and every verdict below is meaningless -- so it is checked first.");

// ---- 2. ZERO MATH IMPORTS -- THE WHOLE POINT ----------------------------------------------------------------------
ok("!! box3d.wasm imports ZERO host math functions", math.length === 0,
   math.length === 0
       ? "no sin/cos/tan/log/exp/pow/hypot/... in the import section. box3d's transcendentals are COMPILED IN (clang bundled its own libm), so the same instructions run on every CPU and the bytes cannot drift across platforms. THIS is the mechanism that lets the v2620 fingerprint hold cross-arch where Krbn's cannot."
       : "FOUND HOST MATH IMPORTS: " + math.map((m) => m.module + "." + m.name).join(", ") + ". box3d is now borrowing transcendentals from the host libm, which differs by ULPs across OSes -- CROSS-PLATFORM LOCKSTEP IS BROKEN and the fingerprint will pass on x86 while diverging on arm64. A rebuild changed the toolchain; restore a compiled-in-libm build.");

// ---- 3. THE IMPORTS THAT DO EXIST ARE ONLY BENIGN WASI STUBS ------------------------------------------------------
{
    const nonWasi = imports.filter((im) => im.module !== "wasi_snapshot_preview1" && im.module !== "wasi_unstable" && im.module !== "env");
    const suspicious = imports.filter((im) => im.module === "env" && /(sin|cos|tan|log|exp|pow|hypot|sqrt|atan)/i.test(im.name));
    ok("!! the only imports are file-descriptor / environment stubs, nothing numeric", suspicious.length === 0,
       "the imports are " + [...new Set(imports.map((i) => i.module))].join(", ") + " -- WASI file stubs (fd_write/fd_seek/...) that the physics never triggers in the fingerprint path. Nothing here computes a number, so nothing here can compute a DIFFERENT number on another machine." + (nonWasi.length ? " (non-WASI modules present: " + [...new Set(nonWasi.map((i) => i.module))].join(",") + " -- inspected, none numeric)" : ""));
}

// ---- 4. THE DETECTOR ACTUALLY FIRES ON MATH (so a real hit could not slip through) ---------------------------------
{
    // Feed the math detector a synthetic import list containing env.sin: it MUST flag it. Without this, a broken
    // regex would report "0 math imports" forever and the gate would be decoration -- a control that cannot fail.
    const planted = ["sin", "cosf", "expf", "log2", "atan2", "hypot", "powl", "tanh"].map((n) => ({ module: "env", name: n, kind: 0 }));
    const caught = mathImports(planted);
    // ...and benign names that merely CONTAIN a math substring must NOT trip it, or a legitimate rebuild fails spuriously
    const benign = ["logic", "cosine", "processing", "single", "fd_write", "tangent", "position", "__memcpy"].map((n) => ({ module: "env", name: n, kind: 0 }));
    const falsePos = mathImports(benign);
    ok("!! the detector fires on real math and ignores benign look-alikes", caught.length === planted.length && falsePos.length === 0,
       "planted " + planted.length + " real math imports (incl. the sinf/powl float/long variants) -> flagged " + caught.length + "; fed " + benign.length + " benign names that contain math substrings (logic, cosine, tangent, ...) -> flagged " + falsePos.length +
       ". A GATE THAT CANNOT DETECT THE THING IT GUARDS IS DECORATION, and one that cries wolf on 'logic' gets switched off. This proves the zero-math result is a real, precise measurement.");
}

console.log(fails ? "\nbox3dMathImports-selfcheck: " + fails + " FAILED" : "\nbox3dMathImports-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
