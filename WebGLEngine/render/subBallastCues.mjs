// WebGLEngine/render/subBallastCues.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// WHAT THE BALLAST LOOKS LIKE, IN THE TANK'S 3D VIEW AND ITS LIST. A sub that is in an event (render/subAquariumSim.mjs setEvent: flooded, sinking, surfacing) carries a TANK in its snapshot row -- { level (-1 blown .. +1 flooded),
// air, airMax, released, blowing } -- and three things are drawn from it:
//   THE GAUGE    a thin upright bar on the hull behind the tower, filled from the keel up to the tank's water fraction (level + 1) / 2, cyan, amber when the bottle is under a quarter full
//   THE BUBBLES  while the tank is being blown (`blowing`: the emergency blow is on) the hull sheds bubbles that rise at BUBBLE_RISE metres a second and are gone at the surface or after BUBBLE_LIFE seconds
//   THE WEIGHT   a slab under the keel while the drop weight is on; on the tick it is released it leaves the hull and FALLS (accelerating to WEIGHT_TERMINAL) to the floor, where it lies for WEIGHT_STAY seconds
//   THE LIST     readout(row) is the one line the sub's row in the page's list shows: the event, the tank's water, the air, the weight
// Everything that is a number is a PURE function here (gauge, bubbleStep, dropStep, readout), which a gate holds without a renderer; attachCues and poseCues are the three.js half (THREE is passed in).
"use strict";

export const BUBBLE_RATE = 40, BUBBLE_RISE = 6, BUBBLE_LIFE = 8, BUBBLE_MAX = 400;   // per second while blowing; metres per second; seconds; the pool
export const WEIGHT_G = 6, WEIGHT_TERMINAL = 9, WEIGHT_STAY = 30;                   // m/s^2 on screen (the water slows it), m/s, seconds on the floor
export const AIR_LOW = 0.25;                                                        // the bottle's fraction under which the gauge turns amber

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v) => (Number.isFinite(v) ? v : 0);

/** The gauge for a snapshot row's tank: { fill (the water fraction 0..1), air (0..1 of the bottle, or 1 when it has no limit), low (the bottle is under AIR_LOW) }, or null for a row with no tank. */
export function gauge(tank) {
    if (!tank) return null;
    const air = tank.airMax > 0 && Number.isFinite(tank.air) ? clamp(tank.air / tank.airMax, 0, 1) : 1;
    return { fill: clamp((num(tank.level) + 1) / 2, 0, 1), air, low: air < AIR_LOW };
}

const hash = (n) => { let t = (Math.imul(n + 0x9E3779B9, 0x85EBCA6B) ^ (n >>> 7)) >>> 0; t = Math.imul(t ^ (t >>> 13), 0xC2B2AE35); return ((t ^ (t >>> 16)) >>> 0) / 4294967296; };

/**
 * One frame of the bubbles. `list` is [{ x, y, z, age }] (scene coordinates, y up), `emits` is the list of hull positions [x, y, z] that are blowing (none: [] or null), `counter` is the running count (the seed: the same frames always make the same bubbles).
 * Returns { list, counter }; the input is not edited. Bubbles rise, age, and are dropped at the surface (y >= 0) or past BUBBLE_LIFE; new ones are born (BUBBLE_RATE a second, at most BUBBLE_MAX alive) with a little spread.
 */
export function bubbleStep(list, dt, emits, counter = 0) {
    const d = clamp(num(dt), 0, 0.25), out = [];
    for (const b of list) { const y = b.y + BUBBLE_RISE * d, age = b.age + d; if (y < 0 && age < BUBBLE_LIFE) out.push({ x: b.x + (hash(counter + out.length) - 0.5) * 0.4 * d, y, z: b.z + (hash(counter + out.length + 7) - 0.5) * 0.4 * d, age }); }
    let c = counter;
    for (const emit of emits || []) { const born = Math.floor(BUBBLE_RATE * d + hash(c)); for (let i = 0; i < born && out.length < BUBBLE_MAX; i++) { c++; out.push({ x: emit[0] + (hash(c) - 0.5) * 8, y: emit[1] + (hash(c + 1) - 0.5) * 3, z: emit[2] + (hash(c + 2) - 0.5) * 3, age: 0 }); } c++; }
    return { list: out, counter: c + 1 };
}

/** One frame of a dropped weight { x, y, z, v (speed down, m/s), rest (seconds on the floor, or -1 falling) }: it accelerates to WEIGHT_TERMINAL, stops at `floorY` (resting there), and `gone` says it has lain WEIGHT_STAY seconds. */
export function dropStep(w, dt, floorY) {
    const d = clamp(num(dt), 0, 0.25);
    if (w.rest >= 0) { const rest = w.rest + d; return { ...w, rest, gone: rest >= WEIGHT_STAY }; }
    const v = Math.min(WEIGHT_TERMINAL, w.v + WEIGHT_G * d), y = w.y - v * d;
    return y <= floorY ? { ...w, y: floorY, v: 0, rest: 0, gone: false } : { ...w, y, v, rest: -1, gone: false };
}

/** The list line for a snapshot row, or "" for a row with no event and no tank. */
export function readout(row) {
    if (!row || (!row.event && !row.tank)) return "";
    const g = gauge(row.tank), label = { flood: "FLOOD", sink: "SINKING", surface: "SURFACING" }[row.event] || "";
    if (!g) return label;
    const air = row.tank.airMax > 0 ? `air ${row.tank.air.toFixed(2)}/${row.tank.airMax}` : "air unlimited";
    return [label, `tank ${Math.round(g.fill * 100)}% water`, air, row.tank.released ? "weight DROPPED" : "weight on", row.tank.blowing ? "BLOWING" : ""].filter(Boolean).join(" · ");
}

/** Add the gauge and the drop-weight slab to a built sub (render/subAquarium3d.mjs buildSub); hidden until a row with a tank poses them. `geo` is the shared geometry cache. Returns the parts. */
export function attachCues(THREE, group, geo, L = 16) {
    const g = (k, make) => geo[k] || (geo[k] = make()), R = L * 0.28;
    const frame = new THREE.Mesh(g("gaugeFrame", () => new THREE.BoxGeometry(L * 0.04, R * 1.1, R * 0.16)), new THREE.MeshBasicMaterial({ color: 0x10202c }));
    const fill = new THREE.Mesh(g("gaugeFill", () => new THREE.BoxGeometry(L * 0.032, R * 1.04, R * 0.2).translate(0, R * 0.52, 0)), new THREE.MeshBasicMaterial({ color: 0x59d1ff }));
    const slab = new THREE.Mesh(g("weight", () => new THREE.BoxGeometry(L * 0.25, R * 0.12, R * 0.5)), new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.8, metalness: 0.4 }));
    frame.position.set(-L * 0.1, R * 1.55, 0); fill.position.set(-L * 0.1, R * 1.03, 0); slab.position.set(0, -R * 1.05, 0);
    for (const m of [frame, fill, slab]) { m.visible = false; group.add(m); }
    group.userData.cues = { frame, fill, slab, fillMat: fill.material };
    return group.userData.cues;
}

/** Pose the cues from a snapshot row: the gauge fills to the tank's water (amber when the bottle is low), the slab is shown while the weight is on. Nothing shows for a row with no tank. */
export function poseCues(group, row) {
    const C = group.userData.cues; if (!C) return null;
    const g = gauge(row && row.tank);
    C.frame.visible = C.fill.visible = !!g; C.slab.visible = !!g && !row.tank.released;
    if (g) { C.fill.scale.y = Math.max(0.02, g.fill); C.fillMat.color.setHex(g.low ? 0xf6a623 : 0x59d1ff); }
    return g;
}
