// FILE: demos/wnd/wndDemo.js
// VERSION: v1 — round 353

import { encodeWND, decodeWND, wndStats } from "../../engine/wndFormat.js";
import { WND_GENERATORS } from "../../engine/wndGenerator.js";
import { WndRenderer } from "../../engine/WndRenderer.js";

export class WndDemo {
    constructor({ gl, camera }) {
        this.gl = gl;
        this.camera = camera;
        this.renderer = new WndRenderer({ gl });
        this.wnd = null;
        this.generatorName = "tornado";
        this.mode = "magnitude";
        this.steps = 48;
        this.density = 1.0;
        this.autoRotate = true;
        this.rotation = 0;
        this.entityId = null;
        this.lastFrame = performance.now();
        this._loadGenerated();
        this._buildPanel();
    }

    _loadGenerated() {
        const gen = WND_GENERATORS[this.generatorName];
        const opts = { dim: 24 };
        if (this.generatorName === "tornado")    opts.intensity = 3.5;
        if (this.generatorName === "jetStream")  opts.intensity = 4.5;
        if (this.generatorName === "turbulence") opts.intensity = 2.5;
        this.wnd = gen(opts);
        if (this.entityId !== null) this.renderer.remove(this.entityId);
        this.entityId = this.renderer.add({
            wnd: this.wnd,
            position: [(this.camera.position?.x ?? 0), 8, (this.camera.position?.z ?? 0) - 14],
            scale: 8,
            mode: this.mode,
            steps: this.steps,
            density: this.density,
        });
    }

    _buildPanel() {
        const panel = document.createElement("div");
        Object.assign(panel.style, {
            position: "fixed", top: "60px", left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(8,14,20,0.94)",
            border: "1px solid #6ad",
            borderRadius: "8px",
            padding: "14px 20px",
            color: "#cfd",
            fontFamily: "monospace", fontSize: "12px",
            minWidth: "540px",
            zIndex: "8800",
            boxShadow: "0 0 24px rgba(80,180,255,0.20)",
        });
        // Legend
        const legendStops = [0, 0.25, 0.5, 0.75, 1.0];
        const legend = legendStops.map(t => {
            // Inline the JS-side ramp so the legend mirrors the shader
            let r, g, b;
            if (t < 0.2) { const k = t / 0.2; r = 0; g = k * 0.7; b = 0.4 + k * 0.6; }
            else if (t < 0.4) { const k = (t - 0.2) / 0.2; r = 0; g = 0.7 + k * 0.3; b = 1.0 - k * 0.7; }
            else if (t < 0.6) { const k = (t - 0.4) / 0.2; r = k; g = 1; b = 0.3 - k * 0.3; }
            else if (t < 0.8) { const k = (t - 0.6) / 0.2; r = 1; g = 1 - k * 0.5; b = 0; }
            else              { const k = (t - 0.8) / 0.2; r = 1; g = 0.5 - k * 0.5; b = 0; }
            const css = `rgb(${(r*255)|0}, ${(g*255)|0}, ${(b*255)|0})`;
            return `<span style="display:inline-block; width:20%; height:10px; background:${css};"></span>`;
        }).join("");

        panel.innerHTML = `
            <div style="color:#6cf; font-size:13px; letter-spacing:1.5px; padding-bottom:8px; border-bottom:1px solid #233; margin-bottom:10px;">🌀 FLUID FIELD — .wnd</div>
            <div style="color:#aab; margin-bottom:10px; line-height:1.5;">
                3D RGBA32F texture (W×H×D × 16 B). Volume raymarcher steps along view rays.
                NetCDF4/ERA5 + scipy.interpolate Python pipeline (lastai_finally.txt).
                <b style="color:#6cf;">Different rendering than the others</b> — not instances.
            </div>
            <div style="display:flex; gap:6px; margin-bottom:8px; align-items:center;">
                <span style="color:#889; min-width:80px;">Field:</span>
                <select id="wnd-gen" style="flex:1; background:#06060c; border:1px solid #333; color:#cfd; padding:3px; font-family:monospace;">
                    <option value="tornado" selected>tornado vortex</option>
                    <option value="jetStream">jet stream</option>
                    <option value="turbulence">turbulence (multi-octave noise)</option>
                </select>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:8px; align-items:center;">
                <span style="color:#889; min-width:80px;">Display:</span>
                <label style="cursor:pointer; margin-right:10px;"><input type="radio" name="wnd-mode" value="magnitude" checked/> Magnitude heatmap</label>
                <label style="cursor:pointer;"><input type="radio" name="wnd-mode" value="vector"/> Vector (RGB = uvw)</label>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:8px; align-items:center;">
                <span style="color:#889; min-width:80px;">Steps:</span>
                <input id="wnd-steps" type="range" min="16" max="128" value="48" style="flex:1;"/>
                <span id="wnd-steps-val" style="color:#cfd; min-width:30px;">48</span>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:8px; align-items:center;">
                <span style="color:#889; min-width:80px;">Density:</span>
                <input id="wnd-density" type="range" min="20" max="300" value="100" style="flex:1;"/>
                <span id="wnd-density-val" style="color:#cfd; min-width:40px;">1.00</span>
            </div>
            <div style="font-size:10px; margin-bottom:10px;">
                <div style="color:#9ab; margin-bottom:2px;">Magnitude ramp (low → high):</div>
                <div style="display:flex; line-height:0;">${legend}</div>
                <div style="display:flex; color:#789; margin-top:2px;"><span style="width:20%;">0%</span><span style="width:20%; text-align:center;">25%</span><span style="width:20%; text-align:center;">50%</span><span style="width:20%; text-align:center;">75%</span><span style="width:20%; text-align:right;">100%</span></div>
            </div>
            <div style="display:flex; gap:12px; margin-bottom:10px; align-items:center;">
                <label style="cursor:pointer;"><input id="wnd-rotate" type="checkbox" checked/> Auto-rotate</label>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:10px;">
                <button id="wnd-regen"  style="flex:1; background:#48c; border:none; color:#fff; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:monospace;">🔄 Regenerate</button>
                <button id="wnd-export" style="flex:1; background:#a64; border:none; color:#fff; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:monospace;">💾 Export .wnd</button>
                <button id="wnd-import" style="flex:1; background:#2a4; border:none; color:#fff; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:monospace;">📂 Import .wnd</button>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:10px;">
                <button id="wnd-place" style="flex:1; background:#6a4; border:none; color:#fff; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:monospace;">📍 Place in world (window.wnd.add)</button>
            </div>
            <input id="wnd-file" type="file" accept=".wnd" style="display:none"/>
            <div id="wnd-status" style="background:#06060c; padding:6px 10px; border-radius:4px; font-size:11px; color:#9cf;">— loading —</div>
        `;
        document.body.appendChild(panel);
        this.panel = panel;
        const $ = id => panel.querySelector("#" + id);
        $("wnd-gen").addEventListener("change", e => { this.generatorName = e.target.value; this._loadGenerated(); this._refreshStatus(); });
        for (const r of panel.querySelectorAll('input[name="wnd-mode"]')) {
            r.addEventListener("change", e => {
                this.mode = e.target.value;
                if (this.entityId !== null) this.renderer.setMode(this.entityId, this.mode);
                this._refreshStatus();
            });
        }
        $("wnd-steps").addEventListener("input", e => {
            this.steps = +e.target.value;
            $("wnd-steps-val").textContent = this.steps;
            if (this.entityId !== null) this.renderer.update(this.entityId, { steps: this.steps });
        });
        $("wnd-density").addEventListener("input", e => {
            this.density = +e.target.value / 100;
            $("wnd-density-val").textContent = this.density.toFixed(2);
            if (this.entityId !== null) this.renderer.update(this.entityId, { density: this.density });
        });
        $("wnd-rotate").addEventListener("change", e => { this.autoRotate = e.target.checked; });
        $("wnd-regen").addEventListener("click", () => { this._loadGenerated(); this._refreshStatus(); });
        $("wnd-export").addEventListener("click", () => this._exportWnd());
        $("wnd-import").addEventListener("click", () => $("wnd-file").click());
        $("wnd-file").addEventListener("change", e => this._importWnd(e.target.files[0]));
        $("wnd-place").addEventListener("click", () => this._placeInWorld());
        this._refreshStatus();
    }

    _refreshStatus() {
        const s = wndStats(this.wnd);
        this._setStatus(`${this.wnd.width}×${this.wnd.height}×${this.wnd.depth} · ${(s.bytes/1024).toFixed(1)} KB · ‖v‖ max=${s.maxMag.toFixed(2)} avg=${s.avgMag.toFixed(2)} · ${this.mode}`);
    }

    _exportWnd() {
        const buf = encodeWND(this.wnd);
        const blob = new Blob([buf], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `${this.generatorName}_${this.wnd.width}x${this.wnd.height}x${this.wnd.depth}.wnd`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        this._setStatus(`exported ${a.download} (${buf.byteLength}B)`);
    }

    async _importWnd(file) {
        if (!file) return;
        try {
            const buf = await file.arrayBuffer();
            const wnd = decodeWND(buf);
            this.wnd = wnd;
            if (this.entityId !== null) this.renderer.remove(this.entityId);
            this.entityId = this.renderer.add({
                wnd, mode: this.mode, steps: this.steps, density: this.density,
                position: [(this.camera.position?.x ?? 0), 8, (this.camera.position?.z ?? 0) - 14],
                scale: 8,
            });
            this._setStatus(`imported ${file.name} · ${wnd.width}×${wnd.height}×${wnd.depth}`);
        } catch (e) {
            this._setStatus(`× import failed: ${e.message}`);
        }
    }

    _placeInWorld() {
        if (!window.wnd || typeof window.wnd.add !== "function") {
            this._setStatus("× window.wnd not available");
            return;
        }
        const id = window.wnd.add(this.wnd, {
            mode: this.mode, steps: this.steps, density: this.density,
            name: `${this.generatorName}-from-demo-${Date.now()}`,
        });
        const total = window.wnd.list().length;
        this._setStatus(`📍 placed as world entity id=${id} · ${total} wnd entit${total === 1 ? "y" : "ies"} — exit demo to see it`);
    }

    _setStatus(text) {
        const el = this.panel?.querySelector("#wnd-status");
        if (el) el.textContent = text;
    }

    render() {
        if (!this.wnd) return;
        const now = performance.now();
        const dt = (now - this.lastFrame) / 1000;
        this.lastFrame = now;
        if (this.autoRotate) this.rotation += dt * 0.25;
        if (this.entityId !== null) this.renderer.update(this.entityId, { rotation: this.rotation });
        this.renderer.render(this.camera);
    }

    dispose() {
        try { this.panel?.remove(); } catch {}
        this.renderer.dispose();
    }
}
