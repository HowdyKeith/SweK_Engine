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
//
// Each native measurement is its own process: one kernel, one adapter, one device, one compiler -- Dawn's dump goes to
// stdout, so a process apiece keeps each kernel's dump its own, and a compile that never finishes is killed, not waited on.
// The DXC run needs the two DLLs where Dawn loads its compilers: beside dawn.node. When this box has them (a Chrome or the
// Playwright headless shell carries them), they are copied there for that run and removed after; the dump says whether
// Dawn used them (DXIL) or not (DXBC).
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
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const { VARIANTS, BUILD_PROBE, jobFor, measure, dumpStats } = await imp("render/denoiseCompile.mjs");

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
        const { mod } = H.resolveWebgpu(), gpu = mod.create(dawnFlags(flags));
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

/**
 * The child's Dawn flags: ONE enable-dawn-features entry, dump_shaders first, every other feature asked for joined to it.
 * Section 49: dawn.node keeps the LAST of two such entries, so the use_dxc run's second entry dropped dump_shaders and
 * every use_dxc dump came back empty, on both GPUs -- reproduced here with allow_unsafe_apis.
 */
export function dawnFlags(flags = []) {
    const key = "enable-dawn-features=", asked = flags.filter((f) => f.startsWith(key)).flatMap((f) => f.slice(key.length).split(",")).filter(Boolean);
    return [key + ["dump_shaders", ...asked.filter((f) => f !== "dump_shaders")].join(","), ...flags.filter((f) => !f.startsWith(key))];
}

/**
 * Where this box keeps DXC's two DLLs, if anywhere: a directory holding both dxcompiler.dll and dxil.dll -- the headless
 * shell's own, an installed Chrome's version directory, or (section 45: the 1080 found none) any Chromium build in
 * Playwright's browser folders (`roots`, playwrightResolve's shellRoots). Returned normalized, so it compares as a path.
 */
export function findDxc({ env = process.env, exists = fs.existsSync, readdir = (d) => (fs.existsSync(d) ? fs.readdirSync(d) : []), shell = null, roots = [] } = {}) {
    const dirs = [];
    if (shell) dirs.push(path.dirname(shell));
    for (const root of [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA].filter(Boolean)) {
        const app = path.join(root, "Google", "Chrome", "Application");
        for (const d of readdir(app)) dirs.push(path.join(app, d));
    }
    for (const root of roots) for (const b of readdir(root).filter((b) => /^chromium/.test(b))) for (const d of readdir(path.join(root, b))) dirs.push(path.join(root, b, d));
    const hit = dirs.find((d) => exists(path.join(d, "dxcompiler.dll")) && exists(path.join(d, "dxil.dll")));
    return hit ? path.normalize(hit) : null;
}

console.log("1. THE INSTRUMENT, ON THE CPU");
{
    const dump = "// Dumped WGSL:\nfn k_mine() {}\n/* Dumped disassembled DXBC */\ndcl_indexableTemp x0[81], 4\nloop\n  mov x0[r1.x].x, r2.x\nendloop\nsync_g_t\n" +
                 "// Dumped WGSL:\nfn dawn_internal() {}\n/* Dumped disassembled DXIL */\nret\n";
    const st = dumpStats(dump, "k_mine");
    ok("  the dump is read for the kernel's own block -- not Dawn's internal shader after it -- for its compiler and its code's shape: FXC's DXBC, a loop, an indexable temp, a barrier",
        st.compiler === "FXC (DXBC)" && st.loops === 1 && st.indexableTemps === 2 && st.barriers === 1 &&
        dumpStats(dump, "dawn_internal").compiler === "DXC (DXIL)" && dumpStats("", "k_mine").compiler === "unknown (no dump)");
    const fake = { "C:/s": ["dxcompiler.dll", "dxil.dll"], "C:/pf/Google/Chrome/Application": ["131.0"], "C:/pf/Google/Chrome/Application/131.0": ["dxil.dll"],
                   "C:/pw": ["chromium-1140", "ffmpeg-1010"], "C:/pw/chromium-1140": ["chrome-win"], "C:/pw/chromium-1140/chrome-win": ["dxcompiler.dll", "dxil.dll"] };
    const ex = (f) => { const d = path.dirname(f), b = path.basename(f); return (fake[d.replace(/\\/g, "/")] || []).includes(b); };
    const rd = (d) => fake[d.replace(/\\/g, "/")] || [], same = (a, b) => a !== null && path.normalize(a) === path.normalize(b);
    // section 45: on the 1080 the first form of this row compared a forward-slash path with path.join's, which on Windows
    // is backslashed -- red on win32 only, so the box that runs D3D12 was the one box that could see it
    ok("  DXC is found only where BOTH its DLLs are: the shell's directory, or a Chromium in Playwright's browser folder -- not a Chrome with dxil.dll alone",
        same(findDxc({ env: { ProgramFiles: "C:/pf" }, exists: ex, readdir: rd, shell: "C:/s/headless_shell.exe" }), "C:/s") &&
        findDxc({ env: { ProgramFiles: "C:/pf" }, exists: ex, readdir: rd }) === null &&
        same(findDxc({ env: { ProgramFiles: "C:/pf" }, exists: ex, readdir: rd, roots: ["C:/pw"] }), "C:/pw/chromium-1140/chrome-win"));
    const df = dawnFlags(["enable-dawn-features=use_dxc"]);
    ok("  the child asks Dawn for its features in ONE entry -- dump_shaders with use_dxc, not two entries of which Dawn keeps the last",
        df.length === 1 && df[0] === "enable-dawn-features=dump_shaders,use_dxc" && dawnFlags([]).join() === "enable-dawn-features=dump_shaders",
        `section 49: two entries left every use_dxc dump empty, on both GPUs -- got ${JSON.stringify(df)}`);
    let jobsOk = true; for (const v of VARIANTS) { const j = jobFor(v); jobsOk &&= typeof j.code === "string" && j.out > 0 && j.wg.length === 3; }
    ok(`  every kernel has a job: ${VARIANTS.map((v) => v.id).join(", ")}`, jobsOk);
    // section 56: tools/denoiseBuildProbe.mjs's shapes -- ids unique, a job each, the candidates without the guarded copy of the
    // channel loop and the diagnostics with it, r16a's and r16b's own last
    const P = BUILD_PROBE, guarded = (v) => /if \(o0/.test(jobFor(v).code);
    ok(`  the build probe's ${P.length} shapes (section 56) each have a job; edge zero has no guarded copy and edge skip has one; section 54's two kernels come last`,
        new Set(P.map((v) => v.id)).size === P.length && P.every((v) => { const j = jobFor(v); return typeof j.code === "string" && j.out > 0 && j.wg.length === 3; }) &&
        P.filter((v) => v.cfg).every((v) => guarded(v) === (v.cfg.edge === "skip")) && P[0].kind === "fast" && P.slice(-2).map((v) => v.id).join() === "tile2-skip-32,tile4-skip-32",
        P.map((v) => v.id).join(", "));
}

const skip = H.headlessGpuSkipReason ? H.headlessGpuSkipReason() : null;
const rows = [];   // { path, compiler, id, result }
console.log("\n2. NATIVE: each kernel in its own process, under each compiler this box has");
if (skip) console.log("  SKIP  " + skip);
else {
    const win = process.platform === "win32", { resolveWebgpu } = H, from = resolveWebgpu().from;
    const dawnDir = from ? path.join(path.dirname(from), "dist", `${process.platform}-${process.arch}`) : null;
    let shell = null, roots = []; try { const PR = await imp("tools/ship/playwrightResolve.mjs"); shell = PR.HEADLESS_SHELL; roots = PR.shellRoots(); } catch {}
    const dxcDir = win ? findDxc({ shell, roots }) : null;
    const modes = [{ name: "as shipped", flags: [] }];
    if (dxcDir && dawnDir) modes.push({ name: "use_dxc", flags: ["enable-dawn-features=use_dxc"], dxc: dxcDir });
    say(`native compilers: ${win ? "D3D12" : "not D3D12 (" + process.platform + ": the native backend here compiles to SPIR-V)"}; ` +
        `DXC's DLLs ${dxcDir ? "found in " + dxcDir : win ? "not found on this box -- the use_dxc run is skipped, and section 43's A1 is untested here" : "not applicable"}`);
    const placed = [], everPlaced = [];
    for (const m of modes) {
        if (m.dxc) for (const f of ["dxcompiler.dll", "dxil.dll"]) { const to = path.join(dawnDir, f); if (!fs.existsSync(to)) { fs.copyFileSync(path.join(m.dxc, f), to); placed.push(to); everPlaced.push(to); } }
        try {
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
                const dumpFile = path.join(os.tmpdir(), `swek-denoise-dump-${m.name.replace(/\W+/g, "_")}-${v.id}.txt`);
                try { fs.writeFileSync(dumpFile, r.stdout || ""); } catch {}
                rows.push({ path: "native", compiler: m.name, id: v.id, result: { ...result, dump: st, dumpFile } });
            }
        } finally {
            for (const f of placed.splice(0)) { try { fs.unlinkSync(f); } catch {} }
        }
    }
    if (everPlaced.length) ok("  the DLLs copied beside dawn.node for the use_dxc run are gone again", everPlaced.every((f) => !fs.existsSync(f)), everPlaced.join(", "));
    // section 45: on the 1080 every child exited 0 and reported nothing, and the row below read each as a kernel that
    // "said why" -- an instrument failure counted as a measurement. A child that ends without a result is now red here.
    const silent = rows.filter((x) => x.path === "native" && x.result.noResult);
    ok("!! every native child reported a result -- a child that exits without one is the instrument failing, not a kernel saying why",
        silent.length === 0, silent.length ? silent.map((x) => `${x.compiler}/${x.id}`).join(", ") : `${rows.filter((x) => x.path === "native").length} children, each with a result`);
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
        ok("  on D3D12 every native run's dump names its compiler -- DXBC is FXC, DXIL is DXC",
            natives.filter((x) => x.result.dump).every((x) => /FXC|DXC/.test(x.result.dump.compiler)), natives.map((x) => `${x.compiler}/${x.id}: ${x.result.dump?.compiler}`).join("; ").slice(0, 300));
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${(now() - t0).toFixed(0)} ms)` +
    "\nnot closed here: any number, and any cause. The build and pass times above are what section 43's A reads; on SwiftShader " +
    "they are a CPU's, and the D3D12 compilers are a Windows GPU's to show.");
H.exitCleanly ? H.exitCleanly(fails ? 1 : 0) : process.exit(fails ? 1 : 0);
