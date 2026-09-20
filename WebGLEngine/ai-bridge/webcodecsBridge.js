// WebGLEngine/ai-bridge/webcodecsBridge.js -- v(spike)
//
// SPIKE, NOT A FEATURE. Same discipline as canvasBridge.js's and typeBridge.js's spikes for their
// respective @napi-rs packages: optionalDependency, lazily required, memoized singleton, and every
// claim below was independently re-verified by hand-parsing real output bytes in an isolated scratch
// directory BEFORE this file was written -- not trusted from the package's own README or return values.
//
// *** THE NAME TRAP THIS PACKAGE SITS IN, READ THIS BEFORE TOUCHING THE DEPENDENCY LIST. *** There
// are two unrelated npm packages that could be confused here:
//   - "webcodecs-node" (npm)       -- a DIFFERENT author (aptumfr), AGPL-3.0-only, deps on node-av/
//                                      node-webpmux/skia-canvas. NOT installed here, on purpose.
//   - "@napi-rs/webcodecs" (npm)   -- what this file actually requires. Brooooooklyn (same author as
//                                      the already-integrated @napi-rs/clipboard and @napi-rs/canvas),
//                                      MIT, zero declared npm deps, v1.4.1 as of this spike. Its GitHub
//                                      repo happens to ALSO be named "webcodecs-node" under Brooooooklyn's
//                                      account, which is the entire reason the name collision exists --
//                                      the repo name and the published package name differ. Confirmed
//                                      with `npm view @napi-rs/webcodecs` / `npm view webcodecs-node`
//                                      before installing anything.
//
// *** THE ENCODE+MUX PATH WORKS, HAND-VERIFIED END TO END. *** In an isolated scratch dir (Ubuntu
// 24.04 x86_64, Node 22), 20 synthesized RGBA frames were encoded with VideoEncoder (codec
// "avc1.42001f") and muxed with Mp4Muxer({fastStart:true}). Neither ffmpeg nor ffprobe exist on this
// box (`which ffmpeg ffprobe` -> exit 1, confirmed before writing this file), so there is no
// independent decoder available here -- verification instead hand-parsed the ISO BMFF box tree
// (ftyp/moov/trak/mdia/minf/stbl/stsd/avc1/avcC) and walked mdat as AVCC length-prefixed NAL units,
// the same "the header is fixed-shape and documented, no general parser needed" approach
// canvasBridge.js's _readPngHeader() took for PNG. Result: ftyp+moov+mdat all present, top-level box
// sizes summed to EXACTLY the file length, mdat's NAL-length-prefixed walk consumed EXACTLY the mdat
// payload with no overrun (21 NAL units for 20 encoded chunks -- one SEI NAL ahead of the IDR slice),
// and the muxed avcC's configurationVersion was 1 as the spec requires. That is a real, muxed,
// structurally-valid H.264-in-MP4 file, not merely "the library returned success".
//
// *** WHAT DID NOT MATCH THE README, STATED PLAINLY. *** The codec string's requested profile/level
// (the PP/LL bytes in "avc1.PPCCLL", e.g. 0x42/Baseline or 0x4d/Main or 0x64/High, tried explicitly
// across all three plus multiple level bytes) had NO EFFECT on the encoded bitstream on this box: every
// request, regardless of what was asked for, produced AVCProfileIndication=0x64 (High) /
// AVCLevelIndication=0x0d (Level 1.3) in the muxed avcC -- i.e. libx264's own defaults, not what
// VideoEncoder.configure({codec}) was told. The README's own Quick Start example uses
// "avc1.42001E // H.264 Baseline" as if that comment were accurate; on this box it is not. This
// matters if a caller ever needs a SPECIFIC H.264 profile for compatibility -- it does not block
// generic H.264-in-MP4 output, which is what this spike proves.
//
// *** A SEPARATE, DECODE-SIDE FOOTGUN FOUND WHILE SELF-CHECKING (not required by this spike's task,
// found because the self-check used the library's own demuxer/decoder as a secondary signal on top of
// the independent byte-level verification above). *** The README's own Mp4Demuxer example calls plain
// `demuxer.demux()` (no argument, not awaited) and treats it as if it synchronously ran every packet
// through its callbacks before the next line. On this box that silently under-delivered: only 3 of 20
// packets reached the decoder before `await decoder.flush()` returned, with NO error reported anywhere
// -- a real race, not a hypothetical one. Switching to `await demuxer.demuxAsync()` (documented as "the
// awaitable version of demux") fixed it completely: 20/20 packets demuxed, 20/20 frames decoded, zero
// decode errors. This is a decode-path finding, unrelated to the encode+mux path this spike wires up,
// but worth recording because it is exactly the kind of README-vs-actual-behavior gap this task asked
// to be reported "precisely, not papered over" -- and it would bite the next person who copy-pastes the
// README's demux() example expecting it to behave as documented.
//
// *** THE LICENSING FINDING THAT MATTERS MOST FOR A DOWNSTREAM REVIEW. *** The published npm package
// @napi-rs/webcodecs is MIT (confirmed via `npm view` and the LICENSE file it ships). But the platform
// binary it resolves to for this box, @napi-rs/webcodecs-linux-x64-gnu's
// webcodecs.linux-x64-gnu.node (67 MB), contains `strings`-visible evidence of a STATICALLY LINKED
// libx264: not just the name referenced, but x264's own internal runtime banner string verbatim
// ("x264 - core %d%s - H.264/MPEG-4 AVC codec - Copyright 2003-2025 - http://www.videolan.org/x264.html")
// plus dozens of x264-internal function/message strings (x264_8_ratecontrol_new,
// x264_encoder_invalidate_reference, "This build of x264 requires 8-bit input.", etc.) and a companion
// libx265 (H.265). x264's own license is GPL-2.0-or-later (dual-licensed; a commercial license exists
// separately from VideoLAN, but the default/OSS license is GPL). No LICENSE/NOTICE/THIRD-PARTY file for
// FFmpeg or x264 ships anywhere under node_modules/@napi-rs/webcodecs* -- the ONLY license file present
// is the wrapper package's own MIT LICENSE. Also found: an embedded ffmpeg sub-build configure line
// (`--prefix=.../ffmpeg-x86_64-unknown-linux-gnu --enable-static --disable-shared ... --enable-vp8
// --enable-vp9 --enable-vp9-highbitdepth`) that is libvpx's own internal configure invocation, not
// ffmpeg's top-level one -- ffmpeg's own top-level "configuration:" banner string (which would normally
// show --enable-gpl/--enable-libx264 explicitly) was NOT found via `strings` on this binary, so that
// specific flag combination is inferred from the embedded libx264 code and its GPL-only symbols being
// present and reachable, not read directly off a configure string. Net: this package trades one
// licensing question (the AGPL of the wrong "webcodecs-node") for a DIFFERENT one -- a GPL-licensed
// codec statically linked into an otherwise-MIT-labeled binary, with no accompanying notice file. This
// is exactly the kind of thing a licensing review needs to see BEFORE this spike is treated as a green
// light to depend on for real, and this file does not attempt to resolve that question -- it surfaces
// it, the same way sharpBridge.js surfaces apple/ml-sharp's research-only weights licence in its own
// status() rather than deciding the policy question itself.
//
// *** SIZE. *** The resolved linux-x64-gnu platform package is 67 MB (`du -sh`) for the single .node
// file -- roughly double @napi-rs/canvas's Skia binary (34 MB) in this same tree, because it bundles a
// full FFmpeg build (multiple codecs, demuxers/muxers, image decoders) rather than just a 2D
// rasterizer. Relevant to whether this is worth landing as an optionalDependency at all: adding ~67 MB
// per resolved platform for a spike whose only proven-needed capability so far is "H.264-in-MP4 out"
// is a real cost, not a footnote.
//
// *** WHAT THIS FILE DOES NOT DO. *** No wiring into exportBridge.js or server.js -- this is a
// standalone spike, exactly as scoped. encodeH264Spike() below is a minimal real exercise of the pipe
// (synthesize a few frames -> encode -> mux -> hand back the bytes plus independently-derived facts
// about them) -- see "SPIKE #2" further down for a second, more realistic exercise against real files
// on disk -- neither is a replacement for transcodeToMp4/framesToMp4.
"use strict";
const fs = require("fs");
const path = require("path");

// *** ADVERSARIAL-REVIEW FIX (same session, this task's own review pass). *** The file header above
// claimed the licensing finding was surfaced "the same way sharpBridge.js surfaces apple/ml-sharp's
// research-only weights licence" -- but that claim did not hold: sharpBridge.js's status() returns a
// machine-readable `licence: LICENCE` field every call, while this file's status() carried no license
// information at all, leaving the finding readable only by a human reading source comments. Fixed to
// actually match the precedent it claimed to follow, and marked `unresolved: true` rather than stating a
// settled policy the way sharpBridge.js's LICENCE.research_only does -- unlike ml-sharp's weights, no one
// has DECIDED whether this package's use is acceptable; this only records what was found (see the file
// header for the full evidence trail) so a gate or a human reading status() sees it without reading
// source.
const LICENCE = {
    package: "@napi-rs/webcodecs",
    declared: "MIT",
    unresolved: true,
    finding: "The compiled native binary appears (via `strings`: x264's own runtime banner text, dozens " +
             "of internal x264 function/message strings, and a companion libx265) to statically embed " +
             "libx264/libx265, GPL-2.0-or-later licensed, with no accompanying LICENSE/NOTICE/THIRD-PARTY " +
             "file anywhere under the resolved npm packages -- unlike this same tree's existing " +
             "ffmpeg-static dependency, which honestly self-declares \"license\": \"GPL-3.0-or-later\" and " +
             "ships a full verbatim GPLv3 LICENSE naming libx264 as a bundled component. Redistribution " +
             "risk for THIS repo's own shipped release zip is confirmed nil (packagerBridge.js's " +
             "SKIP_DIRS excludes node_modules from every release build) -- the open question is the " +
             "package's own license-metadata accuracy for anyone auditing ai-bridge's dependencies.",
    decision: "NOT MADE -- needs a human licensing call before this optionalDependency is treated as routine.",
};

let _webcodecsMod; // undefined = not yet tried, false = unavailable, module object = ready
function _webcodecs() {
    if (_webcodecsMod !== undefined) return _webcodecsMod;
    try { _webcodecsMod = require("@napi-rs/webcodecs"); }
    catch { _webcodecsMod = false; /* optional dep missing, or no prebuilt binary for this platform/arch/libc */ }
    return _webcodecsMod;
}

// Report whether the native module loaded, matching the shape canvasBridge.js's/typeBridge.js's
// status() already use so a caller checking "is the optional native path up" reads consistently --
// PLUS `licence`, unlike those two siblings, because this package's licensing question is open and
// unresolved rather than settled (see LICENCE above and the file header for the full evidence).
function status() {
    const mod = _webcodecs();
    return {
        ok: true,
        platform: process.platform,
        arch: process.arch,
        available: !!mod,
        tool: mod ? "@napi-rs/webcodecs" : "unavailable",
        note: mod ? "" : "optional dependency @napi-rs/webcodecs is not installed, or has no prebuilt native binary for " +
                         process.platform + "-" + process.arch + " -- npm install into ai-bridge/ to enable native H.264 encode/mux",
        licence: LICENCE,
    };
}

// Fixed-shape hand parsers over the MUXED OUTPUT, independent of anything the encoder/muxer claim about
// themselves -- same bar as canvasBridge.js's _readPngHeader(). ISO BMFF box header: ISO/IEC 14496-12
// §4.2 (4-byte big-endian size, 4-byte ASCII type). AVCDecoderConfigurationRecord: ISO/IEC 14496-15.
function _walkBoxes(buf, start, end) {
    const boxes = [];
    let off = start;
    while (off + 8 <= end) {
        let size = buf.readUInt32BE(off);
        const type = buf.slice(off + 4, off + 8).toString("ascii");
        let headerLen = 8;
        if (size === 1) {
            // *** ADVERSARIAL-REVIEW FIX (same session, this task's own review pass). *** The ISO BMFF
            // 64-bit "large size" sentinel means the NEXT 8 bytes (off+8..off+16) hold the real size --
            // but the loop's own guard above only ever checked off+8<=end (enough for the ordinary
            // 8-byte header), so a box using this sentinel near the end of a short/truncated buffer read
            // past `end` and threw an uncaught RangeError instead of being reported as malformed. Exactly
            // the bug class canvasBridge.js's own review found and fixed for _readPngHeader() -- reported
            // as malformed here rather than crashing, matching every other bounds failure in this loop.
            if (off + 16 > end) { boxes.push({ type, off, size, malformed: true }); break; }
            const hi = buf.readUInt32BE(off + 8), lo = buf.readUInt32BE(off + 12); size = hi * 2 ** 32 + lo; headerLen = 16;
        }
        else if (size === 0) size = end - off;
        if (size < headerLen || off + size > end) { boxes.push({ type, off, size, malformed: true }); break; }
        boxes.push({ type, off, size, headerLen });
        off += size;
    }
    return boxes;
}
function _findBox(buf, start, end, type) { for (const b of _walkBoxes(buf, start, end)) if (b.type === type) return b; return null; }

/**
 * Independently re-derive facts about a muxed MP4 straight from its bytes: top-level box presence and
 * whether their sizes sum to exactly the file length (a truncated/corrupt mux would not), and a
 * byte-exact walk of mdat as AVCC length-prefixed H.264 NAL units (a corrupt bitstream would overrun or
 * underrun). This is what proves the muxer produced a real, structurally valid file rather than merely
 * "did not throw" -- it does not decode pixels (no independent decoder -- ffmpeg/ffprobe -- exists on
 * this box; confirmed with `which ffmpeg ffprobe` before this file was written), but a container/NAL
 * structure that is provably self-consistent is a real, independent signal an uncaught exception is not.
 */
function _verifyMp4(buf) {
    const top = _walkBoxes(buf, 0, buf.length);
    const haveFtyp = top.some(b => b.type === "ftyp"), haveMoov = top.some(b => b.type === "moov"), haveMdat = top.some(b => b.type === "mdat");
    const sizeSum = top.reduce((s, b) => s + b.size, 0);
    const boxSizesMatchFileLength = sizeSum === buf.length;

    let nalUnits = 0, mdatWalkExact = false, mdatBytes = 0;
    const mdat = top.find(b => b.type === "mdat");
    if (mdat) {
        const p0 = mdat.off + mdat.headerLen, p1 = mdat.off + mdat.size;
        mdatBytes = p1 - p0;
        let off = p0, consumed = 0, ok = true;
        while (off + 4 <= p1) {
            const len = buf.readUInt32BE(off);
            if (len <= 0 || off + 4 + len > p1) { ok = false; break; }
            off += 4 + len; consumed += 4 + len; nalUnits++;
        }
        mdatWalkExact = ok && consumed === mdatBytes;
    }

    let avcC = null;
    if (haveMoov) {
        const moov = top.find(b => b.type === "moov");
        const trak = _findBox(buf, moov.off + moov.headerLen, moov.off + moov.size, "trak");
        const mdia = trak && _findBox(buf, trak.off + trak.headerLen, trak.off + trak.size, "mdia");
        const minf = mdia && _findBox(buf, mdia.off + mdia.headerLen, mdia.off + mdia.size, "minf");
        const stbl = minf && _findBox(buf, minf.off + minf.headerLen, minf.off + minf.size, "stbl");
        const stsd = stbl && _findBox(buf, stbl.off + stbl.headerLen, stbl.off + stbl.size, "stsd");
        const avc1 = stsd && _findBox(buf, stsd.off + stsd.headerLen + 8, stsd.off + stsd.size, "avc1"); // +8: version/flags(4)+entry_count(4)
        const avcCBox = avc1 && _findBox(buf, avc1.off + avc1.headerLen + 78, avc1.off + avc1.size, "avcC"); // +78: fixed VisualSampleEntry fields
        if (avcCBox) {
            const p = avcCBox.off + avcCBox.headerLen;
            avcC = { configurationVersion: buf[p], AVCProfileIndication: buf[p + 1], AVCLevelIndication: buf[p + 3], lengthSizeMinusOne: buf[p + 4] & 0x03 };
        }
    }

    return { haveFtyp, haveMoov, haveMdat, boxSizesMatchFileLength, fileBytes: buf.length, nalUnits, mdatBytes, mdatWalkExact, avcC };
}

/**
 * THE ONE real, minimal exercise of the wiring: synthesize `frameCount` simple RGBA frames, encode with
 * VideoEncoder (H.264), mux with Mp4Muxer, and hand back the bytes plus everything independently
 * re-derived about them via _verifyMp4() above -- not the encoder/muxer's own claims. Deliberately not
 * a general export path: this is the spike proving the pipe works, not the feature that uses it.
 */
async function encodeH264Spike(width, height, frameCount) {
    const w = Math.max(2, Math.min(1024, +width || 64));
    const h = Math.max(2, Math.min(1024, +height || 64));
    const n = Math.max(1, Math.min(120, +frameCount || 10));
    const mod = _webcodecs();
    if (!mod) return { ok: false, error: "webcodecs unavailable: " + status().note };

    const { VideoEncoder, VideoFrame, Mp4Muxer } = mod;
    let desc, encodedChunks = 0, keyFrames = 0;
    const muxer = new Mp4Muxer({ fastStart: true });
    let trackAdded = false, encodeErr = null;

    try {
        const encoder = new VideoEncoder({
            output: (chunk, metadata) => {
                encodedChunks++;
                if (chunk.type === "key") keyFrames++;
                if (!trackAdded) {
                    if (metadata && metadata.decoderConfig && metadata.decoderConfig.description) desc = metadata.decoderConfig.description;
                    muxer.addVideoTrack({ codec: "avc1.42001f", width: w, height: h, description: desc });
                    trackAdded = true;
                }
                muxer.addVideoChunk(chunk, metadata);
            },
            error: (e) => { encodeErr = e; },
        });
        encoder.configure({ codec: "avc1.42001f", width: w, height: h, bitrate: 500_000, framerate: 10 });

        for (let i = 0; i < n; i++) {
            const buf = new Uint8Array(w * h * 4);
            const barX = Math.floor((i / n) * w);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 4, onBar = Math.abs(x - barX) < Math.max(1, w >> 4);
                buf[idx] = onBar ? 255 : ((x * 255 / w) | 0); buf[idx + 1] = onBar ? 0 : ((y * 255 / h) | 0); buf[idx + 2] = onBar ? 0 : 128; buf[idx + 3] = 255;
            }
            const frame = new VideoFrame(buf, { format: "RGBA", codedWidth: w, codedHeight: h, timestamp: Math.round((i * 1_000_000) / 10) });
            encoder.encode(frame, { keyFrame: i === 0 });
            frame.close();
        }
        await encoder.flush();
        encoder.close();
    } catch (e) {
        return { ok: false, error: "encode/mux failed: " + String(e && e.message || e) };
    }
    if (encodeErr) return { ok: false, error: "encoder reported an error: " + String(encodeErr && encodeErr.message || encodeErr) };
    if (encodedChunks !== n) return { ok: false, error: "encoder produced " + encodedChunks + " chunks for " + n + " frames submitted -- partial output, not treating as success", encodedChunks, requested: n };

    let mp4Bytes;
    try { mp4Bytes = muxer.finalize(); }
    catch (e) { return { ok: false, error: "mux finalize failed: " + String(e && e.message || e), encodedChunks }; }
    // finalize() already produced the real bytes at this point -- a close() failure is a cleanup-only
    // problem, not a data-validity one, and must not discard mp4Bytes or be mislabeled as "finalize
    // failed" (the two try/catches were merged before this review pass, which meant a close()-after-
    // successful-finalize() throw both hid the true failure and threw away a valid result).
    let closeErr = null;
    try { muxer.close(); } catch (e) { closeErr = String(e && e.message || e); }

    const buf = Buffer.from(mp4Bytes);
    // _verifyMp4 exists specifically to catch a corrupt/truncated mux result -- it must never itself be
    // the thing that throws uncaught out of this function (same fix shape as canvasBridge.js's
    // _readPngHeader call, applied here after this review pass found _walkBoxes' own bounds bug above).
    let v;
    try { v = _verifyMp4(buf); }
    catch (e) { return { ok: false, error: "mp4 structural verification threw: " + String(e && e.message || e), encodedChunks, bytes: buf.length }; }
    const structurallyValid = v.haveFtyp && v.haveMoov && v.haveMdat && v.boxSizesMatchFileLength && v.mdatWalkExact && v.nalUnits >= n;
    if (!structurallyValid) {
        return { ok: false, error: "muxed output failed independent structural verification (see verify field)", encodedChunks, keyFrames, bytes: buf.length, verify: v };
    }

    return {
        ok: true, tool: "@napi-rs/webcodecs", width: w, height: h, framesRequested: n,
        encodedChunks, keyFrames, bytes: buf.length, mp4: buf,
        verify: v, // independently re-derived from the bytes -- see _verifyMp4()
        closeWarning: closeErr, // non-null only if muxer.close() threw AFTER finalize() already succeeded -- the mp4 bytes above are still valid regardless
        note: "requested codec avc1.42001f (H.264 Baseline) -- on this box the muxed avcC reports " +
              "AVCProfileIndication=0x" + (v.avcC ? v.avcC.AVCProfileIndication.toString(16) : "?") +
              " (0x64=High is libx264's own default, not what was requested; profile/level in the codec " +
              "string had no effect in this spike's testing -- see file header)",
    };
}

// =====================================================================================================
// *** SPIKE #2, SAME FILE, SAME "SPIKE, NOT A FEATURE" DISCIPLINE AS THE FILE HEADER ABOVE. ***
//
// encodeH264Spike() above only ever exercised the encode+mux pipe on toy, in-memory, non-file-based
// frames (synthetic solid-color bars, constructed directly as Uint8Array RGBA, never touching a disk).
// That proves the encoder/muxer works; it does NOT prove this package could serve exportBridge.js's real
// production consumer shape -- see exportBridge.js's real framesToMp4(pattern, mp4Path, opts) around
// line 143: an ffmpeg-style printf pattern (e.g. "frame-%05d.png"), a directory of real numbered PNG
// files written by a real Playwright capture (tools/export/captureLive.mjs / captureHeadless.mjs, not
// runnable in this sandbox), optionally an audio track, shelled out to an external ffmpeg CLI binary.
//
// What follows is deliberately scoped to prove the ENCODE side of that exact shape against REAL files:
// a printf-pattern expander that reads real numbered files off disk in order (_expandFrameSequence),
// encodeFramesDirToMp4(dir, pattern, opts) that decodes each REAL PNG file's bytes back into raw pixels
// (via @napi-rs/canvas's own loadImage()+getImageData() -- never assuming the frames are already RGBA in
// memory) and feeds them through the identical VideoEncoder/Mp4Muxer pipe encodeH264Spike already proved,
// plus _renderAnimatedSequenceToDisk() -- a small TEST-FIXTURE generator (not the deliverable) that
// produces a genuinely-animated (moving/growing circle, real per-frame 2D drawing operations) sequence of
// real PNG files, because this sandbox has no Playwright/browser capture available to produce real game
// footage. This is a real demonstration of this session's two spiked native modules working together
// (canvas renders real frames -> webcodecs encodes them) -- worth noting, but the deliverable being
// proven here is the ENCODE side reading real files, not the rendering side.
//
// *** DOES NOT TOUCH exportBridge.js, server.js, OR ANY HTTP ROUTE. *** No wiring, exactly as scoped.
// encodeH264Spike, _verifyMp4, _walkBoxes, status(), and LICENCE above are all UNCHANGED -- everything
// below is purely additive.
//
// *** AUDIO IS EXPLICITLY OUT OF SCOPE. *** exportBridge.js's real framesToMp4() can optionally mux an
// audio track; @napi-rs/webcodecs' AudioEncoder has never been touched anywhere in this session, and
// bolting it on here unproven would misrepresent what was actually verified. encodeFramesDirToMp4()
// below rejects an `opts.audio` argument outright rather than silently ignoring it.
// =====================================================================================================

// Separate lazily-required, memoized @napi-rs/canvas singleton -- NOT a reuse of canvasBridge.js's
// internal `_canvasMod` (that variable is module-private to canvasBridge.js and canvasBridge.js is
// read-only scope for this task, exporting no decode primitive besides its own renderPngSpike()/status()
// -- there is nothing there to import). Required directly here, same lazy/try-catch/memoize discipline
// as canvasBridge.js's own _canvas() and this file's own _webcodecs() above.
let _frameCanvasMod; // undefined = not yet tried, false = unavailable, module object = ready
function _frameCanvas() {
    if (_frameCanvasMod !== undefined) return _frameCanvasMod;
    try { _frameCanvasMod = require("@napi-rs/canvas"); }
    catch { _frameCanvasMod = false; /* optional dep missing, or no prebuilt binary for this platform/arch/libc */ }
    return _frameCanvasMod;
}

/**
 * Parse an ffmpeg-style printf frame pattern into its zero-padding pieces. Deliberately NOT a general
 * printf parser -- this task asked for just enough to handle the "%0Nd" form exportBridge.js's own
 * pattern strings actually use (e.g. "frame-%05d.png"); anything else (bare %d, %5d with no leading
 * zero, multiple specifiers, etc.) degrades to {ok:false} rather than being guessed at.
 */
function _parseFramePattern(pattern) {
    if (typeof pattern !== "string" || !pattern) return { ok: false, error: "pattern must be a non-empty string" };
    const m = /^(.*)%0(\d{1,2})d(.*)$/.exec(pattern);
    if (!m) return { ok: false, error: "pattern must be an ffmpeg-style zero-padded printf pattern, e.g. \"frame-%05d.png\" (only the %0Nd form is supported, matching exportBridge.js's own real pattern strings) -- got: " + JSON.stringify(pattern) };
    const width = +m[2];
    if (!(width >= 1 && width <= 12)) return { ok: false, error: "pattern's zero-padding width must be between 1 and 12 -- got %0" + m[2] + "d" };
    return { ok: true, prefix: m[1], width, suffix: m[3] };
}
function _frameFileName(parsed, index) { return parsed.prefix + String(index).padStart(parsed.width, "0") + parsed.suffix; }

/**
 * Expand `pattern` against REAL files in `dir`, in index order -- reads each candidate filename's stat
 * off disk, never trusting a directory listing's own ordering or presuming file content. Two modes: an
 * explicit opts.frameCount reads exactly that many consecutive indices and hard-fails naming the first
 * missing one (the caller asked for a specific count, so a gap is not tolerated); otherwise this
 * auto-discovers by reading consecutive indices until the first missing file, mirroring how ffmpeg's own
 * -i pattern reading works (it does not glob the directory either -- it just keeps incrementing until a
 * read fails).
 *
 * *** WHY opts.startIndex DEFAULTS TO 0, NOT 1. *** This task's own background note asserted the default
 * should be 1, "matching ffmpeg's own default -i pattern convention". That claim was checked against
 * THIS repo's actual real production capture code before being taken on faith -- tools/export/
 * captureHeadless.mjs line 18-21 and captureLive.mjs line 15 BOTH write their first frame as index 0
 * (`for (let i = 0; i < frames; i++) ... "frame-" + String(i).padStart(5, "0")` -- frame-00000.png is
 * the first file on disk, not frame-00001.png), which is also ffmpeg's own actual default start_number
 * (0, for both the image2 muxer and demuxer) -- exportBridge.js's framesToMp4() passes the pattern to
 * ffmpeg with no -start_number override at all, relying on that same default. So THIS file's default is
 * 0, matching the REAL files this spike was asked to prove against, not the background note's claim of
 * 1 -- overridable via opts.startIndex for a caller that genuinely has a 1-indexed sequence.
 */
function _expandFrameSequence(dir, pattern, opts = {}) {
    // *** ADVERSARIAL-REVIEW FIX (same session, this task's own review pass). *** `opts = {}` as a
    // default parameter only covers the argument being omitted or literally `undefined` -- an explicit
    // `opts: null` still reached `opts.startIndex`/`opts.frameCount` below and threw uncaught. This
    // function is exported and called directly (not only through encodeFramesDirToMp4's wrapping
    // try/catch), so the gap was real, not just theoretical -- same fix as qrBridge.js's identical
    // opts-null gap found and fixed earlier this session.
    opts = opts || {};
    const parsed = _parseFramePattern(pattern);
    if (!parsed.ok) return parsed;
    if (typeof dir !== "string" || !dir) return { ok: false, error: "dir must be a non-empty string" };

    let dirStat;
    try { dirStat = fs.statSync(dir); }
    catch (e) { return { ok: false, error: "frame directory not readable: " + String(e && e.message || e) }; }
    if (!dirStat.isDirectory()) return { ok: false, error: "not a directory: " + dir };

    const startIndex = Number.isInteger(opts.startIndex) ? opts.startIndex : 0;
    const HARD_CAP = 2000; // safety bound against a runaway/unbroken sequence -- same spirit as encodeH264Spike's frameCount clamp
    const files = [];

    const statIsFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

    if (Number.isInteger(opts.frameCount) && opts.frameCount > 0) {
        // *** ADVERSARIAL-REVIEW FIX (same session, this task's own review pass). *** This branch's own
        // docstring says an explicit frameCount "hard-fails naming the first missing one... a gap is not
        // tolerated" -- but silently clamping a request above HARD_CAP to HARD_CAP frames (via
        // Math.min, with no signal in the return value) is itself a silent gap between what was asked
        // for and what was delivered, the same class of dishonesty that guarantee exists to rule out.
        if (opts.frameCount > HARD_CAP) return { ok: false, error: "frameCount=" + opts.frameCount + " exceeds the hard safety cap of " + HARD_CAP + " frames" };
        const n = opts.frameCount;
        for (let i = 0; i < n; i++) {
            const idx = startIndex + i;
            const fpath = path.join(dir, _frameFileName(parsed, idx));
            if (!statIsFile(fpath)) return { ok: false, error: "explicit frameCount=" + opts.frameCount + " but frame index " + idx + " is missing: " + fpath, missingIndex: idx, missingPath: fpath, foundSoFar: files.length };
            files.push({ index: idx, path: fpath });
        }
    } else {
        for (let i = 0; i < HARD_CAP; i++) {
            const idx = startIndex + i;
            const fpath = path.join(dir, _frameFileName(parsed, idx));
            if (!statIsFile(fpath)) break; // first missing index stops the sequence, mirroring ffmpeg's own -i pattern reading
            files.push({ index: idx, path: fpath });
        }
        if (!files.length) return { ok: false, error: "no frames found matching pattern " + JSON.stringify(pattern) + " starting at index " + startIndex + " in " + dir };
    }
    return { ok: true, dir, pattern, startIndex, count: files.length, files };
}

/**
 * TEST-FIXTURE GENERATOR, NOT THE DELIVERABLE. This sandbox has no Playwright/browser capture available
 * (tools/export/captureLive.mjs / captureHeadless.mjs are rig-only), so real captured game footage is not
 * obtainable here -- but encodeH264Spike's synthetic solid-color bars are not a real step up either. This
 * renders a short, genuinely-animated sequence (a growing/moving circle -- real per-frame ctx.arc()/
 * ctx.fill() calls with a different position/radius each frame, not a static fill) to REAL numbered PNG
 * files on disk via @napi-rs/canvas, exactly the way canvasBridge.js's own renderPngSpike() draws
 * (createCanvas -> getContext("2d") -> draw -> toBuffer("image/png")), so encodeFramesDirToMp4() below has
 * real files with real per-frame visual variation to read back -- the same disk-based shape production
 * would actually hand it, not an in-memory shortcut.
 */
function _renderAnimatedSequenceToDisk(dir, pattern, frameCount, width, height, opts = {}) {
    // Same opts-null fix as _expandFrameSequence above -- see that function's comment.
    opts = opts || {};
    const parsed = _parseFramePattern(pattern);
    if (!parsed.ok) return parsed;
    const mod = _frameCanvas();
    if (!mod) return { ok: false, error: "canvas unavailable for frame rendering: @napi-rs/canvas is not installed or has no prebuilt native binary for " + process.platform + "-" + process.arch };

    const n = Math.max(1, Math.min(60, +frameCount || 8));
    const w = Math.max(4, Math.min(512, +width || 64));
    const h = Math.max(4, Math.min(512, +height || 64));
    const startIndex = Number.isInteger(opts.startIndex) ? opts.startIndex : 0;

    try { fs.mkdirSync(dir, { recursive: true }); }
    catch (e) { return { ok: false, error: "could not create/access frame directory: " + String(e && e.message || e) }; }

    const written = [];
    for (let i = 0; i < n; i++) {
        try {
            const canvas = mod.createCanvas(w, h);
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#101018";
            ctx.fillRect(0, 0, w, h);
            const t = n === 1 ? 0 : i / (n - 1);
            const cx = 4 + t * (w - 8);
            const r = 2 + t * (Math.min(w, h) / 2 - 4);
            ctx.fillStyle = "#ffaa33";
            ctx.beginPath();
            ctx.arc(cx, h / 2, Math.max(1, r), 0, Math.PI * 2);
            ctx.fill();
            const buf = canvas.toBuffer("image/png");
            const fpath = path.join(dir, _frameFileName(parsed, startIndex + i));
            fs.writeFileSync(fpath, buf);
            written.push(fpath);
        } catch (e) {
            return { ok: false, error: "frame " + i + " render/write failed: " + String(e && e.message || e), written };
        }
    }
    return { ok: true, dir, pattern, startIndex, count: written.length, files: written };
}

/**
 * THE DELIVERABLE. The realistic-consumer-shape sibling of encodeH264Spike(): instead of synthesizing
 * in-memory RGBA frames, this reads a REAL numbered PNG sequence off disk (mirroring exportBridge.js's
 * real framesToMp4(pattern, mp4Path, opts) -- see that file's header, around line 143, for the production
 * shape this proves against), independently decodes each real PNG file's REAL bytes back into raw pixels
 * via @napi-rs/canvas's own loadImage()+getImageData() (the same decode mechanism this session's QR
 * gate's independent-verification step already proved -- the frames are NEVER assumed to already be RGBA
 * in memory), and feeds those genuinely-decoded pixels into VideoFrame/VideoEncoder/Mp4Muxer exactly as
 * encodeH264Spike already does. Returns the muxed bytes plus everything independently re-derived about
 * them via _verifyMp4() -- same bar, not the encoder/muxer's own claims.
 *
 * Every fallible step below has its own try/catch, held to the exact same discipline encodeH264Spike
 * above already uses (file-not-found, an empty directory, a pattern with no matches, and a PNG that
 * fails to decode AT ALL all degrade to {ok:false, error:...}, never an uncaught throw or unhandled
 * rejection) -- this is the bug class that has bitten three times this session (canvasBridge.js's
 * _readPngHeader, this file's own _verifyMp4/_walkBoxes, qrBridge.js's data-normalization line): a
 * hand-parsing/verification/input-normalization helper called OUTSIDE its caller's try/catch, able to
 * throw uncaught instead of degrading honestly.
 *
 * *** WHAT "MALFORMED PNG" ACTUALLY COVERS HERE -- NARROWER THAN IT MIGHT SOUND. *** Only decode
 * FAILURES are caught (garbage bytes with no valid PNG structure at all -- loadImage() itself throws).
 * A REALISTICALLY truncated real PNG -- a valid signature and IHDR, but the compressed IDAT data cut
 * off partway through, the shape an interrupted capture write would actually produce -- is NOT caught:
 * @napi-rs/canvas's decoder accepts it and silently zero-fills the undecoded portion (reads back as
 * black), with `ok:true` and nothing in the result to distinguish it from a correct frame. This is the
 * decoder's own leniency, not something this file's error handling can intercept, and is stated plainly
 * here rather than papered over by the broader "malformed PNG is rejected" claim this docblock used to
 * make before this review pass checked it against a genuinely truncated (not just garbage) file.
 */
async function encodeFramesDirToMp4(dir, pattern, opts = {}) {
    if (opts && opts.audio) return { ok: false, error: "audio muxing is out of scope for this spike -- @napi-rs/webcodecs' AudioEncoder has not been exercised anywhere in this session; pass no `audio` option" };

    const mod = _webcodecs();
    if (!mod) return { ok: false, error: "webcodecs unavailable: " + status().note };
    const canvasMod = _frameCanvas();
    if (!canvasMod) return { ok: false, error: "canvas unavailable for frame decode: @napi-rs/canvas is not installed or has no prebuilt native binary for " + process.platform + "-" + process.arch };

    let seq;
    try { seq = _expandFrameSequence(dir, pattern, opts); }
    catch (e) { return { ok: false, error: "frame sequence expansion threw: " + String(e && e.message || e) }; }
    if (!seq.ok) return seq;

    const fps = Math.max(1, Math.min(60, +opts.fps || 10));
    const n = seq.count;

    // Decode every real PNG file's bytes back into raw pixels FIRST, independently of the encode loop
    // below -- so a malformed/truncated PNG at frame k, or a size mismatch between frames, is caught and
    // reported by name (including which frame index) before any encoder/muxer state exists that would
    // need cleaning up.
    const decoded = [];
    let width = 0, height = 0;
    for (const f of seq.files) {
        let buf;
        try { buf = fs.readFileSync(f.path); }
        catch (e) { return { ok: false, error: "could not read frame file " + f.path + ": " + String(e && e.message || e), frameIndex: f.index }; }
        try {
            const img = await canvasMod.loadImage(buf); // real PNG decode, not an in-memory shortcut
            const w = img.width, h = img.height;
            if (!width) { width = w; height = h; }
            if (w !== width || h !== height) return { ok: false, error: "frame " + f.path + " decoded as " + w + "x" + h + ", expected " + width + "x" + height + " (every frame in a sequence must match) -- frame index " + f.index, frameIndex: f.index };
            const canvas = canvasMod.createCanvas(width, height);
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            const id = ctx.getImageData(0, 0, width, height); // real decode -> raw RGBA pixels, independent of the source encoder
            decoded.push({ index: f.index, path: f.path, rgba: new Uint8Array(id.data.buffer, id.data.byteOffset, id.data.byteLength) });
        } catch (e) {
            return { ok: false, error: "frame " + f.path + " failed to decode as a real PNG: " + String(e && e.message || e), frameIndex: f.index };
        }
    }
    if (!decoded.length) return { ok: false, error: "no frames decoded" };

    const { VideoEncoder, VideoFrame, Mp4Muxer } = mod;
    let desc, encodedChunks = 0, keyFrames = 0, trackAdded = false, encodeErr = null;

    let muxer;
    try {
        // *** ADVERSARIAL-REVIEW FIX (same session, this task's own review pass). *** encodeH264Spike's
        // identical `new Mp4Muxer(...)` call also sits outside its own try/catch -- not fixed there since
        // that function is unchanged, pre-existing, already-reviewed code this task was told not to touch
        // -- but there is no reason to carry the same gap into NEW code, so it is wrapped here.
        muxer = new Mp4Muxer({ fastStart: true });
        const encoder = new VideoEncoder({
            output: (chunk, metadata) => {
                encodedChunks++;
                if (chunk.type === "key") keyFrames++;
                if (!trackAdded) {
                    if (metadata && metadata.decoderConfig && metadata.decoderConfig.description) desc = metadata.decoderConfig.description;
                    muxer.addVideoTrack({ codec: "avc1.42001f", width, height, description: desc });
                    trackAdded = true;
                }
                muxer.addVideoChunk(chunk, metadata);
            },
            error: (e) => { encodeErr = e; },
        });
        encoder.configure({ codec: "avc1.42001f", width, height, bitrate: (+opts.bitrate || 500_000), framerate: fps });

        for (let i = 0; i < decoded.length; i++) {
            const frame = new VideoFrame(decoded[i].rgba, { format: "RGBA", codedWidth: width, codedHeight: height, timestamp: Math.round((i * 1_000_000) / fps) });
            encoder.encode(frame, { keyFrame: i === 0 });
            frame.close();
        }
        await encoder.flush();
        encoder.close();
    } catch (e) {
        return { ok: false, error: "encode/mux failed: " + String(e && e.message || e) };
    }
    if (encodeErr) return { ok: false, error: "encoder reported an error: " + String(encodeErr && encodeErr.message || encodeErr) };
    if (encodedChunks !== n) return { ok: false, error: "encoder produced " + encodedChunks + " chunks for " + n + " real frames read from disk -- partial output, not treating as success", encodedChunks, requested: n };

    let mp4Bytes;
    try { mp4Bytes = muxer.finalize(); }
    catch (e) { return { ok: false, error: "mux finalize failed: " + String(e && e.message || e), encodedChunks }; }
    // Same fix shape as encodeH264Spike above: finalize() already produced the real bytes at this point --
    // a close() failure afterward is cleanup-only and must not discard mp4Bytes or be mislabeled as "finalize failed".
    let closeErr = null;
    try { muxer.close(); } catch (e) { closeErr = String(e && e.message || e); }

    const buf = Buffer.from(mp4Bytes);
    // _verifyMp4 exists specifically to catch a corrupt/truncated mux result -- it must never itself be
    // the thing that throws uncaught out of this function (same fix shape as encodeH264Spike above).
    let v;
    try { v = _verifyMp4(buf); }
    catch (e) { return { ok: false, error: "mp4 structural verification threw: " + String(e && e.message || e), encodedChunks, bytes: buf.length }; }
    const structurallyValid = v.haveFtyp && v.haveMoov && v.haveMdat && v.boxSizesMatchFileLength && v.mdatWalkExact && v.nalUnits >= n;
    if (!structurallyValid) {
        return { ok: false, error: "muxed output failed independent structural verification (see verify field)", encodedChunks, keyFrames, bytes: buf.length, verify: v };
    }

    return {
        ok: true, tool: "@napi-rs/webcodecs", width, height, dir, pattern, framesRead: n,
        encodedChunks, keyFrames, bytes: buf.length, mp4: buf,
        verify: v, // independently re-derived from the bytes -- see _verifyMp4()
        closeWarning: closeErr,
        note: "video-only -- exportBridge.js's real framesToMp4() can optionally mux in an audio track; " +
              "this spike does not attempt that (@napi-rs/webcodecs' AudioEncoder is unproven in this " +
              "session). Use _verifyDecodedFramesDiffer(result.mp4) for a stronger, decode-side check " +
              "that the encoded content genuinely varies frame to frame, beyond this structural check.",
    };
}

/**
 * GOES BEYOND _verifyMp4()'s structural check: actually DECODES the muxed MP4 back into frames using
 * @napi-rs/webcodecs' own Mp4Demuxer + VideoDecoder, and confirms the decoded output is not silently
 * blank/static/corrupted by sampling the same pixel position across the decoded frames and checking they
 * are not all identical. This is possible ON THIS BOX specifically because @napi-rs/webcodecs bundles its
 * own decoder (no external ffmpeg/ffprobe binary is needed or used here -- `which ffmpeg ffprobe` still
 * fails on this box, confirmed unchanged from the file header's original finding); a general environment
 * without a working decode path would have to stop at the structural check alone, which is why this is a
 * SEPARATE, explicitly-additional function rather than folded into encodeFramesDirToMp4()'s always-run
 * path -- a full decode pass is real extra cost that the core deliverable (proving the encode side) does
 * not require to succeed.
 *
 * *** USES THE for-await-of ASYNC ITERATOR, NOT plain demux()/demuxAsync(). *** This file's own header
 * already documents a real race found in this same session: the README's demux() example is not actually
 * synchronous, and even demuxAsync() is that same call with an await bolted on top of the identical
 * underlying race, not a different code path. The demuxer's `for await (const chunk of demuxer)` async
 * iterator (index.d.ts lines ~117-150) is a genuinely different mechanism -- each chunk is yielded only
 * once actually demuxed -- and was verified live during this spike's own development to demux and decode
 * every packet with zero loss (see the report for the real prototype output), unlike demux()/demuxAsync().
 *
 * Decoded VideoFrame output on this box is I420 (planar YUV 4:2:0), NOT RGBA -- confirmed live, not
 * assumed -- so pixel sampling reads the Y (luma) plane, where the source RGBA frames' real per-frame
 * motion still shows up as a genuine byte-level difference.
 */
async function _verifyDecodedFramesDiffer(mp4Buf, opts = {}) {
    // Same opts-null fix as _expandFrameSequence above -- see that function's comment. This one matters
    // more than the other two: encodeFramesDirToMp4's own returned `note` field explicitly recommends
    // calling this function directly for a stronger check, inviting exactly the unwrapped external call
    // an explicit `opts: null` would have crashed.
    opts = opts || {};
    const mod = _webcodecs();
    if (!mod) return { ok: false, error: "webcodecs unavailable: " + status().note };
    if (!Buffer.isBuffer(mp4Buf) && !(mp4Buf instanceof Uint8Array)) return { ok: false, error: "mp4Buf must be a Buffer or Uint8Array" };

    const { Mp4Demuxer, VideoDecoder } = mod;
    const maxSamples = Math.max(2, Math.min(64, +opts.maxSamples || 8));
    let demuxer, decoder;
    const samples = [];
    const pendingCopies = [];
    try {
        demuxer = new Mp4Demuxer({ videoOutput: () => {}, error: () => {} }); // init requires callbacks; the for-await loop below is what's actually used
        await demuxer.loadBuffer(mp4Buf instanceof Uint8Array ? mp4Buf : new Uint8Array(mp4Buf));
    } catch (e) {
        // *** ADVERSARIAL-REVIEW FIX (same session, this task's own review pass). *** This branch
        // returned without closing `demuxer` on a loadBuffer() failure (construction can succeed while
        // loadBuffer() still throws) -- every OTHER failure path in this function does close what it
        // opened; this one didn't. `demuxer` may still be undefined if the constructor itself is what
        // threw, hence the guard.
        try { if (demuxer) demuxer.close(); } catch {}
        return { ok: false, error: "demuxer failed to load muxed bytes: " + String(e && e.message || e) };
    }
    try {
        demuxer.selectVideoTrack(0);
        const vdConfig = demuxer.videoDecoderConfig;
        if (!vdConfig) { try { demuxer.close(); } catch {} return { ok: false, error: "no video decoder config on the muxed track -- nothing to decode" }; }

        decoder = new VideoDecoder({
            output: (frame) => {
                const p = (async () => {
                    try {
                        const size = frame.allocationSize();
                        const out = new Uint8Array(size);
                        await frame.copyTo(out);
                        const w = frame.codedWidth, h = frame.codedHeight;
                        const yIdx = Math.floor(h / 2) * w + Math.floor(w / 2); // I420: Y plane is the first w*h bytes
                        if (samples.length < maxSamples) samples.push({ timestamp: frame.timestamp, format: frame.format, yByte: out[yIdx] });
                    } finally { frame.close(); }
                })();
                pendingCopies.push(p);
            },
            error: () => {},
        });
        decoder.configure(vdConfig);

        let videoChunks = 0;
        for await (const chunk of demuxer) {
            if (chunk.chunkType === "video" && chunk.videoChunk) { decoder.decode(chunk.videoChunk); videoChunks++; }
        }
        await decoder.flush();
        await Promise.all(pendingCopies);
        try { decoder.close(); } catch {}
        try { demuxer.close(); } catch {}

        if (!samples.length) return { ok: false, error: "demuxed " + videoChunks + " video chunks but decoded 0 frames -- decode produced nothing to sample" };
        samples.sort((a, b) => a.timestamp - b.timestamp);
        const allSame = samples.every(s => s.yByte === samples[0].yByte);
        return { ok: true, videoChunksDemuxed: videoChunks, decodedFramesSampled: samples.length, samples, framesDiffer: !allSame };
    } catch (e) {
        try { if (decoder) decoder.close(); } catch {}
        try { if (demuxer) demuxer.close(); } catch {}
        return { ok: false, error: "decode-side verification threw: " + String(e && e.message || e) };
    }
}

module.exports = {
    status, encodeH264Spike, _verifyMp4, LICENCE,
    _parseFramePattern, _expandFrameSequence, _renderAnimatedSequenceToDisk,
    encodeFramesDirToMp4, _verifyDecodedFramesDiffer,
};
