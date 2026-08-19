// fx/vorton/vortonNebula.js -- couples the verified vorton field (vorton.js) to the nebula (fx/nebula) so the gas
// actually swirls. The nebula domain-warps fbm in (u,v) space; we add the vortons' induced 2D swirl as a
// displacement on those coords, so the wisps rotate around drifting vortex cores instead of sitting still. A small
// set of vortons (NV) is cheap enough to evaluate per-pixel in the shader, and the CPU advances their positions each
// frame (stepVortons in the plane). SWIRL_GLSL / SWIRL_WGSL mirror swirlOffset(); vortonSwirlShadow() is checked
// bit-identical to the CPU so a shader-transcription bug can't ship.
"use strict";



const NV = 8;   // vortons the shader evaluates per pixel (uniform array)

// seed NV vortons in nebula uv-space with alternating spin, so they pair up and drift
function makeVortons(seed = 1) {
    let s = seed >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const out = []; for (let i = 0; i < NV; i++) out.push({ x: (rnd() * 2 - 1) * 1.4, y: (rnd() * 2 - 1) * 0.9, s: (i % 2 ? 1 : -1) * (0.5 + rnd() * 0.6) });
    return out;
}

// the swirl displacement at uv-point (u,v) from all vortons (exactly what the shader computes; same 2pi literal)
function swirlOffset(u, v, vortons, sigma) {
    const s2 = sigma * sigma; let vx = 0, vy = 0;
    for (let i = 0; i < vortons.length; i++) { const rx = u - vortons[i].x, ry = v - vortons[i].y, f = (vortons[i].s / 6.2831853) / (rx * rx + ry * ry + s2); vx += -ry * f; vy += rx * f; }
    return [vx, vy];
}

// JS shadow of the shader's per-uv swirl, standalone (no import) so it truly mirrors the GLSL/WGSL text
function vortonSwirlShadow(u, v, vortons, sigma) {
    const s2 = sigma * sigma; let vx = 0, vy = 0;
    for (let i = 0; i < vortons.length; i++) { const rx = u - vortons[i].x, ry = v - vortons[i].y, f = (vortons[i].s / 6.2831853) / (rx * rx + ry * ry + s2); vx += -ry * f; vy += rx * f; }
    return [vx, vy];
}

const SWIRL_GLSL = `
// requires: uniform vec3 uVortons[${NV}]; (x,y,strength)  uniform float uSig2;
vec2 vortonSwirl(vec2 p){ vec2 acc = vec2(0.0);
  for (int i=0;i<${NV};i++){ vec3 vt=uVortons[i]; vec2 r=p-vt.xy; float f=(vt.z/6.2831853)/(dot(r,r)+uSig2); acc += vec2(-r.y, r.x)*f; }
  return acc; }`;

const SWIRL_WGSL = `
// requires: vortons: array<vec3f, ${NV}> in the uniform block; sig2: f32
fn vortonSwirl(p: vec2f, vortons: ptr<function, array<vec3f, ${NV}>>, sig2: f32) -> vec2f {
  var acc = vec2f(0.0);
  for (var i:i32=0; i<${NV}; i=i+1){ let vt=(*vortons)[i]; let r=p-vt.xy; let f=(vt.z/6.2831853)/(dot(r,r)+sig2); acc = acc + vec2f(-r.y, r.x)*f; }
  return acc; }`;

// advance the 2D vortons: each drifts in the swirl the OTHERS induce at it (so pairs translate, clusters churn)
function step2D(vortons, dt, sigma) {
    const vel = vortons.map((vt) => swirlOffset(vt.x, vt.y, vortons.filter(o => o !== vt), sigma));
    for (let i = 0; i < vortons.length; i++) { vortons[i].x += vel[i][0] * dt; vortons[i].y += vel[i][1] * dt;
        if (vortons[i].x > 1.6) vortons[i].x -= 3.2; if (vortons[i].x < -1.6) vortons[i].x += 3.2; if (vortons[i].y > 1.1) vortons[i].y -= 2.2; if (vortons[i].y < -1.1) vortons[i].y += 2.2; }
}
// nebula colour with the vorton swirl folded into the domain: the gas rotates around the vortex cores
function nebulaSwirlColorAt(px, py, W, H, cam, time, vortons, sigma, gain, nebulaColorAt) {
    const u = px / H, v = py / H, off = swirlOffset(u * 1.6, v * 1.6, vortons, sigma);
    return nebulaColorAt(px + off[0] * gain * H, py + off[1] * gain * H, W, H, cam, time);
}
function renderNebulaSwirlCPU(W, H, cam, time, vortons, sigma, gain, nebulaColorAt, step = 4) {
    const buf = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
        const c = nebulaSwirlColorAt(x, y, W, H, cam, time, vortons, sigma, gain, nebulaColorAt);
        const r = Math.min(255, c[0] * 255), g = Math.min(255, c[1] * 255), b = Math.min(255, c[2] * 255);
        for (let dy = 0; dy < step && y + dy < H; dy++) for (let dx = 0; dx < step && x + dx < W; dx++) { const i = ((y + dy) * W + (x + dx)) * 4; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255; }
    }
    return buf;
}

export { NV, makeVortons, swirlOffset, vortonSwirlShadow, SWIRL_GLSL, SWIRL_WGSL, step2D, nebulaSwirlColorAt, renderNebulaSwirlCPU };
if (typeof module !== "undefined" && module.exports) module.exports = { NV, makeVortons, swirlOffset, vortonSwirlShadow, SWIRL_GLSL, SWIRL_WGSL, step2D, nebulaSwirlColorAt, renderNebulaSwirlCPU };
