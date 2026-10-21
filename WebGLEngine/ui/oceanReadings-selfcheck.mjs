// ui/oceanReadings-selfcheck.mjs -- grades the rig-readings record and what is computed from it (slice 5 of ocean-optin-surface). (~1 s)
//
// WHAT THIS GRADES. That READINGS_AT_V4892 holds nine HUD lines the page's own parser reads in full; that the medians, the spread and the pixel-cost line
// computed from them agree with an INDEPENDENT recomputation written here from the raw text (a regex of its own, a normal-equations fit of its own); that the
// claim "the frame clock is the step clamp" is true of the vendored bundle (its `dt = Math.min(0.1, ...)` is read out of the bundle's text); that the
// pixel-cost reading reverses the spike's guess in the direction the numbers say; that a line the parser cannot read is refused rather than stored; and that
// the report changes its verdict when the data does (a synthetic discrete GPU that holds the budget flips the last line).
//
// WHAT IT DOES NOT GRADE, said plainly: that the readings are true. They are the rig's HUD text as received; the gate grades the arithmetic done on them.
// And not a discrete GPU: none has been read, and the fit is three points through two parameters, so the gate asserts the residuals are small AND that the
// report says "if this model holds" -- it does not assert the model.
// SABOTAGES, each applied to the real ui/oceanReadings.mjs, restored, md5 verified. 9 of 9 red, two only after a fixture was added that could tell them apart (the real nine lines
// are all clamped and all one size, so the cap test and the same-size flag could not fail on them -- the first run of S4 and S9 passed, which is the finding):
//   S1 the median is a mean 3 rows | S2 the slope sign flipped 3 | S3 a line without a GPU time accepted 1 | S4 the cap test ignores the clamp 0 -> 1 (synthetic 33.33/120 line)
//   S5 every label grouped as one 2 | S6 budget pixels returned though the intercept is over it 1 | S7 the verdict line hard-coded 1 | S8 the frame clock used for the probe 1
//   S9 sameSize always true 0 -> 1 (synthetic two-size label)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as R from "./oceanReadings.mjs";
import { BUDGET_MS } from "./oceanTier.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REC = R.READINGS_AT_V4892;
const BUNDLE = fs.readFileSync(path.join(HERE, "..", "vendor", "web-ocean", "ocean.html"), "utf8");

// an independent reading of the raw text: label, GPU ms, size. NOT parseHud.
const raw = REC.lines.map((l) => { const m = /^(\S+) \|.*GPU ([0-9.]+) ms.*?(\d+)x(\d+)\s*$/.exec(l); return m ? { label: m[1], gpu: +m[2], w: +m[3], h: +m[4] } : null; });
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

console.log("\n1. THE RECORD IS NINE LINES THE PAGE'S OWN PARSER READS IN FULL");
{
    ok("!! *** every stored line parses with a label, a GPU time and a drawing-buffer size, and my independent regex reads the same nine ***", raw.every(Boolean) && REC.lines.length === 9 && REC.lines.every((l) => { try { R.parseLine(l); return true; } catch { return false; } }), REC.lines.length + " lines");
    const gs = R.groups(REC);
    ok("  they group as five native, two at 1280x720 and two at 960x540, each group one size", gs.map((g) => g.resolution + ":" + g.n).join(" ") === "native:5 1280x720:2 960x540:2" && gs.every((g) => g.sameSize), gs.map((g) => `${g.resolution} ${g.width}x${g.height}`).join(", "));
    ok("  and a sized label names the size its lines report (1280x720 is 1280 by 720), so a mislabelled line would be caught", gs.filter((g) => g.resolution !== "native").every((g) => g.resolution === g.width + "x" + g.height), "");
    const bad = [["no label", "10 fps  100.00 ms  |  GPU 1.00 ms  |  1 nodes  1x1"], ["no GPU time", "native | 10 fps  100.00 ms  |  1 nodes  1x1"], ["no size", "native | 10 fps  100.00 ms  |  GPU 5.00 ms"], ["not a HUD", "native | starting"]];
    const accepted = bad.filter(([, l]) => { try { R.parseLine(l); return true; } catch { return false; } }).map(([n]) => n);
    ok("!! *** a line the parser cannot read in full is REFUSED, not stored: no label, no GPU time, no size, not a HUD ***", accepted.length === 0, accepted.length ? "ACCEPTED: " + accepted.join(", ") : "4 of 4 refused");
}

console.log("\n2. THE MEDIANS AND THE SPREAD, AGAINST A RECOMPUTATION FROM THE RAW TEXT");
{
    const gs = R.groups(REC);
    const want = {}; for (const r of raw) (want[r.label] ||= []).push(r.gpu);
    const wrong = gs.filter((g) => Math.abs(g.gpuMedian - med(want[g.resolution])) > 1e-9 || g.gpuMin !== Math.min(...want[g.resolution]) || g.gpuMax !== Math.max(...want[g.resolution]));
    ok("!! *** every group's median, minimum and maximum equal the independent recomputation: native 219.66, 1280x720 217.09, 960x540 147.855 ***", wrong.length === 0 && Math.abs(gs[0].gpuMedian - 219.66) < 1e-9 && Math.abs(gs[1].gpuMedian - 217.09) < 1e-9 && Math.abs(gs[2].gpuMedian - 147.855) < 1e-9, gs.map((g) => g.resolution + " " + g.gpuMedian).join(", "));
    ok("  the multiples of the budget and the frame rate follow from them: native x6.6 at 4.6 fps, 960x540 x4.4 at 6.8 fps", Math.abs(gs[0].budgetMultiple - 219.66 / BUDGET_MS) < 1e-9 && Math.abs(gs[2].fps - 1000 / 147.855) < 1e-9 && gs.every((g) => g.budgetMultiple > 4), gs.map((g) => "x" + g.budgetMultiple.toFixed(2)).join(" "));
    ok("  and the native readings spread by about 9% of their median (206-225 ms): a reading is a band, not a number", gs[0].spread > 0.05 && gs[0].spread < 0.12, (gs[0].spread * 100).toFixed(1) + "%");
}

console.log("\n3. THE FRAME CLOCK IS THE STEP CLAMP -- READ OUT OF THE BUNDLE, NOT ASSUMED");
{
    const clamp = /dt\s*=\s*Math\.min\(\s*0\.1\s*,\s*\(now - last\)\s*\/\s*1000\s*\)/.test(BUNDLE);
    const fpsFromDt = /fps\s*=\s*fpsN\s*\/\s*fpsAcc/.test(BUNDLE);
    ok("!! *** the bundle clamps its step at 0.1 s and takes its fps from the clamped steps, so no frame can read slower than 100 ms ***", clamp && fpsFromDt, "Math.min(0.1, ...) and fps = fpsN / fpsAcc both present in the bundle's text");
    const cap = R.cappedFrame(REC);
    ok("  nine of the nine readings show exactly 100.00 ms of frame time while the GPU clock reads more, so the frame clock hid how slow they were", cap.length === 9 && REC.lines.every((l) => R.parseLine(l).frameMs === 100), cap.length + " of " + REC.lines.length);
    ok("  and the probe's number for every one of them is therefore the GPU clock, never the clamped 100", REC.lines.every((l) => R.probeMsOfLine(l) === R.parseLine(l).gpuMs && R.probeMsOfLine(l) > 100), "");
}

{
    const syn = { ...REC, lines: ["native | 60 fps  16.67 ms  |  GPU 20.00 ms  |  1 nodes  100x100", "native | 10 fps  100.00 ms  |  GPU 50.00 ms  |  1 nodes  100x100", "native | 10 fps  100.00 ms  |  GPU 150.00 ms  |  1 nodes  100x100", "native | 30 fps  33.33 ms  |  GPU 120.00 ms  |  1 nodes  100x100"] };
    ok("!! *** the cap test is exact: only a frame clock reading its clamp WHILE the GPU clock reads more is hidden (16.67/20 is not; 100/50 is not; 33.33/120 is not; 100/150 is) ***", R.cappedFrame(syn).length === 1 && R.cappedFrame(syn)[0].gpuMs === 150, "1 of 4");
    const mixed = { ...REC, lines: ["native | 10 fps  100.00 ms  |  GPU 100.00 ms  |  1 nodes  100x100", "native | 10 fps  100.00 ms  |  GPU 120.00 ms  |  1 nodes  200x100"] };
    ok("  and a label whose lines report two different sizes is flagged, so a window resized mid-series cannot hide inside one row", R.groups(mixed)[0].sameSize === false && R.groups(REC).every((g) => g.sameSize), "mixed -> false");
}

console.log("\n4. THE PIXEL-COST LINE, AGAINST NORMAL EQUATIONS WRITTEN HERE");
{
    const gs = R.groups(REC), fit = R.fitLine(gs);
    const X = gs.map((g) => g.pixels), Y = gs.map((g) => med(raw.filter((r) => r.label === g.resolution).map((r) => r.gpu)));
    const n = X.length, sx = X.reduce((a, b) => a + b, 0), sy = Y.reduce((a, b) => a + b, 0), sxy = X.reduce((a, x, i) => a + x * Y[i], 0), sxx = X.reduce((a, x) => a + x * x, 0);
    const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;
    ok("!! *** the fitted intercept and slope equal the normal-equation solution (54.4 ms fixed, 0.187 ms per thousand pixels) ***", Math.abs(fit.a - a) < 1e-6 && Math.abs(fit.b - b) < 1e-12 && Math.abs(fit.a - 54.42) < 0.01 && Math.abs(fit.b * 1000 - 0.18686) < 1e-4, `a ${fit.a.toFixed(3)}, b*1000 ${(fit.b * 1000).toFixed(5)}`);
    ok("  the residuals are small (worst under 6%) and the report SAYS they are a three-point fit", fit.worst < 0.06 && fit.points === 3 && R.reportLines(REC).some((l) => /worst residual \d\.\d%/.test(l) && /3 points/.test(l)), (fit.worst * 100).toFixed(1) + "% worst");
    ok("!! *** the reading reverses the spike's guess: halving the pixels takes real cost off (960x540 has 0.64 of native's pixels and costs 0.67 of its time) ***", (() => { const pr = gs[2].pixels / gs[0].pixels, cr = gs[2].gpuMedian / gs[0].gpuMedian; return Math.abs(pr - 0.636) < 0.001 && Math.abs(cr - pr) < 0.06; })(), `pixels x${(gs[2].pixels / gs[0].pixels).toFixed(3)}, time x${(gs[2].gpuMedian / gs[0].gpuMedian).toFixed(3)}`);
    ok("!! *** the line's fixed part is over the budget, so if the model holds NO resolution passes -- and the report says 'if this model holds' and 'not a law' ***", fit.a > BUDGET_MS && R.pixelsAtBudget(fit) === null && R.reportLines(REC).some((l) => /if this model holds, no resolution passes/.test(l)) && R.reportLines(REC).some((l) => /not a law/.test(l)), "intercept " + fit.a.toFixed(1) + " ms against " + BUDGET_MS.toFixed(1));
    const exact = R.fitLine([{ resolution: "a", pixels: 100000, gpuMedian: 30 }, { resolution: "b", pixels: 200000, gpuMedian: 50 }, { resolution: "c", pixels: 400000, gpuMedian: 90 }]);
    ok("  on an exact line it recovers it to rounding (20 ms fixed, 0.2 ms per thousand), and says how many pixels the budget buys", Math.abs(exact.a - 10) < 1e-9 && Math.abs(exact.b - 0.0002) < 1e-12 && exact.worst < 1e-12 && Math.abs(R.pixelsAtBudget(exact, 30) - 100000) < 1e-6, `a ${exact.a}, b ${exact.b}`);
    ok("  a single point or a single size gives no line, never a made-up one", R.fitLine([gs[0]]) === null && R.fitLine([{ pixels: 5, gpuMedian: 1 }, { pixels: 5, gpuMedian: 2 }]) === null && R.pixelsAtBudget(null) === null, "");
}

console.log("\n5. THE REPORT CHANGES ITS VERDICT WHEN THE DATA DOES");
{
    const fast = { ...REC, adapter: "nvidia pascal NVIDIA GeForce GTX 1080 Ti", adapterKind: "discrete", lines: [
        "native | 120 fps  8.33 ms  |  GPU 6.40 ms  |  1186 nodes  1653x493", "native | 120 fps  8.33 ms  |  GPU 6.20 ms  |  1186 nodes  1653x493",
        "1280x720 | 120 fps  8.33 ms  |  GPU 6.90 ms  |  906 nodes  1280x720", "960x540 | 120 fps  8.33 ms  |  GPU 4.10 ms  |  906 nodes  960x540"] };
    const lines = R.reportLines(fast);
    ok("!! *** a synthetic GPU that holds the budget makes the report say which resolutions are inside it, and stop saying none is ***", lines.some((l) => /inside the budget: native \(6\.3 ms\), 1280x720/.test(l)) && !lines.some((l) => /none of these readings holds the budget/.test(l)), lines[lines.length - 1].trim());
    ok("  and for the rig's real data the last line says none holds it and that no discrete GPU has been read", /none of these readings holds the budget; no discrete GPU has been read yet/.test(R.reportLines(REC).slice(-1)[0]), "");
    ok("  the page probes are kept OUT of the table and the fit (their frame size was not noted), and are in the range the sized readings span", !R.groups(REC).some((g) => /probe/i.test(g.resolution)) && REC.pageProbesMs.auto === 238.1 && REC.pageProbesMs.on.join() === "262.2,155.2,98.3" && /resized/.test(REC.pageProbesNote), "238.1 auto; 262.2 / 155.2 / 98.3 on");
}

console.log("\n6. THE MODULE TOUCHES NOTHING");
{
    const src = fs.readFileSync(path.join(HERE, "oceanReadings.mjs"), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const imports = [...src.matchAll(/import\s+[^;]*?from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    const bad = ["Date.now", "performance.now", "Math.random", "document", "navigator", "window", "localStorage", "fetch(", "process.", "fs."].filter((t) => src.includes(t));
    ok("!! it imports only the page's own parser and the tier budget, and reads no clock, storage or global: the record is its only input", imports.join() === "./oceanSea.mjs,./oceanTier.mjs" && bad.length === 0, bad.length ? "found: " + bad.join(", ") : imports.join(", "));
}

say("UNCHECKED, said plainly: that the rig's lines are true readings (the gate grades the arithmetic on them); any discrete GPU (none has been read); that three points justify the intercept (the report says they do not prove it); behaviour at 1920x1080, which was offered and not taken.");
console.log("oceanReadings-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
