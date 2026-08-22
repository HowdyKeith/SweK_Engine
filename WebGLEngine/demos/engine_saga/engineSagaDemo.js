// FILE: demos/engine_saga/engineSagaDemo.js
// VERSION: v1 — round 161
//
// "ENGINE: A SAGA." Star Wars-style opening crawl that lists every
// feature of the engine set. Six chapters, rotates between runs via
// localStorage["engineSaga.lastChapter"] so each replay opens a
// different chapter. The user can also pick a chapter directly.
//
// Visual:
//   - Black void background
//   - WebGL2 starfield (gl.POINTS, slow rotation, twinkle)
//   - Tilted text plane, perspective recession (top of screen far,
//     bottom close), Lucasfilm Yellow on black
//   - Chapter text pre-rendered to a tall 2D canvas, uploaded as
//     texture, then scrolled by animating the UV offset
//   - Edge fade so lines vanish into darkness at the top
//
// Architecture:
//   - Own WebGL2 programs (starfield + crawl)
//   - Own tilted-quad geometry for the crawl
//   - Self-contained: builds programs, geometry, texture, UI panel
//   - Render hook fires after main scene render, clears depth, draws
//     starfield + crawl on top of the empty isolation:"exclusive" stage

const CHAPTERS = [
    {
        id: "foundations",
        title: "CHAPTER I",
        subtitle: "FOUNDATIONS",
        lines: [
            "Long ago, in a spreadsheet far, far away...",
            "",
            "A self-taught developer built an OpenGL engine in",
            "Microsoft Excel. Not a wrapper. Not a port.",
            "An actual engine, in VBA, calling opengl32.dll",
            "directly through Declare statements and the Win32 API.",
            "",
            "Then, to prove the architecture was renderer-agnostic,",
            "they built a second one in WebGL2 — thirteen thousand",
            "lines of vanilla JavaScript, no Three.js, no Babylon,",
            "no engine frameworks of any kind.",
            "",
            "Then they wrote a Node.js bridge so the two engines",
            "could talk to each other across runtimes.",
            "",
            "Multi-pass rendering with frustum culling.",
            "Async chunk meshing across a Web Worker pool.",
            "Cascaded shadow mapping. Bloom. SSAO.",
            "Hand-rolled matrix math. Hand-rolled BVH.",
            "Hand-rolled scene graph with stable node indices.",
            "",
            "A Git-integrated VBA sync tool so the macros could be",
            "version-controlled like real code.",
            "",
            "Cross-runtime asset serialization. A scene built in",
            "Excel can play in the browser. A scene built in the",
            "browser can play in Excel.",
            "",
            "This is only Chapter One.",
        ],
    },
    {
        id: "voxel_world",
        title: "CHAPTER II",
        subtitle: "THE LIVING WORLD",
        lines: [
            "The engines came alive.",
            "",
            "Infinite chunked voxel terrain spawned around the",
            "player. Mountains, jungle, tundra, snow caps,",
            "volcanoes, oceans — biomes blended at their borders.",
            "",
            "Then the weather came.",
            "Rain. Snow. Blizzards that whited out the sky.",
            "Thunderstorms whose strikes scorched the ground to ash.",
            "Tornadoes, waterspouts, whirlpools, cyclones.",
            "",
            "Water learned to flow. Rivers carved channels.",
            "Springs fed deltas. Snowmelt built watersheds.",
            "Floods rose, debris floated, currents drifted.",
            "Lahars rushed downhill from volcanic flanks.",
            "Mudslides failed wet slopes that dry slopes held.",
            "",
            "Fire spread through grass, leaving ash and ember.",
            "Water strips stopped its advance.",
            "Avalanches cascaded into stable cones.",
            "",
            "Day and night cycles. Real-world weather sync via",
            "Open-Meteo — your engine's sky mirrored your own.",
            "",
            "Then the KAIJU rose. Lasers, plasma, hell-magic,",
            "ice rays, flamethrowers — each kind with its signature",
            "ranged attack. Tree-hurling cinematics. Civ retaliation.",
            "",
            "Civilizations built megastructures.",
            "Civilizations advanced through tech ages.",
            "Civilizations fought back.",
            "",
            "Underwater caustics shimmered. Buoyancy bobbed",
            "floating debris. The phone camera streamed live",
            "onto a wall of voxels in-engine.",
            "",
            "The world was alive.",
        ],
    },
    {
        id: "demos",
        title: "CHAPTER III",
        subtitle: "A THOUSAND DEMOS",
        lines: [
            "The engines didn't ship one demo.",
            "",
            "They shipped a Centipede chain that wove through",
            "voxel pillars. A Lunar Lander where descent meant",
            "burning fuel against real gravity. Asteroids in 3D.",
            "Missile Command, projected into the third dimension.",
            "",
            "Conway's Life rendered as living voxel cubes.",
            "Boids flocking under steering rules.",
            "The Lorenz attractor traced through space.",
            "",
            "An FPS dungeon shooter generated by AI on demand.",
            "A skeletal animation rig test. An animated GLB",
            "robot. A Minecraft / LEGO build viewer.",
            "",
            "A Voice Lab where speech drove engine commands.",
            "Say 'make it rain' — and it rained.",
            "",
            "A Neural Radiance Cache: a three-eight-eight-three MLP",
            "ran inside a fragment shader. Live SGD training.",
            "Weights lived in a data texture, inferred per-pixel,",
            "every single frame.",
            "",
            "A Flow Matching sampler interpolated noise into",
            "procedural targets across a twenty-four cubed grid.",
            "",
            "O-Voxel mesh viewer. Pixal3D mesh viewer.",
            "Molecular field viewer for .mol and .pdb files.",
            "Medical tomography viewer for .mto volumes.",
            "Fluid field viewer for .wnd snapshots.",
            "",
            "And now — a resume, set on fire, in 3D.",
            "And this. A crawl, in the engine, about the engine.",
            "",
            "The demos kept coming.",
        ],
    },
    {
        id: "ai",
        title: "CHAPTER IV",
        subtitle: "MACHINE COLLABORATORS",
        lines: [
            "A GTX 1070 became a collaborator.",
            "",
            "ComfyUI ran locally — Trellis, Hunyuan3D, Hitem3D,",
            "TripoSR. Image generation. Mesh generation.",
            "Texture generation. All on eight gigabytes of VRAM.",
            "",
            "Ollama ran local LLMs. Llama3 for narrative.",
            "Llama3.2-vision for image understanding.",
            "Gemini Vision via API for live commentary.",
            "",
            "Then the engine reached beyond the desk.",
            "Kaggle notebooks submitted from inside the engine.",
            "GLBs pulled back automatically when ready.",
            "",
            "Ten image-to-3D templates registered in the bridge:",
            "Hunyuan3D, Trellis2, Direct3D-S2, TripoSR, TripoSG,",
            "InstantMesh, Stable-Fast-3D, LGM.",
            "And RigAnything for auto-rigging arbitrary meshes",
            "into animation-ready skinned characters.",
            "",
            "The Asset Acquisition Service: a five-rung fallback",
            "ladder. OBJ → texture → Trellis → Hitem3D → Kaggle.",
            "When one rung failed, the next caught.",
            "",
            "Voice into AI into engine command. The cycle closed.",
            "",
            "An entire install panel — sixty-three entries —",
            "managed the local AI environment. Install. Verify.",
            "Now also: uninstall, with derived commands.",
            "",
            "The engine learned. The engine asked for help.",
            "The engine answered.",
        ],
    },
    {
        id: "devices",
        title: "CHAPTER V",
        subtitle: "DEVICES AND BRIDGES",
        lines: [
            "The engine reached into the room.",
            "",
            "A phone connected via QR code. Twelve tabs of",
            "controls. An analog joystick that flew the camera.",
            "A build palette. A spawn menu. A map view.",
            "",
            "Twelve phones at once. Each assigned a role:",
            "Commander piloted the camera. Builder placed blocks.",
            "Observer watched without fighting for control.",
            "",
            "Watch cast streamed the engine's view to the phone.",
            "Screen wall streamed the phone's camera back in.",
            "Voice commands worked from either side.",
            "",
            "Home Assistant connected. Motion sensors triggered",
            "in-engine events. Door opens — kaiju roars.",
            "OpenRGB peripherals lit up to match game state.",
            "Solar panels' generation became in-engine sunlight.",
            "",
            "Tasker bridged Android automation.",
            "MQTT routed events across the home network.",
            "Bonjour discovery found the bridge automatically.",
            "",
            "The KPop Listener was its own creature —",
            "a system that responded to music streams in real time.",
            "",
            "A VBA Transmitter pushed scenes from Excel to the",
            "browser without a manual export step.",
            "",
            "Hardware was no longer an audience.",
            "Hardware was a player.",
        ],
    },
    {
        id: "tooling",
        title: "CHAPTER VI",
        subtitle: "THE ENGINE WATCHING ITSELF",
        lines: [
            "Every system needed visibility.",
            "",
            "An install panel listed sixty-three components,",
            "each with verify probes, install commands, derived",
            "uninstall paths. Audit detected gaps automatically.",
            "",
            "A diagnostic dashboard checked one hundred features",
            "across the engine in real time. Each row a button.",
            "Each button a test of something specific that mattered.",
            "",
            "A live performance HUD profiled every render pass.",
            "Frustum culling stats. Batch counts. Draw call counts.",
            "Mesh post-processing latency. Worker pool occupancy.",
            "",
            "An asset gallery enumerated every GLB the engine knew.",
            "A Kaggle info panel tracked every notebook submitted.",
            "A listener menu surfaced KPop Listener state.",
            "",
            "The Neural Radiance Cache trained itself on demand.",
            "The Flow Matching sampler sampled live.",
            "The Voxel World streamed its own chunks.",
            "",
            "Tests grew. One thousand two hundred and twenty-four.",
            "Then more.",
            "",
            "And this — this saga, here, now, listing every",
            "feature of the engine — is rendered IN the engine.",
            "The engine showing off the engine.",
            "The engine watching itself.",
            "",
            "Built by Keith Swerling.",
            "From Excel. In RI. On a 1070.",
            "",
            "May the engine be with you.",
        ],
    },
];

// ----------------------------------------------------------------------
// SHADERS
// ----------------------------------------------------------------------

// Crawl: textured tilted plane with vertex-based fade toward the top
const CRAWL_VS = `#version 300 es
precision highp float;

in vec2 a_pos;          // -1..1 horizontal, 0..1 vertical (0 = bottom of quad)
in vec2 a_uvBase;       // u: 0..1 across, v: 0..1 along the quad (0 = bottom)

uniform mat4 u_proj;
uniform float u_scrollOffset;  // moves the texture sample window upward through the texture
uniform float u_visibleSpan;   // how much of the texture maps to the visible quad height
uniform float u_tiltAngle;     // radians, X-axis tilt (top recedes)
uniform float u_quadHeight;    // world-space height of the quad
uniform float u_quadWidth;     // world-space width of the quad

out vec2 v_uv;
out float v_quadV;             // 0 at bottom of quad, 1 at top

void main() {
    // Quad sits in front of camera (camera at origin looking down -Z).
    // Bottom of quad is at y = -quadHeight/2, top at +quadHeight/2 before tilt.
    // Tilt: rotate around X axis so top recedes (negative Z) and rises.
    float halfH = u_quadHeight * 0.5;
    float halfW = u_quadWidth  * 0.5;
    vec3 pos;
    pos.x = a_pos.x * halfW;
    // a_pos.y is 0..1; map to -halfH..+halfH then rotate around X
    float yLocal = (a_pos.y - 0.5) * u_quadHeight;
    float c = cos(u_tiltAngle);
    float s = sin(u_tiltAngle);
    // rotation: y' = y*c - z*s, z' = y*s + z*c  (z=0 initially)
    pos.y = yLocal * c;
    pos.z = yLocal * s;
    // Shift down so the bottom of the quad sits at the viewer's eye level
    pos.y -= halfH * c * 0.4;
    pos.z -= 2.0;   // push slightly into the scene

    v_uv = vec2(a_uvBase.x, u_scrollOffset - u_visibleSpan * a_uvBase.y);
    v_quadV = a_uvBase.y;
    gl_Position = u_proj * vec4(pos, 1.0);
}
`;

const CRAWL_FS = `#version 300 es
precision highp float;

in vec2 v_uv;
in float v_quadV;     // 0 bottom, 1 top of quad

uniform sampler2D u_tex;

out vec4 fragColor;

void main() {
    // Reject samples outside the texture (above the title or below the end)
    if (v_uv.y < 0.0 || v_uv.y > 1.0) discard;

    vec4 c = texture(u_tex, v_uv);
    // Fade out as the quad recedes — top of quad goes black
    float fade = smoothstep(1.0, 0.45, v_quadV);
    fragColor = vec4(c.rgb * fade, 1.0);
}
`;

// Starfield: gl.POINTS with size variance + per-frame twinkle
const STAR_VS = `#version 300 es
precision highp float;

in vec3 a_pos;        // world position
in float a_size;      // base pixel size
in float a_phase;     // per-star twinkle phase offset

uniform mat4 u_proj;
uniform float u_time;
uniform float u_camRot;   // slow Z rotation of the whole field

out float v_alpha;

void main() {
    // Rotate the star around Z by u_camRot for a slow drift effect
    float c = cos(u_camRot), s = sin(u_camRot);
    vec3 p = vec3(a_pos.x * c - a_pos.y * s,
                  a_pos.x * s + a_pos.y * c,
                  a_pos.z);
    gl_Position = u_proj * vec4(p, 1.0);
    // Twinkle: sine wave per star
    float tw = 0.55 + 0.45 * sin(u_time * 1.6 + a_phase);
    v_alpha = tw;
    gl_PointSize = a_size * (0.7 + 0.5 * tw);
}
`;

const STAR_FS = `#version 300 es
precision highp float;

in float v_alpha;
out vec4 fragColor;

void main() {
    // Round-ish point with soft falloff
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = length(d);
    if (r > 0.5) discard;
    float a = (1.0 - r * 2.0);
    a = a * a;
    fragColor = vec4(vec3(1.0, 0.97, 0.85) * a * v_alpha, a * v_alpha);
}
`;

// ----------------------------------------------------------------------

export class EngineSagaDemo {
    constructor({ gl, canvas, world, camera }) {
        this.gl = gl;
        this.canvas = canvas;
        this.world = world;
        this.camera = camera;
        this.startTime = performance.now() / 1000;
        this.chapterIdx = this._pickNextChapter();
        // Round 172 / v667 — user-tunable saga UX state
        this.fontScale  = 0.72;     // smaller default; +/- buttons adjust
        this.speedMul   = 1.0;      // 1.0 = default; +/- buttons adjust
        this.scrubOffset = 0;       // seconds, manipulated by click-drag scrub
        this._lastProgress = null;  // remember for texture rebuilds
        this._dragState = null;     // {y0, scrub0} during click-drag scrub
        this._buildCrawlProgram();
        this._buildStarProgram();
        this._buildCrawlGeometry();
        this._buildStarfield();
        this._buildCrawlTexture();
        this._buildPanel();
        this._installScrubHandlers();
    }

    _pickNextChapter() {
        // Read the last-shown chapter index from localStorage; advance to the next one.
        let last = -1;
        try { last = parseInt(localStorage.getItem("engineSaga.lastChapter") || "-1", 10); } catch {}
        if (!Number.isFinite(last) || last < -1 || last >= CHAPTERS.length) last = -1;
        const next = (last + 1) % CHAPTERS.length;
        try { localStorage.setItem("engineSaga.lastChapter", String(next)); } catch {}
        console.log(`[engineSaga] auto-picked chapter ${next}: ${CHAPTERS[next].subtitle}`);
        return next;
    }

    _compile(type, src, label) {
        const gl = this.gl;
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(sh);
            gl.deleteShader(sh);
            throw new Error("[engineSaga] " + label + " compile failed: " + log);
        }
        return sh;
    }

    _link(vs, fs, label) {
        const gl = this.gl;
        const prog = gl.createProgram();
        gl.attachShader(prog, vs); gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            throw new Error("[engineSaga] " + label + " link failed: " + gl.getProgramInfoLog(prog));
        }
        return prog;
    }

    _buildCrawlProgram() {
        const gl = this.gl;
        const vs = this._compile(gl.VERTEX_SHADER,   CRAWL_VS, "crawl-vs");
        const fs = this._compile(gl.FRAGMENT_SHADER, CRAWL_FS, "crawl-fs");
        this.crawlProg = this._link(vs, fs, "crawl");
        this.crawlU = {
            proj:          gl.getUniformLocation(this.crawlProg, "u_proj"),
            scrollOffset:  gl.getUniformLocation(this.crawlProg, "u_scrollOffset"),
            visibleSpan:   gl.getUniformLocation(this.crawlProg, "u_visibleSpan"),
            tiltAngle:     gl.getUniformLocation(this.crawlProg, "u_tiltAngle"),
            quadHeight:    gl.getUniformLocation(this.crawlProg, "u_quadHeight"),
            quadWidth:     gl.getUniformLocation(this.crawlProg, "u_quadWidth"),
            tex:           gl.getUniformLocation(this.crawlProg, "u_tex"),
        };
        this.crawlA = {
            pos:    gl.getAttribLocation(this.crawlProg, "a_pos"),
            uvBase: gl.getAttribLocation(this.crawlProg, "a_uvBase"),
        };
    }

    _buildStarProgram() {
        const gl = this.gl;
        const vs = this._compile(gl.VERTEX_SHADER,   STAR_VS, "star-vs");
        const fs = this._compile(gl.FRAGMENT_SHADER, STAR_FS, "star-fs");
        this.starProg = this._link(vs, fs, "star");
        this.starU = {
            proj:   gl.getUniformLocation(this.starProg, "u_proj"),
            time:   gl.getUniformLocation(this.starProg, "u_time"),
            camRot: gl.getUniformLocation(this.starProg, "u_camRot"),
        };
        this.starA = {
            pos:   gl.getAttribLocation(this.starProg, "a_pos"),
            size:  gl.getAttribLocation(this.starProg, "a_size"),
            phase: gl.getAttribLocation(this.starProg, "a_phase"),
        };
    }

    _buildCrawlGeometry() {
        const gl = this.gl;
        // 1x40 tessellated tall strip — gives the fade a smooth gradient
        const NX = 1, NY = 40;
        const positions = [];
        const uvs = [];
        for (let j = 0; j <= NY; j++) {
            for (let i = 0; i <= NX; i++) {
                const u = i / NX;
                const v = j / NY;
                positions.push(u * 2 - 1, v);   // x in -1..1, y in 0..1 (vertex shader maps to quad height)
                uvs.push(u, v);
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
        this.crawlNumIndices = indices.length;

        this.crawlVao = gl.createVertexArray();
        gl.bindVertexArray(this.crawlVao);

        this.crawlPosBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.crawlPosBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this.crawlA.pos);
        gl.vertexAttribPointer(this.crawlA.pos, 2, gl.FLOAT, false, 0, 0);

        this.crawlUvBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.crawlUvBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this.crawlA.uvBase);
        gl.vertexAttribPointer(this.crawlA.uvBase, 2, gl.FLOAT, false, 0, 0);

        this.crawlIdxBuf = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.crawlIdxBuf);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

        gl.bindVertexArray(null);
    }

    _buildStarfield() {
        const gl = this.gl;
        const N = 1200;
        const positions = new Float32Array(N * 3);
        const sizes = new Float32Array(N);
        const phases = new Float32Array(N);
        for (let i = 0; i < N; i++) {
            // Distribute over a wide box behind the crawl
            positions[i * 3 + 0] = (Math.random() - 0.5) * 20;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
            positions[i * 3 + 2] = -10 - Math.random() * 30;
            // Most stars small, a few big — power distribution
            const r = Math.random();
            sizes[i] = 0.6 + 4.0 * Math.pow(r, 4);
            phases[i] = Math.random() * Math.PI * 2;
        }
        this.starCount = N;

        this.starVao = gl.createVertexArray();
        gl.bindVertexArray(this.starVao);

        this.starPosBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.starPosBuf);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this.starA.pos);
        gl.vertexAttribPointer(this.starA.pos, 3, gl.FLOAT, false, 0, 0);

        this.starSizeBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.starSizeBuf);
        gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this.starA.size);
        gl.vertexAttribPointer(this.starA.size, 1, gl.FLOAT, false, 0, 0);

        this.starPhaseBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.starPhaseBuf);
        gl.bufferData(gl.ARRAY_BUFFER, phases, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this.starA.phase);
        gl.vertexAttribPointer(this.starA.phase, 1, gl.FLOAT, false, 0, 0);

        gl.bindVertexArray(null);
    }

    _buildCrawlTexture() {
        const gl = this.gl;
        const ch = CHAPTERS[this.chapterIdx];

        // Round 172 / v667 — user-tunable font scale (smaller default).
        // Initialized in constructor; survives chapter switches. The +/-
        // font buttons in the panel adjust this and call _buildCrawlTexture
        // again to repaint the texture.
        const fs = this.fontScale ?? 0.72;
        const titleSize = Math.round(56 * fs);
        const subSize   = Math.round(84 * fs);
        const bodySize  = Math.round(46 * fs);
        const lineHeight = Math.round(64 * fs);

        // Render to a tall canvas
        const W = 1024;
        // Height scales with font size since lines take less vertical room
        const lineCount = ch.lines.length;
        const H = Math.min(8192, Math.round(600 * fs) + lineCount * Math.round(70 * fs) + 300);
        const cnv = document.createElement("canvas");
        cnv.width = W; cnv.height = H;
        const ctx = cnv.getContext("2d");

        // Black background (technically transparent works too, but the demo
        // renders against a black-cleared scene)
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, W, H);

        // Lucasfilm Yellow
        const YELLOW = "#FFE81F";

        // Title block — large centered "CHAPTER N" then bigger "SUBTITLE"
        let y = Math.round(140 * fs);
        ctx.fillStyle = YELLOW;
        ctx.textAlign = "center";
        ctx.font = `bold ${titleSize}px Georgia, "Times New Roman", serif`;
        ctx.fillText(ch.title, W / 2, y);
        y += Math.round(100 * fs);
        ctx.font = `bold ${subSize}px Georgia, "Times New Roman", serif`;
        ctx.fillText(ch.subtitle, W / 2, y);
        y += Math.round(180 * fs);

        // Body: justified-ish wrapped paragraphs
        const margin = 80;
        const maxWidth = W - margin * 2;
        ctx.font = `${bodySize}px Georgia, "Times New Roman", serif`;
        ctx.textAlign = "center";
        for (const para of ch.lines) {
            if (para === "") {
                y += Math.round(36 * fs);     // paragraph break
                continue;
            }
            // Word-wrap each paragraph line so the text fits
            const words = para.split(" ");
            let line = "";
            const wrapped = [];
            for (const w of words) {
                const test = line ? line + " " + w : w;
                if (ctx.measureText(test).width > maxWidth && line) {
                    wrapped.push(line);
                    line = w;
                } else {
                    line = test;
                }
            }
            if (line) wrapped.push(line);
            for (const ln of wrapped) {
                ctx.fillText(ln, W / 2, y);
                y += lineHeight;
            }
        }
        this._textHeight = y + 200;

        // Upload as texture
        if (this.crawlTex) gl.deleteTexture(this.crawlTex);
        this.crawlTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.crawlTex);
        // Canvas y=0 is the top; we want v=0 to ALSO be the top (so the title is at v=0).
        // UNPACK_FLIP_Y_WEBGL=false keeps that mapping.
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cnv);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        // Scroll timing — longer chapters scroll longer. v667 bumps the
        // base duration multiplier so the default feels noticeably slower.
        this.crawlDuration = Math.max(60, lineCount * 2.4);
        // visibleSpan: fraction of the texture height visible at any moment.
        // Smaller = more text visible per moment (everything looks closer).
        this.visibleSpan = 0.35;
        // v667 — keep effective elapsed time after texture rebuild so a font
        // size change mid-crawl doesn't snap back to the title.
        if (this._lastProgress != null) {
            const t = performance.now() / 1000;
            this.startTime = t - this._lastProgress * this.crawlDuration / (this.speedMul ?? 1);
        }
        console.log(`[engineSaga] chapter ${this.chapterIdx} (${ch.subtitle}) · ${H}px texture · ~${this.crawlDuration|0}s crawl · fontScale ${fs.toFixed(2)}`);
    }

    _setActiveChapter(idx) {
        this.chapterIdx = idx;
        try { localStorage.setItem("engineSaga.lastChapter", String(idx)); } catch {}
        this.startTime = performance.now() / 1000;
        this._buildCrawlTexture();
        this._refreshChapterBtns();
    }

    _buildPanel() {
        const root = document.createElement("div");
        root.id = "engineSagaPanel";
        root.style.cssText = `
            position: fixed; top: 80px; left: 14px; z-index: 9000;
            background: rgba(8, 6, 14, 0.94); border: 1px solid #ffe81f; border-radius: 6px;
            padding: 10px 12px; color: #ffe81f; font: 11px ui-monospace, Menlo, monospace;
            min-width: 250px; box-shadow: 0 6px 24px rgba(0,0,0,0.8);
        `;
        let chapterBtns = "";
        CHAPTERS.forEach((c, i) => {
            chapterBtns += `<button data-idx="${i}" class="engineSagaBtn" style="display:block; width:100%; margin:3px 0; padding:5px 7px; background:#1a0e2a; color:#ffe81f; border:1px solid #553; border-radius:3px; cursor:pointer; font:11px ui-monospace,Menlo,monospace; text-align:left;">${c.title} — ${c.subtitle}</button>`;
        });
        // v667 — tunable controls. Tiny +/- pairs with a readout in between.
        // Compact so the panel doesn't grow much. Scrub instructions inline.
        const tunables = `
            <div style="margin-top:8px; padding-top:6px; border-top:1px solid #443; font-size:10px; color:#cca;">
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                    <span style="flex:0 0 50px;">SPEED</span>
                    <button data-act="speed-" class="engineSagaCtl" style="width:24px; padding:2px; background:#1a0e2a; color:#ffe81f; border:1px solid #553; border-radius:3px; cursor:pointer; font:bold 11px ui-monospace,Menlo,monospace;">−</button>
                    <span id="engineSagaSpeedR" style="flex:1; text-align:center;">1.00×</span>
                    <button data-act="speed+" class="engineSagaCtl" style="width:24px; padding:2px; background:#1a0e2a; color:#ffe81f; border:1px solid #553; border-radius:3px; cursor:pointer; font:bold 11px ui-monospace,Menlo,monospace;">+</button>
                </div>
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                    <span style="flex:0 0 50px;">FONT</span>
                    <button data-act="font-" class="engineSagaCtl" style="width:24px; padding:2px; background:#1a0e2a; color:#ffe81f; border:1px solid #553; border-radius:3px; cursor:pointer; font:bold 11px ui-monospace,Menlo,monospace;">−</button>
                    <span id="engineSagaFontR" style="flex:1; text-align:center;">0.72×</span>
                    <button data-act="font+" class="engineSagaCtl" style="width:24px; padding:2px; background:#1a0e2a; color:#ffe81f; border:1px solid #553; border-radius:3px; cursor:pointer; font:bold 11px ui-monospace,Menlo,monospace;">+</button>
                </div>
                <div style="font-size:9px; color:#998; margin-top:4px; line-height:1.4;">
                    Click+drag on the crawl: ↑ rewind · ↓ fast-forward
                </div>
            </div>
        `;
        root.innerHTML = `
            <div style="font-weight:bold; margin-bottom:6px; letter-spacing:0.08em;">⭐ ENGINE: A SAGA</div>
            <div style="color:#aa9; font-size:10px; margin-bottom:8px;">A new chapter opens each time you start this demo. Or pick one:</div>
            <div id="engineSagaBtns"></div>
            ${tunables}
            <div style="margin-top:8px; padding-top:6px; border-top:1px solid #443; display:flex; gap:6px;">
                <button id="engineSagaRestart" style="flex:1; padding:5px 7px; background:#3a2a00; color:#ffe81f; border:1px solid #ffe81f; border-radius:3px; cursor:pointer; font:bold 11px ui-monospace,Menlo,monospace;">↻ Restart this chapter</button>
            </div>
            <div id="engineSagaStatus" style="margin-top:6px; color:#aa9; font-size:10px;"></div>
        `;
        document.body.appendChild(root);
        this._panel = root;
        const btnHost = root.querySelector("#engineSagaBtns");
        btnHost.innerHTML = chapterBtns;
        btnHost.addEventListener("click", (e) => {
            const b = e.target.closest("button.engineSagaBtn");
            if (!b) return;
            const idx = parseInt(b.dataset.idx, 10);
            if (Number.isFinite(idx)) this._setActiveChapter(idx);
        });
        root.querySelector("#engineSagaRestart").addEventListener("click", () => {
            this.startTime = performance.now() / 1000;
            this.scrubOffset = 0;
        });
        // v667 — tunable controls
        const speedR = root.querySelector("#engineSagaSpeedR");
        const fontR  = root.querySelector("#engineSagaFontR");
        const refresh = () => {
            if (speedR) speedR.textContent = `${this.speedMul.toFixed(2)}×`;
            if (fontR)  fontR.textContent  = `${this.fontScale.toFixed(2)}×`;
        };
        root.addEventListener("click", (e) => {
            const b = e.target.closest("button.engineSagaCtl");
            if (!b) return;
            switch (b.dataset.act) {
                case "speed-": this.speedMul = Math.max(0.25, this.speedMul - 0.25); break;
                case "speed+": this.speedMul = Math.min(4.0,  this.speedMul + 0.25); break;
                case "font-":  this.fontScale = Math.max(0.40, this.fontScale - 0.08); this._buildCrawlTexture(); break;
                case "font+":  this.fontScale = Math.min(1.50, this.fontScale + 0.08); this._buildCrawlTexture(); break;
            }
            refresh();
        });
        refresh();
        this._statusEl = root.querySelector("#engineSagaStatus");
        this._refreshChapterBtns();
    }

    _refreshChapterBtns() {
        if (!this._panel) return;
        for (const b of this._panel.querySelectorAll("button.engineSagaBtn")) {
            const idx = parseInt(b.dataset.idx, 10);
            const active = idx === this.chapterIdx;
            b.style.background    = active ? "#3a2a00" : "#1a0e2a";
            b.style.borderColor   = active ? "#ffe81f" : "#553";
            b.style.fontWeight    = active ? "bold" : "normal";
        }
        if (this._statusEl) this._statusEl.textContent = `now showing: ${CHAPTERS[this.chapterIdx].subtitle}`;
    }

    // Round 172 / v667 — click-drag on the saga canvas to scrub the crawl.
    // Drag UP rewinds (negative scrub), drag DOWN fast-forwards. Handlers
    // installed in capture phase + stopPropagation so the world camera
    // doesn't also rotate. Only active while the saga demo is the active
    // demo — we check `window._activeDemoId` at event time.
    _installScrubHandlers() {
        if (!this.canvas) return;
        const isActive = () => {
            // The saga's panel only exists while the demo is mounted, so
            // hide the scrub when the panel is gone — covers the case where
            // dispose() removes our handlers but the canvas keeps living.
            return this._panel && document.body.contains(this._panel);
        };
        const onDown = (e) => {
            if (!isActive() || e.button !== 0) return;
            this._dragState = {
                y0: e.clientY,
                scrub0: this.scrubOffset || 0,
            };
            try { this.canvas.setPointerCapture?.(e.pointerId); } catch {}
            e.stopPropagation();
        };
        const onMove = (e) => {
            if (!this._dragState || !isActive()) return;
            const dy = e.clientY - this._dragState.y0;
            // Map pixels to seconds. Positive dy (drag DOWN) = fast forward
            // (add to scrub). Negative dy (drag UP) = rewind. Pixel→second
            // ratio: ~120 px per 10 saga-seconds feels right at default speed.
            const SECONDS_PER_PIXEL = 10 / 120;
            this.scrubOffset = this._dragState.scrub0 + dy * SECONDS_PER_PIXEL;
            e.stopPropagation();
        };
        const onUp = (e) => {
            if (!this._dragState) return;
            this._dragState = null;
            try { this.canvas.releasePointerCapture?.(e.pointerId); } catch {}
            e.stopPropagation();
        };
        // Capture phase so we win over the world camera's bubbling handlers.
        this.canvas.addEventListener("pointerdown", onDown, true);
        this.canvas.addEventListener("pointermove", onMove, true);
        this.canvas.addEventListener("pointerup",   onUp,   true);
        this.canvas.addEventListener("pointercancel", onUp, true);
        this._scrubHandlers = { onDown, onMove, onUp };
    }

    _mat4Perspective(out, fovY, aspect, zNear, zFar) {
        const f = 1.0 / Math.tan(fovY / 2);
        const nf = 1.0 / (zNear - zFar);
        out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
        out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
        out[8] = 0; out[9] = 0; out[10] = (zFar + zNear) * nf; out[11] = -1;
        out[12] = 0; out[13] = 0; out[14] = 2 * zFar * zNear * nf; out[15] = 0;
    }

    render() {
        const gl = this.gl;
        if (!this.canvas) return;

        const w = this.canvas.width, h = this.canvas.height;
        const aspect = w / h;
        const t = performance.now() / 1000 - this.startTime;

        // Save state
        const prevProg = gl.getParameter(gl.CURRENT_PROGRAM);
        const prevDepth = gl.getParameter(gl.DEPTH_TEST);
        const prevBlend = gl.getParameter(gl.BLEND);
        const prevCull  = gl.getParameter(gl.CULL_FACE);

        // Clear to black (matches the void aesthetic; the engine's normal
        // sky was cleared above but we want pure black here)
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Common projection
        const proj = new Float32Array(16);
        this._mat4Perspective(proj, 55 * Math.PI / 180, aspect, 0.1, 100);

        // --- Starfield ---
        gl.useProgram(this.starProg);
        gl.bindVertexArray(this.starVao);
        gl.uniformMatrix4fv(this.starU.proj, false, proj);
        gl.uniform1f(this.starU.time, t);
        gl.uniform1f(this.starU.camRot, t * 0.02);   // very slow rotation
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);          // additive — stars glow
        gl.disable(gl.DEPTH_TEST);
        gl.drawArrays(gl.POINTS, 0, this.starCount);

        // --- Crawl ---
        gl.useProgram(this.crawlProg);
        gl.bindVertexArray(this.crawlVao);
        gl.uniformMatrix4fv(this.crawlU.proj, false, proj);

        // scrollOffset starts at the visibleSpan (so title is barely visible
        // at the bottom of the quad) and grows until past the end of the
        // texture plus span (so the last line clears the top).
        // At t=0:                 scrollOffset = visibleSpan      (title bottom, blank above)
        // At t=duration:          scrollOffset = 1 + visibleSpan  (everything has scrolled past)
        const span = this.visibleSpan;
        // Round 172 / v667 — effective time = real elapsed × speedMul + manual scrub
        const speedMul = this.speedMul ?? 1.0;
        const scrub    = this.scrubOffset ?? 0;
        const effT = Math.max(0, t * speedMul + scrub);
        const progress = Math.min(effT / this.crawlDuration, 1.0 + 0.05);
        this._lastProgress = progress;     // remembered for texture rebuilds (font scale changes)
        const scrollOffset = span + progress * 1.0;
        gl.uniform1f(this.crawlU.scrollOffset, scrollOffset);
        gl.uniform1f(this.crawlU.visibleSpan,  span);
        // v667 — bump tilt from 25° to 33° so text recedes more aggressively (looks further back)
        gl.uniform1f(this.crawlU.tiltAngle,    33 * Math.PI / 180);
        gl.uniform1f(this.crawlU.quadHeight,   8.0);
        gl.uniform1f(this.crawlU.quadWidth,    3.5);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.crawlTex);
        gl.uniform1i(this.crawlU.tex, 0);

        gl.disable(gl.BLEND);
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.drawElements(gl.TRIANGLES, this.crawlNumIndices, gl.UNSIGNED_SHORT, 0);

        // Auto-advance to next chapter when the current crawl has finished
        // (give 4s pause after the last line clears the top)
        if (progress >= 1.0 + 0.05 && t > this.crawlDuration + 4) {
            const next = (this.chapterIdx + 1) % CHAPTERS.length;
            this._setActiveChapter(next);
        }

        // Restore state
        gl.bindVertexArray(null);
        if (prevProg) gl.useProgram(prevProg);
        if (!prevDepth) gl.disable(gl.DEPTH_TEST);
        if (!prevBlend) gl.disable(gl.BLEND); else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        if (prevCull) gl.enable(gl.CULL_FACE);
    }

    dispose() {
        const gl = this.gl;
        try { gl.deleteVertexArray(this.crawlVao); } catch {}
        try { gl.deleteVertexArray(this.starVao); } catch {}
        try { gl.deleteBuffer(this.crawlPosBuf); } catch {}
        try { gl.deleteBuffer(this.crawlUvBuf); } catch {}
        try { gl.deleteBuffer(this.crawlIdxBuf); } catch {}
        try { gl.deleteBuffer(this.starPosBuf); } catch {}
        try { gl.deleteBuffer(this.starSizeBuf); } catch {}
        try { gl.deleteBuffer(this.starPhaseBuf); } catch {}
        try { gl.deleteTexture(this.crawlTex); } catch {}
        try { gl.deleteProgram(this.crawlProg); } catch {}
        try { gl.deleteProgram(this.starProg); } catch {}
        try { this._panel?.remove(); } catch {}
    }
}
