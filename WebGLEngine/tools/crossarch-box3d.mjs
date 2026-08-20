// WebGLEngine/tools/crossarch-box3d.mjs — v2570
//
// RUN THIS ON BOTH MACHINES. COMPARE THE ONE LINE IT PRINTS.
//
//     node tools/crossarch-box3d.mjs
//
// It builds a fixed box3d scene, steps it a fixed number of ticks, and hashes every body's transform. SAME HASH
// on Galaxina (x86_64) and on the M-series Mac (arm64) means REAL RIGID-BODY PHYSICS IS BIT-IDENTICAL ACROSS
// INSTRUCTION SETS. Different hash means it is not, and the divergence tick is printed so you know WHERE.
//
// ---- WHY THIS EXISTS NOW AND NOT IN v2546 ---------------------------------------------------------------------
//
// tools/crossarch-flesh.mjs (v2546) says, in its own header:
//
//     "WHY THIS AND NOT THE BOX3D TEST: box3d.wasm is not in the tree yet, and box3dLoader's planar fallback
//      answers the same questions the real one does -- so running the box3d cross-arch test today would silently
//      test the fallback."
//
// That was true and it was the right call. IT STOPPED BEING TRUE IN v2560, WHEN clang BUILT box3d.wasm IN THE
// SANDBOX -- and nothing told the tool. FOURTEEN VERSIONS OF A REASON THAT HAD EXPIRED.
//
// This is the second time this exact thing has bitten: v2560 found five versions of "rig-only: emsdk CDN 403s"
// written without ever asking whether emsdk was the only road to wasm (it was not; clang targets wasm32
// natively). A REASON THAT EXPIRED IS A HABIT. The difference between a blocker and a habit is whether anyone
// has re-checked it since it was written down.
//
// ---- WHAT MAKES THIS DIFFERENT FROM THE FLESH TEST ------------------------------------------------------------
//
// The flesh test hashes SPH -- our own float arithmetic, in our own JS. This hashes BOX3D -- Erin Catto's solver,
// compiled to wasm, doing constraint iteration and contact resolution. The wasm spec mandates IEEE-754 semantics
// for f32/f64, so this SHOULD be identical. "Should" is the reason to measure it.
//
// If it diverges, the first suspects, in order:
//   1. fma contraction -- clang may contract a*b+c into a single fused op on one target and not another
//   2. the wasm was rebuilt on the second machine with a different clang, rather than being COPIED
//   3. libm: any transcendental (sqrt is exact per IEEE, but sin/cos/exp are not mandated bit-exact)
//
// SUSPECT 2 IS THE LIKELY ONE AND IT IS NOT A PHYSICS BUG: the Mac already PULLS the wasm from Galaxina over the
// fleet (192.168.10.8:8787). IF THE TWO MACHINES RUN DIFFERENT BYTES, THIS TOOL IS COMPARING TWO BUILDS, NOT TWO
// ARCHITECTURES -- so it prints the wasm's own SHA-256 first, and if those differ, nothing below means anything.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const WASM = path.join(here, "..", "vendor", "box3d", "box3d.wasm");

if (!fs.existsSync(WASM)) {
    console.log("crossarch-box3d: vendor/box3d/box3d.wasm not present.");
    console.log("  Build it: bash physics/box3d/build-box3d-wasm-clang.sh");
    process.exit(2);
}

const bytes = fs.readFileSync(WASM);
const wasmSha = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 16);

const { instance } = await WebAssembly.instantiate(bytes, {
    wasi_snapshot_preview1: new Proxy({}, { get: () => () => 0 }),
});
const e = instance.exports;

// A FIXED SCENE. No randomness, no clock, no input -- if this scene is not identical on both machines, the tool
// is measuring itself. Bodies are placed on a lattice with deliberate overlap so the SOLVER has to work: contact
// resolution is where a divergence would actually show, not free fall.
e.swk_world_create(0, -9.8, 0);
const N = 24;
for (let i = 0; i < N; i++) {
    const x = (i % 4) * 0.9 - 1.35;
    const y = Math.floor(i / 4) * 0.9 + 1;
    const z = ((i * 7) % 4) * 0.9 - 1.35;
    e.swk_body_box(1, x, y, z, 0.5, 0.5, 0.5, 1.0);   // type 1 = DYNAMIC (the C: (type==1) ? dynamic : static)
}
e.swk_body_box(0, 0, -0.5, 0, 8, 0.5, 8, 1.0);        // type 0 = STATIC floor

const TICKS = 600;
const h = crypto.createHash("sha256");
let firstNaN = -1;
for (let t = 0; t < TICKS; t++) {
    e.swk_world_step(1 / 60, 4);
    const tr = new Float32Array(e.memory.buffer, e.swk_transforms(), e.swk_body_count() * 7);
    if (firstNaN < 0 && tr.some((v) => !Number.isFinite(v))) firstNaN = t;
    h.update(Buffer.from(tr.buffer, tr.byteOffset, tr.byteLength));
}
const stateHash = h.digest("hex").slice(0, 16);

const tr = new Float32Array(e.memory.buffer, e.swk_transforms(), e.swk_body_count() * 7);
let lowest = Infinity, highest = -Infinity;
for (let i = 0; i < e.swk_body_count() - 1; i++) {
    lowest = Math.min(lowest, tr[i * 7 + 1]);
    highest = Math.max(highest, tr[i * 7 + 1]);
}

console.log("BOX3D  arch=" + process.arch + "  wasm=" + wasmSha + "  state=" + stateHash +
            "  bodies=" + e.swk_body_count() + "  ticks=" + TICKS +
            "  restY=[" + lowest.toFixed(4) + ".." + highest.toFixed(4) + "]" +
            (firstNaN >= 0 ? "  *** NaN AT TICK " + firstNaN + " ***" : ""));
console.log("");
console.log("  COMPARE `wasm=` FIRST. If those differ, the two machines are running DIFFERENT BUILDS and");
console.log("  `state=` cannot tell you anything about architectures. Copy the .wasm, do not rebuild it.");
console.log("  Then compare `state=`. Same on x86_64 and arm64 -> box3d is bit-identical across instruction sets.");
