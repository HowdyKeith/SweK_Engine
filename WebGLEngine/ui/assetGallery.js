// FILE: ui/assetGallery.js
// VERSION: v1 - round 43s
//
// Live gallery view of all known GPU assets — meshes loaded from disk,
// meshes returned by Ollama, requests in flight, missing assets falling
// back to voxel defaults. Each cell shows status; hovering a cell loads
// that asset into a shared preview canvas that auto-rotates it. When
// Ollama returns a new OBJ, the gallery pulses its NEW badge and the
// preview updates on next render.
//
// Single dedicated WebGL2 context for the preview canvas. Mesh raw
// data is re-uploaded to this context on hover (cheap — most meshes
// under 10k verts).

const POLL_MS  = 800;     // re-snapshot the asset loader
const NEW_MS   = 30000;   // "NEW" badge duration after a load

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform int  uHasNormals;
uniform int  uHasColors;
out vec3 vNormal;
out vec3 vColor;
void main() {
    gl_Position = uViewProj * uModel * vec4(aPos, 1.0);
    vNormal = (uHasNormals == 1) ? mat3(uModel) * aNormal : vec3(0.0, 1.0, 0.0);
    vColor  = (uHasColors  == 1) ? aColor                 : vec3(0.55, 0.65, 0.85);
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vColor;
out vec4 outColor;
void main() {
    vec3 sunDir = normalize(vec3(0.4, 0.85, 0.3));
    vec3 N = normalize(vNormal);
    float ndl = max(0.0, dot(N, sunDir));
    vec3 lit = vColor * (0.4 + 0.7 * ndl);
    outColor = vec4(lit, 1.0);
}`;

// Round 295 — module-scope scratch matrices for the gallery's 3D preview.
const _GALLERY_MODEL_SCRATCH = new Float32Array(16);
const _GALLERY_VP_SCRATCH    = new Float32Array(16);

export class AssetGallery {

    constructor({ assetLoader }) {
        this.assetLoader = assetLoader;
        this.cells = new Map();          // name -> cell DOM
        this.recentLoads = new Map();    // name -> loadedAt
        this._currentHover = null;       // asset name being previewed
        this._previewMeshes = new Map(); // name -> { vao, indexCount, hasIndex } (preview context)
        this._lastAssetList = null;
        this._buildDOM();
        this._initPreviewGL();
        this._wireLoader();
        this._poll();
        this._animateLoop();
    }

    _buildDOM() {
        // Left-edge minitab — yellow to stand out. Round 117: full
        // "GALLERY" label since "GAL" wasn't recognizable; minitabs are
        // wide enough at the resized width.
        const tab = document.createElement("div");
        tab.className = "lcars-minitab edge-top color-yellow";
        // Round 263b — clear DEMO button (top-left, ~248px wide) + spacing
        tab.style.top = "0";
        tab.style.left = "480px";
        tab.style.bottom = "auto";
        tab.textContent = "GALLERY";
        tab.title = "Asset gallery";
        document.body.appendChild(tab);

        const panel = document.createElement("div");
        panel.className = "lcars-panel";
        Object.assign(panel.style, {
            position: "fixed",
            left: "60px",
            bottom: "120px",
            width: "560px",
            maxHeight: "70vh",
            zIndex: "9300",
            display: "none",
            pointerEvents: "auto",
            overflow: "hidden",
        });

        const header = document.createElement("div");
        header.className = "lcars-panel-header";
        const title = document.createElement("div");
        title.textContent = "Asset Gallery";
        header.appendChild(title);
        const close = document.createElement("div");
        close.className = "lcars-panel-header-id";
        close.textContent = "X";
        close.style.cursor = "pointer";
        close.addEventListener("click", () => panel.style.display = "none");
        header.appendChild(close);
        panel.appendChild(header);

        const body = document.createElement("div");
        body.className = "lcars-panel-body";
        const bar = document.createElement("div");
        bar.className = "lcars-panel-bar";
        body.appendChild(bar);

        // Stats header
        const stats = document.createElement("div");
        stats.style.cssText = "color:#fc9; font-size:11px; padding:6px 8px; letter-spacing:1px; line-height:1.5;";
        body.appendChild(stats);
        this._statsEl = stats;

        // Preview canvas (shared, positioned absolutely; appended later so it overlays)
        // Round 117 — shrunk from 220x220 to 140x140 so the asset is
        // readable rather than overwhelming the gallery cell. The
        // OBJ thought-bubble for ollama items takes the right side
        // and would have collided with the larger size.
        // Round 194 — was 140x140, user reported "at least 4x too big"
        // when displayed at hover. 80x80 cuts visible area by ~3x while
        // staying large enough to read the silhouette.
        const preview = document.createElement("canvas");
        preview.width = 80;
        preview.height = 80;
        Object.assign(preview.style, {
            position: "absolute",
            pointerEvents: "none",
            border: "2px solid rgba(255, 153, 0, 0.6)",
            borderRadius: "4px",
            background: "rgba(0, 0, 0, 0.85)",
            display: "none",
            zIndex: "9310",
            boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
        });
        document.body.appendChild(preview);
        this._previewCanvas = preview;

        // Preview caption (asset name + status)
        const caption = document.createElement("div");
        Object.assign(caption.style, {
            position: "absolute",
            pointerEvents: "none",
            background: "rgba(0, 0, 0, 0.85)",
            color: "#fc9",
            border: "1px solid rgba(255, 153, 0, 0.4)",
            padding: "4px 8px",
            fontFamily: "monospace",
            fontSize: "11px",
            display: "none",
            zIndex: "9311",
            maxWidth: "220px",
        });
        document.body.appendChild(caption);
        this._previewCaption = caption;

        // Round 117 — thought-bubble panel that appears next to the
        // preview canvas when an ollama-generated asset is hovered.
        // Shows the actual OBJ text the model returned so you can see
        // what cd3 (or whatever model) generated for each civ piece.
        // Positioned to the right of the preview when there's room.
        const bubble = document.createElement("div");
        Object.assign(bubble.style, {
            position: "absolute",
            pointerEvents: "none",
            background: "rgba(20, 14, 8, 0.94)",
            color: "#aac8e8",
            border: "1px solid rgba(170, 200, 232, 0.45)",
            borderRadius: "6px",
            padding: "8px 10px",
            fontFamily: "ui-monospace, Menlo, Consolas, monospace",
            fontSize: "9px",
            lineHeight: "1.35",
            display: "none",
            zIndex: "9311",
            width: "190px",
            maxHeight: "160px",
            overflow: "hidden",
            boxShadow: "0 4px 12px rgba(0,0,0,0.6)",
            whiteSpace: "pre",
        });
        document.body.appendChild(bubble);
        this._objBubble = bubble;

        // Grid container (scrolls)
        const grid = document.createElement("div");
        Object.assign(grid.style, {
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: "6px",
            padding: "6px 8px",
            maxHeight: "calc(70vh - 130px)",
            overflowY: "auto",
        });
        body.appendChild(grid);
        this._grid = grid;

        panel.appendChild(body);
        const footer = document.createElement("div");
        footer.className = "lcars-panel-footer";
        panel.appendChild(footer);
        document.body.appendChild(panel);
        this._panel = panel;

        tab.addEventListener("click", () => {
            panel.style.display = panel.style.display === "none" ? "block" : "none";
            // Refresh immediately when opened
            if (panel.style.display !== "none") this._refresh();
        });
    }

    _initPreviewGL() {
        const gl = this._previewCanvas.getContext("webgl2", { antialias: true });
        if (!gl) {
            console.warn("[AssetGallery] preview GL2 not available");
            return;
        }
        this._gl = gl;
        gl.clearColor(0.04, 0.04, 0.08, 1);
        gl.enable(gl.DEPTH_TEST);

        const compile = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                console.error("[AssetGallery] shader:", gl.getShaderInfoLog(s));
            }
            return s;
        };
        const prog = gl.createProgram();
        gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
        gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error("[AssetGallery] link:", gl.getProgramInfoLog(prog));
        }
        this._prog = prog;
        this._u = {
            viewProj:  gl.getUniformLocation(prog, "uViewProj"),
            model:     gl.getUniformLocation(prog, "uModel"),
            hasNorms:  gl.getUniformLocation(prog, "uHasNormals"),
            hasColors: gl.getUniformLocation(prog, "uHasColors"),
        };
    }

    // Upload mesh's raw data into THIS gl context (separate from main).
    _uploadMeshForPreview(entry) {
        if (!this._gl) return null;
        if (this._previewMeshes.has(entry.name)) return this._previewMeshes.get(entry.name);
        const m = entry.mesh;
        if (!m || !m._rawPositions) return null;

        const gl = this._gl;
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        const vb = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vb);
        gl.bufferData(gl.ARRAY_BUFFER, m._rawPositions, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        let hasNormals = false;
        if (m._rawNormals && m._rawNormals.length === m._rawPositions.length) {
            const nb = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, nb);
            gl.bufferData(gl.ARRAY_BUFFER, m._rawNormals, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(1);
            gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
            hasNormals = true;
        }

        let hasColors = false;
        if (m._rawColors && m._rawColors.length === m._rawPositions.length) {
            const cb = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, cb);
            gl.bufferData(gl.ARRAY_BUFFER, m._rawColors, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(2);
            gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
            hasColors = true;
        }

        let indexCount = 0;
        let hasIndex = false;
        if (m._rawIndices && m._rawIndices.length > 0) {
            const ib = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m._rawIndices, gl.STATIC_DRAW);
            indexCount = m._rawIndices.length;
            hasIndex = true;
        }
        gl.bindVertexArray(null);

        const bnds = m.bounds || { minX:-1,minY:-1,minZ:-1,maxX:1,maxY:1,maxZ:1 };
        // Center + scale-to-fit so all meshes preview consistently
        const cx = (bnds.minX + bnds.maxX) * 0.5;
        const cy = (bnds.minY + bnds.maxY) * 0.5;
        const cz = (bnds.minZ + bnds.maxZ) * 0.5;
        const sx = bnds.maxX - bnds.minX;
        const sy = bnds.maxY - bnds.minY;
        const sz = bnds.maxZ - bnds.minZ;
        const maxDim = Math.max(sx, sy, sz) || 1;
        // Round 89.1 — was 1.8/maxDim which scales the longest axis to
        // ~80% of clip space. Problem: when the model rotates around Y,
        // its bounding-box CORNERS sweep beyond clip — diagonal radius
        // of an axis-aligned cube is √3/2 ≈ 0.87 × longest side. So
        // corners landed at ~1.4 in clip space when the object hit 45°,
        // and only the center ~25% stayed visible. Drop to 0.9/maxDim:
        // longest axis fits ~45% of clip, diagonal sweeps fit comfortably.
        const norm = 0.9 / maxDim;
        const out = { vao, indexCount, hasIndex, vertexCount: m.vertexCount,
                      hasNormals, hasColors, cx, cy, cz, norm };
        this._previewMeshes.set(entry.name, out);
        return out;
    }

    _wireLoader() {
        if (!this.assetLoader?.onMeshReplaced) return;
        this.assetLoader.onMeshReplaced((name) => {
            this.recentLoads.set(name, Date.now());
            // Force a snapshot refresh on next poll
            this._refresh();
        });
    }

    _poll() {
        setInterval(() => this._refresh(), POLL_MS);
    }

    _refresh() {
        if (this._panel.style.display === "none") return;   // skip when hidden
        const list = this.assetLoader.detailedSnapshot();
        // Stable order: keep current order, append new
        // Header stats
        const counts = { loaded: 0, missing: 0, inflight: 0, ollama: 0, file: 0, priority: 0, queued: 0, running: 0 };
        for (const e of list) {
            counts[e.status]++;
            if (e.source === "ollama") counts.ollama++;
            else if (e.source === "file") counts.file++;
            // Round 195 — count priority + queue. "queued" here uses the
            // Round 198 dispatcher's actual pending list (not just
            // ollamaRequested), so it accurately reflects what's still
            // waiting for Ollama vs already being processed.
            if (e.priority) counts.priority++;
            if (e.isQueued) counts.queued++;
            if (e.isRunning) counts.running++;
            // Auto-mark recent loads from initial mesh
            if (e.status === "loaded" && e.loadedAt && !this.recentLoads.has(e.name)) {
                if (Date.now() - e.loadedAt < NEW_MS) {
                    this.recentLoads.set(e.name, e.loadedAt);
                }
            }
        }
        this._statsEl.innerHTML = `
            <span style="color:#5ec8ff">total ${list.length}</span> /
            <span style="color:#5eff8a">loaded ${counts.loaded}</span> /
            <span style="color:#ffd884">inflight ${counts.inflight}</span> /
            <span style="color:#ff9966">missing ${counts.missing}</span>
            &nbsp;|&nbsp;
            🤖 ollama <b>${counts.ollama}</b> &nbsp; 📁 file <b>${counts.file}</b>
            &nbsp;|&nbsp;
            <span style="color:#888">running <b style="color:#ffd884">${counts.running}</b></span> &nbsp;
            <span style="color:#888">queued <b style="color:#aac8e8">${counts.queued}</b></span> &nbsp;
            <span style="color:#888">⭐ priority <b style="color:#ffe066">${counts.priority}</b></span>
        `;

        // Rebuild grid (simple full rebuild — counts are small, ~30 assets)
        this._grid.innerHTML = "";
        this.cells.clear();
        for (const entry of list) {
            const cell = this._makeCell(entry);
            this._grid.appendChild(cell);
            this.cells.set(entry.name, cell);
        }
        this._lastAssetList = list;
    }

    _makeCell(entry) {
        const cell = document.createElement("div");
        Object.assign(cell.style, {
            background: "rgba(20, 14, 6, 0.85)",
            border: "1px solid rgba(255, 153, 0, 0.3)",
            padding: "6px",
            cursor: "pointer",
            transition: "transform 0.15s, box-shadow 0.15s",
            position: "relative",
            minHeight: "70px",
            fontFamily: "monospace",
            fontSize: "10px",
            color: "#fc9",
            overflow: "hidden",
        });

        // Status badge
        let icon, color;
        if (entry.status === "loaded") {
            if (entry.source === "ollama") { icon = "🤖"; color = "#5eff8a"; }
            else { icon = "📦"; color = "#aac8e8"; }
        } else if (entry.status === "inflight") { icon = "⏳"; color = "#ffd884"; }
        else { icon = "·"; color = "#888"; }

        const badge = document.createElement("div");
        badge.style.cssText = `font-size:18px; color:${color}; line-height:1;`;
        badge.textContent = icon;
        cell.appendChild(badge);

        const name = document.createElement("div");
        name.style.cssText = "font-weight:bold; color:#fc9; margin-top:4px; word-break:break-all; line-height:1.1;";
        name.textContent = entry.name;
        cell.appendChild(name);

        // Vertex count / status text
        const meta = document.createElement("div");
        meta.style.cssText = "color:rgba(252,153,0,0.5); margin-top:3px; font-size:9px;";
        if (entry.status === "loaded") {
            meta.textContent = `${entry.vertexCount}v · ${entry.source}`;
        } else if (entry.status === "inflight") {
            meta.textContent = "loading…";
        } else {
            meta.textContent = entry.ollamaRequested ? "fallback" : "registered";
        }
        cell.appendChild(meta);

        // NEW badge if recently loaded
        if (this.recentLoads.has(entry.name)) {
            const age = Date.now() - this.recentLoads.get(entry.name);
            if (age < NEW_MS) {
                const newBadge = document.createElement("div");
                newBadge.textContent = "NEW";
                Object.assign(newBadge.style, {
                    position: "absolute",
                    top: "2px",
                    right: "2px",
                    background: "#ff3366",
                    color: "#fff",
                    fontSize: "8px",
                    fontWeight: "bold",
                    padding: "1px 4px",
                    borderRadius: "2px",
                    animation: "voxgal-pulse 1.2s ease-in-out infinite",
                });
                cell.appendChild(newBadge);
            } else {
                this.recentLoads.delete(entry.name);
            }
        }

        // Round 195 — priority star + queue chip. Star is clickable
        // (stopPropagation so the cell's mouseenter/click doesn't fire).
        // Click toggles priority; if added, the loader will kick off
        // generation immediately for missing assets.
        const star = document.createElement("div");
        star.textContent = entry.priority ? "⭐" : "☆";
        star.title = entry.priority ? "Priority — click to remove" : "Click to prioritize (generate ASAP)";
        Object.assign(star.style, {
            position: "absolute",
            top: "2px",
            left: "2px",
            cursor: "pointer",
            fontSize: "11px",
            color: entry.priority ? "#ffe066" : "rgba(255,224,102,0.4)",
            userSelect: "none",
            lineHeight: "1",
        });
        star.addEventListener("click", (ev) => {
            ev.stopPropagation();
            const next = !entry.priority;
            this.assetLoader.setPriority(entry.name, next);
            // Optimistic UI: flip the local entry state so this poll
            // cycle shows the new value without waiting for the next refresh
            entry.priority = next;
            star.textContent = next ? "⭐" : "☆";
            star.style.color = next ? "#ffe066" : "rgba(255,224,102,0.4)";
            star.title = next ? "Priority — click to remove" : "Click to prioritize (generate ASAP)";
        });
        cell.appendChild(star);

        // Queued indicator: small dot if Ollama requested but not yet loaded.
        // Round 198 — three distinct states now visible:
        //   ● gold  = Ollama generating right now (isRunning)
        //   ◐ blue  = downloading after Ollama finished (inflight)
        //   ○ gray  = waiting in queue, not yet started (isQueued)
        const showDot = entry.status !== "loaded" &&
                        (entry.isRunning || entry.isQueued || entry.status === "inflight");
        if (showDot) {
            const queueDot = document.createElement("div");
            let glyph, color, tip;
            if (entry.isRunning) {
                glyph = "●"; color = "#ffd884"; tip = "Ollama generating now";
            } else if (entry.status === "inflight") {
                glyph = "◐"; color = "#aac8e8"; tip = "Downloading generated OBJ";
            } else {
                glyph = "○"; color = "#888";   tip = "Queued for generation";
            }
            queueDot.textContent = glyph;
            queueDot.title = tip;
            Object.assign(queueDot.style, {
                position: "absolute",
                bottom: "2px",
                right: "4px",
                color,
                fontSize: "10px",
                lineHeight: "1",
            });
            cell.appendChild(queueDot);
        }

        // Hover: position the preview canvas over this cell + load asset
        cell.addEventListener("mouseenter", () => this._showPreview(entry, cell));
        cell.addEventListener("mouseleave", () => this._hidePreview());

        return cell;
    }

    _showPreview(entry, cell) {
        this._currentHover = entry.name;
        const rect = cell.getBoundingClientRect();
        // Round 117 — preview is now 140x140 (was 220x220)
        const PREVIEW = 140;
        const margin = 8;
        // Position preview to the right of the cell if space, else left
        const px = rect.right + margin + PREVIEW > window.innerWidth
            ? rect.left - PREVIEW - margin
            : rect.right + margin;
        const py = Math.max(8, Math.min(window.innerHeight - PREVIEW - 80, rect.top - 10));
        this._previewCanvas.style.left = px + "px";
        this._previewCanvas.style.top  = py + "px";
        this._previewCanvas.style.display = "block";

        // Caption below preview
        const capBg = entry.status === "loaded" ? "rgba(94, 255, 138, 0.15)" : "rgba(60, 40, 20, 0.8)";
        this._previewCaption.style.background = capBg;
        const sourceText = entry.source === "ollama"
            ? "<span style='color:#5eff8a'>🤖 ollama-generated</span>"
            : entry.source === "file"
                ? "<span style='color:#aac8e8'>📁 file</span>"
                : "<span style='color:#888'>voxel fallback</span>";
        this._previewCaption.innerHTML = `
            <div style="font-weight:bold; color:#ff9933; margin-bottom:2px;">${entry.name}</div>
            <div style="font-size:9px; color:rgba(252,153,0,0.7);">${entry.vertexCount} verts · ${sourceText}</div>
            ${entry.description ? `<div style="font-size:9px; color:#fc9; margin-top:2px; font-style:italic;">"${this._esc(entry.description)}"</div>` : ""}
        `;
        this._previewCaption.style.left = px + "px";
        this._previewCaption.style.top  = (py + PREVIEW + 4) + "px";
        this._previewCaption.style.display = "block";

        // Round 117 — Ollama thought-bubble showing the raw OBJ text
        // returned by the model. Only shown for ollama-sourced assets
        // when objText is available (cached by gpuAssetLoader at
        // generation time).
        if (entry.source === "ollama" && entry.objText) {
            const bubbleX = (px > window.innerWidth / 2)
                ? px - 200      // bubble to LEFT if preview is on right side
                : px + PREVIEW + 8;
            // Header + truncated OBJ
            const head = `// ${entry.name}  (from ${entry.modelName || "ollama"})\n`;
            const body = entry.objText.split("\n").slice(0, 14).join("\n");
            this._objBubble.textContent = head + body + (entry.objText.split("\n").length > 14 ? "\n…" : "");
            this._objBubble.style.left = bubbleX + "px";
            this._objBubble.style.top  = py + "px";
            this._objBubble.style.display = "block";
        } else {
            this._objBubble.style.display = "none";
        }
    }

    _hidePreview() {
        this._currentHover = null;
        this._previewCanvas.style.display = "none";
        this._previewCaption.style.display = "none";
        if (this._objBubble) this._objBubble.style.display = "none";
    }

    _esc(s) { return String(s).replace(/[<>&"]/g, c => ({ "<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;" }[c])); }

    _animateLoop() {
        const draw = (t) => {
            if (this._currentHover && this._gl) this._drawPreview(this._currentHover, t);
            requestAnimationFrame(draw);
        };
        requestAnimationFrame(draw);
    }

    _drawPreview(name, t) {
        const gl = this._gl;
        if (!gl) return;
        const entry = (this._lastAssetList || []).find(e => e.name === name);
        const prog = this._prog;

        // Clear scene
        gl.viewport(0, 0, this._previewCanvas.width, this._previewCanvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        if (!entry || entry.status !== "loaded" || !entry.mesh) {
            // Draw a small placeholder cube for missing assets so the hover
            // still feels alive
            this._drawPlaceholder(t);
            return;
        }

        const m = this._uploadMeshForPreview(entry);
        if (!m) { this._drawPlaceholder(t); return; }

        gl.useProgram(prog);
        // Auto-rotate around Y; tilt slightly downward for 3/4 view
        const yaw = t * 0.0008;
        const c = Math.cos(yaw), s = Math.sin(yaw);
        const tilt = -0.4;
        const ct = Math.cos(tilt), st = Math.sin(tilt);

        // model = T(-center)*S(norm)*R_Y(yaw)*R_X(tilt)
        // Build directly. Apply S after R for tighter math.
        // Final: world = R_X * R_Y * S * (p - center)
        const model = _GALLERY_MODEL_SCRATCH;     // Round 295 — pooled
        // Compose: row-by-row, column-major output
        // Let M = R_X * R_Y * S
        // R_Y: [c, 0, s; 0, 1, 0; -s, 0, c]
        // R_X: [1, 0, 0; 0, ct, -st; 0, st, ct]
        // R_X * R_Y =
        //   row0: [c,         0,    s        ]
        //   row1: [-st * -s,  ct,   -st * c  ]  → [s*st, ct, -c*st]  wait redo
        // Let me redo: R_X * R_Y means apply R_Y first, then R_X.
        // (R_X * R_Y) = R_X . R_Y
        // R_X row0 . R_Y col0 = (1*c) + (0*0) + (0*-s) = c
        // R_X row0 . R_Y col1 = 0
        // R_X row0 . R_Y col2 = (1*s) + 0 + 0 = s
        // R_X row1 . R_Y col0 = (0*c) + (ct*0) + (-st*-s) = st*s
        // R_X row1 . R_Y col1 = (0*0) + (ct*1) + (-st*0) = ct
        // R_X row1 . R_Y col2 = (0*s) + (ct*0) + (-st*c) = -st*c
        // R_X row2 . R_Y col0 = (0*c) + (st*0) + (ct*-s) = -ct*s
        // R_X row2 . R_Y col1 = (0*0) + (st*1) + (ct*0) = st
        // R_X row2 . R_Y col2 = (0*s) + (st*0) + (ct*c) = ct*c
        const norm = m.norm;
        // Column-major storage: model[col*4 + row]
        model[0]  = c*norm;     model[1]  = st*s*norm; model[2]  = -ct*s*norm; model[3]  = 0;
        model[4]  = 0;          model[5]  = ct*norm;   model[6]  = st*norm;    model[7]  = 0;
        model[8]  = s*norm;     model[9]  = -st*c*norm;model[10] = ct*c*norm;  model[11] = 0;
        // Translate by -center (in mesh local space) then through above; here
        // we just do post-multiply: model.translation = M * (-center)
        const tx = -(model[0]*m.cx + model[4]*m.cy + model[8]*m.cz);
        const ty = -(model[1]*m.cx + model[5]*m.cy + model[9]*m.cz);
        const tz = -(model[2]*m.cx + model[6]*m.cy + model[10]*m.cz);
        model[12] = tx;
        model[13] = ty;
        model[14] = tz;
        model[15] = 1;

        // Simple ortho view fitting the [-1, 1] cube
        const vp = _GALLERY_VP_SCRATCH;     // Round 295 — pooled
        vp.fill(0);
        vp[0] = 0.85; vp[5] = 0.85; vp[10] = -0.5; vp[14] = 0.0; vp[15] = 1;
        gl.uniformMatrix4fv(this._u.viewProj, false, vp);
        gl.uniformMatrix4fv(this._u.model,    false, model);
        gl.uniform1i(this._u.hasNorms,  m.hasNormals ? 1 : 0);
        gl.uniform1i(this._u.hasColors, m.hasColors  ? 1 : 0);
        gl.bindVertexArray(m.vao);
        if (m.hasIndex) {
            gl.drawElements(gl.TRIANGLES, m.indexCount, gl.UNSIGNED_INT, 0);
        } else {
            gl.drawArrays(gl.TRIANGLES, 0, m.vertexCount);
        }
        gl.bindVertexArray(null);
    }

    _drawPlaceholder(t) {
        // Mini cube using line strip (no mesh upload needed); rotates too
        // — keeps the hover feeling responsive for missing/inflight assets.
        // Skipped for now (would need a tiny inline cube). Clear color is
        // enough visual feedback.
    }
}

// Inject pulse keyframes once
if (!document.getElementById("voxgal-pulse-css")) {
    const st = document.createElement("style");
    st.id = "voxgal-pulse-css";
    st.textContent = `
        @keyframes voxgal-pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.15); opacity: 0.85; }
        }
    `;
    document.head.appendChild(st);
}
