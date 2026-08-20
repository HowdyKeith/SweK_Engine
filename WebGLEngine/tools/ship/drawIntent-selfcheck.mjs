// WebGLEngine/tools/ship/drawIntent-selfcheck.mjs -- v3058
//
// Run: node tools/ship/drawIntent-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES WHAT A RENDER PASS ASKS THE GPU TO DO, with no GPU.
//
// The idea is GacUI's: its Remote Protocol makes the renderer a protocol, and its UnitTestRemoteProtocol records
// that protocol instead of drawing, so a GUI is testable with no OS window. glBootstrap.makeRecordingGL is the
// same move here.
//
// WHY THIS ROUND EXISTS. raymarch-live.html drew nothing on Keith's rig, and I could not check it: render-qa
// needs a real GPU Chromium and the sandbox has none. So I guessed -- the uint shader, the R8UI upload, the
// region logic, context exhaustion -- and the first three were wrong. Every one of them was ANSWERABLE without a
// GPU, because they are all questions about the commands issued, not about pixels. This makes that answerable.
//
// THE SCOPE, stated so it cannot be oversold: this proves INTENT, not appearance. It cannot tell you the picture
// is right. A shader that "compiles" against a recorder may still fail on a real driver, and the recorder's
// getShaderParameter returns true unconditionally. Pixels remain a rig concern. Conflating the two would make
// this worse than useless -- it would look like render coverage while testing none.

import { readFileSync } from "node:fs";
import { makeRecordingGL, nameOf } from "../../render/glBootstrap.js";
import { VoxelRaymarchPass } from "../../render/voxelRaymarchPass.js";
import { VoxelVolumeStream } from "../../render/voxelVolumeStream.js";
import { chunkToRLE, chunkIndexReal } from "../../voxel/rleWorldBridge.js";
import { chunkKey } from "../../voxel/rleRegionVolume.js";
import { codeOnly, prose } from "./sourceScan.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const say = (m) => console.log("  ----  " + m);
const argNames = (c) => c.args.map((a) => (a && a.typed) ? (a.typed + "[" + a.length + "]") : nameOf(a));

const CAM = { eye: [1, 2, 3], fwd: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0], tanFov: 0.6 };

// --- 0. the recorder must be able to TELL THINGS APART, or every check below is vacuous ----------------------
{
    const r = makeRecordingGL({ width: 8, height: 8 });
    ok("!! constants are DISTINCT: R8UI is not R8, RED_INTEGER is not RED",
        r.gl.R8UI !== r.gl.R8 && r.gl.RED_INTEGER !== r.gl.RED && r.gl.NEAREST !== r.gl.LINEAR,
        "if these collided the format assertions would pass on the wrong format");
    ok("...and they decode back to their names, so a recorded call is readable",
        nameOf(r.gl.R8UI) === "R8UI" && nameOf(r.gl.TEXTURE_3D) === "TEXTURE_3D");
    ok("...constants are truthy and non-zero, so `if (gl.SOMETHING)` cannot silently take the wrong branch",
        [r.gl.R8, r.gl.NEAREST, r.gl.TRIANGLES].every((v) => v > 1));
    ok("the recorder logs an unknown method rather than throwing", (() => {
        r.gl.someMethodNobodyImplemented(1, 2);
        return r.count("someMethodNobodyImplemented") === 1;
    })());
    ok("typed arrays are SUMMARISED, not copied into the log", (() => {
        const r2 = makeRecordingGL({ width: 8, height: 8 });
        r2.gl.bufferData(1, new Uint8Array(100000), 2);
        const a = r2.last("bufferData").args[1];
        return a.typed === "Uint8Array" && a.length === 100000 && typeof a.checksum === "number" && !Array.isArray(a.head === undefined);
    })(), "a 256 KB volume copied per call would make the recorder the slowest thing in the suite");
}

// --- 1. THE UINT PASS: exactly what raymarch-live asks for, checked with no GPU -------------------------------
{
    const r = makeRecordingGL({ width: 64, height: 64 });
    const pass = new VoxelRaymarchPass(r.gl, { uint: true });
    ok("!! the uint pass CONSTRUCTS -- it is not dead", pass.dead === false, pass.error || "");
    pass.uploadVolume(new Uint8Array(64 * 64 * 64), 64, 64, 64);
    pass.render(CAM, 64, 64);

    const img = r.last("texImage3D");
    say("recorded: texImage3D(" + argNames(img).join(", ") + ")");
    ok("!! uploads R8UI / RED_INTEGER / UNSIGNED_BYTE at the right dims", (() => {
        const a = argNames(img);
        return a[0] === "TEXTURE_3D" && a[2] === "R8UI" && a[3] === 64 && a[4] === 64 && a[5] === 64 &&
               a[7] === "RED_INTEGER" && a[8] === "UNSIGNED_BYTE";
    })());
    ok("!! NEAREST on both filters, and LINEAR never set (illegal on an integer texture)", (() => {
        const params = r.find("texParameteri").map((c) => argNames(c));
        return params.filter((p) => p[2] === "NEAREST").length === 2 && params.every((p) => p[2] !== "LINEAR");
    })());
    ok("wraps clamp-to-edge on all three axes",
        r.find("texParameteri").map((c) => argNames(c)).filter((p) => p[2] === "CLAMP_TO_EDGE").length === 3);
    ok("!! it actually DRAWS: drawArrays(TRIANGLES, 0, 3)", (() => {
        const d = r.last("drawArrays");
        return d && argNames(d)[0] === "TRIANGLES" && d.args[1] === 0 && d.args[2] === 3;
    })());
    ok("...after binding the program and the vertex array, in that order", (() => {
        const iP = r.log.findIndex((c) => c.op === "useProgram");
        const iV = r.log.findIndex((c) => c.op === "bindVertexArray");
        const iD = r.log.findIndex((c) => c.op === "drawArrays");
        return iP >= 0 && iV > iP && iD > iV;
    })());
    ok("...with the volume texture bound", r.find("bindTexture").some((c) => argNames(c)[0] === "TEXTURE_3D"));
}

// --- 2. THE UNORM PASS still asks for the OLD format -- the substitution is per-instance ----------------------
{
    const r = makeRecordingGL({ width: 64, height: 64 });
    const pass = new VoxelRaymarchPass(r.gl);          // default: no opts
    pass.uploadVolume(new Uint8Array(8 * 8 * 8), 8, 8, 8);
    const a = argNames(r.last("texImage3D"));
    ok("!! the DEFAULT pass still uploads R8 / RED, unchanged since v3040", a[2] === "R8" && a[7] === "RED",
        "the uint path is a flagged substitution, and this is what proves the default was not quietly moved");
}

// --- 3. END TO END: the bytes that reach the GPU are the bytes the region derived -----------------------------
// This is the check a pixel test cannot make and a unit test usually does not: the CHAIN. The stream derives a
// region from RLE chunks, uploads it, and the checksum recorded at texImage3D must equal the checksum of the
// volume the stream is holding. No GPU, and it covers every transcode between them.
{
    const S = 16, H = 64, DIMS = { sx: S, sy: H, sz: S };
    const store = new Map();
    const gen = (cx, cz) => {
        const v = new Uint8Array(S * H * S);
        for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
            const hgt = 8 + ((cx * 7 + cz * 13 + x * 3 + z) % 11);
            for (let y = 0; y < hgt; y++) v[chunkIndexReal(x, y, z, DIMS)] = 1 + ((x + y + z) % 6);
        }
        return v;
    };
    const provider = {
        chunkSize: S, chunkHeight: H,
        getChunkRLE(cx, cz) {
            const k = chunkKey(cx, cz);
            if (!store.has(k)) store.set(k, chunkToRLE(gen(cx, cz), DIMS, chunkIndexReal));
            return store.get(k);
        },
    };
    const r = makeRecordingGL({ width: 64, height: 64 });
    const stream = new VoxelVolumeStream(r.gl, provider, { nx: 4, nz: 4 });
    const res = stream.update(8, 8);

    ok("the stream derived a region and uploaded it", res.changed === true && stream.stats.lastUploadOk === true);
    const img = r.last("texImage3D");
    ok("!! the upload carries the region's OWN dimensions, 64 x 64 x 64", (() => {
        const a = argNames(img);
        return a[3] === stream.volume.dx && a[4] === stream.volume.dy && a[5] === stream.volume.dz && a[3] === 64;
    })());
    ok("!! and the BYTES that reached the GPU are the bytes the region derived", (() => {
        const sent = img.args[9];
        let sum = 0;
        for (let i = 0; i < stream.volume.data.length; i++) sum = (sum + stream.volume.data[i] * (i % 31 + 1)) >>> 0;
        return sent && sent.length === stream.volume.data.length && sent.checksum === sum;
    })(), "covers every transcode from RLE chunk to texture upload, with no GPU anywhere");
    ok("parity of that same region still holds", stream.verify().ok);

    // SABOTAGE: change the SOURCE and the uploaded checksum must move.
    //
    // My first attempt corrupted stream.volume.data directly and forced an update -- and it failed, CORRECTLY:
    // update(force) re-derives the region from the RLE chunks, so it wiped the corruption before uploading. The
    // cache doing exactly what v3041 built it to do. Editing a chunk is the honest version, and it exercises the
    // whole chain (chunk -> RLE -> region -> texture) instead of one buffer.
    const edited = gen(0, 0);
    edited[chunkIndexReal(3, 40, 3, DIMS)] = 7;
    store.set(chunkKey(0, 0), chunkToRLE(edited, DIMS, chunkIndexReal));
    stream.update(8, 8);
    const img2 = r.last("texImage3D");
    let sum2 = 0;
    for (let i = 0; i < stream.volume.data.length; i++) sum2 = (sum2 + stream.volume.data[i] * (i % 31 + 1)) >>> 0;
    ok("SABOTAGE(one byte changed): the recorded checksum MOVES, so the check has detection power",
        img2.args[9].checksum === sum2 && img2.args[9].checksum !== img.args[9].checksum);
}

// --- 4. THE RECORDER CAN FAIL. Without this, sections 1-3 are a control that cannot fail ----------------------
{
    const r = makeRecordingGL({ width: 8, height: 8 });
    const pass = new VoxelRaymarchPass(r.gl, { uint: true });
    pass.render(CAM, 8, 8);        // never uploaded a volume
    ok("!! a pass that never uploaded issues NO texImage3D and NO drawArrays",
        r.count("texImage3D") === 0 && r.count("drawArrays") === 0,
        "render() early-returns without a texture, and the recorder shows that rather than implying a draw");
}

// --- 5. the honest scope, in the source where it will be read -------------------------------------------------
{
    const src = readFileSync(new URL("../../render/glBootstrap.js", import.meta.url), "utf8");
    ok("makeRecordingGL says plainly that it proves INTENT, not appearance",
        /WHAT IT IS NOT/.test(src) && /INTENT coverage/.test(src) && /cannot tell you the picture is right/.test(prose(src)),
        "a recorder mistaken for render coverage would look like a test suite and test no rendering");
    ok("glBootstrap stays browser-safe with the recorder in it", (() => {
        const code = codeOnly(src);
        return !/^\s*import[^\n]*["'](node:|fs|path)/m.test(code);
    })());
    ok("the recorder does not pretend the context is lost (that is the STUB's job, and they are different tools)", (() => {
        const r = makeRecordingGL({ width: 8, height: 8 });
        return r.gl.isContextLost() === false;
    })());
}

console.log("drawIntent-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
