// FILE: data/voxelThumbnail.js
// VERSION: v1 (v801 — thumbnails for the Asset Library)
//
// Render a voxel cloud as a small isometric image. Pure 2D canvas
// (no GL). Output: data URL suitable for <img src="...">.
//
// Performance: at 80×80 px with ~1000 voxels, runs in ~5-10ms.
// Cached by callers via the data URL — re-render only when the
// voxel data changes.

const ISO_X = [1, 0.5];          // unit vector for +x axis in screen space
const ISO_Y = [0, -1];           // unit vector for +y axis (up in iso)
const ISO_Z = [-1, 0.5];         // unit vector for +z axis

/**
 * Render a voxel array to a data URL.
 *
 * @param {Array} voxels  — array of {x,y,z,c} or [x,y,z,c] tuples
 * @param {Object} opts   — { size = 96, bg = "transparent",
 *                            rotateYawDeg = 0, padding = 6 }
 * @returns {string|null} data URL or null on failure
 */
export function voxelToDataUrl(voxels, opts = {}) {
    const size = opts.size || 96;
    const padding = opts.padding ?? 6;
    const rotateYawDeg = opts.rotateYawDeg || 0;
    const bg = opts.bg || "transparent";
    const list = _normalize(voxels);
    if (!list || list.length === 0) return null;

    const canvas = (typeof OffscreenCanvas !== "undefined")
        ? new OffscreenCanvas(size, size)
        : (typeof document !== "undefined")
            ? (() => { const c = document.createElement("canvas"); c.width = c.height = size; return c; })()
            : null;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    if (bg !== "transparent") {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, size, size);
    }

    // Optionally rotate voxels around Y so the "forward" direction faces
    // the camera consistently (so iso preview is from a known angle relative
    // to the asset's forward axis).
    const rotated = rotateYawDeg !== 0
        ? _rotateY(list, rotateYawDeg * Math.PI / 180)
        : list;

    // Compute screen-space bounding box of the iso-projected voxels so we
    // can scale + center to fit the canvas.
    let minSx = Infinity, maxSx = -Infinity, minSy = Infinity, maxSy = -Infinity;
    for (const v of rotated) {
        const sx = v.x * ISO_X[0] + v.y * ISO_Y[0] + v.z * ISO_Z[0];
        const sy = v.x * ISO_X[1] + v.y * ISO_Y[1] + v.z * ISO_Z[1];
        if (sx < minSx) minSx = sx; if (sx > maxSx) maxSx = sx;
        if (sy < minSy) minSy = sy; if (sy > maxSy) maxSy = sy;
    }
    const wImg = maxSx - minSx + 1;
    const hImg = maxSy - minSy + 1;
    const avail = size - 2 * padding;
    // The unit cube projects to roughly 2×1.5 in iso space. Add headroom.
    const cellSize = Math.max(1, Math.floor(Math.min(avail / wImg, avail / hImg)));
    const offsetX = (size - wImg * cellSize) / 2 - minSx * cellSize;
    const offsetY = (size - hImg * cellSize) / 2 - minSy * cellSize;

    // Sort back-to-front so closer voxels overdraw farther ones.
    // Depth key: lower (z - x) + lower y = farther back.
    const sorted = rotated.slice().sort((a, b) => {
        const da = (a.z - a.x) - a.y * 0.5;
        const db = (b.z - b.x) - b.y * 0.5;
        return db - da;
    });

    // Draw each voxel as a small parallelepiped silhouette using 3 fills
    // (top, left, right faces) for a cheap 3D look.
    for (const v of sorted) {
        const sx = v.x * ISO_X[0] + v.y * ISO_Y[0] + v.z * ISO_Z[0];
        const sy = v.x * ISO_X[1] + v.y * ISO_Y[1] + v.z * ISO_Z[1];
        const px = sx * cellSize + offsetX;
        const py = sy * cellSize + offsetY;
        const baseColor = _voxelColor(v.c);
        _drawIsoCube(ctx, px, py, cellSize, baseColor);
    }

    if (typeof canvas.convertToBlob === "function") {
        // OffscreenCanvas path — but we want a data URL synchronously
        // for <img src>. Fall back to inline canvas to get toDataURL().
        const off = canvas;
        const c2 = document.createElement("canvas");
        c2.width = c2.height = size;
        const ctx2 = c2.getContext("2d");
        ctx2.drawImage(off, 0, 0);
        return c2.toDataURL("image/png");
    }
    return canvas.toDataURL("image/png");
}

/**
 * Compute an orientation-aware yaw so the asset's forward axis points
 * toward the camera in the iso projection (i.e. you see its FRONT, not
 * its back, when previewed). Returns degrees.
 *
 * Iso convention: +x is roughly forward-right, -x is back-left. We want
 * the asset's "forward" direction to point in the negative-x screen
 * direction (toward the viewer's left).
 */
export function previewYawForOrientation(orientation) {
    if (!orientation?.forward) return 0;
    // We want forward to project to -x in iso (toward viewer-left)
    switch (orientation.forward) {
        case "-x": return 0;
        case "+z": return 90;
        case "+x": return 180;
        case "-z": return 270;
        default:   return 0;
    }
}

// ----- helpers -----

function _voxelColor(c) {
    // Best-effort: c could be an index (number), a hex string, or undefined
    if (typeof c === "string" && /^#[0-9a-f]{3,8}$/i.test(c)) return c;
    if (typeof c === "number") {
        const idx = (c | 0);
        // Spread hues with a golden-angle-ish step for visual distinctness
        const h = (idx * 137) % 360;
        return `hsl(${h}, 60%, 55%)`;
    }
    return "#888";    // fallback for missing color
}

function _drawIsoCube(ctx, px, py, s, color) {
    // Three-face cheap iso cube — top + left + right with simple shading.
    // Top diamond (lightest)
    ctx.fillStyle = _shade(color, 1.15);
    ctx.beginPath();
    ctx.moveTo(px,           py);
    ctx.lineTo(px + s,       py + s * 0.5);
    ctx.lineTo(px,           py + s);
    ctx.lineTo(px - s,       py + s * 0.5);
    ctx.closePath(); ctx.fill();
    // Left face (mid)
    ctx.fillStyle = _shade(color, 0.85);
    ctx.beginPath();
    ctx.moveTo(px - s,       py + s * 0.5);
    ctx.lineTo(px,           py + s);
    ctx.lineTo(px,           py + s * 2);
    ctx.lineTo(px - s,       py + s * 1.5);
    ctx.closePath(); ctx.fill();
    // Right face (darker)
    ctx.fillStyle = _shade(color, 0.65);
    ctx.beginPath();
    ctx.moveTo(px,           py + s);
    ctx.lineTo(px + s,       py + s * 0.5);
    ctx.lineTo(px + s,       py + s * 1.5);
    ctx.lineTo(px,           py + s * 2);
    ctx.closePath(); ctx.fill();
}

// Shade an hsl(...)/hex color by a multiplier; clamps to valid ranges.
function _shade(color, mul) {
    const m = Math.max(0, Math.min(2, mul));
    if (color.startsWith("hsl(")) {
        const match = /hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%/i.exec(color);
        if (!match) return color;
        const h = +match[1], sat = +match[2], lite = +match[3];
        const newL = Math.max(8, Math.min(92, lite * m));
        return `hsl(${h}, ${sat}%, ${newL.toFixed(0)}%)`;
    }
    if (color.startsWith("#")) {
        // Parse 3/6/8-digit hex
        let r, g, b;
        if (color.length === 4) {
            r = parseInt(color[1] + color[1], 16);
            g = parseInt(color[2] + color[2], 16);
            b = parseInt(color[3] + color[3], 16);
        } else {
            r = parseInt(color.slice(1, 3), 16);
            g = parseInt(color.slice(3, 5), 16);
            b = parseInt(color.slice(5, 7), 16);
        }
        const cap = (n) => Math.max(0, Math.min(255, Math.round(n * m)));
        return `rgb(${cap(r)},${cap(g)},${cap(b)})`;
    }
    return color;
}

function _normalize(input) {
    if (!input) return null;
    let arr;
    if (Array.isArray(input)) arr = input;
    else if (Array.isArray(input.voxels)) arr = input.voxels;
    else return null;
    if (arr.length === 0) return null;
    if (typeof arr[0] === "object" && !Array.isArray(arr[0]) && arr[0].x !== undefined) return arr;
    if (Array.isArray(arr[0]) && arr[0].length >= 3) {
        return arr.map(t => ({ x: t[0], y: t[1], z: t[2], c: t[3] }));
    }
    return null;
}

function _rotateY(voxels, rad) {
    const cos = Math.cos(rad), sin = Math.sin(rad);
    return voxels.map(v => ({
        x: v.x * cos + v.z * sin,
        y: v.y,
        z: -v.x * sin + v.z * cos,
        c: v.c,
    }));
}
