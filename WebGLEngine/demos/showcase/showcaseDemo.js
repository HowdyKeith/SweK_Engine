// FILE: demos/showcase/showcaseDemo.js
// VERSION: v1 — round 356
//
// Format showcase. Drops one entity from each of the 5 synthesizable
// formats around origin in a pentagon, orbits the camera, and shows
// a live stats panel listing each format with its rendering technique
// and cull/LoD numbers.
//
// Self-contained: each format gets its own renderer instance, isolated
// from the main world's render path. The demo's render hook builds an
// orbiting camera each frame and calls each renderer with it.
//
// Layout (top-down at y=6):
//
//                  P3D (twisted ribbon)
//                       12 o'clock
//
//      OVM (rounded box)               WND (tornado)
//           4 o'clock                    8 o'clock
//
//             MTO (torso)        MOL (DNA duplex)
//             6 o'clock           7 o'clock (offset)

import { P3dRenderer }   from "../../engine/P3dRenderer.js";
import { OvmRenderer }   from "../../engine/OvmRenderer.js";
import { MolRenderer }   from "../../engine/MolRenderer.js";
import { MtoRenderer }   from "../../engine/MtoRenderer.js";
import { WndRenderer }   from "../../engine/WndRenderer.js";
import { SplatRenderer } from "../../engine/SplatRenderer.js";   // v358

import { generateTwistedRibbon }      from "../../engine/p3dGenerator.js";
import { generateWithAO }              from "../../engine/ovmGenerator.js";
import { generateDNADuplex }           from "../../engine/molGenerator.js";
import { generateTorsoSlab }            from "../../engine/mtoGenerator.js";
import { generateTornado }              from "../../engine/wndGenerator.js";
import { generateRibbon as generateSplatRibbon } from "../../engine/splatGenerator.js";   // v358

const ORBIT_RADIUS = 26;
const ORBIT_HEIGHT = 14;
const LOOK_AT_Y    = 6;

// Hexagon positions for the 6 entities — radius 12 around origin, y=6
const RING_RADIUS = 12;
const RING_Y      = 6;
function ringPos(i, n = 6, yOffset = 0) {
    const ang = (i / n) * 2 * Math.PI;
    return [Math.cos(ang) * RING_RADIUS, RING_Y + yOffset, Math.sin(ang) * RING_RADIUS];
}

export class ShowcaseDemo {
    constructor({ gl, camera }) {
        this.gl = gl;
        this.outerCamera = camera;   // not used for rendering — we build our own
        this.orbitYaw = 0;
        this.orbitSpeed = 0.18;       // rad/sec
        this.autoOrbit = true;
        this.lodEnabled = true;
        this.lastFrame = performance.now();
        this._buildRenderers();
        this._buildPanel();
    }

    _buildRenderers() {
        const gl = this.gl;

        // P3D — twisted ribbon at 12 o'clock
        this.p3d = new P3dRenderer({ gl });
        const ribbon = generateTwistedRibbon({});
        this.p3d.add({ mesh: ribbon, position: ringPos(0), scale: 1.5, color: [0.6, 0.85, 0.5] });

        // OVM — rounded box at 4 o'clock
        this.ovm = new OvmRenderer({ gl });
        const box = generateWithAO("roundedBox", { width: 6, height: 6, depth: 6, smoothness: 0.5 });
        this.ovm.add({ asset: box, position: ringPos(1), scale: 0.45, voxelScale: 1, tint: [1, 0.85, 0.65] });

        // MOL — DNA duplex at ~7 o'clock (entry 2, but rotated)
        this.mol = new MolRenderer({ gl });
        const dna = generateDNADuplex({ basePairs: 16 });
        this.mol.add({ mol: dna, position: ringPos(2), scale: 0.35, atomScale: 0.5, colorMode: "cpk" });

        // MTO — torso slab at 6 o'clock
        this.mto = new MtoRenderer({ gl });
        const torso = generateTorsoSlab({ width: 10, height: 3, depth: 7 });
        this.mto.add({ mto: torso, position: ringPos(3), scale: 0.6, colorMode: "tissue" });

        // WND — tornado at slot 4 (hexagon), raised so the vertical column reads
        this.wnd = new WndRenderer({ gl });
        const tornado = generateTornado({ dim: 20, intensity: 3.5 });
        this.wnd.add({ wnd: tornado, position: ringPos(4, 6, 3), scale: 7, mode: "magnitude", steps: 48 });

        // SPLAT — synthetic ribbon at slot 5 (v358). Uses the same
        // SplatRenderer that loads real Hunyuan3D/CRM .ply outputs.
        this.splat = new SplatRenderer(gl, generateSplatRibbon({
            turns: 3, rungs: 90, width: 10,
            radius: 1.0, height: 2.4,
            palette: [[1, 0.4, 0.7], [0.4, 0.8, 1], [0.7, 1, 0.5]],
        }));
        this.splat.position = ringPos(5);
        this.splat.scale = 2.0;
    }

    _buildPanel() {
        const panel = document.createElement("div");
        Object.assign(panel.style, {
            position: "fixed", top: "60px", right: "20px",
            background: "rgba(8,14,20,0.94)",
            border: "1px solid #6ad",
            borderRadius: "8px",
            padding: "14px 18px",
            color: "#cfd",
            fontFamily: "monospace", fontSize: "11px",
            minWidth: "320px",
            zIndex: "8800",
            boxShadow: "0 0 24px rgba(80,180,255,0.22)",
        });
        panel.innerHTML = `
            <div style="color:#6cf; font-size:13px; letter-spacing:1.5px; padding-bottom:8px; border-bottom:1px solid #233; margin-bottom:10px;">🎭 FORMAT SHOWCASE</div>
            <div style="color:#aab; margin-bottom:10px; line-height:1.5;">
                Five rendering pipelines, one orbiting scene. Live cull + LoD stats per format.
            </div>

            <div id="sc-p3d" style="margin-bottom:8px; padding:6px 8px; background:#06060c; border-left:3px solid #9c6;">
                <div style="color:#9c6; font-weight:bold;">⬡ P3D — Pixal3D mesh</div>
                <div style="color:#9ab; font-size:10px;">indexed verts + face normals · twisted ribbon</div>
                <div id="sc-p3d-stats" style="color:#cfd; margin-top:3px;">—</div>
            </div>

            <div id="sc-ovm" style="margin-bottom:8px; padding:6px 8px; background:#06060c; border-left:3px solid #c96;">
                <div style="color:#c96; font-weight:bold;">▦ OVM — sparse voxels</div>
                <div style="color:#9ab; font-size:10px;">instanced cubes + AO + dual-grid · rounded box</div>
                <div id="sc-ovm-stats" style="color:#cfd; margin-top:3px;">—</div>
            </div>

            <div id="sc-mol" style="margin-bottom:8px; padding:6px 8px; background:#06060c; border-left:3px solid #69c;">
                <div style="color:#69c; font-weight:bold;">⬢ MOL — molecular field</div>
                <div style="color:#9ab; font-size:10px;">instanced icospheres + CPK colors · DNA duplex</div>
                <div id="sc-mol-stats" style="color:#cfd; margin-top:3px;">—</div>
            </div>

            <div id="sc-mto" style="margin-bottom:8px; padding:6px 8px; background:#06060c; border-left:3px solid #c66;">
                <div style="color:#c66; font-weight:bold;">▣ MTO — medical tomography</div>
                <div style="color:#9ab; font-size:10px;">cubes + smooth gradient normals · torso slab</div>
                <div id="sc-mto-stats" style="color:#cfd; margin-top:3px;">—</div>
            </div>

            <div id="sc-wnd" style="margin-bottom:8px; padding:6px 8px; background:#06060c; border-left:3px solid #6cc;">
                <div style="color:#6cc; font-weight:bold;">≋ WND — fluid field</div>
                <div style="color:#9ab; font-size:10px;">volume raymarched 3D RGBA32F · tornado vortex</div>
                <div id="sc-wnd-stats" style="color:#cfd; margin-top:3px;">—</div>
            </div>

            <div id="sc-splat" style="margin-bottom:10px; padding:6px 8px; background:#06060c; border-left:3px solid #c9c;">
                <div style="color:#c9c; font-weight:bold;">✦ SPLAT — Gaussian point cloud</div>
                <div style="color:#9ab; font-size:10px;">covariance-projected ellipsoids · synthetic ribbon (v358)</div>
                <div id="sc-splat-stats" style="color:#cfd; margin-top:3px;">—</div>
            </div>

            <div style="display:flex; gap:6px; margin-bottom:6px; align-items:center;">
                <span style="color:#889; min-width:80px;">Orbit speed:</span>
                <input id="sc-speed" type="range" min="-50" max="50" value="18" style="flex:1;"/>
                <span id="sc-speed-val" style="color:#cfd; min-width:40px; text-align:right;">0.18</span>
            </div>
            <div style="display:flex; gap:10px; margin-bottom:6px;">
                <label style="cursor:pointer;"><input id="sc-orbit" type="checkbox" checked/> Auto-orbit</label>
                <label style="cursor:pointer;"><input id="sc-lod" type="checkbox" checked/> LoD (v355)</label>
            </div>
            <button id="sc-reset" style="width:100%; background:#48c; border:none; color:#fff; padding:5px 8px; border-radius:4px; cursor:pointer; font-family:monospace;">↺ Reset view</button>
        `;
        document.body.appendChild(panel);
        this.panel = panel;
        const $ = id => panel.querySelector("#" + id);
        $("sc-speed").addEventListener("input", e => {
            this.orbitSpeed = +e.target.value / 100;
            $("sc-speed-val").textContent = this.orbitSpeed.toFixed(2);
        });
        $("sc-orbit").addEventListener("change", e => { this.autoOrbit = e.target.checked; });
        $("sc-lod").addEventListener("change", e => {
            this.lodEnabled = e.target.checked;
            this.ovm.setLodEnabled(this.lodEnabled);
            this.mol.setLodEnabled(this.lodEnabled);
            this.mto.setLodEnabled(this.lodEnabled);
        });
        $("sc-reset").addEventListener("click", () => { this.orbitYaw = 0; });
    }

    _buildOrbitCamera() {
        // Camera orbits around (0, LOOK_AT_Y, 0) at radius ORBIT_RADIUS,
        // height ORBIT_HEIGHT. yaw=0 places it on +X axis.
        const eyeX = Math.cos(this.orbitYaw) * ORBIT_RADIUS;
        const eyeZ = Math.sin(this.orbitYaw) * ORBIT_RADIUS;
        const eyeY = ORBIT_HEIGHT;
        const targetX = 0, targetY = LOOK_AT_Y, targetZ = 0;
        // forward = normalize(target - eye)
        let fx = targetX - eyeX, fy = targetY - eyeY, fz = targetZ - eyeZ;
        const fl = Math.hypot(fx, fy, fz) || 1;
        fx /= fl; fy /= fl; fz /= fl;
        // right = normalize(cross(forward, worldUp[0,1,0]))
        let rx = fz, ry = 0, rz = -fx;
        const rl = Math.hypot(rx, ry, rz) || 1;
        rx /= rl; ry /= rl; rz /= rl;
        // up = cross(right, forward)
        const ux = ry * fz - rz * fy;
        const uy = rz * fx - rx * fz;
        const uz = rx * fy - ry * fx;
        // View matrix (column-major), inverse of world transform of camera
        const viewMatrix = new Float32Array([
            rx, ux, -fx, 0,
            ry, uy, -fy, 0,
            rz, uz, -fz, 0,
            -(rx*eyeX + ry*eyeY + rz*eyeZ),
            -(ux*eyeX + uy*eyeY + uz*eyeZ),
              fx*eyeX + fy*eyeY + fz*eyeZ,
            1,
        ]);
        // Perspective projection — 60° fov, aspect from canvas
        const canvas = this.gl.canvas;
        const aspect = (canvas.width || 1) / (canvas.height || 1);
        const fovY = Math.PI / 3;
        const f = 1 / Math.tan(fovY / 2);
        const near = 0.1, far = 200;
        const range = near - far;
        const projMatrix = new Float32Array([
            f / aspect, 0, 0, 0,
            0, f, 0, 0,
            0, 0, (far + near) / range, -1,
            0, 0, (2 * far * near) / range, 0,
        ]);
        return {
            viewMatrix, projMatrix,
            position: { x: eyeX, y: eyeY, z: eyeZ },
        };
    }

    _formatStats(stats) {
        const h = stats.lodHist;
        const lodStr = h ? ` · LoD [${h.join(",")}]` : "";
        return `drawn ${stats.drawn} · culled ${stats.culled} · total ${stats.total}${lodStr}`;
    }

    _refreshPanelStats() {
        const $ = id => this.panel.querySelector("#" + id);
        $("sc-p3d-stats").textContent = this._formatStats(this.p3d.getCullStats());
        $("sc-ovm-stats").textContent = this._formatStats(this.ovm.getCullStats());
        $("sc-mol-stats").textContent = this._formatStats(this.mol.getCullStats());
        $("sc-mto-stats").textContent = this._formatStats(this.mto.getCullStats());
        $("sc-wnd-stats").textContent = this._formatStats(this.wnd.getCullStats());
        // Splat has no getCullStats — show raw gaussian count + position
        const sp = this.splat;
        const p = sp.position;
        $("sc-splat-stats").textContent = `${sp.splat.count.toLocaleString()} gaussians · scale ${sp.scale}× · @ (${p[0].toFixed(1)}, ${p[1].toFixed(1)}, ${p[2].toFixed(1)})`;
    }

    render() {
        const now = performance.now();
        const dt = (now - this.lastFrame) / 1000;
        this.lastFrame = now;
        if (this.autoOrbit) this.orbitYaw += dt * this.orbitSpeed;
        const camera = this._buildOrbitCamera();

        // Render order: opaque first (p3d, ovm, mol, mto), then translucent (wnd, splat)
        this.p3d.render(camera);
        this.ovm.render(camera);
        this.mol.render(camera);
        this.mto.render(camera);
        this.wnd.render(camera);
        // SplatRenderer uses draw(viewMat, projMat, camPos) — viewport
        // is read internally from gl.drawingBuffer{Width,Height}.
        this.splat.draw(camera.viewMatrix, camera.projMatrix,
                        [camera.position.x, camera.position.y, camera.position.z]);

        this._refreshPanelStats();
    }

    dispose() {
        try { this.panel?.remove(); } catch {}
        this.p3d.dispose();
        this.ovm.dispose();
        this.mol.dispose();
        this.mto.dispose();
        this.wnd.dispose();
        try { this.splat?.dispose(); } catch {}
    }
}
