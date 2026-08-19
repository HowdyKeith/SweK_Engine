// render/voxelVolumeStream.js
//
// THE LIVE WIRING (v3045). Keeps a region volume around the camera, re-derives it only when something it depends
// on has actually moved, uploads it as an R8UI 3D texture, and hands it to the ray-march pass. This is the piece
// the arc has been missing since v2783, where the note read "a full world won't fit one 3D texture -- per-chunk
// textures or a brick/pointer scheme". The answer turned out to be neither: one texture over a WINDOW of chunks.
//
// WHAT IT DOES NOT DO, stated plainly rather than discovered later: it does not composite with the raster pass.
// There is no depth exchange between the ray march and the meshed world, so this draws the region on its own.
// Compositing needs a depth write from the marcher and a matching projection, and that is a separate piece of
// work with its own answer key. Flag-gated, default off, and the raster path is untouched.
//
// THE CHEAP CHECK AND THE REAL CHECK ARE DIFFERENT, AND BOTH ARE HERE.
//   update()  uses regionSignature -- window origin plus each chunk's fingerprint. It answers "has anything we
//             track changed", cheaply, every frame. A match means SKIP THE WORK. It is not a correctness claim.
//   verify()  walks every voxel against the chunks and reports the first divergence with coordinates. It is a
//             gate-time operation, called deliberately, and it never repairs anything.
// Conflating those two is how a cache gets called verified because a hash agreed.
//
// Browser-safe: imports sibling voxel/render modules only, no DOM, no node builtins.

import { regionVolumeFromChunks, compareRegionToChunks, regionSignature, windowFor, chunkKey } from "../voxel/rleRegionVolume.js";
import { rleFingerprint } from "../voxel/rleVolumeCache.js";
import { createVolumeTexture, uploadVolume, disposeVolumeTexture } from "./volumeTexture.js";

export const DEFAULT_WINDOW = { nx: 4, nz: 4 };

export class VoxelVolumeStream {
    /**
     * gl        -- a WebGL2 context (or glBootstrap's stub; every GPU call refuses honestly against it)
     * provider  -- { chunkSize, chunkHeight, getChunkRLE(cx, cz) -> rle | null }
     *              getChunkRLE returns null for a chunk that has not streamed in. That is NOT an error and NOT
     *              air: the region records it as missing so a caller can tell a hole from open sky.
     * opts      -- { nx, nz, uint }
     */
    constructor(gl, provider, opts = {}) {
        this.gl = gl;
        this.provider = provider;
        this.nx = opts.nx || DEFAULT_WINDOW.nx;
        this.nz = opts.nz || DEFAULT_WINDOW.nz;
        this.tex = null;
        this.volume = null;
        this.brick = null;
        this.signature = null;
        this.lastWindow = null;
        this.stats = { derives: 0, uploads: 0, skipped: 0, missing: 0, lastDeriveMs: 0, lastUploadOk: null, lastUploadReason: null };
    }

    _opts(win) {
        return { ...win, chunkSize: this.provider.chunkSize, chunkHeight: this.provider.chunkHeight };
    }

    _collect(win) {
        const chunks = [], fingerprints = new Map();
        for (let j = 0; j < win.nz; j++)
            for (let i = 0; i < win.nx; i++) {
                const cx = win.originCx + i, cz = win.originCz + j;
                const rle = this.provider.getChunkRLE(cx, cz);
                const key = chunkKey(cx, cz);
                if (rle) { chunks.push({ cx, cz, rle }); fingerprints.set(key, rleFingerprint(rle)); }
                else fingerprints.set(key, "-");     // a hole is part of the signature: it changes when it fills
            }
        return { chunks, fingerprints };
    }

    /**
     * Call every frame with the camera's world position. Returns { changed, reason }. Does the derive+upload only
     * when the signature moved -- a camera panning inside one chunk costs a signature build and nothing else.
     */
    update(worldX, worldZ, force = false) {
        const win = windowFor(worldX, worldZ, { nx: this.nx, nz: this.nz, chunkSize: this.provider.chunkSize, chunkHeight: this.provider.chunkHeight });
        const opts = this._opts(win);
        const { chunks, fingerprints } = this._collect(win);
        const sig = regionSignature({ ...opts }, fingerprints);

        if (!force && sig === this.signature && this.volume) { this.stats.skipped++; return { changed: false, reason: "signature unchanged" }; }

        const t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : 0;
        this.volume = regionVolumeFromChunks(chunks, opts);
        this.stats.lastDeriveMs = ((typeof performance !== "undefined" && performance.now) ? performance.now() : 0) - t0;
        this.stats.derives++;
        this.stats.missing = this.volume.missing.length;
        this.signature = sig;
        this.lastWindow = opts;
        this._chunks = chunks;

        if (!this.tex) this.tex = createVolumeTexture(this.gl);
        const up = uploadVolume(this.gl, this.tex, this.volume);
        this.stats.uploads++;
        this.stats.lastUploadOk = up.ok;
        this.stats.lastUploadReason = up.reason;
        return { changed: true, reason: this.volume.missing.length ? (this.volume.missing.length + " chunk(s) not loaded yet") : "region rebuilt" };
    }

    /** Bind the region into a VoxelRaymarchPass built with { uint: true }. Returns false if there is nothing to draw. */
    attachTo(pass) {
        if (!pass || pass.dead || !this.volume) return false;
        pass.tex = this.tex;
        pass.dims = [this.volume.dx, this.volume.dy, this.volume.dz];
        return true;
    }

    /** World-space origin of the region, so a camera can be expressed in region coordinates. */
    originWorld() {
        if (!this.lastWindow) return null;
        const w = this.lastWindow;
        return { x: w.originCx * w.chunkSize, y: 0, z: w.originCz * w.chunkSize };
    }

    /** THE REAL CHECK. Deliberate, gate-time, read-only, never repairs. */
    verify() {
        if (!this.volume) return { ok: false, checked: 0, first: null, reason: "nothing derived yet" };
        return compareRegionToChunks(this.volume, this._chunks || [], this.lastWindow);
    }

    dispose() {
        disposeVolumeTexture(this.gl, this.tex);
        this.tex = null; this.volume = null; this.signature = null;
    }
}

// Adapter: the real engine world (world/world.js, chunks of world/chunk.js in x + sx*z + sx*sz*y order) exposed
// as a provider. Injected rather than imported so the gate can drive this with a fake world and the page can
// drive it with a generated one -- and so this module never reaches into the live world's internals.
export function providerFromChunkGetter(getChunk, chunkSize, chunkHeight, toRLE) {
    return {
        chunkSize, chunkHeight,
        getChunkRLE(cx, cz) {
            const c = getChunk(cx, cz);
            if (!c) return null;
            return toRLE(c, cx, cz);
        },
    };
}
