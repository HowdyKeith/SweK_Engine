// WebGLEngine/tools/roundhouse/magmapTaichiRun-selfcheck.mjs -- v3962
//
// Run: node tools/roundhouse/magmapTaichiRun-selfcheck.mjs   (needs Chromium + WebGPU; skips cleanly without)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// *** THE TAICHI LANE SHIPPED AT v3941 AND HAD NEVER ONCE RUN. ***
//
// Its first execution was Keith clicking the button on magmap-bench.html, and it failed on its first line:
// "unresolved identifier: params at: for (let k of ti.range(params.total))".
//
// magmapTaichi-selfcheck.mjs (the static one, beside this file) was green the whole time and was right to be.
// It checks what it claims to check -- that the kernel names only + - * / and ti.sqrt, that no ti.rsqrt or
// ti.sin has crept in, that the tolerance is not redefined. NONE OF THAT IS "DOES IT RUN". A gate that reads
// source can confirm a kernel is well-behaved and cannot confirm it exists.
//
// *** AND THE REASON NOBODY WROTE THIS GATE WAS A COMMENT SAYING IT WAS IMPOSSIBLE. *** The module header
// asserted "there is no headless path that even EMITS the generated WGSL... checked: navigator.gpu is absent in
// headless Chromium here under every documented enabling flag." It is not absent. The headless shell this tree
// already uses for its browser gates exposes navigator.gpu given --enable-unsafe-webgpu and
// --enable-features=Vulkan,WebGPU, and the kernel compiles and runs. A DOCUMENTED IMPOSSIBILITY IS A GATE
// NOBODY WRITES, which is a more expensive kind of wrong than a bug: it does not fail, it removes the thing
// that would have failed.
//
// WHAT THIS GATE ASSERTS is the pair of claims the lane exists to make, and it drives both rather than reading
// either: THE KERNEL COMPILES AND RUNS, and ITS NUMBERS AGREE WITH THE CPU f64 REFERENCE INSIDE MAGMAP_TOL.
// The second is the one that matters -- magmapTaichi's own header is explicit that a taichi kernel is A
// DIFFERENT CODEGEN whose agreement is "a MEASUREMENT, not a construction". So it is measured, every round.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "../ship/playwrightResolve.mjs";
import { noComments } from "../ship/sourceScan.mjs";

const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const { chromium, from: pwFrom } = resolvePlaywright(require_);
const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
if (skip) { console.log("magmapTaichiRun-selfcheck: SKIPPED -- " + skip); process.exit(0); }

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("magmapTaichiRun-selfcheck -- the taichi lane COMPILED AND RUN, not read\n");

const CFG = { n: 21, span: 1.0, rho: 0.1, nR: 48, nT: 48 };

const b = await chromium.launch({
    executablePath: HEADLESS_SHELL,
    // The two flags that made the header's "impossible" possible. Named here so the next person can check the
    // claim in one command instead of inheriting it.
    args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan,WebGPU"],
});
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
// Any page from this tree will do -- it is only a document to run module imports in.
await page.goto("http://localhost:8787/magmap-bench.html", { waitUntil: "domcontentloaded" }).catch(() => { });

const gpu = await page.evaluate(() => !!navigator.gpu);
if (!gpu) {
    // Not a pass. A box without WebGPU genuinely cannot answer this, and saying so is the honest outcome --
    // but it is spelled as a SKIP so selfchecks.mjs leaves it out of the timings rather than recording a run
    // that measured nothing.
    console.log("magmapTaichiRun-selfcheck: SKIPPED -- navigator.gpu absent even with the WebGPU flags");
    await b.close(); process.exit(0);
}

const r = await page.evaluate(async (CFG) => {
    // taichi throws a BARE STRING and puts the reason on console.error (see magmap-bench.html's v3961 note),
    // so the console is captured here too -- otherwise a failure in this gate reports the same six useless
    // words the page used to.
    const realErr = console.error, caught = [];
    console.error = (...a) => { caught.push(a.map((x) => (x && x.message) ? x.message : String(x)).join(" ")); return realErr.apply(console, a); };
    try {
        const m = await import("/vendor/taichi-js/taichi.js");
        const ti = m.default || m;
        const { magmapTaichi } = await import("/tools/roundhouse/magmapTaichi.mjs");
        const { sampleTable, referenceCell } = await import("/tools/roundhouse/magmapKernel.mjs");
        const { MAGMAP_TOL } = await import("/tools/roundhouse/magmapGpu.mjs");
        const { unwrapGpu } = await import("/tools/roundhouse/gpuProvenance.mjs");

        // THE SHIPPING ENTRY POINT, not a re-implementation of it. A gate that rebuilt the fields and the scope
        // itself would pass while magmapTaichi() stayed broken -- which is precisely the failure being closed.
        const tagged = await magmapTaichi(ti, CFG);
        // *** ACROSS THE evaluate() BOUNDARY AS A PLAIN ARRAY, AND THIS IS NOT TIDINESS. *** The first cut
        // returned the markGpu-tagged Float32Array directly; it serialises to {}, so length was undefined,
        // every index was undefined, the comparison loop ran zero times and reported worst = 0 -- A PASS
        // MEASURING NOTHING, which is the exact failure magmapGpu's header names ("a test that passes because
        // the experiment did not run"). The length assertion below is what caught it and is why it is checked
        // BEFORE the agreement, not after.
        // unwrapGpu, NOT Array.from(tagged) -- THIS GATE MADE THE VERY MISTAKE IT EXISTS TO CATCH on its
        // first run. magmapTaichi returns markGpu's ENVELOPE ({kernel, adapter, value}); Array.from() of an
        // object with no length is [], so the comparison had nothing to compare and said worst = 0. That is the
        // same shape as the page bug found one file over, reproduced by me, in the gate written to prevent it.
        const vals = Array.from(unwrapGpu(tagged));

        const table = sampleTable(CFG.nT);
        const total = CFG.n * CFG.n;
        const ref = [];
        for (let k = 0; k < total; k++) ref.push(referenceCell(k, { ...CFG, table }));
        let worst = 0, at = -1;
        for (let k = 0; k < total; k++) {
            const d = Math.abs(vals[k] - ref[k]) / Math.max(Math.abs(ref[k]), 1e-30);
            if (d > worst) { worst = d; at = k; }
        }
        return { ran: true, len: vals.length, total, worst, at, tol: MAGMAP_TOL,
                 finite: vals.length > 0 && vals.every((v) => Number.isFinite(v)) };
    } catch (e) {
        return { ran: false, why: (caught.join(" | ") || "-") + "  [thrown: " + String((e && e.message) || e).trim() + "]" };
    } finally { console.error = realErr; }
}, CFG);

ok("!! *** the taichi kernel COMPILES AND RUNS *** -- the claim the lane shipped without ever testing",
    r.ran === true, r.ran ? "" : r.why);

if (r.ran) {
    ok("it returns one value per cell", r.len === r.total, r.len + " of " + r.total);
    ok("every value is finite -- a NaN field would still 'run'", r.finite === true);
    // THE CLAIM THAT MATTERS. A second codegen agreeing with the hand-written kernel is a measurement, and this
    // is the measurement. A faster wrong answer is not a result.
    // `at >= 0` is load-bearing: it is false exactly when the loop compared nothing, so an empty measurement
    // reports a FAILURE rather than a perfect score. worst === 0 over zero cells is not agreement.
    ok("!! *** its numbers agree with the CPU f64 reference inside MAGMAP_TOL ***",
        r.len === r.total && r.at >= 0 && r.worst <= r.tol,
        "worst " + r.worst.toExponential(3) + " at cell " + r.at + " of " + r.len +
        " compared  vs tol " + r.tol.toExponential(1));
}

// The mechanism, pinned. The bug was a closure standing in for the kernel scope, and it looked correct -- so
// the two calls that actually carry host values into a taichi kernel are named here by the source.
// noComments, because the FIRST RUN OF THIS GATE FAILED ON THE COMMENT THAT EXPLAINS THE FIX -- magmapTaichi's
// note has to name `new Function` to be maintainable, and a raw scan cannot tell the explanation from the thing
// explained. That is the trap sourceScan.mjs was written for, hit again, one file after hitting it in v3961.
const src = noComments(fs.readFileSync(path.join(ROOT, "tools", "roundhouse", "magmapTaichi.mjs"), "utf8"));
ok("!! the host values reach the kernel through addToKernelScope, which is the only channel taichi reads",
    /ti\.addToKernelScope\(/.test(src));
ok("!! ...and no closure pretends to bind them -- `new Function` bound five names taichi never looked at",
    !/new Function\(/.test(src));

await b.close();
console.log("\n" + (fails ? fails + " FAILED" : "all passed"));
process.exit(fails ? 1 : 0);
