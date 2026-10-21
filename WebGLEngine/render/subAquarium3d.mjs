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

export const HULL_LENGTH = 16;     // metres on screen: a sub is drawn larger than life so a 500 m tank can be read
export const WATER_COLOUR = 0x0a3b46;
export const TINT_DENSITY = 0.045;

/** The scene pose of a snapshot row ({x, y, depth, heading, pitch}). */
export function subPose(s) { return { x: s.x, y: -s.depth, z: s.y, rotY: s.heading, rotZ: s.pitch }; }

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
    const view = { yaw: 0.6, pitch: 0.55, dist: 620 };
    const subs = new Map(), hullGeo = new THREE.SphereGeometry(1, 14, 10);
    const place = () => { camera.position.set(length / 2 + view.dist * Math.sin(view.yaw) * Math.cos(view.pitch), view.dist * Math.sin(view.pitch) - 10, width / 2 + view.dist * Math.cos(view.yaw) * Math.cos(view.pitch)); camera.lookAt(length / 2, -15, width / 2); };
    return {
        sea, subs, scene, camera, renderer,
        setView(yaw, pitch, dist) { view.yaw = yaw; view.pitch = Math.max(0.05, Math.min(1.5, pitch)); view.dist = Math.max(80, Math.min(1500, dist)); },
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
                    m = new THREE.Mesh(hullGeo, mat); m.scale.set(HULL_LENGTH, HULL_LENGTH * 0.28, HULL_LENGTH * 0.28); m.rotation.order = "YZX"; scene.add(m); subs.set(s.id, m);
                }
                const p = subPose(s); m.position.set(p.x, p.y, p.z); m.rotation.set(0, p.rotY, p.rotZ);
            }
            for (const [id, m] of subs) if (!live.has(id)) { scene.remove(m); m.material.dispose(); subs.delete(id); }
            place(); renderer.render(scene, camera);
        },
        dispose() { sea.dispose(); hullGeo.dispose(); renderer.dispose(); },
    };
}

export function reportLines() {
    return ["[subAquarium3d] the tank in three dimensions: the physics sea as the roof, every sub at its position and attitude, tinted by depth (density " + TINT_DENSITY + "/m: 14 m " + (100 * (1 - Math.exp(-TINT_DENSITY * 14))).toFixed(0) + "%, 40 m " + (100 * (1 - Math.exp(-TINT_DENSITY * 40))).toFixed(0) + "%)",
        "  tank (x, y, depth, heading, pitch) -> scene (X = x, Y = -depth, Z = y, rotation Y = heading, Z = pitch)"];
}
