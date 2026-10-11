// WebGLEngine/render/denoiseTiming-selfcheck.mjs -- the denoiser arc, round 12: what a pass costs on the device
//
// Run: node render/denoiseTiming-selfcheck.mjs            (on the rig: node tools/ship/realGpuRun.mjs --only denoise)
//
// GATES the timing half of render/denoiseDevice.mjs (pre-registration section 37). Its exports, named here: TIMING_SIZES,
// largestBuffer, timingInput, summarize, adapterOf, timingDevice, timingLadder -- and the denoiser's time() and output().
// Sections 35-36 put round 11's network on the device and found every time SwiftShader's: a CPU running a JIT. This times
// the shipped network on a ladder of sizes, 64 x 64 up to a 1080p frame, two ways -- natively on node-webgpu's default
// adapter, and through denoise.html's own "Time the network" in Chromium -- and prints what it measured as "----" lines,
// which tools/ship/realGpuRun.mjs collects with the adapter each ran on.
// Round 13 (section 39): the ladder times BOTH kernel sets, r12 and the fast r13, on one device a size, taking turns, and
// prints r13's speedup over r12 at every size both measured -- section 39's K1, read off the rig's report. Asserted: the
// sets took turns in the stated order, they are different kernels, and the speedup is the two medians' ratio on the
// clock it names. Not asserted: its size.
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
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const { TIMING_SIZES, largestBuffer, timingInput, summarize, adapterOf, timingLadder, decodeNet, KERNEL_SETS } = await imp("render/denoiseDevice.mjs");
const H = await imp("tools/ship/headlessGpu.mjs");
const { runInEngineOrigin } = await imp("tools/ship/webgpuHarness.mjs");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const t0 = Date.now();
const net = decodeNet(JSON.parse(fs.readFileSync(path.join(ENG, "render/denoise-net-r11.json"), "utf8")).net);
const CAP = 1500, QUANTUM = 0.2;   // the ladder's cap a pass, ms; a browser rounds timestamps to 0.1 ms, so nesting gets two quanta
const NATIVE_SETS = ["r12", "r14"];   // the native ladder's sets (section 43); the page's are KERNEL_SETS, all three

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
    for (const s of r.sets) for (const x of r.rows[s]) {
        if (x.skipped) { say(`${label} ${s}: ${x.W} x ${x.H} skipped -- ${x.reason}`); continue; }
        const convMs = x.perPass ? x.perPass.slice(0, MACS.length).reduce((a, q) => a + q.ms, 0) : null;
        say(`${label} ${s}: ${x.W} x ${x.H}: ${x.wall.median.toFixed(3)} ms a pass (10th-90th ${x.wall.p10.toFixed(3)}-${x.wall.p90.toFixed(3)}, ${x.wall.n} passes)` +
            (x.gpu ? `; on the device's clock ${x.gpu.median.toFixed(3)} ms` : "; no timestamp queries") + `; ${x.mpxPerS.toFixed(3)} Mpx/s` +
            (convMs ? `; conv ${(x.H * x.W * 2 * MACS.reduce((a, b) => a + b, 0) / (convMs / 1000) / 1e9).toFixed(1)} GFLOP/s` : "") +
            (x.perPass ? `; ${x.perPass.map((q) => q.name.replace(/ \(.*\)/, "") + " " + q.ms.toFixed(3)).join(", ")}` : ""));
    }
    for (const [B, qs] of Object.entries(r.speedup)) for (const q of qs) if (q.measured)
        say(`${label}: ${B} against ${r.sets[0]} at ${q.W} x ${q.H}: ${q.ratio.toFixed(2)} x as fast, on the ${q.clock === "device" ? "device's clock" : "wall clock"}`);
}
// what a PAIRED ladder must be, wherever it ran (section 39): both sets, each held as a ladder, taking turns in the stated
// order on one device, different kernels, and a speedup that is the ratio of the two medians on the clock it names
function pairedHolds(label, r, want = KERNEL_SETS) {
    for (const s of want) holds(`${label} ${s}`, r ? { adapter: r.adapter, rows: r.rows[s], invisible: r.invisible[s] } : null);
    const A = want[0], others = want.slice(1);
    const turns = [...want, ...[...want].reverse(), ...want].join();
    // the sizes every set measured: there the sets took turns on one device, in the stated order
    const all = r ? r.rows[A].map((a, i) => want.map((s) => r.rows[s][i])).filter((xs) => xs.every((x) => !x.skipped)) : [];
    ok(`!! ${label}: every set (${want.join(", ")}) measured at the first size, on one device, taking turns -- ${turns.replace(/,/g, " ")} -- each set's passes pooled across the rounds`,
        !!r && r.sets.join() === want.join() && all.length >= 1 && want.every((s) => !r.rows[s][0].skipped) &&
        // one shared turn order (compared by value: the page's ladder arrives as JSON)
        all.every((xs) => xs.every((x) => x.order.join() === turns && x.wall.n >= 3)),
        all.length ? `${all.length} size(s) with every set; ${all[0].map((x) => x.wall.n).join(", ")} passes at the first` : "none with every set");
    // what each set's layers run on, read off the pass names the ladder printed
    const kinds = { r12: "tiled,tiled,tiled,tiled,direct|apply", r13: "fast,fast,fast,fast,fast|apply", r14: "fast,fast,fast,fast,head|apply_fast" };
    const kindOf = (x) => x.passes.slice(0, 5).map((n) => /\((\w+),/.exec(n)[1]).join() + "|" + /\((\w+)\)$/.exec(x.passes[5])[1];
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

console.log("1. THE LADDER'S ARITHMETIC");
{
    const s = summarize([5, 1, 4, 2, 3, 9, 7, 8, 6, 10]);
    ok("  summarize is nearest rank: the median, the 10th and the 90th of ten times", s.median === 5 && s.p10 === 1 && s.p90 === 9 && s.n === 10 && summarize([]) === null);
    ok("  the ladder runs from the trained 64 x 64 to a 1080p frame, each size more pixels than the last",
        TIMING_SIZES[0].join() === "64,64" && TIMING_SIZES.at(-1).join() === "1920,1080" && TIMING_SIZES.every((z, i) => !i || z[0] * z[1] > TIMING_SIZES[i - 1][0] * TIMING_SIZES[i - 1][1]));
    ok("  a pass's largest buffer is the head's 81 logits a pixel: 672 MB at 1080p, what a device's storage limit is checked against",
        largestBuffer(net, 1080, 1920) === 1920 * 1080 * 81 * 4 && largestBuffer(net, 64, 64) === 64 * 64 * 81 * 4);
    const a = timingInput(8, 16), b = timingInput(8, 16);
    ok("  the input is the same every time, in the network's ranges, with both sides of a mask",
        a.every((v, i) => v === b[i]) && a.length === 8 * 16 * 10 && new Set(Array.from({ length: 128 }, (_, p) => a[p * 10 + 9])).size === 2);
    ok("  an adapter is software by the spec's own flag, else by its name: SwiftShader is, a named GPU is not -- and it says whether it offers timestamps",
        adapterOf({ info: { vendor: "google", architecture: "swiftshader" } }).software === true && adapterOf({ info: { vendor: "nvidia", architecture: "pascal" } }).software === false &&
        adapterOf({ isFallbackAdapter: true, info: { vendor: "x" } }).software === true &&
        adapterOf({ info: {}, features: new Set(["timestamp-query"]) }).timestamps === true && adapterOf({ info: {}, features: new Set() }).timestamps === false);
}

const skip = H.headlessGpuSkipReason ? H.headlessGpuSkipReason() : null;
console.log("\n2. NATIVE: node-webgpu's default adapter (on the rig, the GPU)");
if (skip) console.log("  SKIP  " + skip);
else {
    let r = null, err = null;
    try {
        H.configureVulkanIcd();
        const { mod } = H.resolveWebgpu(), gpu = mod.create([]);
        // round 14 (section 43): natively r12 against r14 -- r13's native failure is section 42's finding, and each native
        // fast pipeline costs minutes to build under the D3D12 compiler node-webgpu ships -- with a 600 s ladder budget
        r = await timingLadder(net, () => gpu.requestAdapter(), { sets: NATIVE_SETS, capMs: CAP, warmup: 1, minReps: 3, budgetMs: 1500, totalMs: 600000 });
        // the rig's report names every adapter a gate ran on; this one is not reached through the browser harness, so it says itself
        if (process.env.SWEK_ADAPTER_LOG) {
            const [vendor, architecture, description] = r.adapter.name.split(" / ");
            fs.appendFileSync(process.env.SWEK_ADAPTER_LOG, JSON.stringify({ gate: path.relative(ENG, path.resolve(process.argv[1] || "")).replace(/\\/g, "/"),
                adapter: { vendor: vendor || null, architecture: architecture || null, description: description || null }, software: r.adapter.software, launchArgs: ["node-webgpu (native)"] }) + "\n");
        }
    } catch (e) { err = String(e && e.message || e); }
    if (err) ok("!! the native ladder ran", false, err.slice(0, 200));
    else { pairedHolds("native", r, NATIVE_SETS); report("native", r); }
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
            pairedHolds("page", L); report("page", L);
            ok("  the page and the harness agree on what the device is", r.software === null || L.adapter.software === r.software, `harness says ${r.software ? "software" : "hardware"}`);
        }
    }
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: any number. What a pass costs is printed above and asserted nowhere -- on SwiftShader it is a CPU's, and " +
    "on a GPU it is what tools/ship/realGpuRun.mjs carries back.");
H.exitCleanly ? H.exitCleanly(fails ? 1 : 0) : process.exit(fails ? 1 : 0);
