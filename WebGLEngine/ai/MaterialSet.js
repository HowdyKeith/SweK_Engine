// ============================================================================
// ai/MaterialSet.js
//
// Round 172 — derive a parallax-ready material set from a single diffuser
// output. The OllamaDiffuser produces one image (the albedo / base color).
// For parallax shading the engine needs three coordinated maps:
//
//   - ALBEDO  : the raw color image, what the surface looks like flat-lit
//   - HEIGHT  : grayscale depth at each texel, 1.0 = surface, 0.0 = max
//               depth. Used by the parallax fragment shader to offset
//               UVs along the view vector.
//   - NORMAL  : tangent-space surface normal at each texel. Used for
//               proper Lambertian lighting that responds to the
//               geometry implied by the height map.
//
// Why this is its own module: both the bench (Round 172, this round)
// and the engine entity material system (Round 174) need to produce
// the same triplet from a single image. parallax_studio.js already had
// a `generateHeightmap` helper but it lived inside the demo; lifting
// it here and adding the Sobel-based normal derivation gives one
// canonical implementation everyone uses.
//
// Future expansion (Round 173+): instead of deriving height
// heuristically from luminance, run the diffuser a second time with
// a "height map" prompt. The signature stays the same — call sites
// don't need to change when we swap the height source.
//
// All work happens on 2D canvases so we can pass results to WebGL as
// textures or to the bench UI as data-URLs without going through the
// GPU.
// ============================================================================

/**
 * Derive a height map from an albedo canvas.
 *
 * Approach (heuristic, "good enough for now"): luminance + contrast
 * boost. Dark regions become low (deep), light regions become high
 * (raised). Works well for textures with strong tonal variation
 * (bricks, fur, scales) and poorly for flat-shaded illustrative
 * styles. The bias term shifts the midpoint so the average texel
 * doesn't sit at extreme depth.
 *
 * @param {HTMLCanvasElement|ImageBitmap|Image} albedoCanvas
 * @param {Object} [opts]
 * @param {number} [opts.contrast=1.6]  — multiplier on (lum - bias)
 * @param {number} [opts.bias=96]       — input luminance subtracted before scaling
 * @param {number} [opts.center=128]    — output midpoint
 * @param {boolean} [opts.invert=false] — flip the mapping (light→deep)
 * @returns {HTMLCanvasElement}
 */
export function deriveHeightMap(albedoCanvas, opts = {}) {
    const contrast = opts.contrast ?? 1.6;
    const bias     = opts.bias     ?? 96;
    const center   = opts.center   ?? 128;
    const invert   = !!opts.invert;

    const W = albedoCanvas.width  || albedoCanvas.naturalWidth;
    const H = albedoCanvas.height || albedoCanvas.naturalHeight;
    const out = document.createElement("canvas");
    out.width = W; out.height = H;
    const ctx = out.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(albedoCanvas, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
        // Rec. 601 luminance — standard for perceptual brightness
        let lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        if (invert) lum = 255 - lum;
        const boosted = Math.max(0, Math.min(255, center + (lum - bias) * contrast));
        px[i] = px[i + 1] = px[i + 2] = boosted;
        px[i + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
    return out;
}

/**
 * Derive a tangent-space normal map from a height map via Sobel
 * gradient. Each output pixel encodes the surface normal at that
 * texel: R=normal.x, G=normal.y, B=normal.z, all in [0,255]
 * corresponding to [-1,1] but with z usually positive (heightmap
 * normals point up out of the surface). The standard "purple-ish"
 * normal map look.
 *
 * Sobel kernels:
 *   Gx = [-1 0 1; -2 0 2; -1 0 1]
 *   Gy = [-1 -2 -1; 0 0 0; 1 2 1]
 *
 * The strength parameter scales the gradient magnitude before
 * normalization — higher = steeper apparent slopes.
 *
 * @param {HTMLCanvasElement} heightCanvas — assumes R=G=B grayscale
 * @param {Object} [opts]
 * @param {number} [opts.strength=2.0]
 * @returns {HTMLCanvasElement}
 */
export function deriveNormalMap(heightCanvas, opts = {}) {
    const strength = opts.strength ?? 2.0;
    const W = heightCanvas.width;
    const H = heightCanvas.height;

    // Read height map as a flat float32 array (Y channel only; the
    // map is grayscale so R=G=B).
    const hctx = heightCanvas.getContext("2d", { willReadFrequently: true });
    const hData = hctx.getImageData(0, 0, W, H).data;
    const height = new Float32Array(W * H);
    for (let i = 0, j = 0; i < hData.length; i += 4, j++) {
        height[j] = hData[i] / 255;
    }

    const out = document.createElement("canvas");
    out.width = W; out.height = H;
    const octx = out.getContext("2d");
    const oData = octx.createImageData(W, H);
    const op = oData.data;

    // Sobel kernel applied to height field. Edges clamp to nearest
    // sample so the border doesn't blow up. The Z component is fixed
    // at 1/strength then everything normalized.
    const sampleH = (x, y) => {
        const cx = Math.max(0, Math.min(W - 1, x));
        const cy = Math.max(0, Math.min(H - 1, y));
        return height[cy * W + cx];
    };
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const tl = sampleH(x - 1, y - 1);
            const  l = sampleH(x - 1, y    );
            const bl = sampleH(x - 1, y + 1);
            const tr = sampleH(x + 1, y - 1);
            const  r = sampleH(x + 1, y    );
            const br = sampleH(x + 1, y + 1);
            const  t = sampleH(x,     y - 1);
            const  b = sampleH(x,     y + 1);
            // Gx — horizontal gradient (right minus left, with diagonals)
            const gx = (tr + 2 * r + br) - (tl + 2 * l + bl);
            // Gy — vertical gradient (bottom minus top). Inverted sign
            // so "up" in the height field corresponds to +Y in
            // tangent space the way most shaders expect.
            const gy = (bl + 2 * b + br) - (tl + 2 * t + tr);
            // Build the normal vector. Z controls "flatness" —
            // smaller Z = more dramatic apparent relief.
            let nx = -gx * strength;
            let ny = -gy * strength;
            let nz = 1.0;
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
            nx /= len; ny /= len; nz /= len;
            // Pack [-1,1] → [0,255]
            const i = (y * W + x) * 4;
            op[i    ] = Math.round((nx * 0.5 + 0.5) * 255);
            op[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
            op[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
            op[i + 3] = 255;
        }
    }
    octx.putImageData(oData, 0, 0);
    return out;
}

/**
 * High-level: take an albedo image (as a Canvas, ImageBitmap, or
 * loaded Image) and produce the full three-map material set ready
 * for the parallax shader.
 *
 * Returns the maps as both canvas objects (for GPU upload) and
 * dataURL strings (for UI thumbnails / serialization).
 *
 * @param {HTMLCanvasElement|HTMLImageElement|ImageBitmap} albedoSource
 * @param {Object} [opts]
 * @param {Object} [opts.height] — passed through to deriveHeightMap
 * @param {Object} [opts.normal] — passed through to deriveNormalMap
 * @returns {Promise<{
 *   albedo: { canvas: HTMLCanvasElement, dataUrl: string },
 *   height: { canvas: HTMLCanvasElement, dataUrl: string },
 *   normal: { canvas: HTMLCanvasElement, dataUrl: string },
 *   width: number, height_px: number,
 * }>}
 */
export async function buildMaterialSet(albedoSource, opts = {}) {
    // Normalize input to a canvas
    let albedoCanvas;
    if (albedoSource instanceof HTMLCanvasElement) {
        albedoCanvas = albedoSource;
    } else {
        const W = albedoSource.width  || albedoSource.naturalWidth;
        const H = albedoSource.height || albedoSource.naturalHeight;
        albedoCanvas = document.createElement("canvas");
        albedoCanvas.width = W; albedoCanvas.height = H;
        albedoCanvas.getContext("2d").drawImage(albedoSource, 0, 0, W, H);
    }
    const heightCanvas = deriveHeightMap(albedoCanvas, opts.height || {});
    const normalCanvas = deriveNormalMap(heightCanvas, opts.normal || {});

    // For thumbnails + serialization, give back dataURLs. PNG keeps
    // height/normal precision; the diffuser image is already PNG-ish
    // anyway so no quality loss.
    return {
        albedo: { canvas: albedoCanvas, dataUrl: albedoCanvas.toDataURL("image/png") },
        height: { canvas: heightCanvas, dataUrl: heightCanvas.toDataURL("image/png") },
        normal: { canvas: normalCanvas, dataUrl: normalCanvas.toDataURL("image/png") },
        width:    albedoCanvas.width,
        height_px: albedoCanvas.height,
    };
}

/**
 * Helper: convert a diffuser dataURL (the existing OllamaDiffuser
 * output format) into a material set. The Promise resolves once the
 * intermediate <img> has loaded.
 */
export async function materialSetFromDataUrl(dataUrl, opts = {}) {
    const img = new Image();
    await new Promise((resolve, reject) => {
        img.onload  = resolve;
        img.onerror = () => reject(new Error("materialSetFromDataUrl: image failed to load"));
        img.src = dataUrl;
    });
    return buildMaterialSet(img, opts);
}
