// demos_code/cellular_automata.js — port of VBA ComputeCellularAutomata
//
// 2D binary cellular automaton with totalistic "B/S" rule notation.
// Each cell counts its 8 neighbors and updates per rule:
//   - Dead cell with N alive neighbors → becomes alive if N ∈ Birth set
//   - Alive cell with N alive neighbors → stays alive if N ∈ Survival set
//
// VBA reference: VBAOpenGL_Demos_v2_67.xlsm → ComputeCellularAutomata.cls
//
// Cycles through 6 famous rules every 18s. Each transition reseeds
// with random noise so the new rule has fresh territory to evolve in.
//
// Implementation:
//   - Own canvas, own WebGL2 context
//   - Single-channel R8 ping-pong (each cell is 0 or 255)
//   - Update fragment shader counts neighbors, applies rule
//   - Display shader colors live cells with rule-specific palette,
//     with subtle age-fade so recently-born cells glow

const GRID        = 384;        // simulation grid
const DISPLAY_PX  = 320;
const STEPS_PER_FRAME = 1;       // one CA step per visual frame

// Rules in "B/S" totalistic notation. B = birth counts (dead→alive),
// S = survival counts (alive→alive). All others die.
const RULES = [
    { name: "Conway's Life",  B: [3],          S: [2, 3],        seedDensity: 0.18 },
    { name: "HighLife",       B: [3, 6],       S: [2, 3],        seedDensity: 0.18 },
    { name: "Day & Night",    B: [3, 6, 7, 8], S: [3, 4, 6, 7, 8], seedDensity: 0.50 },
    { name: "Seeds",          B: [2],          S: [],            seedDensity: 0.03 },
    { name: "Maze",           B: [3],          S: [1, 2, 3, 4, 5], seedDensity: 0.10 },
    { name: "Replicator",     B: [1, 3, 5, 7], S: [1, 3, 5, 7], seedDensity: 0.001 },
];
const RULE_DURATION = 18;

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
let ruleIdx = 0;
let ruleTimer = 0;
let elapsed = 0;
let readingFromA = true;
let stepAccum = 0;

const VS = `#version 300 es
in vec2 aPos;
out vec2 vUV;
void main() {
    vUV = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Encodes Birth and Survival sets as 9-bit masks (bit N = rule fires
// on N neighbors). The fragment shader unpacks them and tests against
// the actual neighbor count.
const UPDATE_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform int uBirthMask;        // bit N set = birth on N neighbors
uniform int uSurvivalMask;     // bit N set = survival on N neighbors

float cell(vec2 uv) {
    return texture(uState, fract(uv)).r > 0.5 ? 1.0 : 0.0;
}

void main() {
    float self = cell(vUV);
    // Moore neighborhood
    float n = 0.0;
    n += cell(vUV + vec2(-uTexel.x, -uTexel.y));
    n += cell(vUV + vec2( 0.0,      -uTexel.y));
    n += cell(vUV + vec2( uTexel.x, -uTexel.y));
    n += cell(vUV + vec2(-uTexel.x,  0.0));
    n += cell(vUV + vec2( uTexel.x,  0.0));
    n += cell(vUV + vec2(-uTexel.x,  uTexel.y));
    n += cell(vUV + vec2( 0.0,       uTexel.y));
    n += cell(vUV + vec2( uTexel.x,  uTexel.y));
    int nc = int(n + 0.5);
    int mask = 1 << nc;
    bool willLive;
    if (self > 0.5) {
        willLive = (uSurvivalMask & mask) != 0;
    } else {
        willLive = (uBirthMask & mask) != 0;
    }
    outColor = vec4(willLive ? 1.0 : 0.0, 0.0, 0.0, 1.0);
}`;

// Display shader: subtle palette per cell, with bloom-ish blur for
// living cells against dark background. Uses simple per-rule color
// passed via uniform.
const DISPLAY_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform vec3 uCellColor;
uniform float uOverlayBrightness;

void main() {
    float v = texture(uState, vUV).r;
    // Sample 4 corners for soft 5-tap glow that approximates bloom
    float g = v;
    g += texture(uState, vUV + vec2( uTexel.x, 0.0)).r;
    g += texture(uState, vUV + vec2(-uTexel.x, 0.0)).r;
    g += texture(uState, vUV + vec2(0.0,  uTexel.y)).r;
    g += texture(uState, vUV + vec2(0.0, -uTexel.y)).r;
    g *= 0.2;

    vec3 bg = vec3(0.02, 0.03, 0.05);
    vec3 fg = uCellColor;
    vec3 col = mix(bg, fg, v);
    // Soft glow halo around live cells
    col += uCellColor * g * 0.4;
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
        console.error("[ca] compile:", gl.getShaderInfoLog(sh));
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
function createTex(gl) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, GRID, GRID, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
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
function ruleMask(arr) {
    let m = 0;
    for (const n of arr) m |= (1 << n);
    return m;
}
function ruleColor(idx) {
    // Each rule gets a distinct hue so the live cells aren't always white
    const palette = [
        [0.5, 0.85, 1.0],   // Conway → cool cyan
        [1.0, 0.65, 0.3],   // HighLife → orange
        [0.7, 0.5, 1.0],    // Day & Night → violet
        [0.4, 1.0, 0.5],    // Seeds → green
        [1.0, 0.85, 0.4],   // Maze → amber
        [1.0, 0.4, 0.7],    // Replicator → pink
    ];
    return palette[idx % palette.length];
}
function seedRandom(gl, tex, density) {
    const data = new Uint8Array(GRID * GRID);
    for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() < density ? 255 : 0;
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, GRID, GRID, gl.RED, gl.UNSIGNED_BYTE, data);
}

export default {
    id:    "cellular_automata",
    label: "CELLULAR AUTOMATA (CA PORT)",
    hint:  "Conway's Life + 5 rule variants — VBA ComputeCellularAutomata ported",
    controls: [
        "Auto — cycles through 6 rules every 18 seconds, reseeding each time",
        `Sim grid ${GRID}×${GRID}, ${STEPS_PER_FRAME} step/frame`,
        "Compare with VBAOpenGL_Demos_v2_67.xlsm → ComputeCellularAutomata",
    ],

    start(ctx) {
        overlay = document.createElement("canvas");
        overlay.width = DISPLAY_PX;
        overlay.height = DISPLAY_PX;
        overlay.style.cssText = [
            "position:fixed",
            "right:" + (DISPLAY_PX * 2 + 60) + "px",
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
        label.style.cssText = [
            "position:fixed",
            "right:" + (DISPLAY_PX * 2 + 60) + "px",
            "bottom:" + (DISPLAY_PX + 30) + "px",
            "font:11px monospace",
            "color:#9df",
            "background:rgba(0,0,0,0.65)",
            "padding:4px 8px",
            "border-radius:3px",
            "z-index:1000",
            "pointer-events:none",
        ].join(";");
        label.textContent = "CA · " + RULES[0].name;
        document.body.appendChild(label);

        gl = overlay.getContext("webgl2", { antialias: false, depth: false });
        if (!gl) { console.warn("[ca] WebGL2 unavailable"); return; }

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

        texA = createTex(gl); texB = createTex(gl);
        fboA = createFBO(gl, texA); fboB = createFBO(gl, texB);

        seedRandom(gl, texA, RULES[0].seedDensity);
        readingFromA = true;
        ruleIdx = 0;
        ruleTimer = 0;
        elapsed = 0;
        stepAccum = 0;
        ctx.kpop?.info?.("CA", RULES[0].name);
        console.log("[ca] started");
    },

    tick(ctx, dt) {
        if (!gl) return;
        elapsed += dt;
        ruleTimer += dt;
        stepAccum += dt;

        // Cycle rule
        if (ruleTimer >= RULE_DURATION) {
            ruleTimer = 0;
            ruleIdx = (ruleIdx + 1) % RULES.length;
            const r = RULES[ruleIdx];
            seedRandom(gl, readingFromA ? texA : texB, r.seedDensity);
            ctx.kpop?.info?.("CA", r.name);
            label.textContent = "CA · " + r.name;
        }
        const rule = RULES[ruleIdx];

        // Throttle CA steps to ~30 per second so we can SEE the
        // dynamics — at 60fps + 1 step/frame the patterns blur.
        const stepInterval = 1.0 / 24.0;
        let steps = 0;
        while (stepAccum >= stepInterval && steps < 4) {
            stepAccum -= stepInterval;
            steps++;
        }

        if (steps > 0) {
            gl.useProgram(updateProg);
            gl.bindVertexArray(quadVAO);
            gl.viewport(0, 0, GRID, GRID);
            gl.uniform2f(gl.getUniformLocation(updateProg, "uTexel"), 1/GRID, 1/GRID);
            gl.uniform1i(gl.getUniformLocation(updateProg, "uBirthMask"), ruleMask(rule.B));
            gl.uniform1i(gl.getUniformLocation(updateProg, "uSurvivalMask"), ruleMask(rule.S));
            gl.uniform1i(gl.getUniformLocation(updateProg, "uState"), 0);

            for (let s = 0; s < steps; s++) {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, readingFromA ? texA : texB);
                gl.bindFramebuffer(gl.FRAMEBUFFER, readingFromA ? fboB : fboA);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
                readingFromA = !readingFromA;
            }
        }

        // Display
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, overlay.width, overlay.height);
        gl.useProgram(displayProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, readingFromA ? texA : texB);
        gl.uniform1i(gl.getUniformLocation(displayProg, "uState"), 0);
        gl.uniform2f(gl.getUniformLocation(displayProg, "uTexel"), 1/GRID, 1/GRID);
        const c = ruleColor(ruleIdx);
        gl.uniform3f(gl.getUniformLocation(displayProg, "uCellColor"), c[0], c[1], c[2]);
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
        console.log("[ca] stopped");
    },
};
