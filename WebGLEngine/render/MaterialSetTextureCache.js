// ============================================================================
// render/MaterialSetTextureCache.js
//
// Round 177 — manages GL textures derived from the materialSets registry.
// Renderers query it for a kind ("kaiju_water", "civ_tower") and get
// back a small struct with three WebGLTexture handles (albedo / height
// / normal) ready to bind, or null if not yet loaded / not registered.
//
// Why this isn't part of materialSets itself: materialSets stores
// dataURLs (portable, persistable). Textures need a GL context, and
// uploading the same dataURL into multiple contexts would duplicate
// work. This cache lives next to the renderer that uses it, owns its
// own GL textures, and disposes them cleanly.
//
// Lifecycle:
//   - Constructed with a GL context
//   - Subscribes to materialSets.addListener for changes
//   - On `register`: kicks off async upload, marks the kind as "uploading"
//   - On `remove` / `clear`: deletes the GL textures for affected kinds
//   - Renderers call `get(kind)` per frame; returns either a ready
//     triplet or null. They never block.
//
// Memory: each material set is 3 × ~512px PNG decoded. Worst case
// ~3MB GPU memory per kind. With 16 kinds max in the registry that's
// ~50MB worst case — well within budget for a 1080.
// ============================================================================

import { materialSets } from "../ai/MaterialSetRegistry.js";

export class MaterialSetTextureCache {
    constructor(gl) {
        this.gl = gl;
        // Map<kind, { state, albedo?, height?, normal? }>
        // state ∈ "uploading" | "ready" | "failed"
        this._entries = new Map();
        // Track in-flight uploads so a late-arriving listener event
        // doesn't double-fire on the same kind.
        this._uploading = new Set();

        // Initial seed from any sets already in the registry (restored
        // from localStorage on boot, in which case the renderer is
        // constructed after main.js has already populated them).
        for (const meta of materialSets.list()) {
            this._beginUpload(meta.kind);
        }

        // Subscribe for changes. Note: we intentionally don't keep a
        // reference to the listener fn for removal — the cache lives
        // for the lifetime of the renderer, which lives for the
        // lifetime of the page. If that changes we'd need to track it.
        materialSets.addListener((event) => this._onRegistryEvent(event));
    }

    // Public: synchronous lookup. Returns null if not registered, not
    // yet loaded, or failed. Renderers don't await — they just check
    // each frame.
    get(kind) {
        const e = this._entries.get(kind);
        if (!e || e.state !== "ready") return null;
        return { albedo: e.albedo, height: e.height, normal: e.normal };
    }

    // Public: is this kind known to the cache at all? Useful for
    // debugging.
    has(kind) {
        return this._entries.has(kind);
    }

    _onRegistryEvent(event) {
        if (event.type === "register") {
            this._beginUpload(event.kind);
        } else if (event.type === "remove") {
            this._dispose(event.kind);
        } else if (event.type === "clear") {
            for (const k of this._entries.keys()) this._dispose(k);
        }
    }

    _beginUpload(kind) {
        if (this._uploading.has(kind)) return;   // already in flight
        const set = materialSets.get(kind);
        if (!set) return;
        // Need all three dataURLs to do parallax. If any is missing
        // skip — better to fall back to the base-color path than to
        // bind null textures.
        if (!set.albedo?.dataUrl || !set.height?.dataUrl || !set.normal?.dataUrl) {
            console.warn(`[MaterialSetTextureCache] kind "${kind}" missing one of albedo/height/normal — not uploading`);
            return;
        }
        // Dispose old textures (if any) before re-uploading so a
        // re-register with new content actually shows the new content.
        this._dispose(kind);
        this._uploading.add(kind);
        this._entries.set(kind, { state: "uploading" });

        Promise.all([
            this._uploadDataUrl(set.albedo.dataUrl, /*srgb*/ true),
            this._uploadDataUrl(set.height.dataUrl, /*srgb*/ false),
            this._uploadDataUrl(set.normal.dataUrl, /*srgb*/ false),
        ]).then(([albedo, height, normal]) => {
            this._uploading.delete(kind);
            if (!albedo || !height || !normal) {
                this._entries.set(kind, { state: "failed" });
                return;
            }
            this._entries.set(kind, { state: "ready", albedo, height, normal });
            console.log(`[MaterialSetTextureCache] kind "${kind}" ready (3 textures uploaded)`);
        }).catch((err) => {
            this._uploading.delete(kind);
            this._entries.set(kind, { state: "failed" });
            console.warn(`[MaterialSetTextureCache] upload failed for "${kind}":`, err.message);
        });
    }

    _uploadDataUrl(dataUrl, srgb) {
        return new Promise((resolve) => {
            if (!dataUrl) { resolve(null); return; }
            const img = new Image();
            img.onload = () => {
                const gl = this.gl;
                const tex = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                // srgb=true for albedo so the linear-space lighting
                // math is correct. height/normal are data textures —
                // sRGB would corrupt them.
                if (srgb && gl.SRGB8_ALPHA8) {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8,
                                  img.width, img.height, 0,
                                  gl.RGBA, gl.UNSIGNED_BYTE, img);
                } else {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
                                  gl.RGBA, gl.UNSIGNED_BYTE, img);
                }
                gl.generateMipmap(gl.TEXTURE_2D);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                // REPEAT so the material tiles across larger meshes
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
                resolve(tex);
            };
            img.onerror = () => resolve(null);
            img.src = dataUrl;
        });
    }

    _dispose(kind) {
        const e = this._entries.get(kind);
        if (!e) return;
        if (e.albedo) this.gl.deleteTexture(e.albedo);
        if (e.height) this.gl.deleteTexture(e.height);
        if (e.normal) this.gl.deleteTexture(e.normal);
        this._entries.delete(kind);
    }
}
