// demos_code/rock_paper_scissors.js — port of VBA ComputeRockPaperScissorsSystem
//
// Three species (R, P, S) compete with non-transitive dominance:
//   Rock beats Scissors, Scissors beats Paper, Paper beats Rock.
//
// The May-Leonard model for cyclic competition. Each cell holds three
// population densities (r, p, s) with r + p + s = 1 (or close to it).
// Per step:
//   - Reaction: each species gains from its prey, loses to its predator
//   - Diffusion: 3×3 box blur to spread populations across the grid
//
// The interesting dynamics emerge from cyclic dominance: no species
// wins globally, instead beautiful rotating spiral patterns form,
// each spiral arm dominated by one species, chasing the next in the
// R → P → S → R cycle. Famous in evolutionary biology and game theory.
//
// VBA reference: VBAOpenGL_Demos_v2_67.xlsm → ComputeRockPaperScissorsSystem.cls
//
// Display: RGB straight through. Rock=red, Paper=green, Scissors=blue.

const SIM_SIZE        = 256;
const DISPLAY_PX      = 320;
const STEPS_PER_FRAME = 4;

// May-Leonard rates. Alpha = predation rate (predator eats prey),
// Beta = growth rate from prey. Tuned for visible spirals.
const ALPHA = 1.2;
const BETA  = 1.0;
const DT    = 0.04;
const DIFFUSE_WEIGHT = 0.20;   // how much each step blends with neighbors

let overlay = null;
let label = null;
let gl = null;
let updateProg = null;
let displayProg = null;
let texA = null;
let texB = null;
let fboA = null;
let fboB = null;
let quadVAO = null;
let elapsed = 0;
let readingFromA = true;

const VS = `#version 300 es
in vec2 aPos;
out vec2 vUV;
void main() {
    vUV = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Update: read self + 8 neighbors, mix self toward neighbor mean for
// diffusion, then apply cyclic reaction. Normalized to sum=1 to
// prevent runaway growth from numerical drift.
const UPDATE_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform float uAlpha;
uniform float uBeta;
uniform float uDt;
uniform float uDiffW;

void main() {
    vec3 self = texture(uState, vUV).rgb;
    // 3x3 box mean for diffusion
    vec3 sum = vec3(0.0);
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            sum += texture(uState, fract(vUV + vec2(float(x), float(y)) * uTexel)).rgb;
        }
    }
    vec3 mean = sum / 9.0;
    vec3 diffused = mix(self, mean, uDiffW);

    // Cyclic reaction. r preys on s, p preys on r, s preys on p.
    float r = diffused.r, p = diffused.g, s = diffused.b;
    float dr = r * (uBeta * s - uAlpha * p);
    float dp = p * (uBeta * r - uAlpha * s);
    float ds = s * (uBeta * p - uAlpha * r);

    vec3 next = diffused + vec3(dr, dp, ds) * uDt;
    next = max(next, vec3(0.0));
    // Re-normalize so populations sum to 1 — keeps the system stable
    float total = next.r + next.g + next.b;
    if (total > 0.001) next /= total;
    outColor = vec4(next, 1.0);
}`;

// Display: tonemap the RGB triple with a slight saturation boost
// for vivid spiral arms.
const DISPLAY_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;
uniform sampler2D uState;
uniform float uOverlayBrightness;

void main() {
    vec3 col = texture(uState, vUV).rgb;
    // Pick the dominant species per cell, return its "pure" color
    // weighted by dominance — gives crisper spiral arm boundaries
    float mx = max(col.r, max(col.g, col.b));
    float t = smoothstep(0.30, 0.55, mx);
    vec3 dominant;
    if      (col.r >= col.g && col.r >= col.b) dominant = vec3(1.0, 0.25, 0.30);
    else if (col.g >= col.r && col.g >= col.b) dominant = vec3(0.25, 1.0, 0.40);
    else                                       dominant = vec3(0.30, 0.45, 1.0);
    vec3 blended = mix(col * 1.4, dominant, t * 0.6);
    // Vignette
    vec2 c2 = vUV - 0.5;
    float vig = 1.0 - smoothstep(0.45, 0.72, length(c2));
    blended *= vig * uOverlayBrightness;
    outColor = vec4(blended, 1.0);
}`;

function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("[rps] compile:", gl.getShaderInfoLog(sh));
        return null;
    }
    return sh;
}
function link(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, "aPos");
    gl.linkProgram(p);
    return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
}
function createTex(gl, fmt, type) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt, SIM_SIZE, SIM_SIZE, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return t;
}
function createFBO(gl, tex) {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return fb;
}

// Seed: random per-cell distribution. Each cell biased toward one
// species but with small populations of the other two. The random
// initial state organizes into spiral domains within ~20 seconds.
function seedRandom(gl, tex) {
    const data = new Float32Array(SIM_SIZE * SIM_SIZE * 4);
    for (let y = 0; y < SIM_SIZE; y++) {
        for (let x = 0; x < SIM_SIZE; x++) {
            const i = (y * SIM_SIZE + x) * 4;
            // Randomly pick a dominant species per cell, but keep
            // small populations of the other two to avoid extinction
            const r = Math.random(), p = Math.random(), s = Math.random();
            const sum = r + p + s;
            data[i + 0] = r / sum;
            data[i + 1] = p / sum;
            data[i + 2] = s / sum;
            data[i + 3] = 1.0;
        }
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SIM_SIZE, SIM_SIZE, gl.RGBA, gl.FLOAT, data);
}

export default {
    id:    "rock_paper_scissors",
    label: "ROCK-PAPER-SCISSORS (CYCLIC PORT)",
    hint:  "Cyclic dominance May-Leonard — VBA ComputeRockPaperScissorsSystem ported",
    controls: [
        "Auto — three species form rotating spiral domains",
        `Sim grid ${SIM_SIZE}×${SIM_SIZE}, α=${ALPHA}, β=${BETA}`,
        "Compare with VBAOpenGL_Demos_v2_67.xlsm → ComputeRockPaperScissorsSystem",
    ],

    start(ctx) {
        overlay = document.createElement("canvas");
        overlay.width = DISPLAY_PX;
        overlay.height = DISPLAY_PX;
        overlay.style.cssText = [
            "position:fixed",
            "right:" + (DISPLAY_PX + 40) + "px",
            "bottom:" + (DISPLAY_PX + 50) + "px",
            "width:" + DISPLAY_PX + "px",
            "height:" + DISPLAY_PX + "px",
            "border:2px solid #2a3838",
            "border-radius:6px",
            "box-shadow:0 4px 14px rgba(0,0,0,0.6)",
            "background:#000",
            "z-index:1000",
            "pointer-events:none",
        ].join(";");
        document.body.appendChild(overlay);

        label = document.createElement("div");
        label.style.cssText = [
            "position:fixed",
            "right:" + (DISPLAY_PX + 40) + "px",
            "bottom:" + (DISPLAY_PX * 2 + 60) + "px",
            "font:11px monospace",
            "color:#9fc",
            "background:rgba(0,0,0,0.65)",
            "padding:4px 8px",
            "border-radius:3px",
            "z-index:1000",
            "pointer-events:none",
        ].join(";");
        label.textContent = "Rock·Paper·Scissors · cyclic dominance";
        document.body.appendChild(label);

        gl = overlay.getContext("webgl2", { antialias: false, depth: false });
        if (!gl) { console.warn("[rps] WebGL2 unavailable"); return; }
        const fext = gl.getExtension("EXT_color_buffer_float");
        if (!fext) { console.warn("[rps] float textures unavailable"); return; }

        const vs = compile(gl, gl.VERTEX_SHADER, VS);
        const fsUpd = compile(gl, gl.FRAGMENT_SHADER, UPDATE_FS);
        const fsDisp = compile(gl, gl.FRAGMENT_SHADER, DISPLAY_FS);
        updateProg = link(gl, vs, fsUpd);
        displayProg = link(gl, vs, fsDisp);

        const verts = new Float32Array([-1, -1,  3, -1,  -1,  3]);
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
        quadVAO = gl.createVertexArray();
        gl.bindVertexArray(quadVAO);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        texA = createTex(gl, gl.RGBA16F, gl.FLOAT);
        texB = createTex(gl, gl.RGBA16F, gl.FLOAT);
        fboA = createFBO(gl, texA);
        fboB = createFBO(gl, texB);

        seedRandom(gl, texA);
        readingFromA = true;
        elapsed = 0;
        ctx.kpop?.info?.("Rock-Paper-Scissors", "May-Leonard cyclic dominance");
        console.log("[rps] started");
    },

    tick(ctx, dt) {
        if (!gl) return;
        elapsed += dt;

        gl.useProgram(updateProg);
        gl.bindVertexArray(quadVAO);
        gl.viewport(0, 0, SIM_SIZE, SIM_SIZE);
        gl.uniform2f(gl.getUniformLocation(updateProg, "uTexel"), 1/SIM_SIZE, 1/SIM_SIZE);
        gl.uniform1f(gl.getUniformLocation(updateProg, "uAlpha"), ALPHA);
        gl.uniform1f(gl.getUniformLocation(updateProg, "uBeta"), BETA);
        gl.uniform1f(gl.getUniformLocation(updateProg, "uDt"), DT);
        gl.uniform1f(gl.getUniformLocation(updateProg, "uDiffW"), DIFFUSE_WEIGHT);
        gl.uniform1i(gl.getUniformLocation(updateProg, "uState"), 0);

        for (let s = 0; s < STEPS_PER_FRAME; s++) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, readingFromA ? texA : texB);
            gl.bindFramebuffer(gl.FRAMEBUFFER, readingFromA ? fboB : fboA);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            readingFromA = !readingFromA;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, overlay.width, overlay.height);
        gl.useProgram(displayProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, readingFromA ? texA : texB);
        gl.uniform1i(gl.getUniformLocation(displayProg, "uState"), 0);
        gl.uniform1f(gl.getUniformLocation(displayProg, "uOverlayBrightness"), 1.0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    },

    stop(ctx) {
        if (gl) {
            for (const t of [texA, texB]) if (t) gl.deleteTexture(t);
            for (const f of [fboA, fboB]) if (f) gl.deleteFramebuffer(f);
            if (quadVAO) gl.deleteVertexArray(quadVAO);
            if (updateProg) gl.deleteProgram(updateProg);
            if (displayProg) gl.deleteProgram(displayProg);
        }
        gl = null; updateProg = displayProg = null;
        texA = texB = fboA = fboB = quadVAO = null;
        if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
        if (label?.parentNode) label.parentNode.removeChild(label);
        overlay = label = null;
        console.log("[rps] stopped");
    },
};
