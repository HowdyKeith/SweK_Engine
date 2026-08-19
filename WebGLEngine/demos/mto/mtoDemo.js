// FILE: demos/mto/mtoDemo.js
// VERSION: v1 — round 351

import { encodeMTO, decodeMTO } from "../../engine/mtoFormat.js";
import { MTO_GENERATORS, TISSUE_PALETTE } from "../../engine/mtoGenerator.js";
import { MtoRenderer } from "../../engine/MtoRenderer.js";

export class MtoDemo {
    constructor({ gl, camera }) {
        this.gl = gl;
        this.camera = camera;
        this.renderer = new MtoRenderer({ gl });
        this.mto = null;
        this.generatorName = "anatomicalShell";
        this.colorMode = "tissue";
        this.autoRotate = true;
        this.rotation = 0;
        this.entityId = null;
        this.lastFrame = performance.now();
        this._loadGenerated();
        this._buildPanel();
    }

    _loadGenerated() {
        const gen = MTO_GENERATORS[this.generatorName];
        let opts = {};
        if (this.generatorName === "anatomicalShell") opts = { outerRadius: 10 };
        if (this.generatorName === "limbSection")     opts = { length: 22, outerR: 7 };
        if (this.generatorName === "torsoSlab")       opts = { width: 12, height: 4, depth: 9 };
        this.mto = gen(opts);
        if (this.entityId !== null) this.renderer.remove(this.entityId);
        this.entityId = this.renderer.add({
            mto: this.mto,
            position: [
                (this.camera.position?.x ?? 0),
                (this.camera.position?.y ?? 5),
                (this.camera.position?.z ?? 0) - 18,
            ],
            colorMode: this.colorMode,
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
        const paletteLegend = Object.entries(TISSUE_PALETTE).filter(([id]) => +id !== 0).map(([id, t]) => {
            const [r, g, b] = t.color;
            const css = `rgb(${(r*255)|0}, ${(g*255)|0}, ${(b*255)|0})`;
            return `<span style="display:inline-flex; align-items:center; margin-right:10px;"><span style="display:inline-block; width:10px; height:10px; background:${css}; margin-right:3px; border:1px solid #333;"></span>${t.name}</span>`;
        }).join("");
        panel.innerHTML = `
            <div style="color:#6cf; font-size:13px; letter-spacing:1.5px; padding-bottom:8px; border-bottom:1px solid #233; margin-bottom:10px;">🩻 MEDICAL TOMOGRAPHY — .mto</div>
            <div style="color:#aab; margin-bottom:10px; line-height:1.5;">
                22-byte stride (int16 coord + float32 smooth normal + intensity + class).
                SimpleITK + 3D U-Net pipeline output. Smooth gradient normals give CT/MRI-style surface shading.
            </div>
            <div style="display:flex; gap:6px; margin-bottom:8px; align-items:center;">
                <span style="color:#889; min-width:80px;">Structure:</span>
                <select id="mto-gen" style="flex:1; background:#06060c; border:1px solid #333; color:#cfd; padding:3px; font-family:monospace;">
                    <option value="anatomicalShell" selected>concentric anatomical shell</option>
                    <option value="limbSection">long-bone cross-section</option>
                    <option value="torsoSlab">torso slab (multi-tissue)</option>
                </select>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:8px; align-items:center;">
                <span style="color:#889; min-width:80px;">Color:</span>
                <label style="cursor:pointer; margin-right:10px;"><input type="radio" name="mto-color" value="tissue" checked/> Tissue class</label>
                <label style="cursor:pointer;"><input type="radio" name="mto-color" value="intensity"/> Intensity (greyscale)</label>
            </div>
            <div style="font-size:10px; margin-bottom:10px; color:#9ab;">${paletteLegend}</div>
            <div style="display:flex; gap:12px; margin-bottom:10px; align-items:center;">
                <label style="cursor:pointer;"><input id="mto-rotate" type="checkbox" checked/> Auto-rotate</label>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:10px;">
                <button id="mto-regen"  style="flex:1; background:#48c; border:none; color:#fff; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:monospace;">🔄 Regenerate</button>
                <button id="mto-export" style="flex:1; background:#a64; border:none; color:#fff; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:monospace;">💾 Export .mto</button>
                <button id="mto-import" style="flex:1; background:#2a4; border:none; color:#fff; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:monospace;">📂 Import .mto</button>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:10px;">
                <button id="mto-place" style="flex:1; background:#6a4; border:none; color:#fff; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:monospace;">📍 Place in world (window.mto.add)</button>
            </div>
            <input id="mto-file" type="file" accept=".mto" style="display:none"/>
            <div id="mto-status" style="background:#06060c; padding:6px 10px; border-radius:4px; font-size:11px; color:#9cf;">— loading —</div>
        `;
        document.body.appendChild(panel);
        this.panel = panel;
        const $ = id => panel.querySelector("#" + id);
        $("mto-gen").addEventListener("change", e => { this.generatorName = e.target.value; this._loadGenerated(); this._refreshStatus(); });
        for (const r of panel.querySelectorAll('input[name="mto-color"]')) {
            r.addEventListener("change", e => {
                this.colorMode = e.target.value;
                if (this.entityId !== null) this.renderer.setColorMode(this.entityId, this.colorMode);
                this._refreshStatus();
            });
        }
        $("mto-rotate").addEventListener("change", e => { this.autoRotate = e.target.checked; });
        $("mto-regen").addEventListener("click", () => { this._loadGenerated(); this._refreshStatus(); });
        $("mto-export").addEventListener("click", () => this._exportMto());
        $("mto-import").addEventListener("click", () => $("mto-file").click());
        $("mto-file").addEventListener("change", e => this._importMto(e.target.files[0]));
        $("mto-place").addEventListener("click", () => this._placeInWorld());
        this._refreshStatus();
    }

    _refreshStatus() {
        const bytes = 8 + this.mto.count * 22;
        const classCounts = {};
        for (let i = 0; i < this.mto.count; i++) {
            const c = this.mto.classes[i];
            classCounts[c] = (classCounts[c] || 0) + 1;
        }
        const breakdown = Object.entries(classCounts)
            .filter(([c]) => +c !== 0)
            .map(([c, n]) => `${TISSUE_PALETTE[c]?.name || c}=${n}`).join(", ");
        this._setStatus(`${this.mto.count} samples · ${bytes}B .mto · ${this.colorMode} · ${breakdown}`);
    }

    _exportMto() {
        const buf = encodeMTO(this.mto);
        const blob = new Blob([buf], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `${this.generatorName}_${this.mto.count}.mto`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        this._setStatus(`exported ${a.download} (${buf.byteLength}B)`);
    }

    async _importMto(file) {
        if (!file) return;
        try {
            const buf = await file.arrayBuffer();
            const mto = decodeMTO(buf);
            this.mto = mto;
            if (this.entityId !== null) this.renderer.remove(this.entityId);
            this.entityId = this.renderer.add({
                mto, colorMode: this.colorMode,
                position: [(this.camera.position?.x ?? 0), 5, (this.camera.position?.z ?? 0) - 18],
            });
            this._setStatus(`imported ${file.name} · ${mto.count} samples`);
        } catch (e) {
            this._setStatus(`× .mto import failed: ${e.message}`);
        }
    }

    _placeInWorld() {
        if (!window.mto || typeof window.mto.add !== "function") {
            this._setStatus("× window.mto not available");
            return;
        }
        const id = window.mto.add(this.mto, {
            colorMode: this.colorMode,
            name: `${this.generatorName}-from-demo-${Date.now()}`,
        });
        const total = window.mto.list().length;
        this._setStatus(`📍 placed as world entity id=${id} · ${total} mto entit${total === 1 ? "y" : "ies"} — exit demo to see it`);
    }

    _setStatus(text) {
        const el = this.panel?.querySelector("#mto-status");
        if (el) el.textContent = text;
    }

    render() {
        if (!this.mto) return;
        const now = performance.now();
        const dt = (now - this.lastFrame) / 1000;
        this.lastFrame = now;
        if (this.autoRotate) this.rotation += dt * 0.3;
        if (this.entityId !== null) this.renderer.update(this.entityId, { rotation: this.rotation });
        this.renderer.render(this.camera);
    }

    dispose() {
        try { this.panel?.remove(); } catch {}
        this.renderer.dispose();
    }
}
