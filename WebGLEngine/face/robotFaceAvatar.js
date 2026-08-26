// FILE: face/robotFaceAvatar.js
// VERSION: v1 - round 67
//
// Standalone 3D robot avatar. Loads RobotExpressive.glb (or whichever
// asset is named below), parses it via the engine's GLBParser, drives
// skeletal animation via SkeletalAnimator, and renders into its own
// WebGL2 canvas. Connects to the engine's WebSocket bridge and maps
// listener "tama" events to RobotExpressive clip names.
//
// Independent of the main engine's renderer: this is a single-mesh
// minimal pipeline (no terrain, no instancing, no fog/shadows) tuned
// just for showing one character. Shares the parser + animator with
// the main engine so any improvement there carries over for free.
//
// Layout & camera: full-body framing at (0, 1, 4) → (0, 0.8, 0). Plenty
// of headroom for jump / dance clips that lift the character.

import { GLBParser } from "../gpu/GLBParser.js";
import { SkeletalAnimator } from "../gpu/SkeletalAnimator.js";
import { buildAmplitudeCurve, sampleWithJitter } from "./PhonemeMouth.js";  // Round 271
import { ACCESSORY_CATALOG } from "./accessoryGeometry.js";   // v864 — Phase 2 costuming
import { ClothSimulator, buildGridEdges, transformPoint } from "../gpu/ClothSim.js";  // v870 — extracted cloth sim
import avatarOrientation from "../ui/avatarOrientation.js";   // v884 — front-view realign
import avatarColor from "../ui/avatarColor.js";               // v888 — color-as-indicator
import { backoffDelay } from "../net/wsReconnect.js";        // v1345 — jittered reconnect

// v865 — Avatar metrics captured at mesh load. Used by accessory
// geometry builder to scale procedural shapes to the loaded avatar's
// actual proportions. Defaults match RobotExpressive (the rig the
// hardcoded accessory positions were tuned against).
const _avatarMetrics = {
    modelHeight: 1.8,
    modelTopY:   1.8,
    modelMidY:   0.9,
    scaleRatio:  1.0,           // multiplier applied to accessory positions
};

// ---- DOM ----------------------------------------------------------------
const canvas    = document.getElementById("robot-canvas");
const statusDot = document.querySelector("#status .dot");
const statusTxt = document.getElementById("status-text");
const emoEl     = document.getElementById("emotion");
const clipEl    = document.getElementById("clip");

// Round 259 — voice identity captured from URL ?voice=... query so the
// page can filter postMessage events AND broadcast load completion to
// the right parent listener.
const _myVoice = (() => {
    try { return new URLSearchParams(window.location.search).get("voice") || null; }
    catch { return null; }
})();

// ---- WebGL2 init --------------------------------------------------------
const gl = canvas.getContext("webgl2", { antialias: true });
if (!gl) {
    document.body.innerHTML = "<div style='padding:24px;color:#f99;font-family:monospace;'>WebGL2 not available — this avatar needs a modern browser.</div>";
    throw new Error("webgl2 not supported");
}

function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.max(1, Math.floor(canvas.clientWidth  * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
}
resize();
window.addEventListener("resize", resize);

// ---- Shaders ------------------------------------------------------------
// Minimal skinning + lambertian + fresnel rim light. Matches the data
// layout the main engine's parser produces: positions/normals as
// Float32Array, joints as Uint8 or Uint16, weights as Float32.
const VS = `#version 300 es
precision highp float;
precision highp int;

layout(location=0) in vec3  aPos;
layout(location=1) in vec3  aNormal;
layout(location=2) in uvec4 aJoints;
layout(location=3) in vec4  aWeights;
layout(location=4) in vec3  aColor;     // round 118 — per-vertex material color
layout(location=5) in vec2  aUV;        // round 119 — UV for texture sampling

uniform mat4 uViewProj;
uniform mat4 uJointMatrices[64];
uniform bool uHasSkin;
uniform vec3 uModelOffset;     // v858 — character-level lateral offset for wandering
uniform mat4 uModelRot;        // v884 — orientation override (front-view realign)

out vec3 vNormal;
out vec3 vWorldPos;
out vec3 vColor;
out vec2 vUV;

void main() {
    vec3 p = aPos;
    vec3 n = aNormal;
    if (uHasSkin) {
        mat4 skinMat = aWeights.x * uJointMatrices[aJoints.x]
                     + aWeights.y * uJointMatrices[aJoints.y]
                     + aWeights.z * uJointMatrices[aJoints.z]
                     + aWeights.w * uJointMatrices[aJoints.w];
        p = (skinMat * vec4(aPos, 1.0)).xyz;
        n = normalize((skinMat * vec4(aNormal, 0.0)).xyz);
    }
    // v884 — orientation override. Rotates the whole rig (skinned mesh AND
    // bone-attached accessories, since they share this program) so the user
    // can stand up / face-front a mis-authored model. Identity = no change.
    p = (uModelRot * vec4(p, 1.0)).xyz;
    n = normalize((uModelRot * vec4(n, 0.0)).xyz);
    // v858 — apply character offset AFTER skinning so the whole rig
    // moves as a unit (rather than treating offset as a bone transform)
    p += uModelOffset;
    vNormal = n;
    vWorldPos = p;
    vColor = aColor;
    vUV = aUV;
    gl_Position = uViewProj * vec4(p, 1.0);
}`;

const FS = `#version 300 es
precision highp float;

in vec3 vNormal;
in vec3 vWorldPos;
in vec3 vColor;
in vec2 vUV;
out vec4 oColor;

uniform vec3 uBaseColor;
uniform sampler2D uTexture;
uniform bool uHasTexture;
uniform vec3 uTint;       // v862 — multiplicative color overlay for costuming
uniform vec3 uColorOverride;   // v888 — indicator wash color
uniform float uColorOverrideAmt; // v888 — wash strength 0..1 (0 = off)

void main() {
    vec3 N = normalize(vNormal);
    vec3 L = normalize(vec3(0.4, 0.8, 0.5));
    float diffuse = max(0.0, dot(N, L));
    float ambient = 0.32;
    // Fresnel rim for visual interest against the dark background
    vec3 V = normalize(vec3(0.0, 0.0, 1.0));
    float fresnel = pow(1.0 - max(0.0, dot(N, V)), 2.5);
    // Round 118/119 — vertex color × material × optional base-color
    // texture. Texture sampled in linear space; the engine doesn't do
    // gamma management yet so output is slightly off but consistent.
    vec3 albedo = uBaseColor * vColor;
    if (uHasTexture) {
        vec4 tx = texture(uTexture, vUV);
        albedo *= tx.rgb;
    }
    vec3 base = albedo * (ambient + diffuse * 0.85);
    vec3 rim  = vec3(1.0, 0.55, 0.15) * fresnel * 0.45;
    // v862 — apply costume tint to final composed color.
    vec3 col = (base + rim) * uTint;
    // v888 — color-as-indicator wash. Lerp toward the indicator color; the
    // diffuse term is kept as a multiplier so form/shading still read.
    col = mix(col, uColorOverride * (ambient + diffuse * 0.85 + rim), uColorOverrideAmt);
    oColor = vec4(col, 1.0);
}`;

function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("[robotFace] shader compile:", gl.getShaderInfoLog(sh));
    }
    return sh;
}

const program = gl.createProgram();
gl.attachShader(program, compile(gl.VERTEX_SHADER,   VS));
gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FS));
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("[robotFace] link:", gl.getProgramInfoLog(program));
}
const uViewProj      = gl.getUniformLocation(program, "uViewProj");
const uJointMatrices = gl.getUniformLocation(program, "uJointMatrices");
const uHasSkin       = gl.getUniformLocation(program, "uHasSkin");
const uBaseColor     = gl.getUniformLocation(program, "uBaseColor");
// Round 119 — texture support
const uTexture       = gl.getUniformLocation(program, "uTexture");
const uHasTexture    = gl.getUniformLocation(program, "uHasTexture");
// v858 — character-level offset uniform for the lateral wanderer
const uModelOffset   = gl.getUniformLocation(program, "uModelOffset");
// v884 — orientation override matrix uniform (identity by default)
const uModelRot      = gl.getUniformLocation(program, "uModelRot");
// v862 — costume tint multiplier (vec3, default 1,1,1)
const uTint          = gl.getUniformLocation(program, "uTint");
const uColorOverride    = gl.getUniformLocation(program, "uColorOverride");      // v888
const uColorOverrideAmt = gl.getUniformLocation(program, "uColorOverrideAmt");   // v888

// ---- Asset loading ------------------------------------------------------
let mesh     = null;
let animator = null;
let assetName = "RobotExpressive";   // override via ?asset= query param

const params = new URLSearchParams(location.search);
if (params.get("asset")) assetName = params.get("asset");

// Round 265 — user-supplied GLB. `?glb=<url>` overrides the asset
// lookup entirely; the URL can be a remote file or a blob: URL (which
// is what the PIP-drop handler produces from a dragged file). When set
// we skip the /GPU_Assets/... convention and fetch the URL directly.
let customGlbUrl = params.get("glb");

// v884 — orientation override state. _modelRotMat is uploaded to uModelRot
// every frame; identity until the user picks a rotation. _avatarKey() returns
// the same url string the favorites / orientation stores key by, so an
// override set here persists and travels with the favorite.
const _IDENTITY4 = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
let _modelRotMat = new Float32Array(_IDENTITY4);
// Raw (unrotated) bounding box from the loaded mesh, captured at load so we
// can re-frame the camera whenever the orientation changes without re-reading
// vertex positions.
let _rawBBox = null;   // { minX,minY,minZ, maxX,maxY,maxZ }
let _skinnedFitDone = false;   // v3779 -- once-per-model: replace the raw-position box with the SKINNED box
let _skinnedFitReason = "not attempted";   // v3786 -- WHY the skinned box was not used; shown on the readout

function _avatarKey() {
    return customGlbUrl || assetName || "RobotExpressive";
}

function _applyOrientation() {
    try {
        const o = avatarOrientation.get(_avatarKey());
        _modelRotMat = avatarOrientation.buildMatrix(o);
    } catch { _modelRotMat = new Float32Array(_IDENTITY4); }
    // Re-frame the camera for the (possibly) re-oriented bounds.
    try { _recomputeFit(); } catch {}
}

// Re-derive BASE_RADIUS / look targets from the raw bbox transformed by the
// current orientation matrix. Mirrors the v727 auto-fit but runs on demand.
/*
 * *** v3808 -- THE BOX IS ROTATED HERE, AND THE SKINNED BOX IS ALREADY ROTATED. _measureModelSkinned walks
 * vertices THROUGH THEIR JOINT MATRICES, so what it returns is in RENDERED space -- already oriented. Feeding
 * it through _modelRotMat again applies the model rotation TWICE, which shifts the derived centre and leaves
 * the figure sitting low in the frame with empty space above it, exactly as Keith saw.
 * *** THE RAW PARSE BOX STILL NEEDS THE ROTATION AND THE SKINNED ONE MUST NOT HAVE IT -- THE SAME FUNCTION,
 * TWO SPACES -- so the box now says which space it is in rather than the function assuming. ***
 */
function _recomputeFit() {
    if (!_rawBBox) return;
    if (_userSetRadius && _userSetCameraY) return;   // user pinned the camera
    const b = _rawBBox;
    const preRotated = b.oriented === true;
    const corners = [
        [b.minX,b.minY,b.minZ],[b.maxX,b.minY,b.minZ],[b.minX,b.maxY,b.minZ],[b.maxX,b.maxY,b.minZ],
        [b.minX,b.minY,b.maxZ],[b.maxX,b.minY,b.maxZ],[b.minX,b.maxY,b.maxZ],[b.maxX,b.maxY,b.maxZ],
    ];
    const m = preRotated ? [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] : _modelRotMat;
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    for (const [x,y,z] of corners) {
        const rx = m[0]*x + m[4]*y + m[8]*z;
        const ry = m[1]*x + m[5]*y + m[9]*z;
        const rz = m[2]*x + m[6]*y + m[10]*z;
        if (rx<minX)minX=rx; if (rx>maxX)maxX=rx;
        if (ry<minY)minY=ry; if (ry>maxY)maxY=ry;
        if (rz<minZ)minZ=rz; if (rz>maxZ)maxZ=rz;
    }
    const modelHeight = maxY - minY;
    const modelWidth  = Math.max(maxX - minX, maxZ - minZ);
    const modelMidY   = (minY + maxY) / 2;
    const modelTopY   = maxY;
    _avatarMetrics.modelHeight = modelHeight;
    _avatarMetrics.modelTopY   = modelTopY;
    _avatarMetrics.modelMidY   = modelMidY;
    _avatarMetrics.scaleRatio  = modelHeight / 1.8;
    const FOV_HALF = (45 / 2) * Math.PI / 180;
    const aspect = (canvas.width / canvas.height) || 1;
    const radiusForH = (modelHeight / 2) / Math.tan(FOV_HALF);
    const radiusForW = (modelWidth  / 2) / (Math.tan(FOV_HALF) * aspect);
    const fitRadius  = Math.max(radiusForH, radiusForW) * 1.3;
    if (!_userSetRadius)   BASE_RADIUS = Math.min(20, Math.max(2.5, fitRadius));
    if (!_userSetCameraY) { BODY_LOOK_Y = modelMidY; FACE_LOOK_Y = modelTopY - modelHeight * 0.08; }
}

// React to orientation changes made from the UI (or another window).
try { avatarOrientation.onChange(({ url }) => { if (url === _avatarKey()) _applyOrientation(); }); } catch {}

// v884 — head-box measurement. The auto-fit only measured overall HEIGHT;
// hats/eyewear ride the head bone but had no notion of head SIZE. This
// gathers the vertices dominantly weighted to the head joint, transforms
// them by that joint's current matrix AND the orientation override, and
// returns the head's world-space box. Used for a readout and to anchor the
// hat to the actual crown instead of the bare bone origin.
let _parsedRef = null;     // captured at load for on-demand measurement
function _measureHead() {
    if (!_parsedRef || !animator || !animator.jointMatrices) return null;
    const headJoint = _accessoryBones.head;
    if (headJoint < 0) return null;
    const P = _parsedRef.positions, J = _parsedRef.joints, W = _parsedRef.weights;
    if (!P || !J || !W) return null;
    const jm = animator.jointMatrices;
    const base = headJoint * 16;
    if (base + 16 > jm.length) return null;
    const m = _modelRotMat;
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity,count=0;
    const n = (P.length / 3) | 0;
    for (let i = 0; i < n; i++) {
        // dominant joint = the one with the largest weight on this vertex
        const o = i * 4;
        let domJ = J[o], domW = W[o];
        if (W[o+1] > domW) { domW = W[o+1]; domJ = J[o+1]; }
        if (W[o+2] > domW) { domW = W[o+2]; domJ = J[o+2]; }
        if (W[o+3] > domW) { domW = W[o+3]; domJ = J[o+3]; }
        if (domJ !== headJoint) continue;
        const x = P[i*3], y = P[i*3+1], z = P[i*3+2];
        // skin by the head joint matrix (column-major mat4 * point)
        let sx = jm[base]*x   + jm[base+4]*y + jm[base+8]*z  + jm[base+12];
        let sy = jm[base+1]*x + jm[base+5]*y + jm[base+9]*z  + jm[base+13];
        let sz = jm[base+2]*x + jm[base+6]*y + jm[base+10]*z + jm[base+14];
        // then orientation override
        const rx = m[0]*sx + m[4]*sy + m[8]*sz;
        const ry = m[1]*sx + m[5]*sy + m[9]*sz;
        const rz = m[2]*sx + m[6]*sy + m[10]*sz;
        if (rx<minX)minX=rx; if (rx>maxX)maxX=rx;
        if (ry<minY)minY=ry; if (ry>maxY)maxY=ry;
        if (rz<minZ)minZ=rz; if (rz>maxZ)maxZ=rz;
        count++;
    }
    if (count === 0) return null;
    const head = {
        width:  +(maxX - minX).toFixed(3),
        height: +(maxY - minY).toFixed(3),
        depth:  +(maxZ - minZ).toFixed(3),
        topY:   +maxY.toFixed(3),
        cx: +((minX+maxX)/2).toFixed(3), cy: +((minY+maxY)/2).toFixed(3), cz: +((minZ+maxZ)/2).toFixed(3),
        count,
    };
    _avatarMetrics.head = head;
    return head;
}

// v3779 -- THE AUTO-FIT WAS MEASURING THE WRONG SPACE. The load-time bbox is taken from raw parsed.positions,
// but RobotExpressive's mesh is authored tiny and the SKIN/JOINT matrices scale it up ~100x at render -- so the
// raw box read h=0.018u ("scale 0.01x" in the readout), the camera radius was computed for a 0.018u model, and
// the view sat inside a giant robot (the RobotExpressive.html close-up, and "not in frame at all" in the
// server.html avatar corner). This measures the box in the SAME space _measureHead uses -- each vertex skinned
// by its dominant joint via animator.jointMatrices -- but over EVERY vertex and WITHOUT the orientation matrix,
// so it yields the true un-rotated rendered box that _recomputeFit can then re-orient. Works for any rig: a
// model authored at true scale skins ~1:1 and measures the same as its raw box, so this is strictly more
// correct, not RobotExpressive-specific.
function _measureModelSkinned() {
    // *** v3786 -- EVERY EARLY RETURN NOW NAMES ITSELF. Keith's page still printed "height 0.03u / scale 0.01x"
    // after the v3779 fix shipped, and reading the source could not tell WHICH of five preconditions failed --
    // nothing in this sandbox can run WebGL. A SILENT null LEFT THE RAW BOX IN PLACE AND SAID NOTHING, so the
    // symptom was identical whether the measurement was skipped, refused, or simply never reached.
    // The reason travels to metrics() and onto the readout, so the next look at that panel says WHY. ***
    _skinnedFitReason = "";
    if (!_parsedRef) { _skinnedFitReason = "no parsed model"; return null; }
    if (!animator) { _skinnedFitReason = "no animator"; return null; }
    if (!animator.jointMatrices) { _skinnedFitReason = "animator has no jointMatrices"; return null; }
    const P = _parsedRef.positions, J = _parsedRef.joints, W = _parsedRef.weights;
    if (!P) { _skinnedFitReason = "parsed model has no positions"; return null; }
    if (!J || !W) {
        // A RIGID-PARENTED RIG STILL HAS THESE -- the parser mints a synthetic joint per rigid mesh -- so their
        // absence means the parse path changed, not that the rig is unusual.
        _skinnedFitReason = "no joints/weights (" + (J ? "" : "joints ") + (W ? "" : "weights ") + "missing)"; return null;
    }
    const jm = animator.jointMatrices;
    const njoints = (jm.length / 16) | 0;
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity, count = 0;
    const n = (P.length / 3) | 0;
    for (let i = 0; i < n; i++) {
        const o = i * 4;
        let domJ = J[o], domW = W[o];
        if (W[o+1] > domW) { domW = W[o+1]; domJ = J[o+1]; }
        if (W[o+2] > domW) { domW = W[o+2]; domJ = J[o+2]; }
        if (W[o+3] > domW) { domW = W[o+3]; domJ = J[o+3]; }
        if (domJ < 0 || domJ >= njoints) continue;
        const b = domJ * 16, x = P[i*3], y = P[i*3+1], z = P[i*3+2];
        const sx = jm[b]*x   + jm[b+4]*y + jm[b+8]*z  + jm[b+12];
        const sy = jm[b+1]*x + jm[b+5]*y + jm[b+9]*z  + jm[b+13];
        const sz = jm[b+2]*x + jm[b+6]*y + jm[b+10]*z + jm[b+14];
        if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
        if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
        if (sz < minZ) minZ = sz; if (sz > maxZ) maxZ = sz;
        count++;
    }
    // *** v3786 -- THE LIKELIEST FAILURE FOR A RIGID-PARENTED RIG, AND IT WAS THE QUIETEST. Every vertex whose
    // dominant joint index falls outside the animator's joint range is SKIPPED above; if that is all of them,
    // count is 0 and this returned null with no word said. The reason now carries the COUNT and the RANGE, so
    // "0 of 4242 vertices matched a joint (njoints 8)" distinguishes a parse mismatch from an empty model. ***
    if (!count) { _skinnedFitReason = "0 of " + n + " vertices matched a joint (njoints " + njoints + ")"; return null; }
    if (!Number.isFinite(maxY - minY) || (maxY - minY) <= 0) {
        _skinnedFitReason = "degenerate skinned box (height " + (maxY - minY) + " over " + count + " verts)"; return null;
    }
    _skinnedFitReason = "ok (" + count + " of " + n + " verts)";
    return { minX, minY, minZ, maxX, maxY, maxZ };
}

// v884 — UI-facing API. RobotExpressive.html's orientation toolbar reads/writes
// through here; values flow through the avatarOrientation store so they
// persist + travel with the favorite.
try {
    window.robotAvatar = window.robotAvatar || {};
    window.robotAvatar.key         = () => _avatarKey();
    window.robotAvatar.metrics     = () => Object.assign({}, _avatarMetrics);
    window.robotAvatar.measureHead = () => _measureHead();
    // v3786 -- the readout can ask WHY the skinned fit did not happen, instead of inferring it from a number.
    window.robotAvatar.skinnedFitReason = () => _skinnedFitReason;
    window.robotAvatar.getOrientation = () => { try { return avatarOrientation.get(_avatarKey()); } catch { return { yaw:0, pitch:0, roll:0 }; } };
    window.robotAvatar.rotate      = (axis, deg) => { try { avatarOrientation.rotate(_avatarKey(), axis, deg); } catch {} };
    window.robotAvatar.resetOrientation = () => { try { avatarOrientation.reset(_avatarKey()); } catch {} };
    window.robotAvatar.setYaw      = (deg) => { try { const o = avatarOrientation.get(_avatarKey()); o.yaw = deg; avatarOrientation.set(_avatarKey(), o); } catch {} };
} catch {}


// Also listen for a postMessage from the PIP that delivers a blob URL
// after the user drops a .glb on the PIP panel.
window.addEventListener("message", (e) => {
    const m = e?.data;
    if (m?.type === "kpop:loadGlb" && typeof m.url === "string") {
        customGlbUrl = m.url;
        loadRobot();
    }
});

async function loadRobot() {
    statusTxt.textContent = `loading ${customGlbUrl ? "custom GLB" : assetName}…`;
    try {
        const url = customGlbUrl || `/GPU_Assets/${assetName}.glb`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
        const buf = await res.arrayBuffer();
        // v729 — pass baseUrl so multi-file .gltf (with separate .bin and
        // texture files) can resolve relative URIs against the source URL.
        const parsed = await GLBParser.parse(buf, { baseUrl: new URL(url, location.href).href });
        _parsedRef = parsed;   // v884 — for on-demand head-box measurement

        if (!parsed.skin || !parsed.animations?.length) {
            throw new Error("asset has no skin or animations — not a rigged GLB");
        }

        // v727 — auto-fit: compute the model bounding box from parsed
        // positions and pick a camera radius that frames the whole thing
        // with ~30% margin (head near top, feet near bottom). Only applies
        // if the embedder didn't pass ?cameraRadius= explicitly. Same for
        // cameraY: if not provided, center on the model's vertical mid.
        {
            let minX = Infinity, minY = Infinity, minZ = Infinity;
            let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
            const p = parsed.positions;
            for (let i = 0; i < p.length; i += 3) {
                const x = p[i], y = p[i+1], z = p[i+2];
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
                if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
            }
            const modelHeight = maxY - minY;
            const modelWidth  = Math.max(maxX - minX, maxZ - minZ);
            const modelMidY   = (minY + maxY) / 2;
            const modelTopY   = maxY;
            // v865 — expose for accessory auto-scaling. Reference height
            // is RobotExpressive's ~1.8 units; scale ratio = h / 1.8.
            // Custom avatars get accessory geometry scaled by this ratio
            // so hats sit on heads of any size, capes reach knee height,
            // glasses sit at eye level even on miniature or giant rigs.
            _avatarMetrics.modelHeight = modelHeight;
            _avatarMetrics.modelTopY   = modelTopY;
            _avatarMetrics.modelMidY   = modelMidY;
            _avatarMetrics.scaleRatio  = modelHeight / 1.8;
            // FOV is 45° vertical (per perspective matrix below)
            const FOV_HALF = (45 / 2) * Math.PI / 180;
            const aspect = (canvas.width / canvas.height) || 1;
            const radiusForH = (modelHeight / 2) / Math.tan(FOV_HALF);
            const radiusForW = (modelWidth  / 2) / (Math.tan(FOV_HALF) * aspect);
            const fitRadius  = Math.max(radiusForH, radiusForW) * 1.3;   // 30% margin

            if (!_userSetRadius) {
                BASE_RADIUS = Math.min(20, Math.max(2.5, fitRadius));
            }
            if (!_userSetCameraY) {
                // Look at model's vertical mid; head at modelTopY for face zoom
                BODY_LOOK_Y = modelMidY;
                FACE_LOOK_Y = modelTopY - modelHeight * 0.08;   // just below crown
            }
            console.log(`[robotFaceAvatar] ${customGlbUrl || assetName} bbox: h=${modelHeight.toFixed(2)}u w=${modelWidth.toFixed(2)}u, BASE_RADIUS=${BASE_RADIUS.toFixed(2)} (user=${_userSetRadius})`);
            // v884 — remember the raw (unrotated) box so orientation changes
            // can re-frame on demand, then apply any saved override for this
            // avatar (which re-fits using the rotated box).
            _rawBBox = { minX, minY, minZ, maxX, maxY, maxZ };
            _skinnedFitDone = false;   // v3779 -- re-measure in skinned space on the first frame the animator is live
            _applyOrientation();
        }

        // ---- Upload to GPU ----
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, parsed.positions, gl.STATIC_DRAW);

        let nbo = null;
        if (parsed.normals) {
            nbo = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
            gl.bufferData(gl.ARRAY_BUFFER, parsed.normals, gl.STATIC_DRAW);
        }

        const ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, parsed.indices, gl.STATIC_DRAW);

        const jbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, jbo);
        gl.bufferData(gl.ARRAY_BUFFER, parsed.joints, gl.STATIC_DRAW);
        const jointsType = parsed.joints instanceof Uint8Array
            ? gl.UNSIGNED_BYTE
            : gl.UNSIGNED_SHORT;

        const wbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, wbo);
        gl.bufferData(gl.ARRAY_BUFFER, parsed.weights, gl.STATIC_DRAW);

        // Round 118 — per-vertex material colors. Allocated when the
        // GLB has materials with baseColorFactor; absent for older
        // assets. Falls back to white via vertexAttrib3f(4) below.
        let cbo = null;
        if (parsed.colors && parsed.colors.length === parsed.positions.length) {
            cbo = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, cbo);
            gl.bufferData(gl.ARRAY_BUFFER, parsed.colors, gl.STATIC_DRAW);
        }

        // Round 119 — UV attribute for texture sampling. parsed.texCoords
        // is only populated when ALL primitives in the GLB had UVs;
        // otherwise it's null and we disable the attribute.
        let tbo = null;
        if (parsed.texCoords && parsed.texCoords.length === (parsed.positions.length / 3) * 2) {
            tbo = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, tbo);
            gl.bufferData(gl.ARRAY_BUFFER, parsed.texCoords, gl.STATIC_DRAW);
        }

        // Round 119 — base-color texture upload. parsed.texture is an
        // ImageBitmap (decoded by GLBParser); we upload + mipmap +
        // bind for sampling in the fragment shader.
        let glTexture = null;
        if (parsed.texture) {
            glTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, glTexture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, parsed.texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.bindTexture(gl.TEXTURE_2D, null);
        }

        // Round 122 — per-primitive textures (multi-material support).
        // parsed.texturesByMaterial maps materialIdx → ImageBitmap.
        // Upload each one into its own GL texture so the render loop can
        // bind per-primitive when walking parsed.primitiveRanges.
        // Falls back gracefully: when only one texture is present, the
        // render loop just uses glTexture (single bind, single draw).
        const glTexturesByMaterial = {};
        if (parsed.texturesByMaterial) {
            for (const matIdxKey of Object.keys(parsed.texturesByMaterial)) {
                const img = parsed.texturesByMaterial[matIdxKey];
                if (!img) continue;
                const tex = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.generateMipmap(gl.TEXTURE_2D);
                glTexturesByMaterial[matIdxKey] = tex;
            }
            gl.bindTexture(gl.TEXTURE_2D, null);
        }

        // ---- VAO ----
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        if (nbo) {
            gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
            gl.enableVertexAttribArray(1);
            gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        } else {
            // Generic fallback if normals are absent — flat up-facing
            gl.disableVertexAttribArray(1);
            gl.vertexAttrib3f(1, 0, 1, 0);
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, jbo);
        gl.enableVertexAttribArray(2);
        // Integer attribute — must use vertexAttribIPointer, not Pointer
        gl.vertexAttribIPointer(2, 4, jointsType, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, wbo);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 0, 0);

        if (cbo) {
            gl.bindBuffer(gl.ARRAY_BUFFER, cbo);
            gl.enableVertexAttribArray(4);
            gl.vertexAttribPointer(4, 3, gl.FLOAT, false, 0, 0);
        } else {
            gl.disableVertexAttribArray(4);
            gl.vertexAttrib3f(4, 1, 1, 1);    // white fallback
        }

        if (tbo) {
            gl.bindBuffer(gl.ARRAY_BUFFER, tbo);
            gl.enableVertexAttribArray(5);
            gl.vertexAttribPointer(5, 2, gl.FLOAT, false, 0, 0);
        } else {
            gl.disableVertexAttribArray(5);
            gl.vertexAttrib2f(5, 0, 0);    // zeros — texture sampler returns (0,0,0)
        }

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bindVertexArray(null);

        mesh = {
            vao,
            indexCount: parsed.indices.length,
            skin:       parsed.skin,
            animations: parsed.animations,
            nodes:      parsed.nodes,
            texture:    glTexture,
            // Round 122 — multi-material draw support
            primitiveRanges:      parsed.primitiveRanges || null,
            texturesByMaterial:   glTexturesByMaterial,
        };
        animator = new SkeletalAnimator(mesh);

        // v715 — head-focus speech lock. Look up head/torso/root bone
        // indices once at load. Robust to rig naming: tries node.name
        // matches first, falls back to the v660 stub's fixed indices
        // (0=root, 1=torso, 2=head). Sets up an onPose constraint that
        // re-pins these bones to their bind-pose TRS during speech, so
        // the mouth overlay stays glued to the head and no nodding /
        // shaking / body sway leaks through the dance or idle clips
        // while the avatar is talking.
        _findSpeechLockBones(animator.nodes);
        animator.onPose = _applySpeechLock;

        // Default to Idle so the rig pose is sensible immediately
        setClipFuzzy("idle");

        const clipNames = parsed.animations.map(c => c.name).join(", ");
        // Round 259 — status no longer shouts the clip count. Just
        // "-- IDLE --" once load completes. The clip info is broadcast
        // to the parent window so the OLLAMA panel can display it.
        statusTxt.textContent = "— IDLE —";
        try {
            window.parent?.postMessage({
                type: "kpop:clipsLoaded",
                voice: _myVoice ?? "M1",
                count: parsed.animations.length,
                names: parsed.animations.map(c => c.name),
                asset: assetName,
            }, "*");
        } catch {}
        console.log(`[robotFaceAvatar] ${assetName}: ${parsed.positions.length / 3} verts, ${parsed.indices.length} indices, ${parsed.skin.joints.length} joints, clips: ${clipNames}`);
    } catch (e) {
        statusTxt.textContent = `load failed: ${e.message}`;
        console.error("[robotFaceAvatar]", e);
    }
}

// ---- Clip + emotion control --------------------------------------------
let currentEmotion = "neutral";

// Map listener "tama" actions to RobotExpressive clip names. Fuzzy-
// matched inside the animator, so case/whitespace variations work. If
// the asset doesn't have a particular clip, animator falls through to
// the previous one (no error).
// Round 267 — every clip in RobotExpressive.glb mapped, plus aliases
// so engine events (which use names like "kaiju_death", "birth",
// "collapse", etc.) can resolve to clips without an extra adapter.
// New clips unlocked this round: Death, Running, Standing, WalkJump.
const EMOTION_TO_CLIP = {
    // Core 10 — established mapping
    neutral:    "Idle",
    happy:      "ThumbsUp",
    approve:    "ThumbsUp",
    sad:        "No",
    no:         "No",
    reject:     "No",
    deny:       "No",
    alert:      "Punch",
    hit:        "Punch",
    attack:     "Punch",
    wave:       "Wave",
    hello:      "Wave",
    greet:      "Wave",
    feed:       "Yes",
    yes:        "Yes",
    confirm:    "Yes",
    play:       "Jump",
    jump:       "Jump",
    sleep:      "Sitting",
    sit:        "Sitting",
    speak:      "Walking",
    walk:       "Walking",
    dance:      "Dance",
    celebrate:  "Dance",
    // Newly added — Death (lying down), Running (sprint), Standing
    // (alert pose, no idle sway), WalkJump (stride + leap).
    death:      "Death",
    die:        "Death",
    catastrophe:"Death",
    run:        "Running",
    sprint:     "Running",
    flee:       "Running",
    stand:      "Standing",
    attention:  "Standing",
    stride:     "WalkJump",
    parkour:    "WalkJump",
    leap:       "WalkJump",
};

function setClipFuzzy(name, blend = 0.3) {
    if (!animator) return;
    const before = animator.activeClipIdx;
    animator.setClipByName(name, blend);
    if (animator.activeClipIdx !== before) {
        const realName = animator.animations[animator.activeClipIdx]?.name ?? "?";
        clipEl.textContent = `clip: ${realName}`;
        return true;
    }
    return false;
}

function setEmotion(name) {
    currentEmotion = name;
    emoEl.textContent = `— ${name} —`;
    const clip = EMOTION_TO_CLIP[name] || EMOTION_TO_CLIP.neutral;
    setClipFuzzy(clip);
    // Ease back to neutral after a window — long enough to enjoy the
    // animation, short enough that the rig doesn't get stuck on (say)
    // a one-shot Punch loop visibly. Round 267 — extended hold times
    // for new clips. Death plays out for 7s (one-shot, lies down)
    // before getting back up; Running/WalkJump stay for 5s; Standing
    // and sleep hold indefinitely.
    clearTimeout(setEmotion._t);
    const HOLDS = {
        death: 7000,  catastrophe: 7000, die: 7000,
        run: 5000,    sprint: 5000,      flee: 5000,
        stride: 5000, parkour: 5000,     leap: 5000,
    };
    const PERSISTENT = new Set(["neutral", "sleep", "sit", "dance",
                                "celebrate", "stand", "attention"]);
    if (!PERSISTENT.has(name)) {
        const hold = HOLDS[name] ?? 4500;
        setEmotion._t = setTimeout(() => setEmotion("neutral"), hold);
    }
    // v854 — every non-fidget interaction resets the fidget cooldown so
    // the character doesn't immediately fidget after returning from a
    // user-triggered expression. Feels more natural this way.
    _fidget.lastInteractionMs = performance.now();
}

// ─── v854: Idle fidget controller ──────────────────────────────────
//
// Makes the rigged avatar feel super alive by periodically triggering
// brief expressive clips during idle. Without this, the avatar just
// sits in the Idle loop forever — readable but lifeless. With this,
// every 8-18 seconds the character does something small (wave, glance,
// thumbs-up, head shake, small jump) and returns to neutral. The
// HOLDS in setEmotion auto-return to neutral so we don't need
// explicit cleanup.
//
// Skips when:
//   - currentEmotion is not "neutral" (user/engine is driving an
//     expression; don't override)
//   - head is locked (during kpop:speak — character is mid-utterance)
//   - lastInteractionMs is very recent (user just sent a command;
//     don't fidget on top of it)
//   - _fidget.enabled is false (disabled via console API)
//
// Each fidget pick is weighted: friendly expressions ("wave",
// "thumbsup") more common than dramatic ones ("jump", "alert").
const _fidget = {
    enabled: true,
    lastInteractionMs: performance.now(),
    lastFidgetMs: 0,
    minIntervalMs: 8000,
    maxIntervalMs: 18000,
    minQuietMs: 4000,
    // Pool of (emotion, weight) — weighted random pick. Lighter
    // expressions dominate so the character feels casual, not manic.
    // Excludes anything in PERSISTENT (would stick), anything in
    // HOLDS (would tie up the rig for >4s), and anything "loud"
    // (alert/attack which read as engine reactions, not idle fidget).
    pool: [
        ["wave",      3],
        ["happy",     3],
        ["yes",       2],
        ["no",        2],
        ["play",      2],   // → Jump (one-shot)
        ["thumbsup",  3],   // alias for happy → ThumbsUp clip
        ["greet",     1],   // alias for wave
    ],
};

function _pickFidget() {
    const total = _fidget.pool.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * total;
    for (const [name, w] of _fidget.pool) {
        if ((r -= w) <= 0) return name;
    }
    return _fidget.pool[0][0];
}

function _fidgetTick() {
    if (!_fidget.enabled) {
        setTimeout(_fidgetTick, 1500);
        return;
    }
    const now = performance.now();
    const quietFor = now - _fidget.lastInteractionMs;
    const sinceLastFidget = now - _fidget.lastFidgetMs;
    // Only fidget if currently neutral, quiet long enough, no head-lock
    const canFidget = (
        currentEmotion === "neutral" &&
        quietFor >= _fidget.minQuietMs &&
        sinceLastFidget >= _fidget.minIntervalMs &&
        !_isHeadLocked(now)
    );
    if (canFidget) {
        const pick = _pickFidget();
        try {
            setEmotion(pick);
            _fidget.lastFidgetMs = now;
            // Reset lastInteractionMs back so this fidget doesn't
            // count as a user interaction (its own cooldown applies)
            _fidget.lastInteractionMs = now - _fidget.minQuietMs - 1;
        } catch (e) {
            // Silent — don't crash render loop on a bad clip name
        }
    }
    // Random next-tick delay in [minInterval, maxInterval]
    const wait = _fidget.minIntervalMs +
                 Math.random() * (_fidget.maxIntervalMs - _fidget.minIntervalMs);
    setTimeout(_fidgetTick, wait);
}

// Kick the fidget loop after a short delay so first load isn't
// interrupted by a fidget immediately
setTimeout(_fidgetTick, 5000);

// ─── v858: Lateral wandering controller ─────────────────────────
//
// Periodically (during quiet idle, every 30-90s) the rigged avatar
// takes a brief lateral walk excursion: moves to one side, pauses
// briefly, walks back to center. Driven by setEmotion("walk") so the
// Walking clip from EMOTION_TO_CLIP plays during the move. Honors
// fidget cooldown and skips when an emotion is already playing.
//
// The character offset is applied via uModelOffset in the vertex
// shader (after skinning, before viewProj), so the WHOLE character
// translates as a unit without bone manipulation. Range is bounded
// (±0.9 units) so the avatar stays in frame.
//
// Declared at module-level scope so the render() path can read
// _wander.x/y/z (synchronously evaluated before requestAnimationFrame
// schedules the first frame).

// ─── v862: Costume tint state ───────────────────────────────────
//
// _costume.tint is the RGB multiplier the fragment shader applies to
// the final color. Default (1,1,1) = no change. Updated on costume
// pick. The avatarCostumes module persists per-avatar selection in
// localStorage so each avatar remembers its own costume.
//
// _avatarIdentity is the unique key used to look up + persist the
// costume. Derived from ?glb= URL (paths) or ?asset= name (built-ins)
// or falls back to assetName for the default load.
const _avatarIdentity = (() => {
    try {
        const p = new URLSearchParams(location.search);
        return p.get("glb") || p.get("asset") || "RobotExpressive";
    } catch { return "RobotExpressive"; }
})();
const _costume = {
    key: "native",
    tint: [1.0, 1.0, 1.0],
    label: "Native (no tint)",
};
function _applyCostume(c) {
    if (!c) return;
    _costume.key   = c.key;
    _costume.tint  = (Array.isArray(c.tint) && c.tint.length === 3) ? c.tint : [1, 1, 1];
    _costume.label = c.label || c.key;
}
// Load initial costume from the store (waits for module to install
// window.avatarCostumes since it loads via <script type="module">).
(function _initCostume() {
    let tries = 0;
    const iv = setInterval(() => {
        tries++;
        const store = (typeof window !== "undefined") ? window.avatarCostumes : null;
        if (store && store.get) {
            clearInterval(iv);
            _applyCostume(store.get(_avatarIdentity));
            // Subscribe so cross-window costume changes (e.g. user picks
            // costume in universal-viewer's avatar gallery) propagate to
            // this iframe's render.
            store.onChange((change) => {
                if (change?.avatarUrl === _avatarIdentity) {
                    _applyCostume(store.get(_avatarIdentity));
                }
            });
        } else if (tries > 25) {
            clearInterval(iv);
        }
    }, 100);
})();
// Also listen for localStorage events so cross-tab costume changes sync
window.addEventListener("storage", (e) => {
    if (e.key === "voxelEngine.avatarCostumes" && window.avatarCostumes?._load) {
        window.avatarCostumes._load();
        try { _applyCostume(window.avatarCostumes.get(_avatarIdentity)); } catch {}
    }
});

// ─── v864: Phase 2 — Accessory meshes (hats / eyewear / cape) ────
//
// Procedural geometry (from accessoryGeometry.js) gets bone-attached
// via the existing skinning shader: each accessory vertex has joints
// = [boneIdx, 0, 0, 0] and weights = [1, 0, 0, 0], so the skin matrix
// becomes "1.0 × bone matrix" and the accessory rides that bone.
//
// _accessories holds {hat, eyewear, cape} where each value is either
// null (no accessory) or a built object: {vao, indexCount, boneIdx}.
// Built when the avatarAccessories store changes; drawn in render()
// after the main avatar.
//
// Bone lookup uses heuristic name matching since rig conventions
// vary. Head is found by "Head", "head", "skull", "HEAD"; spine is
// found by "Spine", "Chest", "Torso". If no bone matches the slots
// attach target, the accessory is skipped silently.
const _accessories = { hat: null, eyewear: null, cape: null, streamer: null };
const _accessoryEquip = { hat: "none", eyewear: "none", cape: "none", streamer: "none" };
const _accessoryBones = { head: -1, spine: -1, hip: -1 };

// Slot → attach-bone-kind mapping
const _SLOT_BONE = { hat: "head", eyewear: "head", cape: "spine", streamer: "spine" };

// v871 — central list of slot keys for iteration. Replaces hardcoded
// ["hat", "eyewear", "cape"] arrays scattered through the file.
const _SLOT_KEYS = ["hat", "eyewear", "cape", "streamer"];

// Heuristic bone-name patterns (lowercase substring match)
const _BONE_PATTERNS = {
    head:  ["head", "skull", "hed"],
    spine: ["spine_02", "spine_01", "spine2", "spine1", "chest", "spine", "torso", "upperback", "thorax"],
    // v867 — hip / pelvis patterns for the lower-body cape collider
    hip:   ["hips", "hip", "pelvis", "lowerback", "lowback", "root"],
};

// v867 — Cape collision spheres. Each entry: { boneIdx, radius,
// offsetLocal:[x,y,z], label } where boneIdx is the joint index in
// animator.skin.joints. offsetLocal is added in bone-local space
// before transforming to world. Radius scales with _avatarMetrics
// scaleRatio so spheres match the avatar's actual size.
//
// Default placement on a RobotExpressive-scale rig (1.8u tall):
//   - torso: spine bone, radius ~0.25, no offset (sphere covers chest
//     cross-section; cape blown forward by gale wind gets deflected
//     back to its rest position behind the spine)
//   - hip:   hip bone, radius ~0.20, no offset (catches cape vertices
//     that drape too far forward at hip level)
const _capeColliders = [];
const _capeCollisionEnabled = { value: true };

// v3780 -- dominant-joint histogram over the parsed verts, so the matcher can prefer a joint that ACTUALLY
// CARRIES GEOMETRY. Cheap, computed on demand from _parsedRef.
function _dominantJointCount(jointCount) {
    const counts = new Int32Array(jointCount);
    const P = _parsedRef && _parsedRef.positions, J = _parsedRef && _parsedRef.joints, W = _parsedRef && _parsedRef.weights;
    if (!P || !J || !W) return counts;
    const n = (P.length / 3) | 0;
    for (let i = 0; i < n; i++) {
        const o = i * 4;
        let domJ = J[o], domW = W[o];
        if (W[o+1] > domW) { domW = W[o+1]; domJ = J[o+1]; }
        if (W[o+2] > domW) { domW = W[o+2]; domJ = J[o+2]; }
        if (W[o+3] > domW) { domW = W[o+3]; domJ = J[o+3]; }
        if (domJ >= 0 && domJ < counts.length) counts[domJ]++;
    }
    return counts;
}

function _findBoneByPatterns(animator, patterns, preferWithVerts) {
    if (!animator || !animator.nodes || !animator.skin) return -1;
    const joints = animator.skin.joints;   // node indices that are joints
    // v3780 -- when preferWithVerts, prefer a name-match that has skinned vertices. RobotExpressive names TWO
    // nodes "Head": the head BONE (a joint with no verts of its own) and the head MESH (a synthetic joint the
    // parser mints for the rigid-parented head). The bone matched first, so _measureHead scanned for verts on
    // an empty joint and the head read "bone not found". Anchoring to the vert-bearing joint fixes the readout
    // AND rides accessories on the head the user can see. Scoped to the head so cape/spine attachment is left
    // exactly as it was.
    const counts = preferWithVerts ? _dominantJointCount(joints.length) : null;
    let firstMatch = -1;
    for (const pattern of patterns) {
        for (let j = 0; j < joints.length; j++) {
            const name = (animator.nodes[joints[j]]?.name || "").toLowerCase();
            if (!name.includes(pattern)) continue;
            if (firstMatch < 0) firstMatch = j;     // remember the first name match as the fallback
            if (!preferWithVerts) return j;         // legacy behavior (spine/hip): first name match wins
            if (counts[j] > 0) return j;            // head: first name match that carries geometry
        }
    }
    return firstMatch;   // no vert-bearing match anywhere -> first name match (pure-bone rigs unchanged)
}

function _resolveAccessoryBones() {
    if (!animator) return;
    _accessoryBones.head  = _findBoneByPatterns(animator, _BONE_PATTERNS.head, true);   // v3780 -- prefer the head joint that carries geometry
    _accessoryBones.spine = _findBoneByPatterns(animator, _BONE_PATTERNS.spine);
    // v867 — also resolve hip bone for cape collision
    _accessoryBones.hip   = _findBoneByPatterns(animator, _BONE_PATTERNS.hip);
    console.log(`[accessories] bones resolved → head=${_accessoryBones.head}, spine=${_accessoryBones.spine}, hip=${_accessoryBones.hip}`);
    // v867 — build cape collider spheres now that bones are known
    _resolveCapeColliders();
}

// v867 — Build the cape collision sphere list. Called after bone
// resolution. Each collider is a sphere at a bone's world position
// (transformed each frame in _capeSimStep). Radius scales with the
// avatar's bounding-box ratio so larger avatars get larger colliders.
function _resolveCapeColliders() {
    _capeColliders.length = 0;
    const scale = _avatarMetrics.scaleRatio || 1.0;
    // Torso (spine) sphere
    if (_accessoryBones.spine >= 0) {
        _capeColliders.push({
            boneIdx:     _accessoryBones.spine,
            offsetLocal: [0, 0, 0],
            radius:      0.25 * scale,
            label:       "torso",
        });
    }
    // Hip sphere
    if (_accessoryBones.hip >= 0) {
        _capeColliders.push({
            boneIdx:     _accessoryBones.hip,
            offsetLocal: [0, 0, 0],
            radius:      0.20 * scale,
            label:       "hip",
        });
    }
    console.log(`[accessories] cape colliders → ${_capeColliders.length} (${_capeColliders.map(c=>c.label+":r="+c.radius.toFixed(2)).join(", ")})`);
}

// Build a VAO for an accessory variant. Returns null if the variant
// is "none" or the slot's attach bone wasn't found.
function _buildAccessory(slotKey, variantKey) {
    if (!variantKey || variantKey === "none") return null;
    const slotBone = _SLOT_BONE[slotKey];
    const boneIdx  = _accessoryBones[slotBone];
    if (boneIdx < 0) {
        console.warn(`[accessories] ${slotKey}/${variantKey} skipped — no ${slotBone} bone found`);
        return null;
    }
    const factory = ACCESSORY_CATALOG[slotKey]?.[variantKey];
    if (typeof factory !== "function") return null;
    const geom = factory();
    if (!geom || !geom.positions) return null;

    // v866 — apply per-slot color override if user has picked a custom
    // color via the picker. The geometry generator emits hardcoded
    // base colors (black tophat, gold crown, crimson cape); if user
    // has picked, say, "blue" for the hat slot, we overwrite every
    // vertex's color attribute with that color before VAO upload.
    try {
        const store = window.avatarAccessories;
        if (store && store.getColor) {
            const colorKey = store.getColor(_avatarIdentity, slotKey);
            if (colorKey && colorKey !== "default") {
                const colors = window.ACCESSORY_COLORS || [];
                const cdef = colors.find(c => c.key === colorKey);
                if (cdef && Array.isArray(cdef.rgb) && cdef.rgb.length === 3) {
                    const [r, g, b] = cdef.rgb;
                    for (let i = 0; i < geom.colors.length; i += 3) {
                        geom.colors[i + 0] = r;
                        geom.colors[i + 1] = g;
                        geom.colors[i + 2] = b;
                    }
                }
            }
        }
    } catch {}

    // v865 — auto-scale geometry to the loaded avatar's proportions.
    // Reference: RobotExpressive ~1.8u tall; scaleRatio = h / 1.8.
    // Multiply ALL positions (and offsets) by the ratio so a 3.6u-tall
    // avatar gets accessories 2x larger; a 0.9u-tall avatar gets them
    // half-sized. Without this, custom rigs see hats floating or
    // sunken depending on their height.
    const scale = _avatarMetrics.scaleRatio || 1.0;
    if (scale !== 1.0) {
        for (let i = 0; i < geom.positions.length; i++) {
            geom.positions[i] *= scale;
        }
    }

    // Override joint slot 0 in EVERY vertex to point at boneIdx.
    // The geometry generator emits zeros for joints; we set slot 0 here.
    const vertCount = geom.positions.length / 3;
    for (let i = 0; i < vertCount; i++) {
        geom.joints[i * 4 + 0] = boneIdx;
        // joints[i*4+1..3] stay 0; weights[i*4+1..3] stay 0; so the
        // skin sum is weights[0] × jointMatrix[boneIdx] = bone transform
    }

    // Upload to VAO using the same attribute layout as the main mesh.
    // (locations 0-5: pos, normal, joints, weights, color, uv)
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    // v865 — cape uses DYNAMIC_DRAW because its positions update every
    // frame via cloth sim. Other accessories stay STATIC_DRAW.
    const usage = geom.cloth ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW;
    gl.bufferData(gl.ARRAY_BUFFER, geom.positions, usage);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    const nrmBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nrmBuf);
    // v868 — cape normals also DYNAMIC_DRAW (updated each frame from
    // current world-space triangle face normals so lighting tracks the
    // deformed cloth surface). Other accessories keep STATIC_DRAW.
    gl.bufferData(gl.ARRAY_BUFFER, geom.normals, usage);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

    const jntBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, jntBuf);
    gl.bufferData(gl.ARRAY_BUFFER, geom.joints, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribIPointer(2, 4, gl.UNSIGNED_BYTE, 0, 0);

    const wgtBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, wgtBuf);
    gl.bufferData(gl.ARRAY_BUFFER, geom.weights, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 0, 0);

    const colBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, geom.colors, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 3, gl.FLOAT, false, 0, 0);

    const uvBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, geom.uvs, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 2, gl.FLOAT, false, 0, 0);

    const idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geom.indices, gl.STATIC_DRAW);

    gl.bindVertexArray(null);

    // v865 — initialize cloth-sim state if this accessory is the cape.
    // Positions captured in BIND-POSE LOCAL space (the values geom
    // provides, post-scale). We'll convert to world space each frame
    // by multiplying with the bone matrix; the WORLD space positions
    // get pinned/relaxed; render uploads world-space back to the GPU
    // with uHasSkin=0 so the shader treats them as final positions.
    let cloth = null;
    if (geom.cloth) {
        const vCount = geom.positions.length / 3;
        // v870 — build distance constraints via the shared helper,
        // then instantiate a ClothSimulator. The simulator owns
        // worldPos/prevWorldPos/normals; we keep bindLocal + a copy of
        // pinnedIndices on the `cloth` object so the per-frame anchor
        // computation (which transforms bind-local through the bone
        // matrix) has what it needs.
        const edges = buildGridEdges(geom.positions, geom.cloth.rows, geom.cloth.cols);
        const sim = new ClothSimulator({
            positions:     geom.positions,
            indices:       geom.indices,
            pinnedIndices: geom.cloth.pinnedIndices,
            edges,
            gravity: -2.4,
            damping: 0.92,
            iters:   6,
            dtFixed: 1/60,
        });
        cloth = {
            ...geom.cloth,
            vertCount:     vCount,
            bindLocal:     new Float32Array(geom.positions),  // for pin-anchor recomputation
            indices:       new Uint32Array(geom.indices),     // kept for any external use; sim has its own copy
            pinnedIndices: geom.cloth.pinnedIndices.slice(),
            sim,                                              // <-- the actual simulator
            initialized:   false,                             // tracks whether sim.initialize() was called
        };
    }

    return {
        vao,
        indexCount: geom.indices.length,
        boneIdx,
        slotKey, variantKey,
        // v865 — cloth sim state (null for non-cape accessories)
        cloth,
        // Position buffer kept for cloth sim's per-frame bufferSubData
        posBuf,
        // v868 — Normal buffer kept for cape's per-frame normal recompute
        nrmBuf,
        // Buffer handles for cleanup
        _buffers: [posBuf, nrmBuf, jntBuf, wgtBuf, colBuf, uvBuf, idxBuf],
    };
}

function _destroyAccessory(acc) {
    if (!acc) return;
    try {
        if (acc.vao) gl.deleteVertexArray(acc.vao);
        for (const b of (acc._buffers || [])) gl.deleteBuffer(b);
    } catch {}
}

function _refreshAccessories() {
    if (!animator || _accessoryBones.head < 0 && _accessoryBones.spine < 0) {
        _resolveAccessoryBones();
    }
    const store = window.avatarAccessories;
    if (!store || !store.get) return;
    const equip = store.get(_avatarIdentity);
    for (const slot of _SLOT_KEYS) {
        const want = equip[slot] || "none";
        // v866 — also track the color choice so a color change triggers
        // rebuild. Format the tracking key as "variant|color" so both
        // changes invalidate.
        const wantColor = store.getColor ? store.getColor(_avatarIdentity, slot) : "default";
        const wantTag = want + "|" + wantColor;
        if (_accessoryEquip[slot] === wantTag && _accessories[slot]) continue;   // no change
        if (_accessoryEquip[slot] === wantTag && want === "none")    continue;   // both none
        // Tear down current
        _destroyAccessory(_accessories[slot]);
        _accessories[slot] = null;
        // Build new (or leave null for "none")
        if (want !== "none") {
            _accessories[slot] = _buildAccessory(slot, want);
        }
        _accessoryEquip[slot] = wantTag;
    }
}

// ─── v865: Cloth simulation for the cape ────────────────────────
//
// World-space verlet integration with distance constraints. Runs
// every frame when cape is equipped. Top row pins to the spine
// bone's current world position (so the cape stays attached as the
// avatar walks/dances); rest falls under gravity and constraints
// keep the fabric from stretching unboundedly.
//
// Algorithm per frame:
//   1. Compute world-space anchor positions for pinned (top-row)
//      vertices by transforming bind-pose local positions through
//      the current spine bone matrix from animator.jointMatrices.
//   2. Apply verlet step to non-pinned vertices:
//      newPos = pos + (pos - prevPos) * damping + accel * dt²
//      Acceleration = gravity in world space (-Y).
//   3. Hard-pin top row to step 1 anchors (overwrites verlet output).
//   4. Constraint-relax for ITER passes: for each edge, push the two
//      endpoints to maintain rest length (push only non-pinned ends).
//   5. Re-pin top row (constraint relaxation may have moved them).
//   6. Upload world positions to GPU buffer (bufferSubData).
const _CLOTH_DT_FIXED = 1 / 60;      // fixed timestep for stability (used elsewhere if needed)

// v870 — sim constants now live inside ClothSimulator (default values
// passed at construction). Kept _CLOTH_DT_FIXED for any code referring
// to it; the other constants are no longer used here.

// v866 — wind force applied to non-pinned cape verts during sim step.
// Base vector is constant + small sine-wave variation for ambient flutter.
// User can adjust via window.kpopWind.* console API.
const _wind = {
    enabled: true,
    strength: 0.6,                   // multiplier on base + sine
    baseX: 0.20,                     // gentle sideways breeze
    baseY: 0.0,
    baseZ: -0.30,                    // slight back-push (flares cape behind)
    sineAmpX: 0.15,                  // ambient oscillation amplitude
    sineAmpZ: 0.20,
    sineFreq: 0.7,                   // Hz
};

// Console API for tuning live
try {
    window.kpopWind = {
        enable:    () => { _wind.enabled = true;  return true; },
        disable:   () => { _wind.enabled = false; return false; },
        setStrength: (s) => { _wind.strength = Math.max(0, Math.min(5, +s || 0)); return _wind.strength; },
        snapshot:  () => ({ ...(_wind) }),
        // Preset modes
        off:    () => { _wind.enabled = false; },
        gentle: () => { _wind.enabled = true; _wind.strength = 0.6; },
        strong: () => { _wind.enabled = true; _wind.strength = 1.8; },
        gale:   () => { _wind.enabled = true; _wind.strength = 3.5; },
    };
    // v866 — apply persisted wind preset from universal-viewer panel
    try {
        const preset = localStorage.getItem("voxelEngine.windPreset");
        if (preset && typeof window.kpopWind[preset] === "function") {
            window.kpopWind[preset]();
        }
    } catch {}
    // Cross-tab sync of wind preset
    window.addEventListener("storage", (e) => {
        if (e.key === "voxelEngine.windPreset" && e.newValue) {
            try {
                if (typeof window.kpopWind[e.newValue] === "function") {
                    window.kpopWind[e.newValue]();
                }
            } catch {}
        }
    });
} catch {}

// v867 — Cape collision tuning API. Spheres are auto-built at bone
// resolve time with default radii scaled to the avatar's bounding box;
// these methods let users tune live or disable for debugging.
try {
    window.kpopCapeCollision = {
        enable:  () => { _capeCollisionEnabled.value = true;  return true; },
        disable: () => { _capeCollisionEnabled.value = false; return false; },
        isEnabled: () => _capeCollisionEnabled.value,
        list: () => _capeColliders.map(c => ({
            label:  c.label,
            boneIdx: c.boneIdx,
            radius: c.radius,
            offsetLocal: c.offsetLocal.slice(),
        })),
        setRadius: (label, r) => {
            const c = _capeColliders.find(x => x.label === label);
            if (!c) return { ok: false, error: `no collider "${label}"` };
            c.radius = Math.max(0.01, Math.min(2.0, +r || 0));
            return { ok: true, label, radius: c.radius };
        },
        setOffset: (label, x, y, z) => {
            const c = _capeColliders.find(x => x.label === label);
            if (!c) return { ok: false, error: `no collider "${label}"` };
            c.offsetLocal = [+x || 0, +y || 0, +z || 0];
            return { ok: true, label, offset: c.offsetLocal };
        },
        snapshot: () => ({
            enabled: _capeCollisionEnabled.value,
            count: _capeColliders.length,
            colliders: _capeColliders.map(c => ({ ...c, offsetLocal: c.offsetLocal.slice() })),
            scaleRatio: _avatarMetrics.scaleRatio,
        }),
    };
} catch {}

// Multiply a column-major 4x4 by a vec3 (point — w=1)
function _mat4MulPoint(m, x, y, z, out) {
    out[0] = m[0]*x + m[4]*y + m[8]*z  + m[12];
    out[1] = m[1]*x + m[5]*y + m[9]*z  + m[13];
    out[2] = m[2]*x + m[6]*y + m[10]*z + m[14];
}

function _capeSimStep(slotKey = "cape") {
    const acc = _accessories[slotKey];
    if (!acc || !acc.cloth || !animator) return;
    const cloth = acc.cloth;
    const sim = cloth.sim;
    if (!sim) return;
    const jointMatrices = animator.jointMatrices;
    const boneIdx = acc.boneIdx;
    if (boneIdx < 0) return;
    const mOff = boneIdx * 16;
    const m = jointMatrices.subarray(mOff, mOff + 16);

    // v870 — First-frame initialization: transform every bind-local
    // position through the current bone matrix to get initial world
    // positions, then hand them to the simulator. Zero initial velocity.
    if (!cloth.initialized) {
        const initialWorld = new Float32Array(cloth.bindLocal.length);
        for (let i = 0; i < cloth.vertCount; i++) {
            const i3 = i * 3;
            transformPoint(m, cloth.bindLocal[i3], cloth.bindLocal[i3 + 1], cloth.bindLocal[i3 + 2], initialWorld, i3);
        }
        sim.initialize(initialWorld);
        cloth.initialized = true;
    }

    // v870 — Per-frame pin anchors: top row (or 4 corners for carpet)
    // tracked to the bone's current world position. Caller-side
    // computation since the simulator is bone-agnostic.
    const pinAnchors = new Float32Array(cloth.pinnedIndices.length * 3);
    for (let k = 0; k < cloth.pinnedIndices.length; k++) {
        const i = cloth.pinnedIndices[k];
        const i3 = i * 3;
        transformPoint(m, cloth.bindLocal[i3], cloth.bindLocal[i3 + 1], cloth.bindLocal[i3 + 2], pinAnchors, k * 3);
    }

    // v870 — Wind state passed in each frame (matches v866 _wind object shape).
    sim.setWind(_wind);

    // v870 — Collider world centers computed from current bone matrices,
    // then passed to simulator as already-world-space spheres.
    if (_capeCollisionEnabled.value && _capeColliders.length > 0) {
        const worldColliders = new Array(_capeColliders.length);
        for (let ci = 0; ci < _capeColliders.length; ci++) {
            const c = _capeColliders[ci];
            const bm = jointMatrices.subarray(c.boneIdx * 16, c.boneIdx * 16 + 16);
            const ox = c.offsetLocal[0], oy = c.offsetLocal[1], oz = c.offsetLocal[2];
            worldColliders[ci] = {
                cx: bm[0]*ox + bm[4]*oy + bm[8]*oz  + bm[12],
                cy: bm[1]*ox + bm[5]*oy + bm[9]*oz  + bm[13],
                cz: bm[2]*ox + bm[6]*oy + bm[10]*oz + bm[14],
                radius: c.radius,
            };
        }
        sim.setColliders(worldColliders);
        sim.setCollisionEnabled(true);
    } else {
        sim.setColliders([]);
        sim.setCollisionEnabled(false);
    }

    // v870 — Run one sim step. Algorithm identical to the v865-v868
    // inline version; it's just behind the class boundary now.
    sim.step(pinAnchors);

    // Upload to GPU
    gl.bindBuffer(gl.ARRAY_BUFFER, acc.posBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, sim.worldPos);
    gl.bindBuffer(gl.ARRAY_BUFFER, acc.nrmBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, sim.normals);
}

// Hook into the load completion path: after animator is ready, resolve
// bones + refresh equipment. Polling watches both for the animator
// becoming available AND for the accessory store loading.
(function _initAccessories() {
    let tries = 0;
    const iv = setInterval(() => {
        tries++;
        if (animator && window.avatarAccessories) {
            clearInterval(iv);
            _resolveAccessoryBones();
            _refreshAccessories();
            // Subscribe so picker changes rebuild geometry
            window.avatarAccessories.onChange((change) => {
                if (change?.avatarUrl === _avatarIdentity) {
                    _refreshAccessories();
                }
            });
            // Cross-tab sync via storage event
            window.addEventListener("storage", (e) => {
                if (e.key === "voxelEngine.avatarAccessories" && window.avatarAccessories?._load) {
                    window.avatarAccessories._load();
                    _refreshAccessories();
                }
            });
        } else if (tries > 80) {     // 8 seconds, generous for slow glb loads
            clearInterval(iv);
        }
    }, 100);
})();

const _wander = {
    x: 0, y: 0, z: 0,
    active: false,
    phase: "idle",                  // "idle" | "out" | "in"
    phaseStartedAt: 0,
    phaseDurationMs: 0,
    fromX: 0,
    targetX: 0,
    enabled: true,
    minIntervalMs: 30000,
    maxIntervalMs: 90000,
    minQuietMs: 8000,
    excursionMaxX: 0.9,             // ±0.9 units lateral max
    lastExcursionAt: 0,
};

function _wanderTick() {
    const now = performance.now();
    // ── Advance active excursion ─────────────────────────────────
    if (_wander.active) {
        const elapsed = now - _wander.phaseStartedAt;
        if (elapsed >= 0) {           // negative when in pause period
            const t = Math.max(0, Math.min(1, elapsed / _wander.phaseDurationMs));
            // Ease-in-out (cubic)
            const eased = t < 0.5
                ? 4 * t * t * t
                : 1 - Math.pow(-2 * t + 2, 3) / 2;
            _wander.x = _wander.fromX + (_wander.targetX - _wander.fromX) * eased;

            if (t >= 1) {
                if (_wander.phase === "out") {
                    // Reached far side — pause briefly, then walk back
                    _wander.phase = "in";
                    _wander.phaseStartedAt = now + 500;   // 0.5s pause at peek
                    _wander.phaseDurationMs = 3500;
                    _wander.fromX = _wander.targetX;
                    _wander.targetX = 0;
                } else {
                    // Returned to center — done
                    _wander.x = 0;
                    _wander.active = false;
                    _wander.phase = "idle";
                    _wander.lastExcursionAt = now;
                    // Release back to neutral if still in walk emotion
                    if (currentEmotion === "walk" || currentEmotion === "speak") {
                        setEmotion("neutral");
                    }
                }
            }
        }
    }

    // ── Maybe start a new excursion ──────────────────────────────
    if (_wander.enabled && !_wander.active) {
        const quietFor = now - _fidget.lastInteractionMs;
        const sinceLastExcursion = now - _wander.lastExcursionAt;
        const canWander = (
            currentEmotion === "neutral" &&
            quietFor >= _wander.minQuietMs &&
            sinceLastExcursion >= _wander.minIntervalMs &&
            !_isHeadLocked(now)
        );
        if (canWander) {
            // Random chance per check (~30%) so excursions don't fire
            // on a clockwork schedule. Combined with minIntervalMs this
            // gives 30-90s typical gap (skew toward longer).
            if (Math.random() < 0.3) {
                const direction = Math.random() < 0.5 ? -1 : 1;
                const range = (0.5 + Math.random() * 0.5) * _wander.excursionMaxX;
                _wander.targetX = direction * range;
                _wander.fromX = 0;
                _wander.phase = "out";
                _wander.phaseStartedAt = now;
                _wander.phaseDurationMs = 3500 + Math.random() * 1500;
                _wander.active = true;
                try { setEmotion("walk"); } catch {}
            }
        }
    }

    // Tick rate: 60Hz when active (smooth motion), 1Hz when idle
    setTimeout(_wanderTick, _wander.active ? 16 : 1000);
}

// Kick wander loop after 15s so first load + first fidget run before
// the avatar tries to wander
setTimeout(_wanderTick, 15000);

// Console API for wander
try {
    window.kpopWander = {
        enable: () => { _wander.enabled = true; return true; },
        disable: () => {
            _wander.enabled = false;
            // Snap back to center on disable so we don't leave the
            // character stranded off-axis
            if (_wander.active) {
                _wander.x = 0;
                _wander.active = false;
                _wander.phase = "idle";
                if (currentEmotion === "walk") setEmotion("neutral");
            }
            return false;
        },
        setEnabled: (v) => { _wander.enabled = !!v; return _wander.enabled; },
        isEnabled: () => _wander.enabled,
        trigger: (direction) => {
            if (_wander.active) return { ok: false, reason: "already walking" };
            if (currentEmotion !== "neutral") return { ok: false, reason: "not neutral (currentEmotion=" + currentEmotion + ")" };
            const dir = (typeof direction === "number" && direction !== 0)
                ? (direction > 0 ? 1 : -1)
                : (Math.random() < 0.5 ? -1 : 1);
            _wander.targetX = dir * _wander.excursionMaxX * 0.8;
            _wander.fromX = 0;
            _wander.phase = "out";
            _wander.phaseStartedAt = performance.now();
            _wander.phaseDurationMs = 3500;
            _wander.active = true;
            try { setEmotion("walk"); } catch {}
            return { ok: true, target: _wander.targetX };
        },
        snapshot: () => ({
            enabled: _wander.enabled,
            active: _wander.active,
            phase: _wander.phase,
            x: _wander.x,
            targetX: _wander.targetX,
            sinceLastExcursionMs: Math.round(performance.now() - _wander.lastExcursionAt),
        }),
        setRange: (max) => {
            _wander.excursionMaxX = Math.max(0.1, Math.min(2.0, +max || 0.9));
            return _wander.excursionMaxX;
        },
    };
} catch {}

// Console + parent-window API. window.kpopFidget for direct console
// use; also postMessage support so the parent (PipAvatar etc) can
// toggle without reaching into the iframe.
try {
    window.kpopFidget = {
        enable:  () => { _fidget.enabled = true;  return true; },
        disable: () => { _fidget.enabled = false; return false; },
        setEnabled: (v) => { _fidget.enabled = !!v; return _fidget.enabled; },
        isEnabled: () => _fidget.enabled,
        setInterval: (minMs, maxMs) => {
            _fidget.minIntervalMs = Math.max(2000, Math.min(60000, +minMs || 8000));
            _fidget.maxIntervalMs = Math.max(_fidget.minIntervalMs + 1000, Math.min(120000, +maxMs || 18000));
            return { min: _fidget.minIntervalMs, max: _fidget.maxIntervalMs };
        },
        trigger: () => {
            // Force a fidget right now (skip cooldown checks). Useful
            // for testing the pool / verifying clips exist.
            if (currentEmotion !== "neutral") return { ok: false, reason: "not neutral (currentEmotion=" + currentEmotion + ")" };
            const pick = _pickFidget();
            setEmotion(pick);
            _fidget.lastFidgetMs = performance.now();
            return { ok: true, picked: pick };
        },
        snapshot: () => ({
            enabled: _fidget.enabled,
            currentEmotion,
            quietForMs:   Math.round(performance.now() - _fidget.lastInteractionMs),
            sinceLastFidgetMs: Math.round(performance.now() - _fidget.lastFidgetMs),
            poolSize: _fidget.pool.length,
        }),
    };
} catch {}

// ---- Camera matrix builders --------------------------------------------
// Column-major 4x4. Right-handed coordinate system, Y up, looking down -Z.

function mat4Perspective(fovy, aspect, near, far) {
    const f = 1.0 / Math.tan(fovy / 2);
    const nf = 1.0 / (near - far);
    const out = new Float32Array(16);
    out[0]  = f / aspect;
    out[5]  = f;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[14] = (2 * far * near) * nf;
    return out;
}

function mat4LookAt(eye, target, up) {
    const zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    let zlen = Math.hypot(zx, zy, zz) || 1;
    const fz = [zx / zlen, zy / zlen, zz / zlen];
    // right = up × forward
    const rx = up[1] * fz[2] - up[2] * fz[1];
    const ry = up[2] * fz[0] - up[0] * fz[2];
    const rz = up[0] * fz[1] - up[1] * fz[0];
    let rlen = Math.hypot(rx, ry, rz) || 1;
    const r = [rx / rlen, ry / rlen, rz / rlen];
    // up' = forward × right
    const ux = fz[1] * r[2] - fz[2] * r[1];
    const uy = fz[2] * r[0] - fz[0] * r[2];
    const uz = fz[0] * r[1] - fz[1] * r[0];
    const u = [ux, uy, uz];
    const out = new Float32Array(16);
    out[0] = r[0];  out[1] = u[0];  out[2]  = fz[0]; out[3]  = 0;
    out[4] = r[1];  out[5] = u[1];  out[6]  = fz[1]; out[7]  = 0;
    out[8] = r[2];  out[9] = u[2];  out[10] = fz[2]; out[11] = 0;
    out[12] = -(r[0]*eye[0] + r[1]*eye[1] + r[2]*eye[2]);
    out[13] = -(u[0]*eye[0] + u[1]*eye[1] + u[2]*eye[2]);
    out[14] = -(fz[0]*eye[0] + fz[1]*eye[1] + fz[2]*eye[2]);
    out[15] = 1;
    return out;
}

function mat4Multiply(a, b) {
    const out = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            out[j * 4 + i] =
                a[0 * 4 + i] * b[j * 4 + 0] +
                a[1 * 4 + i] * b[j * 4 + 1] +
                a[2 * 4 + i] * b[j * 4 + 2] +
                a[3 * 4 + i] * b[j * 4 + 3];
        }
    }
    return out;
}

let cameraAngle = 0;
// Round 266b — gaze override. Look-at target shifts up on face-mode
// zoom (frame just the head) and back to body for full expression
// visibility. Set by kpop:zoom message {mode:"face"|"body"}.
let _gazeOverride = null;
// Round 274 — head-lock. While the robot is speaking, the head should
// be steady (so the floating SVG mouth sits on the face cleanly). Set
// by kpop:headLock message; suppresses gaze override + ambient yaw
// drift until the lock expires.
// v715 — extended to also re-pin head + torso + root LOCAL TRS to bind
// pose each frame via the animator's onPose hook, so no nodding /
// shaking / body sway leaks through the active clip during speech.
let _headLockUntilMs = 0;
let _headNodeIdx  = -1;
let _torsoNodeIdx = -1;
let _rootNodeIdx  = -1;
function _findSpeechLockBones(nodes) {
    // Prefer name matches so future rigs with different layouts still work
    _headNodeIdx  = nodes.findIndex(n => /head/i.test(n.name || ""));
    _torsoNodeIdx = nodes.findIndex(n => /torso|spine|chest|body/i.test(n.name || ""));
    _rootNodeIdx  = nodes.findIndex(n => /^root$|hips|pelvis/i.test(n.name || ""));
    // Fallback to v660 stub indices (root=0, torso=1, head=2)
    if (_headNodeIdx  < 0 && nodes.length > 2) _headNodeIdx  = 2;
    if (_torsoNodeIdx < 0 && nodes.length > 1) _torsoNodeIdx = 1;
    if (_rootNodeIdx  < 0 && nodes.length > 0) _rootNodeIdx  = 0;
}
function _applySpeechLock(animator) {
    if (!_isHeadLocked(performance.now())) return;
    // Reset head + torso + root local TRS to their bind values, defeating
    // any clip channel that targets these bones for the lock duration.
    // Arms and legs/skirt are untouched — they can still wave, swing,
    // dance — only the upper-body chain that affects the head's screen
    // position is frozen.
    const idxs = [_rootNodeIdx, _torsoNodeIdx, _headNodeIdx];
    for (const idx of idxs) {
        if (idx < 0 || idx >= animator.nodes.length) continue;
        const node = animator.nodes[idx];
        const lt = animator.localT[idx], lr = animator.localR[idx], ls = animator.localS[idx];
        if (node.translation) { lt[0]=node.translation[0]; lt[1]=node.translation[1]; lt[2]=node.translation[2]; }
        if (node.rotation)    { lr[0]=node.rotation[0]; lr[1]=node.rotation[1]; lr[2]=node.rotation[2]; lr[3]=node.rotation[3]; }
        if (node.scale)       { ls[0]=node.scale[0]; ls[1]=node.scale[1]; ls[2]=node.scale[2]; }
    }
}
function _isHeadLocked(nowMs) { return nowMs < _headLockUntilMs; }
function _currentGazeAngle(nowMs) {
    if (_isHeadLocked(nowMs)) return 0;      // freeze yaw while speaking
    if (!_gazeOverride) return 0;
    const g = _gazeOverride;
    if (nowMs >= g.endMs) { _gazeOverride = null; return 0; }
    const total = g.endMs - g.startMs;
    const t = (nowMs - g.startMs) / total;
    const EASE_IN  = Math.min(0.25, 250 / total);
    const EASE_OUT = Math.min(0.35, 350 / total);
    let alpha;
    if (t < EASE_IN)              alpha = t / EASE_IN;
    else if (t > 1 - EASE_OUT)    alpha = (1 - t) / EASE_OUT;
    else                          alpha = 1;
    alpha = Math.max(0, Math.min(1, alpha));
    return g.targetYaw * alpha;
}
// Round 263c — zoom-on-speak. PipAvatar posts {type:"kpop:zoom",
// durationMs, scale, mode}; we ease the camera radius from BASE_RADIUS
// down to BASE_RADIUS * scale over the duration, then back. lookAt
// target stays put for "body" mode — only the distance changes, so
// the framing tightens around the existing center. Round 267 — "face"
// mode also raises the lookAt target to the head (y≈1.7) so the
// closer crop frames the face rather than the chest.
//
// v636 — `?cameraRadius=N` URL param overrides BASE_RADIUS at startup
// so the embedder (e.g. the phone's Listener panel iframe with a wide-
// short aspect) can pull the camera back to keep the whole robot in
// frame, since iframe canvas aspect ratios crop the head off otherwise.
// v709 — `?cameraY=N` URL param shifts the lookAt target vertically.
// Positive Y looks higher, negative Y looks lower. The phone iframe
// passes cameraY=-0.4 so the model sits higher in frame (head near top,
// feet near bottom) — user request.
// v727 — auto-fit: when ?cameraRadius is NOT provided, compute the radius
// after the GLB loads so the model fills the frame nicely (head near top,
// feet near bottom, ~15% margin all around). When ?cameraRadius IS
// provided, the URL value wins (existing behavior — embedder can override).
const _baseRadiusParam = parseFloat(new URLSearchParams(location.search).get("cameraRadius"));
const _userSetRadius   = Number.isFinite(_baseRadiusParam) && _baseRadiusParam > 0;
let BASE_RADIUS  = _userSetRadius
    ? Math.min(20, Math.max(2.5, _baseRadiusParam))
    : 5.0;   // placeholder; overwritten in loadRobot() once GLB bbox is known
const _cameraYParam = parseFloat(new URLSearchParams(location.search).get("cameraY"));
const _userSetCameraY = Number.isFinite(_cameraYParam);
const CAMERA_Y_OFFSET = _userSetCameraY ? Math.max(-2, Math.min(2, _cameraYParam)) : 0;
let BODY_LOOK_Y  = 1.3 + CAMERA_Y_OFFSET;
let FACE_LOOK_Y  = 2.55 + CAMERA_Y_OFFSET;     // Round 274 — was 1.75 which was chest-level.
                                  // RobotExpressive head joint sits ~2.5u above
                                  // origin; the previous value framed the upper
                                  // chest instead of the face. 2.55 puts the head
                                  // centered in the viewport.
let _radiusOverride = null;        // {endMs, fromRadius, toRadius, mode}
function _currentRadius(nowMs) {
    if (!_radiusOverride) return BASE_RADIUS;
    const o = _radiusOverride;
    if (nowMs >= o.endMs) { _radiusOverride = null; return BASE_RADIUS; }
    const total = o.endMs - o.startMs;
    const t = (nowMs - o.startMs) / total;
    const SNAP = Math.min(0.18, 200 / total);
    const EASE = Math.min(0.30, 300 / total);
    let alpha;
    if (t < SNAP)             alpha = t / SNAP;
    else if (t > 1 - EASE)    alpha = (1 - t) / EASE;
    else                      alpha = 1;
    alpha = Math.max(0, Math.min(1, alpha));
    return o.fromRadius + (o.toRadius - o.fromRadius) * alpha;
}
// Round 267 — current lookAt Y, blends BODY_LOOK_Y → FACE_LOOK_Y on
// face-mode zooms. Same easing curve as _currentRadius so the camera
// pull-in and the look-at lift happen together.
function _currentLookY(nowMs) {
    if (!_radiusOverride || _radiusOverride.mode !== "face") return BODY_LOOK_Y;
    const o = _radiusOverride;
    if (nowMs >= o.endMs) return BODY_LOOK_Y;
    const total = o.endMs - o.startMs;
    const t = (nowMs - o.startMs) / total;
    const SNAP = Math.min(0.18, 200 / total);
    const EASE = Math.min(0.30, 300 / total);
    let alpha;
    if (t < SNAP)             alpha = t / SNAP;
    else if (t > 1 - EASE)    alpha = (1 - t) / EASE;
    else                      alpha = 1;
    alpha = Math.max(0, Math.min(1, alpha));
    return BODY_LOOK_Y + (FACE_LOOK_Y - BODY_LOOK_Y) * alpha;
}
// v765 — smoothed root-joint follow target. Avatars with root motion
// (CesiumMan's walking clip translates the root joint through space)
// otherwise march out of frame because the camera looked at a fixed
// origin.
//
// *** v4033 -- "STAYS NEAR (0,0,0)" WAS NEVER MEASURED. *** RobotExpressive's joint 0 sits at world
// (-0.003, 2.370, -0.021) even in its in-place idle clip -- nowhere near the origin. This function eased
// toward that ABSOLUTE position, so _rootFollowY locked onto 2.37 and never returned to zero; makeViewProj
// then does `lookY = _currentLookY() + _rootFollowY`, adding it on top of BODY_LOOK_Y (2.21, already the
// robot's own vertical mid) and pointing the camera at y=4.58 -- ABOVE the robot's own head (top 4.44). The
// result is a robot with headroom above and everything from the chest down cropped out -- Keith's report,
// reproduced exactly by reading this value on a real render rather than trusting the comment above it.
// FIX: track the joint's DISPLACEMENT from wherever it sat when this animator started, not its absolute
// position. An in-place clip's joint 0 never moves from that baseline, so the delta -- and therefore this
// whole mechanism's contribution -- stays at zero regardless of where in world space the bone happens to
// live, which is what "no-op for in-place clips" was always supposed to mean. Genuine root motion (the
// CesiumMan case this was built for) still accumulates normally, since it's measured as movement AWAY from
// where the clip began rather than distance from a coordinate nothing established as meaningful.
let _rootFollowX = 0, _rootFollowY = 0, _rootFollowZ = 0;
let _rootFollowBaseX = null, _rootFollowBaseY = null, _rootFollowBaseZ = null, _rootFollowAnimatorRef = null;
function _updateRootFollow(animator, alpha = 0.15) {
    if (!animator?.jointMatrices || animator.jointMatrices.length < 16) return;
    // Joint 0 in jointMatrices is typically the root. The matrix is 4×4
    // column-major; world translation lives at indices 12, 13, 14.
    const tx = animator.jointMatrices[12];
    const ty = animator.jointMatrices[13];
    const tz = animator.jointMatrices[14];
    if (!Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz)) return;
    if (animator !== _rootFollowAnimatorRef) {
        // A (re)loaded avatar: rebaseline to THIS joint's starting position instead of assuming it is the
        // origin, and report zero displacement for this frame rather than one large first-frame jump.
        _rootFollowAnimatorRef = animator;
        _rootFollowBaseX = tx; _rootFollowBaseY = ty; _rootFollowBaseZ = tz;
        _rootFollowX = 0; _rootFollowY = 0; _rootFollowZ = 0;
        return;
    }
    const dx = tx - _rootFollowBaseX, dy = ty - _rootFollowBaseY, dz = tz - _rootFollowBaseZ;
    _rootFollowX += (dx - _rootFollowX) * alpha;
    _rootFollowY += (dy - _rootFollowY) * alpha;
    _rootFollowZ += (dz - _rootFollowZ) * alpha;
}

function makeViewProj(dt) {
    // Round 263c — robot centering: target raised slightly (y=1.3 from
    // 1.2) so the head sits at vertical mid-frame. Camera radius is
    // dynamic via _radiusOverride so kpop:zoom can pull in during
    // speech. Round 266 — cameraAngle includes a gaze offset so the
    // robot turns to look at OLLAMA when the panels are dragged apart
    // on screen. Round 267 — face-mode zoom also raises the lookAt
    // target to head height.
    // v765 — orbit center follows the animator's root joint so avatars
    // with locomotive animations (CesiumMan walk) stay framed instead
    // of marching off-camera.
    const nowMs = performance.now();
    const radius = _currentRadius(nowMs);
    const gaze = _currentGazeAngle(nowMs);
    const effectiveAngle = cameraAngle + gaze;
    const eyeX = _rootFollowX + Math.sin(effectiveAngle) * radius;
    const eyeZ = _rootFollowZ + Math.cos(effectiveAngle) * radius;
    const lookY = _currentLookY(nowMs) + _rootFollowY;
    // Eye height tracks lookAt height + a small offset so the camera
    // looks slightly down on the face during face-mode (more flattering
    // crop than dead-level).
    const eyeY = lookY + 0.15;
    const aspect = canvas.width / canvas.height;
    const proj = mat4Perspective(Math.PI / 3.5, aspect, 0.1, 50.0);
    const view = mat4LookAt([eyeX, eyeY, eyeZ], [_rootFollowX, lookY, _rootFollowZ], [0, 1, 0]);
    return mat4Multiply(proj, view);
}

// ---- Render loop --------------------------------------------------------
gl.enable(gl.DEPTH_TEST);
gl.enable(gl.CULL_FACE);
gl.cullFace(gl.BACK);

let lastT = performance.now();
function render() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.06, 0.04, 0.10, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (mesh && animator) {
        // v727 — when head is locked (during kpop:speak), freeze the
        // animation by passing dt=0. Keeps the head still + facing
        // forward during speech instead of bouncing with idle motion.
        const animDt = _isHeadLocked(now) ? 0 : dt;
        animator.update(animDt);
        // v765 — pull the root joint's current world position into the
        // smoothed follow target so the camera tracks avatars whose
        // animations have locomotion (CesiumMan walk). For in-place
        // clips (RobotExpressive idle/wave/dance) the root stays near
        // origin and this contributes nothing visible.
        _updateRootFollow(animator);
        // v3779 -- the load-time fit used raw positions (wrong space). Now that the animator is live and its
        // jointMatrices exist, measure the true SKINNED box once and re-frame from it. Runs a single time per
        // model; _recomputeFit still honours a user-pinned camera.
        if (!_skinnedFitDone && animator.jointMatrices && animator.jointMatrices.length >= 16) {
            _skinnedFitDone = true;
            try {
                const sb = _measureModelSkinned();
                if (!sb) {
                    // v3786 -- do NOT latch _skinnedFitDone on a failure: the animator may not be ready on the
                    // very first frame that clears the guard above, and latching would make one early frame
                    // permanent. Retry next frame; the reason string carries the latest attempt.
                    _skinnedFitDone = false;
                }
                if (sb) {
                    _skinnedFitReason = "ok";
                    sb.oriented = true;   // v3808 -- measured through the joint matrices: DO NOT rotate it again
                    _rawBBox = sb;
                    const h = sb.maxY - sb.minY;
                    _avatarMetrics.modelHeight = h;
                    _avatarMetrics.modelTopY   = sb.maxY;
                    _avatarMetrics.modelMidY   = (sb.minY + sb.maxY) / 2;
                    _avatarMetrics.scaleRatio  = h / 1.8;
                    _recomputeFit();
                }
            } catch (e) {}
        }
        gl.useProgram(program);
        gl.uniformMatrix4fv(uViewProj, false, makeViewProj(dt));
        gl.uniformMatrix4fv(uJointMatrices, false, animator.jointMatrices);
        gl.uniform1i(uHasSkin, 1);
        gl.uniform3f(uBaseColor, 0.78, 0.80, 0.86);
        // v858 — character lateral offset for the wanderer. Updated by
        // _wanderTick on a periodic schedule; stays at (0,0,0) when
        // the avatar isn't actively wandering.
        gl.uniform3f(uModelOffset, _wander.x, _wander.y, _wander.z);
        // v884 — orientation override (identity until the user realigns).
        gl.uniformMatrix4fv(uModelRot, false, _modelRotMat);
        // v862 — costume tint. _costume.tint is [r,g,b] from the current
        // selected costume (default [1,1,1] = no change).
        gl.uniform3f(uTint, _costume.tint[0], _costume.tint[1], _costume.tint[2]);
        // v888 — color-as-indicator wash for this avatar.
        try {
            const eff = avatarColor.getEffective(_avatarKey());
            gl.uniform3f(uColorOverride, eff.rgb[0], eff.rgb[1], eff.rgb[2]);
            gl.uniform1f(uColorOverrideAmt, eff.amt || 0);
        } catch { gl.uniform1f(uColorOverrideAmt, 0); }
        gl.bindVertexArray(mesh.vao);

        // Round 122 — multi-pass draw. If the mesh has multiple
        // primitives with distinct textures, we walk primitiveRanges
        // and rebind the appropriate texture per range. For meshes
        // with zero or one material textures (the common case for
        // simple robots / civ markers), we fall through to the single-
        // pass path which is identical to v2.119.
        const texByMat = mesh.texturesByMaterial || {};
        const numUniqueTextures = Object.keys(texByMat).length;

        if (numUniqueTextures > 1 && mesh.primitiveRanges && mesh.primitiveRanges.length > 1) {
            // Multi-pass: one draw call per primitive range. Each pass
            // binds the texture for that primitive's material (if any)
            // and sets uHasTexture accordingly so the fragment shader
            // can either sample the texture or use the vertex color.
            gl.activeTexture(gl.TEXTURE0);
            for (const r of mesh.primitiveRanges) {
                const matKey = r.materialIdx;
                const tex = (matKey != null) ? texByMat[matKey] : null;
                if (tex) {
                    gl.bindTexture(gl.TEXTURE_2D, tex);
                    gl.uniform1i(uTexture, 0);
                    gl.uniform1i(uHasTexture, 1);
                } else {
                    gl.uniform1i(uHasTexture, 0);
                }
                // indexStart is in indices, ELEMENT_ARRAY_BUFFER uses
                // UNSIGNED_INT = 4 bytes per index, hence offset *= 4
                gl.drawElements(
                    gl.TRIANGLES,
                    r.indexCount,
                    gl.UNSIGNED_INT,
                    r.indexStart * 4
                );
            }
        } else {
            // Single-pass legacy path
            if (mesh.texture) {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, mesh.texture);
                gl.uniform1i(uTexture, 0);
                gl.uniform1i(uHasTexture, 1);
            } else {
                gl.uniform1i(uHasTexture, 0);
            }
            gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0);
        }

        gl.bindVertexArray(null);

        // v864 — accessory draw pass. Each equipped accessory is a
        // separate VAO with its vertices weighted entirely to its
        // attach bone. The skinning shader already uploads the right
        // joint matrices for the main mesh, and we use the same
        // program here — accessory verts pick up their bone's matrix
        // via the standard skinning math (weights[0]=1, joints[0]=bone).
        // Skip texture path; rely on vertex color (location 4).
        gl.uniform1i(uHasTexture, 0);
        for (const slot of _SLOT_KEYS) {
            const acc = _accessories[slot];
            if (!acc || !acc.vao) continue;
            // v865 — cape uses cloth sim: positions live in WORLD space,
            // updated each frame by _capeSimStep. Render with uHasSkin=0
            // so the shader treats positions as final (no bone transform
            // — that's already baked into worldPos by the sim).
            if (acc.cloth) {
                _capeSimStep(slot);
                gl.uniform1i(uHasSkin, 0);
            } else {
                gl.uniform1i(uHasSkin, 1);
            }
            gl.bindVertexArray(acc.vao);
            gl.drawElements(gl.TRIANGLES, acc.indexCount, gl.UNSIGNED_INT, 0);
            gl.bindVertexArray(null);
        }
        // Restore uHasSkin for next frame's main mesh draw
        gl.uniform1i(uHasSkin, 1);
    } else {
        // No model — still advance camera angle so it doesn't feel frozen
        makeViewProj(dt);
    }
    requestAnimationFrame(render);
}
requestAnimationFrame(render);

// ---- WebSocket ----------------------------------------------------------
let _robotWsAttempt = 0;   // v1345 — jittered-backoff reconnect attempt counter
function connect() {
    let ws;
    try { ws = new WebSocket((location.protocol === "https:" ? "wss:" : "ws:") + "//" + location.host); }
    catch {
        statusTxt.textContent = "ws connect error";
        setTimeout(connect, backoffDelay(_robotWsAttempt++));
        return;
    }
    ws.addEventListener("open", () => {
        statusDot.classList.add("on");
        statusTxt.textContent = `connected · ws://${location.host}`;
        _robotWsAttempt = 0;
    });
    ws.addEventListener("close", () => {
        statusDot.classList.remove("on");
        statusTxt.textContent = "disconnected — retrying";
        setTimeout(connect, backoffDelay(_robotWsAttempt++));
    });
    ws.addEventListener("error", () => {
        statusDot.classList.remove("on");
    });
    ws.addEventListener("message", (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch { return; }
        if (m.type === "tama") {
            setEmotion(m.action ?? "neutral");
        } else if (m.type === "toast") {
            const map = { error: "sad", warn: "alert", success: "happy", info: "wave", system: "neutral" };
            setEmotion(map[m.toastType] ?? "neutral");
        }
    });
}
connect();

// Round 262 — mouth lip-sync overlay. RobotExpressive GLB has no jaw
// bone or mouth blendshape, so we use a 2D SVG ellipse overlay sized
// over the robot's face area. The ry attribute is animated during
// speech to mimic a talking mouth.
const mouthOverlay = document.getElementById("mouth-overlay");
// ---- Mouth lip-sync ---------------------------------------------------
// Round 271 — text-driven phoneme curve. Replaces the sine+jitter
// animation we had with a per-character amplitude curve so the mouth
// actually mirrors what's being said: vowels open wide, m/b/p snap
// shut, fricatives sit narrow. See face/PhonemeMouth.js for details.
// (Import moved to top of file alongside the other ESM imports.)
const mouthShape   = document.getElementById("mouth-shape");
let _mouthRafHandle = 0;
let _mouthStartMs = 0;
let _mouthEndMs = 0;
let _mouthCurve = null;
let _mouthCurveDuration = 0;   // round 272 — total ms the curve spans
let _mouthTimeOffset = 0;      // round 272 — added to (t - _mouthStartMs)
                                //               when sampling, lets TTS
                                //               boundary events re-anchor
let _audioAmp = 0;        // round 272 — real-audio amplitude from main window
let _audioAmpAt = 0;      //               freshness timestamp
function startMouthSpeak(durationMs, text = "") {
    if (!mouthOverlay || !mouthShape) return;
    const now = performance.now();
    _mouthStartMs = now;
    const dur = Math.max(150, durationMs || 600);
    _mouthEndMs = now + dur;
    _mouthCurve = buildAmplitudeCurve(text, dur);
    _mouthCurveDuration = dur;
    _mouthTimeOffset = 0;
    mouthOverlay.style.opacity = "1";
    cancelAnimationFrame(_mouthRafHandle);
    const tick = () => {
        const t = performance.now();
        if (t >= _mouthEndMs) {
            // Fade closed
            mouthOverlay.style.opacity = "0";
            mouthShape.setAttribute("ry", "4");
            _mouthCurve = null;
            _mouthRafHandle = 0;
            return;
        }
        // Round 272 — if a real-audio amplitude has arrived within
        // the last 80ms, use it directly. Otherwise fall back to the
        // text-derived phoneme curve. This is what makes "Path C"
        // (PowerShell WAV → fetch → AnalyserNode → iframe) actually
        // drive the mouth from the audio envelope.
        let amp;
        if (t - _audioAmpAt < 80) {
            amp = _audioAmp;
        } else {
            const curveT = (t - _mouthStartMs) + _mouthTimeOffset;
            amp = sampleWithJitter(_mouthCurve, curveT);
        }
        const ry = Math.max(3, Math.min(20, 3 + amp * 17));
        mouthShape.setAttribute("ry", ry.toFixed(2));
        _mouthRafHandle = requestAnimationFrame(tick);
    };
    _mouthRafHandle = requestAnimationFrame(tick);
}

// Round 272 — TTS boundary re-anchor. PipAvatar forwards each
// window.speechSynthesis boundary event with the text fraction we're
// at (0..1). We snap our curve playback head to that fraction by
// adjusting _mouthTimeOffset. Smoothed (10% blend) so the mouth
// doesn't jerk on every boundary; over the course of an utterance the
// offset converges to the actual speech rate.
function reanchorMouthFromBoundary(fraction, elapsedMs) {
    if (!_mouthCurve || !_mouthCurveDuration) return;
    const expectedCurveT = fraction * _mouthCurveDuration;
    const naturalCurveT  = elapsedMs;     // what we'd be sampling without offset
    const wantOffset     = expectedCurveT - naturalCurveT;
    // Blend 10% toward the new offset — smoother than snapping
    _mouthTimeOffset = _mouthTimeOffset * 0.9 + wantOffset * 0.1;
}

// Round 257 — postMessage listener for embedded PIP mode. When this
// page is hosted in an iframe by PipAvatar with ?voice=M1, only
// react to messages whose voice matches. Allows the engine's
// kpop.speak({Voice}) to drive two separate PIP avatars side by side.
window.addEventListener("message", (e) => {
    const m = e?.data;
    if (!m || typeof m !== "object" || !m.type) return;
    if (_myVoice && m.voice && m.voice !== _myVoice) return;
    if (m.type === "kpop:speak") {
        const action = m.action || "wave";
        // v715 — head-focus mode. We engage the lock BEFORE starting the
        // mouth animation so the head is already framed + frozen by the
        // time the first phoneme fires. Pre-roll covers the camera ease-
        // in (~250ms feels right — fast enough that the user doesn't
        // notice a pause, slow enough that the camera move is smooth).
        const PRE_ROLL  = 250;   // ms before mouth opens
        const POST_HOLD = 220;   // ms after mouth closes
        const dur       = Math.max(150, m.durationMs || 600);
        const now       = performance.now();
        const totalLock = PRE_ROLL + dur + POST_HOLD;
        _headLockUntilMs = now + totalLock;
        // Cancel any in-flight gaze so the body doesn't keep twisting
        // into the lock — gaze is suppressed for the duration by
        // _isHeadLocked anyway, but clearing it makes the release cleaner.
        _gazeOverride = null;
        // Auto face-zoom (same code path as kpop:zoom mode:"face") —
        // the user can still override with their own kpop:zoom and the
        // closer target wins.
        const toRadius = BASE_RADIUS * 0.45;
        if (_radiusOverride) {
            _radiusOverride.endMs = Math.max(_radiusOverride.endMs, now + totalLock);
            if (toRadius < _radiusOverride.toRadius) {
                _radiusOverride.toRadius = toRadius;
                _radiusOverride.mode = "face";
            }
        } else {
            _radiusOverride = {
                startMs: now, endMs: now + totalLock,
                fromRadius: BASE_RADIUS, toRadius,
                mode: "face",
            };
        }
        // Defer mouth animation start by PRE_ROLL so the camera is in
        // position before the lips start moving. setEmotion stays
        // immediate so the body emote (wave, etc.) plays during the
        // pre-roll — the head is locked but arms can wave.
        setEmotion(action);
        setTimeout(() => startMouthSpeak(dur, m.text), PRE_ROLL);
        clearTimeout(window._kpopReturnTimer);
        window._kpopReturnTimer = setTimeout(() => {
            setEmotion("neutral");
            // The lock expires naturally via _headLockUntilMs timestamp.
            // No need to clear it here.
        }, totalLock);
    } else if (m.type === "kpop:speak:end") {
        // v715 — early-release path. PowerShell TTS can fire a finished-
        // speaking event before the duration estimate expires; in that
        // case release the lock + ease the camera out. Optional — the
        // existing _headLockUntilMs timeout still handles the case when
        // no explicit end event arrives.
        _headLockUntilMs = 0;
        if (_radiusOverride && _radiusOverride.mode === "face") {
            // Snap the ease-out by truncating the remaining time
            _radiusOverride.endMs = Math.min(_radiusOverride.endMs, performance.now() + 250);
        }
    } else if (m.type === "kpop:expression") {
        setEmotion(m.action || "neutral");
    } else if (m.type === "kpop:zoom") {
        // Round 263c — pull the camera in to BASE_RADIUS * scale for
        // durationMs, then ease back out. Multiple overlapping zoom
        // requests extend the end time and keep the closest scale.
        // Round 267 — also carries a mode: "face" tightens to ~40-45%
        // scale + raises lookAt to head height for a face crop;
        // "body" stays at the existing torso framing.
        const dur = Math.max(200, Math.min(8000, m.durationMs || 1500));
        const targetScale = Math.max(0.3, Math.min(1, m.scale || 0.7));
        const mode = (m.mode === "face") ? "face" : "body";
        const now = performance.now();
        const endMs = now + dur;
        const toRadius = BASE_RADIUS * targetScale;
        // If an override is in flight and going closer, keep its
        // closer target; otherwise replace. Face mode wins over body
        // for tie-breaking since it's the more cinematic option.
        if (_radiusOverride) {
            _radiusOverride.endMs = Math.max(_radiusOverride.endMs, endMs);
            if (toRadius < _radiusOverride.toRadius) {
                _radiusOverride.toRadius = toRadius;
                _radiusOverride.mode = mode;
            }
        } else {
            _radiusOverride = {
                startMs: now, endMs,
                fromRadius: BASE_RADIUS, toRadius,
                mode,
            };
        }
    } else if (m.type === "kpop:gaze") {
        // Round 266 — turn the robot to "look at" the OLLAMA panel.
        // PipAvatar computes the angle in screen space and passes a
        // yaw in radians; we ease into it for the duration of the
        // current speech, then ease back to neutral. Overlapping
        // gaze hints replace the target (last-write-wins) and extend
        // the end time, so a multi-turn dialog keeps the robot
        // smoothly tracking the OLLAMA panel.
        const dur = Math.max(200, Math.min(10000, m.durationMs || 1800));
        const yaw = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, m.yaw || 0));
        const now = performance.now();
        _gazeOverride = {
            startMs:    now,
            endMs:      Math.max(_gazeOverride?.endMs ?? 0, now + dur),
            targetYaw:  yaw,
        };
    } else if (m.type === "kpop:tts_boundary") {
        // Round 272 — TTS boundary event from PipAvatar. We get the
        // text fraction we're at and the elapsed ms since speech start.
        // Snap the mouth phoneme curve's playback head to match.
        const frac = Math.max(0, Math.min(1, m.fraction ?? 0));
        const elapsed = Math.max(0, m.elapsedMs ?? 0);
        reanchorMouthFromBoundary(frac, elapsed);
    } else if (m.type === "kpop:audio_amp") {
        // Round 272 — real audio amplitude from a WAV played in the
        // parent window. While this is firing (typically per-frame
        // during audio playback), our mouth follows the actual energy
        // envelope of the speech rather than the synthetic phoneme
        // curve. We stash the amplitude with a freshness timestamp;
        // the rAF loop in startMouthSpeak checks the timestamp and
        // uses _audioAmp when recent enough.
        _audioAmp = Math.max(0, Math.min(1, m.amp ?? 0));
        _audioAmpAt = performance.now();
    } else if (m.type === "kpop:headLock") {
        // Round 274 — head-lock. PipAvatar.fireSpeak sets this at the
        // start of an utterance so the head stays still while the
        // mouth animates. Without it, the camera ambient drift + gaze
        // overrides would visibly wobble the head during speech.
        const dur = Math.max(200, Math.min(15000, m.durationMs ?? 1500));
        _headLockUntilMs = Math.max(_headLockUntilMs, performance.now() + dur);
    }
});

// ---- Click & long-press for testing/cycling ----------------------------
// Round 269 — short click cycles test emotions (existing behavior);
// long-press (≥350ms) sends a kpop:cycleView postMessage to the parent
// PIP, which moves to the next listener view (robot → face → glb). Lets
// users tap the avatar to switch views without aiming for the tiny tab
// emoji at the top of the panel.
//
// v720 — short click now greets instead of cycling emotions:
//   * Self-postMessage `kpop:speak` → engages head-zoom + lock + mouth
//     animation via the existing handler
//   * POST /kpop/speak → bridge → pipe → PowerShell listener actually
//     synthesizes "Hello human." through System.Speech
// Long-press behavior (≥350ms = cycle view) is unchanged.
let _mouseDownAt = 0;
let _longPressFired = false;
canvas.addEventListener("mousedown", () => {
    _mouseDownAt = performance.now();
    _longPressFired = false;
});
canvas.addEventListener("mouseup", () => {
    const held = performance.now() - _mouseDownAt;
    if (held >= 350 && !_longPressFired) {
        _longPressFired = true;
        try { window.parent?.postMessage({ type: "kpop:cycleView" }, "*"); } catch {}
        return;     // long-press consumed; don't also speak
    }
    // Short click: greet
    const greeting = "Hello human.";
    try {
        window.postMessage({ type: "kpop:speak", voice: "M1", text: greeting }, "*");
    } catch {}
    try {
        fetch("/kpop/speak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ Voice: "M1", Text: greeting }),
        }).catch(() => {});   // bridge may be down; we still got the zoom
    } catch {}
});

// ---- Kick off -----------------------------------------------------------
loadRobot();
