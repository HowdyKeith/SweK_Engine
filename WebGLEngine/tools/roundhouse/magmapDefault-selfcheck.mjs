// WebGLEngine/tools/roundhouse/magmapDefault-selfcheck.mjs -- v3965
//
// Run: node tools/roundhouse/magmapDefault-selfcheck.mjs   (needs Chromium + WebGPU; skips cleanly without)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// *** THE SHIPPED MAGMAP KERNEL IS NOW wg128-shared, AND TWO THINGS HAD TO BE TRUE FOR THAT TO BE SAFE. ***
//
// Keith's rig, Intel gen-9, medians of 7: base-wg64 10.7ms, wg128-shared 8.1ms -- 1.32x, fastest of seven, all
// seven agreeing with the CPU f64 reference to the same 3.79e-6. So the incumbent was replaced.
//
// (1) IT MUST BE DERIVED, NOT REWRITTEN. The obvious way to bake a variant in is to edit the base WGSL. That
// would have broken the bench that measured the win, silently, in the direction that looks fine: magmap-bench
// does `variantWgsl(WGSL, v)` for every row, so a base already carrying shared trig makes the four "non-shared"
// variants shared too, and the three shared ones declare `var<workgroup> cosW` twice. Half the table
// mislabelled, half not compiling. THE INSTRUMENT THAT PROVED THE CHANGE WOULD HAVE STOPPED WORKING.
//
// (2) THE SHARED KERNEL IS ONLY CORRECT UP TO SHARED_CAP, AND PAST IT IT DOES NOT FAIL -- IT LIES. cosW/sinW
// are `array<f32, 64>`; the cooperative load writes cosW[t] for t < P.nT. MEASURED on a real GPU at nT=96 with
// the cap guard removed: worst relative error 3.86e-2 against a tolerance of 1e-5 -- roughly EIGHT THOUSAND
// SEVEN HUNDRED TIMES the tolerance, with no crash, no validation error, and numbers that look like numbers.
// Every GPU caller in this tree passes nT=48 today, which is a fact about today; magmapGpu's signature accepts
// any nT and lensBind runs 240 on the CPU. So the default falls back to the base above the cap, and the
// provenance tag says which kernel ran.
//
// BOTH ARE DRIVEN HERE. The bit-identity claim is checked on the GPU rather than asserted from the source,
// because "changes only where numbers are read from" is a claim about what the hardware does with the code.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "../ship/playwrightResolve.mjs";
import { noComments } from "../ship/sourceScan.mjs";
import { VARIANTS, validateVariant, SHARED_CAP } from "./magmapVariants.mjs";

const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("magmapDefault-selfcheck -- the shipped kernel is a DERIVED variant, and its cap is load-bearing\n");

// ---- 1. the source properties, before spending a GPU on it -------------------------------------------------
const gpuSrc = fs.readFileSync(path.join(ROOT, "tools", "roundhouse", "magmapGpu.mjs"), "utf8");
const gpuCode = noComments(gpuSrc);
const { WGSL, SHIPPED_WGSL, SHIPPED_VARIANT } = await import(
    "file://" + path.join(ROOT, "tools", "roundhouse", "magmapGpu.mjs"));

ok("!! *** the shipped kernel is DERIVED from the base by variantWgsl, not hand-edited into it ***",
    /SHIPPED_WGSL\s*=\s*variantWgsl\(WGSL, SHIPPED_VARIANT\)/.test(gpuCode),
    "editing the base would make magmap-bench compare shared kernels while labelling four of them non-shared");

// *** THE BASE MUST STAY PRISTINE. *** This is the check that catches somebody "simplifying" the derivation by
// pasting its output into the source -- which would look tidier and would break the bench.
ok("!! *** the base WGSL is still the un-transformed wg64 kernel ***",
    /@compute @workgroup_size\(64\)/.test(WGSL) && !/cosW/.test(WGSL) && !/workgroupBarrier/.test(WGSL),
    "magmap-bench derives all seven rows from this; a base carrying shared trig mislabels four and breaks three");

ok("the shipped kernel really is the variant it claims to be",
    SHIPPED_VARIANT.id === "wg128-shared" && SHIPPED_VARIANT.workgroup === 128 && SHIPPED_VARIANT.sharedTrig === true,
    JSON.stringify({ id: SHIPPED_VARIANT.id, wg: SHIPPED_VARIANT.workgroup, shared: SHIPPED_VARIANT.sharedTrig }));

const v = validateVariant(SHIPPED_WGSL, SHIPPED_VARIANT);
ok("!! ...and it passes the SAME structural validation every benched variant must pass",
    v.ok, v.problems && v.problems.length ? v.problems.join("; ") : "no problems");
ok("   the workgroup arrays are declared exactly once", (SHIPPED_WGSL.match(/var<workgroup> cosW/g) || []).length === 1);
ok("   and the shipped kernel dispatches at 128", /@compute @workgroup_size\(128\)/.test(SHIPPED_WGSL));

// *** THE BASELINE SURVIVES. *** A benchmark without the thing it replaced measures nothing, and the only way
// to learn that 128-shared has stopped being right on some future device is to keep timing the one it beat.
ok("!! the replaced kernel is STILL in VARIANTS as the baseline",
    VARIANTS.some((x) => x.id === "base-wg64" && x.workgroup === 64 && x.sharedTrig === false),
    "a bench without the incumbent cannot measure a speedup, or notice one going away");
const varSrc = fs.readFileSync(path.join(ROOT, "tools", "roundhouse", "magmapVariants.mjs"), "utf8");
ok("!! ...and it no longer CLAIMS to be the shipped kernel, which it stopped being at v3965",
    !/note: "the shipped kernel, unchanged/.test(varSrc),
    "a label that outlives the thing it described is the v3959 defect; it reads 'the FORMER default' now");

// ---- 2. the GPU half ---------------------------------------------------------------------------------------
const { chromium, from: pwFrom } = resolvePlaywright(require_);
const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
if (skip) {
    console.log("\nmagmapDefault-selfcheck: the source half passed; the GPU half SKIPPED -- " + skip);
    process.exit(fails ? 1 : 0);
}

const b = await chromium.launch({ executablePath: HEADLESS_SHELL,
    args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan,WebGPU"] });
const page = await (await b.newContext()).newPage();
await page.route("**/*", (route) => {
    const u = new URL(route.request().url());
    const p = path.join(ROOT, decodeURIComponent(u.pathname));
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        const ext = path.extname(p);
        const type = ext === ".mjs" || ext === ".js" ? "text/javascript"
            : ext === ".html" ? "text/html" : ext === ".json" ? "application/json" : "text/plain";
        return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(p) });
    }
    return route.fulfill({ status: 404, body: "not found" });
});
await page.goto("http://localhost:8787/magmap-bench.html", { waitUntil: "domcontentloaded" }).catch(() => { });

if (!(await page.evaluate(() => !!navigator.gpu))) {
    console.log("\nmagmapDefault-selfcheck: the source half passed; the GPU half SKIPPED -- navigator.gpu absent");
    await b.close(); process.exit(fails ? 1 : 0);
}

const r = await page.evaluate(async (CAP) => {
    const G = await import("/tools/roundhouse/magmapGpu.mjs");
    const { sampleTable, referenceCell } = await import("/tools/roundhouse/magmapKernel.mjs");
    const { unwrapGpu } = await import("/tools/roundhouse/gpuProvenance.mjs");
    const device = await (await navigator.gpu.requestAdapter()).requestDevice();
    const grade = (vals, CFG) => {
        const table = sampleTable(CFG.nT); let worst = 0, n = 0;
        for (let k = 0; k < CFG.n * CFG.n; k++) {
            const ref = referenceCell(k, { ...CFG, table });
            const d = Math.abs(vals[k] - ref) / Math.max(Math.abs(ref), 1e-30);
            if (d > worst) worst = d; n++;
        }
        return { worst, compared: n };
    };
    const out = {};
    const CFG = { n: 21, span: 1.0, rho: 0.1, nR: 48, nT: 48 };
    const def = await G.magmapGpu(device, CFG);
    const dv = unwrapGpu(def); out.defaultKernel = def.kernel; out.default = grade(dv, CFG);
    const old = await G.magmapGpu(device, { ...CFG, wgsl: G.WGSL });
    const ov = unwrapGpu(old); out.old = grade(ov, CFG);
    let diffs = 0; for (let k = 0; k < dv.length; k++) if (dv[k] !== ov[k]) diffs++;
    out.differingCells = diffs; out.cells = dv.length;

    const BIG = { n: 11, span: 1.0, rho: 0.1, nR: 16, nT: CAP + 32 };
    const big = await G.magmapGpu(device, BIG);
    out.bigKernel = big.kernel; out.big = grade(unwrapGpu(big), BIG);
    // The guard's own justification, measured rather than believed.
    const forced = await G.magmapGpu(device, { ...BIG, wgsl: G.SHIPPED_WGSL });
    out.forced = grade(unwrapGpu(forced), BIG);
    return out;
}, SHARED_CAP);
await b.close();

const TOL = 1e-5;
ok("!! *** the DEFAULT path now runs the shipped variant ***",
    r.defaultKernel === "magmap.wgsl/wg128-shared", r.defaultKernel);
ok("!! the new default agrees with the CPU f64 reference", r.default.worst <= TOL && r.default.compared > 0,
    "worst " + r.default.worst.toExponential(3) + " over " + r.default.compared + " cells vs tol " + TOL.toExponential(0));
// *** BIT-IDENTICAL, MEASURED ON THE HARDWARE. *** magmapVariants claims variants change only where numbers are
// READ FROM, never the arithmetic. That is a claim about what a GPU does with the code, so it is run.
ok("!! *** and it is BIT-IDENTICAL to the kernel it replaced, cell for cell ***",
    r.differingCells === 0 && r.cells > 0,
    r.differingCells + " differing of " + r.cells + " -- a faster kernel that changed a bit would be a new answer key");

ok("!! *** above SHARED_CAP the default FALLS BACK to the base kernel ***",
    r.bigKernel === "magmap.wgsl/base-wg64(nT>cap)", r.bigKernel);
ok("...and the fallback is correct", r.big.worst <= TOL,
    "nT=" + (SHARED_CAP + 32) + " worst " + r.big.worst.toExponential(3));

// *** THE GUARD IS LOAD-BEARING, AND THIS IS THE LINE THAT PROVES IT. *** Without the fallback, a caller
// passing nT > 64 gets numbers that are wrong by percent and look entirely ordinary.
ok("!! *** the cap is NOT decoration: forcing the shared kernel past it is WRONG BY THOUSANDS OF TOLERANCES ***",
    r.forced.worst > TOL * 100,
    "forced worst " + r.forced.worst.toExponential(3) + " = " + Math.round(r.forced.worst / TOL) +
    "x tol, with no crash and no validation error -- out-of-bounds workgroup writes do not announce themselves");

console.log("\n" + (fails ? fails + " FAILED" : "all passed"));
process.exit(fails ? 1 : 0);
