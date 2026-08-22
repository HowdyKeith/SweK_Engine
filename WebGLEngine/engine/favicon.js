// FILE: engine/favicon.js
// Round 43 — generate a 32×32 favicon at runtime from a 2D canvas and
// inject it as the page's icon. Result cached to localStorage so we
// don't redraw it on every load.
//
// The icon: a small isometric voxel-stack rendered in the LCARS orange
// palette over a dark background. Gives the tab a tiny visual identity
// without needing a precompiled .ico shipped alongside.

const CACHE_KEY = "voxelengine.favicon.v1";

export function installFavicon() {
    if (typeof document === "undefined") return;
    // Remove any existing icon links first so ours wins.
    document.querySelectorAll('link[rel~="icon"]').forEach(l => l.remove());

    let dataUrl = null;
    try { dataUrl = localStorage.getItem(CACHE_KEY); } catch {}

    if (!dataUrl) {
        dataUrl = _generateIcon();
        try { localStorage.setItem(CACHE_KEY, dataUrl); } catch {}
    }

    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    link.href = dataUrl;
    document.head.appendChild(link);
}

function _generateIcon() {
    const size = 64;          // draw at 64×64 then let the browser scale
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    const g = c.getContext("2d");

    // Background — dark panel + orange border (LCARS feel)
    g.fillStyle = "#0a0a0a";
    g.fillRect(0, 0, size, size);
    g.strokeStyle = "#f90";
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, size - 3, size - 3);

    // Isometric voxel — three faces of a cube.
    // Project (x, y, z) → screen (sx, sy) with iso angles.
    const cx = size / 2;
    const cy = size / 2 + 4;
    const s  = 14;     // voxel half-edge

    const iso = (x, y, z) => ({
        x: cx + (x - z) * s * 0.866,
        y: cy + (x + z) * s * 0.5 - y * s,
    });

    const drawFace = (pts, fill) => {
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
        g.closePath();
        g.fillStyle = fill;
        g.fill();
        g.strokeStyle = "#000";
        g.lineWidth = 1;
        g.stroke();
    };

    // Top face (brightest — LCARS orange)
    drawFace([
        iso( 0, 1,  0),
        iso( 1, 1,  0),
        iso( 1, 1,  1),
        iso( 0, 1,  1),
    ], "#ffb733");

    // Left face (medium — burnt orange)
    drawFace([
        iso( 0, 0,  0),
        iso( 0, 1,  0),
        iso( 0, 1,  1),
        iso( 0, 0,  1),
    ], "#c66200");

    // Right face (darker — deep burnt orange)
    drawFace([
        iso( 0, 0,  1),
        iso( 0, 1,  1),
        iso( 1, 1,  1),
        iso( 1, 0,  1),
    ], "#8c4400");

    return c.toDataURL("image/png");
}
