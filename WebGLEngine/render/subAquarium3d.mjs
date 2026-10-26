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
 * @returns { render(snapshot, t), setView(yaw, pitch, dist), resize(w, h), sea, subs: Map, dispose() }
 */
export function createView3d(THREE, canvas, { length = 500, width = 300, depthMax = 50, seed = 1 } = {}) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(1);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x03121c);
    scene.add(new THREE.AmbientLight(0x88aacc, 0.8)); const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(-200, 300, 100); scene.add(sun);
    const sea = createSeaMesh(THREE, createSurface({ components: defaultComponents(seed, CALM_OPTIONS) }), { half: Math.max(length, width) * 0.55, n: 64, color: WATER_COLOUR, opacity: 0.55 });
    sea.mesh.position.set(length / 2, 0, width / 2); scene.add(sea.mesh);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(length, width), new THREE.MeshStandardMaterial({ color: 0x1d2a25, roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.position.set(length / 2, -depthMax, width / 2); scene.add(floor);
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(length, depthMax, width)), new THREE.LineBasicMaterial({ color: 0x1c2c44 })); box.position.set(length / 2, -depthMax / 2, width / 2); scene.add(box);
    const camera = new THREE.PerspectiveCamera(50, canvas.width / canvas.height, 1, 4000);
    const view = { yaw: 0.6, pitch: 0.55, dist: 430 };   // v4899: closer, so the tank fills its panel
    const subs = new Map(), geo = {};
    // v4901 -- the ballast: bubbles while a tank is blown, a drop weight that falls (render/subBallastCues.mjs holds the arithmetic)
    let bubbles = { list: [], counter: 0 }, weights = [], lastT = null; const wasReleased = new Map();
    const bubbleGeo = new THREE.BufferGeometry(); bubbleGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(BUBBLE_MAX * 3), 3)); bubbleGeo.setDrawRange(0, 0);
    const bubblePts = new THREE.Points(bubbleGeo, new THREE.PointsMaterial({ color: 0xcdf2ff, size: 1.4, transparent: true, opacity: 0.8, depthWrite: false })); bubblePts.frustumCulled = false; scene.add(bubblePts);
    const weightMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.8, metalness: 0.4 });
    // v4899 -- FOLLOW: the camera orbits a centre, and the centre is the tank's middle unless a sub is being followed, when it eases toward that sub (and eases back when it is not).
    const home = { x: length / 2, y: -15, z: width / 2 };
    let centre = { ...home }, follow = null, distBefore = null;
    const place = () => { const q = cameraPose(centre, view); camera.position.set(q.pos[0], q.pos[1], q.pos[2]); camera.lookAt(q.look[0], q.look[1], q.look[2]); };
    return {
        sea, subs, scene, camera, renderer,
        setView(yaw, pitch, dist) { view.yaw = yaw; view.pitch = Math.max(0.05, Math.min(1.5, pitch)); view.dist = Math.max(25, Math.min(1500, dist)); },
        /** Follow a sub by id (null stops). Following from far away moves in to FOLLOW_DIST and remembers where it was; stopping puts the distance back. Returns what is followed now. */
        setFollow(id) {
            if (id && subs.has(id)) { if (follow === null && view.dist > 150) { distBefore = view.dist; view.dist = FOLLOW_DIST; } follow = id; }
            else { follow = null; if (distBefore !== null) { view.dist = distBefore; distBefore = null; } }
            return follow;
        },
        getFollow: () => follow,
        getCentre: () => ({ ...centre }),
        getView: () => ({ ...view }),
        resize(w, h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); },
        render(snapshot, t = 0) {
            sea.update(t);
            const live = new Set();
            for (const s of snapshot) {
                live.add(s.id);
                let m = subs.get(s.id);
                if (!m) {
                    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL((s.hue % 360) / 360, 0.7, 0.55), roughness: 0.5, metalness: 0.2 });
                    applyDepthTint(THREE, mat, { level: 0, density: TINT_DENSITY, color: WATER_COLOUR });
                    m = buildSub(THREE, mat, geo); attachCues(THREE, m, geo, HULL_LENGTH); m.userData.mat = mat; scene.add(m); subs.set(s.id, m);
                }
                const p = subPose(s); m.position.set(p.x, p.y, p.z); m.rotation.set(0, p.rotY, p.rotZ); poseFins(m, s.cmd); poseCues(m, s);
            }
            for (const [id, m] of subs) if (!live.has(id)) { scene.remove(m); m.userData.mat.dispose(); subs.delete(id); wasReleased.delete(id); }
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
            const tgt = follow !== null ? subs.get(follow).position : home;
            centre = followStep(centre, { x: tgt.x, y: tgt.y, z: tgt.z });
            place(); renderer.render(scene, camera);
        },
        /** For a gate: how many bubbles the view holds and how many it DRAWS, and how many dropped weights it holds, right now. */
        cues() { return { bubbles: bubbles.list.length, drawn: bubbleGeo.drawRange.count, weights: weights.length, resting: weights.filter((w) => w.rest >= 0).length }; },
        dispose() { bubbleGeo.dispose(); weightMat.dispose(); sea.dispose(); for (const k of Object.keys(geo)) geo[k].dispose(); renderer.dispose(); },
    };
}

export function reportLines() {
    return ["[subAquarium3d] the tank in three dimensions: the physics sea as the roof, every sub at its position and attitude, tinted by depth (density " + TINT_DENSITY + "/m: 14 m " + (100 * (1 - Math.exp(-TINT_DENSITY * 14))).toFixed(0) + "%, 40 m " + (100 * (1 - Math.exp(-TINT_DENSITY * 40))).toFixed(0) + "%)",
        "  tank (x, y, depth, heading, pitch) -> scene (X = x, Y = -depth, Z = y, rotation Y = heading, Z = pitch)"];
}
