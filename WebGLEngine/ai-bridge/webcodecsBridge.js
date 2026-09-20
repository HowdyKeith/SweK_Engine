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
// standalone spike, exactly as scoped. encodeH264Spike() below is the ONE minimal real exercise of the
// pipe (synthesize a few frames -> encode -> mux -> hand back the bytes plus independently-derived
// facts about them), not a replacement for transcodeToMp4/framesToMp4.
"use strict";

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

module.exports = { status, encodeH264Spike, _verifyMp4, LICENCE };
