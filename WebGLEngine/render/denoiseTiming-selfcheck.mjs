// WebGLEngine/render/denoiseTiming-selfcheck.mjs -- the denoiser arc, round 12: what a pass costs on the device
//
// Run: node render/denoiseTiming-selfcheck.mjs            (on the rig: node tools/ship/realGpuRun.mjs --only denoise)
//      node render/denoiseTiming-selfcheck.mjs --fxc-ladder --result <file>   (internal, round 19: r12 and r15 with use_dxc disabled)
//
// GATES the timing half of render/denoiseDevice.mjs (pre-registration section 37). Its exports, named here: TIMING_SIZES,
// largestBuffer, timingInput, summarize, adapterOf, timingDevice, timingLadder, and round 15's passBytes -- and the
// denoiser's time() and output(). Round 19 reads nativeSetsFor, FXC_UNBUILT_SETS and nativeAdapterKey from it, and
// tools/ship/headlessGpu.mjs's nativeCompiler, webgpuPackage and noteNativeAdapter, and render/denoiseCompile.mjs's dawnFlags.
// Sections 35-36 put round 11's network on the device and found every time SwiftShader's: a CPU running a JIT. This times
// the shipped network on a ladder of sizes, 64 x 64 up to a 1080p frame, two ways -- natively on node-webgpu's default
// adapter, and through denoise.html's own "Time the network" in Chromium -- and prints what it measured as "----" lines,
// which tools/ship/realGpuRun.mjs collects with the adapter each ran on.
// Round 13 (section 39): the ladder times BOTH kernel sets, r12 and the fast r13, on one device a size, taking turns, and
// prints r13's speedup over r12 at every size both measured -- section 39's K1, read off the rig's report. Asserted: the
// sets took turns in the stated order, they are different kernels, and the speedup is the two medians' ratio on the
// clock it names. Not asserted: its size.
// Round 15 (section 46): four sets on the page, and r12, r14 and r15 natively; r15's head and kernel are one pass, so the
// ladder also prints that pass against r14's two, and each set's buffers at each size.
// Round 16 (section 54) put r12, r15, r16a and r16b on both ladders (TIMED_SETS). Section 57 withdrew r16a and r16b --
// node-webgpu's FXC never built their kernel on either GPU -- so both ladders now time r12 and r15.
// Round 18 (section 61): both ladders time r12, r15, r18t and r18u (TIMED_SETS) -- natively without the browser-only sets on a
// D3D12 adapter (nativeSetsFor), where node-webgpu's FXC stopped on one's kernel and crashed on the other's (section 60); and
// the native ladder's device has an unrounded clock, tools/ship/headlessGpu.mjs's FINE_CLOCK_FLAG: Dawn otherwise rounds every
// timestamp down to a whole 65,536 ns, as it did in every native time of round 17's probes. The page's report carries its
// adapter's key (pageKey), which section 61's rule fills render/denoiseDevice.mjs's PAGE_KERNELS_BY_ADAPTER by.
// Round 19 (section 66): the native ladder's sets follow its COMPILER, read off the package with the device's own flags
// (nativeCompiler; nativePlan below) -- on D3D12 under DXC, all four; under FXC, none named or one unread, r12 and r15, the
// FXC_UNBUILT_SETS left out. A SWEK_WEBGPU this box cannot load is a red, not a skip. The adapter is noted where realGpuRun reads
// adapters (noteNativeAdapter), with its key for section 66's NATIVE_KERNELS_BY_ADAPTER, and each native "rXX against r15" line
// is section 66's (the page's stays section 61's). Section 66's fourth test needs r15 under FXC: where the package ships DXC,
// this file runs ITSELF again (--fxc-ladder) -- r12 and r15, use_dxc disabled, its own process, since Dawn fixes a device's
// compiler when it is made -- and prints each round-18 set's DXC median against that r15 at the largest size both ladders
// measured, marked unpaired: two processes, one after the other, not section 39's turns. Where it does not (FXC as shipped,
// or not win32 -- this box), one SKIP says why; the child's flags, the plan and the unpaired line are pure rows here.
//
// *** WHAT IS ASSERTED IS THE TIMER, NOT THE TIME. *** On any device: the first size is measured; every time is a finite
// positive number; the device's clock, where it has one, nests inside the wall clock and each layer's span inside the
// device's; a size is skipped only for a stated reason; and timing changes nothing -- the image a timed pass wrote is an
// untimed run's, bit for bit. HOW LONG a pass takes is reported and never held to a number: on SwiftShader it is a CPU's,
// and on a GPU it is what the run is for.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------------
//   T1  time() reads the wall clock without awaiting the queue                   3 RED (the first draft of this ran 900 s and was
//       killed: the ladder trusted the clock it measured, read a slow device as fast and climbed to sizes that take minutes.
//       time() now spends its budget, and the ladder predicts, in a GUARD -- a 4-byte read-back that cannot land before the
//       work is done -- and the ladder has a 60 s budget of its own)
//   T2  a skip gives no reason                                                    2 RED
//   T3  each pass's timestamps read end-first                                     2 RED
//   T4  the timed passes dispatch one column of workgroups short                  2 RED (the image is not the untimed run's)
//   T5  the page names a software adapter without saying it is one               1 RED
//   T6  adapterOf ignores the spec's isFallbackAdapter                            1 RED
//   T7  largestBuffer sized by the first layer, not the 81-logit head             1 RED
//   T8  timingDevice never asks for timestamp queries                             2 RED
//   round 13, against the paired ladder:
//   F6  the r13 set never picks the fast kernel                                   2 RED (different-kernels, native and page)
//   F7  the sets never swap order between rounds                                  2 RED (the turns row, native and page)
//   F8  the speedup read off the wall clock where the device's exists             2 RED
//   F9  every set's denoiser built on the first set's kernels                     2 RED
//   round 14, against the three-set ladder:
//   S1  the r14 set never runs the head kernel                                    2 RED (different-kernels, native and page)
//   S2  the r14 set reads its planar logits with k_apply                          2 RED (the same two rows: the kinds name the apply)
//   round 15, against the four-set ladder and passBytes:
//   R6  the r15 set never fuses its head                                          3 RED (different-kernels, native and page; passBytes)
//   R7  passBytes counts the fused layer's logits                                 1 RED
//   R10 applyFor gives the fused set a separate k_apply                           2 RED (neither ladder builds)
//   round 16, against the ladders of TIMED_SETS while r16a and r16b were on them (also against render/denoiseDevice-selfcheck.mjs):
//   P5  the r16a set never picks the pixel-tiled kernel                         2 RED (different-kernels, native and page)
//   round 18, against the round-18 ladders, the native clock and the page's key (U1-U4 also against
//   render/denoiseDevice-selfcheck.mjs). Each restored, md5 verified:
//   U1  the r18t set never picks the pixel-tiled kernel                         2 RED (different-kernels, native and page)
//   U2  the r18u set never picks the written-out fast kernel                    2 RED (the same two)
//   U3  nativeSetsFor keeps every set on a D3D12 adapter                        1 RED (the sets row)
//   U4  isD3D12Native never sees D3D12                                          1 RED (the same row)
//   U9  the native ladder's device made without FINE_CLOCK_FLAG                 1 RED (the clock row: 165 of 165 device times on
//       the 65,536 ns grid -- section 60's finding, made on SwiftShader)
//   U13 the page's timing report without its adapter's key                      1 RED (the key row)
// v4851 -- ROUND 19'S ROWS, SABOTAGED. Each in this file, the gate run, restored byte-identical:
//   S6  the FXC child's flags as two disable entries                     -> RED: "the FXC child's device flags are ONE disable entry"
//   S7  the unpaired ratio read at the SMALLEST common size              -> RED: "read at the largest size BOTH ladders measured"
//   S8  every "rXX against r15" line tagged section 61                   -> RED: "each ... line is r15's median over the set's"
//   S9  nativePlan reading the compiler without the device's flags       -> RED: "a native run's plan is read off its package WITH ITS DEVICE'S FLAGS"
// v4868 -- ROUND 27 (section 83), against r27w on the ladders. Each restored byte-identical (md5):
//   Y1  render/denoiseDevice.mjs's kernelFor never picks the Winograd kernel -> 2 RED: "different kernels", natively and on the page
//   Y3  nativeSetsFor ignoring FXC_UNTRIED_SETS                              -> 2 RED: the ladders' sets row, the native plan row
//   Y7  every "r27w against rXX" line tagged section 61                      -> 1 RED: "each \"r27w against rXX\" line is that set's median"
// v4871 -- SECTION 87'S ROWS, SABOTAGED. Each in this file, the gate run on SwiftShader, restored by copy, md5 verified:
//   R1  fxcLadderSkip without the retirement (the plan's reason or null)  -> 1 RED: "section 87: the FXC ladder is retired"
//   R2  the gate's call site back to plan.fxcSkip                         -> 1 RED: "the gate decides the FXC ladder by fxcLadderSkip(plan)".
//       Off win32 the plan always skips, so only the source row sees it
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const { TIMING_SIZES, largestBuffer, passBytes, timingInput, summarize, adapterOf, timingLadder, decodeNet, KERNEL_SETS, TIMED_SETS, SUBGROUP_SETS, FXC_UNBUILT_SETS, FXC_UNTRIED_SETS, nativeSetsFor,
        isDxcCompiler, nativeAdapterKey } = await imp("render/denoiseDevice.mjs");
const { dawnFlags } = await imp("render/denoiseCompile.mjs");
const H = await imp("tools/ship/headlessGpu.mjs");
const { runInEngineOrigin } = await imp("tools/ship/webgpuHarness.mjs");
// v4838: each ladder as a report table (tools/ship/gateReport.mjs) -- the "----" lines the rig carries back, kept past the terminal
const { gateReport } = await imp("tools/ship/gateReport.mjs");
const REPORT = gateReport("render/denoiseTiming-selfcheck.mjs");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const t0 = Date.now();
const net = decodeNet(JSON.parse(fs.readFileSync(path.join(ENG, "render/denoise-net-r11.json"), "utf8")).net);
const CAP = 1500, QUANTUM = 0.2;   // the ladder's cap a pass, ms; a browser rounds timestamps to 0.1 ms, so nesting gets two quanta
// both ladders time TIMED_SETS (section 61); natively, nativeSetsFor() leaves out the FXC_UNBUILT_SETS on a D3D12 adapter whose
// compiler is not DXC (section 66) -- sections 43 and 46 timed r12, r14, r15 natively, section 57 r12 and r15
const GRID_NS = 65536;   // Dawn's timestamp quantum when timestamp_quantization is on (section 60)
const onGrid = (ms) => Math.round(ms * 1e6) % GRID_NS === 0;
// Round 19 (section 66): every native ladder's options but its budget -- the gate's ladder 600 s, the FXC child's 300 s, the
// child itself stopped at 420 s (FXC rebuilds every pipeline at every size: about 20-25 s of builds a size for r15 on the 1080)
const LADDER = { capMs: CAP, warmup: 1, minReps: 3, budgetMs: 1500 }, NATIVE_MS = 600000, FXC_MS = 300000, FXC_CHILD_MS = 420000;
// ROUND 35 (section 101): THE TRACE. On the GTX 1080 this gate has died inside the native ladder with no line, no FAIL and no
// exit code read: the ladder prints only once it returns, so nothing said where. Each step is now appended to a file,
// synchronously, BEFORE it runs, so a process that dies leaves its last step on disk. SWEK_TIMING_TRACE names the file;
// otherwise it is one in the temp directory, named for the process.
const TRACE_FILE = process.env.SWEK_TIMING_TRACE ? path.resolve(process.env.SWEK_TIMING_TRACE) : path.join(os.tmpdir(), `swek-denoise-timing-trace-${process.pid}.txt`);
const trace = (line) => { try { fs.appendFileSync(TRACE_FILE, `${((Date.now() - t0) / 1000).toFixed(3)} s  pid ${process.pid}  ${line}\n`); } catch {} };
// the FXC child's sets and device flags: r15 for section 66's fourth test, r12 so its K1 lines read as rounds 15's and 18's
// FXC ladders did; use_dxc disabled and the fine clock in ONE disable entry -- Dawn keeps the last of two entries with one key
// (section 49), so two would let it compile with DXC or round the clock -- and no dump_shaders, which would fill a timed child's stdout
const FXC_SETS = Object.freeze(["r12", "r15"]), FXC_FLAGS = dawnFlags(["disable-dawn-features=use_dxc", H.FINE_CLOCK_FLAG], { dump: false });
const FXC_CHILD = process.argv.includes("--fxc-ladder"), RESULT = process.argv.includes("--result") ? process.argv[process.argv.indexOf("--result") + 1] : null;

// what any ladder must be, wherever it ran: returns the rows that were measured
function holds(label, r) {
    const done = r ? r.rows.filter((x) => !x.skipped) : [];
    ok(`!! ${label}: the first size, ${TIMING_SIZES[0].join(" x ")}, measured; every time finite and positive; every skip says why`,
        !!r && done.length >= 1 && !r.rows[0].skipped && done.every((x) => [...x.raw.wall, ...(x.raw.gpu || [])].every((v) => Number.isFinite(v) && v > 0)) &&
        r.rows.filter((x) => x.skipped).every((x) => /over the .* cap|over the adapter's limit|budget is spent/.test(x.reason || "")),
        r ? `${done.length} of ${r.rows.length} sizes measured on ${r.adapter?.name}` : "no ladder");
    // the device's clock nests inside the wall clock, and each pass inside the device's span
    // -- pass by pass, within each timed pass: the medians of the parts are from different passes and need not add up
    // -- and the wall clock inside the guard (a read-back that cannot land before the work is done)
    const nests = done.every((x) => x.raw.wall.every((w, i) => w <= x.raw.elapsed[i] + QUANTUM) && (!x.timestamps || x.raw.gpu.every((g, i) => g <= x.raw.wall[i] + QUANTUM &&
        x.raw.perPass[i].every((q) => q >= 0) && x.raw.perPass[i].reduce((a, q) => a + q, 0) <= g + QUANTUM * x.raw.perPass[i].length)));
    ok(`!! ${label}: the wall clock sits inside the guard, and where the device has timestamp queries its span inside the wall clock and the passes inside its span`, !!r && nests,
        done.map((x) => (x.timestamps ? "timestamps" : "wall only")).join(", "));
    ok(`  ${label}: and timestamp queries were asked for wherever the adapter offers them -- a run without them says less than it could`,
        !!r && done.every((x) => x.timestamps === r.adapter.timestamps), `the adapter ${r?.adapter?.timestamps ? "offers" : "does not offer"} them`);
    ok(`!! ${label}: timing changes nothing -- the image a timed pass wrote is an untimed run's, bit for bit`, !!r && r.invisible === true);
    // a size is skipped by the cap only when the last measured pass, scaled by pixels, really predicts past it
    let last = null, capped = true;
    for (const x of r ? r.rows : []) {
        if (!x.skipped) { last = x; continue; }
        if (/cap/.test(x.reason)) capped &&= !!last && last.elapsed.median * (x.H * x.W) / (last.H * last.W) > CAP;
    }
    ok(`  ${label}: and the cap skips only the sizes the last measured pass predicts past ${CAP} ms`, capped);
    return done;
}
// the conv layers' multiply-adds a pixel, for a GFLOP/s figure beside each measured size (section 38's arithmetic)
const MACS = net.layers.map((L) => L.Cin * L.Cout * L.k * L.k);
function report(label, r) {
    if (!r) return;
    say(`${label}: adapter ${r.adapter.name}${r.adapter.software ? " -- SOFTWARE: these are a CPU's times, not a GPU's" : " (hardware)"}`);
    REPORT.table(`${label}: ms a pass by kernel set and size, on ${r.adapter.name}${r.adapter.software ? " (software: a CPU's times)" : ""}`,
        ["set", "W", "H", "wall median ms", "device median ms", "passes", "Mpx/s"],
        r.sets.flatMap((s) => r.rows[s].filter((x) => !x.skipped).map((x) => [s, x.W, x.H, x.wall.median, x.gpu ? x.gpu.median : null, x.wall.n, x.mpxPerS])));
    if (r.rows.r15) {
        const vs = r.sets.filter((s) => /^r18/.test(s)).flatMap((B) => r.rows[B].map((b, i) => [B, b, r.rows.r15[i]]).filter(([, b, a]) => !a.skipped && !b.skipped)
            .map(([B, b, a]) => [B, b.W, b.H, a.gpu && b.gpu ? a.gpu.median / b.gpu.median : a.wall.median / b.wall.median, a.gpu && b.gpu ? "device" : "wall"]));
        if (vs.length) REPORT.table(`${label}: each round-18 set against r15 -- r15's median over the set's (${r15Section(label)})`, ["set", "W", "H", "x as fast as r15", "clock"], vs);
    }
    for (const s of r.sets) for (const x of r.rows[s]) {
        if (x.skipped) { say(`${label} ${s}: ${x.W} x ${x.H} skipped -- ${x.reason}`); continue; }
        // a set whose head is fused with the kernel (r15) has no pass that is the head alone: its GFLOP/s is the hidden layers'
        const fusedHead = x.passes.length === MACS.length, nConv = fusedHead ? MACS.length - 1 : MACS.length;
        const convMs = x.perPass ? x.perPass.slice(0, nConv).reduce((a, q) => a + q.ms, 0) : null;
        say(`${label} ${s}: ${x.W} x ${x.H}: ${x.wall.median.toFixed(3)} ms a pass (10th-90th ${x.wall.p10.toFixed(3)}-${x.wall.p90.toFixed(3)}, ${x.wall.n} passes)` +
            (x.gpu ? `; on the device's clock ${x.gpu.median.toFixed(3)} ms` : "; no timestamp queries") + `; ${x.mpxPerS.toFixed(3)} Mpx/s` +
            (convMs ? `; conv${fusedHead ? " (hidden layers)" : ""} ${(x.H * x.W * 2 * MACS.slice(0, nConv).reduce((a, b) => a + b, 0) / (convMs / 1000) / 1e9).toFixed(1)} GFLOP/s` : "") +
            `; ${(passBytes(net, x.H, x.W, s) / 2 ** 20).toFixed(0)} MiB of buffers` +
            (x.perPass ? `; ${x.perPass.map((q) => q.name.replace(/ \(.*\)/, "") + " " + q.ms.toFixed(3)).join(", ")}` : ""));
    }
    // round 15 (section 46): r15's one pass of head and kernel against r14's head and k_apply_fast, where both measured
    if (r.rows.r14 && r.rows.r15) r.rows.r15.forEach((b, i) => {
        const a = r.rows.r14[i];
        if (a.skipped || b.skipped || !a.perPass || !b.perPass) return;
        const two = a.perPass[4].ms + a.perPass[5].ms, one = b.perPass[4].ms;
        say(`${label}: r15's head and kernel in one pass at ${b.W} x ${b.H}: ${one.toFixed(3)} ms, against r14's head ${a.perPass[4].ms.toFixed(3)} + k_apply_fast ${a.perPass[5].ms.toFixed(3)} = ${two.toFixed(3)} ms -- ${(two / one).toFixed(2)} x`);
    });
    for (const [B, qs] of Object.entries(r.speedup)) for (const q of qs) if (q.measured)
        say(`${label}: ${B} against ${r.sets[0]} at ${q.W} x ${q.H}: ${q.ratio.toFixed(2)} x as fast, on the ${q.clock === "device" ? "device's clock" : "wall clock"}`);
    // round 18 (section 61): each round-18 set against r15 at every size both measured -- the ratio section 61's page rule reads,
    // and since round 19 the native ladder's for section 66's third test (vsR15Line tags it by label)
    if (r.rows.r15) for (const B of r.sets.filter((s) => /^r18/.test(s))) r.rows[B].forEach((b, i) => {
        const a = r.rows.r15[i];
        if (a.skipped || b.skipped) return;
        say(vsR15Line(label, B, b, a));
    });
    // v4868 -- round 27 (section 83): r27w against r15 and against each round-18 set -- what each GPU runs today, natively under DXC
    // and on the page -- at every size both measured, A's median over r27w's: the ratios section 83's rule reads
    if (r.rows.r27w) {
        const vs = [];
        for (const A of r.sets.filter((s) => s === "r15" || /^r18/.test(s))) r.rows.r27w.forEach((b, i) => {
            const a = r.rows[A][i];
            if (a.skipped || b.skipped) return;
            say(vsSetLine(label, "r27w", A, b, a));
            vs.push([A, b.W, b.H, a.gpu && b.gpu ? a.gpu.median / b.gpu.median : a.wall.median / b.wall.median, a.gpu && b.gpu ? "device" : "wall"]);
        });
        if (vs.length) REPORT.table(`${label}: r27w against r15 and each round-18 set -- that set's median over r27w's (section 83)`, ["against", "W", "H", "x as fast", "clock"], vs);
    }
    // round 40 (section 108): r40s against r15 and each round-18 set at every size both measured -- r18t's ratio is what section 108's rule reads
    if (r.rows.r40s && r.rows.r40s.some((x) => !x.skipped)) {
        const vs = [];
        for (const A of r.sets.filter((s) => s === "r15" || /^r18/.test(s))) r.rows.r40s.forEach((b, i) => {
            const a = r.rows[A][i];
            if (a.skipped || b.skipped) return;
            say(vsSetLine(label, "r40s", A, b, a, "section 108"));
            vs.push([A, b.W, b.H, a.gpu && b.gpu ? a.gpu.median / b.gpu.median : a.wall.median / b.wall.median, a.gpu && b.gpu ? "device" : "wall"]);
        });
        if (vs.length) REPORT.table(`${label}: r40s against r15 and each round-18 set -- that set's median over r40s's (section 108)`, ["against", "W", "H", "x as fast", "clock"], vs);
    } else if (r.rows.r40s) say(`${label}: r40s stands aside -- ${(r.rows.r40s[0] || {}).reason || "not measured"} (section 108)`);
}
// v4868 -- round 27 (section 83): set B's row `b` against set A's row `a` at one size: A's median over B's, on the device's clock where both have one
// round 40: tagged by the section whose rule reads it -- section 83's for r27w, section 108's for r40s
function vsSetLine(label, B, A, b, a, section = "section 83") {
    const dev = !!(a.gpu && b.gpu), ratio = dev ? a.gpu.median / b.gpu.median : a.wall.median / b.wall.median;
    return `${label}: ${B} against ${A} at ${b.W} x ${b.H}: ${ratio.toFixed(3)} x as fast, on the ${dev ? "device's clock" : "wall clock"} -- ${section}`;
}
// Round 19 (section 66): the rule an "rXX against r15" line is read by -- the page's, section 61's; a native ladder's, section 66's
const r15Section = (label) => (/^native\b/.test(label) ? "section 66" : "section 61");
// set B's row `b` against r15's row `a` at one size: r15's median over B's, on the device's clock where both have one
function vsR15Line(label, B, b, a) {
    const dev = !!(a.gpu && b.gpu), ratio = dev ? a.gpu.median / b.gpu.median : a.wall.median / b.wall.median;
    return `${label}: ${B} against r15 at ${b.W} x ${b.H}: ${ratio.toFixed(3)} x as fast, on the ${dev ? "device's clock" : "wall clock"} -- ${r15Section(label)}`;
}
// Round 19 (section 66, test 4): set B's median in the DXC ladder `dxc` against r15's in the FXC ladder `fxc`, at the LARGEST size
// (by pixels) that both measured -- B there under DXC, r15 there under FXC -- on the device's clock where both have one. The two
// ladders ran in two processes, one after the other, so this is unpaired (not section 39's turns) and the line says so. null --
// no line -- when no size is common, or either ladder is missing.
function vsFxc(dxc, fxc, B) {
    const done = (L, s) => (L && L.rows && L.rows[s] ? L.rows[s].filter((x) => !x.skipped) : []), fx = done(fxc, "r15");
    const both = done(dxc, B).map((b) => [b, fx.find((a) => a.W === b.W && a.H === b.H)]).filter(([, a]) => a);
    if (!both.length) return null;
    const [b, a] = both.reduce((m, p) => (p[0].W * p[0].H > m[0].W * m[0].H ? p : m));
    const dev = !!(a.gpu && b.gpu), ratio = dev ? a.gpu.median / b.gpu.median : a.wall.median / b.wall.median;
    return { W: b.W, H: b.H, ratio, clock: dev ? "device" : "wall",
        text: `native: ${B} against r15 under FXC at ${b.W} x ${b.H}: ${ratio.toFixed(3)} x as fast, on the ${dev ? "device's clock" : "wall clock"} -- unpaired: two processes, one after the other -- section 66` };
}
// what a PAIRED ladder must be, wherever it ran (section 39): both sets, each held as a ladder, taking turns in the stated
// order on one device, different kernels, and a speedup that is the ratio of the two medians on the clock it names
function pairedHolds(label, r, wantAll = KERNEL_SETS) {
    // round 40 (section 108): a set the adapter's features cannot build stood aside at every size, by name -- it is held to that, then
    // left out of the rows that ask every set to have measured
    const aside = r ? wantAll.filter((s) => SUBGROUP_SETS.includes(s) && r.rows[s] && r.rows[s].every((x) => x.skipped && /no subgroups feature/.test(x.reason || ""))) : [];
    for (const s of aside) console.log(`  SKIP  ${label} ${s}: ${r.rows[s][0].reason}`);
    const want = wantAll.filter((s) => !aside.includes(s));
    for (const s of want) holds(`${label} ${s}`, r ? { adapter: r.adapter, rows: r.rows[s], invisible: r.invisible[s] } : null);
    const A = want[0], others = want.slice(1);
    const turns = [...want, ...[...want].reverse(), ...want].join();
    // the sizes every set measured: there the sets took turns on one device, in the stated order
    const all = r ? r.rows[A].map((a, i) => want.map((s) => r.rows[s][i])).filter((xs) => xs.every((x) => !x.skipped)) : [];
    ok(`!! ${label}: every set (${want.join(", ")}) measured at the first size, on one device, taking turns -- ${turns.replace(/,/g, " ")} -- each set's passes pooled across the rounds`,
        !!r && r.sets.join() === wantAll.join() && all.length >= 1 && want.every((s) => !r.rows[s][0].skipped) &&
        // one shared turn order (compared by value: the page's ladder arrives as JSON)
        all.every((xs) => xs.every((x) => x.order.join() === turns && x.wall.n >= 3)),
        all.length ? `${all.length} size(s) with every set; ${all[0].map((x) => x.wall.n).join(", ")} passes at the first` : "none with every set");
    // what each set's layers run on, read off the pass names the ladder printed
    const kinds = { r12: "tiled,tiled,tiled,tiled,direct|apply", r13: "fast,fast,fast,fast,fast|apply", r14: "fast,fast,fast,fast,head|apply_fast",
                    r15: "fast,fast,fast,fast,head_apply|head_apply", r18t: "tile_inline,tile_inline,tile_inline,tile_inline,head_apply|head_apply",
                    r18u: "fast_unroll,fast_unroll,fast_unroll,fast_unroll,head_apply|head_apply", r27w: "wino,wino,wino,wino,head_apply|head_apply",
                    r40s: "fast,sub,sub,sub,head_apply|head_apply" };
    // the apply is the sixth pass, or -- r15, whose head and kernel are one pass -- the fifth's
    const kindOf = (x) => x.passes.slice(0, 5).map((n) => /\((\w+),/.exec(n)[1]).join() + "|" + (x.passes[5] ? /\((\w+)\)$/.exec(x.passes[5])[1] : /\((\w+),/.exec(x.passes[4])[1]);
    ok(`  ${label}: and they are different kernels -- ${want.map((s) => `${s} ${kinds[s]}`).join("; ")}`,
        !!r && want.every((s) => r.rows[s].filter((x) => !x.skipped).every((x) => kindOf(x) === kinds[s])),
        r ? want.map((s) => { const x = r.rows[s].find((y) => !y.skipped); return `${s}: ${x ? kindOf(x) : "none"}`; }).join("; ") : "");
    const right = !!r && others.every((B) => r.speedup[B] && r.speedup[B].length === r.rows[A].length && r.speedup[B].every((q, i) => {
        const a = r.rows[A][i], b = r.rows[B][i];
        if (a.skipped || b.skipped) return q.measured === false;
        const dev = !!(a.gpu && b.gpu);
        return q.measured && q.clock === (dev ? "device" : "wall") && q.ratio === (dev ? a.gpu.median / b.gpu.median : a.wall.median / b.wall.median) && q.ratio > 0;
    }));
    ok(`!! ${label}: each set's speedup at every size it and ${A} measured is ${A}'s median over its own, on the device's clock where both have one -- section 43's K1, read off the rig`, right,
        r ? others.map((B) => `${B}: ` + (r.speedup[B] || []).filter((q) => q.measured).map((q) => `${q.W} x ${q.H} ${q.ratio.toFixed(2)} x`).join(", ")).join("; ") : "");
}
// section 61: the flag reached the device -- with timestamps on a 1 ns grid, a whole number of 65,536 ns is a 1-in-65,536 chance a time
function clockRow(label, r, sets) {
    const ts = sets.flatMap((s) => r.rows[s].filter((x) => !x.skipped && x.timestamps).flatMap((x) => [...x.raw.gpu, ...x.raw.perPass.flat()]));
    if (!r.adapter.timestamps) console.log(`  SKIP  the ${label} clock's grain: this adapter offers no timestamp queries`);
    else ok(`!! section 61: the ${label} device's clock is not Dawn's rounded one -- not every time is a whole number of 65,536 ns, as every native time in round 17's probes was`,
        ts.length >= 10 && !ts.every(onGrid), `${ts.filter(onGrid).length} of ${ts.length} device times on the 65,536 ns grid`);
}

// Round 19 (section 66): WHAT A NATIVE RUN DOES ON A BOX, FROM WHAT IT HAS -- its compiler, read off the package with the
// device's own flags (tools/ship/headlessGpu.mjs's nativeCompiler: the adapter cannot say, its description is "D3D12 ..." under
// either compiler); the sets nativeSetsFor leaves it under that compiler; and whether the FXC ladder runs -- only where the
// compiler as shipped is DXC, so FXC is a SECOND compiler of the same package (fxcSkip null), else why not. Pure, so its D3D12
// branches are held in section 1 on stub adapters and packages: this box's SwiftShader takes neither.
function nativePlan({ adapter, pkg, platform, flags }) {
    const compiler = H.nativeCompiler({ pkg, platform, flags }), sets = nativeSetsFor(adapter, TIMED_SETS, { compiler });
    const fxcSkip = isDxcCompiler(compiler) ? null : compiler
        ? `the package's compiler as shipped is ${compiler} (node-webgpu ${pkg && pkg.version ? pkg.version : "version unread"}; ${!(pkg && pkg.dxcBeside) ? "no dxcompiler.dll beside dawn.node" :
            H.versionAtLeast(pkg.version, "0.6.2") ? "dxcompiler.dll beside dawn.node, use_dxc disabled by the device's flags" : "dxcompiler.dll beside dawn.node, but a Dawn before 0.6.2 forces use_dxc off (section 64)"}) -- the native ladder above is already FXC's`
        : `${platform} has no D3D compiler -- r15 under FXC is timed only where the package ships DXC, on win32 (the rig)`;
    return { compiler, sets, dropped: TIMED_SETS.filter((s) => !sets.includes(s)), fxcSkip };
}
// Section 87 (v4871): THE FXC LADDER RETIRED. Where nativePlan would run it (the package's compiler as shipped is DXC), it is
// skipped by default -- section 75 dropped condition 4, the only thing it fed, and it was about half the Intel's denoise run.
// SWEK_DENOISE_FXC=all runs it as before. Pure: the plan's own reason first, then the retirement's.
const FXC_RETIRED = "retired by section 87 (v4871) -- the denoiser's FXC paths fed condition 4 alone, which section 75 dropped; SWEK_DENOISE_FXC=all runs it";
function fxcLadderSkip(plan, env = process.env) {
    if (plan.fxcSkip) return plan.fxcSkip;
    return env.SWEK_DENOISE_FXC === "all" ? null : FXC_RETIRED;
}
// ONE native device a process, made here for both modes -- the gate's own ladder as shipped, and the FXC child's with FXC_FLAGS --
// so the file keeps one create call, its flags chosen by mode on that line (tools/ship/headlessGpu-selfcheck.mjs's census reads
// it for FINE_CLOCK_FLAG). The plan is read off the flags the device was made with, and `onPlan` sees it before any pipeline
// is built: under FXC, building r18t or r18u stops or crashes the process (section 60). The FXC child times FXC_SETS.
async function nativeLadder(W, { fxc = false, totalMs, onPlan = () => {} }) {
    H.configureVulkanIcd();
    let flags; const gpu = W.mod.create(flags = fxc ? FXC_FLAGS : [H.FINE_CLOCK_FLAG]);
    const adapter = await gpu.requestAdapter(), pkg = H.webgpuPackage(W.from);
    const plan = { ...nativePlan({ adapter, pkg, platform: process.platform, flags }), flags, pkg };
    if (fxc) plan.sets = [...FXC_SETS];
    onPlan(adapter, plan);
    trace(`native${fxc ? " FXC" : ""}: the ladder starts, sets ${plan.sets.join(",")}`);
    const r = await timingLadder(net, () => gpu.requestAdapter(), { sets: plan.sets, ...LADDER, totalMs, trace: (l) => trace(`native${fxc ? " FXC" : ""} ${l}`) });
    trace(`native${fxc ? " FXC" : ""}: the ladder returned`);
    return { plan, r };
}
// the FXC ladder, from the gate: this file again in a child (spawnSync, stopped at FXC_CHILD_MS), its ladder back through a file --
// on Windows a pipe can lose the last line a process writes (section 45; render/denoiseCompile-selfcheck.mjs's children)
function fxcLadder() {
    const resFile = path.join(os.tmpdir(), `swek-denoise-fxc-ladder-${process.pid}.json`), t = Date.now();
    try { fs.unlinkSync(resFile); } catch {}
    const c = spawnSync(process.execPath, [SELF, "--fxc-ladder", "--result", resFile], { cwd: ENG, encoding: "utf8", timeout: FXC_CHILD_MS, maxBuffer: 1 << 29 });
    let got = null; try { got = JSON.parse(fs.readFileSync(resFile, "utf8")); fs.unlinkSync(resFile); } catch {}
    const at = (c.stdout || "").lastIndexOf("@@RESULT ");
    if (!got && at >= 0) try { got = JSON.parse((c.stdout.slice(at + 9).split("\n")[0] || "").trim()); } catch {}
    return { ...(got || { error: c.error ? `the process was stopped: ${c.error.code || c.error.message}` : `no result (exit ${c.status}): ${(c.stderr || "").split("\n").slice(-3).join(" ").slice(0, 200)}` }),
             spawnMs: Date.now() - t };
}

// ---- ROUND 19 (section 66): THE FXC LADDER'S CHILD -- r12 and r15 with use_dxc disabled, one process, one compiler ----------
// The ladder goes to the --result file, written synchronously before anything is printed; stdout's line is the fallback.
if (FXC_CHILD) {
    let result;
    try {
        const W = H.resolveWebgpu(); if (W.refused) throw new Error(W.refused);
        const t = Date.now(), { plan, r } = await nativeLadder(W, { fxc: true, totalMs: FXC_MS });
        result = { ladder: r, compiler: plan.compiler, flags: plan.flags, version: plan.pkg && plan.pkg.version || null, ms: Date.now() - t };
    } catch (e) { result = { error: String(e && e.message || e).slice(0, 300) }; }
    if (RESULT) fs.writeFileSync(RESULT, JSON.stringify(result));
    console.log("@@RESULT " + JSON.stringify(result));
    H.exitCleanly ? H.exitCleanly(0) : process.exit(0);
}

console.log("1. THE LADDER'S ARITHMETIC");
{
    const s = summarize([5, 1, 4, 2, 3, 9, 7, 8, 6, 10]);
    ok("  summarize is nearest rank: the median, the 10th and the 90th of ten times", s.median === 5 && s.p10 === 1 && s.p90 === 9 && s.n === 10 && summarize([]) === null);
    ok("  the ladder runs from the trained 64 x 64 to a 1080p frame, each size more pixels than the last",
        TIMING_SIZES[0].join() === "64,64" && TIMING_SIZES.at(-1).join() === "1920,1080" && TIMING_SIZES.every((z, i) => !i || z[0] * z[1] > TIMING_SIZES[i - 1][0] * TIMING_SIZES[i - 1][1]));
    ok("  a pass's largest buffer is the head's 81 logits a pixel: 672 MB at 1080p, what a device's storage limit is checked against",
        largestBuffer(net, 1080, 1920) === 1920 * 1080 * 81 * 4 && largestBuffer(net, 64, 64) === 64 * 64 * 81 * 4);
    const px = 1920 * 1080;
    ok("  round 15: a pass's buffers are the input, every layer's output and the image -- and r15 allocates no logits, 81 channels a pixel fewer than r14",
        passBytes(net, 1080, 1920, "r14") === px * 4 * (10 + 4 * 32 + 81 + 3) && passBytes(net, 1080, 1920, "r15") === passBytes(net, 1080, 1920, "r14") - px * 81 * 4 &&
        passBytes(net, 1080, 1920, "r12") === passBytes(net, 1080, 1920, "r14"),
        `at 1080p: r14 ${(passBytes(net, 1080, 1920, "r14") / 2 ** 20).toFixed(0)} MiB, r15 ${(passBytes(net, 1080, 1920, "r15") / 2 ** 20).toFixed(0)} MiB`);
    const d3d = { info: { vendor: "nvidia", architecture: "pascal", description: "D3D12 driver version 32.0.15.8180" } }, vk = { info: { vendor: "google", architecture: "swiftshader", description: "Vulkan" } };
    // round 19 (section 66): by the run's compiler -- FXC, none named, or one a dump could not read keep round 18's two sets out on
    // D3D12; DXC (as nativeCompiler names it, or as a dump reads it) builds all four; Vulkan builds all four whatever is named
    const all = TIMED_SETS.join(), by = (ad, compiler) => nativeSetsFor(ad, TIMED_SETS, { compiler }).join();
    ok("  round 19: both ladders time r12, r15, r18t, r18u, (round 27) r27w and (round 40) r40s -- r12 first, the reference every speedup is read against -- and natively on a D3D12 adapter by the run's compiler: " +
        "under FXC, none named or one unread, r12 and r15 alone; under DXC all six; on Vulkan all six",
        all === "r12,r15,r18t,r18u,r27w,r40s" && TIMED_SETS.every((s) => KERNEL_SETS.includes(s)) && FXC_UNBUILT_SETS.join() === "r18t,r18u" && FXC_UNTRIED_SETS.join() === "r27w,r40s" &&
        by(d3d, "FXC") === "r12,r15" && by(d3d, null) === "r12,r15" && by(d3d, "unknown (no dump)") === "r12,r15" && nativeSetsFor(d3d, TIMED_SETS).join() === "r12,r15" &&
        by(d3d, "DXC") === all && by(d3d, "DXC (DXIL)") === all && by(vk, null) === all && by(vk, "FXC") === all && by({ info: {} }, null) === all,
        `D3D12: FXC ${by(d3d, "FXC")}, none ${by(d3d, null)}, DXC ${by(d3d, "DXC")}; Vulkan: ${by(vk, null)} -- section 60: node-webgpu 0.6.0's FXC stopped on r18t's kernel and crashed on r18u's; section 65: 0.6.2's DXC built both`);
    // round 19 (section 66): the plan a native run makes from its package and its device's flags, on stub D3D12 adapters and
    // packages -- the rig's branches, which this box's SwiftShader never takes
    const shipped = [H.FINE_CLOCK_FLAG], plan = (adapter, pkg, platform, flags) => nativePlan({ adapter, pkg, platform, flags });
    const p062 = plan(d3d, { version: "0.6.2", dxcBeside: true }, "win32", shipped), p060 = plan(d3d, { version: "0.6.0", dxcBeside: false }, "win32", shipped),
          p061 = plan(d3d, { version: "0.6.1", dxcBeside: true }, "win32", shipped), pUnread = plan(d3d, null, "win32", shipped),
          pChild = plan(d3d, { version: "0.6.2", dxcBeside: true }, "win32", FXC_FLAGS), pLinux = plan(vk, { version: "0.6.2", dxcBeside: true }, "linux", shipped);
    const says = (p) => `${p.compiler || "none"}: ${p.sets.join(",")}; FXC ladder ${p.fxcSkip ? "skipped" : "runs"}`;
    ok("!! round 19: a native run's plan is read off its package WITH ITS DEVICE'S FLAGS -- 0.6.2 shipping DXC on D3D12: DXC, all six sets, and the FXC ladder; 0.6.0, 0.6.1 with the DLL " +
        "copied beside, or a package unread: FXC, r12 and r15, no FXC ladder; the FXC child's own flags on 0.6.2: FXC; Linux: no D3D compiler, all six, no FXC ladder",
        p062.compiler === "DXC" && p062.sets.join() === all && p062.dropped.length === 0 && p062.fxcSkip === null &&
        [p060, p061, pUnread].every((p) => p.compiler === "FXC" && p.sets.join() === "r12,r15" && p.dropped.join() === "r18t,r18u,r27w,r40s" && /as shipped is FXC/.test(p.fxcSkip || "")) &&
        /before 0\.6\.2 forces use_dxc off/.test(p061.fxcSkip) && /no dxcompiler\.dll/.test(p060.fxcSkip) &&
        pChild.compiler === "FXC" && pChild.sets.join() === "r12,r15" && pLinux.compiler === null && pLinux.sets.join() === all && /linux has no D3D compiler/.test(pLinux.fxcSkip || ""),
        [p062, p060, p061, pUnread, pChild, pLinux].map(says).join("  /  "));
    // round 19 (section 66): the FXC child's device flags, as nativeLadder hands them to Dawn
    // section 87 (v4871): the FXC ladder retired -- skipped by default where the plan would run it, the plan's own reason kept
    // where it would not, and SWEK_DENOISE_FXC=all putting it back
    const sk = (p, env) => fxcLadderSkip(p, env);
    ok("!! section 87: the FXC ladder is retired -- 0.6.2 on D3D12 skips it by default with the retirement's reason and runs it under SWEK_DENOISE_FXC=all; 0.6.0 and linux keep their own reasons",
        sk(p062, {}) === FXC_RETIRED && sk(p062, { SWEK_DENOISE_FXC: "all" }) === null && sk(p062, { SWEK_DENOISE_FXC: "1" }) === FXC_RETIRED &&
        sk(p060, {}) === p060.fxcSkip && sk(p060, { SWEK_DENOISE_FXC: "all" }) === p060.fxcSkip && sk(pLinux, { SWEK_DENOISE_FXC: "all" }) === pLinux.fxcSkip && /section 87/.test(FXC_RETIRED),
        `0.6.2: ${sk(p062, {}) ? "skipped" : "runs"}, all: ${sk(p062, { SWEK_DENOISE_FXC: "all" }) ? "skipped" : "runs"}; 0.6.0: ${(sk(p060, {}) || "").slice(0, 40)}`);
    const dis = FXC_FLAGS.filter((f) => f.startsWith("disable-dawn-features=")), feats = dis.length ? dis[0].slice(dis[0].indexOf("=") + 1).split(",") : [];
    ok("!! round 19: the FXC child's device flags are ONE disable entry carrying use_dxc AND the fine clock, and no dump_shaders -- two entries would let Dawn keep the last (section 49), " +
        "compiling with DXC or rounding the clock; a dump would fill a timed child's stdout -- and the child times r12 and r15",
        FXC_FLAGS.length === 1 && dis.length === 1 && feats.includes("use_dxc") && feats.includes("timestamp_quantization") &&
        !FXC_FLAGS.some((f) => /dump_shaders/.test(f)) && FXC_SETS.join() === "r12,r15",
        JSON.stringify(FXC_FLAGS));
    // ...and the wiring that hands them to Dawn, read off this file: the FXC child never runs off win32, so no other row here sees
    // its device made with the gate's flags, its ladder run as the gate's, or the gate spawning it without the mode
    const SRC = fs.readFileSync(SELF, "utf8"), creates = [...SRC.matchAll(/\bmod\.create\(([^\n]*)/g)].map((m) => m[1]);
    const at0 = SRC.indexOf("\nif (FXC_CHILD) {"), child = at0 < 0 ? "" : SRC.slice(at0, SRC.indexOf("\n}\n", at0));
    ok("!! round 19: the file's ONE create call makes the FXC child's device with FXC_FLAGS and the gate's with the fine clock alone; the child -- spawned by the gate with --fxc-ladder " +
        "and its result file -- runs its ladder in that mode and writes the file",
        creates.length === 1 && /^flags = fxc \? FXC_FLAGS : \[H\.FINE_CLOCK_FLAG\]\);$/.test(creates[0]) &&
        /nativeLadder\(W, \{ fxc: true, totalMs: FXC_MS \}\)/.test(child) && /fs\.writeFileSync\(RESULT, /.test(child) &&
        /spawnSync\(process\.execPath, \[SELF, "--fxc-ladder", "--result", resFile\]/.test(SRC) && /\nconst FXC_CHILD = process\.argv\.includes\("--fxc-ladder"\), RESULT = /.test(SRC),
        `${creates.length} create call(s): create(${(creates[0] || "NONE").slice(0, 60)}; the child block ${child ? child.split("\n").length + " lines" : "NOT FOUND"}`);
    // section 87 (v4871): the gate asks fxcLadderSkip, not the plan alone -- off win32 the plan always skips, so no live row here
    // would see the retirement bypassed
    ok("  section 87: the gate decides the FXC ladder by fxcLadderSkip(plan), and spawns it only where that names no reason",
        /\n {8}const fxcWhy = fxcLadderSkip\(plan\);\n {8}if \(fxcWhy\) console\.log\(`  SKIP  native FXC ladder: \$\{fxcWhy\}`\);\n {8}else \{\n {12}const got = fxcLadder\(\)/.test(SRC) &&
        (SRC.match(/\bfxcLadder\(\)/g) || []).length === 2,
        `${(SRC.match(/\bfxcLadder\(\)/g) || []).length} mention(s) of the ladder's function, called (its definition and the one call)`);
    // round 19: an "rXX against r15" line is the page's rule's (section 61) or the native ladder's (section 66), by its label
    const row = (W, H_, ms, skipped = false) => (skipped ? { W, H: H_, skipped: true, reason: "over the 1500 ms cap" } : { W, H: H_, skipped: false, gpu: { median: ms }, wall: { median: ms * 1.25 } });
    const ln = { native: vsR15Line("native", "r18t", row(256, 256, 8), row(256, 256, 12)), page: vsR15Line("page", "r18u", row(256, 256, 8), row(256, 256, 12)),
                 fxc: vsR15Line("native FXC", "r18t", row(64, 64, 1), row(64, 64, 2)), wall: vsR15Line("native", "r18u", { ...row(64, 64, 2), gpu: null }, row(64, 64, 3)) };
    ok("!! round 19: each \"rXX against r15\" line is r15's median over the set's -- a native ladder's tagged section 66, the page's section 61",
        ln.native === "native: r18t against r15 at 256 x 256: 1.500 x as fast, on the device's clock -- section 66" && ln.page.endsWith("1.500 x as fast, on the device's clock -- section 61") &&
        ln.fxc.endsWith("-- section 66") && ln.wall === "native: r18u against r15 at 64 x 64: 1.500 x as fast, on the wall clock -- section 66",
        `${ln.native}  /  ${ln.page}`);
    // v4868 -- round 27 (section 83): r27w's lines against r15 and each round-18 set, tagged section 83 on either ladder
    const l27 = [vsSetLine("native", "r27w", "r18t", row(1920, 1080, 8), row(1920, 1080, 10)), vsSetLine("page", "r27w", "r18u", { ...row(1024, 1024, 4), gpu: null }, row(1024, 1024, 5))];
    ok("!! round 27: each \"r27w against rXX\" line is that set's median over r27w's, tagged section 83 on either ladder -- the ratio section 83's rule reads",
        l27[0] === "native: r27w against r18t at 1920 x 1080: 1.250 x as fast, on the device's clock -- section 83" && l27[1] === "page: r27w against r18u at 1024 x 1024: 1.250 x as fast, on the wall clock -- section 83",
        l27.join(" / "));
    // round 40 (section 108): r40s's lines, tagged section 108; and an adapter without subgroups names why r40s stands aside
    const l40 = vsSetLine("native", "r40s", "r18t", row(1920, 1080, 6), row(1920, 1080, 9), "section 108");
    ok("!! round 40: each \"r40s against rXX\" line is that set's median over r40s's, tagged section 108 -- the ratio section 108's rule reads -- and r27w's lines keep section 83",
        l40 === "native: r40s against r18t at 1920 x 1080: 1.500 x as fast, on the device's clock -- section 108" && vsSetLine("page", "r27w", "r15", row(64, 64, 2), row(64, 64, 3)).endsWith("-- section 83") &&
        SUBGROUP_SETS.join() === "r40s", l40);
    // round 19 (section 66, test 4): the unpaired line, at the largest size BOTH ladders measured -- here 256 x 256: the DXC ladder
    // measured r18t to 512, the FXC ladder r15 only to 256
    const dxcL = { rows: { r18t: [row(64, 64, 1), row(128, 128, 2), row(256, 256, 8), row(512, 512, 30), row(1024, 1024, 0, true)] } };
    const fxcL = { rows: { r15: [row(64, 64, 2), row(128, 128, 5), row(256, 256, 16), row(512, 512, 0, true), row(1024, 1024, 0, true)] } };
    const u = vsFxc(dxcL, fxcL, "r18t"), uw = vsFxc(dxcL, { rows: { r15: [{ ...row(64, 64, 3), gpu: null }] } }, "r18t");
    ok("!! round 19: r15 under FXC against a set under DXC is read at the largest size BOTH ladders measured, r15's FXC median over the set's DXC one, the line marked unpaired -- " +
        "and no line where no size is common",
        !!u && u.W === 256 && u.H === 256 && u.ratio === 2 && u.clock === "device" &&
        u.text === "native: r18t against r15 under FXC at 256 x 256: 2.000 x as fast, on the device's clock -- unpaired: two processes, one after the other -- section 66" &&
        !!uw && uw.W === 64 && uw.clock === "wall" && uw.ratio === 3 && /on the wall clock -- unpaired/.test(uw.text) &&
        vsFxc(dxcL, { rows: { r15: [row(64, 64, 0, true)] } }, "r18t") === null && vsFxc(dxcL, null, "r18t") === null && vsFxc(dxcL, fxcL, "r18u") === null &&
        vsFxc({ rows: { r18t: [row(64, 64, 0, true)] } }, fxcL, "r18t") === null,
        u ? u.text : "no line");
    ok("  a time is on Dawn's rounded grid when it is a whole number of 65,536 ns -- section 60's finding, read off round 17's native times",
        onGrid(0.131072) && onGrid(8.912896) && !onGrid(0.101376) && !onGrid(9.059328) && H.FINE_CLOCK_FLAG === "disable-dawn-features=timestamp_quantization");
    const a = timingInput(8, 16), b = timingInput(8, 16);
    ok("  the input is the same every time, in the network's ranges, with both sides of a mask",
        a.every((v, i) => v === b[i]) && a.length === 8 * 16 * 10 && new Set(Array.from({ length: 128 }, (_, p) => a[p * 10 + 9])).size === 2);
    ok("  an adapter is software by the spec's own flag, else by its name: SwiftShader is, a named GPU is not -- and it says whether it offers timestamps",
        adapterOf({ info: { vendor: "google", architecture: "swiftshader" } }).software === true && adapterOf({ info: { vendor: "nvidia", architecture: "pascal" } }).software === false &&
        adapterOf({ isFallbackAdapter: true, info: { vendor: "x" } }).software === true &&
        adapterOf({ info: {}, features: new Set(["timestamp-query"]) }).timestamps === true && adapterOf({ info: {}, features: new Set() }).timestamps === false);
}

// section 64 (round 19 here): a SWEK_WEBGPU this box cannot load is a red, not a skip -- as a skip the gate passed with no native
// row, and realGpuRun's report kept no trace of it (render/denoiseCompile-selfcheck.mjs's rule, for the same reason)
const W0 = H.resolveWebgpu();
const skip = W0.refused ? null : H.headlessGpuSkipReason();
let NATIVE_SETS = TIMED_SETS;
console.log("\n2. NATIVE: node-webgpu's default adapter (on the rig, the GPU)");
if (W0.refused) ok(`!! ${H.WEBGPU_ENV} names a node-webgpu package this box can load -- a refused one is a red here, never a skip`, false, W0.refused);
else if (skip) console.log("  SKIP  " + skip);
else {
    let r = null, err = null, plan = null, noted = null, key = null, vendor = null;
    // printed before the ladder, so a run that dies still names its trace
    say(`native: the trace is ${TRACE_FILE}`);
    try {
        // section 61: the device's clock unrounded -- Dawn otherwise rounds every timestamp down to a whole 65,536 ns.
        // round 14 (section 43): natively r12 against r14 -- r13's native failure is section 42's finding, and each native
        // fast pipeline cost minutes to build under the D3D12 compiler node-webgpu 0.6.0 ships -- with a 600 s ladder budget;
        // round 15 (section 46) adds r15, whose hidden layers are r14's; since section 57, r12 and r15; since section 61,
        // TIMED_SETS less what nativeSetsFor leaves out on this adapter; since section 66, by the compiler read off the package
        ({ r, plan } = await nativeLadder(W0, { totalMs: NATIVE_MS, onPlan: (adapter, p) => {
            plan = p; NATIVE_SETS = p.sets;
            // the rig's report names every adapter a gate ran on; this one is not reached through the browser harness, so it
            // says itself -- a "----" line realGpuRun keeps, and the SWEK_ADAPTER_LOG record it reads adapters from
            noted = H.noteNativeAdapter(adapter, { compiler: p.compiler });
            key = nativeAdapterKey(adapter.info, process.platform); vendor = (adapter.info && adapter.info.vendor) || null;
            // section 66's rule fills NATIVE_KERNELS_BY_ADAPTER by this key, read off this line in the rig's report
            say(`native: this adapter's key for section 66's table: ${key === null ? "none -- the adapter names no vendor" : key}`);
            say(`native: node-webgpu ${p.pkg && p.pkg.version ? p.pkg.version : "(version unread)"}${process.env[H.WEBGPU_ENV] ? " (" + H.WEBGPU_ENV + ")" : ""}; compiler, read off the package with this device's flags: ` +
                `${p.compiler || "none -- " + process.platform + " has no D3D compiler"}; sets timed: ${p.sets.join(", ")}`);
            for (const s of p.dropped)
                console.log(`  SKIP  native ${s}: a D3D12 adapter whose compiler, read off the package, is ${p.compiler || "unread (counted as FXC)"} -- ` +
                    (FXC_UNTRIED_SETS.includes(s) ? "its kernel has never been built under FXC (section 83); " : "node-webgpu's FXC does not build its kernel (section 60); ") +
                    "the page times it, and a package that ships DXC times it here (section 66)");
        } }));
    } catch (e) { err = String(e && e.message || e); }
    if (err) ok("!! the native ladder ran", false, err.slice(0, 200));
    else {
        // round 35: the trace holds this run's ladder, step by step -- a device asked for at every size it measured, and its end.
        // SABOTAGED round 35: timingLadder not tracing its requestDevice -> 1 red; the gate not handing timingLadder its trace -> 1 red;
        // restored, sha-256 identical.
        let tl = []; try { tl = fs.readFileSync(TRACE_FILE, "utf8").split("\n").filter((l) => l.includes(`pid ${process.pid}  native `) || l.includes(`pid ${process.pid}  native:`)); } catch {}
        const measured = [...new Set(NATIVE_SETS.flatMap((s) => r.rows[s].filter((x) => !x.skipped).map((x) => `${x.W}x${x.H}`)))];
        ok("  round 35: the trace holds the native ladder step by step -- its start, a device asked for at every size it measured, every set built there, and its return -- before each step ran",
            tl.length > 0 && /the ladder starts/.test(tl[0]) && /the ladder returned/.test(tl[tl.length - 1]) && tl.some((l) => /native ladder done/.test(l)) &&
            measured.every((sz) => tl.some((l) => l.includes(`native ${sz}: requestDevice`))) &&
            measured.every((sz) => NATIVE_SETS.every((st) => !r.rows[st].some((x) => !x.skipped && `${x.W}x${x.H}` === sz) || tl.some((l) => l.includes(`native ${sz}: build ${st}`)))),
            `${tl.length} lines in ${TRACE_FILE}; sizes measured ${measured.join(", ")}`);
        pairedHolds("native", r, NATIVE_SETS); report("native", r);
        clockRow("native", r, NATIVE_SETS);
        ok("  round 19: the adapter noted for the rig's report is the ladder's own -- its name and whether it is software -- and its key for section 66's table is this platform's, its vendor's and its architecture's",
            !!noted && noted.name === r.adapter.name && noted.software === r.adapter.software &&
            (vendor ? key !== null && key.startsWith(`${process.platform}/${vendor}/`) && /^[^/]+\/[^/]+\/[^/]*$/.test(key) : key === null),
            `${noted ? noted.name + (noted.software ? " (software)" : "") : "not noted"}; key ${key}`);
        // section 66, test 4: r15 under FXC -- only where the package ships DXC, so FXC is a second compiler of the same package
        console.log("\n2b. NATIVE, r15 UNDER FXC: the same package with use_dxc disabled, in a child process (section 66)");
        const fxcWhy = fxcLadderSkip(plan);
        if (fxcWhy) console.log(`  SKIP  native FXC ladder: ${fxcWhy}`);
        else {
            const got = fxcLadder(), L = got.ladder || null;
            ok("!! native FXC: the child timed r12 and r15 on this adapter with use_dxc disabled -- its compiler, read off the package with its own flags, FXC -- and reported its ladder",
                !got.error && !!L && got.compiler === "FXC" && JSON.stringify(got.flags) === JSON.stringify(FXC_FLAGS) && L.sets.join() === FXC_SETS.join() && L.adapter.name === r.adapter.name,
                got.error ? got.error : `${got.compiler}; ${JSON.stringify(got.flags)}; ${L ? L.adapter.name : "no ladder"}; ${(got.spawnMs / 1000).toFixed(0)} s`);
            if (L) {
                say(`native FXC: node-webgpu ${got.version || "(version unread)"} with ${got.flags.join(" ")}, in its own process after the native ladder -- compiler, read off the package with these flags: ${got.compiler}; ` +
                    `sets timed: ${L.sets.join(", ")}; ${(got.ms / 1000).toFixed(0)} s`);
                pairedHolds("native FXC", L, FXC_SETS); report("native FXC", L);
                clockRow("native FXC", L, FXC_SETS);
                for (const B of r.sets.filter((s) => /^r18/.test(s))) {
                    const v = vsFxc(r, L, B);
                    if (v) say(v.text); else console.log(`  SKIP  native: ${B} against r15 under FXC -- no size both ladders measured`);
                }
            }
        }
    }
}

console.log("\n3. THE PAGE: denoise.html's \"Time the network\", in Chromium (on the rig, the browser's GPU)");
{
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 600000, script: `async () => {
        const f = document.createElement("iframe"); f.style.width = "1200px"; f.style.height = "900px"; f.src = "/denoise.html"; document.body.appendChild(f);
        await new Promise((r) => f.onload = r);
        const d = f.contentDocument, $ = (id) => d.getElementById(id), wait = (ms) => new Promise((r) => setTimeout(r, ms));
        for (let i = 0; i < 100 && !$("time"); i++) await wait(50);
        $("time").click();
        const t = Date.now();
        while (Date.now() - t < 590000 && ($("time").disabled || !$("timeJson").textContent) && !/failed|no WebGPU/.test($("timeStatus").textContent)) await wait(100);
        return { status: $("timeStatus").textContent, json: $("timeJson").textContent, shown: $("timeTable").style.display !== "none" };
    }` });
    if (r.skipped) console.log("  SKIP  " + r.reason);
    else {
        let L = null; try { L = JSON.parse(r.result?.json || "null"); } catch {}
        ok("!! the page timed the network on its own device, showed the table, and named the adapter -- no page error",
            r.ok && !!L && r.result.shown && !r.pageErrors.length && r.result.status.includes(L.adapter.name) &&
            (L.adapter.software ? /A SOFTWARE ADAPTER/.test(r.result.status) : !/SOFTWARE/.test(r.result.status)),
            r.ok ? (r.result?.status || "").slice(0, 160) : r.reason);
        if (L) {
            // the page's rows, as the gate's own ladder: raw times are kept for the rows above
            pairedHolds("page", L, TIMED_SETS); report("page", L);
            // section 61's rule fills PAGE_KERNELS_BY_ADAPTER by this key: the report carries it
            say(`page: this adapter's key for section 61's table: ${L.pageKey === null ? "none -- the browser reported no platform" : L.pageKey}`);
            ok("  round 18: the page's report carries its adapter's key -- platform, vendor and architecture -- or says it has none", "pageKey" in L &&
                (L.pageKey === null || /^[^/]+\/[^/]+\/[^/]*$/.test(L.pageKey)), String(L.pageKey));
            ok("  the page and the harness agree on what the device is", r.software === null || L.adapter.software === r.software, `harness says ${r.software ? "software" : "hardware"}`);
        }
    }
}

trace(`the gate ends, ${fails} fail(s)`);
console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: any number. What a pass costs is printed above and asserted nowhere -- on SwiftShader it is a CPU's, and " +
    "on a GPU it is what tools/ship/realGpuRun.mjs carries back.");
REPORT.write();
H.exitCleanly ? H.exitCleanly(fails ? 1 : 0) : process.exit(fails ? 1 : 0);
