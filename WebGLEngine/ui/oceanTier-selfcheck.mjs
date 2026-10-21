// ui/oceanTier-selfcheck.mjs -- grades the tier switch (slice 3 of ocean-optin-surface). (~1 s)
//
// WHAT THIS GRADES. That oceanTier.mjs decides which water a GPU gets from what was MEASURED: "off" never gives the sea, "auto" gives it only
// with WebGPU, a real (non-software) adapter and a probe under the frame budget -- and never on a name alone -- "on" gives it whenever it can run
// and says plainly when it will be slow; the choice is remembered, and a refusing storage costs nothing. It also grades the harness the probe runs
// through (measureFrames) on a fake clock, so every branch is driven without a GPU.
//
// WHAT IT DOES NOT GRADE, said plainly: any real GPU. The adapter strings are the ones the rig and the container reported, plus the common
// families; classifyAdapter is a hint, and a new vendor string lands in "unknown" until someone adds it. The probe's WORKLOAD is slice 4's -- only
// the sea can say what the sea costs -- so no row here claims a real adapter is affordable. And the page wiring is graded in
// tools/ship/oceanDefaultPage-selfcheck.mjs, in a browser.
//
// SABOTAGES, each applied to the real ui/oceanTier.mjs, restored, md5 verified. 9 of 9 red:
//   S1 auto with no probe gives the sea                          2 rows     S2 the budget boundary made exclusive        1 row
//   S3 on ignores a software adapter                             1 row      S4 off falls through to auto                 1 row
//   S5 the probe's warmup is not dropped                         2 rows     S6 the probe cap removed (a hung probe)      1 row
//   S7 loadPreference not guarded                                CRASH, exit 1 (blocked storage throws out of the gate -- red by exit status)
//   S8 a discrete NAME alone is enough for auto                  CRASH, exit 1 (the unmeasured branch reads probeMs.toFixed(null))
//   S9 the no-WebGPU check dropped                               1 row
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as T from "./oceanTier.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const HERE = path.dirname(fileURLToPath(import.meta.url));

console.log("\n1. WHAT AN ADAPTER'S NAME IS WORTH");
{
    const cases = [
        [{ vendor: "intel", architecture: "gen-9", description: "Intel(R) UHD Graphics 620" }, "integrated", "the rig's laptop, the 228-260 ms reading"],
        [{ vendor: "nvidia", architecture: "pascal", description: "NVIDIA GeForce GTX 1080 Ti" }, "discrete", "the rig's 1080 Ti"],
        [{ vendor: "google", architecture: "swiftshader", description: "SwiftShader" }, "fallback", "the container's software adapter"],
        [{ vendor: "intel", description: "Intel(R) Arc(TM) A380 Graphics" }, "discrete", "Arc is Intel and is not integrated"],
        [{ vendor: "apple", architecture: "metal-3", description: "Apple M2" }, "integrated", ""],
        [{ vendor: "amd", description: "AMD Radeon RX 6800" }, "discrete", ""],
        [{ vendor: "amd", description: "AMD Radeon Graphics" }, "integrated", "an APU"],
        [{ vendor: "qualcomm", description: "Adreno (TM) 650" }, "integrated", ""],
        [{ vendor: "nvidia", description: "NVIDIA RTX A2000", isFallbackAdapter: true }, "fallback", "the flag wins over a discrete name"],
        [{ vendor: "microsoft", description: "Microsoft Basic Render Driver" }, "fallback", "WARP"],
        [{ vendor: "mesa", description: "llvmpipe (LLVM 15.0)" }, "fallback", ""],
        [{ vendor: "acme", description: "Acme FrameMaker 9000" }, "unknown", "a name nobody has classified is unknown, not discrete"],
        [null, "unknown", "no info at all"],
        [{}, "unknown", ""],
    ];
    const wrong = cases.filter(([i, want]) => T.classifyAdapter(i).kind !== want);
    ok("!! *** the adapters the rig and the container reported, and the common families, sort as they should ***", wrong.length === 0,
        wrong.length ? "WRONG: " + wrong.map(([i, w]) => (i && i.description) + " -> " + T.classifyAdapter(i).kind + " (wanted " + w + ")").join("; ") : cases.length + " cases");
    ok("  and an unnamed adapter still has a label to print", T.classifyAdapter(null).label === "unnamed adapter" && /1080 Ti/.test(T.classifyAdapter(cases[1][0]).label), T.classifyAdapter(cases[1][0]).label);
}

console.log("\n2. THE DECISION, ONE ROW PER BRANCH");
{
    const UHD = { vendor: "intel", architecture: "gen-9", description: "Intel(R) UHD Graphics 620" };
    const GTX = { vendor: "nvidia", architecture: "pascal", description: "NVIDIA GeForce GTX 1080 Ti" };
    const SW = { vendor: "google", architecture: "swiftshader", description: "SwiftShader" };
    const c = (o) => T.chooseTier(o);
    ok("!! *** off never gives the sea -- not with a fast GPU, a fast probe, or WebGPU ***", c({ preference: "off", webgpu: true, adapter: GTX, probeMs: 1 }).tier === "default", c({ preference: "off", webgpu: true, adapter: GTX, probeMs: 1 }).reason);
    ok("!! *** auto never gives the sea without a measurement, whatever the adapter is called ***",
        ["auto"].every((p) => c({ preference: p, webgpu: true, adapter: GTX, probeMs: null }).tier === "default" && c({ preference: p, webgpu: true, adapter: GTX, probeMs: null }).needsProbe === true),
        c({ preference: "auto", webgpu: true, adapter: GTX }).reason);
    ok("!! *** auto gives the sea inside the budget and the default water outside it, on the SAME adapter ***",
        c({ preference: "auto", webgpu: true, adapter: GTX, probeMs: 8 }).tier === "sea" && c({ preference: "auto", webgpu: true, adapter: GTX, probeMs: 80 }).tier === "default",
        "8 ms -> sea, 80 ms -> default");
    ok("  the recorded readings (228 ms and 260 ms GPU time, a 100 ms frame cap) all land on the default water under auto", [228, 260, 100].every((ms) => c({ preference: "auto", webgpu: true, adapter: UHD, probeMs: ms }).tier === "default"), "the UHD 620's own numbers");
    ok("  the budget boundary is inclusive of the budget and exclusive above it", c({ preference: "auto", webgpu: true, adapter: GTX, probeMs: T.BUDGET_MS }).tier === "sea" && c({ preference: "auto", webgpu: true, adapter: GTX, probeMs: T.BUDGET_MS + 0.01 }).tier === "default", "BUDGET_MS " + T.BUDGET_MS.toFixed(2));
    ok("!! *** no WebGPU means the default water under every preference, including on ***", ["off", "auto", "on"].every((p) => c({ preference: p, webgpu: false, adapter: GTX, probeMs: 1 }).tier === "default"), c({ preference: "on", webgpu: false }).reason);
    ok("!! *** a software adapter gets the default water even when the player said on ***", c({ preference: "on", webgpu: true, adapter: SW }).tier === "default" && c({ preference: "auto", webgpu: true, adapter: SW, probeMs: 1 }).tier === "default", c({ preference: "on", webgpu: true, adapter: SW }).reason);
    const slowOn = c({ preference: "on", webgpu: true, adapter: UHD, probeMs: 228 });
    ok("!! *** on gives the sea on a slow GPU, as asked, and SAYS how slow ***", slowOn.tier === "sea" && /228\.0 ms/.test(slowOn.reason) && /4 fps/.test(slowOn.reason), slowOn.reason);
    ok("  on with no measurement is the sea, without inventing a speed", c({ preference: "on", webgpu: true, adapter: UHD }).tier === "sea" && !/fps/.test(c({ preference: "on", webgpu: true, adapter: UHD }).reason), c({ preference: "on", webgpu: true, adapter: UHD }).reason);
    ok("  an unrecognised preference is auto, not an error", c({ preference: "turbo", webgpu: true, adapter: GTX, probeMs: 5 }).preference === "auto" && c({}).preference === "auto" && c({}).tier === "default", "turbo -> auto");
    ok("  every decision carries a reason, and the reason names the adapter when one matters", ["off", "auto", "on"].every((p) => c({ preference: p, webgpu: true, adapter: GTX, probeMs: 8 }).reason.length > 10) && /1080 Ti/.test(c({ preference: "auto", webgpu: true, adapter: GTX, probeMs: 8 }).reason), "");
}

console.log("\n3. THE PROBE HARNESS, ON A FAKE CLOCK");
{
    const clock = (steps) => { let t = 0, i = 0; return { now: () => t, frame: async (k) => { t += steps[Math.min(k, steps.length - 1)]; i++; } }; };
    const m = (arr, warmup = 3) => T.probeMedian(arr, warmup);
    ok("probeMedian drops the warmup and takes the median of the rest", m([500, 400, 300, 10, 12, 11]) === 11 && m([500, 400, 300, 10, 30]) === 20, "warmup 3: [10,12,11] -> 11, [10,30] -> 20");
    ok("  and says null, not 0, when nothing is left to measure", m([5, 5, 5]) === null && m([]) === null && m(null) === null && m([NaN, -1, Infinity], 0) === null, "");
    ok("the harness defaults are sane: the warmup is shorter than the run, the run is long enough to take a median of, and the cap is above the budget it guards",
        T.PROBE_WARMUP < T.PROBE_FRAMES && T.PROBE_FRAMES - T.PROBE_WARMUP >= 5 && T.PROBE_CAP_MS > 10 * T.BUDGET_MS && T.TIERS.length === 3 && T.TIERS.join() === "off,auto,on",
        `PROBE_FRAMES ${T.PROBE_FRAMES}, PROBE_WARMUP ${T.PROBE_WARMUP}, PROBE_CAP_MS ${T.PROBE_CAP_MS}, TIERS ${T.TIERS.join("/")}`);
    const c1 = clock([100, 50, 40, 10]);
    const r1 = await T.measureFrames(c1.frame, { frames: 8, warmup: 3, now: c1.now });
    ok("!! *** measureFrames times each frame, and the slow warmup frames do not reach the median ***", r1.samples.length === 8 && r1.median === 10 && !r1.capped && r1.error === "", "samples " + r1.samples.join(", ") + " -> median " + r1.median);
    const c2 = clock([900]);
    const r2 = await T.measureFrames(c2.frame, { frames: 12, warmup: 3, now: c2.now, capMs: 2000 });
    ok("!! *** a probe that cannot finish gives up at the cap and says so, instead of hanging the page ***", r2.capped === true && r2.samples.length === 3 && r2.median != null, "stopped after " + r2.samples.length + " frames of 900 ms");
    const r3 = await T.measureFrames(async () => { throw new Error("device lost"); }, { now: () => 0 });
    ok("  a frame that throws is an error result with no median, never an exception out of the probe", r3.error === "device lost" && r3.median === null, JSON.stringify(r3));
    ok("  and the median a probe returns feeds the decision directly", T.chooseTier({ preference: "auto", webgpu: true, adapter: { description: "NVIDIA GeForce RTX 3080" }, probeMs: r1.median }).tier === "sea", "10 ms -> sea");
}

console.log("\n4. THE CHOICE IS REMEMBERED, AND A REFUSING STORAGE COSTS NOTHING");
{
    const mem = () => { const d = new Map(); return { getItem: (k) => (d.has(k) ? d.get(k) : null), setItem: (k, v) => { d.set(k, String(v)); } }; };
    const s = mem();
    ok("nothing stored reads as auto", T.loadPreference(s) === "auto", "");
    ok("!! *** a saved preference comes back, each of the three ***", ["off", "on", "auto"].every((p) => T.savePreference(s, p) && T.loadPreference(s) === p), "off, on, auto");
    ok("  an invalid preference is neither saved nor loaded", T.savePreference(s, "turbo") === false && (s.setItem(T.STORAGE_KEY, "turbo"), T.loadPreference(s)) === "auto", "turbo refused, and a poisoned entry reads as auto");
    const bad = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
    ok("!! *** a storage that throws on both read and write changes nothing and raises nothing ***", T.loadPreference(bad) === "auto" && T.savePreference(bad, "on") === false && T.loadPreference(null) === "auto" && T.savePreference(null, "on") === false, "private window, blocked site data, no storage at all");
    ok("  the key is namespaced", /^swek\.ocean\./.test(T.STORAGE_KEY), T.STORAGE_KEY);
}

console.log("\n5. WHAT THE MODULE DOES NOT TOUCH");
{
    const src = fs.readFileSync(path.join(HERE, "oceanTier.mjs"), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const imports = [...src.matchAll(/import\s+[^;]*?from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    ok("!! *** it imports nothing -- in particular not the vendored sea, which stays byte-identical because nothing here can reach it ***", imports.length === 0 && !/web-ocean/.test(src), "imports: " + (imports.join(", ") || "(none)"));
    const bad = ["Date.now", "Math.random", "new Date", "document", "navigator", "window", "localStorage", "sessionStorage", "process."].filter((t) => src.includes(t));
    ok("  it reads no global: the clock, the storage and the adapter all arrive as arguments", bad.length === 0, bad.length ? "found: " + bad.join(", ") : "performance.now only as a default parameter");
    const report = T.reportLines(T.chooseTier({ preference: "auto", webgpu: true, adapter: { description: "NVIDIA GeForce GTX 1080 Ti" } }));
    ok("  its report says the sea has not been timed when that is the reason", report.some((l) => /not been timed/.test(l)) && report[0].startsWith("tier: default"), report.join(" | "));
}

say("UNCHECKED, said plainly: that any real adapter reaches the sea within the budget; the sea itself (slice 4) and the probe workload it supplies; that a browser reports adapter info the way the fixtures spell it (Chrome's GPUAdapterInfo vs requestAdapterInfo vary by version).");
console.log("oceanTier-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
