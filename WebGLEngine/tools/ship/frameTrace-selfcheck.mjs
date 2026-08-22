// WebGLEngine/tools/ship/frameTrace-selfcheck.mjs -- v3060
//
// Run: node tools/ship/frameTrace-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES render/frameTrace.js -- a frame turned into a comparable artifact.
//
// This tree diffs physics (box3dSyncCompare, which reports divergedAt rather than resynchronising past it) and
// it replays the brain's own steps. Rendering was the third thing that should be diffable and the only one that
// needed a GPU to look at. It does not: what a frame IS, is the sequence of commands it issues.
//
// THE CHECK THAT MATTERS IS SECTION 2. Normalisation is the entire idea -- a raw log is not even comparable with
// ITSELF, because createProgram() hands back a fresh object every run, so two identical frames produce logs full
// of distinct identities and every diff reads 100% different. Section 2 proves the raw logs really are unequal
// and the normalised traces really are equal, so the normalisation is doing work rather than decorating.

import { readFileSync } from "node:fs";
import { traceFrame, normalize, diffTraces, describeDiff, fingerprint } from "../../render/frameTrace.js";
import { makeRecordingGL } from "../../render/glBootstrap.js";
import { VoxelRaymarchPass } from "../../render/voxelRaymarchPass.js";
import { codeOnly } from "./sourceScan.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const say = (m) => console.log("  ----  " + m);

const CAM = { eye: [1, 2, 3], fwd: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0], tanFov: 0.6 };
const frame = (cam, opts = { uint: true }, dims = 16) => (gl) => {
    const p = new VoxelRaymarchPass(gl, opts);
    p.uploadVolume(new Uint8Array(dims * dims * dims), dims, dims, dims);
    p.render(cam, 64, 64);
};

// --- 1. DETERMINISM ------------------------------------------------------------------------------------------
{
    const a = traceFrame(frame(CAM)), b = traceFrame(frame(CAM));
    say("frame is " + a.calls + " commands, fingerprint " + a.fingerprint);
    ok("!! the same frame traced twice is IDENTICAL", a.fingerprint === b.fingerprint && diffTraces(a.trace, b.trace).same,
        "a difference here would mean something in the render path is nondeterministic -- a clock, a random, an iteration order");
    ok("...and the trace is substantial, not two lines", a.calls > 20, a.calls + " commands");
    ok("a third run agrees too, so it is not a two-run coincidence", traceFrame(frame(CAM)).fingerprint === a.fingerprint);
}

// --- 2. NORMALISATION IS LOAD-BEARING, proven both ways ------------------------------------------------------
{
    const r1 = makeRecordingGL({ width: 64, height: 64 }), r2 = makeRecordingGL({ width: 64, height: 64 });
    frame(CAM)(r1.gl); frame(CAM)(r2.gl);

    // the same handle object appears repeatedly in one log, so raw JSON collapses it to {} and looks equal --
    // the honest way to show the problem is that the raw logs are not equal AS OBJECTS
    const sameObjects = r1.log.some((c, i) => c.args.some((a, j) => a && typeof a === "object" && !a.typed && a === r2.log[i].args[j]));
    ok("!! raw logs from two runs do NOT share their handle objects", sameObjects === false,
        "createProgram returns a fresh object each run, so identity cannot be compared across runs");
    ok("!! ...yet the NORMALISED traces are identical", diffTraces(normalize(r1.log), normalize(r2.log)).same,
        "identity is replaced by structure: first-appearance order gives prog#1, tex#1, u:uEye");
    ok("handles really are symbolised in the output", (() => {
        const t = normalize(r1.log).join("\n");
        return /program#1|texture#1/.test(t) && /u:uEye/.test(t) && !/\[object Object\]/.test(t);
    })());
    ok("GL constants appear by NAME, so a trace is readable without a decoder ring", (() => {
        const t = normalize(r1.log).join("\n");
        return /TEXTURE_3D/.test(t) && /R8UI/.test(t) && /TRIANGLES/.test(t);
    })());
}

// --- 3. DIVERGED-AT, not "different" -------------------------------------------------------------------------
{
    const a = traceFrame(frame(CAM));
    const c = traceFrame(frame({ ...CAM, eye: [1, 2, 4] }));
    const d = diffTraces(a.trace, c.trace);
    say(describeDiff(d).split("\n")[0]);
    ok("!! a moved camera diverges at a NAMED command index", d.same === false && Number.isInteger(d.index) && d.index > 0);
    ok("...and both sides are quoted, so the finding is actionable",
        /uEye/.test(d.a) && /uEye/.test(d.b) && d.a !== d.b, d.a + "  vs  " + d.b);
    ok("...everything before that point is identical (it is a FIRST divergence, not any divergence)",
        a.trace.slice(0, d.index).every((l, i) => l === c.trace[i]));
    ok("fingerprints differ too, so a cheap check agrees with the expensive one", a.fingerprint !== c.fingerprint);

    // a frame that stops early must be reported as stopping, not merely as different
    // A TRUE PREFIX. My first version used different dims, so the traces diverged at texImage3D long before
    // either ran out -- and diffTraces correctly reported a first-differing-command, not a length. Testing the
    // length branch requires a frame that is identical and then simply stops.
    const short = traceFrame((gl) => { const p = new VoxelRaymarchPass(gl, { uint: true }); p.uploadVolume(new Uint8Array(16 * 16 * 16), 16, 16, 16); });
    const d2 = diffTraces(a.trace, short.trace);
    ok("!! a frame that STOPS EARLY is described as stopping, with the length of each side",
        d2.same === false && /stopped|continued/.test(d2.reason) && d2.lengthA !== d2.lengthB,
        d2.lengthA + " vs " + d2.lengthB + " commands");
}

// --- 4. SENSITIVE TO THE THING THIS WHOLE ARC IS ABOUT -------------------------------------------------------
{
    const uintT = traceFrame(frame(CAM, { uint: true }));
    const unormT = traceFrame(frame(CAM, {}));
    const d = diffTraces(uintT.trace, unormT.trace);
    ok("!! the uint and unorm passes produce DIFFERENT traces", d.same === false);
    // I expected them to part at texImage3D. They part EARLIER, at shaderSource -- because the trace records the
    // shader TEXT, so usampler3D vs sampler3D shows up before any texture is uploaded. That is better than what
    // I asserted, and worth recording rather than quietly rewriting the expectation.
    ok("...and they part company at the SHADER SOURCE, before the upload", /shaderSource/.test(d.a) && /shaderSource/.test(d.b),
        "the trace carries the shader text, so usampler3D vs sampler3D is visible with no GPU and no compile");
    ok("...and the upload differs too, further along", (() => {
        const iu = uintT.trace.findIndex((l) => l.startsWith("texImage3D"));
        const in_ = unormT.trace.findIndex((l) => l.startsWith("texImage3D"));
        return iu > 0 && in_ > 0 && /R8UI/.test(uintT.trace[iu]) && /R8[,)]/.test(unormT.trace[in_]);
    })(), "R8UI/RED_INTEGER vs R8/RED");
    ok("...but they agree on everything before the first divergence", d.index > 0 && uintT.trace.slice(0, d.index).every((l, i) => l === unormT.trace[i]),
        "same DDA, same draw call -- which is what a substitution should look like");

    // a changed VOLUME must move the trace, or the buffer checksum is not in it
    const volA = traceFrame((gl) => { const p = new VoxelRaymarchPass(gl, { uint: true }); const v = new Uint8Array(8 * 8 * 8); p.uploadVolume(v, 8, 8, 8); });
    const volB = traceFrame((gl) => { const p = new VoxelRaymarchPass(gl, { uint: true }); const v = new Uint8Array(8 * 8 * 8); v[17] = 3; p.uploadVolume(v, 8, 8, 8); });
    ok("!! ONE changed voxel changes the trace, so the uploaded data is part of it",
        diffTraces(volA.trace, volB.trace).same === false,
        "a trace that ignored buffer contents would call two different worlds the same frame");
}

// --- 5. the float-precision choice is stated, not hidden -----------------------------------------------------
{
    const a = traceFrame(frame(CAM), { precision: 6 });
    ok("the trace records the precision it was taken at", a.precision === 6);
    ok("...and a coarser precision is a DIFFERENT artifact, not a looser comparison of the same one", (() => {
        const t3 = traceFrame((gl) => { gl.uniform1f({ __uniform: "x" }, 1.23456789); }, { precision: 3 });
        const t6 = traceFrame((gl) => { gl.uniform1f({ __uniform: "x" }, 1.23456789); }, { precision: 6 });
        return t3.trace[0] !== t6.trace[0] && /1\.235/.test(t3.trace[0]) && /1\.234568/.test(t6.trace[0]);
    })(), "comparing traces taken at different precisions would be comparing two different measurements");
    ok("integers are left exact rather than rounded through a float path", (() => {
        const t = traceFrame((gl) => { gl.drawArrays(gl.TRIANGLES, 0, 3); });
        return /drawArrays\(TRIANGLES, 0, 3\)/.test(t.trace[0]);
    })());
}

// --- 6. scope + browser-safe ---------------------------------------------------------------------------------
{
    const src = readFileSync(new URL("../../render/frameTrace.js", import.meta.url), "utf8");
    ok("the module says what a trace proves and what it does not",
        // Matched against the source with newlines and comment markers collapsed: the sentence I am looking for
        // is WRAPPED across two comment lines, so a contiguous regex fails on prose that is present and correct.
        /Not that either drew the\s+(\/\/\s*)?right picture/.test(src) && /Pixels remain a rig concern/.test(src),
        "equal traces mean equal COMMANDS; a lockstep hash for rendering, silent about correctness");
    ok("browser-safe: imports only glBootstrap", (() => {
        const code = codeOnly(src);
        return (code.match(/^\s*import[^\n]*/gm) || []).length === 1 && !/\bdocument\s*[.[]/.test(code);
    })());
    ok("fingerprint is stable across calls on equal input", fingerprint(["a(1)", "b(2)"]) === fingerprint(["a(1)", "b(2)"]) &&
        fingerprint(["a(1)"]) !== fingerprint(["a(2)"]));
}

console.log("frameTrace-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
