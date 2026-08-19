// WebGLEngine/tools/crossarchBox3d-selfcheck.mjs — v2570
//
// Run: node tools/crossarchBox3d-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES tools/crossarch-box3d.mjs -- the harness Keith runs on Galaxina (x86_64) and his mother's M-series Mac
// (arm64) to find out whether real rigid-body physics is bit-identical across instruction sets.
//
// THIS CANNOT ANSWER THE CROSS-ARCH QUESTION. There is one architecture in this sandbox. What it CAN do -- and
// what it must do, or the harness is a ritual -- is prove the harness would NOTICE. A HASH THAT CANNOT CHANGE
// IS DECORATION, and shipping Keith a tool that prints the same string on every machine because it is insensitive
// would look exactly like a triumphant "bit-identical across architectures" result.
//
// ---- THE BLOCKER THAT EXPIRED --------------------------------------------------------------------------------
//
// tools/crossarch-flesh.mjs (v2546) explains in its own header why it hashes SPH and not box3d: "box3d.wasm is
// not in the tree yet, and box3dLoader's planar fallback answers the same questions the real one does -- so
// running the box3d cross-arch test today would silently test the fallback."
//
// Correct in v2546. FALSE SINCE v2560, when clang built box3d.wasm in this sandbox. FOURTEEN VERSIONS OF A REASON
// THAT HAD EXPIRED, sitting in a comment, being re-read as if it were still a fact.
//
// Second time this session: v2560 found FIVE versions of "rig-only: emsdk CDN 403s" written without anyone ever
// asking whether emsdk was the only road (it was not -- clang targets wasm32 natively). A REASON THAT EXPIRED IS
// A HABIT. The difference between a blocker and a habit is whether anyone has re-checked it since writing it down.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const WASM = path.join(here, "..", "vendor", "box3d", "box3d.wasm");

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

if (!fs.existsSync(WASM)) {
    console.log("crossarchBox3d-selfcheck: SKIPPED -- vendor/box3d/box3d.wasm not present. NOT a pass.");
    console.log("  Build it: bash physics/box3d/build-box3d-wasm-clang.sh");
    process.exit(0);
}

const bytes = fs.readFileSync(WASM);

/** The harness's scene, reproduced exactly. If this drifts from crossarch-box3d.mjs the gate tests a ghost. */
const run = async (nudge = 0, ticks = 600) => {
    const { instance } = await WebAssembly.instantiate(bytes, {
        wasi_snapshot_preview1: new Proxy({}, { get: () => () => 0 }),
    });
    const e = instance.exports;
    e.swk_world_create(0, -9.8, 0);
    for (let i = 0; i < 24; i++) {
        const x = (i % 4) * 0.9 - 1.35 + (i === 5 ? nudge : 0);
        e.swk_body_box(1, x, Math.floor(i / 4) * 0.9 + 1, ((i * 7) % 4) * 0.9 - 1.35, 0.5, 0.5, 0.5, 1.0);
    }
    e.swk_body_box(0, 0, -0.5, 0, 8, 0.5, 8, 1.0);
    const h = crypto.createHash("sha256");
    let nan = -1;
    for (let t = 0; t < ticks; t++) {
        e.swk_world_step(1 / 60, 4);
        const tr = new Float32Array(e.memory.buffer, e.swk_transforms(), e.swk_body_count() * 7);
        if (nan < 0 && tr.some((v) => !Number.isFinite(v))) nan = t;
        h.update(Buffer.from(tr.buffer, tr.byteOffset, tr.byteLength));
    }
    const tr = new Float32Array(e.memory.buffer, e.swk_transforms(), e.swk_body_count() * 7);
    let low = Infinity;
    for (let i = 0; i < e.swk_body_count() - 1; i++) low = Math.min(low, tr[i * 7 + 1]);
    return { hash: h.digest("hex").slice(0, 16), nan, low, count: e.swk_body_count() };
};

// ---- 1. DETERMINISTIC ON ONE MACHINE --------------------------------------------------------------------------
// If this fails, the cross-arch question is unaskable: two machines could never agree when one cannot agree with
// itself, and Keith would spend an evening blaming arm64 for our own nondeterminism.
const a = await run();
const b = await run();
ok("the same scene hashes the same twice ON ONE MACHINE", a.hash === b.hash,
   a.hash + " / " + b.hash + " -- if this ever fails, THE CROSS-ARCH QUESTION IS UNASKABLE: two machines cannot agree when one cannot agree with itself, and the evening would be spent blaming arm64 for our own nondeterminism.");

// ---- 2. AND IT CAN FAIL ----------------------------------------------------------------------------------------
const c = await run(1e-7);
ok("A ONE-IN-TEN-MILLION NUDGE TO ONE BODY CHANGES THE HASH", c.hash !== a.hash,
   a.hash + " -> " + c.hash + ". THIS IS THE CHECK THAT MATTERS. A HASH THAT CANNOT CHANGE IS DECORATION, and a harness that printed the same string on every machine BECAUSE IT WAS INSENSITIVE would look exactly like a triumphant 'bit-identical across architectures'.");

// ---- 3. the scene is physics, not a pile of NaNs ---------------------------------------------------------------
ok("the stack SETTLES -- it is a real scene, not free fall", Math.abs(a.low - 0.5) < 0.05 && a.nan < 0,
   "lowest body rests at y=" + a.low.toFixed(4) + " and its half-extent is 0.5, so it is ON THE FLOOR. " +
   a.count + " bodies, no NaN. Deliberate overlap at spawn means the SOLVER has to resolve contacts -- CONTACT RESOLUTION IS WHERE A CROSS-ARCH DIVERGENCE WOULD ACTUALLY SHOW, not free fall, where every architecture agrees because nothing is being decided.");

// ---- 4. the harness and this gate have not drifted -------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(here, "crossarch-box3d.mjs"), "utf8");
    ok("the harness prints the WASM's own hash first", /wasm=/.test(src) && /sha256/.test(src),
       "THE MAC PULLS THE WASM FROM GALAXINA OVER THE FLEET (192.168.50.8:8787). If the two machines run different BYTES, this compares TWO BUILDS, NOT TWO ARCHITECTURES -- and that is the likeliest false alarm, not an fma difference.");
    ok("...and it declares its own arch", /process\.arch/.test(src),
       "a hash with no arch beside it is two strings in a chat window");
    // Comparing SOURCE TEXT would grep the prose of the scene, not the scene. RUN the harness and compare the
    // hash it PRINTS against the hash this gate computed. Drift then has exactly one symptom, and reformatting
    // the harness cannot fake agreement.
    const { execFileSync } = await import("node:child_process");
    let printed = "";
    try {
        const out = execFileSync(process.execPath, [path.join(here, "crossarch-box3d.mjs")], { encoding: "utf8", timeout: 120000 });
        printed = (out.match(/state=([0-9a-f]+)/) || [])[1] || "";
    } catch (err) { printed = "THREW: " + String(err.message).slice(0, 40); }
    ok("...and THE HARNESS ITSELF PRINTS THE HASH THIS GATE COMPUTED", printed === a.hash,
       "harness state=" + printed + " vs gate " + a.hash + " -- if these drift, the gate is testing a ghost and the checks above are about a scene nobody runs.");
}

console.log(fails ? "\ncrossarchBox3d-selfcheck: " + fails + " FAILED" : "\ncrossarchBox3d-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
