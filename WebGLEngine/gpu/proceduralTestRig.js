// FILE: gpu/proceduralTestRig.js
// VERSION: v1 - round 52
//
// Hand-rolled rigged mesh. Three-bone vertical chain (a "tentacle" /
// "lamp arm"), built procedurally so the skeletal animation pipeline
// can be exercised end-to-end without needing an external GLB.
//
// Skeleton:
//
//      [joint 2]  top      <- (0, 2, 0) in rest pose
//          |
//      [joint 1]  middle   <- (0, 1, 0)
//          |
//      [joint 0]  base     <- (0, 0, 0)  root
//
// Geometry: 5 rings of 8 verts each (radius 0.3), stacked at y =
// 0, 0.5, 1.0, 1.5, 2.0. Each ring's skinning weights bias toward
// the nearest joints:
//
//   y=0.0  -> 100% joint0
//   y=0.5  -> 50% j0 / 50% j1
//   y=1.0  -> 100% j1
//   y=1.5  -> 50% j1 / 50% j2
//   y=2.0  -> 100% j2
//
// Clips:
//
//   idle    - gentle sway, 2.0s loop
//   walk    - bigger sway + bob, 0.8s loop
//   attack  - windup back then whip forward, 0.6s loop
//   death   - bend over forward and collapse, 1.0s (intended clamp)
//
// All animations rotate joints 1 and 2 around the X axis. Joint 0
// (base) stays fixed — entity transform handles overall position.
//
// Mount point: at startup, main.js calls registerProceduralTestRig
// to inject the built mesh into assetLoader.cache under "test_rig".
// Spawn one with:
//   demo.spawnTestRig?.()  (added by main.js) OR
//   any entity with assetId: "test_rig" via entity:spawnMesh.

const RING_COUNT = 5;
const SIDES = 8;
const RING_RADIUS = 0.3;
const RING_Y = [0.0, 0.5, 1.0, 1.5, 2.0];     // height per ring
// Skinning weights per ring (j0, j1, j2)
const RING_WEIGHTS = [
    [1.0, 0.0, 0.0],   // ring 0 (base)
    [0.5, 0.5, 0.0],   // ring 1
    [0.0, 1.0, 0.0],   // ring 2 (middle joint)
    [0.0, 0.5, 0.5],   // ring 3
    [0.0, 0.0, 1.0],   // ring 4 (top joint)
];

function buildGeometry() {
    const vertCount = RING_COUNT * SIDES;
    const positions = new Float32Array(vertCount * 3);
    const normals   = new Float32Array(vertCount * 3);
    const joints    = new Uint8Array(vertCount * 4);
    const weights   = new Float32Array(vertCount * 4);

    let vi = 0;
    for (let r = 0; r < RING_COUNT; r++) {
        const y = RING_Y[r];
        const w = RING_WEIGHTS[r];
        for (let s = 0; s < SIDES; s++) {
            const theta = (s / SIDES) * Math.PI * 2;
            const cx = Math.cos(theta), sz = Math.sin(theta);
            // Position on ring
            positions[vi * 3 + 0] = cx * RING_RADIUS;
            positions[vi * 3 + 1] = y;
            positions[vi * 3 + 2] = sz * RING_RADIUS;
            // Normal points radially outward (good enough for a tube)
            normals[vi * 3 + 0] = cx;
            normals[vi * 3 + 1] = 0;
            normals[vi * 3 + 2] = sz;
            // Skin: each vertex weighted across up to 2 joints. Pack
            // the active joint indices into the first slots, zero the
            // rest. Weights array MUST sum to 1.0 per vertex (shader
            // assumes normalized).
            const jBuf = [0, 0, 0, 0];
            const wBuf = [0, 0, 0, 0];
            let slot = 0;
            for (let j = 0; j < 3; j++) {
                if (w[j] > 0) {
                    jBuf[slot] = j;
                    wBuf[slot] = w[j];
                    slot++;
                }
            }
            joints[vi * 4 + 0] = jBuf[0];
            joints[vi * 4 + 1] = jBuf[1];
            joints[vi * 4 + 2] = jBuf[2];
            joints[vi * 4 + 3] = jBuf[3];
            weights[vi * 4 + 0] = wBuf[0];
            weights[vi * 4 + 1] = wBuf[1];
            weights[vi * 4 + 2] = wBuf[2];
            weights[vi * 4 + 3] = wBuf[3];
            vi++;
        }
    }

    // Indices: 4 rings of quads (between rings 0-1, 1-2, 2-3, 3-4).
    // Each quad = 2 triangles = 6 indices. 8 sides per ring = 48
    // indices per gap = 192 indices total. Wrap from side 7 back to 0.
    const inds = new Uint32Array((RING_COUNT - 1) * SIDES * 6);
    let ii = 0;
    for (let r = 0; r < RING_COUNT - 1; r++) {
        const baseA = r * SIDES;        // ring below
        const baseB = (r + 1) * SIDES;  // ring above
        for (let s = 0; s < SIDES; s++) {
            const s2 = (s + 1) % SIDES;
            // Two triangles forming a quad. CCW from outside.
            inds[ii++] = baseA + s;
            inds[ii++] = baseB + s;
            inds[ii++] = baseB + s2;
            inds[ii++] = baseA + s;
            inds[ii++] = baseB + s2;
            inds[ii++] = baseA + s2;
        }
    }
    return { positions, normals, joints, weights, indices: inds };
}

// Quat helper: rotation around X axis by angle theta. glTF quats are
// (x, y, z, w).
function quatX(theta) {
    const h = theta * 0.5;
    return new Float32Array([Math.sin(h), 0, 0, Math.cos(h)]);
}
const IDENT_QUAT = new Float32Array([0, 0, 0, 1]);

function buildSkin() {
    // Joints 0/1/2 reference node indices 0/1/2 directly (our hierarchy
    // is just three nodes in a chain). inverseBindMatrices are the
    // inverse of each joint's world matrix in REST pose:
    //   joint 0 at world (0, 0, 0) -> ibm = identity
    //   joint 1 at world (0, 1, 0) -> ibm = translate(0, -1, 0)
    //   joint 2 at world (0, 2, 0) -> ibm = translate(0, -2, 0)
    const ibm = [
        new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1,
        ]),
        new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, -1, 0, 1,
        ]),
        new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, -2, 0, 1,
        ]),
    ];
    return {
        joints: [0, 1, 2],
        inverseBindMatrices: ibm,
        skeleton: 0,
    };
}

function buildNodes() {
    // Three nodes in a chain. Local translations stack to give world y
    // positions of 0, 1, 2 when composed. Rotation/scale default to
    // identity/(1,1,1); the animator overwrites rotation per frame.
    return [
        { translation: new Float32Array([0, 0, 0]), rotation: new Float32Array(IDENT_QUAT),
          scale: new Float32Array([1, 1, 1]), parent: -1, children: [1] },
        { translation: new Float32Array([0, 1, 0]), rotation: new Float32Array(IDENT_QUAT),
          scale: new Float32Array([1, 1, 1]), parent: 0,  children: [2] },
        { translation: new Float32Array([0, 1, 0]), rotation: new Float32Array(IDENT_QUAT),
          scale: new Float32Array([1, 1, 1]), parent: 1,  children: [] },
    ];
}

// Build a sampler that animates joint i's rotation through a series of
// X-axis angles at given times. Helper to keep clip construction
// readable. Returns { samplers, channel } describing one channel on
// node nodeIdx. compCount=4 means quaternion.
function buildRotationSampler(times, angles) {
    const values = new Float32Array(times.length * 4);
    for (let k = 0; k < times.length; k++) {
        const q = quatX(angles[k]);
        values[k * 4 + 0] = q[0];
        values[k * 4 + 1] = q[1];
        values[k * 4 + 2] = q[2];
        values[k * 4 + 3] = q[3];
    }
    return {
        times: new Float32Array(times),
        values,
        interpolation: "LINEAR",
    };
}

function buildAnimations() {
    const clips = [];

    // ---- idle: gentle sway, 2s loop, returns to rest ----
    {
        const t = [0.0, 0.5, 1.0, 1.5, 2.0];
        const j1 = [0, 0.05, 0, -0.05, 0];
        const j2 = [0, 0.08, 0, -0.08, 0];
        const samplers = [
            buildRotationSampler(t, j1),
            buildRotationSampler(t, j2),
        ];
        clips.push({
            name: "idle",
            duration: 2.0,
            samplers,
            channels: [
                { samplerIdx: 0, targetNode: 1, path: "rotation" },
                { samplerIdx: 1, targetNode: 2, path: "rotation" },
            ],
        });
    }

    // ---- walk: bigger sway, faster, 0.8s loop, joint 2 in counter-phase ----
    {
        const t = [0.0, 0.2, 0.4, 0.6, 0.8];
        const j1 = [0,   0.3,  0,    -0.3, 0];
        const j2 = [0,  -0.15, 0,     0.15, 0];
        const samplers = [
            buildRotationSampler(t, j1),
            buildRotationSampler(t, j2),
        ];
        clips.push({
            name: "walk",
            duration: 0.8,
            samplers,
            channels: [
                { samplerIdx: 0, targetNode: 1, path: "rotation" },
                { samplerIdx: 1, targetNode: 2, path: "rotation" },
            ],
            // Round 53 - footstep events at the extremes of each swing.
            // Two per cycle (foot down on each side).
            events: [
                { time: 0.2, name: "footstep", data: { side: "left" } },
                { time: 0.6, name: "footstep", data: { side: "right" } },
            ],
        });
    }

    // ---- attack: windup back, whip forward, settle ----
    {
        const t  = [0.0, 0.15, 0.35, 0.6];
        const j1 = [0,  -0.5,  0.8,  0];      // back, snap, return
        const j2 = [0,  -0.7,  1.1,  0];      // more dramatic on tip
        const samplers = [
            buildRotationSampler(t, j1),
            buildRotationSampler(t, j2),
        ];
        clips.push({
            name: "attack",
            duration: 0.6,
            samplers,
            channels: [
                { samplerIdx: 0, targetNode: 1, path: "rotation" },
                { samplerIdx: 1, targetNode: 2, path: "rotation" },
            ],
            // Round 53 - the "projectile_release" event fires at the
            // peak of the forward swing (t=0.35), letting gameplay
            // spawn damage/projectiles synced to the animation rather
            // than at clip start.
            events: [
                { time: 0.35, name: "projectile_release" },
            ],
        });
    }

    // ---- death: bend over forward, hold ----
    {
        const t  = [0.0, 0.4, 1.0];
        const j1 = [0,   0.8, 1.5];
        const j2 = [0,   1.0, 1.6];
        const samplers = [
            buildRotationSampler(t, j1),
            buildRotationSampler(t, j2),
        ];
        clips.push({
            name: "death",
            duration: 1.0,
            loopMode: "clamp",       // round 56 - hold the final pose
            samplers,
            channels: [
                { samplerIdx: 0, targetNode: 1, path: "rotation" },
                { samplerIdx: 1, targetNode: 2, path: "rotation" },
            ],
            // Round 53 - impact_ground fires when the rig has visibly
            // collapsed (t=0.4 is mid-bend). final_rest fires near end
            // for sfx settle / despawn cue.
            events: [
                { time: 0.4, name: "impact_ground" },
                { time: 0.9, name: "final_rest" },
            ],
        });
    }

    // ---- damaged: pronounced lean + slow sag, doesn't return to rest ----
    {
        const t  = [0.0, 0.5, 1.0];
        const j1 = [0.4, 0.55, 0.4];
        const j2 = [0.3, 0.45, 0.3];
        const samplers = [
            buildRotationSampler(t, j1),
            buildRotationSampler(t, j2),
        ];
        clips.push({
            name: "damaged",
            duration: 1.0,
            samplers,
            channels: [
                { samplerIdx: 0, targetNode: 1, path: "rotation" },
                { samplerIdx: 1, targetNode: 2, path: "rotation" },
            ],
        });
    }

    // ---- fire: short kick on joint 2 (mimics turret recoil) ----
    {
        const t  = [0.0, 0.08, 0.24];
        const j1 = [0,   0,    0];
        const j2 = [0,  -0.6,  0];
        const samplers = [
            buildRotationSampler(t, j1),
            buildRotationSampler(t, j2),
        ];
        clips.push({
            name: "fire",
            duration: 0.24,
            samplers,
            channels: [
                { samplerIdx: 0, targetNode: 1, path: "rotation" },
                { samplerIdx: 1, targetNode: 2, path: "rotation" },
            ],
            // Round 53 - muzzle flash fires immediately on the kick.
            // Spawns a particle burst via the default subscriber.
            events: [
                { time: 0.02, name: "muzzle_flash" },
            ],
        });
    }

    return clips;
}

// Build the GL buffers + return a mesh object compatible with whatever
// gpuAssetLoader produces. The renderer reads from `cache.get(assetId)`
// and doesn't care whether the entry came from disk or was built here.
export function buildProceduralTestRig(gl) {
    const geom = buildGeometry();

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, geom.positions, gl.STATIC_DRAW);

    const nbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
    gl.bufferData(gl.ARRAY_BUFFER, geom.normals, gl.STATIC_DRAW);

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geom.indices, gl.STATIC_DRAW);

    const jbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, jbo);
    gl.bufferData(gl.ARRAY_BUFFER, geom.joints, gl.STATIC_DRAW);

    const wbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, wbo);
    gl.bufferData(gl.ARRAY_BUFFER, geom.weights, gl.STATIC_DRAW);

    return {
        name: "test_rig",
        vbo, ibo, nbo,
        cbo: null,
        tbo: null,
        texture: null,
        hasNormals: true,
        hasColors: false,
        hasTexture: false,
        hasTexCoords: false,
        vertexCount: RING_COUNT * SIDES,
        indexCount: geom.indices.length,
        bounds: { minX: -RING_RADIUS, minY: 0, minZ: -RING_RADIUS,
                  maxX:  RING_RADIUS, maxY: 2, maxZ:  RING_RADIUS },
        skin: buildSkin(),
        animations: buildAnimations(),
        nodes: buildNodes(),
        jointsData: geom.joints,
        weightsData: geom.weights,
        isRigged: true,
        jbo,
        wbo,
        jointsComponentType: gl.UNSIGNED_BYTE,
    };
}

// Inject the built mesh into an asset loader's cache so any entity
// with assetId: "test_rig" picks it up. Call once at startup.
export function registerProceduralTestRig(assetLoader) {
    if (!assetLoader || !assetLoader.cache || !assetLoader.gl) return;
    if (assetLoader.cache.has("test_rig")) return;     // already done
    const mesh = buildProceduralTestRig(assetLoader.gl);
    assetLoader.cache.set("test_rig", mesh);
    console.log(`[ProceduralTestRig] registered "test_rig": ${mesh.vertexCount} verts, ${mesh.indexCount} indices, ${mesh.animations.length} clips (${mesh.animations.map(a => a.name).join(", ")})`);
}
