// WebGLEngine/tools/ship/rleVolumeCache-selfcheck.mjs -- v3041
//
// Run: node tools/ship/rleVolumeCache-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES voxel/rleVolumeCache.js + render/volumeTexture.js + the R8UI shader variant -- the 3D texture treated as
// a DERIVED CACHE of the canonical RLE.
//
// The check this file exists for is section 2. A count of solid voxels, a total, a histogram and a surface area
// are ALL INVARIANT UNDER AN AXIS PERMUTATION, so every one of them passes on a volume built with x and z swapped
// -- a cache that is wrong at every coordinate and right in every aggregate. rleWorldBridge-selfcheck learned
// this the first time; this gate proves it again on the new path, by asserting BOTH halves: the count check
// agrees exactly (so it would have shipped) AND the position-sensitive check names the first divergent voxel.
//
// The second thing under test is a refusal. compareVolumeToRLE must not repair anything. A cache that heals on
// divergence can never be observed wrong, which makes it a control that cannot fail; section 4 sabotages that by
// building a healing comparator and showing it reports a clean pass on a corrupted cache.

import { readFileSync } from "node:fs";
import {
    rleToVolume, volumeAt, volumeIndex, compareVolumeToRLE, describeMismatch,
    regionFromRLE, applyRegion, restamp, isStale, rleFingerprint, solidCount, DEFAULT_MAX_DIM,
} from "../../voxel/rleVolumeCache.js";
import { encodeRLE, decodeRLE, rleIndex } from "../../voxel/voxelRLE.js";
import { chunkToRLE, chunkIndexReal } from "../../voxel/rleWorldBridge.js";
import { FRAG_SRC, FRAG_SRC_UI, decodeUnormByte, decodeUintByte } from "../../render/voxelRaymarchShader.js";
import { uploadVolume, uploadRegion, readbackVolume, verifyUpload, compareBuffers, createVolumeTexture } from "../../render/volumeTexture.js";
import { makeStubGL } from "../../render/glBootstrap.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// --- fixtures --------------------------------------------------------------------------------------------
// The real engine chunk shape: world/chunk.js is 16 x 64 x 16 with idx = x + sx*z + sx*sz*y. sx === sz is what
// makes the axis-swap sabotage in section 2 dimensionally LEGAL, which is exactly why the swap is a live risk
// here and not a theoretical one -- a wrong transcode produces a correctly sized buffer.
const SX = 16, SY = 64, SZ = 16;
const DIMS = { sx: SX, sy: SY, sz: SZ };

function terrainChunk(seed = 1) {
    const v = new Uint8Array(SX * SY * SZ);
    for (let x = 0; x < SX; x++)
        for (let z = 0; z < SZ; z++) {
            const h = 6 + Math.floor(5 * Math.sin((x + seed) * 0.7) + 4 * Math.cos((z - seed) * 0.5) + 5);
            for (let y = 0; y < Math.min(h, SY); y++) {
                const id = (y === h - 1) ? 1 : (y >= h - 3 ? 4 : 6);   // grass / dirt / stone
                v[chunkIndexReal(x, y, z, DIMS)] = id;
            }
        }
    for (let x = 3; x < 7; x++) for (let y = 30; y < 34; y++) for (let z = 9; z < 13; z++)
        v[chunkIndexReal(x, y, z, DIMS)] = 5;    // a floating block, so upper Y is not all air
    return v;
}
const flatChunk = () => { const v = new Uint8Array(SX * SY * SZ); for (let x = 0; x < SX; x++) for (let z = 0; z < SZ; z++) v[chunkIndexReal(x, 0, z, DIMS)] = 6; return v; };
const emptyChunk = () => new Uint8Array(SX * SY * SZ);

const FIXTURES = [["terrain", terrainChunk(1)], ["terrain2", terrainChunk(4)], ["flat", flatChunk()], ["empty", emptyChunk()]];

// --- 1. PARITY against an INDEPENDENT reference -----------------------------------------------------------
// The volume is built chunk -> RLE -> volume (two transcodes). The reference is built chunk -> volume directly
// (one). They agree only if BOTH transcodes are right; verifying the RLE against itself would prove nothing.
{
    let allOk = true, allRef = true, detail = "";
    for (const [name, chunk] of FIXTURES) {
        const rle = chunkToRLE(chunk, DIMS, chunkIndexReal);
        const vol = rleToVolume(rle);

        const res = compareVolumeToRLE(vol, rle);
        if (!res.ok) { allOk = false; detail = name + ": " + describeMismatch(res); }

        let refBad = null;
        for (let z = 0; z < SZ && !refBad; z++)
            for (let y = 0; y < SY && !refBad; y++)
                for (let x = 0; x < SX && !refBad; x++) {
                    const want = chunk[chunkIndexReal(x, y, z, DIMS)];
                    if (volumeAt(vol, x, y, z) !== want) refBad = "(" + x + "," + y + "," + z + ")";
                }
        if (refBad) { allRef = false; detail = name + " vs direct chunk read at " + refBad; }
    }
    ok("PARITY: volume == rle at every voxel, all 4 fixtures", allOk, detail);
    ok("PARITY: volume == the ORIGINAL engine-order chunk (independent of the RLE path)", allRef, detail);
    ok("volume dims/size match the chunk", (() => {
        const v = rleToVolume(chunkToRLE(terrainChunk(1), DIMS, chunkIndexReal));
        return v.dx === SX && v.dy === SY && v.dz === SZ && v.data.length === SX * SY * SZ;
    })());
    ok("texture order is X-fastest: volumeIndex == x + dx*(y + dy*z)  (what texelFetch(ivec3) and texImage3D expect)",
        volumeIndex(3, 5, 7, { dx: SX, dy: SY, dz: SZ }) === 3 + SX * (5 + SY * 7));
}

// --- 2. THE AXIS-SWAP SABOTAGE (the reason this gate exists) -----------------------------------------------
// Build the cache with x and z transposed. Every aggregate agrees. Every coordinate is wrong.
{
    const chunk = terrainChunk(1);
    const rle = chunkToRLE(chunk, DIMS, chunkIndexReal);
    const good = rleToVolume(rle);

    const flat = decodeRLE(rle);
    const swapped = { data: new Uint8Array(SX * SY * SZ), dx: SX, dy: SY, dz: SZ, srcFingerprint: rleFingerprint(rle) };
    for (let z = 0; z < SZ; z++)
        for (let y = 0; y < SY; y++)
            for (let x = 0; x < SX; x++)
                swapped.data[volumeIndex(x, y, z, swapped)] = flat[rleIndex(z, y, x, DIMS)];   // x <-> z

    const countsAgree = solidCount(swapped) === solidCount(good);
    const res = compareVolumeToRLE(swapped, rle);
    const differsSomewhere = !good.data.every((b, i) => b === swapped.data[i]);

    ok("SABOTAGE(axis swap): the swapped cache really is different data", differsSomewhere);
    ok("SABOTAGE(axis swap): a SOLID-COUNT check PASSES on it -- an aggregate cannot see a permutation",
        countsAgree, "both " + solidCount(good));
    ok("SABOTAGE(axis swap): the position-sensitive check CATCHES it", res.ok === false);
    ok("SABOTAGE(axis swap): it reports a coordinate, not just a verdict",
        !!res.first && Number.isInteger(res.first.x) && Number.isInteger(res.first.y) && Number.isInteger(res.first.z) &&
        res.first.expected !== res.first.actual,
        res.first ? "(" + res.first.x + "," + res.first.y + "," + res.first.z + ") rle=" + res.first.expected + " cache=" + res.first.actual : "");
    ok("SABOTAGE(axis swap): the named voxel really does disagree (the report is not a guess)",
        !!res.first && res.first.expected === chunk[chunkIndexReal(res.first.x, res.first.y, res.first.z, DIMS)] &&
        res.first.actual === volumeAt(swapped, res.first.x, res.first.y, res.first.z));
    ok("SABOTAGE(axis swap): the FINGERPRINT also fails to see it -- a fingerprint match is not a verification",
        isStale(swapped, rle) === false && res.ok === false);
}

// --- 3. A SINGLE FLIPPED BYTE is located exactly -----------------------------------------------------------
{
    const rle = chunkToRLE(terrainChunk(2), DIMS, chunkIndexReal);
    const vol = rleToVolume(rle);
    const tx = 11, ty = 3, tz = 6;
    const was = volumeAt(vol, tx, ty, tz);
    vol.data[volumeIndex(tx, ty, tz, vol)] = (was + 7) & 0xff;
    const res = compareVolumeToRLE(vol, rle);
    ok("one flipped byte: caught", res.ok === false);
    ok("one flipped byte: located at the exact coordinate",
        res.first && res.first.x === tx && res.first.y === ty && res.first.z === tz,
        res.first ? "(" + res.first.x + "," + res.first.y + "," + res.first.z + ")" : "no coordinate");
    ok("one flipped byte: expected/actual are the two real values",
        res.first && res.first.expected === was && res.first.actual === ((was + 7) & 0xff));
    ok("describeMismatch names the coordinate and says the cache was NOT repaired",
        /DIVERGED at \(11,3,6\)/.test(describeMismatch(res)) && /NOT repaired/.test(describeMismatch(res)));
}

// --- 4. THE REFUSAL: the comparator must not heal -----------------------------------------------------------
{
    const rle = chunkToRLE(terrainChunk(3), DIMS, chunkIndexReal);
    const vol = rleToVolume(rle);
    const i = volumeIndex(2, 2, 2, vol);
    vol.data[i] = (vol.data[i] + 3) & 0xff;
    const before = Uint8Array.from(vol.data);
    const res = compareVolumeToRLE(vol, rle);
    const unchanged = vol.data.every((b, k) => b === before[k]);
    ok("compare does NOT write to the cache (evidence survives the check)", unchanged);
    ok("compare still reports the divergence after leaving it in place", res.ok === false);

    // What a healing comparator looks like, and why it is worthless: it re-derives, then compares, then always
    // agrees. The corrupted cache above is the SAME cache; only the comparator changed.
    const healingCompare = (v, r) => { const fresh = rleToVolume(r); v.data.set(fresh.data); return compareVolumeToRLE(v, r); };
    const healed = healingCompare({ ...vol, data: Uint8Array.from(before) }, rle);
    ok("SABOTAGE(auto-heal): a re-uploading comparator reports a clean PASS on the same corrupt cache", healed.ok === true);
    ok("source: compareVolumeToRLE contains no write to vol.data", (() => {
        const src = readFileSync(new URL("../../voxel/rleVolumeCache.js", import.meta.url), "utf8");
        const body = src.slice(src.indexOf("export function compareVolumeToRLE"), src.indexOf("export function describeMismatch"));
        return !/vol\.data\s*\[[^\]]*\]\s*=/.test(body) && !/\.set\(/.test(body) && !/rleToVolume\(/.test(body);
    })());
}

// --- 5. REGION UPDATES (invalidate a box, re-derive that box, never the world) -------------------------------
{
    const chunk = terrainChunk(1);
    const rle0 = chunkToRLE(chunk, DIMS, chunkIndexReal);
    const vol = rleToVolume(rle0);
    ok("region: clean before the edit", compareVolumeToRLE(vol, rle0).ok);

    // edit the canonical source, not the cache -- carve a box out of the terrain
    const edited = Uint8Array.from(chunk);
    for (let x = 4; x < 9; x++) for (let y = 2; y < 6; y++) for (let z = 5; z < 10; z++) edited[chunkIndexReal(x, y, z, DIMS)] = 0;
    const rle1 = chunkToRLE(edited, DIMS, chunkIndexReal);

    ok("region: the stale cache is REPORTED stale by fingerprint", isStale(vol, rle1));
    ok("region: the stale cache also fails parity", compareVolumeToRLE(vol, rle1).ok === false);

    const patch = regionFromRLE(rle1, { x0: 4, y0: 2, z0: 5, w: 5, h: 4, d: 5 });
    applyRegion(vol, patch);
    restamp(vol, rle1);
    const after = compareVolumeToRLE(vol, rle1);
    ok("region: patching just the edited box restores FULL parity", after.ok, describeMismatch(after));
    ok("region: the patch is exactly the box, not the world", patch.data.length === 5 * 4 * 5);
    ok("region: sub-block byte order is x-fastest within the box (texSubImage3D layout)", (() => {
        const p = regionFromRLE(rle1, { x0: 4, y0: 2, z0: 5, w: 5, h: 4, d: 5 });
        for (let z = 0; z < 5; z++) for (let y = 0; y < 4; y++) for (let x = 0; x < 5; x++)
            if (p.data[x + 5 * (y + 4 * z)] !== edited[chunkIndexReal(4 + x, 2 + y, 5 + z, DIMS)]) return false;
        return true;
    })());

    // An off-by-one origin writes real voxels to the wrong place. Same byte count, same values, wrong coordinates
    // -- the region version of the axis swap, and the position-sensitive check is what sees it.
    const vol2 = rleToVolume(rle0);
    applyRegion(vol2, regionFromRLE(rle1, { x0: 4, y0: 2, z0: 5, w: 5, h: 4, d: 5 }));
    vol2.data[volumeIndex(4, 2, 5, vol2)] = vol2.data[volumeIndex(4, 2, 5, vol2)];
    const vol3 = rleToVolume(rle0);
    const off = regionFromRLE(rle1, { x0: 4, y0: 2, z0: 5, w: 5, h: 4, d: 5 });
    applyRegion(vol3, { ...off, x0: 5 });                      // shifted one voxel in x
    ok("SABOTAGE(off-by-one region): a correctly sized patch at the wrong origin is caught",
        compareVolumeToRLE(vol3, rle1).ok === false);

    ok("region: refuses a box that leaves the chunk", (() => {
        try { regionFromRLE(rle1, { x0: 14, y0: 0, z0: 0, w: 5, h: 1, d: 1 }); return false; } catch (e) { return /not inside/.test(e.message); }
    })());
}

// --- 6. BOUNDS + hardware ceiling ---------------------------------------------------------------------------
{
    const rle = chunkToRLE(flatChunk(), DIMS, chunkIndexReal);
    const vol = rleToVolume(rle);
    ok("volumeAt returns 0 outside the volume (matches the shader's inBounds guard)",
        volumeAt(vol, -1, 0, 0) === 0 && volumeAt(vol, SX, 0, 0) === 0 && volumeAt(vol, 0, SY, 0) === 0 && volumeAt(vol, 0, 0, SZ) === 0);
    ok("refuses a volume past the 3D texture ceiling, naming the limit", (() => {
        const big = encodeRLE(new Uint8Array(4), { sx: DEFAULT_MAX_DIM + 1, sy: 1, sz: 1 });
        try { rleToVolume(big); return false; } catch (e) { return /exceeds maxDim/.test(e.message) && /never one texture per world/.test(e.message); }
    })());
    ok("the engine chunk is small enough to be per-chunk: 16x64x16 = 16 KB", SX * SY * SZ === 16384);
}

// --- 7. THE DECODE PATHS (the r8unorm claim, audited rather than asserted) ----------------------------------
{
    let unormBad = [];
    for (let b = 0; b < 256; b++) if (decodeUnormByte(b) !== b) unormBad.push(b);
    let uintBad = 0;
    for (let b = 0; b < 256; b++) if (decodeUintByte(b) !== b) uintBad++;
    // HONEST RESULT KEPT: the unorm round-trip is not broken. All 256 ids survive float32. R8UI is still the
    // right binding, because it does not depend on that arithmetic landing right -- but the reason to switch is
    // "removes a dependency", not "fixes a bug", and the gate says so rather than implying a fix that was not one.
    ok("r8unorm decode: all 256 material ids survive the float32 round-trip (the existing path is SOUND)",
        unormBad.length === 0, unormBad.length ? "fails at " + unormBad.slice(0, 5).join(",") : "0 failures");
    ok("r8uint decode: exact by construction, all 256 ids", uintBad === 0);
}

// --- 8. THE SHADER VARIANT ----------------------------------------------------------------------------------
{
    ok("FRAG_SRC (default) is UNCHANGED: still the unorm form", /texelFetch\(uVolume, p, 0\)\.r \* 255\.0 \+ 0\.5/.test(FRAG_SRC) && /uniform sampler3D uVolume/.test(FRAG_SRC));
    ok("FRAG_SRC_UI uses usampler3D", /uniform usampler3D uVolume/.test(FRAG_SRC_UI) && /precision highp usampler3D/.test(FRAG_SRC_UI));
    ok("FRAG_SRC_UI reads the byte directly: no * 255.0 anywhere", !/255\.0/.test(FRAG_SRC_UI));
    ok("FRAG_SRC_UI accesses the volume ONLY via texelFetch at integer coords (no sampler, no filtering)",
        /texelFetch\(uVolume/.test(FRAG_SRC_UI) && !/\btexture\s*\(\s*uVolume/.test(FRAG_SRC_UI) && !/textureLod|texelFetchOffset|sampler\s+/.test(FRAG_SRC_UI));
    ok("FRAG_SRC_UI is otherwise the SAME shader: identical DDA loop and palette", (() => {
        const strip = (s) => s.replace(/precision highp u?sampler3D;/, "").replace(/uniform u?sampler3D uVolume;/, "")
                              .replace(/return int\(texelFetch\(uVolume, p, 0\)\.r[^;]*\);/, "");
        return strip(FRAG_SRC) === strip(FRAG_SRC_UI);
    })());
    ok("the two variants differ in exactly 3 lines", (() => {
        const a = FRAG_SRC.split("\n"), b = FRAG_SRC_UI.split("\n");
        if (a.length !== b.length) return false;
        return a.filter((l, i) => l !== b[i]).length === 3;
    })());
}

// --- 9. THE GPU SIDE: stub-safe, right formats, and a comparator with detection power ------------------------
{
    // 9a. against the no-op stub gl (WebGL2 unavailable): honest refusals, never a throw, never a fake pass
    const stub = makeStubGL({ width: 64, height: 64 });
    const rle = chunkToRLE(terrainChunk(1), DIMS, chunkIndexReal);
    const vol = rleToVolume(rle);
    let threw = false, up = null, rb = null, ver = null;
    try {
        const t = createVolumeTexture(stub);
        up = uploadVolume(stub, t, vol);
        rb = readbackVolume(stub, t, vol.dx, vol.dy, vol.dz);
        ver = verifyUpload(stub, t, vol);
    } catch (e) { threw = true; }
    ok("stub gl: nothing throws", !threw);
    ok("stub gl: readback REFUSES with a reason instead of returning a buffer", rb && rb.ok === false && !!rb.reason);
    ok("stub gl: verifyUpload does not report a pass it cannot have measured", ver && ver.ok === false && !!ver.reason);
    ok("null gl: refuses rather than throwing", (() => {
        try { const r = uploadVolume(null, null, vol); return r.ok === false && !!r.reason; } catch { return false; }
    })());

    // 9b. a recording mock: assert the exact texture format and that no filter is ever set to LINEAR
    const calls = [];
    const K = { TEXTURE_3D: 1, R8UI: 2, RED_INTEGER: 3, UNSIGNED_BYTE: 4, NEAREST: 5, LINEAR: 6, CLAMP_TO_EDGE: 7,
                TEXTURE_MIN_FILTER: 8, TEXTURE_MAG_FILTER: 9, TEXTURE_WRAP_S: 10, TEXTURE_WRAP_T: 11, TEXTURE_WRAP_R: 12 };
    const mock = {
        ...K,
        isContextLost: () => false,
        createTexture: () => ({}),
        bindTexture: () => {},
        pixelStorei: () => {},
        texParameteri: (t, p, v) => calls.push(["param", p, v]),
        texImage3D: (...a) => calls.push(["image", a[2], a[7], a[8]]),
        texSubImage3D: (...a) => calls.push(["sub", a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9]]),
    };
    const mtex = createVolumeTexture(mock);
    uploadVolume(mock, mtex, vol);
    const img = calls.find((c) => c[0] === "image");
    ok("upload uses R8UI / RED_INTEGER / UNSIGNED_BYTE", !!img && img[1] === K.R8UI && img[2] === K.RED_INTEGER && img[3] === K.UNSIGNED_BYTE);
    ok("upload never sets a LINEAR filter (illegal on an integer texture, and wrong for a DDA)",
        calls.filter((c) => c[0] === "param" && c[2] === K.LINEAR).length === 0);
    ok("upload sets NEAREST on both filters", calls.filter((c) => c[0] === "param" && c[2] === K.NEAREST).length === 2);
    calls.length = 0;
    uploadRegion(mock, mtex, regionFromRLE(rle, { x0: 1, y0: 2, z0: 3, w: 4, h: 5, d: 6 }));
    const sub = calls.find((c) => c[0] === "sub");
    ok("region upload uses texSubImage3D at the box origin with the box size",
        !!sub && sub[1] === 1 && sub[2] === 2 && sub[3] === 3 && sub[4] === 4 && sub[5] === 5 && sub[6] === 6);
    ok("region upload keeps the integer format", !!sub && sub[7] === K.RED_INTEGER && sub[8] === K.UNSIGNED_BYTE);

    // 9c. compareBuffers has real detection power: prove it with a synthetic readback, no GPU required
    const good = Uint8Array.from(vol.data);
    ok("compareBuffers: identical buffers pass", compareBuffers(good, vol).ok === true);
    const bad = Uint8Array.from(vol.data);
    const bi = volumeIndex(9, 12, 4, vol);
    bad[bi] = (bad[bi] + 1) & 0xff;
    const cres = compareBuffers(bad, vol);
    ok("compareBuffers: one wrong byte is caught and located", cres.ok === false && cres.first.x === 9 && cres.first.y === 12 && cres.first.z === 4);
    ok("compareBuffers: a length mismatch refuses rather than comparing a prefix", compareBuffers(new Uint8Array(3), vol).ok === false);
}

// --- 10. BROWSER-SAFE (browser-node law) ---------------------------------------------------------------------
{
    const cache = readFileSync(new URL("../../voxel/rleVolumeCache.js", import.meta.url), "utf8");
    const tex = readFileSync(new URL("../../render/volumeTexture.js", import.meta.url), "utf8");
    const nodeImport = /^\s*import[^\n]*["'](node:|fs|path|url|crypto|zlib|dgram|net|os|child_process)/m;
    ok("rleVolumeCache: no node builtin at module scope, no DOM", !nodeImport.test(cache) && !/\bdocument\b|\bwindow\b/.test(cache));
    ok("volumeTexture: no imports at all, no DOM", !/^\s*import/m.test(tex) && !/\bdocument\b|\bwindow\b/.test(tex));
    ok("rleVolumeCache imports only sibling voxel modules", (cache.match(/^\s*import[^\n]*/gm) || []).every((l) => /["']\.\/voxel/.test(l) || /["']\.\//.test(l)));
}

// ---- v3155: THE COMPARE IS EXACT-TYPE, AND THAT IS A STRENGTH WORTH PROTECTING ---------------------------------
// I came to this file expecting v3153's bug a third time -- a verifier with its own hardcoded notion of solid,
// checking a cache built under another. IT IS NOT THERE, AND THE REASON IS BETTER THAN A FIX.
//
// rleToVolume stores RAW VOXEL TYPES, not a solidity decision, so the cache has no "notion of solid" to
// disagree with. compareVolumeToRLE then checks `expected !== actual` -- EXACT TYPE EQUALITY, which needs no
// predicate and is STRICTLY STRONGER than any predicate comparison. *** ADDING AN isSolid PARAMETER HERE WOULD
// BE A DOWNGRADE DRESSED AS A FIX: it would let a caller ask a WEAKER question and get a pass where the types
// genuinely differ. *** This gate exists so nobody adds one later thinking it an improvement.
{
    const src = readFileSync(new URL("../../voxel/rleVolumeCache.js", import.meta.url), "utf8");
    const region = readFileSync(new URL("../../voxel/rleRegionVolume.js", import.meta.url), "utf8");
    const strip = (t) => t.replace(/\/\/[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");

    ok("!! the volume compare is EXACT TYPE EQUALITY, not a predicate test",
        /expected !== actual/.test(strip(src)) && !/isSolid/.test(strip(src)),
        "the cache stores raw TYPES, so exact equality is available AND is stronger than any isSolid " +
        "comparison. A predicate here would let a caller ask a weaker question and pass where the types differ");

    ok("...and the region compare is the same",
        /expected !== actual/.test(strip(region)) && !/isSolid/.test(strip(region)));

    ok("!! and the counts are named for WHAT THEY COUNT, not for a judgement they do not make",
        /nonAirRLE/.test(strip(src)) && /nonAirVolume/.test(strip(src)) && /nonAir/.test(strip(region)) &&
        !/solidVolume|solidRLE/.test(strip(src)),
        "they were solidRLE / solidVolume / solid, counting non-zero. That COINCIDES with solid under the " +
        "default predicate and DIVERGES under any other -- a caller for whom type 5 is air would read a " +
        "'solid' figure including it. The numbers were always right; the label claimed a judgement");
}

console.log("rleVolumeCache-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
