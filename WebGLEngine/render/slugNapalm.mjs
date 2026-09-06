// WebGLEngine/render/slugNapalm.mjs -- v4502
//
// *** THE TICKER ON FIRE, AND A NAPALM TRAIL (task 49). *** The task 43 glyph bodies (render/slugTicker.mjs) drawn through
// the task 47 fill with the Doom Fire, each body's fill rectangle its own glyph's em box; and behind each body a trail of
// PUDDLES -- the task 48 puddle outline packed ONCE into its own atlas -- dropped flat on the floor at the body's past
// positions every `every` ticks, fading by age. The trail is one vertex stream: every puddle is a quad of the puddle glyph
// placed in a plane whose (x, y) is the floor's (x, z), with its own colour (text/slugText.js buildVertices reads a glyph's
// `color` since v4502), and the plane's rows are P * V * F where F lays the batch flat: world x = x, world y = lift,
// world z = y. Nothing new in the shader: the trail is the projective case task 42 held, on a plane instead of a body.
"use strict";
import { mat4, rowsFor } from "./slugTicker.mjs";
import { puddleContour } from "./slugMelt.mjs";
import { packMorphed } from "./slugMorph.mjs";
import { curveBounds } from "../text/slugFont.js";

export const NAPALM = Object.freeze({
    every: 10,                        // ticks between drops
    maxAge: 150,                      // ticks a puddle lives
    cap: 12,                          // puddles a body keeps at most (the oldest go first)
    puddle: Object.freeze({ width: 1, height: 0.28, N: 48 }),   // the puddle glyph, em units: one em wide, 0.28 deep
    size: 0.3,                        // world units an em for the puddles (a little wider than a glyph at the ticker's 0.22)
    lift: 0.002,                      // world units above the floor the trail plane sits (no depth test; a courtesy)
});

/** the puddle glyph: one contour, its em box [-w/2, 0, w/2, h] -- an outline glyphMorph or packMorphed accepts */
export function puddleGlyph(p = NAPALM.puddle) {
    const contours = [puddleContour({ cx: 0, floor: 0, width: p.width, height: p.height, N: p.N })];
    return { contours, bbox: curveBounds(contours) };
}

/** the puddle packed into its own atlas at key 0 (once; the trail draws it many times) */
export function puddleAtlas(logWidth, p = NAPALM.puddle) { return packMorphed(puddleGlyph(p).contours, { logWidth }); }

/** F: the batch plane laid flat on the floor (x -> x, y -> z, at height `lift`), and the rows P * V * F */
export function floorMatrix(lift = NAPALM.lift) { return [1, 0, 0, 0, 0, 0, 0, lift, 0, 1, 0, 0, 0, 0, 0, 1]; }
export function floorRows(PV, lift = NAPALM.lift) { return rowsFor(mat4.multiply(PV, floorMatrix(lift))); }

/** a trail: the drops so far, newest last, each { body, x, z, born } */
export function createTrail(opts = {}) { return { ...NAPALM, ...opts, drops: [] }; }

/**
 * One tick of the trail: on a drop tick every body leaves a puddle at its floor position (its x and z; the height is
 * dropped), then every puddle older than maxAge goes, and each body keeps its newest `cap`. Returns the drop count.
 */
export function dropTrail(trail, tick, xf, ids) {
    if (tick % trail.every === 0) ids.forEach((i, k) => { const o = i * 7; trail.drops.push({ body: k, x: xf[o], z: xf[o + 2], born: tick }); });
    trail.drops = trail.drops.filter((d) => tick - d.born < trail.maxAge);
    const per = new Map();
    for (let n = trail.drops.length - 1; n >= 0; n--) { const d = trail.drops[n], c = (per.get(d.body) || 0) + 1; per.set(d.body, c); if (c > trail.cap) trail.drops.splice(n, 1); }
    return trail.drops.length;
}

/** how bright a puddle is at `age` ticks: (1 - age / maxAge) squared -- 1 when dropped, 0 at maxAge, fading faster as it goes */
export function trailAlpha(age, maxAge = NAPALM.maxAge) { const u = Math.min(1, Math.max(0, 1 - age / maxAge)); return u * u; }

/**
 * The trail as glyph records for buildVertices over the puddle atlas: each puddle at (x, z - h/2) in the floor plane so the
 * puddle's depth is centred on the drop, at `size` world units an em, coloured by its age (premultiplied: every channel).
 */
export function trailGlyphs(trail, tick, size = NAPALM.size, p = NAPALM.puddle) {
    return trail.drops.map((d) => { const a = trailAlpha(tick - d.born, trail.maxAge); return { glyphIndex: 0, codepoint: 0, x: d.x, y: d.z - p.height / 2 * size, size, color: [a, a, a, a], born: d.born, body: d.body }; });
}

/** the colour of a quad in a buildVertices stream (its first vertex's aCol) */
export function quadColour(built, q) { const f = new Float32Array(built.buffer), o = q * 4 * 20 + 16; return [f[o], f[o + 1], f[o + 2], f[o + 3]]; }
