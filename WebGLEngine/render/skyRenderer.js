// FILE: render/skyRenderer.js
// VERSION: v1
//
// Procedural sky. Renders a fullscreen quad first each frame with
// depth test disabled, so subsequent terrain / entities overwrite
// the sky pixels they cover. The fragment shader reconstructs the
// world-space view ray from clip space using the inverse view-proj
// matrix and computes a horizon-to-zenith gradient + sun disc.
//
// Shared sun direction + horizon color with the terrain fog so the
// world feels atmospherically unified — terrain at distance fades
// into the same color the sky shows at the horizon.

const VS = `#version 300 es
layout(location=0) in vec2 aClipPos;
out vec2 vClipPos;

void main() {
    vClipPos = aClipPos;
    // z = 1.0 places this at the far plane. Depth-test is off
    // anyway, but writes-disabled mode means subsequent draws
    // need terrain at finite z to overwrite, which they will.
    gl_Position = vec4(aClipPos, 1.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vClipPos;
out vec4 outColor;

uniform mat4 uInvViewProj;
uniform vec3 uCamPos;
uniform vec3 uSunDir;       // normalized
uniform vec3 uHorizonColor; // warm
uniform vec3 uZenithColor;  // cool
uniform vec3 uSunColor;     // disc + glow tint

// Round 82 — moon, planet, stars, space-mode atmosphere swap.
uniform int   uMode;            // 0 = day (default), 1 = space
uniform vec3  uMoonDir;         // normalized
uniform vec3  uMoonColor;
uniform float uMoonSize;        // 0 = no moon; 1 ≈ sun-sized; 4 ≈ Doomsday Earth
uniform vec3  uPlanetDir;
uniform vec3  uPlanetColor;
uniform float uPlanetSize;      // 0 = no planet; ~30 = big body on horizon
uniform float uStarDensity;     // 0..1; 0 = none, 1 = field of stars
uniform float uStarBrightness;  // multiplier on rendered star pixels
uniform float uSunStrength;     // 1.0 in day; 0.5–0.8 in space (cold dim sun)
// v824 — time uniform for star twinkling + Milky Way procedural
uniform float uTime;            // seconds since boot (or any monotonic)
uniform float uMilkyWayStrength;// 0..1, 0 = none, 1 = visible Milky Way band

// Round 138 — AI-generated skybox overlay. When uSkyboxStrength > 0,
// blend the sampled skybox texture into the procedural sky color.
// Image is sampled using equirectangular projection from the view ray.
// strength=1 fully replaces sky, strength=0 leaves procedural untouched.
uniform sampler2D uSkybox;
uniform float uSkyboxStrength;
uniform float uSkyboxYaw;       // radians; rotates the skybox horizontally

// Cheap 3D hash → 0..1, deterministic per integer cell. Used for
// procedural starfield.
float starHash(vec3 p) {
    return fract(sin(dot(p, vec3(17.13, 91.71, 53.97))) * 43758.5453);
}

void main() {
    // Reconstruct world-space far-plane point from clip space, then
    // ray = (worldPoint - cam).normalize. This is the view direction
    // for this pixel.
    vec4 worldFar = uInvViewProj * vec4(vClipPos, 1.0, 1.0);
    vec3 worldP   = worldFar.xyz / worldFar.w;
    vec3 ray      = normalize(worldP - uCamPos);

    vec3 col;
    if (uMode == 1) {
        // ---- SPACE MODE ----
        // Base: nearly black, with a faint warm tint near the lower
        // hemisphere so a moon surface in front of the camera doesn't
        // look pasted on. Below-horizon stays murky gray.
        col = vec3(0.012, 0.014, 0.022);
        float below = smoothstep(0.0, -0.3, ray.y);
        col = mix(col, vec3(0.04, 0.04, 0.05), below);

        // Stars — quantize the ray direction into a fine grid, hash
        // each cell. Cells above threshold light up as star pixels.
        // ray.y > -0.05 keeps stars out of the ground hemisphere; we'd
        // see them through the ground otherwise.
        if (uStarDensity > 0.0 && ray.y > -0.05) {
            vec3 cellP = floor(ray * 240.0);
            float h = starHash(cellP);
            float threshold = 1.0 - uStarDensity * 0.005;
            if (h > threshold) {
                float bright = (h - threshold) / 0.005;
                // v824 base star palette: cool blue/white/warm yellow per cell
                vec3 starColCool = vec3(0.85, 0.90, 1.0);
                vec3 starColWarm = vec3(1.0,  0.95, 0.75);
                vec3 starColAmber = vec3(1.0, 0.78, 0.55);
                float palette = starHash(cellP + 7.3);
                vec3 baseCol = mix(starColCool, starColWarm, palette);
                // v825 — slow color drift. Each star has unique drift phase
                // + speed; sinusoidal blend toward amber over ~20s cycle.
                float driftPhase = starHash(cellP + 41.3) * 6.2831853;
                float driftSpeed = 0.05 + 0.15 * starHash(cellP + 53.7);   // 0.05–0.20 Hz
                float driftMix   = 0.5 + 0.5 * sin(uTime * driftSpeed + driftPhase);
                vec3 starCol = mix(baseCol, starColAmber, driftMix * 0.35);
                // v824 twinkle
                float twinklePhase = starHash(cellP + 13.7) * 6.2831853;
                float twinkleSpeed = 1.5 + starHash(cellP + 29.4) * 2.5;
                float twinkle = 0.55 + 0.45 * sin(uTime * twinkleSpeed + twinklePhase);
                col += starCol * bright * uStarBrightness * twinkle;
            }
            // v824 — Milky Way band. Procedural haze along a tilted celestial
            // axis (galactic plane roughly perpendicular to a fixed pole).
            // The band is brightest near the plane and falls off with distance.
            if (uMilkyWayStrength > 0.0) {
                // Galactic pole vector — fixed direction; the band lies
                // perpendicular. Roughly matches northern-hemisphere viewing.
                vec3 galacticPole = normalize(vec3(0.4, 0.65, 0.65));
                float bandDist = abs(dot(ray, galacticPole));   // 0 = on band, 1 = at pole
                float bandWidth = 0.18;     // gaussian-like falloff width
                float band = exp(-bandDist * bandDist / (bandWidth * bandWidth));
                // Add a coarse cell-noise modulation along the band so it's
                // not a uniform stripe — gives the cloudy texture.
                vec3 bandCell = floor(ray * 6.0);
                float bandHash = starHash(bandCell);
                float bandMod = 0.5 + 0.5 * bandHash;
                // Slight blue-violet tint, dim
                vec3 bandCol = vec3(0.45, 0.50, 0.70) * 0.18;
                col += bandCol * band * bandMod * uMilkyWayStrength * uStarBrightness;
            }
        }
    } else {
        // ---- DAY MODE (existing behavior) ----
        // Vertical gradient: ray.y near 0 = horizon, near 1 = zenith.
        // Smoothstep both ways for a soft band right at the horizon.
        float t   = clamp(ray.y * 1.5 + 0.05, 0.0, 1.0);
        col  = mix(uHorizonColor, uZenithColor, t);

        // Below-horizon: pull toward darker ground tone (avoids stark
        // black when looking down on a clear sky)
        float below = smoothstep(0.0, -0.3, ray.y);
        col = mix(col, uHorizonColor * 0.55, below);

        // Round 137 — time-of-day stars. When the sun is below the
        // horizon (uSunDir.y < 0), fade stars in. Same procedural
        // field as space mode, gated by "nightness" — peaks at solar
        // midnight, off at dawn/noon. ray.y > 0 keeps stars confined
        // to the sky hemisphere (otherwise they'd show through the
        // ground when looking down).
        float nightness = clamp(-uSunDir.y * 2.0, 0.0, 1.0);
        if (nightness > 0.02 && ray.y > 0.05) {
            vec3 cellP = floor(ray * 220.0);
            float h = starHash(cellP);
            float threshold = 1.0 - 0.003;
            if (h > threshold) {
                float bright = (h - threshold) / 0.003;
                vec3 starCol = mix(vec3(0.85, 0.90, 1.00),
                                   vec3(1.00, 0.95, 0.75),
                                   starHash(cellP + 7.3));
                col += starCol * bright * nightness * 0.85;
            }
        }
    }

    // Sun disc — sharp at high dot, soft glow falling off. Rendered
    // in both modes; uSunStrength dims it in space (cold distant sun).
    float sunDot = max(dot(ray, uSunDir), 0.0);
    float sunDisc = smoothstep(0.9985, 0.9995, sunDot);
    float sunGlow = smoothstep(0.96, 1.0, sunDot);
    col += uSunColor * sunDisc * uSunStrength;
    col += uSunColor * sunGlow * 0.35 * uSunStrength;

    // Moon disc + halo. uMoonSize=0 disables entirely.
    if (uMoonSize > 0.0) {
        float moonDot = max(dot(ray, uMoonDir), 0.0);
        float moonDiscOuter = 1.0 - uMoonSize * 0.0009;
        float moonDiscInner = 1.0 - uMoonSize * 0.0005;
        float moonDisc = smoothstep(moonDiscOuter, moonDiscInner, moonDot);
        float moonGlow = smoothstep(1.0 - uMoonSize * 0.020, 1.0, moonDot);
        col += uMoonColor * moonDisc;
        col += uMoonColor * moonGlow * 0.18;
    }

    // Planet body — bigger disc, softer halo. Use for an Earth-like
    // body hanging on the horizon. uPlanetSize=0 disables entirely.
    if (uPlanetSize > 0.0) {
        float planetDot = max(dot(ray, uPlanetDir), 0.0);
        float planetDiscOuter = 1.0 - uPlanetSize * 0.0018;
        float planetDiscInner = 1.0 - uPlanetSize * 0.0012;
        float planetDisc = smoothstep(planetDiscOuter, planetDiscInner, planetDot);
        float planetGlow = smoothstep(1.0 - uPlanetSize * 0.060, 1.0, planetDot);
        col += uPlanetColor * planetDisc;
        col += uPlanetColor * planetGlow * 0.12;
    }

    // Round 138 — equirectangular skybox blend. Sample the texture
    // using the view ray as a longitude/latitude pair. Skip entirely
    // when strength<=0 so the procedural sky path is unchanged when
    // no skybox is loaded.
    if (uSkyboxStrength > 0.001) {
        float u = atan(ray.x, ray.z) / 6.2831853 + 0.5 + uSkyboxYaw / 6.2831853;
        u = fract(u);
        float v = clamp(0.5 - asin(clamp(ray.y, -1.0, 1.0)) / 3.1415927, 0.0, 1.0);
        vec3 skyTex = texture(uSkybox, vec2(u, v)).rgb;
        col = mix(col, skyTex, uSkyboxStrength);
    }

    outColor = vec4(col, 1.0);
}`;

export class SkyRenderer {
    constructor(gl) {
        this.gl = gl;
        this._init();

        // Defaults — call setSunDir / setColors to override
        this.sunDir = this._normalize([0.4, 0.8, 0.45]);
        this.horizonColor = [0.78, 0.65, 0.55];   // warm dusty horizon
        this.zenithColor  = [0.28, 0.42, 0.72];   // muted day-blue
        this.sunColor     = [1.0,  0.92, 0.78];   // warm white sun

        // Round 82 — atmosphere swap state. Mode 0 = day (existing
        // behavior, no behavioral change). Mode 1 = space (black sky,
        // stars, optional moon and planet bodies).
        this.mode           = 0;
        this.sunStrength    = 1.0;
        this.moonDir        = this._normalize([-0.4, 0.6, -0.45]);
        this.moonColor      = [0.92, 0.92, 0.88];
        this.moonSize       = 0;     // 0 disables moon disc entirely
        this.planetDir      = this._normalize([0.0, 0.05, 1.0]);
        this.planetColor    = [0.4, 0.55, 0.85];
        this.planetSize     = 0;
        this.starDensity    = 0;
        this.starBrightness = 1.0;
        // v824 — star twinkling + Milky Way band
        this._time            = 0;          // increments each frame
        this.milkyWayStrength = 0;          // 0 = off, set by main loop at night

        // Round 138 — skybox state
        this.skyboxTex      = null;
        this.skyboxStrength = 0;
        this.skyboxYaw      = 0;

        // Scratch matrix for inverse view-proj
        this._invMVP = new Float32Array(16);
    }

    _init() {
        const gl = this.gl;
        const vsh = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vsh, VS); gl.compileShader(vsh);
        if (!gl.getShaderParameter(vsh, gl.COMPILE_STATUS)) {
            console.error("[SkyRenderer] VS:", gl.getShaderInfoLog(vsh));
        }
        const fsh = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fsh, FS); gl.compileShader(fsh);
        if (!gl.getShaderParameter(fsh, gl.COMPILE_STATUS)) {
            console.error("[SkyRenderer] FS:", gl.getShaderInfoLog(fsh));
        }
        this.program = gl.createProgram();
        gl.attachShader(this.program, vsh);
        gl.attachShader(this.program, fsh);
        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error("[SkyRenderer] link:", gl.getProgramInfoLog(this.program));
        }

        this.uInvViewProj   = gl.getUniformLocation(this.program, "uInvViewProj");
        this.uCamPos        = gl.getUniformLocation(this.program, "uCamPos");
        this.uSunDir        = gl.getUniformLocation(this.program, "uSunDir");
        this.uHorizonColor  = gl.getUniformLocation(this.program, "uHorizonColor");
        this.uZenithColor   = gl.getUniformLocation(this.program, "uZenithColor");
        this.uSunColor      = gl.getUniformLocation(this.program, "uSunColor");

        // Round 82 uniforms
        this.uMode            = gl.getUniformLocation(this.program, "uMode");
        this.uSunStrength     = gl.getUniformLocation(this.program, "uSunStrength");
        this.uMoonDir         = gl.getUniformLocation(this.program, "uMoonDir");
        this.uMoonColor       = gl.getUniformLocation(this.program, "uMoonColor");
        this.uMoonSize        = gl.getUniformLocation(this.program, "uMoonSize");
        this.uPlanetDir       = gl.getUniformLocation(this.program, "uPlanetDir");
        this.uPlanetColor     = gl.getUniformLocation(this.program, "uPlanetColor");
        this.uPlanetSize      = gl.getUniformLocation(this.program, "uPlanetSize");
        this.uStarDensity     = gl.getUniformLocation(this.program, "uStarDensity");
        this.uStarBrightness  = gl.getUniformLocation(this.program, "uStarBrightness");
        // v824
        this.uTime              = gl.getUniformLocation(this.program, "uTime");
        this.uMilkyWayStrength  = gl.getUniformLocation(this.program, "uMilkyWayStrength");

        // Round 138 — skybox uniforms
        this.uSkybox          = gl.getUniformLocation(this.program, "uSkybox");
        this.uSkyboxStrength  = gl.getUniformLocation(this.program, "uSkyboxStrength");
        this.uSkyboxYaw       = gl.getUniformLocation(this.program, "uSkyboxYaw");

        // Fullscreen tri (covers viewport with one triangle, no quad needed)
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        // Three vertices that span [-1..1] in both axes when clipped
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,
             3, -1,
            -1,  3,
        ]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
    }

    setSunDir(dir) {
        this.sunDir = this._normalize(dir);
    }

    setColors({ horizon, zenith, sun }) {
        if (horizon) this.horizonColor = horizon;
        if (zenith)  this.zenithColor  = zenith;
        if (sun)     this.sunColor     = sun;
    }

    // Round 82 — atmosphere swap. `mode` is "day" (default) or "space".
    // Calling this only flips the rendering mode flag; the moon, planet,
    // and star state are independent — set them via setMoon/setPlanet/setStars.
    setMode(mode) {
        this.mode = (mode === "space" || mode === 1) ? 1 : 0;
    }

    // Round 82 — moon body. Pass `size: 0` to hide. size ≈ 1 matches the
    // sun disc, size ≈ 4 makes a clearly-visible Earth-from-the-Moon body.
    setMoon({ dir, color, size }) {
        if (dir)   this.moonDir   = this._normalize(dir);
        if (color) this.moonColor = color;
        if (size != null) this.moonSize = size;
    }

    // Round 82 — planet body. Same shape as setMoon. Use for a bigger
    // body (Earth-on-horizon, gas giant) than the moon. Pass `size: 0`
    // to hide.
    setPlanet({ dir, color, size }) {
        if (dir)   this.planetDir   = this._normalize(dir);
        if (color) this.planetColor = color;
        if (size != null) this.planetSize = size;
    }

    // Round 82 — procedural stars. density ≈ 1.0 gives a rich field;
    // 0.3 gives sparse "city sky"; 0 disables. brightness is a final
    // multiplier on rendered pixels.
    setStars({ density, brightness, milkyWay }) {
        if (density    != null) this.starDensity    = density;
        if (brightness != null) this.starBrightness = brightness;
        if (milkyWay   != null) this.milkyWayStrength = Math.max(0, Math.min(1, milkyWay));
    }

    // Round 82 — global sun dimming for space (cold distant sun).
    setSunStrength(s) {
        this.sunStrength = s;
    }

    // Cheap accessor for terrain renderer to share fog/horizon color
    getHorizonColor() {
        return this.horizonColor;
    }
    getSunDir() {
        return this.sunDir;
    }

    render(camera) {
        const gl = this.gl;
        const mvp = camera.getViewProjMatrix?.() || camera.getMatrix?.();
        if (!mvp) return;
        if (!this._mat4Invert(this._invMVP, mvp)) return;

        // Sky renders LAST among opaque passes — at z=1 (far plane),
        // depth test LEQUAL lets sky pass only where terrain hasn't
        // written depth. Don't write depth (would block translucent
        // water that comes after).
        gl.useProgram(this.program);
        const cullWasEnabled = gl.isEnabled(gl.CULL_FACE);
        if (cullWasEnabled) gl.disable(gl.CULL_FACE);
        const oldDepthFunc = gl.getParameter(gl.DEPTH_FUNC);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(false);

        gl.uniformMatrix4fv(this.uInvViewProj, false, this._invMVP);
        gl.uniform3f(this.uCamPos, camera.position.x, camera.position.y, camera.position.z);
        gl.uniform3fv(this.uSunDir, this.sunDir);
        gl.uniform3fv(this.uHorizonColor, this.horizonColor);
        gl.uniform3fv(this.uZenithColor,  this.zenithColor);
        gl.uniform3fv(this.uSunColor,     this.sunColor);

        // Round 82 — mode + space-body uniforms
        gl.uniform1i(this.uMode,            this.mode | 0);
        gl.uniform1f(this.uSunStrength,     this.sunStrength);
        gl.uniform3fv(this.uMoonDir,        this.moonDir);
        gl.uniform3fv(this.uMoonColor,      this.moonColor);
        gl.uniform1f(this.uMoonSize,        this.moonSize);
        gl.uniform3fv(this.uPlanetDir,      this.planetDir);
        gl.uniform3fv(this.uPlanetColor,    this.planetColor);
        gl.uniform1f(this.uPlanetSize,      this.planetSize);
        gl.uniform1f(this.uStarDensity,     this.starDensity);
        gl.uniform1f(this.uStarBrightness,  this.starBrightness);
        // v824 — advance time + upload Milky Way strength
        this._time += 1 / 60;     // rough seconds; exact value isn't critical for twinkle
        gl.uniform1f(this.uTime, this._time);
        gl.uniform1f(this.uMilkyWayStrength, this.milkyWayStrength);

        // Round 138 — skybox texture binding. Always bind something to
        // u0 (texture unit 0) — if no skybox is loaded, bind a 1x1 dummy
        // so the sampler is valid; uSkyboxStrength=0 makes the sample
        // result unused anyway. Avoids the sampler-binding warning that
        // some drivers emit.
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.skyboxTex || this._dummyTex());
        gl.uniform1i(this.uSkybox, 0);
        gl.uniform1f(this.uSkyboxStrength, this.skyboxTex ? this.skyboxStrength : 0);
        gl.uniform1f(this.uSkyboxYaw, this.skyboxYaw);

        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);

        gl.depthMask(true);
        gl.depthFunc(oldDepthFunc);
        if (cullWasEnabled)  gl.enable(gl.CULL_FACE);
    }

    _dummyTex() {
        if (this._dummy) return this._dummy;
        const gl = this.gl;
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                      new Uint8Array([0, 0, 0, 255]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        this._dummy = t;
        return t;
    }

    // Round 138 — load an HTMLImageElement (or canvas/ImageBitmap) as
    // the equirectangular skybox texture. Pass null to clear.
    setSkyboxImage(image, opts = {}) {
        const gl = this.gl;
        if (image == null) {
            if (this.skyboxTex) gl.deleteTexture(this.skyboxTex);
            this.skyboxTex = null;
            this.skyboxStrength = 0;
            return;
        }
        if (this.skyboxTex) gl.deleteTexture(this.skyboxTex);
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.skyboxTex = t;
        this.skyboxStrength = opts.strength ?? 1.0;
        this.skyboxYaw = opts.yaw ?? 0;
    }

    setSkyboxStrength(s) { this.skyboxStrength = Math.max(0, Math.min(1, s)); }
    setSkyboxYaw(y)      { this.skyboxYaw = y; }

    _normalize(v) {
        const l = Math.hypot(v[0], v[1], v[2]) || 1;
        return [v[0] / l, v[1] / l, v[2] / l];
    }

    // Standard 4x4 cofactor matrix inverse. out and m are length-16
    // Float32Arrays / Arrays, column-major. Returns out on success,
    // null when det == 0.
    _mat4Invert(out, m) {
        const a00 = m[0],  a01 = m[1],  a02 = m[2],  a03 = m[3];
        const a10 = m[4],  a11 = m[5],  a12 = m[6],  a13 = m[7];
        const a20 = m[8],  a21 = m[9],  a22 = m[10], a23 = m[11];
        const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
        const b00 = a00 * a11 - a01 * a10;
        const b01 = a00 * a12 - a02 * a10;
        const b02 = a00 * a13 - a03 * a10;
        const b03 = a01 * a12 - a02 * a11;
        const b04 = a01 * a13 - a03 * a11;
        const b05 = a02 * a13 - a03 * a12;
        const b06 = a20 * a31 - a21 * a30;
        const b07 = a20 * a32 - a22 * a30;
        const b08 = a20 * a33 - a23 * a30;
        const b09 = a21 * a32 - a22 * a31;
        const b10 = a21 * a33 - a23 * a31;
        const b11 = a22 * a33 - a23 * a32;
        let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
        if (!det) return null;
        det = 1.0 / det;
        out[0]  = (a11 * b11 - a12 * b10 + a13 * b09) * det;
        out[1]  = (a02 * b10 - a01 * b11 - a03 * b09) * det;
        out[2]  = (a31 * b05 - a32 * b04 + a33 * b03) * det;
        out[3]  = (a22 * b04 - a21 * b05 - a23 * b03) * det;
        out[4]  = (a12 * b08 - a10 * b11 - a13 * b07) * det;
        out[5]  = (a00 * b11 - a02 * b08 + a03 * b07) * det;
        out[6]  = (a32 * b02 - a30 * b05 - a33 * b01) * det;
        out[7]  = (a20 * b05 - a22 * b02 + a23 * b01) * det;
        out[8]  = (a10 * b10 - a11 * b08 + a13 * b06) * det;
        out[9]  = (a01 * b08 - a00 * b10 - a03 * b06) * det;
        out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
        out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
        out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
        out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
        out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
        out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
        return out;
    }
}
