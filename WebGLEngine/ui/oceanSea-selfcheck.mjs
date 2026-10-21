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
// v4895 -- CORRECTED: sections 2 and 4 asserted that the sea's tunables are unreachable from the URL ("no wave parameter is on the list") and that the physics sea is x1.55 the sea's height.
// The first was false (the bundle's line 2193 applies every key of its parameter block from the query string) and the second compared a total with a swell-only figure. Both rows are
// replaced by rows that read the bundle's generic loop and its parameter block out of its own text. Eleven further sabotages of the new code, all red: swellHs from the total height 3 rows,
// swellLength from the shortest wave 3, non-numeric tunables passed 1, a tunable missing from the list 1, matchRows ignoring what was applied 1, the total-height row given a ratio 2,
// the report without its NOT matched line 1, unknown keys passed through 1, a ratio against a typed 60 1, setBy always "default" 1, an invented extra tunable 1.
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
        && OT.chooseTier({ preference: "auto", webgpu: true, adapter: { description: "NVIDIA GeForce GTX 1080" }, probeMs: S.probeMsFromHud(S.parseHud("120 fps  8.33 ms  |  GPU 6.00 ms")) }).tier === "sea", "");
    const txt = (ms) => `${(1000 / ms).toFixed(0)} fps  ${ms.toFixed(2)} ms  |  GPU ${(ms * 0.9).toFixed(2)} ms  |  100 nodes  640x360`;
    ok("!! *** the median of a run drops the warmup readings, and one slow outlier does not move it ***",
        S.medianProbe([txt(900), txt(700), txt(10), txt(11), txt(12), txt(400), txt(11), txt(10)]) === 11 && S.medianProbe([txt(900), txt(700)]) === null && S.medianProbe([]) === null && S.medianProbe(["junk", "", txt(10)], 0) === 10,
        "[10,11,12,400,11,10] -> 11");
}

console.log("\n2. THE URL TAKES ONLY WHAT THE BUNDLE READS -- INCLUDING ITS OWN TUNABLES (v4895: v4890 SAID THEY WERE UNREACHABLE, AND THAT WAS WRONG)");
{
    const declared = S.declaredDefaults(BUNDLE);
    ok("!! *** seaUrl passes the view, the size and the sea's own tunables, and drops everything else: an unknown key and a non-numeric tunable never reach the URL ***",
        S.seaUrl({ w: 640, h: 360, ui: 1, windSpeed: 12, swellHs: 2, dbg: 1, junk: "x", cam: "0,5,0" }) === "/vendor/web-ocean/ocean.html?w=640&h=360&ui=1&cam=0%2C5%2C0&windSpeed=12&swellHs=2"
        && S.seaUrl({}) === "/vendor/web-ocean/ocean.html" && S.seaUrl({ ui: "", w: null }) === "/vendor/web-ocean/ocean.html" && S.seaUrl({ windSpeed: "abc", swellHs: NaN, choppy: Infinity }) === "/vendor/web-ocean/ocean.html", S.seaUrl({ w: 640, ui: 1, windSpeed: 12, junk: 1 }));
    const read = [...BUNDLE.matchAll(/qs\.get\('([a-z]+)'\)/g)].map((m) => m[1]);
    const missing = S.SEA_VIEW_PARAMS.filter((k) => !read.includes(k));
    ok("!! *** every view key the page may set is one the bundle reads by name (checked in the bundle's own text) ***", missing.length === 0, missing.length ? "NOT READ BY THE BUNDLE: " + missing.join(", ") : S.SEA_VIEW_PARAMS.join(", ") + " all appear as qs.get(...)");
    ok("!! *** THE CORRECTION: the bundle applies EVERY key of its parameter block from the URL, in one generic loop -- the line v4890 did not find ***", /for \(const k of Object\.keys\(P\)\) if \(qs\.has\(k\)\) P\[k\] = Number\(qs\.get\(k\)\);/.test(BUNDLE), "for (const k of Object.keys(P)) if (qs.has(k)) P[k] = Number(qs.get(k))");
    ok("!! *** SEA_TUNABLES is EXACTLY the key set of the bundle's `const P` block, read from the bundle's text: no tunable missing, none invented ***", declared && S.SEA_TUNABLES.length === Object.keys(declared).length && S.SEA_TUNABLES.every((k) => k in declared) && Object.keys(declared).every((k) => S.SEA_TUNABLES.includes(k)), `${S.SEA_TUNABLES.length} keys: ` + S.SEA_TUNABLES.slice(0, 5).join(", ") + ", ...");
    ok("  and the list the page may pass is the view keys followed by the tunables, nothing else", S.SEA_PARAMS.length === S.SEA_VIEW_PARAMS.length + S.SEA_TUNABLES.length && S.SEA_PARAMS.join() === [...S.SEA_VIEW_PARAMS, ...S.SEA_TUNABLES].join(), S.SEA_PARAMS.length + " keys");
}

console.log("\n3. THE REMEMBERED READING BELONGS TO ONE ADAPTER");
{
    const mem = () => { const d = new Map(); return { getItem: (k) => (d.has(k) ? d.get(k) : null), setItem: (k, v) => { d.set(k, String(v)); }, removeItem: (k) => d.delete(k) }; };
    const s = mem(), t0 = 1_000_000_000_000;
    ok("!! *** a stored reading comes back for the adapter it was taken on and for no other ***", S.rememberProbe(s, "Intel UHD 620", 228, t0) && S.recallProbe(s, "Intel UHD 620", t0 + 1000) === 228 && S.recallProbe(s, "NVIDIA GTX 1080", t0 + 1000) === null, "228 for the UHD, null for the 1080");
    ok("  a week-old reading is taken again", S.recallProbe(s, "Intel UHD 620", t0 + S.PROBE_TTL_MS + 1) === null && S.recallProbe(s, "Intel UHD 620", t0 + S.PROBE_TTL_MS - 1) === 228, "TTL " + S.PROBE_TTL_MS / 3600000 + " h");
    ok("  a reading dated in the future, a poisoned entry and a missing storage all read as nothing", (() => { const f = mem(); f.setItem(S.PROBE_KEY, JSON.stringify({ label: "x", ms: 5, at: t0 + 10 * 60000 })); const p = mem(); p.setItem(S.PROBE_KEY, "{not json"); const z = mem(); z.setItem(S.PROBE_KEY, JSON.stringify({ label: "x", ms: -3, at: t0 })); return S.recallProbe(f, "x", t0) === null && S.recallProbe(p, "x", t0) === null && S.recallProbe(z, "x", t0) === null && S.recallProbe(null, "x", t0) === null; })(), "");
    ok("  a refused write is not an error, and a nonsense reading is not stored", S.rememberProbe({ setItem() { throw new Error("blocked"); } }, "x", 5) === false && S.rememberProbe(mem(), "x", 0) === false && S.rememberProbe(mem(), "", 5) === false && S.rememberProbe(null, "x", 5) === false, "");
}

console.log("\n4. WHERE THE GPU SEA AND THE PHYSICS SURFACE AGREE AND DISAGREE, COMPUTED FROM THE BUNDLE'S OWN TEXT");
{
    const declared = S.declaredDefaults(BUNDLE);
    ok("!! *** the sea's declared defaults are read out of the bundle: wind 7 m/s, swell 1.8 m high and 120 m long, choppy 1.25 ***",
        declared && declared.windSpeed.value === 7 && declared.swellHs.value === 1.8 && declared.swellLength.value === 120 && declared.choppy.value === 1.25 && declared.swellDir.value === 94, declared ? Object.keys(declared).length + " parameters read" : "NOT READ");
    ok("  and their notes come with them, so a unit is the bundle's word and not ours", /m\/s/.test(declared.windSpeed.note) && /significant/.test(declared.swellHs.note), declared.swellHs.note);
    ok("  a bundle with no parameter block yields null, never an invented set", S.declaredDefaults("<html></html>") === null && S.declaredDefaults("") === null && S.declaredDefaults(null) === null, "");
    const sea1 = defaultSurface(1), stats = S.surfaceStats(sea1);
    const sig = Math.sqrt(sea1.components.reduce((a, c) => a + c.A * c.A / 2, 0));
    const long = sea1.components.reduce((m, c) => (c.wavelength > m.wavelength ? c : m));
    ok("!! *** slice 1's statistics are derived, not typed: total Hs is 4 sigma, the longest wave is the longest component, and ITS height is 4 A / sqrt 2 ***", Math.abs(stats.hs - 4 * sig) < 1e-12 && stats.longest === long.wavelength && Math.abs(stats.longestAmp - long.A) < 1e-15 && Math.abs(stats.longestHs - 4 * long.A / Math.SQRT2) < 1e-12 && stats.waves === 6, `total ${stats.hs.toFixed(3)} m, longest wave ${stats.longest} m, its Hs ${stats.longestHs.toFixed(3)} m`);
    const one = createSurface({ components: [{ ...long }] }), s1 = S.surfaceStats(one);
    ok("  and for a single wave the total and the longest-wave heights are the same closed form, 4 A / sqrt 2", Math.abs(s1.hs - s1.longestHs) < 1e-12 && Math.abs(s1.hs - 4 * one.components[0].A / Math.SQRT2) < 1e-12, s1.hs.toFixed(4));
    const rows = S.matchRows(stats, declared), byQ = Object.fromEntries(rows.map((r) => [r.quantity, r]));
    ok("!! *** at the sea's DEFAULTS the swell height already matches slice 1's longest wave (1.99 against 1.8 m, x1.10) and the swell wavelength does not (60 against 120 m, x0.50) -- v4890's 'x1.55 differs' compared a total with a swell and was not that ***",
        byQ["swell height"].verdict === "matches" && Math.abs(byQ["swell height"].ratio - stats.longestHs / 1.8) < 1e-12 && byQ["swell wavelength"].verdict === "differs" && Math.abs(byQ["swell wavelength"].ratio - stats.longest / 120) < 1e-12 && byQ["swell height"].setBy === "default",
        `height x${byQ["swell height"].ratio.toFixed(2)}, wavelength x${byQ["swell wavelength"].ratio.toFixed(2)}`);
    ok("!! *** the TOTAL height is not compared with anything: the sea's wind-sea height is computed in its shader, so the row carries no ratio and no verdict ***", byQ["total height"].verdict === "not comparable" && byQ["total height"].ratio === null && /MEASURED/.test(byQ["total height"].why), "");
    ok("!! *** rows that are not the same quantity carry no verdict and a reason: total height, heading, sharpness, method ***", ["total height", "heading", "sharpness", "method"].every((q) => byQ[q].verdict === "not comparable" && byQ[q].ratio === null && byQ[q].why.length > 10), "4 rows");
    const m = S.matchedTunables(stats);
    ok("!! *** the matched settings are TWO inputs, derived: swellHs = the longest wave's height (1.99) and swellLength = its wavelength (60) -- nothing else is set, and the rest is listed as NOT matched with a reason ***",
        Object.keys(m.tunables).join() === "swellHs,swellLength" && m.tunables.swellHs === +stats.longestHs.toFixed(2) && m.tunables.swellLength === +stats.longest.toFixed(0) && m.unmatched.length >= 4 && m.unmatched.every(([k, why]) => k && why.length > 10)
        && Object.keys(m.tunables).every((k) => S.SEA_TUNABLES.includes(k)), JSON.stringify(m.tunables));
    const after = Object.fromEntries(S.matchRows(stats, declared, m.tunables).map((r) => [r.quantity, r]));
    ok("!! *** applying them makes both swell rows match (x1.00) AND says they now come from the URL, while every other row is unchanged ***", after["swell height"].verdict === "matches" && after["swell wavelength"].verdict === "matches" && Math.abs(after["swell wavelength"].ratio - 1) < 1e-9 && after["swell height"].setBy === "url" && after["swell wavelength"].setBy === "url"
        && ["total height", "heading", "sharpness", "method"].every((q) => after[q].verdict === "not comparable"), `x${after["swell height"].ratio.toFixed(3)}, x${after["swell wavelength"].ratio.toFixed(3)}`);
    ok("  a non-numeric applied value is ignored (the sea would read NaN), so the row falls back to the declared default and says so", S.matchRows(stats, declared, { swellLength: "abc" }).find((r) => r.quantity === "swell wavelength").setBy === "default", "");
    const tuned = S.matchRows({ ...stats, longestHs: 1.8 * 1.2, longest: 120 * 0.9 }, declared);
    ok("  the tolerance is real: within 25% reads matches, beyond it differs, in both directions", tuned[0].verdict === "matches" && tuned[1].verdict === "matches" && S.matchRows({ ...stats, longestHs: 1.8 * 1.5, longest: 120 * 0.5 }, declared).slice(0, 2).every((r) => r.verdict === "differs") && S.matchRows({ ...stats, longestHs: 0.5, longest: 400 }, declared).slice(0, 2).every((r) => r.verdict === "differs"), "x1.2 and x0.9 match; x1.5, x0.5, x0.28, x3.3 differ");
    const d0 = S.reportLines(S.matchRows(stats, declared), null).join("\n"), d1 = S.reportLines(S.matchRows(stats, declared, m.tunables), m).join("\n");
    ok("!! *** the report says what was and was not matched: with defaults it offers 'matched'; with matched settings it names the two inputs, lists what was NOT matched, and says the realized height has not been measured -- and it no longer says the seas CANNOT be lined up ***",
        /its defaults/.test(d0) && /choose 'matched'/.test(d0) && /MATCHED/.test(d1) && /swellHs=1\.99, swellLength=60 -- two inputs, nothing else/.test(d1) && /NOT matched: windSpeed/.test(d1) && /realized height has not been measured/.test(d1) && !/cannot be set|NOT lined up/.test(d0 + d1), d1.split("\n").slice(-2)[0].slice(0, 100));
    ok("  a missing declared set degrades to the rows that need no declaration, not to a crash or an invented number", (() => { const r = S.matchRows(stats, null); return r.length === 4 && r.every((x) => x.verdict === "not comparable"); })(), "4 rows");
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
