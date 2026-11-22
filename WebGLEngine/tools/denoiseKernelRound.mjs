#!/usr/bin/env node
// WebGLEngine/tools/denoiseKernelRound.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A REGISTERED TIMING ROUND FOR ONE ENTRY OF THE PAGE'S KERNEL TABLE. render/denoiseDevice.mjs's PAGE_KERNELS_BY_ADAPTER says which kernel set denoise.html runs on a
// measured adapter: "Windows/intel/gen-9" -> r18u (section 63, timed in Chrome). On 2026-11-22 tools/denoiseLayers.mjs, natively on that Intel, read r57p as the fastest
// whole set, about 3% under r18u -- seen, not asked. Keith: "2 can run on my rig". This asks it, on fresh timings, the way the table's entries were made: IN THE PAGE.
//
//   node tools/denoiseKernelRound.mjs --challenger r57p [--repeats 5] [--out FILE] [--no-native]
//   --no-native: the page only (the native timings are reported, never deciding; on a software adapter they take far too long)
//
//   1  THE PAGE (DECIDES)   denoise.html?sets=<incumbent>,<challenger> in Chrome on the GPU (tools/ship/webgpuHarness.mjs HARDWARE_ARGS), its own "Time the network"
//                           (the sets taking turns at each size, each pass on the GPU's own clock), `repeats` times, each a fresh page. The incumbent is the table's entry
//                           for the key the page itself reports.
//   2  NATIVE (REPORTED)    the same two sets by timingLadder on node-webgpu's adapter, `repeats` times -- said beside the page's, never deciding (the table is the page's)
//
// REGISTERED 2026-11-22, BEFORE ANY RUN BELOW. At every size of 512 x 512 or more that both sets were timed at on the GPU's clock in every repeat (at least two such sizes):
//   the ratio incumbent / challenger, per repeat. THE CHALLENGER REPLACES THE INCUMBENT for the page's key if, at EVERY such size, the median ratio is at least 1.02 AND the
//   challenger was faster in at least 4 of 5 repeats (4/5 of them for another count), and the page found timing changed no image (its own check). Otherwise the entry stays.
//   A software adapter is refused: its times are a CPU's (--allow-software runs it anyway, for the gate, and the report says it decides nothing).
// FORECAST, for the record: r57p replaces r18u on the Intel gen-9 at 1.02-1.05 (the native reading's 3%), unless Chrome's compiler reverses it.
//
// It writes one JSON report (by default render/denoise-round-<key>-<challenger>.json) and never overwrites one. The rig's commands: docs/real-hardware-denoiser-layers.md.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as DD from "../render/denoiseDevice.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MIN_SIDE = 512, MIN_RATIO = 1.02, WIN_SHARE = 4 / 5, MIN_SIZES = 2;

/** One ladder's GPU medians by size: { "WxH": { [set]: ms } }, only sizes timed on the GPU's clock by every set given. Pure. */
export function mediansOf(ladder, sets) {
    const out = {};
    for (const row of ladder.rows[sets[0]] || []) {
        const key = `${row.W}x${row.H}`, ms = {};
        for (const s of sets) { const r = (ladder.rows[s] || []).find((x) => x.W === row.W && x.H === row.H); if (r && !r.skipped && r.gpu && r.gpu.median > 0) ms[s] = r.gpu.median; }
        if (Object.keys(ms).length === sets.length) out[key] = ms;
    }
    return out;
}
/** The registered decision from the page's repeats ([{ "WxH": { set: ms } }]). Pure. */
export function decide(repeats, incumbent, challenger, { invisible = true } = {}) {
    const sizes = Object.keys(repeats[0] || {}).filter((k) => { const [w, h] = k.split("x").map(Number); return Math.min(w, h) >= MIN_SIDE && repeats.every((r) => r[k]); });
    const bySize = sizes.map((k) => {
        const ratios = repeats.map((r) => r[k][incumbent] / r[k][challenger]), sorted = ratios.slice().sort((a, b) => a - b), median = sorted.length % 2 ? sorted[sorted.length >> 1] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
        const wins = ratios.filter((x) => x > 1).length, holds = median >= MIN_RATIO && wins >= Math.ceil(WIN_SHARE * repeats.length);
        return { size: k, ratios, median, wins, holds };
    });
    const replace = invisible && bySize.length >= MIN_SIZES && bySize.every((s) => s.holds);
    const why = !invisible ? "the page found timing changed an image" : bySize.length < MIN_SIZES ? `only ${bySize.length} size(s) of ${MIN_SIDE} or more were timed by both sets in every repeat` : replace ? `${challenger} is at least ${MIN_RATIO} x faster in median, and faster in at least ${Math.ceil(WIN_SHARE * repeats.length)} of ${repeats.length} repeats, at every size` : `not at every size: ${bySize.filter((s) => !s.holds).map((s) => `${s.size} median ${s.median.toFixed(3)} x, ${s.wins} of ${repeats.length} won`).join("; ")}`;
    return { replace, entry: replace ? challenger : incumbent, sizes: bySize, reason: (replace ? `${challenger} REPLACES ${incumbent}: ` : `${incumbent} STAYS: `) + why };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const H = await import("./ship/webgpuHarness.mjs"), GPU = await import("./ship/headlessGpu.mjs"), rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; };
    const bad = rest.filter((x) => x.startsWith("--") && !["challenger", "repeats", "out", "allow-software", "no-native"].includes(x.slice(2)));
    if (bad.length) { console.error(`denoiseKernelRound: unknown option ${bad.join(", ")}`); process.exit(2); }
    const challenger = arg("challenger"), repeats = Number(arg("repeats", 5)), soft = rest.includes("--allow-software");
    if (!DD.TIMED_SETS.includes(challenger || "")) { console.error(`denoiseKernelRound: --challenger is one of ${DD.TIMED_SETS.join(", ")}`); process.exit(2); }
    if (!(Number.isInteger(repeats) && repeats >= 1 && repeats <= 20)) { console.error("denoiseKernelRound: --repeats is a whole number, 1 to 20"); process.exit(2); }
    // 1  THE PAGE: first a probe for its key (and so the incumbent), then the repeats
    const page = async (sets) => {
        const r = await H.runInEngineOrigin({ engineRoot: ENG, timeoutMs: 900000, launchArgs: soft ? null : H.HARDWARE_ARGS, args: { q: `?sets=${sets.join(",")}` }, script: `async (a) => {
            const f = document.createElement("iframe"); f.style.width = "1200px"; f.style.height = "900px"; f.src = "/denoise.html" + a.q; document.body.appendChild(f);
            await new Promise((r) => f.onload = r);
            const d = f.contentDocument, $ = (id) => d.getElementById(id), wait = (ms) => new Promise((r) => setTimeout(r, ms));
            for (let i = 0; i < 100 && !$("time"); i++) await wait(50);
            $("time").click(); const t = Date.now();
            while (Date.now() - t < 890000 && ($("time").disabled || !$("timeJson").textContent) && !/failed|no WebGPU/.test($("timeStatus").textContent)) await wait(100);
            return { status: $("timeStatus").textContent, json: $("timeJson").textContent };
        }` });
        if (r.skipped) throw new Error(`the browser could not run: ${r.reason}`);
        let L = null; try { L = JSON.parse(r.result && r.result.json || "null"); } catch { /* reported below */ }
        if (!L) throw new Error(`the page's ladder did not come back: ${r.result ? r.result.status : r.pageErrors.join(" | ")}`);
        return L;
    };
    const first = await page(DD.TIMED_SETS.filter((s) => s !== challenger).slice(0, 1).concat([challenger]));
    if (first.adapter && first.adapter.software && !soft) { console.error(`denoiseKernelRound: the page's adapter is ${first.adapter.name}, A SOFTWARE ADAPTER -- refused (its times are a CPU's)`); GPU.exitCleanly(2); }
    const key = first.pageKey || null, incumbent = DD.pageKernelsFor(key);
    if (incumbent === challenger) { console.error(`denoiseKernelRound: ${challenger} is already the page's set for ${key || "this adapter (no key: PAGE_KERNELS)"}`); GPU.exitCleanly(2); }
    const out = arg("out", path.join(ENG, "render", `denoise-round-${(key || "nokey").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${challenger}.json`));
    if (fs.existsSync(out)) { console.error(`denoiseKernelRound: ${out} is already there -- a round is never overwritten; give --out another file`); GPU.exitCleanly(1); }
    console.log(`${first.adapter ? first.adapter.name : "?"} (page key ${key || "none"}): ${incumbent} (the table's) against ${challenger}, ${repeats} repeats${soft ? " -- SOFTWARE ALLOWED: this decides nothing" : ""}`);
    const sets = [incumbent, challenger], pageRuns = [], nativeRuns = [];
    for (let k = 0; k < repeats; k++) { const L = await page(sets); pageRuns.push({ medians: mediansOf(L, sets), invisible: sets.every((s) => L.invisible[s] !== false), adapter: L.adapter && L.adapter.name }); console.log(`  page repeat ${k + 1}: ${JSON.stringify(pageRuns[k].medians)}`); }
    // 2  NATIVE, reported
    if (!rest.includes("--no-native")) try {
        GPU.configureVulkanIcd(); const W = GPU.resolveWebgpu(createRequire(import.meta.url));
        if (W.mod) { const gpu = W.mod.create([GPU.FINE_CLOCK_FLAG]), net = DD.decodeNet(JSON.parse(fs.readFileSync(path.join(ENG, DD.networkFile(DD.nativeNetworkFor ? DD.nativeNetworkFor(null) : "shipped")), "utf8")).net);
            for (let k = 0; k < repeats; k++) { const L = await DD.timingLadder(net, () => gpu.requestAdapter(), { sizes: DD.TIMING_SIZES.filter(([w, h]) => Math.min(w, h) >= MIN_SIDE), sets, rounds: 3, totalMs: 300000 }); nativeRuns.push({ medians: mediansOf(L, sets), adapter: L.adapter && L.adapter.name }); console.log(`  native repeat ${k + 1}: ${JSON.stringify(nativeRuns[k].medians)}`); } }
    } catch (e) { nativeRuns.push({ error: String(e.message || e) }); }
    const verdict = decide(pageRuns.map((r) => r.medians), incumbent, challenger, { invisible: pageRuns.every((r) => r.invisible) });
    const nativeV = nativeRuns.length && !nativeRuns[0].error ? decide(nativeRuns.map((r) => r.medians), incumbent, challenger) : null;
    const report = { about: "tools/denoiseKernelRound.mjs: a registered timing round for one entry of PAGE_KERNELS_BY_ADAPTER", key, incumbent, challenger, repeats, software: !!(first.adapter && first.adapter.software), decides: !(first.adapter && first.adapter.software), page: pageRuns, native: nativeRuns, verdict, nativeReading: nativeV, at: new Date().toISOString() };
    fs.writeFileSync(out, JSON.stringify(report, null, 1) + "\n");
    for (const s of verdict.sizes) console.log(`  ${s.size}: ${incumbent} / ${challenger} median ${s.median.toFixed(3)} x, ${challenger} faster in ${s.wins} of ${repeats}${s.holds ? "" : " -- DOES NOT HOLD"}`);
    console.log(`THE PAGE: ${verdict.reason}${report.decides ? "" : " (A SOFTWARE ADAPTER: NOT A DECISION)"}`);
    if (nativeV) console.log(`natively (reported, not deciding): ${nativeV.reason}`);
    console.log(`wrote ${out}`);
    GPU.exitCleanly(0);
}
