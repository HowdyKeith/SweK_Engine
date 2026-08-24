// WebGLEngine/tools/roundhouse/magmapBenchVerdict-selfcheck.mjs -- v3962
//
// Run: node tools/roundhouse/magmapBenchVerdict-selfcheck.mjs   (~4s MEASURED; needs Chromium + WebGPU)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// *** magmap-bench.html SAYS, IN BOLD, THAT IT VERIFIES EVERY VARIANT BEFORE REPORTING A TIME. IT HAD NEVER
// COMPARED A SINGLE NUMBER. ***
//
// Both lanes read their GPU result as `warm.values || warm`. markGpu returns `{ kernel, adapter, value }` --
// VALUE, SINGULAR -- so `.values` was undefined and `|| warm` handed the ENVELOPE to the comparison loop. Every
// `vals[k]` was undefined, every `d` was NaN, and `NaN > worst` is always false, so `worst` could never leave 0.
// The loop ran its full 441 iterations and measured nothing.
//
// *** AND ZERO IS WHAT A GOOD RESULT LOOKS LIKE HERE, WHICH IS THE ENTIRE REASON IT SURVIVED. *** The variants
// are bit-identical by construction, so a column of 0.0e+0 reads as the answer everybody wanted. The tell was
// there and needed someone to want it: the reference is CPU f64 and the kernel is f32, so the honest worst is
// the f32 floor -- 4.42e-6 -- and never 0. A VACUOUS RESULT THAT LOOKS LIKE THE HOPED-FOR RESULT IS WORSE THAN A
// CRASH, because a crash gets fixed.
//
// *** IT HID A SECOND, INDEPENDENT BUG EXACTLY. *** magmapGpu dispatched `ceil(total / 64)` with 64 as a
// LITERAL, while magmapVariants exists to rewrite `@workgroup_size(N)`. wg32 therefore ran 7 groups of 32 = 224
// threads for 441 cells: 217 cells were never written, stayed 0, and it finished in half the time. On Keith's
// rig it read "wg32  6.40  1.14x  0.0e+0  ok" -- the fastest correct variant on the page, and a candidate for a
// tuning decision. It was not faster. It was doing half the work. With both bugs fixed it measures 0.93x:
// SLOWER than the incumbent, which is the opposite conclusion.
//
// ---- WHAT THIS GATE ASSERTS ----------------------------------------------------------------------------------
//
// It drives the REAL PAGE and reads the REAL TABLE, and it makes the two claims that were false:
//   1. every honest variant's worst error is NON-ZERO and inside tolerance -- non-zero is the load-bearing half,
//      because exactly 0.0 is the signature of a comparison that did not happen;
//   2. a variant that IS wrong is REJECTED -- proved by planting one, because a page that rejects nothing and a
//      page with nothing to reject produce identical tables.
// Both come from ONE run, so the cost is one bench, not two.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "../ship/playwrightResolve.mjs";
import { codeOnly } from "../ship/sourceScan.mjs";

const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const { chromium, from: pwFrom } = resolvePlaywright(require_);
const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
if (skip) { console.log("magmapBenchVerdict-selfcheck: SKIPPED -- " + skip); process.exit(0); }

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("magmapBenchVerdict-selfcheck -- can the A/B bench actually reject a wrong kernel?\n");

const b = await chromium.launch({
    executablePath: HEADLESS_SHELL,
    args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan,WebGPU"],
});
const page = await (await b.newContext()).newPage();

// The plant: arithmetically wrong, not structurally broken. Same workgroup size, same shape, ONE CONSTANT in the
// closed form changed (4.0 -> 4.25 inside the discriminant). It must be caught on its NUMBERS, which is the only
// thing the page claims to check -- a variant that failed to compile would prove nothing about adjudication.
const PLANT = '\nVARIANTS.push({ id: "planted-wrong", workgroup: 64, sharedTrig: false,' +
    ' note: "planted by magmapBenchVerdict-selfcheck -- MUST be REJECTED" });\n' +
    'const _realVW = variantWgsl;\n' +
    'variantWgsl = function (base, v) {\n' +
    '  const src = _realVW(base, v);\n' +
    '  return v.id === "planted-wrong" ? src.replace("u * u + 4.0", "u * u + 4.25") : src;\n' +
    '};\n';

await page.route("**/*", (route) => {
    const u = new URL(route.request().url());
    const p = path.join(ROOT, decodeURIComponent(u.pathname));
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        let body = fs.readFileSync(p);
        if (u.pathname === "/tools/roundhouse/magmapVariants.mjs") body = body.toString("utf8") + PLANT;
        const ext = path.extname(p);
        const type = ext === ".mjs" || ext === ".js" ? "text/javascript"
            : ext === ".html" ? "text/html" : ext === ".json" ? "application/json" : "text/plain";
        return route.fulfill({ status: 200, contentType: type, body });
    }
    return route.fulfill({ status: 404, body: "not found" });
});
await page.goto("http://localhost:8787/magmap-bench.html", { waitUntil: "domcontentloaded" }).catch(() => { });

if (!(await page.evaluate(() => !!navigator.gpu))) {
    console.log("magmapBenchVerdict-selfcheck: SKIPPED -- navigator.gpu absent even with the WebGPU flags");
    await b.close(); process.exit(0);
}

await page.click("#run").catch(() => { });
const appeared = await page.waitForSelector("#out table", { timeout: 180000 }).then(() => true).catch(() => false);
ok("the bench runs and renders a table at all", appeared);
if (!appeared) { await b.close(); console.log("\n" + fails + " FAILED"); process.exit(1); }

const rows = await page.evaluate(() => [...document.querySelectorAll("#out table tbody tr")].map((tr) => {
    const td = [...tr.querySelectorAll("td")].map((x) => x.textContent.trim());
    return { id: td[0], ms: td[1], worst: td[3], status: td[4] };
}));
await b.close();

const planted = rows.find((r) => r.id === "planted-wrong");
const honest = rows.filter((r) => r.id !== "planted-wrong" && /^(ok|REJECTED)$/.test(r.status || ""));

ok("the planted variant reached the table (a plant that never ran proves nothing)", !!planted,
    rows.map((r) => r.id).join(", "));

// *** THE CLAIM THE PAGE MAKES IN BOLD. *** Before v3962 this was unreachable: worst was pinned at 0, so
// `worst <= MAGMAP_TOL` was true for every kernel that had ever been timed.
if (planted) {
    ok("!! *** a variant with wrong arithmetic is REJECTED ***", planted.status === "REJECTED",
        "status " + planted.status + ", worst " + planted.worst);
}

// *** AND THE HALF THAT CATCHES A VACUOUS PASS. *** The reference is CPU f64, the kernels are f32: agreement is
// never exact. A row reading 0.0e+0 is not a perfect kernel, it is a comparison that did not happen.
const zeroed = honest.filter((r) => /^0\.0e\+0$/.test(r.worst || ""));
ok("!! *** no honest variant reports a worst error of exactly zero *** -- 0.0e+0 is the signature of a " +
    "comparison that never ran, not of a perfect kernel",
    zeroed.length === 0, zeroed.map((r) => r.id).join(", ") || honest.length + " variants, all non-zero");

for (const r of honest) {
    ok("   " + (r.id || "?").padEnd(14) + " status " + r.status + ", worst " + r.worst,
        r.status === "ok" && /e-\d/.test(r.worst || ""), "");
}

// The mechanism behind the second bug, pinned in source. codeOnly because the comment explaining the fix has to
// name the literal it removed -- the trap hit twice already this round.
const gpuSrc = codeOnly(fs.readFileSync(path.join(ROOT, "tools", "roundhouse", "magmapGpu.mjs"), "utf8"));
ok("!! the dispatch count comes from the shader's own @workgroup_size, not a literal",
    /dispatchWorkgroups\(Math\.ceil\(total \/ wgSize\)\)/.test(gpuSrc) && !/total \/ 64/.test(gpuSrc));
const pageSrc = codeOnly(fs.readFileSync(path.join(ROOT, "magmap-bench.html"), "utf8"));
ok("!! the page reads its GPU results through unwrapGpu, never by indexing the markGpu envelope",
    /unwrapGpu/.test(pageSrc) && !/\.values \|\| warm/.test(pageSrc));

console.log("\n" + (fails ? fails + " FAILED" : "all passed"));
process.exit(fails ? 1 : 0);
