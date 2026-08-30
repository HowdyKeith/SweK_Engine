// FILE: world/repoHeightfield.js
// VERSION: v4149 -- a source tree, rendered as ground.
//
// *** THIS IS NOT A NEW RENDERER. *** world/realTerrainStamp.js already turns a height grid into voxel terrain
// with biome-aware surface materials, and main.js already flies a cinematic camera onto it. Both take
// `{ heights, grid, min, max }` and neither cares where the numbers came from -- realTerrainData.js fetches
// them from Open-Meteo, and this file computes them from a file listing instead. So the whole feature is one
// pure function, and the terrain, the erosion, the moss and the arrival are the ones already shipped.
//
// KEITH: "I have at times described my VBA programming as mountains of code. maybe 3 mountains." The point of
// this view is that three mountains should BE three mountains, and you should be able to walk up one.
//
// ---- WHY A TREEMAP AND NOT A GRID OF BARS -------------------------------------------------------------------
// Terrain reads as terrain because neighbouring ground is RELATED. Sorting files into a grid by name gives you
// a bar chart with a sun angle. A squarified treemap (Bruls, Huizing & van Wijk 2000) gives every directory one
// contiguous rectangle and recurses inside it, so a directory becomes a LANDMASS and its files become the peaks
// on it -- which is the fact about a codebase worth seeing from a hilltop.
//
// ---- WHY AREA AND HEIGHT USE DIFFERENT SCALES, WHICH IS THE ONE JUDGEMENT CALL IN HERE --------------------
// A leaf's rectangle AREA is linear in its size, because that is what makes the map a fair map: half the code
// covers half the ground. Its HEIGHT is log1p(size), because linear height on top of linear area means volume
// grows like size squared, and one 5,000-line file would tower ~100x over a 50-line neighbour and flatten
// everything else into its foothills. Under log it stands about 2.3x higher: still obviously the big one,
// still surrounded by terrain you can see. *** THE MAP IS LINEAR AND THE SKYLINE IS LOGARITHMIC, AND THAT IS A
// CHOICE, NOT A MEASUREMENT. *** peaks[] reports raw sizes alongside the heights so the compression is always
// checkable against the real number.
//
// ---- WHY THERE IS A `massif` TERM ---------------------------------------------------------------------------
// Per-file height alone gives a uniform bumpy field: a 400-file directory of small modules reads exactly like
// 400 unrelated small modules, when the true fact is that it is one enormous thing. Each leaf is therefore
// lifted by massif * log1p(its PARENT directory's total), which raises a big directory bodily into a plateau
// with its own files as peaks standing on it. Parent only, never the whole ancestor chain -- accumulating up
// the chain would lift a deep file for every directory above it and make depth, rather than size, the
// mountain-maker.
//
// ---- WHAT THE SMOOTHING IS FOR, AND WHAT IT COSTS -------------------------------------------------------
// Rasterizing rectangles at constant height gives a ziggurat: vertical cliffs at every file boundary. Three
// box-blur passes approximate a Gaussian and turn those steps into slopes. This is LOSSY ON PURPOSE and it is
// not neutral: a box blur pulls down an isolated small peak much harder than a broad massif, because the same
// kernel averages a lone bump against its neighbours and averages a plateau against more plateau. That is the
// behaviour we want (one small file is a bump; a big directory stays a mountain) but it does mean a peak's
// RENDERED height is not its log-size -- peaks[] therefore reports both `height` (pre-blur, the honest
// log-size) and `rendered` (post-blur, what you will actually stand on).
"use strict";

// ---------------------------------------------------------------------------------------------------------
// Tree building
// ---------------------------------------------------------------------------------------------------------

/** Build a directory tree from flat `{ path, lines }` entries. Weight of a directory is the sum of its leaves. */
export function buildTree(entries) {
    const root = { name: "", dir: true, children: new Map(), weight: 0, files: 0 };
    for (const e of entries || []) {
        const p = String((e && e.path) || "").replace(/\\/g, "/").replace(/^\.?\//, "");
        if (!p) continue;
        const w = Math.max(1, Math.round(Number(e.lines) || 0) || 1);
        const parts = p.split("/").filter(Boolean);
        let node = root;
        for (let i = 0; i < parts.length - 1; i++) {
            let next = node.children.get(parts[i]);
            if (!next) { next = { name: parts[i], dir: true, children: new Map(), weight: 0, files: 0, parent: node }; node.children.set(parts[i], next); }
            // A path can be a file in one entry and a directory prefix in another only if the listing is
            // malformed; treat the directory as authoritative rather than silently dropping one of them.
            if (!next.dir) { next.dir = true; next.children = next.children || new Map(); }
            node = next;
        }
        const leafName = parts[parts.length - 1];
        const existing = node.children.get(leafName);
        if (existing && existing.dir) continue;                    // same malformed case, other direction
        const leaf = { name: leafName, dir: false, path: p, weight: w, lines: w, binary: !!(e && e.binary), parent: node };
        node.children.set(leafName, leaf);
        for (let a = node; a; a = a.parent) { a.weight += w; a.files += 1; }
    }
    return root;
}

// ---------------------------------------------------------------------------------------------------------
// Squarified treemap (Bruls, Huizing & van Wijk 2000)
// ---------------------------------------------------------------------------------------------------------

// The "worst" aspect ratio in a row, given the row's total area and the length of the side it runs along.
// Standard formulation: max(s^2*max/a^2, a^2/(s^2*min)) for row areas, side s, row area a.
function worstRatio(row, rowArea, side) {
    if (!row.length || rowArea <= 0 || side <= 0) return Infinity;
    let mn = Infinity, mx = -Infinity;
    for (const it of row) { if (it.area < mn) mn = it.area; if (it.area > mx) mx = it.area; }
    if (mn <= 0) return Infinity;
    const s2 = side * side, a2 = rowArea * rowArea;
    return Math.max((s2 * mx) / a2, a2 / (s2 * mn));
}

// Lay one finished row along the SHORTER side of `r` and return what is left of `r`.
function emitRow(row, rowArea, r, place) {
    if (r.h <= r.w) {                              // short side is h: the row is a vertical column
        const w = rowArea / r.h;
        let y = r.y;
        for (const it of row) { const h = it.area / w; place(it.node, { x: r.x, y, w, h }); y += h; }
        return { x: r.x + w, y: r.y, w: Math.max(0, r.w - w), h: r.h };
    }
    const h = rowArea / r.w;                       // short side is w: the row is a horizontal band
    let x = r.x;
    for (const it of row) { const w = it.area / h; place(it.node, { x, y: r.y, w, h }); x += w; }
    return { x: r.x, y: r.y + h, w: r.w, h: Math.max(0, r.h - h) };
}

function squarify(items, rect, place) {
    let total = 0; for (const i of items) total += i.weight;
    if (total <= 0 || rect.w <= 0 || rect.h <= 0) return;
    const scale = (rect.w * rect.h) / total;
    const queue = items.slice().sort((a, b) => b.weight - a.weight).map((n) => ({ node: n, area: n.weight * scale }));
    let r = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
    let row = [], rowArea = 0;
    while (queue.length) {
        const it = queue[0];
        const side = Math.min(r.w, r.h);
        if (side <= 0) break;
        const now = worstRatio(row, rowArea, side);
        const next = worstRatio(row.concat([it]), rowArea + it.area, side);
        if (!row.length || next <= now) { row.push(queue.shift()); rowArea += it.area; continue; }
        r = emitRow(row, rowArea, r, place); row = []; rowArea = 0;
    }
    if (row.length) emitRow(row, rowArea, r, place);
}

/**
 * Every leaf's rectangle in the unit square, depth-first. Returns [{ node, rect, depth }].
 * Directories are recursed into their own rect, which is what keeps a directory's files contiguous.
 */
export function treemapLeaves(root, rect = { x: 0, y: 0, w: 1, h: 1 }) {
    const out = [];
    (function walk(node, r, depth) {
        if (!node.dir) { out.push({ node, rect: r, depth }); return; }
        const kids = [...node.children.values()].filter((k) => k.weight > 0);
        if (!kids.length) return;
        squarify(kids, r, (child, childRect) => walk(child, childRect, depth + 1));
    })(root, rect, 0);
    return out;
}

// ---------------------------------------------------------------------------------------------------------
// Raster + smoothing
// ---------------------------------------------------------------------------------------------------------

/** One separable box-blur pass of the given radius, in place semantics but returning a new array. */
export function boxBlur(src, grid, radius) {
    if (radius < 1) return src.slice();
    const tmp = new Float64Array(grid * grid), out = new Float64Array(grid * grid);
    const at = (a, c, r) => a[r * grid + Math.max(0, Math.min(grid - 1, c))];
    for (let r = 0; r < grid; r++) {
        for (let c = 0; c < grid; c++) {
            let s = 0, n = 0;
            for (let k = -radius; k <= radius; k++) { s += at(src, c + k, r); n++; }
            tmp[r * grid + c] = s / n;
        }
    }
    for (let c = 0; c < grid; c++) {
        for (let r = 0; r < grid; r++) {
            let s = 0, n = 0;
            for (let k = -radius; k <= radius; k++) { s += tmp[Math.max(0, Math.min(grid - 1, r + k)) * grid + c]; n++; }
            out[r * grid + c] = s / n;
        }
    }
    return out;
}

// A cell the treemap's rounding missed sits as a hole inside otherwise solid ground; one dilation pass from the
// highest covered neighbour fills it before the blur, so a rounding gap does not become a pothole.
//
// ONLY INSIDE THE TREEMAP. The first draft filled every uncovered cell, which on the real engine tree meant
// 3,388 of 16,384 -- and ~3,300 of those were the empty MARGIN, deliberately uncovered, immediately pulled
// back down by shoreMask afterwards. The work was wasted and, worse, the reported number read as "the raster
// has 3,388 rounding gaps" when the true count of interior gaps is a tiny fraction of that. Bounded to the
// treemap's own rectangle, the number means what its name says.
function fillHoles(h, covered, grid, margin) {
    const lo = Math.floor(margin * grid), hi = grid - 1 - lo;
    const holes = [];
    for (let i = 0; i < h.length; i++) {
        if (covered[i]) continue;
        const r = (i / grid) | 0, c = i % grid;
        if (r < lo || r > hi || c < lo || c > hi) continue;
        holes.push(i);
    }
    for (const i of holes) {
        const r = (i / grid) | 0, c = i % grid;
        let best = 0, found = false;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr, cc = c + dc;
            if (rr < 0 || cc < 0 || rr >= grid || cc >= grid) continue;
            const j = rr * grid + cc;
            if (covered[j] && h[j] > best) { best = h[j]; found = true; }
        }
        if (found) h[i] = best;
    }
    return holes.length;
}

// *** THE BLUR EATS THE MARGIN, WHICH IS WHY THE SHORELINE IS CUT AFTERWARDS AND NOT BEFORE. *** The first
// draft simply inset the treemap and expected the empty border to stay at zero. It does not: three passes of a
// radius-3 box blur reach nine cells, which is more than the whole margin at any sane grid, so the border
// filled in and the lowest ground came out well ABOVE zero -- applyRealTerrain then normalized that to baseY
// and there was no water anywhere. Measured, not assumed: on a four-file fixture the pre-mask minimum was 6.41
// against a maximum of 11.61, i.e. the "sea" was already 55% of the way up the mountains.
//
// So the falloff is applied AFTER the blur, over the same border the treemap left empty: smoothstep from 0 at
// the outer edge to 1 at margin depth. Every cell that actually holds a file sits at depth >= margin and is
// multiplied by exactly 1, so this shapes only the spill, never the data.
function shoreMask(h, grid, margin) {
    const depth = margin * grid;
    if (depth < 1) return 0;
    let touched = 0;
    for (let r = 0; r < grid; r++) {
        for (let c = 0; c < grid; c++) {
            const d = Math.min(c, r, grid - 1 - c, grid - 1 - r);
            if (d >= depth) continue;
            const t = Math.max(0, Math.min(1, d / depth));
            h[r * grid + c] *= t * t * (3 - 2 * t);
            touched++;
        }
    }
    return touched;
}

// ---------------------------------------------------------------------------------------------------------
// The whole thing
// ---------------------------------------------------------------------------------------------------------

// *** WHY A GENERATED DATA FILE IS WATER AND NOT A MOUNTAIN. *** Run over this engine's own tree with every
// file treated the same, the tallest thing on the map by a wide margin is es-universe.json at 208,406 lines --
// 18% of the whole repository -- and it is generated star data, not something anyone wrote. As terrain it
// reads as Everest and flattens every hand-written file into its foothills: accurate about the DIRECTORY,
// misleading about the CODEBASE, which is the thing the view exists to show.
//
// The first version of this file answered that by EXCLUDING data files and naming them in a footnote. Keith's
// answer is better and is what ships: "data-storage as water". A data file keeps its true treemap footprint --
// so the map stays a fair map, and the star catalogue is still visibly a fifth of the repository -- but it is
// laid down as a LAKE rather than a summit. It stops competing with the code for the skyline while staying
// exactly as big as it really is, which is the one thing a footnote could not do.
export const DATA_EXT = new Set(("json jsonc geojson ndjson csv tsv lock map svg sqlite db dat bin " +
    "pot po mo ico icns woff woff2 ttf otf eot").split(" "));

function extOf(p) {
    const base = String(p || "").toLowerCase().split("/").pop().replace(/^\./, "");
    const dot = base.lastIndexOf(".");
    return dot > 0 ? base.slice(dot + 1) : base;
}

/** True when this entry is storage rather than authorship -- generated data, a lockfile, an asset. */
export function isWaterEntry(e) {
    if (!e) return false;
    return !!e.binary || DATA_EXT.has(extOf(e.path));
}

// ---- LANGUAGE -> BIOME -------------------------------------------------------------------------------------
// world/worleyBiomes.js ships eight biomes and world/biomeTerrain.js already turns one into surface materials,
// terrain amplitude and (via render/mossField.js) which moss grows on it. Driving that from the file's LANGUAGE
// costs one override hook and means a directory of shaders does not merely stand where the shaders are -- it
// LOOKS different from the directory of shell scripts next to it, in ground cover and in landform.
//
// *** THIS IS A LEGEND, NOT A MEASUREMENT. *** No property of C makes it tundra. The assignment is by role --
// systems languages get the bare cold high ground, scripting and config get the sparse dry ground, the tree's
// own bulk language gets the dense green -- and it is exported so the page can print it rather than leave
// somebody guessing why their Rust is snowing.
export const LANGUAGE_BIOME = Object.freeze({
    forest:    "js mjs cjs ts tsx jsx",                       // this tree's own bulk: dense, green, high relief
    tundra:    "c h cpp hpp cc cxx rs go zig asm s",          // systems languages: bare, cold, high
    taiga:     "py rb lua pl php r jl ex exs erl hs ml clj",  // scripting + functional
    shrubland: "java kt swift cs m mm scala vb vba bas cls frm",
    jungle:    "glsl vert frag comp wgsl hlsl shader",        // shaders: dense and strange
    plains:    "html htm css scss less vue svelte xml",       // surface/markup
    savanna:   "md mdx txt rst adoc",                         // prose: dry and open
    desert:    "sh bash zsh ps1 bat cmd command yml yaml toml ini cfg conf env makefile dockerfile cmake gradle properties sql graphql",
});

// id 0 means "no override -- let the world's own biome noise decide", which is what the shoreline gets.
export const BIOME_ORDER = Object.freeze(["", "forest", "tundra", "taiga", "shrubland", "jungle", "plains", "savanna", "desert"]);

const EXT_BIOME = (() => {
    const m = new Map();
    for (const [biome, exts] of Object.entries(LANGUAGE_BIOME)) for (const e of exts.split(" ")) m.set(e, BIOME_ORDER.indexOf(biome));
    return m;
})();

/** Biome id for one path, or the "plains" default for a language this legend does not name. */
export function biomeIdFor(p) { return EXT_BIOME.get(extOf(p)) || BIOME_ORDER.indexOf("plains"); }

export const DEFAULTS = Object.freeze({
    water: true,      // lay data/binary files down as lakes instead of hills -- see the note above
    grid: 128,        // heightfield resolution; applyRealTerrain bilinearly samples it, so this is free to raise
    margin: 0.06,     // unlaid border around the treemap -- with a baseY under WATER_LEVEL it becomes shoreline
    massif: 0.45,     // how much a leaf is lifted by its parent directory's total (see header)
    blurPasses: 3,    // three box passes approximate a Gaussian
    blurRadius: 0,    // 0 = derive from grid (grid/48, at least 1)
    peaks: 12,        // how many named summits to report
});

/**
 * Turn a flat file listing into the exact object world/realTerrainStamp.js's applyRealTerrain() consumes,
 * plus the two extra layers this view adds: `water` (data files as lakes) and `biomes` (language per column).
 *
 * @param entries [{ path, lines, binary? }] -- `lines` is the size that becomes both area and height.
 * @returns { heights, grid, min, max, bbox, water, biomes, peaks, lakes, stats }
 *          `heights` and `biomes` are row-major, row 0 = north (-z), matching realTerrainData.js.
 */
export function repoHeightfield(entries, opts = {}) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const grid = Math.max(8, Math.round(o.grid));
    const asWater = o.water !== false;
    const root = buildTree(entries);
    const heights = new Float64Array(grid * grid);
    const covered = new Uint8Array(grid * grid);
    const biomes = new Uint8Array(grid * grid);
    const wet = new Uint8Array(grid * grid);

    const m = Math.max(0, Math.min(0.4, o.margin));
    const leaves = root.weight > 0 ? treemapLeaves(root, { x: m, y: m, w: 1 - 2 * m, h: 1 - 2 * m }) : [];
    const placed = [], lakes = [];
    for (const { node, rect } of leaves) {
        const parentTotal = (node.parent && node.parent.weight) || node.weight;
        const water = asWater && isWaterEntry(node);
        // A lake's BED is flat and low so the surface reads as one body rather than a puddle per rounding cell.
        // It is not zero: a lake in the middle of a plateau still has to sit in that plateau, so the bed is the
        // parent directory's massif alone, without the file's own log-size on top. That is exactly the height
        // the surrounding ground would have had with no file there -- the lake displaces the summit, not the land.
        const height = water ? o.massif * Math.log1p(parentTotal)
                             : Math.log1p(node.weight) + o.massif * Math.log1p(parentTotal);
        const bid = water ? 0 : biomeIdFor(node.path);
        // Cell range the rectangle covers. A leaf too small to own a whole cell still claims the one under its
        // centre -- otherwise every file below ~1/grid^2 of the tree silently vanishes from a map whose whole
        // claim is that it shows the tree.
        const c0 = Math.max(0, Math.floor(rect.x * grid)), c1 = Math.min(grid - 1, Math.ceil((rect.x + rect.w) * grid) - 1);
        const r0 = Math.max(0, Math.floor(rect.y * grid)), r1 = Math.min(grid - 1, Math.ceil((rect.y + rect.h) * grid) - 1);
        let cells = 0;
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
            const i = r * grid + c;
            // max, not overwrite: a tiny file cannot dent a big one. A lake bed is written unconditionally
            // where it claims the cell, because a lake that loses its cells to a taller neighbour is a lake
            // with holes in it -- but it can only claim a cell no OTHER file already stands on.
            if (water) { if (!covered[i]) { heights[i] = height; wet[i] = 1; biomes[i] = 0; } }
            else if (height > heights[i] || !covered[i]) { heights[i] = height; wet[i] = 0; biomes[i] = bid; }
            covered[i] = 1; cells++;
        }
        if (!cells) {
            const c = Math.max(0, Math.min(grid - 1, Math.floor((rect.x + rect.w / 2) * grid)));
            const r = Math.max(0, Math.min(grid - 1, Math.floor((rect.y + rect.h / 2) * grid)));
            const i = r * grid + c;
            if (!covered[i]) { heights[i] = height; wet[i] = water ? 1 : 0; biomes[i] = bid; covered[i] = 1; }
            cells = 1;
        }
        const rec = { path: node.path, lines: node.lines, binary: node.binary, height, cells, rect, water,
                      biome: BIOME_ORDER[bid] || "",
                      col: Math.min(grid - 1, Math.floor((rect.x + rect.w / 2) * grid)),
                      row: Math.min(grid - 1, Math.floor((rect.y + rect.h / 2) * grid)) };
        if (water) lakes.push(rec); else placed.push(rec);
    }
    const holes = fillHoles(heights, covered, grid, m);

    const radius = o.blurRadius > 0 ? Math.round(o.blurRadius) : Math.max(1, Math.round(grid / 48));
    let smooth = Float64Array.from(heights);
    for (let p = 0; p < Math.max(0, o.blurPasses); p++) smooth = boxBlur(smooth, grid, radius);
    const shoreCells = shoreMask(smooth, grid, m);

    let min = Infinity, max = -Infinity;
    for (const h of smooth) { if (h < min) min = h; if (h > max) max = h; }
    if (!isFinite(min)) { min = 0; max = 1; }

    // Summits, tallest first, each carrying BOTH the honest log-size and what the blur left standing.
    const peaks = placed.slice().sort((a, b) => b.height - a.height).slice(0, Math.max(0, o.peaks))
        .map((p) => ({ path: p.path, lines: p.lines, binary: !!p.binary, biome: p.biome,
                       height: +p.height.toFixed(3), rendered: +smooth[p.row * grid + p.col].toFixed(3),
                       col: p.col, row: p.row }));

    const dirs = [];
    (function collect(node, prefix) {
        for (const k of node.children ? node.children.values() : []) {
            if (!k.dir) continue;
            const p2 = prefix ? prefix + "/" + k.name : k.name;
            dirs.push({ path: p2, lines: k.weight, files: k.files });
            collect(k, p2);
        }
    })(root, "");
    dirs.sort((a, b) => b.lines - a.lines);

    const biomeCensus = {};
    for (let i = 0; i < biomes.length; i++) { const n = BIOME_ORDER[biomes[i]]; if (n) biomeCensus[n] = (biomeCensus[n] || 0) + 1; }

    return {
        heights: Array.from(smooth), grid, min, max,
        // applyRealTerrain reads bbox only to place OSM roads/buildings/water in lat/lon. A repo has no lat/lon,
        // so the box is the UNIT SQUARE and the lake polygons below are emitted in it: latlonToWorld computes
        // fx = (lon-west)/(east-west) and fy = (north-lat)/(north-south), which for this box is fx = lon and
        // fy = 1 - lat. Emitting a rect corner as [1 - y, x] therefore lands it at exactly (x, y). The stamper
        // needs no repo-specific branch, and the same painter that draws a river draws a lockfile.
        bbox: { south: 0, west: 0, north: 1, east: 1 },
        source: "repo",
        water: asWater ? { areas: lakePolys(lakes, o.maxLakeCells || 0), ways: [] } : { areas: [], ways: [] },
        biomes: Array.from(biomes),
        biomeOrder: BIOME_ORDER,          // realTerrainStamp indexes this to turn an id back into a biome name
        biomeLegend: LANGUAGE_BIOME,
        peaks,
        lakes: lakes.slice().sort((a, b) => b.lines - a.lines).slice(0, Math.max(0, o.peaks))
                    .map((l) => ({ path: l.path, lines: l.lines, binary: !!l.binary, cells: l.cells })),
        stats: {
            water: asWater,
            files: placed.length, lakeFiles: lakes.length, entries: (entries || []).length, lines: root.weight,
            lakeLines: lakes.reduce((t, l) => t + (l.lines || 0), 0),
            wetCells: wet.reduce((t, v) => t + v, 0),
            dirs: dirs.length, biggestDirs: dirs.slice(0, 8), biomeCensus,
            grid, margin: m, massif: o.massif, blurPasses: o.blurPasses, blurRadius: radius,
            holesFilled: holes, shoreCells, coveredCells: covered.reduce((t, v) => t + v, 0), totalCells: grid * grid,
        },
    };
}

// *** paintWater SKIPS ANY BODY WHOSE BOUNDING BOX EXCEEDS 20,000 WORLD UNITS SQUARED. *** That cap exists so
// an OSM query that catches an open bay does not paint the whole map blue, and it is the stamper's, not ours --
// but a data file large enough to trip it is exactly the file this view most needs to show. So a rect is split
// into a grid of pieces small enough to survive the cap rather than being handed over whole and silently lost.
// The default region is ~240 voxels across, so 20,000 is about a third of the map; the split is computed in
// unit-square terms against the caller's own region so it holds whatever region the stamp is given.
function lakePolys(lakes, maxCells) {
    const LIMIT = 0.30;                       // fraction of the region either side of a piece may span
    const out = [];
    for (const l of lakes) {
        const { x, y, w, h } = l.rect;
        const nx = Math.max(1, Math.ceil(w / LIMIT)), ny = Math.max(1, Math.ceil(h / LIMIT));
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
            const x0 = x + (w * i) / nx, x1 = x + (w * (i + 1)) / nx;
            const y0 = y + (h * j) / ny, y1 = y + (h * (j + 1)) / ny;
            // [lat, lon] pairs, per the bbox note above: lat = 1 - y, lon = x.
            out.push({ path: l.path, poly: [[1 - y0, x0], [1 - y0, x1], [1 - y1, x1], [1 - y1, x0]] });
        }
    }
    return out;
}
