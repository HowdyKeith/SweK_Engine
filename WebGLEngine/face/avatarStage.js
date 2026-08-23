// FILE: face/avatarStage.js
// VERSION: v891 — "Live stage" (Demo-Chrome arc, option C R1).
//
// One WebGL2 context that renders a tiny 3D diorama: the avatar GLB standing
// beside a real 3D gauge object. R1 ships the avatar actor (ported from
// miniAvatar — same GLBParser/SkeletalAnimator/orientation/costume/color-wash)
// plus ONE gauge actor: a 3D ring dial (torus track + lit fill arc) whose fill
// follows a 0..1 value getter. Later rounds add gyro/barrel/liquid-voxel/wave
// actors and let the avatar walk among them.
//
// Perf: single context (same budget as the old stamp), ~30fps throttle, and
// auto-pause when the canvas is hidden (document.hidden) or scrolled offscreen
// (IntersectionObserver). Procedural low-poly gauge meshes. Fine on Pascal /
// the Android TV Device.
//
//   import { mountStage } from "./avatarStage.js";
//   const h = mountStage(canvasEl, { url: "RobotExpressive", getValue: () => 0.5 });
//   h.destroy();

import { GLBParser } from "../gpu/GLBParser.js";
import { SPACETIME_VERT, SPACETIME_FRAG, isSpacetimeStyle, modeFor } from "../fx/gauge/gaugeShaders.js";   // v2433 -- wormhole / blackhole gauge styles
import { SkeletalAnimator } from "../gpu/SkeletalAnimator.js";
import avatarOrientation from "../ui/avatarOrientation.js";
import { getCostumes } from "../ui/avatarCostumes.js";
import avatarColor from "../ui/avatarColor.js";
import { OGRE_BOAT_OBJ, OGRE_SUB_OBJ, OGRE_FLYING_OBJ } from "../world/carrierAssets.js";

// ---- shared math (column-major) ----
function mIdent(){ return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]); }
function mMul(a,b){ const o=new Float32Array(16); for(let c=0;c<4;c++)for(let r=0;r<4;r++) o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3]; return o; }
function mPersp(fovy,asp,n,f){ const t=1/Math.tan(fovy/2); return new Float32Array([t/asp,0,0,0, 0,t,0,0, 0,0,(f+n)/(n-f),-1, 0,0,(2*f*n)/(n-f),0]); }
function mLookAt(eye,ctr,up){
  let zx=eye[0]-ctr[0],zy=eye[1]-ctr[1],zz=eye[2]-ctr[2]; let zl=Math.hypot(zx,zy,zz)||1; zx/=zl;zy/=zl;zz/=zl;
  let xx=up[1]*zz-up[2]*zy,xy=up[2]*zx-up[0]*zz,xz=up[0]*zy-up[1]*zx; let xl=Math.hypot(xx,xy,xz)||1; xx/=xl;xy/=xl;xz/=xl;
  const yx=zy*xz-zz*xy,yy=zz*xx-zx*xz,yz=zx*xy-zy*xx;
  return new Float32Array([xx,yx,zx,0, xy,yy,zy,0, xz,yz,zz,0, -(xx*eye[0]+xy*eye[1]+xz*eye[2]),-(yx*eye[0]+yy*eye[1]+yz*eye[2]),-(zx*eye[0]+zy*eye[1]+zz*eye[2]),1]);
}
function mTRS(tx,ty,tz,s){ return new Float32Array([s,0,0,0, 0,s,0,0, 0,0,s,0, tx,ty,tz,1]); }
function mTranslate(x,y,z){ return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1]); }
function mScale(x,y,z){ return new Float32Array([x,0,0,0,0,y,0,0,0,0,z,0,0,0,0,1]); }
function mRotX(a){ const c=Math.cos(a),s=Math.sin(a); return new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]); }
function mRotY(a){ const c=Math.cos(a),s=Math.sin(a); return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]); }
function mRotZ(a){ const c=Math.cos(a),s=Math.sin(a); return new Float32Array([c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1]); }

// ---- avatar shader (skinned; matches miniAvatar) ----
const A_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNormal;
layout(location=2) in uvec4 aJoints; layout(location=3) in vec4 aWeights;
layout(location=4) in vec3 aColor; layout(location=5) in vec2 aUV;
uniform mat4 uViewProj; uniform mat4 uModel; uniform mat4 uJointMatrices[64]; uniform bool uHasSkin;
out vec3 vNormal; out vec3 vColor; out vec2 vUV;
void main(){
  vec3 p=aPos; vec3 n=aNormal;
  if(uHasSkin){ mat4 sk=aWeights.x*uJointMatrices[aJoints.x]+aWeights.y*uJointMatrices[aJoints.y]+aWeights.z*uJointMatrices[aJoints.z]+aWeights.w*uJointMatrices[aJoints.w]; p=(sk*vec4(aPos,1.0)).xyz; n=normalize((sk*vec4(aNormal,0.0)).xyz); }
  vec4 wp=uModel*vec4(p,1.0); n=normalize(mat3(uModel)*n);
  vNormal=n; vColor=aColor; vUV=aUV; gl_Position=uViewProj*wp;
}`;
const A_FRAG = `#version 300 es
precision highp float;
in vec3 vNormal; in vec3 vColor; in vec2 vUV;
uniform vec3 uTint; uniform vec3 uBaseColor; uniform bool uHasTexture; uniform bool uHasVColor; uniform sampler2D uTex;
uniform vec3 uColorOverride; uniform float uColorOverrideAmt;
out vec4 frag;
void main(){
  vec3 base=uBaseColor; if(uHasTexture) base=texture(uTex,vUV).rgb; else if(uHasVColor) base=vColor;
  vec3 N=normalize(vNormal);
  float d1=max(0.0,dot(N,normalize(vec3(0.4,0.7,0.6)))); float d2=max(0.0,dot(N,normalize(vec3(-0.5,0.2,-0.4))));
  float lit=0.45+0.55*d1+0.20*d2; vec3 col=base*uTint*lit;
  col=mix(col,uColorOverride*lit,uColorOverrideAmt); frag=vec4(col,1.0);
}`;

// ---- gauge shader (procedural geometry; ring fill via param u in aU) ----
const G_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNormal; layout(location=2) in float aU;
uniform mat4 uViewProj; uniform mat4 uModel;
out vec3 vNormal; out float vU;
void main(){ vNormal=normalize(mat3(uModel)*aNormal); vU=aU; gl_Position=uViewProj*uModel*vec4(aPos,1.0); }`;
const G_FRAG = `#version 300 es
precision highp float;
in vec3 vNormal; in float vU;
uniform vec3 uFillColor; uniform vec3 uTrackColor; uniform float uFill; uniform bool uDiscard;
out vec4 frag;
void main(){
  if(uDiscard && vU > uFill) discard;   // voxel barrel: cubes above the level vanish
  vec3 N=normalize(vNormal);
  float d1=max(0.0,dot(N,normalize(vec3(0.4,0.7,0.6)))); float d2=max(0.0,dot(N,normalize(vec3(-0.5,0.2,-0.4))));
  float lit=0.42+0.58*d1+0.22*d2;
  vec3 c = (vU <= uFill) ? uFillColor : uTrackColor;
  frag=vec4(c*lit,1.0);
}`;

// ---- wave shader (animated sloshing liquid surface) ----
const W_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj; uniform mat4 uModel; uniform float uTime; uniform float uLevel; uniform float uAmp;
out vec3 vNormal; out float vCrest;
void main(){
  float x=aPos.x, z=aPos.z;
  float w = 0.5*sin(x*6.0 + uTime*2.0) + 0.5*sin(z*5.0 + uTime*1.3) + 0.25*sin((x+z)*4.0 - uTime*1.7);
  float y = uLevel + uAmp*w;
  float dydx = uAmp*(0.5*6.0*cos(x*6.0+uTime*2.0) + 0.25*4.0*cos((x+z)*4.0-uTime*1.7));
  float dydz = uAmp*(0.5*5.0*cos(z*5.0+uTime*1.3) + 0.25*4.0*cos((x+z)*4.0-uTime*1.7));
  vec3 n = normalize(vec3(-dydx, 1.0, -dydz));
  vNormal = normalize(mat3(uModel)*n); vCrest = w;
  gl_Position = uViewProj*uModel*vec4(x,y,z,1.0);
}`;
const W_FRAG = `#version 300 es
precision highp float;
in vec3 vNormal; in float vCrest;
uniform vec3 uColor;
uniform float uAlpha;
out vec4 frag;
void main(){
  vec3 N=normalize(vNormal);
  float d1=max(0.0,dot(N,normalize(vec3(0.4,0.7,0.6)))); float d2=max(0.0,dot(N,normalize(vec3(-0.5,0.2,-0.4))));
  float lit=0.40+0.58*d1+0.22*d2;
  vec3 c = mix(uColor, uColor*1.5+vec3(0.15), clamp(vCrest*0.5+0.5,0.0,1.0)*0.4);  // brighter crests
  frag=vec4(c*lit,uAlpha);
}`;

// v897 — screen program: a textured quad showing the LIVE demo canvas.
const S_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUV;
uniform mat4 uViewProj, uModel; out vec2 vUV;
void main(){ vUV=aUV; gl_Position=uViewProj*uModel*vec4(aPos,1.0); }`;
const S_FRAG = `#version 300 es
precision highp float;
in vec2 vUV; uniform sampler2D uTex; uniform int uMode; out vec4 frag;
void main(){
  if(uMode==2){ frag=vec4(0.07,0.08,0.10,1.0); return; }          // bezel (solid dark)
  if(uMode==0){                                                    // no-signal: faint scanlines
    float sl=0.05*step(0.5, fract(vUV.y*46.0));
    frag=vec4(0.03+sl,0.05+sl,0.08+sl,1.0); return;
  }
  vec3 c=texture(uTex, vec2(vUV.x, 1.0-vUV.y)).rgb;                // flip canvas Y → GL
  frag=vec4(c,1.0);
}`;
// Quad in XY plane facing +Z, centered, unit size (scale via model). pos@0, uv@1.
function buildBox(){   // v1013 — unit cube (±0.5), {positions,normals,us,indices} for makeVAO
  const pos=[], nor=[], us=[], idx=[];
  const F=[
    [0,0,1,  -1,-1,1,  1,-1,1,  1,1,1,  -1,1,1],
    [0,0,-1,  1,-1,-1, -1,-1,-1, -1,1,-1,  1,1,-1],
    [1,0,0,   1,-1,1,   1,-1,-1,  1,1,-1,   1,1,1],
    [-1,0,0, -1,-1,-1, -1,-1,1,  -1,1,1,  -1,1,-1],
    [0,1,0,  -1,1,1,    1,1,1,    1,1,-1,  -1,1,-1],
    [0,-1,0, -1,-1,-1,  1,-1,-1,  1,-1,1,  -1,-1,1],
  ];
  let b=0;
  for(const f of F){
    for(let k=0;k<4;k++){ pos.push(f[3+k*3]*0.5, f[4+k*3]*0.5, f[5+k*3]*0.5); nor.push(f[0],f[1],f[2]); us.push(0); }
    idx.push(b,b+1,b+2, b,b+2,b+3); b+=4;
  }
  return { positions:new Float32Array(pos), normals:new Float32Array(nor), us:new Float32Array(us), indices:new Uint16Array(idx) };
}
function buildQuad(){
  return { pos:new Float32Array([-0.5,-0.5,0, 0.5,-0.5,0, 0.5,0.5,0, -0.5,0.5,0]),
           uv:new Float32Array([0,0, 1,0, 1,1, 0,1]),
           idx:new Uint16Array([0,1,2, 0,2,3]) };
}

function _resolveUrl(url){ if(!url) return "/GPU_Assets/RobotExpressive.glb"; if(/[\\/]/.test(url)||/\.(glb|gltf)$/i.test(url)) return url; return `/GPU_Assets/${url}.glb`; }
function _compile(gl,type,src){ const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s); if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) console.warn("[avatarStage] shader:",gl.getShaderInfoLog(s)); return s; }
function _link(gl,vs,fs){ const p=gl.createProgram(); gl.attachShader(p,_compile(gl,gl.VERTEX_SHADER,vs)); gl.attachShader(p,_compile(gl,gl.FRAGMENT_SHADER,fs)); gl.linkProgram(p); return p; }

// v898 — minimal OBJ parser for the small OGRE carrier meshes. Triangulates
// tri/quad faces (fan), computes flat per-face normals (source has no vn),
// and centers X so the ship pivots about its middle. Output matches makeVAO
// (positions@0, normals@1, u@2 = 0).
function parseOBJ(text){
  const V=[], faces=[];
  for(const raw of text.split("\n")){
    const t=raw.trim();
    if(t.startsWith("v ")){ const p=t.slice(2).trim().split(/\s+/).map(Number); V.push([p[0],p[1],p[2]]); }
    else if(t.startsWith("f ")){ const ids=t.slice(2).trim().split(/\s+/).map(s=>parseInt(s,10)-1);
      for(let i=2;i<ids.length;i++) faces.push([ids[0],ids[i-1],ids[i]]); }
  }
  // center on X (ships are built off-center), keep y from 0 (waterline/keel)
  let minX=Infinity,maxX=-Infinity; for(const p of V){ if(p[0]<minX)minX=p[0]; if(p[0]>maxX)maxX=p[0]; }
  const cx=(minX+maxX)/2;
  const positions=[],normals=[],us=[],indices=[]; let n=0;
  for(const f of faces){
    const a=V[f[0]],b=V[f[1]],c=V[f[2]]; if(!a||!b||!c) continue;
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2], vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
    let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx; const L=Math.hypot(nx,ny,nz)||1; nx/=L;ny/=L;nz/=L;
    for(const vi of f){ const p=V[vi]; positions.push(p[0]-cx,p[1],p[2]); normals.push(nx,ny,nz); us.push(0); indices.push(n++); }
  }
  return { positions:new Float32Array(positions), normals:new Float32Array(normals), us:new Float32Array(us), indices:new Uint16Array(indices) };
}

// Build a torus ring facing +Z. aU = fraction (0..1) around the major circle,
// starting at top (12 o'clock) going clockwise — so fill grows like a clock.
function buildRing(R, tube, majSeg, minSeg){
  const pos=[], nor=[], us=[], idx=[];
  for(let i=0;i<=majSeg;i++){
    const u=i/majSeg;                         // 0..1 around major circle
    const a=Math.PI/2 - u*2*Math.PI;          // start at top (12 o'clock), clockwise
    const ca=Math.cos(a), sa=Math.sin(a);
    for(let j=0;j<=minSeg;j++){
      const b=j/minSeg*2*Math.PI; const cb=Math.cos(b), sb=Math.sin(b);
      const cx=R*ca, cy=R*sa;                 // center of tube ring in XY plane
      const nx=ca*cb, ny=sa*cb, nz=sb;        // tube normal
      pos.push(cx+tube*nx, cy+tube*ny, tube*nz);
      nor.push(nx,ny,nz); us.push(u);
    }
  }
  const row=minSeg+1;
  for(let i=0;i<majSeg;i++) for(let j=0;j<minSeg;j++){
    const a=i*row+j, b=a+row;
    idx.push(a,b,a+1, a+1,b,b+1);
  }
  return { positions:new Float32Array(pos), normals:new Float32Array(nor), us:new Float32Array(us), indices:new Uint16Array(idx) };
}

// Capped cylinder, radius R, height H, base at y=0 growing +Y. aU unused (solid).
function buildCylinder(R, H, seg){
  const pos=[], nor=[], us=[], idx=[];
  // side
  for(let i=0;i<=seg;i++){ const a=i/seg*2*Math.PI, ca=Math.cos(a), sa=Math.sin(a);
    pos.push(R*ca,0,R*sa); nor.push(ca,0,sa); us.push(0);
    pos.push(R*ca,H,R*sa); nor.push(ca,0,sa); us.push(0);
  }
  for(let i=0;i<seg;i++){ const a=i*2, b=a+2; idx.push(a,b,a+1, a+1,b,b+1); }
  // caps
  const base=pos.length/3; pos.push(0,0,0); nor.push(0,-1,0); us.push(0);
  const topc=pos.length/3; pos.push(0,H,0); nor.push(0,1,0); us.push(0);
  for(let i=0;i<=seg;i++){ const a=i/seg*2*Math.PI, ca=Math.cos(a), sa=Math.sin(a);
    pos.push(R*ca,0,R*sa); nor.push(0,-1,0); us.push(0);
    pos.push(R*ca,H,R*sa); nor.push(0,1,0); us.push(0);
  }
  const ring0=topc+1;
  for(let i=0;i<seg;i++){ const b0=ring0+i*2, b1=ring0+(i+1)*2; idx.push(base,b1,b0); const t0=b0+1,t1=b1+1; idx.push(topc,t0,t1); }
  return { positions:new Float32Array(pos), normals:new Float32Array(nor), us:new Float32Array(us), indices:new Uint16Array(idx) };
}

// A column of small cubes stacked in `layers`, `perSide`×`perSide` per layer.
// Each cube's verts carry aU = its layer fraction (bottom small → fills first),
// so the gauge shader (uDiscard) makes cubes above the liquid level vanish.
function buildVoxelColumn(layers, perSide, cube, foot){
  const pos=[], nor=[], us=[], idx=[];
  // unit cube faces (24 verts, flat normals)
  const F=[ // [nx,ny,nz, 4 corners(xyz)]
    [0,0,1,  -1,-1,1, 1,-1,1, 1,1,1, -1,1,1],
    [0,0,-1, 1,-1,-1, -1,-1,-1, -1,1,-1, 1,1,-1],
    [1,0,0,  1,-1,1, 1,-1,-1, 1,1,-1, 1,1,1],
    [-1,0,0, -1,-1,-1, -1,-1,1, -1,1,1, -1,1,-1],
    [0,1,0,  -1,1,1, 1,1,1, 1,1,-1, -1,1,-1],
    [0,-1,0, -1,-1,-1, 1,-1,-1, 1,-1,1, -1,-1,1],
  ];
  const layerH = cube*1.25;
  const span = (perSide-1)*cube*1.15;
  for(let ly=0; ly<layers; ly++){
    const u=(ly+0.5)/layers;
    const cy = layerH*0.5 + ly*layerH;
    for(let a=0;a<perSide;a++) for(let b=0;b<perSide;b++){
      const cx = -span/2 + a*cube*1.15;
      const cz = -span/2 + b*cube*1.15;
      // keep cubes within the round footprint
      if(Math.hypot(cx,cz) > foot) continue;
      const baseIdx = pos.length/3;
      for(const f of F){
        const nx=f[0],ny=f[1],nz=f[2];
        for(let k=0;k<4;k++){ const vx=f[3+k*3],vy=f[4+k*3],vz=f[5+k*3];
          pos.push(cx+vx*cube*0.5, cy+vy*cube*0.5, cz+vz*cube*0.5); nor.push(nx,ny,nz); us.push(u); }
      }
      for(let f=0; f<6; f++){ const o=baseIdx+f*4; idx.push(o,o+1,o+2, o,o+2,o+3); }
    }
  }
  return { positions:new Float32Array(pos), normals:new Float32Array(nor), us:new Float32Array(us), indices:new Uint16Array(idx), top: layerH*layers };
}

// Flat grid in XZ (y=0), centered, for the animated wave surface.
function buildGrid(N, size){
  const pos=[], idx=[]; const h=size/2;
  for(let i=0;i<=N;i++) for(let j=0;j<=N;j++){ pos.push(-h + size*i/N, 0, -h + size*j/N); }
  const row=N+1;
  for(let i=0;i<N;i++) for(let j=0;j<N;j++){ const a=i*row+j, b=a+row; idx.push(a,b,a+1, a+1,b,b+1); }
  return { positions:new Float32Array(pos), indices:new Uint16Array(idx) };
}

// UV sphere, radius R, centered at origin. aU = 0 (solid).
function buildSphere(R, lat, lon){
  const pos=[], nor=[], us=[], idx=[];
  for(let i=0;i<=lat;i++){ const th=i/lat*Math.PI, st=Math.sin(th), ct=Math.cos(th);
    for(let j=0;j<=lon;j++){ const ph=j/lon*2*Math.PI, sp=Math.sin(ph), cp=Math.cos(ph);
      const nx=st*cp, ny=ct, nz=st*sp; pos.push(R*nx,R*ny,R*nz); nor.push(nx,ny,nz); us.push(0); } }
  const row=lon+1;
  for(let i=0;i<lat;i++) for(let j=0;j<lon;j++){ const a=i*row+j, b=a+row; idx.push(a,b,a+1, a+1,b,b+1); }
  return { positions:new Float32Array(pos), normals:new Float32Array(nor), us:new Float32Array(us), indices:new Uint16Array(idx) };
}

// v899 — low-poly cone/dart pointing +Z (apex at +Z), base cap at z=0. For boids.
function buildCone(r, h, seg){
  const pos=[], nor=[], us=[], idx=[]; const apex=[0,0,h];
  for(let i=0;i<seg;i++){
    const a0=i/seg*2*Math.PI, a1=(i+1)/seg*2*Math.PI;
    const b0=[r*Math.cos(a0), r*Math.sin(a0), 0], b1=[r*Math.cos(a1), r*Math.sin(a1), 0];
    const ux=b0[0]-apex[0],uy=b0[1]-apex[1],uz=b0[2]-apex[2], vx=b1[0]-apex[0],vy=b1[1]-apex[1],vz=b1[2]-apex[2];
    let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx; const L=Math.hypot(nx,ny,nz)||1; nx/=L;ny/=L;nz/=L;
    const base=pos.length/3;
    pos.push(apex[0],apex[1],apex[2], b0[0],b0[1],b0[2], b1[0],b1[1],b1[2]);
    for(let k=0;k<3;k++){ nor.push(nx,ny,nz); us.push(0); }
    idx.push(base,base+1,base+2);
  }
  const c=pos.length/3; pos.push(0,0,0); nor.push(0,0,-1); us.push(0);
  const ring=pos.length/3;
  for(let i=0;i<=seg;i++){ const a=i/seg*2*Math.PI; pos.push(r*Math.cos(a),r*Math.sin(a),0); nor.push(0,0,-1); us.push(0); }
  for(let i=0;i<seg;i++){ idx.push(c, ring+i+1, ring+i); }
  return { positions:new Float32Array(pos), normals:new Float32Array(nor), us:new Float32Array(us), indices:new Uint16Array(idx) };
}
// v1221 — pom-pom: a core sphere with strands (thin cones) radiating outward in
// fibonacci-sphere directions. One merged geo (Uint16), drawn with the primitive
// program. Bright fill color + a per-frame shake = cheerleader mode.
// v1224 — parameterized so cheerleader.style(name) can offer a selection.
function buildPomPom(o){
  o = o || {};
  const coreR = o.coreR || 0.085, N = o.strands || 16, coneR = o.coneR || 0.020, coneH = o.coneH || 0.12, coneSeg = o.coneSeg || 5, off = (o.off != null ? o.off : 0.05);
  const core = buildSphere(coreR, 8, 10);
  const pos=[...core.positions], nor=[...core.normals], us=[...core.us], idx=[...core.indices];
  let base = pos.length/3;
  for(let s=0;s<N;s++){
    const y=1-(s+0.5)/N*2, rr=Math.sqrt(Math.max(0,1-y*y)), ph=s*2.399963;
    const d=[Math.cos(ph)*rr, y, Math.sin(ph)*rr];
    const R=mOrient(d[0],d[1],d[2]); const cone=buildCone(coneR,coneH,coneSeg);
    for(let i=0;i<cone.positions.length;i+=3){
      const p=mulV4(R, cone.positions[i],cone.positions[i+1],cone.positions[i+2],1);
      pos.push(p[0]+d[0]*off, p[1]+d[1]*off, p[2]+d[2]*off);
      const n=mulV4(R, cone.normals[i],cone.normals[i+1],cone.normals[i+2],0);
      nor.push(n[0],n[1],n[2]); us.push(0);
    }
    for(let i=0;i<cone.indices.length;i++) idx.push(cone.indices[i]+base);
    base = pos.length/3;
  }
  return { positions:new Float32Array(pos), normals:new Float32Array(nor), us:new Float32Array(us), indices:new Uint16Array(idx) };
}
// v1224 — pom-pom style presets (kept small so Uint16 indices stay safe).
const POM_STYLES = {
  classic:  { strands:16, coneR:0.020, coneH:0.12, coreR:0.085 },
  fluffy:   { strands:40, coneR:0.016, coneH:0.10, coreR:0.075 },
  spiky:    { strands:28, coneR:0.012, coneH:0.18, coreR:0.060 },
  star:     { strands:8,  coneR:0.030, coneH:0.20, coreR:0.050 },
  streamer: { strands:6,  coneR:0.050, coneH:0.26, coreR:0.040 },
  sparkler: { strands:34, coneR:0.010, coneH:0.22, coreR:0.045, off:0.02 },
};
// Column-major rotation that maps local +Z to the given direction (world up ref).
function mOrient(fx,fy,fz){
  let fl=Math.hypot(fx,fy,fz)||1; fx/=fl; fy/=fl; fz/=fl;
  let rx=1*fz-0*fy, ry=0*fx-0*fz, rz=0*fy-1*fx;   // up(0,1,0) × forward
  let rl=Math.hypot(rx,ry,rz); if(rl<1e-4){ rx=1;ry=0;rz=0; rl=1; } rx/=rl;ry/=rl;rz/=rl;
  const ux=fy*rz-fz*ry, uy=fz*rx-fx*rz, uz=fx*ry-fy*rx;   // forward × right
  return new Float32Array([rx,ry,rz,0, ux,uy,uz,0, fx,fy,fz,0, 0,0,0,1]);
}
// h in [0,1], s,l in [0,1] → [r,g,b] 0..1
function hsl2rgb(h,s,l){
  const f=(n)=>{ const k=(n+h*12)%12; const a=s*Math.min(l,1-l); return l-a*Math.max(-1,Math.min(k-3,Math.min(9-k,1))); };
  return [f(0),f(8),f(4)];
}
// v901 — extruded cog facing +Z: square teeth (tip/root), flat front/back + rim walls.
function buildGear(rTip, rRoot, teeth, thick){
  const M=teeth*2, hz=thick/2, rim=[];
  for(let s=0;s<M;s++){ const a0=s/M*2*Math.PI, a1=(s+1)/M*2*Math.PI, r=(s%2===0)?rTip:rRoot; rim.push([a0,r]); rim.push([a1,r]); }
  const K=rim.length, pos=[],nor=[],us=[],idx=[];
  const P=(a,r,z)=>[r*Math.cos(a), r*Math.sin(a), z];
  // front face (+Z)
  pos.push(0,0,hz); nor.push(0,0,1); us.push(0); const fstart=1;
  for(const [a,r] of rim){ const p=P(a,r,hz); pos.push(p[0],p[1],p[2]); nor.push(0,0,1); us.push(0); }
  for(let i=0;i<K;i++) idx.push(0, fstart+i, fstart+((i+1)%K));
  // back face (-Z)
  const bc=pos.length/3; pos.push(0,0,-hz); nor.push(0,0,-1); us.push(0); const bstart=pos.length/3;
  for(const [a,r] of rim){ const p=P(a,r,-hz); pos.push(p[0],p[1],p[2]); nor.push(0,0,-1); us.push(0); }
  for(let i=0;i<K;i++) idx.push(bc, bstart+((i+1)%K), bstart+i);
  // rim walls (flat per-quad normal)
  for(let i=0;i<K;i++){ const j=(i+1)%K;
    const A=P(rim[i][0],rim[i][1],hz), B=P(rim[j][0],rim[j][1],hz), C=P(rim[j][0],rim[j][1],-hz), D=P(rim[i][0],rim[i][1],-hz);
    const ux=B[0]-A[0],uy=B[1]-A[1],uz=B[2]-A[2], vx=D[0]-A[0],vy=D[1]-A[1],vz=D[2]-A[2];
    let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx; const L=Math.hypot(nx,ny,nz)||1; nx/=L;ny/=L;nz/=L;
    const b=pos.length/3; pos.push(...A,...B,...C,...D); for(let k=0;k<4;k++){ nor.push(nx,ny,nz); us.push(0); }
    idx.push(b,b+1,b+2, b,b+2,b+3);
  }
  return { positions:new Float32Array(pos), normals:new Float32Array(nor), us:new Float32Array(us), indices:new Uint16Array(idx) };
}
// column-major mat4 × vec4 → [x,y,z,w]
function mulV4(M,x,y,z,w){ return [ M[0]*x+M[4]*y+M[8]*z+M[12]*w, M[1]*x+M[5]*y+M[9]*z+M[13]*w, M[2]*x+M[6]*y+M[10]*z+M[14]*w, M[3]*x+M[7]*y+M[11]*z+M[15]*w ]; }

// v966 — restore the lost mountStage() declaration. A prior edit dropped the
// function header, leaving the entire body at module top level → "Illegal
// return statement" at parse time, which broke the avatar stage on EVERY page
// that imports it (phone control.html, the KPop avatar window, the PC mini
// stamp). Named export (control.html does `const { mountStage } = await import`)
// plus the existing `export default mountStage` at the bottom.
export function mountStage(canvas, opts = {}){
  const url = opts.url || "RobotExpressive";
  let scene = opts.scene || "diorama";   // v895 — "diorama" | "wave" | "cradle"
  // v1017 — aspect-stable diorama framing: fit the room/gauges/avatar against a
  // FIXED reference aspect (the phone fidget-scene), not the live canvas aspect,
  // so phone / PC-full / PC-semi all render at the same scale and objects map to
  // the same screen spot. Tunable via opts.frameAspect or ?frame= ; clamped so a
  // wider canvas just reveals more room (never crops the 3 gauges).
  // v1508 — by default the diorama now FILLS the live canvas (cap dropped). An explicit
  // opts.frameAspect (or ?frame=) still re-imposes a fixed reference aspect if you want the old
  // "same scale across phone/full/semi" stability back; null means fill.
  const _fixedFrame = (typeof opts.frameAspect==="number" && opts.frameAspect>0.3 && opts.frameAspect<3) ? opts.frameAspect : null;
  const DIORAMA_FRAME_ASPECT = _fixedFrame || 0.80;
  // Gauge actors: opts.gauges = [{ style:"ring"|"gyro"|"barrel"|"wave"|"voxelbarrel"|"wormhole"|"blackhole", getValue:()=>0..1, color:[r,g,b] }].
  // Back-compat: a single ring from opts.getValue/ringColor (R1 shape).
  let gaugeDefs = Array.isArray(opts.gauges) ? opts.gauges.slice(0, 4) : null;
  if (!gaugeDefs) gaugeDefs = [{ style:"ring", getValue: (typeof opts.getValue==="function"?opts.getValue:()=>0), color: opts.ringColor || [0.35,0.78,1.0] }];
  const gl = canvas.getContext("webgl2", { alpha:true, antialias:true, premultipliedAlpha:false, preserveDrawingBuffer:true });   // v1018 - non-blank selfie capture
  if(!gl) return { destroy(){}, ok:false };

  const aProg=_link(gl,A_VERT,A_FRAG), gProg=_link(gl,G_VERT,G_FRAG), wProg=_link(gl,W_VERT,W_FRAG), sProg=_link(gl,S_VERT,S_FRAG);
  const spProg=_link(gl,SPACETIME_VERT,SPACETIME_FRAG);   // v2433 -- spacetime gauge portholes (wormhole / blackhole)
  const AU=(n)=>gl.getUniformLocation(aProg,n), GU=(n)=>gl.getUniformLocation(gProg,n), WU=(n)=>gl.getUniformLocation(wProg,n), SU=(n)=>gl.getUniformLocation(sProg,n);
  const aU={ vp:AU("uViewProj"), model:AU("uModel"), joints:AU("uJointMatrices"), hasSkin:AU("uHasSkin"),
    tint:AU("uTint"), base:AU("uBaseColor"), hasTex:AU("uHasTexture"), hasVC:AU("uHasVColor"), tex:AU("uTex"),
    ovr:AU("uColorOverride"), ovrAmt:AU("uColorOverrideAmt") };
  const gU={ vp:GU("uViewProj"), model:GU("uModel"), fill:GU("uFill"), fillC:GU("uFillColor"), trackC:GU("uTrackColor"), discard:GU("uDiscard") };
  const wU={ vp:WU("uViewProj"), model:WU("uModel"), time:WU("uTime"), level:WU("uLevel"), amp:WU("uAmp"), color:WU("uColor"), alpha:WU("uAlpha") };
  const sU={ vp:SU("uViewProj"), model:SU("uModel"), tex:SU("uTex"), mode:SU("uMode") };
  const SPU=(n)=>gl.getUniformLocation(spProg,n);
  const spU={ vp:SPU("uViewProj"), model:SPU("uModel"), time:SPU("uTime"), value:SPU("uValue"), mode:SPU("uMode"), color:SPU("uColor") };
  const getScreenCanvas = (typeof opts.getScreenCanvas==="function") ? opts.getScreenCanvas : null;
  let _t0 = performance.now();

  let raf=0, destroyed=false, paused=false, extPaused=false, mesh=null, animator=null, rawBBox=null, lastT=0, lastDraw=0;
  let _visorMode=false, _visorEl=null, _visorCfg={ color:"#7fe9ff", eyeColor:"#bff3ff", eyes:true, reticle:true, scan:true, cy:38 };   // v1364 — visor HUD
  let _vocBars=null, _jawIdx=-1, _jawLevel=0, _extTalkLevel=-1, _extTalkT=0;   // v1366 — talking: vocoder bars + jaw drive
  // v1386 — per-model jaw open axis/sign/amplitude (the X axis was a guess). Overridable
  // live via setJaw(...) and remembered per model so the fix sticks on reload.
  let _jawAxis=[1,0,0], _jawSign=1, _jawAmp=0.5, _curAvatarKey="";
  const _jawByModel={};
  const _axisVec=(a)=>{ if(Array.isArray(a)&&a.length===3) return [a[0],a[1],a[2]]; if(a===0)return[1,0,0]; if(a===1)return[0,1,0]; if(a===2)return[0,0,1]; return null; };
  const _TWO_PI=Math.PI*2;   // v1370 — idle-life effect channels (blink + ambient bone nudges)
  let _fx={ blink:{on:false},
            breathe:{on:false, match:/spine|chest|breast|torso/i, idxs:null, axis:[1,0,0], amp:0.035, freq:0.40},
            earwig: {on:false, match:/ear/i,                       idxs:null, axis:[0,0,1], amp:0.16,  freq:1.30},
            tailwag:{on:false, match:/tail/i,                      idxs:null, axis:[0,1,0], amp:0.30,  freq:1.90},
            headbob:{on:false, match:/head|neck/i,                 idxs:null, axis:[1,0,0], amp:0.045, freq:0.60} };
  let _talkUntil=0, _talkAmt=0, _headView=false, _lastPubTalk=false;   // v990/1393 — talk-head zoom + avatar->world talk publish
  let _selfieT0=0, _selfieDur=2400, _selfieAmt=0, _selfieFlashed=false, _capturePending=false;   // v991/1018 — selfie + capture
  // v992 — assignable on-click action (small viewer / fidget cycler: advance).
  let _onClick=null;
  if(typeof opts.onClick==="function"){ _onClick=(ev)=>{ try{ opts.onClick(ev); }catch{} }; canvas.addEventListener("click",_onClick); }
  let walkIdx=-1, idleIdx=-1;
  // v1221 — cheerleader mode: pom-poms pinned to the hand bones + a cheer clip.
  let cheerIdx=-1, _cheer=false, _cheerT=0, _handIdx, pomVAO=null;
  // v1224 — mood + quips + selectable pom-pom style.
  let _pomStyle="classic", _mood="support", _moodScore=1, _moodReason="", _moodT=0, _lastQuipAt=0;
  // v1225 — pom-pom particle sparks (in the avatar's own GL context).
  let sparkVAO=null, _partsOn=true; const _parts=[];
  // v1227 — juggle mode: N pom-poms arc between the hands (1 avatar) or pass
  // between two avatars (duo scene).
  let _juggle=false, _juggleN=3, _jt=0; const _balls=[]; let _juggleObj="pom";   // pom | ball | gauge
  // v1229 — duo tennis/pickleball rally + solo bowling.
  let _rally=false; const rallyBall={ t:0, from:0, to:1, dur:0.85 };
  // v1250 — paddle-play fatigue: they never miss, rally slows as they tire, then stop.
  let _rallyStamina=1, _rallyExhausted=false, _rallyTireSecs=80; const rallyHits={ n:0 };
  let _bowl=false, _bowlResetAt=0; const pins=[]; const bowlBall={ active:false, x:0, y:0.14, z:0, vx:0, vz:0 };
  // v1291 — soccer fidget: a tiny match that stays centred on the ball + stops after a goal.
  let _soccer=false, _soccerEndAt=0;
  const soccer={ ball:{ x:0, z:0, vx:0, vz:0 }, players:[], goalW:0.28, pw:0.5, pl:1.0, scored:0, ready:false };
  // v1529 — worn/held GLB accessories: attach a tagged library GLB to a bone (head/hand/foot).
  // Settings-driven (Avatar Settings -> Accessories): demoChrome passes opts.accessories.
  let _accCfg = (opts.accessories && typeof opts.accessories==="object") ? opts.accessories : {};   // { head:{on,url,scale,lift,fwd}, hand:{...,side}, foot:{...,side} }
  const _accAv = { head:undefined, hand:undefined, foot:undefined };   // undefined=unloaded · 'pending' · null=none/failed · {url,mesh,norm,cx,cy,cz}
  let _accHeadIdx, _accFootIdx;                                         // cached bone indices (mirror _handIdx)
  const _ACC_BASE = { head:0.22, hand:0.40, foot:0.14 };               // default world max-extent per slot; the scale knob multiplies it
  // v1242 — cinematic camera: drone orbit, llama-flight first-person POV, hoop gauge.
  let _droneCam=false, _droneSpeed=0.32, _llamaCam=false, _hoop=false;
  // v1243 — follow-ons: subject-tracking orbit, llama-cam auto-focus, hoop course.
  let _droneTrack=true, _droneCx=null;                       // orbit eases to follow the wandering host
  let _llamaCamFocus=true, _llamaOwnsScene=false;            // llama-cam auto-switches to the focus scene
  let _hoopList=[{x:0,y:0.72,z:0.30,r:1.5}], _hoopIdx=0;    // configurable ring course (slalom when >1)
  let _pipFocusOwn=false;                                    // v1253 (#11) — true while pip-boy/starfield display forces the focus pose
  // ---- lay the gauge actors out in a row to the avatar's right ----
  // v970 — declared HERE (was below at its old line ~498) because the
  // wander/glance state just below references `actors`. The v966 header
  // restore had left this block after its first use → "Cannot access
  // 'actors' before initialization" (TDZ) on every diorama mount.
  const n = gaugeDefs.length;
  // v1875 — compact dock preset: the top-center docked panel is an ultra-wide, short canvas, so the
  // normal wide roaming diorama frames the wandering avatar off to one side (cropped) with the gauges
  // in a tiny box. In compact mode we pull the gauges close together and centered, pin the avatar in
  // the middle of them (still animating/reacting), and frame the camera for the short-wide canvas so
  // the avatar + 3 gauges + llama all sit together as one group.
  const _compact = !!opts.compact;
  const SPACING = _compact ? 0.62 : 0.85;
  const X0 = _compact ? (-(n - 1) * 0.62 / 2) : 0.15;   // compact: center the gauge row on x=0
  const actors = gaugeDefs.map((g, i) => {
    // v1361 — free placement: opts.gauges[i].pos = { x, z } overrides the auto-row (x = X0+i*SPACING, z = 0).
    const px = (g.pos && typeof g.pos.x === "number") ? g.pos.x : (X0 + i * SPACING);
    const pz = (g.pos && typeof g.pos.z === "number") ? g.pos.z : 0;
    return {
      style: g.style || "ring",
      getValue: typeof g.getValue === "function" ? g.getValue : () => 0,
      color: Array.isArray(g.color) ? g.color : [0.35,0.78,1.0],
      x: px, z: pz,
      spin: 0,   // gyro accumulator
      _lift: 0, _liftY: 0, _drawX: px,   // v1010 — dial pickup: lift ramp + carried position
    };
  });
  const sceneMaxX = actors.length ? (X0 + (n-1)*SPACING + 0.45) : 0.6;
  // v894 — wander/glance behavior. The avatar patrols toward whichever gauge is
  // hottest (or just spiked) and turns to face it.
  const roamMin = -0.6, roamMax = actors.length ? Math.max(-0.4, actors[actors.length-1].x - 0.55) : 0.4;
  const A = { x: roamMin, z: 0.35, yaw: 0, desiredYaw: 0, targetX: roamMin, moving: false, clip: -1, retargetAt: 0, prev: actors.map(()=>0), look: 0, carry: -1, _wantPick: -1, pickupAt: 6, carryUntil: 0 };
  // v1011 — GRABBABLE REGISTRY. The pickup loop fetches from `grabbables`, not
  // `actors`: the dials are grabbable by default and extras (orb / splat / GLB
  // prop) push on. The avatar still WATCHES only the gauges (`actors`).
  const grabbables = actors.slice();
  const surf = { bob: 0, lean: 0, turn: 0 };   // v979 — surf scene pose
  // v928 — two-avatar "duo" scene state. Self-contained; does not touch the single-avatar path.
  const url2 = opts.url2 || "RobotWoman";
  let duoA=null, duoB=null, duoReady=false, studioB=null;   // v1528 — studio: persistent 2nd avatar
  const ACTS=["dance","highfive","spar","hug"];
  const duo={ phase:"approach", t:0, actI:0, wanders:0 };
  let _peerVisitUntil = 0;   // v1614 — while >now, a peer-announcement cameo visit is in progress
  let _visitAlarm = false;   // v1615 — the VISITOR (only) flashes red + frantic during a cameo
  let _visitorAv = null;     // v1615 — which avatar is the visitor (duoB or studioB)
  let _studioWalkIn = false; // v1615 — studio scene: walk the 2nd avatar in from off-stage on a visit
  let _peerAvCache = {};     // v1639 — url -> built peer avatar (reused across visits; no rebuild, no leak)
  let _origVisitor = null;   // v1639 — {slot, av} saved when a real peer avatar is swapped into the visitor slot
  // v934 — wandering 3D pet llama, gated by opts.pet (phone passes pet:true so the
  // PC diorama is unaffected). Built from primitives, drawn with gProg.
  const petEnabled = !!opts.pet;
  const pet = { x:0.5, z:0.15, yaw:0, tx:0.5, tz:0.15, retargetAt:0, moving:false, fetch:"none", buryX:0, buryZ:0, buryT:0, flightY:0 };
  let fetchBall=null;   // v1228 — the thrown ball the llama fetches + buries
  const WALK_SPEED = 0.95, TARGET_INTERVAL = 4.2, SPIKE_DELTA = 0.28;
  const val0 = () => { let v = (gaugeDefs[0] && gaugeDefs[0].getValue && gaugeDefs[0].getValue()) || 0; return v<0?0:(v>1?1:v); };
  const col0 = (gaugeDefs[0] && gaugeDefs[0].color) || [0.35,0.78,1.0];
  let cradlePhase = 0;
  // v900 — pendulum wave: N pendulums of physics-tuned lengths so pendulum i does
  // (N0+i) oscillations per cycle T; they drift in/out of phase into snake/wave patterns.
  const PW = (() => {
    const N=15, T=30, N0=20, A=0.52, topY=1.15, gap=0.13;
    const G=0.95 * Math.pow(2*Math.PI*N0/T, 2);   // so the longest (i=0) length ≈ 0.95
    const w=[], L=[], x=[], col=[];
    for(let i=0;i<N;i++){
      const om=2*Math.PI*(N0+i)/T; w.push(om); L.push(G/(om*om));
      x.push(-(N-1)*gap/2 + i*gap); col.push(hsl2rgb(i/N*0.85, 0.7, 0.58));
    }
    return { N, A, topY, gap, w, L, x, col };
  })();
  // v901 — interactive gear train (only built/wired in the "gears" scene)
  const GEARS = []; let gearGeos = null, gearLastVP = null, gearPointer = null, compRunning = null;
  if(scene==="gears"){
    const defs=[
      {x:-0.656,y:0.78, r:0.30,teeth:12},
      {x:-0.186,y:0.609,r:0.20,teeth:8},
      {x: 0.231,y:0.803,r:0.26,teeth:10},
      {x: 0.612,y:0.583,r:0.18,teeth:7},
    ];
    gearGeos = defs.map(d=> makeVAO(buildGear(d.r*1.10, d.r*0.80, d.teeth, 0.12)));
    for(let i=0;i<defs.length;i++) GEARS.push({ ...defs[i], angle:Math.random()*0.6, ratio:1, sign:1, comp:-1, hue:i/defs.length });
    const adj = GEARS.map(()=>[]);
    for(let i=0;i<GEARS.length;i++) for(let j=i+1;j<GEARS.length;j++){
      const d=Math.hypot(GEARS[i].x-GEARS[j].x, GEARS[i].y-GEARS[j].y);
      if(Math.abs(d-(GEARS[i].r+GEARS[j].r))<0.06){ adj[i].push(j); adj[j].push(i); }
    }
    GEARS._adj = adj;
    let cid=0;
    for(let i=0;i<GEARS.length;i++){ if(GEARS[i].comp>=0) continue; const st=[i]; GEARS[i].comp=cid; while(st.length){ const u=st.pop(); for(const w of adj[u]) if(GEARS[w].comp<0){ GEARS[w].comp=cid; st.push(w); } } cid++; }
    compRunning = new Array(cid).fill(false);
    gearPointer = (e)=>{
      if(!gearLastVP) return; e.stopPropagation();
      const rect=canvas.getBoundingClientRect();
      const cxN=(e.clientX-rect.left)/rect.width*2-1, cyN=-((e.clientY-rect.top)/rect.height*2-1);
      let best=-1, bestD=1e9;
      for(let i=0;i<GEARS.length;i++){ const g=GEARS[i];
        const cc=mulV4(gearLastVP,g.x,g.y,0,1); if(cc[3]<=0) continue; const nx=cc[0]/cc[3], ny=cc[1]/cc[3];
        const ec=mulV4(gearLastVP,g.x+g.r,g.y,0,1); const pr=Math.hypot(ec[0]/ec[3]-nx, ec[1]/ec[3]-ny);
        const d=Math.hypot(cxN-nx, cyN-ny);
        if(d<pr && d<bestD){ bestD=d; best=i; }
      }
      if(best>=0){ const c=GEARS[best].comp; if(compRunning[c]) compRunning[c]=false; else startTrain(best); }
    };
    canvas.addEventListener("pointerdown", gearPointer);
  }
  function startTrain(driver){
    const c=GEARS[driver].comp; compRunning[c]=true;
    for(const g of GEARS) if(g.comp===c){ g.ratio=GEARS[driver].r/g.r; g.sign=0; }
    GEARS[driver].sign=1; const seen=new Array(GEARS.length).fill(false); seen[driver]=true; const q=[driver];
    while(q.length){ const u=q.shift(); for(const w of GEARS._adj[u]) if(!seen[w]){ seen[w]=true; GEARS[w].sign=-GEARS[u].sign; q.push(w); } }
  }
  // v899 — 3D boids flock (built once; simulated each frame in the boids scene)
  const NB = 60, BOX = { cx:0, cy:0.78, cz:0, hx:1.0, hy:0.60, hz:1.0 };
  const boids = [];
  for(let i=0;i<NB;i++){
    boids.push({
      p:[ BOX.cx+(Math.random()*2-1)*BOX.hx, BOX.cy+(Math.random()*2-1)*BOX.hy, BOX.cz+(Math.random()*2-1)*BOX.hz ],
      v:[ (Math.random()*2-1)*0.4, (Math.random()*2-1)*0.2, (Math.random()*2-1)*0.4 ],
    });
  }
  const costumes=getCostumes();
  const MIN_DT = 1000/30;   // ~30fps throttle

  // ---- shared procedural geometry (built once) ----
  function makeVAO(geo){
    const vao=gl.createVertexArray(); gl.bindVertexArray(vao);
    const b=(loc,data,n)=>{ const bb=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,bb); gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,n,gl.FLOAT,false,0,0); };
    b(0,geo.positions,3); b(1,geo.normals,3); b(2,geo.us,1);
    const ib=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,geo.indices,gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count:geo.indices.length };
  }
  const GEO = {
    dial:   makeVAO(buildRing(0.40, 0.095, 56, 10)),  // ring-dial track + fill arc
    gimbal: makeVAO(buildRing(0.38, 0.045, 44, 8)),   // thin gyro gimbal / barrel hoop
    cyl:    makeVAO(buildCylinder(0.30, 1.0, 26)),     // barrel shell / liquid (unit height)
    disc:   makeVAO(buildCylinder(0.26, 0.09, 20)),    // gyro rotor / barrel base
    voxel:  makeVAO(buildVoxelColumn(6, 3, 0.15, 0.30)), // liquid-voxel column
    ball:   makeVAO(buildSphere(0.16, 12, 16)),          // Newton's-cradle ball
    cone:   makeVAO(buildCone(0.045, 0.17, 6)),          // boid dart (+Z)
    box:    makeVAO(buildBox()),                         // v1013 — room floor/walls
  };
  pomVAO = makeVAO(buildPomPom(POM_STYLES[_pomStyle]));   // v1221/1224 — cheerleader pom-pom (styled)
  sparkVAO = makeVAO(buildSphere(0.022, 6, 8));            // v1225 — particle spark
  // wave surface uses only position (location 0)
  const _grid = buildGrid(16, 1.0);
  const gridVAO = gl.createVertexArray(); gl.bindVertexArray(gridVAO);
  { const b=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,b); gl.bufferData(gl.ARRAY_BUFFER,_grid.positions,gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);
    const ib=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,_grid.indices,gl.STATIC_DRAW); }
  gl.bindVertexArray(null);
  const GRID = { vao: gridVAO, count: _grid.indices.length };
  // v897 — screen quad (pos@0, uv@1) + live-canvas texture
  const _q = buildQuad();
  const quadVAO = gl.createVertexArray(); gl.bindVertexArray(quadVAO);
  { const pb=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,pb); gl.bufferData(gl.ARRAY_BUFFER,_q.pos,gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);
    const ub=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,ub); gl.bufferData(gl.ARRAY_BUFFER,_q.uv,gl.STATIC_DRAW); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,2,gl.FLOAT,false,0,0);
    const ib=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,_q.idx,gl.STATIC_DRAW); }
  gl.bindVertexArray(null);
  const QUAD = { vao: quadVAO, count: _q.idx.length };
  const screenTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, screenTex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([10,12,18,255]));
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D,null);
  // v898 — OGRE carrier mesh (boat / sub / flying), parsed from carrierAssets OBJ
  const carrierId = opts.carrier || "boat";
  let carrierGeo = null;
  { const OBJ = { boat:OGRE_BOAT_OBJ, sub:OGRE_SUB_OBJ, flying:OGRE_FLYING_OBJ }[carrierId] || OGRE_BOAT_OBJ;
    try { carrierGeo = makeVAO(parseOBJ(OBJ)); } catch(e){ carrierGeo = null; } }
  const TRACK = [0.12, 0.15, 0.20];

  // ---- visibility / offscreen pause ----
  let onScreen=true;
  let io=null;
  try { io=new IntersectionObserver((es)=>{ onScreen = es.some(e=>e.isIntersecting); }, { threshold:0.01 }); io.observe(canvas); } catch {}
  const onVis=()=>{ paused = document.hidden; };
  document.addEventListener("visibilitychange", onVis);

  function destroy(){
    destroyed=true; if(raf) cancelAnimationFrame(raf);
    try{ _visorEl && _visorEl.remove(); _visorEl=null; }catch(e){}   // v1364
    try{ clearInterval(_moodPoll); }catch(e){}   // v1224 — stop the mood poll
    document.removeEventListener("visibilitychange", onVis);
    try{ gearPointer && canvas.removeEventListener("pointerdown", gearPointer); }catch{}
    try{ _onClick && canvas.removeEventListener("click", _onClick); }catch{}
    try{ io && io.disconnect(); }catch{}
    // v1009 — DO NOT loseContext(): mountScene re-uses this same canvas, so
    // losing it makes the next getContext() hand back a dead context and every
    // shader compiles to null (the "[avatarStage] shader: null" x8 churn). Just
    // delete the programs so they don't pile up; the context stays reusable.
    try{ [aProg,gProg,wProg,sProg].forEach(p => { try{ gl.deleteProgram(p); }catch{} }); }catch{}
  }

  (async function load(){
    if(scene!=="diorama" && scene!=="screen" && scene!=="surf" && scene!=="focus") return;   // these scenes show the avatar
    // v1003 — robust load. The v994 fallback only fired on a FETCH failure, so a
    // primary asset that returned 200 but failed to PARSE (e.g. /avatar/current
    // serving an unsupported GLB) left mesh=null and the avatar silently vanished
    // while the primitive pet still drew. Now we chain primary → RobotExpressive
    // → test_rig across BOTH fetch and parse failures so something always draws.
    // The console lines below say exactly which asset won (or why each lost).
    const _FALLBACKS=["/GPU_Assets/RobotWoman.glb","/GPU_Assets/test_rig.glb","/GPU_Assets/RobotExpressive.glb"];   // v1004 — engine-native rigs first (skin/scale reliably); RobotExpressive last
    const _tryFetch=async(u)=>{ try{ const r=await fetch(u); if(r.ok) return await r.arrayBuffer(); }catch{} return null; };
    const _candidates=[...new Set([_resolveUrl(url), ..._FALLBACKS])];
    let parsed=null, _loadedPath=null;
    for(const cand of _candidates){
      if(destroyed) return;
      const buf=await _tryFetch(cand);
      if(!buf){ console.warn("[avatarStage] fetch failed:",cand); continue; }
      try{ parsed=await GLBParser.parse(buf,{ baseUrl:new URL(cand,location.href).href }); _loadedPath=cand; console.info("[avatarStage] loaded avatar:",cand); break; }
      catch(e){ console.warn("[avatarStage] parse failed:",cand,e?.message,"— trying next"); }
    }
    if(!parsed || destroyed) return;
    const _fellBack=(_loadedPath!==_candidates[0]);   // v1016 clean-house: primary missing/parse-failed, a fallback rig is drawing
    try{ if(typeof opts.onAvatarLoaded==="function") opts.onAvatarLoaded(_loadedPath, url, _fellBack); }catch{}

    const vao=gl.createVertexArray(); gl.bindVertexArray(vao);
    const buf3=(loc,data,n)=>{ const b=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,b); gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,n,gl.FLOAT,false,0,0); };
    buf3(0,parsed.positions,3);
    if(parsed.normals) buf3(1,parsed.normals,3); else gl.vertexAttrib3f(1,0,1,0);
    const hasSkin=!!(parsed.skin&&parsed.joints&&parsed.weights);
    if(hasSkin){ const jb=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,jb); gl.bufferData(gl.ARRAY_BUFFER,parsed.joints,gl.STATIC_DRAW); gl.enableVertexAttribArray(2); const jt=parsed.joints instanceof Uint8Array?gl.UNSIGNED_BYTE:gl.UNSIGNED_SHORT; gl.vertexAttribIPointer(2,4,jt,0,0); buf3(3,parsed.weights,4); }
    else { gl.vertexAttribI4ui(2,0,0,0,0); gl.vertexAttrib4f(3,0,0,0,0); }
    const hasVColor=!!(parsed.colors&&parsed.colors.length===parsed.positions.length);
    if(hasVColor) buf3(4,parsed.colors,3); else gl.vertexAttrib3f(4,0.8,0.82,0.88);
    if(parsed.texCoords) buf3(5,parsed.texCoords,2); else gl.vertexAttrib2f(5,0,0);
    const ib=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,parsed.indices,gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    let texture=null;
    if(parsed.texture instanceof HTMLImageElement||parsed.texture instanceof ImageBitmap){ texture=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,texture); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,parsed.texture); gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR); }
    mesh={ vao, indexCount:parsed.indices.length, hasSkin, hasVColor, texture };

    let mnX=Infinity,mnY=Infinity,mnZ=Infinity,mxX=-Infinity,mxY=-Infinity,mxZ=-Infinity;
    const p=parsed.positions;
    for(let i=0;i<p.length;i+=3){ if(p[i]<mnX)mnX=p[i]; if(p[i]>mxX)mxX=p[i]; if(p[i+1]<mnY)mnY=p[i+1]; if(p[i+1]>mxY)mxY=p[i+1]; if(p[i+2]<mnZ)mnZ=p[i+2]; if(p[i+2]>mxZ)mxZ=p[i+2]; }
    rawBBox={ minX:mnX,minY:mnY,minZ:mnZ,maxX:mxX,maxY:mxY,maxZ:mxZ };

    try{ animator=new SkeletalAnimator(parsed); if(animator.animations&&animator.animations.length){ let idx=animator.animations.findIndex(a=>/idle|breath|stand/i.test(a.name||"")); idleIdx = idx>=0?idx:0; walkIdx = animator.animations.findIndex(a=>/walk/i.test(a.name||"")); cheerIdx = animator.animations.findIndex(a=>/dance|wave|cheer|jump|excit|celebrat|hooray|yes/i.test(a.name||"")); animator.setClip(idleIdx,0); A.clip=idleIdx; } }catch(e){ animator=null; }
    try{ _wireJaw(); }catch(e){}   // v1366 — detect a jaw bone on the main avatar

    lastT=performance.now(); raf=requestAnimationFrame(frame);
  })();

  // v928 — duo loader: build both avatars, then start the loop.
  (async function loadDuo(){
    if(scene!=="duo" && scene!=="guest") return;
    duoA = await buildAvatarFrom(url); if(destroyed) return;
    duoB = await buildAvatarFrom(url2); if(destroyed) return;
    if(scene==="guest"){
      // v1039 — "guest visit": A is the resident (stays put, near center,
      // facing forward); B is the visitor who waits off-stage right, walks in,
      // greets, then leaves — your main avatar is left alone between visits.
      if(duoA){ duoA.st.x=-0.20; duoA.st.yaw=0; }
      if(duoB){ duoB.st.x= 2.80; duoB.st.yaw=-Math.PI/2; }   // offscreen right
      duo.phase="away"; duo.t=3.0;                            // short beat, then enter
    } else {
      // v1509 — handoff narrative: A (your current avatar) starts resident on screen; B (the
      // different avatar) waits off-stage right and walks in. A then walks off after they meet.
      if(duoA){ duoA.st.x=-0.30; duoA.st.yaw=0; }
      if(duoB){ duoB.st.x= 2.70; duoB.st.yaw=-Math.PI/2; }   // offscreen right
      duo.phase="enterB"; duo.t=0; duo.actI=0; duo._mAct=0; duo._bAct=null;
    }
    duoReady = !!(duoA||duoB);
    lastT=performance.now(); raf=requestAnimationFrame(frame);
  })();
  // v1528 — "studio" scene: a SECOND persistent rigged avatar that stands & idles at the
  // right while the main avatar wanders the 3D gauges and the pet llama roams. Unlike duo/
  // guest this is NOT a transition — both avatars just stay on screen together.
  (async function loadStudio(){
    if(scene!=="studio") return;
    studioB = await buildAvatarFrom(url2); if(destroyed) return;
    if(studioB){ studioB.st.x = 1.30; studioB.st.z = 0.10; studioB.st.yaw = -0.55; setClipSafe(studioB, studioB.idle); }
    if(!raf){ lastT=performance.now(); raf=requestAnimationFrame(frame); }
  })();
  // v894 — wander + glance behavior.
  function hottestGauge(){
    let hi=-1, hv=-1;
    for(let i=0;i<actors.length;i++){ let v=actors[i].getValue(); if(!(v>=0))v=0; if(v>1)v=1; if(v>hv){hv=v; hi=i;} }
    return { idx: hi, val: hv };
  }
  function updateAvatar(dt, tSec){
    if(!actors.length) return;
    // spike detection: a gauge that jumped a lot grabs attention immediately
    let spiked=-1;
    for(let i=0;i<actors.length;i++){ let v=actors[i].getValue(); if(!(v>=0))v=0; if(v>1)v=1; if(v - A.prev[i] > SPIKE_DELTA) spiked=i; A.prev[i]=v; }
    const hot=hottestGauge();
    // v1010 — DIAL PICKUP. Ramp every dial's lift (carried one rises + tucks to
    // the avatar; the rest settle home), then occasionally walk to a dial, grab
    // it, hold ~3s, and set it down. Only runs with >=1 visible dial (early
    // return above). The same walk-to → lift mechanism generalizes to any
    // grabbable (a splat prop, a GLB, etc.) — see notes.
    for(let i=0;i<grabbables.length;i++){ const a=grabbables[i];
      if(A.carry===i){ a._lift=Math.min(1,a._lift+dt*2.2); a._drawX += (A.x - a._drawX)*Math.min(1,dt*4); }
      else { a._lift=Math.max(0,a._lift-dt*2.2); a._drawX += (a.x - a._drawX)*Math.min(1,dt*4); }
      a._liftY = a._lift*0.62;   // rise to ~hand/chest height
    }
    const inPickup = (A.carry>=0 || A._wantPick>=0);
    if(A.carry<0 && A._wantPick<0 && tSec>=A.pickupAt){            // v1011 — fetch ANY grabbable (dial / orb / future splat-GLB)
      const i = Math.random()*grabbables.length|0;
      A._wantPick=i; A.focus=i; A.targetX = Math.max(roamMin, grabbables[i].x - 0.32); A.retargetAt = tSec + 1e4;
    }
    if(A._wantPick>=0 && A.carry<0 && Math.abs(A.targetX - A.x) < 0.09){   // arrived → grab
      A.carry=A._wantPick; A._wantPick=-1; A.carryUntil=tSec+3.0;
    }
    if(A.carry>=0 && tSec>=A.carryUntil && grabbables[A.carry] && grabbables[A.carry]._lift<0.05){   // set down → resume wander
      A.carry=-1; A.pickupAt=tSec+9+Math.random()*7; A.retargetAt=tSec;
    }
    // v1252 — mood paces retargeting: alarmed darts about (short interval), souring
    // lingers (long interval), beyond the existing timeScale + walk-speed pacing.
    const RT = TARGET_INTERVAL * (_mood==="alarm" ? 0.45 : _mood==="souring" ? 1.8 : 1.0);
    if(spiked>=0 && !inPickup){ A.targetX = clamp(actors[spiked].x - 0.7, roamMin, roamMax); A.retargetAt = tSec + RT; A.focus = spiked; }
    else if(tSec >= A.retargetAt && !inPickup){
      const pick = (hot.val < 0.1) ? (Math.random()*actors.length|0) : hot.idx;
      A.targetX = clamp(actors[pick].x - 0.7, roamMin, roamMax); A.retargetAt = tSec + RT; A.focus = pick;
    }
    if(_visorMode){ A.targetX=(roamMin+roamMax)/2; A.focus=null; A._wantPick=-1; }   // v1364 — pin front-and-centre
    if(_compact){ A.targetX = 0; A._wantPick = -1; }   // v1875 — dock: stand centered among the gauges (still glances/animates)
    // move toward target
    const dx = A.targetX - A.x, dist = Math.abs(dx);
    if(dist > 0.05){
      A.x += Math.sign(dx) * Math.min(dist, WALK_SPEED*(_mood==="alarm"?1.6:_mood==="souring"?0.6:1.0)*dt);   // v1226 — mood paces the moose
      A.moving = true;
      A.desiredYaw = Math.sign(dx) * 0.8;                 // face travel direction
    } else {
      A.moving = false;
      const f = (A.focus!=null && actors[A.focus]) ? actors[A.focus].x : (hot.idx>=0?actors[hot.idx].x:A.x);
      A.desiredYaw = clamp((f - A.x) * 1.2, -0.7, 0.7) || 0;   // glance toward the gauge
    }
    if(_visorMode) A.desiredYaw = 0;   // v1364 — face forward in visor mode
    // smooth turn
    A.yaw += (A.desiredYaw - A.yaw) * Math.min(1, dt*6);
    // clip switch (walk while moving, idle while stopped)
    const want = (A.moving && walkIdx>=0) ? walkIdx : idleIdx;
    if(animator && !_cheer && want>=0 && A.clip!==want){ try{ animator.setClip(want, 0.22); }catch{} A.clip=want; }
  }
  function clamp(v,a,b){ return v<a?a:(v>b?b:v); }

  // v1011 — register a grabbable. {x, draw(g,vp,dt,tSec)} for a custom prop, or
  // {x, color} for the built-in glowing orb. Returns the grabbable.
  function _grabOrbDraw(color){
    const c = Array.isArray(color) ? color : [0.45,0.85,1.0];
    return (g, vp, dt, tSec) => {
      gl.useProgram(gProg); gl.uniformMatrix4fv(gU.vp,false,vp); gl.uniform1i(gU.discard,0);
      gl.uniform3f(gU.trackC,TRACK[0],TRACK[1],TRACK[2]); gl.uniform1f(gU.fill,2.0);
      const bob = Math.sin(tSec*1.6 + g.x*3) * 0.05 * (1 - g._lift);
      gl.uniform3f(gU.fillC,c[0],c[1],c[2]);
      gl.bindVertexArray(GEO.ball.vao);
      gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(g._drawX, 0.42 + g._liftY + bob, (g.z||0)), mScale(0.18,0.18,0.18)));   // v1361 — z = free placement depth
      gl.drawElements(gl.TRIANGLES,GEO.ball.count,gl.UNSIGNED_SHORT,0);
      gl.bindVertexArray(null);
    };
  }
  // v1012 — fit a GLB prop: height-normalize to ~0.55, sit feet on y=0, place at
  // the grabbable's carried (x, liftY). Mirrors avatarModelFor but smaller.
  function _propModel(av, g){
    const b=av.rawBBox; if(!b) return mTranslate(g._drawX, g._liftY, 0);
    let rot; try{ rot=avatarOrientation.buildMatrix(avatarOrientation.get(av.url)); }catch{ rot=mIdent(); }
    const cs=[[b.minX,b.minY,b.minZ],[b.maxX,b.minY,b.minZ],[b.minX,b.maxY,b.minZ],[b.maxX,b.maxY,b.minZ],[b.minX,b.minY,b.maxZ],[b.maxX,b.minY,b.maxZ],[b.minX,b.maxY,b.maxZ],[b.maxX,b.maxY,b.maxZ]];
    let mnY=Infinity,mxY=-Infinity,mnX=Infinity,mxX=-Infinity,mnZ=Infinity,mxZ=-Infinity;
    for(const[x,y,z]of cs){ const ry=rot[1]*x+rot[5]*y+rot[9]*z; if(ry<mnY)mnY=ry; if(ry>mxY)mxY=ry; const rx=rot[0]*x+rot[4]*y+rot[8]*z, rz=rot[2]*x+rot[6]*y+rot[10]*z; if(rx<mnX)mnX=rx;if(rx>mxX)mxX=rx;if(rz<mnZ)mnZ=rz;if(rz>mxZ)mxZ=rz; }
    const h=(mxY-mnY)||1, s=0.55/h, cxp=(mnX+mxX)/2, czp=(mnZ+mxZ)/2;
    const centerMat=mTRS(-s*cxp, -s*mnY, -s*czp, s);
    return mMul(mTranslate(g._drawX, g._liftY, (g.z||0)), mMul(centerMat, rot));   // v1363 — prop depth
  }
  function _grabGlbDraw(av){
    return (g, vp, dt, tSec) => {
      if(!av || !av.mesh) return;
      gl.useProgram(aProg);
      gl.uniformMatrix4fv(aU.vp,false,vp); gl.uniformMatrix4fv(aU.model,false,_propModel(av,g));
      if(av.animator && av.mesh.hasSkin){ av.animator.update(dt); gl.uniformMatrix4fv(aU.joints,false,av.animator.jointMatrices); gl.uniform1i(aU.hasSkin,1); } else gl.uniform1i(aU.hasSkin,0);
      gl.uniform3f(aU.tint,1,1,1); gl.uniform1f(aU.ovrAmt,0); gl.uniform3f(aU.base,0.80,0.82,0.88);
      gl.uniform1i(aU.hasVC, av.mesh.hasVColor?1:0);
      if(av.mesh.texture){ gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,av.mesh.texture); gl.uniform1i(aU.tex,0); gl.uniform1i(aU.hasTex,1); } else gl.uniform1i(aU.hasTex,0);
      gl.bindVertexArray(av.mesh.vao); gl.drawElements(gl.TRIANGLES,av.mesh.indexCount,gl.UNSIGNED_INT,0); gl.bindVertexArray(null);
    };
  }
  // v1014 — bake a posted splat point set into a voxel-cube cloud mesh (reuses
  // the aProg vColor path; no new shader, no splat-renderer port needed).
  function _buildSplatAv(positions, colors){
    const pos = positions instanceof Float32Array ? positions : new Float32Array(positions || []);
    const colA = colors instanceof Float32Array ? colors : new Float32Array(colors || []);
    let N = (pos.length / 3) | 0; if(N < 1) return null;
    const stride = Math.max(1, Math.floor(N / 1200)), M = Math.floor(N / stride), hs = 0.015;
    const corners=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
    const faces=[0,1,2,0,2,3, 4,6,5,4,7,6, 0,4,5,0,5,1, 1,5,6,1,6,2, 2,6,7,2,7,3, 3,7,4,3,4,0];
    const P=new Float32Array(M*8*3), Nr=new Float32Array(M*8*3), C=new Float32Array(M*8*3), I=new Uint32Array(M*36);
    let mnX=Infinity,mnY=Infinity,mnZ=Infinity,mxX=-Infinity,mxY=-Infinity,mxZ=-Infinity;
    for(let j=0;j<M;j++){
      const i=j*stride, px=pos[i*3], py=pos[i*3+1], pz=pos[i*3+2];
      const r=colA[i*3]||0.7, g=colA[i*3+1]||0.8, b=colA[i*3+2]||0.95;
      if(px<mnX)mnX=px;if(px>mxX)mxX=px;if(py<mnY)mnY=py;if(py>mxY)mxY=py;if(pz<mnZ)mnZ=pz;if(pz>mxZ)mxZ=pz;
      for(let k=0;k<8;k++){
        const vi=j*8+k, c=corners[k], nl=Math.sqrt(c[0]*c[0]+c[1]*c[1]+c[2]*c[2])||1;
        P[vi*3]=px+c[0]*hs; P[vi*3+1]=py+c[1]*hs; P[vi*3+2]=pz+c[2]*hs;
        Nr[vi*3]=c[0]/nl; Nr[vi*3+1]=c[1]/nl; Nr[vi*3+2]=c[2]/nl;
        C[vi*3]=r; C[vi*3+1]=g; C[vi*3+2]=b;
      }
      for(let fI=0;fI<36;fI++) I[j*36+fI]=j*8+faces[fI];
    }
    const vao=gl.createVertexArray(); gl.bindVertexArray(vao);
    const ab=(loc,data,n)=>{ const bb=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,bb); gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,n,gl.FLOAT,false,0,0); };
    ab(0,P,3); ab(1,Nr,3); gl.vertexAttribI4ui(2,0,0,0,0); gl.vertexAttrib4f(3,0,0,0,0); ab(4,C,3); gl.vertexAttrib2f(5,0,0);
    const ib=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,I,gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { url:"splatcloud", mesh:{ vao, indexCount:I.length, hasSkin:false, hasVColor:true, texture:null }, animator:null,
             rawBBox:{minX:mnX,minY:mnY,minZ:mnZ,maxX:mxX,maxY:mxY,maxZ:mxZ} };
  }
  function registerGrabbable(def){
    def = def || {};
    const x = (typeof def.x === "number") ? def.x : (sceneMaxX * 0.4);
    const g = { x, z:(typeof def.z === "number" ? def.z : 0), _lift:0, _liftY:0, _drawX:x, draw:null, label: def.label || def.glb || def.kind || "orb" };   // v1363 — prop depth
    if(typeof def.draw === "function") g.draw = def.draw;                              // custom prop
    else if(def.glb){ buildAvatarFrom(def.glb).then(av => { if(av && av.mesh) g.draw = _grabGlbDraw(av); }).catch(()=>{}); }   // real GLB prop (draws once loaded)
    else if(def.splat && def.splat.positions){ const sa=_buildSplatAv(def.splat.positions, def.splat.colors); if(sa) g.draw = _grabGlbDraw(sa); }   // v1014 — baked splat cloud
    else g.draw = _grabOrbDraw(def.color);                                            // built-in glowing orb
    grabbables.push(g);
    return g;
  }
  function clearGrabbables(){ grabbables.length = actors.length; if(A.carry>=actors.length) A.carry=-1; if(A._wantPick>=actors.length) A._wantPick=-1; }

  // v1013 — a simple "room" for the diorama: floor + back/side walls + an LCARS
  // accent seam, so the avatar stands in a space, not a void. gProg solids.
  function drawRoom(vp){
    gl.useProgram(gProg); gl.uniformMatrix4fv(gU.vp,false,vp); gl.uniform1i(gU.discard,0);
    gl.uniform1f(gU.fill,2.0); gl.uniform3f(gU.trackC,TRACK[0],TRACK[1],TRACK[2]);
    const cx=(-1.05+sceneMaxX)/2, W=(sceneMaxX+1.05)+0.9, D=1.8, H=2.0;
    gl.bindVertexArray(GEO.box.vao);
    gl.uniform3f(gU.fillC,0.11,0.13,0.18);                                          // floor
    gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(cx,-0.04,0),mScale(W,0.07,D)));
    gl.drawElements(gl.TRIANGLES,GEO.box.count,gl.UNSIGNED_SHORT,0);
    gl.uniform3f(gU.fillC,0.065,0.085,0.135);                                       // back wall
    gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(cx,H/2-0.1,-D/2),mScale(W,H,0.07)));
    gl.drawElements(gl.TRIANGLES,GEO.box.count,gl.UNSIGNED_SHORT,0);
    gl.uniform3f(gU.fillC,0.085,0.10,0.155);                                        // side walls
    for(const sx of [cx-W/2, cx+W/2]){
      gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(sx,H/2-0.1,0),mScale(0.07,H,D)));
      gl.drawElements(gl.TRIANGLES,GEO.box.count,gl.UNSIGNED_SHORT,0);
    }
    gl.uniform3f(gU.fillC,0.30,0.48,0.95);                                          // LCARS accent seam (floor↔back)
    gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(cx,0.03,-D/2+0.07),mScale(W,0.035,0.035)));
    gl.drawElements(gl.TRIANGLES,GEO.box.count,gl.UNSIGNED_SHORT,0);
    gl.bindVertexArray(null);
  }

  // v981 — measure the avatar's normalized on-screen footprint (half-width,
  // half-height, vertical center) from its bbox + orientation, so the camera
  // can FIT THE ASSET instead of using a fixed box. A margin leaves room for
  // animation that exceeds the rest pose (a wave throws an arm out; a jump
  // adds height) so we don't frame out the action. Cached; recomputed on swap.
  let _normExtents = null;
  function avatarNormExtents(){
    if(_normExtents) return _normExtents;
    if(!rawBBox) return { hw:0.55, hh:0.78, cy:0.78 };
    let rot; try{ rot=avatarOrientation.buildMatrix(avatarOrientation.get(url)); }catch{ rot=mIdent(); }
    const b=rawBBox, cs=[[b.minX,b.minY,b.minZ],[b.maxX,b.minY,b.minZ],[b.minX,b.maxY,b.minZ],[b.maxX,b.maxY,b.minZ],[b.minX,b.minY,b.maxZ],[b.maxX,b.minY,b.maxZ],[b.minX,b.maxY,b.maxZ],[b.maxX,b.maxY,b.maxZ]];
    let mnX=Infinity,mxX=-Infinity,mnY=Infinity,mxY=-Infinity;
    for(const[x,y,z]of cs){ const rx=rot[0]*x+rot[4]*y+rot[8]*z, ry=rot[1]*x+rot[5]*y+rot[9]*z; if(rx<mnX)mnX=rx;if(rx>mxX)mxX=rx;if(ry<mnY)mnY=ry;if(ry>mxY)mxY=ry; }
    const h=(mxY-mnY)||1, s=1.5/h;            // avatarModel normalizes height → 1.5
    const hw=s*(mxX-mnX)/2, hh=s*(mxY-mnY)/2; // hh ≈ 0.75
    _normExtents={ hw, hh, cy:hh };
    try{ console.info(`[avatarStage] framing ${url}: normW=${(hw*2).toFixed(2)} normH=${(hh*2).toFixed(2)} (height-normalized to 1.5)`); }catch{}
    return _normExtents;
  }

  // avatar model: normalize height, stand at A.x/A.z facing A.yaw (+ orientation).
  function avatarModel(){
    if(!rawBBox) return mIdent();
    let rot; try{ rot=avatarOrientation.buildMatrix(avatarOrientation.get(url)); }catch{ rot=mIdent(); }
    const b=rawBBox, cs=[[b.minX,b.minY,b.minZ],[b.maxX,b.minY,b.minZ],[b.minX,b.maxY,b.minZ],[b.maxX,b.maxY,b.minZ],[b.minX,b.minY,b.maxZ],[b.maxX,b.minY,b.maxZ],[b.minX,b.maxY,b.maxZ],[b.maxX,b.maxY,b.maxZ]];
    let mnY=Infinity,mxY=-Infinity;
    for(const[x,y,z]of cs){ const ry=rot[1]*x+rot[5]*y+rot[9]*z; if(ry<mnY)mnY=ry; if(ry>mxY)mxY=ry; }
    const h=(mxY-mnY)||1; const s=1.5/h;
    let mnX=Infinity,mxX=-Infinity,mnZ=Infinity,mxZ=-Infinity;
    for(const[x,y,z]of cs){ const rx=rot[0]*x+rot[4]*y+rot[8]*z, rz=rot[2]*x+rot[6]*y+rot[10]*z; if(rx<mnX)mnX=rx;if(rx>mxX)mxX=rx;if(rz<mnZ)mnZ=rz;if(rz>mxZ)mxZ=rz; }
    const cx=(mnX+mxX)/2, cz=(mnZ+mxZ)/2;
    // centered at local origin, feet on y=0
    const centerMat=mTRS(-s*cx, -s*mnY, -s*cz, s);
    if(scene==="surf"){
      // ride the board: gentle bob, carve-lean (roll), slow turn; feet on the deck (~y 0)
      return mMul(mMul(mMul(mTranslate(0, 0.02 + surf.bob, 0), mRotY(surf.turn)), mRotZ(surf.lean)), mMul(centerMat, rot));
    }
    // place: T(A.x, 0, A.z) * Yaw(A.yaw) * centered * orientation
    // v1252 — mood gait: alarmed = agitated hop + jitter; souring = slumped droop + slow
    // sway. Only in the roaming diorama so it never disturbs the focus/talking-head pose.
    let gy=0, gx=0;
    if(scene==="diorama"){
      const tNow=performance.now()/1000;
      if(_mood==="alarm"){ gy=Math.abs(Math.sin(tNow*9))*0.06; gx=Math.sin(tNow*17)*0.012; }
      else if(_mood==="souring"){ gy=-0.03+Math.sin(tNow*1.1)*0.01; }
    }
    return mMul(mMul(mTranslate(A.x+gx, gy, A.z), mRotY(A.yaw)), mMul(centerMat, rot));
  }

  // v1989 — horizontal extent of everything the diorama actually contains: gauge actors at their
  // REAL x (free-placement pos overrides + carried _drawX), registered props/grabbables, and the
  // pet llama's roam/bury range. The camera frames this span instead of the hardcoded default row.
  function _contentSpanX(){
    let minX=-1.05, maxX=sceneMaxX;
    for(const a of actors){ const ax=(a._drawX!=null?a._drawX:a.x)||0; if(ax-0.45<minX)minX=ax-0.45; if(ax+0.45>maxX)maxX=ax+0.45; }
    for(let gi=actors.length; gi<grabbables.length; gi++){ const g=grabbables[gi]; if(!g) continue; const gx=(g._drawX!=null?g._drawX:g.x)||0; if(gx-0.35<minX)minX=gx-0.35; if(gx+0.35>maxX)maxX=gx+0.35; }
    if(petEnabled){ if(minX>-1.45)minX=-1.45; if(maxX<1.45)maxX=1.45; }   // idle roam ±1.0 + bury corner ±1.4
    return { minX, maxX };
  }

  function camera(){
    const fov=42*Math.PI/180, aspect=(canvas.width/canvas.height)||1.6;
    let cxw, cyw, halfW, halfH, frameAspect=aspect;   // v1017 — per-scene framing aspect (diorama overrides)
    if(scene==="diorama"){
      if(_compact){
        // v1875 — dock framing: gauges centered on x=0 (span ≈ ±(n-1)*SPACING/2), avatar pinned center,
        // llama roams a bit wider. Frame symmetric around 0, sized to hold the group in a wide/short canvas.
        // v1967 — the standing avatar (RobotExpressive ≈ 1.6u tall) was clipping out the top / sitting behind
        // the gauge rings in the short dock canvas. Raise the frame center and grow halfH so the WHOLE avatar
        // (head to feet) fits above the gauge row, and widen halfW a touch so it isn't cropped left/right.
        const gaugeHalf = Math.max(0.35, (n - 1) * (SPACING || 0.62) / 2 + 0.55);
        // v1989 — also cover free-placed gauges / any registered props.
        // v2067 — but NOT the llama's ±1.45 bury/roam range: _contentSpanX
        // force-widens to ±1.45 when petEnabled, which in the compact dock
        // blew the frame to ~3.9u wide -- the gauges+avatar group shrank to a
        // dot and the avatar (pinned x=0 but glancing/leaning) drifted toward
        // an edge. The dock frames the GROUP (gauges + free gauges + props),
        // and lets the llama wander in/out of a snug frame like any pet. Rebuild
        // the span here from actors+props only, skipping the pet clamp.
        let gMin = -1.05, gMax = sceneMaxX;
        for (const a of actors){ const ax=(a._drawX!=null?a._drawX:a.x)||0; if(ax-0.45<gMin)gMin=ax-0.45; if(ax+0.45>gMax)gMax=ax+0.45; }
        for (let gi=actors.length; gi<grabbables.length; gi++){ const g=grabbables[gi]; if(!g) continue; const gx=(g._drawX!=null?g._drawX:g.x)||0; if(gx-0.35<gMin)gMin=gx-0.35; if(gx+0.35>gMax)gMax=gx+0.35; }
        const contentHalf = Math.max(Math.abs(gMin), Math.abs(gMax));
        cxw = 0; cyw = 0.95; halfW = Math.max(gaugeHalf, contentHalf) + 0.35; halfH = 1.15;
        // *** v3778 -- THE HORIZONTAL EXTENT ADAPTED AND THE VERTICAL ONE DID NOT. halfW is built from every
        // actor and prop just above, so a SECOND BLOB widens the frame; halfH was the flat constant 1.15
        // whatever the frame did, so a widened frame kept its original height and CLIPPED THE AVATAR TOP AND
        // BOTTOM -- which is the "blob gets cut off a bit" Keith reported.
        // THE FIX GROWS halfH TO KEEP THE FRAME'S ASPECT WITH THE CANVAS: if the group is wider than this
        // canvas shape can show at the current height, the height has to come up or the extra width is bought
        // by cropping. IT IS A Math.max, SO IT CAN ONLY EVER ADD ROOM -- v1967 raised 1.15 deliberately to fit
        // a standing avatar above the gauge row, and nothing here can lower it below that. ***
        if (aspect > 0) halfH = Math.max(halfH, halfW / aspect);
        frameAspect = aspect;   // fill the actual (wide) canvas — no cap, so the camera doesn't pull way back
      } else {
        // v1989 — frame the ACTUAL content, not just the default gauge row. The fixed
        // [-1.05, sceneMaxX] box ignored (a) free-placed gauges (v1361 pos overrides — move a
        // gauge and the camera didn't follow), (b) registered props/grabbables (v1011/v1352 —
        // the composition drops them at x=1.6+i*0.5, past the row; hiding a gauge via the mask
        // SHRANK sceneMaxX and cropped every prop), and (c) the llama's roam/bury range (±~1.4).
        // Result: "we aren't seeing the whole scene." Now min/max span every actor, prop, and
        // the pet range. Uses _drawX so a carried dial pans the frame smoothly.
        const span = _contentSpanX();
        cxw=(span.minX+span.maxX)/2; cyw=0.82; halfW=(span.maxX-span.minX)/2 + 0.1; halfH=0.92;
        // v1811 — on wide canvases (desktop avatar-server iframe) an uncapped frameAspect
        // pulls the camera too close horizontally, so the avatar wanders off the right edge
        // and only the pet llama (which roams wider) stays visible. Cap the framing aspect so
        // a wide canvas pulls BACK enough to keep the whole diorama (avatar + gauges + llama
        // roam area) in view. Narrow/portrait canvases (phone) are unaffected.
        frameAspect = _fixedFrame ? Math.min(aspect, _fixedFrame) : aspect;   // v2066 -- true aspect unless a host PINS _fixedFrame: the 1.0 cap letterboxed the ultra-wide dock into a square, and the v1989 wider span (llama roam + props) pulled the camera back inside it -- 31% width-fill measured; true aspect = 55% width + FULL height, contain-fit, nothing cropped
      }
    } else if(scene==="studio"){   // v1528 — main avatar wanders the gauges + a second avatar stands at right + pet
      const span = _contentSpanX();   // v1989 — include free-placed gauges + props (same crop fix as diorama)
      const minX=span.minX, maxX=Math.max(span.maxX, 1.7);   // extend the right edge to include the second avatar
      cxw=(minX+maxX)/2; cyw=0.84; halfW=(maxX-minX)/2 + 0.15; halfH=1.04;
      frameAspect = _fixedFrame ? Math.min(aspect, _fixedFrame) : aspect;   // v2066 -- true aspect unless a host PINS _fixedFrame: the 1.0 cap letterboxed the ultra-wide dock into a square, and the v1989 wider span (llama roam + props) pulled the camera back inside it -- 31% width-fill measured; true aspect = 55% width + FULL height, contain-fit, nothing cropped
    } else if(scene==="focus"){    // v980 — big single-avatar portrait, no gauge row
      const e=avatarNormExtents();        // v981 — fit the actual asset
      const fCy=e.cy;
      const fHW=Math.max(e.hw*1.55 + 0.12, 0.50);   // ×1.55: room for an arm-out / wave
      const fHH=Math.max(e.hh*1.14 + 0.10, 0.70);   // ×1.14: room for a small jump / raised arms
      // v990 — talking-head framing: while speaking, _talkAmt eases 0→1 and the
      // camera tightens onto the head (top of the avatar), then eases back. This
      // restores the old "zoom in on the head and talk" effect.
      const hCy=e.cy + e.hh*0.80;                    // up near the head
      const hHW=Math.max(e.hw*0.55, 0.24);
      const hHH=Math.max(e.hh*0.30, 0.26);
      const t=Math.max(_talkAmt, _headView?1:0);   // v1365 — head view pins the tight frame
      cxw=0;
      cyw  = fCy*(1-t) + hCy*t;
      halfW= fHW*(1-t) + hHW*t;
      halfH= fHH*(1-t) + hHH*t;
    } else if(scene==="screen"){   // avatar (left) watching the panel (right)
      cxw=-0.05; cyw=0.74; halfW=1.42; halfH=0.96;
    } else if(scene==="carrier"){  // ship on the sea — wider, taller for flyer
      cxw=0; cyw=0.62; halfW=1.28; halfH=0.94;
    } else if(scene==="surf"){     // rider on a board on the open sea
      cxw=0; cyw=0.58; halfW=1.12; halfH=0.98;
    } else if(scene==="duo" || scene==="guest"){  // two avatars — wide + tall
      cxw=0; cyw=0.86; halfW=1.70; halfH=1.08;
    } else if(scene==="sinkingship"){ // see surface + the hull going under
      cxw=0; cyw=0.10; halfW=1.30; halfH=1.10;
    } else if(scene==="boids"){    // flock box
      cxw=0; cyw=0.78; halfW=1.22; halfH=0.90;
    } else if(scene==="pendulum"){ // pendulum-wave fan
      cxw=0; cyw=0.70; halfW=1.14; halfH=0.84;
    } else if(scene==="gears"){    // gear panel, front-on
      cxw=-0.02; cyw=0.70; halfW=1.16; halfH=0.86;
    } else if(scene==="asteroids"){ // space arena
      cxw=0; cyw=0.78; halfW=1.28; halfH=0.92;
    } else {              // solo wave / cradle / bird — centered single object
      cxw=0; cyw=0.55; halfW=1.0; halfH=0.8;
    }
    const distH=halfH/Math.tan(fov/2);
    const distW=halfW/(Math.tan(fov/2)*frameAspect);   // v1017 — frameAspect==aspect for all scenes except diorama
    const dist=Math.max(distH,distW)*1.12 + 0.5;
    const proj=mPersp(fov,aspect,0.05,80);
    // v1242 — cinematic overrides.
    // Llama-flight first-person POV: ride the llama, looking at a thrown gauge while
    // chasing it, otherwise at the big avatar owner (centred at origin in focus).
    if(_llamaCam && petEnabled){
      const fy=pet.flightY||0;
      const eye=[pet.x, 0.50+fy, pet.z+0.16];
      let tgt;
      if(fetchBall && fetchBall.active && !fetchBall.carried) tgt=[fetchBall.x, fetchBall.y, fetchBall.z];
      else if(_hoop) tgt=[0, 0.72, 0.30];
      else tgt=[0, 0.55, 0];
      return mMul(proj, mLookAt(eye, tgt, [0,1,0]));
    }
    // Drone orbit: smooth circle around the subject (eases to follow the wandering
    // host when _droneTrack) with a gentle vertical bob.
    if(_droneCam){
      const a=(performance.now()/1000)*_droneSpeed;
      let cx=cxw;
      if(_droneTrack){
        const subjX=(scene==="focus")?0:((typeof A!=="undefined"&&A)?A.x:cxw);
        _droneCx=(_droneCx==null)?subjX:_droneCx+(subjX-_droneCx)*0.06;   // ease toward subject
        cx=_droneCx;
      }
      const r=dist*1.04, h=cyw+0.42+Math.sin(a*0.6)*0.30;
      return mMul(proj, mLookAt([cx+Math.sin(a)*r, h, Math.cos(a)*r],[cx,cyw,0],[0,1,0]));
    }
    // v991 — selfie: raise + pull the eye back and tilt the look down toward
    // the avatar (the "hold the phone up and look down" framing), then flash.
    let _eyeY=cyw+0.18, _eyeZ=dist, _tgtY=cyw;
    if(_selfieAmt>0){ const s=_selfieAmt; _eyeY+=s*0.75; _eyeZ=dist*(1+s*0.50); _tgtY=cyw-s*0.10; }
    const view=mLookAt([cxw, _eyeY, _eyeZ],[cxw,_tgtY,0],[0,1,0]);
    return mMul(proj,view);
  }

  // ---- solo wave scene: one large sloshing tank, level = gauge 1 ----
  function drawSoloWave(vp, tSec){
    const v=val0(), c=col0;
    gl.useProgram(gProg); gl.uniformMatrix4fv(gU.vp,false,vp); gl.uniform1i(gU.discard,0); gl.uniform1f(gU.fill,2.0); gl.uniform3f(gU.trackC,TRACK[0],TRACK[1],TRACK[2]);
    gl.uniform3f(gU.fillC,0.10,0.12,0.16); gl.bindVertexArray(GEO.disc.vao);
    gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(0,0,0),mScale(2.6,0.5,2.6))); gl.drawElements(gl.TRIANGLES,GEO.disc.count,gl.UNSIGNED_SHORT,0);
    gl.uniform3f(gU.fillC,c[0]*0.5,c[1]*0.5,c[2]*0.5); gl.bindVertexArray(GEO.gimbal.vao);
    for(const hy of [0.02,1.1]){ gl.uniformMatrix4fv(gU.model,false,mMul(mMul(mTranslate(0,hy,0),mRotX(Math.PI/2)),mScale(2.0,2.0,2.0))); gl.drawElements(gl.TRIANGLES,GEO.gimbal.count,gl.UNSIGNED_SHORT,0); }
    gl.useProgram(wProg); gl.uniform1f(wU.alpha,1.0); gl.uniformMatrix4fv(wU.vp,false,vp);
    gl.uniformMatrix4fv(wU.model,false,mMul(mTranslate(0,0,0),mScale(1.5,1,1.5)));
    gl.uniform1f(wU.time,tSec); gl.uniform1f(wU.level,0.06+v*0.95); gl.uniform1f(wU.amp,0.06);
    gl.uniform3f(wU.color,c[0],c[1],c[2]); gl.bindVertexArray(GRID.vao); gl.drawElements(gl.TRIANGLES,GRID.count,gl.UNSIGNED_SHORT,0);
    gl.bindVertexArray(null);
  }

  // ---- OGRE carrier on the wave: boat floats / sub dives / flyer hovers ----
  function drawCarrier(vp, tSec){
    const v=val0(), c=col0;
    const sea = 0.4 + v*0.6;          // sea state from gauge 1
    const waterY = 0.5;
    // tank base
    gl.useProgram(gProg); gl.uniformMatrix4fv(gU.vp,false,vp); gl.uniform1i(gU.discard,0); gl.uniform1f(gU.fill,2.0); gl.uniform3f(gU.trackC,TRACK[0],TRACK[1],TRACK[2]);
    gl.uniform3f(gU.fillC,0.07,0.09,0.13); gl.bindVertexArray(GEO.disc.vao);
    gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(0,0,0),mScale(3.0,0.5,3.0))); gl.drawElements(gl.TRIANGLES,GEO.disc.count,gl.UNSIGNED_SHORT,0);
    // sea surface (wave program), height = waterY
    gl.useProgram(wProg); gl.uniform1f(wU.alpha,1.0); gl.uniformMatrix4fv(wU.vp,false,vp);
    gl.uniformMatrix4fv(wU.model,false,mMul(mTranslate(0,0,0),mScale(2.0,1,2.0)));
    gl.uniform1f(wU.time,tSec); gl.uniform1f(wU.level,waterY); gl.uniform1f(wU.amp,0.03+sea*0.05);
    gl.uniform3f(wU.color, c[0]*0.45+0.04, c[1]*0.5+0.08, c[2]*0.6+0.14); gl.bindVertexArray(GRID.vao); gl.drawElements(gl.TRIANGLES,GRID.count,gl.UNSIGNED_SHORT,0);
    // the ship
    if(carrierGeo){
      const s=0.075, yaw=Math.sin(tSec*0.25)*0.30, heave=Math.sin(tSec*1.6)*0.03*sea;
      let pitch=Math.sin(tSec*1.1)*0.07*sea, roll=Math.sin(tSec*0.8)*0.05*sea, yOff;
      if(carrierId==="flying"){ yOff=waterY+0.55+heave*1.6; pitch*=0.4; roll*=0.4; }
      else if(carrierId==="sub"){ const dive=0.5-0.5*Math.cos(tSec*0.5); yOff=waterY-0.10-dive*0.42+heave; }
      else { yOff=waterY-0.08+heave; }   // boat: hull partly submerged
      const M=mMul(mMul(mMul(mMul(mTranslate(0,yOff,0),mRotY(yaw)),mRotZ(pitch)),mRotX(roll)),mScale(s,s,s));
      gl.useProgram(gProg); gl.uniformMatrix4fv(gU.vp,false,vp); gl.uniform1i(gU.discard,0); gl.uniform1f(gU.fill,2.0); gl.uniform3f(gU.trackC,TRACK[0],TRACK[1],TRACK[2]);
      gl.uniform3f(gU.fillC, 0.55,0.58,0.64);   // steel hull
      gl.uniformMatrix4fv(gU.model,false,M);
      gl.bindVertexArray(carrierGeo.vao); gl.drawElements(gl.TRIANGLES,carrierGeo.count,gl.UNSIGNED_SHORT,0);
    }
    gl.bindVertexArray(null);
  }

  // ---- v926 — sinking ship through TRANSPARENT water (fidget loop) ----
  // Opaque pass (seabed, foundering ship, rising bubbles) first, then the water
  // surface blended on top with depth-write off, so the hull stays visible as it
  // slips under and settles on the bottom. ~14s cycle.
  function drawSinkingShip(vp, tSec){
    const v=val0();
    const waterY=0.5, seabed=-1.55, T=14.0, p=(tSec % T)/T;
    const smooth=(t)=>t*t*(3-2*t);
    // seabed
    gl.useProgram(gProg); gl.uniformMatrix4fv(gU.vp,false,vp); gl.uniform1i(gU.discard,0); gl.uniform1f(gU.fill,2.0); gl.uniform3f(gU.trackC,TRACK[0],TRACK[1],TRACK[2]);
    gl.uniform3f(gU.fillC,0.05,0.06,0.08); gl.bindVertexArray(GEO.disc.vao);
    gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(0,seabed,0),mScale(3.3,0.4,3.3))); gl.drawElements(gl.TRIANGLES,GEO.disc.count,gl.UNSIGNED_SHORT,0);
    // the ship
    if(carrierGeo){
      const s=0.075, yaw=Math.sin(tSec*0.18)*0.22;
      let yOff, pitch, roll;
      if(p<0.16){                                   // riding the surface
        yOff=waterY-0.06+Math.sin(tSec*1.6)*0.025; pitch=Math.sin(tSec*1.0)*0.05; roll=Math.sin(tSec*0.8)*0.05;
      } else {                                       // foundering → bottom
        const t=(p-0.16)/0.84, e=smooth(t);
        yOff=(waterY-0.06)+(seabed+0.12-(waterY-0.06))*e;
        pitch=0.05+1.15*smooth(Math.min(1,t*1.25));  // stern floods, bow rises, slips under
        roll=Math.sin(tSec*0.9)*0.18*(1-e);
      }
      const depth=Math.max(0,waterY-yOff), dk=Math.max(0.22,1-depth*0.42);
      const M=mMul(mMul(mMul(mMul(mTranslate(0,yOff,0),mRotY(yaw)),mRotZ(pitch)),mRotX(roll)),mScale(s,s,s));
      gl.uniform3f(gU.fillC,0.55*dk,0.58*dk,0.64*dk); gl.uniformMatrix4fv(gU.model,false,M);
      gl.bindVertexArray(carrierGeo.vao); gl.drawElements(gl.TRIANGLES,carrierGeo.count,gl.UNSIGNED_SHORT,0);
      // rising bubbles while sinking
      if(p>0.16){
        gl.bindVertexArray(GEO.ball.vao); gl.uniform3f(gU.fillC,0.72,0.86,0.96);
        for(let i=0;i<10;i++){
          const ph=((tSec*0.55)+i*0.1)%1, bx=Math.sin(i*2.1)*0.3, bz=Math.cos(i*1.7)*0.3;
          const by=yOff+ph*(waterY-yOff+0.25), bs=0.10*(0.45+0.55*ph);
          gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(bx,by,bz),mScale(bs,bs,bs)));
          gl.drawElements(gl.TRIANGLES,GEO.ball.count,gl.UNSIGNED_SHORT,0);
        }
      }
    }
    // transparent water surface LAST (hull shows through)
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.useProgram(wProg); gl.uniform1f(wU.alpha,0.5); gl.uniformMatrix4fv(wU.vp,false,vp);
    gl.uniformMatrix4fv(wU.model,false,mMul(mTranslate(0,0,0),mScale(2.3,1,2.3)));
    gl.uniform1f(wU.time,tSec); gl.uniform1f(wU.level,waterY); gl.uniform1f(wU.amp,0.04+v*0.04);
    gl.uniform3f(wU.color,0.10,0.32,0.46);
    gl.bindVertexArray(GRID.vao); gl.drawElements(gl.TRIANGLES,GRID.count,gl.UNSIGNED_SHORT,0);
    gl.depthMask(true); gl.disable(gl.BLEND); gl.uniform1f(wU.alpha,1.0);
    gl.bindVertexArray(null);
  }

  // ---- 3D boids: Reynolds flocking (separation/alignment/cohesion) in a box ----
  function updateBoids(dt){
    const v=val0(); const maxS=0.45+v*0.75, minS=0.22;
    const R=0.55, R2=R*R, SEP=0.22, SEP2=SEP*SEP, wSep=1.7, wAli=0.65, wCoh=0.55, wBound=3.0;
    const B=BOX;
    for(let i=0;i<NB;i++){
      const b=boids[i]; let sx=0,sy=0,sz=0, ax=0,ay=0,az=0, gx=0,gy=0,gz=0, cnt=0;
      for(let j=0;j<NB;j++){ if(j===i) continue; const o=boids[j];
        const dx=b.p[0]-o.p[0], dy=b.p[1]-o.p[1], dz=b.p[2]-o.p[2]; const d2=dx*dx+dy*dy+dz*dz;
        if(d2<R2){ cnt++; ax+=o.v[0];ay+=o.v[1];az+=o.v[2]; gx+=o.p[0];gy+=o.p[1];gz+=o.p[2];
          if(d2<SEP2 && d2>1e-6){ const inv=1/Math.sqrt(d2); sx+=dx*inv; sy+=dy*inv; sz+=dz*inv; } } }
      let fx=0,fy=0,fz=0;
      if(cnt>0){ fx+=wSep*sx+wAli*(ax/cnt-b.v[0])+wCoh*(gx/cnt-b.p[0]);
                 fy+=wSep*sy+wAli*(ay/cnt-b.v[1])+wCoh*(gy/cnt-b.p[1]);
                 fz+=wSep*sz+wAli*(az/cnt-b.v[2])+wCoh*(gz/cnt-b.p[2]); }
      if(b.p[0]>B.cx+B.hx) fx-=wBound*(b.p[0]-(B.cx+B.hx)); else if(b.p[0]<B.cx-B.hx) fx+=wBound*((B.cx-B.hx)-b.p[0]);
      if(b.p[1]>B.cy+B.hy) fy-=wBound*(b.p[1]-(B.cy+B.hy)); else if(b.p[1]<B.cy-B.hy) fy+=wBound*((B.cy-B.hy)-b.p[1]);
      if(b.p[2]>B.cz+B.hz) fz-=wBound*(b.p[2]-(B.cz+B.hz)); else if(b.p[2]<B.cz-B.hz) fz+=wBound*((B.cz-B.hz)-b.p[2]);
      b.v[0]+=fx*dt; b.v[1]+=fy*dt; b.v[2]+=fz*dt;
      let sp=Math.hypot(b.v[0],b.v[1],b.v[2])||1; const cl=Math.max(minS,Math.min(maxS,sp))/sp;
      b.v[0]*=cl; b.v[1]*=cl; b.v[2]*=cl;
      b.p[0]+=b.v[0]*dt; b.p[1]+=b.v[1]*dt; b.p[2]+=b.v[2]*dt;
    }
  }
  function drawBoids(vp){
    const c=col0, B=BOX;
    // faint floor disc for grounding
    gl.useProgram(gProg); gl.uniformMatrix4fv(gU.vp,false,vp); gl.uniform1i(gU.discard,0); gl.uniform1f(gU.fill,2.0); gl.uniform3f(gU.trackC,TRACK[0],TRACK[1],TRACK[2]);
    gl.uniform3f(gU.fillC,0.07,0.09,0.13); gl.bindVertexArray(GEO.disc.vao);
    gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(B.cx,B.cy-B.hy-0.05,B.cz),mScale(3.0,0.4,3.0))); gl.drawElements(gl.TRIANGLES,GEO.disc.count,gl.UNSIGNED_SHORT,0);
    // darts (color brightens with speed for depth)
    gl.bindVertexArray(GEO.cone.vao);
    for(const b of boids){
      const sp=Math.hypot(b.v[0],b.v[1],b.v[2]), lit=0.6+Math.min(0.4,sp*0.45);
      gl.uniform3f(gU.fillC, c[0]*lit, c[1]*lit, c[2]*lit);
      gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(b.p[0],b.p[1],b.p[2]), mOrient(b.v[0],b.v[1],b.v[2])));
      gl.drawElements(gl.TRIANGLES,GEO.cone.count,gl.UNSIGNED_SHORT,0);
    }
    gl.bindVertexArray(null);
  }

  // ---- pendulum wave: tuned-length pendulums drift into travelling-wave patterns ----
  function drawPendulumWave(vp, tSec){
    const v=val0(); const P=PW, tEff=tSec*(0.6+v*0.8);   // gauge scales playback speed
    gl.useProgram(gProg); gl.uniformMatrix4fv(gU.vp,false,vp); gl.uniform1i(gU.discard,0); gl.uniform1f(gU.fill,2.0); gl.uniform3f(gU.trackC,TRACK[0],TRACK[1],TRACK[2]);
    // support bar (along X) + four end posts
    gl.uniform3f(gU.fillC,0.30,0.33,0.40); gl.bindVertexArray(GEO.cyl.vao);
    gl.uniformMatrix4fv(gU.model,false,mMul(mMul(mTranslate(-(P.N-1)*P.gap/2-0.12,P.topY,0),mRotZ(-Math.PI/2)),mScale(0.04,(P.N-1)*P.gap+0.24,0.04))); gl.drawElements(gl.TRIANGLES,GEO.cyl.count,gl.UNSIGNED_SHORT,0);
    for(const ex of [-(P.N-1)*P.gap/2-0.12, (P.N-1)*P.gap/2+0.12]){
      gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(ex,0,0.32),mScale(0.04,P.topY,0.04))); gl.drawElements(gl.TRIANGLES,GEO.cyl.count,gl.UNSIGNED_SHORT,0);
      gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(ex,0,-0.32),mScale(0.04,P.topY,0.04))); gl.drawElements(gl.TRIANGLES,GEO.cyl.count,gl.UNSIGNED_SHORT,0);
    }
    for(let i=0;i<P.N;i++){
      const th=P.A*Math.cos(P.w[i]*tEff), L=P.L[i], x0=P.x[i];
      const by=P.topY - L*Math.cos(th), bz=L*Math.sin(th);   // swing in Y-Z (toward/away)
      // string: cylinder +Y → (0,-cosθ,sinθ) via rotX(π-θ)
      gl.uniform3f(gU.fillC,0.42,0.45,0.52); gl.bindVertexArray(GEO.cyl.vao);
      gl.uniformMatrix4fv(gU.model,false,mMul(mMul(mTranslate(x0,P.topY,0),mRotX(Math.PI-th)),mScale(0.011,L,0.011)));
      gl.drawElements(gl.TRIANGLES,GEO.cyl.count,gl.UNSIGNED_SHORT,0);
      // bob
      const c=P.col[i]; gl.uniform3f(gU.fillC,c[0],c[1],c[2]); gl.bindVertexArray(GEO.ball.vao);
      gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(x0,by,bz),mScale(0.34,0.34,0.34)));
      gl.drawElements(gl.TRIANGLES,GEO.ball.count,gl.UNSIGNED_SHORT,0);
    }
    gl.bindVertexArray(null);
  }

  // ---- interactive gears: click a gear → its whole meshing train spins ----
  function drawGears(vp, dt){
    const v=val0(); const driverOmega=0.8+v*2.0; gearLastVP=vp;
    gl.useProgram(gProg); gl.uniformMatrix4fv(gU.vp,false,vp); gl.uniform1i(gU.discard,0); gl.uniform1f(gU.fill,2.0); gl.uniform3f(gU.trackC,TRACK[0],TRACK[1],TRACK[2]);
    for(let i=0;i<GEARS.length;i++){ const g=GEARS[i];
      if(compRunning[g.comp]) g.angle += dt*driverOmega*g.ratio*g.sign;
      const c=hsl2rgb(g.hue*0.7+0.04, 0.45, compRunning[g.comp]?0.62:0.40);
      gl.uniform3f(gU.fillC,c[0],c[1],c[2]); gl.bindVertexArray(gearGeos[i].vao);
      gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(g.x,g.y,0),mRotZ(g.angle))); gl.drawElements(gl.TRIANGLES,gearGeos[i].count,gl.UNSIGNED_SHORT,0);
      // hub bolt
      gl.uniform3f(gU.fillC,0.14,0.16,0.20); gl.bindVertexArray(GEO.ball.vao);
      gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(g.x,g.y,0.07),mScale(g.r*1.7,g.r*1.7,g.r*0.9))); gl.drawElements(gl.TRIANGLES,GEO.ball.count,gl.UNSIGNED_SHORT,0);
    }
    gl.bindVertexArray(null);
  }

  // ---- 3D asteroids: self-playing UFO hunts rocks, splits them, dodges to survive ----
  const ASTBOX={cx:0,cy:0.78,cz:0,hx:1.05,hy:0.60,hz:0.50};
  const ast={ rocks:[], bullets:[], ufo:{p:[0,0.78,0],v:[0,0,0]}, fireCd:0, flash:0, inited:false };
  function astWrap(p){ const B=ASTBOX;
    if(p[0]>B.cx+B.hx)p[0]-=2*B.hx; else if(p[0]<B.cx-B.hx)p[0]+=2*B.hx;
    if(p[1]>B.cy+B.hy)p[1]-=2*B.hy; else if(p[1]<B.cy-B.hy)p[1]+=2*B.hy;
    if(p[2]>B.cz+B.hz)p[2]-=2*B.hz; else if(p[2]<B.cz-B.hz)p[2]+=2*B.hz; }
  function astSpawnRock(p,size){ const R=[0,0.075,0.12,0.18][size], a=Math.random()*Math.PI*2, b=(Math.random()-0.5)*Math.PI, sp=(0.22+(3-size)*0.10)*(0.7+val0()*0.8);
    const dir=[Math.cos(a)*Math.cos(b), Math.sin(b), Math.sin(a)*Math.cos(b)];
    ast.rocks.push({ p:p.slice(), v:[dir[0]*sp,dir[1]*sp,dir[2]*sp], size, R,
      sc:[R*(0.85+Math.random()*0.5), R*(0.85+Math.random()*0.5), R*(0.85+Math.random()*0.5)],
      rot:Math.random()*6.28, rv:(Math.random()*2-1)*1.2 }); }
  function astInit(){ const B=ASTBOX; ast.rocks=[]; ast.bullets=[]; ast.ufo={p:[B.cx,B.cy,0],v:[0,0,0]}; ast.fireCd=0; ast.flash=0;
    for(let i=0;i<5;i++){ const p=[B.cx+(Math.random()*2-1)*B.hx, B.cy+(Math.random()*2-1)*B.hy, B.cz+(Math.random()*2-1)*B.hz]; if(Math.hypot(p[0]-B.cx,p[1]-B.cy)<0.4) p[0]+=0.55; astSpawnRock(p,3); }
    ast.inited=true; }
  function astNearest(){ let best=null,bd=1e9; for(const r of ast.rocks){ const d=Math.hypot(r.p[0]-ast.ufo.p[0],r.p[1]-ast.ufo.p[1],r.p[2]-ast.ufo.p[2]); if(d<bd){bd=d;best=r;} } return {rock:best,d:bd}; }
  function updateAsteroids(dt){
    if(!ast.inited) astInit();
    const v=val0(), B=ASTBOX, u=ast.ufo, bSp=1.4, DODGE=0.42;
    const {rock,d}=astNearest(); let ax=0,ay=0,az=0;
    if(rock){
      if(d<DODGE){ const inv=1/(d||1); ax+=(u.p[0]-rock.p[0])*inv*1.8; ay+=(u.p[1]-rock.p[1])*inv*1.8; az+=(u.p[2]-rock.p[2])*inv*1.8; }
      else { const t=d/bSp, px=rock.p[0]+rock.v[0]*t, py=rock.p[1]+rock.v[1]*t, pz=rock.p[2]+rock.v[2]*t;
        let dx=px-u.p[0],dy=py-u.p[1],dz=pz-u.p[2]; const dl=Math.hypot(dx,dy,dz)||1; dx/=dl;dy/=dl;dz/=dl;
        ax+=dx*0.25; ay+=dy*0.25; az+=dz*0.25;
        ast.fireCd-=dt; if(ast.fireCd<=0){ ast.bullets.push({p:u.p.slice(), v:[dx*bSp,dy*bSp,dz*bSp], life:1.3}); ast.fireCd=0.55-v*0.3; } } }
    u.v[0]+=ax*dt; u.v[1]+=ay*dt; u.v[2]+=az*dt;
    const sp=Math.hypot(u.v[0],u.v[1],u.v[2])||1, MS=0.7; if(sp>MS){const k=MS/sp;u.v[0]*=k;u.v[1]*=k;u.v[2]*=k;}
    u.v[0]*=0.992;u.v[1]*=0.992;u.v[2]*=0.992;
    u.p[0]+=u.v[0]*dt;u.p[1]+=u.v[1]*dt;u.p[2]+=u.v[2]*dt; astWrap(u.p);
    if(ast.flash>0) ast.flash-=dt;
    for(const b of ast.bullets){ b.p[0]+=b.v[0]*dt;b.p[1]+=b.v[1]*dt;b.p[2]+=b.v[2]*dt; b.life-=dt; astWrap(b.p); }
    ast.bullets=ast.bullets.filter(b=>b.life>0);
    for(const r of ast.rocks){ r.p[0]+=r.v[0]*dt;r.p[1]+=r.v[1]*dt;r.p[2]+=r.v[2]*dt; r.rot+=r.rv*dt; astWrap(r.p); }
    for(let i=ast.rocks.length-1;i>=0;i--){ const r=ast.rocks[i];
      for(let j=ast.bullets.length-1;j>=0;j--){ const b=ast.bullets[j];
        if(Math.hypot(r.p[0]-b.p[0],r.p[1]-b.p[1],r.p[2]-b.p[2])<r.R+0.02){ ast.bullets.splice(j,1);
          if(r.size>1){ for(let k=0;k<2;k++) astSpawnRock(r.p,r.size-1); } ast.rocks.splice(i,1); break; } } }
    if(ast.flash<=0){ for(const r of ast.rocks){ if(Math.hypot(r.p[0]-u.p[0],r.p[1]-u.p[1],r.p[2]-u.p[2])<r.R+0.10){ ast.flash=0.6; u.p=[B.cx,B.cy,0]; u.v=[0,0,0]; break; } } }
    if(ast.rocks.length===0) astInit();
  }
  function drawAsteroids(vp,dt){
    updateAsteroids(dt); const c=col0;
    gl.useProgram(gProg); gl.uniformMatrix4fv(gU.vp,false,vp); gl.uniform1i(gU.discard,0); gl.uniform1f(gU.fill,2.0); gl.uniform3f(gU.trackC,TRACK[0],TRACK[1],TRACK[2]);
    gl.uniform3f(gU.fillC,0.42,0.40,0.38); gl.bindVertexArray(GEO.ball.vao);
    for(const r of ast.rocks){ gl.uniformMatrix4fv(gU.model,false,mMul(mMul(mTranslate(r.p[0],r.p[1],r.p[2]),mRotY(r.rot)),mScale(r.sc[0]/0.16,r.sc[1]/0.16,r.sc[2]/0.16))); gl.drawElements(gl.TRIANGLES,GEO.ball.count,gl.UNSIGNED_SHORT,0); }
    gl.uniform3f(gU.fillC, Math.min(1,c[0]*1.4+0.2), Math.min(1,c[1]*1.4+0.2), Math.min(1,c[2]*1.4+0.2));
    for(const b of ast.bullets){ gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(b.p[0],b.p[1],b.p[2]),mScale(0.16,0.16,0.16))); gl.drawElements(gl.TRIANGLES,GEO.ball.count,gl.UNSIGNED_SHORT,0); }
    const u=ast.ufo, hit=ast.flash>0 && (((ast.flash*20)|0)&1);
    gl.uniform3f(gU.fillC, hit?0.9:0.55, hit?0.3:0.58, hit?0.3:0.66); gl.bindVertexArray(GEO.disc.vao);
    gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(u.p[0],u.p[1],u.p[2]),mScale(0.9,0.35,0.9))); gl.drawElements(gl.TRIANGLES,GEO.disc.count,gl.UNSIGNED_SHORT,0);
    gl.uniform3f(gU.fillC,c[0],c[1],c[2]); gl.bindVertexArray(GEO.ball.vao);
    gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(u.p[0],u.p[1]+0.03,u.p[2]),mScale(0.5,0.5,0.5))); gl.drawElements(gl.TRIANGLES,GEO.ball.count,gl.UNSIGNED_SHORT,0);
    gl.bindVertexArray(null);
  }

  // ---- demo-on-a-3D-screen: a 3D panel textured with the LIVE demo canvas ----
  function drawScreen(vp){
    const cx=0.55, cy=0.84, SW=1.18, SH=0.74;
    // upload the live demo canvas into screenTex (2D canvases always sample;
    // WebGL canvases need preserveDrawingBuffer:true to be non-blank)
    let mode=0;
    if(getScreenCanvas){
      let cnv=null; try{ cnv=getScreenCanvas(); }catch{}
      if(cnv && cnv.width>0 && cnv.height>0){
        try{ gl.bindTexture(gl.TEXTURE_2D,screenTex); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,cnv); mode=1; }
        catch(e){ mode=0; }
      }
    }
    gl.useProgram(sProg); gl.uniformMatrix4fv(sU.vp,false,vp); gl.uniform1i(sU.tex,0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,screenTex);
    gl.bindVertexArray(QUAD.vao);
    gl.uniform1i(sU.mode,2);   // bezel (solid dark) just behind
    gl.uniformMatrix4fv(sU.model,false,mMul(mTranslate(cx,cy,-0.04),mScale(SW+0.12,SH+0.12,1)));
    gl.drawElements(gl.TRIANGLES,QUAD.count,gl.UNSIGNED_SHORT,0);
    gl.uniform1i(sU.mode,mode); // live screen (1) or no-signal (0)
    gl.uniformMatrix4fv(sU.model,false,mMul(mTranslate(cx,cy,0),mScale(SW,SH,1)));
    gl.drawElements(gl.TRIANGLES,QUAD.count,gl.UNSIGNED_SHORT,0);
    gl.bindVertexArray(null);
    // stand: neck + base
    gl.useProgram(gProg); gl.uniformMatrix4fv(gU.vp,false,vp); gl.uniform1i(gU.discard,0); gl.uniform1f(gU.fill,2.0); gl.uniform3f(gU.trackC,TRACK[0],TRACK[1],TRACK[2]);
    gl.uniform3f(gU.fillC,0.26,0.28,0.34); gl.bindVertexArray(GEO.cyl.vao);
    gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(cx,0.0,0),mScale(0.09,cy-SH/2+0.02,0.09))); gl.drawElements(gl.TRIANGLES,GEO.cyl.count,gl.UNSIGNED_SHORT,0);
    gl.uniform3f(gU.fillC,0.18,0.20,0.26); gl.bindVertexArray(GEO.disc.vao);
    gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(cx,0.0,0),mScale(1.5,0.5,1.5))); gl.drawElements(gl.TRIANGLES,GEO.disc.count,gl.UNSIGNED_SHORT,0);
    gl.bindVertexArray(null);
  }

  // ---- drinking-bird scene: tips to dip its beak in a cup, speed = gauge 1 ----
  function drawBird(vp, dt, tSec){
    const v=val0(), c=col0;
    const px=-0.2, py=0.58, cupx=0.24;
    const speed=0.8 + v*2.4;
    const phase=(1 - Math.cos(tSec*speed))/2;     // 0 upright → 1 dipped
    const th=-1.45*phase;                          // tip forward about pivot
    gl.useProgram(gProg); gl.uniformMatrix4fv(gU.vp,false,vp); gl.uniform1i(gU.discard,0); gl.uniform1f(gU.fill,2.0); gl.uniform3f(gU.trackC,TRACK[0],TRACK[1],TRACK[2]);
    const piv=mMul(mTranslate(px,py,0), mRotZ(th));   // bird pivot frame
    const part=(local)=>mMul(piv,local);
    // bottom bulb (fluid-tinted)
    gl.uniform3f(gU.fillC, 0.5*c[0]+0.4, 0.5*c[1]+0.15, 0.5*c[2]+0.15); gl.bindVertexArray(GEO.ball.vao);
    gl.uniformMatrix4fv(gU.model,false,part(mMul(mTranslate(0,-0.40,0),mScale(1.5,1.6,1.5)))); gl.drawElements(gl.TRIANGLES,GEO.ball.count,gl.UNSIGNED_SHORT,0);
    // neck (thin glass)
    gl.uniform3f(gU.fillC,0.62,0.8,0.95); gl.bindVertexArray(GEO.cyl.vao);
    gl.uniformMatrix4fv(gU.model,false,part(mMul(mTranslate(0,-0.30,0),mScale(0.083,0.64,0.083)))); gl.drawElements(gl.TRIANGLES,GEO.cyl.count,gl.UNSIGNED_SHORT,0);
    // head bulb
    gl.uniform3f(gU.fillC,0.7,0.85,0.98); gl.bindVertexArray(GEO.ball.vao);
    gl.uniformMatrix4fv(gU.model,false,part(mMul(mTranslate(0,0.42,0),mScale(0.94,0.94,0.94)))); gl.drawElements(gl.TRIANGLES,GEO.ball.count,gl.UNSIGNED_SHORT,0);
    // beak (dark, points +X)
    gl.uniform3f(gU.fillC,0.16,0.16,0.2); gl.bindVertexArray(GEO.cyl.vao);
    gl.uniformMatrix4fv(gU.model,false,part(mMul(mMul(mTranslate(0.10,0.40,0),mRotZ(-Math.PI/2)),mScale(0.05,0.24,0.05)))); gl.drawElements(gl.TRIANGLES,GEO.cyl.count,gl.UNSIGNED_SHORT,0);
    // top cap
    gl.uniform3f(gU.fillC,0.2,0.22,0.28); gl.bindVertexArray(GEO.disc.vao);
    gl.uniformMatrix4fv(gU.model,false,part(mMul(mTranslate(0,0.55,0),mScale(0.6,1.2,0.6)))); gl.drawElements(gl.TRIANGLES,GEO.disc.count,gl.UNSIGNED_SHORT,0);
    // legs/stand (static): vertical post + pivot axle + foot
    gl.uniform3f(gU.fillC,0.40,0.43,0.50); gl.bindVertexArray(GEO.cyl.vao);
    gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(px,0,0),mScale(0.12,py,0.12))); gl.drawElements(gl.TRIANGLES,GEO.cyl.count,gl.UNSIGNED_SHORT,0);
    gl.uniformMatrix4fv(gU.model,false,mMul(mMul(mTranslate(px+0.17,py,0),mRotZ(Math.PI/2)),mScale(0.1,0.34,0.1))); gl.drawElements(gl.TRIANGLES,GEO.cyl.count,gl.UNSIGNED_SHORT,0);
    gl.uniform3f(gU.fillC,0.30,0.33,0.40); gl.bindVertexArray(GEO.disc.vao);
    gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(px,0,0),mScale(1.4,0.6,1.4))); gl.drawElements(gl.TRIANGLES,GEO.disc.count,gl.UNSIGNED_SHORT,0);
    // cup + water (gauge color)
    gl.uniform3f(gU.fillC,0.5,0.52,0.58); gl.bindVertexArray(GEO.cyl.vao);
    gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(cupx,0,0),mScale(0.53,0.28,0.53))); gl.drawElements(gl.TRIANGLES,GEO.cyl.count,gl.UNSIGNED_SHORT,0);
    gl.uniform3f(gU.fillC,c[0],c[1],c[2]); gl.bindVertexArray(GEO.disc.vao);
    gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(cupx,0.22,0),mScale(0.55,0.5,0.55))); gl.drawElements(gl.TRIANGLES,GEO.disc.count,gl.UNSIGNED_SHORT,0);
    gl.bindVertexArray(null);
  }

  // ---- Newton's cradle scene: 5 balls, scripted momentum transfer ----
  function drawCradle(vp, dt, tSec){
    const v=val0(), c=col0;
    cradlePhase += dt*(1.4 + v*3.2);
    const p=Math.sin(cradlePhase), MAXA=0.55, L=0.60, topY=1.15, N=5, gap=0.33;
    gl.useProgram(gProg); gl.uniformMatrix4fv(gU.vp,false,vp); gl.uniform1i(gU.discard,0); gl.uniform1f(gU.fill,2.0); gl.uniform3f(gU.trackC,TRACK[0],TRACK[1],TRACK[2]);
    // top bar (cylinder along X)
    gl.uniform3f(gU.fillC,0.30,0.34,0.42); gl.bindVertexArray(GEO.cyl.vao);
    gl.uniformMatrix4fv(gU.model,false,mMul(mMul(mTranslate(-(N-1)*gap/2 - 0.14, topY, 0),mRotZ(-Math.PI/2)),mScale(0.045,(N-1)*gap+0.28,0.045))); gl.drawElements(gl.TRIANGLES,GEO.cyl.count,gl.UNSIGNED_SHORT,0);
    for(let i=0;i<N;i++){
      const x0=-(N-1)*gap/2 + i*gap;
      let th=0; if(i===0) th=Math.min(0,p)*MAXA; else if(i===N-1) th=Math.max(0,p)*MAXA;
      const bx=x0 + L*Math.sin(th), by=topY - L*Math.cos(th);
      // string: cylinder +Y mapped to the (sinθ,−cosθ) direction via rotZ(π+θ)
      gl.uniform3f(gU.fillC,0.45,0.48,0.55); gl.bindVertexArray(GEO.cyl.vao);
      gl.uniformMatrix4fv(gU.model,false,mMul(mMul(mTranslate(x0,topY,0),mRotZ(Math.PI+th)),mScale(0.012,L,0.012)));
      gl.drawElements(gl.TRIANGLES,GEO.cyl.count,gl.UNSIGNED_SHORT,0);
      // ball
      gl.uniform3f(gU.fillC,c[0],c[1],c[2]); gl.bindVertexArray(GEO.ball.vao);
      gl.uniformMatrix4fv(gU.model,false,mTranslate(bx,by,0)); gl.drawElements(gl.TRIANGLES,GEO.ball.count,gl.UNSIGNED_SHORT,0);
    }
    gl.bindVertexArray(null);
  }

  // ---- v980 focus scene: one big avatar, center of attention (+ pet) ----
  function drawFocus(vp, dt, tSec){
    A.x = 0; A.z = 0;
    A.yaw += (Math.sin(tSec*0.22)*0.5 - A.yaw) * Math.min(1, dt*1.5);   // slow idle turn
    if(mesh){
      if(animator && !_cheer && idleIdx>=0 && A.clip!==idleIdx){ try{ animator.setClip(idleIdx,0.25); }catch{} A.clip=idleIdx; }
      drawAvatarMesh(vp, dt);
    }
    if(petEnabled){ updatePet(dt, tSec); drawPetLlama(vp, tSec); }   // small companion, doesn't steal focus
  }

  // ---- v979 surf scene: ride a board on the open sea (the "surfing" look) ----
  function drawSurf(vp, dt, tSec){
    const sea = 0.7;
    surf.bob  = Math.sin(tSec*1.6)*0.035 + Math.sin(tSec*2.7)*0.012;
    surf.lean = Math.sin(tSec*0.7)*0.16 + Math.sin(tSec*1.5)*0.05;
    surf.turn = Math.sin(tSec*0.45)*0.34;
    const waterY = -0.10 + surf.bob*0.5;
    // deep base under the sea so we don't see through to black
    gl.useProgram(gProg); gl.uniformMatrix4fv(gU.vp,false,vp); gl.uniform1i(gU.discard,0); gl.uniform1f(gU.fill,2.0); gl.uniform3f(gU.trackC,TRACK[0],TRACK[1],TRACK[2]);
    gl.uniform3f(gU.fillC,0.03,0.07,0.13); gl.bindVertexArray(GEO.disc.vao);
    gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(0,-0.55,0),mScale(3.2,0.6,3.2))); gl.drawElements(gl.TRIANGLES,GEO.disc.count,gl.UNSIGNED_SHORT,0);
    // animated sea surface (wave program)
    gl.useProgram(wProg); gl.uniform1f(wU.alpha,1.0); gl.uniformMatrix4fv(wU.vp,false,vp);
    gl.uniformMatrix4fv(wU.model,false,mScale(2.2,1,2.2));
    gl.uniform1f(wU.time,tSec); gl.uniform1f(wU.level,waterY); gl.uniform1f(wU.amp,0.05+sea*0.05);
    gl.uniform3f(wU.color, 0.10, 0.42, 0.78); gl.bindVertexArray(GRID.vao); gl.drawElements(gl.TRIANGLES,GRID.count,gl.UNSIGNED_SHORT,0);
    // surfboard — GEO.disc scaled to a thin long board, bobbing/turning under the feet
    gl.useProgram(gProg); gl.uniformMatrix4fv(gU.vp,false,vp); gl.uniform1i(gU.discard,0); gl.uniform1f(gU.fill,2.0); gl.uniform3f(gU.trackC,TRACK[0],TRACK[1],TRACK[2]);
    gl.uniform3f(gU.fillC, 0.96, 0.80, 0.28);
    const boardM=mMul(mMul(mMul(mTranslate(0,-0.015+surf.bob,0),mRotY(surf.turn)),mRotZ(surf.lean*0.6)),mScale(0.34,0.10,1.15));
    gl.uniformMatrix4fv(gU.model,false,boardM); gl.bindVertexArray(GEO.disc.vao); gl.drawElements(gl.TRIANGLES,GEO.disc.count,gl.UNSIGNED_SHORT,0);
    gl.bindVertexArray(null);
    // rider (idle/balance clip; drawAvatarMesh advances the animator)
    if(mesh){
      if(animator && !_cheer && idleIdx>=0 && A.clip!==idleIdx){ try{ animator.setClip(idleIdx,0.25); }catch{} A.clip=idleIdx; }
      drawAvatarMesh(vp, dt);
    }
  }

  function frame(){
    if(destroyed) return;
    const now=performance.now();
    if(_peerVisitUntil && now>_peerVisitUntil){ _peerVisitUntil=0; _visitAlarm=false; _visitorAv=null;
      if(_origVisitor){ try{ if(_origVisitor.slot==="duo") duoB=_origVisitor.av; else if(_origVisitor.slot==="studio") studioB=_origVisitor.av; }catch{} _origVisitor=null; } }   // v1615 cameo over; v1639 restore the resident 2nd avatar
    // throttle + pause
    if(paused || extPaused || !onScreen){ raf=requestAnimationFrame(frame); lastT=now; return; }
    if(now-lastDraw < MIN_DT){ raf=requestAnimationFrame(frame); return; }
    const dt=Math.min(0.05,(now-lastT)/1000); lastT=now; lastDraw=now;

    // v1253 (#11) — auto-force the focus pose while the avatar is shown on the pip-boy/
    // starfield screen (self-detect the display class gameHud adds); restore on clear.
    try {
      const cls=document.documentElement.classList;
      const pip = cls.contains("pipboy-avatar") || cls.contains("starfield-avatar");
      if(pip && !_pipFocusOwn && scene!=="focus" && !_juggle && !_rally && !_bowl && !_llamaOwnsScene){ if(_priorScene===null) _priorScene=scene; scene="focus"; _pipFocusOwn=true; }
      else if(!pip && _pipFocusOwn){ if(_priorScene!==null && !_juggle && !_rally && !_bowl){ scene=_priorScene; _priorScene=null; } _pipFocusOwn=false; }
    } catch(e){}

    const w=canvas.clientWidth|0, h=canvas.clientHeight|0;
    if(w&&h&&(canvas.width!==w||canvas.height!==h)){ canvas.width=w; canvas.height=h; }
    if(_capturePending){ _capturePending=false; try{ const data=canvas.toDataURL("image/png"); if(typeof opts.onSelfie==="function") opts.onSelfie(data); }catch{} }   // v1018 - capture the drawn selfie pose before clearing
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
    // v1253 (#11) — 1px-corner guard: keep one pixel non-transparent so a compositor
    // never treats the avatar canvas as empty and skips it (the "renders black" case).
    gl.enable(gl.SCISSOR_TEST); gl.scissor(0,0,1,1); gl.clearColor(0.02,0.03,0.04,1.0); gl.clear(gl.COLOR_BUFFER_BIT); gl.disable(gl.SCISSOR_TEST); gl.clearColor(0,0,0,0);

    const _talking = now < _talkUntil;
    if(_talking !== _lastPubTalk){ _lastPubTalk = _talking; try{ fetch("/avatar/mood",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({talking:_talking})}); }catch(e){} }   // v1393 — avatar->world talk sync (edge only)
    _talkAmt += ((_talking?1:0) - _talkAmt) * Math.min(1, dt*5);
    // v1366 — talking envelope -> visor vocoder bars + jaw bone
    { const _ts=now*0.001;
      const ext=(_extTalkLevel>=0 && (now-_extTalkT)<220)?_extTalkLevel:-1;
      const syn=_talking ? Math.min(1, 0.30 + 0.55*Math.abs(Math.sin(_ts*9.2)) + 0.25*Math.abs(Math.sin(_ts*15.7))) : 0;
      const energy=(ext>=0?ext:syn) * Math.max(_talkAmt, _talking?0.4:0);
      _jawLevel += (energy - _jawLevel) * Math.min(1, dt*14);
      if(_visorMode && _vocBars && _vocBars.length){
        const yb=((typeof _visorCfg.cy==="number"?_visorCfg.cy:38)+12);
        for(let i=0;i<_vocBars.length;i++){ const lvl=energy*(0.35+0.65*Math.abs(Math.sin(_ts*(6+i*1.7)+i*0.9)));
          const h=0.6+lvl*7.5, b=_vocBars[i]; if(b){ b.setAttribute("height",h.toFixed(2)); b.setAttribute("y",(yb-h).toFixed(2)); } }
      }
    }
    // v991 — selfie pulse: ease 0→1→0 over the sequence; flash at the peak.
    if(_selfieT0){
      const p=(now-_selfieT0)/_selfieDur;
      if(p>=1){ _selfieT0=0; _selfieAmt=0; }
      else { _selfieAmt=Math.sin(Math.min(1,p)*Math.PI); if(p>=0.5 && !_selfieFlashed){ _selfieFlashed=true; doFlash(); } }
    }
    const vp=camera();
    const tSec=(now-_t0)/1000;

    if(scene==="wave"){ drawSoloWave(vp, tSec); raf=requestAnimationFrame(frame); return; }
    if(scene==="carrier"){ drawCarrier(vp, tSec); raf=requestAnimationFrame(frame); return; }
    if(scene==="surf"){ drawSurf(vp, dt, tSec); raf=requestAnimationFrame(frame); return; }
    if(scene==="focus"){ drawFocus(vp, dt, tSec); raf=requestAnimationFrame(frame); return; }
    if(scene==="duo" || scene==="guest"){ drawDuo(vp, dt, tSec); raf=requestAnimationFrame(frame); return; }
    if(scene==="sinkingship"){ drawSinkingShip(vp, tSec); raf=requestAnimationFrame(frame); return; }
    if(scene==="boids"){ updateBoids(dt); drawBoids(vp); raf=requestAnimationFrame(frame); return; }
    if(scene==="pendulum"){ drawPendulumWave(vp, tSec); raf=requestAnimationFrame(frame); return; }
    if(scene==="gears"){ drawGears(vp, dt); raf=requestAnimationFrame(frame); return; }
    if(scene==="asteroids"){ drawAsteroids(vp, dt); raf=requestAnimationFrame(frame); return; }
    if(scene==="cradle"){ drawCradle(vp, dt, tSec); raf=requestAnimationFrame(frame); return; }
    if(scene==="bird"){ drawBird(vp, dt, tSec); raf=requestAnimationFrame(frame); return; }
    if(scene==="screen"){
      drawScreen(vp);
      if(mesh){ A.x=-0.98; A.z=0.30; A.yaw=0.82; drawAvatarMesh(vp, dt); }   // stand watching, idle
      raf=requestAnimationFrame(frame); return;
    }

    // v1013 — room backdrop (diorama only; ?room=0 to disable)
    if((scene==="diorama"||scene==="studio") && opts.room!==false){ try{ drawRoom(vp); }catch{} }

    // ---- gauge actors: ring / gyro / barrel / voxelbarrel / wave ----
    for(const a of actors){
      let v=a.getValue(); if(!(v>=0))v=0; if(v>1)v=1;
      const cx=(a._drawX!=null?a._drawX:a.x), ly=a._liftY||0, cz=(a.z||0);   // v1010/v1363 — carried x + lift Y + free-placement depth

      // v2433 -- SPACETIME PORTHOLES. One disc, stood upright to face the viewer, shaded entirely from its radius:
      // the wormhole's throat opens as the value rises; the black hole's horizon grows and squeezes the accretion
      // band. Every constant comes from fx/gauge/spacetimeGauges.js GAUGE_CONST, the same numbers the 2D gauges use.
      if(isSpacetimeStyle(a.style)){
        gl.useProgram(spProg); gl.uniformMatrix4fv(spU.vp,false,vp);
        gl.uniformMatrix4fv(spU.model,false,mMul(mMul(mTranslate(cx,ly+0.62,cz),mRotX(Math.PI/2)),mScale(0.92,0.92,0.92)));
        gl.uniform1f(spU.time,tSec); gl.uniform1f(spU.value,v); gl.uniform1i(spU.mode,modeFor(a.style));
        gl.uniform3f(spU.color,a.color[0],a.color[1],a.color[2]);
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
        gl.bindVertexArray(GEO.disc.vao); gl.drawElements(gl.TRIANGLES,GEO.disc.count,gl.UNSIGNED_SHORT,0);
        gl.depthMask(true);
        continue;
      }

      if(a.style==="wave"){
        // tank: dark base + 2 hoops (gProg, solid)
        gl.useProgram(gProg); gl.uniformMatrix4fv(gU.vp,false,vp); gl.uniform1i(gU.discard,0); gl.uniform1f(gU.fill,2.0); gl.uniform3f(gU.trackC,TRACK[0],TRACK[1],TRACK[2]);
        gl.uniform3f(gU.fillC,0.10,0.12,0.16); gl.bindVertexArray(GEO.disc.vao);
        gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(cx,ly+0.0,cz),mScale(1.25,0.5,1.25))); gl.drawElements(gl.TRIANGLES,GEO.disc.count,gl.UNSIGNED_SHORT,0);
        gl.uniform3f(gU.fillC,a.color[0]*0.5,a.color[1]*0.5,a.color[2]*0.5); gl.bindVertexArray(GEO.gimbal.vao);
        for(const hy of [0.02,0.9]){ gl.uniformMatrix4fv(gU.model,false,mMul(mMul(mTranslate(cx,ly+hy,cz),mRotX(Math.PI/2)),mScale(0.94,0.94,0.94))); gl.drawElements(gl.TRIANGLES,GEO.gimbal.count,gl.UNSIGNED_SHORT,0); }
        // sloshing water surface (wProg)
        gl.useProgram(wProg); gl.uniform1f(wU.alpha,1.0); gl.uniformMatrix4fv(wU.vp,false,vp);
        gl.uniformMatrix4fv(wU.model,false,mMul(mTranslate(cx,ly+0,cz),mScale(0.62,1,0.62)));
        gl.uniform1f(wU.time,tSec); gl.uniform1f(wU.level,0.06+v*0.78); gl.uniform1f(wU.amp,0.045);
        gl.uniform3f(wU.color,a.color[0],a.color[1],a.color[2]);
        gl.bindVertexArray(GRID.vao); gl.drawElements(gl.TRIANGLES,GRID.count,gl.UNSIGNED_SHORT,0);
        continue;
      }

      // gProg styles
      gl.useProgram(gProg); gl.uniformMatrix4fv(gU.vp,false,vp); gl.uniform3f(gU.trackC,TRACK[0],TRACK[1],TRACK[2]); gl.uniform1i(gU.discard,0);

      if(a.style==="gyro"){
        a.spin += dt*(0.6 + v*7.0);
        const base=mTranslate(cx,ly+0.82,cz);
        gl.uniform1f(gU.fill,2.0);
        gl.uniform3f(gU.fillC,a.color[0]*0.6,a.color[1]*0.6,a.color[2]*0.6);
        gl.bindVertexArray(GEO.gimbal.vao);
        gl.uniformMatrix4fv(gU.model,false,mMul(base,mRotZ(a.spin*0.25)));
        gl.drawElements(gl.TRIANGLES,GEO.gimbal.count,gl.UNSIGNED_SHORT,0);
        gl.uniformMatrix4fv(gU.model,false,mMul(mMul(base,mRotY(Math.PI/2)),mRotZ(a.spin*0.6)));
        gl.drawElements(gl.TRIANGLES,GEO.gimbal.count,gl.UNSIGNED_SHORT,0);
        gl.uniform3f(gU.fillC,a.color[0],a.color[1],a.color[2]);
        gl.bindVertexArray(GEO.disc.vao);
        gl.uniformMatrix4fv(gU.model,false,mMul(mMul(base,mRotX(Math.PI/2)),mMul(mRotY(a.spin),mScale(0.85,1,0.85))));
        gl.drawElements(gl.TRIANGLES,GEO.disc.count,gl.UNSIGNED_SHORT,0);
      } else if(a.style==="barrel"){
        const H=1.0;
        gl.uniform1f(gU.fill,2.0); gl.uniform3f(gU.fillC,0.10,0.12,0.16);
        gl.bindVertexArray(GEO.disc.vao);
        gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(cx,ly+0.0,cz),mScale(1.15,0.6,1.15)));
        gl.drawElements(gl.TRIANGLES,GEO.disc.count,gl.UNSIGNED_SHORT,0);
        gl.uniform3f(gU.fillC,a.color[0],a.color[1],a.color[2]);
        gl.bindVertexArray(GEO.cyl.vao);
        gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(cx,ly+0.04,cz),mScale(0.92,Math.max(0.001,v*H),0.92)));
        gl.drawElements(gl.TRIANGLES,GEO.cyl.count,gl.UNSIGNED_SHORT,0);
        gl.uniform3f(gU.fillC,a.color[0]*0.55,a.color[1]*0.55,a.color[2]*0.55);
        gl.bindVertexArray(GEO.gimbal.vao);
        for(const hy of [0.5*H, H]){ gl.uniformMatrix4fv(gU.model,false,mMul(mMul(mTranslate(cx,ly+hy,cz),mRotX(Math.PI/2)),mScale(0.82,0.82,0.82))); gl.drawElements(gl.TRIANGLES,GEO.gimbal.count,gl.UNSIGNED_SHORT,0); }
      } else if(a.style==="voxelbarrel"){
        // dark base
        gl.uniform1f(gU.fill,2.0); gl.uniform3f(gU.fillC,0.10,0.12,0.16);
        gl.bindVertexArray(GEO.disc.vao);
        gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(cx,ly+0.0,cz),mScale(1.2,0.5,1.2)));
        gl.drawElements(gl.TRIANGLES,GEO.disc.count,gl.UNSIGNED_SHORT,0);
        // voxel cubes — discard cubes above the liquid level
        gl.uniform1i(gU.discard,1); gl.uniform1f(gU.fill,v);
        gl.uniform3f(gU.fillC,a.color[0],a.color[1],a.color[2]);
        gl.bindVertexArray(GEO.voxel.vao);
        gl.uniformMatrix4fv(gU.model,false,mTranslate(cx,ly+0.06,cz));
        gl.drawElements(gl.TRIANGLES,GEO.voxel.count,gl.UNSIGNED_SHORT,0);
        gl.uniform1i(gU.discard,0);
        // tank hoops outline
        gl.uniform1f(gU.fill,2.0); gl.uniform3f(gU.fillC,a.color[0]*0.5,a.color[1]*0.5,a.color[2]*0.5);
        gl.bindVertexArray(GEO.gimbal.vao);
        for(const hy of [0.45,0.95]){ gl.uniformMatrix4fv(gU.model,false,mMul(mMul(mTranslate(cx,ly+hy,cz),mRotX(Math.PI/2)),mScale(0.94,0.94,0.94))); gl.drawElements(gl.TRIANGLES,GEO.gimbal.count,gl.UNSIGNED_SHORT,0); }
      } else {  // "ring" dial (default)
        gl.uniformMatrix4fv(gU.model,false,mTranslate(cx,ly+0.82,cz));
        gl.uniform1f(gU.fill,v);
        gl.uniform3f(gU.fillC,a.color[0],a.color[1],a.color[2]);
        gl.bindVertexArray(GEO.dial.vao);
        gl.drawElements(gl.TRIANGLES,GEO.dial.count,gl.UNSIGNED_SHORT,0);
      }
    }
    gl.bindVertexArray(null);

    // ---- avatar actor ----
    if(mesh){
      updateAvatar(dt, tSec);
      drawAvatarMesh(vp, dt);
    }
    if(scene==="studio" && studioB && studioB.mesh){
      if(_studioWalkIn){ const arr=approach(studioB, 1.30, dt, -0.55); if(arr){ _studioWalkIn=false; studioB.st.yaw=-0.55; setClipSafe(studioB, studioB.idle); } }   // v1615 — caveat 2: 2nd avatar walks in from off-stage, past the gauges + pet
      drawDuoAvatar(vp, dt, studioB);
    }   // v1528 — persistent second avatar beside the gauges
    // v1011 — registered extra grabbables (the dials draw in the loop above)
    for(let gi=actors.length; gi<grabbables.length; gi++){ const g=grabbables[gi]; if(g && g.draw){ try{ g.draw(g, vp, dt, tSec); }catch{} } }
    if(petEnabled){ updatePet(dt, tSec); drawPetLlama(vp, tSec); }   // v934 — wandering pet llama
    raf=requestAnimationFrame(frame);
  }

  function drawAvatarMesh(vp, dt){
    const model=avatarModel();
    gl.useProgram(aProg);
    gl.uniformMatrix4fv(aU.vp,false,vp); gl.uniformMatrix4fv(aU.model,false,model);
    if(animator&&mesh.hasSkin){ animator.update(dt); gl.uniformMatrix4fv(aU.joints,false,animator.jointMatrices); gl.uniform1i(aU.hasSkin,1); } else gl.uniform1i(aU.hasSkin,0);
    let t=[1,1,1]; try{ const c=costumes.get(url); if(c&&c.tint) t=c.tint; }catch{}
    gl.uniform3f(aU.tint,t[0],t[1],t[2]);
    try{ const eff=avatarColor.getEffective(url); gl.uniform3f(aU.ovr,eff.rgb[0],eff.rgb[1],eff.rgb[2]); gl.uniform1f(aU.ovrAmt,eff.amt||0); }catch{ gl.uniform1f(aU.ovrAmt,0); }
    if(_mood!=="support"){ const mt=_moodTint(); gl.uniform3f(aU.ovr,mt.rgb[0],mt.rgb[1],mt.rgb[2]); gl.uniform1f(aU.ovrAmt,mt.amt); }   // v1224 — mood wash (souring=amber, alarm=pulsing red)
    gl.uniform3f(aU.base,0.80,0.82,0.88);
    gl.uniform1i(aU.hasVC,mesh.hasVColor?1:0);
    if(mesh.texture){ gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,mesh.texture); gl.uniform1i(aU.tex,0); gl.uniform1i(aU.hasTex,1); } else gl.uniform1i(aU.hasTex,0);
    gl.bindVertexArray(mesh.vao); gl.drawElements(gl.TRIANGLES,mesh.indexCount,gl.UNSIGNED_INT,0); gl.bindVertexArray(null);
    drawAccessories(vp, dt);   // v1529 — worn/held GLB props on head/hand/foot bones
    if(_cheer) drawPomPoms(vp, dt);
    if(_juggle && scene!=="duo" && scene!=="guest") drawJuggle(vp, dt, "single");   // v1227
    if(_bowl && scene!=="duo" && scene!=="guest") drawBowl(vp, dt);   // v1229
    if(_soccer && scene!=="duo" && scene!=="guest") drawSoccer(vp, dt);   // v1291
  }

  // v1221 — find the two hand bones (by name, split left/right by world X).
  function findHands(){ return findHandsFor(animator); }
  function findHandsFor(anim){
    if(!anim || !anim.nodes || !anim.nodeMatrices) return [];
    const nodes=anim.nodes, NM=anim.nodeMatrices;
    const score=(nm)=> /hand|wrist|palm/i.test(nm)?3 : /fore ?arm|elbow|lower ?arm/i.test(nm)?2 : 0;   // v1529 — dropped the shoulder/upper-arm clause: it pinned poms to the SHOULDER on rigs with no hand-named bone. Now those fall through to the geometric fallback (lowest-but-upper ±X bone = the raised hand in the cheer pose).
    let cands=[]; for(let i=0;i<nodes.length;i++){ const s=score(nodes[i].name||""); if(s>0&&NM[i]) cands.push({i,s,x:NM[i][12]}); }
    if(cands.length){
      const mx=Math.max(...cands.map(c=>c.s)); cands=cands.filter(c=>c.s===mx).sort((a,b)=>a.x-b.x);
      return cands.length===1 ? [cands[0].i] : [cands[0].i, cands[cands.length-1].i];
    }
    // fallback: no named arm bones — pick the most ±X bones in the upper half.
    let ys=[]; for(let i=0;i<NM.length;i++) if(NM[i]) ys.push(NM[i][13]);
    if(!ys.length) return [];
    const medY=ys.slice().sort((a,b)=>a-b)[Math.floor(ys.length/2)];
    let lo=null, hi=null;
    for(let i=0;i<NM.length;i++){ if(!NM[i]||NM[i][13]<medY) continue; const x=NM[i][12]; if(lo===null||x<NM[lo][12]) lo=i; if(hi===null||x>NM[hi][12]) hi=i; }
    return (lo!==null&&hi!==null&&lo!==hi)?[lo,hi]:(lo!==null?[lo]:[]);
  }
  // v1529 — head bone finder (worn accessories): /head/ best, else /neck/, else the topmost bone.
  function _findHeadIdx(anim){
    if(!anim || !anim.nodes || !anim.nodeMatrices) return -1;
    const nodes=anim.nodes, NM=anim.nodeMatrices;
    const score=(nm)=> /head/i.test(nm)?3 : /neck/i.test(nm)?2 : 0;
    let best=-1, bs=0, by=-Infinity;
    for(let i=0;i<nodes.length;i++){ if(!NM[i]) continue; const s=score(nodes[i].name||""); if(s>0 && (s>bs || (s===bs && NM[i][13]>by))){ bs=s; best=i; by=NM[i][13]; } }
    if(best>=0) return best;
    let hi=-1, hy=-Infinity; for(let i=0;i<NM.length;i++){ if(NM[i] && NM[i][13]>hy){ hy=NM[i][13]; hi=i; } } return hi;   // fallback: topmost bone
  }
  // v1529 — foot bone finder (mirrors findHandsFor, low end): /foot|toe/, then /ankle|heel/, then /leg|shin/.
  function _findFeetFor(anim){
    if(!anim || !anim.nodes || !anim.nodeMatrices) return [];
    const nodes=anim.nodes, NM=anim.nodeMatrices;
    const score=(nm)=> /foot|toe/i.test(nm)?3 : /ankle|heel/i.test(nm)?2 : /\bleg\b|shin|calf/i.test(nm)?1 : 0;
    let cands=[]; for(let i=0;i<nodes.length;i++){ const s=score(nodes[i].name||""); if(s>0&&NM[i]) cands.push({i,s,x:NM[i][12]}); }
    if(cands.length){ const mx=Math.max(...cands.map(c=>c.s)); cands=cands.filter(c=>c.s===mx).sort((a,b)=>a.x-b.x);
      return cands.length===1 ? [cands[0].i] : [cands[0].i, cands[cands.length-1].i]; }
    let ys=[]; for(let i=0;i<NM.length;i++) if(NM[i]) ys.push(NM[i][13]);
    if(!ys.length) return [];
    const medY=ys.slice().sort((a,b)=>a-b)[Math.floor(ys.length/2)];
    let lo=null, hi=null;
    for(let i=0;i<NM.length;i++){ if(!NM[i]||NM[i][13]>medY) continue; const x=NM[i][12]; if(lo===null||x<NM[lo][12]) lo=i; if(hi===null||x>NM[hi][12]) hi=i; }   // LOWER half
    return (lo!==null&&hi!==null&&lo!==hi)?[lo,hi]:(lo!==null?[lo]:[]);
  }
  // v1529 — lazy-load a slot's GLB once. Max-extent normalized to _ACC_BASE[slot] so a blind scale=1 is sane.
  async function _ensureAcc(slot){
    const c=_accCfg[slot];
    if(!c || !c.on || !c.url){ _accAv[slot]=null; return; }
    if(_accAv[slot]==="pending") return;
    if(_accAv[slot] && _accAv[slot].url===c.url) return;
    _accAv[slot]="pending";
    try{
      const av=await buildAvatarFrom(c.url); const b=av && av.rawBBox;
      const ext=b ? (Math.max(b.maxX-b.minX, b.maxY-b.minY, b.maxZ-b.minZ)||1) : 1;
      _accAv[slot]={ url:c.url, mesh:av.mesh, norm:(_ACC_BASE[slot]||0.25)/ext,
                     cx:b?(b.minX+b.maxX)/2:0, cy:b?b.minY:0, cz:b?(b.minZ+b.maxZ)/2:0 };
    }catch(e){ _accAv[slot]=null; }
  }
  // v1529 — draw each enabled accessory at its bone. Main avatar A only (duo/studio B = later).
  function drawAccessories(vp, dt){
    if(!animator || !mesh || !mesh.hasSkin) return;
    let any=false; for(const k of ["head","hand","foot"]){ const c=_accCfg[k]; if(c && c.on && c.url){ any=true; break; } }
    if(!any) return;
    const model=avatarModel();
    for(const slot of ["head","hand","foot"]){
      const c=_accCfg[slot]; if(!c || !c.on || !c.url) continue;
      const a=_accAv[slot];
      if(a===undefined || (a && a.url!==c.url)){ _ensureAcc(slot); continue; }
      if(a==="pending" || !a || !a.mesh) continue;
      let idx=-1;
      if(slot==="head"){ if(_accHeadIdx===undefined) _accHeadIdx=_findHeadIdx(animator); idx=_accHeadIdx; }
      else { let arr;
             if(slot==="hand"){ if(_handIdx===undefined) _handIdx=findHands(); arr=_handIdx; }
             else { if(_accFootIdx===undefined) _accFootIdx=_findFeetFor(animator); arr=_accFootIdx; }
             if(arr && arr.length){ const side=(c.side==="left")?0:arr.length-1; idx=arr[side]; } }
      if(idx==null || idx<0 || !animator.nodeMatrices[idx]) continue;
      const bw=animator.nodeMatrices[idx];
      const S=a.norm*(Number(c.scale)||1), lift=Number(c.lift)||0, fwd=Number(c.fwd)||0;
      let M=mMul(model,bw);
      M=mMul(M, mTranslate(0,lift,fwd));
      M=mMul(M, mScale(S,S,S));
      M=mMul(M, mTranslate(-a.cx,-a.cy,-a.cz));
      gl.useProgram(aProg);
      gl.uniformMatrix4fv(aU.vp,false,vp); gl.uniformMatrix4fv(aU.model,false,M);
      gl.uniform1i(aU.hasSkin,0);
      gl.uniform3f(aU.tint,1,1,1); gl.uniform1f(aU.ovrAmt,0); gl.uniform3f(aU.base,0.80,0.82,0.88);
      gl.uniform1i(aU.hasVC, a.mesh.hasVColor?1:0);
      if(a.mesh.texture){ gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,a.mesh.texture); gl.uniform1i(aU.tex,0); gl.uniform1i(aU.hasTex,1); } else gl.uniform1i(aU.hasTex,0);
      gl.bindVertexArray(a.mesh.vao); gl.drawElements(gl.TRIANGLES,a.mesh.indexCount,gl.UNSIGNED_INT,0); gl.bindVertexArray(null);
    }
  }
  // v1227 — juggle engine. Pom-poms (pomVAO) follow timed parabolic arcs between
  // hand targets: 2 hands for one avatar, 4 for the duo (cross-passing).
  const JDUR = 0.55;   // seconds per throw
  function handWorld(model, anim, idx){
    if(!anim || !anim.nodeMatrices || !anim.nodeMatrices[idx]) return null;
    const M = mMul(model, anim.nodeMatrices[idx]); return [M[12], M[13], M[14]];
  }
  function juggleTargets(mode){
    const out=[];
    if(mode==="duo" && duoA && duoB){
      [duoA, duoB].forEach(av=>{ const a=av.animator; if(!a) return; if(!a._hi) a._hi=findHandsFor(a);
        const m=avatarModelFor(av); (a._hi||[]).forEach(i=>{ const p=handWorld(m,a,i); if(p) out.push(p); }); });
      return out;
    }
    if(!animator) return out;
    if(_handIdx===undefined) _handIdx=findHands();
    const m=avatarModel(); (_handIdx||[]).forEach(i=>{ const p=handWorld(m,animator,i); if(p) out.push(p); });
    return out;
  }
  function updateJuggle(dt, mode){
    const T=juggleTargets(mode), H=T.length; if(H<2) return null;
    _jt += (dt||0);
    const SEQ = H>=4 ? [0,3,1,2] : H===3 ? [0,2,1] : [0,1]; const L=SEQ.length;
    if(_balls.length!==_juggleN){ _balls.length=0; for(let i=0;i<_juggleN;i++) _balls.push({ hi:i%L, t0:_jt - i*(JDUR/_juggleN), idx:i }); }
    const peak = 0.55 + 0.04*_juggleN;
    const out=[];
    for(const b of _balls){
      let t=(_jt-b.t0)/JDUR; let guard=0;
      while(t>=1 && guard++<8){ b.hi=(b.hi+1)%L; b.t0+=JDUR; t=(_jt-b.t0)/JDUR; }
      t=Math.max(0,Math.min(1,t));
      const from=T[SEQ[b.hi]], to=T[SEQ[(b.hi+1)%L]]; if(!from||!to) continue;
      out.push([ from[0]+(to[0]-from[0])*t, from[1]+(to[1]-from[1])*t + Math.sin(Math.PI*t)*peak, from[2]+(to[2]-from[2])*t, b.idx ]);
    }
    return out;
  }
  function drawJuggle(vp, dt, mode){
    const JV = _juggleObj==="ball" ? GEO.ball : _juggleObj==="gauge" ? GEO.dial : pomVAO;
    if(!JV) return; const out=updateJuggle(dt, mode); if(!out||!out.length) return;
    gl.useProgram(gProg); gl.uniformMatrix4fv(gU.vp,false,vp);
    try{ gl.uniform1f(gU.fill,1); gl.uniform1f(gU.discard,0); }catch(e){}
    const spin=mRotY(_jt*4.0);
    for(const p of out){
      const col=hsl2rgb((p[3]/Math.max(1,_juggleN)+_jt*0.15)%1, 0.95, 0.6);
      gl.uniform3f(gU.fillC,col[0],col[1],col[2]);
      gl.uniformMatrix4fv(gU.model,false, mMul(mTranslate(p[0],p[1],p[2]), mMul(spin, mScale(0.55,0.55,0.55))));
      gl.bindVertexArray(JV.vao); gl.drawElements(gl.TRIANGLES,JV.count,gl.UNSIGNED_SHORT,0);
    }
    gl.bindVertexArray(null);
  }
  // Build the duo pair on demand so a 2-avatar juggle works from any mount.
  async function ensureDuo(){
    if(duoA && duoB){ duoReady=true; return true; }
    try{ if(!duoA) duoA=await buildAvatarFrom(url); if(!duoB) duoB=await buildAvatarFrom(url2); }catch(e){}
    if(duoA){ duoA.st.x=-1.0; duoA.st.yaw=Math.PI/2; } if(duoB){ duoB.st.x=1.0; duoB.st.yaw=-Math.PI/2; }
    duoReady=!!(duoA&&duoB); return duoReady;
  }
  // ===== v1229 — duo tennis/pickleball rally =====
  function innerHandPos(av){
    if(!av||!av.animator) return null; const a=av.animator; if(!a._hi) a._hi=findHandsFor(a);
    const m=avatarModelFor(av); let best=null, bx=1e9;
    (a._hi||[]).forEach(i=>{ const p=handWorld(m,a,i); if(p && Math.abs(p[0])<bx){ bx=Math.abs(p[0]); best=p; } });
    return best;
  }
  function updateRally(dt){
    if(!duoA||!duoB) return null;
    if(_rally && !_rallyExhausted){
      _rallyStamina = Math.max(0, _rallyStamina - (dt||0)/Math.max(8,_rallyTireSecs));
      rallyBall.dur = 0.58 + (1-_rallyStamina)*0.95;     // quick when fresh, slow when tired
      if(_rallyStamina<=0) _rallyExhausted=true;
    }
    rallyBall.t += (dt||0)/rallyBall.dur;
    if(rallyBall.t>=1){ rallyBall.t-=1; const f=rallyBall.from; rallyBall.from=rallyBall.to; rallyBall.to=f; rallyHits.n++; }
    const A=[duoA,duoB], fp=innerHandPos(A[rallyBall.from]), tp=innerHandPos(A[rallyBall.to]);
    if(!fp||!tp) return null; const t=rallyBall.t;
    return { pos:[ fp[0]+(tp[0]-fp[0])*t, fp[1]+(tp[1]-fp[1])*t + Math.sin(Math.PI*t)*0.5, fp[2]+(tp[2]-fp[2])*t ], t };
  }
  function stopRally(quip){
    _rally=false; _rallyExhausted=false; _rallyStamina=1; rallyHits.n=0; rallyBall.dur=0.85;
    if(_priorScene!==null){ scene=_priorScene; _priorScene=null; }
    if(quip){ try{ cheerleader.quip(quip); }catch(e){} }
  }
  function drawRally(vp,dt){
    if(_rallyExhausted){ stopRally("Phew \u2014 " + (rallyHits.n>60?"epic":"good") + " rally! " + rallyHits.n + " hits."); return; }
    const r=updateRally(dt);
    gl.useProgram(gProg); gl.uniformMatrix4fv(gU.vp,false,vp);
    try{ gl.uniform1f(gU.fill,1); gl.uniform1f(gU.discard,0); }catch(e){}
    const A=[duoA,duoB], tired=1-_rallyStamina;
    for(let i=0;i<2;i++){ const hp=innerHandPos(A[i]); if(!hp) continue;
      const dir=(i===0?1:-1);                                   // paddle faces inward toward the rally
      const swing=(r && rallyBall.from===i && r.t<0.25) ? (0.6 - r.t*2.4)*(1-tired*0.55) : 0;
      const ang = dir*(0.35+swing) + Math.sin(performance.now()/1000*(2.2-tired))*0.04;
      // handle (dark)
      gl.uniform3f(gU.fillC, 0.18,0.16,0.20);
      gl.uniformMatrix4fv(gU.model,false, mMul(mMul(mTranslate(hp[0],hp[1],hp[2]), mRotZ(ang)), mScale(0.035,0.18,0.05)));
      gl.bindVertexArray(GEO.box.vao); gl.drawElements(gl.TRIANGLES,GEO.box.count,gl.UNSIGNED_SHORT,0);
      // modern flat round paddle head, set out along the handle, face perpendicular to play
      const hx=hp[0]+dir*0.06, hy=hp[1]+0.20, hz=hp[2];
      gl.uniform3f(gU.fillC, i===0?0.20:0.95, i===0?0.70:0.45, i===0?0.95:0.18);   // blue vs orange paddles
      gl.uniformMatrix4fv(gU.model,false, mMul(mMul(mMul(mTranslate(hx,hy,hz), mRotZ(ang)), mRotY(Math.PI/2)), mScale(0.22,0.22,0.035)));
      gl.bindVertexArray(GEO.disc.vao); gl.drawElements(gl.TRIANGLES,GEO.disc.count,gl.UNSIGNED_SHORT,0);
    }
    if(r){ gl.uniform3f(gU.fillC, 0.90,0.97,0.35);
      gl.uniformMatrix4fv(gU.model,false, mMul(mTranslate(r.pos[0],r.pos[1],r.pos[2]), mScale(0.42,0.42,0.42)));
      gl.bindVertexArray(GEO.ball.vao); gl.drawElements(gl.TRIANGLES,GEO.ball.count,gl.UNSIGNED_SHORT,0);
    }
    gl.bindVertexArray(null);
  }
  // ===== v1229 — solo bowling =====
  function setupPins(){
    pins.length=0; const rows=[[0],[-0.16,0.16],[-0.32,0,0.32]];
    rows.forEach((row,ri)=> row.forEach(x=>{ const hz=-0.45 - ri*0.22; pins.push({ x, z:hz, hx:x, hz, vx:0, vz:0, yaw:0, vyaw:0, down:0 }); }));
  }
  function resetPins(){ pins.forEach(p=>{ p.x=p.hx; p.z=p.hz; p.vx=0; p.vz=0; p.yaw=0; p.vyaw=0; p.down=0; }); }
  function bowl(){
    if(!pins.length) setupPins(); else resetPins();
    bowlBall.active=true; bowlBall.x=(Math.random()*2-1)*0.18; bowlBall.y=0.14; bowlBall.z=0.62;
    bowlBall.vx=(0 - bowlBall.x)*0.4; bowlBall.vz=-2.2;
    // v1287 — HOOK: lateral spin that curves the path (randomized each roll), so the ball
    // can sweep into the pocket instead of always rolling dead-straight.
    bowlBall.spin=(Math.random()*2-1)*2.4; return true;
  }
  function updateBowl(dt){
    dt=Math.min(0.05, dt||0);
    if(bowlBall.active){
      bowlBall.vx += bowlBall.spin*dt;                              // hook curve grows down-lane
      bowlBall.x += bowlBall.vx*dt; bowlBall.z += bowlBall.vz*dt;
      // STRIKE: transfer momentum into the pin (scatter dir = ball->pin normal + ball travel),
      // start its topple, and bleed/deflect the ball a touch.
      pins.forEach(p=>{ if(p.down>0.15) return;
        const dx=p.x-bowlBall.x, dz=p.z-bowlBall.z, d=Math.hypot(dx,dz);
        if(d<0.16){ const inv=1/(d||0.001), nx=dx*inv, nz=dz*inv, sp=Math.hypot(bowlBall.vx,bowlBall.vz);
          p.vx += nx*sp*0.55 + bowlBall.vx*0.30; p.vz += nz*sp*0.55 + bowlBall.vz*0.30;
          p.vyaw += (Math.random()*2-1)*9; p.down=Math.max(p.down,0.02);
          bowlBall.vx -= nx*0.22; bowlBall.vz *= 0.95;
        }
      });
      if(bowlBall.z<-1.5){ bowlBall.active=false; _bowlResetAt=performance.now()+2800; }
    }
    // pin integration: scatter glide + friction, yaw spin, topple progress.
    for(let i=0;i<pins.length;i++){ const p=pins[i];
      if(p.vx||p.vz){ p.x+=p.vx*dt; p.z+=p.vz*dt; p.vx*=0.90; p.vz*=0.90; if(Math.abs(p.vx)<0.01)p.vx=0; if(Math.abs(p.vz)<0.01)p.vz=0; }
      if(p.vyaw){ p.yaw+=p.vyaw*dt; p.vyaw*=0.92; if(Math.abs(p.vyaw)<0.05)p.vyaw=0; }
      if(p.down>0 && p.down<1) p.down=Math.min(1, p.down + dt*4);
    }
    // CHAIN REACTION: a moving / falling pin that touches a still-standing neighbor knocks
    // it down too and passes on a share of its momentum (cascading pin scatter).
    for(let i=0;i<pins.length;i++){ const a=pins[i]; if(!(a.down>0.05 || a.vx || a.vz)) continue;
      const asp=Math.hypot(a.vx,a.vz);
      for(let j=0;j<pins.length;j++){ if(i===j) continue; const b=pins[j]; if(b.down>0.15) continue;
        const dx=b.x-a.x, dz=b.z-a.z, d=Math.hypot(dx,dz);
        if(d<0.17){ const inv=1/(d||0.001);
          b.vx += dx*inv*(asp*0.45 + 0.18); b.vz += dz*inv*(asp*0.45 + 0.18);
          b.vyaw += (Math.random()*2-1)*6; b.down=Math.max(b.down,0.02);
        }
      }
    }
    if(!bowlBall.active && _bowlResetAt && performance.now()>_bowlResetAt && pins.some(p=>p.down>0 || p.x!==p.hx || p.z!==p.hz)){ resetPins(); _bowlResetAt=0; }
  }
  function drawBowl(vp,dt){
    if(!pins.length) setupPins(); updateBowl(dt);
    gl.useProgram(gProg); gl.uniformMatrix4fv(gU.vp,false,vp);
    try{ gl.uniform1f(gU.fill,1); gl.uniform1f(gU.discard,0); }catch(e){}
    pins.forEach(p=>{ const tilt=p.down*Math.PI/2;
      gl.uniform3f(gU.fillC, 0.95,0.95,0.98);
      gl.uniformMatrix4fv(gU.model,false, mMul(mTranslate(p.x,0,p.z), mMul(mRotY(p.yaw||0), mMul(mRotX(tilt), mMul(mTranslate(0,0.16,0), mScale(0.10,0.34,0.10))))));
      gl.bindVertexArray(GEO.cyl.vao); gl.drawElements(gl.TRIANGLES,GEO.cyl.count,gl.UNSIGNED_SHORT,0);
    });
    if(bowlBall.active){ gl.uniform3f(gU.fillC,0.2,0.3,0.9);
      gl.uniformMatrix4fv(gU.model,false, mMul(mTranslate(bowlBall.x,bowlBall.y,bowlBall.z), mScale(0.9,0.9,0.9)));
      gl.bindVertexArray(GEO.ball.vao); gl.drawElements(gl.TRIANGLES,GEO.ball.count,gl.UNSIGNED_SHORT,0);
    }
    gl.bindVertexArray(null);
  }
  // ===== v1291 — soccer fidget: a tiny match, view stays centred on the ball, stops on a goal =====
  function setupSoccer(){
    soccer.ball.x=0; soccer.ball.z=0;
    soccer.ball.vx=(Math.random()*2-1)*0.4; soccer.ball.vz=(Math.random()<0.5?-1:1)*0.7;
    soccer.players=[ {x:-0.22,z:-0.55,team:0},{x:0.22,z:-0.30,team:0},{x:-0.22,z:0.55,team:1},{x:0.22,z:0.30,team:1} ];
    soccer.scored=0; soccer.ready=true; _soccerEndAt=0;
  }
  function endSoccer(){ _soccer=false; if(_priorScene!==null){ scene=_priorScene; _priorScene=null; } }
  function updateSoccer(dt){
    if(!soccer.ready) setupSoccer();
    dt=Math.min(0.05, dt||0);
    if(soccer.scored){ if(_soccerEndAt && performance.now()>_soccerEndAt) endSoccer(); return; }   // freeze on goal, then stop
    const b=soccer.ball;
    b.x+=b.vx*dt; b.z+=b.vz*dt; b.vx*=0.99; b.vz*=0.99;
    if(b.x<-soccer.pw){ b.x=-soccer.pw; b.vx=Math.abs(b.vx)*0.8; }
    if(b.x> soccer.pw){ b.x= soccer.pw; b.vx=-Math.abs(b.vx)*0.8; }
    for(const p of soccer.players){
      const dx=b.x-p.x, dz=b.z-p.z, d=Math.hypot(dx,dz)||0.001;
      const sp=0.6*dt; p.x+=dx/d*sp; p.z+=dz/d*sp;                       // chase the ball
      if(d<0.15){ const goalZ=(p.team===0? soccer.pl : -soccer.pl);      // kick toward opponent goal
        const gx=0-p.x, gz=goalZ-p.z, gd=Math.hypot(gx,gz)||0.001, kick=1.2;
        b.vx=gx/gd*kick + (Math.random()*2-1)*0.35; b.vz=gz/gd*kick;
      }
    }
    // goals on the end lines (within goal width) — else bounce off the back wall
    if(b.z> soccer.pl){ if(Math.abs(b.x)<soccer.goalW){ soccer.scored=1; _soccerEndAt=performance.now()+2600; } else { b.z= soccer.pl; b.vz=-Math.abs(b.vz)*0.8; } }
    if(b.z<-soccer.pl){ if(Math.abs(b.x)<soccer.goalW){ soccer.scored=1; _soccerEndAt=performance.now()+2600; } else { b.z=-soccer.pl; b.vz= Math.abs(b.vz)*0.8; } }
  }
  function drawSoccer(vp,dt){
    updateSoccer(dt); if(!_soccer) return;                               // updateSoccer may have ended it
    gl.useProgram(gProg); gl.uniformMatrix4fv(gU.vp,false,vp);
    try{ gl.uniform1f(gU.fill,1); gl.uniform1f(gU.discard,0); }catch(e){}
    const ox=-soccer.ball.x, oz=-soccer.ball.z;                          // CENTRE ON THE BALL: shift the world so the ball sits at origin
    // pitch
    gl.uniform3f(gU.fillC, 0.16,0.46,0.22);
    gl.uniformMatrix4fv(gU.model,false, mMul(mTranslate(ox,-0.05,oz), mScale(soccer.pw*1.15, 0.02, soccer.pl*1.08)));
    gl.bindVertexArray(GEO.box.vao); gl.drawElements(gl.TRIANGLES,GEO.box.count,gl.UNSIGNED_SHORT,0);
    // goals (white frames at each end), tinted gold on the side that just scored
    for(const gz of [soccer.pl, -soccer.pl]){
      const hot = soccer.scored && ((gz>0 && soccer.ball.z>0) || (gz<0 && soccer.ball.z<0));
      if(hot) gl.uniform3f(gU.fillC, 1.0,0.82,0.25); else gl.uniform3f(gU.fillC, 0.9,0.9,0.95);
      gl.uniformMatrix4fv(gU.model,false, mMul(mTranslate(ox,0.09,oz+gz), mScale(soccer.goalW*1.1, 0.16, 0.03)));
      gl.bindVertexArray(GEO.box.vao); gl.drawElements(gl.TRIANGLES,GEO.box.count,gl.UNSIGNED_SHORT,0);
    }
    // players (team-coloured posts)
    for(const p of soccer.players){
      if(p.team===0) gl.uniform3f(gU.fillC, 0.92,0.32,0.30); else gl.uniform3f(gU.fillC, 0.32,0.48,0.95);
      gl.uniformMatrix4fv(gU.model,false, mMul(mTranslate(ox+p.x,0,oz+p.z), mMul(mTranslate(0,0.16,0), mScale(0.07,0.32,0.07))));
      gl.bindVertexArray(GEO.cyl.vao); gl.drawElements(gl.TRIANGLES,GEO.cyl.count,gl.UNSIGNED_SHORT,0);
    }
    // ball — always at centre
    gl.uniform3f(gU.fillC, 0.97,0.97,0.99);
    gl.uniformMatrix4fv(gU.model,false, mMul(mTranslate(0,0.06,0), mScale(0.06,0.06,0.06)));
    gl.bindVertexArray(GEO.ball.vao); gl.drawElements(gl.TRIANGLES,GEO.ball.count,gl.UNSIGNED_SHORT,0);
    gl.bindVertexArray(null);
  }
  // v1221 — draw a shaking, color-cycling pom-pom at each hand bone.
  function drawPomPoms(vp, dt){
    if(!animator || !mesh.hasSkin || !pomVAO) return;
    if(_handIdx===undefined) _handIdx=findHands();
    if(!_handIdx || !_handIdx.length) return;
    _cheerT += (dt||0);
    const model=avatarModel();
    gl.useProgram(gProg); gl.uniformMatrix4fv(gU.vp,false,vp);
    try{ gl.uniform1f(gU.fill,1); gl.uniform1f(gU.discard,0); }catch(e){}
    for(let h=0;h<_handIdx.length;h++){
      const bw=animator.nodeMatrices[_handIdx[h]]; if(!bw) continue;
      const ph=h*Math.PI;
      const shake=0.35*Math.sin(_cheerT*20+ph);
      const sc=0.95*(1+0.12*Math.sin(_cheerT*20+ph));
      let M=mMul(model,bw); M=mMul(M,mRotZ(shake)); M=mMul(M,mScale(sc,sc,sc));
      const col=hsl2rgb(((_cheerT*0.6)+h*0.5)%1,0.95,0.62);
      gl.uniform3f(gU.fillC,col[0],col[1],col[2]);
      gl.uniformMatrix4fv(gU.model,false,M);
      gl.bindVertexArray(pomVAO.vao); gl.drawElements(gl.TRIANGLES,pomVAO.count,gl.UNSIGNED_SHORT,0);
    }
    // v1225 — particle sparks: emit from each hand, drift out + fall, fade by scale.
    if(_partsOn && sparkVAO){
      const dts=Math.min(0.05, dt||0.016);
      for(let h=0;h<_handIdx.length;h++){
        const bw=animator.nodeMatrices[_handIdx[h]]; if(!bw) continue;
        if(_parts.length<54){ const n=1+(Math.random()*2|0);
          for(let k=0;k<n;k++){ const a=Math.random()*6.283, e=0.3+Math.random()*0.9;
            _parts.push({ x:bw[12],y:bw[13],z:bw[14], vx:Math.cos(a)*0.5*e, vy:0.6+Math.random()*0.7, vz:Math.sin(a)*0.5*e, life:0.6+Math.random()*0.5, max:1.1, hue:((_cheerT*0.6)+h*0.5+Math.random()*0.1)%1 }); }
        }
      }
      // v1226 — additive glow: overlapping sparks brighten, no depth occlusion.
      let _blendOn=false; try{ gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false); _blendOn=true; }catch(e){}
      for(let i=_parts.length-1;i>=0;i--){ const p=_parts[i];
        p.life-=dts; if(p.life<=0){ _parts.splice(i,1); continue; }
        p.vy-=1.6*dts; p.x+=p.vx*dts; p.y+=p.vy*dts; p.z+=p.vz*dts;
        const f=p.life/p.max, s=0.4+1.1*f;
        const c=hsl2rgb(p.hue,0.95,0.55+0.25*f);
        gl.uniform3f(gU.fillC,c[0],c[1],c[2]);
        gl.uniformMatrix4fv(gU.model,false, mMul(model, mMul(mTranslate(p.x,p.y,p.z), mScale(s,s,s))));
        gl.bindVertexArray(sparkVAO.vao); gl.drawElements(gl.TRIANGLES,sparkVAO.count,gl.UNSIGNED_SHORT,0);
      }
      if(_blendOn){ try{ gl.depthMask(true); gl.disable(gl.BLEND); }catch(e){} }
    } else if(_parts.length){ _parts.length=0; }
    gl.bindVertexArray(null);
  }

  // ---- v934 — wandering 3D pet llama (primitives + gProg; no new shaders) ----
  function drawLlamaPart(geo, M, col){
    gl.uniform3f(gU.fillC, col[0], col[1], col[2]);
    gl.uniformMatrix4fv(gU.model, false, M);
    gl.bindVertexArray(geo.vao); gl.drawElements(gl.TRIANGLES, geo.count, gl.UNSIGNED_SHORT, 0);
  }
  function updatePet(dt, tSec){
    // v1242/v1243 — llama flight: ease up to a hover; when flying a hoop COURSE the
    // hover height follows the current ring so the llama threads each one.
    const wantFly = _llamaCam || _hoop;
    let baseFly = 0.70;
    if(_hoop && _hoopList.length){ const h=_hoopList[_hoopIdx % _hoopList.length]; baseFly=(h.y||0.72)-0.02; }
    const flyTgt = wantFly ? (baseFly + Math.sin(tSec*1.6)*0.10) : 0;
    pet.flightY = (pet.flightY||0) + (flyTgt - (pet.flightY||0)) * Math.min(1, dt*2.5);
    // hoop up + not fetching: single ring -> dive back-and-forth through its plane;
    // a course of rings -> slalom through them in sequence, looping.
    if(_hoop && (!pet.fetch || pet.fetch==="none")){
      if(_hoopList.length<=1){
        const h0=_hoopList[0]||{x:0,z:0.30}; pet.tx=h0.x; pet.tz=(h0.z||0.30)+Math.sin(tSec*0.8)*0.55; pet.retargetAt=tSec+10;
      } else {
        const h=_hoopList[_hoopIdx % _hoopList.length]; pet.tx=h.x; pet.tz=h.z; pet.retargetAt=tSec+10;
        if(Math.hypot(pet.x-h.x, pet.z-h.z) < 0.12) _hoopIdx=(_hoopIdx+1)%_hoopList.length;   // threaded it -> next
      }
    }
    // v1228 — fetch + bury gag. Avatar throws a ball; llama chases, grabs it,
    // carries it off to a corner, and BURIES it (never returns it).
    if(fetchBall && !fetchBall.carried){
      fetchBall.vy -= 3.2*dt;
      fetchBall.x += fetchBall.vx*dt; fetchBall.y += fetchBall.vy*dt; fetchBall.z += fetchBall.vz*dt;
      if(fetchBall.y <= 0.09){ fetchBall.y=0.09; fetchBall.vx=fetchBall.vy=fetchBall.vz=0; if(pet.fetch==="wait") pet.fetch="chase"; }
    }
    if(pet.fetch==="chase" && fetchBall){
      pet.tx=fetchBall.x; pet.tz=fetchBall.z; pet.retargetAt=tSec+10;
      if(Math.hypot(pet.x-fetchBall.x, pet.z-fetchBall.z)<0.20){ fetchBall.carried=true; pet.fetch="carry";
        pet.buryX=(Math.random()<0.5?-1:1)*(1.0+Math.random()*0.4); pet.buryZ=-0.25+Math.random()*0.55; }
    } else if(pet.fetch==="carry" && fetchBall){
      fetchBall.x=pet.x; fetchBall.z=pet.z; fetchBall.y=0.46;
      pet.tx=pet.buryX; pet.tz=pet.buryZ; pet.retargetAt=tSec+10;
      if(Math.hypot(pet.x-pet.buryX, pet.z-pet.buryZ)<0.20){ pet.fetch="bury"; pet.buryT=0; }
    } else if(pet.fetch==="bury"){
      pet.tx=pet.x; pet.tz=pet.z;   // stay put and dig
      pet.buryT=(pet.buryT||0)+dt;
      if(fetchBall){ fetchBall.x=pet.x; fetchBall.z=pet.z; fetchBall.y=Math.max(-0.22, 0.46 - pet.buryT*0.5); }
      if(pet.buryT>1.7){ fetchBall=null; pet.fetch="none"; pet.retargetAt=0; }
    }
    const idle = !pet.fetch || pet.fetch==="none";
    if(idle && tSec >= pet.retargetAt){ pet.tx=(Math.random()*2-1)*1.0; pet.tz=-0.15+Math.random()*0.7; pet.retargetAt=tSec+3+Math.random()*4; }
    const dx=pet.tx-pet.x, dz=pet.tz-pet.z, dist=Math.hypot(dx,dz);
    pet.moving = dist>0.05 && pet.fetch!=="bury";
    if(pet.moving){ const sp = (pet.fetch==="chase"||pet.fetch==="carry") ? 0.6 : 0.35; const step=Math.min(sp*dt, dist); pet.x+=dx/dist*step; pet.z+=dz/dist*step; pet.yaw=Math.atan2(dx,dz); }
  }
  // v1228 — avatar tosses a ball for the llama to (fail to) fetch.
  function throwForPet(){
    if(!petEnabled) return false;
    const sx=0, tx=(Math.random()*2-1)*1.1, tz=-0.1+Math.random()*0.55;
    fetchBall={ x:sx, y:1.0, z:0.30, vx:(tx-sx)*0.9, vy:1.9, vz:(tz-0.3)*0.9, carried:false };
    pet.fetch="wait"; return true;
  }
  function drawPetLlama(vp, tSec){
    gl.useProgram(gProg); gl.uniformMatrix4fv(gU.vp,false,vp); gl.uniform1i(gU.discard,0); gl.uniform1f(gU.fill,2.0); gl.uniform3f(gU.trackC,TRACK[0],TRACK[1],TRACK[2]);
    const t=tSec, mv=pet.moving, bob=Math.sin(t*6)*0.012*(mv?1:0.4);
    const dig = pet.fetch==="bury" ? -Math.abs(Math.sin(pet.buryT*11))*0.07 : 0;   // v1228 — head-down digging
    const B=mMul(mTranslate(pet.x, bob+dig+(pet.flightY||0), pet.z), mRotY(pet.yaw));   // v1242 — +flightY when airborne
    const CREAM=[0.90,0.85,0.74], EAR=[0.60,0.54,0.44], FACE=[0.74,0.67,0.56];
    drawLlamaPart(GEO.ball, mMul(B, mMul(mTranslate(0,0.34,0), mScale(1.05,0.85,1.65))), CREAM);     // body
    const legs=[[-0.10,0.13,0],[0.10,0.13,Math.PI],[-0.10,-0.15,Math.PI],[0.10,-0.15,0]];
    for(const lg of legs){ const sw=mv?Math.sin(t*8+lg[2])*0.35:0;
      drawLlamaPart(GEO.cyl, mMul(B, mMul(mMul(mTranslate(lg[0],0.15,lg[1]), mRotX(sw)), mScale(0.13,0.30,0.13))), CREAM); }
    drawLlamaPart(GEO.cyl,  mMul(B, mMul(mMul(mTranslate(0,0.46,0.13), mRotX(-0.5)), mScale(0.16,0.30,0.16))), CREAM);  // neck
    drawLlamaPart(GEO.ball, mMul(B, mMul(mTranslate(0,0.60,0.22), mScale(0.62,0.55,0.72))), CREAM);   // head
    drawLlamaPart(GEO.ball, mMul(B, mMul(mTranslate(0,0.57,0.33), mScale(0.36,0.32,0.40))), FACE);    // snout
    for(const sx of [-1,1]) drawLlamaPart(GEO.cone, mMul(B, mMul(mMul(mTranslate(sx*0.045,0.70,0.19), mRotX(-Math.PI/2)), mScale(0.55,0.55,0.55))), EAR);  // ears
    drawLlamaPart(GEO.ball, mMul(B, mMul(mTranslate(0,0.40,-0.26), mScale(0.45,0.45,0.55))), CREAM);  // tail
    if(fetchBall && fetchBall.y>-0.18){ drawLlamaPart(GEO.ball, mMul(mTranslate(fetchBall.x, fetchBall.y, fetchBall.z), mScale(0.7,0.7,0.7)), [1.0,0.5,0.12]); }   // v1228 — the fetched ball
    if(_hoop){   // v1242/v1243 — gold ring course the llama threads (one or many)
      gl.uniform1f(gU.fill,1); gl.uniform1f(gU.discard,0); gl.uniform3f(gU.fillC, 0.96,0.76,0.20);
      for(const h of _hoopList){
        gl.uniformMatrix4fv(gU.model,false, mMul(mTranslate(h.x,h.y,h.z), mScale(h.r,h.r,h.r)));
        gl.bindVertexArray(GEO.dial.vao); gl.drawElements(gl.TRIANGLES,GEO.dial.count,gl.UNSIGNED_SHORT,0);
      }
      gl.uniform1f(gU.fill,2.0);
    }
    gl.bindVertexArray(null);
  }

  // ============ v928 — two-avatar "duo" scene ============
  // Builds an independent avatar object (own VAO + SkeletalAnimator) so two can
  // share the canvas, face each other, and play paired emotes. Mirrors the single
  // avatar's GL setup; kept separate to avoid destabilizing the diorama/screen path.
  async function buildAvatarFrom(srcUrl){
    let buf, _fetched=_resolveUrl(srcUrl);
    const _FB="/GPU_Assets/RobotExpressive.glb";   // v994 — fall back to a present asset
    try{ const res=await fetch(_fetched); if(!res.ok) throw 0; buf=await res.arrayBuffer(); }
    catch(e){ if(_fetched!==_FB){ try{ const r2=await fetch(_FB); if(r2.ok){ buf=await r2.arrayBuffer(); _fetched=_FB; } }catch{} } }
    if(!buf) return null;
    let parsed; try{ parsed=await GLBParser.parse(buf,{ baseUrl:new URL(_fetched,location.href).href }); }catch(e){ return null; }
    const vao=gl.createVertexArray(); gl.bindVertexArray(vao);
    const buf3=(loc,data,n)=>{ const b=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,b); gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,n,gl.FLOAT,false,0,0); };
    buf3(0,parsed.positions,3);
    if(parsed.normals) buf3(1,parsed.normals,3); else gl.vertexAttrib3f(1,0,1,0);
    const hasSkin=!!(parsed.skin&&parsed.joints&&parsed.weights);
    if(hasSkin){ const jb=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,jb); gl.bufferData(gl.ARRAY_BUFFER,parsed.joints,gl.STATIC_DRAW); gl.enableVertexAttribArray(2); const jt=parsed.joints instanceof Uint8Array?gl.UNSIGNED_BYTE:gl.UNSIGNED_SHORT; gl.vertexAttribIPointer(2,4,jt,0,0); buf3(3,parsed.weights,4); }
    else { gl.vertexAttribI4ui(2,0,0,0,0); gl.vertexAttrib4f(3,0,0,0,0); }
    const hasVColor=!!(parsed.colors&&parsed.colors.length===parsed.positions.length);
    if(hasVColor) buf3(4,parsed.colors,3); else gl.vertexAttrib3f(4,0.8,0.82,0.88);
    if(parsed.texCoords) buf3(5,parsed.texCoords,2); else gl.vertexAttrib2f(5,0,0);
    const ib=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,parsed.indices,gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    let texture=null;
    if(parsed.texture instanceof HTMLImageElement||parsed.texture instanceof ImageBitmap){ texture=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,texture); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,parsed.texture); gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR); }
    const mesh2={ vao, indexCount:parsed.indices.length, hasSkin, hasVColor, texture };
    const p=parsed.positions; let mnX=Infinity,mnY=Infinity,mnZ=Infinity,mxX=-Infinity,mxY=-Infinity,mxZ=-Infinity;
    for(let i=0;i<p.length;i+=3){ if(p[i]<mnX)mnX=p[i];if(p[i]>mxX)mxX=p[i];if(p[i+1]<mnY)mnY=p[i+1];if(p[i+1]>mxY)mxY=p[i+1];if(p[i+2]<mnZ)mnZ=p[i+2];if(p[i+2]>mxZ)mxZ=p[i+2]; }
    let anim=null, idle=0, walk=-1;
    try{ anim=new SkeletalAnimator(parsed); if(anim.animations&&anim.animations.length){ let i=anim.animations.findIndex(a=>/idle|breath|stand/i.test(a.name||"")); idle=i>=0?i:0; walk=anim.animations.findIndex(a=>/walk/i.test(a.name||"")); anim.setClip(idle,0); } }catch(e){ anim=null; }
    // v1015 — HYBRID RIG bbox fix (e.g. RobotExpressive). Its rigid body parts are
    // concatenated at NODE-LOCAL positions (the runtime joint matrix places them),
    // so the raw bbox is a tiny cluster → height-normalize blows the model up huge
    // and it overflows the frame (the "sprawl"). For hybrid rigs only, recompute
    // the bbox from the POSED (idle) vertices by CPU-skinning exactly as the shader
    // does (sk = Σ wₖ·jointMatrixₖ ; posed = sk·pos). Pure-skinned rigs are untouched.
    if(parsed.hybrid && anim && hasSkin && parsed.joints && parsed.weights){
      try{
        anim.update(0);
        const jm=anim.jointMatrices, J=parsed.joints, W=parsed.weights, vc=p.length/3, m=new Float32Array(16);
        let bnX=Infinity,bnY=Infinity,bnZ=Infinity,bxX=-Infinity,bxY=-Infinity,bxZ=-Infinity,any=false;
        for(let v=0; v<vc; v++){
          const px=p[v*3],py=p[v*3+1],pz=p[v*3+2]; m.fill(0); let wsum=0;
          for(let k=0;k<4;k++){ const w=W[v*4+k]; if(!(w>0))continue; const ji=J[v*4+k]*16; if(ji<0||ji+16>jm.length)continue; for(let e=0;e<16;e++) m[e]+=w*jm[ji+e]; wsum+=w; }
          if(wsum<=0) continue;
          const x=m[0]*px+m[4]*py+m[8]*pz+m[12], y=m[1]*px+m[5]*py+m[9]*pz+m[13], z=m[2]*px+m[6]*py+m[10]*pz+m[14];
          if(!isFinite(x)||!isFinite(y)||!isFinite(z)) continue;
          if(x<bnX)bnX=x;if(x>bxX)bxX=x;if(y<bnY)bnY=y;if(y>bxY)bxY=y;if(z<bnZ)bnZ=z;if(z>bxZ)bxZ=z; any=true;
        }
        if(any && (bxY-bnY)>1e-3){
          console.info(`[avatarStage] hybrid posed bbox H=${(bxY-bnY).toFixed(2)} (raw H was ${(mxY-mnY).toFixed(2)}) — using posed for framing`);
          mnX=bnX;mnY=bnY;mnZ=bnZ;mxX=bxX;mxY=bxY;mxZ=bxZ;
        }
      }catch(e){ /* keep the raw bbox */ }
    }
    return { url:srcUrl, mesh:mesh2, animator:anim, rawBBox:{minX:mnX,minY:mnY,minZ:mnZ,maxX:mxX,maxY:mxY,maxZ:mxZ}, idle, walk,
             st:{ x:0, z:0, yaw:0, clip:idle } };
  }
  function emoteClip(av, act){
    if(!av||!av.animator) return 0;
    const pats={ dance:/dance/i, spar:/punch|kick|attack|spar|fight|hit/i, hug:/hug|embrace|love/i, highfive:/wave|thumb|high|jump|yes/i };
    const re=pats[act]; const an=av.animator.animations||[];
    let i = re ? an.findIndex(a=>re.test(a.name||"")) : -1;
    return i>=0 ? i : (av.idle>=0?av.idle:0);
  }
  function setClipSafe(av, idx){ try{ if(av&&av.animator&&idx!==av.st.clip){ av.animator.setClip(idx,0.25); av.st.clip=idx; } }catch{} }
  function avatarModelFor(av){
    const b=av.rawBBox; if(!b) return mIdent();
    let rot; try{ rot=avatarOrientation.buildMatrix(avatarOrientation.get(av.url)); }catch{ rot=mIdent(); }
    const cs=[[b.minX,b.minY,b.minZ],[b.maxX,b.minY,b.minZ],[b.minX,b.maxY,b.minZ],[b.maxX,b.maxY,b.minZ],[b.minX,b.minY,b.maxZ],[b.maxX,b.minY,b.maxZ],[b.minX,b.maxY,b.maxZ],[b.maxX,b.maxY,b.maxZ]];
    let mnY=Infinity,mxY=-Infinity,mnX=Infinity,mxX=-Infinity,mnZ=Infinity,mxZ=-Infinity;
    for(const[x,y,z]of cs){ const ry=rot[1]*x+rot[5]*y+rot[9]*z; if(ry<mnY)mnY=ry; if(ry>mxY)mxY=ry; const rx=rot[0]*x+rot[4]*y+rot[8]*z, rz=rot[2]*x+rot[6]*y+rot[10]*z; if(rx<mnX)mnX=rx;if(rx>mxX)mxX=rx;if(rz<mnZ)mnZ=rz;if(rz>mxZ)mxZ=rz; }
    const h=(mxY-mnY)||1, s=1.6/h, cx=(mnX+mxX)/2, cz=(mnZ+mxZ)/2;
    const centerMat=mTRS(-s*cx, -s*mnY, -s*cz, s);
    let gy=0, gx=0;   // v1615 — frantic hop + jitter for the alarmed visitor ONLY
    if(_visitAlarm && av===_visitorAv){ const tN=performance.now()/1000; gy=Math.abs(Math.sin(tN*11))*0.07; gx=Math.sin(tN*19)*0.014; }
    return mMul(mMul(mTranslate(av.st.x+gx, gy, av.st.z), mRotY(av.st.yaw)), mMul(centerMat, rot));
  }
  function drawDuoAvatar(vp, dt, av){
    if(!av||!av.mesh) return;
    gl.useProgram(aProg);
    gl.uniformMatrix4fv(aU.vp,false,vp); gl.uniformMatrix4fv(aU.model,false,avatarModelFor(av));
    if(av.animator&&av.mesh.hasSkin){ av.animator.update(dt); gl.uniformMatrix4fv(aU.joints,false,av.animator.jointMatrices); gl.uniform1i(aU.hasSkin,1); } else gl.uniform1i(aU.hasSkin,0);
    let t=[1,1,1]; try{ const c=costumes.get(av.url); if(c&&c.tint) t=c.tint; }catch{}
    gl.uniform3f(aU.tint,t[0],t[1],t[2]);
    try{ const eff=avatarColor.getEffective(av.url); gl.uniform3f(aU.ovr,eff.rgb[0],eff.rgb[1],eff.rgb[2]); gl.uniform1f(aU.ovrAmt,eff.amt||0); }catch{ gl.uniform1f(aU.ovrAmt,0); }
    if(_visitAlarm && av===_visitorAv){ const p=0.55+0.45*Math.sin(performance.now()*0.012); gl.uniform3f(aU.ovr,1.0,0.12,0.12); gl.uniform1f(aU.ovrAmt,0.78*p); }   // v1615 — per-VISITOR alarm red (resident stays calm)
    gl.uniform3f(aU.base,0.80,0.82,0.88);
    gl.uniform1i(aU.hasVC,av.mesh.hasVColor?1:0);
    if(av.mesh.texture){ gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,av.mesh.texture); gl.uniform1i(aU.tex,0); gl.uniform1i(aU.hasTex,1); } else gl.uniform1i(aU.hasTex,0);
    gl.bindVertexArray(av.mesh.vao); gl.drawElements(gl.TRIANGLES,av.mesh.indexCount,gl.UNSIGNED_INT,0); gl.bindVertexArray(null);
  }
  // choreography: approach → face → emote (cycle acts) → occasional offscreen wander → repeat
  function approach(av, tx, dt, faceYaw){
    const dx=tx-av.st.x, dist=Math.abs(dx); const moving=dist>0.04;
    if(moving){ av.st.x += Math.sign(dx)*Math.min(dist, 0.85*dt); av.st.yaw = dx>0 ? Math.PI/2 : -Math.PI/2; setClipSafe(av, av.walk>=0?av.walk:av.idle); }
    else { av.st.yaw += (faceYaw-av.st.yaw)*Math.min(1,dt*6); }
    return !moving;
  }
  // v1039 — "guest visit" choreography: resident A stays home; visitor B
  // enters from off-stage, greets (cycles an act or two), then leaves; after a
  // cooldown with only A on screen, B returns. Reuses the same avatars/draw as
  // the duo scene; A is never dragged off — it's left alone between visits.
  function updateGuest(dt, FACE_A, FACE_B, greetPair){
    const HOME=-0.20, ENTER_X=0.50, OFF_X=2.80, GREET_FACE=Math.PI/2;
    duoA.st.x += (HOME - duoA.st.x)*Math.min(1,dt*3);          // resident eases home
    if(duo.phase==="away"){
      duoA.st.yaw += (0 - duoA.st.yaw)*Math.min(1,dt*4);       // face forward, idle
      setClipSafe(duoA, duoA.idle);
      if(duo.t>5.5){ duo.phase="enter"; duo.t=0; }
    } else if(duo.phase==="enter"){
      const arrived = approach(duoB, ENTER_X, dt, FACE_B);
      duoA.st.yaw += (GREET_FACE - duoA.st.yaw)*Math.min(1,dt*5);   // A turns to greet
      if(arrived){ duo.phase="greet"; duo.t=0; greetPair(ACTS[duo.actI%ACTS.length]); }
    } else if(duo.phase==="greet"){
      duoA.st.yaw += (GREET_FACE-duoA.st.yaw)*Math.min(1,dt*6); duoB.st.yaw += (FACE_B-duoB.st.yaw)*Math.min(1,dt*6);
      if(duo.t>5.0){
        duo.actI++;
        if(duo.actI%2===0){ duo.phase="leave"; duo.t=0; duo._bAct=null; setClipSafe(duoB, duoB.walk>=0?duoB.walk:duoB.idle); }
        else { duo.t=0; greetPair(ACTS[duo.actI%ACTS.length]); }
      }
    } else if(duo.phase==="leave"){
      duoB.st.x += 0.95*dt; duoB.st.yaw=Math.PI/2; setClipSafe(duoB, duoB.walk>=0?duoB.walk:duoB.idle);
      if(duoB.st.x>=OFF_X){ duo.phase="away"; duo.t=0; setClipSafe(duoA, duoA.idle); }
    } else { duo.phase="away"; duo.t=0; }
  }
  function updateDuo(dt, tSec){
    if(!duoReady || !duoA || !duoB) return;
    duo.t += dt;
    // v1509 — B's greet starts a beat AFTER A's, so a meeting reads as call-and-response
    // instead of a frame-perfect mirror. greetPair(act) sets A's clip now + schedules B's.
    if(duo._bAct && duo.t>=duo._bAt){ try{ setClipSafe(duoB, emoteClip(duoB, duo._bAct)); }catch{} duo._bAct=null; }
    const FACE_A=Math.PI/2, FACE_B=-Math.PI/2;   // A faces +X (right→B), B faces −X (left→A)
    const greetPair=(act)=>{ setClipSafe(duoA, emoteClip(duoA,act)); setClipSafe(duoB, duoB.idle); duo._bAct=act; duo._bAt=duo.t+0.34; };
    if(scene==="guest"){ updateGuest(dt, FACE_A, FACE_B, greetPair); return; }
    if(_juggle || _rally){ duoA.st.x=-1.0; duoA.st.yaw=FACE_A; duoB.st.x=1.0; duoB.st.yaw=FACE_B; setClipSafe(duoA, duoA.idle); setClipSafe(duoB, duoB.idle); return; }   // v1227/1229 — stand facing, play between them
    // v1509 — HANDOFF: A (your current avatar) resident → B (the other avatar) walks in → A
    // turns to see it → they meet + greet (desynced) → A, the original, walks off → B alone a
    // beat → B exits → A walks back in → repeat.
    const HOME=-0.30, MEET_B=0.55, OFF_L=-2.7, OFF_R=2.7, GREET_FACE=Math.PI/2;
    if(duo.phase==="enterA"){
      const arrived=approach(duoA, HOME, dt, 0);   // A strolls back in from the left, then faces forward
      if(arrived){ duo.phase="enterB"; duo.t=0; }
    } else if(duo.phase==="enterB"){
      const arrived=approach(duoB, MEET_B, dt, FACE_B);   // the different avatar walks toward A
      duoA.st.yaw += (GREET_FACE - duoA.st.yaw)*Math.min(1,dt*5);   // A turns to see B
      setClipSafe(duoA, duoA.idle);
      if(arrived){ duo.phase="meet"; duo.t=0; duo._mAct=0; greetPair(ACTS[duo.actI%ACTS.length]); }
    } else if(duo.phase==="meet"){
      duoA.st.yaw += (GREET_FACE-duoA.st.yaw)*Math.min(1,dt*6); duoB.st.yaw += (FACE_B-duoB.st.yaw)*Math.min(1,dt*6);
      if(duo.t>5.0){
        duo.actI++; duo._mAct=(duo._mAct||0)+1;
        if(duo._mAct>=2){ duo.phase="leaveA"; duo.t=0; duo._bAct=null; }   // greeted a couple times → the original heads out
        else { duo.t=0; greetPair(ACTS[duo.actI%ACTS.length]); }
      }
    } else if(duo.phase==="leaveA"){
      // the original avatar walks off to the left; B turns to watch it go
      const dxA=OFF_L-duoA.st.x; duoA.st.x += Math.sign(dxA)*Math.min(Math.abs(dxA),0.9*dt); duoA.st.yaw=-Math.PI/2; setClipSafe(duoA, duoA.walk>=0?duoA.walk:duoA.idle);
      duoB.st.yaw += (-Math.PI/2 - duoB.st.yaw)*Math.min(1,dt*4); setClipSafe(duoB, duoB.idle);
      if(duoA.st.x<=OFF_L+0.05){ duo.phase="soloB"; duo.t=0; }
    } else if(duo.phase==="soloB"){
      duoB.st.yaw += (0 - duoB.st.yaw)*Math.min(1,dt*4); setClipSafe(duoB, duoB.idle);   // B alone, faces forward
      if(duo.t>2.6){ duo.phase="exitB"; duo.t=0; }
    } else if(duo.phase==="exitB"){
      const dxB=OFF_R-duoB.st.x; duoB.st.x += Math.sign(dxB)*Math.min(Math.abs(dxB),0.9*dt); duoB.st.yaw=Math.PI/2; setClipSafe(duoB, duoB.walk>=0?duoB.walk:duoB.idle);
      if(duoB.st.x>=OFF_R-0.05){ duoA.st.x=OFF_L; duoA.st.yaw=Math.PI/2; duoB.st.x=OFF_R; duoB.st.yaw=FACE_B; duo.phase="enterA"; duo.t=0; }
    } else { duo.phase="enterA"; duo.t=0; }
  }
  function drawDuo(vp, dt, tSec){
    // faint ground disc
    gl.useProgram(gProg); gl.uniformMatrix4fv(gU.vp,false,vp); gl.uniform1i(gU.discard,0); gl.uniform1f(gU.fill,2.0); gl.uniform3f(gU.trackC,TRACK[0],TRACK[1],TRACK[2]);
    gl.uniform3f(gU.fillC,0.07,0.09,0.13); gl.bindVertexArray(GEO.disc.vao);
    gl.uniformMatrix4fv(gU.model,false,mMul(mTranslate(0,-0.02,0),mScale(3.4,0.4,3.0))); gl.drawElements(gl.TRIANGLES,GEO.disc.count,gl.UNSIGNED_SHORT,0); gl.bindVertexArray(null);
    updateDuo(dt, tSec);
    drawDuoAvatar(vp, dt, duoA);
    drawDuoAvatar(vp, dt, duoB);
    if(_juggle) drawJuggle(vp, dt, "duo");   // v1227 — two avatars pass the poms
    if(_rally) drawRally(vp, dt);   // v1229 — tennis/pickleball rally
  }

  // kick the ring rendering even before the avatar finishes loading
  if(!raf){ lastT=performance.now(); raf=requestAnimationFrame(frame); }

  // v978 — swap the avatar in-place (same diorama, same gauges, no page reload).
  // Lets the avatar-switcher render a DIFFERENT glb into the SAME stage instead
  // of navigating the iframe to an old renderer. Returns a promise<bool>.
  async function setAvatar(newUrl){
    if(scene!=="diorama" && scene!=="screen" && scene!=="surf" && scene!=="focus") return false;
    _curAvatarKey = String(newUrl||"").split(/[\\/]/).pop().replace(/\.(glb|gltf|vrm|fbx)$/i,"");   // v1386 — per-model jaw key
    const built = await buildAvatarFrom(newUrl);
    if(!built || destroyed) return false;
    mesh = built.mesh; animator = built.animator; rawBBox = built.rawBBox;
    try{ _wireJaw(); }catch(e){}   // v1366 — re-detect jaw on swap
    idleIdx = built.idle; walkIdx = built.walk;
    _normExtents = null;   // v981 — re-fit the camera to the new asset
    if(animator){ try{ animator.setClip(idleIdx>=0?idleIdx:0, 0); }catch{} }
    A.clip = idleIdx>=0?idleIdx:0;
    if(!raf){ lastT=performance.now(); raf=requestAnimationFrame(frame); }
    if(typeof opts.onAvatarLoaded==="function"){ try{ opts.onAvatarLoaded(newUrl, newUrl, false); }catch{} }   // v1009 — name overlay on live swaps too
    return true;
  }

  // v990 — talking-head zoom controls (focus scene). talkFor(ms): zoom to the
  // head for ms then ease back; setTalking(true/false): hold open / release.
  function talkFor(ms){ _talkUntil = performance.now() + Math.max(200, ms||2200); }
  function setTalking(on){ _talkUntil = on ? (performance.now() + 6e5) : 0; }
  // v991 — selfie: a white flash over the canvas at the peak of the move. Uses a
  // short-lived sibling DOM overlay (no extra shader); best-effort frame capture
  // is handed to opts.onSelfie if provided (may be blank without preserveDrawingBuffer).
  function doFlash(){
    try{
      const host=canvas.parentNode; if(!host) return;
      if(getComputedStyle(host).position==="static") host.style.position="relative";
      const f=document.createElement("div");
      f.style.cssText="position:absolute;inset:0;background:#fff;opacity:0.95;pointer-events:none;z-index:50;transition:opacity 0.45s ease;border-radius:inherit;";
      host.appendChild(f);
      requestAnimationFrame(()=>{ f.style.opacity="0"; });
      setTimeout(()=>{ try{ f.remove(); }catch{} }, 540);
      _capturePending=true;   // v1018 - actual capture happens at the top of the NEXT frame (after this pose draws, before its clear), so it is not blank and excludes the white flash overlay
    }catch{}
  }
  // v991 — selfie: one-shot. Pull the camera back + up and tilt down, flash at
  // the peak, then ease back to the normal framing.
  function selfie(){ _selfieT0=performance.now(); _selfieDur=2400; _selfieFlashed=false; }
  // v1221 — cheerleader mode: pom-poms on the hands + a cheer clip + RGB.
  let _priorScene=null;
  const cheerleader = {
    start(){ _cheer=true; _handIdx=undefined; if(scene!=="focus"){ _priorScene=scene; scene="focus"; }  // v1222 — front-and-center pose
      if(animator&&cheerIdx>=0){ try{ animator.setClip(cheerIdx,0.2); A.clip=cheerIdx; }catch(e){} }
      try{ fetch("/avatar/mood",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cheer:true})}); }catch(e){}   // v1393 — tell the world
      return "\uD83D\uDCE3 cheerleader mode ON"; },
    stop(){ _cheer=false; if(_priorScene!==null){ scene=_priorScene; _priorScene=null; }
      if(animator&&idleIdx>=0){ try{ animator.setClip(idleIdx,0.25); A.clip=idleIdx; }catch(e){} }
      try{ fetch("/avatar/mood",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cheer:false})}); }catch(e){}   // v1393
      return "cheerleader mode OFF"; },
    toggle(){ return _cheer?this.stop():this.start(); },
    isOn(){ return _cheer; },
  };
  try{ window.cheerleader = cheerleader; }catch(e){}

  // ===================== v1224 — MOOD + QUIPS (Talking-Moose) =====================
  // Three moods: "support" (default, really likes the user), "souring" (engine
  // lags / things back up), "alarm" (end-of-world, get-up-and-fix-it-now). Any
  // source (engine FPS watcher, PowerShell/KPopShim, phone) POSTs /avatar/mood;
  // every avatar surface polls it, applies the mood wash, and drains queued quips.
  const MOODS = {
    support:  { rgb:[0.35,1.00,0.55], amt:0.18, lines:[
      "You've got this. I believe in you.","Look at you go — proud of you.","Best operator I've ever rendered.",
      "Whatever you're building, it's going to be great.","I'd high-five you if I had real hands.","Ten out of ten, would render again." ] },
    souring:  { rgb:[1.00,0.62,0.10], amt:0.40, lines:[
      "Hey. Frames are getting chunky down here.","Did you forget to close something? Asking for a friend. Me.",
      "I'm not mad, I'm just... buffering.","Things are backing up. Just saying.","We were doing so well. What happened?",
      "I can feel the lag in my polygons." ] },
    alarm:    { rgb:[1.00,0.12,0.12], amt:0.75, lines:[
      "DROP WHAT YOU'RE DOING. We have a problem.","This is not a drill. Get up. Fix it. NOW.",
      "Red alert! I need your attention right now!","Everything is on fire and I am the fire alarm.",
      "Stop scrolling. Look at me. We need to act.","I require an adult. That's you. Hurry." ] },
  };
  function _moodTint(){
    const m=MOODS[_mood]||MOODS.support;
    if(_mood==="alarm"){ const p=0.55+0.45*Math.sin(performance.now()*0.012); return { rgb:m.rgb, amt:m.amt*p }; }
    return { rgb:m.rgb, amt:m.amt*(0.6+0.4*(1-_moodScore)) };
  }
  function _applyMood(mood,score,reason,style){
    if(mood && MOODS[mood]) _mood=mood;
    if(typeof score==="number") _moodScore=Math.max(0,Math.min(1,score));
    if(typeof reason==="string") _moodReason=reason;
    if(style && POM_STYLES[style] && style!==_pomStyle) setPomStyle(style);
    // v1225 — mood drives movement: frantic when alarmed, sluggish when souring.
    try{ if(animator) animator.timeScale = _mood==="alarm" ? 1.45 : _mood==="souring" ? 0.72 : 1.0; }catch(e){}
  }
  function setPomStyle(name){ if(!POM_STYLES[name]) return false; _pomStyle=name; try{ pomVAO=makeVAO(buildPomPom(POM_STYLES[name])); }catch(e){} return true; }
  function _quipLine(){ const m=MOODS[_mood]||MOODS.support; const a=m.lines; return a[(Math.random()*a.length)|0]; }
  // v1225 — try the local LLM for a fresh mood-flavored line; null on any failure.
  async function _genQuip(mood){
    try{ const r=await fetch("/avatar/quip",{ method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ mood:mood||_mood }) });
      if(r.ok){ const j=await r.json(); if(j&&j.ok&&j.line) return j.line; } }catch(e){}
    return null;
  }
  // "__gen__" -> Ollama (fallback to a built-in line); "__pick__" -> built-in line; else verbatim.
  async function resolveQuip(text){
    if(text==="__gen__"){ const g=await _genQuip(_mood); return g || _quipLine(); }
    if(text==="__pick__") return _quipLine();
    return text;
  }
  // Speak a quip through the shared pipeline so EVERY surface captions + zooms
  // (and the PC voices it). Also zoom locally for snappiness.
  function _speakQuip(text){ if(!text) return; try{ talkFor(Math.max(1200, Math.min(6000, text.length*60))); }catch(e){}
    // v3955 -- *** Voice WAS MISSING AND THE ROUTE REQUIRES BOTH FIELDS, SO EVERY QUIP WAS A 400. ***
    // /kpop/speak's own comment says "Both fields required -- different from /kpop/toast", and it 400s on a
    // missing Voice before it reaches the pipe. This was the ONLY caller in the tree sending Text alone; the
    // other three all send {Voice, Text}. Keith's render-qa caught it on asteroids.html, which reaches here
    // through demoChrome.js's DYNAMIC import of this file -- a chain no static scan of the page would show.
    // "M1" is the tree's established default (23 call sites against 2 for M2).
    try{ fetch("/kpop/speak",{ method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ Voice:"M1", Text:text }) }); }catch(e){} }
  function _enqueueQuip(text){ try{ fetch("/avatar/mood",{ method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ quip:text }) }); }catch(e){} }
  function _applyTamaNudge(t){ try{ const v=window._tamaVals||(window._tamaVals={hunger:50,happiness:50,energy:50});
    ["hunger","happiness","energy"].forEach(k=>{ if(typeof t[k]==="number") v[k]=Math.max(0,Math.min(100,(v[k]||0)+t[k])); }); }catch(e){} }
  // Poll the mood bus: apply mood, drain quips (speak them once), apply tama nudge.
  let _selfQuip = !!opts.selfQuip;   // only the primary stage self-initiates idle quips
  let _moodInFlight=false;   // v1605 — never let /avatar/mood requests pile up (was exhausting the browser connection pool: ERR_INSUFFICIENT_RESOURCES)
  async function _pollMood(){
    if(destroyed) return;
    if(_moodInFlight) return;                       // a poll is still outstanding — skip this tick
    if(document.hidden) return;                     // tab not visible — don't bother the network
    _moodInFlight=true;
    let _sig; try{ _sig=AbortSignal.timeout(2500); }catch{}
    try{ const r=await fetch("/avatar/mood",{ cache:"no-store", signal:_sig }); if(r.ok){ const j=await r.json();
      if(j){ _applyMood(j.mood,j.score,j.reason,j.style);
        if(Array.isArray(j.quips)) j.quips.forEach(q=> q&&q.text && resolveQuip(q.text).then(line=> line && _speakQuip(line)));
        if(j.tama) _applyTamaNudge(j.tama); } } }catch(e){}
    finally{ _moodInFlight=false; }
    // idle self-quip: occasionally toss a mood-flavored line (enqueued so exactly
    // one surface speaks it). Faster cadence when things are going wrong.
    if(_selfQuip){ const now=performance.now(); const gap=(_mood==="alarm"?9000:_mood==="souring"?22000:55000)*(0.7+Math.random()*0.6);
      if(now-_lastQuipAt>gap){ _lastQuipAt=now; _enqueueQuip("__gen__"); } }
  }
  // v1614/v1615 — peer-announcement cameo on the REAL 3D stage. When the stage is showing a second avatar
  // (guest/duo: the visitor walks in; studio: the 2nd avatar walks in from off-stage, past the gauges + llama),
  // mark ONLY that visitor as the alarmed one so it flashes red + frantic (the resident stays calm), with
  // lip-sync. Returns false when the stage isn't in a 2-avatar scene, so the caller falls back to the 2D overlay.
  // v1639 — prefer the locally-cached peer avatar (/peer-avatar/<peer>/<file>) over the remote url; build it once
  // with the same loader as duoB/studioB and reuse. Returns a slot-compatible avatar or null.
  async function _ensurePeerAvatar(peer, remoteUrl){
    let url = remoteUrl || "";
    try{
      if(peer){ const safe=String(peer).replace(/[^a-z0-9_.-]/gi,"_").slice(0,64);
        const j=await fetch("/peer-avatar/list").then(r=>r.json());
        if(j&&j.ok){ const e=(j.avatars||[]).find(a=>a.peer===safe); if(e) url="/peer-avatar/"+encodeURIComponent(e.peer)+"/"+encodeURIComponent(e.file); } }
    }catch{}
    if(!url) return null;
    if(_peerAvCache[url]) return _peerAvCache[url];
    let av=null; try{ av=await buildAvatarFrom(url); }catch{}
    if(av) _peerAvCache[url]=av; return av;
  }
  function _copyVisitorSt(dst, src){ try{ if(dst&&dst.st&&src&&src.st){ dst.st.x=src.st.x; dst.st.z=src.st.z; dst.st.yaw=src.st.yaw; if(src.st.y!=null)dst.st.y=src.st.y; } }catch{} }
  function peerVisit(opts){
    opts = opts || {};
    const hasGuest  = (scene==="guest" || scene==="duo") && duoReady && duoB;
    const hasStudio =  scene==="studio" && studioB;
    if(!hasGuest && !hasStudio) return false;
    _peerVisitUntil = performance.now() + (opts.durationMs || 9000);
    _visitAlarm = (opts.alarm !== false);
    if(hasGuest){ _visitorAv = duoB; duo.phase="enter"; duo.t=0; }                 // visitor walks in immediately
    if(hasStudio){ _visitorAv = studioB; try{ studioB.st.x = 2.9; }catch{} _studioWalkIn = true; }   // park off-stage right, then walk in (caveat 2)
    // v1639 — when we know the visitor's real avatar, load it (cached) and swap it into the visitor slot for this
    // visit; the resident 2nd avatar is restored when the visit ends. Fully guarded: any failure leaves the
    // generic stand-in walking in, so the cameo never breaks.
    if(opts.avatarUrl || opts.peer){
      _ensurePeerAvatar(opts.peer, opts.avatarUrl).then(av=>{
        if(!av) return;
        if(!_peerVisitUntil || performance.now()>_peerVisitUntil) return;   // visit already ended
        try{
          if(hasGuest && _visitorAv===duoB){ _origVisitor={slot:"duo",av:duoB}; _copyVisitorSt(av,duoB); duoB=av; _visitorAv=duoB; }
          else if(hasStudio && _visitorAv===studioB){ _origVisitor={slot:"studio",av:studioB}; _copyVisitorSt(av,studioB); studioB=av; _visitorAv=studioB; }
        }catch{}
      }).catch(()=>{});
    }
    try{ talkFor(opts.talkMs || 4500); }catch{}
    return true;
  }
  const _moodPoll = setInterval(_pollMood, 3000); _pollMood();
  const avatarMood = {
    set(o){ o=o||{}; _applyMood(o.mood,o.score,o.reason,o.style);
      try{ fetch("/avatar/mood",{ method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(o) }); }catch(e){} return _mood; },
    get(){ return { mood:_mood, score:_moodScore, reason:_moodReason, style:_pomStyle }; },
    quip(text){ _enqueueQuip(text || _quipLine()); },
    MOODS: Object.keys(MOODS),
  };
  try{ window.avatarMood = avatarMood; }catch(e){}
  // extend cheerleader with style control + a quip helper
  cheerleader.style = (name)=> setPomStyle(name);
  cheerleader.styles = ()=> Object.keys(POM_STYLES);
  cheerleader.quip = (t)=> avatarMood.quip(t);
  cheerleader.particles = (on)=> { _partsOn = on!==false; if(!_partsOn) _parts.length=0; return _partsOn; };
  // v1227 — juggle: N poms arc between the hands (1 avatar) or pass between two.
  cheerleader.juggle = (on, n)=>{ _juggle = on!==false; _balls.length=0;
    if(_juggle){ if(n) _juggleN=clamp(n,2,6); if(scene!=="focus"&&scene!=="duo"&&scene!=="guest"){ if(_priorScene===null) _priorScene=scene; scene="focus"; } }
    else if(_priorScene!==null){ scene=_priorScene; _priorScene=null; }
    return _juggle; };
  cheerleader.jugglePoms = (n)=>{ _juggleN=clamp(n||3,2,6); _balls.length=0; return _juggleN; };
  cheerleader.juggleObject = (obj)=>{ if(/^(pom|ball|gauge)$/.test(obj)) _juggleObj=obj; return _juggleObj; };   // v1228
  cheerleader.fetch = ()=> throwForPet();   // v1228 — toss a ball; the llama chases + buries it
  // v1229 — duo tennis/pickleball rally + solo bowling
  cheerleader.tennis = async (on, seconds)=>{ if(on!==false){ await ensureDuo(); if(_priorScene===null && scene!=="duo") _priorScene=scene; scene="duo"; rallyBall.t=0; rallyBall.from=0; rallyBall.to=1; rallyBall.dur=0.85; _rallyStamina=1; _rallyExhausted=false; rallyHits.n=0; if(Number.isFinite(seconds)) _rallyTireSecs=Math.max(8,seconds); _rally=true; }
    else { stopRally(); } return _rally; };
  cheerleader.bowl = (roll)=>{ if(roll===false){ _bowl=false; if(_priorScene!==null){ scene=_priorScene; _priorScene=null; } return false; }
    if(scene!=="focus"){ if(_priorScene===null) _priorScene=scene; scene="focus"; } _bowl=true; return bowl(); };
  // v1291 — soccer fidget: a tiny match centred on the ball, stops after a goal. soccer(false) to exit.
  cheerleader.soccer = (on)=>{ if(on===false){ endSoccer(); return false; }
    if(scene!=="focus"){ if(_priorScene===null) _priorScene=scene; scene="focus"; } setupSoccer(); _soccer=true; return true; };
  // v1242 — cinematic camera
  cheerleader.drone    = (on)=>{ _droneCam = (on!==false); if(!_droneCam) _droneCx=null; return _droneCam; };  // smooth orbit
  cheerleader.droneSpeed = (s)=>{ _droneSpeed = clamp(+s||0.32, 0.05, 1.5); return _droneSpeed; };
  cheerleader.droneTrack = (on)=>{ _droneTrack = (on!==false); return _droneTrack; };   // orbit follows the wandering host
  cheerleader.llamaCam = (on)=>{ const want=(on!==false);
    if(want && _llamaCamFocus && scene!=="focus"){ if(_priorScene===null) _priorScene=scene; scene="focus"; _llamaOwnsScene=true; }
    else if(!want && _llamaOwnsScene){ if(_priorScene!==null && !_juggle && !_rally && !_bowl){ scene=_priorScene; _priorScene=null; } _llamaOwnsScene=false; }
    _llamaCam = want; return _llamaCam; };                                              // first-person ride on the flying llama
  cheerleader.llamaCamFocus = (on)=>{ _llamaCamFocus = (on!==false); return _llamaCamFocus; };  // auto-switch to focus scene
  cheerleader.hoop     = (on)=>{ _hoop = (on!==false); if(_hoop) _hoopIdx=0; return _hoop; };    // ring course on/off
  cheerleader.hoops    = (n)=>{ n=Math.max(1,Math.min(6, (n|0)||3)); _hoopList=[];                // build an n-ring slalom
    for(let i=0;i<n;i++){ const t=n>1?i/(n-1):0.5; _hoopList.push({ x:-0.7+t*1.4, y:0.62+0.20*Math.sin(t*Math.PI), z:0.30+((i%2)?0.22:-0.10), r:1.3 }); }
    _hoopIdx=0; _hoop=true; return _hoopList.length; };
  cheerleader.hoopAt   = (x,y,z,r)=>{ _hoopList=[{ x:+x||0, y:(y==null?0.72:+y), z:(z==null?0.30:+z), r:+r||1.5 }]; _hoopIdx=0; _hoop=true; return _hoopList[0]; };
  cheerleader.hoopConfig = (arr)=>{ if(Array.isArray(arr)&&arr.length){ _hoopList=arr.map(h=>({ x:+h.x||0, y:(h.y==null?0.72:+h.y), z:(h.z==null?0.30:+h.z), r:+h.r||1.5 })); _hoopIdx=0; _hoop=true; } return _hoopList.length; };
  cheerleader.cinematicOff = ()=>{ _droneCam=false; _droneCx=null; _hoop=false;
    if(_llamaCam && _llamaOwnsScene && _priorScene!==null && !_juggle && !_rally && !_bowl){ scene=_priorScene; _priorScene=null; } _llamaOwnsScene=false; _llamaCam=false; return true; };
  cheerleader.juggleDuo = async (n)=>{ await ensureDuo(); if(n) _juggleN=clamp(n,2,6); _balls.length=0;
    if(_priorScene===null && scene!=="duo") _priorScene=scene; scene="duo"; _juggle=true; return duoReady; };
  // ================================================================================

  // v1364 — VISOR HUD: an SVG overlay (targeting reticle + glowing eyes + a scan
  // sweep) over the avatar's head. When on, the avatar is pinned front-and-centre
  // and faces forward so the head sits under the reticle. Works on any avatar/helmet.
  function _visorSvg(){
    var c=_visorCfg, col=c.color||"#7fe9ff", ec=c.eyeColor||col, cy=(typeof c.cy==="number"?c.cy:38);
    var ring = c.reticle===false ? "" :
      '<g fill="none" stroke="'+col+'" stroke-width="0.5" opacity="0.92" stroke-linecap="round">'+
      '<circle cx="50" cy="'+cy+'" r="15" stroke-dasharray="4 3"><animateTransform attributeName="transform" type="rotate" from="0 50 '+cy+'" to="360 50 '+cy+'" dur="16s" repeatCount="indefinite"/></circle>'+
      '<circle cx="50" cy="'+cy+'" r="11" stroke-width="0.3" opacity="0.5"/>'+
      '<line x1="50" y1="'+(cy-8)+'" x2="50" y2="'+(cy-4)+'"/><line x1="50" y1="'+(cy+4)+'" x2="50" y2="'+(cy+8)+'"/>'+
      '<line x1="42" y1="'+cy+'" x2="46" y2="'+cy+'"/><line x1="54" y1="'+cy+'" x2="58" y2="'+cy+'"/>'+
      '<path d="M34 '+(cy-13)+' h-3 v3"/><path d="M66 '+(cy-13)+' h3 v3"/><path d="M34 '+(cy+13)+' h-3 v-3"/><path d="M66 '+(cy+13)+' h3 v-3"/></g>';
    var blink = (_fx && _fx.blink && _fx.blink.on) ? '<animate attributeName="ry" values="1.1;1.1;0.07;1.1" keyTimes="0;0.92;0.96;1" dur="4.2s" repeatCount="indefinite"/>' : '';
    var eyes = c.eyes===false ? "" :
      '<g fill="'+ec+'" filter="url(#vhGlow)">'+
      '<ellipse cx="45" cy="'+(cy-1)+'" rx="1.7" ry="1.1"><animate attributeName="opacity" values="1;0.35;1" dur="2.2s" repeatCount="indefinite"/>'+blink+'</ellipse>'+
      '<ellipse cx="55" cy="'+(cy-1)+'" rx="1.7" ry="1.1"><animate attributeName="opacity" values="1;0.35;1" dur="2.2s" begin="0.3s" repeatCount="indefinite"/>'+blink+'</ellipse></g>';
    var scan = c.scan===false ? "" :
      '<line x1="35" x2="65" y1="'+(cy-12)+'" y2="'+(cy-12)+'" stroke="'+col+'" stroke-width="0.4" opacity="0.5">'+
      '<animate attributeName="y1" values="'+(cy-12)+';'+(cy+12)+';'+(cy-12)+'" dur="3s" repeatCount="indefinite"/>'+
      '<animate attributeName="y2" values="'+(cy-12)+';'+(cy+12)+';'+(cy-12)+'" dur="3s" repeatCount="indefinite"/></line>';
    var voc = "";
    if(c.vocoder!==false){ var n=7, bw=1.7, gap=0.7, x0=50-(n*bw+(n-1)*gap)/2, yb=cy+12, bars="";
      for(var i=0;i<n;i++){ var bx=(x0+i*(bw+gap)).toFixed(2); bars += '<rect x="'+bx+'" y="'+(yb-0.6).toFixed(2)+'" width="'+bw+'" height="0.6" rx="0.5" fill="'+ec+'" opacity="0.92" filter="url(#vhGlow)"/>'; }
      voc = '<g class="vh-voc">'+bars+'</g>'; }
    return '<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;">'+
      '<defs><filter id="vhGlow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="0.7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'+
      ring+eyes+scan+voc+'</svg>';
  }
  function _buildVisorHud(){
    if(_visorEl || typeof document==="undefined") return;
    var par = canvas.parentElement; if(!par) return;
    try { if(getComputedStyle(par).position==="static") par.style.position="relative"; } catch(e){}
    _visorEl=document.createElement("div");
    _visorEl.style.cssText="position:absolute;inset:0;pointer-events:none;z-index:6;";
    _visorEl.innerHTML=_visorSvg();
    par.appendChild(_visorEl);
    _vocBars=_visorEl.querySelectorAll(".vh-voc rect");
  }
  function _renderVisor(){ if(!_visorEl) return; _visorEl.innerHTML=_visorSvg(); _vocBars=_visorEl.querySelectorAll(".vh-voc rect"); }
  function setVisorHud(on, cfg){
    if(cfg && typeof cfg==="object") _visorCfg=Object.assign({}, _visorCfg, cfg);
    _visorMode=!!on;
    if(_visorMode){ _buildVisorHud(); if(_visorEl){ _renderVisor(); _visorEl.style.display=""; } }
    else if(_visorEl){ _visorEl.style.display="none"; }
    return _visorMode;
  }
  // v1365 — HEAD VIEW: tighten the camera onto the head (reuses the focus-scene
  // talking-head frame). Good for helmets/busts and pairs with the visor HUD; we
  // nudge the reticle's vertical centre down to sit on the now-centred head.
  function setHeadView(on){
    _headView=!!on;
    _visorCfg.cy = _headView ? 48 : 38;
    if(_visorMode && _visorEl){ _renderVisor(); }
    return _headView;
  }
  if(opts.headView){ try{ setHeadView(true); }catch(e){} }
  if(opts.visorHud){ try{ setVisorHud(true, (typeof opts.visorHud==="object")?opts.visorHud:null); }catch(e){} }

  // v1366 — TALKING. A mouth envelope (real TTS level via setTalkLevel, else a
  // synthetic speech wiggle) drives (a) the visor vocoder bars each frame and
  // (b) a real jaw bone when the loaded model has one (found by node name).
  function _qmul(a,b,o){ const ax=a[0],ay=a[1],az=a[2],aw=a[3], bx=b[0],by=b[1],bz=b[2],bw=b[3];
    o[0]=aw*bx+ax*bw+ay*bz-az*by; o[1]=aw*by-ax*bz+ay*bw+az*bx; o[2]=aw*bz+ax*by-ay*bx+az*bw; o[3]=aw*bw-ax*bx-ay*by-az*bz; return o; }
  function _applyJaw(an){
    if(_jawIdx<0 || _jawLevel<=0.002) return;
    const lr = an.localR && an.localR[_jawIdx]; if(!lr) return;
    const ang=_jawLevel*_jawAmp*_jawSign, sn=Math.sin(ang/2), cs=Math.cos(ang/2);   // v1386 — overridable open axis
    _qmul(lr, [_jawAxis[0]*sn, _jawAxis[1]*sn, _jawAxis[2]*sn, cs], lr);
  }
  function _wireJaw(){
    try{
      _jawIdx=-1;
      const ov=_jawByModel[_curAvatarKey];   // v1386 — restore this model's saved jaw fix
      _jawAxis = (ov && ov.axis) ? ov.axis.slice() : [1,0,0];
      _jawSign = (ov && typeof ov.sign==="number") ? ov.sign : 1;
      _jawAmp  = (ov && typeof ov.amp==="number")  ? ov.amp  : 0.5;
      if(animator && Array.isArray(animator.nodes)){
        _jawIdx = animator.nodes.findIndex(n => n && /(^|[^a-z])jaw|lowerjaw|chin|mouth/i.test(n.name||""));
        _resolveFx();
        animator.onPose = (an)=>{ try{ _applyJaw(an); _applyFx(an); }catch(e){} };
      }
    }catch(e){ _jawIdx=-1; }
  }
  // v1370 — resolve which skeleton nodes each ambient channel drives (best-effort, by name)
  function _resolveFx(){
    if(!animator || !Array.isArray(animator.nodes)) return;
    for(const k in _fx){ const ch=_fx[k]; if(!ch.match){ ch.idxs=null; continue; }
      const hits=[]; for(let i=0;i<animator.nodes.length && hits.length<4;i++){ const n=animator.nodes[i]; if(n && ch.match.test(n.name||"")) hits.push(i); }
      ch.idxs = hits.length ? hits : []; }
  }
  function _applyFx(an){
    if(!an || !an.localR) return; const t=performance.now()*0.001;
    for(const k in _fx){ const ch=_fx[k]; if(!ch.on || !ch.idxs || !ch.idxs.length || k==="blink") continue;
      for(let j=0;j<ch.idxs.length;j++){ const idx=ch.idxs[j], lr=an.localR[idx]; if(!lr) continue;
        const ang=ch.amp*Math.sin(t*ch.freq*_TWO_PI + j*0.9), sn=Math.sin(ang/2), cs=Math.cos(ang/2);
        _qmul(lr, [ch.axis[0]*sn, ch.axis[1]*sn, ch.axis[2]*sn, cs], lr); } }
  }
  function setEffect(id, on){
    if(id==="life"){ const v=(on===undefined?true:!!on); ["blink","breathe","earwig","tailwag","headbob"].forEach(k=>{ if(_fx[k]) _fx[k].on=v; }); if(_visorMode && _visorEl) _renderVisor(); return v; }
    if(_fx[id]){ _fx[id].on=(on===undefined?!_fx[id].on:!!on); if(id==="blink" && _visorMode && _visorEl) _renderVisor(); return _fx[id].on; }
    return false;
  }
  function setTalkLevel(v){ _extTalkLevel = (typeof v==="number" && v>=0) ? Math.min(1,v) : -1; _extTalkT = performance.now(); }
  // v1386 — correct the jaw on the current model: setJaw({axis:0|1|2 or [x,y,z], sign:+/-1, amp:0..1}).
  // Live + saved for this model so it persists across reloads.
  function setJaw(o={}){
    const ax=_axisVec(o.axis); if(ax) _jawAxis=ax;
    if(typeof o.sign==="number") _jawSign = o.sign<0?-1:1;
    if(typeof o.amp ==="number") _jawAmp  = Math.max(0, Math.min(1.5, o.amp));
    if(_curAvatarKey) _jawByModel[_curAvatarKey] = { axis:_jawAxis.slice(), sign:_jawSign, amp:_jawAmp };
    return { model:_curAvatarKey, axis:_jawAxis, sign:_jawSign, amp:_jawAmp };
  }
  // v1386 — per-channel axis override for the ambient effect channels (breathe/earwig/tailwag/headbob).
  function setChannelAxis(id, o={}){
    const ch=_fx[id]; if(!ch) return false;
    const ax=_axisVec(o.axis); if(ax) ch.axis=ax;
    if(typeof o.amp ==="number") ch.amp = o.amp;
    if(typeof o.freq==="number") ch.freq= o.freq;
    return { id, axis:ch.axis, amp:ch.amp, freq:ch.freq };
  }

  // v1529 — live accessory tweak from the console: setAccessory("head",{on,url,scale,lift,fwd}) / ("hand",{...,side}) / ("foot",{...,side}). Forces a reload of that slot.
  function setAccessory(slot, cfg){ if(!/^(head|hand|foot)$/.test(slot)) return false; _accCfg[slot]=Object.assign({}, _accCfg[slot], cfg||{}); _accAv[slot]=undefined; return true; }
  return { destroy, setAvatar, talkFor, setTalking, selfie, registerGrabbable, clearGrabbables, cheerleader, avatarMood, setVisorHud, setHeadView, setTalkLevel, setEffect, setJaw, setChannelAxis, setAccessory, peerVisit, setPaused(v){ extPaused=!!v; }, ok:true };
}

export default mountStage;
