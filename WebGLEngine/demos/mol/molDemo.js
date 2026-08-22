// FILE: demos/mol/molDemo.js
// VERSION: v1 — round 350
//
// Molecular structure viewer. Renders a synthetic protein/molecule
// (alpha helix / water cluster / DNA duplex) or an imported .mol or
// .pdb file with CPK or pLDDT confidence coloring.

import { encodeMOL, decodeMOL, molBBox } from "../../engine/molFormat.js";
import { MOL_GENERATORS } from "../../engine/molGenerator.js";
import { parsePDB } from "../../engine/molPdbParser.js";
import {
    MolRenderer, computeAtomColors, computeAtomRadii,
} from "../../engine/MolRenderer.js";

export class MolDemo {
    constructor({ gl, camera }) {
        this.gl = gl;
        this.camera = camera;
        this.renderer = new MolRenderer({ gl });
        this.mol = null;
        this.generatorName = "alphaHelix";
        this.colorMode = "cpk";
        this.atomScale = 0.4;
        this.autoRotate = true;
        this.rotation = 0;
        this.entityId = null;
        this.lastFrame = performance.now();
        this._loadGenerated();
        this._buildPanel();
    }

    _loadGenerated() {
        const gen = MOL_GENERATORS[this.generatorName];
        let opts = {};
        if (this.generatorName === "alphaHelix")   opts = { residues: 10, plddtMean: 88 };
        if (this.generatorName === "waterCluster") opts = { count: 24, spacing: 3.5 };
        if (this.generatorName === "dnaDuplex")    opts = { basePairs: 14 };
        this._loadMol(gen(opts));
    }

    _loadMol(mol) {
        // Center the molecule on origin so it rotates around its centroid
        const bb = molBBox(mol);
        const centered = {
            count: mol.count,
            positions: new Float32Array(mol.count * 3),
            fields: mol.fields,
            elements: mol.elements,
        };
        for (let i = 0; i < mol.count; i++) {
            centered.positions[i*3]   = mol.positions[i*3]   - bb.center[0];
            centered.positions[i*3+1] = mol.positions[i*3+1] - bb.center[1];
            centered.positions[i*3+2] = mol.positions[i*3+2] - bb.center[2];
        }
        this.mol = centered;
        this._bbox = molBBox(centered);
        if (this.entityId !== null) this.renderer.remove(this.entityId);
        // Scale: fit the molecule into ~10 unit cube
        const maxDim = Math.max(this._bbox.size[0], this._bbox.size[1], this._bbox.size[2]) || 1;
        const fitScale = 10 / maxDim;
        this.entityId = this.renderer.add({
            mol: centered,
            position: [
                (this.camera.position?.x ?? 0),
                (this.camera.position?.y ?? 5),
                (this.camera.position?.z ?? 0) - 15,
            ],
            scale: fitScale,
            atomScale: this.atomScale,
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
        panel.innerHTML = `
            <div style="color:#6cf; font-size:13px; letter-spacing:1.5px; padding-bottom:8px; border-bottom:1px solid #233; margin-bottom:10px;">🧬 MOLECULAR FIELD — .mol</div>
            <div style="color:#aab; margin-bottom:10px; line-height:1.5;">
                24-byte stride atomic field format (XYZ + pLDDT + occupancy + element ID).
                Compatible with the AtomicFieldProcessor Python pipeline in <code style="color:#6cf;">lastai_finally.txt</code>.
            </div>
            <div style="display:flex; gap:6px; margin-bottom:8px; align-items:center;">
                <span style="color:#889; min-width:80px;">Structure:</span>
                <select id="mol-gen" style="flex:1; background:#06060c; border:1px solid #333; color:#cfd; padding:3px; font-family:monospace;">
                    <option value="alphaHelix" selected>α-helix segment</option>
                    <option value="waterCluster">water cluster</option>
                    <option value="dnaDuplex">DNA duplex</option>
                </select>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:8px; align-items:center;">
                <span style="color:#889; min-width:80px;">Color:</span>
                <label style="cursor:pointer; margin-right:10px;"><input type="radio" name="mol-color" value="cpk" checked/> CPK (element)</label>
                <label style="cursor:pointer;"><input type="radio" name="mol-color" value="plddt"/> pLDDT (confidence)</label>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:8px; align-items:center;">
                <span style="color:#889; min-width:80px;">Atom size:</span>
                <input id="mol-atom-scale" type="range" min="10" max="100" value="40" style="flex:1;"/>
                <span id="mol-atom-scale-val" style="color:#cfd; min-width:30px;">0.40</span>
            </div>
            <div style="display:flex; gap:12px; margin-bottom:10px; align-items:center;">
                <label style="cursor:pointer;"><input id="mol-rotate" type="checkbox" checked/> Auto-rotate</label>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:10px;">
                <button id="mol-regen"  style="flex:1; background:#48c; border:none; color:#fff; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:monospace;">🔄 Regenerate</button>
                <button id="mol-export" style="flex:1; background:#a64; border:none; color:#fff; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:monospace;">💾 Export .mol</button>
                <button id="mol-import-mol" style="flex:1; background:#2a4; border:none; color:#fff; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:monospace;">📂 Import .mol</button>
                <button id="mol-import-pdb" style="flex:1; background:#28a; border:none; color:#fff; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:monospace;">📂 Import .pdb</button>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:10px;">
                <button id="mol-place" style="flex:1; background:#6a4; border:none; color:#fff; padding:6px 10px; border-radius:4px; cursor:pointer; font-family:monospace;">📍 Place in world (window.mol.add)</button>
            </div>
            <input id="mol-file-mol" type="file" accept=".mol" style="display:none"/>
            <input id="mol-file-pdb" type="file" accept=".pdb,.txt" style="display:none"/>
            <div id="mol-status" style="background:#06060c; padding:6px 10px; border-radius:4px; font-size:11px; color:#9cf;">— loading —</div>
        `;
        document.body.appendChild(panel);
        this.panel = panel;
        const $ = id => panel.querySelector("#" + id);
        $("mol-gen").addEventListener("change", e => { this.generatorName = e.target.value; this._loadGenerated(); this._refreshStatus(); });
        for (const r of panel.querySelectorAll('input[name="mol-color"]')) {
            r.addEventListener("change", e => {
                this.colorMode = e.target.value;
                if (this.entityId !== null) this.renderer.setColorMode(this.entityId, this.colorMode);
                this._refreshStatus();
            });
        }
        $("mol-atom-scale").addEventListener("input", e => {
            this.atomScale = +e.target.value / 100;
            $("mol-atom-scale-val").textContent = this.atomScale.toFixed(2);
            this._loadGenerated();   // re-add to update radii
        });
        $("mol-rotate").addEventListener("change", e => { this.autoRotate = e.target.checked; });
        $("mol-regen").addEventListener("click", () => { this._loadGenerated(); this._refreshStatus(); });
        $("mol-export").addEventListener("click", () => this._exportMol());
        $("mol-import-mol").addEventListener("click", () => $("mol-file-mol").click());
        $("mol-import-pdb").addEventListener("click", () => $("mol-file-pdb").click());
        $("mol-file-mol").addEventListener("change", e => this._importMol(e.target.files[0]));
        $("mol-file-pdb").addEventListener("change", e => this._importPdb(e.target.files[0]));
        $("mol-place").addEventListener("click", () => this._placeInWorld());
        this._refreshStatus();
    }

    _refreshStatus() {
        const bytes = 8 + this.mol.count * 24;
        const bb = this._bbox;
        this._setStatus(`${this.mol.count} atoms · ${bytes}B .mol · ${this.colorMode.toUpperCase()} · bbox ${bb.size[0].toFixed(1)}×${bb.size[1].toFixed(1)}×${bb.size[2].toFixed(1)} Å`);
    }

    _exportMol() {
        const buf = encodeMOL(this.mol);
        const blob = new Blob([buf], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${this.generatorName}_${this.mol.count}.mol`;
        document.body.appendChild(a);
        a.click(); a.remove();
        URL.revokeObjectURL(url);
        this._setStatus(`exported ${a.download} (${buf.byteLength}B)`);
    }

    async _importMol(file) {
        if (!file) return;
        try {
            const buf = await file.arrayBuffer();
            const mol = decodeMOL(buf);
            this._loadMol(mol);
            this._setStatus(`imported ${file.name} · ${mol.count} atoms`);
        } catch (e) {
            this._setStatus(`× .mol import failed: ${e.message}`);
        }
    }

    async _importPdb(file) {
        if (!file) return;
        try {
            const text = await file.text();
            const mol = parsePDB(text);
            this._loadMol(mol);
            this._setStatus(`imported ${file.name} · ${mol.count} atoms in ${mol.residueCount} residues`);
        } catch (e) {
            this._setStatus(`× .pdb import failed: ${e.message}`);
        }
    }

    _placeInWorld() {
        if (!window.mol || typeof window.mol.add !== "function") {
            this._setStatus("× window.mol not available — engine init failed?");
            return;
        }
        const id = window.mol.add(this.mol, {
            colorMode: this.colorMode,
            atomScale: this.atomScale,
            name: `${this.generatorName}-from-demo-${Date.now()}`,
        });
        const total = window.mol.list().length;
        this._setStatus(`📍 placed as world entity id=${id} · ${total} mol entit${total === 1 ? "y" : "ies"} — exit demo to see it`);
    }

    _setStatus(text) {
        const el = this.panel?.querySelector("#mol-status");
        if (el) el.textContent = text;
    }

    render() {
        if (!this.mol) return;
        const now = performance.now();
        const dt = (now - this.lastFrame) / 1000;
        this.lastFrame = now;
        if (this.autoRotate) this.rotation += dt * 0.3;
        // Apply rotation by updating the entity's rotation patch
        if (this.entityId !== null) {
            this.renderer.update(this.entityId, { rotation: this.rotation });
        }
        this.renderer.render(this.camera);
    }

    dispose() {
        try { this.panel?.remove(); } catch {}
        this.renderer.dispose();
    }
}
