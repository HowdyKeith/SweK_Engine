// WebGLEngine/render/seaOgre3d.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE SEA OGRE IN THREE DIMENSIONS: the replay of brain/seaOgre.mjs sent through the same three.js sub renderer the aquarium uses (render/subAquarium3d.mjs: the physics sea as the roof, every sub a hull with its
// tower and fins at its real position and attitude, dimmed by depth), plus what this level adds -- the OGRE (a 40 m hull with its four hit zones lit by what is left of them), the headquarters, the probes, the
// escort subs and the torpedoes -- and a CAMERA THAT CAN RIDE A DEFENDER: first-person from the bow of any boat, live in the replay. THERE IS NO PLAYER CONTROL: the camera is chosen from a menu, the fight is a
// recording, and nothing a viewer does changes it.
//
// THE TANK IS AS BIG AS THE FIGHT. The aquarium's 500 x 300 m is far too small for a monster that starts 800 m out and three boats that spread across 300 m, so `tankFor(bounds)` returns a tank that holds the
// whole replay (padded, rounded up to 100 m, never under 1500 x 1000 m) and the boats are drawn `subScale` times larger than life so a hull can be seen in it. Replay coordinates (the headquarters at the origin) are
// moved to tank coordinates (0..length, 0..width) by `toTank`; everything else is subAquarium3d's own frame (X = x, Y = -depth, Z = y, a boat's heading about Y, its pitch about Z).
// The pure functions are held by render/seaOgre3d-selfcheck.mjs without a browser; the THREE part is passed THREE and is held by a browser row there.
"use strict";
import { createView3d, HULL_LENGTH } from "./subAquarium3d.mjs";
import { zoneColour, OGRE_COLOUR } from "./seaOgreView.mjs";
import * as G from "../brain/seaOgre.mjs";

export const MIN_TANK = Object.freeze({ length: 1500, width: 1000 }), DEPTH_MAX = 60, HUES = Object.freeze([195, 38, 140, 275]);
const rnd = (v) => Math.ceil(v / 100) * 100;
const num = (v) => (Number.isFinite(v) ? v : 0);

/** The tank that holds a replay: { x0, y0, length, width, depthMax } with (x0, y0) the replay's corner, so toTank(x, y) is inside 0..length, 0..width. Bounds are boundsOf's { x0, x1, y0, y1 } (or null: the minimum, about the origin). */
export function tankFor(bounds, depthMax = DEPTH_MAX) {
    if (!bounds) return Object.freeze({ x0: -MIN_TANK.length / 2, y0: -MIN_TANK.width / 2, length: MIN_TANK.length, width: MIN_TANK.width, depthMax });
    const b = bounds, w = Math.max(MIN_TANK.length, rnd(b.x1 - b.x0 + 200)), h = Math.max(MIN_TANK.width, rnd(b.y1 - b.y0 + 200)), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    return Object.freeze({ x0: cx - w / 2, y0: cy - h / 2, length: w, width: h, depthMax });
}
/** A replay point in the tank's own coordinates. */
export const toTank = (tank, x, y) => [x - tank.x0, y - tank.y0];

/** The rows for subAquarium3d's render(): one per LIVING defender { id, x, y, depth, heading, pitch, hue, cmd: null } in tank coordinates. */
export function snapshotOf(frame, tank) {
    return (frame ? frame.boats : []).filter((b) => b.alive).map((b) => { const [x, y] = toTank(tank, b.x, b.y); return { id: "d" + b.id, x, y, depth: b.depth, heading: b.heading, pitch: b.pitch, hue: HUES[(b.id - 1) % HUES.length], cmd: null }; });
}

/** The scene position (X, Y, Z) of a tank point at a depth. */
export const scenePos = (x, y, depth) => [x, -depth, y];
/** The unit direction a heading and pitch point along, in scene axes: (cos h cos p, sin p, -sin h cos p) -- the engine's heading about Y, +y of the tank being Z. */
export const forwardOf = (heading, pitch = 0) => [Math.cos(heading) * Math.cos(pitch), Math.sin(pitch), -Math.sin(heading) * Math.cos(pitch)];

/**
 * The first-person camera of a defender: { pos, look } in scene coordinates. The eye is on the bow (0.45 hulls ahead of the centre and a little up, `subScale` times larger than life), looking where the nose points,
 * `ahead` metres out. A boat that is not in the frame (sunk) has no camera: null.
 */
export function povPose(frame, id, tank, { subScale = 1, ahead = 400 } = {}) {
    const b = frame && frame.boats.find((q) => q.id === id); if (!b || !b.alive) return null;
    const f = forwardOf(b.heading, b.pitch), [x, y] = toTank(tank, b.x, b.y), c = scenePos(x, y, b.depth), k = HULL_LENGTH * subScale, e = [c[0] + f[0] * 0.45 * k, c[1] + f[1] * 0.45 * k + 0.12 * k, c[2] + f[2] * 0.45 * k];
    return { pos: e, look: [e[0] + f[0] * ahead, e[1] + f[1] * ahead, e[2] + f[2] * ahead] };
}

/** The scene positions of the OGRE's hull centre and of each of its four zones (along its heading), as { hull, zones: { tubes, sonar, cannon, engine } }. */
export function ogreScene(ogre, tank) {
    const [x, y] = toTank(tank, ogre.x, ogre.y), f = forwardOf(ogre.heading, 0), c = scenePos(x, y, ogre.depth), zones = {};
    for (const z of G.ZONES) zones[z.name] = [c[0] + f[0] * z.at, c[1], c[2] + f[2] * z.at];
    return { hull: c, zones, forward: f };
}

/** The camera choices the page offers: the overview, each defender in orbit, each defender's bow, the OGRE in orbit. */
export function cameraChoices(n) {
    const out = [{ id: "tank", label: "overview" }];
    for (let i = 1; i <= n; i++) out.push({ id: "orbit:d" + i, label: "follow defender " + i });
    for (let i = 1; i <= n; i++) out.push({ id: "bow:" + i, label: "bow of defender " + i + " (first person)" });
    out.push({ id: "orbit:ogre", label: "follow the OGRE" });
    return out;
}

/** The label the first-person overlay shows: the boat's gauges as text, or why there is no view. */
export function povLabel(frame, id, names = []) {
    const b = frame && frame.boats.find((q) => q.id === id), nm = names[id - 1] || "d" + id;
    if (!b) return `${nm}: no such boat`;
    if (!b.alive) return `${nm}: SUNK -- no view`;
    return `${nm}  ${Math.round(b.hp)} hp  depth ${b.depth.toFixed(0)} m  heading ${((b.heading * 180 / Math.PI + 360) % 360).toFixed(0)}  ${b.ammo} torpedoes`;
}

/**
 * The renderer. Returns { view (the subAquarium3d view), tank, update(frame, t, camera, names), setCamera(id), dispose() }. `THREE` and a canvas are given. The OGRE, headquarters, probes, escorts and torpedoes are
 * scene objects owned here; the boats are the view's. `camera` is one of cameraChoices' ids. Nothing in it reads input.
 */
export function createSeaOgre3d(THREE, canvas, bounds, { subScale = 3 } = {}) {
    const tank = tankFor(bounds), view = createView3d(THREE, canvas, { length: tank.length, width: tank.width, depthMax: tank.depthMax, subScale });
    const S = view.scene, objs = [];
    const add = (o) => { S.add(o); objs.push(o); return o; };
    const k = 1;   // the OGRE is drawn at its real length (40 m): it is the big thing
    const hullMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(OGRE_COLOUR), roughness: 0.6, metalness: 0.3 });
    const ogre = add(new THREE.Group()); ogre.rotation.order = "YZX";
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), hullMat); body.scale.set(G.OGRE.length / 2 * k, 5, 5); ogre.add(body);
    const hump = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 6), hullMat); hump.position.set(-2, 5, 0); ogre.add(hump);
    const zoneMeshes = {}, zoneGeo = new THREE.SphereGeometry(2.2, 10, 8);
    for (const z of G.ZONES) { const m = new THREE.Mesh(zoneGeo, new THREE.MeshStandardMaterial({ color: 0x5fe08a, emissive: 0x113322 })); m.position.set(z.at, 1, 0); ogre.add(m); zoneMeshes[z.name] = m; }
    const hqMat = new THREE.MeshStandardMaterial({ color: 0xdbe7ff, emissive: 0x223355 });
    const [hx, hy] = toTank(tank, 0, 0);
    const hq = add(new THREE.Mesh(new THREE.CylinderGeometry(6, 8, 14, 12), hqMat)); hq.position.set(hx, 0, hy);
    for (const [r, col] of [[G.OGRE.breachRange, 0xff7a7a], [G.OGRE.cannonRange, 0x2a4a6a]]) { const ring = add(new THREE.Mesh(new THREE.RingGeometry(r - 1.2, r, 64), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.6 }))); ring.rotation.x = -Math.PI / 2; ring.position.set(hx, 0.5, hy); }
    const probeMat = new THREE.MeshStandardMaterial({ color: 0xf6e05e, emissive: 0x554400 }), probeGeo = new THREE.OctahedronGeometry(5), probes = new Map();
    const escortMat = new THREE.MeshStandardMaterial({ color: 0xff9f6e }), escortGeo = new THREE.SphereGeometry(5, 10, 8), escorts = new Map();
    const torpGeo = new THREE.BufferGeometry(), TORP_MAX = 128; torpGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TORP_MAX * 3), 3)); torpGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(TORP_MAX * 3), 3));
    const torps = add(new THREE.Points(torpGeo, new THREE.PointsMaterial({ size: 9, vertexColors: true, sizeAttenuation: true }))); torps.frustumCulled = false;
    const sync = (map, items, make, place) => { const live = new Set(); for (const it of items) { live.add(it.id); let m = map.get(it.id); if (!m) { m = make(); S.add(m); map.set(it.id, m); } place(m, it); } for (const [id, m] of map) if (!live.has(id)) { S.remove(m); map.delete(id); } };
    let camera = "tank";
    view.setView(0.6, 0.55, Math.max(tank.length, tank.width) * 0.8);   // the overview is the first camera
    const api = {
        view, tank, subScale, ogre, zones: zoneMeshes,
        setCamera(id) { camera = id; if (id === "tank") view.setFollow(null); return camera; },
        getCamera: () => camera,
        /** Draw `frame` (a seaOgre trace frame) at replay time t (s). `names` label the first-person overlay text it returns. Returns { label, povOf } for the page. */
        update(frame, t, cam = camera, names = []) {
            const changed = cam !== camera; camera = cam;
            const snap = snapshotOf(frame, tank), o = frame.ogre, os = ogreScene(o, tank);
            ogre.position.set(os.hull[0], os.hull[1], os.hull[2]); ogre.rotation.set(0, o.heading, 0); ogre.visible = o.hull > 0;
            for (const z of G.ZONES) { const m = zoneMeshes[z.name]; m.material.color.set(zoneColour(o.zones[z.name], z.hp)); m.scale.setScalar(o.zones[z.name] > 0 ? 1 : 0.5); }
            sync(probes, (frame.probes || []), () => new THREE.Mesh(probeGeo, probeMat), (m, p) => { const [x, y] = toTank(tank, p.x, p.y); m.position.set(...scenePos(x, y, p.depth)); });
            sync(escorts, (frame.escorts || []), () => new THREE.Mesh(escortGeo, escortMat), (m, e) => { const [x, y] = toTank(tank, e.x, e.y); m.position.set(...scenePos(x, y, e.depth)); });
            const tp = torpGeo.attributes.position.array, tc = torpGeo.attributes.color.array, shown = frame.torps.slice(0, TORP_MAX);
            shown.forEach((q, i) => { const [x, y] = toTank(tank, q.x, q.y), p = scenePos(x, y, q.depth); tp[i * 3] = p[0]; tp[i * 3 + 1] = p[1]; tp[i * 3 + 2] = p[2]; const c = q.owner === G.OGRE.id ? [1, 0.35, 0.35] : [0.5, 0.9, 1]; tc[i * 3] = c[0]; tc[i * 3 + 1] = c[1]; tc[i * 3 + 2] = c[2]; });
            torpGeo.attributes.position.needsUpdate = true; torpGeo.attributes.color.needsUpdate = true; torpGeo.setDrawRange(0, shown.length);
            // the camera: an overview, an orbit about a boat or the OGRE, or the bow of a boat
            const m = /^(orbit|bow):(.+)$/.exec(cam);
            for (const mesh of view.subs.values()) mesh.visible = true;
            let label = "overview", pov = null;
            if (m && m[1] === "bow") { const id = Number(m[2]); pov = povPose(frame, id, tank, { subScale }); label = povLabel(frame, id, names); const mesh = view.subs.get("d" + id); if (mesh && pov) mesh.visible = false; view.setFollow(null); view.setFocus(null); }
            else if (m && m[2] === "ogre") { view.setFollow(null); view.setFocus(os.hull); if (changed) view.setView(0.8, 0.4, 330); label = "following the OGRE"; }
            else if (m) { view.setFocus(null); view.setFollow(view.subs.has(m[2]) ? m[2] : null); if (changed) view.setView(0.8, 0.4, 300); label = "following " + (names[Number(m[2].slice(1)) - 1] || m[2]); }
            else { view.setFollow(null); view.setFocus(null); if (changed) view.setView(0.6, 0.55, Math.max(tank.length, tank.width) * 0.8); }
            view.render(snap, t, pov);
            return { label, pov: !!pov };
        },
        dispose() { for (const o of objs) S.remove(o); hullMat.dispose(); zoneGeo.dispose(); torpGeo.dispose(); view.dispose(); },
    };
    return api;
}
