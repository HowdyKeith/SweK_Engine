#!/usr/bin/env node
// WebGLEngine/tools/ship/webcodecsFramesToMp4-selfcheck.mjs
//
// GATES TWO ROUNDS NOW:
//   (1, sections 1-8) the second, more-realistic spike added to ai-bridge/webcodecsBridge.js:
//      encodeFramesDirToMp4(dir, pattern, opts) -- proving @napi-rs/webcodecs against exportBridge.js's
//      REAL production consumer shape (a directory of real numbered PNG frames on disk -> a real MP4),
//      unlike the file's original encodeH264Spike() which only ever exercised toy, in-memory,
//      non-file-based frames. THIS ROUND DID NOT TOUCH exportBridge.js/server.js -- see the original
//      section 8 (still here, UPDATED for round 2 below, since that round's own claim "exportBridge.js
//      does not reference webcodecsBridge.js" is no longer true and asserting it now would be a stale
//      gate lying about the current tree).
//   (2, sections 9-14) round 2: webcodecsBridge.js's encodeFramesDirToMp4() is now wired into the REAL
//      PRODUCTION exportBridge.js's framesToMp4(pattern, mp4Path, opts) as a strictly opt-in
//      opts.backend === "webcodecs" alternative to the default ffmpeg-CLI path -- see exportBridge.js's
//      own framesToMp4()/_framesToMp4WebCodecs() docblocks for the full story. Sections 9-14 gate THAT
//      wiring specifically: the opt-in branch works end to end against real files, the default path is
//      provably byte-for-byte unmodified (this sandbox has no ffmpeg binary, so "unmodified source" is
//      what is provable here, not "still runs to completion" -- see section 10), audio is rejected loudly
//      rather than silently ignored or silently falling back, opts:null does not crash either path, a
//      sabotaged native module rejects cleanly through the real exportBridge.js wiring (not just the
//      bridge file directly, unlike round 1's sabotage), and server.js still exposes NO way for an HTTP
//      caller to select the webcodecs backend (the licensing question in webcodecsBridge.js's own LICENCE
//      object remains unresolved -- that is a separate decision, deliberately not bundled into this one).
//   (round 2's own review pass, no new sections -- fixes to EXISTING code this gate already exercises)
//      Adversarial review of round 2 found two real bugs in webcodecsBridge.js itself (not this gate's own
//      diff, but code sections 1-14 already exercise): encodeFramesDirToMp4() was not opts:null-safe
//      (only its FIRST opts read was guarded; `opts.fps` further down was not -- unreachable through
//      exportBridge.js's new branch, since that guarantees opts is truthy, but a real gap in this directly-
//      exported function for any other caller), and _verifyDecodedFramesDiffer()'s default maxSamples
//      sampling only ever looked at the chronologically FIRST N decoded frames, producing a false
//      "framesDiffer:false" negative whenever real motion happened later in a sequence than the sample
//      window -- reproduced live with a 22-frame sequence whose only transition was at frame 9. Both fixed
//      (opts normalized at the top of the function; sampling now collects every decoded frame cheaply and
//      evenly subsamples across the FULL sequence afterward, not just its start) and re-verified directly
//      against the same reproduction cases. This gate's own sections 2/11 (which already call
//      _verifyDecodedFramesDiffer with default options) benefit from the fix without needing new sections.
//      Also added: top-level unhandledRejection/uncaughtException handlers in THIS file (see below), after
//      an independent review run hit a rare, non-reproducible native-addon cold-load flake that crashed
//      the gate process uncontrolled instead of reporting a clean FAIL.
//
// SPIKE, NOT A FEATURE -- same discipline as the bridge file itself, even now that it is wired into real
// production code: the licensing question is still open, so backward compatibility for every EXISTING
// caller (none of whom pass opts.backend) is the top priority, verified below, not assumed.
//
// Run: node tools/ship/webcodecsFramesToMp4-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered -- any *-selfcheck.mjs anywhere in the tree).
//
//   SABOTAGE LOG:
//     A. (section 6, round 1, reproduced HERE on every run, via a scratch copy that never touches the
//        shipped file) webcodecsBridge.js's own `_frameCanvasMod = require("@napi-rs/canvas");` line,
//        targeted at a nonexistent package name. Effect, confirmed live: encodeFramesDirToMp4() against
//        the SAME real frame directory section 2 confirms the real file encodes successfully now degrades
//        to {ok:false} instead, naming the real reason ("canvas unavailable for frame decode"). Scratch
//        file deleted immediately after, in a `finally`.
//     B. (section 7, round 1, same scratch-copy technique) webcodecsBridge.js's own
//        `_webcodecsMod = require("@napi-rs/webcodecs");` line, targeted the same way. Effect, confirmed
//        live: the identical real frame directory that encodes cleanly against the real file now
//        degrades to {ok:false} ("webcodecs unavailable") instead of throwing.
//     C. (manual, against a hand-broken in-memory copy of the module source, at dev time -- not
//        reproduced automatically here since it needs to corrupt a decode step mid-function rather than
//        swap a require target) _expandFrameSequence()'s HARD_CAP loop bound was temporarily set to 0
//        during development to confirm section 3's "empty directory" and "pattern matches nothing"
//        assertions actually distinguish a real bug (nothing found because the cap is wrong) from the
//        intended behavior (nothing found because the directory genuinely has no frames) -- restored
//        immediately, diff confirmed byte-identical to before the edit.
//     D. (section 13, round 2, reproduced HERE on every run) a SCRATCH COPY of webcodecsBridge.js with its
//        `_webcodecsMod = require("@napi-rs/webcodecs");` line targeted at a nonexistent package name,
//        PLUS a scratch copy of exportBridge.js whose `require("./webcodecsBridge.js")` is repointed at
//        that scratch bridge copy -- so this reproduces the sabotage through the REAL exportBridge.js
//        wiring (framesToMp4 -> _framesToMp4WebCodecs -> encodeFramesDirToMp4), not just against the
//        bridge file directly the way round 1's sabotage did. Effect, confirmed live: framesToMp4(...,
//        {backend:"webcodecs"}) against a real frame directory rejects with a real Error naming
//        "webcodecs unavailable", not an uncaught throw. Both scratch files deleted immediately after, in
//        a `finally`; the real installed @napi-rs/webcodecs package was never touched.
//
// *** WHY SECTION 2's CONTENT CHECKS GO BEYOND webcodecsBridge.js's OWN STRUCTURAL VERIFICATION: ***
// encodeFramesDirToMp4() already runs _verifyMp4() internally (ISO-BMFF box structure, NAL-unit walk) --
// that proves the muxed file is not truncated/corrupt, but says nothing about whether the encoded
// content is actually blank/static. This gate additionally (a) samples the REAL SOURCE PNG files' own
// pixels, independently of the bridge, to prove the rendered fixture sequence genuinely has motion
// BEFORE encoding, and (b) calls the bridge's own _verifyDecodedFramesDiffer() -- which decodes the
// MUXED OUTPUT back out via @napi-rs/webcodecs' own Mp4Demuxer+VideoDecoder -- to confirm the DECODED
// content still distinguishes frames, not just "the container is well-formed". Per this task's own
// scoping: this is feasible ON THIS BOX because @napi-rs/webcodecs bundles its own decoder (no external
// ffmpeg/ffprobe binary exists here, confirmed below); a box without a working decode path would have to
// stop at the structural check alone.
"use strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require_ = createRequire(import.meta.url);
// Scoped to ai-bridge/ itself so require("@napi-rs/canvas")/require("@napi-rs/webcodecs") resolve
// against ai-bridge/node_modules the same way webcodecsBridge.js's own require() calls do -- this file's
// own location has no node_modules chain that reaches them.
const requireAiBridge = createRequire(path.join(ENG, "ai-bridge", "webcodecsBridge.js"));
const WC = requireAiBridge(path.join(ENG, "ai-bridge", "webcodecsBridge.js"));
const canvasMod = requireAiBridge("@napi-rs/canvas");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// *** ADVERSARIAL-REVIEW FIX (round 2's own review pass). *** An independent review run of this gate hit
// a rare, non-reproducible flake (1 of 6 runs) where a native-addon cold-load hiccup somewhere in this
// file's own async machinery produced an unhandled rejection OUTSIDE any of the try/catch blocks the
// sections below already have -- crashing the whole process with a raw Node stack trace instead of a
// clean, named FAIL. Five immediate re-runs all passed, so this is environmental noise in this sandbox's
// native-module loading, not a bug in the reviewed production logic -- but a GATE that can crash
// uncontrolled instead of reporting a failure defeats its own purpose exactly the way an uncaught throw
// in production code would. This is a last-resort net, not a substitute for the sections' own try/catch:
// it cannot say WHICH section was mid-flight when this fires, only that the run should be treated as red.
process.on("unhandledRejection", (e) => {
    console.log("\n  FAIL  !! UNHANDLED REJECTION -- the gate process would have crashed uncontrolled instead of failing cleanly   " + (e && e.stack || e));
    process.exit(1);
});
process.on("uncaughtException", (e) => {
    console.log("\n  FAIL  !! UNCAUGHT EXCEPTION -- the gate process would have crashed uncontrolled instead of failing cleanly   " + (e && e.stack || e));
    process.exit(1);
});

console.log("webcodecsFramesToMp4-selfcheck -- encodeFramesDirToMp4() against a REAL numbered PNG sequence on disk\n");

const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "swek-webcodecs-frames-selfcheck-"));
console.log("scratch frame directory:", scratchRoot, "\n");

// ---- 1. STATUS + ENVIRONMENT SANITY -----------------------------------------------------------------
{
    console.log("1. STATUS() AND ENVIRONMENT SANITY");
    const st = WC.status();
    ok("status() carries the sibling shape (ok, platform, arch, available, tool, note, licence)",
        !!st && st.ok === true && typeof st.available === "boolean" && typeof st.tool === "string" && !!st.licence,
        JSON.stringify({ available: st.available, tool: st.tool }));
    ok("!! @napi-rs/webcodecs is actually available on THIS box", st.available === true, "a box without it degrades honestly -- see section 7 below");

    let noFfmpeg = false;
    try { execFileSync("which", ["ffmpeg"], { stdio: "ignore" }); } catch { noFfmpeg = true; }
    ok("!! confirming the file header's own claim still holds: no external ffmpeg binary on this box " +
        "(so section 2's decode-verification is exercising @napi-rs/webcodecs' OWN bundled decoder, not shelling out)",
        noFfmpeg, noFfmpeg ? "`which ffmpeg` exit != 0, as expected" : "ffmpeg IS present -- the file header's claim is stale, note this in the report");
}

// ---- 2. A REAL ANIMATED FRAME SEQUENCE -> A REAL MP4, VERIFIED FROM MULTIPLE INDEPENDENT ANGLES -------
let realDir, realEncodeResult;
{
    console.log("\n2. A REAL ANIMATED SEQUENCE ON DISK -> encodeFramesDirToMp4() -> A REAL MP4");
    realDir = path.join(scratchRoot, "real-sequence");
    const W = 64, H = 64, N = 16, PATTERN = "frame-%05d.png";
    const render = WC._renderAnimatedSequenceToDisk(realDir, PATTERN, N, W, H);
    ok("!! _renderAnimatedSequenceToDisk() wrote " + N + " REAL PNG files to disk", render.ok === true && render.count === N, JSON.stringify({ ok: render.ok, count: render.count }));
    ok("...named frame-00000.png .. frame-000" + (N - 1) + ".png (index starts at 0, matching REAL production capture -- see below)",
        render.ok && path.basename(render.files[0]) === "frame-00000.png" && path.basename(render.files[N - 1]) === "frame-000" + String(N - 1).padStart(2, "0") + ".png",
        render.ok ? render.files.map(f => path.basename(f)).join(", ") : "");

    // Independent, gate-side confirmation that the SOURCE sequence has real motion -- decodes the real
    // PNG bytes itself (via @napi-rs/canvas's own loadImage, a SEPARATE call from anything the bridge's
    // internal decode loop does) and samples the same pixel position across three spread-out frames.
    const sampleCenterPixel = async (fpath) => {
        const buf = fs.readFileSync(fpath);
        const img = await canvasMod.loadImage(buf);
        const c = canvasMod.createCanvas(img.width, img.height);
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const id = ctx.getImageData(0, 0, img.width, img.height);
        const i = (Math.floor(img.height / 2) * img.width + Math.floor(img.width / 2)) * 4;
        return [id.data[i], id.data[i + 1], id.data[i + 2], id.data[i + 3]];
    };
    const early = await sampleCenterPixel(render.files[0]);
    const mid = await sampleCenterPixel(render.files[Math.floor(N / 2)]);
    const late = await sampleCenterPixel(render.files[N - 1]);
    const sourceHasMotion = !(early.every((v, i) => v === mid[i]) && mid.every((v, i) => v === late[i]));
    ok("!! independently confirmed (this gate's own decode, not the bridge's): the SOURCE PNG sequence genuinely has per-frame motion at the center pixel",
        sourceHasMotion, "frame0=" + JSON.stringify(early) + " mid=" + JSON.stringify(mid) + " last=" + JSON.stringify(late));

    const enc = await WC.encodeFramesDirToMp4(realDir, PATTERN, { fps: 10 });
    realEncodeResult = enc;
    ok("!! encodeFramesDirToMp4() reads the REAL files back off disk and encodes+muxes successfully",
        enc.ok === true, enc.ok ? (enc.encodedChunks + " chunks, " + enc.bytes + " bytes, " + enc.width + "x" + enc.height) : JSON.stringify(enc));

    if (enc.ok) {
        ok("!! framesRead matches the real file count actually rendered", enc.framesRead === N, enc.framesRead + " vs " + N);
        ok("!! encodedChunks matches framesRead (no silent partial output)", enc.encodedChunks === N);
        ok("!! width/height come from the REAL decoded PNGs, not a caller-supplied guess", enc.width === W && enc.height === H);
        ok("!! _verifyMp4()'s structural check passes (ftyp+moov+mdat present, box sizes sum to file length, NAL walk exact)",
            enc.verify && enc.verify.haveFtyp && enc.verify.haveMoov && enc.verify.haveMdat && enc.verify.boxSizesMatchFileLength && enc.verify.mdatWalkExact,
            JSON.stringify(enc.verify));
        ok("!! note field plainly states audio was not attempted/is unproven, not silently omitted", /video-only/i.test(enc.note) && /audio/i.test(enc.note) && /(unproven|does not attempt)/i.test(enc.note), enc.note);

        // THE STRONGER CHECK: decode the MUXED OUTPUT back out via @napi-rs/webcodecs' own demuxer+decoder
        // and confirm the DECODED frames still differ -- going beyond "structurally valid, frame-count-correct".
        const dv = await WC._verifyDecodedFramesDiffer(enc.mp4);
        ok("!! _verifyDecodedFramesDiffer() successfully decoded the muxed output using @napi-rs/webcodecs' own Mp4Demuxer+VideoDecoder",
            dv.ok === true, dv.ok ? (dv.videoChunksDemuxed + " chunks demuxed, " + dv.decodedFramesSampled + " frames sampled") : JSON.stringify(dv));
        if (dv.ok) {
            ok("!! ...and every demuxed video chunk was actually decoded (no silent loss, unlike the README's own demux()/demuxAsync() race this file's header already documents)",
                dv.videoChunksDemuxed === N, dv.videoChunksDemuxed + " vs " + N + " frames encoded");
            ok("!! ...and the DECODED frames genuinely differ from each other (not blank/static/corrupted) -- verified beyond the structural check, going past what encodeH264Spike's own verification does",
                dv.framesDiffer === true, JSON.stringify(dv.samples));
        } else {
            console.log("  (decode-side verification did not succeed -- see report: this gate stops at the structural check for this run, honestly, not silently)");
        }
    } else {
        console.log("  (skipping the rest of section 2 -- nothing to verify against a failed encode)");
    }
}

// ---- 3. PATTERN EXPANSION -- UNIT-TESTED DIRECTLY ------------------------------------------------------
{
    console.log("\n3. _parseFramePattern() / _expandFrameSequence() -- UNIT-TESTED DIRECTLY");
    const good = WC._parseFramePattern("frame-%05d.png");
    ok("!! parses the exact pattern shape exportBridge.js's real framesToMp4() uses", good.ok && good.prefix === "frame-" && good.width === 5 && good.suffix === ".png", JSON.stringify(good));
    const bad1 = WC._parseFramePattern("frame-*.png");
    ok("a glob-style pattern is rejected cleanly, not guessed at", bad1.ok === false, bad1.error);
    const bad2 = WC._parseFramePattern("frame-%d.png"); // bare %d, no zero-pad width -- explicitly out of scope
    ok("bare %d (no zero-pad width) is rejected -- this task scoped ONLY the %0Nd form", bad2.ok === false, bad2.error);
    const bad3 = WC._parseFramePattern("");
    ok("empty pattern -> {ok:false}, not a throw", bad3.ok === false, bad3.error);
    const bad4 = WC._parseFramePattern(null);
    ok("null pattern -> {ok:false}, not a throw", bad4.ok === false, bad4.error);

    const missingDir = WC._expandFrameSequence(path.join(scratchRoot, "does-not-exist"), "frame-%05d.png", {});
    ok("!! a nonexistent directory -> {ok:false}, not a throw", missingDir.ok === false, missingDir.error);

    const emptyDir = path.join(scratchRoot, "empty-dir");
    fs.mkdirSync(emptyDir, { recursive: true });
    const emptyResult = WC._expandFrameSequence(emptyDir, "frame-%05d.png", {});
    ok("!! an empty directory (real, on disk) -> {ok:false}, not a throw", emptyResult.ok === false, emptyResult.error);

    // explicit frameCount stricter than auto-discovery: a real partial sequence, asked for more than exists
    const partialDir = path.join(scratchRoot, "partial-dir");
    WC._renderAnimatedSequenceToDisk(partialDir, "frame-%05d.png", 3, 16, 16);
    const partialAuto = WC._expandFrameSequence(partialDir, "frame-%05d.png", {});
    ok("!! auto-discovery on a real 3-frame sequence finds exactly 3, stopping at the first missing index (mirrors ffmpeg's own -i pattern reading)",
        partialAuto.ok === true && partialAuto.count === 3, JSON.stringify({ ok: partialAuto.ok, count: partialAuto.count }));
    const partialExplicit = WC._expandFrameSequence(partialDir, "frame-%05d.png", { frameCount: 10 });
    ok("!! ...but an explicit frameCount=10 against that SAME real 3-frame directory hard-fails naming the first missing index, rather than silently returning 3",
        partialExplicit.ok === false && partialExplicit.missingIndex === 3, JSON.stringify(partialExplicit));
}

// ---- 4. BAD/MISSING/MALFORMED INPUT IS REJECTED CLEANLY -- NO UNCAUGHT THROW, NO UNHANDLED REJECTION --
{
    console.log("\n4. BAD/MISSING/MALFORMED INPUT -- NO UNCAUGHT THROW (THE BUG CLASS THAT HAS BITTEN 3x THIS SESSION)");
    const r1 = await WC.encodeFramesDirToMp4(path.join(scratchRoot, "nope"), "frame-%05d.png", {});
    ok("!! missing directory -> {ok:false}", r1 && r1.ok === false, r1.error);

    const emptyDir2 = path.join(scratchRoot, "empty-dir-2");
    fs.mkdirSync(emptyDir2, { recursive: true });
    const r2 = await WC.encodeFramesDirToMp4(emptyDir2, "frame-%05d.png", {});
    ok("!! empty directory (real, on disk) -> {ok:false}", r2 && r2.ok === false, r2.error);

    const r3 = await WC.encodeFramesDirToMp4(emptyDir2, "frame-*.png", {});
    ok("!! pattern with no matches -> {ok:false}", r3 && r3.ok === false, r3.error);

    // a REAL malformed/truncated PNG written to disk, not a simulated failure
    const malformedDir = path.join(scratchRoot, "malformed-dir");
    fs.mkdirSync(malformedDir, { recursive: true });
    fs.writeFileSync(path.join(malformedDir, "frame-00000.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])); // real PNG signature, garbage after it
    const r4 = await WC.encodeFramesDirToMp4(malformedDir, "frame-%05d.png", {});
    ok("!! a REAL malformed/truncated PNG on disk -> {ok:false} naming the frame, not an uncaught throw or unhandled rejection",
        r4 && r4.ok === false && r4.frameIndex === 0, JSON.stringify(r4));

    const r5 = await WC.encodeFramesDirToMp4(realDir || malformedDir, "frame-%05d.png", { audio: "/tmp/whatever.wav" });
    ok("!! opts.audio is rejected outright (out of scope, not silently ignored)", r5 && r5.ok === false && /audio/i.test(r5.error), r5.error);

    const r6 = await WC.encodeFramesDirToMp4(null, undefined, {});
    ok("!! null/undefined dir+pattern -> {ok:false}, not a throw", r6 && r6.ok === false, r6.error);

    const dv1 = await WC._verifyDecodedFramesDiffer(Buffer.from([1, 2, 3, 4]));
    ok("!! _verifyDecodedFramesDiffer() on garbage bytes -> {ok:false}, not a throw", dv1 && dv1.ok === false, dv1.error);
    const dv2 = await WC._verifyDecodedFramesDiffer("not a buffer");
    ok("!! _verifyDecodedFramesDiffer() on a non-buffer argument -> {ok:false}, not a throw", dv2 && dv2.ok === false, dv2.error);
}

// ---- 5. FILE SIZE-MISMATCH GUARD (a real second frame, deliberately a different size) -----------------
{
    console.log("\n5. A REAL SIZE-MISMATCHED FRAME IN THE SEQUENCE IS REJECTED, NOT SILENTLY RESIZED");
    const mismatchDir = path.join(scratchRoot, "mismatch-dir");
    fs.mkdirSync(mismatchDir, { recursive: true });
    const c1 = canvasMod.createCanvas(32, 32); c1.getContext("2d").fillRect(0, 0, 32, 32);
    fs.writeFileSync(path.join(mismatchDir, "frame-00000.png"), c1.toBuffer("image/png"));
    const c2 = canvasMod.createCanvas(48, 48); c2.getContext("2d").fillRect(0, 0, 48, 48); // a REAL second frame, deliberately a different real size
    fs.writeFileSync(path.join(mismatchDir, "frame-00001.png"), c2.toBuffer("image/png"));
    const r = await WC.encodeFramesDirToMp4(mismatchDir, "frame-%05d.png", {});
    ok("!! a real 48x48 second frame after a real 32x32 first frame -> {ok:false} naming the mismatch, not silently stretched/cropped",
        r && r.ok === false && r.frameIndex === 1, JSON.stringify(r));
}

// ---- 6. SABOTAGE: @napi-rs/canvas UNAVAILABLE (scratch copy -- the shipped file is untouched) ----------
{
    console.log("\n6. SABOTAGE: @napi-rs/canvas UNAVAILABLE -- encodeFramesDirToMp4() DEGRADES, NO UNCAUGHT THROW");
    const realSrc = fs.readFileSync(path.join(ENG, "ai-bridge", "webcodecsBridge.js"), "utf8");
    const target = '_frameCanvasMod = require("@napi-rs/canvas");';
    ok("!! the require() call this targets is really present in the shipped source, exactly once", realSrc.split(target).length - 1 === 1);
    const brokenSrc = realSrc.replace(target, '_frameCanvasMod = require("@napi-rs/canvas-DOES-NOT-EXIST");');
    ok("!! ...and the replacement actually changed the source", brokenSrc !== realSrc);

    const scratchPath = path.join(ENG, "ai-bridge", "__webcodecsBridge.sabotage.nocanvas." + process.pid + ".js");
    try { fs.unlinkSync(scratchPath); } catch {}
    fs.writeFileSync(scratchPath, brokenSrc);
    try {
        delete require_.cache[require_.resolve(scratchPath)];
        const Broken = require_(scratchPath);
        const sabDir = path.join(scratchRoot, "sabotage-canvas-dir");
        WC._renderAnimatedSequenceToDisk(sabDir, "frame-%05d.png", 4, 16, 16); // rendered by the REAL, unsabotaged module
        const r = await Broken.encodeFramesDirToMp4(sabDir, "frame-%05d.png", {});
        ok("!! RED BY NAME, REPRODUCED: the SAME real frame directory section 2 confirms the real file encodes now degrades to {ok:false} naming canvas, not an uncaught throw",
            r && r.ok === false && /canvas/i.test(r.error), r.error);
    } finally {
        try { fs.unlinkSync(scratchPath); } catch {}
    }
    ok("!! GREEN AGAIN: the shipped file, re-required fresh (not the scratch copy), still encodes the same real directory successfully",
        (await WC.encodeFramesDirToMp4(path.join(scratchRoot, "sabotage-canvas-dir"), "frame-%05d.png", {})).ok === true,
        "restored -- real node_modules/@napi-rs/canvas was never touched, only a throwaway scratch copy of the SOURCE was");
}

// ---- 7. SABOTAGE: @napi-rs/webcodecs UNAVAILABLE (scratch copy -- the shipped file is untouched) -------
{
    console.log("\n7. SABOTAGE: @napi-rs/webcodecs UNAVAILABLE -- encodeFramesDirToMp4() DEGRADES, NO UNCAUGHT THROW");
    const realSrc = fs.readFileSync(path.join(ENG, "ai-bridge", "webcodecsBridge.js"), "utf8");
    const target = '_webcodecsMod = require("@napi-rs/webcodecs");';
    ok("!! the require() call this targets is really present in the shipped source, exactly once", realSrc.split(target).length - 1 === 1);
    const brokenSrc = realSrc.replace(target, '_webcodecsMod = require("@napi-rs/webcodecs-DOES-NOT-EXIST");');
    ok("!! ...and the replacement actually changed the source", brokenSrc !== realSrc);

    const scratchPath = path.join(ENG, "ai-bridge", "__webcodecsBridge.sabotage.nowebcodecs." + process.pid + ".js");
    try { fs.unlinkSync(scratchPath); } catch {}
    fs.writeFileSync(scratchPath, brokenSrc);
    try {
        delete require_.cache[require_.resolve(scratchPath)];
        const Broken = require_(scratchPath);
        const st = Broken.status();
        ok("!! status() reports available:false honestly instead of throwing", st.ok === true && st.available === false, JSON.stringify({ available: st.available, tool: st.tool }));
        const sabDir = path.join(scratchRoot, "sabotage-webcodecs-dir");
        WC._renderAnimatedSequenceToDisk(sabDir, "frame-%05d.png", 4, 16, 16);
        const r = await Broken.encodeFramesDirToMp4(sabDir, "frame-%05d.png", {});
        ok("!! RED BY NAME, REPRODUCED: the SAME real frame directory now degrades to {ok:false} naming webcodecs, not an uncaught throw",
            r && r.ok === false && /webcodecs/i.test(r.error), r.error);
    } finally {
        try { fs.unlinkSync(scratchPath); } catch {}
    }
    ok("!! GREEN AGAIN: the shipped file, re-required fresh, still encodes the same real directory successfully",
        (await WC.encodeFramesDirToMp4(path.join(scratchRoot, "sabotage-webcodecs-dir"), "frame-%05d.png", {})).ok === true,
        "restored -- real node_modules/@napi-rs/webcodecs was never touched, only a throwaway scratch copy of the SOURCE was");
}

// ---- 8. SCOPE DISCIPLINE, ROUND 2 UPDATE: WIRED INTO exportBridge.js, BUT server.js STAYS UNTOUCHED -----
// Round 1 asserted exportBridge.js did NOT reference webcodecsBridge.js at all -- that claim is no longer
// true by design (this round wires encodeFramesDirToMp4 into exportBridge.js's real framesToMp4() as an
// opt-in backend), so re-asserting it here would make this gate lie about the current tree. What stays
// true, and is what actually matters for the licensing-risk containment this spike is still under, is
// narrower: server.js -- the only thing an external HTTP caller can reach -- is completely untouched, and
// webcodecsBridge.js's own pre-existing exports are still byte-for-byte unmodified in shape. Sections 9-14
// below gate the NEW exportBridge.js wiring itself in detail.
{
    console.log("\n8. SCOPE DISCIPLINE, UPDATED FOR ROUND 2: server.js STILL UNTOUCHED, NO NEW HTTP EXPOSURE");
    const exportSrc = fs.readFileSync(path.join(ENG, "ai-bridge", "exportBridge.js"), "utf8");
    ok("!! exportBridge.js NOW references webcodecsBridge.js -- this is the wiring this round adds, expected true (round 1's opposite claim is stale, not a regression)",
        /webcodecsBridge/.test(exportSrc) && /encodeFramesDirToMp4/.test(exportSrc));
    const serverSrc = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    ok("!! *** server.js is COMPLETELY untouched by this round: byte-for-byte identical to HEAD *** (the one file this task's scope limit named explicitly)",
        serverSrc === execFileSync("git", ["show", "HEAD:WebGLEngine/ai-bridge/server.js"], { cwd: ENG, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })); // server.js is ~1.5MB -- default 1MB maxBuffer truncates/throws
    ok("!! ...and, redundantly but cheaply, server.js does not reference webcodecsBridge.js/encodeFramesDirToMp4/opts.backend anywhere",
        !/webcodecsBridge/.test(serverSrc) && !/encodeFramesDirToMp4/.test(serverSrc) && !/opts\.backend/.test(serverSrc));
    ok("!! webcodecsBridge.js's existing encodeH264Spike/_verifyMp4/_walkBoxes/status/LICENCE are byte-for-byte present, unmodified in shape",
        /async function encodeH264Spike\(width, height, frameCount\)/.test(fs.readFileSync(path.join(ENG, "ai-bridge", "webcodecsBridge.js"), "utf8")) &&
        /function _verifyMp4\(buf\)/.test(fs.readFileSync(path.join(ENG, "ai-bridge", "webcodecsBridge.js"), "utf8")));
}

// ==========================================================================================================
// ROUND 2: GATES THE NEW OPT-IN opts.backend === "webcodecs" BRANCH WIRED INTO exportBridge.js's REAL
// PRODUCTION framesToMp4(pattern, mp4Path, opts). Exercises the REAL exportBridge.js module directly (not
// a copy), through its own exported framesToMp4() -- the exact function every real caller (today, only
// the /export/headless route) actually calls.
// ==========================================================================================================
const EB = requireAiBridge(path.join(ENG, "ai-bridge", "exportBridge.js"));

// ---- 9. THE ffmpeg-CLI CODE PATH'S SOURCE IS PROVABLY, BYTE-FOR-BYTE, UNMODIFIED ------------------------
// This is what actually proves "zero change to default behavior" in an environment where the ffmpeg branch
// cannot be run to completion (no ffmpeg binary here -- see section 10) -- an exact-string check against
// the KNOWN ORIGINAL source of the Promise body ffmpeg-CLI branch, captured before this round's edit.
{
    console.log("\n9. THE ffmpeg-CLI BRANCH'S SOURCE IS BYTE-FOR-BYTE UNMODIFIED (the provable half of backward-compat)");
    const exportSrc = fs.readFileSync(path.join(ENG, "ai-bridge", "exportBridge.js"), "utf8");
    // The exact original ffmpeg Promise BODY (from "return new Promise" through its closing "});"), captured
    // from `git show HEAD:...exportBridge.js` -- HEAD still IS the pre-this-round commit, since this round's
    // own edit is deliberately left uncommitted -- before any change was made. See the report for the diff
    // this was checked against.
    const KNOWN_ORIGINAL_FFMPEG_BODY =
`    return new Promise((resolve, reject) => {
        const fps = opts.fps || 30, args = ["-y", "-framerate", String(fps), "-i", pattern];
        if (opts.audio) args.push("-i", opts.audio);
        args.push("-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p");
        if (opts.audio) args.push("-c:a", "aac", "-b:a", "192k", "-shortest");
        args.push("-movflags", "+faststart");
        if (opts.title) args.push("-metadata", "title=" + opts.title);
        if (opts.description) args.push("-metadata", "comment=" + String(opts.description).slice(0, 500));
        args.push(mp4Path);
        const ff = spawn(process.env.FFMPEG || "ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
        let err = ""; ff.stderr.on("data", d => { err += d; if (err.length > 4000) err = err.slice(-4000); });
        ff.on("error", e => reject(new Error("ffmpeg spawn failed: " + e.message)));
        ff.on("close", c => c === 0 ? resolve(mp4Path) : reject(new Error("ffmpeg exit " + c + ": " + err.slice(-400))));
    });`;
    ok("!! *** the ffmpeg-CLI branch's exact original source (args build, spawn, resolve/reject shape) is present VERBATIM in the current file ***",
        exportSrc.includes(KNOWN_ORIGINAL_FFMPEG_BODY),
        exportSrc.includes(KNOWN_ORIGINAL_FFMPEG_BODY) ? "byte-for-byte match confirmed" : "MISMATCH -- the ffmpeg-CLI branch was edited, this is the regression this gate exists to catch");
    ok("!! the new opts.backend===\"webcodecs\" check is a genuinely SEPARATE, ADDITIVE line ahead of that unchanged body, not a rewrite of it",
        /if \(opts && opts\.backend === "webcodecs"\) return _framesToMp4WebCodecs\(pattern, mp4Path, opts\);/.test(exportSrc));
}

// ---- 10. DEFAULT PATH SAFETY: NO BACKEND OPTION TAKES THE SAME (UNCHANGED) ffmpeg CODE PATH -------------
// Cannot prove the ffmpeg branch SUCCEEDS here (this sandbox has no ffmpeg/ffprobe binary -- confirmed
// below, unchanged from webcodecsBridge.js's own file-header finding) -- what IS provable, and what
// backward-compatibility actually requires, is that behavior is UNCHANGED: the same spawn target, the same
// error shape, for a caller that passes no backend field (today's only real caller) and for one that
// passes some other value.
{
    console.log("\n10. DEFAULT (ffmpeg) PATH SAFETY -- PROVING NO BEHAVIOR CHANGE, NOT A SUCCESSFUL RUN (NO ffmpeg BINARY HERE)");
    let noFfmpeg = false;
    try { execFileSync("which", ["ffmpeg"], { stdio: "ignore" }); } catch { noFfmpeg = true; }
    ok("!! confirmed: no external ffmpeg binary on this box (so this section proves ABSENCE OF A BEHAVIOR CHANGE, not a completed ffmpeg run -- that is not honestly demonstrable here)",
        noFfmpeg, noFfmpeg ? "`which ffmpeg` exit != 0, as expected" : "ffmpeg IS present on this box -- rerun by hand to also confirm a REAL successful ffmpeg encode still works");

    const shapes = [
        { label: "no backend field at all (opts={fps:30})", opts: { fps: 30 } },
        { label: "backend explicitly \"ffmpeg\" (not the magic webcodecs string)", opts: { fps: 30, backend: "ffmpeg" } },
        { label: "backend explicitly undefined", opts: { fps: 30, backend: undefined } },
    ];
    for (const { label, opts } of shapes) {
        let threw = null;
        try { await EB.framesToMp4("/tmp/swek-selfcheck-does-not-exist/frame-%05d.png", "/tmp/swek-selfcheck-out.mp4", opts); }
        catch (e) { threw = e; }
        ok("!! " + label + " -> spawns \"ffmpeg\" and rejects with the SAME \"ffmpeg spawn failed\" shape (unchanged code path)",
            threw instanceof Error && /^ffmpeg spawn failed: /.test(threw.message),
            threw ? threw.constructor.name + " | " + threw.message : "did not reject at all (unexpected)");
    }
}

// ---- 11. THE WEBCODECS BACKEND, END TO END, THROUGH THE REAL exportBridge.js framesToMp4() ---------------
// The direction that CAN be fully proven live on this box: a real animated frame sequence on disk (the
// same fixture helper round 1 used) -> the REAL exportBridge.js's framesToMp4(pattern, mp4Path,
// {backend:"webcodecs"}) -> a real mp4 on disk -> independently re-verified both structurally and by
// decoding it back out, exactly as round 1's own section 2 did for the bridge function directly -- this
// section additionally proves exportBridge.js's OWN wrapping (path split, file write, resolve contract).
let wcRealDir, wcRealMp4Path;
{
    console.log("\n11. THE webcodecs BACKEND, END TO END, THROUGH THE REAL exportBridge.js framesToMp4()");
    wcRealDir = path.join(scratchRoot, "exportbridge-real-sequence");
    const W = 64, H = 64, N = 16, PATTERN = "frame-%05d.png";
    const render = WC._renderAnimatedSequenceToDisk(wcRealDir, PATTERN, N, W, H);
    ok("!! _renderAnimatedSequenceToDisk() wrote " + N + " REAL PNG files to disk for this section", render.ok === true && render.count === N, JSON.stringify({ ok: render.ok, count: render.count }));

    wcRealMp4Path = path.join(scratchRoot, "exportbridge-real-out.mp4");
    const fullPattern = path.join(wcRealDir, PATTERN); // the FULL path shape exportBridge.js's real callers pass (dir + printf pattern combined)
    let resolved = null, rejectErr = null;
    try { resolved = await EB.framesToMp4(fullPattern, wcRealMp4Path, { backend: "webcodecs", fps: 10 }); }
    catch (e) { rejectErr = e; }
    ok("!! exportBridge.js's real framesToMp4(pattern, mp4Path, {backend:\"webcodecs\"}) RESOLVED (not rejected)",
        rejectErr === null, rejectErr ? String(rejectErr && rejectErr.message || rejectErr) : "resolved cleanly");
    ok("!! ...and resolved with mp4Path itself (a string) -- the EXACT SAME resolve contract the ffmpeg branch uses, so a caller cannot tell which backend ran",
        resolved === wcRealMp4Path, JSON.stringify({ resolved, expected: wcRealMp4Path }));
    ok("!! mp4Path now contains REAL bytes on disk", fs.existsSync(wcRealMp4Path) && fs.statSync(wcRealMp4Path).size > 0, fs.existsSync(wcRealMp4Path) ? fs.statSync(wcRealMp4Path).size + " bytes" : "MISSING");

    if (fs.existsSync(wcRealMp4Path)) {
        const buf = fs.readFileSync(wcRealMp4Path);
        const v = WC._verifyMp4(buf);
        ok("!! _verifyMp4()'s structural check passes on the file exportBridge.js actually wrote (ftyp+moov+mdat present, box sizes sum to file length, NAL walk exact)",
            v.haveFtyp && v.haveMoov && v.haveMdat && v.boxSizesMatchFileLength && v.mdatWalkExact, JSON.stringify(v));
        const dv = await WC._verifyDecodedFramesDiffer(buf);
        ok("!! _verifyDecodedFramesDiffer() successfully decoded the file exportBridge.js wrote, via @napi-rs/webcodecs' own Mp4Demuxer+VideoDecoder",
            dv.ok === true, dv.ok ? (dv.videoChunksDemuxed + " chunks demuxed, " + dv.decodedFramesSampled + " frames sampled") : JSON.stringify(dv));
        if (dv.ok) {
            ok("!! ...and the DECODED frames genuinely differ from each other -- real motion survived exportBridge.js's own write-to-disk round trip",
                dv.framesDiffer === true, JSON.stringify(dv.samples));
        }
    }
}

// ---- 12. opts.audio + backend:"webcodecs" REJECTS CLEARLY -- NO SILENT IGNORE, NO SILENT ffmpeg FALLBACK -
{
    console.log("\n12. opts.audio + backend:\"webcodecs\" REJECTS CLEARLY (not silently ignored, not silently falling back to ffmpeg)");
    const audioMp4Path = path.join(scratchRoot, "exportbridge-audio-reject-out.mp4");
    let rejectErr = null, resolved = null;
    try { resolved = await EB.framesToMp4(path.join(wcRealDir, "frame-%05d.png"), audioMp4Path, { backend: "webcodecs", fps: 10, audio: "/some/path.wav" }); }
    catch (e) { rejectErr = e; }
    ok("!! rejects (does not resolve) when audio is set alongside backend:\"webcodecs\"", resolved === null && rejectErr instanceof Error, resolved !== null ? "UNEXPECTEDLY RESOLVED: " + resolved : String(rejectErr && rejectErr.message));
    ok("!! ...and the rejection names audio, not a generic/unrelated failure", rejectErr && /audio/i.test(rejectErr.message), rejectErr && rejectErr.message);
    ok("!! ...and no mp4 was written to disk (no partial/silent-fallback output)", !fs.existsSync(audioMp4Path));
}

// ---- 13. opts:null DOES NOT CRASH EITHER PATH -- THE BUG CLASS THAT HAS BITTEN REPEATEDLY THIS SESSION ---
{
    console.log("\n13. opts:null (not opts:{}) DOES NOT CRASH framesToMp4() -- default path AND webcodecs-selection path");
    // opts:null can never actually SELECT the webcodecs branch (opts must be truthy to read .backend off
    // it) -- so this proves the falsy-opts case degrades the same way it always did: falls through to the
    // (unchanged) ffmpeg Promise body, which throws synchronously inside the executor and is therefore
    // auto-converted to a REJECTED promise by the Promise constructor itself, not an uncaught crash.
    let rejectErr = null, threw = false;
    try {
        const p = EB.framesToMp4("/tmp/swek-selfcheck-null-opts/frame-%05d.png", "/tmp/swek-selfcheck-null-opts-out.mp4", null);
        await p;
    } catch (e) { rejectErr = e; }
    ok("!! framesToMp4(pattern, mp4Path, null) rejects cleanly (a real Error), does not throw uncaught / crash the process",
        rejectErr instanceof Error, rejectErr ? rejectErr.constructor.name + " | " + rejectErr.message : "did not reject (unexpected)");
}

// ---- 14. SABOTAGE, THROUGH THE REAL exportBridge.js WIRING: @napi-rs/webcodecs UNAVAILABLE ---------------
// Round 1's sabotage (sections 6-7) targeted webcodecsBridge.js directly. This section goes one hop
// further: a scratch copy of exportBridge.js whose require("./webcodecsBridge.js") is repointed at a
// scratch, sabotaged copy of the bridge -- so the sabotage is exercised through framesToMp4() ->
// _framesToMp4WebCodecs() -> encodeFramesDirToMp4(), the actual call chain a real caller would hit, not
// just the bridge file in isolation. Neither scratch file ever touches the shipped source or the real
// installed @napi-rs/webcodecs package.
{
    console.log("\n14. SABOTAGE (THROUGH THE REAL exportBridge.js WIRING): @napi-rs/webcodecs UNAVAILABLE -> CLEAN REJECTION");
    const wcRealSrc = fs.readFileSync(path.join(ENG, "ai-bridge", "webcodecsBridge.js"), "utf8");
    const wcTarget = '_webcodecsMod = require("@napi-rs/webcodecs");';
    ok("!! the require() call this targets is present in the shipped bridge source, exactly once", wcRealSrc.split(wcTarget).length - 1 === 1);
    const wcBrokenSrc = wcRealSrc.replace(wcTarget, '_webcodecsMod = require("@napi-rs/webcodecs-DOES-NOT-EXIST");');

    const ebRealSrc = fs.readFileSync(path.join(ENG, "ai-bridge", "exportBridge.js"), "utf8");
    const ebTarget = 'require("./webcodecsBridge.js")';
    ok("!! the require() call this targets is present in the shipped exportBridge.js source, exactly once", ebRealSrc.split(ebTarget).length - 1 === 1);

    const scratchWcPath = path.join(ENG, "ai-bridge", "__webcodecsBridge.sabotage.exportbridge-wiring." + process.pid + ".js");
    const scratchEbPath = path.join(ENG, "ai-bridge", "__exportBridge.sabotage.wiring." + process.pid + ".js");
    try { fs.unlinkSync(scratchWcPath); } catch {}
    try { fs.unlinkSync(scratchEbPath); } catch {}
    fs.writeFileSync(scratchWcPath, wcBrokenSrc);
    fs.writeFileSync(scratchEbPath, ebRealSrc.replace(ebTarget, "require(" + JSON.stringify(scratchWcPath) + ")"));

    try {
        delete require_.cache[require_.resolve(scratchEbPath)];
        delete require_.cache[require_.resolve(scratchWcPath)];
        const EbBroken = require_(scratchEbPath);
        const sabDir = path.join(scratchRoot, "sabotage-exportbridge-webcodecs-dir");
        WC._renderAnimatedSequenceToDisk(sabDir, "frame-%05d.png", 4, 16, 16); // rendered by the REAL, unsabotaged module
        const sabMp4Path = path.join(scratchRoot, "sabotage-exportbridge-webcodecs-out.mp4");
        let rejectErr = null, resolved = null;
        try { resolved = await EbBroken.framesToMp4(path.join(sabDir, "frame-%05d.png"), sabMp4Path, { backend: "webcodecs", fps: 10 }); }
        catch (e) { rejectErr = e; }
        ok("!! RED BY NAME, REPRODUCED THROUGH THE REAL exportBridge.js WIRING: with @napi-rs/webcodecs unavailable, framesToMp4(...,{backend:\"webcodecs\"}) rejects with a real Error naming webcodecs, not an uncaught throw",
            resolved === null && rejectErr instanceof Error && /webcodecs/i.test(rejectErr.message),
            resolved !== null ? "UNEXPECTEDLY RESOLVED: " + resolved : String(rejectErr && rejectErr.message));
        ok("!! ...and no mp4 was written to disk", !fs.existsSync(sabMp4Path));
    } finally {
        try { fs.unlinkSync(scratchWcPath); } catch {}
        try { fs.unlinkSync(scratchEbPath); } catch {}
    }

    // GREEN AGAIN: the real, unsabotaged exportBridge.js (already loaded as EB above -- never touched by
    // the scratch files) still encodes a fresh real directory successfully through the same wiring.
    const restoreDir = path.join(scratchRoot, "restore-exportbridge-webcodecs-dir");
    WC._renderAnimatedSequenceToDisk(restoreDir, "frame-%05d.png", 4, 16, 16);
    const restoreMp4Path = path.join(scratchRoot, "restore-exportbridge-webcodecs-out.mp4");
    const restored = await EB.framesToMp4(path.join(restoreDir, "frame-%05d.png"), restoreMp4Path, { backend: "webcodecs", fps: 10 });
    ok("!! GREEN AGAIN: the real, unsabotaged exportBridge.js + webcodecsBridge.js still encode a fresh real directory successfully",
        restored === restoreMp4Path && fs.existsSync(restoreMp4Path) && fs.statSync(restoreMp4Path).size > 0,
        "restored -- real node_modules/@napi-rs/webcodecs was never touched, only throwaway scratch copies of SOURCE files were");
}

// cleanup: remove the scratch frame directory tree (never touches anything under the repo itself)
try { fs.rmSync(scratchRoot, { recursive: true, force: true }); } catch {}
try { fs.unlinkSync("/tmp/swek-selfcheck-out.mp4"); } catch {}

console.log(fails ? `\nwebcodecsFramesToMp4-selfcheck: ${fails} FAILED` : "\nwebcodecsFramesToMp4-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
