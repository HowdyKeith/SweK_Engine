// FILE: demos/resume_fx/resumeFxDemo.js
// VERSION: v1 — round 160
//
// "VBA Developer's resume rendered in the OpenGL engine they built."
// A portfolio meta-demo: image-textured paper with selectable shader effects.
//
// Six effects:
//   0 PLAIN    — flat textured paper, no animation
//   1 SPIN     — Y-axis rotation
//   2 SCROLL   — credits-roll style upward scroll, wraps
//   3 BURN     — noise dissolve with a glowing orange edge (paper on fire)
//   4 WAVE     — sine vertex displacement (flag in wind)
//   5 HOLOGRAM — scanlines + chromatic aberration + flicker
//   6 TUMBLE   — full 3D rotation around X, Y, Z
//
// Architecture:
//   - Own WebGL2 program (vert + frag shaders).
//   - Tessellated quad: 16x40 grid → smooth wave displacement, smooth burn edges.
//   - Effect selection via `u_effect` int uniform; shader branches once per pixel.
//   - Default resume loads from /demos/resume_fx/resume_default.jpg.
//   - File picker lets the user swap in their target-employer version live.
//   - Render hook fires AFTER main scene render so the resume floats over
//     the isolation:"exclusive" background. Depth test stays on; resume sits
//     at z=0 in its own clip space (orthographic projection).

const VS_SRC = `#version 300 es
precision highp float;
precision highp int;

in vec2 a_pos;     // -1..1
in vec2 a_uv;      // 0..1 (u: left→right, v: top→bottom of resume)

uniform mat4 u_model;
uniform mat4 u_view;
uniform mat4 u_proj;
uniform float u_time;
uniform int   u_effect;     // 0..6
uniform float u_scrollOffset; // for SCROLL — 0..1+, wraps
uniform float u_waveAmp;
uniform float u_waveFreq;

out vec2 v_uv;
out float v_waveAmt;   // how much this vertex was bent — used by frag for shading

void main() {
    vec2 uv = a_uv;

    // SCROLL: shift the UV vertically so the resume "rolls past" the viewport.
    // Wrap with fract() — the texture is wrapped via GL_REPEAT.
    if (u_effect == 2) {
        uv.y = fract(uv.y + u_scrollOffset);
    }

    // Position in object space — start with a flat quad.
    // Paper is 1 unit wide × 2.58 units tall (matches resume aspect 1024:2650).
    float aspect = 2.58;
    vec3 pos = vec3(a_pos.x, a_pos.y * aspect, 0.0);
    float waveAmt = 0.0;

    // WAVE: sine displacement along X with a phase offset on Y. Looks like a
    // flag rippling. Amplitude tapers from the right edge toward the left so
    // the "flagpole" side (left) stays stable.
    if (u_effect == 4) {
        float edgeMask = smoothstep(-1.0, 1.0, a_pos.x);   // 0 at left, 1 at right
        float w = sin(a_pos.y * u_waveFreq + u_time * 3.0) * u_waveAmp * edgeMask;
        pos.z += w;
        waveAmt = w;
        // tiny twist so the right edge curls
        pos.x += w * 0.15;
    }

    v_uv = uv;
    v_waveAmt = waveAmt;
    gl_Position = u_proj * u_view * u_model * vec4(pos, 1.0);
}
`;

const FS_SRC = `#version 300 es
precision highp float;
precision highp int;

in vec2 v_uv;
in float v_waveAmt;

uniform sampler2D u_tex;
uniform float u_time;
uniform int   u_effect;
uniform float u_burnProgress;   // 0..1.2 — past 1.0 finishes the burn-off
uniform vec2  u_aspect;

out vec4 fragColor;

// fast hash → noise field for BURN dissolve
float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}
float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
    float v = 0.0; float amp = 0.5;
    for (int i = 0; i < 4; i++) {
        v += amp * noise2(p);
        p *= 2.13; amp *= 0.5;
    }
    return v;
}

void main() {
    vec2 uv = v_uv;

    // HOLOGRAM: chromatic aberration — split RGB channels horizontally
    if (u_effect == 5) {
        float wob = sin(u_time * 12.0) * 0.001 + 0.002;
        float r = texture(u_tex, uv + vec2( wob, 0.0)).r;
        float g = texture(u_tex, uv).g;
        float b = texture(u_tex, uv + vec2(-wob, 0.0)).b;
        vec3 col = vec3(r, g, b);
        // scanlines
        float scan = 0.85 + 0.15 * sin(uv.y * 800.0 + u_time * 6.0);
        // flicker
        float fl = 0.92 + 0.08 * sin(u_time * 23.0);
        // teal tint
        col = mix(col, col * vec3(0.4, 1.1, 1.2), 0.35);
        col *= scan * fl;
        // edges glow
        float edge = smoothstep(0.0, 0.02, uv.x) * smoothstep(0.0, 0.02, uv.y)
                   * smoothstep(0.0, 0.02, 1.0 - uv.x) * smoothstep(0.0, 0.02, 1.0 - uv.y);
        col += (1.0 - edge) * vec3(0.2, 0.8, 1.0);
        fragColor = vec4(col, 1.0);
        return;
    }

    vec4 paper = texture(u_tex, uv);

    // BURN: dissolve via noise threshold + glowing edge + smoke tint
    if (u_effect == 3) {
        // burn front advances from the BOTTOM upward; bottom has higher
        // "burn priority", noise breaks up the front so it doesn't look
        // like a horizontal line.
        float n = fbm(uv * 6.0);
        float front = (1.0 - uv.y) * 1.1 + n * 0.35;   // upper region burns later
        float burn  = u_burnProgress * 1.6;            // 0..1.6 covers the full sweep
        float gone  = step(burn, front);                // 1 = still paper, 0 = burnt away
        if (gone < 0.001) discard;

        // edge glow: within a narrow band just before the front
        float edge = smoothstep(burn - 0.08, burn, front) * (1.0 - smoothstep(burn, burn + 0.04, front));
        vec3 ember = mix(vec3(1.0, 0.9, 0.3), vec3(1.0, 0.25, 0.05), edge);
        vec3 col = mix(paper.rgb, ember, edge);

        // char/ash near the front — darken paper just behind the edge
        float char = smoothstep(burn - 0.18, burn - 0.04, front);
        col *= mix(vec3(1.0), vec3(0.3, 0.2, 0.15), char * 0.7);

        // glow add
        col += vec3(1.0, 0.45, 0.1) * edge * 0.8;

        fragColor = vec4(col, 1.0);
        return;
    }

    // WAVE: light shading based on how much this vertex was bent
    if (u_effect == 4) {
        float shade = 0.85 + clamp(v_waveAmt * 0.6, -0.15, 0.15);
        fragColor = vec4(paper.rgb * shade, paper.a);
        return;
    }

    // PLAIN / SPIN / SCROLL / TUMBLE — just sample the texture
    fragColor = paper;
}
`;

export class ResumeFxDemo {
    constructor({ gl, world, camera, canvas }) {
        this.gl = gl;
        this.world = world;
        this.camera = camera;
        this.canvas = canvas;
        this.effect = 1;                  // start in SPIN — eye-catching open
        this.startTime = performance.now() / 1000;
        this.lastEffectChange = this.startTime;
        this.imageUrl = "/demos/resume_fx/resume_default.jpg";
        this.tex = null;
        this.texLoaded = false;
        // Round 172 / v667 — user drag rotates the RESUME, not the world.
        // The terrain stays still as backdrop. We intercept pointer events on
        // the canvas in capture phase so the world camera's bubbling handler
        // never gets to see the drag.
        this.userYaw   = 0;
        this.userPitch = 0;
        this._dragState = null;
        this._buildProgram();
        this._buildBuffers();
        this._buildTexture();
        this._buildPanel();
        this._installDragHandlers();
    }

    _installDragHandlers() {
        if (!this.canvas) return;
        const isActive = () => this._panel && document.body.contains(this._panel);
        const onDown = (e) => {
            if (!isActive() || e.button !== 0) return;
            this._dragState = {
                x0: e.clientX, y0: e.clientY,
                yaw0: this.userYaw, pitch0: this.userPitch,
            };
            try { this.canvas.setPointerCapture?.(e.pointerId); } catch {}
            e.stopPropagation();
        };
        const onMove = (e) => {
            if (!this._dragState || !isActive()) return;
            const dx = e.clientX - this._dragState.x0;
            const dy = e.clientY - this._dragState.y0;
            // 1 radian per ~400 pixels — feels natural for desktop drag.
            const RAD_PER_PIXEL = 1 / 400;
            this.userYaw   = this._dragState.yaw0   + dx * RAD_PER_PIXEL;
            this.userPitch = this._dragState.pitch0 + dy * RAD_PER_PIXEL;
            // Clamp pitch to avoid flipping past the poles.
            const MAX = Math.PI * 0.45;
            if (this.userPitch >  MAX) this.userPitch =  MAX;
            if (this.userPitch < -MAX) this.userPitch = -MAX;
            e.stopPropagation();
        };
        const onUp = (e) => {
            if (!this._dragState) return;
            this._dragState = null;
            try { this.canvas.releasePointerCapture?.(e.pointerId); } catch {}
            e.stopPropagation();
        };
        this.canvas.addEventListener("pointerdown", onDown, true);
        this.canvas.addEventListener("pointermove", onMove, true);
        this.canvas.addEventListener("pointerup",   onUp,   true);
        this.canvas.addEventListener("pointercancel", onUp, true);
        this._dragHandlers = { onDown, onMove, onUp };
    }

    _buildProgram() {
        const gl = this.gl;
        const compile = (type, src) => {
            const sh = gl.createShader(type);
            gl.shaderSource(sh, src);
            gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
                const log = gl.getShaderInfoLog(sh);
                gl.deleteShader(sh);
                throw new Error("[resumeFx] shader compile failed: " + log);
            }
            return sh;
        };
        const vs = compile(gl.VERTEX_SHADER, VS_SRC);
        const fs = compile(gl.FRAGMENT_SHADER, FS_SRC);
        const prog = gl.createProgram();
        gl.attachShader(prog, vs); gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            throw new Error("[resumeFx] link failed: " + gl.getProgramInfoLog(prog));
        }
        this.program = prog;
        this.u = {
            model:         gl.getUniformLocation(prog, "u_model"),
            view:          gl.getUniformLocation(prog, "u_view"),
            proj:          gl.getUniformLocation(prog, "u_proj"),
            time:          gl.getUniformLocation(prog, "u_time"),
            effect:        gl.getUniformLocation(prog, "u_effect"),
            scrollOffset:  gl.getUniformLocation(prog, "u_scrollOffset"),
            waveAmp:       gl.getUniformLocation(prog, "u_waveAmp"),
            waveFreq:      gl.getUniformLocation(prog, "u_waveFreq"),
            tex:           gl.getUniformLocation(prog, "u_tex"),
            burnProgress:  gl.getUniformLocation(prog, "u_burnProgress"),
            aspect:        gl.getUniformLocation(prog, "u_aspect"),
        };
        this.a = {
            pos: gl.getAttribLocation(prog, "a_pos"),
            uv:  gl.getAttribLocation(prog, "a_uv"),
        };
    }

    _buildBuffers() {
        const gl = this.gl;
        const NX = 16, NY = 40;
        const positions = [];
        const uvs = [];
        for (let j = 0; j <= NY; j++) {
            for (let i = 0; i <= NX; i++) {
                const u = i / NX;
                const v = j / NY;
                positions.push(u * 2 - 1, 1 - v * 2);  // -1..1, y top→bottom
                uvs.push(u, v);                          // top-left = (0,0)
            }
        }
        const indices = [];
        for (let j = 0; j < NY; j++) {
            for (let i = 0; i < NX; i++) {
                const a = j * (NX + 1) + i;
                const b = a + 1;
                const c = a + (NX + 1);
                const d = c + 1;
                indices.push(a, c, b, b, c, d);
            }
        }
        this.numIndices = indices.length;

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        this.posBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this.a.pos);
        gl.vertexAttribPointer(this.a.pos, 2, gl.FLOAT, false, 0, 0);

        this.uvBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this.a.uv);
        gl.vertexAttribPointer(this.a.uv, 2, gl.FLOAT, false, 0, 0);

        this.idxBuf = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

        gl.bindVertexArray(null);
    }

    _buildTexture() {
        const gl = this.gl;
        this.tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        // 1×1 white placeholder until the real image lands
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
            new Uint8Array([240, 240, 240, 255]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);          // SCROLL relies on this
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        this._loadImage(this.imageUrl);
    }

    _loadImage(url) {
        const gl = this.gl;
        const img = new Image();
        // Same-origin since we serve from our own host; no crossOrigin needed
        img.onload = () => {
            gl.bindTexture(gl.TEXTURE_2D, this.tex);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);    // top-left origin (paper)
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            gl.generateMipmap(gl.TEXTURE_2D);
            this.texLoaded = true;
            if (this._statusEl) this._statusEl.textContent = `loaded · ${img.naturalWidth}×${img.naturalHeight}`;
            console.log(`[resumeFx] texture loaded: ${url} · ${img.naturalWidth}×${img.naturalHeight}`);
        };
        img.onerror = () => {
            if (this._statusEl) this._statusEl.textContent = "FAILED to load image";
            console.warn("[resumeFx] failed to load:", url);
        };
        img.src = url;
    }

    _buildPanel() {
        // Float a small control panel in the top-left while the demo is active.
        const root = document.createElement("div");
        root.id = "resumeFxPanel";
        root.style.cssText = `
            position: fixed; top: 80px; left: 14px; z-index: 9000;
            background: rgba(15, 12, 22, 0.92); border: 1px solid #553a7a; border-radius: 6px;
            padding: 10px 12px; color: #cfd; font: 11px ui-monospace, Menlo, monospace;
            min-width: 220px; box-shadow: 0 6px 24px rgba(0,0,0,0.6);
        `;
        root.innerHTML = `
            <div style="color:#fb8; font-weight:bold; margin-bottom:6px;">📄 RESUME FX</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px; margin-bottom:8px;" id="resumeFxBtns"></div>
            <div style="margin:8px 0 4px; color:#9bc;">Load your own resume image:</div>
            <input type="file" id="resumeFxFile" accept="image/*" style="width:100%; font-size:10px; color:#cde;"/>
            <div id="resumeFxStatus" style="margin-top:6px; color:#9bc; font-size:10px;">loading…</div>
            <div style="margin-top:8px; padding-top:6px; border-top:1px solid #333; color:#88a; font-size:10px;">
                tip: load a target-employer-specific resume<br/>
                here, switch effects, take a screen recording
            </div>
        `;
        document.body.appendChild(root);
        this._panel = root;
        this._statusEl = root.querySelector("#resumeFxStatus");

        const EFFECTS = [
            { id: 1, label: "🌀 Spin" },
            { id: 2, label: "📜 Scroll" },
            { id: 3, label: "🔥 Burn" },
            { id: 4, label: "🏳 Wave" },
            { id: 5, label: "👻 Hologram" },
            { id: 6, label: "🎲 Tumble" },
            { id: 0, label: "📃 Plain" },
        ];
        const btnHost = root.querySelector("#resumeFxBtns");
        for (const eff of EFFECTS) {
            const b = document.createElement("button");
            b.textContent = eff.label;
            b.style.cssText = "padding:5px 7px; background:#2a1e3a; color:#cfd; border:1px solid #443; border-radius:3px; cursor:pointer; font:11px ui-monospace,Menlo,monospace;";
            b.addEventListener("click", () => {
                this.effect = eff.id;
                this.lastEffectChange = performance.now() / 1000;
                // Visual select state
                btnHost.querySelectorAll("button").forEach(x => { x.style.background = "#2a1e3a"; x.style.borderColor = "#443"; });
                b.style.background = "#553a7a";
                b.style.borderColor = "#c9f";
            });
            btnHost.appendChild(b);
            if (eff.id === this.effect) b.click();
        }

        root.querySelector("#resumeFxFile").addEventListener("change", (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const url = URL.createObjectURL(f);
            this._statusEl.textContent = `loading ${f.name}…`;
            this._loadImage(url);
        });
    }

    _mat4Identity(m) {
        m[0] = 1; m[1] = 0; m[2] = 0; m[3] = 0;
        m[4] = 0; m[5] = 1; m[6] = 0; m[7] = 0;
        m[8] = 0; m[9] = 0; m[10] = 1; m[11] = 0;
        m[12] = 0; m[13] = 0; m[14] = 0; m[15] = 1;
    }
    _mat4Perspective(m, fovY, aspect, zNear, zFar) {
        const f = 1.0 / Math.tan(fovY / 2);
        const nf = 1.0 / (zNear - zFar);
        m[0] = f / aspect; m[1] = 0; m[2] = 0; m[3] = 0;
        m[4] = 0; m[5] = f; m[6] = 0; m[7] = 0;
        m[8] = 0; m[9] = 0; m[10] = (zFar + zNear) * nf; m[11] = -1;
        m[12] = 0; m[13] = 0; m[14] = 2 * zFar * zNear * nf; m[15] = 0;
    }
    _mat4LookAtZ(m, dist) {
        // Camera at (0, 0, dist) looking at origin, +Y up. Equivalent to translate(0,0,-dist).
        this._mat4Identity(m);
        m[14] = -dist;
    }
    _mat4Rotate(m, rx, ry, rz, tz) {
        const cx = Math.cos(rx), sx = Math.sin(rx);
        const cy = Math.cos(ry), sy = Math.sin(ry);
        const cz = Math.cos(rz), sz = Math.sin(rz);
        // R = Rz * Ry * Rx
        const r00 = cy * cz;
        const r01 = sx * sy * cz - cx * sz;
        const r02 = cx * sy * cz + sx * sz;
        const r10 = cy * sz;
        const r11 = sx * sy * sz + cx * cz;
        const r12 = cx * sy * sz - sx * cz;
        const r20 = -sy;
        const r21 = sx * cy;
        const r22 = cx * cy;
        m[0] = r00; m[1] = r10; m[2] = r20; m[3] = 0;
        m[4] = r01; m[5] = r11; m[6] = r21; m[7] = 0;
        m[8] = r02; m[9] = r12; m[10] = r22; m[11] = 0;
        m[12] = 0; m[13] = 0; m[14] = tz || 0; m[15] = 1;
    }

    render() {
        const gl = this.gl;
        if (!this.canvas) return;
        const w = this.canvas.width, h = this.canvas.height;
        const aspect = w / h;

        const t = performance.now() / 1000 - this.startTime;
        const tEff = performance.now() / 1000 - this.lastEffectChange;

        // Save state we'll perturb
        const prevProg = gl.getParameter(gl.CURRENT_PROGRAM);
        const prevBlend = gl.getParameter(gl.BLEND);
        const prevDepth = gl.getParameter(gl.DEPTH_TEST);
        const prevCull  = gl.getParameter(gl.CULL_FACE);

        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        // Per-effect transform
        const model = new Float32Array(16);
        let rx = 0, ry = 0, rz = 0, tz = 0;
        let scrollOff = 0, waveAmp = 0, waveFreq = 0, burnProg = 0;
        switch (this.effect) {
            case 1: // SPIN
                ry = t * 0.8;
                break;
            case 2: // SCROLL — keep flat, scroll the UV
                scrollOff = (t * 0.18) % 1.0;
                break;
            case 3: // BURN — keep flat, advance burn over 4s
                burnProg = Math.min(tEff / 4.0, 1.15);
                if (burnProg >= 1.15) {
                    // auto-restart burn after 1.5s pause
                    if (tEff > 5.5) this.lastEffectChange = performance.now() / 1000;
                }
                break;
            case 4: // WAVE
                waveAmp  = 0.18;
                waveFreq = 1.4;
                ry = Math.sin(t * 0.3) * 0.25;     // slight idle sway
                break;
            case 5: // HOLOGRAM
                ry = Math.sin(t * 0.5) * 0.35;
                break;
            case 6: // TUMBLE
                rx = t * 0.7;
                ry = t * 1.1;
                rz = Math.sin(t * 0.5) * 0.3;
                break;
            default:
                break;
        }
        // v667 — user drag adds to the effect-driven rotation. Drag horizontally
        // for yaw, vertically for pitch. Terrain stays still behind the resume.
        ry += this.userYaw;
        rx += this.userPitch;
        this._mat4Rotate(model, rx, ry, rz, 0);

        // Camera + projection — perspective, paper centered
        const view = new Float32Array(16);
        this._mat4LookAtZ(view, 3.4);
        const proj = new Float32Array(16);
        this._mat4Perspective(proj, 50 * Math.PI / 180, aspect, 0.1, 100);

        // Bind uniforms
        gl.uniformMatrix4fv(this.u.model, false, model);
        gl.uniformMatrix4fv(this.u.view,  false, view);
        gl.uniformMatrix4fv(this.u.proj,  false, proj);
        gl.uniform1f(this.u.time, t);
        gl.uniform1i(this.u.effect, this.effect);
        gl.uniform1f(this.u.scrollOffset, scrollOff);
        gl.uniform1f(this.u.waveAmp, waveAmp);
        gl.uniform1f(this.u.waveFreq, waveFreq);
        gl.uniform1f(this.u.burnProgress, burnProg);
        gl.uniform2f(this.u.aspect, aspect, 1);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.uniform1i(this.u.tex, 0);

        // Render state — paper has two sides; disable cull so spin shows backs too.
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        // BURN needs discard, no blending. Hologram looks better additive but
        // works fine opaque; keep it simple.
        gl.disable(gl.BLEND);

        // Clear depth so we draw on top of whatever was rendered before
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.drawElements(gl.TRIANGLES, this.numIndices, gl.UNSIGNED_SHORT, 0);

        // Restore state
        gl.bindVertexArray(null);
        if (prevProg) gl.useProgram(prevProg);
        if (prevCull) gl.enable(gl.CULL_FACE);
        if (!prevDepth) gl.disable(gl.DEPTH_TEST);
        if (prevBlend) gl.enable(gl.BLEND);
    }

    dispose() {
        const gl = this.gl;
        try { gl.deleteVertexArray(this.vao); } catch {}
        try { gl.deleteBuffer(this.posBuf); } catch {}
        try { gl.deleteBuffer(this.uvBuf); } catch {}
        try { gl.deleteBuffer(this.idxBuf); } catch {}
        try { gl.deleteTexture(this.tex); } catch {}
        try { gl.deleteProgram(this.program); } catch {}
        try { this._panel?.remove(); } catch {}
    }
}
