// WebGLEngine/render/snowAblate-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// Run: node render/snowAblate-selfcheck.mjs      (about 12 s on the software adapter: two frame graphs are built)
//
// GATES render/snowAblate.mjs (the terms of the snow beauty pass, each able to be compiled out) and the arithmetic in render/snowFrameTiming.mjs that turns a run of beauty-pass times into "this term is worth N ms". The tool
// exists because the rig's per-pass GPU times put 85 to 95% of the frame in the beauty fragment pass and a timestamp cannot say which part of it. What this file holds: every edit matches the real shader EXACTLY ONCE (a
// shader that moved on must refuse, not measure an unchanged shader); every variant is still valid WGSL (compiled by Dawn's Tint on a native device, this file makes its own so the rig's `--native --only render/` runs it
// too); the interleaved-baseline arithmetic; and, live, that removing the terms really does make the pass cheaper and the picture different (so the edit reached the pipeline).
//
// SABOTAGES, RESULTS BY NAME (each against render/snowAblate.mjs, snowFrameTiming.mjs or snowGpu.mjs, this gate run, restored identical):
//   S1 the shadow edit's find text altered by one character                         -> 1 RED: the match-once row, which names `shadow` and the count 0
//   S2 the glints edit made to replace with text that is not WGSL                   -> 2 RED: the compile row (Tint rejects the variant) and the live row (the pipeline cannot be built)
//   S3 ABLATION_NAMES leaves out `aerial`                                           -> 1 RED: the names-are-the-table's-keys row
//   S4 ablationRows takes the cost against only the first baseline                  -> 3 RED: the arithmetic row, the drift-cancels row and the line row
//   S5 snowGpu.mjs ignores `ablate` (the option reaches nothing)                    -> 1 RED: the live row (the pass with every term removed is not cheaper)
"use strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolveWebgpu, configureVulkanIcd, headlessGpuSkipReason, noteNativeAdapter, exitCleanly } from "../tools/ship/headlessGpu.mjs";
import { ABLATIONS, ABLATION_NAMES, ablateWgsl } from "./snowAblate.mjs";
import { BEAUTY_WGSL, createSnowGpu } from "./snowGpu.mjs";
import { ablationRows, ablationLine, parseAblationLine, timeFrames, summarise, orbitAt } from "./snowFrameTiming.mjs";

const require_ = createRequire(import.meta.url);
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message); } };
const t0 = performance.now();

console.log("snowAblate-selfcheck -- the beauty pass, term by term\n");

console.log("1. EVERY EDIT MATCHES THE REAL SHADER EXACTLY ONCE");
{
    const sizes = {};
    let allMatch = true, detail = [];
    for (const n of ABLATION_NAMES) {
        let out; const err = throws(() => { out = ablateWgsl(BEAUTY_WGSL, [n]); });
        if (err || out === BEAUTY_WGSL) { allMatch = false; detail.push(n + ": " + (err || "no change").slice(0, 80)); }
        else sizes[n] = BEAUTY_WGSL.length - out.length;
    }
    ok("each of the " + ABLATION_NAMES.length + " terms (" + ABLATION_NAMES.join(", ") + ") is found in snowGpu's BEAUTY_WGSL exactly once and removing it changes the shader", allMatch, detail.join("; ") || "removed chars: " + JSON.stringify(sizes));
    const all = ablateWgsl(BEAUTY_WGSL, ["all"]), union = ablateWgsl(BEAUTY_WGSL, [...ABLATION_NAMES]);
    ok("`all` is the union of every term, applied together", all === union && all.length < BEAUTY_WGSL.length);
    const unknown = throws(() => ablateWgsl(BEAUTY_WGSL, ["shaddow"]));
    ok("an unknown term is refused by name, with the list of real ones", unknown && /no term named "shaddow"/.test(unknown) && /shadow, sss/.test(unknown), unknown);
    const moved = throws(() => ablateWgsl(BEAUTY_WGSL.replace("shadow = sunShadow(world, geoN, viewDist, noiseRot);", "shadow = sunShadow2(world, geoN, viewDist, noiseRot);"), ["shadow"]));
    ok("!! a shader that has moved on is REFUSED, naming the term and the count (0 matches), and not measured as an unchanged shader that makes the term look free", moved && /sunShadow call for term 'shadow' matches 0 times/.test(moved), moved);
    const twice = throws(() => ablateWgsl(BEAUTY_WGSL + "\n" + "shadow = sunShadow(world, geoN, viewDist, noiseRot);", ["shadow"]));
    ok("...and a shader where the text appears TWICE is refused too (an ablation must say what it removed)", twice && /matches 2 times/.test(twice), twice);
    ok("every term carries a reason in words, and the list of names is exactly the table's keys", ABLATION_NAMES.every((n) => ABLATIONS[n] && ABLATIONS[n].why.length > 10) && Object.keys(ABLATIONS).sort().join() === [...ABLATION_NAMES].sort().join());
}

console.log("\n2. THE ARITHMETIC: A TERM'S WORTH BETWEEN TWO BASELINES");
{
    const seq = [{ name: "base", beauty: 50 }, { name: "shadow", beauty: 46 }, { name: "base", beauty: 54 }, { name: "sss", beauty: 49 }, { name: "base", beauty: 58 }];
    const rows = ablationRows(seq);
    ok("a term's cost is the mean of the two baselines it sits between minus the pass without it: shadow (50 and 54 around 46) saves 6.0 ms = 11.5%; sss (54 and 58 around 49) saves 7.0 ms = 12.5%", Math.abs(rows[0].saves - 6) < 1e-9 && Math.abs(rows[0].pct - 11.538) < 0.01 && Math.abs(rows[1].saves - 7) < 1e-9 && Math.abs(rows[1].pct - 12.5) < 1e-9, JSON.stringify(rows.map((r) => [r.term, r.saves.toFixed(2), r.pct.toFixed(1)])));
    const drifted = ablationRows([{ name: "base", beauty: 50 }, { name: "x", beauty: 50 }, { name: "base", beauty: 70 }])[0];
    ok("!! DRIFT CANCELS: a term that costs nothing, timed while the laptop's pass slid from 50 to 70 ms, reads 10 ms against the mean baseline (60) and the drift is printed (+40%), where one baseline alone would call it 0 or 20 ms", Math.abs(drifted.saves - 10) < 1e-9 && Math.abs(drifted.drift - 40) < 1e-9, JSON.stringify({ saves: drifted.saves, drift: drifted.drift }));
    ok("a sequence that is not base, term, base, ... base is refused (even length, a term in a baseline's place, a time that is not a number)", [[{ name: "base", beauty: 1 }, { name: "t", beauty: 1 }], [{ name: "t", beauty: 1 }, { name: "u", beauty: 1 }, { name: "base", beauty: 1 }], [{ name: "base", beauty: 1 }, { name: "t", beauty: NaN }, { name: "base", beauty: 1 }], []].every((s) => throws(() => ablationRows(s))));
    const line = ablationLine(1280, 720, 2048, rows[0], "intel gen-9"), p = parseAblationLine(line);
    ok("the line names the size, the shadow size, the pass, the term, what it saves, both baselines and the adapter, and parses back", p && p.width === 1280 && p.term === "shadow" && Math.abs(p.saves - 6) < 0.01 && p.before === 50 && p.after === 54 && p.adapter === "intel gen-9" && parseAblationLine("reading snowFrame: x") === null, line);
}

const skip = headlessGpuSkipReason(require_);
console.log("\n3. EVERY VARIANT IS STILL WGSL, AND THE EDIT REACHES THE PIPELINE");
if (skip) {
    report("native half SKIPPED -- " + skip);
    report("*** THAT IS A SKIP AND NOT A PASS: nothing here has compiled a variant or timed a pass");
} else {
    configureVulkanIcd();
    const { mod } = resolveWebgpu(require_);
    Object.assign(globalThis, mod.globals || {});
    const gpu = mod.create([]);   // reachable for the whole run (headlessGpu.mjs's v4691 note)
    const adapter = await gpu.requestAdapter();
    const info = adapter ? adapter.info || {} : {}, name = [info.vendor, info.architecture, info.description].filter(Boolean).join(" ");
    ok("a native adapter answered", !!adapter, name);
    if (adapter) {
        noteNativeAdapter(adapter, { gate: fileURLToPath(import.meta.url) });
        const hasTs = adapter.features && adapter.features.has("timestamp-query");
        const device = await adapter.requestDevice({ requiredFeatures: hasTs ? ["timestamp-query"] : [] });
        const bad = [];
        for (const n of [...ABLATION_NAMES, "all"]) {
            const m = device.createShaderModule({ code: ablateWgsl(BEAUTY_WGSL, [n]) }), ci = await m.getCompilationInfo();
            for (const e of ci.messages.filter((x) => x.type === "error")) bad.push(n + " " + e.lineNum + ":" + e.linePos + " " + e.message.slice(0, 80));
        }
        const m0 = await device.createShaderModule({ code: BEAUTY_WGSL }).getCompilationInfo();
        ok("!! the unmodified shader and all " + (ABLATION_NAMES.length + 1) + " variants (each term alone, and `all`) compile with no WGSL error on a native device", m0.messages.filter((x) => x.type === "error").length === 0 && bad.length === 0, bad.slice(0, 3).join(" | ") || "clean");
        if (!hasTs) report("this adapter has no timestamp-query: the live half is SKIPPED here (the rig's adapter carries it)");
        else {
            const base = await timeFrames(device, { width: 96, height: 54, warmup: 1, warmupMs: 0, frames: 3, passTimers: true });
            const none = await timeFrames(device, { width: 96, height: 54, warmup: 1, warmupMs: 0, frames: 3, passTimers: true, ablate: ["all"] });
            await new Promise((r) => setTimeout(r, 50));
            const bB = summarise(base.passes.beauty.map((v) => Math.max(v, 1e-6))).median, bN = summarise(none.passes.beauty.map((v) => Math.max(v, 1e-6))).median;
            ok("!! the edit reaches the pipeline: with every term compiled out the beauty pass is cheaper than with them in (a pass that did not change would read the same), and neither run raised a GPU error", bN < bB * 0.9 && base.errors.length === 0 && none.errors.length === 0, `beauty ${bB.toFixed(2)} ms with every term, ${bN.toFixed(2)} ms with none (${(100 * (bB - bN) / bB).toFixed(0)}% of the pass), adapter ${name}`);
            report("reading snowAblate: native 96x54 beauty pass " + bB.toFixed(2) + " ms; without all " + bN.toFixed(2) + " ms (saves " + (bB - bN).toFixed(2) + " ms); adapter " + name + "  [two 3-frame runs: the rig's numbers come from takeSnowFrameTiming --ablate]");
            report("gate wall time " + ((performance.now() - t0) / 1000).toFixed(1) + " s");
        }
    }
}

console.log(`\nsnowAblate-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
console.log("unchecked here: A REAL GPU (the sandbox's native run is a software rasteriser, where the split between terms is a CPU's), and which term is worth cutting -- that is the rig's `takeSnowFrameTiming.mjs --ablate`, never this gate.");
exitCleanly(fails === 0 ? 0 : 1);
