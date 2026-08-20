// FILE: face/miniAvatar.js
// VERSION: v885 — stripped-down direct-mount avatar renderer.
//
// A tiny, self-contained WebGL2 GLB renderer for the demo-chrome postage
// stamp (and any other small "live avatar" slot). It reuses the real
// GLBParser + SkeletalAnimator + the v884 orientation store + the costume
// tint store, but is NOT the 2100-line robotFaceAvatar singleton: no
// accessories, no cloth, no lip-sync, no wander, no DOM chrome. Just:
// parse → skin → front-face (orientation override) → tint → idle → draw,
// framed on the upper body.
//
// Usage:
//   import { mountMiniAvatar } from "./miniAvatar.js";
//   const h = mountMiniAvatar(canvasEl, { url: "RobotExpressive" });
//   ...later: h.destroy();
//
// `url` may be a built-in asset NAME ("RobotExpressive") or a GLB/GLTF path
// ("/GPU_Assets/Your_Avatars/BrainStem.glb"). Orientation + costume are read
// (and live-updated) from the per-URL stores keyed by this same url string,
// so the stamp matches whatever the user set in the avatar viewer.

import { GLBParser } from "../gpu/GLBParser.js";
import { SkeletalAnimator } from "../gpu/SkeletalAnimator.js";
import avatarOrientation from "../ui/avatarOrientation.js";
import { getCostumes } from "../ui/avatarCostumes.js";
import avatarColor from "../ui/avatarColor.js";   // v888 — color-as-indicator

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in uvec4 aJoints;
layout(location=3) in vec4 aWeights;
layout(location=4) in vec3 aColor;
layout(location=5) in vec2 aUV;
uniform mat4 uViewProj;
uniform mat4 uJointMatrices[64];
uniform mat4 uModelRot;
uniform bool uHasSkin;
out vec3 vNormal;
out vec3 vColor;
out vec2 vUV;
void main(){
  vec3 p = aPos; vec3 n = aNormal;
  if (uHasSkin) {
    mat4 sk = aWeights.x*uJointMatrices[aJoints.x]
            + aWeights.y*uJointMatrices[aJoints.y]
            + aWeights.z*uJointMatrices[aJoints.z]
            + aWeights.w*uJointMatrices[aJoints.w];
    p = (sk*vec4(aPos,1.0)).xyz;
    n = normalize((sk*vec4(aNormal,0.0)).xyz);
  }
  p = (uModelRot*vec4(p,1.0)).xyz;
  n = normalize((uModelRot*vec4(n,0.0)).xyz);
  vNormal = n; vColor = aColor; vUV = aUV;
  gl_Position = uViewProj*vec4(p,1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 vNormal; in vec3 vColor; in vec2 vUV;
uniform vec3 uTint;
uniform vec3 uBaseColor;
uniform bool uHasTexture;
uniform bool uHasVColor;
uniform sampler2D uTex;
uniform vec3 uColorOverride;      // v888 — indicator wash color
uniform float uColorOverrideAmt;  // v888 — wash strength 0..1
out vec4 frag;
void main(){
  vec3 base = uBaseColor;
  if (uHasTexture) base = texture(uTex, vUV).rgb;
  else if (uHasVColor) base = vColor;
  // simple two-light lambert + ambient so the stamp reads as 3D
  vec3 N = normalize(vNormal);
  float d1 = max(0.0, dot(N, normalize(vec3(0.4,0.7,0.6))));
  float d2 = max(0.0, dot(N, normalize(vec3(-0.5,0.2,-0.4))));
  float lit = 0.45 + 0.55*d1 + 0.20*d2;
  vec3 col = base * uTint * lit;
  col = mix(col, uColorOverride * lit, uColorOverrideAmt);   // v888 indicator wash
  frag = vec4(col, 1.0);
}`;

// ── minimal column-major mat4 helpers ──────────────────────────────
function mIdent(){ return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); }
function mPersp(fovy, aspect, near, far){
  const f = 1/Math.tan(fovy/2), nf = 1/(near-far);
  return new Float32Array([
    f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0,
  ]);
}
function mMul(a,b){
  const o = new Float32Array(16);
  for (let c=0;c<4;c++) for (let r=0;r<4;r++)
    o[c*4+r] = a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
  return o;
}
function mLookAt(eye, ctr, up){
  let zx=eye[0]-ctr[0], zy=eye[1]-ctr[1], zz=eye[2]-ctr[2];
  let zl=Math.hypot(zx,zy,zz)||1; zx/=zl; zy/=zl; zz/=zl;
  let xx=up[1]*zz-up[2]*zy, xy=up[2]*zx-up[0]*zz, xz=up[0]*zy-up[1]*zx;
  let xl=Math.hypot(xx,xy,xz)||1; xx/=xl; xy/=xl; xz/=xl;
  const yx=zy*xz-zz*xy, yy=zz*xx-zx*xz, yz=zx*xy-zy*xx;
  return new Float32Array([
    xx,yx,zx,0, xy,yy,zy,0, xz,yz,zz,0,
    -(xx*eye[0]+xy*eye[1]+xz*eye[2]),
    -(yx*eye[0]+yy*eye[1]+yz*eye[2]),
    -(zx*eye[0]+zy*eye[1]+zz*eye[2]), 1,
  ]);
}

function _resolveUrl(url){
  if (!url) return "/GPU_Assets/RobotExpressive.glb";
  if (/[\\/]/.test(url) || /\.(glb|gltf)$/i.test(url)) return url;   // a path
  return `/GPU_Assets/${url}.glb`;                                   // an asset name
}

function _compile(gl, type, src){
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn("[miniAvatar] shader:", gl.getShaderInfoLog(s));
  }
  return s;
}

export function mountMiniAvatar(canvas, opts = {}) {
  const url = opts.url || "RobotExpressive";
  const gl = canvas.getContext("webgl2", { alpha: true, antialias: true, premultipliedAlpha: false });
  if (!gl) { return { destroy(){}, ok: false }; }

  const prog = gl.createProgram();
  gl.attachShader(prog, _compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, _compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  const U = (n) => gl.getUniformLocation(prog, n);
  const uViewProj = U("uViewProj"), uJoints = U("uJointMatrices"), uModelRot = U("uModelRot");
  const uHasSkin = U("uHasSkin"), uTint = U("uTint"), uBaseColor = U("uBaseColor");
  const uHasTexture = U("uHasTexture"), uHasVColor = U("uHasVColor"), uTex = U("uTex");
  const uColorOverride = U("uColorOverride"), uColorOverrideAmt = U("uColorOverrideAmt");   // v888

  let raf = 0, destroyed = false, mesh = null, animator = null;
  let rawBBox = null, lastT = 0;
  const costumes = getCostumes();

  function destroy(){
    destroyed = true;
    if (raf) cancelAnimationFrame(raf);
    try { const ext = gl.getExtension("WEBGL_lose_context"); ext && ext.loseContext(); } catch {}
  }

  (async function load(){
    let buf;
    try {
      const res = await fetch(_resolveUrl(url));
      if (!res.ok) throw new Error("HTTP " + res.status);
      buf = await res.arrayBuffer();
    } catch (e) { console.warn("[miniAvatar] load failed:", e?.message); return; }
    if (destroyed) return;

    let parsed;
    try { parsed = await GLBParser.parse(buf, { baseUrl: new URL(_resolveUrl(url), location.href).href }); }
    catch (e) { console.warn("[miniAvatar] parse failed:", e?.message); return; }
    if (destroyed) return;

    // VAO
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf3 = (loc, data, n) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0);
    };
    buf3(0, parsed.positions, 3);
    if (parsed.normals) buf3(1, parsed.normals, 3); else gl.vertexAttrib3f(1, 0, 1, 0);

    const hasSkin = !!(parsed.skin && parsed.joints && parsed.weights);
    if (hasSkin) {
      const jb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, jb);
      gl.bufferData(gl.ARRAY_BUFFER, parsed.joints, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(2);
      const jt = parsed.joints instanceof Uint8Array ? gl.UNSIGNED_BYTE : gl.UNSIGNED_SHORT;
      // integer attribute → must use the I-pointer (matches robotFaceAvatar)
      gl.vertexAttribIPointer(2, 4, jt, 0, 0);
      buf3(3, parsed.weights, 4);
    } else { gl.vertexAttribI4ui(2, 0,0,0,0); gl.vertexAttrib4f(3, 0,0,0,0); }

    const hasVColor = !!(parsed.colors && parsed.colors.length === parsed.positions.length);
    if (hasVColor) buf3(4, parsed.colors, 3); else gl.vertexAttrib3f(4, 0.8, 0.82, 0.88);
    if (parsed.texCoords) buf3(5, parsed.texCoords, 2); else gl.vertexAttrib2f(5, 0, 0);

    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, parsed.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    // texture (single, optional)
    let texture = null;
    if (parsed.texture instanceof HTMLImageElement || parsed.texture instanceof ImageBitmap) {
      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, parsed.texture);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    }

    mesh = { vao, indexCount: parsed.indices.length, hasSkin, hasVColor, texture };

    // bbox for framing
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    const p = parsed.positions;
    for (let i=0;i<p.length;i+=3){
      if(p[i]<minX)minX=p[i]; if(p[i]>maxX)maxX=p[i];
      if(p[i+1]<minY)minY=p[i+1]; if(p[i+1]>maxY)maxY=p[i+1];
      if(p[i+2]<minZ)minZ=p[i+2]; if(p[i+2]>maxZ)maxZ=p[i+2];
    }
    rawBBox = { minX,minY,minZ,maxX,maxY,maxZ };

    try {
      animator = new SkeletalAnimator(parsed);
      if (animator.animations && animator.animations.length) {
        // prefer an idle-ish clip, else clip 0
        let idx = animator.animations.findIndex(a => /idle|breath|stand/i.test(a.name || ""));
        animator.setClip(idx >= 0 ? idx : 0, 0);
      }
    } catch (e) { animator = null; }

    lastT = performance.now();
    raf = requestAnimationFrame(frame);
  })();

  function orientationMat(){
    try { return avatarOrientation.buildMatrix(avatarOrientation.get(url)); }
    catch { return mIdent(); }
  }
  function tintVec(){
    try { const c = costumes.get(url); return c && c.tint ? c.tint : [1,1,1]; }
    catch { return [1,1,1]; }
  }

  function framedViewProj(rot){
    // rotate the 8 raw-bbox corners, frame the UPPER portion (head+torso)
    const b = rawBBox;
    const corners = [
      [b.minX,b.minY,b.minZ],[b.maxX,b.minY,b.minZ],[b.minX,b.maxY,b.minZ],[b.maxX,b.maxY,b.minZ],
      [b.minX,b.minY,b.maxZ],[b.maxX,b.minY,b.maxZ],[b.minX,b.maxY,b.maxZ],[b.maxX,b.maxY,b.maxZ],
    ];
    let mnX=Infinity,mnY=Infinity,mnZ=Infinity,mxX=-Infinity,mxY=-Infinity,mxZ=-Infinity;
    for (const [x,y,z] of corners){
      const rx=rot[0]*x+rot[4]*y+rot[8]*z, ry=rot[1]*x+rot[5]*y+rot[9]*z, rz=rot[2]*x+rot[6]*y+rot[10]*z;
      if(rx<mnX)mnX=rx; if(rx>mxX)mxX=rx; if(ry<mnY)mnY=ry; if(ry>mxY)mxY=ry; if(rz<mnZ)mnZ=rz; if(rz>mxZ)mxZ=rz;
    }
    const h = mxY-mnY, w = Math.max(mxX-mnX, mxZ-mnZ);
    // frame the top ~55% (head + shoulders) so the small stamp reads as a portrait
    const topY = mxY, lookY = topY - h*0.30;
    const fov = 45*Math.PI/180, aspect = (canvas.width/canvas.height)||1;
    const frameH = h*0.60;
    const rH = (frameH/2)/Math.tan(fov/2);
    const rW = (w/2)/(Math.tan(fov/2)*aspect);
    const radius = Math.min(20, Math.max(0.6, Math.max(rH, rW)*1.25));
    const proj = mPersp(fov, aspect, 0.01, 100);
    const view = mLookAt([0, lookY, radius], [0, lookY, 0], [0,1,0]);
    return mMul(proj, view);
  }

  function drawNow(dt){
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.clearColor(0,0,0,0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    if (mesh) {
      const rot = orientationMat();
      gl.useProgram(prog);
      gl.uniformMatrix4fv(uViewProj, false, framedViewProj(rot));
      gl.uniformMatrix4fv(uModelRot, false, rot);
      if (animator && mesh.hasSkin) { animator.update(dt); gl.uniformMatrix4fv(uJoints, false, animator.jointMatrices); gl.uniform1i(uHasSkin, 1); }
      else gl.uniform1i(uHasSkin, 0);
      const t = tintVec();
      gl.uniform3f(uTint, t[0], t[1], t[2]);
      try { const eff = avatarColor.getEffective(url); gl.uniform3f(uColorOverride, eff.rgb[0], eff.rgb[1], eff.rgb[2]); gl.uniform1f(uColorOverrideAmt, eff.amt || 0); }
      catch { gl.uniform1f(uColorOverrideAmt, 0); }
      gl.uniform3f(uBaseColor, 0.80, 0.82, 0.88);
      gl.uniform1i(uHasVColor, mesh.hasVColor ? 1 : 0);
      if (mesh.texture) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, mesh.texture); gl.uniform1i(uTex, 0); gl.uniform1i(uHasTexture, 1); }
      else gl.uniform1i(uHasTexture, 0);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0);
      gl.bindVertexArray(null);
    }
  }

  function frame(){
    if (destroyed) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now-lastT)/1000); lastT = now;
    // keep canvas backing store matched to its CSS size (cheap; size is tiny)
    const w = canvas.clientWidth|0, h = canvas.clientHeight|0;
    if (w && h && (canvas.width !== w || canvas.height !== h)) { canvas.width = w; canvas.height = h; }
    drawNow(dt);
    raf = requestAnimationFrame(frame);
  }

  // v1469 — synchronous one-frame capture. readPixels runs right after the draw,
  // so it works even though this context has no preserveDrawingBuffer. Returns a
  // PNG dataURL, or null if the model hasn't finished loading yet.
  function capture(size){
    if (!mesh) return null;
    const s = size || 256;
    if (canvas.width !== s || canvas.height !== s) { canvas.width = s; canvas.height = s; }
    drawNow(0);
    try {
      const px = new Uint8Array(s * s * 4);
      gl.readPixels(0, 0, s, s, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const c2 = document.createElement("canvas"); c2.width = s; c2.height = s;
      const ctx = c2.getContext("2d"); const img = ctx.createImageData(s, s);
      for (let y = 0; y < s; y++) { const sy = (s - 1 - y) * s * 4, dy = y * s * 4; for (let x = 0; x < s * 4; x++) img.data[dy + x] = px[sy + x]; }   // flip vertically (GL origin is bottom-left)
      ctx.putImageData(img, 0, 0);
      return c2.toDataURL("image/png");
    } catch (e) { return null; }
  }

  return { destroy, ok: true, capture };
}

export default mountMiniAvatar;
