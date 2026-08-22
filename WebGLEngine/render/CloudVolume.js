// render/CloudVolume.js — v1278
// Self-contained volumetric cloud layer (raymarched). Isolated on purpose: it owns
// its own WebGL2 program + fullscreen triangle, so a shader problem here can only
// affect the cloud layer, never the core terrain render. Off unless enabled.
//
// Approach: a fullscreen pass reconstructs a world-space ray per pixel from the
// inverse view-projection, raymarches an fbm density field inside an altitude slab,
// applies Beer's-law extinction + a few light-march steps toward the sun for
// self-shadowing/silver-lining, and composites over the scene. The fullscreen
// triangle is emitted at the far plane (depth ~1) with depth-test LEQUAL and depth
// write OFF, so already-drawn opaque terrain occludes clouds that sit behind it and
// clouds only appear where the sky shows.
//
// Render order (caller): sky -> opaque -> atmosphereSystem.render -> cloudVolume.render
// Tunable on the rig via setParams(); defaults are conservative for GTX 1070/1080.

const VS = `#version 300 es
// fullscreen triangle, emitted at the far plane so terrain depth occludes clouds
out vec2 vNdc;
void main(){
    vec2 p = vec2((gl_VertexID == 2) ? 3.0 : -1.0, (gl_VertexID == 1) ? 3.0 : -1.0);
    vNdc = p;
    gl_Position = vec4(p, 1.0, 1.0);   // z=1 (far), w=1
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vNdc;
out vec4 outColor;

uniform mat4  uInvViewProj;
uniform vec3  uCamPos;
uniform vec3  uSunDir;       // direction TO sun (normalized)
uniform vec3  uSunColor;
uniform vec3  uSkyTint;
uniform float uTime;
uniform vec4  uParams;       // x=coverage(0..1), y=density, z=windSpeed, w=stepCount
uniform vec2  uSlab;         // cloud layer altitude [low, high]

float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x){
    vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
    float n000=hash(i), n100=hash(i+vec3(1,0,0)), n010=hash(i+vec3(0,1,0)), n110=hash(i+vec3(1,1,0));
    float n001=hash(i+vec3(0,0,1)), n101=hash(i+vec3(1,0,1)), n011=hash(i+vec3(0,1,1)), n111=hash(i+vec3(1,1,1));
    return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
               mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
}
float fbm(vec3 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*vnoise(p); p=p*2.03+vec3(11.1,17.7,3.3); a*=0.5; } return v; }

// density at a world point inside the slab; 0 outside
float cloudDensity(vec3 p){
    float h = (p.y - uSlab.x) / max(1.0, uSlab.y - uSlab.x);
    if (h < 0.0 || h > 1.0) return 0.0;
    float edge = smoothstep(0.0, 0.18, h) * smoothstep(1.0, 0.7, h);   // soft top/bottom
    vec3 q = p * 0.0025 + vec3(uTime * uParams.z * 0.01, 0.0, uTime * uParams.z * 0.006);
    float base = fbm(q);
    float d = base - (1.0 - uParams.x);          // coverage threshold
    return max(0.0, d) * edge * uParams.y;
}

void main(){
    // reconstruct world ray from inverse view-proj
    vec4 nh = uInvViewProj * vec4(vNdc, -1.0, 1.0);
    vec4 fh = uInvViewProj * vec4(vNdc,  1.0, 1.0);
    vec3 np = nh.xyz / nh.w, fp = fh.xyz / fh.w;
    vec3 ro = uCamPos, rd = normalize(fp - np);
    if (abs(rd.y) < 1e-4) discard;

    // intersect the altitude slab
    float t0 = (uSlab.x - ro.y) / rd.y;
    float t1 = (uSlab.y - ro.y) / rd.y;
    float ta = min(t0, t1), tb = max(t0, t1);
    ta = max(ta, 0.0);
    if (tb <= ta) discard;
    tb = min(tb, ta + 1400.0);                    // cap march length

    int steps = int(clamp(uParams.w, 8.0, 48.0));
    float dt = (tb - ta) / float(steps);
    float t = ta + dt * (0.5 + 0.5 * fract(sin(dot(vNdc, vec2(12.9, 78.2))) * 43758.5));  // dithered start
    float transmittance = 1.0;
    vec3 scattered = vec3(0.0);

    for (int i = 0; i < 48; i++){
        if (i >= steps || transmittance < 0.02) break;
        vec3 pos = ro + rd * t;
        float dens = cloudDensity(pos);
        if (dens > 0.001){
            // light march toward the sun (4 short steps) for self-shadow
            float ls = 0.0; float lstep = 26.0;
            for (int j = 1; j <= 4; j++){ ls += cloudDensity(pos + uSunDir * (lstep * float(j))); }
            float sunT = exp(-ls * 0.9);
            float powder = 1.0 - exp(-dens * 2.0);     // dark-edge "powder" term
            vec3 col = mix(uSkyTint * 0.7, uSunColor, sunT) * (0.35 + 0.65 * powder);
            float a = 1.0 - exp(-dens * dt * 0.08);
            scattered += transmittance * a * col;
            transmittance *= (1.0 - a);
        }
        t += dt;
    }
    float alpha = clamp(1.0 - transmittance, 0.0, 1.0);
    if (alpha < 0.01) discard;
    outColor = vec4(scattered, alpha);
}`;

function mat4Invert(m){
    const o = new Float32Array(16);
    const a00=m[0],a01=m[1],a02=m[2],a03=m[3], a10=m[4],a11=m[5],a12=m[6],a13=m[7],
          a20=m[8],a21=m[9],a22=m[10],a23=m[11], a30=m[12],a31=m[13],a32=m[14],a33=m[15];
    const b00=a00*a11-a01*a10, b01=a00*a12-a02*a10, b02=a00*a13-a03*a10, b03=a01*a12-a02*a11,
          b04=a01*a13-a03*a11, b05=a02*a13-a03*a12, b06=a20*a31-a21*a30, b07=a20*a32-a22*a30,
          b08=a20*a33-a23*a30, b09=a21*a32-a22*a31, b10=a21*a33-a23*a31, b11=a22*a33-a23*a32;
    let det = b00*b11 - b01*b10 + b02*b09 + b03*b08 - b04*b07 + b05*b06;
    if (!det) return null;
    det = 1.0 / det;
    o[0]=(a11*b11-a12*b10+a13*b09)*det; o[1]=(a02*b10-a01*b11-a03*b09)*det;
    o[2]=(a31*b05-a32*b04+a33*b03)*det; o[3]=(a22*b04-a21*b05-a23*b03)*det;
    o[4]=(a12*b08-a10*b11-a13*b07)*det; o[5]=(a00*b11-a02*b08+a03*b07)*det;
    o[6]=(a32*b02-a30*b05-a33*b01)*det; o[7]=(a20*b05-a22*b02+a23*b01)*det;
    o[8]=(a10*b10-a11*b08+a13*b06)*det; o[9]=(a01*b08-a00*b10-a03*b06)*det;
    o[10]=(a30*b04-a31*b02+a33*b00)*det; o[11]=(a21*b02-a20*b04-a23*b00)*det;
    o[12]=(a11*b07-a10*b09-a12*b06)*det; o[13]=(a00*b09-a01*b07+a02*b06)*det;
    o[14]=(a31*b01-a30*b03-a32*b00)*det; o[15]=(a20*b03-a21*b01+a22*b00)*det;
    return o;
}

export class CloudVolume {
    constructor(gl){
        this.gl = gl;
        this.enabled = false;
        this.params = { coverage: 0.5, density: 1.0, wind: 1.0, steps: 24, low: 140, high: 300 };
        this.sunDir = [0.4, 0.8, 0.45];
        this.sunColor = [1.0, 0.96, 0.9];
        this.skyTint = [0.6, 0.72, 0.9];
        this._ok = false;
        try { this._build(gl); this._ok = true; }
        catch (e){ console.warn("[CloudVolume] init failed (disabled):", e && e.message); }
    }
    _compile(type, src){ const gl = this.gl, s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
    _build(gl){
        const p = gl.createProgram();
        gl.attachShader(p, this._compile(gl.VERTEX_SHADER, VS));
        gl.attachShader(p, this._compile(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        this.prog = p;
        this.vao = gl.createVertexArray();   // empty VAO; positions come from gl_VertexID
        this.u = {
            invVP: gl.getUniformLocation(p, "uInvViewProj"), camPos: gl.getUniformLocation(p, "uCamPos"),
            sunDir: gl.getUniformLocation(p, "uSunDir"), sunCol: gl.getUniformLocation(p, "uSunColor"),
            skyTint: gl.getUniformLocation(p, "uSkyTint"), time: gl.getUniformLocation(p, "uTime"),
            params: gl.getUniformLocation(p, "uParams"), slab: gl.getUniformLocation(p, "uSlab"),
        };
    }
    setParams(o){ Object.assign(this.params, o || {}); }
    setSun(dir, color){ if (dir) this.sunDir = dir; if (color) this.sunColor = color; }
    setSkyTint(c){ if (c) this.skyTint = c; }
    render(camera){
        if (!this._ok || !this.enabled) return;
        const gl = this.gl, vp = camera && (camera.viewProj || (camera.getViewProjMatrix && camera.getViewProjMatrix()));
        if (!vp) return;
        const inv = mat4Invert(vp); if (!inv) return;
        const cp = camera.position || { x: 0, y: 0, z: 0 };
        gl.useProgram(this.prog);
        gl.bindVertexArray(this.vao);
        const prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK);
        const prevBlend = gl.isEnabled(gl.BLEND);
        gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.uniformMatrix4fv(this.u.invVP, false, inv);
        gl.uniform3f(this.u.camPos, cp.x, cp.y, cp.z);
        gl.uniform3fv(this.u.sunDir, this.sunDir);
        gl.uniform3fv(this.u.sunCol, this.sunColor);
        gl.uniform3fv(this.u.skyTint, this.skyTint);
        gl.uniform1f(this.u.time, performance.now() * 0.001);
        gl.uniform4f(this.u.params, this.params.coverage, this.params.density, this.params.wind, this.params.steps);
        gl.uniform2f(this.u.slab, this.params.low, this.params.high);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.depthMask(prevDepthMask); gl.depthFunc(gl.LESS);
        if (!prevBlend) gl.disable(gl.BLEND);
        gl.bindVertexArray(null);
    }
}
