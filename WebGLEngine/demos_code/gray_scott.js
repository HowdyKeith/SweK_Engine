// demos_code/gray_scott.js — port of VBA ComputeGrayScottSystem +
// ComputeReactionDiffusionSystem (pattern 0 = Gray-Scott).
//
// Classic two-chemical reaction-diffusion. Two scalar fields U and V
// diffuse and react via:
//   ∂U/∂t = Du·∇²U - U·V² + F·(1-U)        (feed)
//   ∂V/∂t = Dv·∇²V + U·V² - (F+k)·V        (kill)
//
// Different (F, k) parameter pairs produce wildly different patterns:
// spots, stripes, mitosis, coral, fingerprints. We cycle through 6
// well-known presets.
//
// VBA reference: VBAOpenGL_Demos_v2_67.xlsm →
//   ComputeGrayScottSystem.cls and ComputeReactionDiffusionSystem.cls
//
// Implementation:
//   - Own <canvas> overlaid bottom-right (320×320 display, 256×256 sim)
//   - Own WebGL2 context, ping-pong RGBA16F textures
//   - Update fragment shader runs 9-point Laplacian + the reaction
//   - Multiple steps per frame for visible animation speed
//   - Display shader maps V channel through a viridis-style ramp

const SIM_SIZE        = 256;     // simulation grid resolution
const DISPLAY_PX      = 320;     // overlay size on screen
const STEPS_PER_FRAME = 12;      // sim steps per render
const SEED_RADIUS     = 16;      // initial perturbation patch size

// Well-known Gray-Scott presets. F = feed rate, k = kill rate.
// Cycles every PRESET_DURATION seconds.
const PRESETS = [
    { name: "Mitosis",      F: 0.0367, k: 0.0649 },
    { name: "Coral",        F: 0.0545, k: 0.0620 },
    { name: "Fingerprints", F: 0.0440, k: 0.0640 },
    { name: "Spots",        F: 0.0300, k: 0.0620 },
    { name: "Solitons",     F: 0.0300, k: 0.0560 },
    { name: "Worms",        F: 0.0780, k: 0.0610 },
];
const PRESET_DURATION = 14;   // seconds per preset

// --- module state ---
let overlay      = null;
let label        = null;
let gl           = null;
let updateProg   = null;
let displayProg  = null;
let texA         = null;
let texB         = null;
let fboA         = null;
let fboB         = null;
let quadVAO      = null;
let presetIdx    = 0;
let presetTimer  = 0;
let elapsed      = 0;
let readingFromA = true;     // ping-pong toggle

// --- shaders ---
const VS = `#version 300 es
in vec2 aPos;
out vec2 vUV;
void main() {
    vUV = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const UPDATE_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;
uniform sampler2D uState;
uniform vec2 uTexel;        // 1.0 / size
uniform float uF;
uniform float uK;
uniform float uDt;          // time step (typically 1.0 for stability)
uniform float uDu;
uniform float uDv;

void main() {
    // 9-point Laplacian — gives smoother diffusion than 5-point
    vec2 c = vUV;
    vec2 n = vUV + vec2( 0.0,        uTexel.y);
    vec2 s = vUV + vec2( 0.0,       -uTexel.y);
    vec2 e = vUV + vec2( uTexel.x,   0.0);
    vec2 w = vUV + vec2(-uTexel.x,   0.0);
    vec2 ne = vUV + uTexel;
    vec2 nw = vUV + vec2(-uTexel.x,  uTexel.y);
    vec2 se = vUV + vec2( uTexel.x, -uTexel.y);
    vec2 sw = vUV - uTexel;

    vec2 cv = texture(uState, c).rg;
    vec2 sum = (texture(uState, n).rg + texture(uState, s).rg +
                texture(uState, e).rg + texture(uState, w).rg) * 0.2 +
               (texture(uState, ne).rg + texture(uState, nw).rg +
                texture(uState, se).rg + texture(uState, sw).rg) * 0.05;
    vec2 lap = sum - cv;

    float U = cv.r, V = cv.g;
    float dU = uDu * lap.r - U * V * V + uF * (1.0 - U);
    float dV = uDv * lap.g + U * V * V - (uF + uK) * V;

    outColor = vec4(clamp(U + dU * uDt, 0.0, 1.0),
                    clamp(V + dV * uDt, 0.0, 1.0),
                    0.0, 1.0);
}`;

// Viridis-ish color ramp (eyeball-fitted polynomial to viridis LUT).
// Maps V channel to a perceptually uniform purple→blue→green→yellow.
const DISPLAY_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;
uniform sampler2D uState;
uniform float uTime;
uniform float uOverlayBrightness;

vec3 viridis(float t) {
    t = clamp(t, 0.0, 1.0);
    // Polynomial approximation of viridis — close enough for a demo.
    return vec3(
        0.267 + t * (0.105 + t * (-2.30  + t * ( 5.28 + t * (-3.42)))),
        0.005 + t * (1.405 + t * (-0.95  + t * ( 0.51 + t * (-0.07)))),
        0.330 + t * (0.965 + t * (-2.36  + t * ( 2.39 + t * (-0.51))))
    );
}

void main() {
    float v = texture(uState, vUV).g;
    // Stretch contrast a bit; raw V tends to sit in [0, 0.5]
    float vMapped = clamp(v * 1.8, 0.0, 1.0);
    vec3 col = viridis(vMapped);
    // Subtle vignette so the panel reads as a window
    vec2 c2 = vUV - 0.5;
    float vig = 1.0 - smoothstep(0.45, 0.72, length(c2));
    col *= vig * uOverlayBrightness;
    outColor = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("[gray_scott] shader compile:", gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
    }
    return sh;
}

function link(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.error("[gray_scott] link:", gl.getProgramInfoLog(p));
        return null;
    }
    return p;
}

function createTex(gl, size, fmt, type) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt, size, size, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
}

function createFBO(gl, tex) {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return fb;
}

// Seed: fill with U=1, V=0; then plant a small patch of V=0.5 at center
// so the simulation has something to evolve from.
function seedInitial(gl, tex, size) {
    const data = new Float32Array(size * size * 4);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            data[i + 0] = 1.0;   // U
            data[i + 1] = 0.0;   // V
            data[i + 2] = 0.0;
            data[i + 3] = 1.0;
            // Patch of V in center
            const dx = x - size / 2, dy = y - size / 2;
            if (dx * dx + dy * dy < SEED_RADIUS * SEED_RADIUS) {
                data[i + 0] = 0.5;
                data[i + 1] = 0.25;
            }
            // Two small extra seeds for asymmetry
            const dx2 = x - size * 0.3, dy2 = y - size * 0.7;
            if (dx2 * dx2 + dy2 * dy2 < 36) {
                data[i + 0] = 0.5;
                data[i + 1] = 0.25;
            }
        }
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, size, size, gl.RGBA, gl.FLOAT, data);
}

export default {
    id:    "gray_scott",
    label: "GRAY-SCOTT (RD PORT)",
    hint:  "Reaction-diffusion patterns — VBA ComputeGrayScottSystem ported",
    controls: [
        "Auto — cycles through 6 parameter presets every 14 seconds",
        `Sim grid ${SIM_SIZE}×${SIM_SIZE}, ${STEPS_PER_FRAME} steps/frame`,
        "Compare with VBAOpenGL_Demos_v2_67.xlsm → ComputeGrayScottSystem",
    ],

    start(ctx) {
        // Create overlay
        overlay = document.createElement("canvas");
        overlay.id = "demo_gray_scott_canvas";
        overlay.width = DISPLAY_PX;
        overlay.height = DISPLAY_PX;
        overlay.style.cssText = [
            "position:fixed",
            "right:20px",
            "bottom:20px",
            "width:" + DISPLAY_PX + "px",
            "height:" + DISPLAY_PX + "px",
            "border:2px solid #2a3438",
            "border-radius:6px",
            "box-shadow:0 4px 14px rgba(0,0,0,0.6)",
            "background:#000",
            "z-index:1000",
            "pointer-events:none",
        ].join(";");
        document.body.appendChild(overlay);

        label = document.createElement("div");
        label.id = "demo_gray_scott_label";
        label.style.cssText = [
            "position:fixed",
            "right:20px",
            "bottom:" + (DISPLAY_PX + 30) + "px",
            "font:11px monospace",
            "color:#9fd",
            "background:rgba(0,0,0,0.65)",
            "padding:4px 8px",
            "border-radius:3px",
            "z-index:1000",
            "pointer-events:none",
        ].join(";");
        label.textContent = "Gray-Scott RD";
        document.body.appendChild(label);

        // Own WebGL2 context
        gl = overlay.getContext("webgl2", { antialias: false, depth: false });
        if (!gl) {
            console.warn("[gray_scott] WebGL2 unavailable");
            return;
        }
        const fext = gl.getExtension("EXT_color_buffer_float");
        if (!fext) {
            console.warn("[gray_scott] EXT_color_buffer_float unavailable — RD will be unstable on 8-bit");
        }

        // Compile shaders
        const vs = compile(gl, gl.VERTEX_SHADER, VS);
        const fsUpd = compile(gl, gl.FRAGMENT_SHADER, UPDATE_FS);
        const fsDisp = compile(gl, gl.FRAGMENT_SHADER, DISPLAY_FS);
        updateProg = link(gl, vs, fsUpd);
        displayProg = link(gl, vs, fsDisp);
        gl.bindAttribLocation(updateProg, 0, "aPos");
        gl.bindAttribLocation(displayProg, 0, "aPos");

        // Fullscreen quad
        const verts = new Float32Array([-1, -1,  3, -1,  -1,  3]);   // big-triangle trick
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
        quadVAO = gl.createVertexArray();
        gl.bindVertexArray(quadVAO);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        // Two ping-pong textures + FBOs (RGBA16F if extension available,
        // else RGBA8 with the obvious precision loss)
        const internalFmt = fext ? gl.RGBA16F : gl.RGBA8;
        const type = fext ? gl.FLOAT : gl.UNSIGNED_BYTE;
        texA = createTex(gl, SIM_SIZE, internalFmt, type);
        texB = createTex(gl, SIM_SIZE, internalFmt, type);
        fboA = createFBO(gl, texA);
        fboB = createFBO(gl, texB);

        // Seed initial state
        if (fext) {
            seedInitial(gl, texA, SIM_SIZE);
        } else {
            // RGBA8 fallback — encode U,V as 0..1 byte values
            const data = new Uint8Array(SIM_SIZE * SIM_SIZE * 4);
            for (let y = 0; y < SIM_SIZE; y++) {
                for (let x = 0; x < SIM_SIZE; x++) {
                    const i = (y * SIM_SIZE + x) * 4;
                    data[i + 0] = 255; data[i + 1] = 0; data[i + 3] = 255;
                    const dx = x - SIM_SIZE / 2, dy = y - SIM_SIZE / 2;
                    if (dx * dx + dy * dy < SEED_RADIUS * SEED_RADIUS) {
                        data[i + 0] = 128; data[i + 1] = 64;
                    }
                }
            }
            gl.bindTexture(gl.TEXTURE_2D, texA);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SIM_SIZE, SIM_SIZE,
                             gl.RGBA, gl.UNSIGNED_BYTE, data);
        }

        readingFromA = true;
        presetIdx = 0;
        presetTimer = 0;
        elapsed = 0;
        ctx.kpop?.info?.("Gray-Scott RD", `${PRESETS[0].name} (F=${PRESETS[0].F}, k=${PRESETS[0].k})`);
        console.log("[gray_scott] started");
    },

    tick(ctx, dt) {
        if (!gl) return;
        elapsed += dt;
        presetTimer += dt;

        // Cycle presets
        if (presetTimer >= PRESET_DURATION) {
            presetTimer = 0;
            presetIdx = (presetIdx + 1) % PRESETS.length;
            const p = PRESETS[presetIdx];
            ctx.kpop?.info?.("Gray-Scott RD", `${p.name} (F=${p.F}, k=${p.k})`);
            label.textContent = `Gray-Scott · ${p.name}`;
        }
        const preset = PRESETS[presetIdx];

        // Update steps
        gl.useProgram(updateProg);
        gl.bindVertexArray(quadVAO);
        gl.viewport(0, 0, SIM_SIZE, SIM_SIZE);
        gl.uniform2f(gl.getUniformLocation(updateProg, "uTexel"), 1.0 / SIM_SIZE, 1.0 / SIM_SIZE);
        gl.uniform1f(gl.getUniformLocation(updateProg, "uF"), preset.F);
        gl.uniform1f(gl.getUniformLocation(updateProg, "uK"), preset.k);
        gl.uniform1f(gl.getUniformLocation(updateProg, "uDt"), 1.0);
        gl.uniform1f(gl.getUniformLocation(updateProg, "uDu"), 1.0);
        gl.uniform1f(gl.getUniformLocation(updateProg, "uDv"), 0.5);
        gl.uniform1i(gl.getUniformLocation(updateProg, "uState"), 0);

        for (let step = 0; step < STEPS_PER_FRAME; step++) {
            const readTex = readingFromA ? texA : texB;
            const writeFB = readingFromA ? fboB : fboA;
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, readTex);
            gl.bindFramebuffer(gl.FRAMEBUFFER, writeFB);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            readingFromA = !readingFromA;
        }

        // Display
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, overlay.width, overlay.height);
        gl.useProgram(displayProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, readingFromA ? texA : texB);
        gl.uniform1i(gl.getUniformLocation(displayProg, "uState"), 0);
        gl.uniform1f(gl.getUniformLocation(displayProg, "uTime"), elapsed);
        gl.uniform1f(gl.getUniformLocation(displayProg, "uOverlayBrightness"), 1.0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    },

    stop(ctx) {
        if (gl) {
            if (texA) gl.deleteTexture(texA);
            if (texB) gl.deleteTexture(texB);
            if (fboA) gl.deleteFramebuffer(fboA);
            if (fboB) gl.deleteFramebuffer(fboB);
            if (quadVAO) gl.deleteVertexArray(quadVAO);
            if (updateProg) gl.deleteProgram(updateProg);
            if (displayProg) gl.deleteProgram(displayProg);
        }
        gl = null; updateProg = null; displayProg = null;
        texA = texB = fboA = fboB = quadVAO = null;
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (label   && label.parentNode)   label.parentNode.removeChild(label);
        overlay = null; label = null;
        console.log("[gray_scott] stopped");
    },
};
