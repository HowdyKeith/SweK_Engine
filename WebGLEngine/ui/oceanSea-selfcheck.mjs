// ui/oceanSea-selfcheck.mjs -- grades the opt-in sea's pure half (slice 4 of ocean-optin-surface). (~1 s)
//
// WHAT THIS GRADES. That oceanSea.mjs reads the vendored sea's HUD line the way the sea prints it, turns a run of readings into the one number the tier
// switch wants, remembers it against the adapter it was taken on and nothing else, reads the sea's declared defaults out of the BUNDLE'S OWN TEXT (so
// the comparison cannot drift from the file), and computes -- not asserts -- where the GPU sea and the physics surface disagree, with a verdict only on
// rows that are the same quantity.
//
// WHAT IT DOES NOT GRADE, said plainly: a real sea on a real GPU. The sandbox has no WebGPU adapter. The HUD fixtures are lines the rig actually printed
// (the UHD 620's 10 fps / 100 ms / GPU 228.04 ms is one of them) plus hand-made variants; whether a future bundle formats its HUD the same way is what
// the SHA row below is for -- the bundle is pinned, so a changed format means a changed file. The page that uses all this is graded in
// tools/ship/oceanSeaPage-selfcheck.mjs against a stand-in frame.
// SABOTAGES, each applied to the real ui/oceanSea.mjs, restored, md5 verified. 11 of 11 red (rows red in brackets):
//   S1 the probe number ignores the GPU clock [1]          S2 a "0 fps" line parses as a frame [1]          S3 the warmup is not dropped [1]
//   S4 a remembered reading is served to any adapter [1]   S5 a remembered reading never expires [1]      S6 seaUrl passes keys the bundle never reads [1]
//   S7 the match tolerance widened to 90% [4]              S8 a not-comparable row is given a verdict [2]   S9 the declared defaults typed by hand instead of read [1]
//   S10 a zero reading is remembered [1]                   S11 a reading dated in the future is trusted [1]
"use strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as S from "./oceanSea.mjs";
import * as OT from "./oceanTier.mjs";
import { defaultSurface, createSurface } from "../physics/ocean/oceanSurface.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE_PATH = path.join(HERE, "..", "vendor", "web-ocean", "ocean.html");
const BUNDLE = fs.readFileSync(BUNDLE_PATH, "utf8");

console.log("\n1. THE HUD LINE, AS THE SEA PRINTS IT");
{
    const uhd = "10 fps  100.00 ms  |  GPU 228.04 ms  |  3000 nodes  1653x493";
    const h = S.parseHud(uhd);
    ok("!! *** the UHD 620's real line parses to its fps, frame time, GPU time and drawing-buffer size ***", h && h.fps === 10 && h.frameMs === 100 && h.gpuMs === 228.04 && h.width === 1653 && h.height === 493, JSON.stringify(h));
    ok("  a line without a GPU timer (no timestamp-query) still parses, with gpuMs null", (() => { const x = S.parseHud("60 fps  16.67 ms  |  412 nodes  1280x720"); return x && x.gpuMs === null && x.width === 1280; })(), "");
    ok("  and so does the bare front of the line", (() => { const x = S.parseHud("45 fps  22.22 ms"); return x && x.fps === 45 && x.width === null; })(), "");
    ok("!! *** what is not a frame is null: empty, the starting text, an error, and the sea's 0 fps line before its first frame ***",
        [S.parseHud(""), S.parseHud(null), S.parseHud(undefined), S.parseHud("starting..."), S.parseHud("FATAL no adapter"), S.parseHud("0 fps  Infinity ms"), S.parseHud("0 fps  0.00 ms")].every((x) => x === null), "7 cases");
    ok("  the number the tier switch gets is the SLOWER clock: the GPU time when it is over the frame time, else the frame time",
        S.probeMsFromHud(h) === 228.04 && S.probeMsFromHud(S.parseHud("60 fps  16.67 ms  |  GPU 9.10 ms  |  1 nodes  1x1")) === 16.67 && S.probeMsFromHud(S.parseHud("60 fps  16.67 ms")) === 16.67 && S.probeMsFromHud(null) === null,
        "228.04 / 16.67 / 16.67 / null");
    ok("  and it is what the tier switch reads: the UHD 620's line puts auto on the default water, a 9 ms line puts it on the sea",
        OT.chooseTier({ preference: "auto", webgpu: true, adapter: { description: "Intel(R) UHD Graphics 620" }, probeMs: S.probeMsFromHud(h) }).tier === "default"
        && OT.chooseTier({ preference: "auto", webgpu: true, adapter: { description: "NVIDIA GeForce GTX 1080 Ti" }, probeMs: S.probeMsFromHud(S.parseHud("120 fps  8.33 ms  |  GPU 6.00 ms")) }).tier === "sea", "");
    const txt = (ms) => `${(1000 / ms).toFixed(0)} fps  ${ms.toFixed(2)} ms  |  GPU ${(ms * 0.9).toFixed(2)} ms  |  100 nodes  640x360`;
    ok("!! *** the median of a run drops the warmup readings, and one slow outlier does not move it ***",
        S.medianProbe([txt(900), txt(700), txt(10), txt(11), txt(12), txt(400), txt(11), txt(10)]) === 11 && S.medianProbe([txt(900), txt(700)]) === null && S.medianProbe([]) === null && S.medianProbe(["junk", "", txt(10)], 0) === 10,
        "[10,11,12,400,11,10] -> 11");
}

console.log("\n2. THE URL TAKES ONLY WHAT THE BUNDLE READS");
{
    ok("!! *** seaUrl passes the size, view and clock and drops everything else -- including a key that tries to reach a wave parameter ***",
        S.seaUrl({ w: 640, h: 360, ui: 1, windSpeed: 30, swellHs: 9, dbg: 1, cam: "0,5,0" }) === "/vendor/web-ocean/ocean.html?w=640&h=360&ui=1&cam=0%2C5%2C0"
        && S.seaUrl({}) === "/vendor/web-ocean/ocean.html" && S.seaUrl({ ui: "" , w: null }) === "/vendor/web-ocean/ocean.html", S.seaUrl({ w: 640, ui: 1, windSpeed: 30 }));
    const read = [...BUNDLE.matchAll(/qs\.get\('([a-z]+)'\)/g)].map((m) => m[1]);
    const missing = S.SEA_PARAMS.filter((k) => !read.includes(k));
    ok("!! *** every parameter the page may set is one the bundle really reads (checked in the bundle's own text) ***", missing.length === 0, missing.length ? "NOT READ BY THE BUNDLE: " + missing.join(", ") : S.SEA_PARAMS.join(", ") + " all appear as qs.get(...)");
    ok("  and no wave parameter is on the list: the sea's tunables are in a module scope this page cannot reach", !S.SEA_PARAMS.some((k) => /wind|swell|choppy|foam|fetch/i.test(k)), "");
}

console.log("\n3. THE REMEMBERED READING BELONGS TO ONE ADAPTER");
{
    const mem = () => { const d = new Map(); return { getItem: (k) => (d.has(k) ? d.get(k) : null), setItem: (k, v) => { d.set(k, String(v)); }, removeItem: (k) => d.delete(k) }; };
    const s = mem(), t0 = 1_000_000_000_000;
    ok("!! *** a stored reading comes back for the adapter it was taken on and for no other ***", S.rememberProbe(s, "Intel UHD 620", 228, t0) && S.recallProbe(s, "Intel UHD 620", t0 + 1000) === 228 && S.recallProbe(s, "NVIDIA GTX 1080 Ti", t0 + 1000) === null, "228 for the UHD, null for the 1080 Ti");
    ok("  a week-old reading is taken again", S.recallProbe(s, "Intel UHD 620", t0 + S.PROBE_TTL_MS + 1) === null && S.recallProbe(s, "Intel UHD 620", t0 + S.PROBE_TTL_MS - 1) === 228, "TTL " + S.PROBE_TTL_MS / 3600000 + " h");
    ok("  a reading dated in the future, a poisoned entry and a missing storage all read as nothing", (() => { const f = mem(); f.setItem(S.PROBE_KEY, JSON.stringify({ label: "x", ms: 5, at: t0 + 10 * 60000 })); const p = mem(); p.setItem(S.PROBE_KEY, "{not json"); const z = mem(); z.setItem(S.PROBE_KEY, JSON.stringify({ label: "x", ms: -3, at: t0 })); return S.recallProbe(f, "x", t0) === null && S.recallProbe(p, "x", t0) === null && S.recallProbe(z, "x", t0) === null && S.recallProbe(null, "x", t0) === null; })(), "");
    ok("  a refused write is not an error, and a nonsense reading is not stored", S.rememberProbe({ setItem() { throw new Error("blocked"); } }, "x", 5) === false && S.rememberProbe(mem(), "x", 0) === false && S.rememberProbe(mem(), "", 5) === false && S.rememberProbe(null, "x", 5) === false, "");
}

console.log("\n4. WHERE THE GPU SEA AND THE PHYSICS SURFACE DISAGREE, COMPUTED FROM THE BUNDLE'S OWN TEXT");
{
    const declared = S.declaredDefaults(BUNDLE);
    ok("!! *** the sea's declared defaults are read out of the bundle: wind 7 m/s, swell 1.8 m high and 120 m long, choppy 1.25 ***",
        declared && declared.windSpeed.value === 7 && declared.swellHs.value === 1.8 && declared.swellLength.value === 120 && declared.choppy.value === 1.25 && declared.swellDir.value === 94, declared ? Object.keys(declared).length + " parameters read" : "NOT READ");
    ok("  and their notes come with them, so a unit is the bundle's word and not ours", /m\/s/.test(declared.windSpeed.note) && /significant/.test(declared.swellHs.note), declared.swellHs.note);
    ok("  a bundle with no parameter block yields null, never an invented set", S.declaredDefaults("<html></html>") === null && S.declaredDefaults("") === null && S.declaredDefaults(null) === null, "");
    const sea1 = defaultSurface(1), stats = S.surfaceStats(sea1);
    const sig = Math.sqrt(sea1.components.reduce((a, c) => a + c.A * c.A / 2, 0));
    ok("!! *** slice 1's statistics are derived, not typed: Hs is 4 sigma over the components, and the longest wavelength is the longest component ***", Math.abs(stats.hs - 4 * sig) < 1e-12 && stats.longest === Math.max(...sea1.components.map((c) => c.wavelength)) && stats.waves === 6, `Hs ${stats.hs.toFixed(3)} m, longest ${stats.longest} m`);
    const one = createSurface({ components: [{ ...sea1.components[0] }] }), s1 = S.surfaceStats(one);
    ok("  and for a single wave Hs is 4 * A / sqrt(2), the closed form", Math.abs(s1.hs - 4 * one.components[0].A / Math.SQRT2) < 1e-12, s1.hs.toFixed(4));
    const rows = S.matchRows(stats, declared);
    const byQ = Object.fromEntries(rows.map((r) => [r.quantity, r]));
    ok("!! *** the default physics sea is NOT the GPU sea's size: its height is x1.55 the swell's and its longest wave half as long -- and the table says differs for both ***",
        byQ["wave height"].verdict === "differs" && Math.abs(byQ["wave height"].ratio - stats.hs / 1.8) < 1e-12 && byQ["longest wavelength"].verdict === "differs" && Math.abs(byQ["longest wavelength"].ratio - stats.longest / 120) < 1e-12,
        `height x${byQ["wave height"].ratio.toFixed(2)}, wavelength x${byQ["longest wavelength"].ratio.toFixed(2)}`);
    ok("!! *** rows that are not the same quantity carry no verdict and a reason: heading, sharpness, method ***", ["heading", "sharpness", "method"].every((q) => byQ[q].verdict === "not comparable" && byQ[q].ratio === null && byQ[q].why.length > 10), "3 rows");
    const tuned = S.matchRows({ hs: 1.8 * 1.2, longest: 120 * 0.9, steepness: 0.6, waves: 6 }, declared);
    ok("  the tolerance is real: within 25% of the sea's figure reads matches, beyond it reads differs, in both directions",
        tuned[0].verdict === "matches" && tuned[1].verdict === "matches" && S.matchRows({ hs: 1.8 * 1.5, longest: 120 * 0.5, steepness: 0.6, waves: 6 }, declared).every((r, i) => i > 1 || r.verdict === "differs") && S.matchRows({ hs: 0.5, longest: 400, steepness: 0.6, waves: 6 }, declared).slice(0, 2).every((r) => r.verdict === "differs"), "x1.2 and x0.9 match; x1.5, x0.5, x0.28, x3.3 differ");
    const lines = S.reportLines(rows);
    ok("!! *** the report says the two seas are NOT lined up, and prints a number for every compared row ***", /NOT lined up/.test(lines[lines.length - 1]) && lines.some((l) => /wave height\s+differs/.test(l) && /x\d\.\d\d/.test(l)), lines[1].trim().slice(0, 110));
    ok("  a missing declared set degrades to the rows that need no declaration, not to a crash or an invented number", (() => { const r = S.matchRows(stats, null); return r.length === 3 && r.every((x) => x.verdict === "not comparable"); })(), "3 rows");
}

console.log("\n5. THE BUNDLE IS STILL THE BUNDLE, AND THIS MODULE TOUCHES NOTHING");
{
    const sha = crypto.createHash("sha256").update(fs.readFileSync(BUNDLE_PATH)).digest("hex");
    ok("!! *** vendor/web-ocean/ocean.html is byte-identical to the pinned upstream bundle -- slice 4 loads it and does not edit it ***", sha === "61e4fe5edf10253b0552570b574da7206754c2fb6033e2e6d73845daae4b36e8" && fs.statSync(BUNDLE_PATH).size === 102283, sha.slice(0, 16));
    const src = fs.readFileSync(path.join(HERE, "oceanSea.mjs"), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const imports = [...src.matchAll(/import\s+[^;]*?from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    const bad = ["document", "navigator", "window", "localStorage", "fetch(", "XMLHttpRequest", "process.", "fs."].filter((t) => src.includes(t));
    ok("  it imports nothing and reads no global: the bundle text, the HUD text, the clock and the storage all arrive as arguments", imports.length === 0 && bad.length === 0, bad.length ? "found: " + bad.join(", ") : "Date.now only as a default parameter");
    ok("  the probe's timings are coherent: five seconds of readings after a three-second settle, and the warmup drop is smaller than the run", S.PROBE_SETTLE_MS === 3000 && S.PROBE_SAMPLES * S.PROBE_SAMPLE_MS === 5000 && S.PROBE_DROP < S.PROBE_SAMPLES && S.MATCH_TOLERANCE === 0.25 && S.PROBE_SAMPLE_MS === 500, `${S.PROBE_SAMPLES} readings every ${S.PROBE_SAMPLE_MS} ms`);
}

say("UNCHECKED, said plainly: a real sea on a real GPU (this sandbox has no WebGPU adapter); that the bundle's HUD keeps this format if the pin is ever moved (the SHA row would go red first); that the wind sea's height, which the bundle computes in its shader and does not declare, is smaller or larger than the swell's 1.8 m.");
console.log("oceanSea-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
