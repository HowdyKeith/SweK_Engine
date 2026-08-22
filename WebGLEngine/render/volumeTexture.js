// render/volumeTexture.js
//
// The GPU half of the derived voxel cache (v3041). Uploads a voxel volume as an R8UI 3D texture, patches
// sub-regions with texSubImage3D, and -- the part that matters -- READS THE TEXTURE BACK and compares it to the
// buffer it came from, reporting the first divergent (x,y,z) instead of repairing it.
//
// WHY R8UI AND NOT R8. The existing ray-march path (render/voxelRaymarchShader.js FRAG_SRC) uploads R8 (unorm)
// and recovers the material id in the shader with int(texelFetch(...).r * 255.0 + 0.5). Voxels here carry a TYPE,
// not just occupancy -- the palette colours grass tops and dirt risers differently, which is rig-confirmed -- so
// that expression is a float round-trip in the middle of an integer lookup. R8UI + usampler3D returns the byte
// itself: exact by construction, no scale, no epsilon, no rounding to trust.
//
// To be honest about it: the unorm round-trip is NOT currently broken. The gate audits all 256 byte values
// through float32 and they all land right, and that result is kept rather than quietly dropped. What R8UI buys
// is that the correctness stops depending on that arithmetic happening to work, which is a different and better
// thing to depend on. The unorm path is untouched and still default.
//
// FILTERING IS NOT AN OPTION HERE, AND THAT IS DELIBERATE. Integer textures are unfilterable by rule: an R8UI
// texture with a LINEAR filter is incomplete and samples as zero. That is a feature. A filtered sample at a
// voxel boundary returns something between solid and empty, and a DDA marcher needs exact solid/empty -- a
// blurred occupancy would make the traversal answer change with sampler state rather than with the world. Every
// access below is texelFetch at integer coordinates. There is no sampler anywhere in this file.
//
// READBACK IS A GATE-TIME OPERATION. readPixels stalls the pipeline; this is for proving the upload path once and
// on change, on a fixture, not for running every frame. Stub-safe: against glBootstrap's no-op stub (or a lost
// context) every function returns an honest refusal with a reason rather than throwing or returning a fake pass.
//
// Browser-safe: no imports, no node builtins.

function contextUsable(gl) {
    if (!gl) return "no gl context";
    try { if (gl.isContextLost && gl.isContextLost()) return "gl context is lost or stubbed"; } catch { return "gl context unusable"; }
    return null;
}

export function createVolumeTexture(gl) {
    const bad = contextUsable(gl);
    if (bad) return null;
    try { return gl.createTexture(); } catch { return null; }
}

// Upload the whole volume. vol is { data, dx, dy, dz } from voxel/rleVolumeCache.js.
// Returns { ok, reason }. NEAREST on both filters is mandatory, not a preference (see the header).
export function uploadVolume(gl, tex, vol) {
    const bad = contextUsable(gl);
    if (bad) return { ok: false, reason: bad };
    if (!tex) return { ok: false, reason: "no texture" };
    try {
        gl.bindTexture(gl.TEXTURE_3D, tex);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8UI, vol.dx, vol.dy, vol.dz, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, vol.data);
        return { ok: true, reason: null };
    } catch (e) {
        return { ok: false, reason: String((e && e.message) || e) };
    }
}

// Patch one box. patch is { x0, y0, z0, w, h, d, data } from regionFromRLE -- the sub-block byte order is
// already what texSubImage3D expects, so bandwidth is proportional to the edit and not to the world.
export function uploadRegion(gl, tex, patch) {
    const bad = contextUsable(gl);
    if (bad) return { ok: false, reason: bad };
    if (!tex) return { ok: false, reason: "no texture" };
    try {
        gl.bindTexture(gl.TEXTURE_3D, tex);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texSubImage3D(gl.TEXTURE_3D, 0, patch.x0, patch.y0, patch.z0, patch.w, patch.h, patch.d,
                         gl.RED_INTEGER, gl.UNSIGNED_BYTE, patch.data);
        return { ok: true, reason: null };
    } catch (e) {
        return { ok: false, reason: String((e && e.message) || e) };
    }
}

// Read the texture back, one Z slice at a time, through a framebuffer bound to that layer. R8UI is
// colour-renderable, so this is a legal attachment; the format/type pair is queried rather than assumed, and a
// driver that reports something else gets an honest refusal instead of a buffer of garbage compared as truth.
// Returns { ok, data, reason } with data in the same X-fastest volume order as the upload.
export function readbackVolume(gl, tex, dx, dy, dz) {
    const bad = contextUsable(gl);
    if (bad) return { ok: false, data: null, reason: bad };
    if (!tex) return { ok: false, data: null, reason: "no texture" };
    let fb = null;
    try {
        fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, tex, 0, 0);
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            return { ok: false, data: null, reason: "framebuffer incomplete (status " + status + ") -- R8UI not renderable here" };
        }
        const fmt = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT);
        const typ = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);
        if (fmt !== gl.RED_INTEGER || typ !== gl.UNSIGNED_BYTE) {
            return { ok: false, data: null, reason: "driver reads R8UI as format " + fmt + " / type " + typ +
                     " (wanted RED_INTEGER / UNSIGNED_BYTE) -- refusing to compare a reinterpreted buffer" };
        }
        gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
        const out = new Uint8Array(dx * dy * dz);
        const slice = new Uint8Array(dx * dy);
        for (let z = 0; z < dz; z++) {
            gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, tex, 0, z);
            gl.readPixels(0, 0, dx, dy, gl.RED_INTEGER, gl.UNSIGNED_BYTE, slice);
            out.set(slice, z * dx * dy);
        }
        return { ok: true, data: out, reason: null };
    } catch (e) {
        return { ok: false, data: null, reason: String((e && e.message) || e) };
    } finally {
        try { gl.bindFramebuffer(gl.FRAMEBUFFER, null); if (fb) gl.deleteFramebuffer(fb); } catch {}
    }
}

// Prove the upload path: what the GPU holds equals what we sent, voxel by voxel. On divergence it names the
// coordinate and stops. It does NOT re-upload. A GPU/CPU disagreement is one of three different bugs -- the
// upload was wrong, the shader is wrong, or the source moved underneath -- and each has a different fix. Silently
// re-uploading destroys the only evidence that tells them apart.
export function verifyUpload(gl, tex, vol) {
    const rb = readbackVolume(gl, tex, vol.dx, vol.dy, vol.dz);
    if (!rb.ok) return { ok: false, checked: 0, first: null, reason: rb.reason };
    return compareBuffers(rb.data, vol);
}

// Position-sensitive comparison of a read-back buffer against the volume, in volume order. Split out so the gate
// can drive it with a synthetic readback and prove it has detection power without a GPU.
export function compareBuffers(readback, vol) {
    if (!readback || readback.length !== vol.data.length) {
        return { ok: false, checked: 0, first: null, reason: "readback length " + (readback ? readback.length : "null") +
                 " != volume length " + vol.data.length };
    }
    for (let z = 0; z < vol.dz; z++)
        for (let y = 0; y < vol.dy; y++)
            for (let x = 0; x < vol.dx; x++) {
                const i = x + vol.dx * (y + vol.dy * z);
                if (readback[i] !== vol.data[i]) {
                    return { ok: false, checked: i + 1, reason: null,
                             first: { x, y, z, expected: vol.data[i], actual: readback[i] } };
                }
            }
    return { ok: true, checked: vol.data.length, first: null, reason: null };
}

export function disposeVolumeTexture(gl, tex) {
    try { if (gl && tex) gl.deleteTexture(tex); } catch {}
}
