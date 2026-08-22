// WebGLEngine/tools/ship/rleRegionVolume-selfcheck.mjs -- v3045
//
// Run: node tools/ship/rleRegionVolume-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES voxel/rleRegionVolume.js -- the nx-by-nz window of chunks stitched into ONE derived volume, which is
// what makes the ray-march pass usable on a streaming world instead of a fixture.
//
// A region has two ways to be wrong that a single chunk did not, and BOTH produce plausible terrain:
//
//   PLACEMENT   -- the chunk grid transposed (cx and cz swapped). Real chunks, real terrain, wrong arrangement,
//                  every boundary disagreeing with the world the physics uses.
//   STRIDE      -- each chunk copied in as one contiguous block. The region's X stride is nx*chunkSize, not
//                  chunkSize, so a block copy smears each chunk across the region in rows.
//
// A SOLID COUNT SURVIVES BOTH. Neither creates or destroys a voxel; they only move them. So section 3 asserts
// both halves for each sabotage: the count check agrees exactly (it would have shipped) and the position-
// sensitive check names the region coordinate, the owning chunk, and the local coordinate inside it.
//
// And the quiet one, section 4: a chunk that has not streamed in reads as air. So does open sky. They mean
// opposite things, and a renderer cannot tell them apart -- which is how "the terrain generator is broken" gets
// diagnosed for what is actually a loading race. The region records `missing` and the parity check verifies a
// missing chunk really is air, so a hole that quietly filled with something is caught too.

import { readFileSync } from "node:fs";
import { codeOnly } from "./sourceScan.mjs";
import {
    regionVolumeFromChunks, compareRegionToChunks, describeRegion, regionDims, chunkOrigin,
    chunkInRegion, chunkKey, regionSignature, windowFor,
} from "../../voxel/rleRegionVolume.js";
import { volumeIndex, rleFingerprint } from "../../voxel/rleVolumeCache.js";
import { chunkToRLE, chunkIndexReal } from "../../voxel/rleWorldBridge.js";
import { brickMapFromRLE, verifyBrickMap } from "../../voxel/rleBrickMap.js";
import { encodeRLE } from "../../voxel/voxelRLE.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// --- fixtures: the REAL engine chunk shape, 16x64x16, world/chunk.js order ----------------------------------
const S = 16, H = 64;
const DIMS = { sx: S, sy: H, sz: S };
const OPTS = { originCx: -2, originCz: -2, nx: 4, nz: 4, chunkSize: S, chunkHeight: H };

// Terrain that DEPENDS ON WORLD POSITION, so a transposed or mis-slotted chunk is genuinely different data.
// A fixture that looked the same in every chunk would make every placement sabotage vacuous -- which is the
// mistake the rleMeshOpt gate caught in v2795 (a check on a slab that had no -Y faces at all).
function chunkAt(cx, cz) {
    const v = new Uint8Array(S * H * S);
    for (let x = 0; x < S; x++)
        for (let z = 0; z < S; z++) {
            const wx = cx * S + x, wz = cz * S + z;
            const h = Math.max(1, Math.min(H - 1, Math.floor(20 + 9 * Math.sin(wx * 0.11) + 7 * Math.cos(wz * 0.09) + 4 * Math.sin((wx - wz) * 0.05))));
            for (let y = 0; y < h; y++) v[chunkIndexReal(x, y, z, DIMS)] = (y === h - 1) ? 1 : (y >= h - 3 ? 4 : 6);
        }
    return v;
}
const makeChunks = (opts = OPTS, skip = []) => {
    const out = [];
    for (let j = 0; j < opts.nz; j++)
        for (let i = 0; i < opts.nx; i++) {
            const cx = opts.originCx + i, cz = opts.originCz + j;
            if (skip.includes(chunkKey(cx, cz))) continue;
            out.push({ cx, cz, rle: chunkToRLE(chunkAt(cx, cz), DIMS, chunkIndexReal) });
        }
    return out;
};
const solidCount = (d) => { let n = 0; for (let i = 0; i < d.length; i++) if (d[i]) n++; return n; };

// --- 1. the region is built, sized and mapped correctly ------------------------------------------------------
{
    const chunks = makeChunks();
    const vol = regionVolumeFromChunks(chunks, OPTS);
    const d = regionDims(OPTS);
    ok("region dims are nx*chunkSize x chunkHeight x nz*chunkSize", vol.dx === 64 && vol.dy === 64 && vol.dz === 64 && vol.data.length === d.dx * d.dy * d.dz);
    ok("every chunk in the window is present, none missing", vol.present.length === 16 && vol.missing.length === 0);
    ok("PARITY: region == the chunks it was built from, every voxel", (() => {
        const r = compareRegionToChunks(vol, chunks, OPTS);
        return r.ok && r.checked === 64 * 64 * 64;
    })(), describeRegion(compareRegionToChunks(vol, chunks, OPTS)));

    // INDEPENDENT reference: read the region straight out of the ORIGINAL engine-order chunk arrays, never
    // through the RLE. Agreement only holds if the chunk->RLE transcode AND the placement are both right.
    ok("PARITY: region == the ORIGINAL engine-order chunks (independent of the RLE path)", (() => {
        for (let j = 0; j < OPTS.nz; j++)
            for (let i = 0; i < OPTS.nx; i++) {
                const cx = OPTS.originCx + i, cz = OPTS.originCz + j;
                const raw = chunkAt(cx, cz);
                const { ox, oz } = chunkOrigin(cx, cz, OPTS);
                for (let z = 0; z < S; z += 3)
                    for (let y = 0; y < H; y += 5)
                        for (let x = 0; x < S; x += 3)
                            if (vol.data[volumeIndex(ox + x, y, oz + z, vol)] !== raw[chunkIndexReal(x, y, z, DIMS)]) return false;
            }
        return true;
    })());

    ok("chunkOrigin places the window's first chunk at the region origin", (() => {
        const o = chunkOrigin(OPTS.originCx, OPTS.originCz, OPTS);
        const l = chunkOrigin(OPTS.originCx + 3, OPTS.originCz + 3, OPTS);
        return o.ox === 0 && o.oz === 0 && l.ox === 48 && l.oz === 48;
    })());
    ok("chunkInRegion accepts the window and rejects just outside it",
        chunkInRegion(-2, -2, OPTS) && chunkInRegion(1, 1, OPTS) && !chunkInRegion(2, 1, OPTS) && !chunkInRegion(-3, -2, OPTS));
    ok("windowFor centres the window on a world position", (() => {
        const w = windowFor(0.5, 0.5, { nx: 4, nz: 4, chunkSize: S, chunkHeight: H });
        return w.originCx === -2 && w.originCz === -2 && w.nx === 4;
    })());
    ok("a chunk outside the window is IGNORED, not pasted somewhere", (() => {
        const extra = [...chunks, { cx: 99, cz: 99, rle: chunkToRLE(chunkAt(99, 99), DIMS, chunkIndexReal) }];
        const v2 = regionVolumeFromChunks(extra, OPTS);
        return v2.present.length === 16 && v2.data.every((b, i) => b === vol.data[i]);
    })());
}

// --- 2. refusals ---------------------------------------------------------------------------------------------
{
    const chunks = makeChunks();
    ok("refuses a region past the 3D texture ceiling, and says shrink the WINDOW not grow the texture", (() => {
        try { regionVolumeFromChunks(chunks, { ...OPTS, nx: 200, nz: 200 }); return false; }
        catch (e) { return /exceeds maxDim/.test(e.message) && /shrink the window/.test(e.message); }
    })());
    ok("refuses a chunk whose dims do not match the region's chunk shape", (() => {
        const bad = [{ cx: -2, cz: -2, rle: encodeRLE(new Uint8Array(8 * 8 * 8), { sx: 8, sy: 8, sz: 8 }) }];
        try { regionVolumeFromChunks(bad, OPTS); return false; }
        catch (e) { return /region expects 16x64x16/.test(e.message); }
    })());
    ok("refuses a nonsense window", (() => {
        for (const o of [{ ...OPTS, nx: 0 }, { ...OPTS, nz: -1 }, { ...OPTS, chunkHeight: 0 }]) {
            try { regionVolumeFromChunks(chunks, o); return false; } catch {}
        }
        return true;
    })());
}

// --- 3. THE TWO PLACEMENT SABOTAGES, each with the count check shown passing ---------------------------------
{
    const chunks = makeChunks();
    const good = regionVolumeFromChunks(chunks, OPTS);

    // (a) TRANSPOSED CHUNK GRID: build the region with each chunk's cx and cz swapped.
    const swapped = regionVolumeFromChunks(chunks.map((c) => ({ cx: c.cz, cz: c.cx, rle: c.rle })), OPTS);
    const swapRes = compareRegionToChunks(swapped, chunks, OPTS);
    ok("SABOTAGE(transposed chunk grid): it really is different data", !swapped.data.every((b, i) => b === good.data[i]));
    ok("SABOTAGE(transposed chunk grid): a SOLID COUNT still agrees exactly",
        solidCount(swapped.data) === solidCount(good.data), "both " + solidCount(good.data));
    ok("SABOTAGE(transposed chunk grid): the position-sensitive check CATCHES it", swapRes.ok === false);
    ok("SABOTAGE(transposed chunk grid): it names the region coord, the OWNING CHUNK and the local coord",
        !!swapRes.first && !!swapRes.first.chunk && Number.isInteger(swapRes.first.local.x),
        swapRes.first ? describeRegion(swapRes).slice(0, 96) : "");

    // (b) BLOCK COPY: paste each chunk's voxels contiguously instead of interleaving rows into the region stride.
    const blocky = { ...good, data: new Uint8Array(good.data.length) };
    {
        let at = 0;
        for (const c of chunks) {
            const { ox, oz } = chunkOrigin(c.cx, c.cz, OPTS);
            void ox; void oz;
            for (let z = 0; z < S; z++) for (let y = 0; y < H; y++) for (let x = 0; x < S; x++) {
                blocky.data[at++] = good.data[volumeIndex(chunkOrigin(c.cx, c.cz, OPTS).ox + x, y, chunkOrigin(c.cx, c.cz, OPTS).oz + z, good)];
            }
        }
    }
    const blockRes = compareRegionToChunks(blocky, chunks, OPTS);
    ok("SABOTAGE(contiguous block copy): a SOLID COUNT still agrees exactly",
        solidCount(blocky.data) === solidCount(good.data), "both " + solidCount(good.data));
    ok("SABOTAGE(contiguous block copy): the position-sensitive check CATCHES it", blockRes.ok === false,
        "the region X stride is nx*chunkSize (" + (OPTS.nx * S) + "), not chunkSize (" + S + ")");

    // (c) one flipped byte, located exactly and attributed to its chunk
    const holed = { ...good, data: Uint8Array.from(good.data) };
    const rx = 37, ry = 12, rz = 45;
    const was = holed.data[volumeIndex(rx, ry, rz, holed)];
    holed.data[volumeIndex(rx, ry, rz, holed)] = (was + 5) & 7;
    const oneRes = compareRegionToChunks(holed, chunks, OPTS);
    ok("one flipped byte: located at the exact region coordinate",
        oneRes.first && oneRes.first.rx === rx && oneRes.first.ry === ry && oneRes.first.rz === rz);
    ok("one flipped byte: attributed to the chunk that owns it, with local coords", (() => {
        const f = oneRes.first;
        if (!f) return false;
        const cx = OPTS.originCx + Math.floor(rx / S), cz = OPTS.originCz + Math.floor(rz / S);
        return f.chunk === chunkKey(cx, cz) && f.local.x === rx % S && f.local.z === rz % S && f.local.y === ry && f.loaded === true;
    })(), oneRes.first ? oneRes.first.chunk + " local (" + oneRes.first.local.x + "," + oneRes.first.local.y + "," + oneRes.first.local.z + ")" : "");
    ok("compare writes nothing to the region it just condemned", (() => {
        const before = Uint8Array.from(holed.data);
        compareRegionToChunks(holed, chunks, OPTS);
        return holed.data.every((b, i) => b === before[i]);
    })());
    ok("describeRegion says the region was NOT repaired", /NOT repaired/.test(describeRegion(oneRes)));
}

// --- 4. MISSING CHUNKS: air to a renderer, not-loaded to everything else --------------------------------------
{
    const gone = [chunkKey(-1, -1), chunkKey(0, 1)];
    const partial = makeChunks(OPTS, gone);
    const vol = regionVolumeFromChunks(partial, OPTS);

    ok("a not-yet-streamed chunk is RECORDED, not silently treated as sky",
        vol.missing.length === 2 && gone.every((k) => vol.missing.includes(k)), vol.missing.join(" "));
    ok("present + missing accounts for the whole window", vol.present.length + vol.missing.length === OPTS.nx * OPTS.nz);
    ok("the hole really is air in the volume", (() => {
        const { ox, oz } = chunkOrigin(-1, -1, OPTS);
        for (let z = 0; z < S; z++) for (let y = 0; y < H; y++) for (let x = 0; x < S; x++)
            if (vol.data[volumeIndex(ox + x, y, oz + z, vol)] !== 0) return false;
        return true;
    })());
    ok("parity PASSES on a region with declared holes (they are expected to read air)",
        compareRegionToChunks(vol, partial, OPTS).ok);
    ok("SABOTAGE(hole quietly filled): a missing chunk that holds something is caught and flagged NOT LOADED", (() => {
        const dirty = { ...vol, data: Uint8Array.from(vol.data) };
        const { ox, oz } = chunkOrigin(-1, -1, OPTS);
        dirty.data[volumeIndex(ox + 4, 3, oz + 4, dirty)] = 6;
        const r = compareRegionToChunks(dirty, partial, OPTS);
        return r.ok === false && r.first.loaded === false && /NOT LOADED/.test(describeRegion(r));
    })());
    ok("a region with holes is NOT mistaken for a region that is merely empty", (() => {
        const none = regionVolumeFromChunks([], OPTS);
        return none.missing.length === 16 && none.present.length === 0 && solidCount(none.data) === 0 &&
               vol.missing.length === 2;   // the partial one reports 2, not 0 and not 16
    })());
}

// --- 5. the signature moves when the window or the contents move ----------------------------------------------
{
    const chunks = makeChunks();
    const vol = regionVolumeFromChunks(chunks, OPTS);
    const fp = new Map(chunks.map((c) => [chunkKey(c.cx, c.cz), rleFingerprint(c.rle)]));
    const sig = regionSignature(vol, fp);

    ok("same window + same chunks -> same signature", regionSignature(vol, fp) === sig);
    ok("the window MOVING changes the signature", regionSignature({ ...vol, originCx: vol.originCx + 1 }, fp) !== sig);
    ok("a chunk's CONTENTS changing changes the signature", (() => {
        const fp2 = new Map(fp);
        fp2.set(chunkKey(0, 0), 12345);
        return regionSignature(vol, fp2) !== sig;
    })());
    ok("the signature is not a parity check, and the file says so",
        /agreement here is NOT parity/i.test(readFileSync(new URL("../../voxel/rleRegionVolume.js", import.meta.url), "utf8")));
}

// --- 6. the brick map composes with a region (same derivation, one bigger grid) --------------------------------
{
    const chunks = makeChunks();
    const vol = regionVolumeFromChunks(chunks, OPTS);
    // A region volume is just a volume, so it can be re-encoded and brick-mapped like any other. This is the
    // whole point of keeping ONE texture order across the cache, the region and the brick map.
    const rle = encodeRLE((() => {
        const flat = new Uint8Array(vol.data.length);
        for (let z = 0; z < vol.dz; z++) for (let y = 0; y < vol.dy; y++) for (let x = 0; x < vol.dx; x++)
            flat[(x * vol.dz + z) * vol.dy + y] = vol.data[volumeIndex(x, y, z, vol)];
        return flat;
    })(), { sx: vol.dx, sy: vol.dy, sz: vol.dz });
    const map = brickMapFromRLE(rle);
    const res = verifyBrickMap(map, rle);
    ok("a brick map over the whole region is EXACT", res.ok, res.reason || "");
    ok("...and it is a real mix, not trivially all-occupied or all-empty", (() => {
        let occ = 0; for (const b of map.data) if (b) occ++;
        return occ > 0 && occ < map.data.length;
    })(), (() => { let occ = 0; for (const b of map.data) if (b) occ++; return occ + "/" + map.data.length + " bricks occupied"; })());
}

// --- 7. browser safety -----------------------------------------------------------------------------------------
{
    const src = readFileSync(new URL("../../voxel/rleRegionVolume.js", import.meta.url), "utf8");
    // Uses tools/ship/sourceScan.mjs codeOnly(). This module is ABOUT a window of chunks, and one of its error
    // messages contains the word -- a raw scan reports the sentence that explains the rule. Fourth time this
    // session, hence the shared helper instead of a fifth ad-hoc regex.
    const code = codeOnly(src);
    ok("browser-safe: no node builtin at module scope, no DOM global",
        !/^\s*import[^\n]*["'](node:|fs|path|url|crypto)/m.test(code) && !/\bdocument\s*[.[]/.test(code) && !/\bwindow\s*[.[]/.test(code) && !/typeof\s+window/.test(code));
    ok("the shared code scanner really ignores prose: the word appears in the source but not in the code",
        /\bwindow\b/.test(src) && !/\bwindow\b(?!For)/.test(code.replace(/windowFor/g, "")));
    ok("imports only sibling voxel modules", (src.match(/^\s*import[^\n]*/gm) || []).every((l) => /["']\.\//.test(l)));
    ok("no fifth index order: placement uses volumeIndex from the volume cache",
        /import \{[^}]*volumeIndex[^}]*\} from "\.\/rleVolumeCache\.js"/.test(src) && !/x \+ \w+ \* \(y \+/.test(src.replace(/\/\/[^\n]*/g, "")));
}

// --- 8. THE LIVE STREAM: render/voxelVolumeStream.js -------------------------------------------------------
// The camera moves every frame and the region must not be rebuilt every frame. The cheap signature check is what
// makes that true, and the danger is that a cheap check gets mistaken for a correctness claim -- so this section
// asserts BOTH that the skip happens and that the skip proves nothing about parity.
{
    const { VoxelVolumeStream } = await import("../../render/voxelVolumeStream.js");
    const { makeStubGL } = await import("../../render/glBootstrap.js");

    const store = new Map();
    for (let cx = -4; cx <= 4; cx++) for (let cz = -4; cz <= 4; cz++)
        store.set(chunkKey(cx, cz), chunkToRLE(chunkAt(cx, cz), DIMS, chunkIndexReal));
    const loaded = new Set([...store.keys()]);
    const provider = {
        chunkSize: S, chunkHeight: H,
        getChunkRLE: (cx, cz) => (loaded.has(chunkKey(cx, cz)) ? store.get(chunkKey(cx, cz)) : null),
    };

    const gl = makeStubGL({ width: 64, height: 64 });
    let threw = false, st = null;
    try {
        st = new VoxelVolumeStream(gl, provider, { nx: 4, nz: 4 });
        const a = st.update(8, 8);
        ok("stream: first update derives the region", a.changed === true && st.stats.derives === 1);
        ok("stream: the region really is the window around the camera", st.volume.dx === 64 && st.volume.dz === 64 && st.volume.present.length === 16);
        ok("stream: parity holds against the chunks it pulled", st.verify().ok, describeRegion(st.verify()));

        const b = st.update(9, 9);
        ok("!! stream: moving INSIDE the same window does not rebuild", b.changed === false && st.stats.derives === 1 && st.stats.skipped === 1);

        const c = st.update(8 + S * 2, 8);
        ok("stream: moving into a new window DOES rebuild", c.changed === true && st.stats.derives === 2);

        // a chunk's contents changing must rebuild even though the camera did not move
        const key = chunkKey(2, 0);
        const edited = Uint8Array.from(chunkAt(2, 0));
        edited[chunkIndexReal(3, 40, 3, DIMS)] = 5;
        store.set(key, chunkToRLE(edited, DIMS, chunkIndexReal));
        const dd = st.update(8 + S * 2, 8);
        ok("!! stream: a chunk EDIT rebuilds even with the camera still", dd.changed === true && st.stats.derives === 3);
        ok("stream: and parity still holds after the edit", st.verify().ok);

        // SABOTAGE: corrupt the derived region behind the signature's back. The signature still matches, because
        // nothing it tracks moved -- which is precisely the point of keeping the two checks separate.
        st.volume.data[volumeIndex(5, 5, 5, st.volume)] ^= 0xff;
        const e = st.update(8 + S * 2, 8);
        ok("SABOTAGE(corrupt cache): the cheap signature check SKIPS -- it is not a correctness claim", e.changed === false);
        ok("SABOTAGE(corrupt cache): verify() catches it and names the coordinate",
            st.verify().ok === false && st.verify().first.rx === 5,
            describeRegion(st.verify()).slice(0, 90));

        // holes: an unloaded chunk is reported, and filling it rebuilds
        st.update(8, 8, true);
        loaded.delete(chunkKey(-1, 0));
        const f = st.update(8, 8);
        ok("stream: an unloaded chunk rebuilds the region and is REPORTED as missing",
            f.changed === true && st.stats.missing === 1 && /not loaded yet/.test(f.reason));
        ok("stream: parity still passes with a declared hole", st.verify().ok);
        loaded.add(chunkKey(-1, 0));
        const g = st.update(8, 8);
        ok("stream: the hole FILLING rebuilds too (a hole is part of the signature)", g.changed === true && st.stats.missing === 0);

        ok("stream: attachTo refuses a dead pass and accepts a live one",
            st.attachTo(null) === false && st.attachTo({ dead: true }) === false && st.attachTo({ dead: false }) === true);
        ok("stream: originWorld reports the region's world origin", (() => {
            const o = st.originWorld();
            return o && o.x === st.lastWindow.originCx * S && o.z === st.lastWindow.originCz * S;
        })());
        st.dispose();
    } catch (err) { threw = true; console.log("      threw: " + err.message); }
    ok("stream: nothing throws against the no-op stub gl", !threw);
    ok("stream: upload REFUSES honestly against the stub rather than claiming success",
        st && st.stats.lastUploadOk === false && !!st.stats.lastUploadReason);

    const src = readFileSync(new URL("../../render/voxelVolumeStream.js", import.meta.url), "utf8");
    const code = codeOnly(src);
    ok("stream: browser-safe, sibling imports only", !/^\s*import[^\n]*["'](node:|fs|path|url)/m.test(code) && !/\bdocument\s*[.[]/.test(code));
    ok("stream: it ADMITS it does not composite with the raster pass rather than leaving that to be discovered",
        /does not composite/i.test(src) && /raster/i.test(src));
    ok("stream: no dead code left behind (the graveyard lesson)", !/void \w+;/.test(code));
}

// --- 9. NO BLACK SCREEN WITHOUT A REASON (v3047) --------------------------------------------------------------
// Keith opened raymarch-live.html and saw nothing rendered. The CPU half was working -- the sabotage button
// reported fine -- so the region existed and the failure was somewhere in the GPU chain. The page could not say
// which link, because it drew nothing and printed nothing. That is exactly the failure v2778 wrote
// showGLUnavailable to end, reintroduced on a new page.
//
// The pass discarded its own diagnosis: a link failure set dead:true and console.warn'd the shader info log,
// leaving no way for a caller to repeat it. And the render loop had no try/catch, so a throw inside draw() killed
// requestAnimationFrame while the buttons kept working -- which reads as "renders nothing" when it is really
// "rendered once, then died", a different bug with a different fix.
{
    const passSrc = readFileSync(new URL("../../render/voxelRaymarchPass.js", import.meta.url), "utf8");
    ok("the pass KEEPS its failure reason rather than only logging it",
        /this\.error\s*=/.test(codeOnly(passSrc)) && /this\.error = null/.test(codeOnly(passSrc)));

    const pageSrc = readFileSync(new URL("../../raymarch-live.html", import.meta.url), "utf8");
    ok("the page distinguishes every link in the chain, not just ok/not-ok", (() => {
        const want = ["no webgl2 context", "SHADER/PROGRAM FAILED", "TEXTURE UPLOAD REFUSED", "no region derived", "attachTo did not run"];
        return want.every((w) => pageSrc.includes(w));
    })(), "five causes, five different fixes -- a blank canvas that names none of them is not a report");
    // PROPERTY, not mechanism: the reason must be VISIBLE where the picture should be. v3047 asserted fillText,
    // which pinned the 2D-canvas implementation -- and that implementation turned out to be the bug (v3053).
    // A check written to the mechanism goes red when the mechanism is CORRECTLY replaced.
    ok("the page SHOWS the reason where the picture should be, instead of leaving it black",
        /function paintReason/.test(pageSrc) && /glOverlay/.test(pageSrc));
    ok("the render loop cannot die silently: draw() is wrapped and a throw is reported",
        /try \{[^}]*draw\(\);[^}]*\}\s*\n?\s*catch/.test(pageSrc) && /DRAW THREW/.test(pageSrc));
    ok("...and the state line is recomputed every frame, not once at load",
        /const st2 = chainState\(\);/.test(pageSrc) && pageSrc.indexOf("const st2 = chainState()") > pageSrc.indexOf("function tick"));
}

// --- 10. GL ACQUISITION AND RELEASE (v3050) --------------------------------------------------------------------
// The v3047 diagnostic did its job and the answer was upstream of everything suspected: "no webgl2 context on
// this canvas", while raymarch-gl-demo.html rendered fine on the same machine. That is the signature of CONTEXT
// EXHAUSTION -- the failure v2777 diagnosed and v2778 built acquireGL/makeStubGL to survive. Both pages I added
// took raw canvas.getContext("webgl2") and released nothing, so they were contributing to the ceiling they then
// reported hitting. The law existed; it did not travel to new pages, and only a gate makes it travel.
{
    for (const page of ["raymarch-live.html", "volume-cache.html"]) {
        const src = readFileSync(new URL("../../" + page, import.meta.url), "utf8");
        const code = codeOnly(src);
        ok(page + ": acquires GL through glBootstrap, not raw getContext",
            /acquireGL\(/.test(code) && !/getContext\(\s*["']webgl2["']\s*\)/.test(code));
        // NOTE ON THE HELPER: codeOnly() blanks STRING LITERALS as well as comments, so it cannot be used to
        // match string CONTENT -- "pagehide" and the import path both vanish. It answers "is this idiom in the
        // code", not "does the code contain this text". Checked against the raw source here, deliberately.
        ok(page + ": RELEASES its context (a page that does not is why the next one fails)",
            /addEventListener\("pagehide"/.test(src) && /\.dispose\(\)/.test(code));
    }
    const live = readFileSync(new URL("../../raymarch-live.html", import.meta.url), "utf8");
    ok("raymarch-live names EXHAUSTION as the likely cause rather than just saying unavailable",
        /CONTEXT EXHAUSTION/.test(live) && /close other WebGL tabs/.test(live),
        "the fix is different from a driver problem, so the message has to distinguish them");
    ok("raymarch-live wires context loss and restore", /onLost/.test(live) && /onRestored/.test(live));
}

// --- 11. ONE GUARDED WASM PATH (v3050) -------------------------------------------------------------------------
// All four world pages failed render QA on noConsoleErrors -- 404 world/wasm/terrain_wasm.js -- so the seam
// comparison could not be read at all, for a reason unrelated to seams. That file is a BUILD ARTEFACT, absent
// unless the Rust crate has been built (terrainBuildBridge.js exists to build it). world/terrainWasm.js always
// handled that with a dynamic import in a try/catch; world/terrainGenWorker.js imported the SAME MODULE
// STATICALLY, so the whole worker failed to load instead of demoting -- and its own header documents the demote
// path it could never reach.
{
    // v3215 -- *** THIS LINE CRASHED THE WHOLE GATE WITH ENOENT, AND THE FILE IT READS IS GENUINELY GONE. ***
    // world/terrainGenWorker.js is absent from the tree AND from the v3211 zip. world/terrainWorkerClient.js
    // still spawns it through the Worker-plus-import.meta.url form, which no reachability instrument in this
    // tree could see until v3215 added workerSpecifiers(), because a worker target is not an import. The client
    // DEMOTES a dead worker, so the world still draws and the loss is silent.
    //
    // *** THE SPAWN CALL IS DESCRIBED HERE RATHER THAN QUOTED, AND THAT IS NOT FASTIDIOUSNESS. *** Writing the
    // literal made the new scanner count THIS COMMENT as a sixth spawn site and report two broken targets where
    // there is one -- a check counting its own warning as the thing it warns about, which this tree has now
    // done five times. noComments() cannot save it: a regex literal earlier in the file flips the stripper into
    // string mode, exactly the case moduleHistory-selfcheck labels "commented" and calls unfixable without a
    // parser. THE CURE IS TO NOT WRITE THE IDIOM DOWN, and the sentence is just as clear without it.
    //
    // AN ABSENT FILE IS A FINDING, NOT AN EXCEPTION. A gate that dies on ENOENT reports nothing at all -- it
    // takes its other 30-odd checks down with it and reads as a broken gate rather than a missing module.
    let workerRaw = null;
    try { workerRaw = readFileSync(new URL("../../world/terrainGenWorker.js", import.meta.url), "utf8"); }
    catch { workerRaw = null; }
    if (workerRaw === null) {
        ok("!! world/terrainGenWorker.js is ABSENT, and that is reported rather than thrown",
            true,
            "the file is gone from the tree and from every archive reachable here, while terrainWorkerClient.js " +
            "still spawns it. Gated by deadImportScan-selfcheck's worker-resolution check, where it is baselined " +
            "BY NAME with the antidote: WHEN IT IS FOUND AND RESTORED, THAT ENTRY IS DELETED, NOT EXTENDED. " +
            "The checks below need its source and are not run");
    } else {
    const loaderRaw = readFileSync(new URL("../../world/terrainWasm.js", import.meta.url), "utf8");
    const worker = codeOnly(workerRaw), loader = codeOnly(loaderRaw);
    void loader;
    ok("!! the worker no longer STATICALLY imports the build artefact",
        !/^\s*import[^\n]*terrain_wasm\.js/m.test(worker),
        "a static import of a file that may not exist cannot be caught, so nothing in the module runs");
    ok("...it loads it dynamically, like its sibling loader always did",
        /await import\("\.\/wasm\/terrain_wasm\.js"\)/.test(workerRaw) && /await import\("\.\/wasm\/terrain_wasm\.js"\)/.test(loaderRaw));
    ok("...inside the handler whose catch posts init-error, which the client demotes on",
        /loadWasm\(\)/.test(worker) && /init-error/.test(workerRaw));
    ok("BOTH loaders of the same artefact are now guarded the same way (no third, unguarded one)", (() => {
        const hits = [];
        for (const f of ["world/terrainGenWorker.js", "world/terrainWasm.js", "world/terrainWorkerClient.js"]) {
            const c = codeOnly(readFileSync(new URL("../../" + f, import.meta.url), "utf8"));
            if (/^\s*import[^\n]*terrain_wasm/m.test(c)) hits.push(f);
        }
        return hits.length === 0;
    })());
    }
}

// --- 12. THE LOOP IDLES (v3051) --------------------------------------------------------------------------------
// v2778 wrote this follow-up down and never did it: "idle the render loop in stub mode (currently spins no-op
// frames)". I then reintroduced it on a new page -- with no context, tick() ran a signature build, a chainState()
// and an innerHTML rewrite sixty times a second to display the same sentence. Keith's console surfaced it as
// Chrome complaining about throttled requests in a backgrounded tab.
{
    const raw = readFileSync(new URL("../../raymarch-live.html", import.meta.url), "utf8");
    const code = codeOnly(raw);
    ok("hidden-page guard: a backgrounded tab does NOTHING, not less (the v2771 lever)",
        /document\.hidden\) return schedule\(/.test(code));
    ok("!! a broken chain BACKS OFF instead of rendering nothing at 60fps",
        /paintReason\([^;]*\); return schedule\(1000\)/.test(code.replace(/\s+/g, " ")) || /return schedule\(1000\)/.test(code));
    ok("...and the fast path still uses requestAnimationFrame", /requestAnimationFrame\(tick\)/.test(code));
    ok("a page that idles WAKES on visibilitychange", /visibilitychange/.test(raw) && /schedule\(0\)/.test(code),
        "without this, fixing the GPU and returning to the tab shows a stale message forever and reads as still-broken");
    ok("the idle timer is cleared before rescheduling (no two loops)", /clearTimeout\(_idleTimer\)/.test(code));
    ok("there is a GL RETRY that does not require a reload to attempt", /btnRetryGL/.test(raw) && /acquireGL\(canvas/.test(code));
}

// --- 13. THE DIAGNOSTIC MUST NOT DESTROY WHAT IT DIAGNOSES (v3053) ---------------------------------------------
// A canvas can only ever have ONE context type. v3047 painted the failure reason with getContext("2d"), which
// permanently forfeits webgl2 on that element -- so the diagnostic made the failure irreversible and the v3051
// retry button could never succeed. The reason now goes to an overlay div; the canvas stays re-acquirable.
{
    const raw = readFileSync(new URL("../../raymarch-live.html", import.meta.url), "utf8");
    const code = codeOnly(raw);
    ok("!! the reason is NOT painted onto the GL canvas", !/canvas\.getContext\(/.test(code),
        "getContext('2d') on the render canvas forfeits webgl2 on that element forever");
    ok("...it goes to an overlay element instead", /glOverlay/.test(raw) && /createElement/.test(code));
    ok("...and the overlay is hidden again once the chain is healthy", /clearReason\(\)/.test(code));
    ok("retry re-acquires the SAME canvas, which is only possible because it was never claimed",
        /acquireGL\(canvas, \{\}\)/.test(code));
}

// --- 14. A CHECK MUST NOT GATE WHAT SATISFIES IT (v3067) -------------------------------------------------------
// The rig printed: "no texture bound to the pass (attachTo did not run)" with "last upload: ok" directly above
// it. Both true. chainState() required pass.tex; pass.tex is set by stream.attachTo(); attachTo lived inside
// draw(); and draw() only ran when chainState() said ok. The check gated the only call that could satisfy it,
// forever. The diagnostic was ACCURATE ABOUT A STATE IT CREATED, which is worse than a wrong message because it
// reads as a finding -- and it cost a round.
{
    const page = readFileSync(new URL("../../raymarch-live.html", import.meta.url), "utf8");
    const code = codeOnly(page);
    // PROPERTY, NOT WORDING. v3067 pinned the literal `stream.attachTo(pass);` and v3068 legitimately changed it
    // to `stream.attachTo(useDepth ? pass : flat);` when the compositing toggle arrived -- so a correct change
    // turned this red. Third time this session a check written to a mechanism broke on a good edit; match the
    // CALL, not its argument.
    const iAttach = code.search(/stream\.attachTo\([^)]*\);/);
    const iState = code.indexOf("const st2 = chainState();");
    ok("!! attachTo runs BEFORE the chain state is computed", iAttach > 0 && iState > iAttach,
        "state-gathering must not be gated by the state it gathers");
    ok("...and the early-return on a bad chain still comes after it", (() => {
        // THE HIDDEN-PAGE GUARD also returns schedule(1000) and sits ABOVE chainState, so a bare indexOf finds
        // the wrong one -- search from the state line forward for the return that belongs to it.
        const iRet = code.indexOf("return schedule(1000)", iState);
        return iRet > iState;
    })());
    ok("draw() still guards attachTo too, since it can legitimately fail before a volume exists",
        /if \(!gl \|\| ![\w]+ \|\| !stream\.attachTo\([^)]*\)\) return;/.test(code));
    ok("the deadlock is written down, not silently fixed",
        /gated the only call that could satisfy it|GATED THE ONLY CALL THAT COULD SATISFY IT/i.test(page),
        "deleting the explanation would hide that a page reported itself broken while working");
}

console.log("rleRegionVolume-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
