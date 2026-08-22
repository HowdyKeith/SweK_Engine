// WebGLEngine/ev/dockView.js — a small three.js viewport for the EV landing panel: a slowly-rotating VOXEL body of the
// stellar you docked at (a hollow voxel shell wrapping a glowing energy core), coloured from its flags. The voxel model
// comes from dockVisual.dockVoxelModel — the same voxelization the "Export .vox" button writes — rendered here as one
// InstancedMesh of cubes per kind. Defensive: if three.js can't initialise, every method is a no-op so landing still works.
import * as THREE from "three";
import { dockVoxelModel } from "./dockVisual.js";

function mountDockView(canvas) {
    let renderer, scene, camera, body = null, raf = 0, running = false, ok = false;
    try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1));
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        camera.position.set(0, 0, 3.25);
        scene.add(new THREE.AmbientLight(0x415066, 1.15));
        const key = new THREE.DirectionalLight(0xfff0e0, 1.5); key.position.set(2.2, 1.6, 2.4); scene.add(key);
        const rim = new THREE.DirectionalLight(0x4060a0, 0.6); rim.position.set(-2.2, -0.8, -1.5); scene.add(rim);
        ok = true;
    } catch (e) {
        return { show() {}, hide() {}, dispose() {} };
    }

    function resize() {
        const w = canvas.clientWidth || canvas.width || 220, h = canvas.clientHeight || canvas.height || 220;
        renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }

    function disposeBody() {
        if (!body) return;
        scene.remove(body);
        body.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        body = null;
    }

    function build(model) {
        disposeBody();
        const group = new THREE.Group();
        const cube = new THREE.BoxGeometry(0.9, 0.9, 0.9);            // sub-unit cubes so seams show the core's glow
        const tmp = new THREE.Matrix4();
        for (const kind of ["solid", "energy", "ring"]) {
            const g = model.groups[kind];
            if (!g || !g.voxels.length) continue;
            const col = new THREE.Color(g.color[0] / 255, g.color[1] / 255, g.color[2] / 255);
            const mat = new THREE.MeshStandardMaterial({
                color: col,
                metalness: kind === "energy" ? 0.1 : 0.15,
                roughness: kind === "energy" ? 0.3 : 0.85,
                emissive: col.clone().multiplyScalar(g.emissive),
            });
            const inst = new THREE.InstancedMesh(cube, mat, g.voxels.length);
            g.voxels.forEach((p, i) => { tmp.makeTranslation(p.x, p.y, p.z); inst.setMatrixAt(i, tmp); });
            inst.instanceMatrix.needsUpdate = true;
            group.add(inst);
        }
        group.scale.setScalar(2.0 / model.size);                     // fit the grid into the viewport
        group.userData.spin = model.spin;
        group.rotation.x = 0.4;
        body = group;
        scene.add(body);
    }

    function loop() {
        if (!running) return;
        if (body) body.rotation.y += (body.userData.spin || 0.15) * 0.016;
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
    }

    return {
        // Show the body for a given spöb (derives the look internally).
        show(spob) {
            if (!ok) return;
            try { build(dockVoxelModel(spob)); resize(); } catch (e) { return; }
            if (!running) { running = true; raf = requestAnimationFrame(loop); }
        },
        hide() { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } },
        dispose() { this.hide(); disposeBody(); try { renderer.dispose(); } catch (e) {} },
    };
}

export { mountDockView };
