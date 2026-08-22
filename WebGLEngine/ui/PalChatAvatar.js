// FILE: ui/PalChatAvatar.js
// Round 100 — second avatar layer for the PalChat M1↔M2 dialogue.
// Round 101 — M2 slot now optionally upgrades to a 3D WebGL2 render
// when the asset loader finishes generating `palchat_dog_v1` (or _v2)
// via Ollama → C3D. Until that arrives, the SVG dog placeholder shows.
// M1 slot stays SVG-only by design — the HeartbeatAvatar already
// owns the M1 character's primary 3D representation (heartbeat_mascot
// variants); this panel's M1 icon is a small companion glyph.
//
// Architecture mirrors HeartbeatAvatar's 3D path:
//   - canvas absolutely-positioned over the M2 SVG slot
//   - webgl2 context, minimal flat-shaded shader, per-vertex color
//     when present, dFdx normal fallback otherwise
//   - subscribes to assetLoader.onMeshReplaced
//   - rotation speed reflects PalChat state: idle = slow drift,
//     speaking = brisk spin, returning to idle after the line ends

// Round 295 — module-scope scratch matrices, reused across all frames.
// Was new Float32Array(16) × 2 per render = ~120 allocs/sec at 60fps.
const _PALCHAT_MODEL_SCRATCH = new Float32Array(16);
const _PALCHAT_VP_SCRATCH    = new Float32Array(16);

export class PalChatAvatar {
    constructor({ parent, assetLoader = null, assetName = "palchat_dog_v1" } = {}) {
        this.assetLoader = assetLoader;
        this.assetName   = assetName;
        this._mesh3D     = null;
        this._gl         = null;
        this._prog       = null;
        this._canvas3D   = null;
        this._rafHandle  = null;
        this._m2State    = "idle";       // "idle" | "speaking"
        this._stateTimer = null;

        this.root = document.createElement("div");
        this.root.id = "palchat-avatar";
        Object.assign(this.root.style, {
            position: "fixed",
            // Round 102 — initial position, updated by _startDocking()
            // to track the heartbeat avatar's top edge so PalChat stays
            // stacked directly above HeartbeatAvatar regardless of
            // Pip's current height.
            right: "14px",
            bottom: "330px",
            width: "180px",
            background: "rgba(10, 12, 18, 0.7)",
            border: "1px solid rgba(255, 153, 0, 0.4)",
            borderRadius: "10px",
            padding: "6px 8px",
            fontFamily: "system-ui, -apple-system, sans-serif",
            color: "#dde",
            fontSize: "10px",
            zIndex: "999",
            pointerEvents: "none",
            display: "none",                 // hidden until enabled
            backdropFilter: "blur(2px)",
        });

        this._injectStyles();

        // Row of characters
        const row = document.createElement("div");
        Object.assign(row.style, {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0 8px",
        });
        this.root.appendChild(row);

        // M1 = person, left side (SVG-only)
        this.m1Slot = document.createElement("div");
        this.m1Slot.className = "pc-char pc-m1";
        this.m1Slot.innerHTML = this._svgPerson();
        row.appendChild(this.m1Slot);

        // "..." dots between them
        const sep = document.createElement("div");
        Object.assign(sep.style, {
            color: "#fc9",
            fontSize: "10px",
            letterSpacing: "2px",
            opacity: "0.6",
        });
        sep.textContent = "···";
        row.appendChild(sep);

        // M2 = dog, right side — SVG fallback PLUS 3D canvas overlay
        // when palchat_dog_v1 has been generated. Slot positioned
        // relatively so the canvas can absolutely cover it.
        this.m2Slot = document.createElement("div");
        this.m2Slot.className = "pc-char pc-m2";
        Object.assign(this.m2Slot.style, {
            position: "relative",
            width: "40px",
            height: "40px",
        });
        this.m2SvgWrap = document.createElement("div");
        this.m2SvgWrap.innerHTML = this._svgDog();
        Object.assign(this.m2SvgWrap.style, {
            position: "absolute",
            inset: "0",
            display: "block",
        });
        this.m2Slot.appendChild(this.m2SvgWrap);
        row.appendChild(this.m2Slot);

        // Subtitle for the most recent line
        this.subtitle = document.createElement("div");
        Object.assign(this.subtitle.style, {
            marginTop: "4px",
            minHeight: "16px",
            textAlign: "center",
            fontStyle: "italic",
            opacity: "0",
            transition: "opacity 0.3s",
            fontSize: "10px",
            lineHeight: "1.3",
            padding: "0 4px",
        });
        this.root.appendChild(this.subtitle);

        // Small label
        this.label = document.createElement("div");
        Object.assign(this.label.style, {
            marginTop: "2px",
            textAlign: "center",
            color: "#fc9",
            fontSize: "8px",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            opacity: "0.7",
        });
        // Round 117 — label updated from "OLLAMA ↔ GUEST" to "M1 ↔ M2"
        // to match the actual character names used in the PowerShell
        // KPopListener side of the bridge. The mascots here represent
        // the M1/M2 dialogue pair, not abstract Ollama/Guest slots.
        this.label.textContent = "M1 ↔ M2";
        this.root.appendChild(this.label);

        (parent ?? document.body).appendChild(this.root);

        this._subtitleTimer = null;

        // Subscribe to mesh replacement events so the M2 slot upgrades
        // to 3D the moment the OBJ arrives from C3D.
        if (this.assetLoader?.onMeshReplaced) {
            this._unsubMesh = this.assetLoader.onMeshReplaced((name) => {
                if (name === this.assetName) this._tryActivate3D();
            });
            // Also try right now in case the mesh is already cached
            // (asset loader was warm before this avatar constructed).
            this._tryActivate3D();
        }

        // Round 102 — dock to top of HeartbeatAvatar so the stack is
        // PalChat → Heartbeat → Pip, all anchored at the right edge.
        // Polls every 500ms; if HB isn't present yet (early-load race),
        // falls back to the static bottom position.
        this._startDocking("ollama-heartbeat-avatar", 6);
    }

    _startDocking(targetId, gap = 6) {
        const sync = () => {
            const target = document.getElementById(targetId);
            if (!target) return;
            const rect = target.getBoundingClientRect();
            if (rect.width === 0) return;
            const newBottom = Math.round(window.innerHeight - rect.top + gap);
            const newRight  = Math.round(window.innerWidth  - rect.right);
            if (this._lastDockBottom !== newBottom) {
                this.root.style.bottom = newBottom + "px";
                this._lastDockBottom = newBottom;
            }
            if (this._lastDockRight !== newRight) {
                this.root.style.right = newRight + "px";
                this._lastDockRight = newRight;
            }
        };
        sync();
        this._dockTimer = setInterval(sync, 500);
    }

    setEnabled(on) {
        this.root.style.display = on ? "block" : "none";
        // Pause the render loop when the panel is hidden so we don't
        // burn cycles on a non-visible canvas.
        if (!on && this._rafHandle) {
            cancelAnimationFrame(this._rafHandle);
            this._rafHandle = null;
        } else if (on && this._mesh3D && !this._rafHandle) {
            this._loop3D();
        }
    }

    // Called by PalChat.onLine — character is "M1" or "M2", text is
    // the spoken line. Bounces the character icon, shows the line in
    // the subtitle, auto-clears after ~5s.
    showLine(character, text) {
        const slot = (character === "M1") ? this.m1Slot : this.m2Slot;
        if (slot) {
            slot.classList.remove("pc-speaking");
            void slot.offsetWidth;
            slot.classList.add("pc-speaking");
        }
        // Bump M2 to "speaking" state for the duration so the 3D mesh
        // spins faster. Auto-returns to idle after the line plays out.
        if (character === "M2") {
            this._m2State = "speaking";
            if (this._stateTimer) clearTimeout(this._stateTimer);
            // Estimate line duration to match the speech-synth's pacing
            const ms = Math.min(6000, text.length * 35 + 600);
            this._stateTimer = setTimeout(() => {
                this._m2State = "idle";
            }, ms);
        }

        // Round 117 — subtitle prefix updated from OLLAMA/GUEST to M1/M2
        // to match the M1 ↔ M2 header. The PowerShell side speaks of
        // these characters by name; the UI surfaces them consistently.
        const prefix = (character === "M1") ? "M1: " : "M2: ";
        this.subtitle.textContent = prefix + text;
        this.subtitle.style.opacity = "1";
        if (this._subtitleTimer) clearTimeout(this._subtitleTimer);
        this._subtitleTimer = setTimeout(() => {
            this.subtitle.style.opacity = "0";
        }, 5000);
    }

    // ============================================================
    // 3D MESH ACTIVATION
    // ============================================================
    // Same pattern as HeartbeatAvatar._tryActivate3D — wait for asset
    // cache hit, upload the mesh into a hidden canvas inside the M2
    // slot, hide the SVG fallback, start render loop.

    _tryActivate3D() {
        if (this._mesh3D) return;
        if (!this.assetLoader) return;
        const mesh = this.assetLoader.cache?.get?.(this.assetName);
        if (!mesh || !mesh._rawPositions || !mesh._rawIndices) return;
        if (!this._canvas3D) this._buildCanvas3D();
        if (!this._gl) return;
        const m = this._uploadMesh(mesh);
        if (!m) return;
        this._mesh3D = m;
        // SVG dog hides; canvas takes over
        this.m2SvgWrap.style.display = "none";
        this._canvas3D.style.display = "block";
        if (this.root.style.display !== "none" && !this._rafHandle) {
            this._loop3D();
        }
        console.log(`[PalChatAvatar] 3D mode activated for M2 using "${this.assetName}" (${mesh.vertexCount} verts)`);
    }

    _buildCanvas3D() {
        const canvas = document.createElement("canvas");
        canvas.width = 40;
        canvas.height = 40;
        Object.assign(canvas.style, {
            position: "absolute",
            top: "0",
            left: "0",
            width: "40px",
            height: "40px",
            display: "none",
            pointerEvents: "none",
            zIndex: "2",
        });
        this.m2Slot.appendChild(canvas);
        this._canvas3D = canvas;

        const gl = canvas.getContext("webgl2", { antialias: true, alpha: true });
        if (!gl) {
            console.warn("[PalChatAvatar] webgl2 unavailable; M2 stays SVG-only");
            return;
        }
        this._gl = gl;

        const vsrc = `#version 300 es
            in vec3 aPos;
            in vec3 aNorm;
            in vec3 aColor;
            uniform mat4 uModel;
            uniform mat4 uVP;
            out vec3 vN;
            out vec3 vC;
            void main() {
                vN = mat3(uModel) * aNorm;
                vC = aColor;
                gl_Position = uVP * uModel * vec4(aPos, 1.0);
            }`;
        const fsrc = `#version 300 es
            precision mediump float;
            in vec3 vN;
            in vec3 vC;
            uniform int uHasNorms;
            uniform int uHasColors;
            out vec4 outColor;
            void main() {
                // Warm gold default tint matching the SVG dog colors
                vec3 baseCol = (uHasColors == 1) ? vC : vec3(0.79, 0.63, 0.38);
                vec3 N;
                if (uHasNorms == 1) {
                    N = normalize(vN);
                } else {
                    vec3 dx = dFdx(gl_FragCoord.xyz);
                    vec3 dy = dFdy(gl_FragCoord.xyz);
                    N = normalize(cross(dx, dy));
                }
                vec3 L = normalize(vec3(0.4, 1.0, 0.6));
                float diff = max(0.18, dot(N, L));
                outColor = vec4(baseCol * diff, 1.0);
            }`;

        const vs = this._compile(gl.VERTEX_SHADER, vsrc);
        const fs = this._compile(gl.FRAGMENT_SHADER, fsrc);
        if (!vs || !fs) { this._gl = null; return; }
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.warn("[PalChatAvatar] shader link failed:", gl.getProgramInfoLog(prog));
            this._gl = null;
            return;
        }
        this._prog = prog;
        this._attr = {
            aPos:   gl.getAttribLocation(prog, "aPos"),
            aNorm:  gl.getAttribLocation(prog, "aNorm"),
            aColor: gl.getAttribLocation(prog, "aColor"),
        };
        this._u = {
            model:    gl.getUniformLocation(prog, "uModel"),
            viewProj: gl.getUniformLocation(prog, "uVP"),
            hasNorms: gl.getUniformLocation(prog, "uHasNorms"),
            hasColors:gl.getUniformLocation(prog, "uHasColors"),
        };
        gl.enable(gl.DEPTH_TEST);
        gl.clearColor(0, 0, 0, 0);
    }

    _compile(type, src) {
        const gl = this._gl;
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.warn("[PalChatAvatar] shader compile failed:", gl.getShaderInfoLog(s));
            return null;
        }
        return s;
    }

    _uploadMesh(meshEntry) {
        const gl = this._gl;
        if (!gl || !this._prog) return null;
        const positions = meshEntry._rawPositions;
        const indices   = meshEntry._rawIndices;
        const normals   = meshEntry._rawNormals;
        const colors    = meshEntry._rawColors;

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        if (this._attr.aPos >= 0) {
            gl.enableVertexAttribArray(this._attr.aPos);
            gl.vertexAttribPointer(this._attr.aPos, 3, gl.FLOAT, false, 0, 0);
        }

        let hasNormals = false;
        if (normals && normals.length === positions.length) {
            const nbo = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
            gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
            if (this._attr.aNorm >= 0) {
                gl.enableVertexAttribArray(this._attr.aNorm);
                gl.vertexAttribPointer(this._attr.aNorm, 3, gl.FLOAT, false, 0, 0);
            }
            hasNormals = true;
        } else if (this._attr.aNorm >= 0) {
            gl.disableVertexAttribArray(this._attr.aNorm);
            gl.vertexAttrib3f(this._attr.aNorm, 0, 1, 0);
        }

        let hasColors = false;
        if (colors && colors.length === positions.length) {
            const cbo = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, cbo);
            gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
            if (this._attr.aColor >= 0) {
                gl.enableVertexAttribArray(this._attr.aColor);
                gl.vertexAttribPointer(this._attr.aColor, 3, gl.FLOAT, false, 0, 0);
            }
            hasColors = true;
        } else if (this._attr.aColor >= 0) {
            gl.disableVertexAttribArray(this._attr.aColor);
            gl.vertexAttrib3f(this._attr.aColor, 0.79, 0.63, 0.38);
        }

        const ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
        gl.bindVertexArray(null);

        const b = meshEntry.bounds || { minX:-1,minY:-1,minZ:-1,maxX:1,maxY:1,maxZ:1 };
        const cx = (b.minX + b.maxX) * 0.5;
        const cy = (b.minY + b.maxY) * 0.5;
        const cz = (b.minZ + b.maxZ) * 0.5;
        const maxDim = Math.max(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ) || 1;
        const norm = 0.9 / maxDim;
        return { vao, indexCount: indices.length, hasIndex: true, vertexCount: positions.length / 3, hasNormals, hasColors, cx, cy, cz, norm };
    }

    _loop3D() {
        const tick = (t) => {
            this._rafHandle = requestAnimationFrame(tick);
            if (!this._gl || !this._mesh3D) return;
            this._draw3D(t);
        };
        this._rafHandle = requestAnimationFrame(tick);
    }

    _draw3D(t) {
        const gl = this._gl;
        const m = this._mesh3D;
        if (!gl || !m) return;
        gl.viewport(0, 0, this._canvas3D.width, this._canvas3D.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this._prog);

        // Speaking → fast eager spin (dog excitement); idle → slow drift
        const speed = (this._m2State === "speaking") ? 0.0042 : 0.0006;
        const yaw = t * speed;
        const tilt = -0.4;
        const c = Math.cos(yaw),  s = Math.sin(yaw);
        const ct = Math.cos(tilt), st = Math.sin(tilt);
        const norm = m.norm;
        // Round 295 — pool model + viewProj matrices at module scope. The
        // buffers are written fully each frame (or zero-cleared before
        // partial writes) and read by gl.uniformMatrix4fv which copies
        // out, so reusing them across frames is safe. Was new Float32Array(16)
        // × 2 per frame × 60fps = ~120 allocs/sec.
        const model = _PALCHAT_MODEL_SCRATCH;
        model[0]  = c*norm;     model[1]  = st*s*norm; model[2]  = -ct*s*norm; model[3]  = 0;
        model[4]  = 0;          model[5]  = ct*norm;   model[6]  = st*norm;    model[7]  = 0;
        model[8]  = s*norm;     model[9]  = -st*c*norm;model[10] = ct*c*norm;  model[11] = 0;
        const tx = -(model[0]*m.cx + model[4]*m.cy + model[8]*m.cz);
        const ty = -(model[1]*m.cx + model[5]*m.cy + model[9]*m.cz);
        const tz = -(model[2]*m.cx + model[6]*m.cy + model[10]*m.cz);
        model[12] = tx; model[13] = ty; model[14] = tz; model[15] = 1;

        const vp = _PALCHAT_VP_SCRATCH;
        vp.fill(0);   // partial writes below; clear stale cells from prior frame
        vp[0] = 0.85; vp[5] = 0.85; vp[10] = -0.5; vp[14] = 0.0; vp[15] = 1;

        gl.uniformMatrix4fv(this._u.viewProj, false, vp);
        gl.uniformMatrix4fv(this._u.model,    false, model);
        gl.uniform1i(this._u.hasNorms,  m.hasNormals ? 1 : 0);
        gl.uniform1i(this._u.hasColors, m.hasColors  ? 1 : 0);
        gl.bindVertexArray(m.vao);
        gl.drawElements(gl.TRIANGLES, m.indexCount, gl.UNSIGNED_INT, 0);
        gl.bindVertexArray(null);
    }

    // ============================================================
    // SVG icons + styles
    // ============================================================

    _svgPerson() {
        return `
            <svg viewBox="0 0 40 40" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
                <ellipse cx="20" cy="28" rx="11" ry="9" fill="#8aaeed"/>
                <circle cx="20" cy="14" r="8" fill="#9fc1ee"/>
                <circle cx="17" cy="13" r="1.4" fill="#1a2a3a"/>
                <circle cx="23" cy="13" r="1.4" fill="#1a2a3a"/>
                <path d="M 17 17 Q 20 19 23 17" stroke="#1a2a3a" stroke-width="1.2" fill="none" stroke-linecap="round"/>
            </svg>
        `;
    }

    _svgDog() {
        return `
            <svg viewBox="0 0 40 40" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
                <ellipse cx="22" cy="26" rx="13" ry="9" fill="#c9a060"/>
                <circle cx="12" cy="20" r="7" fill="#c9a060"/>
                <ellipse cx="8" cy="22" rx="2.5" ry="4" fill="#a07d3e"/>
                <circle cx="11" cy="19" r="1.4" fill="#1a1a1a"/>
                <ellipse cx="6" cy="21" rx="1.5" ry="1.2" fill="#1a1a1a"/>
                <path d="M 34 22 Q 38 18 36 28" stroke="#a07d3e" stroke-width="3" fill="none" stroke-linecap="round"/>
            </svg>
        `;
    }

    _injectStyles() {
        if (document.getElementById("palchat-avatar-styles")) return;
        const s = document.createElement("style");
        s.id = "palchat-avatar-styles";
        s.textContent = `
            .pc-char {
                display: inline-block;
                line-height: 0;
                transform-origin: center bottom;
                transition: filter 0.2s;
            }
            @keyframes pc-bounce {
                0%, 100% { transform: scale(1)    translateY(0); }
                25%      { transform: scale(1.18) translateY(-3px); }
                50%      { transform: scale(1.05) translateY(0); }
                75%      { transform: scale(1.12) translateY(-2px); }
            }
            .pc-speaking {
                animation: pc-bounce 0.7s ease-out 2;
                filter: drop-shadow(0 0 4px rgba(255, 220, 100, 0.6));
            }
        `;
        document.head.appendChild(s);
    }

    destroy() {
        if (this._unsubMesh) this._unsubMesh();
        if (this._rafHandle) cancelAnimationFrame(this._rafHandle);
        if (this._subtitleTimer) clearTimeout(this._subtitleTimer);
        if (this._stateTimer) clearTimeout(this._stateTimer);
        try { if (this._gl) { const _ext = this._gl.getExtension("WEBGL_lose_context"); if (_ext) _ext.loseContext(); this._gl = null; } } catch {}   // v2778 - release context on destroy
        if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    }
}
