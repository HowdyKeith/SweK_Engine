// fx/post/bloom.js -- a Canvas2D bloom post-process for the showcase scenes. Bright areas (nebula cores, accretion
// glow, ship edges, plasma) bleed light: extract the bright pixels above a luminance threshold, blur them at a
// downsampled resolution, and add them back over the frame. The bright-extraction is a pure function (verified); the
// downsample + gaussian blur (via ctx.filter) + additive composite use the canvas (rig render). Cheap: the blur runs
// on a small buffer, so it is a couple of extra drawImage calls per frame.
"use strict";

// pure: zero every pixel below the luminance threshold, and scale the survivors by how far above they are (soft knee).
// Operates in place on an RGBA Uint8ClampedArray. Verifiable without a canvas.
function extractBright(data, threshold) {
    const th = threshold == null ? 0.6 : threshold, inv = 1 / Math.max(1e-3, 1 - th);
    for (let i = 0; i < data.length; i += 4) {
        const l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
        if (l < th) { data[i] = data[i + 1] = data[i + 2] = 0; }
        else { const k = (l - th) * inv; data[i] *= k; data[i + 1] *= k; data[i + 2] *= k; }
    }
    return data;
}

// makeBloom() -> bloom(srcCanvas, destCtx, W, H): draw a bloom glow over destCtx from srcCanvas's bright areas.
function makeBloom(opts = {}) {
    const scale = opts.scale || 0.28, threshold = opts.threshold == null ? 0.62 : opts.threshold, blurPx = opts.blurPx || 5, intensity = opts.intensity == null ? 0.85 : opts.intensity;
    let small = null, sctx = null;
    function ensure(W, H) { const sw = Math.max(1, W * scale | 0), sh = Math.max(1, H * scale | 0); if (!small || small.width !== sw || small.height !== sh) { small = document.createElement("canvas"); small.width = sw; small.height = sh; sctx = small.getContext("2d"); } }
    return function bloom(src, destCtx, W, H) {
        ensure(W, H);
        sctx.clearRect(0, 0, small.width, small.height); sctx.filter = "none"; sctx.drawImage(src, 0, 0, small.width, small.height);
        const img = sctx.getImageData(0, 0, small.width, small.height); extractBright(img.data, threshold); sctx.putImageData(img, 0, 0);
        destCtx.save(); destCtx.globalCompositeOperation = "lighter"; destCtx.globalAlpha = intensity; destCtx.filter = "blur(" + blurPx + "px)"; destCtx.imageSmoothingEnabled = true; destCtx.drawImage(small, 0, 0, W, H); destCtx.filter = "none"; destCtx.restore();
    };
}
export { extractBright, makeBloom };
if (typeof module !== "undefined" && module.exports) module.exports = { extractBright, makeBloom };
