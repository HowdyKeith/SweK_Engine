// ai/HeightmapDeriver.js
//
// Derives heightmaps for parallax mapping from generated color
// textures. Two paths:
//
//   1. LUMINANCE — synchronous, ~5ms, free. Converts the color
//      texture to grayscale, contrast-boosts, optionally applies
//      Sobel edge accent. Works for any texture with regular value
//      differences (bricks, scales, tiles, stone). The default —
//      always available, never fails.
//
//   2. DIFFUSER — asynchronous, ~1-3s, requires OllamaDiffuser.
//      Issues a separate diffuser call with a heightmap-specific
//      prompt derived from the original. Higher quality for some
//      textures (organic surfaces, irregular patterns) but the
//      diffuser isn't actually trained on heightmaps — results
//      vary. Use as opt-in.
//
// Output is always a single-channel grayscale image where
// white (255) = surface high, black (0) = surface low. This is
// the convention the parallax shaders (HLSL + GLSL) expect.

const DEFAULT_CONTRAST_BOOST = 1.6;
const DEFAULT_CENTER_LUMA    = 96;     // values below this push toward black faster
const DEFAULT_EDGE_BOOST     = 0.0;    // 0..1, blend in Sobel edges to emphasize seams

// Synchronous luminance-derived heightmap. Input is anything
// drawImage() accepts: HTMLImageElement, HTMLCanvasElement, ImageBitmap.
// Returns a same-size HTMLCanvasElement with grayscale RGBA contents.
export function deriveFromLuminance(image, opts = {}) {
    const contrast    = opts.contrast    ?? DEFAULT_CONTRAST_BOOST;
    const center      = opts.centerLuma  ?? DEFAULT_CENTER_LUMA;
    const edgeBoost   = opts.edgeBoost   ?? DEFAULT_EDGE_BOOST;
    const invert      = !!opts.invert;       // most cases: false (light=high)
                                              // dark mortar wants invert=false
                                              // dark scales wants invert=true

    const w = image.width || image.naturalWidth;
    const h = image.height || image.naturalHeight;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const cx = c.getContext("2d");
    cx.drawImage(image, 0, 0);
    const data = cx.getImageData(0, 0, w, h);
    const src = data.data;

    // First pass: compute boosted luminance into a scratch buffer
    const lumBuf = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; i < src.length; i += 4, j++) {
        let lum = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
        if (invert) lum = 255 - lum;
        // Contrast boost about a chosen center value. Values below
        // center pushed darker, values above pushed lighter.
        const boosted = 128 + (lum - center) * contrast;
        lumBuf[j] = Math.max(0, Math.min(255, boosted));
    }

    // Optional Sobel pass — adds an edge-accent layer so high-contrast
    // boundaries (brick edges, scale ridges) get extra height push.
    let edgeBuf = null;
    if (edgeBoost > 0.0001) {
        edgeBuf = new Uint8ClampedArray(w * h);
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const i = y * w + x;
                // Sobel X
                const gx = (-lumBuf[i - w - 1] - 2 * lumBuf[i - 1] - lumBuf[i + w - 1])
                         + ( lumBuf[i - w + 1] + 2 * lumBuf[i + 1] + lumBuf[i + w + 1]);
                // Sobel Y
                const gy = (-lumBuf[i - w - 1] - 2 * lumBuf[i - w] - lumBuf[i - w + 1])
                         + ( lumBuf[i + w - 1] + 2 * lumBuf[i + w] + lumBuf[i + w + 1]);
                edgeBuf[i] = Math.min(255, Math.sqrt(gx * gx + gy * gy) * 0.5);
            }
        }
    }

    // Compose into the output canvas
    for (let i = 0, j = 0; i < src.length; i += 4, j++) {
        let v = lumBuf[j];
        if (edgeBuf) v = Math.min(255, v + edgeBuf[j] * edgeBoost);
        src[i] = src[i + 1] = src[i + 2] = v;
        src[i + 3] = 255;
    }
    cx.putImageData(data, 0, 0);
    return c;
}

// Derive a heightmap-specific prompt from a color-texture prompt.
// The diffuser doesn't really do heightmaps, but priming with
// "depth map", "grayscale", "no color" pushes it toward usable.
export function heightmapPromptFor(colorPrompt) {
    // Strip color words that confuse the diffuser when we want grayscale
    const stripped = colorPrompt
        .replace(/dark red|dark green|dark blue/gi, "")
        .replace(/red|green|blue|cyan|magenta|yellow|orange|purple|gold|pink/gi, "")
        .replace(/\s+/g, " ")
        .trim();
    return `depth heightmap grayscale, ${stripped}, white where surface is high black where deep, no color, no logos no text`;
}

// Async diffuser-based heightmap generation. Pass an OllamaDiffuserClient
// instance. Returns the same shape as the client.generate(): { ok, dataUrl }.
export async function generateViaDiffuser(client, colorPrompt, opts = {}) {
    if (!client) return { ok: false, error: "no client" };
    const prompt = opts.prompt ?? heightmapPromptFor(colorPrompt);
    const res = await client.generate(prompt, {
        width:  opts.width  ?? 512,
        height: opts.height ?? 512,
        steps:  opts.steps  ?? 4,
        seed:   opts.seed,
    });
    if (!res.ok) return res;
    return { ok: true, dataUrl: res.dataUrl, duration_ms: res.duration_ms };
}

// Convenience: given an HTMLImageElement, produce a data URL of the
// derived heightmap. Useful for showing thumbnails or downloading.
export function deriveFromLuminanceDataUrl(image, opts = {}) {
    const c = deriveFromLuminance(image, opts);
    return c.toDataURL("image/png");
}
