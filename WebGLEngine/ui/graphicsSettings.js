// FILE: ui/graphicsSettings.js
// VERSION: v1 - round 43l
//
// LCARS-styled graphics settings panel. Toggles renderer features on
// and off at runtime so users on slower GPUs can drop the heavy
// effects. Settings persist to localStorage.
//
// Wired toggles:
//   - shadows     -> shadow pass on/off (renderer.shadowsEnabled)
//   - bloom       -> bloom post-process apply on/off
//   - godrays     -> god rays in bloom composite
//   - particles   -> particle render skip
//   - water_ssr   -> water screen-space reflection on/off
//   - water_refraction -> see-through refraction down to the lakebed
//
// Each setting reads/writes window._gfxSettings — main.js's render
// loop reads from the same object every frame. Cheap; no event bus
// needed.

const STORE_KEY = "voxelengine.graphics.v1";

const DEFAULTS = {
    shadows:   true,
    godrays:   true,
    particles: true,
    water_ssr: true,
    water_refraction: true,
    grass:     true,      // v432 — wind-blown ground grass
    moss:      true,      // v4076 — clumped moss on stone/dirt tops
    rootarch:  true,      // v4077 — one procedural root/arch landmark, placed once (near-zero per-frame cost)
    slopes:    true,      // v432 — smooth ramps over stair-stepped terrain
    mc_terrain: false,    // v434 — experimental marching-cubes smooth terrain (opt-in)
};

export class GraphicsSettings {

    constructor() {
        // Load saved or default
        let saved = null;
        try {
            const raw = localStorage.getItem(STORE_KEY);
            if (raw) saved = JSON.parse(raw);
        } catch {}
        this.state = { ...DEFAULTS, ...(saved || {}) };
        // Expose globally for renderers to read every frame
        window._gfxSettings = this.state;

        this._buildDOM();
    }

    _buildDOM() {
        // Right-edge minitab - click to open the panel
        const tab = document.createElement("div");
        tab.className = "lcars-minitab edge-top color-cyan";
        // Round 263b — moved from right edge to be flush right of AI
        // MODELS (was pinned at right:20px which collided with the
        // compass + AI Pipeline indicator).
        tab.style.top = "0"; tab.style.left = "840px"; tab.style.right = "auto"; tab.style.bottom = "auto";
        tab.textContent = "GFX";
        tab.title = "Graphics settings";
        document.body.appendChild(tab);
        this._tab = tab;   // v436 — exposed so the unified Settings hub can retire it

        // Panel (hidden by default)
        const panel = document.createElement("div");
        panel.className = "lcars-panel";
        Object.assign(panel.style, {
            position: "fixed",
            right: "60px",
            bottom: "180px",
            width: "260px",
            zIndex: "9300",
            display: "none",
            pointerEvents: "auto",
        });
        const header = document.createElement("div");
        header.className = "lcars-panel-header";
        const title = document.createElement("div");
        title.textContent = "Graphics";
        header.appendChild(title);
        const closeBtn = document.createElement("div");
        closeBtn.className = "lcars-panel-header-id";
        closeBtn.textContent = "X";
        closeBtn.style.cursor = "pointer";
        closeBtn.addEventListener("click", () => panel.style.display = "none");
        header.appendChild(closeBtn);
        panel.appendChild(header);

        const body = document.createElement("div");
        body.className = "lcars-panel-body";
        const bar = document.createElement("div");
        bar.className = "lcars-panel-bar";
        body.appendChild(bar);
        const content = document.createElement("div");
        content.className = "lcars-panel-content";
        content.style.fontSize = "11px";
        content.style.lineHeight = "1.6";

        const rows = [
            ["shadows",   "Sun shadows",      "Directional shadow map (heaviest)"],
            ["godrays",   "God rays",         "Volumetric sun scatter"],
            ["particles", "Particles",        "Smoke, sparks, debris"],
            ["water_ssr", "Water reflection", "Screen-space reflection on water surfaces"],
            ["water_refraction", "Water refraction", "See through the surface to a distorted lakebed"],
            ["grass",     "Grass",            "Wind-blown grass blades on grassy ground"],
            ["moss",      "Moss",             "Clumped moss on stone/dirt, thinning out on steep ground"],
            ["rootarch",  "Root/arch",        "One procedural root/arch landmark near spawn"],
            ["slopes",    "Smooth slopes",    "Ramp over stair-stepped terrain (mountains)"],
            ["mc_terrain","Smooth terrain (MC)","Experimental: round the whole world via marching cubes. Heavier."],
        ];
        for (const [key, label, hint] of rows) {
            const row = document.createElement("div");
            Object.assign(row.style, {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "6px",
                cursor: "pointer",
            });
            row.title = hint;
            const lbl = document.createElement("span");
            lbl.textContent = label;
            lbl.style.color = "#fc9";
            const chk = document.createElement("input");
            chk.type = "checkbox";
            chk.dataset.gfx = key;
            chk.checked = !!this.state[key];
            chk.style.accentColor = "#ff9933";
            chk.addEventListener("change", () => {
                this.state[key] = chk.checked;
                this._save();
                try { this._onChange && this._onChange(key, this.state[key]); } catch {}
            });
            row.appendChild(lbl);
            row.appendChild(chk);
            content.appendChild(row);
        }
        // Preset buttons
        const presets = document.createElement("div");
        Object.assign(presets.style, {
            display: "flex",
            gap: "6px",
            marginTop: "10px",
            paddingTop: "8px",
            borderTop: "1px solid rgba(255, 153, 0, 0.25)",
        });
        const mkPreset = (label, vals) => {
            const b = document.createElement("button");
            b.textContent = label;
            Object.assign(b.style, {
                flex: "1",
                padding: "4px 6px",
                fontSize: "10px",
                background: "rgba(60, 40, 20, 0.7)",
                border: "1px solid rgba(255, 153, 0, 0.4)",
                color: "#fc9",
                cursor: "pointer",
                fontFamily: "monospace",
            });
            b.addEventListener("click", () => {
                Object.assign(this.state, vals);
                this._save();
                // Re-render checkboxes
                content.querySelectorAll("input[type=checkbox]").forEach((c, i) => {
                    c.checked = !!this.state[rows[i][0]];
                });
            });
            return b;
        };
        // v4076 -- moss follows grass's own cost tier in every preset (one more instanced draw, comparable cost).
        // v4077 -- rootarch stays ON in every tier: one static mesh, one draw call, built once and never rebuilt,
        // so it carries none of the per-frame cost the LOW preset is turning the others off to avoid.
        presets.appendChild(mkPreset("LOW",  { shadows: false, godrays: false, particles: false, water_ssr: false, water_refraction: false, grass: false, moss: false, rootarch: true, slopes: true }));
        presets.appendChild(mkPreset("MED",  { shadows: false, godrays: false, particles: true,  water_ssr: false, water_refraction: true,  grass: true,  moss: true,  rootarch: true, slopes: true }));
        presets.appendChild(mkPreset("HIGH", { shadows: true,  godrays: true,  particles: true,  water_ssr: true,  water_refraction: true,  grass: true,  moss: true,  rootarch: true, slopes: true }));
        content.appendChild(presets);

        // Round 43p - perf readout. Populated by window._perfStats each
        // frame; we just refresh the textNodes from the latest snapshot.
        const perfLabel = document.createElement("div");
        perfLabel.textContent = "Perf";
        Object.assign(perfLabel.style, {
            color: "#5ec8ff", fontSize: "10px",
            marginTop: "10px", paddingTop: "8px",
            borderTop: "1px solid rgba(255, 153, 0, 0.25)",
            letterSpacing: "1.5px",
        });
        content.appendChild(perfLabel);
        const perf = document.createElement("div");
        Object.assign(perf.style, {
            fontFamily: "monospace", fontSize: "10px",
            color: "#fc9", lineHeight: "1.45",
            marginTop: "4px",
        });
        perf.innerHTML = `
            <div>fps: <span id="gfx-fps">--</span> &nbsp; frame: <span id="gfx-frame">--</span>ms</div>
            <div>chunks: <span id="gfx-chunks">--</span> drawn / <span id="gfx-culled">--</span> culled</div>
            <div>build: <span id="gfx-build">--</span>ms &nbsp; worker queue: <span id="gfx-queue">--</span></div>
            <div>entities: <span id="gfx-ents">--</span></div>
        `;
        content.appendChild(perf);

        // Toggle for frustum culling — handy for A/B comparison
        const frustToggle = document.createElement("div");
        Object.assign(frustToggle.style, {
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginTop: "6px", cursor: "pointer", fontSize: "11px",
        });
        frustToggle.title = "Disable to A/B compare cull impact";
        const ftLbl = document.createElement("span");
        ftLbl.textContent = "Frustum cull";
        ftLbl.style.color = "#fc9";
        const ftChk = document.createElement("input");
        ftChk.type = "checkbox";
        ftChk.checked = true;
        ftChk.style.accentColor = "#ff9933";
        ftChk.addEventListener("change", () => {
            if (window._voxelRenderer) {
                window._voxelRenderer.frustumCullEnabled = ftChk.checked;
            }
        });
        frustToggle.appendChild(ftLbl);
        frustToggle.appendChild(ftChk);
        content.appendChild(frustToggle);

        body.appendChild(content);
        panel.appendChild(body);
        const footer = document.createElement("div");
        footer.className = "lcars-panel-footer";
        panel.appendChild(footer);

        document.body.appendChild(panel);
        tab.addEventListener("click", () => {
            panel.style.display = (panel.style.display === "none") ? "block" : "none";
        });
        this._panel = panel;
    }

    _save() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(this.state)); } catch {}
    }

    get(key) { return this.state[key]; }

    // v433 — public setter so the consolidated Settings hub can drive these
    // toggles (which the render loop reads as source of truth). Mirrors the
    // in-panel checkbox path: mutate, persist, notify, refresh checkboxes.
    set(key, val) {
        if (!(key in this.state)) return false;
        this.state[key] = !!val;
        this._save();
        try { this._onChange && this._onChange(key, this.state[key]); } catch {}
        // Keep the standalone panel's checkboxes in sync if it's built.
        try {
            const chk = this._panel?.querySelector?.(`input[data-gfx="${key}"]`);
            if (chk) chk.checked = this.state[key];
        } catch {}
        return true;
    }
    onChange(fn) { this._onChange = fn; }
}
