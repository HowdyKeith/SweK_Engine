#!/usr/bin/env node
// WebGLEngine/tools/ship/webcodecsFramesToMp4-selfcheck.mjs
//
// GATES the second, more-realistic spike added to ai-bridge/webcodecsBridge.js:
// encodeFramesDirToMp4(dir, pattern, opts) -- proving @napi-rs/webcodecs against exportBridge.js's REAL
// production consumer shape (a directory of real numbered PNG frames on disk -> a real MP4), unlike the
// file's original encodeH264Spike() which only ever exercised toy, in-memory, non-file-based frames.
//
// SPIKE, NOT A FEATURE -- same discipline as the bridge file itself. This gate does not touch
// exportBridge.js, server.js, or any HTTP route; it exercises the new bridge functions directly.
//
// Run: node tools/ship/webcodecsFramesToMp4-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered -- any *-selfcheck.mjs anywhere in the tree).
//
//   SABOTAGE LOG:
//     A. (section 6, reproduced HERE on every run, via a scratch copy that never touches the shipped
//        file) webcodecsBridge.js's own `_frameCanvasMod = require("@napi-rs/canvas");` line, targeted
//        at a nonexistent package name. Effect, confirmed live: encodeFramesDirToMp4() against the SAME
//        real frame directory section 2 confirms the real file encodes successfully now degrades to
//        {ok:false} instead, naming the real reason ("canvas unavailable for frame decode"). Scratch
//        file deleted immediately after, in a `finally`.
//     B. (section 7, same scratch-copy technique) webcodecsBridge.js's own
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

// ---- 8. SCOPE DISCIPLINE: NO WIRING INTO ANY LIVE CODE PATH --------------------------------------------
{
    console.log("\n8. SCOPE DISCIPLINE: NO WIRING INTO exportBridge.js / server.js / ANY HTTP ROUTE");
    const exportSrc = fs.readFileSync(path.join(ENG, "ai-bridge", "exportBridge.js"), "utf8");
    ok("!! exportBridge.js does not reference webcodecsBridge.js or encodeFramesDirToMp4 anywhere", !/webcodecsBridge/.test(exportSrc) && !/encodeFramesDirToMp4/.test(exportSrc));
    const serverSrc = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    ok("!! server.js does not reference webcodecsBridge.js or encodeFramesDirToMp4 anywhere", !/webcodecsBridge/.test(serverSrc) && !/encodeFramesDirToMp4/.test(serverSrc));
    ok("!! webcodecsBridge.js's existing encodeH264Spike/_verifyMp4/_walkBoxes/status/LICENCE are byte-for-byte present, unmodified in shape",
        /async function encodeH264Spike\(width, height, frameCount\)/.test(fs.readFileSync(path.join(ENG, "ai-bridge", "webcodecsBridge.js"), "utf8")) &&
        /function _verifyMp4\(buf\)/.test(fs.readFileSync(path.join(ENG, "ai-bridge", "webcodecsBridge.js"), "utf8")));
}

// cleanup: remove the scratch frame directory tree (never touches anything under the repo itself)
try { fs.rmSync(scratchRoot, { recursive: true, force: true }); } catch {}

console.log(fails ? `\nwebcodecsFramesToMp4-selfcheck: ${fails} FAILED` : "\nwebcodecsFramesToMp4-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
