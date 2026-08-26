// fx/wormhole/wormholeNebula.js -- the merged wormhole+nebula shader: the Ellis geodesic decides which system each
// ray lands in, then a swirling nebula (vorton-warped) is sampled for that sky. Folding the full 5-octave nebula
// into the per-pixel geodesic loop would be enormous, so this uses a compact 3-octave nebula tuned for the backdrop,
// defined ONCE and mirrored into GLSL + WGSL. wormholeNebulaShadow() is a standalone JS mirror of the merged shader,
// checked bit-identical to renderWormholeNebulaCPU() so the GPU wormhole can't drift from the verified physics.
"use strict";

import { deflectAt } from "./wormhole.js";
import { swirlOffset } from "../vorton/vortonNebula.js";
// v4031 -- the ordered-dither snippets are IMPORTED, not restated. fx/dither.js owns the matrix and both
// shader bodies; this file only decides WHERE to apply them.
//
// *** OPT-IN, AND THE DEFAULT IS PROVEN UNCHANGED RATHER THAN ASSUMED. *** uDitherLevels defaults to 0.0
// (GLSL zero-initialises an unset uniform), which takes the branch that does nothing. MEASURED on real WebGL2
// (Chromium 141, SwiftShader), 128x128, this shader rendered three ways and compared byte for byte:
//     pre-wiring shader   vs  wired shader with uDitherLevels EXPLICITLY 0   ->  0 of 65536 bytes differ
//     pre-wiring shader   vs  wired shader with the uniform NEVER SET        ->  0 of 65536 bytes differ
// The second line is the one that matters: an EXISTING CALLER that has never heard of dithering gets exactly
// the pixels it got before. So the verified wormhole+nebula output is untouched and this adds a capability
// rather than changing a result -- which is the only basis on which a display-stage transform belongs in a
// shader whose output is under test.
import { DITHER_GLSL, DITHER_WGSL } from "../dither.js";

const STEPS = 160, DS = 0.14;
// --- compact nebula sky (shared math) ---
function h2(x, y) { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); }
function vn(x, y) { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1); return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy; }
function fbm3(x, y) { return 0.5 * vn(x, y) + 0.25 * vn(x * 2 + 1.3, y * 2 + 7.1) + 0.125 * vn(x * 4 + 2.7, y * 4 - 3.3); }
function skyNeb(u, v, sx, sy, pa, pb) {
    const w = fbm3(u * 2.2, v * 2.2), dens = fbm3(u * 2.2 + w * 1.5 + sx, v * 2.2 + 1.7 + w * 1.2 + sy);
    const density = Math.pow(Math.max(0, dens - 0.45) / 0.55, 1.5), cv = fbm3(u * 1.1 + 9.3, v * 1.1 - 3.7), t = Math.min(1, cv * 1.4);
    return [(pa[0] * (1 - t) + pb[0] * t) * density + 0.02, (pa[1] * (1 - t) + pb[1] * t) * density + 0.02, (pa[2] * (1 - t) + pb[2] * t) * density + 0.05];
}
const NEAR_A = [0.16, 0.55, 0.75], NEAR_B = [0.75, 0.25, 0.65], FAR_A = [0.85, 0.55, 0.2], FAR_B = [0.7, 0.3, 0.5];

// CPU reference: geodesic -> sky uv -> vorton swirl -> compact nebula, near/far systems
function renderWormholeNebulaCPU(W, H, opts = {}) {
    const buf = new Uint8ClampedArray(W * H * 4), cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2;
    const V = opts.vortons || [], sigma = opts.sigma || 0.35, gain = opts.gain || 0.5, camF = opts.camFar || 5.3;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = (x - cx) / R, dy = (y - cy) / R, rho = Math.min(1, Math.hypot(dx, dy)), ang = Math.atan2(dy, dx);
        const d = deflectAt(rho, opts);
        const su = (ang + d.deflection) * 0.4 + (d.throat ? camF : 0), sv = rho * 1.2 + d.deflection * 0.15;
        const off = swirlOffset(su, sv, V, sigma);
        const c = d.throat ? skyNeb(su, sv, off[0] * gain, off[1] * gain, FAR_A, FAR_B) : skyNeb(su, sv, off[0] * gain, off[1] * gain, NEAR_A, NEAR_B);
        const i = (y * W + x) * 4; buf[i] = Math.min(255, c[0] * 255); buf[i + 1] = Math.min(255, c[1] * 255); buf[i + 2] = Math.min(255, c[2] * 255); buf[i + 3] = 255;
    }
    return buf;
}

// standalone JS mirror of the merged shader (inline geodesic + inline swirl + inline nebula), no imports
function wormholeNebulaShadow(W, H, opts = {}) {
    const k = opts.k || 1, a = opts.a || 0.5, camL = opts.camL || 6, maxPsi = opts.maxPsi || 1.35;
    const V = opts.vortons || [], sigma = opts.sigma || 0.35, gain = opts.gain || 0.5, camF = opts.camFar || 5.3, s2v = sigma * sigma;
    const rOf = (l) => { const xx = Math.max(0, Math.abs(l) - a); return Math.sqrt(k * k + xx * xx); };
    const rP = (l) => { const al = Math.abs(l); if (al <= a) return 0; const xx = al - a, r = Math.sqrt(k * k + xx * xx); return (xx / r) * Math.sign(l); };
    const der = (s) => { const r = rOf(s[0]), rp = rP(s[0]); return [s[2], s[3], r * rp * s[3] * s[3], -2 * (rp / r) * s[2] * s[3]]; };
    const rk4 = (s, h) => { const ad = (p, q, sc) => [p[0] + q[0] * sc, p[1] + q[1] * sc, p[2] + q[2] * sc, p[3] + q[3] * sc]; const k1 = der(s), k2 = der(ad(s, k1, h / 2)), k3 = der(ad(s, k2, h / 2)), k4 = der(ad(s, k3, h)); return [s[0] + h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), s[1] + h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]), s[2] + h / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]), s[3] + h / 6 * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3])]; };
    const buf = new Uint8ClampedArray(W * H * 4), cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = (x - cx) / R, dy = (y - cy) / R, rho = Math.min(1, Math.hypot(dx, dy)), ang = Math.atan2(dy, dx), psi = rho * maxPsi, r0 = rOf(camL);
        let s = [camL, 0, -Math.cos(psi), Math.sin(psi) / r0];
        for (let i = 0; i < STEPS; i++) { s = rk4(s, DS); if (Math.abs(s[0]) > camL + 40) break; }
        const side = s[0] >= 0 ? 1 : -1, defl = (s[2] < 0 && s[0] > 0) ? -Math.abs(s[1]) : s[1], throat = side < 0;
        const su = (ang + defl) * 0.4 + (throat ? camF : 0), sv = rho * 1.2 + defl * 0.15;
        let ox = 0, oy = 0; for (let i = 0; i < V.length; i++) { const rx = su - V[i].x, ry = sv - V[i].y, f = (V[i].s / 6.2831853) / (rx * rx + ry * ry + s2v); ox += -ry * f; oy += rx * f; }
        const pa = throat ? FAR_A : NEAR_A, pb = throat ? FAR_B : NEAR_B;
        const c = skyNeb(su, sv, ox * gain, oy * gain, pa, pb);
        const i = (y * W + x) * 4; buf[i] = Math.min(255, c[0] * 255); buf[i + 1] = Math.min(255, c[1] * 255); buf[i + 2] = Math.min(255, c[2] * 255); buf[i + 3] = 255;
    }
    return buf;
}

export { renderWormholeNebulaCPU, wormholeNebulaShadow, NEAR_A, NEAR_B, FAR_A, FAR_B, STEPS, DS };

const NV = 8;   // matches vortonNebula.NV
// --- merged GLSL (WebGL2) ---, transcribed from wormholeNebulaShadow ---
const WORMHOLE_NEBULA_GLSL_FS = `#version 300 es
precision highp float;
out vec4 o; uniform vec2 uRes; uniform float uK,uA,uCamL,uMaxPsi,uSig2,uGain,uCamFar; uniform vec3 uVortons[${NV}];
// v4031 -- uDitherLevels: 0.0 = OFF (the default, and the shipped behaviour this shader was verified with).
// A positive value dithers the final colour to that many levels. OPT-IN ON PURPOSE: the nebula sky is the
// gradient most likely to band, but turning this on by default would change verified output, and a display-
// stage transform is not the place to do that silently.
uniform float uDitherLevels;${DITHER_GLSL}
const int STEPS=${STEPS}; const float DS=${DS};
float h2(vec2 p){ return fract(sin(p.x*127.1+p.y*311.7)*43758.5453); }
float vn(vec2 p){ vec2 ip=floor(p),f=p-ip,u=f*f*(3.0-2.0*f); float a=h2(ip),b=h2(ip+vec2(1,0)),c=h2(ip+vec2(0,1)),d=h2(ip+vec2(1,1));
  return a*(1.0-u.x)*(1.0-u.y)+b*u.x*(1.0-u.y)+c*(1.0-u.x)*u.y+d*u.x*u.y; }
float fbm3(vec2 p){ return 0.5*vn(p)+0.25*vn(p*2.0+vec2(1.3,7.1))+0.125*vn(p*4.0+vec2(2.7,-3.3)); }
vec3 skyNeb(vec2 uv, vec2 s, vec3 pa, vec3 pb){ float w=fbm3(uv*2.2);
  float dens=fbm3(vec2(uv.x*2.2+w*1.5+s.x, uv.y*2.2+1.7+w*1.2+s.y));
  float density=pow(max(0.0,dens-0.45)/0.55,1.5); float cv=fbm3(vec2(uv.x*1.1+9.3,uv.y*1.1-3.7)); float t=min(1.0,cv*1.4);
  return mix(pa,pb,t)*density + vec3(0.02,0.02,0.05); }
float rOf(float l){ float x=max(0.0,abs(l)-uA); return sqrt(uK*uK+x*x); }
float rP(float l){ float al=abs(l); if(al<=uA) return 0.0; float x=al-uA; float r=sqrt(uK*uK+x*x); return (x/r)*sign(l); }
vec4 der(vec4 s){ float r=rOf(s.x),rp=rP(s.x); return vec4(s.z,s.w,r*rp*s.w*s.w,-2.0*(rp/r)*s.z*s.w); }
vec4 rk4(vec4 s){ vec4 k1=der(s),k2=der(s+k1*(DS*0.5)),k3=der(s+k2*(DS*0.5)),k4=der(s+k3*DS); return s+(DS/6.0)*(k1+2.0*k2+2.0*k3+k4); }
void main(){ float R=0.5*min(uRes.x,uRes.y); vec2 uv=(gl_FragCoord.xy-0.5*uRes)/R;
  float rho=min(1.0,length(uv)),ang=atan(uv.y,uv.x),psi=rho*uMaxPsi,r0=rOf(uCamL);
  vec4 s=vec4(uCamL,0.0,-cos(psi),sin(psi)/r0);
  for(int i=0;i<STEPS;i++){ s=rk4(s); if(abs(s.x)>uCamL+40.0) break; }
  float side=s.x>=0.0?1.0:-1.0; float defl=(s.z<0.0&&s.x>0.0)?-abs(s.y):s.y; bool throat=side<0.0;
  float su=(ang+defl)*0.4+(throat?uCamFar:0.0), sv=rho*1.2+defl*0.15;
  vec2 off=vec2(0.0); for(int i=0;i<${NV};i++){ vec3 vt=uVortons[i]; vec2 r=vec2(su,sv)-vt.xy; float f=(vt.z/6.2831853)/(dot(r,r)+uSig2); off+=vec2(-r.y,r.x)*f; }
  vec3 pa = throat?vec3(0.85,0.55,0.2):vec3(0.16,0.55,0.75);
  vec3 pb = throat?vec3(0.7,0.3,0.5):vec3(0.75,0.25,0.65);
  vec3 col = min(vec3(1.0), skyNeb(vec2(su,sv), off*uGain, pa, pb));
  if(uDitherLevels > 0.0) col = ditherQuantize(col, gl_FragCoord.xy, uDitherLevels);
  o=vec4(col, 1.0); }`;

// --- merged WGSL (WebGPU) ---
const WORMHOLE_NEBULA_WGSL = `
struct U { res:vec2f, k:f32, a:f32, camL:f32, maxPsi:f32, sig2:f32, gain:f32, camFar:f32, ditherLevels:f32, vortons:array<vec4f, ${NV}> };
@group(0) @binding(0) var<uniform> u: U;
// v4031 -- ditherLevels REPLACES the former pad slot rather than adding a field: the struct keeps its size
// and alignment, so no buffer layout changes. 0.0 = off, matching the GLSL.
// (No backticks in this comment on purpose -- it lives INSIDE a template literal, and a stray one ends it.)
${DITHER_WGSL}
const STEPS:i32=${STEPS}; const DS:f32=${DS};
fn h2(p:vec2f)->f32{ return fract(sin(p.x*127.1+p.y*311.7)*43758.5453); }
fn vn(p:vec2f)->f32{ let ip=floor(p); let f=p-ip; let uu=f*f*(3.0-2.0*f);
  let a=h2(ip); let b=h2(ip+vec2f(1,0)); let c=h2(ip+vec2f(0,1)); let d=h2(ip+vec2f(1,1));
  return a*(1.0-uu.x)*(1.0-uu.y)+b*uu.x*(1.0-uu.y)+c*(1.0-uu.x)*uu.y+d*uu.x*uu.y; }
fn fbm3(p:vec2f)->f32{ return 0.5*vn(p)+0.25*vn(p*2.0+vec2f(1.3,7.1))+0.125*vn(p*4.0+vec2f(2.7,-3.3)); }
fn skyNeb(uv:vec2f, s:vec2f, pa:vec3f, pb:vec3f)->vec3f{ let w=fbm3(uv*2.2);
  let dens=fbm3(vec2f(uv.x*2.2+w*1.5+s.x, uv.y*2.2+1.7+w*1.2+s.y));
  let density=pow(max(0.0,dens-0.45)/0.55,1.5); let cv=fbm3(vec2f(uv.x*1.1+9.3,uv.y*1.1-3.7)); let t=min(1.0,cv*1.4);
  return mix(pa,pb,t)*density + vec3f(0.02,0.02,0.05); }
fn rOf(l:f32)->f32{ let x=max(0.0,abs(l)-u.a); return sqrt(u.k*u.k+x*x); }
fn rP(l:f32)->f32{ let al=abs(l); if(al<=u.a){return 0.0;} let x=al-u.a; let r=sqrt(u.k*u.k+x*x); return (x/r)*sign(l); }
fn der(s:vec4f)->vec4f{ let r=rOf(s.x); let rp=rP(s.x); return vec4f(s.z,s.w,r*rp*s.w*s.w,-2.0*(rp/r)*s.z*s.w); }
fn rk4(s:vec4f)->vec4f{ let k1=der(s); let k2=der(s+k1*(DS*0.5)); let k3=der(s+k2*(DS*0.5)); let k4=der(s+k3*DS); return s+(DS/6.0)*(k1+2.0*k2+2.0*k3+k4); }
@fragment fn fs(@builtin(position) pos:vec4f)->@location(0) vec4f{
  let R=0.5*min(u.res.x,u.res.y); let uv=(pos.xy-0.5*u.res)/R;
  let rho=min(1.0,length(uv)); let ang=atan2(uv.y,uv.x); let psi=rho*u.maxPsi; let r0=rOf(u.camL);
  var s=vec4f(u.camL,0.0,-cos(psi),sin(psi)/r0);
  for(var i:i32=0;i<STEPS;i=i+1){ s=rk4(s); if(abs(s.x)>u.camL+40.0){break;} }
  let side=select(-1.0,1.0,s.x>=0.0); let defl=select(s.y,-abs(s.y),s.z<0.0&&s.x>0.0); let throat=side<0.0;
  let su=(ang+defl)*0.4+select(0.0,u.camFar,throat); let sv=rho*1.2+defl*0.15;
  var off=vec2f(0.0); for(var i:i32=0;i<${NV};i=i+1){ let vt=u.vortons[i]; let r=vec2f(su,sv)-vt.xy; let f=(vt.z/6.2831853)/(dot(r,r)+u.sig2); off=off+vec2f(-r.y,r.x)*f; }
  let pa=select(vec3f(0.16,0.55,0.75),vec3f(0.85,0.55,0.2),throat);
  let pb=select(vec3f(0.75,0.25,0.65),vec3f(0.7,0.3,0.5),throat);
  var col = min(vec3f(1.0), skyNeb(vec2f(su,sv), off*u.gain, pa, pb));
  if(u.ditherLevels > 0.0){ col = ditherQuantize(col, pos.xy, u.ditherLevels); }
  return vec4f(col, 1.0); }`;

export { WORMHOLE_NEBULA_GLSL_FS, WORMHOLE_NEBULA_WGSL, NV };
if (typeof module !== "undefined" && module.exports) module.exports = { renderWormholeNebulaCPU, wormholeNebulaShadow, WORMHOLE_NEBULA_GLSL_FS, WORMHOLE_NEBULA_WGSL, NEAR_A, NEAR_B, FAR_A, FAR_B, NV, STEPS, DS };
