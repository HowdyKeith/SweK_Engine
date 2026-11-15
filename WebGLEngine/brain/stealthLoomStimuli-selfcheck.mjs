// WebGLEngine/brain/stealthLoomStimuli-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/stealthLoomStimuli-selfcheck.mjs      (about 2 s)
//
// THE GATE OF brain/stealthLoomStimuli.mjs: the cuttlefish's predator cues (a dark ellipse, with static or downward-moving stripes) as a LOOMING frame sequence on a collision course.
//   1 THE LOOM       the horizontal extent runs from startPx to endPx (6 to 105), the angle is theta = 2 atan(r/v / |t|) at each frame's time, the frames are `step` apart, the height is the width over the 74:53 aspect ratio, sidePx is w tan(theta/2) / tan(fov/2);
//   2 THE ELLIPSE    the background is ib, the centre is dark ib (1 - wc) (a light stripe ib (1 + wc) capped at 1), an off-centre cx, cy moves the ellipse, the edge is anti-aliased, the ellipse is 74 : 53 in pixels;
//   3 THE STRIPES    3 dark bands down the ellipse's height, dark 1/6 of a cycle; STATIC stripes keep their place relative to the ellipse as it grows; MOVING stripes move DOWN relative to the ellipse at 4 cycles/second (measured as a shift to larger y, in units of the ellipse's height); without stripes there is no band;
//   4 THE REST       receding reverses the sequence (and its times), bad options are refused, frameChange measures consecutive-frame change, and the module is pure.
// SABOTAGE: 37 mutants of the module (aspect, fov, sign of t, contrast, cap, stripe phase and direction, static drift, edge width, loop step, receding, frameChange loop and abs): all red after closing four survivors (the cap with ib 0.8, static drift over 10 frames, edge width bound, frameChange first pair); 2 mutation strings did not match and were not counted.
// NOT CHECKED, said plainly: that the stimulus resembles a hunting cuttlefish (it is a stand-in, see the header).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "./stealthLoomStimuli.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const throws = (f) => { try { f(); return false; } catch (e) { return /stealthLoomStimuli/.test(e.message); } };

console.log("stealthLoomStimuli-selfcheck -- the cuttlefish's cues as looming sequences\n");

console.log("1. THE LOOM");
{
    const s = L.loomingEllipse({ rv: 0.05 });
    ok("!! the horizontal extent runs from 6 to 105 pixels (the first frame 6 to 7.5; the last the last 10 ms step at or below 105: above 90), the height is the width over 74/53, and the frames are 10 ms apart", s.width[0] >= 5.5 && s.width[0] < 7.5 && s.width.at(-1) <= 105 + 1e-9 && s.width.at(-1) > 90 && s.width.every((v, i) => near(s.height[i], v / (74 / 53), 1e-9)) && s.t.every((t, i) => i === 0 || near(t - s.t[i - 1], 0.01, 1e-9)) && L.ASPECT === 74 / 53 && s.step === 0.01);
    ok("!! theta = 2 atan(r/v / |t|) degrees at each frame and the width is w tan(theta/2) / tan(fov/2) (200 pixels, 118 degrees)", s.t.every((t, i) => near(s.theta[i], 2 * Math.atan(0.05 / -t) * 180 / Math.PI, 1e-9) && near(s.width[i], 200 * Math.tan(s.theta[i] * Math.PI / 360) / Math.tan(59 * Math.PI / 180), 1e-6)) && near(L.sidePx(0.05, -0.05, 200, 118), 200 / Math.tan(59 * Math.PI / 180), 1e-9));
    ok("a slower loom takes more frames (r/v 100 ms: about twice the frames of 50 ms) and a size-increasing sequence (each width larger than the one before)", L.loomingEllipse({ rv: 0.1 }).frames.length > 1.8 * s.frames.length && s.width.every((v, i) => i === 0 || v > s.width[i - 1]));
}

console.log("\n2. THE ELLIPSE");
{
    const s = L.loomingEllipse({ rv: 0.05, wc: 1 }), last = s.frames[s.frames.length - 1];
    const mid = Math.round(74.5) * 200 + 100;
    ok("!! the background is ib = 0.5 at the corner, the centre of the last frame is dark ib (1 - wc) = 0, and a lower contrast is lighter (wc 0.4: 0.3)", last.data[0] === 0.5 && near(last.data[mid], 0, 1e-6) && near(L.loomingEllipse({ rv: 0.05, wc: 0.4 }).frames.at(-1).data[mid], 0.3, 1e-6) && near(L.loomingEllipse({ rv: 0.05, ib: 0.8, wc: 0.5 }).frames.at(-1).data[0], 0.8, 1e-6));
    const f = s.frames[s.frames.length - 1]; let wRow = 0, hCol = 0; for (let x = 0; x < 200; x++) if (f.data[74 * 200 + x] < 0.25) wRow++; for (let y = 0; y < 150; y++) if (f.data[y * 200 + 100] < 0.25) hCol++;
    const edge = f.data.filter((v) => v > 0.02 && v < 0.48).length, perim = Math.PI * (49 + 35) * 0.9;
    ok("!! the ellipse is 74 : 53 in pixels (the last frame's own width and height, 98 x 70 here) and its edge is anti-aliased", near(wRow, s.width.at(-1), 3) && near(hCol, s.height.at(-1), 3) && near(wRow / hCol, 74 / 53, 0.08) && edge > 50 && edge < 2.5 * perim, `${wRow} x ${hCol}, ${edge} edge pixels`);
    const o = L.loomingEllipse({ rv: 0.05, cx: 60, cy: 40, endPx: 60 }).frames.at(-1); let sx = 0, sy = 0, n = 0; for (let y = 0; y < 150; y++) for (let x = 0; x < 200; x++) if (o.data[y * 200 + x] < 0.1) { sx += x; sy += y; n++; }
    ok("an off-centre cx, cy puts the ellipse there (the centroid of its dark pixels within 1 pixel)", near(sx / n, 60, 1) && near(sy / n, 40, 1));
    const light = L.loomingEllipse({ rv: 0.05, stripes: "static", wc: 1 }).frames.at(-1); let hasLight = false, hasDark = false; for (const v of light.data) { if (v > 0.99) hasLight = true; if (v < 0.01) hasDark = true; }
    ok("light stripes are ib (1 + wc) capped at 1 (wc 1 on 0.5: 1.0) and dark stripes 0", hasLight && hasDark);
    const cap = L.loomingEllipse({ rv: 0.05, stripes: "static", wc: 1, ib: 0.8 }).frames.at(-1);
    ok("!! the cap: with ib 0.8 and wc 1 the light stripe is 1 (not 1.6)", Math.max(...cap.data) <= 1 + 1e-6);
}

console.log("\n3. THE STRIPES");
{
    const runs = (f, w, h, x) => { const r = []; let prev = false; for (let y = 0; y < h; y++) { const d = f.data[y * w + x] < 0.25; if (d && !prev) r.push(y); prev = d; } return r; };
    const none = L.loomingEllipse({ rv: 0.05, stripes: "none" }).frames.at(-1), stat = L.loomingEllipse({ rv: 0.05, stripes: "static" }), mov = L.loomingEllipse({ rv: 0.05, stripes: "moving" });
    const fl = stat.frames.at(-1), top = (k, h) => 74.5 - h[k] / 2, r = runs(fl, 200, 150, 100), hLast = stat.height.at(-1);
    ok("!! 3 dark bands down the stripe ellipse (period one third of its height, 25 pixels), none on the plain ellipse, and the bands are 1/6 of a cycle (about 12 dark of 75 pixels)", r.length === 3 && near(r[1] - r[0], hLast / 3, 2) && runs(none, 200, 150, 100).length === 1 && (() => { let d = 0; for (let y = 0; y < 150; y++) if (fl.data[y * 200 + 100] < 0.25) d++; return d >= 9 && d <= 16; })(), r.join());
    const norm = (f, k, S) => runs(f, 200, 150, 100).map((y) => (y - top(k, S.height)) / S.height[k]);
    const k1 = stat.frames.length - 4, k2 = stat.frames.length - 1, n1 = norm(stat.frames[k1], k1, stat), n2 = norm(stat.frames[k2], k2, stat);
    ok("!! STATIC stripes keep their place relative to the ellipse as it grows (the bands' positions in units of the ellipse's height equal at two frames, within 0.04)", n1.length === 3 && n2.length === 3 && n1.every((v, i) => near(v, n2[i], 0.04)), n1.map((v) => v.toFixed(2)).join() + " | " + n2.map((v) => v.toFixed(2)).join());
    const ka = mov.frames.length - 6, kb = ka + 2, na = norm(mov.frames[ka], ka, mov), nb = norm(mov.frames[kb], kb, mov), P = 1 / 3, circ = (d) => ((((d + P / 2) % P) + P) % P) - P / 2;
    const shift = na.map((v) => circ(nb[0] - na[0]));   // 0.02 s at 4 Hz = 0.08 cycles = 0.0267 of the height
    ok("!! MOVING stripes go DOWN relative to the ellipse: over 0.02 s at 4 cycles/s each band moves to larger y by 0.08/3 = 0.027 of the ellipse's height (+0.03 or less of tolerance), not up", na.length >= 3 && nb.length >= 3 && shift.every((v) => v > 0.012 && v < 0.045), shift.map((v) => v.toFixed(3)).join());
    const k3 = stat.frames.length - 11, n3 = norm(stat.frames[k3], k3, stat);
    ok("!! STATIC stripes do not drift over 10 frames (0.1 s: a drifting stripe would move 0.4 cycles = 0.13 of the height): the band positions agree within 0.035", n3.length === 3 && n3.every((v, i) => near(v, n2[i], 0.035)), n3.map((v) => v.toFixed(2)).join());
    const m2 = L.loomingEllipse({ rv: 0.05, stripes: "moving", stripeHz: 8 }), nc = norm(m2.frames[ka], ka, m2), nd = norm(m2.frames[kb], kb, m2), sh8 = nc.map((v) => circ(nd[0] - nc[0]));
    ok("the stripe speed is stripeHz: 8 Hz moves the bands about twice as far as 4 Hz in the same time", sh8.every((v, i) => v > 1.5 * shift[i] && v < 2.5 * shift[i]), sh8.map((v) => v.toFixed(3)).join());
}

console.log("\n4. THE REST");
{
    const a = L.loomingEllipse({ rv: 0.05 }), b = L.loomingEllipse({ rv: 0.05, receding: true });
    ok("!! receding plays the sequence backwards (frames, times, sizes) so the size decreases", b.frames.length === a.frames.length && b.width[0] > b.width.at(-1) && b.t[0] === a.t.at(-1) && b.frames[0].data.every((v, i) => v === a.frames.at(-1).data[i]));
    ok("!! bad options are refused: r/v not positive, unknown stripes, wc out of range, endPx not above startPx, a field of view of 180", throws(() => L.loomingEllipse({ rv: 0 })) && throws(() => L.loomingEllipse({ rv: 0.05, stripes: "up" })) && throws(() => L.loomingEllipse({ rv: 0.05, wc: 2 })) && throws(() => L.loomingEllipse({ rv: 0.05, endPx: 5 })) && throws(() => L.loomingEllipse({ rv: 0.05, fovDeg: 180 })) && throws(() => L.loomingEllipse({})));
    const A = a.frames[0], B = a.frames[1], Cc = a.frames[2], fc3 = L.frameChange([A, B, B]), fc3b = L.frameChange([Cc, Cc, B]);
    ok("!! frameChange counts every consecutive pair from the first (A,B,B has one changing pair; C,C,B has one too)", fc3.meanDelta > 0 && fc3b.meanDelta > 0);
    const wd = Array.from({ length: 40 }, (_, k) => 7 * Math.pow(37 / 7, k / 39)), ex = L.loomingEllipse({ widths: wd, stripes: "moving", w: 180, h: 60, cx: 45, cy: 30, fovDeg: 144, step: 1 / 30 });
    ok("!! widths (any size law): one frame per entry, the width list returned unchanged, t = k x step from 0, the angle is the planar 2 atan(width/w tan(fov/2)), the moving stripes still move at 4 cycles/s from t = 0; empty or non-positive widths are refused", ex.frames.length === 40 && ex.width.every((v, i) => v === wd[i]) && near(ex.t[39], 39 / 30, 1e-9) && near(ex.theta[0], 2 * Math.atan(7 / 180 * Math.tan(72 * Math.PI / 180)) * 180 / Math.PI, 1e-9) && throws(() => L.loomingEllipse({ widths: [] })) && throws(() => L.loomingEllipse({ widths: [5, -1] })) && throws(() => L.loomingEllipse({ widths: [5, 0] })) && !ex.frames[0].data.every((v, i) => v === ex.frames[20].data[i]));
    const fc = L.frameChange(a.frames), still = L.frameChange([a.frames[0], a.frames[0]]);
    ok("frameChange: 0 for a still pair, positive and at most 1 for a looming sequence", still.meanDelta === 0 && still.maxDelta === 0 && fc.meanDelta > 0 && fc.maxDelta <= 1 && fc.maxDelta > 0.3 && L.frameChange([]).meanDelta === 0);
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "stealthLoomStimuli.mjs"), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    ok("!! pure: no Math.random, no clock, no DOM, no file or network, no import", !/Math\.random|Date\.now|performance\.now|document\.|window\.|fetch\(|node:|readFileSync|^import\s/m.test(src));
}

finished = true;
console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks pass");
if (fails) process.exit(1);
