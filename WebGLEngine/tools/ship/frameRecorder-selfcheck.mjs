// WebGLEngine/tools/ship/frameRecorder-selfcheck.mjs -- task #64, backlog id "deterministic-frame-recorder"
//
// Run: node tools/ship/frameRecorder-selfcheck.mjs
//
// GATES render/frameRecorder.mjs: frameTime(index, fps), the pure synthetic-clock primitive, and
// captureFrames(canvas, tick, opts), the browser-side loop that drives `tick` off that clock instead of
// performance.now()/Date.now().
//
// *** THE CENTER OF GRAVITY HERE IS A CONTROL, THE SAME SHAPE AS deterministicRaf-selfcheck.mjs's
// RAF_SHIM_NAIVE AND videoFrames-selfcheck.mjs's sections 4-vs-5. *** Section 2 runs the SAME jittered
// experiment through two implementations: the real captureFrames (synthetic clock) and a small naive variant,
// written only in this gate file (frameRecorder.mjs itself carries no naive mode -- it would be a strange
// thing to ship), that hands `tick` real elapsed time instead. Both get REAL, DIFFERENT, RANDOM per-frame
// delays on two separate runs. The correct path must come out identical anyway; the naive path must not. A
// gate that only asserted the correct path is deterministic would be asserting its own thesis -- this proves
// the difference is real by showing what breaks when you get it wrong.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { frameTime } from "../../render/frameRecorder.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

console.log("frameRecorder-selfcheck -- a synthetic clock for frame-accurate capture, and the naive clock it replaces\n");

// =================================================================================================================
console.log("1. frameTime -- pure math, no browser, no Date.now()/performance.now() anywhere in the module");
{
    const fpsList = [24, 30, 60, 23.976];
    const N = 2000;
    let exactBad = 0, repeatBad = 0, maxSpacingDev = 0;
    for (const fps of fpsList) {
        const interval = 1000 / fps;
        for (let i = 0; i < N; i++) {
            const t = frameTime(i, fps);
            if (t !== i * interval) exactBad++;
            if (frameTime(i, fps) !== t) repeatBad++;   // trivially true for a pure function -- asserted anyway
        }
        for (let i = 1; i < N; i++) {
            const spacing = frameTime(i, fps) - frameTime(i - 1, fps);
            const dev = Math.abs(spacing - interval);
            if (dev > maxSpacingDev) maxSpacingDev = dev;
        }
    }
    ok("frameTime(i, fps) === i * (1000/fps) exactly, over " + N + " frames at " + fpsList.join("/") + " fps",
        exactBad === 0, exactBad + " mismatches");
    ok("two independent calls with identical arguments return bit-identical results",
        repeatBad === 0, repeatBad + " disagreements");
    // Spacing is NOT asserted bit-exact against `interval`: i*interval and (i-1)*interval each round
    // independently in float64, so their difference carries sub-nanosecond ULP noise even for a driftless
    // formula. Measured here rather than assumed, at a threshold 1e5x tighter than performance.now() can
    // even resolve -- so this is "no drift", not "no floating point".
    const MAX_DEV_MS = 1e-6;
    ok("spacing is EVEN to within " + MAX_DEV_MS + " ms (no accumulated drift over " + N + " frames, 4 rates)",
        maxSpacingDev < MAX_DEV_MS, "measured max deviation " + maxSpacingDev.toExponential(3) + " ms");
    ok("frameTime is strictly monotonically increasing at every rate",
        fpsList.every((fps) => { for (let i = 1; i < N; i++) if (frameTime(i, fps) <= frameTime(i - 1, fps)) return false; return true; }));
}

// =================================================================================================================
console.log("\n2-4. *** THE REAL CLAIM, IN A REAL HEADLESS CHROMIUM, WITH A REAL CONTROL AND A REAL PAIRING ***");
{
    const skip = webgpuSkipReason();
    if (skip) {
        report("SKIPPED -- " + skip);
        fails += 3;
    } else {
        // No backslash escapes anywhere below -- a nested regex escape inside this template literal was found
        // earlier this session to be eaten by the OUTER string before the script ever reaches the browser.
        // All post-processing of the harness's result happens in plain Node, after reading it back.
        const SCRIPT = `async () => {
            const { captureFrames } = await import("/render/frameRecorder.mjs");
            const { encodeGif, sniffGif } = await import("/render/gifRecorder.js");

            const W = 48, H = 24, N = 8, FPS = 24;

            // A rect whose x-position AND colour are a deterministic function of 'time' ONLY -- something
            // that visibly differs if 'time' differs between runs.
            function draw(g, time) {
                g.clearRect(0, 0, W, H);
                const x = Math.floor((time / 20) % (W - 8));
                const hue = Math.floor((time / 5) % 360);
                g.fillStyle = "hsl(" + hue + ", 90%, 50%)";
                g.fillRect(x, 0, 8, H);
            }

            function fnv1a(bytes) {
                let h = 0x811c9dc5;
                for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193); }
                return h >>> 0;
            }
            function digestFrames(frames) {
                let h = 0x811c9dc5;
                for (const f of frames) { h ^= fnv1a(f); h = Math.imul(h, 0x01000193); }
                return h >>> 0;
            }
            function framesEqual(fa, fb) {
                if (fa.length !== fb.length) return { equal: false, reason: "frame count " + fa.length + " vs " + fb.length };
                for (let i = 0; i < fa.length; i++) {
                    const a = fa[i], b = fb[i];
                    if (a.length !== b.length) return { equal: false, reason: "frame " + i + " byte length " + a.length + " vs " + b.length };
                    for (let j = 0; j < a.length; j++) if (a[j] !== b[j]) return { equal: false, reason: "frame " + i + " byte " + j + " differs: " + a[j] + " vs " + b[j] };
                }
                return { equal: true };
            }

            // ---- THE CORRECT PATH: captureFrames, driven by frameTime, with REAL RANDOM per-frame jitter ----
            async function runCorrect() {
                const canvas = document.createElement("canvas");
                canvas.width = W; canvas.height = H;
                const g = canvas.getContext("2d", { willReadFrequently: true });
                const times = [];
                const t0 = performance.now();
                const out = await captureFrames(canvas, async (time) => {
                    times.push(time);
                    draw(g, time);
                    // 0-40ms, not 0-15ms: with opts.yield's default true, captureFrames already awaits one
                    // requestAnimationFrame every frame (~16.67ms at 60Hz), which PADS any jitter below that
                    // vsync period back up to a near-fixed per-frame floor -- measured directly: 0-15ms jitter
                    // left the two runs' total wall-clock within 0.5ms of each other in ~7% of fresh-process
                    // runs (stress-tested at 92.5% in back-to-back same-session trials), even though the
                    // captureFrames determinism claim itself never once failed. 0-40ms safely straddles more
                    // than one vsync period, so the two runs' totals land on different vsync-boundary
                    // multiples and reliably differ -- measured at 0/10 anywhere near the floor with a ~98ms
                    // spread. This is a fix to the EXPERIMENT'S parameter, not to the threshold it is checked
                    // against below.
                    await new Promise((r) => setTimeout(r, Math.random() * 40));
                }, { frames: N, fps: FPS });
                return { times, frames: out.frames, width: out.width, height: out.height, fps: out.fps,
                          wallMs: performance.now() - t0, digest: digestFrames(out.frames) };
            }

            // ---- THE CONTROL: the SAME experiment, but tick gets REAL elapsed time instead of frameTime. ----
            // Deliberately wrong, and lives ONLY here -- render/frameRecorder.mjs has no naive mode to select.
            async function runNaive() {
                const canvas = document.createElement("canvas");
                canvas.width = W; canvas.height = H;
                const g = canvas.getContext("2d", { willReadFrequently: true });
                const scratch = document.createElement("canvas");
                scratch.width = W; scratch.height = H;
                const sg = scratch.getContext("2d", { willReadFrequently: true });
                const times = [];
                const frames = [];
                const t0 = performance.now();
                for (let i = 0; i < N; i++) {
                    const time = performance.now() - t0;   // REAL elapsed time -- the naive, wrong choice
                    times.push(time);
                    draw(g, time);
                    await new Promise((r) => setTimeout(r, Math.random() * 40));   // see runCorrect's note above
                    sg.clearRect(0, 0, W, H);
                    sg.drawImage(canvas, 0, 0);
                    frames.push(sg.getImageData(0, 0, W, H).data);
                }
                return { times, frames, wallMs: performance.now() - t0, digest: digestFrames(frames) };
            }

            const cA = await runCorrect();
            const cB = await runCorrect();
            const nA = await runNaive();
            const nB = await runNaive();

            // ---- opts.yield = false: same synthetic schedule, no awaited yield in the loop at all ----
            const canvasNY = document.createElement("canvas");
            canvasNY.width = W; canvasNY.height = H;
            const gNY = canvasNY.getContext("2d", { willReadFrequently: true });
            const timesNoYield = [];
            const outNoYield = await captureFrames(canvasNY, (time) => { timesNoYield.push(time); draw(gNY, time); },
                { frames: N, fps: FPS, yield: false });

            // ---- pairing with encodeGif: cA's own return value, no glue code, straight into encodeGif ----
            const gif1 = encodeGif(cA.frames, cA.width, cA.height, { delay: 1000 / cA.fps });
            const gif2 = encodeGif(cA.frames, cA.width, cA.height, { delay: 1000 / cA.fps });
            let gifBytesEqual = gif1.length === gif2.length;
            if (gifBytesEqual) for (let i = 0; i < gif1.length; i++) if (gif1[i] !== gif2[i]) { gifBytesEqual = false; break; }

            return {
                correct: { timesA: cA.times, timesB: cB.times, timesEqual: JSON.stringify(cA.times) === JSON.stringify(cB.times),
                           digestA: cA.digest, digestB: cB.digest, wallMsA: cA.wallMs, wallMsB: cB.wallMs,
                           framesEqual: framesEqual(cA.frames, cB.frames), width: cA.width, height: cA.height,
                           fps: cA.fps, frameCount: cA.frames.length },
                naive: { timesA: nA.times, timesB: nB.times, timesEqual: JSON.stringify(nA.times) === JSON.stringify(nB.times),
                         digestA: nA.digest, digestB: nB.digest, wallMsA: nA.wallMs, wallMsB: nB.wallMs,
                         framesEqual: framesEqual(nA.frames, nB.frames) },
                noYield: { times: timesNoYield, frameCount: outNoYield.frames.length, fps: outNoYield.fps },
                gif: { len1: gif1.length, len2: gif2.length, sniff1: sniffGif(gif1), sniff2: sniffGif(gif2), bytesEqual: gifBytesEqual },
            };
        }`;

        const out = await runInEngineOrigin({ engineRoot: ENG, script: SCRIPT });
        if (out.skipped || !out.ok) {
            report("browser run failed: " + (out.reason || "unknown") + (out.pageErrors && out.pageErrors.length ? " | " + out.pageErrors.join(" | ") : ""));
            fails += 3;
        } else {
            const r = out.result;

            console.log("\n2. *** THE CORE CLAIM: two jittered runs of captureFrames agree exactly, and a naive control does not ***");
            ok("!! *** the two CORRECT runs' real wall-clock durations genuinely DIFFERED (the jitter was real) ***",
                Math.abs(r.correct.wallMsA - r.correct.wallMsB) > 0.5,
                "run A: " + r.correct.wallMsA.toFixed(2) + "ms real, run B: " + r.correct.wallMsB.toFixed(2) + "ms real");
            ok("!! *** ...and DESPITE that, the sequence of synthetic `time` values tick() saw is IDENTICAL ***",
                r.correct.timesEqual, "A: [" + r.correct.timesA.map((t) => t.toFixed(3)).join(", ") + "]  B: [" +
                r.correct.timesB.map((t) => t.toFixed(3)).join(", ") + "]");
            ok("!! *** ...and the captured RGBA frame bytes are IDENTICAL, byte for byte, across all " + r.correct.frameCount + " frames ***",
                r.correct.framesEqual.equal, JSON.stringify(r.correct.framesEqual) + "  digestA=0x" + r.correct.digestA.toString(16) + " digestB=0x" + r.correct.digestB.toString(16));
            ok("   (digest cross-check agrees with the byte-for-byte comparison above)",
                r.correct.digestA === r.correct.digestB);

            console.log("\n   *** THE CONTROL: the SAME experiment, `tick` handed REAL elapsed time instead ***");
            ok("!! the naive control's two runs' real wall-clock durations ALSO genuinely differed (same jitter)",
                Math.abs(r.naive.wallMsA - r.naive.wallMsB) > 0.5,
                "run A: " + r.naive.wallMsA.toFixed(2) + "ms real, run B: " + r.naive.wallMsB.toFixed(2) + "ms real");
            ok("!! *** AND THIS TIME the `time` sequence DIFFERS between the two runs -- real time leaked in ***",
                !r.naive.timesEqual, "A: [" + r.naive.timesA.map((t) => t.toFixed(3)).join(", ") + "]  B: [" +
                r.naive.timesB.map((t) => t.toFixed(3)).join(", ") + "]");
            ok("!! *** ...and the captured pixel bytes differ too (digestA=0x" + r.naive.digestA.toString(16) + " vs digestB=0x" + r.naive.digestB.toString(16) + ") ***",
                !r.naive.framesEqual.equal || r.naive.digestA !== r.naive.digestB, JSON.stringify(r.naive.framesEqual));
            report("proves the property is REAL, not merely asserted: identical jitter, run through the naive " +
                "clock, breaks reproducibility -- so captureFrames's determinism comes from the synthetic clock, not from luck.");

            console.log("\n3. pairing with encodeGif -- captureFrames's own return value, zero glue code");
            ok("!! encodeGif(cA.frames, cA.width, cA.height, {...}) accepts captureFrames's output directly and produces a real GIF",
                r.gif.sniff1 && r.gif.len1 > 0, "sniffGif=" + r.gif.sniff1 + " " + r.gif.len1 + " bytes");
            ok("!! encoding the SAME captured frames twice is deterministic: byte-identical GIF output",
                r.gif.bytesEqual && r.gif.len1 === r.gif.len2 && r.gif.sniff2, r.gif.len1 + " vs " + r.gif.len2 + " bytes, both real GIFs: " + r.gif.sniff1 + "/" + r.gif.sniff2);

            console.log("\n4. opts.yield = false -- the schedule is unchanged with no awaited yield in the loop at all");
            const expectedNoYield = Array.from({ length: r.noYield.frameCount }, (_, i) => i * (1000 / r.noYield.fps));
            ok("!! the correct frame count comes back (" + r.noYield.frameCount + " of 8 requested)",
                r.noYield.frameCount === 8);
            ok("!! per-frame synthetic times are EXACTLY frameTime(i, fps), unaffected by the missing yield",
                JSON.stringify(r.noYield.times) === JSON.stringify(expectedNoYield),
                "got [" + r.noYield.times.join(", ") + "]  expected [" + expectedNoYield.join(", ") + "]");
        }
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: GPU/device determinism. This module and gate make a JS-side timing claim only -- the same" +
    " engine backend, driven twice by the same synthetic clock, reproduces the same frames; a different GPU," +
    " driver, or a scene whose OWN draw code reads real time regardless of the `time` it is handed is outside" +
    " what this buys you, exactly as tools/ship/nextRounds.mjs's own backlog entry for this round says. Also" +
    " unchecked: WebGL canvases specifically (this gate's fixture is 2D, per the module's own doc comment on why" +
    " that is sufficient -- the preserveDrawingBuffer caveat is a WebGL concern this module states but a 2D" +
    " canvas cannot exercise). And no live caller exists yet: this round builds the module and proves its core" +
    " claim, per the backlog entry's own scope -- see that entry's 'upstream' field.");
process.exit(fails ? 1 : 0);
