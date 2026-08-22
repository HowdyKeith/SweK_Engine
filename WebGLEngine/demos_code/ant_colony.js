// demos_code/ant_colony.js — port of VBA ComputeAntColonySystem
//
// Like Slime Mold but with goals: ants leave the nest looking for food,
// pick it up when found, and head back home dropping a "going home"
// pheromone trail. Other ants follow the strongest food-trail when
// outbound and the strongest home-trail when returning. The classical
// emergent behavior: short-path optimization between nest and food.
//
// VBA reference: VBAOpenGL_Demos_v2_67.xlsm → ComputeAntColonySystem.cls
//
// State per agent: position (x, y), heading (angle), carrying (0/1).
// Two pheromone fields:
//   - "home trail" — deposited by ants heading from nest outward
//   - "food trail" — deposited by ants returning to nest with food
//
// Outbound ants sense FOOD trail to find food sources.
// Returning ants sense HOME trail to find the nest.
// Both pheromones diffuse and decay.

const FIELD_SIZE      = 384;
const AGENT_TEX       = 80;            // 80×80 = 6400 ants
const NUM_AGENTS      = AGENT_TEX * AGENT_TEX;
const DISPLAY_PX      = 320;
const STEPS_PER_FRAME = 2;

const NEST_X          = 0.5;           // UV space
const NEST_Y          = 0.5;
const NEST_RADIUS     = 0.025;         // capture/dropoff radius

const DEPOSIT_HOME    = 0.06;
const DEPOSIT_FOOD    = 0.08;
const DECAY_RATE      = 0.985;
const DIFFUSE_WEIGHT  = 0.50;
const SENSOR_ANGLE    = Math.PI / 6;
const SENSOR_DIST     = 7;
const TURN_SPEED      = 0.55;
const MOVE_SPEED      = 1.2;

// Three food sources around the nest at varied distances
const FOOD_SOURCES = [
    { x: 0.20, y: 0.30, r: 0.04 },
    { x: 0.78, y: 0.34, r: 0.04 },
    { x: 0.50, y: 0.85, r: 0.04 },
];

let overlay = null;
let label = null;
let gl = null;
let agentProg = null;
let pheroProg = null;
let displayProg = null;
let agentRenderProg = null;
let foodTex = null;             // static texture marking food source positions
let agentTexA = null;
let agentTexB = null;
let agentFBA = null;
let agentFBB = null;
let pheroTexA = null;           // RGBA: R=home trail, G=food trail
let pheroTexB = null;
let pheroFBA = null;
let pheroFBB = null;
let quadVAO = null;
let agentVAO = null;
let elapsed = 0;
let agentReadFromA = true;
let pheroReadFromA = true;

const VS = `#version 300 es
in vec2 aPos;
out vec2 vUV;
void main() {
    vUV = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Ant state RGBA = (posX, posY, heading, carrying).
// carrying = 0.0 (foraging) or 1.0 (returning home).
const AGENT_UPDATE_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;

uniform sampler2D uAgents;
uniform sampler2D uPhero;          // R=home, G=food
uniform sampler2D uFood;           // R=food mass at this cell
uniform vec2 uFieldTexel;
uniform float uTime;
uniform float uSensorAngle;
uniform float uSensorDist;
uniform float uTurnSpeed;
uniform float uMoveSpeed;
uniform vec2 uNestPos;
uniform float uNestRadius;

float rnd(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float sense(vec2 pos, float ang, bool wantFood) {
    vec2 dir = vec2(cos(ang), sin(ang));
    vec2 sp = pos + dir * uSensorDist * uFieldTexel;
    sp = fract(sp);
    vec2 phero = texture(uPhero, sp).rg;
    if (wantFood) {
        // Outbound: prefer cells with food + food-trail
        float foodMass = texture(uFood, sp).r;
        return phero.g * 0.7 + foodMass * 2.0;
    } else {
        // Returning: prefer home-trail
        return phero.r;
    }
}

void main() {
    vec4 agent = texture(uAgents, vUV);
    vec2 pos = agent.xy;
    float heading = agent.z;
    float carrying = agent.w;
    bool seekingFood = (carrying < 0.5);

    // Sense ahead-left / ahead / ahead-right
    float sC = sense(pos, heading,                  seekingFood);
    float sL = sense(pos, heading + uSensorAngle,   seekingFood);
    float sR = sense(pos, heading - uSensorAngle,   seekingFood);

    if (sC > sL && sC > sR) {
        // straight
    } else if (sC < sL && sC < sR) {
        // No clear signal — random jitter
        float r = rnd(vUV + uTime * 0.01);
        heading += (r - 0.5) * uTurnSpeed * 2.0;
    } else if (sR > sL) {
        heading -= uTurnSpeed;
    } else {
        heading += uTurnSpeed;
    }

    // Move
    vec2 dir = vec2(cos(heading), sin(heading));
    pos += dir * uMoveSpeed * uFieldTexel;
    pos = fract(pos + 1.0);

    // State transitions: pick up food / drop off at nest
    if (seekingFood) {
        // Check if standing on a food cell
        float food = texture(uFood, pos).r;
        if (food > 0.1) {
            carrying = 1.0;
            heading += 3.14159;   // turn 180° to head home
        }
    } else {
        // Check if near nest
        vec2 d = pos - uNestPos;
        // Account for toroidal wrap by picking the shortest delta
        d.x = d.x - floor(d.x + 0.5);
        d.y = d.y - floor(d.y + 0.5);
        if (length(d) < uNestRadius) {
            carrying = 0.0;
            heading += 3.14159;   // turn around, head out again
        }
    }

    outColor = vec4(pos, heading, carrying);
}`;

// Pheromone update: 3x3 box blur + decay. Single shader for both
// channels — diffuse independently.
const PHERO_UPDATE_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;

uniform sampler2D uPhero;
uniform vec2 uTexel;
uniform float uDecay;
uniform float uDiffW;

void main() {
    vec2 sum = vec2(0.0);
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            sum += texture(uPhero, vUV + vec2(float(x), float(y)) * uTexel).rg;
        }
    }
    vec2 mean = sum / 9.0;
    vec2 center = texture(uPhero, vUV).rg;
    vec2 mixed = mix(center, mean, uDiffW) * uDecay;
    outColor = vec4(mixed, 0.0, 1.0);
}`;

// Deposit shader: ants drop pheromone in their CURRENT channel based
// on carrying state. carrying=0 → deposit HOME trail (R), carrying=1
// → deposit FOOD trail (G).
const DEPOSIT_VS = `#version 300 es
in float aIndex;
uniform sampler2D uAgents;
uniform vec2 uAgentTexel;
out float vCarrying;

void main() {
    float i = aIndex;
    float w = 1.0 / uAgentTexel.x;
    float y = floor(i * uAgentTexel.x);
    float x = i - y * w;
    vec2 texCoord = (vec2(x, y) + 0.5) * uAgentTexel;
    vec4 agent = texture(uAgents, texCoord);
    vec2 pos = agent.xy;
    vCarrying = agent.w;
    gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
    gl_PointSize = 1.0;
}`;

const DEPOSIT_FS = `#version 300 es
precision highp float;
in float vCarrying;
out vec4 outColor;
uniform float uHomeAmt;
uniform float uFoodAmt;
void main() {
    // Foraging ants (carrying=0) deposit HOME trail (so others find nest)
    // Wait — actually: foraging ants drop the trail to FROM the nest.
    // Returning ants drop trail TO the nest (food trail).
    // Outbound -> deposits FOOD-trail-seed-from-nest (channel R = "from nest")
    // Returning -> deposits FOOD-trail (channel G = "leads to food")
    if (vCarrying < 0.5) {
        outColor = vec4(uHomeAmt, 0.0, 0.0, 1.0);
    } else {
        outColor = vec4(0.0, uFoodAmt, 0.0, 1.0);
    }
}`;

// Display: food trail green, home trail blue, food sources gold,
// nest white.
const DISPLAY_FS = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 outColor;
uniform sampler2D uPhero;
uniform sampler2D uFood;
uniform vec2 uNestPos;
uniform float uNestRadius;
uniform float uOverlayBrightness;

void main() {
    vec2 phero = texture(uPhero, vUV).rg;
    float food = texture(uFood, vUV).r;

    vec3 col = vec3(0.02, 0.025, 0.045);   // dark base
    col += vec3(0.2, 0.5, 1.0) * pow(phero.r * 2.5, 0.85);   // home trail
    col += vec3(0.4, 1.0, 0.3) * pow(phero.g * 2.5, 0.85);   // food trail
    // Food sources glow
    col += vec3(1.0, 0.8, 0.2) * food * 1.2;
    // Nest marker
    vec2 d = vUV - uNestPos;
    d.x = d.x - floor(d.x + 0.5);
    d.y = d.y - floor(d.y + 0.5);
    float dn = length(d);
    if (dn < uNestRadius * 1.5) {
        float k = 1.0 - smoothstep(uNestRadius, uNestRadius * 1.5, dn);
        col = mix(col, vec3(1.0, 0.95, 0.85), k * 0.8);
    }
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
        console.error("[ant] compile:", gl.getShaderInfoLog(sh));
        return null;
    }
    return sh;
}
function link(gl, vs, fs, bindings = {}) {
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    for (const [n, l] of Object.entries(bindings)) gl.bindAttribLocation(p, l, n);
    gl.linkProgram(p);
    return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
}
function createTex(gl, w, h, fmt, format, type, filter) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, format, type, null);
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
    const data = new Float32Array(NUM_AGENTS * 4);
    for (let i = 0; i < NUM_AGENTS; i++) {
        // All ants start at the nest, random heading, not carrying
        const dx = (Math.random() - 0.5) * NEST_RADIUS * 0.5;
        const dy = (Math.random() - 0.5) * NEST_RADIUS * 0.5;
        data[i*4 + 0] = NEST_X + dx;
        data[i*4 + 1] = NEST_Y + dy;
        data[i*4 + 2] = Math.random() * Math.PI * 2;
        data[i*4 + 3] = 0.0;
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, AGENT_TEX, AGENT_TEX, gl.RGBA, gl.FLOAT, data);
}

function seedFood(gl, tex) {
    const data = new Uint8Array(FIELD_SIZE * FIELD_SIZE * 4);
    for (const f of FOOD_SOURCES) {
        const fx = Math.floor(f.x * FIELD_SIZE);
        const fy = Math.floor(f.y * FIELD_SIZE);
        const fr = Math.floor(f.r * FIELD_SIZE);
        for (let dy = -fr; dy <= fr; dy++) {
            for (let dx = -fr; dx <= fr; dx++) {
                const d = Math.sqrt(dx*dx + dy*dy);
                if (d > fr) continue;
                const x = (fx + dx + FIELD_SIZE) % FIELD_SIZE;
                const y = (fy + dy + FIELD_SIZE) % FIELD_SIZE;
                const i = (y * FIELD_SIZE + x) * 4;
                const intensity = Math.floor(255 * (1 - d / fr));
                if (intensity > data[i]) data[i] = intensity;
                data[i+3] = 255;
            }
        }
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, FIELD_SIZE, FIELD_SIZE, gl.RGBA, gl.UNSIGNED_BYTE, data);
}

export default {
    id:    "ant_colony",
    label: "ANT COLONY (PHEROMONE FORAGING PORT)",
    hint:  "Ants find food via pheromone trails — VBA ComputeAntColonySystem ported",
    controls: [
        `Auto — ${NUM_AGENTS} ants, 3 food sources, nest at center`,
        "Blue trail = home, green trail = food found, gold = food source",
        "Compare with VBAOpenGL_Demos_v2_67.xlsm → ComputeAntColonySystem",
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
            "border:2px solid #3a3022",
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
            "color:#fc8",
            "background:rgba(0,0,0,0.65)",
            "padding:4px 8px",
            "border-radius:3px",
            "z-index:1000",
            "pointer-events:none",
        ].join(";");
        label.textContent = "Ant Colony · foraging";
        document.body.appendChild(label);

        gl = overlay.getContext("webgl2", { antialias: false, depth: false });
        if (!gl) { console.warn("[ant] WebGL2 unavailable"); return; }
        const fext = gl.getExtension("EXT_color_buffer_float");
        if (!fext) { console.warn("[ant] float textures unavailable"); return; }

        const vs = compile(gl, gl.VERTEX_SHADER, VS);
        const fsA = compile(gl, gl.FRAGMENT_SHADER, AGENT_UPDATE_FS);
        const fsP = compile(gl, gl.FRAGMENT_SHADER, PHERO_UPDATE_FS);
        const fsD = compile(gl, gl.FRAGMENT_SHADER, DISPLAY_FS);
        const vsDep = compile(gl, gl.VERTEX_SHADER, DEPOSIT_VS);
        const fsDep = compile(gl, gl.FRAGMENT_SHADER, DEPOSIT_FS);
        agentProg       = link(gl, vs, fsA,  { aPos: 0 });
        pheroProg       = link(gl, vs, fsP,  { aPos: 0 });
        displayProg     = link(gl, vs, fsD,  { aPos: 0 });
        agentRenderProg = link(gl, vsDep, fsDep, { aIndex: 0 });

        // Full-screen quad
        const verts = new Float32Array([-1, -1,  3, -1,  -1,  3]);
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
        quadVAO = gl.createVertexArray();
        gl.bindVertexArray(quadVAO);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        // Per-agent index buffer
        const idx = new Float32Array(NUM_AGENTS);
        for (let i = 0; i < NUM_AGENTS; i++) idx[i] = (i + 0.5) / NUM_AGENTS;
        const idxBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, idxBuf);
        gl.bufferData(gl.ARRAY_BUFFER, idx, gl.STATIC_DRAW);
        agentVAO = gl.createVertexArray();
        gl.bindVertexArray(agentVAO);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);

        // Agents (RGBA32F)
        agentTexA = createTex(gl, AGENT_TEX, AGENT_TEX, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
        agentTexB = createTex(gl, AGENT_TEX, AGENT_TEX, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
        agentFBA = createFBO(gl, agentTexA);
        agentFBB = createFBO(gl, agentTexB);

        // Pheromone (RG16F — 2 channels for home + food trails)
        pheroTexA = createTex(gl, FIELD_SIZE, FIELD_SIZE, gl.RG16F, gl.RG, gl.HALF_FLOAT, gl.LINEAR);
        pheroTexB = createTex(gl, FIELD_SIZE, FIELD_SIZE, gl.RG16F, gl.RG, gl.HALF_FLOAT, gl.LINEAR);
        pheroFBA = createFBO(gl, pheroTexA);
        pheroFBB = createFBO(gl, pheroTexB);

        // Food sources (static RGBA8)
        foodTex = createTex(gl, FIELD_SIZE, FIELD_SIZE, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);

        // Seed
        seedAgents(gl, agentTexA);
        seedFood(gl, foodTex);
        for (const fb of [pheroFBA, pheroFBB]) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        agentReadFromA = true;
        pheroReadFromA = true;
        elapsed = 0;
        ctx.kpop?.info?.("Ant Colony", `${NUM_AGENTS} ants, 3 food sources`);
        console.log("[ant_colony] started");
    },

    tick(ctx, dt) {
        if (!gl) return;
        elapsed += dt;

        for (let s = 0; s < STEPS_PER_FRAME; s++) {
            // 1. Agent update
            gl.useProgram(agentProg);
            gl.bindVertexArray(quadVAO);
            gl.viewport(0, 0, AGENT_TEX, AGENT_TEX);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, agentReadFromA ? agentTexA : agentTexB);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, pheroReadFromA ? pheroTexA : pheroTexB);
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, foodTex);
            gl.uniform1i(gl.getUniformLocation(agentProg, "uAgents"), 0);
            gl.uniform1i(gl.getUniformLocation(agentProg, "uPhero"), 1);
            gl.uniform1i(gl.getUniformLocation(agentProg, "uFood"), 2);
            gl.uniform2f(gl.getUniformLocation(agentProg, "uFieldTexel"), 1/FIELD_SIZE, 1/FIELD_SIZE);
            gl.uniform1f(gl.getUniformLocation(agentProg, "uTime"), elapsed);
            gl.uniform1f(gl.getUniformLocation(agentProg, "uSensorAngle"), SENSOR_ANGLE);
            gl.uniform1f(gl.getUniformLocation(agentProg, "uSensorDist"), SENSOR_DIST);
            gl.uniform1f(gl.getUniformLocation(agentProg, "uTurnSpeed"), TURN_SPEED);
            gl.uniform1f(gl.getUniformLocation(agentProg, "uMoveSpeed"), MOVE_SPEED);
            gl.uniform2f(gl.getUniformLocation(agentProg, "uNestPos"), NEST_X, NEST_Y);
            gl.uniform1f(gl.getUniformLocation(agentProg, "uNestRadius"), NEST_RADIUS);
            gl.bindFramebuffer(gl.FRAMEBUFFER, agentReadFromA ? agentFBB : agentFBA);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            agentReadFromA = !agentReadFromA;

            // 2. Deposit pheromones
            gl.useProgram(agentRenderProg);
            gl.bindVertexArray(agentVAO);
            gl.viewport(0, 0, FIELD_SIZE, FIELD_SIZE);
            gl.bindFramebuffer(gl.FRAMEBUFFER, pheroReadFromA ? pheroFBA : pheroFBB);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, agentReadFromA ? agentTexA : agentTexB);
            gl.uniform1i(gl.getUniformLocation(agentRenderProg, "uAgents"), 0);
            gl.uniform2f(gl.getUniformLocation(agentRenderProg, "uAgentTexel"), 1/AGENT_TEX, 1/AGENT_TEX);
            gl.uniform1f(gl.getUniformLocation(agentRenderProg, "uHomeAmt"), DEPOSIT_HOME);
            gl.uniform1f(gl.getUniformLocation(agentRenderProg, "uFoodAmt"), DEPOSIT_FOOD);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE);
            gl.drawArrays(gl.POINTS, 0, NUM_AGENTS);
            gl.disable(gl.BLEND);

            // 3. Pheromone diffuse + decay
            gl.useProgram(pheroProg);
            gl.bindVertexArray(quadVAO);
            gl.viewport(0, 0, FIELD_SIZE, FIELD_SIZE);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, pheroReadFromA ? pheroTexA : pheroTexB);
            gl.uniform1i(gl.getUniformLocation(pheroProg, "uPhero"), 0);
            gl.uniform2f(gl.getUniformLocation(pheroProg, "uTexel"), 1/FIELD_SIZE, 1/FIELD_SIZE);
            gl.uniform1f(gl.getUniformLocation(pheroProg, "uDecay"), DECAY_RATE);
            gl.uniform1f(gl.getUniformLocation(pheroProg, "uDiffW"), DIFFUSE_WEIGHT);
            gl.bindFramebuffer(gl.FRAMEBUFFER, pheroReadFromA ? pheroFBB : pheroFBA);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            pheroReadFromA = !pheroReadFromA;
        }

        // 4. Display
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, overlay.width, overlay.height);
        gl.useProgram(displayProg);
        gl.bindVertexArray(quadVAO);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, pheroReadFromA ? pheroTexA : pheroTexB);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, foodTex);
        gl.uniform1i(gl.getUniformLocation(displayProg, "uPhero"), 0);
        gl.uniform1i(gl.getUniformLocation(displayProg, "uFood"), 1);
        gl.uniform2f(gl.getUniformLocation(displayProg, "uNestPos"), NEST_X, NEST_Y);
        gl.uniform1f(gl.getUniformLocation(displayProg, "uNestRadius"), NEST_RADIUS);
        gl.uniform1f(gl.getUniformLocation(displayProg, "uOverlayBrightness"), 1.0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    },

    stop(ctx) {
        if (gl) {
            for (const t of [agentTexA, agentTexB, pheroTexA, pheroTexB, foodTex]) if (t) gl.deleteTexture(t);
            for (const f of [agentFBA, agentFBB, pheroFBA, pheroFBB]) if (f) gl.deleteFramebuffer(f);
            for (const p of [agentProg, pheroProg, displayProg, agentRenderProg]) if (p) gl.deleteProgram(p);
            if (quadVAO) gl.deleteVertexArray(quadVAO);
            if (agentVAO) gl.deleteVertexArray(agentVAO);
        }
        gl = null;
        agentProg = pheroProg = displayProg = agentRenderProg = null;
        agentTexA = agentTexB = pheroTexA = pheroTexB = foodTex = null;
        agentFBA = agentFBB = pheroFBA = pheroFBB = null;
        quadVAO = agentVAO = null;
        if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
        if (label?.parentNode) label.parentNode.removeChild(label);
        overlay = label = null;
        console.log("[ant_colony] stopped");
    },
};
