// FILE: simulation/DungeonLayout.js
//
// v1405 — import a DUNGEON LAYOUT into the engine instead of generating one. Two paths:
//   gridFromAscii(text)  — precise: "#"=wall, "."/" "=floor, "E"/"@"=entrance, "T"/"X"=treasure
//   gridFromImage(src)   — a top-down map image -> grid by brightness threshold (dark=wall)
// Both yield { GW, GH, wall:Uint8Array (1=wall,0=open), entrance?, treasure? } that
// DungeonDemo.loadLayout() turns into a real, walkable voxel dungeon of that exact shape.
//
// On AI vs. ourselves: deterministic image processing (below) is exact + offline and the
// right default for clean maps; a vision model is only worth it for messy/colored maps,
// and the grid it returns would still come back here as the same { wall } object.

export function gridFromAscii(text) {
    const lines = String(text || "").replace(/\r/g, "").split("\n").filter(l => l.length > 0);
    const GH = lines.length;
    const GW = Math.max(1, ...lines.map(l => l.length));
    const wall = new Uint8Array(GW * GH).fill(1);
    let entrance = null, treasure = null;
    for (let z = 0; z < GH; z++) {
        for (let x = 0; x < GW; x++) {
            const ch = lines[z][x] || "#";
            const open = (ch === "." || ch === " " || ch === "o" || ch === "E" || ch === "@" || ch === "T" || ch === "X");
            if (open) wall[z * GW + x] = 0;
            if (ch === "E" || ch === "@") entrance = [x, z];
            if (ch === "T" || ch === "X") treasure = [x, z];
        }
    }
    return { GW, GH, wall, entrance, treasure };
}

// Raw-pixel path (testable without a canvas): downsample rgba (w*h*4) to cols*rows.
// A cell becomes a WALL if at least `coverage` of its pixels are dark (luminance below
// `threshold`). Coverage (not average) is used so thin line-art walls still register;
// for solid-fill maps the dark fraction is ~1 and it works the same. invert for
// light-walls-on-dark maps.
export function gridFromPixels(rgba, w, h, opts = {}) {
    const cols = opts.cols || 29, rows = opts.rows || 29;
    const threshold = opts.threshold != null ? opts.threshold : 0.45;   // a pixel is "dark" below this
    const coverage = opts.coverage != null ? opts.coverage : 0.18;      // cell=wall if >= this fraction dark
    const invert = !!opts.invert;
    const wall = new Uint8Array(cols * rows);
    for (let gz = 0; gz < rows; gz++) {
        for (let gx = 0; gx < cols; gx++) {
            const x0 = Math.floor(gx * w / cols), x1 = Math.max(x0 + 1, Math.floor((gx + 1) * w / cols));
            const z0 = Math.floor(gz * h / rows), z1 = Math.max(z0 + 1, Math.floor((gz + 1) * h / rows));
            let dark = 0, n = 0;
            for (let y = z0; y < z1; y++) for (let x = x0; x < x1; x++) {
                const i = (y * w + x) * 4;
                const b = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) / 255;
                if (b < threshold) dark++;
                n++;
            }
            let isWall = n ? (dark / n) >= coverage : false;
            if (invert) isWall = !isWall;
            wall[gz * cols + gx] = isWall ? 1 : 0;
        }
    }
    return { GW: cols, GH: rows, wall };
}

// Browser path: load an image (URL / File / Image) and threshold it to a grid.
export async function gridFromImage(src, opts = {}) {
    const img = await _loadImage(src);
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d"); ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;
    return gridFromPixels(data, w, h, opts);
}
function _loadImage(src) {
    return new Promise((res, rej) => {
        if (typeof HTMLImageElement !== "undefined" && src instanceof HTMLImageElement) return res(src);
        const im = new Image(); im.crossOrigin = "anonymous";
        im.onload = () => res(im); im.onerror = rej;
        im.src = (typeof src === "string") ? src : URL.createObjectURL(src);
    });
}

// BFS-farthest reachable open cell from `start` (used to place the treasure).
function _farthest(wall, GW, GH, start) {
    const seen = new Uint8Array(GW * GH); const si = start[1] * GW + start[0];
    if (wall[si]) return null;
    seen[si] = 1; const q = [si]; let head = 0, last = si;
    const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (head < q.length) {
        const cur = q[head++]; last = cur;
        const cx = cur % GW, cz = (cur / GW) | 0;
        for (const [dx, dz] of NB) {
            const nx = cx + dx, nz = cz + dz;
            if (nx < 0 || nz < 0 || nx >= GW || nz >= GH) continue;
            const ni = nz * GW + nx;
            if (seen[ni] || wall[ni]) continue;
            seen[ni] = 1; q.push(ni);
        }
    }
    return [last % GW, (last / GW) | 0];
}

// From a wall grid, pick entrance + treasure + a few middle spawn cells, and synthesize
// single-cell "rooms" the DungeonDemo monster/loot code can consume (it reads cx/cz).
export function deriveLayout(grid) {
    const { GW, GH, wall } = grid;
    const open = [];
    for (let z = 0; z < GH; z++) for (let x = 0; x < GW; x++) if (!wall[z * GW + x]) open.push([x, z]);
    if (!open.length) return null;
    const entrance = grid.entrance && !wall[grid.entrance[1] * GW + grid.entrance[0]] ? grid.entrance : open[0];
    const treasure = (grid.treasure && !wall[grid.treasure[1] * GW + grid.treasure[0]]) ? grid.treasure
        : (_farthest(wall, GW, GH, entrance) || open[open.length - 1]);
    const isEnd = (c) => (c[0] === entrance[0] && c[1] === entrance[1]) || (c[0] === treasure[0] && c[1] === treasure[1]);
    const mids = open.filter(c => !isEnd(c));
    for (let i = mids.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = mids[i]; mids[i] = mids[j]; mids[j] = t; }
    const room = (c) => ({ cx: c[0], cz: c[1], x0: c[0], x1: c[0], z0: c[1], z1: c[1] });
    const rooms = [room(entrance), ...mids.slice(0, 6).map(room), room(treasure)];
    return { rooms, entrance, treasure, openCount: open.length };
}
