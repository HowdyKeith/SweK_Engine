// ui/pipboyItems.mjs -- v4559
//
// *** THE ROTATING WIREFRAME ITEM: THE ONE THING A PIP-BOY INVENTORY SCREEN IS RECOGNISED BY, AND THE ONE
// THING ui/pipboyWireframe.js's INV PAGE DID NOT HAVE. *** That page drew six item names and a blinking
// cursor. The panel beside the list -- where the selected item turns slowly in green wireframe -- was empty.
//
// This module is the geometry and the projection, and NOTHING ELSE. No canvas, no DOM, no THREE. That is
// deliberate: a wireframe that looks right at 0 degrees and pokes through the bezel at 137 is the actual
// failure this kind of code has, and it is a question about arithmetic. Kept pure, the answer is a Node
// assertion over every model at every angle instead of somebody watching a screen and hoping.
//
// The renderer is a thin caller: ask for `project(model, angle, box)`, get back line segments in panel
// pixels, stroke them.
"use strict";

/** A model is { name, v: [[x,y,z]...], e: [[i,j]...] } in a unit-ish box centred on the origin. */
const box = (w, h, d) => {
    const x = w / 2, y = h / 2, z = d / 2;
    return {
        v: [[-x,-y,-z],[x,-y,-z],[x,y,-z],[-x,y,-z],[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]],
        e: [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]],
    };
};

/** A closed ring of `n` points on the XZ plane at height y. Returns vertices only; edges are added by the caller. */
const ring = (n, r, y) => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.cos(a) * r, y, Math.sin(a) * r];
});

/** Stack rings into a tube: rings joined round and rung-to-rung. */
function tube(radii, ys, seg = 8) {
    const v = [], e = [];
    for (let k = 0; k < radii.length; k++) {
        const base = v.length;
        v.push(...ring(seg, radii[k], ys[k]));
        for (let i = 0; i < seg; i++) e.push([base + i, base + (i + 1) % seg]);
        if (k > 0) { const prev = base - seg; for (let i = 0; i < seg; i++) e.push([prev + i, base + i]); }
    }
    return { v, e };
}

/** Glue parts into one model, re-indexing edges. */
function join(...parts) {
    const v = [], e = [];
    for (const p of parts) { const off = v.length; v.push(...p.v); for (const [a, b] of p.e) e.push([a + off, b + off]); }
    return { v, e };
}

const translate = (m, dx, dy, dz) => ({ v: m.v.map(([x, y, z]) => [x + dx, y + dy, z + dz]), e: m.e });
const scale = (m, s) => ({ v: m.v.map(([x, y, z]) => [x * s, y * s, z * s]), e: m.e });

// ---- THE ITEMS ------------------------------------------------------------------------------------------
// Each is built from primitives rather than digitised, so they are small, readable, and every vertex is
// somewhere a reader can follow. They are recognisable at a glance and no more -- a Pip-Boy model is a
// silhouette that turns, not a mesh.

/** A syringe: barrel, plunger, needle. */
const stimpak = () => join(
    tube([0.16, 0.16], [-0.34, 0.30], 8),                      // barrel
    translate(box(0.30, 0.06, 0.30), 0, 0.30, 0),              // finger flange
    translate(tube([0.05, 0.05], [0, 0.26], 6), 0, 0.30, 0),   // plunger rod
    translate(box(0.22, 0.05, 0.22), 0, 0.56, 0),              // thumb pad
    translate(tube([0.02, 0.02], [-0.28, 0], 4), 0, -0.34, 0), // needle
);

/** An IV bag with a hanging tube. */
const radaway = () => join(
    box(0.46, 0.62, 0.16),
    translate(box(0.10, 0.08, 0.06), 0, 0.35, 0),              // hanger
    translate(tube([0.025, 0.025], [-0.22, 0], 6), 0, -0.31, 0),
);

/** A bottle: body, shoulder, neck, cap. */
const nukaCola = () => join(
    tube([0.20, 0.22, 0.22, 0.13, 0.09, 0.09], [-0.42, -0.34, 0.06, 0.24, 0.32, 0.46], 10),
    translate(tube([0.11, 0.11], [0, 0.06], 8), 0, 0.46, 0),   // cap
);

/** A bobblehead: round head, thin neck, plinth. */
const bobblehead = () => join(
    translate(tube([0.10, 0.20, 0.20, 0.10], [-0.18, -0.08, 0.12, 0.22], 10), 0, 0.22, 0),
    translate(tube([0.05, 0.05], [-0.10, 0.06], 6), 0, -0.02, 0),
    translate(box(0.44, 0.10, 0.44), 0, -0.34, 0),
);

/** A fusion core: canister with a collar and a contact pin. */
const fusionCore = () => join(
    tube([0.17, 0.17], [-0.30, 0.24], 10),
    translate(tube([0.23, 0.23], [0, 0.09], 10), 0, -0.06, 0), // collar
    translate(tube([0.07, 0.07], [0, 0.14], 6), 0, 0.24, 0),   // pin
);

/** The engine itself: a voxel cluster, because that is what it is. */
const swekEngine = () => {
    const cells = [[0,0,0],[1,0,0],[0,1,0],[0,0,1],[1,1,0],[1,0,1],[0,1,1],[-1,0,0],[0,-1,0],[0,0,-1]];
    return scale(join(...cells.map(([x, y, z]) => translate(box(0.9, 0.9, 0.9), x, y, z))), 0.22);
};

export const ITEMS = Object.freeze({
    "Stimpak": stimpak(), "RadAway": radaway(), "Nuka-Cola": nukaCola(),
    "Bobblehead": bobblehead(), "Fusion Core": fusionCore(), "SweK Engine": swekEngine(),
});

/** The model for an item name, or null. Names come from the INV list, so a rename shows up as an empty panel. */
export const modelFor = (name) => ITEMS[name] || null;

/**
 * Rotate about Y (and a fixed tilt about X so the top face reads), project, and fit to `box`.
 *
 * *** THE FIT IS PER-FRAME AND OVER THE WHOLE MODEL, WHICH IS THE POINT. *** Scaling by a radius measured
 * once at angle 0 lets a long item swing outside the panel as it turns -- the classic version of this bug.
 * The projected extent is measured at THIS angle and the scale chosen from it, so the silhouette touches the
 * panel edge and never crosses it, whatever the rotation.
 */
export function project(model, angle, panel, opts = {}) {
    const { tilt = 0.42, pad = 0.90, persp = 0.55 } = opts;
    if (!model || !model.v.length) return [];
    const ca = Math.cos(angle), sa = Math.sin(angle), ct = Math.cos(tilt), st = Math.sin(tilt);
    const pts = model.v.map(([x, y, z]) => {
        const rx = x * ca + z * sa, rz = -x * sa + z * ca;        // yaw
        const ry = y * ct - rz * st, rz2 = y * st + rz * ct;      // pitch
        const w = 1 / (1 + rz2 * persp);                          // weak perspective, never negative for |rz2|<1.8
        return [rx * w, ry * w];
    });
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [px, py] of pts) { if (px < minX) minX = px; if (px > maxX) maxX = px;
                                  if (py < minY) minY = py; if (py > maxY) maxY = py; }
    const spanX = Math.max(maxX - minX, 1e-6), spanY = Math.max(maxY - minY, 1e-6);
    const s = Math.min(panel.w / spanX, panel.h / spanY) * pad;
    const cx = panel.x + panel.w / 2, cy = panel.y + panel.h / 2;
    const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
    const screen = pts.map(([px, py]) => [cx + (px - mx) * s, cy - (py - my) * s]);
    return model.e.map(([a, b]) => [screen[a][0], screen[a][1], screen[b][0], screen[b][1]]);
}

/** Every model's edge list indexes a vertex that exists -- the one structural error a hand-built mesh has. */
export function wellFormed(model) {
    if (!model || !Array.isArray(model.v) || !Array.isArray(model.e) || !model.v.length || !model.e.length) return false;
    return model.e.every(([a, b]) => Number.isInteger(a) && Number.isInteger(b) &&
        a >= 0 && b >= 0 && a < model.v.length && b < model.v.length && a !== b) &&
        model.v.every((p) => p.length === 3 && p.every(Number.isFinite));
}
