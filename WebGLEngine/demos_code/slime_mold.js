// demos_code/slime_mold.js — port of VBA ComputeSlimeMoldSystem
//
// Physarum-style slime mold simulation. Thousands of agents wander
// on a 2D field, each agent:
//   1. Senses pheromone concentration in three positions ahead (left,
//      center, right) of its current heading
//   2. Turns toward the strongest sensed value
//   3. Moves forward one step
//   4. Deposits pheromone at its new position
// Meanwhile the pheromone field diffuses (blurs) and decays over time.
//
// The emergent visualization is the iconic interconnected network
// pattern — Wikipedia's "physarum polycephalum" page, basically.
//
// VBA reference: VBAOpenGL_Demos_v2_67.xlsm → ComputeSlimeMoldSystem.cls
//
// Implementation:
//   - Two textures for ping-pong agent state (position + heading
//     packed into RGBA float pixels — one agent per pixel)
//   - Two textures for ping-pong pheromone field (single channel)
//   - Three programs: agentUpdate, pheromoneDecay, display
//
// All running in its own WebGL2 context on an overlay canvas.

const FIELD_SIZE  = 384;        // pheromone field resolution
const AGENT_TEX   = 96;         // 96×96 = 9216 agents (one per pixel)
const NUM_AGENTS  = AGENT_TEX * AGENT_TEX;
const DISPLAY_PX  = 320;
const STEPS_PER_FRAME = 2;
const DEPOSIT_AMOUNT  = 0.07;
const DECAY_RATE      = 0.965;
const DIFFUSE_WEIGHT  = 0.78;  // 1 = full blur, 0 = no diffusion
const SENSOR_ANGLE    = Math.PI / 5;   // sensor offset from heading
const SENSOR_DIST     = 9;
const TURN_SPEED      = 0.45;
const MOVE_SPEED      = 1.1;

// --- module state ---
let overlay = null;
let label = null;
let gl = null;
let agentProg = null;
let pheroProg = null;
let displayProg = null;
let agentTexA = null;
let agentTexB = null;
let agentFBA = null;
let agentFBB = null;
let pheroTexA = null;
let pheroTexB = null;
let pheroFBA = null;
let pheroFBB = null;
let quadVAO = null;
let elapsed = 0;
let agentReadFromA = true;
let pheroReadFromA = true;

// --- shaders ---
const VS = `#version 300 es
in vec2 aPos;
out vec2 vUV;
void main() {
    vUV = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Each agent is stored at (gl_FragCoord) in the agent texture.
// RGBA = (posX, posY, heading, _).  posX/posY in [0..1] field UV.
const AGENT_UPDATE_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;

uniform sampler2D uAgents;
uniform sampler2D uPhero;
uniform vec2 uAgentTexel;
uniform vec2 uFieldTexel;
uniform float uTime;
uniform float uSensorAngle;
uniform float uSensorDist;     // pixels in field space
uniform float uTurnSpeed;
uniform float uMoveSpeed;

float rnd(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float sample_phero(vec2 pos, float ang) {
    vec2 dir = vec2(cos(ang), sin(ang));
    vec2 sp = pos + dir * uSensorDist * uFieldTexel;
    sp = fract(sp);  // wrap toroidally so agents don't cluster at edges
    return texture(uPhero, sp).r;
}

void main() {
    vec4 agent = texture(uAgents, vUV);
    vec2 pos = agent.xy;
    float heading = agent.z;

    // Sense left, center, right ahead
    float sC = sample_phero(pos, heading);
    float sL = sample_phero(pos, heading + uSensorAngle);
    float sR = sample_phero(pos, heading - uSensorAngle);

    // Steer toward strongest sensor
    if (sC > sL && sC > sR) {
        // continue straight
    } else if (sC < sL && sC < sR) {
        // random kick — break symmetry when both sides are stronger
        float r = rnd(vUV + uTime * 0.01);
        heading += (r - 0.5) * uTurnSpeed * 2.0;
    } else if (sR > sL) {
        heading -= uTurnSpeed;
    } else if (sL > sR) {
        heading += uTurnSpeed;
    }

    // Move forward
    vec2 dir = vec2(cos(heading), sin(heading));
    pos += dir * uMoveSpeed * uFieldTexel;
    pos = fract(pos + 1.0);   // wrap

    outColor = vec4(pos, heading, 1.0);
}`;

// Pheromone update fragment shader: deposit (from agent positions
// rendered as points) and diffuse + decay.
//
// We do this in two passes:
//   1. Render agents as additive points → pheromone texture
//   2. Run this shader to diffuse + decay the result
//
// This fragment is for pass 2 (diffuse+decay).
const PHERO_UPDATE_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;

uniform sampler2D uPhero;
uniform vec2 uTexel;
uniform float uDecay;
uniform float uDiffWeight;

void main() {
    // 3x3 box blur
    float sum = 0.0;
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            sum += texture(uPhero, vUV + vec2(float(x), float(y)) * uTexel).r;
        }
    }
    sum /= 9.0;
    float center = texture(uPhero, vUV).r;
    float mixed = mix(center, sum, uDiffWeight);
    outColor = vec4(mixed * uDecay, 0.0, 0.0, 1.0);
}`;

// Display: pheromone with bright color ramp + bloom-ish glow
const DISPLAY_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;

uniform sampler2D uPhero;
uniform float uOverlayBrightness;

vec3 ramp(float t) {
    // Magma-ish ramp (dark purple → orange → pale yellow)
    t = clamp(t, 0.0, 1.0);
    vec3 a = vec3(0.0, 0.0, 0.02);
    vec3 b = vec3(0.25, 0.05, 0.45);
    vec3 c = vec3(0.85, 0.30, 0.30);
    vec3 d = vec3(1.00, 0.78, 0.40);
    if (t < 0.33)     return mix(a, b, t / 0.33);
    if (t < 0.66)     return mix(b, c, (t - 0.33) / 0.33);
    return                  mix(c, d, (t - 0.66) / 0.34);
}

void main() {
    float v = texture(uPhero, vUV).r;
    // Stretch contrast
    float vMapped = clamp(v * 2.5, 0.0, 1.0);
    vec3 col = ramp(vMapped);
    // Subtle vignette
    vec2 c2 = vUV - 0.5;
    float vig = 1.0 - smoothstep(0.45, 0.72, length(c2));
    col *= vig * uOverlayBrightness;
    outColor = vec4(col, 1.0);
}`;

// Deposit shader for agent points. Renders one quad per agent —
// actually one POINT per agent — into pheromone field with
// additive blending.
const AGENT_RENDER_VS = `#version 300 es
in float aIndex;
uniform sampler2D uAgents;
uniform vec2 uAgentTexel;
uniform float uPointSize;
out float vIntensity;

void main() {
    // Compute texel coord from index
    float i = aIndex;
    float w = 1.0 / uAgentTexel.x;
    float y = floor(i * uAgentTexel.x);
    float x = i - y * w;
    vec2 texCoord = (vec2(x, y) + 0.5) * uAgentTexel;
    vec2 pos = texture(uAgents, texCoord).xy;   // [0..1] field space
    gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
    gl_PointSize = uPointSize;
    vIntensity = 1.0;
}`;

const AGENT_RENDER_FS = `#version 300 es
precision highp float;
in float vIntensity;
out vec4 outColor;
uniform float uDeposit;
void main() {
    outColor = vec4(uDeposit, 0.0, 0.0, 1.0);
}`;

function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("[slime] compile:", gl.getShaderInfoLog(sh), src.slice(0, 80));
        gl.deleteShader(sh);
        return null;
    }
    return sh;
}

function link(gl, vs, fs, attribBindings = {}) {
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    for (const [name, loc] of Object.entries(attribBindings)) {
        gl.bindAttribLocation(p, loc, name);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.error("[slime] link:", gl.getProgramInfoLog(p));
        return null;
    }
    return p;
}

function createTex(gl, w, h, internalFmt, format, type, filter = gl.NEAREST) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFmt, w, h, 0, format, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
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

function seedAgents(gl, tex) {
    // Initial: random position, random heading
    const data = new Float32Array(AGENT_TEX * AGENT_TEX * 4);
    for (let i = 0; i < NUM_AGENTS; i++) {
        // Start them roughly in the center so the pattern grows outward
        const r = Math.sqrt(Math.random()) * 0.25;
        const a = Math.random() * Math.PI * 2;
        data[i*4 + 0] = 0.5 + r * Math.cos(a);
        data[i*4 + 1] = 0.5 + r * Math.sin(a);
        data[i*4 + 2] = Math.random() * Math.PI * 2;
        data[i*4 + 3] = 1.0;
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, AGENT_TEX, AGENT_TEX, gl.RGBA, gl.FLOAT, data);
}

export default {
    id:    "slime_mold",
    label: "SLIME MOLD (PHYSARUM PORT)",
    hint:  "Agent-based pheromone foraging — VBA ComputeSlimeMoldSystem ported",
    controls: [
        `Auto — ${NUM_AGENTS} agents, ${FIELD_SIZE}×${FIELD_SIZE} field`,
        `Sensor angle ${SENSOR_ANGLE.toFixed(2)}rad, dist ${SENSOR_DIST}px`,
        "Compare with VBAOpenGL_Demos_v2_67.xlsm → ComputeSlimeMoldSystem",
    ],

    start(ctx) {
        // Create overlay (offset left of the gray_scott overlay so they
        // can both be on screen at once)
        overlay = document.createElement("canvas");
        overlay.width = DISPLAY_PX;
        overlay.height = DISPLAY_PX;
        overlay.style.cssText = [
            "position:fixed",
            "right:" + (DISPLAY_PX + 40) + "px",
            "bottom:20px",
            "width:" + DISPLAY_PX + "px",
            "height:" + DISPLAY_PX + "px",
            "border:2px solid #382a38",
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
            "bottom:" + (DISPLAY_PX + 30) + "px",
            "font:11px monospace",
            "color:#fbd",
            "background:rgba(0,0,0,0.65)",
            "padding:4px 8px",
            "border-radius:3px",
            "z-index:1000",
            "pointer-events:none",
        ].join(";");
        label.textContent = "Slime Mold · Physarum";
        document.body.appendChild(label);

        gl = overlay.getContext("webgl2", { antialias: false, depth: false });
        if (!gl) {
            console.warn("[slime] WebGL2 unavailable");
            return;
        }
        const fext = gl.getExtension("EXT_color_buffer_float");
        if (!fext) {
            console.warn("[slime] EXT_color_buffer_float unavailable; physarum needs float for agent state");
            return;
        }

        // Compile programs
        const vs = compile(gl, gl.VERTEX_SHADER, VS);
        const fsAgent = compile(gl, gl.FRAGMENT_SHADER, AGENT_UPDATE_FS);
        const fsPhero = compile(gl, gl.FRAGMENT_SHADER, PHERO_UPDATE_FS);
        const fsDisp  = compile(gl, gl.FRAGMENT_SHADER, DISPLAY_FS);
        const vsAR    = compile(gl, gl.VERTEX_SHADER, AGENT_RENDER_VS);
        const fsAR    = compile(gl, gl.FRAGMENT_SHADER, AGENT_RENDER_FS);
        agentProg   = link(gl, vs, fsAgent,  { aPos: 0 });
        pheroProg   = link(gl, vs, fsPhero,  { aPos: 0 });
        displayProg = link(gl, vs, fsDisp,   { aPos: 0 });
        const agentRenderProg = link(gl, vsAR, fsAR, { aIndex: 0 });
        if (!agentProg || !pheroProg || !displayProg || !agentRenderProg) {
            console.error("[slime] program link failed");
            return;
        }
        this._agentRenderProg = agentRenderProg;

        // Full-screen quad
        const verts = new Float32Array([-1, -1,  3, -1,  -1,  3]);
        const quadVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
        quadVAO = gl.createVertexArray();
        gl.bindVertexArray(quadVAO);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        // Index buffer for per-agent point rendering
        const idx = new Float32Array(NUM_AGENTS);
        for (let i = 0; i < NUM_AGENTS; i++) idx[i] = (i + 0.5) / NUM_AGENTS;
        const idxBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, idxBuf);
        gl.bufferData(gl.ARRAY_BUFFER, idx, gl.STATIC_DRAW);
        this._agentVAO = gl.createVertexArray();
        gl.bindVertexArray(this._agentVAO);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);

        // Agent state textures (RGBA32F)
        agentTexA = createTex(gl, AGENT_TEX, AGENT_TEX, gl.RGBA32F, gl.RGBA, gl.FLOAT);
        agentTexB = createTex(gl, AGENT_TEX, AGENT_TEX, gl.RGBA32F, gl.RGBA, gl.FLOAT);
        agentFBA  = createFBO(gl, agentTexA);
        agentFBB  = createFBO(gl, agentTexB);

        // Pheromone field textures (single channel — use R16F)
        pheroTexA = createTex(gl, FIELD_SIZE, FIELD_SIZE, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.LINEAR);
        pheroTexB = createTex(gl, FIELD_SIZE, FIELD_SIZE, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.LINEAR);
        pheroFBA  = createFBO(gl, pheroTexA);
        pheroFBB  = createFBO(gl, pheroTexB);

        // Seed agents
        seedAgents(gl, agentTexA);
        // Pheromone starts empty (cleared)
        for (const fb of [pheroFBA, pheroFBB]) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        agentReadFromA = true;
        pheroReadFromA = true;
        elapsed = 0;
        ctx.kpop?.info?.("Slime Mold", `${NUM_AGENTS} agents, ${FIELD_SIZE}² field`);
        console.log("[slime_mold] started; agents:", NUM_AGENTS);
    },

    tick(ctx, dt) {
        if (!gl) return;
        elapsed += dt;

        for (let step = 0; step < STEPS_PER_FRAME; step++) {
            // ---- 1. Agent update ----
            gl.useProgram(agentProg);
            gl.bindVertexArray(quadVAO);
            gl.viewport(0, 0, AGENT_TEX, AGENT_TEX);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, agentReadFromA ? agentTexA : agentTexB);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, pheroReadFromA ? pheroTexA : pheroTexB);
            gl.uniform1i(gl.getUniformLocation(agentProg, "uAgents"), 0);
            gl.uniform1i(gl.getUniformLocation(agentProg, "uPhero"), 1);
            gl.uniform2f(gl.getUniformLocation(agentProg, "uAgentTexel"), 1.0/AGENT_TEX, 1.0/AGENT_TEX);
            gl.uniform2f(gl.getUniformLocation(agentProg, "uFieldTexel"), 1.0/FIELD_SIZE, 1.0/FIELD_SIZE);
            gl.uniform1f(gl.getUniformLocation(agentProg, "uTime"), elapsed);
            gl.uniform1f(gl.getUniformLocation(agentProg, "uSensorAngle"), SENSOR_ANGLE);
            gl.uniform1f(gl.getUniformLocation(agentProg, "uSensorDist"), SENSOR_DIST);
            gl.uniform1f(gl.getUniformLocation(agentProg, "uTurnSpeed"), TURN_SPEED);
            gl.uniform1f(gl.getUniformLocation(agentProg, "uMoveSpeed"), MOVE_SPEED);
            gl.bindFramebuffer(gl.FRAMEBUFFER, agentReadFromA ? agentFBB : agentFBA);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            agentReadFromA = !agentReadFromA;

            // ---- 2. Deposit ----
            // Render agent positions as additive points into the pheromone field
            gl.useProgram(this._agentRenderProg);
            gl.bindVertexArray(this._agentVAO);
            gl.viewport(0, 0, FIELD_SIZE, FIELD_SIZE);
            gl.bindFramebuffer(gl.FRAMEBUFFER, pheroReadFromA ? pheroFBA : pheroFBB);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, agentReadFromA ? agentTexA : agentTexB);
            gl.uniform1i(gl.getUniformLocation(this._agentRenderProg, "uAgents"), 0);
            gl.uniform2f(gl.getUniformLocation(this._agentRenderProg, "uAgentTexel"), 1.0/AGENT_TEX, 1.0/AGENT_TEX);
            gl.uniform1f(gl.getUniformLocation(this._agentRenderProg, "uPointSize"), 1.0);
            gl.uniform1f(gl.getUniformLocation(this._agentRenderProg, "uDeposit"), DEPOSIT_AMOUNT);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE);
            gl.drawArrays(gl.POINTS, 0, NUM_AGENTS);
            gl.disable(gl.BLEND);

            // ---- 3. Diffuse + decay ----
            gl.useProgram(pheroProg);
            gl.bindVertexArray(quadVAO);
            gl.viewport(0, 0, FIELD_SIZE, FIELD_SIZE);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, pheroReadFromA ? pheroTexA : pheroTexB);
            gl.uniform1i(gl.getUniformLocation(pheroProg, "uPhero"), 0);
            gl.uniform2f(gl.getUniformLocation(pheroProg, "uTexel"), 1.0/FIELD_SIZE, 1.0/FIELD_SIZE);
            gl.uniform1f(gl.getUniformLocation(pheroProg, "uDecay"), DECAY_RATE);
            gl.uniform1f(gl.getUniformLocation(pheroProg, "uDiffWeight"), DIFFUSE_WEIGHT);
            gl.bindFramebuffer(gl.FRAMEBUFFER, pheroReadFromA ? pheroFBB : pheroFBA);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            pheroReadFromA = !pheroReadFromA;
        }

        // ---- 4. Display ----
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, overlay.width, overlay.height);
        gl.useProgram(displayProg);
        gl.bindVertexArray(quadVAO);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, pheroReadFromA ? pheroTexA : pheroTexB);
        gl.uniform1i(gl.getUniformLocation(displayProg, "uPhero"), 0);
        gl.uniform1f(gl.getUniformLocation(displayProg, "uOverlayBrightness"), 1.0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    },

    stop(ctx) {
        if (gl) {
            for (const t of [agentTexA, agentTexB, pheroTexA, pheroTexB]) if (t) gl.deleteTexture(t);
            for (const f of [agentFBA, agentFBB, pheroFBA, pheroFBB]) if (f) gl.deleteFramebuffer(f);
            for (const p of [agentProg, pheroProg, displayProg, this._agentRenderProg]) if (p) gl.deleteProgram(p);
            if (quadVAO) gl.deleteVertexArray(quadVAO);
            if (this._agentVAO) gl.deleteVertexArray(this._agentVAO);
        }
        gl = null; agentProg = pheroProg = displayProg = null;
        agentTexA = agentTexB = pheroTexA = pheroTexB = null;
        agentFBA = agentFBB = pheroFBA = pheroFBB = null;
        quadVAO = null;
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (label   && label.parentNode)   label.parentNode.removeChild(label);
        overlay = null; label = null;
        console.log("[slime_mold] stopped");
    },
};
