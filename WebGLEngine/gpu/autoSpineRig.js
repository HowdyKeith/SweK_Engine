// FILE: gpu/autoSpineRig.js
// VERSION: v435 — automatic spine rig + procedural swim.
//
// Takes ANY static mesh (raw positions/indices/normals) and fits a bone
// chain down its longest axis, auto-skinning each vertex to the 1–2
// nearest joints with a smooth blend. Then bakes a "swim" clip: a
// traveling sine wave of yaw rotations running head→tail with amplitude
// growing toward the tail — i.e. how a fish or eel actually swims.
//
// Output matches the engine's native rigged-asset format (the same shape
// proceduralTestRig.js produces), so it plays straight through the
// existing SkeletalAnimator + GPU-skinned EntityMeshRenderer. The spine
// is also the backbone you'd later hang legs/fins off of — this is the
// universal primitive, with the fish swim as its simplest driver.

// ---- small math helpers ------------------------------------------------
function quatAxis(axis, theta) {     // axis: 0=X,1=Y,2=Z
    const h = theta * 0.5;
    const q = new Float32Array([0, 0, 0, Math.cos(h)]);
    q[axis] = Math.sin(h);
    return q;
}
// column-major mat4 for translate(-p) — the inverse-bind of a rest joint
// sitting at world position p with identity rotation.
function ibmTranslate(px, py, pz) {
    return new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        -px, -py, -pz, 1,
    ]);
}

/**
 * Fit a spine rig to a mesh and bake a swim clip.
 * @param {Float32Array|number[]} positions  n*3 vertex positions
 * @param {Uint16Array|Uint32Array|number[]} indices triangle indices
 * @param {Float32Array|number[]|null} normals optional n*3 normals
 * @param {Object} [opts]
 * @param {number} [opts.joints=8]    bones along the spine
 * @param {number} [opts.amplitude]   peak tail yaw (radians)
 * @param {number} [opts.waves]       wavelengths along the body (fish≈1, eel≈2.5)
 * @param {number} [opts.tailBias=1.4] how strongly amplitude grows toward the tail
 * @param {number} [opts.period=1.1]  seconds per swim cycle
 */
export function buildSpineRigGeometry(positions, indices, normals, opts = {}) {
    const pos = positions instanceof Float32Array ? positions : new Float32Array(positions);
    const vCount = pos.length / 3;
    const N = Math.max(2, Math.min(24, opts.joints || 8));

    // Bounding box → pick the longest axis as the spine.
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vCount; i++) {
        for (let a = 0; a < 3; a++) {
            const v = pos[i * 3 + a];
            if (v < lo[a]) lo[a] = v;
            if (v > hi[a]) hi[a] = v;
        }
    }
    const ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    let L = 0;
    if (ext[1] > ext[L]) L = 1;
    if (ext[2] > ext[L]) L = 2;
    if (opts.spineAxis === 0 || opts.spineAxis === 1 || opts.spineAxis === 2) L = opts.spineAxis;   // v1384 — caller can force the spine axis (axis guard)
    // Undulate laterally: yaw about world-up (Y) for a horizontal body;
    // if the body is vertical, bend about X instead.
    const bendAxis = (L === 1) ? 0 : 1;
    const center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    const aMin = lo[L], aLen = Math.max(1e-4, ext[L]);
    const seg = aLen / (N - 1);

    // Joint rest world positions (along the spine, centered on the body).
    const jointWorld = [];
    for (let k = 0; k < N; k++) {
        const p = [center[0], center[1], center[2]];
        p[L] = aMin + k * seg;
        jointWorld.push(p);
    }

    // Node chain: root holds the first joint's world position; each child
    // is offset by one segment along the spine so a rotation swings the
    // rest of the tail.
    const IDENT = [0, 0, 0, 1];
    const nodes = [];
    for (let k = 0; k < N; k++) {
        const t = [0, 0, 0];
        if (k === 0) { t[0] = jointWorld[0][0]; t[1] = jointWorld[0][1]; t[2] = jointWorld[0][2]; }
        else t[L] = seg;
        nodes.push({
            translation: new Float32Array(t),
            rotation: new Float32Array(IDENT),
            scale: new Float32Array([1, 1, 1]),
            parent: k - 1,
            children: k < N - 1 ? [k + 1] : [],
        });
    }

    const ibm = jointWorld.map(p => ibmTranslate(p[0], p[1], p[2]));
    const skin = { joints: Array.from({ length: N }, (_, k) => k), inverseBindMatrices: ibm, skeleton: 0 };

    // Skin weights: 2-bone linear blend by position along the spine.
    const joints = new Uint8Array(vCount * 4);
    const weights = new Float32Array(vCount * 4);
    for (let i = 0; i < vCount; i++) {
        const a = pos[i * 3 + L];
        let f = (a - aMin) / seg;
        if (!Number.isFinite(f)) f = 0;
        let j0 = Math.floor(f);
        if (j0 < 0) j0 = 0;
        if (j0 > N - 1) j0 = N - 1;
        let j1 = Math.min(j0 + 1, N - 1);
        let w1 = f - j0;
        if (w1 < 0) w1 = 0; if (w1 > 1) w1 = 1;
        if (j0 === j1) w1 = 0;
        joints[i * 4] = j0; joints[i * 4 + 1] = j1;
        weights[i * 4] = 1 - w1; weights[i * 4 + 1] = w1;
    }

    // Normals: reuse source if present, else flat up — the GPU skin path
    // re-transforms them by the joint matrices.
    let norm;
    if (normals && normals.length === pos.length) {
        norm = normals instanceof Float32Array ? normals : new Float32Array(normals);
    } else {
        norm = new Float32Array(pos.length);
        for (let i = 0; i < vCount; i++) norm[i * 3 + 1] = 1;
    }

    // v672 — force Uint32Array. EntityMeshRenderer._drawInstanced hardcodes
    // gl.UNSIGNED_INT (4 bytes/index); a Uint16Array IBO has half the bytes
    // GL expects, which triggers "Insufficient buffer size" GL_INVALID_OPERATION
    // on every frame and locks up rendering. Same fix as v667 for centipede.
    const inds = indices instanceof Uint32Array
        ? indices
        : new Uint32Array(indices);

    const animations = buildSwimClips(N, bendAxis, opts);

    return {
        positions: pos, normals: norm, indices: inds,
        joints, weights, skin, nodes, animations,
        bounds: { minX: lo[0], minY: lo[1], minZ: lo[2], maxX: hi[0], maxY: hi[1], maxZ: hi[2] },
        vertexCount: vCount, indexCount: inds.length,
        spineAxis: L, bendAxis, jointCount: N,
    };
}

// Bake the traveling-wave swim (and a calmer idle) as keyframed rotation
// clips, one channel per joint.
function buildSwimClips(N, bendAxis, opts) {
    const amp = opts.amplitude ?? 0.28;
    const waves = opts.waves ?? 1.2;
    const tailBias = opts.tailBias ?? 1.4;
    const period = opts.period ?? 1.1;
    const STEPS = 16;

    const mk = (peakAmp, P) => {
        const times = new Float32Array(STEPS + 1);
        for (let s = 0; s <= STEPS; s++) times[s] = (s / STEPS) * P;
        const samplers = [];
        const channels = [];
        // Joint 0 is the head anchor (kept still); joints 1..N-1 wave.
        for (let k = 1; k < N; k++) {
            const u = k / (N - 1);
            const ampK = peakAmp * Math.pow(u, tailBias);
            const spatial = 2 * Math.PI * waves * u;
            const values = new Float32Array((STEPS + 1) * 4);
            for (let s = 0; s <= STEPS; s++) {
                const t = (s / STEPS) * P;
                const theta = ampK * Math.sin(spatial - 2 * Math.PI * (t / P));
                const q = quatAxis(bendAxis, theta);
                values[s * 4] = q[0]; values[s * 4 + 1] = q[1];
                values[s * 4 + 2] = q[2]; values[s * 4 + 3] = q[3];
            }
            samplers.push({ times, values, interpolation: "LINEAR" });
            channels.push({ samplerIdx: samplers.length - 1, targetNode: k, path: "rotation" });
        }
        return { samplers, channels };
    };

    const swim = mk(amp, period);
    const idle = mk(amp * 0.35, period * 1.8);
    return [
        { name: "swim", duration: period, samplers: swim.samplers, channels: swim.channels },
        { name: "idle", duration: period * 1.8, samplers: idle.samplers, channels: idle.channels },
    ];
}

/**
 * v1390 — SLOPPY DANCE rig for a bare humanoid mesh. Detects legs (lower body) AND
 * arms (upper, lateral) plus a torso root, then drives all of them with loose,
 * phase-staggered, different-rate sines: arms flail up/down, legs bounce fore/aft,
 * the whole body twists. "Sloppy" = big arm amplitude + odd phases + per-limb cycle
 * counts so nothing syncs. Each channel uses an integer cycle count over the period
 * so the loop is seamless. Same rig shape as the other rigs.
 */
export function buildDanceRig(positions, indices, normals, opts = {}) {
    const pos = positions instanceof Float32Array ? positions : new Float32Array(positions);
    const vCount = pos.length / 3;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vCount; i++) for (let a = 0; a < 3; a++) { const v = pos[i * 3 + a]; if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }
    const ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    const center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    const longerHoriz = (ext[0] >= ext[2]) ? 0 : 2, shorterHoriz = (longerHoriz === 0) ? 2 : 0;
    const upright = ext[1] >= ext[longerHoriz];
    const lat = upright ? longerHoriz : shorterHoriz;   // arms/legs spread laterally
    const fwd = upright ? shorterHoriz : longerHoriz;
    const halfL = Math.max(1e-4, ext[lat] / 2), halfF = Math.max(1e-4, ext[fwd] / 2);
    const yLegTop = lo[1] + (opts.legBand ?? 0.50) * ext[1];
    const yArmBot = lo[1] + (opts.armBand ?? 0.55) * ext[1];
    const latEdge = (opts.latEdge ?? 0.12) * halfL, fwdEdge = (opts.fwdEdge ?? 0.20) * halfF;
    const armFrac = (opts.armFrac ?? 0.45) * halfL;

    const isLeg = (i) => pos[i * 3 + 1] <= yLegTop && Math.abs(pos[i * 3 + lat] - center[lat]) > latEdge && (upright || Math.abs(pos[i * 3 + fwd] - center[fwd]) > fwdEdge);
    const isArm = (i) => upright && pos[i * 3 + 1] >= yArmBot && Math.abs(pos[i * 3 + lat] - center[lat]) > armFrac;
    const nLegs = upright ? 2 : 4;
    const legBone = upright
        ? (i) => (pos[i * 3 + lat] < center[lat]) ? 1 : 2
        : (i) => 1 + ((pos[i * 3 + fwd] >= center[fwd]) ? 1 : 0) + ((pos[i * 3 + lat] >= center[lat]) ? 2 : 0);
    const armLbone = nLegs + 1, armRbone = nLegs + 2;
    const armBone = (i) => (pos[i * 3 + lat] < center[lat]) ? armLbone : armRbone;

    const nBones = nLegs + (upright ? 2 : 0);
    const sum = Array.from({ length: nBones + 1 }, () => [0, 0, 0, 0, -Infinity]);   // x,y,z,count,maxY
    const boneOf = (i) => isLeg(i) ? legBone(i) : (isArm(i) ? armBone(i) : 0);
    let used = 0;
    for (let i = 0; i < vCount; i++) { const b = boneOf(i); if (b === 0) continue; sum[b][0] += pos[i * 3]; sum[b][1] += pos[i * 3 + 1]; sum[b][2] += pos[i * 3 + 2]; sum[b][3]++; if (pos[i * 3 + 1] > sum[b][4]) sum[b][4] = pos[i * 3 + 1]; used++; }

    // pivots: legs at the hip (centroid x/z, hip height); arms at the shoulder (biased toward centreline, top)
    const pivot = [];
    for (let b = 1; b <= nBones; b++) {
        const t = sum[b];
        if (t[3] <= 0) { const p = center.slice(); p[1] = (b >= armLbone) ? yArmBot : yLegTop; pivot[b] = p; continue; }
        const cx = t[0] / t[3], cz = t[2] / t[3];
        if (b >= armLbone) pivot[b] = [cx, t[4], cz];   // shoulder: arm centroid x/z, lifted to the top of the arm
        else pivot[b] = [cx, yLegTop, cz];               // hip: leg centroid x/z at hip height
    }
    const IDENT = [0, 0, 0, 1];
    const nodes = [{ translation: new Float32Array(center), rotation: new Float32Array(IDENT), scale: new Float32Array([1, 1, 1]), parent: -1, children: Array.from({ length: nBones }, (_, k) => k + 1) }];
    for (let b = 1; b <= nBones; b++) nodes.push({ translation: new Float32Array([pivot[b][0] - center[0], pivot[b][1] - center[1], pivot[b][2] - center[2]]), rotation: new Float32Array(IDENT), scale: new Float32Array([1, 1, 1]), parent: 0, children: [] });
    const ibm = [ibmTranslate(center[0], center[1], center[2])];
    for (let b = 1; b <= nBones; b++) ibm.push(ibmTranslate(pivot[b][0], pivot[b][1], pivot[b][2]));
    const skin = { joints: Array.from({ length: nBones + 1 }, (_, k) => k), inverseBindMatrices: ibm, skeleton: 0 };
    const joints = new Uint8Array(vCount * 4), weights = new Float32Array(vCount * 4);
    for (let i = 0; i < vCount; i++) { joints[i * 4] = boneOf(i); weights[i * 4] = 1; }
    let norm;
    if (normals && normals.length === pos.length) norm = normals instanceof Float32Array ? normals : new Float32Array(normals);
    else { norm = new Float32Array(pos.length); for (let i = 0; i < vCount; i++) norm[i * 3 + 1] = 1; }
    const inds = indices instanceof Uint32Array ? indices : new Uint32Array(indices);

    // per-bone dance spec: {axis, amp, cycles, phase}. Integer cycles -> seamless loop.
    const specs = [];
    specs[0] = { axis: 1, amp: (opts.torso ?? 0.20), cycles: 1, phase: 0 };                          // root: whole-body twist about Y
    for (let b = 1; b <= nLegs; b++) specs[b] = { axis: lat, amp: 0.22, cycles: 3, phase: 1.3 * b };  // legs bounce fore/aft
    if (upright) {
        specs[armLbone] = { axis: fwd, amp: (opts.flail ?? 0.85), cycles: 2, phase: 0.0 };            // arms flail up/down
        specs[armRbone] = { axis: fwd, amp: (opts.flail ?? 0.85), cycles: 2, phase: 2.2 };            // staggered = sloppy
    }
    const animations = buildDanceClip(nBones, specs, opts);
    return { positions: pos, normals: norm, indices: inds, joints, weights, skin, nodes, animations,
        bounds: { minX: lo[0], minY: lo[1], minZ: lo[2], maxX: hi[0], maxY: hi[1], maxZ: hi[2] },
        vertexCount: vCount, indexCount: inds.length, legCount: nLegs, armCount: upright ? 2 : 0, upright, bones: nBones };
}

function buildDanceClip(nBones, specs, opts) {
    const period = opts.dancePeriod ?? 1.6, STEPS = 24;
    const mk = (gain, P) => {
        const times = new Float32Array(STEPS + 1);
        for (let s = 0; s <= STEPS; s++) times[s] = (s / STEPS) * P;
        const samplers = [], channels = [];
        for (let b = 0; b <= nBones; b++) {
            const sp = specs[b]; if (!sp) continue;
            const values = new Float32Array((STEPS + 1) * 4);
            for (let s = 0; s <= STEPS; s++) { const u = s / STEPS; const q = quatAxis(sp.axis, gain * sp.amp * Math.sin(2 * Math.PI * sp.cycles * u + sp.phase)); values[s * 4] = q[0]; values[s * 4 + 1] = q[1]; values[s * 4 + 2] = q[2]; values[s * 4 + 3] = q[3]; }
            samplers.push({ times, values, interpolation: "LINEAR" });
            channels.push({ samplerIdx: samplers.length - 1, targetNode: b, path: "rotation" });
        }
        return { samplers, channels };
    };
    const dance = mk(1, period), sway = mk(0.35, period * 1.6);
    return [
        { name: "dance", duration: period, samplers: dance.samplers, channels: dance.channels },
        { name: "sway", duration: period * 1.6, samplers: sway.samplers, channels: sway.channels },
    ];
}

/**
 * v1389 — fit a WALK rig to a bare (unrigged) legged mesh + bake a gait clip. The
 * parallel to the wing rig: detect leg clusters in the lower body, hinge each at the
 * hip, and swing them fore/aft (about the lateral axis) on alternating sines. Upright
 * bodies (taller than long) -> 2 legs (left/right opposite phase). Long bodies
 * (quadrupeds) -> 4 legs on a diagonal trot. Same rig shape as the other rigs.
 */
export function buildWalkRig(positions, indices, normals, opts = {}) {
    const pos = positions instanceof Float32Array ? positions : new Float32Array(positions);
    const vCount = pos.length / 3;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vCount; i++) for (let a = 0; a < 3; a++) { const v = pos[i * 3 + a]; if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }
    const ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    const center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    const longerHoriz = (ext[0] >= ext[2]) ? 0 : 2;  // X or Z, whichever is bigger
    const shorterHoriz = (longerHoriz === 0) ? 2 : 0;
    const upright = ext[1] >= ext[longerHoriz];      // taller than its longest footprint -> biped
    // Biped legs spread LATERALLY (wider axis); quadruped body runs fore/aft (longer axis).
    const fwd = upright ? shorterHoriz : longerHoriz;
    const lat = upright ? longerHoriz : shorterHoriz; // legs swing fore/aft about the lateral axis
    const halfF = Math.max(1e-4, ext[fwd] / 2), halfL = Math.max(1e-4, ext[lat] / 2);
    const yTop = lo[1] + (opts.legBand ?? 0.55) * ext[1];   // legs live below this; hip pivot height
    const latEdge = (opts.latEdge ?? 0.12) * halfL, fwdEdge = (opts.fwdEdge ?? 0.20) * halfF;
    const isLeg = (i) => pos[i * 3 + 1] <= yTop && Math.abs(pos[i * 3 + lat] - center[lat]) > latEdge && (upright || Math.abs(pos[i * 3 + fwd] - center[fwd]) > fwdEdge);
    const nLegs = upright ? 2 : 4;
    const boneOf = upright
        ? (i) => (pos[i * 3 + lat] < center[lat]) ? 1 : 2                                                       // 1=left 2=right
        : (i) => 1 + ((pos[i * 3 + fwd] >= center[fwd]) ? 1 : 0) + ((pos[i * 3 + lat] >= center[lat]) ? 2 : 0); // 1..4 by quadrant
    // per-leg centroid -> hip pivot (centroid X/Z, hip height Y)
    const sum = Array.from({ length: nLegs + 1 }, () => [0, 0, 0, 0]);
    let legVerts = 0;
    for (let i = 0; i < vCount; i++) { if (!isLeg(i)) continue; const b = boneOf(i); sum[b][0] += pos[i * 3]; sum[b][1] += pos[i * 3 + 1]; sum[b][2] += pos[i * 3 + 2]; sum[b][3]++; legVerts++; }
    const pivot = [];
    for (let b = 1; b <= nLegs; b++) {
        const t = sum[b];
        if (t[3] > 0) pivot[b] = [t[0] / t[3], yTop, t[2] / t[3]];
        else { const p = center.slice(); p[1] = yTop; pivot[b] = p; }
    }
    const IDENT = [0, 0, 0, 1];
    const nodes = [{ translation: new Float32Array(center), rotation: new Float32Array(IDENT), scale: new Float32Array([1, 1, 1]), parent: -1, children: Array.from({ length: nLegs }, (_, k) => k + 1) }];
    for (let b = 1; b <= nLegs; b++) nodes.push({ translation: new Float32Array([pivot[b][0] - center[0], pivot[b][1] - center[1], pivot[b][2] - center[2]]), rotation: new Float32Array(IDENT), scale: new Float32Array([1, 1, 1]), parent: 0, children: [] });
    const ibm = [ibmTranslate(center[0], center[1], center[2])];
    for (let b = 1; b <= nLegs; b++) ibm.push(ibmTranslate(pivot[b][0], pivot[b][1], pivot[b][2]));
    const skin = { joints: Array.from({ length: nLegs + 1 }, (_, k) => k), inverseBindMatrices: ibm, skeleton: 0 };
    const joints = new Uint8Array(vCount * 4), weights = new Float32Array(vCount * 4);
    for (let i = 0; i < vCount; i++) { joints[i * 4] = isLeg(i) ? boneOf(i) : 0; weights[i * 4] = 1; }
    let norm;
    if (normals && normals.length === pos.length) norm = normals instanceof Float32Array ? normals : new Float32Array(normals);
    else { norm = new Float32Array(pos.length); for (let i = 0; i < vCount; i++) norm[i * 3 + 1] = 1; }
    const inds = indices instanceof Uint32Array ? indices : new Uint32Array(indices);
    // gait phase per leg bone (radians): upright = L 0 / R PI; quad diagonal = FL,BR in phase, FR,BL opposite
    const PI = Math.PI;
    const phase = upright ? [0, 0, PI] : [0, PI, 0, 0, PI];   // index by bone (1..nLegs); quad bones: 1=BL,2=FL,3=BR,4=FR
    const animations = buildWalkClip(lat, nLegs, phase, opts);
    return { positions: pos, normals: norm, indices: inds, joints, weights, skin, nodes, animations,
        bounds: { minX: lo[0], minY: lo[1], minZ: lo[2], maxX: hi[0], maxY: hi[1], maxZ: hi[2] },
        vertexCount: vCount, indexCount: inds.length, swingAxis: lat, legCount: nLegs, legVerts, upright };
}

function buildWalkClip(latAxis, nLegs, phase, opts) {
    const stride = opts.stride ?? 0.45, period = opts.stepPeriod ?? 0.9, STEPS = 16;
    const mk = (A, P) => {
        const times = new Float32Array(STEPS + 1);
        for (let s = 0; s <= STEPS; s++) times[s] = (s / STEPS) * P;
        const samplers = [], channels = [];
        for (let b = 1; b <= nLegs; b++) {
            const ph = phase[b] || 0;
            const values = new Float32Array((STEPS + 1) * 4);
            for (let s = 0; s <= STEPS; s++) { const q = quatAxis(latAxis, A * Math.sin(2 * Math.PI * (s / STEPS) + ph)); values[s * 4] = q[0]; values[s * 4 + 1] = q[1]; values[s * 4 + 2] = q[2]; values[s * 4 + 3] = q[3]; }
            samplers.push({ times, values, interpolation: "LINEAR" });
            channels.push({ samplerIdx: samplers.length - 1, targetNode: b, path: "rotation" });
        }
        return { samplers, channels };
    };
    const walk = mk(stride, period), idle = mk(stride * 0.25, period * 1.8);
    return [
        { name: "walk", duration: period, samplers: walk.samplers, channels: walk.channels },
        { name: "idle", duration: period * 1.8, samplers: idle.samplers, channels: idle.channels },
    ];
}

/**
 * v1384 — fit a WING rig to a bird / dragon mesh + bake a flap clip. The widest
 * horizontal axis is the wingspan; the outer wing verts on each side are skinned
 * to a left/right bone that pitches about the FORWARD axis (the other horizontal).
 * The two wings get opposite-sign rotation so the tips rise + fall together. Body
 * verts ride a still root. Same rig shape as the spine/wheel rigs.
 */
export function buildWingRig(positions, indices, normals, opts = {}) {
    const pos = positions instanceof Float32Array ? positions : new Float32Array(positions);
    const vCount = pos.length / 3;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vCount; i++) for (let a = 0; a < 3; a++) { const v = pos[i * 3 + a]; if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }
    const ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    const center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    const span = (ext[0] >= ext[2]) ? 0 : 2;            // wingspan = wider horizontal
    const fwd = (span === 0) ? 2 : 0;                   // flap pitches about the forward axis
    if (opts.spanAxis === 0 || opts.spanAxis === 2) { /* allow override below */ }
    const halfS = Math.max(1e-4, ext[span] / 2);
    const wingFrac = opts.wingFrac ?? 0.40;             // outer-than this fraction of half-span = wing
    const isWing = (i) => Math.abs(pos[i * 3 + span] - center[span]) > wingFrac * halfS;
    const side = (i) => (pos[i * 3 + span] >= center[span]) ? 2 : 1;   // 2=right(+span), 1=left(-span)
    const IDENT = [0, 0, 0, 1];
    const nodes = [
        { translation: new Float32Array(center), rotation: new Float32Array(IDENT), scale: new Float32Array([1, 1, 1]), parent: -1, children: [1, 2] },
        { translation: new Float32Array([0, 0, 0]), rotation: new Float32Array(IDENT), scale: new Float32Array([1, 1, 1]), parent: 0, children: [] },  // left wing (pivots at body centre)
        { translation: new Float32Array([0, 0, 0]), rotation: new Float32Array(IDENT), scale: new Float32Array([1, 1, 1]), parent: 0, children: [] },  // right wing
    ];
    const ibm = [ ibmTranslate(center[0], center[1], center[2]), ibmTranslate(center[0], center[1], center[2]), ibmTranslate(center[0], center[1], center[2]) ];
    const skin = { joints: [0, 1, 2], inverseBindMatrices: ibm, skeleton: 0 };
    const joints = new Uint8Array(vCount * 4), weights = new Float32Array(vCount * 4);
    let wingVerts = 0;
    for (let i = 0; i < vCount; i++) { const b = isWing(i) ? (wingVerts++, side(i)) : 0; joints[i * 4] = b; weights[i * 4] = 1; }
    let norm;
    if (normals && normals.length === pos.length) norm = normals instanceof Float32Array ? normals : new Float32Array(normals);
    else { norm = new Float32Array(pos.length); for (let i = 0; i < vCount; i++) norm[i * 3 + 1] = 1; }
    const inds = indices instanceof Uint32Array ? indices : new Uint32Array(indices);
    const animations = buildWingClip(fwd, opts);
    return { positions: pos, normals: norm, indices: inds, joints, weights, skin, nodes, animations,
        bounds: { minX: lo[0], minY: lo[1], minZ: lo[2], maxX: hi[0], maxY: hi[1], maxZ: hi[2] },
        vertexCount: vCount, indexCount: inds.length, spanAxis: span, flapAxis: fwd, wingVerts };
}

// Both wings flap together: left = -sine, right = +sine about the forward axis.
function buildWingClip(fwdAxis, opts) {
    const amp = opts.flapAmp ?? 0.55, period = opts.flapPeriod ?? 0.9, STEPS = 16;
    const mk = (A, P) => {
        const times = new Float32Array(STEPS + 1);
        for (let s = 0; s <= STEPS; s++) times[s] = (s / STEPS) * P;
        const samplers = [], channels = [];
        for (const { node, sign } of [{ node: 1, sign: -1 }, { node: 2, sign: 1 }]) {
            const values = new Float32Array((STEPS + 1) * 4);
            for (let s = 0; s <= STEPS; s++) { const q = quatAxis(fwdAxis, sign * A * Math.sin(2 * Math.PI * (s / STEPS))); values[s * 4] = q[0]; values[s * 4 + 1] = q[1]; values[s * 4 + 2] = q[2]; values[s * 4 + 3] = q[3]; }
            samplers.push({ times, values, interpolation: "LINEAR" });
            channels.push({ samplerIdx: samplers.length - 1, targetNode: node, path: "rotation" });
        }
        return { samplers, channels };
    };
    const flap = mk(amp, period), glide = mk(amp * 0.25, period * 2.2);
    return [
        { name: "flap", duration: period, samplers: flap.samplers, channels: flap.channels },
        { name: "glide", duration: period * 2.2, samplers: glide.samplers, channels: glide.channels },
    ];
}

/**
 * v1383 — fit a WHEEL rig to a vehicle mesh + bake a continuous-roll clip.
 * Detects up to 4 wheel clusters (lower band, near the front/back corners),
 * skins their verts to a bone at each cluster centre, and rolls those bones
 * about the axle (the lateral horizontal axis). Body verts ride a still root.
 * Same rig shape as buildSpineRigGeometry, so registerSpineRig installs it and
 * the existing SkeletalAnimator + GPU skinning animate it. Rest pose is identity
 * (node world * inverse-bind cancels), exactly like the spine rig.
 */
export function buildWheelRig(positions, indices, normals, opts = {}) {
    const pos = positions instanceof Float32Array ? positions : new Float32Array(positions);
    const vCount = pos.length / 3;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vCount; i++) for (let a = 0; a < 3; a++) { const v = pos[i * 3 + a]; if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }
    const ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    const center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    const fwd = (ext[0] >= ext[2]) ? 0 : 2;          // forward = longer horizontal
    const axle = (fwd === 0) ? 2 : 0;                // wheels roll about the other horizontal
    const halfF = Math.max(1e-4, ext[fwd] / 2), halfA = Math.max(1e-4, ext[axle] / 2);
    const yBand = lo[1] + (opts.wheelBand ?? 0.42) * ext[1];
    const fEdge = (opts.fwdEdge ?? 0.25) * halfF, aEdge = (opts.axleEdge ?? 0.20) * halfA;
    const isWheel = (i) => pos[i * 3 + 1] <= yBand && Math.abs(pos[i * 3 + fwd] - center[fwd]) > fEdge && Math.abs(pos[i * 3 + axle] - center[axle]) > aEdge;
    const quad = (i) => ((pos[i * 3 + fwd] >= center[fwd]) ? 1 : 0) + ((pos[i * 3 + axle] >= center[axle]) ? 2 : 0);
    const sum = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    let wheelVerts = 0;
    for (let i = 0; i < vCount; i++) { if (!isWheel(i)) continue; const q = quad(i); sum[q][0] += pos[i * 3]; sum[q][1] += pos[i * 3 + 1]; sum[q][2] += pos[i * 3 + 2]; sum[q][3]++; wheelVerts++; }
    const wc = [];
    for (let q = 0; q < 4; q++) {
        const t = sum[q];
        if (t[3] > 0) wc.push([t[0] / t[3], t[1] / t[3], t[2] / t[3]]);
        else { const fs = (q & 1) ? 1 : -1, as = (q & 2) ? 1 : -1; const p = center.slice(); p[fwd] = center[fwd] + fs * 0.6 * halfF; p[axle] = center[axle] + as * 0.6 * halfA; p[1] = lo[1] + 0.15 * ext[1]; wc.push(p); }
    }
    const IDENT = [0, 0, 0, 1];
    const nodes = [{ translation: new Float32Array(center), rotation: new Float32Array(IDENT), scale: new Float32Array([1, 1, 1]), parent: -1, children: [1, 2, 3, 4] }];
    for (let q = 0; q < 4; q++) nodes.push({ translation: new Float32Array([wc[q][0] - center[0], wc[q][1] - center[1], wc[q][2] - center[2]]), rotation: new Float32Array(IDENT), scale: new Float32Array([1, 1, 1]), parent: 0, children: [] });
    const ibm = [ibmTranslate(center[0], center[1], center[2])];
    for (let q = 0; q < 4; q++) ibm.push(ibmTranslate(wc[q][0], wc[q][1], wc[q][2]));
    const skin = { joints: [0, 1, 2, 3, 4], inverseBindMatrices: ibm, skeleton: 0 };
    const joints = new Uint8Array(vCount * 4), weights = new Float32Array(vCount * 4);
    for (let i = 0; i < vCount; i++) { joints[i * 4] = isWheel(i) ? quad(i) + 1 : 0; weights[i * 4] = 1; }
    let norm;
    if (normals && normals.length === pos.length) norm = normals instanceof Float32Array ? normals : new Float32Array(normals);
    else { norm = new Float32Array(pos.length); for (let i = 0; i < vCount; i++) norm[i * 3 + 1] = 1; }
    const inds = indices instanceof Uint32Array ? indices : new Uint32Array(indices);
    const animations = buildRollClip(axle, opts);
    return { positions: pos, normals: norm, indices: inds, joints, weights, skin, nodes, animations,
        bounds: { minX: lo[0], minY: lo[1], minZ: lo[2], maxX: hi[0], maxY: hi[1], maxZ: hi[2] },
        vertexCount: vCount, indexCount: inds.length, wheelAxis: axle, wheelVerts };
}

// Continuous roll: each wheel bone rotates a full turn about the axle over the
// period (LINEAR keyframes every 45 deg; the animator loops it).
function buildRollClip(axleAxis, opts) {
    const period = opts.rollPeriod ?? 1.4, STEPS = 8;
    const mk = (P) => {
        const times = new Float32Array(STEPS + 1);
        for (let s = 0; s <= STEPS; s++) times[s] = (s / STEPS) * P;
        const samplers = [], channels = [];
        for (let w = 1; w <= 4; w++) {
            const values = new Float32Array((STEPS + 1) * 4);
            for (let s = 0; s <= STEPS; s++) { const q = quatAxis(axleAxis, (s / STEPS) * 2 * Math.PI); values[s * 4] = q[0]; values[s * 4 + 1] = q[1]; values[s * 4 + 2] = q[2]; values[s * 4 + 3] = q[3]; }
            samplers.push({ times, values, interpolation: "LINEAR" });
            channels.push({ samplerIdx: samplers.length - 1, targetNode: w, path: "rotation" });
        }
        return { samplers, channels };
    };
    const roll = mk(period), idle = mk(period * 2.5);
    return [
        { name: "roll", duration: period, samplers: roll.samplers, channels: roll.channels },
        { name: "idle", duration: period * 2.5, samplers: idle.samplers, channels: idle.channels },
    ];
}

/**
 * Procedural fish / eel body — a tapered, laterally-flattened tube along
 * +X with rounded end caps. Good rig demo even with no OBJ to hand.
 */
export function makeFishMesh(opts = {}) {
    const length = opts.length ?? 6;
    const maxR = opts.maxRadius ?? 0.9;
    const sides = opts.sides ?? 10;
    const rings = opts.rings ?? 18;
    const eel = !!opts.eel;
    // Radius profile along the body (u: 0 head → 1 tail).
    const profile = opts.profile || (eel
        ? (u => Math.max(0.12, Math.sin(Math.PI * Math.min(1, u * 1.05)) * 0.45 + 0.25))     // long, near-uniform
        : (u => Math.max(0.05, Math.pow(Math.sin(Math.PI * u), 0.7) * (1 - 0.35 * u))));      // fat middle, tapered tail

    const positions = [];
    const normals = [];
    const ringStart = [];
    for (let s = 0; s < rings; s++) {
        const u = s / (rings - 1);
        const x = -length / 2 + u * length;
        const r = maxR * profile(u);
        ringStart.push(positions.length / 3);
        for (let j = 0; j < sides; j++) {
            const a = (j / sides) * Math.PI * 2;
            const y = r * 1.35 * Math.cos(a);   // taller than wide → fish cross-section
            const z = r * 0.65 * Math.sin(a);
            positions.push(x, y, z);
            const nl = Math.hypot(0, y, z) || 1;
            normals.push(0, y / nl, z / nl);
        }
    }
    const indices = [];
    for (let s = 0; s < rings - 1; s++) {
        for (let j = 0; j < sides; j++) {
            const a = ringStart[s] + j;
            const b = ringStart[s] + (j + 1) % sides;
            const c = ringStart[s + 1] + j;
            const d = ringStart[s + 1] + (j + 1) % sides;
            indices.push(a, c, b, b, c, d);
        }
    }
    // End caps (fan to a center vertex at head and tail).
    const headC = positions.length / 3;
    positions.push(-length / 2, 0, 0); normals.push(-1, 0, 0);
    for (let j = 0; j < sides; j++) indices.push(headC, ringStart[0] + (j + 1) % sides, ringStart[0] + j);
    const tailC = positions.length / 3;
    positions.push(length / 2, 0, 0); normals.push(1, 0, 0);
    const last = ringStart[rings - 1];
    for (let j = 0; j < sides; j++) indices.push(tailC, last + j, last + (j + 1) % sides);

    return {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        // v672 — always Uint32Array, matches the EntityMeshRenderer UNSIGNED_INT contract.
        indices: new Uint32Array(indices),
    };
}

/**
 * Upload a rig (from buildSpineRigGeometry) into an asset loader's cache
 * under `name`, so anim.spawn(x,z,scale,name) plays it. Mirrors the field
 * shape of proceduralTestRig's mesh object.
 */
export function registerSpineRig(assetLoader, name, geom, color) {
    if (!assetLoader || !assetLoader.gl || !assetLoader.cache) return null;
    const gl = assetLoader.gl;
    const arrBuf = (data) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; };

    const vbo = arrBuf(geom.positions);
    const nbo = arrBuf(geom.normals);
    const jbo = arrBuf(geom.joints);
    const wbo = arrBuf(geom.weights);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geom.indices, gl.STATIC_DRAW);

    let cbo = null, hasColors = false;
    if (color) {
        let cols;
        if (color instanceof Float32Array && color.length === geom.vertexCount * 3) {
            cols = color;   // v439 — preserve the source mesh's own vertex colors
        } else {
            cols = new Float32Array(geom.vertexCount * 3);
            for (let i = 0; i < geom.vertexCount; i++) { cols[i * 3] = color[0]; cols[i * 3 + 1] = color[1]; cols[i * 3 + 2] = color[2]; }
        }
        cbo = arrBuf(cols); hasColors = true;
    }

    const mesh = {
        name, vbo, ibo, nbo, cbo, tbo: null, texture: null,
        hasNormals: true, hasColors, hasTexture: false, hasTexCoords: false,
        vertexCount: geom.vertexCount, indexCount: geom.indexCount,
        bounds: geom.bounds,
        skin: geom.skin, animations: geom.animations, nodes: geom.nodes,
        jointsData: geom.joints, weightsData: geom.weights,
        isRigged: true, jbo, wbo,
        jointsComponentType: gl.UNSIGNED_BYTE,
        _rawPositions: geom.positions, _rawIndices: geom.indices, _rawNormals: geom.normals,
    };
    assetLoader.cache.set(name, mesh);
    return mesh;
}

// ======================================================================
// v437 — LIMBED CREATURE RIG (hexapod). The spine is the backbone; legs
// are short bone chains parented to spine nodes. A baked "walk" clip runs
// an alternating-tripod insect gait (two sets of 3 legs in antiphase),
// each leg swinging fore/aft (hip yaw) and lifting on its swing half (hip
// pitch + knee tuck). Generates its own body + legs so skinning is exact.
// Output is the same rigged-asset shape as buildSpineRigGeometry.
// ======================================================================

function quatMul(a, b) {   // Hamilton product, both [x,y,z,w]
    return new Float32Array([
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ]);
}

// Append a tapered tube from p0→p1 into the given arrays; returns the
// per-vertex fraction (0 at p0 .. 1 at p1) so the caller can skin it.
function appendTube(out, p0, p1, r0, r1, sides, segs) {
    const dir = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const len = Math.hypot(...dir) || 1;
    const fwd = [dir[0] / len, dir[1] / len, dir[2] / len];
    // build an orthonormal basis (u,v) perpendicular to fwd
    let up = Math.abs(fwd[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = [
        fwd[1] * up[2] - fwd[2] * up[1],
        fwd[2] * up[0] - fwd[0] * up[2],
        fwd[0] * up[1] - fwd[1] * up[0],
    ];
    const ul = Math.hypot(...u) || 1; u[0] /= ul; u[1] /= ul; u[2] /= ul;
    const v = [
        fwd[1] * u[2] - fwd[2] * u[1],
        fwd[2] * u[0] - fwd[0] * u[2],
        fwd[0] * u[1] - fwd[1] * u[0],
    ];
    const ringStart = [];
    const fracs = [];
    for (let s = 0; s <= segs; s++) {
        const f = s / segs;
        const cx = p0[0] + dir[0] * f, cy = p0[1] + dir[1] * f, cz = p0[2] + dir[2] * f;
        const r = r0 + (r1 - r0) * f;
        ringStart.push(out.positions.length / 3);
        for (let j = 0; j < sides; j++) {
            const a = (j / sides) * Math.PI * 2;
            const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
            const px = cx + u[0] * ca + v[0] * sa;
            const py = cy + u[1] * ca + v[1] * sa;
            const pz = cz + u[2] * ca + v[2] * sa;
            out.positions.push(px, py, pz);
            const nl = Math.hypot(u[0] * ca + v[0] * sa, u[1] * ca + v[1] * sa, u[2] * ca + v[2] * sa) || 1;
            out.normals.push((u[0] * ca + v[0] * sa) / nl, (u[1] * ca + v[1] * sa) / nl, (u[2] * ca + v[2] * sa) / nl);
            fracs.push(f);
        }
    }
    for (let s = 0; s < segs; s++) {
        for (let j = 0; j < sides; j++) {
            const a = ringStart[s] + j, b = ringStart[s] + (j + 1) % sides;
            const c = ringStart[s + 1] + j, d = ringStart[s + 1] + (j + 1) % sides;
            out.indices.push(a, c, b, b, c, d);
        }
    }
    return fracs;
}

export function buildHexapodRig(opts = {}) {
    const L = opts.length ?? 6;
    const bodyR = opts.bodyRadius ?? 0.7;
    const legLen = opts.legLength ?? 2.4;
    const sides = opts.sides ?? 6;
    const S = 5;                       // spine nodes
    const PAIRS = 3;                   // → 6 legs
    const bendAmt = 0;                 // (rest rotations identity)

    const xS = (k) => -L / 2 + k * (L / (S - 1));
    // Leg attachment spine nodes (front/mid/back) = 1,2,3.
    const spineForPair = [1, 2, 3];

    // ---- nodes -----------------------------------------------------------
    const IDENT = [0, 0, 0, 1];
    const nodes = [];
    const restWorld = [];
    // spine chain
    for (let k = 0; k < S; k++) {
        const t = (k === 0) ? [xS(0), 0, 0] : [L / (S - 1), 0, 0];
        nodes.push({ translation: new Float32Array(t), rotation: new Float32Array(IDENT),
                     scale: new Float32Array([1, 1, 1]), parent: k - 1, children: [] });
        restWorld.push([xS(k), 0, 0]);
    }
    for (let k = 1; k < S; k++) nodes[k - 1].children.push(k);

    // legs: for each pair, left(-Z) and right(+Z); hip + shin nodes.
    const legInfo = [];   // {hipNode, shinNode, hipWorld, footWorld, group, p, side}
    for (let p = 0; p < PAIRS; p++) {
        const sp = spineForPair[p];
        for (let si = 0; si < 2; si++) {
            const side = si === 0 ? -1 : 1;
            const hipW = [xS(sp), -bodyR * 0.4, side * (bodyR + 0.05)];
            const kneeW = [xS(sp), -bodyR - legLen * 0.45, side * (bodyR + legLen * 0.32)];
            const footW = [xS(sp), -bodyR - legLen, side * (bodyR + legLen * 0.42)];
            const hipNode = nodes.length;
            nodes.push({ translation: new Float32Array([hipW[0] - restWorld[sp][0], hipW[1] - restWorld[sp][1], hipW[2] - restWorld[sp][2]]),
                         rotation: new Float32Array(IDENT), scale: new Float32Array([1, 1, 1]), parent: sp, children: [] });
            restWorld.push(hipW);
            const shinNode = nodes.length;
            nodes.push({ translation: new Float32Array([kneeW[0] - hipW[0], kneeW[1] - hipW[1], kneeW[2] - hipW[2]]),
                         rotation: new Float32Array(IDENT), scale: new Float32Array([1, 1, 1]), parent: hipNode, children: [] });
            restWorld.push(kneeW);
            nodes[sp].children.push(hipNode);
            nodes[hipNode].children.push(shinNode);
            legInfo.push({ hipNode, shinNode, hipW, kneeW, footW, group: (p + si) % 2, p, side });
        }
    }

    const N = nodes.length;
    const skin = {
        joints: Array.from({ length: N }, (_, k) => k),
        inverseBindMatrices: restWorld.map(p => ibmTranslate(p[0], p[1], p[2])),
        skeleton: 0,
    };

    // ---- geometry + skin weights ----------------------------------------
    const out = { positions: [], normals: [], indices: [] };
    const jointA = [], jointB = [], wA = [];   // per-vertex 2-bone blend

    // torso: tube along X, skinned to the spine (2-bone blend by x)
    const seg = L / (S - 1);
    const torsoFracs = appendTube(out, [-L / 2, 0, 0], [L / 2, 0, 0], bodyR * 0.85, bodyR * 0.7, sides + 2, S * 2);
    for (let i = 0; i < torsoFracs.length; i++) {
        const x = -L / 2 + torsoFracs[i] * L;
        let f = (x - xS(0)) / seg; if (f < 0) f = 0; if (f > S - 1) f = S - 1;
        const j0 = Math.min(Math.floor(f), S - 1), j1 = Math.min(j0 + 1, S - 1);
        const w1 = (j0 === j1) ? 0 : f - j0;
        jointA.push(j0); jointB.push(j1); wA.push(1 - w1);
    }
    // legs: tube hip→foot (through knee region); skin upper→hip, lower→shin
    for (const leg of legInfo) {
        const fr = appendTube(out, leg.hipW, leg.footW, 0.22, 0.1, sides, 4);
        for (let i = 0; i < fr.length; i++) {
            const f = fr[i];                      // 0 hip .. 1 foot
            if (f < 0.45) { jointA.push(leg.hipNode); jointB.push(leg.hipNode); wA.push(1); }
            else if (f > 0.6) { jointA.push(leg.shinNode); jointB.push(leg.shinNode); wA.push(1); }
            else { const t = (f - 0.45) / 0.15; jointA.push(leg.hipNode); jointB.push(leg.shinNode); wA.push(1 - t); }
        }
    }

    const vCount = out.positions.length / 3;
    const joints = new Uint8Array(vCount * 4);
    const weights = new Float32Array(vCount * 4);
    for (let i = 0; i < vCount; i++) {
        joints[i * 4] = jointA[i]; joints[i * 4 + 1] = jointB[i];
        weights[i * 4] = wA[i]; weights[i * 4 + 1] = 1 - wA[i];
    }

    // ---- gait clips ------------------------------------------------------
    const animations = buildWalkClips(legInfo, opts);

    const positions = new Float32Array(out.positions);
    const normals = new Float32Array(out.normals);
    const indices = new Uint32Array(out.indices);   // EntityMeshRenderer hardcodes gl.UNSIGNED_INT
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vCount; i++) for (let a = 0; a < 3; a++) { const v = positions[i * 3 + a]; if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }

    return {
        positions, normals, indices, joints, weights, skin, nodes, animations,
        bounds: { minX: lo[0], minY: lo[1], minZ: lo[2], maxX: hi[0], maxY: hi[1], maxZ: hi[2] },
        vertexCount: vCount, indexCount: indices.length,
        jointCount: N, legCount: legInfo.length, kind: "hexapod",
        legs: legInfo.map(l => ({ hipNode: l.hipNode, shinNode: l.shinNode, footW: l.footW, group: l.group, side: l.side })),
    };
}

function buildWalkClips(legInfo, opts) {
    const swingAmp = opts.swingAmp ?? 0.5;     // fore/aft hip yaw
    const liftAmp = opts.liftAmp ?? 0.6;       // hip pitch on swing half
    const kneeAmp = opts.kneeAmp ?? 0.7;       // knee tuck on swing half
    const STEPS = 16;

    const make = (period, sa, la, ka) => {
        const times = new Float32Array(STEPS + 1);
        for (let s = 0; s <= STEPS; s++) times[s] = (s / STEPS) * period;
        const samplers = [], channels = [];
        for (const leg of legInfo) {
            const ph = leg.group === 0 ? 0 : Math.PI;
            // hip = yaw(swing) ∘ pitch(lift)
            const hipVals = new Float32Array((STEPS + 1) * 4);
            const shinVals = new Float32Array((STEPS + 1) * 4);
            for (let s = 0; s <= STEPS; s++) {
                const t = (s / STEPS) * period;
                const ang = 2 * Math.PI * (t / period) + ph;
                const swing = sa * Math.cos(ang);
                const raw = Math.sin(ang);
                const lift = raw > 0 ? raw * la : 0;
                const knee = raw > 0 ? raw * ka : 0;
                const q = quatMul(quatAxis(1, swing * leg.side), quatAxis(2, -lift * leg.side));
                hipVals[s * 4] = q[0]; hipVals[s * 4 + 1] = q[1]; hipVals[s * 4 + 2] = q[2]; hipVals[s * 4 + 3] = q[3];
                const qk = quatAxis(2, knee * leg.side);
                shinVals[s * 4] = qk[0]; shinVals[s * 4 + 1] = qk[1]; shinVals[s * 4 + 2] = qk[2]; shinVals[s * 4 + 3] = qk[3];
            }
            samplers.push({ times, values: hipVals, interpolation: "LINEAR" });
            channels.push({ samplerIdx: samplers.length - 1, targetNode: leg.hipNode, path: "rotation" });
            samplers.push({ times, values: shinVals, interpolation: "LINEAR" });
            channels.push({ samplerIdx: samplers.length - 1, targetNode: leg.shinNode, path: "rotation" });
        }
        return { samplers, channels };
    };

    const walk = make(opts.period ?? 0.9, swingAmp, liftAmp, kneeAmp);
    const idle = make((opts.period ?? 0.9) * 2.2, swingAmp * 0.12, liftAmp * 0.1, kneeAmp * 0.15);
    return [
        { name: "walk", duration: opts.period ?? 0.9, samplers: walk.samplers, channels: walk.channels },
        { name: "idle", duration: (opts.period ?? 0.9) * 2.2, samplers: idle.samplers, channels: idle.channels },
    ];
}

// ======================================================================
// v665 / Round 170 — MULTI-LEG RIG. Generalization of buildHexapodRig
// to N leg pairs along a long spine, with three selectable gaits:
//
//   • "metachronal" (default) — wave of leg lifts propagates along the
//     body, front-to-back. The natural gait for centipedes/millipedes.
//     `waves` controls how many full wave cycles are visible on the body
//     at once (2 looks good for ~20 leg pairs; 1 for shorter creatures).
//   • "tripod" — 6-leg insect alternating-tripod gait (matches the
//     existing hexapod). Pairs alternate even/odd; left/right within a
//     pair are antiphase. Good for 6 to maybe 10 legs.
//   • "trot" — diagonal pairs together. Quadruped-style (4 legs).
//
// The geometry is the same as the hexapod: torso = tapered tube along X
// skinned to the spine (2-bone blend), legs = tapered tubes hip→foot
// skinned to a 2-joint chain (hip + shin). The clip animates each leg's
// hip + shin rotations sinusoidally with the phase determined by the
// gait formula.
//
// Returns the same shape as buildHexapodRig, so registerSpineRig +
// the existing rigged-asset pipeline consume it transparently.
//
// Example calls (wired in main.js):
//   rig.multiLeg({ legPairs: 21, gait: "metachronal" })   // millipede-ish
//   rig.multiLeg({ legPairs: 4, gait: "trot" })           // quadruped
//   rig.multiLeg({ legPairs: 4, gait: "tripod" })         // spider
// ======================================================================
export function buildMultiLegRig(opts = {}) {
    const PAIRS  = Math.max(2, Math.min(64, opts.legPairs ?? 8));   // 4 legs to 128
    const L      = opts.length     ?? (PAIRS * 0.55 + 2);
    const bodyR  = opts.bodyRadius ?? 0.4;
    const legLen = opts.legLength  ?? 1.4;
    const sides  = opts.sides      ?? 6;
    const gait   = opts.gait       ?? "metachronal";
    const waves  = Math.max(0.5, opts.waves ?? 2);    // metachronal: visible waves on body
    const period = opts.period     ?? 0.7;

    // Round 171 / v666 — joint budget management. The skinning shader has a
    // hard cap of 128 joints (uniform mat4 uJointMatrices[128]). The naïve
    // "S = legPairs + 2" math blew past that on the user's 21-pair centipede
    // (107 joints fit but 23 spine + 84 leg = barely; for millipede 42 pairs
    // → 178 joints would never fit). Two-step fix:
    //   1. Cap spine nodes at 10. A long body doesn't need a node per leg —
    //      legs share spine attachment points fine (the metachronal phase
    //      math is per-pair-index, not per-spine-node).
    //   2. If we're still over budget, drop the shin joint and use 1-joint
    //      legs (hip-only). The knee tuck becomes part of the hip rotation
    //      animation. Visual quality drop for high-leg counts; the legs
    //      become straighter sticks, but a millipede's legs are sticks
    //      anyway. Hexapod / spider quality is unaffected (those need shins
    //      for the bigger knee flex).
    const JOINT_LIMIT = 128;
    const S = Math.max(5, Math.min(10, PAIRS + 2));
    // Decide shin policy up front so the budget is known
    const TWO_JOINT_LEGS_BUDGET = S + PAIRS * 2 * 2;   // hip + shin per leg, 2 sides
    const ONE_JOINT_LEGS_BUDGET = S + PAIRS * 2 * 1;
    let useShin = TWO_JOINT_LEGS_BUDGET <= JOINT_LIMIT - 4;     // -4 safety margin
    if (!useShin && ONE_JOINT_LEGS_BUDGET > JOINT_LIMIT - 4) {
        throw new Error(`buildMultiLegRig: ${PAIRS} leg pairs requires ${ONE_JOINT_LEGS_BUDGET} joints even with single-joint legs — over the ${JOINT_LIMIT}-joint shader limit. Try legPairs <= ${Math.floor((JOINT_LIMIT - 4 - S) / 2)}.`);
    }

    const xS = (k) => -L / 2 + k * (L / (S - 1));
    // Distribute leg pairs across spine nodes 1 .. S-2 (skip head/tail).
    // Many pairs may share the same spine node when PAIRS > S-2; that's
    // expected — phase comes from the pair index, not the attachment node.
    const spineForPair = [];
    for (let p = 0; p < PAIRS; p++) {
        const frac = (PAIRS === 1) ? 0.5 : p / (PAIRS - 1);
        spineForPair.push(Math.round(1 + frac * (S - 3)));
    }

    // ---- nodes (spine chain + 1 or 2 leg-joints per leg) -----------------
    const IDENT = [0, 0, 0, 1];
    const nodes = [];
    const restWorld = [];
    for (let k = 0; k < S; k++) {
        const t = (k === 0) ? [xS(0), 0, 0] : [L / (S - 1), 0, 0];
        nodes.push({ translation: new Float32Array(t), rotation: new Float32Array(IDENT),
                     scale: new Float32Array([1, 1, 1]), parent: k - 1, children: [] });
        restWorld.push([xS(k), 0, 0]);
    }
    for (let k = 1; k < S; k++) nodes[k - 1].children.push(k);

    const legInfo = [];   // {hipNode, shinNode, hipW, footW, p, side}
    for (let p = 0; p < PAIRS; p++) {
        const sp = spineForPair[p];
        for (let si = 0; si < 2; si++) {
            const side = si === 0 ? -1 : 1;
            const hipW  = [xS(sp),  -bodyR * 0.4, side * (bodyR + 0.05)];
            const kneeW = [xS(sp),  -bodyR - legLen * 0.45, side * (bodyR + legLen * 0.32)];
            const footW = [xS(sp),  -bodyR - legLen,        side * (bodyR + legLen * 0.42)];
            const hipNode = nodes.length;
            nodes.push({ translation: new Float32Array([hipW[0] - restWorld[sp][0], hipW[1] - restWorld[sp][1], hipW[2] - restWorld[sp][2]]),
                         rotation: new Float32Array(IDENT), scale: new Float32Array([1, 1, 1]), parent: sp, children: [] });
            restWorld.push(hipW);
            nodes[sp].children.push(hipNode);
            // Shin only when budget allows
            let shinNode = hipNode;   // single-joint legs reuse the hip node
            if (useShin) {
                shinNode = nodes.length;
                nodes.push({ translation: new Float32Array([kneeW[0] - hipW[0], kneeW[1] - hipW[1], kneeW[2] - hipW[2]]),
                             rotation: new Float32Array(IDENT), scale: new Float32Array([1, 1, 1]), parent: hipNode, children: [] });
                restWorld.push(kneeW);
                nodes[hipNode].children.push(shinNode);
            }
            legInfo.push({ hipNode, shinNode, hipW, kneeW, footW, p, side });
        }
    }

    const N = nodes.length;
    if (N > JOINT_LIMIT) {
        // Shouldn't happen given the budget math above, but defense-in-depth.
        throw new Error(`buildMultiLegRig: assembled ${N} joints, exceeds ${JOINT_LIMIT}-joint shader limit (internal inconsistency)`);
    }
    const skin = {
        joints: Array.from({ length: N }, (_, k) => k),
        inverseBindMatrices: restWorld.map(p => ibmTranslate(p[0], p[1], p[2])),
        skeleton: 0,
    };

    // ---- geometry + skin weights -----------------------------------------
    const out = { positions: [], normals: [], indices: [] };
    const jointA = [], jointB = [], wA = [];

    // torso: tapered tube along the X axis, skinned to spine (2-bone blend)
    const seg = L / (S - 1);
    const torsoFracs = appendTube(out, [-L / 2, 0, 0], [L / 2, 0, 0], bodyR * 0.85, bodyR * 0.7, sides + 2, S * 2);
    for (let i = 0; i < torsoFracs.length; i++) {
        const x = -L / 2 + torsoFracs[i] * L;
        let f = (x - xS(0)) / seg; if (f < 0) f = 0; if (f > S - 1) f = S - 1;
        const j0 = Math.min(Math.floor(f), S - 1), j1 = Math.min(j0 + 1, S - 1);
        const w1 = (j0 === j1) ? 0 : f - j0;
        jointA.push(j0); jointB.push(j1); wA.push(1 - w1);
    }
    // legs: hip→foot tubes. With shin: upper→hip, lower→shin, soft knee blend.
    // Without shin: all bound to the hip (legs become straight sticks).
    for (const leg of legInfo) {
        const fr = appendTube(out, leg.hipW, leg.footW, 0.18, 0.08, sides, 4);
        for (let i = 0; i < fr.length; i++) {
            const f = fr[i];
            if (!useShin) {
                // Single-joint leg — all verts on the hip.
                jointA.push(leg.hipNode); jointB.push(leg.hipNode); wA.push(1);
            } else if (f < 0.45)      { jointA.push(leg.hipNode);  jointB.push(leg.hipNode);  wA.push(1); }
            else if (f > 0.6)         { jointA.push(leg.shinNode); jointB.push(leg.shinNode); wA.push(1); }
            else                       { const t = (f - 0.45) / 0.15; jointA.push(leg.hipNode); jointB.push(leg.shinNode); wA.push(1 - t); }
        }
    }

    const vCount = out.positions.length / 3;
    const joints = new Uint8Array(vCount * 4);
    const weights = new Float32Array(vCount * 4);
    for (let i = 0; i < vCount; i++) {
        joints[i * 4]     = jointA[i]; joints[i * 4 + 1] = jointB[i];
        weights[i * 4]    = wA[i];     weights[i * 4 + 1] = 1 - wA[i];
    }

    // ---- gait clips (walk + idle + run) ---------------------------------
    const animations = buildMultiLegClips(legInfo, PAIRS, gait, waves, opts, useShin);

    const positions = new Float32Array(out.positions);
    const normals   = new Float32Array(out.normals);
    const indices   = new Uint32Array(out.indices);   // EntityMeshRenderer hardcodes gl.UNSIGNED_INT
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vCount; i++) {
        for (let a = 0; a < 3; a++) {
            const v = positions[i * 3 + a];
            if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v;
        }
    }

    return {
        positions, normals, indices, joints, weights, skin, nodes, animations,
        bounds: { minX: lo[0], minY: lo[1], minZ: lo[2], maxX: hi[0], maxY: hi[1], maxZ: hi[2] },
        vertexCount: vCount, indexCount: indices.length,
        jointCount: N, legCount: legInfo.length, kind: "multi_leg", gait, useShin,
        legs: legInfo.map(l => ({ hipNode: l.hipNode, shinNode: l.shinNode, footW: l.footW, p: l.p, side: l.side })),
    };
}

// Phase per leg in [0, 2π). Drives the swing/lift sinusoid.
function multiLegPhase(p, side, gait, totalPairs, waves) {
    if (gait === "tripod") {
        // hexapod-style: pair-parity + side-parity gives 2 groups in antiphase
        return (((p + (side === 1 ? 1 : 0)) % 2) === 0) ? 0 : Math.PI;
    }
    if (gait === "trot") {
        // diagonal trot: pair 0 left + pair 1 right move together
        const diag = ((p % 2) === 0) === (side === -1);
        return diag ? 0 : Math.PI;
    }
    // metachronal — wave propagating along the body, left+right of a
    // pair synchronized so the ripple looks coherent from above
    return (p / totalPairs) * 2 * Math.PI * waves;
}

function buildMultiLegClips(legInfo, totalPairs, gait, waves, opts, useShin) {
    const swingAmp = opts.swingAmp ?? 0.5;
    const liftAmp  = opts.liftAmp  ?? 0.6;
    const kneeAmp  = opts.kneeAmp  ?? 0.7;
    const STEPS    = 16;

    const make = (period, sa, la, ka, gaitName) => {
        const times = new Float32Array(STEPS + 1);
        for (let s = 0; s <= STEPS; s++) times[s] = (s / STEPS) * period;
        const samplers = [], channels = [];
        for (const leg of legInfo) {
            const ph = multiLegPhase(leg.p, leg.side, gaitName, totalPairs, waves);
            const hipVals  = new Float32Array((STEPS + 1) * 4);
            const shinVals = useShin ? new Float32Array((STEPS + 1) * 4) : null;
            for (let s = 0; s <= STEPS; s++) {
                const t = (s / STEPS) * period;
                const ang   = 2 * Math.PI * (t / period) + ph;
                const swing = sa * Math.cos(ang);
                const raw   = Math.sin(ang);
                const lift  = raw > 0 ? raw * la : 0;
                const knee  = raw > 0 ? raw * ka : 0;
                // When the shin joint is absent (single-joint legs), bake a
                // little extra lift into the hip so the leg still looks
                // animated. Knee tuck visual is lost but the rhythm is kept.
                const hipLift = useShin ? lift : (lift + knee * 0.3);
                const q  = quatMul(quatAxis(1, swing * leg.side), quatAxis(2, -hipLift * leg.side));
                hipVals[s * 4]     = q[0]; hipVals[s * 4 + 1] = q[1]; hipVals[s * 4 + 2] = q[2]; hipVals[s * 4 + 3] = q[3];
                if (useShin) {
                    const qk = quatAxis(2, knee * leg.side);
                    shinVals[s * 4]    = qk[0]; shinVals[s * 4 + 1] = qk[1]; shinVals[s * 4 + 2] = qk[2]; shinVals[s * 4 + 3] = qk[3];
                }
            }
            samplers.push({ times, values: hipVals,  interpolation: "LINEAR" });
            channels.push({ samplerIdx: samplers.length - 1, targetNode: leg.hipNode,  path: "rotation" });
            if (useShin && shinVals) {
                samplers.push({ times, values: shinVals, interpolation: "LINEAR" });
                channels.push({ samplerIdx: samplers.length - 1, targetNode: leg.shinNode, path: "rotation" });
            }
        }
        return { samplers, channels };
    };

    const period = opts.period ?? 0.7;
    const walk = make(period,         swingAmp,        liftAmp,        kneeAmp,        gait);
    const idle = make(period * 2.4,   swingAmp * 0.1,  liftAmp * 0.08, kneeAmp * 0.12, gait);
    const run  = make(period * 0.55,  swingAmp * 1.3,  liftAmp * 1.2,  kneeAmp * 1.15, gait);
    return [
        { name: "walk", duration: period,         samplers: walk.samplers, channels: walk.channels },
        { name: "idle", duration: period * 2.4,   samplers: idle.samplers, channels: idle.channels },
        { name: "run",  duration: period * 0.55,  samplers: run.samplers,  channels: run.channels  },
    ];
}

// ============================================================
// Round 172 / v667 — GLB-leg-cloning
// ------------------------------------------------------------
// Take a leg-shaped subtree from a parsed GLB and clone it N times along
// a new spine to make a centipede/spider/quadruped that LOOKS LIKE the
// source GLB's legs. The body is procedural (same torso tube as
// buildMultiLegRig) — only the legs are GLB-derived. This keeps the
// scope tight: leg appearance comes from the GLB, gait/spine/body stay
// procedural so the metachronal phase math, joint budget, and animation
// pipeline all reuse buildMultiLegRig's proven path.
//
// Heuristic leg-joint detection (in priority order):
//   1. Caller-provided opts.legHipJoint (joint name or index)
//   2. Joints with names matching /upperleg|thigh|hip(?!s)/i → hip
//      (and corresponding /(lowerleg|shin|calf|knee)/i → shin)
//   3. Lowest-Y joint in rest pose → "foot", walk up 2 levels to hip
//   4. Failure → throw with a clear message ("source GLB has no
//      identifiable leg chain; try buildMultiLegRig() for procedural legs")
//
// The "shin" detection is best-effort. If we can't find a shin joint
// below the hip, we treat the whole leg as a single hip-bound chunk
// (no knee flex).
// ============================================================

function _glbFindLegJoints(srcMesh, opts = {}) {
    const nodes = srcMesh?.nodes || [];
    const skin  = srcMesh?.skin;
    if (!nodes.length || !skin?.joints?.length) return null;

    // Build per-node rest-world Y for the "lowest joint = foot" heuristic.
    // Nodes carry local translations; walk parents to compose world Y.
    const worldY = new Array(nodes.length).fill(0);
    const seen = new Array(nodes.length).fill(false);
    const calcY = (idx) => {
        if (idx < 0 || idx >= nodes.length || seen[idx]) return worldY[idx] || 0;
        const n = nodes[idx];
        const py = (n.parent != null && n.parent >= 0) ? calcY(n.parent) : 0;
        worldY[idx] = py + ((n.translation && n.translation[1]) || 0);
        seen[idx] = true;
        return worldY[idx];
    };
    for (let i = 0; i < nodes.length; i++) calcY(i);

    // Helper: case-insensitive name match against a regex
    const nameOf = (i) => (nodes[i]?.name || `node_${i}`).toLowerCase();
    const matchByRegex = (rx) => {
        for (const jIdx of skin.joints) {
            if (rx.test(nameOf(jIdx))) return jIdx;
        }
        return -1;
    };

    let hipNodeIdx = -1, shinNodeIdx = -1;

    // Priority 1: caller-provided
    if (opts.legHipJoint != null) {
        if (typeof opts.legHipJoint === "number") hipNodeIdx = opts.legHipJoint;
        else hipNodeIdx = matchByRegex(new RegExp("^" + opts.legHipJoint + "$", "i"));
    }
    if (opts.legShinJoint != null) {
        if (typeof opts.legShinJoint === "number") shinNodeIdx = opts.legShinJoint;
        else shinNodeIdx = matchByRegex(new RegExp("^" + opts.legShinJoint + "$", "i"));
    }

    // Priority 2: name-based detection
    if (hipNodeIdx < 0) {
        // v669 — added plain "leg" with negative lookahead/lookbehind so
        // "leftLeg"/"rightLeg"/"UpperLeg" match as hip but "LowerLeg"/
        // "leg_shin"/etc. don't. RobotExpressive uses bare "leftLeg" + "rightLeg"
        // which the previous regex missed entirely.
        hipNodeIdx = matchByRegex(/upperleg|thigh|hip(?!s)|(?<!lower)leg(?!_lower|_shin|_calf|_knee)/i);
    }
    if (shinNodeIdx < 0) {
        shinNodeIdx = matchByRegex(/lowerleg|shin|calf|knee/i);
    }

    // Priority 3: lowest-Y joint = foot, walk up to hip
    if (hipNodeIdx < 0) {
        let lowestY = Infinity, lowestIdx = -1;
        for (const jIdx of skin.joints) {
            if (worldY[jIdx] < lowestY) { lowestY = worldY[jIdx]; lowestIdx = jIdx; }
        }
        if (lowestIdx >= 0) {
            // Walk up: foot -> shin (parent) -> hip (grandparent)
            const footIdx = lowestIdx;
            const shinParent = nodes[footIdx]?.parent;
            if (shinParent != null && shinParent >= 0) {
                shinNodeIdx = shinParent;
                const hipParent = nodes[shinParent]?.parent;
                if (hipParent != null && hipParent >= 0) {
                    hipNodeIdx = hipParent;
                }
            }
        }
    }

    if (hipNodeIdx < 0) return null;
    return { hipNodeIdx, shinNodeIdx };
}

// Extract leg vertices from srcMesh, returning positions in hip-local space.
// Triangles are kept only if ALL 3 vertices are leg-weighted (otherwise
// we'd drag in torso geometry attached to the hip).
function _glbExtractLeg(srcMesh, legJoints) {
    const { hipNodeIdx, shinNodeIdx } = legJoints;
    const positions = srcMesh.positions;
    const normals   = srcMesh.normals || null;
    const indices   = srcMesh.indices;
    const joints    = srcMesh.joints;
    const weights   = srcMesh.weights;
    const skin      = srcMesh.skin;

    // The skin's joints[] is a list of node indices. The vertex joint
    // attribute stores INDICES INTO skin.joints[], not node indices.
    // So map node→skin index for fast leg-weight detection.
    const skinIdxOf = new Map();
    skin.joints.forEach((nodeIdx, sIdx) => skinIdxOf.set(nodeIdx, sIdx));
    const hipSkinIdx  = skinIdxOf.get(hipNodeIdx);
    const shinSkinIdx = shinNodeIdx >= 0 ? skinIdxOf.get(shinNodeIdx) : -1;

    // Per-vertex leg-affinity: sum of weights bound to hip OR shin joints.
    const vCount = positions.length / 3;
    const legWeight = new Float32Array(vCount);
    const dominantOnShin = new Uint8Array(vCount);
    for (let v = 0; v < vCount; v++) {
        let totalLeg = 0, hipW = 0, shinW = 0;
        for (let k = 0; k < 4; k++) {
            const j = joints[v * 4 + k];
            const w = weights[v * 4 + k];
            if (j === hipSkinIdx)  { totalLeg += w; hipW  += w; }
            if (j === shinSkinIdx && shinSkinIdx >= 0) { totalLeg += w; shinW += w; }
        }
        legWeight[v] = totalLeg;
        dominantOnShin[v] = (shinW > hipW) ? 1 : 0;
    }

    // Apply hip's inverse-bind so leg vertices live in hip-local space.
    // skin.inverseBindMatrices[] is parallel to skin.joints[], so we want
    // the entry at hipSkinIdx. Each entry is a Float32Array(16).
    const IBM = skin.inverseBindMatrices?.[hipSkinIdx] || null;
    const mulV3 = (M, x, y, z) => {
        if (!M) return [x, y, z];
        // Column-major 4x4 * vec3 (w=1)
        return [
            M[0] * x + M[4] * y + M[8]  * z + M[12],
            M[1] * x + M[5] * y + M[9]  * z + M[13],
            M[2] * x + M[6] * y + M[10] * z + M[14],
        ];
    };

    // Collect kept vertices (with mapped indices) and triangles.
    const LEG_THRESHOLD = 0.5;   // dominant leg weight required
    const newIdx = new Int32Array(vCount).fill(-1);
    const outPos = [], outNorm = [], outIndices = [], outOnShin = [];
    for (let v = 0; v < vCount; v++) {
        if (legWeight[v] < LEG_THRESHOLD) continue;
        const [x, y, z] = mulV3(IBM, positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
        newIdx[v] = outPos.length / 3;
        outPos.push(x, y, z);
        if (normals) {
            // For normals, we want the rotation-only part of IBM (no translation).
            // Approximation: same matrix without translation column.
            const nx = positions ? normals[v * 3] : 0;
            const ny = positions ? normals[v * 3 + 1] : 0;
            const nz = positions ? normals[v * 3 + 2] : 0;
            if (IBM) {
                outNorm.push(
                    IBM[0] * nx + IBM[4] * ny + IBM[8]  * nz,
                    IBM[1] * nx + IBM[5] * ny + IBM[9]  * nz,
                    IBM[2] * nx + IBM[6] * ny + IBM[10] * nz,
                );
            } else {
                outNorm.push(nx, ny, nz);
            }
        } else {
            outNorm.push(0, 1, 0);
        }
        outOnShin.push(dominantOnShin[v]);
    }
    // Triangles: include only if all 3 vertices kept.
    for (let i = 0; i < indices.length; i += 3) {
        const a = newIdx[indices[i]];
        const b = newIdx[indices[i + 1]];
        const c = newIdx[indices[i + 2]];
        if (a >= 0 && b >= 0 && c >= 0) outIndices.push(a, b, c);
    }

    // Compute the leg's bounding box (in hip-local space) so we can
    // normalize to the rig's legLength and position the foot correctly.
    let yMin = Infinity, yMax = -Infinity;
    for (let i = 0; i < outPos.length; i += 3) {
        if (outPos[i + 1] < yMin) yMin = outPos[i + 1];
        if (outPos[i + 1] > yMax) yMax = outPos[i + 1];
    }
    return {
        positions: outPos,
        normals:   outNorm,
        indices:   outIndices,
        onShin:    outOnShin,
        yMin, yMax,
        vertexCount: outPos.length / 3,
        hasShin: shinNodeIdx >= 0,
    };
}

export function buildGLBLegRig(opts = {}) {
    const srcMesh = opts.srcMesh;
    if (!srcMesh) throw new Error("buildGLBLegRig: opts.srcMesh required (parsed GLB)");
    if (!srcMesh.skin) throw new Error("buildGLBLegRig: source mesh has no skin");

    const legJoints = _glbFindLegJoints(srcMesh, opts);
    if (!legJoints) {
        throw new Error("buildGLBLegRig: source GLB has no identifiable leg chain. Try buildMultiLegRig() for procedural legs, or pass opts.legHipJoint='JointName'.");
    }
    const legBlob = _glbExtractLeg(srcMesh, legJoints);
    if (legBlob.vertexCount < 3 || legBlob.indices.length < 3) {
        throw new Error(`buildGLBLegRig: extracted leg has only ${legBlob.vertexCount} verts / ${legBlob.indices.length/3} tris — leg-weighted geometry too sparse. Try a different source GLB.`);
    }

    // --- Multi-leg spine setup (mirrors buildMultiLegRig structure) ---
    const PAIRS  = Math.max(2, Math.min(48, opts.legPairs ?? 8));
    const L      = opts.length     ?? (PAIRS * 0.55 + 2);
    const bodyR  = opts.bodyRadius ?? 0.4;
    const legLen = opts.legLength  ?? 1.4;
    const sides  = opts.sides      ?? 6;
    const gait   = opts.gait       ?? "metachronal";
    const waves  = Math.max(0.5, opts.waves ?? 2);
    const period = opts.period     ?? 0.7;

    const JOINT_LIMIT = 128;
    const S = Math.max(5, Math.min(10, PAIRS + 2));
    const TWO_JOINT_BUDGET = S + PAIRS * 2 * 2;
    const ONE_JOINT_BUDGET = S + PAIRS * 2 * 1;
    let useShin = legBlob.hasShin && (TWO_JOINT_BUDGET <= JOINT_LIMIT - 4);
    if (!useShin && ONE_JOINT_BUDGET > JOINT_LIMIT - 4) {
        throw new Error(`buildGLBLegRig: ${PAIRS} leg pairs requires ${ONE_JOINT_BUDGET} joints — over the ${JOINT_LIMIT}-joint shader limit. Try legPairs <= ${Math.floor((JOINT_LIMIT - 4 - S) / 2)}.`);
    }

    const xS = (k) => -L / 2 + k * (L / (S - 1));
    const spineForPair = [];
    for (let p = 0; p < PAIRS; p++) {
        const frac = (PAIRS === 1) ? 0.5 : p / (PAIRS - 1);
        spineForPair.push(Math.round(1 + frac * (S - 3)));
    }

    const IDENT = [0, 0, 0, 1];
    const nodes = [];
    const restWorld = [];
    for (let k = 0; k < S; k++) {
        const t = (k === 0) ? [xS(0), 0, 0] : [L / (S - 1), 0, 0];
        nodes.push({ translation: new Float32Array(t), rotation: new Float32Array(IDENT),
                     scale: new Float32Array([1, 1, 1]), parent: k - 1, children: [] });
        restWorld.push([xS(k), 0, 0]);
    }
    for (let k = 1; k < S; k++) nodes[k - 1].children.push(k);

    const legInfo = [];
    for (let p = 0; p < PAIRS; p++) {
        const sp = spineForPair[p];
        for (let si = 0; si < 2; si++) {
            const side = si === 0 ? -1 : 1;
            const hipW  = [xS(sp),  -bodyR * 0.4, side * (bodyR + 0.05)];
            const kneeW = [xS(sp),  -bodyR - legLen * 0.45, side * (bodyR + legLen * 0.32)];
            const footW = [xS(sp),  -bodyR - legLen,        side * (bodyR + legLen * 0.42)];
            const hipNode = nodes.length;
            nodes.push({ translation: new Float32Array([hipW[0] - restWorld[sp][0], hipW[1] - restWorld[sp][1], hipW[2] - restWorld[sp][2]]),
                         rotation: new Float32Array(IDENT), scale: new Float32Array([1, 1, 1]), parent: sp, children: [] });
            restWorld.push(hipW);
            nodes[sp].children.push(hipNode);
            let shinNode = hipNode;
            if (useShin) {
                shinNode = nodes.length;
                nodes.push({ translation: new Float32Array([kneeW[0] - hipW[0], kneeW[1] - hipW[1], kneeW[2] - hipW[2]]),
                             rotation: new Float32Array(IDENT), scale: new Float32Array([1, 1, 1]), parent: hipNode, children: [] });
                restWorld.push(kneeW);
                nodes[hipNode].children.push(shinNode);
            }
            legInfo.push({ hipNode, shinNode, hipW, kneeW, footW, p, side });
        }
    }

    const N = nodes.length;
    const skin = {
        joints: Array.from({ length: N }, (_, k) => k),
        inverseBindMatrices: restWorld.map(p => ibmTranslate(p[0], p[1], p[2])),
        skeleton: 0,
    };

    // --- Build geometry: procedural torso + N copies of the GLB leg blob ---
    const out = { positions: [], normals: [], indices: [] };
    const jointA = [], jointB = [], wA = [];

    const seg = L / (S - 1);
    const torsoFracs = appendTube(out, [-L / 2, 0, 0], [L / 2, 0, 0], bodyR * 0.85, bodyR * 0.7, sides + 2, S * 2);
    for (let i = 0; i < torsoFracs.length; i++) {
        const x = -L / 2 + torsoFracs[i] * L;
        let f = (x - xS(0)) / seg; if (f < 0) f = 0; if (f > S - 1) f = S - 1;
        const j0 = Math.min(Math.floor(f), S - 1), j1 = Math.min(j0 + 1, S - 1);
        const w1 = (j0 === j1) ? 0 : f - j0;
        jointA.push(j0); jointB.push(j1); wA.push(1 - w1);
    }

    // Normalize the leg blob: compute scale factor so its Y-extent equals legLen
    const blobYRange = Math.max(0.001, legBlob.yMax - legBlob.yMin);
    const blobScale = legLen / blobYRange;

    // For each leg attachment, copy the leg blob's verts/indices/normals
    // with: scale * blobScale, mirror across X for left-side legs, translate
    // so the leg's TOP (yMax in blob-space) lands at hipW.
    for (const leg of legInfo) {
        const baseV = out.positions.length / 3;
        const sideFlipZ = leg.side;   // left=-1, right=+1
        for (let i = 0; i < legBlob.positions.length; i += 3) {
            // Blob is in hip-local space. y=yMax should map to hip; foot is at y=yMin.
            const bx = legBlob.positions[i];
            const by = legBlob.positions[i + 1];
            const bz = legBlob.positions[i + 2];
            const localY = (by - legBlob.yMax);   // 0 at top, negative going down
            const px = leg.hipW[0] + bx * blobScale;
            const py = leg.hipW[1] + localY * blobScale;
            const pz = leg.hipW[2] + bz * blobScale * sideFlipZ;
            out.positions.push(px, py, pz);
            // Normals: mirror Z if side flipped, no rescale
            const nx = legBlob.normals[i];
            const ny = legBlob.normals[i + 1];
            const nz = legBlob.normals[i + 2] * sideFlipZ;
            out.normals.push(nx, ny, nz);
            // Joint binding: shin-dominant verts -> shin (if useShin), else hip
            const vi = i / 3;
            const onShin = legBlob.onShin[vi];
            if (useShin && onShin) {
                jointA.push(leg.shinNode); jointB.push(leg.shinNode); wA.push(1);
            } else {
                jointA.push(leg.hipNode); jointB.push(leg.hipNode); wA.push(1);
            }
        }
        for (let i = 0; i < legBlob.indices.length; i++) {
            out.indices.push(baseV + legBlob.indices[i]);
        }
    }

    const vCount = out.positions.length / 3;
    const joints = new Uint8Array(vCount * 4);
    const weights = new Float32Array(vCount * 4);
    for (let i = 0; i < vCount; i++) {
        joints[i * 4]     = jointA[i]; joints[i * 4 + 1] = jointB[i];
        weights[i * 4]    = wA[i];     weights[i * 4 + 1] = 1 - wA[i];
    }

    const animations = buildMultiLegClips(legInfo, PAIRS, gait, waves, opts, useShin);

    const positions = new Float32Array(out.positions);
    const normals   = new Float32Array(out.normals);
    const indices   = new Uint32Array(out.indices);   // hardcoded UNSIGNED_INT in renderer
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vCount; i++) {
        for (let a = 0; a < 3; a++) {
            const v = positions[i * 3 + a];
            if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v;
        }
    }

    return {
        positions, normals, indices, joints, weights, skin, nodes, animations,
        bounds: { minX: lo[0], minY: lo[1], minZ: lo[2], maxX: hi[0], maxY: hi[1], maxZ: hi[2] },
        vertexCount: vCount, indexCount: indices.length,
        jointCount: N, legCount: legInfo.length, kind: "glb_leg_clone", gait, useShin,
        legBlobVerts: legBlob.vertexCount,
        sourceLegJoint: legJoints.hipNodeIdx,
        legs: legInfo.map(l => ({ hipNode: l.hipNode, shinNode: l.shinNode, footW: l.footW, p: l.p, side: l.side })),
    };
}
