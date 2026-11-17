// WebGLEngine/render/subAquarium3d.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// *** THE TANK IN THREE DIMENSIONS: THE SEA ABOVE, THE SUBS BENEATH IT. *** Step 3 of ocean-src-integration.
// sub-aquarium.html drew the tank as a plan and a side view on 2D canvases. This is the third view: the physics sea (render/seaThree.mjs, the surface a hull would float on) over the tank, and every sub
// -- flown by its own pilot, the PD autopilot or the fruit-fly connectome network -- as a hull at its real position and attitude, dimmed toward the water colour by how deep it is (ui/seaDepthTint.mjs).
// The subs live 14 to 40 m down and never surface, so the surface here is the roof of the tank, not a place they break: the tint is what puts them under it.
//
// subPose() is the whole coordinate story and is pure: the tank's (x along the length, y across, depth positive down, heading 0 = +x, a right turn increases it) -> the scene's (X = x, Y = -depth, Z = y;
// rotation about Y by the heading, nose-up pitch about Z). THREE is passed in.
"use strict";
import { createSeaMesh, CALM_OPTIONS } from "./seaThree.mjs";
import { STYLES, DEFAULT_STYLE } from "./seaStyles.mjs";
import { seaCameraFromView } from "../ui/seaFrame.mjs";
import { createSurface, defaultComponents } from "../physics/ocean/oceanSurface.mjs";
import { applyDepthTint } from "../ui/seaDepthTint.mjs";
import { EXPLORER } from "../physics/mechanics/subModel6dof.mjs";
import { attachCues, poseCues, bubbleStep, dropStep, BUBBLE_MAX } from "./subBallastCues.mjs";

export const HULL_LENGTH = 16;     // metres on screen: a sub is drawn larger than life so a 500 m tank can be read
export const WATER_COLOUR = 0x0a3b46;
export const TINT_DENSITY = 0.045;

/** The stern planes' and rudder's largest deflection, radians: the MODEL's own (subModel6dof.mjs finMax), so a fin drawn at full command is at the angle the physics gives it. */
export const FIN_MAX = EXPLORER.finMax;

/**
 * The drawn fin angles for a pilot's command ({ pitch, yaw, ... }, each -1..+1; anything else reads as 0): { plane, rudder } as the rotation of each fin's hinge, radians.
 * *** THE SIGNS ARE THE PHYSICS', NOT A GUESS. *** A fin deflects the water toward its trailing edge and is pushed the other way. pitch +1 takes the nose UP, which wants the tail pushed DOWN, so the stern planes'
 * trailing edges go UP (a negative turn about the hull's left axis); yaw +1 takes the nose RIGHT, which wants the tail pushed LEFT, so the rudder's trailing edge goes RIGHT (a negative turn about the vertical).
 * The gate checks both against subModel6dof.forcesAndMoments rather than against this comment.
 */
export function finAngles(cmd) {
    const c = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0), k = cmd || {};
    return { plane: -c(k.pitch) * FIN_MAX, rudder: -c(k.yaw) * FIN_MAX };
}

/**
 * One submarine as a group in the hull's own frame (nose +X, up +Y, the vessel's left +Z): the hull, a conning tower (the sail) with a periscope, and the tail's control surfaces -- a stern plane pair
 * and a rudder, each on a hinge at its LEADING edge so that setting its angle swings its trailing edge, the way the real surface moves. Returns the group; group.userData.parts names the pieces.
 * `geo` caches the shared geometries across subs (pass the same object each time).
 */
export function buildSub(THREE, material, geo = {}) {
    const g = (k, make) => geo[k] || (geo[k] = make());
    const L = HULL_LENGTH, R = HULL_LENGTH * 0.28, hingeX = -L * 0.69, chord = L * 0.25;
    const group = new THREE.Group(); group.rotation.order = "YZX";
    const hull = new THREE.Mesh(g("hull", () => new THREE.SphereGeometry(1, 14, 10)), material); hull.scale.set(L, R, R); group.add(hull);
    const tower = new THREE.Mesh(g("tower", () => new THREE.BoxGeometry(L * 0.375, R * 0.8, R * 0.49)), material); tower.position.set(L * 0.19, R * 1.2, 0); group.add(tower);
    const scope = new THREE.Mesh(g("scope", () => new THREE.CylinderGeometry(R * 0.05, R * 0.05, R * 0.7, 6)), material); scope.position.set(L * 0.28, R * 1.95, 0); group.add(scope);
    const hingeGeo = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(-w / 2, 0, 0);   // the box hangs aft of its hinge
    const planes = new THREE.Mesh(g("planes", () => hingeGeo(chord, R * 0.07, R * 2.4)), material); planes.position.set(hingeX, 0, 0); group.add(planes);
    const rudder = new THREE.Mesh(g("rudder", () => hingeGeo(chord, R * 2.0, R * 0.07)), material); rudder.position.set(hingeX, 0, 0); group.add(rudder);
    group.userData.parts = { hull, tower, scope, planes, rudder };
    return group;
}

/** Set a built sub's fins to a pilot's command (see finAngles). */
export function poseFins(group, cmd) {
    const a = finAngles(cmd), P = group.userData.parts;
    P.planes.rotation.z = a.plane; P.rudder.rotation.y = a.rudder;
    return a;
}

/** The scene pose of a snapshot row ({x, y, depth, heading, pitch}). */
export function subPose(s) { return { x: s.x, y: -s.depth, z: s.y, rotY: s.heading, rotZ: s.pitch }; }

/** How close the camera sits to a sub it is following (metres): the hull is drawn 32 m long, so the tower and the tail fill the panel. */
// 2026-11-17 (nextRounds fly-dark-sub-3d and the survey markers of BACKLOG_2026-11-04_BRAINS): THE TWO MARKS THE PLAN VIEW HAD AND THIS VIEW DID NOT. A sub whose compass is
// dark wears an amber ring in the horizontal plane at its depth and an amber GHOST LINE along the heading its autopilot believes (the snapshot's compass.seen) -- the plan view's
// drawDark, in the scene's frame: a heading h points along (cos h, 0, -sin h), as the hull's nose does (section 1 of the gate). A survey's stations are buoys, amber until the boat
// has been on them and green after, as the plan and side views draw them.
export const DARK_COLOUR = 0xf6a623, STATION_COLOURS = Object.freeze({ open: 0xffc94d, visited: 0x5be37d }), DARK_RING = HULL_LENGTH * 0.9, GHOST = 2.2, BUOY_R = 1.6;
/** The dark-compass mark of a snapshot row, or null when its compass is not dark: { centre [X, Y, Z], r, tip [X, Y, Z] or null (a non-finite belief draws the ring only) }. */
export function darkMark(s, scale = 1) {
    if (!s || !s.compass || s.compass.valid) return null;
    const p = subPose(s), r = DARK_RING * scale, seen = s.compass.seen;
    return { centre: [p.x, p.y, p.z], r, tip: Number.isFinite(seen) ? [p.x + Math.cos(seen) * r * GHOST, p.y, p.z - Math.sin(seen) * r * GHOST] : null };
}
/** The buoys of every running survey in a snapshot: [{ id, pos [X, Y, Z], visited }] (a finished survey draws none, as in the plan view). */
export function stationMarks(snapshot) {
    const out = [];
    for (const s of snapshot) if (s.survey && !s.survey.finished) s.survey.stations.forEach((q, i) => out.push({ id: `${s.id}#${i}`, pos: [q.x, -q.depth, q.y], visited: !!q.visited }));
    return out;
}
/** Keep `store` ({ group, dark: Map, buoys: Map }, made by marksStore) in step with a snapshot: one ring and ghost line per dark sub, one buoy per open station. Returns { dark, buoys } counts. */
export function marksStore(THREE) {
    const group = new THREE.Group(), ringGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 48 }, (_, i) => new THREE.Vector3(Math.cos((i / 48) * 2 * Math.PI), 0, Math.sin((i / 48) * 2 * Math.PI))));
    return { group, ringGeo, buoyGeo: new THREE.SphereGeometry(BUOY_R, 10, 8), darkMat: new THREE.LineBasicMaterial({ color: DARK_COLOUR }), dark: new Map(), buoys: new Map(),
        buoyMats: { open: new THREE.MeshBasicMaterial({ color: STATION_COLOURS.open }), visited: new THREE.MeshBasicMaterial({ color: STATION_COLOURS.visited }) } };
}
export function syncMarks(THREE, store, snapshot, scale = 1) {
    const liveDark = new Set();
    for (const s of snapshot) {
        const mk = darkMark(s, scale); if (!mk) continue;
        liveDark.add(s.id);
        let d = store.dark.get(s.id);
        if (!d) { const ring = new THREE.LineLoop(store.ringGeo, store.darkMat), ghost = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), store.darkMat); store.group.add(ring, ghost); d = { ring, ghost }; store.dark.set(s.id, d); }
        d.ring.position.set(mk.centre[0], mk.centre[1], mk.centre[2]); d.ring.scale.setScalar(mk.r);
        d.ghost.visible = !!mk.tip;
        if (mk.tip) { const a = d.ghost.geometry.attributes.position.array; a.set([mk.centre[0], mk.centre[1], mk.centre[2], mk.tip[0], mk.tip[1], mk.tip[2]]); d.ghost.geometry.attributes.position.needsUpdate = true; }
    }
    for (const [id, d] of store.dark) if (!liveDark.has(id)) { store.group.remove(d.ring, d.ghost); d.ghost.geometry.dispose(); store.dark.delete(id); }
    const marks = stationMarks(snapshot), liveB = new Set(marks.map((m) => m.id));
    for (const m of marks) {
        let b = store.buoys.get(m.id);
        if (!b) { b = new THREE.Mesh(store.buoyGeo, store.buoyMats.open); store.group.add(b); store.buoys.set(m.id, b); }
        b.position.set(m.pos[0], m.pos[1], m.pos[2]); b.material = m.visited ? store.buoyMats.visited : store.buoyMats.open;
    }
    for (const [id, b] of store.buoys) if (!liveB.has(id)) { store.group.remove(b); store.buoys.delete(id); }
    return { dark: store.dark.size, buoys: store.buoys.size };
}
// 2026-11-17 (nextRounds tank-nav-3d): THE NAVIGATION SEA AND THE GOALS, which the plan and side views drew and this view did not. From tank.sceneNow() (brain/subTankNav.mjs: { type,
// x, y, r, keel }) and each courier's nav.goal, in the scene's frame (X = x, Y = -depth, Z = y). An island is land to the floor, so its column runs from the floor (-depthMax) to SEA_TOP
// above the surface; an iceberg or a ship hangs from SEA_TOP to its keel, as the side view draws them. A ship is drawn as the disc the planner avoids (its radius and keel), not a
// modelled hull: sceneNow gives no heading. A goal is a buoy in the courier's hue with a line from the courier to it.
export const NAV_COLOURS = Object.freeze({ island: 0x3d6b3a, berg: 0xbfe3ff, ship: 0xf6a623 }), SEA_TOP = 2, GOAL_R = 2.4;
/** The columns of a sea: [{ id, type, centre [X, Y, Z], r, h }], where the column spans Y from centre - h/2 to centre + h/2. An unknown type throws. */
export function navColumns(sea, depthMax = 50) {
    return (sea || []).map((o, i) => {
        if (!(o.type in NAV_COLOURS)) throw new Error(`subAquarium3d.navColumns: unknown obstacle type ${JSON.stringify(o.type)}`);
        const bottom = o.type === "island" ? -depthMax : -o.keel, h = SEA_TOP - bottom;
        return { id: `${i}:${o.type}`, type: o.type, centre: [o.x, bottom + h / 2, o.y], r: o.r, h };
    });
}
/** The goals of a snapshot: [{ id, pos [X, Y, Z], from [X, Y, Z], hue }], one per courier with a goal. */
export function navGoals(snapshot) {
    const out = [];
    for (const s of snapshot) if (s.nav && s.nav.goal) { const g = s.nav.goal, p = subPose(s); out.push({ id: s.id, pos: [g.x, -g.depth, g.y], from: [p.x, p.y, p.z], hue: s.hue }); }
    return out;
}
export function navStore(THREE) {
    const mat = (type) => new THREE.MeshStandardMaterial({ color: NAV_COLOURS[type], transparent: type !== "island", opacity: type === "island" ? 1 : 0.55, roughness: 0.9, depthWrite: type === "island" });
    return { group: new THREE.Group(), colGeo: new THREE.CylinderGeometry(1, 1, 1, 24), goalGeo: new THREE.SphereGeometry(GOAL_R, 12, 10), mats: { island: mat("island"), berg: mat("berg"), ship: mat("ship") }, cols: new Map(), goals: new Map() };
}
/** Keep `store` (navStore) in step with a sea and a snapshot: one column per obstacle (moved every frame, so the ships sail), one buoy and line per goal. Returns { columns, goals }. */
export function syncNav(THREE, store, sea, snapshot, depthMax = 50) {
    const cols = navColumns(sea, depthMax), liveC = new Set(cols.map((c) => c.id));
    for (const c of cols) {
        let m = store.cols.get(c.id);
        if (!m) { m = new THREE.Mesh(store.colGeo, store.mats[c.type]); store.group.add(m); store.cols.set(c.id, m); }
        m.position.set(c.centre[0], c.centre[1], c.centre[2]); m.scale.set(c.r, c.h, c.r);
    }
    for (const [id, m] of store.cols) if (!liveC.has(id)) { store.group.remove(m); store.cols.delete(id); }
    const goals = navGoals(snapshot), liveG = new Set(goals.map((g) => g.id));
    for (const g of goals) {
        let b = store.goals.get(g.id);
        if (!b) { const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL((g.hue % 360) / 360, 0.8, 0.65) }), lineMat = new THREE.LineBasicMaterial({ color: mat.color, transparent: true, opacity: 0.5 });
            b = { buoy: new THREE.Mesh(store.goalGeo, mat), line: new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), lineMat) }; store.group.add(b.buoy, b.line); store.goals.set(g.id, b); }
        b.buoy.position.set(g.pos[0], g.pos[1], g.pos[2]);
        const a = b.line.geometry.attributes.position.array; a.set([g.from[0], g.from[1], g.from[2], g.pos[0], g.pos[1], g.pos[2]]); b.line.geometry.attributes.position.needsUpdate = true;
    }
    for (const [id, b] of store.goals) if (!liveG.has(id)) { store.group.remove(b.buoy, b.line); b.buoy.material.dispose(); b.line.material.dispose(); b.line.geometry.dispose(); store.goals.delete(id); }
    return { columns: store.cols.size, goals: store.goals.size };
}
export const FOLLOW_DIST = 70;
/** The camera for an orbit `view` ({ yaw, pitch, dist }) around `centre` ({ x, y, z }): a point on a sphere about the centre, looking at it. At the tank's centre this is the pose the page has always had. */
export function cameraPose(centre, view) {
    return { pos: [centre.x + view.dist * Math.sin(view.yaw) * Math.cos(view.pitch), centre.y + 5 + view.dist * Math.sin(view.pitch), centre.z + view.dist * Math.cos(view.yaw) * Math.cos(view.pitch)],
             look: [centre.x, centre.y, centre.z] };
}
/** One frame of the follow: the centre moves a fraction `k` of the way to the target (an exponential approach, so a sub that turns is followed and a jump is not a cut). */
export function followStep(centre, target, k = 0.18) {
    const f = Math.max(0, Math.min(1, k));
    return { x: centre.x + (target.x - centre.x) * f, y: centre.y + (target.y - centre.y) * f, z: centre.z + (target.z - centre.z) * f };
}

/**
 * @returns { render(snapshot, t, pov), setView(yaw, pitch, dist), resize(w, h), sea, subs: Map, dispose() }
 */
export function createView3d(THREE, canvas, { length = 500, width = 300, depthMax = 50, seed = 1, subScale = 1, models = null } = {}) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(1); renderer.setClearColor(0x03121c, 1);   // the vendored three.js makes the drawing buffer's alpha either way (measured: getContextAttributes().alpha is true with `alpha: false`), so the backdrop needs only a transparent CLEAR; it stays opaque until setBackdrop
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x03121c);
    scene.add(new THREE.AmbientLight(0x88aacc, 0.8)); const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(-200, 300, 100); scene.add(sun);
    const makeSea = (style) => { const q = createSeaMesh(THREE, createSurface({ components: defaultComponents(seed, STYLES[style]) }), { half: Math.max(length, width) * 0.55, n: 64, color: WATER_COLOUR, opacity: 0.55 }); q.mesh.position.set(length / 2, 0, width / 2); return q; };
    let seaStyle = DEFAULT_STYLE, sea = makeSea(seaStyle); scene.add(sea.mesh);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(length, width), new THREE.MeshStandardMaterial({ color: 0x1d2a25, roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.position.set(length / 2, -depthMax, width / 2); scene.add(floor);
    // v4901 -- the GPU sea as a backdrop: a same-origin frame (sea-host.html) sits BEHIND this canvas, which goes transparent; each frame the sea's camera is set to this camera's pose (ui/seaFrame.mjs). The physics sea and the floor are hidden
    // (the floor is opaque and would cover the sea). It is the documented approximation: the subs are drawn in front of all the water, the depth tint is what puts them under it.
    let backdrop = null;
    const backdropApi = () => { try { return backdrop && backdrop.contentWindow && backdrop.contentWindow.seaApi || null; } catch { return null; } };
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(length, depthMax, width)), new THREE.LineBasicMaterial({ color: 0x1c2c44 })); box.position.set(length / 2, -depthMax / 2, width / 2); scene.add(box);
    const camera = new THREE.PerspectiveCamera(50, canvas.width / canvas.height, 1, 4000);
    const view = { yaw: 0.6, pitch: 0.55, dist: 430 };   // v4899: closer, so the tank fills its panel
    const subs = new Map(), geo = {};
    let modelHost = models;   // v4909: a render/subModels3d.mjs host (or null): when a hull has a model assigned it is put on the boat, the procedural hull staying as the fallback
    // v4901 -- the ballast: bubbles while a tank is blown, a drop weight that falls (render/subBallastCues.mjs holds the arithmetic)
    let bubbles = { list: [], counter: 0 }, weights = [], lastT = null; const wasReleased = new Map();
    const bubbleGeo = new THREE.BufferGeometry(); bubbleGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(BUBBLE_MAX * 3), 3)); bubbleGeo.setDrawRange(0, 0);
    const bubblePts = new THREE.Points(bubbleGeo, new THREE.PointsMaterial({ color: 0xcdf2ff, size: 1.4, transparent: true, opacity: 0.8, depthWrite: false })); bubblePts.frustumCulled = false; scene.add(bubblePts);
    const weightMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.8, metalness: 0.4 });
    const marks = marksStore(THREE); scene.add(marks.group);   // 2026-11-17: the dark-compass ring and ghost line, and the survey's buoys
    const nav = navStore(THREE); scene.add(nav.group); let navSea = [];   // 2026-11-17 (tank-nav-3d): the navigation sea and the couriers' goals, set by setSea(tank.sceneNow())
    // v4899 -- FOLLOW: the camera orbits a centre, and the centre is the tank's middle unless a sub is being followed, when it eases toward that sub (and eases back when it is not).
    const home = { x: length / 2, y: -15, z: width / 2 };
    let centre = { ...home }, follow = null, distBefore = null, focus = null;   // focus: a scene point the camera orbits instead of a sub (the Sea OGRE's monster), overriding the follow
    const place = () => { const q = cameraPose(centre, view); camera.position.set(q.pos[0], q.pos[1], q.pos[2]); camera.lookAt(q.look[0], q.look[1], q.look[2]); };
    return {
        get sea() { return sea; }, subs, scene, camera, renderer,
        /** The physics sea's style (a key of render/seaStyles.mjs STYLES): rebuilds the surface and puts the mesh where the old one was. An unknown name throws and changes nothing. Returns the style now drawn. */
        setSeaStyle(name) {
            if (!Object.prototype.hasOwnProperty.call(STYLES, name)) throw new Error(`subAquarium3d.setSeaStyle: unknown style "${name}" (${Object.keys(STYLES).join(", ")})`);
            const vis = sea.mesh.visible, next = makeSea(name); scene.remove(sea.mesh); sea.dispose(); sea = next; sea.mesh.visible = vis; scene.add(sea.mesh); seaStyle = name; return seaStyle;
        },
        getSeaStyle: () => seaStyle,
        /** Turn the GPU sea backdrop on with its frame element (or off with null). On: the canvas clears transparent, the physics sea and the floor are hidden. Returns "on" or "off". */
        setBackdrop(frame) {
            backdrop = frame || null;
            scene.background = backdrop ? null : new THREE.Color(0x03121c); renderer.setClearColor(0x03121c, backdrop ? 0 : 1);
            sea.mesh.visible = !backdrop; floor.visible = !backdrop;
            return backdrop ? "on" : "off";
        },
        /** "off" (no backdrop), "waiting" (the frame's sea is not ready) or "live" (the sea's camera follows this one). */
        backdropState() { if (!backdrop) return "off"; const a = backdropApi(); return a && a.ready ? "live" : "waiting"; },
        setView(yaw, pitch, dist) { view.yaw = yaw; view.pitch = Math.max(0.05, Math.min(1.5, pitch)); view.dist = Math.max(25, Math.min(1500, dist)); },
        /** Follow a sub by id (null stops). Following from far away moves in to FOLLOW_DIST and remembers where it was; stopping puts the distance back. Returns what is followed now. */
        setFollow(id) {
            if (id && subs.has(id)) { if (follow === null && view.dist > 150) { distBefore = view.dist; view.dist = FOLLOW_DIST; } follow = id; }
            else { follow = null; if (distBefore !== null) { view.dist = distBefore; distBefore = null; } }
            return follow;
        },
        getFollow: () => follow,
        /** v4909 -- a render/subModels3d.mjs host (or null to take every model off at the next frame's sync): the boats wear the models the host's store assigns to the tank's hull. Answers the host now in use. */
        setModels(host) { if (!host && modelHost) for (const m of subs.values()) modelHost.release(m); modelHost = host || null; return modelHost; },
        getModels: () => modelHost,
        /** Orbit a scene point [X, Y, Z] (or null to stop): the centre eases to it like a follow. */
        setFocus(p) { focus = p ? { x: p[0], y: p[1], z: p[2] } : null; return focus; },
        getCentre: () => ({ ...centre }),
        getView: () => ({ ...view }),
        resize(w, h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); },
        /** One frame. `pov` (optional) is { pos: [x, y, z], look: [x, y, z] } in scene coordinates and REPLACES the orbit camera for this frame (a first-person view; the follow centre keeps easing as before). */
        render(snapshot, t = 0, pov = null) {
            sea.update(t);
            const live = new Set();
            for (const s of snapshot) {
                live.add(s.id);
                let m = subs.get(s.id);
                if (!m) {
                    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL((s.hue % 360) / 360, 0.7, 0.55), roughness: 0.5, metalness: 0.2 });
                    applyDepthTint(THREE, mat, { level: 0, density: TINT_DENSITY, color: WATER_COLOUR });
                    m = buildSub(THREE, mat, geo); attachCues(THREE, m, geo, HULL_LENGTH); m.scale.setScalar(subScale); m.userData.mat = mat; scene.add(m); subs.set(s.id, m);
                }
                const p = subPose(s); m.position.set(p.x, p.y, p.z); m.rotation.set(0, p.rotY, p.rotZ); poseFins(m, s.cmd); poseCues(m, s);
                if (modelHost) modelHost.sync(m, s);
            }
            syncMarks(THREE, marks, snapshot, subScale);
            syncNav(THREE, nav, navSea, snapshot, depthMax);
            for (const [id, m] of subs) if (!live.has(id)) { if (modelHost) modelHost.release(m); scene.remove(m); m.userData.mat.dispose(); subs.delete(id); wasReleased.delete(id); }
            // the ballast cues that live in the world, not on the hull: the bubbles of a tank being blown, and a weight that has just been released
            const dt = lastT === null ? 0 : Math.max(0, Math.min(0.25, t - lastT)); lastT = t;
            const emits = snapshot.filter((s) => s.tank && s.tank.blowing).map((s) => [s.x, -s.depth, s.y]);
            bubbles = bubbleStep(bubbles.list, dt, emits, bubbles.counter);
            const pos = bubbleGeo.attributes.position.array; bubbles.list.forEach((b, i) => { pos[i * 3] = b.x; pos[i * 3 + 1] = b.y; pos[i * 3 + 2] = b.z; }); bubbleGeo.attributes.position.needsUpdate = true; bubbleGeo.setDrawRange(0, bubbles.list.length);
            for (const s of snapshot) {
                const rel = !!(s.tank && s.tank.released);
                if (rel && wasReleased.get(s.id) === false) { const mesh = new THREE.Mesh(geo.weight || (geo.weight = new THREE.BoxGeometry(HULL_LENGTH * 0.25, HULL_LENGTH * 0.28 * 0.12, HULL_LENGTH * 0.28 * 0.5)), weightMat); scene.add(mesh); weights.push({ mesh, x: s.x, y: -s.depth - HULL_LENGTH * 0.28 * 1.05, z: s.y, v: 0, rest: -1, gone: false }); }
                wasReleased.set(s.id, rel);
            }
            weights = weights.map((w) => { const n = { ...dropStep(w, dt, -depthMax + 0.4), mesh: w.mesh }; n.mesh.position.set(n.x, n.y, n.z); if (n.gone) scene.remove(n.mesh); return n; }).filter((w) => !w.gone);
            if (follow !== null && !subs.has(follow)) { follow = null; if (distBefore !== null) { view.dist = distBefore; distBefore = null; } }   // the followed sub left the tank
            const tgt = focus ? focus : follow !== null ? subs.get(follow).position : home;
            centre = followStep(centre, { x: tgt.x, y: tgt.y, z: tgt.z });
            place();
            if (pov) { camera.position.set(pov.pos[0], pov.pos[1], pov.pos[2]); camera.lookAt(pov.look[0], pov.look[1], pov.look[2]); }
            if (backdrop) { const a = backdropApi(); if (a && a.ready) { const d = new THREE.Vector3(); camera.getWorldDirection(d); a.camera = seaCameraFromView([camera.position.x, camera.position.y, camera.position.z], [d.x, d.y, d.z], camera.fov); } }
            renderer.render(scene, camera);
        },
        /** For a gate: how many bubbles the view holds and how many it DRAWS, and how many dropped weights it holds, right now. */
        /** For a gate: how many dark-compass marks and survey buoys the view holds right now. */
        marks() { return { dark: marks.dark.size, buoys: marks.buoys.size }; },
        /** The navigation sea to draw from the next render on: tank.sceneNow() (an empty list or null draws none). */
        setSea(list) { navSea = Array.isArray(list) ? list : []; },
        /** For a gate: how many obstacle columns and goal buoys the view holds right now. */
        nav() { return { columns: nav.cols.size, goals: nav.goals.size }; },
        cues() { return { bubbles: bubbles.list.length, drawn: bubbleGeo.drawRange.count, weights: weights.length, resting: weights.filter((w) => w.rest >= 0).length }; },
        dispose() { bubbleGeo.dispose(); weightMat.dispose(); sea.dispose(); for (const k of Object.keys(geo)) geo[k].dispose(); renderer.dispose(); },
    };
}

export function reportLines() {
    return ["[subAquarium3d] the tank in three dimensions: the physics sea as the roof, every sub at its position and attitude, tinted by depth (density " + TINT_DENSITY + "/m: 14 m " + (100 * (1 - Math.exp(-TINT_DENSITY * 14))).toFixed(0) + "%, 40 m " + (100 * (1 - Math.exp(-TINT_DENSITY * 40))).toFixed(0) + "%)",
        "  tank (x, y, depth, heading, pitch) -> scene (X = x, Y = -depth, Z = y, rotation Y = heading, Z = pitch)"];
}
