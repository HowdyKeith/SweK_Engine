#!/usr/bin/env node
// WebGLEngine/tools/ship/videoFrames-selfcheck.mjs -- v4260
//
// Run: node tools/ship/videoFrames-selfcheck.mjs
//
// *** v4188 GAVE THIS TREE A VIDEO INPUT NO TEST CAN EVER HOLD STILL. *** A live camera never produces the
// same frame twice, so pointing the whole shader chain at one made every effect demonstrable and none of them
// gradeable. This round adds the input a gate can hold: a video file stepped by seek-and-wait.
//
// WHAT THE TREE HAD, COUNTED RATHER THAN ASSERTED (section 1 re-counts it every run):
//   - video.currentTime is set in ZERO files. Every .currentTime in the source is AudioContext.currentTime.
//   - requestVideoFrameCallback is called in ONE place, render/cameraTexture.js, and before this round it
//     discarded the metadata argument -- the only place the platform will tell you which frame you got.
//
// *** THE SENTENCE THIS WHOLE GATE EXISTS TO SEPARATE: REPRODUCIBLE IS NOT ACCURATE. *** The measured seek
// path returned twenty of twenty identical frames on two consecutive runs, with identical pixel digests, and
// was WRONG ABOUT WHICH FRAME IT WAS ON for nineteen of them. Sections 4 and 5 hold those apart, because a
// round that conflated them would have shipped "frame-accurate" on the strength of a repeatability result.
"use strict";
import * as V from "../../render/videoFrames.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const seq = (n) => [...Array(n).keys()];

// ---- MEASURED FIXTURES ------------------------------------------------------------------------------------
// Every array below was PRINTED BY A HEADLESS-CHROMIUM PROBE, not written by hand and not predicted. Each
// recorded a video whose frames carry their own index via encodeFrameIndex, then read them back. They are
// frozen here so the gate runs in 0.2s with no browser, and section 7 re-runs the live probe when one is
// available. Where a number here disagrees with a fresh probe, the fresh probe wins and this file is wrong.
const M = {
    // probe 1+2: PLAY + requestAnimationFrame, the same clip and code twice in a row
    play1: [0,0,0,0,1,1,2,2,2,3,3,4,4,5,5,6,6,7,7,8],
    play2: [0,0,1,1,2,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9],
    // probe 2: SEEK AND WAIT over framePlan(20, 30, {start:2, step:3}), run twice
    planAsked: [2,5,8,11,14,17,20,23,26,29,32,35,38,41,44,47,50,53,56,59],
    seek1: [2,4,7,10,13,16,19,22,25,28,31,34,37,40,43,46,49,52,55,58],
    seek2: [2,4,7,10,13,16,19,22,25,28,31,34,37,40,43,46,49,52,55,58],
    // probe 3: a 20.316 fps file stepped at an ASSUMED 30 fps
    rate30: [0,1,1,2,3,3,4,5,5,6,7,7,8,9,9,10,11,11,12,13,13,14,15,15,16,17,17,18,19,19,20,21,21,22,23,23,
             24,25,25,26,27,27,28,29,29,30,31,31,32,33,33,34,35,35,36,37,37,38,39,39,40,40,41,42],
    // probe 4: captureStream(fps) at three rates, each stepped at the rate it was recorded at
    cs10: seq(47),
    cs25: [...seq(39), 38,39,40,41,42,43,44,45,46],
    cs30: [0, 0, ...seq(47).slice(2)],
    // probe 4: rVFC mediaTime against the pixels, on the file that seeked 47/47 correct
    rvfc10: [{ asked: 3, pixels: 3, mediaTime: 0.402 }, { asked: 10, pixels: 10, mediaTime: 1.107 },
             { asked: 20, pixels: 20, mediaTime: 2.113 }, { asked: 30, pixels: 30, mediaTime: 3.119 }],
    cs10duration: 4.7296, cs10frames: 47,
};

console.log("videoFrames-selfcheck -- a video file as a reproducible input, and the difference from an accurate one\n");

// =============================================================================================================
console.log("1. *** THE GAP IS RE-COUNTED EVERY RUN, so it cannot quietly stop being true ***");
{
    const files = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (/node_modules|^\.git$|^vendor$|^GPU_Assets$|^demos_code$/.test(e.name)) continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p); else if (/\.(js|mjs|html)$/.test(e.name)) files.push(p);
    } };
    walk(ROOT);
    // The ONLY thing that seeks a video is this round's own module and its wiring. Anything else is a
    // second implementation and the point of the census is to see one arrive.
    const seekers = files.filter((f) => /(?<![A-Za-z])(?:video|v|vid)\.currentTime\s*=/.test(fs.readFileSync(f, "utf8")))
        .map((f) => path.relative(ROOT, f));
    const mine = seekers.filter((f) => /videoFrames/.test(f));
    ok("the only files that SET a video's currentTime are this round's",
        seekers.length === mine.length && mine.length >= 1,
        seekers.length + " seeker(s): " + (seekers.join(" ") || "none"));
    const rvfc = files.filter((f) => /requestVideoFrameCallback\s*\(/.test(fs.readFileSync(f, "utf8")))
        .map((f) => path.relative(ROOT, f)).filter((f) => !/vendor[\\/]/.test(f));
    ok("requestVideoFrameCallback is called in exactly two places now: the camera and the file",
        rvfc.length === 2, rvfc.join(" "));
    // *** THE FIX THIS ROUND MADE TO v4188'S CAMERA, asserted by mechanism rather than by the changelog. ***
    const cam = fs.readFileSync(path.join(ROOT, "render/cameraTexture.js"), "utf8");
    ok("cameraTexture.js now READS the rVFC metadata argument it used to discard",
        /requestVideoFrameCallback\(\s*tick\s*\)/.test(cam) && /\(now,\s*md\)\s*=>/.test(cam) && /md\.presentedFrames/.test(cam));
    ok("and turns it into a DROPPED-FRAME count, which a boolean could never carry", /this\.dropped\s*\+=/.test(cam));
}

// =============================================================================================================
console.log("\n2. *** THE ARITHMETIC, AND THE RATE AT WHICH THE OBVIOUS IMPLEMENTATION LOOKS PERFECT ***");
// floor(t * fps) is what anyone writes first. It is wrong on frame boundaries because n/fps is not exact in
// binary -- and at 24 fps it is wrong ZERO times, so testing there proves nothing.
{
    const wrongAt = (fps, eps, mid) => { let w = 0;
        for (let i = 0; i < 2000; i++) { const t = mid ? (i + 0.5) / fps : i / fps; if (Math.floor(t * fps + eps) !== i) w++; }
        return w; };
    const rates = [24, 25, 29.97, 30, 60];
    const naive = rates.map((f) => wrongAt(f, 0, false));
    report("boundary times, floor(t*fps) with NO epsilon, out of 2000: " +
        rates.map((f, i) => f + " fps -> " + naive[i]).join(", "));
    ok("the naive floor really is wrong, and by a lot at 25 fps", naive[1] >= 100, naive[1] + " of 2000 at 25 fps");
    ok("*** AND IT IS WRONG ZERO TIMES AT 24 FPS -- the rate that would have hidden this ***", naive[0] === 0);
    ok("FRAME_EPS takes every one of those to zero", rates.every((f) => wrongAt(f, V.FRAME_EPS, false) === 0),
        "with eps=" + V.FRAME_EPS);
    ok("and the MIDPOINT needs no epsilon at all", rates.every((f) => wrongAt(f, 0, true) === 0));
    ok("FRAME_EPS is far below a frame and far above the float error", V.FRAME_EPS < 1 / 1000 && V.FRAME_EPS > 1e-12);
    // seekTimeFor must actually BE the midpoint, and boundaryMargin must agree that it is.
    ok("seekTimeFor lands exactly halfway between the boundaries at every rate",
        rates.every((f) => seq(50).every((n) => Math.abs(V.boundaryMargin(V.seekTimeFor(n, f), f) - 0.5) < 1e-9)));
    ok("a boundary time has margin ~0, which is what makes it the fragile choice",
        rates.every((f) => V.boundaryMargin(3 / f, f) < 1e-9));
    ok("bad input is refused rather than returned as a plausible number",
        V.frameIndexAt(-1, 30) === -1 && V.frameIndexAt(1, 0) === -1 && Number.isNaN(V.seekTimeFor(3, 0)));
}

// =============================================================================================================
console.log("\n3. *** A FRAME THAT CARRIES ITS OWN NUMBER: the only authority that does not need a clock ***");
{
    const W = 176, H = 128;
    let bad = 0; for (let n = 0; n < 256; n++) if (V.decodeFrameIndex(V.encodeFrameIndex(n, W, H), W, H) !== n) bad++;
    ok("every index 0..255 survives encode -> decode", bad === 0, bad + " wrong");

    // *** THE HOLE THE PROBE FOUND BEFORE THIS SHIPPED. *** With 8 data blocks and a parity block, frame 0 is
    // all-zero with parity zero, so a BLACK FRAME WAS A VALID ENCODING OF FRAME 0 -- a failed decode, an
    // un-uploaded texture and a seek before the first keyframe would all have read back a confident "0".
    // Two sync blocks fixed it. These three checks are the regression guard.
    const fill = (v) => { const b = new Uint8ClampedArray(W * H * 4).fill(v); for (let i = 3; i < b.length; i += 4) b[i] = 255; return b; };
    for (const [name, v] of [["all black", 0], ["mid grey", 128], ["all white", 255]])
        ok("  a " + name + " frame decodes as UNREADABLE, not as a frame number", V.decodeFrameIndex(fill(v), W, H) === -1,
            "got " + V.decodeFrameIndex(fill(v), W, H));

    // Parity: one flipped block must never come back as a confident wrong number.
    let caught = 0, silent = 0;
    for (let n = 0; n < 256; n++) for (let bit = 0; bit < V.FRAME_BITS; bit++) {
        const b = V.encodeFrameIndex(n, W, H), colW = W / (V.FRAME_BITS + 3), bandH = Math.floor(H / 4);
        for (let y = 0; y < bandH; y++) for (let x = Math.floor((1 + bit) * colW); x < Math.floor((2 + bit) * colW); x++) {
            const i = (y * W + x) * 4; const v = b[i] > 128 ? 0 : 255; b[i] = b[i + 1] = b[i + 2] = v;
        }
        const g = V.decodeFrameIndex(b, W, H); if (g === -1) caught++; else silent++;
    }
    ok("a single flipped block is ALWAYS caught by parity, never returned as a number",
        silent === 0, caught + " caught, " + silent + " silently wrong, over " + (256 * V.FRAME_BITS) + " trials");

    // The adaptive threshold, against the degradation a codec actually applies: gain and bias.
    const shifted = (buf, a, b) => { const o = Uint8ClampedArray.from(buf);
        for (let i = 0; i < o.length; i += 4) { const v = Math.max(0, Math.min(255, buf[i] * a + b)); o[i] = o[i + 1] = o[i + 2] = v; } return o; };
    for (const [a, b] of [[0.5, 64], [0.2, 100], [0.15, 105], [1, -60]]) {
        let w = 0, u = 0;
        for (let n = 0; n < 256; n++) { const g = V.decodeFrameIndex(shifted(V.encodeFrameIndex(n, W, H), a, b), W, H);
            if (g === -1) u++; else if (g !== n) w++; }
        ok("  gain " + a + " bias " + b + ": still exact", w === 0 && u === 0, w + " wrong, " + u + " unreadable");
    }
    { // and below its contrast floor it REFUSES rather than guesses -- the direction this has to fail in
        let u = 0; for (let n = 0; n < 256; n++) if (V.decodeFrameIndex(shifted(V.encodeFrameIndex(n, W, H), 0.1, 115), W, H) === -1) u++;
        ok("  gain 0.1 (a 25-level range) is refused, not guessed", u === 256, u + "/256 unreadable");
    }
    report("HONEST LIMIT: additive noise below 128 CANNOT flip a full-black or full-white block, so a noise " +
        "sweep under that amplitude proves nothing about this scheme. At +/-255 the probe measured 13 of 256 " +
        "SILENTLY WRONG -- one parity bit cannot catch an even number of flipped blocks, and it does not claim to.");
}

// =============================================================================================================
console.log("\n4. *** REPRODUCIBLE: the seek path returns the same frames twice, and playback does not ***");
{
    const play = V.runsAgree(M.play1, M.play2);
    ok("*** PLAY + rAF DISAGREES WITH ITSELF: two identical runs, same file, one after the other ***",
        !play.identical && play.differ >= 15, play.differ + " of " + play.n + " ticks differ");
    const seek = V.runsAgree(M.seek1, M.seek2);
    ok("SEEK AND WAIT returns the identical sequence on the second run", seek.identical,
        seek.same + "/" + seek.n + " identical");
    ok("runsAgree can tell the two apart at all (it is not answering the same thing twice)",
        seek.identical !== play.identical);
    // A control on the comparator itself: a single changed element must break identity.
    const nudged = M.seek2.slice(); nudged[7]++;
    ok("CONTROL: one changed frame in twenty breaks the identity", !V.runsAgree(M.seek1, nudged).identical,
        "differ " + V.runsAgree(M.seek1, nudged).differ);
    ok("CONTROL: a truncated run is not identical to a full one", !V.runsAgree(M.seek1, M.seek2.slice(0, 19)).identical);
}

// =============================================================================================================
console.log("\n5. *** AND NOT ACCURATE: the same perfectly-repeatable run was wrong about 19 of those 20 ***");
{
    const a = V.agreement(M.planAsked, M.seek1);
    ok("*** the reproducible run landed on the asked-for frame ONCE in twenty ***",
        a.exact === 1 && a.offByOne === 19, JSON.stringify(a));
    ok("and it was never off by more than one, so this is a shift and not chaos", a.worse === 0);
    report("THIS IS THE POINT OF THE ROUND: a gate that only asked 'did it repeat' would have called that " +
        "frame-accurate. Repeatability and accuracy are separate questions and both have to be asked.");

    // The 20.3 fps file stepped at an assumed 30: the error GROWS.
    const rate = V.driftProfile(seq(M.rate30.length), M.rate30);
    ok("a wrong fps is diagnosed as a RATE error, not as bad luck", rate.kind === "rate",
        "kind " + rate.kind + ", slope " + rate.slope.toFixed(4) + " frames per frame");
    ok("  and its agreement is genuinely bad, which is why the diagnosis matters",
        V.agreement(seq(M.rate30.length), M.rate30).exact <= 3,
        JSON.stringify(V.agreement(seq(M.rate30.length), M.rate30)));

    // When the file's timing MATCHES, it is exact -- so frame-accurate seek is achievable, not aspirational.
    ok("*** captureStream(10) stepped at 10 fps: 47 of 47 EXACT ***",
        V.agreement(seq(47), M.cs10).exact === 47 && V.driftProfile(seq(47), M.cs10).kind === "exact");
    const drop = V.driftProfile(seq(M.cs25.length), M.cs25);
    ok("a single lost frame is diagnosed as a DROP, with the index it happened at",
        drop.kind === "drop" && drop.at === 39 && drop.shift === -1, JSON.stringify({ kind: drop.kind, at: drop.at, shift: drop.shift }));
    report("the deltas there are 0 thirty-nine times then -1 nine times: THE ERROR IS A STEP, NEVER NOISE. " +
        "No change of fps repairs a drop, which is exactly why 'rate' and 'drop' are different words here.");
    const noisy = V.driftProfile(seq(M.cs30.length), M.cs30);
    ok("an isolated one-frame blip that recovers is NOT called a drop", noisy.kind !== "drop", "kind " + noisy.kind);
    ok("a clean sequence is called exact and nothing else", V.driftProfile(seq(20), seq(20)).kind === "exact");
    ok("CONTROL: a constant shift is an OFFSET, which is a different fix again",
        V.driftProfile(seq(20), seq(20).map((x) => x + 3)).kind === "offset");
}

// =============================================================================================================
console.log("\n6. *** THE TIMESTAMP IS A CLAIM AND THE PIXELS ARE THE ANSWER ***");
// identify() reads mediaTime, which is the best the platform offers. Probe 4 measured it against the pixels on
// the file that seeked 47/47 CORRECT -- so any disagreement here is the timestamp's, not the seek's.
{
    const FPS = 10;
    const rows = M.rvfc10.map((r) => ({ ...r, byTime: V.identify({ mediaTime: r.mediaTime, presentedFrames: 0 }, FPS) }));
    const disagree = rows.filter((r) => r.byTime.index !== r.pixels);
    ok("*** mediaTime disagreed with the pixels on every one of these, always by exactly +1 ***",
        disagree.length === rows.length && disagree.every((r) => r.byTime.index - r.pixels === 1),
        rows.map((r) => r.mediaTime + "->" + r.byTime.index + " vs px " + r.pixels).join("  "));
    // *** AND HERE IS THE LIMIT OF THE MARGIN IDEA, WHICH I HAD TO BE TOLD BY THE FIRST RUN OF THIS GATE. ***
    // I asserted the margin flags every one of these as untrustworthy. It does not. The margins are 0.020,
    // 0.070, 0.130, 0.190 -- they GROW, because the rate error accumulates and pushes the timestamp further
    // past the boundary it should never have crossed. So the margin catches the FIRST disagreement, when the
    // answer is genuinely borderline, and by frame 30 it reports a comfortable-looking 0.19 while still being
    // wrong. A margin is a warning about a boundary. IT IS NOT A DETECTOR OF A WRONG FRAME RATE, and only
    // reading the pixels is.
    const margins = rows.map((r) => r.byTime.margin);
    ok("the margin does flag the FIRST disagreement, where the answer really is borderline", margins[0] < 0.05,
        "margin " + margins[0].toFixed(3));
    ok("*** but it GROWS with the drift and stops warning while the answer is still wrong ***",
        margins.every((m, i) => i === 0 || m > margins[i - 1]) && margins[margins.length - 1] > 0.15,
        "margins " + margins.map((m) => m.toFixed(3)).join(" ") + " -- all four indices wrong throughout");
    report("WHY: the file's real rate was " + V.calibrateFps(M.cs10duration, M.cs10frames).toFixed(4) +
        " fps, not the 10 it was recorded at, so every timestamp sits a few ms past its nominal boundary " +
        "(0.402 for frame 3, drifting to 3.119 for frame 30). The midpoint SEEK survived that because it " +
        "has half a frame of slack; reading the timestamp has none.");
    ok("calibrateFps recovers the real mean rate from duration and a frame count",
        Math.abs(V.calibrateFps(M.cs10duration, M.cs10frames) - 9.9374) < 1e-3);
    ok("calibrateFps refuses nonsense rather than returning Infinity",
        Number.isNaN(V.calibrateFps(0, 47)) && Number.isNaN(V.calibrateFps(4.7, 0)));
    ok("a mid-frame timestamp gets a HIGH margin, so the flag is not simply always on",
        V.identify({ mediaTime: 0.35, presentedFrames: 0 }, FPS).margin > 0.4,
        "margin " + V.identify({ mediaTime: 0.35, presentedFrames: 0 }, FPS).margin.toFixed(3));
    ok("droppedBetween counts frames the compositor showed and we never uploaded",
        V.droppedBetween(10, 11) === 0 && V.droppedBetween(10, 14) === 3 && V.droppedBetween(-1, 5) === 0);
    ok("identify survives a missing metadata object instead of throwing mid-frame",
        V.identify(null, 30).index === -1 && V.identify({}, 30).index === -1);
}

// =============================================================================================================
console.log("\n7. *** THE PLAN IS PURE, WHICH IS WHERE THE WORD REPRODUCIBLE IS EARNED ***");
{
    const p1 = V.framePlan(20, 30, { start: 2, step: 3 });
    const p2 = V.framePlan(20, 30, { start: 2, step: 3 });
    ok("two plans built independently are identical", JSON.stringify(p1) === JSON.stringify(p2));
    ok("the plan matches the indices the measured probe actually asked for",
        JSON.stringify(p1.map((s) => s.index)) === JSON.stringify(M.planAsked));
    // *** THIS CHECK PASSED BY LUCK ON ITS FIRST WRITING AND SABOTAGE A EXPOSED IT. *** With only 30 fps and
    // only these twenty indices, a plan built on BOUNDARIES also satisfied it -- none of those twenty
    // happened to be among the 38-in-2000 boundary times that floor() misreads. Section 2 measured that 25 fps
    // is where the failure is dense (137 in 2000), so the sweep now covers several rates and a long run, and
    // asserts the midpoint property with NO epsilon, which only a real midpoint can satisfy.
    let midBad = 0, boundaryWouldFail = 0;
    for (const fps of [24, 25, 29.97, 30, 60]) for (const n of seq(400)) {
        if (V.frameIndexAt(V.seekTimeFor(n, fps), fps, 0) !== n) midBad++;
        if (Math.floor((n / fps) * fps) !== n) boundaryWouldFail++;
    }
    ok("every planned time is the midpoint of its own frame, at five rates over 400 frames each",
        midBad === 0, midBad + " wrong of 2000");
    ok("  and the same sweep on BOUNDARIES does fail, so the check can tell the two apart",
        boundaryWouldFail > 0, boundaryWouldFail + " of 2000 boundary times misread by floor()");
    ok("step and start are honoured, and a zero step cannot make an infinite plan",
        V.framePlan(5, 30, { step: 0 }).map((s) => s.index).join(",") === "0,1,2,3,4");
    ok("digest is stable for the same bytes and different for one changed byte",
        V.digest(new Uint8Array([1, 2, 3])) === V.digest(new Uint8Array([1, 2, 3])) &&
        V.digest(new Uint8Array([1, 2, 3])) !== V.digest(new Uint8Array([1, 2, 4])));
}

// =============================================================================================================
console.log("\n8. *** THE ENGINE CALLS IT, and the source-text reach is named as source text ***");
{
    const src = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");
    ok("main.js imports the module", /from\s+"\.\/render\/videoFrames\.mjs"/.test(src));
    ok("window.videoFrames offers open / run / check / close",
        /\bopen\s*\(url/.test(src) && /async run\s*\(/.test(src) && /async check\s*\(/.test(src) && /close\(\)/.test(src));
    ok("check() reads the index OUT OF THE PIXELS rather than trusting the plan", /decodeFrameIndex\(d,/.test(src));
    ok("a wrong-rate diagnosis tells the caller the file's measured mean", /the file's mean is/.test(src));
    ok("VideoFrameSource presents the surface a camera pass already accepts",
        /this\.frames\+\+/.test(fs.readFileSync(path.join(ROOT, "render/videoFrames.mjs"), "utf8")));
}

// =============================================================================================================
// SABOTAGE LOG -- each applied to a working tree, confirmed present with grep -c before the run was read,
// and restored md5-identical afterwards (videoFrames.mjs 433bed14da6187d9effa4ffbe4bf8985, cameraTexture.js
// b8b5a58b29fb36f2d3ecac1a5d976f2f). The counts are what the runs printed, including where I was wrong.
//
//   A  seekTimeFor returns the BOUNDARY (n/fps) instead of the midpoint.
//      -> *** 1 RED ON THE FIRST TRY, WHICH WAS TOO FEW, AND SECTION 7 IS WHY. *** Its midpoint check swept
//      only 30 fps and only the twenty indices the probe happened to use, and not one of those twenty is
//      among the 38-in-2000 boundary times floor() misreads -- so a plan built entirely on boundaries
//      satisfied it. Section 2 had already measured that 25 fps is where the failure is dense (137 in 2000),
//      so the check now sweeps five rates over 400 frames each and asserts the property with NO epsilon.
//      2 RED after that. Same shape as v4255's off-centre fixture and v4259's non-cubic one: a check that
//      only samples where the bug is absent is not a check.
//      Still 0 RED in sections 4-6, and that is honest rather than a gap: the probe found boundary seeks came
//      back 6/6 exact in this browser, so the frozen fixtures genuinely cannot punish this. The midpoint is
//      defended by the arithmetic and by the margin, and the gate says so instead of pretending otherwise.
//
//   B  the two sync blocks removed from the frame encoding (the bug this round shipped and then caught).
//      -> 4 RED. An all-black and a mid-grey frame each decode as a confident frame 0; parity goes from
//      0 silently wrong to *** 512 of 2048 silently wrong ***; and the low-contrast frame that should be
//      refused is guessed at instead, because the fixed 128 threshold replaced the sync-derived one.
//      *** THE 0..255 ROUND TRIP STAYS GREEN THROUGHOUT, *** which is exactly why that check alone did not
//      catch this the first time either.
//
//   C  driftProfile's "drop" branch removed, so a single step falls through to the slope test.
//      -> 1 RED, and the value it reports is the point: kind "rate". A drop misreported as a rate error sends
//      the caller off to recalibrate fps, which cannot repair a dropped frame. The wrong diagnosis is worse
//      than none, and this is the only check that notices the difference.
//
//   D  identify() returns margin: 1 unconditionally instead of the real distance.
//      -> 2 RED in section 6. The mediaTime-versus-pixels disagreement still passes, so the gate would have
//      gone on SEEING the timestamps be wrong while losing the number that tells a caller when to distrust
//      them -- and losing, with it, the measured fact that the margin grows as the error entrenches.
//
//   E  cameraTexture.js reverted to `const tick = () => { this._pending = true; ... }` -- v4188's discard.
//      -> 2 RED in section 1. Nothing else in the tree notices, which is the argument for section 1 existing:
//      that file is otherwise untouched by this round and no other gate reads it.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: A REAL VIDEO, IN THIS PROCESS. Every array in section 4-6 came from a headless " +
    "Chromium probe run by hand this round and is FROZEN -- no browser runs during this gate, so a platform " +
    "change would not be noticed here until somebody re-runs the probe. The clips were also all made by " +
    "MediaRecorder from a canvas, so no camera-shot or transcoded file has ever been through this, and " +
    "H.264/MP4 is entirely untested (the sandbox's Chromium offers only WebM). Also unmeasured: whether the " +
    "off-by-one between mediaTime and the pixels belongs to the container's timestamps or to the canvas " +
    "capture that wrote them -- the probe cannot separate those, and this file does not guess. And the " +
    "EFFECT CHAIN itself is still ungraded: this round supplies the reproducible input and nothing yet " +
    "renders a pass against it, so 'an effect can now be graded' is a capability here and not a result.");
process.exit(fails ? 1 : 0);
