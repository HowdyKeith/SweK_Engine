// WebGLEngine/render/denoiseCompile-selfcheck.mjs -- the denoiser arc, round 14: where the native time goes
//
// Run: node render/denoiseCompile-selfcheck.mjs            (on the rig: node tools/ship/realGpuRun.mjs --only denoise)
//      node render/denoiseCompile-selfcheck.mjs --result <file> --child <variant> [dawn flags...]   (internal: one kernel, one compiler)
//
// Section 42: round 13's fast kernel ran its 81-logit head 1,900 times slower natively (node-webgpu, D3D12) than in Chrome,
// on the same WGSL, and building its pipelines natively took minutes. The node-webgpu package ships d3dcompiler_47.dll --
// FXC -- and not DXC's dxcompiler.dll and dxil.dll, without which Dawn's use_dxc switch does nothing; Chrome ships DXC. This
// gate is section 43's measurement A: for each kernel the denoiser runs, its pipeline's build time, its pass time at 64 x 64,
// and whether its output is exact, under each native compiler it can find and in the browser. It also counts, from Dawn's
// own shader dump, what each compiler made of each kernel.
// Round 15 (section 46) adds an eighth: k_head_apply, the head and the kernel apply in one pass, run on
// render/denoiseCompile.mjs's order probe -- a head whose products are exact and whose sums are not, so its image is
// within APPLY_TOL of the twin's only if the head added in the twin's order.
// Round 16 (section 54) added a ninth and a tenth, the pixel-tiled kernel at r16a's and r16b's configurations; on both GPUs
// FXC never finished building them, and the gate was stopped at realGpuRun's cap (section 56). Section 57 took them out of
// VARIANTS; tools/denoiseBuildProbe.mjs builds them, each in its own process under a cap.
// Round 18 (section 61): each native child's device has an unrounded clock, tools/ship/headlessGpu.mjs's FINE_CLOCK_FLAG --
// Dawn otherwise rounds every timestamp down to a whole 65,536 ns, as every native time in round 17's probes was -- and a row
// holds that the native passes are not all on that grid. Round 18's two page sets add no variant: their kernels are round 17's
// probe shapes, which FXC does not build (section 60).
// Round 19's probe (section 64): node-webgpu 0.6.2 is the first to ship dxcompiler.dll beside dawn.node, built with a Dawn that
// loads it. Where a package does, the native modes are render/denoiseCompile.mjs's nativeModes -- as shipped, use_dxc and
// use_dxc off, from the package alone, nothing copied -- so FXC and DXC are timed from one package and section 43's A1 is
// read off one run, from one summary line a mode. A package without DXC of its own runs as shipped alone: its Dawn forces
// use_dxc off, so the copied-DLL run sections 52-53 made was FXC under another name, and it is retired. SWEK_WEBGPU picks the
// package for a console (tools/ship/headlessGpu.mjs); one it cannot load is a red here, not a skip; the first native line
// names the package's version, and every dump file carries it.
//
// Each native measurement is its own process: one kernel, one adapter, one device, one compiler -- Dawn's dump goes to
// stdout, so a process apiece keeps each kernel's dump its own, and a compile that never finishes is killed, not waited on.
// Each run's dump says which compiler Dawn used: DXIL is DXC, DXBC is FXC. Until section 64 a "use_dxc" run copied DXC's two
// DLLs from a Chrome beside dawn.node and removed them after; no package without DXC of its own ever used them.
//
// *** WHAT IS ASSERTED IS THE INSTRUMENT, NOT THE TIME. *** Every kernel built or said why not; every output exact (a conv
// cell the twin's or the fused mirror's, the kernel apply within APPLY_TOL); every time finite and positive; the compiler
// each run used named from its dump; copied DLLs gone after. How long anything took is printed as "----" lines and held to
// nothing -- section 43's hypotheses are read off them in the report.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------------
//   H1  the head kernel sums its channels last-first                            2 RED (native as shipped, and the browser)
//   H2  the head kernel writes channels last, not planar                        2 RED
//   A1  k_apply_fast weighs taps across the emitter mask                        2 RED
//   A2  k_apply_fast's halo origin one pixel off                                2 RED
//   A3  k_apply_fast's barrier removed                                          2 RED
//   C1  the dump read from its last block, not the kernel's                     1 RED (the instrument row: Dawn's own timestamp
//       shader follows the kernel's, and reading it gave every kernel the same stats -- the first draft did exactly this)
//   H1-A3 also run against render/denoiseDevice-selfcheck.mjs, and H1-H2 against brain/conv2d-selfcheck.mjs; all
//   restored, md5 verified.
//   round 15, against k_head_apply on the order probe (each also against render/denoiseDevice-selfcheck.mjs):
//   R1  its head sums its channels last-first                                   2 RED (native and browser: the probe's 1.28e-1)
//   R2  it weighs taps across the emitter mask                                  2 RED
//   R3  it reads each tap's colour one column right                             2 RED
//   R4  its barrier removed                                                     2 RED
//   R5  its softmax without the largest logit subtracted                        2 RED (the probe's logits overflow exp)
//   R8  the probe's weights not exact products (j/7)                            0 RED HERE, as it must be: SwiftShader never fuses, so
//       twin and mirror cannot part on it; render/denoiseDevice-selfcheck.mjs's probe-is-a-probe row is red, 1
//   after the GTX 1080's run (section 45), against the two fixes it called for:
//   X1  the child reports nothing -- the 1080's Windows loss, replayed          1 RED (the every-child-reported row; before it, this
//       read green, each silent child counted as a kernel that "said why" -- exactly the 1080's report)
//   X2  findDxc never looks in Playwright's browser folders                      1 RED
//   Both restored, md5 verified.
//   after both GPUs' use_dxc runs came back with empty dumps (section 49):
//   D1  the child's Dawn features in two entries again                          1 RED (the one-entry row). Restored, md5 verified.
//   round 16, against the pixel-tiled kernel while its two variants were in VARIANTS (brain/conv2d-selfcheck.mjs's P1-P4, P6, P7):
//   P1  a block's channels summed last-first                                    2 RED (native and browser, both variants)
//   P2  pixel p reads pixel 0's window                                          2 RED
//   P3  the second barrier removed                                              2 RED
//   P4  the weights read without the group offset                               2 RED (r16b-tile4-3x3 only: two z groups)
//   P6  tileWorkgroups dispatches half the columns                              2 RED (both variants: at 64 wide, 4 workgroups become 2
//       and 2 become 1)
//   P7  the guarded branch's per-pixel bound test removed                       0 RED (brain/conv2d-selfcheck.mjs's P7). Restored, md5 verified.
//   round 18, against the native children's clock:
//   U10 the child's device made without FINE_CLOCK_FLAG                         1 RED (the clock row: 8 of 8 native passes on the
//       65,536 ns grid). Restored, md5 verified.
//   round 19's probe (section 64), against render/denoiseCompile.mjs's dawnFlags and nativeModes. Each restored by copy:
//   W3  dawnFlags merges the enable key only                                     1 RED (the disabled-features row)
//   W4  no "use_dxc off" mode where DXC ships beside dawn.node                   1 RED (the 0.6.2 row)
//   W5  a use_dxc run given to a package with no DXC of its own                  1 RED (the 0.6.0 and 0.6.1 row)
//   DRIVEN, not a sabotage: SWEK_WEBGPU=/nope runs this gate red by name (exit 1); with the refusal turned back into a SKIP
//   it ran green with no native row -- the review's finding, reproduced before the fix.
//   W8  this gate's child back to [...dawnFlags(flags), FINE_CLOCK_FLAG]          1 RED (the both-children row)
//   W9  the build probe's child back to a hand-built flag list                   1 RED (the same row). The first draft left
//       both uncaught: Linux runs "as shipped" alone, so no row here could see a second disable entry (review of section 64).
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const { VARIANTS, BUILD_PROBE, BUILD_PROBE_R17, jobFor, measure, dumpStats, dawnFlags, nativeModes, headApplyProbe, buildJob, runJob, measureSizes } = await imp("render/denoiseCompile.mjs");

// ---- THE CHILD: one kernel, one compiler, one process ----------------------------------------------------------
// *** THE RESULT GOES TO A FILE. *** On the GTX 1080 (section 45) every native child exited 0 with its shader dump on
// stdout and no @@RESULT line: process.exit() after the last console.log loses it on Windows, where a write to a pipe
// may still be queued when the process ends. The parent names a file; the child writes it synchronously, then prints.
if (process.argv.includes("--child")) {
    const vid = process.argv[process.argv.indexOf("--child") + 1], flags = process.argv.slice(process.argv.indexOf("--child") + 2);
    const out = process.argv.includes("--result") ? process.argv[process.argv.indexOf("--result") + 1] : null;
    const H = await imp("tools/ship/headlessGpu.mjs");
    let result;
    try {
        H.configureVulkanIcd();
        // section 61: the device's clock unrounded, beside whatever Dawn features the run asks for -- merged into the run's own
        // disable entry (section 64: a second disable entry would erase "use_dxc off" the way section 49's erased dump_shaders)
        const W = H.resolveWebgpu(); if (W.refused) throw new Error(W.refused);
        const gpu = W.mod.create(dawnFlags([...flags, H.FINE_CLOCK_FLAG]));
        const v = VARIANTS.find((x) => x.id === vid), a = await gpu.requestAdapter();
        const dev = await a.requestDevice({ requiredFeatures: a.features.has("timestamp-query") ? ["timestamp-query"] : [] });
        try { result = await measure(dev, jobFor(v)); } finally { dev.destroy(); }
    } catch (e) { result = { built: false, reason: String(e && e.message || e).slice(0, 300) }; }
    if (out) fs.writeFileSync(out, JSON.stringify(result));
    console.log("@@RESULT " + JSON.stringify(result));
    H.exitCleanly ? H.exitCleanly(0) : process.exit(0);
}

// ---- THE GATE --------------------------------------------------------------------------------------------------
const H = await imp("tools/ship/headlessGpu.mjs");
const { runInEngineOrigin } = await imp("tools/ship/webgpuHarness.mjs");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const now = () => performance.now(), t0 = now(), BUDGET_MS = 1500000, CHILD_MS = 900000;

// The child's Dawn flags are render/denoiseCompile.mjs's dawnFlags (moved there in section 64, for tools/denoiseBuildProbe.mjs):
// one entry per key, so Dawn -- which keeps the LAST of two entries with the same key (section 49) -- drops nothing.

// findDxc -- where a box kept DXC's two DLLs, to copy beside dawn.node for section 43's use_dxc run -- is retired (section 64):
// a Dawn built without DXC forces use_dxc off whatever sits beside it, so the copied run was always FXC under another name.

console.log("1. THE INSTRUMENT, ON THE CPU");
{
    const dump = "// Dumped WGSL:\nfn k_mine() {}\n/* Dumped disassembled DXBC */\ndcl_indexableTemp x0[81], 4\nloop\n  mov x0[r1.x].x, r2.x\nendloop\nsync_g_t\n" +
                 "// Dumped WGSL:\nfn dawn_internal() {}\n/* Dumped disassembled DXIL */\nret\n";
    const st = dumpStats(dump, "k_mine");
    ok("  the dump is read for the kernel's own block -- not Dawn's internal shader after it -- for its compiler and its code's shape: FXC's DXBC, a loop, an indexable temp, a barrier",
        st.compiler === "FXC (DXBC)" && st.loops === 1 && st.indexableTemps === 2 && st.barriers === 1 &&
        dumpStats(dump, "dawn_internal").compiler === "DXC (DXIL)" && dumpStats("", "k_mine").compiler === "unknown (no dump)");
    const df = dawnFlags(["enable-dawn-features=use_dxc"]);
    ok("  the child asks Dawn for its features in ONE entry -- dump_shaders with use_dxc, not two entries of which Dawn keeps the last",
        df.length === 1 && df[0] === "enable-dawn-features=dump_shaders,use_dxc" && dawnFlags([]).join() === "enable-dawn-features=dump_shaders",
        `section 49: two entries left every use_dxc dump empty, on both GPUs -- got ${JSON.stringify(df)}`);
    // section 64: "use_dxc off" is a disable entry, and the child's device already has one (the fine clock) -- the two merged,
    // or Dawn keeps the clock's and the run that was meant to forbid DXC would let Dawn choose
    const dd = dawnFlags(["disable-dawn-features=use_dxc", H.FINE_CLOCK_FLAG]);
    ok("  ...and its DISABLED features in one entry too -- \"use_dxc off\" and the fine clock together, so neither erases the other",
        dd.length === 2 && dd[0] === "enable-dawn-features=dump_shaders" && dd[1] === "disable-dawn-features=use_dxc,timestamp_quantization",
        `got ${JSON.stringify(dd)}`);
    // ...and every native child in the tree builds its device's flags WITH it -- this gate's and tools/denoiseBuildProbe.mjs's.
    // Review of section 64: either child reverted to a hand-built list (two enable entries, or the clock's disable entry beside
    // "use_dxc off") passed every gate here, and on the rig would empty the dumps C1 and C2 are read from.
    const childCalls = [[path.basename(SELF), fs.readFileSync(SELF, "utf8")], ["denoiseBuildProbe.mjs", fs.readFileSync(path.join(ENG, "tools", "denoiseBuildProbe.mjs"), "utf8")]]
        .flatMap(([n, src]) => [...src.matchAll(/\bmod\.create\(([^\n]*)/g)].map((m) => ({ n, call: m[1] })));
    ok("  ...and both native children -- this gate's and the build probe's -- make their Dawn flags with it, the fine clock merged in",
        childCalls.length === 2 && new Set(childCalls.map((c) => c.n)).size === 2 && childCalls.every((c) => /^dawnFlags\(\[[^\]]*H\.FINE_CLOCK_FLAG\]\)\);/.test(c.call)),
        childCalls.map((c) => `${c.n}: create(${c.call.slice(0, 70)}`).join("; "));
    // section 64: which compiler runs a box makes, from what it has
    const names = (o) => nativeModes(o).map((m) => m.name + (m.dxc ? "@" + m.dxc : "")).join(" | ");
    const m062 = nativeModes({ win: true, dawnDir: "C:/nw/dist/win32-x64", dxcBeside: true });
    ok("  node-webgpu 0.6.2 on D3D12 (dxcompiler.dll beside dawn.node): as shipped, use_dxc and use_dxc off, from the package alone -- nothing copied",
        names({ win: true, dawnDir: "C:/nw/dist/win32-x64", dxcBeside: true }) === "as shipped | use_dxc | use_dxc off" &&
        m062.every((m) => !m.dxc) && m062[1].flags.join() === "enable-dawn-features=use_dxc" && m062[2].flags.join() === "disable-dawn-features=use_dxc",
        names({ win: true, dawnDir: "C:/nw/dist/win32-x64", dxcBeside: true }));
    ok("  ...0.6.0 and 0.6.1 (no DXC of their own) on D3D12: as shipped alone -- their Dawn forces use_dxc off, so a use_dxc run would be FXC under another name; not D3D12, as shipped alone",
        names({ win: true, dawnDir: "C:/nw/dist/win32-x64" }) === "as shipped" && names({ win: true, dawnDir: null, dxcBeside: true }) === "as shipped" &&
        names({ win: false, dawnDir: "/nw/dist/linux-x64", dxcBeside: true }) === "as shipped",
        [names({ win: true, dawnDir: "C:/nw/dist/win32-x64" }), names({ win: true, dawnDir: null, dxcBeside: true }), names({ win: false, dawnDir: "/nw", dxcBeside: true })].join("  /  "));
    let jobsOk = true; for (const v of VARIANTS) { const j = jobFor(v); jobsOk &&= typeof j.code === "string" && j.out > 0 && j.wg.length === 3; }
    ok(`  every kernel has a job: ${VARIANTS.map((v) => v.id).join(", ")}`, jobsOk);
    // section 56: tools/denoiseBuildProbe.mjs's shapes -- ids unique, a job each, the candidates without the guarded copy of the
    // channel loop and the diagnostics with it, r16a's and r16b's own last
    const P = BUILD_PROBE, guarded = (v) => /if \(o0/.test(jobFor(v).code);
    ok(`  the build probe's ${P.length} shapes (section 56) each have a job; edge zero has no guarded copy and edge skip has one; section 54's two kernels come last`,
        new Set(P.map((v) => v.id)).size === P.length && P.every((v) => { const j = jobFor(v); return typeof j.code === "string" && j.out > 0 && j.wg.length === 3; }) &&
        P.filter((v) => v.cfg).every((v) => guarded(v) === (v.cfg.edge === "skip")) && P[0].kind === "fast" && P.slice(-2).map((v) => v.id).join() === "tile2-skip-32,tile4-skip-32",
        P.map((v) => v.id).join(", "));
    // section 59: round 17's shapes -- each with a job at 64 x 64, judged, and at 1024, not judged (its twin is held at 64);
    // the fast kernel first, as the baseline every other is timed against
    const P17 = BUILD_PROBE_R17, j64 = P17.map((v) => jobFor(v)), j1k = P17.map((v) => jobFor(v, { N: 1024 }));
    ok(`  round 17's ${P17.length} shapes (section 59) each have a job at 64 x 64, judged, and at 1024 x 1024, whose twin is not computed: the fast kernel first`,
        new Set(P17.map((v) => v.id)).size === P17.length && P17[0].kind === "fast" && j64.every((j) => typeof j.judge === "function" && j.out === 64 * 64 * 32) &&
        j1k.every((j, i) => j.judge === null && j.out === 1024 * 1024 * 32 && j.code === j64[i].code && j.wg[1] === 128),
        P17.map((v) => v.id).join(", "));
}

// v4845 -- four symbols definitionGates' census found no row of this gate naming. headApplyProbe is used by render/denoiseDevice-selfcheck.mjs;
// buildJob and runJob only inside the native children (through measure), and measureSizes only by tools/denoiseBuildProbe.mjs, no gate at all.
// The three device functions are driven here on a STAND-IN device -- the calls they make, not a GPU's numbers -- so their contracts hold on
// every box, and the native children below stay the measurement.
console.log("\n1b. THE PROBE'S ARITHMETIC, AND THE BUILD-AND-TIME CONTRACT ON A STAND-IN DEVICE");
{
    const P = headApplyProbe(), Q = headApplyProbe(), f = Math.fround;
    let exact = true; const aw = new Set(P.A), ww = new Set(P.L.W);
    for (const a of aw) for (const w of ww) if (f(a * w) !== a * w) { exact = false; break; }
    ok("!! headApplyProbe's every activation-by-weight product is exact in f32 -- so a fused multiply-add rounds as a multiply then an add, and only the ORDER of the sums can move a logit",
        exact && P.L.Cin === 32 && P.L.Cout === 81 && P.L.k === 1 && P.L.act === "none" && [...ww].every((w) => Math.abs(w - 8192) <= 0.5) &&
        [...aw].every((a) => a >= 1 && a < 2) && P.A.every((v, i) => v === Q.A[i]) && P.L.W.every((v, i) => v === Q.L.W[i]),
        `${aw.size} activations x ${ww.size} weights, every product exact; the same probe twice`);
    // the stand-in: records what is asked of it; its clock reads 2 ms between a pass's two timestamps. The wall clock handed in
    // steps 5 ms a reading, so a 10 ms budget is spent by the third timed pass -- three, the floor, as on a fast GPU
    const stand = ({ ts = true, compileErr = null, pipeErr = null } = {}) => {
        const log = { modules: 0, dispatches: 0, made: 0, destroyed: 0 };
        const mk = (d) => { log.made++; const b = { size: d.size, data: new ArrayBuffer(d.size), mapAsync: async () => {}, getMappedRange: () => b.data, unmap() {}, destroy() { log.destroyed++; } }; return b; };
        const dev = { log, features: new Set(ts ? ["timestamp-query"] : []),
            createShaderModule: () => { log.modules++; return { getCompilationInfo: async () => ({ messages: compileErr ? [{ type: "error", lineNum: 3, linePos: 7, message: compileErr }] : [] }) }; },
            createComputePipelineAsync: async () => { if (pipeErr) throw new Error(pipeErr); return { getBindGroupLayout: () => ({}) }; },
            createBuffer: mk, createBindGroup: () => ({}), createQuerySet: () => ({ destroy() {} }),
            createCommandEncoder: () => ({ beginComputePass: () => ({ setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() { log.dispatches++; }, end() {} }),
                resolveQuerySet() {}, copyBufferToBuffer(src, so, dst) { if (dst.size === 16) new BigUint64Array(dst.data).set([1000n, 2001000n]); }, finish: () => ({}) }),
            queue: { writeBuffer() {}, submit() {}, onSubmittedWorkDone: async () => {} } };
        return dev;
    };
    let t = 0; const tick = () => (t += 5);
    const v17 = BUILD_PROBE_R17[0], job = jobFor(v17);
    const bad = await buildJob(stand({ compileErr: "bad token" }), job), boom = await buildJob(stand({ pipeErr: "boom" }), job), good = await buildJob(stand(), job, { now: tick });
    ok("!! buildJob reports a WGSL error by line and column, a pipeline failure by its message, and a build's wall time from the clock it is given",
        bad.built === false && bad.reason === "WGSL did not compile: 3:7 bad token" && boom.built === false && boom.reason === "pipeline: boom" && good.built === true && good.buildMs === 5,
        [bad.reason, boom.reason, "buildMs " + good.buildMs].join("; "));
    let seen = null; const judged = { ...job, judge: (y) => { seen = y; return { ok: false, detail: "a stand-in's zeros" }; } };
    const dv = stand(), r = await runJob(dv, good.pipe, judged, { budgetMs: 10, now: tick });
    const dw = stand({ ts: false }), w = await runJob(dw, good.pipe, { ...job, judge: null }, { budgetMs: 10, now: tick });
    ok("!! runJob: one untimed pass then three timed, on the device's clock where it has timestamps and the wall's where not; the output read back whole and judged; every buffer it made destroyed",
        r.passMs === 2 && r.passes === 3 && r.clock === "device" && dv.log.dispatches === 4 && seen instanceof Float32Array && seen.length === job.out && r.exact === false &&
        w.clock === "wall" && w.passMs === 5 && w.exact === null && dv.log.made === dv.log.destroyed && dw.log.made === dw.log.destroyed,
        `device ${r.passMs} ms x ${r.passes}, wall ${w.passMs} ms; ${dv.log.made} buffers made, ${dv.log.destroyed} destroyed`);
    const dm = stand(), m = await measureSizes(dm, v17, [64, 128], { budgetMs: 10, now: tick });
    ok("!! measureSizes builds the kernel ONCE and times it at every size, judging only where the twin is held (64 x 64)",
        m.built === true && dm.log.modules === 1 && m.sizes.map((s) => s.N).join() === "64,128" && m.sizes[0].exact !== null && m.sizes[1].exact === null && m.exact === m.sizes[0].exact,
        `${dm.log.modules} module for ${m.sizes.length} sizes; judged ${m.sizes.map((s) => s.exact === null ? "-" : s.exact).join(", ")}`);
}

// section 64: a SWEK_WEBGPU this box cannot load is a red, not a skip -- as a skip the gate passed and realGpuRun's report kept
// no trace of it (review: a failed npm install, or a `set` line ending in a space, handed back a green run with no native row)
const W0 = H.resolveWebgpu();
const skip = W0.refused ? null : H.headlessGpuSkipReason();
const rows = [];   // { path, compiler, id, result }
console.log("\n2. NATIVE: each kernel in its own process, under each compiler this box has");
if (W0.refused) ok(`!! ${H.WEBGPU_ENV} names a node-webgpu package this box can load -- a refused one is a red here, never a skip`, false, W0.refused);
else if (skip) console.log("  SKIP  " + skip);
else {
    const win = process.platform === "win32", from = H.resolveWebgpu().from;
    // section 64: dawn.node's directory from the package the resolver answered with, resolved to a file -- section 52's
    // path.dirname(from) was "." whenever the bare specifier answered -- and whether that package ships its own DXC
    const pkg = H.webgpuPackage(from), dawnDir = pkg ? pkg.dawnDir : null, dxcBeside = win && !!(pkg && pkg.dxcBeside);
    const modes = nativeModes({ win, dawnDir, dxcBeside }), ver = (pkg && pkg.version) || "unknown";
    say(`node-webgpu ${pkg && pkg.version ? pkg.version : "(version unread)"} from ${from}${process.env[H.WEBGPU_ENV] ? " (" + H.WEBGPU_ENV + ")" : ""}; native compilers: ` +
        `${win ? "D3D12" : "not D3D12 (" + process.platform + ": the native backend here compiles to SPIR-V)"}; ` +
        `DXC ${dxcBeside ? "ships beside dawn.node -- runs as shipped, use_dxc and use_dxc off, from the package alone" :
              win ? "none of its own -- a Dawn built without DXC forces use_dxc off (section 64), so this package runs as shipped alone and section 43's A1 is untested here" : "not applicable"}; ` +
        `modes: ${modes.map((m) => m.name).join(", ")}`);
    for (const m of modes) {
        for (const v of VARIANTS) {
            if (now() - t0 > BUDGET_MS) { rows.push({ path: "native", compiler: m.name, id: v.id, result: { built: false, reason: `the gate's ${BUDGET_MS / 1000} s budget is spent` } }); continue; }
            const resFile = path.join(os.tmpdir(), `swek-denoise-result-${process.pid}-${m.name.replace(/\W+/g, "_")}-${v.id}.json`);
            try { fs.unlinkSync(resFile); } catch {}
            const r = spawnSync(process.execPath, [SELF, "--result", resFile, "--child", v.id, ...m.flags], { cwd: ENG, encoding: "utf8", timeout: CHILD_MS, maxBuffer: 1 << 29 });
            // the file first; stdout's line only as a fallback, found anywhere -- a dump that ends without a newline
            // puts it mid-line
            let got = null; try { got = JSON.parse(fs.readFileSync(resFile, "utf8")); fs.unlinkSync(resFile); } catch {}
            const at = (r.stdout || "").lastIndexOf("@@RESULT ");
            if (!got && at >= 0) try { got = JSON.parse((r.stdout.slice(at + 9).split("\n")[0] || "").trim()); } catch {}
            const result = got || { built: false, noResult: !r.error, reason: r.error ? `the process was stopped: ${r.error.code || r.error.message}` : `no result (exit ${r.status}): ${(r.stderr || "").split("\n").slice(-3).join(" ").slice(0, 200)}` };
            const st = dumpStats(r.stdout, jobFor(v).entry);
            const dumpFile = path.join(os.tmpdir(), `swek-denoise-dump-${ver}-${m.name.replace(/\W+/g, "_")}-${v.id}.txt`);
            try { fs.writeFileSync(dumpFile, r.stdout || ""); } catch {}
            rows.push({ path: "native", compiler: m.name, id: v.id, result: { ...result, dump: st, dumpFile } });
        }
        // section 64: one line a mode, which C1 is read from -- how many built, what their dumps say, the first reason any did
        // not, and where the dumps are (realGpuRun's report keeps "----" lines, and named no dump file before this)
        const ms = rows.filter((x) => x.path === "native" && x.compiler === m.name), by = {};
        for (const x of ms) by[x.result.dump.compiler] = (by[x.result.dump.compiler] || 0) + 1;
        const why = ms.find((x) => !x.result.built);
        say(`native / ${m.name} in all: ${ms.filter((x) => x.result.built).length} of ${ms.length} built; dumps: ${Object.entries(by).map(([c, n]) => `${n} ${c}`).join(", ")}` +
            (why ? `; first not built: ${why.id} -- ${String(why.result.reason).slice(0, 160)}` : "") +
            `; dumps at ${path.join(os.tmpdir(), `swek-denoise-dump-${ver}-${m.name.replace(/\W+/g, "_")}-*.txt`)}`);
    }
    // section 45: on the 1080 every child exited 0 and reported nothing, and the row below read each as a kernel that
    // "said why" -- an instrument failure counted as a measurement. A child that ends without a result is now red here.
    const silent = rows.filter((x) => x.path === "native" && x.result.noResult);
    ok("!! every native child reported a result -- a child that exits without one is the instrument failing, not a kernel saying why",
        silent.length === 0, silent.length ? silent.map((x) => `${x.compiler}/${x.id}`).join(", ") : `${rows.filter((x) => x.path === "native").length} children, each with a result`);
    // section 61: each child's clock is unrounded -- with Dawn's default, every pass is a whole number of 65,536 ns (section 60)
    const timed = rows.filter((x) => x.path === "native" && x.result.built && x.result.clock === "device"), grid = (ms) => Math.round(ms * 1e6) % 65536 === 0;
    if (timed.length < 3) console.log(`  SKIP  the native clock's grain: ${timed.length} native pass(es) on the device's clock -- too few to read a grid from`);
    else ok("!! section 61: the native children's clocks are not Dawn's rounded one -- not every pass time is a whole number of 65,536 ns",
        !timed.every((x) => grid(x.result.passMs)), `${timed.filter((x) => grid(x.result.passMs)).length} of ${timed.length} native passes on the 65,536 ns grid`);
}

console.log("\n3. THE BROWSER: denoise.html's \"Time each kernel\", in Chromium, on its own adapter");
{
    // the page's own button, as the timing gate drives "Time the network": the page is where this list is wired
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 600000, script: `async () => {
        const f = document.createElement("iframe"); f.style.width = "1200px"; f.style.height = "900px"; f.src = "/denoise.html"; document.body.appendChild(f);
        await new Promise((r) => f.onload = r);
        const d = f.contentDocument, $ = (id) => d.getElementById(id), wait = (ms) => new Promise((r) => setTimeout(r, ms));
        for (let i = 0; i < 100 && !$("kernels"); i++) await wait(50);
        $("kernels").click();
        const t = Date.now();
        while (Date.now() - t < 590000 && ($("kernels").disabled || !$("kernelsJson").textContent) && !/failed|no WebGPU/.test($("kernelsStatus").textContent)) await wait(100);
        return { status: $("kernelsStatus").textContent, json: $("kernelsJson").textContent, shown: $("kernelsTable").style.display !== "none" };
    }` });
    if (r.skipped) console.log("  SKIP  " + r.reason);
    else {
        let out = null; try { out = JSON.parse(r.result?.json || "null"); } catch {}
        ok("!! the page built and timed every kernel on its own device, showed the table, and said how many were exact -- no page error",
            r.ok && !!out && out.length === VARIANTS.length && r.result.shown && !r.pageErrors.length && new RegExp(`of ${VARIANTS.length} kernels built and exact`).test(r.result.status),
            r.ok ? (r.result?.status || "").slice(0, 160) : r.reason);
        if (out) for (const o of out) rows.push({ path: "browser", compiler: "Chrome's", id: o.id, result: o.result });
    }
}

console.log("\n4. WHAT WAS MEASURED");
if (rows.length) {
    const groups = [...new Set(rows.map((x) => `${x.path} / ${x.compiler}`))];
    for (const g of groups) {
        const gs = rows.filter((x) => `${x.path} / ${x.compiler}` === g);
        ok(`!! ${g}: every kernel built or said why, and every one built is exact -- conv cells the twin's or the fused mirror's, the kernel apply within APPLY_TOL`,
            gs.length === VARIANTS.length && gs.every((x) => x.result.built ? x.result.exact === true : !!x.result.reason),
            gs.filter((x) => !x.result.built || !x.result.exact).map((x) => `${x.id}: ${x.result.built ? x.result.detail : x.result.reason}`).join("; ") || `${gs.length} kernels, all exact`);
        ok(`  ${g}: every build and pass time finite and positive`,
            gs.filter((x) => x.result.built).every((x) => [x.result.buildMs, x.result.passMs].every((t) => Number.isFinite(t) && t > 0)));
        for (const x of gs) {
            const R = x.result;
            say(`${g}: ${x.id}: ` + (R.built ? `build ${R.buildMs.toFixed(0)} ms, pass ${R.passMs.toFixed(3)} ms (${R.clock} clock, ${R.passes} passes), ${R.detail}` : `NOT BUILT -- ${R.reason}`) +
                (R.dump ? `; dump: ${R.dump.compiler}, ${R.dump.lines} lines, ${R.dump.loops} loops, ${R.dump.indexableTemps} indexable-temp lines, ${R.dump.barriers} barriers` : ""));
        }
    }
    const natives = rows.filter((x) => x.path === "native");
    if (natives.length && process.platform === "win32")
        // section 64: over the kernels that BUILT -- 0.6.2's Dawn fails device creation when DXC will not load, with no dump and
        // a reason, which is an outcome section 64 reads, not this instrument failing; a built kernel with no dump still is
        ok("  on D3D12 every native run that built has a dump naming its compiler -- DXBC is FXC, DXIL is DXC",
            natives.filter((x) => x.result.built).every((x) => /FXC|DXC/.test(x.result.dump.compiler)), natives.filter((x) => x.result.built).map((x) => `${x.compiler}/${x.id}: ${x.result.dump?.compiler}`).join("; ").slice(0, 300));
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${(now() - t0).toFixed(0)} ms)` +
    "\nnot closed here: any number, and any cause. The build and pass times above are what section 43's A reads; on SwiftShader " +
    "they are a CPU's, and the D3D12 compilers are a Windows GPU's to show.");
H.exitCleanly ? H.exitCleanly(fails ? 1 : 0) : process.exit(fails ? 1 : 0);
