// WebGLEngine/brain/stealthMotion-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/stealthMotion-selfcheck.mjs      (about 4 s)
//
// THE GATE OF brain/stealthMotion.mjs: the motion-detector analysis of Santon et al. 2025 (Sci Adv 11:eadr3686, Methods "Motion detection algorithms", Figure 4), on synthetic versions of the treadmill stimuli.
//   1 THE FILTER    sigmaForAttenuation(f, 1%) is the sigma at which a sinusoid at f falls to 1% (8.05 ms for 60 Hz); measured on real sinusoids through blurTime (60 Hz to 1% of its amplitude) and blurFrame (1 cycle/degree to 1%); a blur keeps a constant and the mean; bad arguments are refused.
//   2 THE DETECTOR  the paper's formula on a worked example (l0 0, r0 1, l1 1, r1 2 gives h = 2: a gradient moving left is positive, so mx = -2); a bar moving right gives mx > 0, left mx < 0, up my > 0, down my < 0, each with R = 1; a still or uniform pattern gives 0; the last column and row are 0;
//                   a mirrored pattern flips the sign.
//   3 R AND M       R = M / total strength (the definition), a threshold only removes strength, a radially symmetric expansion has R and M of 0, and a sequence needs two frames.
//   4 THE STIMULI   the exponential growth (10 degrees at 0, the final size at T, the geometric mean halfway, clamped); a dark ellipse of contrast wc has luminance ib (1 - wc) and the background is ib; the stripes are 3 cycles down the ellipse, dark 1/6 of a cycle, dark at -wc and light at +wc; the moving stripes go DOWN
//                   (measured: the dark bands move to larger y by 4 Hz x the period per second); the static ones do not move; bad options are refused.
//   5 THE PAPER'S RESULT   on the synthetic treadmill stimuli (3 s at 60 frames/s): R is about 0 for the plain ellipse, small for the static stripes and large for the moving stripes (paper: 0, 0.09, 0.92); M is 0 for the plain ellipse and for the moving stripes
//                   many times the static stripes' (paper: 34 times); the net motion of the moving stripes points DOWN; contrast raises M.
//   6 THE SOURCE    pure.
// DIFFERENCES FROM THE PAPER, SAID PLAINLY (measured, not tuned away): here R is 0.000, 0.043 and 0.92; M for the moving stripes is about 25,600 (the paper's 25,067 is in arbitrary units, so the closeness is a coincidence of scale); the moving/static M ratio is about 135, NOT 34: the synthetic static stripes give an M of about 190 where the paper's gave 740
//   (the paper's pixel scale, noise floor and video are not known), so only the ORDERING and the order of magnitude are gated, never the ratio itself. The spatial 1%-at-1-cycle/degree rule is this code's assumption (the paper names the limit and gives the temporal rule only).
// SABOTAGE (2026-11-15, 47 mutants of brain/stealthMotion.mjs, each run alone in a scratch copy): 45 red BY NAME, 1 equivalent and argued (sigma 0 in blurTime: kernel(0) is [1], the same copy), 1 invalid mutation string (not applied). The first pass left NINE real survivors (the blur's clamp at the frame edge,
//   the receiver filter's two sigmas and its use, M as a length, the ellipse's aspect ratio, the anti-aliased edge, the ratio's direction): each got its own row (the numeric clamp row, the impulse row, the diagonal-blob row, the aspect row, the ratio and filter rows) and all nine are red now. The first draft of the stimulus also moved the stripes UP instead of down (the phase had
//   the wrong sign); the downward-motion rows (the bar rows, the 14-pixel row, the net-motion row) were written to catch exactly that.
// NOT CHECKED, said plainly: the authors' MATLAB; the recorded hunting videos (leaf R 0.09 M 341, stripe R 0.56 M 3,034) which a synthetic ellipse is not; the crab's response probabilities (Figure 2), which are behaviour and not part of this module.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "./stealthMotion.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const throws = (f) => { try { f(); return false; } catch (e) { return /stealthMotion/.test(e.message); } };

console.log("stealthMotion-selfcheck -- the motion-detector analysis of Santon et al. 2025\n");

console.log("1. THE FILTER");
{
    const s60 = S.sigmaForAttenuation(60, 0.01);
    ok("!! sigmaForAttenuation: 8.05 ms for 60 Hz to 1% (exp(-2 pi^2 sigma^2 f^2) = 0.01), and 0.483 for 1 cycle/degree", near(s60, 0.0080502, 1e-6) && near(S.sigmaForAttenuation(1, 0.01), 0.4830, 2e-4) && near(Math.exp(-2 * Math.PI ** 2 * s60 ** 2 * 3600), 0.01, 1e-12));
    // a 60 Hz sinusoid sampled at 960 frames/s through the temporal blur: amplitude 1%
    const fps = 960, n = 600, seq = []; for (let k = 0; k < n; k++) { const f = S.newFrame(1, 1); f.data[0] = 0.5 + 0.4 * Math.sin(2 * Math.PI * 60 * k / fps); seq.push(f); }
    const bl = S.blurTime(seq, S.sigmaForAttenuation(60, 0.01) * fps), seg = bl.slice(150, 450).map((f) => f.data[0] - 0.5), amp = (Math.max(...seg) - Math.min(...seg)) / 2 / 0.4;
    ok("!! a 60 Hz flicker through the temporal blur falls to 1% of its amplitude (measured 0.9 to 1.3%: the discrete kernel stops at 3 sigma)", amp > 0.009 && amp < 0.013, "amplitude ratio " + (amp * 100).toFixed(3) + "%");
    // a grating of 1 cycle/degree at 0.05 degrees/pixel through the spatial blur
    const w = 200, g = S.newFrame(w, 1); for (let x = 0; x < w; x++) g.data[x] = 0.5 + 0.4 * Math.sin(2 * Math.PI * x * 0.05 / 1);
    const gb = S.blurFrame(g, S.sigmaForAttenuation(1, 0.01) / 0.05), sg = Array.from(gb.data.slice(60, 140)).map((v) => v - 0.5), ga = (Math.max(...sg) - Math.min(...sg)) / 2 / 0.4;
    ok("!! a 1 cycle/degree grating through the spatial blur falls to 1% (measured 0.9 to 1.3%: a 20 pixel period and a kernel cut at 3 sigma)", ga > 0.009 && ga < 0.013, "ratio " + (ga * 100).toFixed(3) + "%");
    const c = S.blurFrame(S.newFrame(20, 20, 0.7), 3), m = S.newFrame(30, 30); for (let i = 0; i < 900; i++) m.data[i] = (i * 7919 % 101) / 101;
    const mb = S.blurFrame(m, 2);
    ok("a blur keeps a constant exactly and a frame's mean closely; sigma 0 copies", c.data.every((v) => near(v, 0.7, 1e-6)) && Math.abs(mb.data.reduce((a, b) => a + b, 0) - m.data.reduce((a, b) => a + b, 0)) / 900 < 0.02 && S.blurFrame(m, 0).data.every((v, i) => v === m.data[i]) && S.blurFrame(m, 0).data !== m.data);
    {   // numeric blur at the boundary: a frame whose top row is 1 and the rest 0, sigma 1 pixel: the clamped edge gives the top row more than the interior would
        const f = S.newFrame(5, 5); for (let x = 0; x < 5; x++) f.data[x] = 1;
        const b = S.blurFrame(f, 1), k = [0.0044, 0.054, 0.242, 0.399, 0.242, 0.054, 0.0044].map((v) => v / 1.0000), kk = (() => { const r = 3, a = []; let s = 0; for (let i = -r; i <= r; i++) { a.push(Math.exp(-(i * i) / 2)); s += a[a.length - 1]; } return a.map((v) => v / s); })();
        let expect = 0; for (let i = -3; i <= 3; i++) { const yy = Math.min(4, Math.max(0, 0 + i)); expect += kk[i + 3] * (yy === 0 ? 1 : 0); }   // the clamped neighbours above row 0 are row 0 itself
        ok("!! the blur clamps at the frame's edge (a top row of 1: the top row's blurred value is the sum of the kernel over the clamped rows, 0.7)", near(b.data[2], expect, 1e-4) && b.data[2] > 0.69 && b.data[2] < 0.71 && k.length === 7, "top row " + b.data[2].toFixed(4));
        // the receiver filter on an impulse: spatial sigma 0.483 deg / 0.25 deg per pixel, temporal sigma 8.05 ms x 480 frames/s
        const nT = 61, w = 41, imp = []; for (let k2 = 0; k2 < nT; k2++) imp.push(S.newFrame(w, w, 0)); imp[30].data[20 * w + 20] = 1;
        const out = S.receiverFilter(imp, { degPerPixel: 0.25, fps: 480 });
        const fr = out[30], sumF = fr.data.reduce((a, b) => a + b, 0); let vx = 0; for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) vx += fr.data[y * w + x] * (x - 20) ** 2; vx /= sumF;
        const tw = out.map((f2) => f2.data.reduce((a, b) => a + b, 0)), sumT = tw.reduce((a, b) => a + b, 0); let vt = 0; for (let k2 = 0; k2 < nT; k2++) vt += tw[k2] * (k2 - 30) ** 2; vt /= sumT;
        ok("!! receiverFilter: an impulse is spread by sigma = 0.483 degrees / degPerPixel = 1.93 pixels in space and 8.05 ms x fps = 3.86 frames in time (within 6%)", Math.abs(Math.sqrt(vx) - 1.932) / 1.932 < 0.06 && Math.abs(Math.sqrt(vt) - 3.864) / 3.864 < 0.06, "space " + Math.sqrt(vx).toFixed(3) + ", time " + Math.sqrt(vt).toFixed(3));
        ok("blurTime with sigma 0 or a single frame returns copies, not the same objects", (() => { const sq = [S.newFrame(2, 2, 0.3), S.newFrame(2, 2, 0.6)]; const a = S.blurTime(sq, 0), b2 = S.blurTime([sq[0]], 2); return a[0] !== sq[0] && a[0].data !== sq[0].data && a[1].data[0] === Float32Array.from([0.6])[0] && b2[0] !== sq[0]; })());
    }
    ok("bad arguments are refused: f or frac out of range, receiverFilter without a pixel size or frame rate", throws(() => S.sigmaForAttenuation(0)) && throws(() => S.sigmaForAttenuation(60, 1)) && throws(() => S.sigmaForAttenuation(60, 0)) && throws(() => S.receiverFilter([], { fps: 60 })) && throws(() => S.receiverFilter([], { degPerPixel: 0.5 })));
}

console.log("\n2. THE DETECTOR");
{
    const f0 = S.newFrame(2, 2), f1 = S.newFrame(2, 2); f0.data[0] = 0; f0.data[1] = 1; f1.data[0] = 1; f1.data[1] = 2;
    const e = S.emdPair(f0, f1);
    ok("!! the paper's formula on a worked example: l0 0, r0 1, l1 1, r1 2 gives h = 2 (a gradient moving LEFT is positive), so mx = -2; and the vector is the sign-flipped h", near(e.mx[0], -2, 1e-6) && e.w === 2 && e.h === 2);
    const bar = (axis, sh, nT = 6) => { const fr = []; for (let t = 0; t < nT; t++) { const w = axis === "x" ? 40 : 30, h = axis === "x" ? 30 : 40, f = S.newFrame(w, h, 0.2); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = Math.abs((axis === "x" ? x : y) - (10 + sh * t)); f.data[y * w + x] = 0.2 + 0.6 * Math.exp(-d * d / 8); } fr.push(f); } return fr; };
    const right = S.motionSummary(bar("x", 1)), left = S.motionSummary(bar("x", -1)), down = S.motionSummary(bar("y", 1)), up = S.motionSummary(bar("y", -1));
    ok("!! a bar moving RIGHT gives mx > 0 and LEFT mx < 0, each with R = 1 and no vertical motion", right.mx > 10 && left.mx < -10 && near(right.R, 1, 1e-4) && near(left.R, 1, 1e-4) && near(right.my, 0, 1e-3) && near(left.mx, -right.mx, 0.02));
    ok("!! a bar moving DOWN (toward larger y) gives my < 0 and UP my > 0, each with R = 1 and no horizontal motion", down.my < -10 && up.my > 10 && near(down.R, 1, 1e-4) && near(up.R, 1, 1e-4) && near(down.mx, 0, 1e-3) && near(up.my, -down.my, 0.02));
    const still = S.motionSummary([S.newFrame(10, 10, 0.4), S.newFrame(10, 10, 0.4), S.newFrame(10, 10, 0.4)]), same = S.motionSummary(bar("x", 0));
    ok("!! a uniform frame and a bar that does not move give no motion at all", still.total === 0 && still.R === 0 && same.total < 1e-9);
    const a = S.emdPair(bar("x", 1)[2], bar("x", 1)[3]), b = S.emdPair(bar("x", 1)[2], bar("x", 1)[3]);
    let lastCol = 0, lastRow = 0; for (let y = 0; y < a.h; y++) lastCol += Math.abs(a.mx[y * a.w + a.w - 1]) + Math.abs(a.my[y * a.w + a.w - 1]); for (let x = 0; x < a.w; x++) lastRow += Math.abs(a.mx[(a.h - 1) * a.w + x]) + Math.abs(a.my[(a.h - 1) * a.w + x]);
    ok("the last column and last row have no neighbour and are 0", lastCol === 0 && lastRow === 0 && b.mx.length === a.mx.length);
    const mirror = (seq) => seq.map((f) => { const g = S.newFrame(f.w, f.h); for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) g.data[y * f.w + x] = f.data[y * f.w + (f.w - 1 - x)]; return g; });
    const mr = S.motionSummary(mirror(bar("x", 1)));
    ok("!! a left-right mirrored sequence flips the horizontal vector (mirrored rightward motion is leftward motion)", mr.mx < -10 && near(Math.abs(mr.mx), right.mx, right.mx * 0.05));
}

console.log("\n3. R AND M");
{
    const st = S.ellipseStimulus({ stripes: "none", T: 1, fps: 60 }), r = S.motionSummary(st.frames);
    ok("!! a radially symmetric expansion has R and M of 0 (the vectors cancel) although it has strength", near(r.R, 0, 1e-6) && near(r.M, 0, 1e-3) && r.total > 100, "total " + r.total.toFixed(0));
    const mv = S.ellipseStimulus({ stripes: "moving", T: 1, fps: 60 }).frames, s = S.motionSummary(mv);
    ok("!! R = M / total strength (the definition), M = |(mx, my)|, and frames counts the pairs", near(s.R, s.M / s.total, 1e-9) && near(s.M, Math.hypot(s.mx, s.my), 1e-6) && s.frames === mv.length - 1);
    const diag = []; for (let tt = 0; tt < 6; tt++) { const f = S.newFrame(40, 40, 0.2); for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) { const d2 = (x - (10 + tt)) ** 2 + (y - (10 + tt)) ** 2; f.data[y * 40 + x] = 0.2 + 0.6 * Math.exp(-d2 / 8); } diag.push(f); }
    const dg = S.motionSummary(diag);
    ok("!! M is the LENGTH of the summed vector, not the sum of the components: a blob moving down and to the right (diagonally) has M = hypot(mx, my) = 1.414 x |mx| and mx > 0 > my", dg.mx > 3 && dg.my < -3 && near(dg.M, Math.hypot(dg.mx, dg.my), 1e-6) && Math.abs(dg.M - (Math.abs(dg.mx) + Math.abs(dg.my))) > 0.2 * dg.M, `mx ${dg.mx.toFixed(1)}, my ${dg.my.toFixed(1)}, M ${dg.M.toFixed(1)}`);
    const th = S.motionSummary(mv, { threshold: 5 });
    ok("a threshold removes strength only (total falls, never rises) and a huge one leaves nothing", th.total < s.total && S.motionSummary(mv, { threshold: 1e9 }).total === 0 && S.motionSummary(mv, { threshold: 1e9 }).R === 0);
    ok("a sequence needs two frames", throws(() => S.motionSummary([S.newFrame(3, 3)])) && throws(() => S.motionSummary(null)));
}

console.log("\n4. THE STIMULI");
{
    ok("!! the diameter grows exponentially: d0 at t = 0, d1 at T, the geometric mean at T/2, clamped outside", near(S.expandingDiameter(0, 10, 10, 53), 10) && near(S.expandingDiameter(10, 10, 10, 53), 53) && near(S.expandingDiameter(5, 10, 10, 53), Math.sqrt(530), 1e-9) && S.expandingDiameter(-3, 10, 10, 53) === 10 && S.expandingDiameter(99, 10, 10, 53) === 53);
    ok("Weber contrast to luminance: dark ib (1 - wc), light ib (1 + wc) capped at 1 (wc 1 on a 0.5 background: 0 and 1)", S.darkLuminance(1) === 0 && S.lightLuminance(1) === 1 && near(S.darkLuminance(0.4), 0.3) && near(S.lightLuminance(0.4), 0.7) && S.lightLuminance(1, 0.8) === 1);
    const plain = S.ellipseStimulus({ stripes: "none", T: 0.5, fps: 60, wc: 1 }), last = plain.frames[plain.frames.length - 1], mid = (176 / 2 | 0) + 128 / 2 * 176;
    ok("!! the plain ellipse: the background is 0.5 at the corner, the centre is dark ib (1 - wc) = 0, and 31 frames for 0.5 s at 60/s", last.data[0] === 0.5 && near(last.data[mid], 0, 1e-6) && plain.frames.length === 31 && plain.degPerPixel === 0.5 && plain.fps === 60);
    {
        const f = S.ellipseStimulus({ stripes: "none", T: 0.1, fps: 60, wc: 1, startDeg: 53, finalV: 53, finalH: 74 }).frames[0], cx = 88, cy = 64;
        let wRow = 0, hCol = 0; for (let x = 0; x < 176; x++) if (f.data[cy * 176 + x] < 0.25) wRow++; for (let y = 0; y < 128; y++) if (f.data[y * 176 + cx] < 0.25) hCol++;
        const mixed = f.data.filter((v) => v > 0.02 && v < 0.48).length;
        ok("!! the ellipse is 74 degrees wide and 53 high at the final size (148 x 106 pixels at 0.5 degrees/pixel, ratio 1.40), and its edge is anti-aliased (pixels between the dark and the background exist)", near(wRow, 148, 3) && near(hCol, 106, 3) && near(wRow / hCol, 74 / 53, 0.05) && mixed > 100, `${wRow} x ${hCol}, ${mixed} edge pixels`);
    }
    const stat = S.ellipseStimulus({ stripes: "static", T: 0.5, fps: 60, wc: 1, startDeg: 53, finalV: 53, finalH: 74 }), col = (f) => { const x = 88; const runs = []; let prev = false; for (let y = 0; y < 128; y++) { const d = f.data[y * 176 + x] < 0.25; if (d && !prev) runs.push(y); prev = d; } return runs; };
    const r0 = col(stat.frames[0]), r1 = col(stat.frames[30]);
    ok("!! static stripes: 3 dark bands down the ellipse's height (a 53 degree ellipse is 106 pixels, period 35 pixels), they do not move between frames", r0.length === 3 && near(r0[1] - r0[0], 35.3, 1.5) && r0.join() === r1.join(), r0.join());
    const mov = S.ellipseStimulus({ stripes: "moving", T: 0.1, fps: 120, wc: 1, startDeg: 53, finalV: 53, finalH: 74 }), m0 = col(mov.frames[0]), m12 = col(mov.frames[12]);
    ok("!! moving stripes move DOWN: after 12 frames of 1/120 s at 4 Hz (0.4 cycle = 14.1 pixels) the dark bands have moved to larger y by 14 pixels (not up by 21)", m0.length >= 3 && m12.length >= 3 && near(m12[0] - m0[0], 14.1, 1.5) && near(m12[1] - m0[1], 14.1, 1.5), m0.join() + " -> " + m12.join());
    const lightDark = (f) => { let d = 0, l = 0; for (let y = 0; y < 128; y++) { const v = f.data[y * 176 + 88]; if (v < 0.25) d++; else if (v > 0.75) l++; } return [d, l]; }, [dk, lt] = lightDark(stat.frames[0]);
    ok("the dark bands are 1/6 of a cycle (a 1:5 dark to light ratio): about 18 dark and 88 light pixels down the 106-pixel ellipse", near(dk, 18, 4) && near(lt, 88, 5), dk + " dark, " + lt + " light");
    ok("!! bad options are refused: unknown stripes, wc out of range, T or fps not positive", throws(() => S.ellipseStimulus({ stripes: "up" })) && throws(() => S.ellipseStimulus({ wc: 1.5 })) && throws(() => S.ellipseStimulus({ wc: -0.1 })) && throws(() => S.ellipseStimulus({ T: 0 })) && throws(() => S.ellipseStimulus({ fps: 0 })));
}

console.log("\n5. THE PAPER'S RESULT (synthetic Figure 4A to C: 3 s at 60 frames/s)");
{
    const r = S.figure4({ T: 3, fps: 60 }), q = (x) => `R ${x.R.toFixed(3)}, M ${x.M.toFixed(0)}, total ${x.total.toFixed(0)}`;
    ok("!! R: the plain expanding ellipse is 0, the static stripes are small, the moving stripes are large, in that order (paper 0, 0.09, 0.92)", near(r.none.R, 0, 0.005) && r.static.R > 0.01 && r.static.R < 0.2 && r.moving.R > 0.85 && r.none.R < r.static.R && r.static.R < r.moving.R, `${r.none.R.toFixed(3)}, ${r.static.R.toFixed(3)}, ${r.moving.R.toFixed(3)}`);
    ok("!! M: 0 for the plain ellipse, and for the moving stripes more than 20 times the static stripes' (paper 34 times; here about 135, see the header)", r.none.M < 1 && r.moving.M > 20 * r.static.M && r.static.M > r.none.M, `static ${r.static.M.toFixed(0)}, moving ${r.moving.M.toFixed(0)}, ratio ${r.movingOverStatic.toFixed(0)}`);
    ok("!! figure4's ratio is moving M over static M (not the inverse) and above 1", near(r.movingOverStatic, r.moving.M / r.static.M, 1e-9) && r.movingOverStatic > 1);
    { const st = S.ellipseStimulus({ stripes: "moving", T: 3, fps: 60 }), raw = S.motionSummary(st.frames), flt = S.motionSummary(S.receiverFilter(st.frames, { degPerPixel: st.degPerPixel, fps: st.fps }));
      ok("!! figure4 runs the stimuli through the receiver's filter (its moving-stripes result equals the filtered sequence's and differs from the unfiltered one)", near(r.moving.M, flt.M, 1e-6 * flt.M) && Math.abs(raw.total - flt.total) > 0.05 * raw.total, `filtered total ${flt.total.toFixed(0)}, unfiltered ${raw.total.toFixed(0)}`); }
    ok("!! the net motion of the moving stripes points DOWN (my < 0, mx near 0): the stripes' downward motion overwhelms the expansion", r.moving.my < 0 && Math.abs(r.moving.mx) < 0.05 * Math.abs(r.moving.my), q(r.moving));
    ok("the moving stripes also have far more total motion than the plain ellipse (strength, not only net direction)", r.moving.total > 5 * r.none.total && r.static.total > r.none.total, `${r.none.total.toFixed(0)}, ${r.static.total.toFixed(0)}, ${r.moving.total.toFixed(0)}`);
    const lo = S.figure4({ T: 2, fps: 60, wc: 0.4 }), hi = S.figure4({ T: 2, fps: 60, wc: 1 });
    ok("a lower Weber contrast gives a weaker motion signal (moving stripes' M at wc 0.4 below wc 1) and the same order of R", lo.moving.M < hi.moving.M && lo.moving.R > 0.8 && hi.moving.R > 0.8, `M ${lo.moving.M.toFixed(0)} < ${hi.moving.M.toFixed(0)}`);
}

console.log("\n6. THE SOURCE");
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "stealthMotion.mjs"), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    ok("!! pure: no Math.random, no clock, no DOM, no file or network, no import", !/Math\.random|Date\.now|performance\.now|document\.|window\.|fetch\(|node:|readFileSync|^import\s/m.test(src));
}

finished = true;
console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks pass");
if (fails) process.exit(1);
