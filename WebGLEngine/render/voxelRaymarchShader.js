// render/voxelRaymarchShader.js
//
// GLSL port of the voxel DDA (v2783). The fragment shader below runs the SAME Amanatides-Woo traversal as
// voxel/voxelDDA.js, per pixel, sampling a 3D texture volume. Because a shader can't be unit-tested in the
// sandbox, this file also exports ddaShaderMirror() -- a JS function that mirrors the shader's DDA line-for-line
// (same variable order, same 1e20 "infinity", same tie-breaks). The gate proves the MIRROR produces identical
// hits to the traverseDDA oracle, so the shader (which is the mirror in GLSL) is proven by transitivity.
//
// Any change to the shader's DDA must be mirrored here and vice-versa; the gate's structural check flags drift.
// Browser/worker-safe: no imports, no DOM.

const BIG = 1e20;

// Faithful CPU model of the fragment shader's DDA. ro/rd are 3-arrays; voxelAt(x,y,z) -> material id (0 = air),
// already bounds-aware (returns 0 outside the volume, like the shader's inBounds guard). Returns the same shape
// as traverseDDA: { hit, vx, vy, vz, nx, ny, nz, t, steps }.
export function ddaShaderMirror(ro, rd, voxelAt, maxSteps = 256) {
    // normalize (shader: rd = normalize(...))
    const rl = Math.hypot(rd[0], rd[1], rd[2]) || 1;
    let rx = rd[0] / rl, ry = rd[1] / rl, rz = rd[2] / rl;

    let vx = Math.floor(ro[0]), vy = Math.floor(ro[1]), vz = Math.floor(ro[2]);
    const sx = Math.sign(rx), sy = Math.sign(ry), sz = Math.sign(rz);

    const tdx = rx !== 0 ? Math.abs(1 / rx) : BIG;
    const tdy = ry !== 0 ? Math.abs(1 / ry) : BIG;
    const tdz = rz !== 0 ? Math.abs(1 / rz) : BIG;

    const bx = sx > 0 ? (vx + 1 - ro[0]) : (ro[0] - vx);
    const by = sy > 0 ? (vy + 1 - ro[1]) : (ro[1] - vy);
    const bz = sz > 0 ? (vz + 1 - ro[2]) : (ro[2] - vz);
    let tmx = rx !== 0 ? bx * tdx : BIG;
    let tmy = ry !== 0 ? by * tdy : BIG;
    let tmz = rz !== 0 ? bz * tdz : BIG;

    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < maxSteps; i++) {
        if (voxelAt(vx, vy, vz) !== 0) return { hit: true, vx, vy, vz, nx, ny, nz, t, steps: i };
        if (tmx <= tmy && tmx <= tmz) { vx += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
        else if (tmy <= tmz) { vy += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
        else { vz += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return { hit: false, vx, vy, vz, nx: 0, ny: 0, nz: 0, t, steps: maxSteps };
}

// Fullscreen-triangle vertex shader.
export const VERT_SRC = `#version 300 es
precision highp float;
const vec2 P[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
void main(){ gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }
`;

// Fragment shader: per-pixel voxel DDA against a 3D texture. Mirrors ddaShaderMirror exactly.
export const FRAG_SRC = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;

uniform sampler3D uVolume;
uniform ivec3 uDims;
uniform vec3  uEye, uFwd, uRight, uUp;
uniform float uTanFov, uAspect;
uniform vec2  uRes;
out vec4 fragColor;

const int   MAX_STEPS = 256;
const float BIG = 1e20;

bool inBounds(ivec3 p){ return p.x>=0 && p.y>=0 && p.z>=0 && p.x<uDims.x && p.y<uDims.y && p.z<uDims.z; }
int  voxel(ivec3 p){ if(!inBounds(p)) return 0; return int(texelFetch(uVolume, p, 0).r * 255.0 + 0.5); }

vec3 palette(int id){
    if(id==1) return vec3(0.42,0.72,0.34);   // grass
    if(id==2) return vec3(0.85,0.78,0.52);   // sand
    if(id==3) return vec3(0.82,0.85,0.88);   // snow
    if(id==4) return vec3(0.60,0.50,0.30);   // dirt
    if(id==5) return vec3(0.70,0.45,0.80);   // block
    return vec3(0.55,0.55,0.60);             // stone / default
}

void main(){
    vec2 uv  = gl_FragCoord.xy / uRes;
    vec2 ndc = vec2((uv.x*2.0-1.0)*uTanFov*uAspect, (uv.y*2.0-1.0)*uTanFov);
    vec3 rd  = normalize(uFwd + ndc.x*uRight + ndc.y*uUp);
    vec3 ro  = uEye;

    ivec3 v   = ivec3(floor(ro));
    ivec3 stp = ivec3(sign(rd));
    vec3 tDelta = vec3(
        rd.x!=0.0 ? abs(1.0/rd.x) : BIG,
        rd.y!=0.0 ? abs(1.0/rd.y) : BIG,
        rd.z!=0.0 ? abs(1.0/rd.z) : BIG);
    vec3 b = vec3(
        stp.x>0 ? (float(v.x)+1.0-ro.x) : (ro.x-float(v.x)),
        stp.y>0 ? (float(v.y)+1.0-ro.y) : (ro.y-float(v.y)),
        stp.z>0 ? (float(v.z)+1.0-ro.z) : (ro.z-float(v.z)));
    vec3 tMax = vec3(
        rd.x!=0.0 ? b.x*tDelta.x : BIG,
        rd.y!=0.0 ? b.y*tDelta.y : BIG,
        rd.z!=0.0 ? b.z*tDelta.z : BIG);

    vec3 normal = vec3(0.0);
    float t = 0.0;
    int hitId = 0;
    for(int i=0;i<MAX_STEPS;i++){
        int id = voxel(v);
        if(id!=0){ hitId=id; break; }
        if(tMax.x<=tMax.y && tMax.x<=tMax.z){ v.x+=stp.x; t=tMax.x; tMax.x+=tDelta.x; normal=vec3(float(-stp.x),0.0,0.0); }
        else if(tMax.y<=tMax.z){ v.y+=stp.y; t=tMax.y; tMax.y+=tDelta.y; normal=vec3(0.0,float(-stp.y),0.0); }
        else { v.z+=stp.z; t=tMax.z; tMax.z+=tDelta.z; normal=vec3(0.0,0.0,float(-stp.z)); }
    }
    if(hitId==0){ fragColor=vec4(0.05,0.07,0.09,1.0); return; }
    vec3 L = normalize(vec3(0.5,0.8,0.35));
    float lam = 0.35 + 0.65*max(0.0, dot(normal, L));
    float fog = clamp(1.0 - t/200.0, 0.0, 1.0);
    fragColor = vec4(mix(vec3(0.05,0.07,0.09), palette(hitId)*lam, fog), 1.0);
}
`;

// --- R8UI variant (v3041) -------------------------------------------------------------------------------
//
// Same DDA, same palette, same shading, ONE line different: the volume is an unsigned-integer 3D texture and
// voxel() reads the byte itself instead of reconstructing it from a normalised float.
//
//     unorm (FRAG_SRC):     int(texelFetch(uVolume, p, 0).r * 255.0 + 0.5)
//     uint  (FRAG_SRC_UI):  int(texelFetch(uVolume, p, 0).r)
//
// Voxels carry a TYPE, not just occupancy -- the palette below colours by id -- so the unorm form is a float
// round-trip in the middle of an integer lookup. It happens to work (the gate audits all 256 byte values through
// float32 and keeps that result rather than dropping it), but the uint form is exact by construction and does
// not depend on the arithmetic landing right.
//
// usampler3D is UNFILTERABLE by rule, which is the correct property for a DDA: a filtered boundary sample would
// return neither solid nor empty and the traversal answer would depend on sampler state instead of the world.
// Both variants access the volume only through texelFetch at integer coordinates. Neither uses a sampler object.
//
// FRAG_SRC above is untouched and remains the default; this is a substitution behind a flag, not a replacement.
// Both are the same DDA, so ddaShaderMirror models BOTH and the gate's equivalence proof covers both.
export const FRAG_SRC_UI = FRAG_SRC
    .replace("precision highp sampler3D;", "precision highp usampler3D;")
    .replace("uniform sampler3D uVolume;", "uniform usampler3D uVolume;")
    .replace("return int(texelFetch(uVolume, p, 0).r * 255.0 + 0.5);", "return int(texelFetch(uVolume, p, 0).r);");

// The two decode paths, as CPU mirrors, so the claim above is testable instead of asserted.
// decodeUnormByte models the GLSL expression in float32 at every step (highp float is IEEE single); GLSL's int()
// truncates toward zero, hence trunc and not round.
export function decodeUnormByte(b) {
    const sampled = Math.fround(b / 255);                       // what the texture unit hands the shader
    return Math.trunc(Math.fround(Math.fround(sampled * 255) + 0.5));
}
export function decodeUintByte(b) { return b | 0; }             // what usampler3D hands the shader: the byte

// --- BRICK-SKIP variant (v3061) ------------------------------------------------------------------------------
//
// FRAG_SRC_UI with ONE guard added to voxel(): consult a coarse occupancy texture before fetching the volume.
//
//     uint: int voxel(ivec3 p){ if(!inBounds(p)) return 0; return int(texelFetch(uVolume, p, 0).r); }
//     brick: ... if (texelFetch(uBricks, p >> uBrickShift, 0).r == 0u) return 0;   <-- inserted before that fetch
//
// THIS IS THE SAME GUARD voxel/rleBrickMap.js traverseBricked uses on the CPU, and the same claim applies: it
// removes FETCHES, not steps. The DDA state machine is untouched, so the traversal is equivalent by
// construction; what changes is that a ray through open sky stops sampling the big texture at every step and
// samples a 512x-smaller one instead. On the CPU that saved 94.0% of solid queries (1,049,420 -> 62,453 over
// 5000 rays, measured); on the GPU the equivalent saving is texture bandwidth, and it is NOT claimed here
// because nothing has measured it on a GPU yet. benchmarks.html is where that number has to come from.
//
// THE BRICK TEXTURE IS R8UI AND UNFILTERED for the same reason the volume is: an integer texture cannot be
// filtered, and a filtered occupancy sample would be neither occupied nor empty. p >> uBrickShift is an integer
// shift, so brick size must be a power of two -- rleBrickMap's default is 8, and the pass refuses anything else
// rather than silently truncating.
//
// THE ASYMMETRY FROM v3042 CARRIES OVER UNCHANGED AND IS THE WHOLE SAFETY ARGUMENT: a brick wrongly marked
// occupied costs a fetch; a brick wrongly marked EMPTY skips a solid voxel and a ray passes through a wall.
// Silently. The map must be verified on the CPU (verifyBrickMap) before it is uploaded -- this shader
// cannot check it and does not pretend to.
export const FRAG_SRC_BRICK = FRAG_SRC_UI
    .replace("uniform usampler3D uVolume;", "uniform usampler3D uVolume;\nuniform highp usampler3D uBricks;\nuniform int uBrickShift;")
    .replace(
        "return int(texelFetch(uVolume, p, 0).r);",
        "if (texelFetch(uBricks, p >> uBrickShift, 0).r == 0u) return 0; return int(texelFetch(uVolume, p, 0).r);");

// --- COMPOSITING variant (v3064) -----------------------------------------------------------------------------
//
// FRAG_SRC_BRICK plus a depth write, so marched voxels and the rasterised world can share one depth buffer and
// occlude each other correctly. The answer key for this arrived first, in render/depthProject.js (v3063), and
// the expression below is that module's hitDepth() transcribed into GLSL -- deliberately, so a CPU mirror can
// check the shader rather than the two drifting apart.
//
// TWO THINGS ARE LOAD-BEARING AND BOTH ARE EASY TO GET WRONG.
//
// 1. THE DOT PRODUCT. t is the distance ALONG THE RAY; a depth buffer is a function of VIEW-SPACE Z, the
//    distance along the camera axis. zView = t * dot(rd, uFwd). Omitting it is correct at the centre pixel and
//    wrong everywhere else -- measured at 15.5% at the edge of a 60-degree field of view and 29.1% at the
//    corner, and wrong in the direction that makes voxels SINK INTO terrain, which reads as a culling bug.
//
// 2. A MISS MUST DISCARD, NOT SHADE. The un-composited variants paint the background colour on a miss, which is
//    right when the marcher owns the whole frame and catastrophic when it does not: it would erase the
//    rasterised world everywhere the region happens to be empty. discard leaves those pixels to whoever else
//    drew them, which is the entire point of compositing.
//
// gl_FragDepth is a GLSL ES 3.00 built-in and needs no extension in WebGL2. Writing it disables early-Z for this
// pass; that is a real cost, it is the price of a marcher participating in the depth buffer at all, and no
// measurement here claims otherwise.
export const FRAG_SRC_DEPTH = FRAG_SRC_BRICK
    .replace("uniform int uBrickShift;", "uniform int uBrickShift;\nuniform float uNear;\nuniform float uFar;")
    .replace(
        "if(hitId==0){ fragColor=vec4(0.05,0.07,0.09,1.0); return; }",
        "if(hitId==0){ discard; }\n    float zView = t * dot(rd, uFwd);\n    if(zView < uNear){ discard; }\n    float zNdc = ((uFar+uNear)/(uFar-uNear)) + ((-2.0*uFar*uNear)/((uFar-uNear)*zView));\n    gl_FragDepth = (zNdc + 1.0) * 0.5;");
