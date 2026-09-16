#!/usr/bin/env node
// WebGLEngine/tools/ship/headlessGpu-selfcheck.mjs -- v4292
//
// GRADES the browser-free WebGPU path against the browser one, on the same shader, in the same run.
//
// *** THE CLAIM IS AGREEMENT, NOT SPEED. *** A faster backend that returns different numbers is not a faster
// backend, it is a second renderer, and this tree has spent four rounds establishing how easily two GPU paths
// can differ while both being conformant. So section 2 compares element for element and section 3 proves the
// comparison can fail, before section 5 is allowed to mention a millisecond.
//
// Section 4 is the one that matters most operationally. Dawn aborts on a natural process exit AFTER doing the
// work correctly, so the failure mode is a gate that prints PASS and returns 134 -- or, read by stdout alone,
// a PASS on a process that died. That is checked by SPAWNING BOTH SHAPES and reading both exit codes, because
// a mitigation nobody has watched fail is not known to be doing anything.
"use strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as HG from "./headlessGpu.mjs";
import { runWgslCompute, webgpuSkipReason } from "./webgpuHarness.mjs";
import { lcgWgsl, lcgUniforms, lcgStatesCpu, lcgValuesCpu, unpackState, bracketsF64 }
    from "../../physics/render/pathTracerWgsl.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (c, name, detail) => {
    console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`);
    if (!c) fails++;
};
const sec = (t) => console.log("\n" + t);

const skip = HG.headlessGpuSkipReason();
if (skip) {
    // *** v4534 -- THIS FAILED WITHOUT SAYING SO IN THE ONE FORMAT THE TREE COUNTS. *** The ship skill's rule
    // is "Count reds with `grep -c '^  FAIL'`, never `grep -c FAIL`" -- and this branch printed a summary
    // line and no row, so every tally built on that rule read ZERO REDS FOR A GATE THAT WAS FAILING. It is
    // the only gate in v4460's census that reported exit 1 with nothing to count, and it stayed classified as
    // "environmental, nothing to do" for the whole of this session's sweep because of it.
    //
    // The doctrine below is UNCHANGED and correct: a missing device is a red, not a skip. What changes is
    // that the red is legible to the counter the ritual actually uses.
    console.log("headlessGpu-selfcheck: NO NATIVE GPU -- " + skip);
    console.log("  FAIL  *** NO NATIVE GPU: the device this gate measures is absent, so nothing was measured ***   " + skip);
    console.log("\nFAIL -- 1 check(s)");
    console.log("A GATE THAT SKIPS IS NOT A GATE THAT PASSES. Every number here came off a real Dawn instance.");
    process.exit(1);
}

const N = 512, SEED = 1, STRIDE = 3, OUT = N * STRIDE;
const CODE = lcgWgsl(), UNI = lcgUniforms(SEED, N), WG = Math.ceil(N / 64);

// ---------------------------------------------------------------------------------------------------------
sec("1. THE DRIVER IS DISCOVERED, NOT HARDCODED -- AND IT COMES OUT OF THE BROWSER BUNDLE");
// ---------------------------------------------------------------------------------------------------------
{
    const icds = HG.findVulkanIcds();
    ok(icds.length > 0, "*** a SwiftShader ICD is found under the Playwright browser root ***",
       `${icds.length} manifest(s), first: ${icds[0]}`);
    ok(icds.every((p) => /chromium/i.test(p)),
       "and it ships INSIDE chromium -- the browser we are avoiding is where the driver lives",
       "so this takes no new dependency on a GPU driver; it uses the one the tree already downloads");
    ok(icds.join(",") === HG.findVulkanIcds().join(","), "discovery is stable across calls (sorted)",
       "two boxes with the same bundles must pick the same driver or their results are not comparable");
    ok(HG.findVulkanIcds("/nonexistent-browser-root").length === 0,
       "CONTROL: a root with no bundles finds nothing rather than throwing",
       "the skip reason has to be reachable, which means discovery must fail quietly");
    ok(HG.resolveWebgpu().from !== "", "node-webgpu resolves, and the gate can say from where",
       HG.resolveWebgpu().from);
    ok(HG.WEBGPU_PATHS.length > 1 && HG.WEBGPU_PATHS[0] === "webgpu",
       "the resolver is a LIST tried in order, per playwrightResolve.mjs's rule",
       "three gates each grew their own guess once and two went stale on the same box");
}

// ---------------------------------------------------------------------------------------------------------
sec("2. THE TWO BACKENDS AGREE, ELEMENT FOR ELEMENT, ON THE TREE'S OWN SHADER");
// ---------------------------------------------------------------------------------------------------------
const tNative0 = Date.now();
const native = await HG.runWgslComputeNative({ code: CODE, outCount: OUT, uniforms: UNI, workgroups: WG });
const tNative = Date.now() - tNative0;
let browser = null, tBrowser = 0;
{
    ok(native.ok, "the native backend runs", native.ok
        ? `${native.adapter.vendor}/${native.adapter.architecture} -- ${native.adapter.description}`
        : native.reason);
    const bSkip = webgpuSkipReason();
    ok(!bSkip, "and the browser backend is available to compare against", bSkip || "");
    if (!native.ok || bSkip) { console.log("\nFAIL -- " + (++fails) + " check(s)"); process.exit(1); }

    const t0 = Date.now();
    browser = await runWgslCompute({ code: CODE, outCount: OUT, uniforms: UNI, workgroups: WG });
    tBrowser = Date.now() - t0;
    ok(browser.ok, "the browser backend runs", browser.ok ? `${browser.adapter?.vendor}/${browser.adapter?.architecture}` : browser.reason);

    ok(native.adapter.vendor === browser.adapter?.vendor &&
       native.adapter.architecture === browser.adapter?.architecture,
       "*** both report the SAME ADAPTER -- it is one rasteriser reached two ways ***",
       `${native.adapter.vendor}/${native.adapter.architecture}`);

    let same = 0, firstDiff = -1;
    for (let i = 0; i < OUT; i++) {
        if (native.values[i] === browser.values[i]) same++;
        else if (firstDiff < 0) firstDiff = i;
    }
    ok(same === OUT, "*** every one of the returned floats is BYTE-IDENTICAL across the two backends ***",
       same === OUT ? `${same} of ${OUT}` : `${same} of ${OUT}, first difference at index ${firstDiff}`);
}

// ---------------------------------------------------------------------------------------------------------
sec("3. AND THE COMPARISON CAN FAIL, SO SECTION 2 IS A MEASUREMENT");
// ---------------------------------------------------------------------------------------------------------
{
    // Same shader, one different seed. If THIS came back identical the equality above would be a fact about
    // the comparison rather than about the backends -- v4290's silhouette band, one layer up.
    const other = await HG.runWgslComputeNative({ code: CODE, outCount: OUT, uniforms: lcgUniforms(SEED + 1, N), workgroups: WG });
    ok(other.ok, "a second native run with a different seed completes");
    let diff = 0;
    for (let i = 0; i < OUT; i++) if (other.values[i] !== browser.values[i]) diff++;
    ok(diff > OUT / 2, "*** CONTROL: a different seed disagrees with the browser run on most values ***",
       `${diff} of ${OUT} differ -- the equality in section 2 was not free`);

    // And the native result must satisfy the SAME arithmetic facts v4290 established through the browser.
    const cpu = lcgStatesCpu(SEED, N), f64 = lcgValuesCpu(cpu);
    let states = 0, brackets = 0;
    for (let i = 0; i < N; i++) {
        if (unpackState(native.values[i * 3], native.values[i * 3 + 1]) === cpu[i]) states++;
        if (bracketsF64(native.values[i * 3 + 2], f64[i])) brackets++;
    }
    ok(states === N, "the u32 state sequence is exact natively, as it was in the browser", `${states} of ${N}`);
    ok(brackets === N, "and every value still brackets the f64 answer, which is the WGSL contract", `${brackets} of ${N}`);
}

// ---------------------------------------------------------------------------------------------------------
sec("4. THE EXIT HAZARD IS REAL, AND ITS EXACT CONDITION IS SPAWNED RATHER THAN ASSERTED");
// ---------------------------------------------------------------------------------------------------------
{
    // THE FIRST VERSION OF THIS SECTION WENT RED FOR THE RIGHT REASON. It claimed any natural exit after
    // requesting a device aborts, spawned a child that used runWgslComputeNative, and got status 0 -- because
    // that harness keeps its device LOCAL. The claim was too wide, and only a spawned process could show it.
    // Three shapes now, because the difference between them IS the finding.
    const mod = JSON.stringify(path.join(HERE, "headlessGpu.mjs"));
    const prelude = `const HG = await import(${mod}); HG.configureVulkanIcd();
        const { create } = HG.resolveWebgpu().mod;`;
    // A device pinned at module scope -- reachable when the process ends.
    const holds = `${prelude}
        const dev = await (await create([]).requestAdapter()).requestDevice();
        console.log("WORK_OK:" + !!dev);`;
    // The harness, whose device is a local and is gone before it returns.
    const harness = `${prelude}
        const r = await HG.runWgslComputeNative({ code: ${JSON.stringify(CODE)}, outCount: 3,
            uniforms: new Float32Array(64), workgroups: 1 });
        console.log("WORK_OK:" + r.ok);`;
    const run = (body, tail) => spawnSync(process.execPath, ["--input-type=module", "-e", body + "\n" + tail],
                                          { encoding: "utf8", timeout: 180000 });

    const held = run(holds, "/* exit naturally, still holding the device */");
    const heldClean = run(holds, "HG.exitCleanly(0);");
    const local = run(harness, "/* exit naturally; the harness released its device */");

    ok(/WORK_OK:true/.test(held.stdout), "the child holding a device COMPLETES ITS WORK",
       "which is the whole trap: the numbers are right and the process still dies");
    // NOT PINNED TO SIGABRT. Sabotage C caught this child dying with SIGSEGV instead, so the signal Dawn
    // happens to die by is not stable -- and a check that named one of them would flake on a clean run for a
    // reason having nothing to do with what it is testing. The claim that matters is that it does NOT exit 0.
    ok(held.status !== 0,
       "*** and a REACHABLE DEVICE at exit CRASHES the process, after a correct result ***",
       `status=${held.status} signal=${held.signal} -- the signal varies (SIGABRT and SIGSEGV both seen); the non-zero exit does not`);
    ok(/WORK_OK:true/.test(heldClean.stdout) && heldClean.status === 0,
       "*** exitCleanly() ends that same shape with status 0 ***",
       `status=${heldClean.status} signal=${heldClean.signal}`);
    ok(held.status !== heldClean.status,
       "the two differ, so the mitigation is load-bearing rather than decoration",
       `${held.status} vs ${heldClean.status} -- a guard nobody has watched fail is not known to do anything`);
    ok(/WORK_OK:true/.test(local.stdout) && local.status === 0,
       "*** and runWgslComputeNative is safe BY CONSTRUCTION -- natural exit, status 0, no guard needed ***",
       `status=${local.status} -- its device is a local and is released before the call returns`);
    ok(HG.EXIT_HAZARD.condition.includes("REACHABLE") &&
       HG.EXIT_HAZARD.firstDraftWasWrong.includes("narrowed"),
       "and the record states the NARROWED condition, and that it was narrowed",
       "a hazard recorded more widely than it was measured is a claim, not a finding");
}

// ---------------------------------------------------------------------------------------------------------
sec("5. NOW THE TIMING, WHICH IS OVERHEAD AND NOT GPU WORK");
// ---------------------------------------------------------------------------------------------------------
{
    ok(tNative < tBrowser, "*** the native call is faster than the browser call, this run ***",
       `${tNative} ms native vs ${tBrowser} ms browser`);
    ok(HG.MEASURED.whatIsTimed.includes("not GPU work"),
       "and the record says plainly that this is HARNESS overhead",
       "the adapter is a software rasteriser on both sides, so a GPU timing here would mean nothing");
    ok(Math.min(...HG.MEASURED.chromiumPerCallMs) > Math.max(...HG.MEASURED.nativeColdProcessMs),
       "the recorded ranges do not overlap: the slowest native cold process beats the fastest browser call",
       `browser ${Math.min(...HG.MEASURED.chromiumPerCallMs)}-${Math.max(...HG.MEASURED.chromiumPerCallMs)} ms, ` +
       `native cold ${Math.min(...HG.MEASURED.nativeColdProcessMs)}-${Math.max(...HG.MEASURED.nativeColdProcessMs)} ms`);
}

// ---------------------------------------------------------------------------------------------------------
sec("6. WHAT IS NOT SOLVED IS SAID IN THE MODULE, NOT ONLY HERE");
// ---------------------------------------------------------------------------------------------------------
{
    const src = (await import("node:fs")).readFileSync(path.join(HERE, "headlessGpu.mjs"), "utf8");
    ok(/WebGL2 IS UNCHANGED AND STILL NEEDS CHROMIUM/.test(src),
       "*** the module says WebGL2 still needs a browser ***",
       "Dawn is WebGPU only; renderGlslToPixels and renderThreePassToPixels are untouched");
    ok(typeof runWgslCompute === "function",
       "and the browser harness is still imported and used here rather than retired",
       "this is a second backend, not a replacement -- the GLSL gates keep launching chromium");
    ok(HG.LICENCES.nodeWebgpu.licence === "MIT" && HG.LICENCES.swiftShader.licence === "Apache-2.0",
       "the two licences are recorded, and they are not the same one",
       `${HG.LICENCES.nodeWebgpu.npm} MIT, SwiftShader Apache-2.0`);
    ok(HG.LICENCES.nodeWebgpu.vendored === false && HG.LICENCES.swiftShader.vendored === false,
       "*** and NEITHER is vendored -- the driver is reached by path inside Playwright's own bundle ***",
       "no file is copied into this repository, so no distribution obligation is added");
    const icdBefore = process.env.VK_ICD_FILENAMES;
    process.env.VK_ICD_FILENAMES = "/somebody/elses/choice.json";
    const res = HG.configureVulkanIcd();
    ok(res.chosen === false && res.path === "/somebody/elses/choice.json",
       "*** an explicit VK_ICD_FILENAMES is never overridden ***",
       "somebody who set it meant it -- a real GPU, a debug driver -- and redirecting them would silently change what every number describes");
    if (icdBefore) process.env.VK_ICD_FILENAMES = icdBefore; else delete process.env.VK_ICD_FILENAMES;
}

// ---- SABOTAGE LOG ---------------------------------------------------------------------------------------
//
//   A  ICD_LEAF renamed, so discovery finds no Vulkan driver.
//      -> exit=1 at the skip gate, and the reason SEPARATES the two facts correctly: "node-webgpu resolved but
//      there is no Vulkan driver". That is browserSkipReason's rule -- report each fact on its own evidence
//      rather than guessing which half is missing -- reproduced here and working the first time.
//
//   B  the harness leaks its device to a module-scope variable, so it stops being safe by construction.
//      -> *** exit=134, AND THE GATE DIED MID-RUN RATHER THAN REPORTING. *** It printed nine PASS lines and
//      aborted inside section 2, at the moment Playwright spawned a browser -- so a reachable device does not
//      merely poison the exit, it destabilises the process while it is still working. A runner reading exit
//      codes still sees failure, which is the safe direction, but the gate cannot say why. Logged because a
//      sabotage that kills the instrument is a different result from one it diagnoses.
//
//   C  configureVulkanIcd stops honouring an explicit VK_ICD_FILENAMES.
//      -> exit=1, 2 red. One is the intended check. *** THE OTHER WAS A BRITTLE ASSERTION OF MINE, and the
//      sabotage is what found it: *** the held-device child died with SIGSEGV where every clean run had
//      produced SIGABRT, and section 4 was pinned to SIGABRT. The signal Dawn dies by is not stable; only the
//      non-zero exit is. The check now asserts that and says so, which also removes a flake that had nothing
//      to do with the thing being tested.
//
// A found the diagnosis working, B found that the worst version of this bug kills the instrument, and C found
// a brittle assertion in the gate itself. None went 0 RED.
// ================================================================================================
// *** v4573 -- THE TEXTURE PATH'S ARITHMETIC, WHICH THIS GATE HAS SHIPPED AND NEVER NAMED. ***
//
// definitionGates' census found these four exports unmentioned by any gate that imports this module:
// BYTES_PER_TEXEL, paddedBytesPerRow, halfToDouble and ICD_ROOT. They are not obscure -- they are the
// arithmetic that turns a read-back texture into numbers, and v4572's closing listed the texture path as the
// thing it could not check. A wrong bytes-per-row shears the image by a few texels per row, which reads as a
// shader defect; a wrong half decode reads as a backend divergence. Both are decided here, in eight lines of
// integer and bit arithmetic that nothing has ever exercised.
sec("9. THE TEXTURE READ-BACK ARITHMETIC");
{
    // BYTES_PER_TEXEL is four channels times the channel width, and saying it that way is the check: the
    // table is derivable, so a typo in it disagrees with its own definition rather than merely looking odd.
    ok(HG.BYTES_PER_TEXEL.rgba8unorm === 4 * 1 && HG.BYTES_PER_TEXEL.rgba16float === 4 * 2,
        "BYTES_PER_TEXEL is four channels times the channel width, not a remembered pair of numbers",
        `rgba8unorm ${HG.BYTES_PER_TEXEL.rgba8unorm} = 4x1, rgba16float ${HG.BYTES_PER_TEXEL.rgba16float} = 4x2`);
    // WebGPU requires every copyTextureToBuffer row to start on a 256-byte boundary. The padding is where a
    // reader shears an image, so the key is the alignment itself plus the smallest row that already meets it.
    const P = (n, f) => HG.paddedBytesPerRow(n, f);
    ok([[64, "rgba8unorm", 256], [40, "rgba8unorm", 256], [40, "rgba16float", 512],
        [32, "rgba16float", 256], [1, "rgba8unorm", 256]].every(([n, f, want]) => P(n, f) === want),
        "paddedBytesPerRow rounds UP to the 256-byte boundary copyTextureToBuffer requires",
        `40x rgba8unorm: 160 raw -> ${P(40, "rgba8unorm")}; 40x rgba16float: 320 raw -> ${P(40, "rgba16float")}`);
    ok([[64, "rgba8unorm"], [32, "rgba16float"]].every(([n, f]) => P(n, f) === n * HG.BYTES_PER_TEXEL[f]),
        "  and a row that is ALREADY aligned is returned unpadded, so the function is not simply a constant",
        `64x rgba8unorm and 32x rgba16float are both exactly 256`);
    // The unknown-format fallback is 4 bytes, and it is invisible at any n where 4 and 8 pad to the same
    // multiple -- 64 is exactly that n, which is why the distinction is taken at 40.
    ok(P(40, "nope") === P(40, "rgba8unorm") && P(40, "nope") !== P(40, "rgba16float"),
        "  and an unknown format falls back to four bytes a texel, checked at a width where four and eight DIFFER",
        `40: unknown ${P(40, "nope")}, rgba8unorm ${P(40, "rgba8unorm")}, rgba16float ${P(40, "rgba16float")}`);
    // *** THE HALF DECODE, KEYED ON ITS OWN MANTISSA RATHER THAN ON A PICKED TOLERANCE. *** rgba16float has
    // ten mantissa bits, so a round trip through it can lose at most one part in 2^11. MEASURED over 2000
    // values: 4.685e-4 against that bound of 4.883e-4 -- under it, and close enough to it that a decode
    // reading the exponent one bit wrong could not hide there.
    let worst = 0, at = 0;
    for (let i = 0; i < 2000; i++) {
        const v = (i - 1000) / 137;
        if (v === 0) continue;
        const e = Math.abs(HG.halfToDouble(HG.doubleToHalf(v)) - v) / Math.abs(v);
        if (e > worst) { worst = e; at = v; }
    }
    ok(worst < Math.pow(2, -11),
        "*** halfToDouble inverts doubleToHalf to within the format's OWN mantissa, 2^-11, over 2000 values ***",
        `worst ${worst.toExponential(3)} at ${at.toFixed(4)}, bound ${Math.pow(2, -11).toExponential(3)}`);
    ok(HG.halfToDouble(HG.doubleToHalf(0.5)) === 0.5 && HG.halfToDouble(HG.doubleToHalf(-0.5)) === -0.5,
        "  and it is EXACT for a value the format represents, sign included -- so the bound above is the format's and not the decoder's slack",
        "0.5 and -0.5 round trip bit for bit");
    // The three branches an exponent field can take. A decoder that dropped the denormal case would pass
    // every row above, because the sweep never reaches 2^-14.
    ok(HG.halfToDouble(1) === Math.pow(2, -14) * (1 / 1024) &&
       HG.halfToDouble(0x7c00) === Infinity && Number.isNaN(HG.halfToDouble(0x7e00)),
        "  and all three exponent branches are reached: the denormal at e=0, infinity at e=31 m=0, NaN at e=31 m!=0",
        `denormal ${HG.halfToDouble(1).toExponential(3)}, ${HG.halfToDouble(0x7c00)}, NaN ${Number.isNaN(HG.halfToDouble(0x7e00))}`);
    // ICD_ROOT decides where the Vulkan ICD is looked for. It reads an env var with a fallback, and the
    // fallback is the container's real path -- so the check is the PRECEDENCE, which is the part that breaks.
    ok(HG.ICD_ROOT === (process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers"),
        "ICD_ROOT takes PLAYWRIGHT_BROWSERS_PATH when the environment sets it and falls back to the image's path",
        `${HG.ICD_ROOT}${process.env.PLAYWRIGHT_BROWSERS_PATH ? " (from the environment)" : " (the fallback)"}`);
    ok(HG.ICD_LEAF === path.join("chrome-linux", "vk_swiftshader_icd.json"),
        "  and ICD_LEAF is the path under it that findVulkanIcds joins, named here beside the root it is joined to",
        HG.ICD_LEAF);
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: ANY GPU WORTH THE NAME. Both backends land on the same software rasteriser, so " +
    "nothing above says how Dawn behaves on real hardware, where the driver -- not the harness -- decides the " +
    "numbers. Also unchecked: every WGSL gate in the tree still calls the browser harness; this round builds " +
    "the second backend and proves it agrees, and moving the callers over is a separate change with its own " +
    "risk. And WebGL2 is untouched: the GLSL gates need a browser and still launch one.");
HG.exitCleanly(fails ? 1 : 0);
