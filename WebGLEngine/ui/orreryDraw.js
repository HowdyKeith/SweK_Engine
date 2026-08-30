// FILE: ui/orreryDraw.js -- v4186
//
// Draws the orrery at its three magnifications. Canvas 2D on purpose: this is a MAP of the tree, and the
// engine's WebGL renderer is the thing being mapped -- a view that needed the renderer up could not be opened
// to ask what the renderer is made of.
//
// The numbers all come from elsewhere. world/orrery.mjs decides what the bodies are, world/orreryView.mjs
// where they are and which scale you are at, world/repoHeightfield.js what a body's surface looks like, and
// world/worleyBiomes.js what colour each biome is. Nothing here invents a quantity; it turns them into pixels.
"use strict";

import { positionAt, terrainEntriesFor, apparentPx, levelFor,
         ZOOM_SYSTEM, ZOOM_PLANET, ZOOM_TERRAIN } from "../world/orreryView.mjs";
import { repoHeightfield, BIOME_ORDER } from "../world/repoHeightfield.js";
import { BIOMES } from "../world/worleyBiomes.js";
import { CAPTURED, UNPAPERED, REACHED } from "../world/orrery.mjs";

/** Licence posture is the one thing in this picture that is a JUDGEMENT, so it gets the loudest channel. */
export const STATE_COLOUR = Object.freeze({
    [CAPTURED]: "#9fe6c0",   // papered: the calm green the rest of this tree uses for a passing thing
    [UNPAPERED]: "#ff6b5e",  // no licence provenance found -- the ratchet's colour
    [REACHED]: "#33ccff",    // reached, not vendored: streamed or linked, never copied in
});

const WATER = [0.18, 0.42, 0.62];

/**
 * *** WHICH CELLS ARE WATER, AND WHY IT IS NOT field.water. *** repoHeightfield's `water` is
 * { areas, ways } -- lake POLYGONS for the terrain stamper, not a per-cell mask. The first draft of this file
 * read it as `field.water[idx]`, which is undefined for every cell and therefore falsy for every cell: every
 * lake would have been painted as dry ground and nothing would have looked broken. The per-cell tell that
 * does exist is the biome id: repoHeightfield writes `biomes[i] = 0` for a water cell, and land always gets a
 * real biome (an unrecognised extension falls back to plains, id 6, never 0). Id 0 is also what the unlaid
 * margin keeps, which is the same answer -- that border is documented there as becoming shoreline.
 */
export function isWetCell(field, idx) {
    return !!field && !!field.biomes && field.biomes[idx] === 0;
}

/** A biome id from repoHeightfield into an rgb triple, via the tree's own biome table. 0 means water. */
export function biomeColour(id) {
    const name = BIOME_ORDER[id] || "";
    const b = name && BIOMES[name];
    return b ? b.color : WATER;
}

/** Cheap deterministic shade: multiply a colour and clamp to a css string. */
function shade(rgb, k) {
    const c = (v) => Math.max(0, Math.min(255, Math.round(v * k * 255)));
    return `rgb(${c(rgb[0])},${c(rgb[1])},${c(rgb[2])})`;
}

// ---------------------------------------------------------------------------------------------------------
// SYSTEM SCALE
// ---------------------------------------------------------------------------------------------------------

/**
 * The whole orrery. `view` is { cx, cy, pxPerUnit } -- the centre in canvas pixels and the scale.
 *
 * *** THE CO-ORBITAL RING IS REAL AND IS NOT SMOOTHED AWAY. *** Eight of the fourteen bodies arrived on the
 * same day (the day vendor/ was first committed), so they share an axis exactly and therefore share a period
 * exactly: they will never separate. They are drawn on one ring at different angles -- that is what
 * phaseFor() is for -- and the ring is labelled with how many share it. Nudging their axes apart to make the
 * picture prettier would be inventing an arrival date git does not have.
 */
export function drawSystem(ctx, system, tDays, view, opts = {}) {
    const { cx, cy, pxPerUnit } = view;
    const hover = opts.hover || null;
    const bodies = system.bodies || [];

    // orbit rings, deduplicated: eight bodies on one axis is ONE ring, drawn once
    const rings = new Map();
    for (const b of bodies) rings.set(b.a.toFixed(6), (rings.get(b.a.toFixed(6)) || 0) + 1);
    ctx.lineWidth = 1;
    for (const [key, n] of rings) {
        const r = Number(key) * pxPerUnit;
        ctx.strokeStyle = n > 1 ? "rgba(255,204,102,0.28)" : "rgba(120,160,140,0.22)";
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke();
    }

    // SweK at the centre
    const sunR = Math.max(6, 0.9 * pxPerUnit * 0.3);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, sunR * 2.4);
    g.addColorStop(0, "#ffe6a8"); g.addColorStop(0.45, "rgba(255,159,0,0.55)"); g.addColorStop(1, "rgba(255,159,0,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, sunR * 2.4, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = "#ffcc66"; ctx.beginPath(); ctx.arc(cx, cy, sunR, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = "#06120b"; ctx.font = "bold 12px ui-monospace, monospace"; ctx.textAlign = "center";
    ctx.fillText("SweK", cx, cy + 4); ctx.textAlign = "left";

    const hits = [];
    for (const b of bodies) {
        const p = positionAt(b, tDays);
        const x = cx + p.x * pxPerUnit, y = cy + p.y * pxPerUnit;
        const r = Math.max(2.5, b.radius * pxPerUnit);
        hits.push({ body: b, x, y, r });

        ctx.fillStyle = STATE_COLOUR[b.state] || "#cfe6da";
        ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill();

        // *** AN UNDATED BODY IS MARKED RATHER THAN QUIETLY DRAWN AS THE NEWEST ARRIVAL. *** buildOrrery puts
        // a body git cannot date on the innermost orbit because it must go somewhere; a dashed outline says
        // that placement is a default and not a measurement.
        if (b.ageKnown === false) {
            ctx.strokeStyle = "#ffcc66"; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.arc(x, y, r + 3, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
        }
        if (hover && hover.name === b.name) {
            ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(x, y, r + 5, 0, 2 * Math.PI); ctx.stroke();
        }
    }

    // *** LABELS ARE DECLUTTERED, BECAUSE CO-ORBITAL BODIES REALLY DO SIT ON TOP OF EACH OTHER. *** Eight of
    // the fourteen share an axis, so three of them landed within a few pixels and their names overprinted into
    // an unreadable smear ("draco" over "grass" reads as "@race"). Nudging the LABEL is honest -- it moves the
    // text, never the body, and a leader line says which name belongs to which dot. Moving the bodies apart
    // would have been the dishonest fix, since their positions are the measurement.
    ctx.font = "11px ui-monospace, monospace";
    const labels = hits.map((h) => ({ h, ly: h.y + 4, left: false })).sort((a, b) => a.ly - b.ly);
    const MIN_GAP = 15;                                 // 13 was exactly the 11px line height: touching, not separated
    for (let i = 1; i < labels.length; i++) {
        const prev = labels[i - 1], cur = labels[i];
        // only push apart labels that are also close HORIZONTALLY -- two names at opposite edges of the screen
        // share a row happily, and shoving them would scatter text across a picture that had no collision
        if (Math.abs(cur.h.x - prev.h.x) < 96 && cur.ly - prev.ly < MIN_GAP) cur.ly = prev.ly + MIN_GAP;
    }
    // *** AND A LABEL FLIPS SIDES WHEN ANOTHER BODY IS SITTING WHERE IT WOULD GO. *** The vertical nudge cannot
    // help here: htmx is a small dot just left of krbn's much larger disc, so "htmx" was drawn straight across
    // krbn's face -- both names present, neither readable. Nothing is moved but the text, again.
    for (const L of labels) {
        const w = ctx.measureText(L.h.body.name).width;
        const startX = L.h.x + L.h.r + 5;
        for (const other of hits) {
            if (other.body === L.h.body) continue;
            // does the other body's disc overlap the span the text would occupy, on this row?
            if (Math.abs(other.y - L.ly) < other.r + 6 && other.x + other.r > startX && other.x - other.r < startX + w) {
                L.left = true; break;
            }
        }
    }
    for (const L of labels) {
        const { h, ly } = L;
        const w = ctx.measureText(h.body.name).width;
        const lx = L.left ? h.x - h.r - 5 - w : h.x + h.r + 5;
        if (Math.abs(ly - (h.y + 4)) > 1.5 || L.left) {  // moved: draw the leader so the pairing is not guesswork
            ctx.strokeStyle = "rgba(207,230,218,0.30)"; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(L.left ? h.x - h.r - 1 : h.x + h.r + 1, h.y);
            ctx.lineTo(L.left ? lx + w + 1 : lx - 1, ly - 4);
            ctx.stroke();
        }
        ctx.fillStyle = "rgba(207,230,218,0.88)";
        ctx.fillText(h.body.name, lx, ly);
    }

    // ring captions last, on a plate, at the BOTTOM of each ring -- the old placement was a fixed 45 degrees,
    // which is exactly where a body sits often enough to be a collision rather than a caption
    ctx.font = "10px ui-monospace, monospace";
    for (const [key, n] of rings) {
        if (n < 2) continue;
        const r = Number(key) * pxPerUnit;
        const text = `${n} co-orbital — same arrival date`;
        const w = ctx.measureText(text).width;
        ctx.fillStyle = "rgba(6,18,11,0.82)";
        ctx.fillRect(cx - w / 2 - 5, cy + r - 8, w + 10, 14);
        ctx.fillStyle = "rgba(255,204,102,0.75)";
        ctx.fillText(text, cx - w / 2, cy + r + 3);
    }
    return hits;
}

// ---------------------------------------------------------------------------------------------------------
// PLANET SCALE -- the micro planet
// ---------------------------------------------------------------------------------------------------------

const _fieldCache = new Map();

/** The heightfield for one body, built once. Keyed by name and file count so a rebake invalidates it. */
export function fieldFor(body, opts = {}) {
    const key = `${body.name}:${(body.files || []).length}:${opts.grid || ""}`;
    if (!_fieldCache.has(key)) {
        const entries = terrainEntriesFor(body);
        // A body with no readable files still has to answer: an empty field, not a thrown error, because
        // "vendor/grass is one file" is a fact about the tree and not a failure of the view.
        _fieldCache.set(key, entries.length ? repoHeightfield(entries, opts) : null);
    }
    return _fieldCache.get(key);
}

/**
 * A body as a micro planet: the heightfield wrapped onto a sphere, orthographic, lit from the upper left.
 *
 * The projection is the honest one for a globe seen from outside -- equirectangular sampling of the field,
 * so the poles smear. That smear is a property of wrapping a square map onto a ball and is left visible
 * rather than hidden behind a fudge, because the thing being shown is the file tree, not a planet.
 */
export function drawPlanet(ctx, body, field, x, y, R, spin = 0) {
    const d = Math.max(2, Math.ceil(R * 2));
    const img = ctx.createImageData(d, d);
    const px = img.data;
    const grid = field ? field.grid : 0;
    const span = field ? Math.max(1e-9, field.max - field.min) : 1;
    const L = [-0.45, -0.55, 0.70];
    const Ln = Math.hypot(L[0], L[1], L[2]);
    L[0] /= Ln; L[1] /= Ln; L[2] /= Ln;

    for (let j = 0; j < d; j++) {
        for (let i = 0; i < d; i++) {
            const nx = (i - d / 2 + 0.5) / R, ny = (j - d / 2 + 0.5) / R;
            const r2 = nx * nx + ny * ny;
            const o = (j * d + i) * 4;
            if (r2 > 1) { px[o + 3] = 0; continue; }
            const nz = Math.sqrt(1 - r2);
            const lam = Math.max(0.06, nx * L[0] + ny * L[1] + nz * L[2]);

            let rgb = [0.35, 0.42, 0.38], h = 0.5, wet = 0;
            if (grid) {
                const lon = Math.atan2(nx, nz) + spin;
                const lat = Math.asin(Math.max(-1, Math.min(1, -ny)));
                let u = (lon / (2 * Math.PI) + 0.5) % 1; if (u < 0) u += 1;
                const v = 0.5 - lat / Math.PI;                       // row 0 = north, as repoHeightfield emits
                const c = Math.min(grid - 1, Math.max(0, Math.floor(u * grid)));
                const rw = Math.min(grid - 1, Math.max(0, Math.floor(v * grid)));
                const idx = rw * grid + c;
                h = (field.heights[idx] - field.min) / span;
                wet = isWetCell(field, idx);
                rgb = wet ? WATER : biomeColour(field.biomes[idx]);
            }
            // relief: high ground lightens, low darkens, so the treemap reads as landform under the lambert
            const k = lam * (0.72 + 0.55 * h);
            px[o] = Math.min(255, rgb[0] * k * 255);
            px[o + 1] = Math.min(255, rgb[1] * k * 255);
            px[o + 2] = Math.min(255, rgb[2] * k * 255);
            px[o + 3] = 255;
        }
    }
    ctx.putImageData(img, Math.round(x - d / 2), Math.round(y - d / 2));
}

// ---------------------------------------------------------------------------------------------------------
// TERRAIN SCALE -- the same field, unwrapped, as ground
// ---------------------------------------------------------------------------------------------------------

/**
 * The heightfield as a map: biome colour, water as lakes, and a hillshade from the height gradient so the
 * treemap's directory structure reads as ridges. Peaks are labelled with the file that made them, which is
 * the point of the whole zoom -- at this scale you are looking at named files.
 */
export function drawTerrain(ctx, field, x, y, size, opts = {}) {
    if (!field) return;
    const grid = field.grid, span = Math.max(1e-9, field.max - field.min);
    const img = ctx.createImageData(grid, grid);
    const px = img.data;
    for (let r = 0; r < grid; r++) {
        for (let c = 0; c < grid; c++) {
            const i = r * grid + c;
            const h = (field.heights[i] - field.min) / span;
            // central differences, clamped at the border -- a one-sided edge would draw a false cliff there
            const hl = field.heights[r * grid + Math.max(0, c - 1)], hr = field.heights[r * grid + Math.min(grid - 1, c + 1)];
            const hu = field.heights[Math.max(0, r - 1) * grid + c], hd = field.heights[Math.min(grid - 1, r + 1) * grid + c];
            const gx = (hr - hl) / span, gy = (hd - hu) / span;
            const lam = Math.max(0.25, Math.min(1.35, 0.85 + 2.2 * (-gx * 0.6 - gy * 0.6)));
            const wet = isWetCell(field, i);
            const rgb = wet ? WATER : biomeColour(field.biomes[i]);
            const k = wet ? lam * 0.85 : lam * (0.66 + 0.6 * h);
            const o = i * 4;
            px[o] = Math.min(255, rgb[0] * k * 255);
            px[o + 1] = Math.min(255, rgb[1] * k * 255);
            px[o + 2] = Math.min(255, rgb[2] * k * 255);
            px[o + 3] = 255;
        }
    }
    // an offscreen canvas so the grid can be scaled up to `size` without smoothing the cells into mush
    const off = (typeof OffscreenCanvas !== "undefined") ? new OffscreenCanvas(grid, grid) : document.createElement("canvas");
    off.width = grid; off.height = grid;
    off.getContext("2d").putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, x - size / 2, y - size / 2, size, size);
    ctx.imageSmoothingEnabled = true;

    if (opts.labels !== false && field.peaks) {
        ctx.font = "10px ui-monospace, monospace";
        for (const p of field.peaks.slice(0, opts.peakCount || 8)) {
            const lx = x - size / 2 + (p.col + 0.5) / grid * size;
            const ly = y - size / 2 + (p.row + 0.5) / grid * size;
            ctx.fillStyle = "rgba(0,0,0,0.55)";
            const label = p.path || p.name || "";
            ctx.fillRect(lx + 3, ly - 9, ctx.measureText(label).width + 6, 12);
            ctx.fillStyle = "#ffe6a8"; ctx.fillText(label, lx + 6, ly);
            ctx.fillStyle = "#ffcc66"; ctx.fillRect(lx - 1.5, ly - 1.5, 3, 3);
        }
    }
}

/** Which of the three the current magnification is, given the focused body and scale. Re-exported for the page. */
export function levelOf(body, pxPerUnit) { return levelFor(apparentPx(body, pxPerUnit)); }
export { ZOOM_SYSTEM, ZOOM_PLANET, ZOOM_TERRAIN };
