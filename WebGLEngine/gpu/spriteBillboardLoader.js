// FILE: gpu/spriteBillboardLoader.js
// VERSION: v1 — round 195 (v690 work)
//
// Generalizes the WAD-sprite billboard pipeline to accept arbitrary PNG
// sprites for non-Doom use cases like tree decor, asteroids, NPC characters.
//
// The engine's existing wadBillboardRenderer (render/wadBillboardRenderer.js)
// + BillboardManager (tools/wadBillboards.js) together form a complete
// camera-facing alpha-tested sprite renderer with NEAREST filtering. It
// expects frames in the shape { width, height, rgba: Uint8Array }, looks
// them up by a "name+frame+rot" key, and draws them as Y-axis billboards
// (always face camera horizontally; vertical axis fixed). That's exactly
// what we want for static decor like trees.
//
// This module:
//   1. Ensures window._wadBillboards exists as a BillboardManager singleton
//      (so the renderer has something to draw — it gates on that variable).
//   2. Provides loadSpritePNG(url) → Promise<{width,height,rgba}> using
//      a hidden canvas + getImageData. RGBA bytes, no premultiplied alpha.
//   3. Provides registerSprite(name, frame, rot, url) → Promise<key> that
//      combines load + register in one call.
//   4. Provides spawnSpriteBillboard({name, x, y, z, scale}) — same as
//      BillboardManager.spawn, but ensures the manager exists.
//
// All sprites registered through this module use frame "A" and rot "0" by
// default — the rot field is for 8-direction Doom-monster sheets where
// rotation 1-8 picks a view angle. Static decor doesn't need that, so we
// use "0" (which the BillboardManager treats as "always render this frame
// regardless of view angle").
//
// Cache: a separate Map by URL avoids re-decoding the same PNG. The
// BillboardManager also caches by "NAME+FRAME+ROT", so calling
// registerSprite() twice with the same args is idempotent (cheap).

import { BillboardManager } from "../tools/wadBillboards.js";

const _decodeCache = new Map();   // url → { width, height, rgba }

/**
 * Get or create the singleton BillboardManager that the wadBillboardRenderer
 * draws from. The renderer reads window._wadBillboards each frame — set it
 * once, attach sprites, the renderer picks them up.
 *
 * Returns the manager so callers can call spawn() / despawn() / etc. on it.
 */
export function ensureBillboardManager() {
    if (typeof window === "undefined") return null;
    let bm = window._wadBillboards;
    if (!bm) {
        bm = new BillboardManager();
        window._wadBillboards = bm;
    }
    return bm;
}

/**
 * Load a PNG from a URL and return its pixel data in the shape
 * BillboardManager expects.
 *
 * Uses a hidden canvas so transparency / alpha works correctly. The
 * canvas is 2d-context, no premultiplied alpha (the renderer's blend
 * mode discards transparent pixels via `discard` in the fragment
 * shader, not alpha-blend, so non-premultiplied is fine).
 *
 * Caches by URL — second call with the same URL returns the cached
 * frame instantly without re-decoding.
 */
export async function loadSpritePNG(url) {
    if (_decodeCache.has(url)) return _decodeCache.get(url);
    const img = await new Promise((res, rej) => {
        const im = new Image();
        im.crossOrigin = "anonymous";
        im.onload  = () => res(im);
        im.onerror = (e) => rej(new Error("PNG load failed: " + url));
        im.src = url;
    });
    const cv = document.createElement("canvas");
    cv.width = img.naturalWidth;
    cv.height = img.naturalHeight;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    // Disable smoothing — keeps pixel art crisp through any browser scaling
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);
    const id = ctx.getImageData(0, 0, cv.width, cv.height);
    const frame = {
        width:  cv.width,
        height: cv.height,
        rgba:   new Uint8Array(id.data.buffer.slice(0)),   // copy out of canvas-backed buffer
    };
    _decodeCache.set(url, frame);
    return frame;
}

/**
 * Load + register a sprite as a BillboardManager frame. Defaults match the
 * "static decor" convention: frame "A", rot "0".
 *
 *   const key = await registerSprite("tree_oak_1", "/textures/sprites/trees/tree_oak_1.png");
 *   // BillboardManager now has key "tree_oak_1A0" ready to spawn.
 */
export async function registerSprite(name, url, opts = {}) {
    const frame = opts.frame ?? "A";
    const rot   = opts.rot   ?? "0";
    const data  = await loadSpritePNG(url);
    const bm    = ensureBillboardManager();
    if (!bm) throw new Error("registerSprite: no window available");
    return bm.registerFrame(name, frame, rot, data);
}

/**
 * Spawn a billboard at world coords. Returns its id (call despawn(id) to
 * remove). The frame referred to by `name` must already be registered.
 */
export function spawnSpriteBillboard(opts) {
    const bm = ensureBillboardManager();
    if (!bm) return -1;
    return bm.spawn({
        x: opts.x ?? 0,
        y: opts.y ?? 0,
        z: opts.z ?? 0,
        name:  opts.name  ?? "untitled",
        frame: opts.frame ?? "A",
        rot:   opts.rot   ?? "0",
        scale: opts.scale ?? 1,
        tag:   opts.tag,
    });
}

/** Remove a sprite billboard. Cheap. */
export function despawnSpriteBillboard(id) {
    const bm = (typeof window !== "undefined") ? window._wadBillboards : null;
    if (!bm) return;
    try { bm.despawn(id); } catch {}
}

/**
 * v697 — Sprite animation round 2. Load a horizontal sprite-sheet PNG
 * and register each frame as a separate BillboardManager frame.
 *
 * Layout assumption: ONE PNG, N frames laid out left-to-right, each
 * `frameWidth` pixels wide. (Grid or vertical layouts can be added
 * later if a use case demands.) Frames are registered as letters A,
 * B, C, ... up to Z; 27+ frames would overflow but is well past any
 * Doom-style sprite animation.
 *
 *   await registerSpriteSheet({
 *       name: "torch",
 *       url:  "/textures/sprites/effects/torch_sheet.png",
 *       frameCount: 4,
 *       frameWidth: 32,    // auto-detected from PNG width / frameCount if omitted
 *   });
 *   // Now "torchA0", "torchB0", "torchC0", "torchD0" exist on the BillboardManager.
 *
 *   spawnAnimatedSpriteBillboard({
 *       name: "torch", frames: ["A","B","C","D"], fps: 8,
 *       x: 0, y: 2, z: 0, scale: 1.5,
 *   });
 */
export async function registerSpriteSheet({ name, url, frameCount, frameWidth, frameHeight, rot = "0" }) {
    if (!name)  throw new Error("registerSpriteSheet: name required");
    if (!url)   throw new Error("registerSpriteSheet: url required");
    if (!frameCount || frameCount < 1) throw new Error("registerSpriteSheet: frameCount must be >= 1");
    if (frameCount > 26) throw new Error("registerSpriteSheet: frameCount > 26 — only A-Z supported");

    const sheet = await loadSpritePNG(url);
    const fw = frameWidth  || Math.floor(sheet.width / frameCount);
    const fh = frameHeight || sheet.height;
    if (fw * frameCount > sheet.width) {
        throw new Error(`sheet ${sheet.width}px wide can't hold ${frameCount}×${fw}px frames`);
    }

    const bm = ensureBillboardManager();
    if (!bm) throw new Error("registerSpriteSheet: no window/BillboardManager");

    const letters = [];
    for (let i = 0; i < frameCount; i++) {
        // Slice the sub-rectangle for this frame
        const sub = new Uint8Array(fw * fh * 4);
        const sx0 = i * fw;
        for (let y = 0; y < fh; y++) {
            const srcRow = ((y * sheet.width) + sx0) * 4;
            const dstRow = y * fw * 4;
            sub.set(sheet.rgba.subarray(srcRow, srcRow + fw * 4), dstRow);
        }
        const letter = String.fromCharCode(65 + i);  // A=65
        bm.registerFrame(name, letter, rot, { width: fw, height: fh, rgba: sub });
        letters.push(letter);
    }
    return letters;   // ["A","B","C","D"]
}

/**
 * v697 — Spawn + animate in one call. Convenience wrapper that calls
 * spawn() then setAnimation(). The frames you pass must already be
 * registered (typically via registerSpriteSheet above).
 */
export function spawnAnimatedSpriteBillboard(opts) {
    const bm = ensureBillboardManager();
    if (!bm) return -1;
    const id = bm.spawn({
        x: opts.x ?? 0,
        y: opts.y ?? 0,
        z: opts.z ?? 0,
        name:  opts.name  ?? "untitled",
        frame: (opts.frames && opts.frames[0]) || "A",
        rot:   opts.rot   ?? "0",
        scale: opts.scale ?? 1,
        tag:   opts.tag,
    });
    if (opts.frames && opts.frames.length > 1) {
        bm.setAnimation(id, {
            frames: opts.frames,
            fps:    opts.fps ?? 4,
            loop:   opts.loop !== false,
        });
    }
    return id;
}

/**
 * v699 — Decode a list of `data:image/png;base64,...` URLs into per-frame
 * RGBA data and register each as a BillboardManager frame under
 * `${name}${A|B|C...}${rot}`. Returns the array of frame letters used.
 * Used by the auto-gen pipeline (frames come back as base64 from
 * /diffuser/generate) without needing to assemble a sheet first.
 */
export async function registerFramesFromDataUrls({ name, urls, rot = "0" }) {
    if (!name) throw new Error("registerFramesFromDataUrls: name required");
    if (!Array.isArray(urls) || !urls.length) throw new Error("registerFramesFromDataUrls: urls required");
    if (urls.length > 26) throw new Error("registerFramesFromDataUrls: >26 frames (A-Z) not supported");
    const bm = ensureBillboardManager();
    if (!bm) throw new Error("registerFramesFromDataUrls: no BillboardManager");
    const letters = [];
    for (let i = 0; i < urls.length; i++) {
        const img = await new Promise((res, rej) => {
            const im = new Image();
            im.onload = () => res(im);
            im.onerror = () => rej(new Error("decode failed for frame " + i));
            im.src = urls[i];
        });
        const cv = document.createElement("canvas");
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0);
        const id = ctx.getImageData(0, 0, cv.width, cv.height);
        const letter = String.fromCharCode(65 + i);
        bm.registerFrame(name, letter, rot, {
            width: cv.width, height: cv.height,
            rgba: new Uint8Array(id.data.buffer.slice(0)),
        });
        letters.push(letter);
    }
    return letters;
}

/**
 * v699 — Auto-generate a sprite via the local OllamaDiffuser bridge.
 * Posts {prompt, frames, seed?} to /diffuser/generate; the bridge proxies
 * to OllamaDiffuser's /api/generate and returns base64 PNGs. The frames
 * are registered + (optionally) spawned at the camera. Local path means
 * fast (~15-30s per frame on 8GB cards) but requires the diffuser to be
 * running (POST /diffuser/launch first).
 *
 * v700 — added consistency option:
 *   consistency: "off"          plain text-to-image per frame (default)
 *   consistency: "chained"      frame 1 plain, frames 2..N img2img from frame 1
 *   consistency: "reference"    every frame img2img from opts.referenceImage
 *
 * `strength` (0..1) controls img2img influence — lower = closer to reference,
 * higher = freer interpretation. 0.55 default is a good sprite-frame zone.
 */
export async function generateSpriteLocal({ prompt, name, frames = 1, fps = 4,
                                            width = 512, height = 512, seed,
                                            consistency = "off", strength = 0.55,
                                            referenceImage = null,
                                            spawn = false, spawnAt }) {
    if (!prompt) throw new Error("generateSpriteLocal: prompt required");
    const safeName = String(name || ("gen_" + Date.now())).replace(/[^a-zA-Z0-9_-]/g, "_");
    const r = await fetch("/diffuser/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            prompt, frames, width, height, seed,
            chainFromFirst: consistency === "chained",
            referenceImage: consistency === "reference" ? referenceImage : null,
            strength,
        }),
    });
    const j = await r.json().catch(() => ({ ok: false, error: "non-JSON response" }));
    if (!j.ok) throw new Error("diffuser: " + (j.error || r.statusText));
    const letters = await registerFramesFromDataUrls({ name: safeName, urls: j.images });
    let id = -1;
    if (spawn) {
        id = spawnAnimatedSpriteBillboard({
            name: safeName, frames: letters, fps,
            x: spawnAt?.x ?? 0, y: spawnAt?.y ?? 0, z: spawnAt?.z ?? 0,
            scale: spawnAt?.scale ?? 1,
        });
    }
    return { name: safeName, frames: letters, took_ms: j.took_ms, seed: j.seed, consistency: j.consistency, id };
}

/**
 * v700 — Once all N Kaggle z_image jobs for a sprite have completed,
 * pull their output PNGs through the bridge's /sprite/assemble-kaggle
 * endpoint (per-slug tmp dirs so output.png files don't collide), register
 * them as a sprite's frames, and optionally spawn. Pass the slugs in
 * frame-order (the same order /sprite/generate-kaggle returned them).
 */
export async function assembleSpriteKaggle({ name, slugs, fps = 4,
                                             spawn = false, spawnAt }) {
    if (!name) throw new Error("assembleSpriteKaggle: name required");
    if (!Array.isArray(slugs) || !slugs.length) throw new Error("assembleSpriteKaggle: slugs required");
    const r = await fetch("/sprite/assemble-kaggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slugs }),
    });
    const j = await r.json().catch(() => ({ ok: false, error: "non-JSON response" }));
    if (!j.frames || !j.frames.length) throw new Error("kaggle assemble: " + (j.error || "no frames downloaded — " + JSON.stringify(j.errors || [])));
    const letters = await registerFramesFromDataUrls({ name, urls: j.frames });
    let id = -1;
    if (spawn) {
        id = spawnAnimatedSpriteBillboard({
            name, frames: letters, fps,
            x: spawnAt?.x ?? 0, y: spawnAt?.y ?? 0, z: spawnAt?.z ?? 0,
            scale: spawnAt?.scale ?? 1,
        });
    }
    return { name, frames: letters, framesCount: j.frames.length, errors: j.errors || [], id };
}

/**
 * v699 — Auto-generate a sprite via Kaggle. Submits N z_image jobs (one
 * per frame) tagged ["sprite", "frame:<name>:<i>"]. Returns immediately
 * with the submitted slugs; the existing Kaggle reconciler downloads
 * completed PNGs into GPU_Assets/. Use this when you don't have the
 * local diffuser available — slow first-run (15-25 min) unless z_image
 * has a cached Kaggle Dataset configured (see /kaggle/datasets/cache).
 *
 * Returns: { name, frames, baseSeed, submits: [{ok, frame, slug?, error?}] }
 *
 * Auto-assembly when all N complete is via assembleSpriteKaggle (v700).
 */
export async function generateSpriteKaggle({ prompt, name, frames = 1, seed,
                                             width = 512, height = 512, steps }) {
    if (!prompt) throw new Error("generateSpriteKaggle: prompt required");
    const r = await fetch("/sprite/generate-kaggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, name, frames, seed, width, height, steps }),
    });
    const j = await r.json().catch(() => ({ ok: false, error: "non-JSON response" }));
    if (!j.ok) throw new Error("kaggle submit: " + (j.error || r.statusText));
    return j;
}

/**
 * v699 — Sprite animation round 2 + 8-direction. Load a sheet laid out
 * as ROT_COUNT rows × FRAME_COUNT columns. Each cell registers as
 * `name + frameLetter(A..) + rotIndex("1".."8")`, matching the
 * Doom WAD convention.
 *
 * Layout assumption: 8 rows (rotations 1..8 top-to-bottom), N columns
 * (frames A..Z left-to-right). Frame width = sheetW/frameCount; frame
 * height = sheetH/rotCount.
 *
 * Standard Doom rot indexing:
 *   1 = front (viewer is in front of entity)
 *   2 = front-right (45°)   3 = right (90°)   4 = back-right (135°)
 *   5 = back (180°)         6 = back-left (225°)   7 = left (270°)  8 = front-left (315°)
 *
 *   await registerSpriteSheet8Dir({
 *       name: "imp",
 *       url: "/textures/sprites/characters/imp_8dir.png",
 *       frameCount: 4,
 *       rotCount: 8,
 *   });
 *
 * Then spawn + setFacing on the BillboardManager, and the renderer
 * automatically picks the right rotation as the camera moves.
 */
export async function registerSpriteSheet8Dir({ name, url, frameCount = 1, rotCount = 8 }) {
    if (!name) throw new Error("registerSpriteSheet8Dir: name required");
    if (!url)  throw new Error("registerSpriteSheet8Dir: url required");
    if (frameCount < 1 || frameCount > 26) throw new Error("frameCount must be 1..26");
    if (rotCount < 1 || rotCount > 8)      throw new Error("rotCount must be 1..8");
    const sheet = await loadSpritePNG(url);
    const fw = Math.floor(sheet.width / frameCount);
    const fh = Math.floor(sheet.height / rotCount);
    const bm = ensureBillboardManager();
    if (!bm) throw new Error("registerSpriteSheet8Dir: no BillboardManager");

    const letters = [];
    for (let r = 0; r < rotCount; r++) {
        for (let f = 0; f < frameCount; f++) {
            const sub = new Uint8Array(fw * fh * 4);
            const sx0 = f * fw;
            const sy0 = r * fh;
            for (let y = 0; y < fh; y++) {
                const srcRow = (((sy0 + y) * sheet.width) + sx0) * 4;
                const dstRow = y * fw * 4;
                sub.set(sheet.rgba.subarray(srcRow, srcRow + fw * 4), dstRow);
            }
            const letter = String.fromCharCode(65 + f);
            const rotStr = String(r + 1);     // "1".."8"
            bm.registerFrame(name, letter, rotStr, { width: fw, height: fh, rgba: sub });
            if (r === 0) letters.push(letter);
        }
    }
    return { frames: letters, rotCount, frameWidth: fw, frameHeight: fh };
}

/**
 * Bulk-register tree sprites for the spawner. Resolves the URLs once,
 * loads all PNGs in parallel, registers each as a BillboardManager frame
 * keyed by its base name (tree_oak_1, tree_pine_2, etc.).
 *
 * Call this once at engine boot when sprite-tree mode is enabled.
 * Returns a count of how many were successfully registered.
 */
export async function preloadTreeSprites({
    kinds = ["oak", "pine", "palm"],
    variants = [1, 2, 3, 4],
    basePath = "textures/sprites/trees",
} = {}) {
    const jobs = [];
    for (const k of kinds) {
        for (const v of variants) {
            const name = `tree_${k}_${v}`;
            const url  = `${basePath}/${name}.png`;
            jobs.push(
                registerSprite(name, url)
                    .then(() => 1)
                    .catch(e => {
                        console.warn(`[spriteBillboardLoader] failed ${name}:`, e.message);
                        return 0;
                    }),
            );
        }
    }
    const results = await Promise.all(jobs);
    const ok = results.reduce((a, b) => a + b, 0);
    console.log(`[spriteBillboardLoader] preloaded ${ok}/${jobs.length} tree sprites`);
    return ok;
}
