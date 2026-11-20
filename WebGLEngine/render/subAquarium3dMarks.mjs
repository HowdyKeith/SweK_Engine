// WebGLEngine/render/subAquarium3dMarks.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is render/subAquarium3dMarks-selfcheck.mjs; the backlog entries are `tank-nav-3d` and `survey-3d-markers`, brain/BACKLOG_2026-11-01.md)
//
// WHAT THE PLAN AND SIDE VIEWS DRAW AND THE 3D VIEW DID NOT: the sea's obstacles, each sub's navigation goal, and the survey's stations. The 3D view (render/subAquarium3d.mjs) is the one people look at; it drew the sea and the subs and nothing else.
//   obstacles   an ISLAND is a column from the floor to a little above the roof (land to the floor, as the side view draws it); an ICEBERG is a disc at the surface with a KEEL hanging to its keel depth, narrowing; a SHIP is a hull at the
//               surface with a keel to its keel depth, turned the way it is moving (from its last two positions; along +x until it has moved). The colours are the plan view's (island green, berg pale blue, ship amber).
//   goals       a BUOY: a sphere at the goal's depth in the courier's colour on a thin pole up to the surface (the plan view's diamond, the side view's dot).
//   stations    a RING, flat, at the station's depth: amber until the boat has been on it, green after; only for a survey that is still running (the plan view's rule).
// The specs are PURE (plain numbers, gated against the plan view's own data); createMarks puts them in a three.js scene and keeps one object per thing (by the obstacle's `group`, the courier's id, the station's index), moves it each frame,
// and removes what is gone. THREE and the scene are passed in. The depth axis is the scene's: Y = -depth (the surface is Y = 0), as render/subAquarium3d.mjs subPose.
// NOT CHECKED, said plainly: that it looks right in a real GPU frame beyond the headless one the gate takes; the objects are not tinted by depth like the hulls (they are drawn translucent instead); a ship's turn is its motion's, not the scene's own heading (the scene gives none).
"use strict";

export const COLOURS = Object.freeze({ island: 0x3d6b3a, berg: 0xbfe3ff, ship: 0xf6a623, stationTodo: 0xffc94d, stationDone: 0x5be37d });
export const ISLAND_RISE = 3;        // metres of land above the roof (the surface is Y = 0)
export const BERG_RISE = 2;          // metres of ice above the surface
export const BERG_KEEL_TIP = 0.4;    // the keel narrows to this fraction of the disc's radius at its lowest point
export const SHIP_DECK = 3;          // metres of hull above the surface
export const SHIP_BEAM = 0.4;        // the hull's beam as a fraction of its length; its length is 2 x the obstacle's radius x SHIP_LENGTH
export const SHIP_LENGTH = 0.9;
export const BUOY_RADIUS = 3, STATION_RADIUS = 7, STATION_TUBE = 0.9;

const fin = (v) => typeof v === "number" && Number.isFinite(v);

/** The drawn spec of one scene obstacle `o` ({ type, group, x, y, r, keel }), the `index`th of the scene's list, in a tank of `depthMax` metres, or null for a malformed one. Scene coordinates: X = o.x, Z = o.y, Y = -depth. { kind, id, x, z, radius, colour, ... } plus the vertical extent: `bottom` and `top` (Y). */
export function obstacleSpec(o, depthMax = 50, index = 0) {
    if (!o || !fin(o.x) || !fin(o.y) || !fin(o.r) || o.r <= 0) return null;
    const id = `${o.type}:${o.group}:${index}`;   // the scene numbers its obstacles by GROUP (the three islands of an archipelago share one), so the id needs the position in the list too
    if (o.type === "island") return { kind: "island", id, x: o.x, z: o.y, radius: o.r, bottom: -depthMax, top: ISLAND_RISE, colour: COLOURS.island };
    if (o.type === "berg" && fin(o.keel)) return { kind: "berg", id, x: o.x, z: o.y, radius: o.r, bottom: -Math.min(depthMax, Math.max(0, o.keel)), top: BERG_RISE, colour: COLOURS.berg, tip: BERG_KEEL_TIP };
    if (o.type === "ship" && fin(o.keel)) return { kind: "ship", id, x: o.x, z: o.y, radius: o.r, length: 2 * o.r * SHIP_LENGTH, beam: 2 * o.r * SHIP_LENGTH * SHIP_BEAM, bottom: -Math.min(depthMax, Math.max(0, o.keel)), top: SHIP_DECK, colour: COLOURS.ship };
    return null;
}

/** A courier's goal buoy: { id, x, y (= -depth), z, colour-hue } from a snapshot row with `nav.goal` { x, y, depth }, or null. */
export function goalSpec(s) {
    const g = s && s.nav && s.nav.goal;
    if (!g || !fin(g.x) || !fin(g.y) || !fin(g.depth)) return null;
    return { id: `goal:${s.id}`, x: g.x, y: -g.depth, z: g.y, hue: fin(s.hue) ? s.hue : 0 };
}

/** The survey's stations of a snapshot row that has a RUNNING survey: [{ id, x, y (= -depth), z, visited, colour }], or []. A finished survey draws none (as the plan view). */
export function stationSpecs(s) {
    if (!s || !s.survey || s.survey.finished || !Array.isArray(s.survey.stations)) return [];
    const out = [];
    s.survey.stations.forEach((q, i) => { if (q && fin(q.x) && fin(q.y) && fin(q.depth)) out.push({ id: `station:${s.id}:${i}`, x: q.x, y: -q.depth, z: q.y, visited: !!q.visited, colour: q.visited ? COLOURS.stationDone : COLOURS.stationTodo }); });
    return out;
}

/** The heading (radians, the scene's rotation about Y: 0 = +x, positive turns the nose toward -z) of a move from (x0, z0) to (x1, z1), or `fallback` when it did not move. */
export function moveHeading(x0, z0, x1, z1, fallback = 0) {
    const dx = x1 - x0, dz = z1 - z0;
    return Math.hypot(dx, dz) < 1e-6 ? fallback : Math.atan2(-dz || 0, dx);
}

/** The three.js side. `update(obstacles, snapshot)` once per frame; `counts()` for a gate; `dispose()`. */
export function createMarks(THREE, scene, { depthMax = 50 } = {}) {
    const root = new THREE.Group(); root.name = "marks"; scene.add(root);
    const things = new Map();   // id -> { obj, kind, mats, last: { x, z }, heading }
    const geos = [];
    const geo = (g) => { geos.push(g); return g; };
    const mat = (colour, opacity) => new THREE.MeshStandardMaterial({ color: colour, roughness: 0.8, metalness: 0.05, transparent: opacity < 1, opacity, depthWrite: opacity >= 0.9 });
    const unit = { cyl: geo(new THREE.CylinderGeometry(1, 1, 1, 24)), box: geo(new THREE.BoxGeometry(1, 1, 1)), sphere: geo(new THREE.SphereGeometry(1, 16, 12)), torus: geo(new THREE.TorusGeometry(1, STATION_TUBE / STATION_RADIUS, 8, 36)), pole: geo(new THREE.CylinderGeometry(0.25, 0.25, 1, 6)) };
    const make = (spec, kind) => {
        const g = new THREE.Group(), mats = [];
        const part = (geom, m) => { const q = new THREE.Mesh(geom, m); g.add(q); mats.push(m); return q; };
        if (kind === "island") part(unit.cyl, mat(spec.colour, 0.92));
        else if (kind === "berg") { part(unit.cyl, mat(spec.colour, 0.85)); part(geo(new THREE.CylinderGeometry(1, spec.tip, 1, 20)), mat(spec.colour, 0.35)); }   // the keel's own geometry: wide at the surface, narrowing to `tip` of the radius at its lowest point
        else if (kind === "ship") { part(unit.box, mat(spec.colour, 0.9)); part(unit.box, mat(spec.colour, 0.3)); }
        else if (kind === "goal") { part(unit.sphere, mat(new THREE.Color().setHSL((spec.hue % 360) / 360, 0.8, 0.62).getHex(), 1)); part(unit.pole, mat(0x9fb4c8, 0.7)); }
        else if (kind === "station") part(unit.torus, mat(spec.colour, 0.95));
        g.userData.kind = kind; root.add(g); return { obj: g, kind, mats, last: null, heading: 0 };
    };
    const pose = (t, spec) => {
        const g = t.obj;
        if (t.kind === "island") { const [c] = g.children; c.scale.set(spec.radius, spec.top - spec.bottom, spec.radius); c.position.y = (spec.top + spec.bottom) / 2; g.position.set(spec.x, 0, spec.z); }
        else if (t.kind === "berg") { const [disc, keel] = g.children, rise = spec.top, k = -spec.bottom; disc.scale.set(spec.radius, rise, spec.radius); disc.position.y = rise / 2; keel.scale.set(spec.radius, Math.max(k, 0.01), spec.radius); keel.position.y = -k / 2; g.position.set(spec.x, 0, spec.z); }
        else if (t.kind === "ship") {
            const [hull, keel] = g.children, k = -spec.bottom; t.heading = t.last ? moveHeading(t.last.x, t.last.z, spec.x, spec.z, t.heading) : t.heading; t.last = { x: spec.x, z: spec.z };
            hull.scale.set(spec.length, spec.top, spec.beam); hull.position.y = spec.top / 2; keel.scale.set(spec.length * 0.7, Math.max(k, 0.01), spec.beam * 0.5); keel.position.y = -k / 2; g.position.set(spec.x, 0, spec.z); g.rotation.set(0, t.heading, 0);
        }
        else if (t.kind === "goal") { const [ball, pole] = g.children; ball.scale.setScalar(BUOY_RADIUS); ball.position.set(0, 0, 0); const h = Math.max(0.01, -spec.y); pole.scale.set(1, h, 1); pole.position.y = h / 2; g.position.set(spec.x, spec.y, spec.z); }
        else if (t.kind === "station") { const [ring] = g.children; ring.scale.setScalar(STATION_RADIUS); ring.rotation.x = Math.PI / 2; g.position.set(spec.x, spec.y, spec.z); t.mats[0].color.setHex(spec.colour); }
    };
    return {
        root,
        update(obstacles, snapshot) {
            const live = new Set(), put = (spec, kind) => { if (!spec) return; live.add(spec.id); let t = things.get(spec.id); if (!t || t.kind !== kind) { if (t) { root.remove(t.obj); t.mats.forEach((m) => m.dispose()); } t = make(spec, kind); things.set(spec.id, t); } pose(t, spec); };
            (obstacles || []).forEach((o, i) => { const sp = obstacleSpec(o, depthMax, i); if (sp) put(sp, sp.kind); });
            for (const s of snapshot || []) { put(goalSpec(s), "goal"); for (const q of stationSpecs(s)) put(q, "station"); }
            for (const [id, t] of things) if (!live.has(id)) { root.remove(t.obj); t.mats.forEach((m) => m.dispose()); things.delete(id); }
        },
        counts() { const c = { island: 0, berg: 0, ship: 0, goal: 0, station: 0 }; for (const t of things.values()) c[t.kind]++; return c; },
        dispose() { for (const t of things.values()) t.mats.forEach((m) => m.dispose()); things.clear(); scene.remove(root); geos.forEach((g) => g.dispose()); },
    };
}
