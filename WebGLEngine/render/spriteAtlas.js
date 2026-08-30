// FILE: render/spriteAtlas.js
// VERSION: v1
//
// Procedural particle sprite atlas. Builds an 8-cell texture
// (4 columns × 2 rows, each 64×64 px) at startup using HTML 2D
// canvas, uploads to GL. Particles pick a cell index 0..7 and
// the shader samples the appropriate region.
//
// Sprite cells:
//   0 — Soft circle (default — falloff matches the v1 procedural)
//   1 — Smoke wisp (irregular soft blob)
//   2 — Spark streak (radial cross-hatch)
//   3 — Dust puff (multi-blob cluster)
//   4 — Ember (warm radial gradient)
//   5 — Glyph plus (cyan cross with center node)
//   6 — Halo ring (bright ring + dim core)
//   7 — Magic rune (circle with inscribed shape)

import { sliceSheet, toSheetMeta } from "./spriteSlice.mjs";   // v4174 -- finding frames in a sheet nobody described

const ATLAS_DIM = 256;
const CELL_DIM  = 64;
const COLS = 4;
const ROWS = 2;

export class SpriteAtlas {
    constructor(gl) {
        this.gl = gl;
        this.texture = null;
        this._build();
    }

    _build() {
        const canvas = document.createElement("canvas");
        canvas.width = ATLAS_DIM;
        canvas.height = ATLAS_DIM;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, ATLAS_DIM, ATLAS_DIM);

        // Sprite drawing routines, indexed by cell
        const drawers = [
            this._drawSoftCircle, this._drawSmokeWisp,
            this._drawSparkStreak, this._drawDustPuff,
            this._drawEmber,       this._drawGlyphPlus,
            this._drawHaloRing,    this._drawMagicRune,
        ];
        for (let i = 0; i < drawers.length; i++) {
            const cx = (i % COLS) * CELL_DIM + CELL_DIM / 2;
            const cy = Math.floor(i / COLS) * CELL_DIM + CELL_DIM / 2;
            ctx.save();
            ctx.translate(cx, cy);
            drawers[i].call(this, ctx);
            ctx.restore();
        }

        this._upload(canvas);
    }

    _upload(canvas) {
        const gl = this.gl;
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    // Returns {u0,v0,u1,v1} — cell rect in atlas UV space
    getCellUV(idx) {
        const col = idx % COLS;
        const row = Math.floor(idx / COLS);
        const u0 = (col * CELL_DIM) / ATLAS_DIM;
        const v0 = (row * CELL_DIM) / ATLAS_DIM;
        const u1 = u0 + CELL_DIM / ATLAS_DIM;
        const v1 = v0 + CELL_DIM / ATLAS_DIM;
        return { u0, v0, u1, v1 };
    }

    // -----------------------------------------------------------
    // Sprite drawers — each draws inside a centered (-r..r) frame.
    // Origin at center, radius ≈ CELL_DIM/2 - 2 for safety margin.
    // -----------------------------------------------------------
    _drawSoftCircle(ctx) {
        const r = CELL_DIM / 2 - 2;
        const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        grd.addColorStop(0,    "rgba(255,255,255,1.0)");
        grd.addColorStop(0.6,  "rgba(255,255,255,0.6)");
        grd.addColorStop(1,    "rgba(255,255,255,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
    }

    _drawSmokeWisp(ctx) {
        // Three overlapping radial gradients, offset, low alpha → wispy
        const r = CELL_DIM / 2 - 4;
        for (const [ox, oy, scale] of [[-6, 4, 0.9], [8, -3, 0.85], [0, -8, 0.7]]) {
            const grd = ctx.createRadialGradient(ox, oy, 0, ox, oy, r * scale);
            grd.addColorStop(0,   "rgba(255,255,255,0.55)");
            grd.addColorStop(0.5, "rgba(255,255,255,0.25)");
            grd.addColorStop(1,   "rgba(255,255,255,0)");
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.arc(ox, oy, r * scale, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    _drawSparkStreak(ctx) {
        // 4 radial streaks + center bright dot
        const r = CELL_DIM / 2 - 2;
        ctx.lineCap = "round";
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const grd = ctx.createLinearGradient(0, 0, Math.cos(angle) * r, Math.sin(angle) * r);
            grd.addColorStop(0,   "rgba(255,255,255,1)");
            grd.addColorStop(0.4, "rgba(255,255,255,0.5)");
            grd.addColorStop(1,   "rgba(255,255,255,0)");
            ctx.strokeStyle = grd;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
            ctx.stroke();
        }
        // Bright center
        const grd2 = ctx.createRadialGradient(0, 0, 0, 0, 0, 6);
        grd2.addColorStop(0, "rgba(255,255,255,1)");
        grd2.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grd2;
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();
    }

    _drawDustPuff(ctx) {
        // 4-5 small soft circles clustered
        const blobs = [
            [-8, -4, 12], [6, -7, 10], [10, 6, 11],
            [-5, 8, 9],   [0, 0, 14],
        ];
        for (const [bx, by, br] of blobs) {
            const grd = ctx.createRadialGradient(bx, by, 0, bx, by, br);
            grd.addColorStop(0,   "rgba(255,255,255,0.5)");
            grd.addColorStop(0.5, "rgba(255,255,255,0.22)");
            grd.addColorStop(1,   "rgba(255,255,255,0)");
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.arc(bx, by, br, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    _drawEmber(ctx) {
        // Hot center fading to dark — but white-channel-only so the
        // particle's color tint applies. Bright center is full white,
        // edges are translucent.
        const r = CELL_DIM / 2 - 2;
        const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        grd.addColorStop(0,    "rgba(255,255,255,1.0)");
        grd.addColorStop(0.3,  "rgba(255,255,255,0.85)");
        grd.addColorStop(0.7,  "rgba(255,255,255,0.35)");
        grd.addColorStop(1,    "rgba(255,255,255,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
    }

    _drawGlyphPlus(ctx) {
        // Bright cross / plus sign — for memory motes
        const r = CELL_DIM / 2 - 8;
        ctx.lineCap = "round";
        const grd = ctx.createLinearGradient(-r, 0, r, 0);
        grd.addColorStop(0,   "rgba(255,255,255,0)");
        grd.addColorStop(0.5, "rgba(255,255,255,1)");
        grd.addColorStop(1,   "rgba(255,255,255,0)");
        ctx.strokeStyle = grd;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
        const grd2 = ctx.createLinearGradient(0, -r, 0, r);
        grd2.addColorStop(0,   "rgba(255,255,255,0)");
        grd2.addColorStop(0.5, "rgba(255,255,255,1)");
        grd2.addColorStop(1,   "rgba(255,255,255,0)");
        ctx.strokeStyle = grd2;
        ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
        // Center node
        const grd3 = ctx.createRadialGradient(0, 0, 0, 0, 0, 8);
        grd3.addColorStop(0, "rgba(255,255,255,1)");
        grd3.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grd3;
        ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    }

    _drawHaloRing(ctx) {
        // Ring with bright edge, dim core
        const r = CELL_DIM / 2 - 4;
        const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        grd.addColorStop(0,    "rgba(255,255,255,0.15)");
        grd.addColorStop(0.55, "rgba(255,255,255,0.4)");
        grd.addColorStop(0.78, "rgba(255,255,255,1.0)");
        grd.addColorStop(0.92, "rgba(255,255,255,0.3)");
        grd.addColorStop(1,    "rgba(255,255,255,0)");
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    }

    _drawMagicRune(ctx) {
        // Circle with inscribed triangle — futuristic / arcane look
        const r = CELL_DIM / 2 - 6;
        // Outer circle
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
        // Inscribed triangle
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
            const x = Math.cos(a) * r * 0.85;
            const y = Math.sin(a) * r * 0.85;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = "rgba(255,255,255,0.6)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Faint center glow
        const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, 10);
        grd.addColorStop(0, "rgba(255,255,255,0.6)");
        grd.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
    }
}

/**
 * v4174 -- build an atlas from a sheet an artist drew, rather than from the eight shapes this file draws.
 * Takes ImageData (or any { width, height, data } RGBA), removes the backdrop, finds the frames by
 * connected components, and uploads the matted pixels. Returns { texture, frames, meta, key } -- meta in
 * tools/ship/spriteSheetImport.mjs's schema, so a found sheet and a declared one are the same thing
 * downstream.
 *
 * A separate function and not a second constructor path: the procedural atlas is a fixed 4x2 grid of
 * 64px cells and getCellUV() computes from those constants. A sheet has frames of whatever size the
 * artist drew, so its rects come back as PIXELS in the returned frames and the caller converts -- rather
 * than being forced through getCellUV, which would quietly return the wrong rect for every one of them.
 */
export function atlasFromSheet(gl, img, opts = {}) {
    const { frames, matted, key } = sliceSheet(img, opts);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, matted.width, matted.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, matted.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { texture: tex, frames, meta: toSheetMeta(matted, frames, opts.prefix), key };
}

// Sprite indices — exposed as named constants so emitters don't
// hardcode magic numbers.
export const SPRITE = Object.freeze({
    CIRCLE: 0,
    SMOKE:  1,
    SPARK:  2,
    DUST:   3,
    EMBER:  4,
    GLYPH:  5,
    HALO:   6,
    RUNE:   7,
});
