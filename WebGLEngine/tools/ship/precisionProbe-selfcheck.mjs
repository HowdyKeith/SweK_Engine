// WebGLEngine/tools/ship/precisionProbe-selfcheck.mjs -- v4612 (task #35, backlog id "device-precision-probe")
//
// Run: node tools/ship/precisionProbe-selfcheck.mjs
//
// GATES ui/precisionProbe.mjs: the pure CPU ground-truth functions (sections 1-4, no GPU needed) and, in a
// real headless Chromium via SwiftShader, the actual GLSL shader end to end (sections 5-6) -- compiled,
// linked, rendered, read back, and cross-checked against the CPU-computed IEEE754/int32/uint32 ground truth.
//
// *** WHAT "PASSING" MEANS HERE, STATED PLAINLY: this gate proves the INSTRUMENT is correct -- that it
// measures what it claims to measure, stably, on a real (if software) GPU. It does NOT prove any particular
// real device's precision matches IEEE754/int32/uint32; a device that genuinely diverges would make section 5
// or 6 RED here, and that red would be the instrument doing its job, not a bug in it. SwiftShader is a
// conformant reference rasterizer and is EXPECTED to report the spec-compliant answer -- this is what makes
// a divergence on it worth escalating rather than the normal case a real mobile GPU driver might show. ***
//
// ---- SABOTAGE LOG (each entry: the real code mutated, the exact red(s) it produced, restored after) --------
// A. buildProbeSource's mode-validation throw removed -> section 2's "invalid mode throws" check red, nothing
//    else -- the malformed source (a mode with no matching #define branch) never reaches a real compile in
//    this gate, so no downstream section could have caught it either.
// B. parseProbeBytes's four fields swapped in pairs ([0]<->[1], [2]<->[3]) -> section 3's synthetic
//    DISTINCT-values check red (as expected, its whole reason to use distinct values); section 5's REAL
//    hardware run stayed GREEN, because this device's four channels are all equal (23/23/23/23 etc.) on a
//    conformant rasterizer, so swapping equal values is invisible -- exactly why section 3 uses synthetic,
//    deliberately-distinct values rather than relying on the real run to expose a decode bug.
// C. describePrecision's stage-mismatch finding removed -> section 4's stage-mismatch check red (the specific
//    "stage...disagree" finding text no longer present); the spec-divergence finding on the same synthetic
//    fixture still fired, proving these are two independent checks, not one that happens to cover both.
// D. describePrecision's struct-mismatch finding removed -> section 4's struct-mismatch check red, isolated
//    from stage/spec (both of which still passed correctly on their own fixtures).
// E. describePrecision's spec-divergence finding removed -> section 4's spec-divergence check red, isolated.
// F. the real GLSL algorithm corrupted (float branch's epsilon divided by 4.0 instead of 2.0, LOCAL-VARIABLE
//    path only, not the struct path) -> section 5 red (measured 22, not 23) AND a NEW local-vs-struct
//    mismatch finding appeared (since only the local-variable code path was broken, the struct path still
//    correctly measured 23) -- confirming the two code paths are independently computed, not sharing state.
//    Section 6 (determinism) stayed GREEN: the wrong answer was still perfectly deterministic, proving
//    determinism alone cannot catch a wrong-but-stable measurement -- only the exact-value check in section 5
//    can, which is why section 5 asserts exact values rather than only asserting stability.
//
// G and H were found by an independent adversarial review (three separate reviewer passes, not this round's
// author), which re-ran A/B/F itself and then went looking for what those six entries had NOT actually
// exercised -- correctly, on both counts:
// G. *** A REAL, VERIFIED HANG, NOT A HYPOTHETICAL. *** The int branch's local-variable loop mutated from
//    `value = value << 1; value = value | 1;` to `value = value << 2; value = value | 1;` does not overflow a
//    32-bit signed int at all -- it has an actual fixed point at 0x55555555, so `while (value > 0)` runs
//    forever. Reproduced live: the real headless_shell GPU process sat at ~99% CPU for 2+ minutes (this
//    gate's own harness call had no timeout) before the reviewer had to `pkill -9` the whole Chromium tree to
//    recover. Root cause was in tools/ship/webgpuHarness.mjs's renderGlslToPixels -- shared by four other
//    gates -- not in this file or ui/precisionProbe.mjs: its `await page.evaluate(...)` had no timeout at
//    all, unlike this same harness file's own runWgslComputeToTexture/runInEngineOrigin, which already race
//    the evaluate against a timer for exactly this reason (see that file's own v4528 comment). Fixed by
//    adding the identical race-against-a-timer pattern to renderGlslToPixels (default timeoutMs=60000).
//    Re-run with the same mutation after the fix: a clean, NAMED red in ~60s ("the shader did not return
//    within 60000 ms (a while-loop that never terminates?)") instead of an indefinite hang -- confirmed with
//    a wall-clock `time` measurement (61s) and a `ps aux` check showing zero stray Chromium processes
//    afterward. All four other renderGlslToPixels consumers (badTvDevicePass/badTvThreeParity/bloomFused/
//    headlessGpu -selfcheck.mjs) re-run clean after this change -- the timeout does not fire on the success
//    path, since Promise.race resolves on whichever settles first and the real render always finishes in
//    milliseconds.
// H. section 5's exact-value checks originally asserted only `.fragment` (the local-variable, fragment-stage
//    reading) for each mode -- a mutation confined to the STRUCT path or the VERTEX stage was still caught
//    (via describePrecision's composite matchesSpec finding above it), but with strictly less precision than
//    sabotage F demonstrated for the local-variable path. Verified directly: int's struct-only branch mutated
//    to start at `str.value = 2` instead of `1` (a bounded, one-iteration-short wrong answer, chosen
//    specifically to NOT risk another hang) produced only the composite finding under the original section 5
//    -- no assertion named which of the four fields was actually wrong. Fixed by asserting all four fields
//    (vertex/vertexStruct/fragment/fragmentStruct) explicitly for each mode, 12 checks in place of 3. Re-run
//    with the same mutation: `int.vertexStruct` and `int.fragmentStruct` both red by name ("got 30", expected
//    31), `int.vertex`/`int.fragment` correctly stayed green -- exact diagnostic precision, matching what F
//    already proved for the local-variable path.
"use strict";
import { webgpuSkipReason, renderGlslToPixels } from "./webgpuHarness.mjs";
import { gateReport } from "./gateReport.mjs";
import { MODE, buildProbeSource, parseProbeBytes, cpuFloatExponent, cpuIntBits, cpuUintBits,
         describePrecision } from "../../ui/precisionProbe.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const REPORT = gateReport("tools/ship/precisionProbe-selfcheck.mjs");

console.log("precisionProbe-selfcheck -- empirical GPU float/int/uint precision, checked against IEEE754/int32/uint32\n");

console.log("1. CPU ground truth -- pure, no GPU, real 32-bit arithmetic (Math.fround / Int32Array / Uint32Array)");
{
    ok("!! cpuFloatExponent() === 23 (IEEE754 single: 23 explicit mantissa bits)", cpuFloatExponent() === 23,
        "got " + cpuFloatExponent());
    ok("!! cpuIntBits() === 31 (signed 32-bit: 31 shifts before the sign bit flips negative)", cpuIntBits() === 31,
        "got " + cpuIntBits());
    ok("!! cpuUintBits() === 32 (unsigned 32-bit: 32 shifts before wraparound to zero)", cpuUintBits() === 32,
        "got " + cpuUintBits());
    ok("!! all three are deterministic across repeated calls",
        cpuFloatExponent() === cpuFloatExponent() && cpuIntBits() === cpuIntBits() && cpuUintBits() === cpuUintBits());
}

console.log("\n2. buildProbeSource -- pure GLSL generation");
{
    let threw = false;
    try { buildProbeSource(99); } catch { threw = true; }
    ok("!! an invalid mode throws rather than silently generating nonsense GLSL", threw);

    const srcs = [MODE.FLOAT, MODE.INT, MODE.UINT].map((m) => buildProbeSource(m));
    ok("!! all three modes produce syntactically-shaped GLSL ES 3.00 (#version 300 es, matching this engine's own shaders)",
        srcs.every((s) => s.vertex.startsWith("#version 300 es") && s.fragment.startsWith("#version 300 es")));
    ok("!! each mode injects its OWN #define MODE, not a shared/stale one",
        srcs[0].vertex.includes("#define MODE 0") && srcs[1].vertex.includes("#define MODE 1") && srcs[2].vertex.includes("#define MODE 2"));
    ok("!! vertex and fragment shaders for the same mode are textually distinct (different main(), not a copy-paste)",
        srcs.every((s) => s.vertex !== s.fragment && s.vertex.includes("gl_Position") && s.fragment.includes("fragColor")));
}

console.log("\n3. parseProbeBytes -- pure decode, inverts the shader's own /255.0 exactly");
{
    const p = parseProbeBytes([23, 23, 23, 23, 999, 999]);   // trailing values must be ignored (RGBA of ONE pixel)
    ok("!! decodes the first four bytes as {vertex, vertexStruct, fragment, fragmentStruct}",
        p.vertex === 23 && p.vertexStruct === 23 && p.fragment === 23 && p.fragmentStruct === 23, JSON.stringify(p));
    const p2 = parseProbeBytes([31, 30, 31, 29]);
    ok("!! decodes four DISTINCT values without cross-contamination", p2.vertex === 31 && p2.vertexStruct === 30 &&
        p2.fragment === 31 && p2.fragmentStruct === 29, JSON.stringify(p2));
}

console.log("\n4. describePrecision -- pure composition, names each of the three real quirk categories");
{
    const clean = { float: { vertex: 23, vertexStruct: 23, fragment: 23, fragmentStruct: 23 },
                    int: { vertex: 31, vertexStruct: 31, fragment: 31, fragmentStruct: 31 },
                    uint: { vertex: 32, vertexStruct: 32, fragment: 32, fragmentStruct: 32 } };
    const rClean = describePrecision(clean);
    ok("!! a spec-matching, stage/storage-agreeing result reports matchesSpec:true with zero findings",
        rClean.matchesSpec === true && rClean.findings.length === 0, rClean.summary);

    const stageMismatch = { ...clean, float: { vertex: 23, vertexStruct: 23, fragment: 16, fragmentStruct: 16 } };
    const rStage = describePrecision(stageMismatch);
    ok("!! a vertex-vs-fragment stage mismatch is named as its OWN finding, not silently averaged or ignored",
        !rStage.matchesSpec && rStage.findings.some((f) => f.includes("stage") && f.includes("disagree")), rStage.summary);

    const structMismatch = { ...clean, int: { vertex: 31, vertexStruct: 24, fragment: 31, fragmentStruct: 24 } };
    const rStruct = describePrecision(structMismatch);
    ok("!! a struct-vs-local-variable mismatch is named as its OWN finding, distinct from a stage mismatch",
        !rStruct.matchesSpec && rStruct.findings.some((f) => f.includes("struct")), rStruct.summary);

    const specMismatch = { ...clean, uint: { vertex: 24, vertexStruct: 24, fragment: 24, fragmentStruct: 24 } };
    const rSpec = describePrecision(specMismatch);
    ok("!! agreement across stages/storage that still diverges from the IEEE754/int32/uint32 ground truth is caught",
        !rSpec.matchesSpec && rSpec.findings.some((f) => f.includes("expected")), rSpec.summary);
}

console.log("\n5-6. *** THE REAL CLAIM: compiled, linked, and run on an actual GPU (SwiftShader, via headless Chromium) ***");
{
    const skip = webgpuSkipReason();
    if (skip) {
        console.log("  NOTE  SKIPPED -- " + skip);
        fails += 15;   // section 5 (compile + matchesSpec + 12 per-field exact checks) + section 6 (determinism)
    } else {
        const runAll = async () => {
            const out = {};
            for (const [name, mode] of [["float", MODE.FLOAT], ["int", MODE.INT], ["uint", MODE.UINT]]) {
                const src = buildProbeSource(mode);
                const r = await renderGlslToPixels({ vertex: src.vertex, fragment: src.fragment, width: 1, height: 1 });
                out[name] = r;
            }
            return out;
        };
        const runA = await runAll();

        console.log("\n5. all three modes compile, link and render on the real device");
        let allOk = true, detail = "";
        for (const name of ["float", "int", "uint"]) {
            if (!runA[name].ok) { allOk = false; detail = name + ": " + (runA[name].reason || "no reason given"); break; }
        }
        ok("!! float/int/uint shaders all compiled, linked and produced a readback",
            allOk, detail || "renderer: " + (runA.float.renderer || "unknown"));

        if (allOk) {
            const parsedA = { float: parseProbeBytes(runA.float.pixels), int: parseProbeBytes(runA.int.pixels),
                               uint: parseProbeBytes(runA.uint.pixels) };
            const descA = describePrecision(parsedA);
            ok("!! !!! the real device's answer MATCHES the CPU-computed IEEE754/int32/uint32 ground truth, all stages, all storage !!!",
                descA.matchesSpec, descA.summary);
            // *** ALL FOUR CHANNELS, EXPLICITLY, NOT ONLY .fragment. *** An earlier version of this section only
            // asserted the local-variable/fragment-stage reading, so a mutation confined to the STRUCT path (or
            // the VERTEX stage) was caught only indirectly, through describePrecision's composite matchesSpec
            // check above -- real, but strictly less diagnostic than naming which of the four disagreed and by
            // how much. Found by an independent adversarial review of this round; fixed here rather than left
            // as an accepted gap, since the cost is four more assertions the loop below already has the data for.
            for (const [name, expected] of [["float", 23], ["int", 31], ["uint", 32]]) {
                const p = parsedA[name];
                for (const field of ["vertex", "vertexStruct", "fragment", "fragmentStruct"]) {
                    ok(`!! ${name}.${field} is exactly ${expected} on this device (not merely 'close')`,
                        p[field] === expected, "got " + p[field]);
                }
            }

            console.log("\n6. determinism -- the SAME device, asked twice, gives the SAME answer");
            const runB = await runAll();
            const parsedB = { float: parseProbeBytes(runB.float.pixels), int: parseProbeBytes(runB.int.pixels),
                               uint: parseProbeBytes(runB.uint.pixels) };
            const same = JSON.stringify(parsedA) === JSON.stringify(parsedB);
            ok("!! two independent compile+render+readback cycles produce byte-identical results",
                same, same ? "confirmed" : "A=" + JSON.stringify(parsedA) + " B=" + JSON.stringify(parsedB));

            REPORT.table("device precision, this run", ["mode", "vertex", "vertexStruct", "fragment", "fragmentStruct", "expected"], [
                ["float", parsedA.float.vertex, parsedA.float.vertexStruct, parsedA.float.fragment, parsedA.float.fragmentStruct, 23],
                ["int", parsedA.int.vertex, parsedA.int.vertexStruct, parsedA.int.fragment, parsedA.int.fragmentStruct, 31],
                ["uint", parsedA.uint.vertex, parsedA.uint.vertexStruct, parsedA.uint.fragment, parsedA.uint.fragmentStruct, 32],
            ], "renderer: " + (runA.float.renderer || "unknown"));
            REPORT.write();
        } else {
            fails += 14;   // matchesSpec + 12 per-field exact checks + determinism, none of which could run
        }
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: real hardware. Every GPU-in-the-loop check above ran on SwiftShader, a conformant " +
    "SOFTWARE rasterizer via headless Chromium -- it is EXPECTED to report the spec-compliant answer, which " +
    "is exactly why it is the right thing to gate on (a stable, known-correct baseline the instrument itself " +
    "can be proven against). A real device's driver -- mobile GPUs especially -- may report something " +
    "genuinely different, and THAT divergence is precisely the finding this instrument exists to surface; " +
    "this gate proves the instrument is trustworthy, not that any given real device passes. No page/UI wraps " +
    "this module -- deliberately, per this round's own backlog entry ('rather than adding it as a page-only " +
    "tool'); a future page or gate calls buildProbeSource/parseProbeBytes/describePrecision directly. And no " +
    "WGSL/WebGPU variant exists -- this round scoped to WebGL2/GLSL, matching gkjohnson/webgl-precision's own " +
    "scope and the two precision bugs (bcs_hash, Ashima noise) that motivated this backlog entry, both GLSL.");
process.exit(fails ? 1 : 0);
