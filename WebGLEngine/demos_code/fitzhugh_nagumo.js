// demos_code/fitzhugh_nagumo.js — port of VBA ComputeFitzHughNagumoSystem
//
// FitzHugh-Nagumo is a two-variable simplification of the Hodgkin-Huxley
// neuron model. It's the canonical "excitable medium" — cells can be in
// rest, excited, or refractory states, and waves of excitation propagate
// through the field. Different from Gray-Scott reaction-diffusion because
// FHN naturally produces rotating spiral waves (the same kind seen in
// cardiac arrhythmia and Belousov-Zhabotinsky chemistry).
//
//   ∂u/∂t = Du·∇²u + (1/ε)·(u - u³/3 - v + I)
//   ∂v/∂t =          ε·(u + a - b·v)
//
// where u is the excitation variable (membrane potential), v is the
// recovery variable, ε is the time-scale separation (ε ≪ 1 means u
// evolves fast, v slow — this is what creates the spiral dynamics).
//
// VBA reference: VBAOpenGL_Demos_v2_67.xlsm → ComputeFitzHughNagumoSystem
//
// Initial condition: split the field horizontally with u=+1 top / u=-1
// bottom, then split vertically with v=+0.5 left / v=0 right. The
// asymmetry creates a single rotating spiral that organizes the whole
// field into nested spiral waves.

const SIM_SIZE        = 256;
const DISPLAY_PX      = 320;
const STEPS_PER_FRAME = 14;

const EPSILON  = 0.01;
const A_PARAM  = 0.7;
const B_PARAM  = 0.8;
const I_PARAM  = 0.0;
const DU       = 1.0;
const DT       = 0.04;

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

const UPDATE_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;
uniform sampler2D uState;       // RG: u and v
uniform vec2 uTexel;
uniform float uEpsilon;
uniform float uA;
uniform float uB;
uniform float uI;
uniform float uDu;
uniform float uDt;

void main() {
    vec2 c = texture(uState, vUV).rg;
    // 5-point Laplacian on u only
    float n = texture(uState, vUV + vec2(0.0,  uTexel.y)).r;
    float s = texture(uState, vUV + vec2(0.0, -uTexel.y)).r;
    float e = texture(uState, vUV + vec2( uTexel.x, 0.0)).r;
    float w = texture(uState, vUV + vec2(-uTexel.x, 0.0)).r;
    float lapU = (n + s + e + w) - 4.0 * c.r;

    float u = c.r, v = c.g;
    float du = uDu * lapU + (1.0 / uEpsilon) * (u - (u*u*u)/3.0 - v + uI);
    float dv = uEpsilon * (u + uA - uB * v);

    outColor = vec4(clamp(u + du * uDt, -2.0, 2.0),
                    clamp(v + dv * uDt, -2.0, 2.0),
                    0.0, 1.0);
}`;

// Map u to a cool→warm ramp; the spiral wave structure is clearest
// with high-contrast color gradients. v is shown subtly as desaturation.
const DISPLAY_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;
uniform sampler2D uState;
uniform float uOverlayBrightness;

// v4412 -- RENAMED FROM fireRamp. fx/voxelize/fireRamp.js exports blackbodyRamp, a six-stop temperature
// ramp whose blue channel is zero until the fire is nearly white. This one runs black -> PURPLE -> red
// and its blue channel RISES to 0.30 at a fifth of full heat and then falls. At h = 0.2 they read
// [0.51, 0.04, 0.00] and [0.18, 0.05, 0.30]: they do not differ in shade, they disagree about whether
// cool fire is red or purple, and a cool blackbody is never purple. Two functions called fireRamp, one
// of them not a fire ramp at all. render/fireColour.mjs measures both.
vec3 infernoRamp(float t) {
    t = clamp(t, 0.0, 1.0);
    // Inferno-ish: black → purple → red → orange → yellow → white
    vec3 c0 = vec3(0.0, 0.0, 0.0);
    vec3 c1 = vec3(0.18, 0.05, 0.30);
    vec3 c2 = vec3(0.65, 0.10, 0.30);
    vec3 c3 = vec3(0.95, 0.45, 0.20);
    vec3 c4 = vec3(1.00, 0.85, 0.40);
    vec3 c5 = vec3(1.00, 1.00, 0.90);
    if (t < 0.2)  return mix(c0, c1, t / 0.2);
    if (t < 0.4)  return mix(c1, c2, (t - 0.2) / 0.2);
    if (t < 0.6)  return mix(c2, c3, (t - 0.4) / 0.2);
    if (t < 0.8)  return mix(c3, c4, (t - 0.6) / 0.2);
    return            mix(c4, c5, (t - 0.8) / 0.2);
}

void main() {
    vec2 c = texture(uState, vUV).rg;
    // Remap u from ~[-2..+2] into [0..1]
    float uM = clamp((c.r + 1.5) / 3.0, 0.0, 1.0);
    vec3 col = infernoRamp(uM);
    // Tint cool when v is high (refractory) so the wave tail reads
    // distinct from the leading edge
    float vN = clamp((c.g + 0.5) / 2.0, 0.0, 1.0);
    col = mix(col, col * vec3(0.4, 0.6, 1.0), vN * 0.35);
    // Vignette
    vec2 c2 = vUV - 0.5;
    float vig = 1.0 - smoothstep(0.45, 0.72, length(c2));
    col *= vig * uOverlayBrightness;
    outColor = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("[fhn] compile:", gl.getShaderInfoLog(sh));
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

// Seed: split horizontally for u, vertically for v. The phase
// discontinuity at the quadrant boundary spawns a rotating spiral.
function seedSpiral(gl, tex) {
    const data = new Float32Array(SIM_SIZE * SIM_SIZE * 4);
    for (let y = 0; y < SIM_SIZE; y++) {
        for (let x = 0; x < SIM_SIZE; x++) {
            const i = (y * SIM_SIZE + x) * 4;
            const u = (y < SIM_SIZE / 2) ? 1.2 : -1.2;
            const v = (x < SIM_SIZE / 2) ? 0.4 : -0.2;
            data[i + 0] = u;
            data[i + 1] = v;
            data[i + 3] = 1.0;
        }
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SIM_SIZE, SIM_SIZE, gl.RGBA, gl.FLOAT, data);
}

export default {
    id:    "fitzhugh_nagumo",
    label: "FITZHUGH-NAGUMO (SPIRAL WAVES PORT)",
    hint:  "Excitable medium — VBA ComputeFitzHughNagumoSystem ported",
    controls: [
        "Auto — single rotating spiral organizes the field",
        `Sim grid ${SIM_SIZE}×${SIM_SIZE}, ${STEPS_PER_FRAME} steps/frame`,
        "Compare with VBAOpenGL_Demos_v2_67.xlsm → ComputeFitzHughNagumoSystem",
    ],

    start(ctx) {
        overlay = document.createElement("canvas");
        overlay.width = DISPLAY_PX;
        overlay.height = DISPLAY_PX;
        overlay.style.cssText = [
            "position:fixed",
            "right:20px",
            "bottom:" + (DISPLAY_PX + 50) + "px",
            "width:" + DISPLAY_PX + "px",
            "height:" + DISPLAY_PX + "px",
            "border:2px solid #382828",
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
            "right:20px",
            "bottom:" + (DISPLAY_PX * 2 + 60) + "px",
            "font:11px monospace",
            "color:#fc9",
            "background:rgba(0,0,0,0.65)",
            "padding:4px 8px",
            "border-radius:3px",
            "z-index:1000",
            "pointer-events:none",
        ].join(";");
        label.textContent = "FitzHugh-Nagumo · spiral wave";
        document.body.appendChild(label);

        gl = overlay.getContext("webgl2", { antialias: false, depth: false });
        if (!gl) { console.warn("[fhn] WebGL2 unavailable"); return; }
        const fext = gl.getExtension("EXT_color_buffer_float");
        if (!fext) { console.warn("[fhn] float textures unavailable"); return; }

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

        seedSpiral(gl, texA);
        readingFromA = true;
        elapsed = 0;
        ctx.kpop?.info?.("FitzHugh-Nagumo", "Excitable medium — spiral waves forming");
        console.log("[fhn] started");
    },

    tick(ctx, dt) {
        if (!gl) return;
        elapsed += dt;

        gl.useProgram(updateProg);
        gl.bindVertexArray(quadVAO);
        gl.viewport(0, 0, SIM_SIZE, SIM_SIZE);
        gl.uniform2f(gl.getUniformLocation(updateProg, "uTexel"), 1/SIM_SIZE, 1/SIM_SIZE);
        gl.uniform1f(gl.getUniformLocation(updateProg, "uEpsilon"), EPSILON);
        gl.uniform1f(gl.getUniformLocation(updateProg, "uA"), A_PARAM);
        gl.uniform1f(gl.getUniformLocation(updateProg, "uB"), B_PARAM);
        gl.uniform1f(gl.getUniformLocation(updateProg, "uI"), I_PARAM);
        gl.uniform1f(gl.getUniformLocation(updateProg, "uDu"), DU);
        gl.uniform1f(gl.getUniformLocation(updateProg, "uDt"), DT);
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
        console.log("[fhn] stopped");
    },
};
