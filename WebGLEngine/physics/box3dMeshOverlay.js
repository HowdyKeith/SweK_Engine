// WebGLEngine/physics/box3dMeshOverlay.js — v2269
//
// The mesh-draw wire, done as an ISOLATED overlay so it can't disturb the raw-WebGL2 voxel renderer. It puts a
// transparent THREE canvas over the engine's canvas, copies the engine camera's exact view + projection
// matrices (window._camera.viewMatrix / .projMatrix -- the same ones MolRenderer/OvmRenderer use), and draws
// one box per window.kaijuBox3d.bodies() entry at its box3d position + orientation. Because box3d bodies live
// in the same world coordinates the voxel camera renders, and we copy the camera matrices verbatim, the boxes
// land where the toppling buildings + debris are. It self-gates on kaijuBox3d.enabled and runs its own rAF, so
// when the substrate is off (default) it renders nothing and touches nothing.
//
// RIG NOTE: only a real screen can confirm the alignment + look. Everything here is correct-by-construction
// against the exposed matrices; if debris appears offset/mirrored, the engine's matrix convention is the knob.

import * as THREE from "/vendor/three/three.module.js";   // absolute path: index.html has no "three" importmap

export function createBox3dOverlay(opts = {}) {
    let renderer = null, scene = null, cam = null, raf = null, canvas = null;
    const pool = [];
    // v2280 -- opt-in fire layer (localStorage voxelengine.box3dFire). Lazy-loaded so the flame shader only
    // compiles when you turn it on; capped + buildings-only so the ray-march stays affordable.
    const firePool = [];
    let _createFire = null, _fireTried = false;
    function fireOn() { try { return localStorage.getItem("voxelengine.box3dFire") === "1"; } catch { return false; } }
    async function ensureFire() { if (_createFire || _fireTried) return; _fireTried = true; try { const m = await import("./fire/fireMesh.js"); _createFire = m.createFire; } catch (e) { console.warn("[box3dOverlay] fire load failed:", e && e.message); } }
    const COL = { building: 0x7f93bc, debris: 0xe0913a, prop: 0x86dc93 };
    const mainCanvas = () => { try { return document.querySelector("canvas"); } catch { return null; } };

    function ensure() {
        if (renderer) return true;
        try {
            canvas = document.createElement("canvas");
            canvas.id = "box3dOverlay";
            canvas.style.cssText = "position:fixed;left:0;top:0;pointer-events:none;z-index:6;";
            document.body.appendChild(canvas);
            renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
            renderer.setClearColor(0x000000, 0);
            scene = new THREE.Scene();
            cam = new THREE.PerspectiveCamera();
            cam.matrixAutoUpdate = false;
            scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3340, 1.15));
            const d = new THREE.DirectionalLight(0xffffff, 0.85); d.position.set(0.6, 1, 0.4); scene.add(d);
            return true;
        } catch (e) { console.warn("[box3dOverlay] init failed:", e && e.message); return false; }
    }

    function sizeFor(b) {
        if (b.kind === "building" && b.ref) return [b.ref.w || 4, b.ref.h || 10, b.ref.d || 4];
        if (b.kind === "prop") return [2.2, 1.2, 1.4];
        return [1.3, 1.3, 1.3];
    }

    const _view = new THREE.Matrix4();
    function frame() {
        raf = requestAnimationFrame(frame);
        try {
            const kb = (typeof window !== "undefined") && window.kaijuBox3d;
            const camE = (typeof window !== "undefined") && window._camera;
            if (!kb || !kb.enabled || !camE || !camE.viewMatrix || !camE.projMatrix) { if (renderer) renderer.clear(); return; }

            // drive the sim: the overlay owns the per-frame box3d step (nothing else does), so toppled
            // buildings fall and debris tumbles. Set opts.step=false if you wire your own stepping loop.
            if (opts.step !== false) { try { kb.step(1 / 60); } catch {} }

            // match the main canvas size
            const mc = mainCanvas();
            if (mc) { const w = mc.clientWidth || mc.width, h = mc.clientHeight || mc.height; if (w && h && (canvas.width !== w || canvas.height !== h)) { canvas.style.width = w + "px"; canvas.style.height = h + "px"; renderer.setSize(w, h, false); } }

            // copy the engine's exact camera. view = matrixWorldInverse, so matrixWorld = view^-1; the renderer
            // then derives matrixWorldInverse back from it in updateMatrixWorld().
            _view.fromArray(camE.viewMatrix);
            cam.matrixWorld.copy(_view).invert();
            cam.projectionMatrix.fromArray(camE.projMatrix);
            cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();

            const bodies = kb.bodies() || [];
            for (let i = 0; i < bodies.length; i++) {
                let m = pool[i];
                if (!m) { m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial()); m.frustumCulled = false; scene.add(m); pool[i] = m; }
                const b = bodies[i], s = sizeFor(b), p = b.pos || [0, 0, 0], q = b.quat || [0, 0, 0, 1];
                m.visible = true;
                m.position.set(p[0], p[1], p[2]);
                m.quaternion.set(q[0], q[1], q[2], q[3]);
                m.scale.set(s[0], s[1], s[2]);
                m.material.color.setHex(COL[b.kind] || 0x9099aa);
            }
            for (let i = bodies.length; i < pool.length; i++) pool[i].visible = false;

            // fire on toppled/burning buildings (opt-in, capped, buildings-only)
            if (fireOn()) {
                ensureFire();
                if (_createFire) {
                    const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
                    let fi = 0;
                    for (const e of bodies) {
                        if (e.kind !== "building" || fi >= 16) continue;
                        let f = firePool[fi];
                        if (!f) { try { f = _createFire({ color: new THREE.Color(0xffaa33) }); scene.add(f); firePool[fi] = f; } catch (er) { break; } }
                        const s = sizeFor(e), p = e.pos || [0, 0, 0], q = e.quat || [0, 0, 0, 1];
                        f.visible = true;
                        f.position.set(p[0], p[1] + s[1] * 0.15, p[2]);
                        f.scale.set(s[0] * 1.3, s[1] * 1.7, s[2] * 1.3);
                        f.quaternion.set(q[0], q[1], q[2], q[3]);
                        f.update(now);
                        fi++;
                    }
                    for (let i = fi; i < firePool.length; i++) if (firePool[i]) firePool[i].visible = false;
                }
            } else {
                for (const f of firePool) if (f) f.visible = false;
            }

            renderer.render(scene, cam);
        } catch (e) { /* never let a bad frame kill the loop or the engine */ }
    }

    return {
        start() { if (!ensure()) return false; if (!raf) frame(); return true; },
        stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } if (renderer) { try { renderer.clear(); } catch {} } },
        running() { return !!raf; },
    };
}

if (typeof module !== "undefined" && module.exports) module.exports = { createBox3dOverlay };
