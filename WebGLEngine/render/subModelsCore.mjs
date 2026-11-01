// WebGLEngine/render/subModelsCore.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE PART OF "A SUBMARINE WEARS A DOWNLOADED .glb" THAT HAS NO THREE.JS IN IT (phase 1 of docs/SUB-GLB-MODEL-SWAP.md): which hull a model is assigned to, what the assignment must say about the model's licence,
// how a model's own axes map to the hull frame, what scale makes it as long as the drawn hull, where the ballast cues go on it, how many triangles are too many, and how a boat keeps its hue. It mirrors
// ev/esShipModelsCore.js (classify, a store with injected storage, snap rules) and fixes the six things that file does not do for a submarine (see the design note, section 1).
//
// THE HULL FRAME is render/subAquarium3d.mjs's: nose +X, up +Y, the vessel's left +Z. A model's own frame is whatever its author exported; `orientationOf({ yaw, up })` says how to take it to the hull frame:
//   `up` names the model's own UP axis ("y": +Y, as glTF says; "z": +Z, a Z-up export; "-z": -Z), and is turned to +Y first; then `yaw` (0/90/180/270) turns the model about the vertical, the way the ships' picker does,
//   so that a nose that is not along +X can be brought there. The matrix is row-major, 9 numbers, M * v for a column vector v.
// Pure: no clock, no random, no Three.js, no DOM. Storage is injected.
"use strict";
import { SPECS } from "../physics/mechanics/subHulls.mjs";

export const STORE_KEY = "swek.subModels.v1";
export const DEFAULT_CLASS = "default";
export const SUB_MODEL_CLASSES = Object.freeze([...Object.keys(SPECS), DEFAULT_CLASS]);
export const UP_AXES = Object.freeze(["y", "z", "-z"]);
export const HULL_LENGTH = 16;                 // the drawn length (render/subAquarium3d.mjs HULL_LENGTH); a model is fitted to this times the view's subScale
export const HULL_RADIUS_FRACTION = 0.28;      // the procedural hull's radius over its length: the cues' placement is measured against it
export const TRIANGLES = Object.freeze({ ok: 150000, warn: 500000 });   // at or under ok: fine; at or under warn: a warning; over warn: refused

const finite = (v) => typeof v === "number" && Number.isFinite(v);

/** The class a hull's model is looked up under: the hull itself when the tank knows it, else "default". */
export const subModelClass = (hullName) => (typeof hullName === "string" && Object.prototype.hasOwnProperty.call(SPECS, hullName) ? hullName : DEFAULT_CLASS);

/** yaw snapped to 0/90/180/270 (NaN and non-numbers read as 0). */
export const snapYaw = (yaw) => ((Math.round((+yaw || 0) / 90) * 90) % 360 + 360) % 360;

/**
 * The per-hull assignment store. An entry is { url, yaw, up, name, author, licence, sourceUrl }. `set(cls, entry)` answers { ok: true, entry } or { ok: false, error }:
 * an unknown class, an empty url, an up axis that is not one of UP_AXES, or an EMPTY LICENCE is refused and nothing is stored (a model whose licence nobody stated is not assigned; the word "unknown" is a statement and is allowed).
 * `resolve(hull)` is the lookup the view uses: the hull's own entry, else the "default" entry, else null (draw the procedural hull).
 */
export function makeSubModelStore(storage) {
    const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    const load = () => { try { return (store && JSON.parse(store.getItem(STORE_KEY) || "{}")) || {}; } catch (e) { return {}; } };
    let map = load();
    const save = () => { try { if (store) store.setItem(STORE_KEY, JSON.stringify(map)); } catch (e) { /* storage may be full or blocked */ } };
    const clean = (e) => ({ url: e.url, yaw: e.yaw, up: e.up, name: e.name, author: e.author, licence: e.licence, sourceUrl: e.sourceUrl });
    return {
        get(cls) { return map[cls] ? clean(map[cls]) : null; },
        set(cls, e = {}) {
            if (!SUB_MODEL_CLASSES.includes(cls)) return { ok: false, error: `unknown class ${JSON.stringify(cls)}` };
            const url = typeof e.url === "string" ? e.url.trim() : "";
            if (!url) return { ok: false, error: "an assignment needs a url" };
            const up = e.up === undefined ? "y" : e.up;
            if (!UP_AXES.includes(up)) return { ok: false, error: `up axis ${JSON.stringify(up)} (${UP_AXES.join(", ")})` };
            const licence = typeof e.licence === "string" ? e.licence.trim() : "";
            if (!licence) return { ok: false, error: "a model with no stated licence is not assigned (write 'unknown' if you do not know)" };
            const str = (v, d) => (typeof v === "string" && v.trim() ? v.trim() : d);
            const entry = { url, yaw: snapYaw(e.yaw), up, name: str(e.name, url.split(/[\\/]/).pop()), author: str(e.author, "unknown"), licence, sourceUrl: str(e.sourceUrl, "") };
            map[cls] = entry; save(); return { ok: true, entry: clean(entry) };
        },
        clear(cls) { delete map[cls]; save(); },
        all() { const o = {}; for (const k of Object.keys(map)) o[k] = clean(map[k]); return o; },
        resolve(hull) { const c = subModelClass(hull); return this.get(c) || this.get(DEFAULT_CLASS); },
        reload() { map = load(); return this.all(); },
    };
}

/** The 3x3 row-major matrix taking the model's own axes to the hull frame: the up axis to +Y, then a turn of `yaw` degrees about +Y (three's convention: +X goes to (cos, 0, -sin)). */
export function orientationOf({ yaw = 0, up = "y" } = {}) {
    if (!UP_AXES.includes(up)) throw new Error(`subModelsCore.orientationOf: up ${JSON.stringify(up)} (${UP_AXES.join(", ")})`);
    const R = up === "y" ? [1, 0, 0, 0, 1, 0, 0, 0, 1] : up === "z" ? [1, 0, 0, 0, 0, 1, 0, -1, 0] : [1, 0, 0, 0, 0, -1, 0, 1, 0];   // (x,y,z) -> (x,y,z) | (x,z,-y) | (x,-z,y)
    const a = (snapYaw(yaw) * Math.PI) / 180, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));   // exact for the four angles
    const Y = [c, 0, s, 0, 1, 0, -s, 0, c];
    const m = new Array(9).fill(0);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) m[i * 3 + j] += Y[i * 3 + k] * R[k * 3 + j];
    return m;
}

/** M * v. */
export const applyMatrix = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]].map((x) => (x === 0 ? 0 : x));

const validBounds = (b) => !!b && Array.isArray(b.min) && Array.isArray(b.max) && b.min.length === 3 && b.max.length === 3 && b.min.every(finite) && b.max.every(finite) && b.max.every((v, i) => v >= b.min[i]);

/** The bounds ({ min, max }) of a model's own bounds after M: the 8 corners turned and boxed again. */
export function orientedBounds(bounds, M) {
    if (!validBounds(bounds)) throw new Error("subModelsCore.orientedBounds: bounds need finite min and max of three numbers each, max not under min");
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const x of [bounds.min[0], bounds.max[0]]) for (const y of [bounds.min[1], bounds.max[1]]) for (const z of [bounds.min[2], bounds.max[2]]) {
        const p = applyMatrix(M, [x, y, z]); for (let i = 0; i < 3; i++) { if (p[i] < min[i]) min[i] = p[i]; if (p[i] > max[i]) max[i] = p[i]; }
    }
    return { min, max };
}

/**
 * The scale that makes the model as long as the drawn hull: the longer of the oriented bounds' two HORIZONTAL extents (x and z; not the tallest, which for a submarine is the sail) becomes `targetLength`.
 * Answers { scale, axis ("x" or "z"), length, warnings }: `axis` "z" means the long side is across the hull frame's nose axis, so the yaw is probably wrong, and a warning says so.
 * Refuses bounds that are not finite or have no horizontal extent.
 */
export function fitScale(bounds, M, targetLength = HULL_LENGTH) {
    if (!finite(targetLength) || !(targetLength > 0)) throw new Error("subModelsCore.fitScale: the target length must be a positive number");
    const o = orientedBounds(bounds, M), ex = o.max[0] - o.min[0], ez = o.max[2] - o.min[2], axis = ex >= ez ? "x" : "z", length = Math.max(ex, ez);
    if (!(length > 0)) throw new Error("subModelsCore.fitScale: the model has no horizontal extent");
    const warnings = [];
    if (axis === "z") warnings.push("the model's long side lies across the nose axis after the facing you set: turn it 90 or 270 degrees");
    if (o.max[1] - o.min[1] > length) warnings.push("the model is taller than it is long: is the up axis right?");
    return { scale: targetLength / length, axis, length, warnings };
}

/** Where to move the oriented, scaled model so its bounds are centred on the hull's origin: the offset to ADD to its position (the centre of the oriented bounds, negated, times the scale). */
export function centering(bounds, M, scale) {
    const o = orientedBounds(bounds, M);
    if (!finite(scale) || !(scale > 0)) throw new Error("subModelsCore.centering: the scale must be a positive number");
    return [0, 1, 2].map((i) => { const v = -((o.min[i] + o.max[i]) / 2) * scale; return v === 0 ? 0 : v; });
}

/**
 * The cues' positions for a model, in the hull frame, as render/subBallastCues.attachCues puts them on the procedural hull (frame at y 1.55 R, fill at 1.03 R, slab at -1.05 R, x -0.1 L, with the hull's top at +R and
 * its keel at -R): the same numbers moved up or down by how far the centred, scaled model's top and bottom are from +-R. For a model whose bounds are exactly +-R the answer IS the procedural placement.
 * Answers { x, frameY, fillY, slabY, top, bottom }.
 */
export function cuePlacement(bounds, M, scale, L = HULL_LENGTH) {
    const o = orientedBounds(bounds, M), R = L * HULL_RADIUS_FRACTION;
    if (!finite(scale) || !(scale > 0)) throw new Error("subModelsCore.cuePlacement: the scale must be a positive number");
    const mid = ((o.min[1] + o.max[1]) / 2) * scale, top = o.max[1] * scale - mid, bottom = o.min[1] * scale - mid, up = top - R, down = bottom + R;
    return { x: -0.1 * L, frameY: 1.55 * R + up, fillY: 1.03 * R + up, slabY: -1.05 * R + down, top, bottom };
}

/** How many triangles a model may have: { level: "ok" | "warn" | "refuse", reason }. A count that is not a non-negative integer is refused. */
export function triangleBudget(count) {
    if (!finite(count) || count < 0 || !Number.isInteger(count)) return { level: "refuse", reason: "the triangle count is not a non-negative whole number" };
    if (count <= TRIANGLES.ok) return { level: "ok", reason: `${count} triangles` };
    if (count <= TRIANGLES.warn) return { level: "warn", reason: `${count} triangles is heavy for ten boats; decimate the model if the page slows` };
    return { level: "refuse", reason: `${count} triangles is over the ${TRIANGLES.warn} this view will draw` };
}

/** The attribution line shown while a model is in use. A licence of "unknown" is printed as exactly that. */
export function attributionLine(entry) {
    if (!entry || !entry.url) return "";
    return `${entry.name || "model"} by ${entry.author || "unknown"} -- licence: ${entry.licence || "unknown"}${entry.sourceUrl ? " -- " + entry.sourceUrl : ""}`;
}

/** The boat's hue as an sRGB triple 0..1, by the same HSL (s 0.7, l 0.55) render/subAquarium3d.mjs gives the procedural hull. */
export function hueRgb(hueDeg) {
    const h = ((((+hueDeg || 0) % 360) + 360) % 360) / 360, s = 0.7, l = 0.55, q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => { t = t < 0 ? t + 1 : t > 1 ? t - 1 : t; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

/** A model colour (rgb 0..1) moved `amount` of the way toward the boat's hue: amount 0 keeps the model's colour exactly; 1 is the hue; amounts outside 0..1 are clamped. */
export function tintRgb(rgb, hueDeg, amount = 0.3) {
    const t = Math.max(0, Math.min(1, finite(amount) ? amount : 0)), h = hueRgb(hueDeg);
    return [0, 1, 2].map((i) => rgb[i] + (h[i] - rgb[i]) * t);
}

export function reportLines() {
    return [`[subModelsCore] ${SUB_MODEL_CLASSES.length} classes (${SUB_MODEL_CLASSES.length - 1} hulls + default), key ${STORE_KEY}; fit to ${HULL_LENGTH} m; triangles ok <= ${TRIANGLES.ok}, warn <= ${TRIANGLES.warn}`];
}
