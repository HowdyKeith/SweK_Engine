// WebGLEngine/render/denoiseCompile-selfcheck.mjs -- the denoiser arc, round 14: where the native time goes
//
// Run: node render/denoiseCompile-selfcheck.mjs            (on the rig: node tools/ship/realGpuRun.mjs --only denoise)
//      node render/denoiseCompile-selfcheck.mjs --child <variant> [dawn flags...]   (internal: one kernel, one compiler)
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
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const { VARIANTS, jobFor, measure, dumpStats } = await imp("render/denoiseCompile.mjs");

// ---- THE CHILD: one kernel, one compiler, one process ----------------------------------------------------------
if (process.argv.includes("--child")) {
    const vid = process.argv[process.argv.indexOf("--child") + 1], flags = process.argv.slice(process.argv.indexOf("--child") + 2);
    const H = await imp("tools/ship/headlessGpu.mjs");
    let result;
    try {
        H.configureVulkanIcd();
        const { mod } = H.resolveWebgpu(), gpu = mod.create(["enable-dawn-features=dump_shaders", ...flags]);
        const v = VARIANTS.find((x) => x.id === vid), a = await gpu.requestAdapter();
        const dev = await a.requestDevice({ requiredFeatures: a.features.has("timestamp-query") ? ["timestamp-query"] : [] });
        try { result = await measure(dev, jobFor(v)); } finally { dev.destroy(); }
    } catch (e) { result = { built: false, reason: String(e && e.message || e).slice(0, 300) }; }
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

/** Where this box keeps DXC's two DLLs, if anywhere: a directory holding both dxcompiler.dll and dxil.dll. */
export function findDxc({ env = process.env, exists = fs.existsSync, readdir = (d) => (fs.existsSync(d) ? fs.readdirSync(d) : []), shell = null } = {}) {
    const dirs = [];
    if (shell) dirs.push(path.dirname(shell));
    for (const root of [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA].filter(Boolean)) {
        const app = path.join(root, "Google", "Chrome", "Application");
        for (const d of readdir(app)) dirs.push(path.join(app, d));
    }
    return dirs.find((d) => exists(path.join(d, "dxcompiler.dll")) && exists(path.join(d, "dxil.dll"))) || null;
}

console.log("1. THE INSTRUMENT, ON THE CPU");
{
    const dump = "// Dumped WGSL:\nfn k_mine() {}\n/* Dumped disassembled DXBC */\ndcl_indexableTemp x0[81], 4\nloop\n  mov x0[r1.x].x, r2.x\nendloop\nsync_g_t\n" +
                 "// Dumped WGSL:\nfn dawn_internal() {}\n/* Dumped disassembled DXIL */\nret\n";
    const st = dumpStats(dump, "k_mine");
    ok("  the dump is read for the kernel's own block -- not Dawn's internal shader after it -- for its compiler and its code's shape: FXC's DXBC, a loop, an indexable temp, a barrier",
        st.compiler === "FXC (DXBC)" && st.loops === 1 && st.indexableTemps === 2 && st.barriers === 1 &&
        dumpStats(dump, "dawn_internal").compiler === "DXC (DXIL)" && dumpStats("", "k_mine").compiler === "unknown (no dump)");
    const fake = { "C:/s": ["dxcompiler.dll", "dxil.dll"], "C:/pf/Google/Chrome/Application": ["131.0"], "C:/pf/Google/Chrome/Application/131.0": ["dxil.dll"] };
    const ex = (f) => { const d = path.dirname(f), b = path.basename(f); return (fake[d.replace(/\\/g, "/")] || []).includes(b); };
    ok("  DXC is found only where BOTH its DLLs are: the shell's directory here, not a Chrome with dxil.dll alone",
        findDxc({ env: { ProgramFiles: "C:/pf" }, exists: ex, readdir: (d) => fake[d.replace(/\\/g, "/")] || [], shell: "C:/s/headless_shell.exe" }) === path.join("C:/s") &&
        findDxc({ env: { ProgramFiles: "C:/pf" }, exists: ex, readdir: (d) => fake[d.replace(/\\/g, "/")] || [] }) === null);
    let jobsOk = true; for (const v of VARIANTS) { const j = jobFor(v); jobsOk &&= typeof j.code === "string" && j.out > 0 && j.wg.length === 3; }
    ok(`  every kernel has a job: ${VARIANTS.map((v) => v.id).join(", ")}`, jobsOk);
}

const skip = H.headlessGpuSkipReason ? H.headlessGpuSkipReason() : null;
const rows = [];   // { path, compiler, id, result }
console.log("\n2. NATIVE: each kernel in its own process, under each compiler this box has");
if (skip) console.log("  SKIP  " + skip);
else {
    const win = process.platform === "win32", { resolveWebgpu } = H, from = resolveWebgpu().from;
    const dawnDir = from ? path.join(path.dirname(from), "dist", `${process.platform}-${process.arch}`) : null;
    let shell = null; try { shell = (await imp("tools/ship/playwrightResolve.mjs")).HEADLESS_SHELL; } catch {}
    const dxcDir = win ? findDxc({ shell }) : null;
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
                const r = spawnSync(process.execPath, [SELF, "--child", v.id, ...m.flags], { cwd: ENG, encoding: "utf8", timeout: CHILD_MS, maxBuffer: 1 << 29 });
                const line = (r.stdout || "").split("\n").find((l) => l.startsWith("@@RESULT "));
                const result = line ? JSON.parse(line.slice(9)) : { built: false, reason: r.error ? `the process was stopped: ${r.error.code || r.error.message}` : `no result (exit ${r.status}): ${(r.stderr || "").split("\n").slice(-3).join(" ").slice(0, 200)}` };
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
