// WebGLEngine/render/voxelBodies.mjs -- v4519 (Sandbox on the device, round 3: the Box3D bodies)
//
// *** RIGID BODIES ON THE DEVICE WORLD, COLLIDING WITH THE VOXELS THEY STAND ON. *** The sandbox's bodies run on box3d
// (the vendored wasm, physics/box3d), whose shapes are BOXES: there is no triangle-mesh collider to hand the world mesh to.
// So the world reaches the bodies the way the voxels are: a COLLISION WINDOW. Each tick, every solid voxel inside a margin
// of every dynamic body's box becomes a static box -- runs of voxels along x merged into one box each, so a 5 x 5 patch of
// floor is five boxes and not twenty-five -- placed from a POOL of static bodies by setTransform, the unused ones parked
// far below. The pool grows when a window needs more; nothing is ever removed (box3d has no remove), and the assignment
// is in a sorted order so two runs of the same inputs hash the same. Dig the voxel under a resting crate (round 2) and the
// next window has no box there: the crate falls, which is the sandbox's own behaviour.
//
//   collisionWindow(world, bodies, margin)   the merged static boxes for the bodies' windows: [{ x, y, z, n }] runs
//   createBodyWorld(m, world, opts)           the box3d world over the wasm module m: spawn(), tick(), records()/extras()
//   bodyLitPipelineDesc({ tints })            litSphere's lit shader with `extra` read as the body's QUATERNION: the vertex
//                                             and the normal are rotated by it, in WGSL and GLSL from one pair of texts
//   sandboxScene(device, state, bw, G, L)     two fleets: the world's slot mesh (round 2's editScene) and the bodies as
//                                             rotated unit cubes; keeps the world's vertex buffer on the edit state
//
// Coordinates: a voxel (x, y, z) fills [x, x + 1) on each axis, so its box centre is (x + 0.5, ...) with half 0.5. Bodies
// are cubes this round (one scale per record); the quaternion travels in the record's extras, where the tint index and
// the emissive flag used to be, so a body fleet takes its colour from its mesh.
"use strict";
import { worldFromModule, TICKER } from "./slugTicker.mjs";
import { litBind, litWgsl, litVertexGlsl, litFragmentGlsl, litPipelineDesc } from "./litSphere.mjs";
import { boxMesh } from "./buildingLab.mjs";
import { SUN } from "./voxelDevice.mjs";
import { editScene } from "./voxelDeviceEdit.mjs";

export const BODIES = Object.freeze({ margin: 1, park: [0, -500, 0], maxBodies: 64, dt: TICKER.dt, substeps: TICKER.substeps, gravity: [0, -9.8, 0] });

/** the static boxes for the bodies' windows: runs of solid voxels along x, sorted, deduplicated */
export function collisionWindow(world, bodies, margin = BODIES.margin) {
    const seen = new Set(), runs = [];
    for (const b of bodies) {
        if (!b.alive) continue;
        const x0 = Math.floor(b.pos[0] - b.half - margin), x1 = Math.floor(b.pos[0] + b.half + margin), y0 = Math.max(0, Math.floor(b.pos[1] - b.half - margin)), y1 = Math.min(world.chunkHeight - 1, Math.floor(b.pos[1] + b.half + margin)), z0 = Math.floor(b.pos[2] - b.half - margin), z1 = Math.floor(b.pos[2] + b.half + margin);
        for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
            let x = x0;
            while (x <= x1) {
                if (!world.voxelAt(x, y, z)) { x++; continue; }
                const start = x; while (x <= x1 && world.voxelAt(x, y, z)) x++;
                const key = start + "," + y + "," + z + "," + (x - start); if (seen.has(key)) continue; seen.add(key); runs.push({ x: start, y, z, n: x - start });
            }
        }
    }
    // a run that another body's window already covers in part would double a voxel: split overlaps by keying on the voxel
    const covered = new Set(), out = [];
    for (const r of runs.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x || a.n - b.n)) {
        let s = r.x, e = r.x + r.n;
        while (s < e) { while (s < e && covered.has(s + "," + r.y + "," + r.z)) s++; let t = s; while (t < e && !covered.has(t + "," + r.y + "," + r.z)) { covered.add(t + "," + r.y + "," + r.z); t++; } if (t > s) out.push({ x: s, y: r.y, z: r.z, n: t - s }); s = t; }
    }
    return out;
}

/** every solid voxel inside the bodies' windows, for the gate's cover test */
export function windowVoxels(world, bodies, margin = BODIES.margin) {
    const keys = new Set();
    for (const b of bodies) { if (!b.alive) continue;
        for (let y = Math.max(0, Math.floor(b.pos[1] - b.half - margin)); y <= Math.min(world.chunkHeight - 1, Math.floor(b.pos[1] + b.half + margin)); y++) for (let z = Math.floor(b.pos[2] - b.half - margin); z <= Math.floor(b.pos[2] + b.half + margin); z++) for (let x = Math.floor(b.pos[0] - b.half - margin); x <= Math.floor(b.pos[0] + b.half + margin); x++) if (world.voxelAt(x, y, z)) keys.add(x + "," + y + "," + z); }
    return keys;
}

export function createBodyWorld(m, world, opts = {}) {
    const o = { ...BODIES, ...opts }, phys = worldFromModule(m, o.gravity), bodies = [], pool = new Map();   // pool: run width n -> static box ids of half [n / 2, 0.5, 0.5]
    let xf = new Float32Array(0), ticks = 0, lastSig = "", wakes = 0;
    const records = new Float32Array(o.maxBodies * 4), extras = new Float32Array(o.maxBodies * 4);
    for (let i = 0; i < o.maxBodies; i++) { records[i * 4 + 1] = o.park[1]; records[i * 4 + 3] = 0.5; extras[i * 4 + 3] = 1; }
    const bw = {
        phys, bodies, pool, world, opts: o,
        spawn(pos, half = 0.5, { velocity = null, colour = null } = {}) {
            if (bodies.length >= o.maxBodies) throw new Error(`voxelBodies: ${o.maxBodies} bodies, by name`);
            const id = phys.addBox({ type: "dynamic", pos, half: [half, half, half], density: 1 }); if (velocity) phys.setVelocity(id, velocity);
            const b = { id, half, pos: pos.slice(), quat: [0, 0, 0, 1], alive: true, colour, slot: bodies.length }; bodies.push(b); return b;
        },
        /** the window for this tick: the runs assigned to pool boxes, the rest parked */
        window() {
            // box3d cannot resize a shape, so the pool is PER RUN WIDTH: a run of n voxels takes a static box of half [n / 2, 0.5, 0.5]
            // from the pool for n, made on first need; every box of every width not used this tick is parked
            const runs = collisionWindow(world, bodies, o.margin), used = new Map();
            for (const r of runs) { let list = pool.get(r.n); if (!list) { list = []; pool.set(r.n, list); } const k = used.get(r.n) || 0; if (k >= list.length) list.push(phys.addBox({ type: "static", pos: o.park, half: [r.n / 2, 0.5, 0.5], density: 1 })); phys.setTransform(list[k], [r.x + r.n / 2, r.y + 0.5, r.z + 0.5]); used.set(r.n, k + 1); }
            for (const [n, list] of pool) for (let k = used.get(n) || 0; k < list.length; k++) phys.setTransform(list[k], o.park);
            // *** A SETTLED BODY IS ASLEEP, AND A STATIC BOX MOVED FROM UNDER IT DOES NOT WAKE IT. *** box3d sleeps a resting body
            // (box3d_shim.c says so beside the joint motors, which had the same bug); moving the floor away by setTransform is not an
            // event the sleeper sees, so a crate stayed at rest over a hole. When the window CHANGES, every live body gets a zero
            // impulse, which is the wake the shim offers ("a linear impulse ... wakes the body").
            const sig = runs.map((r) => r.x + "," + r.y + "," + r.z + "," + r.n).join(";");
            if (sig !== lastSig) { lastSig = sig; for (const b of bodies) if (b.alive) { phys.impulse(b.id, [0, 0, 0]); wakes++; } }
            return runs;
        },
        wakes: () => wakes,
        poolSize() { let t = 0; for (const list of pool.values()) t += list.length; return t; },
        tick() { const runs = bw.window(); phys.step(o.dt, o.substeps); ticks++; bw.read(); return runs; },
        read() {
            xf = phys.readTransforms();
            for (const b of bodies) { const k = b.id * 7; b.pos = [xf[k], xf[k + 1], xf[k + 2]]; b.quat = [xf[k + 3], xf[k + 4], xf[k + 5], xf[k + 6]]; const s = b.slot * 4; records[s] = b.pos[0]; records[s + 1] = b.pos[1]; records[s + 2] = b.pos[2]; records[s + 3] = b.half; extras[s] = b.quat[0]; extras[s + 1] = b.quat[1]; extras[s + 2] = b.quat[2]; extras[s + 3] = b.quat[3]; }
            return xf;
        },
        records: () => records, extras: () => extras, count: () => o.maxBodies, ticks: () => ticks,
        hash: () => phys.stateHash(),
        destroy() { phys.destroy(); },
    };
    return bw;
}

// ---- the body pipeline: litSphere's lit shader in its "quat" mode (v4520: one lit shader with modes, not a fourth dual module) ------
export const BODY_LIT_WGSL = litWgsl(null, { extra: "quat" }), BODY_LIT_VERTEX_GLSL = litVertexGlsl({ extra: "quat" }), BODY_LIT_FRAGMENT_GLSL = litFragmentGlsl(null, { extra: "quat" });
export function bodyLitPipelineDesc({ cull = null } = {}) { return litPipelineDesc({ cull, extra: "quat" }); }
/** the CPU twin of rotateQ */
export function rotateQ(q, v) { const [x, y, z, w] = q, tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]); return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)]; }

/** the two-fleet scene: the world's slot mesh and the bodies; the world record first, then the body records */
export function sandboxScene(device, state, bw, G, L, { light = SUN, bodyColour = [0.85, 0.25, 0.2, 1] } = {}) {
    const n = bw.count(), count = 1 + n, fleetOf = new Uint32Array(count); for (let i = 1; i < count; i++) fleetOf[i] = 1;
    const rec = new Float32Array(count * 4), ext = new Float32Array(count * 4); rec[3] = 1; ext[3] = 0;
    // *** ON WEBGPU A { count, cpu } SOURCE IS UPLOADED ONCE. *** gpuDriven re-reads the EXTRAS every frame but takes a record source
    // without a `buffer` as static after the first upload (the cull reads the GPU buffer directly); a body that moves after the scene
    // is made stayed where it was born on WebGPU while its quaternion turned -- the round-4 debris, born parked, never appeared at
    // all. So the scene owns a storage buffer for the records and writes it on every frame's extras read, which both paths make.
    rec.set(bw.records(), 4); ext.set(bw.extras(), 4);
    const buffer = device.backend === "webgpu" ? device.buffer({ data: rec, usage: "storage" }) : null;   // WebGL2 has no storage buffers and culls from cpu()
    const fill = () => { rec.set(bw.records(), 4); ext.set(bw.extras(), 4); if (buffer) buffer.write(rec); };
    const records = { count, cpu: () => { fill(); return rec; }, ...(buffer ? { buffer } : {}) }, headings = { cpu: () => { fill(); return ext; } };
    const fleets = [
        { name: "world", lods: [{ name: "only", mesh: state.mesh }], layout: G.LAYOUTS.lit, pipeline: L.litPipelineDesc({ cull: "none" }), bind: L.litBind(light) },
        { name: "bodies", lods: [{ name: "only", mesh: boxMesh(bodyColour) }], layout: G.LAYOUTS.lit, pipeline: bodyLitPipelineDesc(), bind: litBind(light) },
    ];
    const sc = G.makeGpuDrivenScene(device, { fleets, fleetOf, thresholds: [], records, headings });
    state.vbuf = sc.fleets[0].vbuf; state.scene = sc;
    return sc;
}
export { editScene };
