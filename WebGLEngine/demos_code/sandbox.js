// FILE: demos_code/sandbox.js
// VERSION: v622 — interactive sandbox demo + compass for orientation.
//
// Builds on the blank_sandbox stage (flat floor + isolation:"exclusive" so
// terrain/kaiju/civs stay paused) and adds the cursor-driven voxel picker
// with hover-yellow + select-cyan highlights.
//
// Use this for:
//   - Testing voxel placement / removal with the editor palette
//   - Spawning rigs / WADs / assets onto a clean stage
//   - Confirming the picker is hitting the voxel you expect
//
// The picker raycasts THROUGH THE MOUSE CURSOR (not screen center), so you
// point at a voxel with your mouse and the yellow box snaps to it. Click to
// switch the cyan box onto that voxel (persists until you click elsewhere).

import { SandboxMode } from "../simulation/SandboxMode.js";
import { GyroCompass } from "../ui/gyroCompass.js";   // v1677 — 3D gyro/attitude compass

export default {
    id:    "sandbox",
    label: "SANDBOX",
    hint:  "Blank stage + cursor-driven voxel picker. Hover any voxel for yellow box; click to select (cyan)",
    isolation: "exclusive",
    controls: [
        "MOUSE: hover any voxel — yellow wireframe box highlights it",
        "CLICK: select the hovered voxel — cyan box stays until next click",
        "Click in empty space to deselect",
        "WASD + mouse-drag for camera (engine defaults still active here)",
        "Open the Editor palette (Settings) to place / remove voxels",
        "Switch to another demo to exit",
    ],

    start() {
        // 1. flat stage + isolation (re-uses the blank_sandbox stage manager)
        try {
            const stage = window._stage;
            if (stage) stage.enter({ floor: true });
        } catch (e) { console.warn("[sandbox] stage.enter failed:", e?.message); }

        // 2. install picker. Pull global refs (set by main.js):
        //    window.world, window.camera, window._hoverHighlight, window._selectionHighlight
        try {
            if (!this._sb) {
                this._sb = new SandboxMode({
                    world:  window.world,
                    camera: window.camera,
                    canvas: document.getElementById("glCanvas"),
                    hoverHighlight:     window._hoverHighlight,
                    selectionHighlight: window._selectionHighlight,
                });
            }
            this._sb.install();
        } catch (e) { console.warn("[sandbox] SandboxMode install failed:", e?.message); }

        // v622 — compass widget (yaw + cardinal letter + needle to true N).
        // Same widget the blank_sandbox uses; sandbox keeps it on top of the
        // picker for orientation cues when spawning things.
        // v1737 - the gyro compass moved into the peer radar (cycle the radar to its "Compass" mode); no center compass.
    },

    tick() { /* picker runs from its own rAF in SandboxMode */ },

    stop() {
        try { if (this._sb) this._sb.uninstall(); } catch {}
        try { if (window._stage) window._stage.leave(); } catch {}
        // v1737 - no center compass to unmount (it lives in the peer radar now)
    },
};
