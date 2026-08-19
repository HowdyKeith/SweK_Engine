// WebGLEngine/ev/esSprites.js — PNG art path for Endless Sky data in Stellar Atlas.
//
// Endless Sky ships are single top-down PNGs that the engine rotates; EV ships are pre-baked
// rotation sheets. flightView.js already knows how to draw a rotation sheet (setSprite / setShipSprite
// expect a decoded {frames, sheetW, sheetH, width, height, frameCount, gridW}). So this module loads
// the ES PNG and BAKES it into exactly that shape by drawing the image rotated into a frame grid —
// letting the existing, working flightView atlas code render ES ships with no changes to it.
//
//   import { esShipAtlas, esLoadLandscape, setEsImagesBase } from "./esSprites.js";
//   const dec = await esShipAtlas("ship/shuttle");   // -> {ok, frames:[rgba], sheetW,...} or null
//   fv.setSprite(dec, 1);                             // baseSetCount 1 => perRotation = frameCount
//
// Endless Sky art is GPLv3 / freely redistributable. This module ships none of it; it fetches from a
// configurable base (default: the ES repo's raw images, which send permissive CORS so canvas readback
// works). Point window.ES_IMAGES_BASE at a local folder to run fully offline.

"use strict";

const DEFAULT_BASE = "https://raw.githubusercontent.com/endless-sky/endless-sky/master/images/";
let IMAGES_BASE = (typeof window !== "undefined" && window.ES_IMAGES_BASE) || DEFAULT_BASE;
function setEsImagesBase(url) { IMAGES_BASE = url.endsWith("/") ? url : url + "/"; }

// v2165 -- plugin art. ES resolves a sprite name like "ship/dredger" against the base game AND
// every enabled plugin, with the plugin winning. So the resolver needs an ORDERED list of image
// roots, not one: plugins first, base game last. Verified against real URLs --
//   plugin: .../zuckung/endless-sky-plugins/main/myplugins/better.starts/images/ship/z_squid.png -> 200
//   base:   .../endless-sky/endless-sky/master/images/ship/dredger.png                            -> 200
// both with `access-control-allow-origin: *`, which we need in order to read pixels back off the
// canvas when baking the rotation sheet.
const slash = (u) => (u.endsWith("/") ? u : u + "/");
let PLUGIN_BASES = (typeof window !== "undefined" && Array.isArray(window.ES_PLUGIN_IMAGE_BASES))
    ? window.ES_PLUGIN_IMAGE_BASES.map(slash) : [];
// Later-installed plugins should win, so callers pass them in priority order.
function setEsPluginImageBases(list) { PLUGIN_BASES = (list || []).filter(Boolean).map(slash); }
function esImageBases() { return PLUGIN_BASES.concat([IMAGES_BASE]); }

const ROT_FRAMES = 32;    // rotation steps baked per ship (32 => 11.25 deg/frame)
const ROT_GRID_W = 8;     // frame grid width in the baked sheet
const MAX_SPRITE_PX = 128; // downscale large ship art before baking, to bound texture memory

// ES frame-sequence separators. A sprite "ship/foo" may live as foo.png, or a sequence foo=0.png,
// foo-0.png, foo+0.png, foo~0.png (ES uses these to group animation frames). Landscapes are .jpg.
// We try candidates in order and use the first that loads; frame 0 is the base pose we rotate.
function candidateUrls(spritePath) {
    const p = spritePath.replace(/^\/+/, "");
    const suffixes = [".png", "=0.png", "-0.png", "+0.png", "~0.png", ".jpg", "=0.jpg", "-0.jpg"];
    const out = [];
    // Base-major order: try EVERY suffix under a plugin before falling back to the next root,
    // so a plugin that overrides a base ship with an animated sequence still wins.
    for (const base of esImageBases()) {
        const enc = (s) => base + s.split("/").map(encodeURIComponent).join("/");
        for (const suf of suffixes) out.push(enc(p + suf));
    }
    return out;
}

function loadImageOne(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";     // needed so we can read pixels back off the canvas
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

// Resolve a sprite path to a loaded Image by trying the candidate filenames in order.
const _imgCache = new Map();
async function esLoadImage(spritePath) {
    if (!spritePath) return null;
    if (_imgCache.has(spritePath)) return _imgCache.get(spritePath);
    let found = null;
    for (const url of candidateUrls(spritePath)) {
        const img = await loadImageOne(url);
        if (img) { found = img; break; }
    }
    _imgCache.set(spritePath, found);
    return found;
}

// Bake a single ship image into a rotation sheet shaped exactly like decodeRLED's output, so
// flightView.buildAtlas() consumes it unchanged. Frame i shows the ship rotated i*(360/N) clockwise;
// frame 0 = the source pose (ES ships point "up"), matching flightView's heading->frame mapping.
const _atlasCache = new Map();
async function esShipAtlas(spritePath, frames = ROT_FRAMES) {
    if (!spritePath) return null;
    const key = spritePath + "#" + frames;
    if (_atlasCache.has(key)) return _atlasCache.get(key);
    const img = await esLoadImage(spritePath);
    if (!img || typeof document === "undefined") { _atlasCache.set(key, null); return null; }

    // scale the source down if huge, keep aspect
    let sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
    const scale = Math.min(1, MAX_SPRITE_PX / Math.max(sw, sh));
    sw = Math.max(1, Math.round(sw * scale)); sh = Math.max(1, Math.round(sh * scale));

    // frame cell is a square big enough to hold the sprite at any rotation (its diagonal)
    const cell = Math.ceil(Math.hypot(sw, sh));
    const gridW = ROT_GRID_W, gridH = Math.ceil(frames / gridW);
    const sheetW = gridW * cell, sheetH = gridH * cell;

    const cv = document.createElement("canvas");
    cv.width = sheetW; cv.height = sheetH;
    const ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    for (let i = 0; i < frames; i++) {
        const gx = (i % gridW) * cell, gy = Math.floor(i / gridW) * cell;
        const cx = gx + cell / 2, cy = gy + cell / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((i / frames) * Math.PI * 2);   // clockwise in canvas coords
        ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
        ctx.restore();
    }
    const rgba = ctx.getImageData(0, 0, sheetW, sheetH).data;   // Uint8ClampedArray

    const dec = {
        ok: true, isSheet: true,
        width: cell, height: cell,
        frameCount: frames, gridW, gridH,
        sheetW, sheetH,
        frames: [new Uint8ClampedArray(rgba.buffer.slice(0))],
        _es: true,
    };
    _atlasCache.set(key, dec);
    return dec;
}

// Load a landscape/planet image for the landing screen. Returns an {img, width, height} or null.
async function esLoadLandscape(spritePath) {
    const img = await esLoadImage(spritePath);
    if (!img) return null;
    return { img, width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
}

function esClearSpriteCache() { _imgCache.clear(); _atlasCache.clear(); }

export { esShipAtlas, esLoadImage, esLoadLandscape, setEsImagesBase, esClearSpriteCache, IMAGES_BASE, setEsPluginImageBases, esImageBases };
