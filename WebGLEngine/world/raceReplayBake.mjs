// WebGLEngine/world/raceReplayBake.mjs -- v4528
// ---------------------------------------------------------------------------------------------------------------
// THE REPLAY PRE-RENDERED: a race record baked to voxels, keyframed from its own log, drawn on the device, and handed
// on as a schematic per keyframe -- or, in a browser, as a WebM off the canvas.
//
// Racing city 5. v4527's lab route stores the accepted driver's race as a record: the seed, the seconds, the fleet
// fingerprint, one input per tick, the state fingerprint. This module turns that record into pictures without the
// driver ever running again:
//
//   bakeReplayWorld(rec, CityGen)      the held-out track and its city as VOXELS: raceTrack.trackWorld lays the floor
//                                      and the buildings (no floor under the loop, v4524's finding), and stampTrack
//                                      fills every loop cell at y = 0 from the analytic surface the car drives on --
//                                      ASH where it says asphalt, alternating STONE and SNOW where it says kerb, GRASS
//                                      where a tile's corner is off the road -- so the picture's road IS the physics'
//                                      road, sampled at voxel centres. Greedy-meshed by render/voxelDevice.mjs.
//   keyframesOf(worldFrom, rec, ...)   the log played back through drivePolicy.replay with an observing onTick, one
//                                      keyframe every `every` ticks: the tick, the second, every car's position and
//                                      quaternion. The playback's fingerprint must equal the record's, or the frames
//                                      are not the race.
//   carMesh(colour)                    the car as a voxel-scale box (CAR.half x 2, so 1.5 x 0.7 x 2.8 units), drawn in
//                                      litSphere's quat mode like the sandbox's bodies (render/voxelBodies.mjs).
//   replayScene(device, baked, ...)    a two-fleet gpuDriven scene, the world's mesh and the car boxes, with the car
//                                      records owned by a storage buffer on WebGPU (v4520's rule: a { count, cpu }
//                                      source is uploaded once) and setKeyframe(kf) writing poses into it.
//   renderKeyframes(device, ...)       each keyframe drawn and READ BACK: { tick, seconds, pixels, hash }.
//   keyframeManifest(...)              the schematic: a JSON row per keyframe naming its tick, its second, every car's
//                                      pose, the picture's file and the picture's pixel hash.
//
// NOT REAL TIME, and said so on the page: the keyframes are computed ahead of any picture, each frame is drawn at the
// device's pace and read back, and playback is a slideshow of what was rendered. The video route is the same frames
// off a canvas through MediaRecorder (render/blobRecorder.js): a WebM here, which a TV will not play; the H.264 MP4 is
// rig-pending, as blobRecorder measured at v2588 and this round re-measures in the gate.
//
// Run: node tools/ship/raceReplayBake-selfcheck.mjs
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import * as T from "./raceTrack.mjs";
import { trackSurface, CAR } from "../physics/raceCar.mjs";
import * as D from "../brain/drivePolicy.mjs";
import { miniWorld, meshWorld, SUN } from "../render/voxelDevice.mjs";
import { litPipelineDesc, litBind } from "../render/litSphere.mjs";
import { bodyLitPipelineDesc } from "../render/voxelBodies.mjs";
import { boxMesh } from "../render/buildingLab.mjs";

/** The voxel ids the stamp writes, from world/chunkMesherCore.js's PALETTE: asphalt dark, the kerb striped, the rest grass. */
export const VOXELS = Object.freeze({ asphalt: 6, kerbA: 1, kerbB: 5, grass: T.FLOOR_ID });
export const CAR_COLOURS = Object.freeze([[0.85, 0.2, 0.15, 1], [0.2, 0.7, 0.3, 1], [0.95, 0.8, 0.2, 1], [0.6, 0.3, 0.8, 1]]);

/**
 * Fill every loop cell's y = 0 layer from the surface the car drives on. Returns the counts by kind. The floor under the
 * free cells is trackWorld's and is not touched; a loop cell has nothing before this, so every voxel written is new.
 */
export function stampTrack(world, track, surface = trackSurface(track)) {
    const counts = { asphalt: 0, kerb: 0, grass: 0 };
    for (const [cx, cz] of track.cells) {
        const x0 = cx * T.TILE - track.cols * T.TILE / 2, z0 = cz * T.TILE - track.rows * T.TILE / 2;
        for (let x = x0; x < x0 + T.TILE; x++) for (let z = z0; z < z0 + T.TILE; z++) {
            const k = surface.at(x + 0.5, z + 0.5).kind;
            const id = k === "asphalt" ? VOXELS.asphalt : k === "kerb" ? (((x + z) & 1) ? VOXELS.kerbA : VOXELS.kerbB) : VOXELS.grass;
            world.setVoxel(x, 0, z, id);
            counts[k === "asphalt" ? "asphalt" : k === "kerb" ? "kerb" : "grass"]++;
        }
    }
    return counts;
}

/** The record's track and city as a meshed voxel world. */
export function bakeReplayWorld(rec, CityGen, { facades = true } = {}) {
    const track = T.generateTrack({ seed: rec.seed }), surface = trackSurface(track), world = miniWorld();
    const { rects, city } = T.trackWorld(track, world, CityGen, { facades });
    const stamped = stampTrack(world, track, surface);
    const packed = meshWorld(world);
    return { track, surface, world, rects, city, stamped, packed, cars: rec.log[0].length };
}

/** One keyframe every `every` ticks from the record's own log; the playback's fingerprint must equal the record's. */
export function keyframesOf(worldFrom, rec, { every = 30 } = {}) {
    const frames = [];
    const r = D.replay(worldFrom, { seed: rec.seed, seconds: rec.seconds, fleet: rec.fleet, log: rec.log, ticks: rec.ticks }, {
        onTick: (t, poses) => { if (t % every === 0 || t === rec.ticks - 1) frames.push({ tick: t, seconds: (t + 1) * CAR.dt, poses: poses.map((p) => ({ pos: p.pos.slice(), quat: p.quat.slice(), yaw: p.yaw, speed: p.speed })) }); },
    });
    return { frames, fingerprint: r.fingerprint, same: r.fingerprint === rec.fingerprint, every, ticks: rec.ticks };
}

/** The car as a box the size of its chassis, unit scale, drawn in quat mode. */
export function carMesh(colour = CAR_COLOURS[0]) {
    const m = boxMesh(colour), s = [CAR.half[0] * 2, CAR.half[1] * 2, CAR.half[2] * 2];
    for (let i = 0; i < m.positions.length; i += 3) { m.positions[i] *= s[0]; m.positions[i + 1] *= s[1]; m.positions[i + 2] *= s[2]; }
    return m;
}

/**
 * The two-fleet scene: the world's mesh at the origin, then one car record per car. On WebGPU the records live in a storage
 * buffer written from the extras' cpu() (the read the GPU path repeats); on WebGL2 the cull reads cpu().
 */
export function replayScene(device, baked, G, L, { light = SUN, colours = CAR_COLOURS } = {}) {
    const n = baked.cars, count = 1 + n, fleetOf = new Uint32Array(count);
    const rec = new Float32Array(count * 4), ext = new Float32Array(count * 4); rec[3] = 1; ext[3] = 0;
    for (let i = 0; i < n; i++) { fleetOf[1 + i] = 1 + i; rec[(1 + i) * 4 + 3] = 1; ext[(1 + i) * 4 + 3] = 1; }
    const buffer = device.backend === "webgpu" ? device.buffer({ data: rec, usage: "storage" }) : null;
    const fill = () => { if (buffer) buffer.write(rec); };
    const records = { count, cpu: () => rec, ...(buffer ? { buffer } : {}) }, headings = { cpu: () => { fill(); return ext; } };
    const fleets = [{ name: "world", lods: [{ name: "only", mesh: baked.packed.mesh }], layout: G.LAYOUTS.lit, pipeline: litPipelineDesc({ cull: "none" }), bind: litBind(light) }];
    for (let i = 0; i < n; i++) fleets.push({ name: "car" + i, lods: [{ name: "only", mesh: carMesh(colours[i % colours.length]) }], layout: G.LAYOUTS.lit, pipeline: bodyLitPipelineDesc(), bind: litBind(light) });
    const scene = G.makeGpuDrivenScene(device, { fleets, fleetOf, thresholds: [], records, headings });
    const setKeyframe = (kf) => { kf.poses.forEach((p, i) => { const o = (1 + i) * 4; rec[o] = p.pos[0]; rec[o + 1] = p.pos[1]; rec[o + 2] = p.pos[2]; rec[o + 3] = 1; ext.set(p.quat, o); }); fill(); };
    return { scene, setKeyframe, records: rec, extras: ext, count };
}

/** The camera that sees the whole grid from above, as the racing gates use it. */
export function overheadCamera(G, W, H, { fov = 0.9, height = 120 } = {}) {
    const eye = [0, height, 0.5], target = [0, 0, 0];
    return { viewProj: G.multiply(G.perspective(fov, W / H, 0.5, 800), G.lookAt(eye, target)), eye, W, H, fov, target };
}

/** FNV-1a over a byte array, as an 8-hex string. */
export function pixelHash(px) { let h = 0x811c9dc5; for (let i = 0; i < px.length; i++) { h ^= px[i]; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, "0"); }

/** Draw and READ BACK each keyframe. `sc` is replayScene's return; the camera is overheadCamera's. */
export async function renderKeyframes(sc, frames, cam, { clear = [0.03, 0.05, 0.08, 1] } = {}) {
    const out = [];
    for (const kf of frames) {
        sc.setKeyframe(kf);
        const raw = await sc.scene.frame({ viewProj: cam.viewProj, eye: cam.eye, read: true, clear }).pixels;
        // the read resolves to gfx/device.js's { pixels, width, height, backend } on both backends; the first draft
        // hashed the OBJECT's (undefined) length to the same 811c9dc5 for every frame, which the gate caught as six
        // identical keyframes, and a second draft's "ArrayBuffer" guess made six EMPTY ones. Take the bytes by name.
        const pixels = raw && raw.pixels ? raw.pixels : (raw instanceof Uint8Array ? raw : new Uint8Array(raw && raw.byteLength ? raw : 0));
        if (pixels.length !== cam.W * cam.H * 4) throw new Error(`renderKeyframes: ${pixels.length} bytes read for ${cam.W}x${cam.H}`);
        out.push({ tick: kf.tick, seconds: kf.seconds, pixels, hash: pixelHash(pixels) });
    }
    return out;
}

/** Project a world point with the camera; returns [px, py] in the frame. */
export function projectPoint(cam, p) {
    const vp = cam.viewProj;
    const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12], y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13], w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
    return [Math.round((x / w * 0.5 + 0.5) * cam.W), Math.round((1 - (y / w * 0.5 + 0.5)) * cam.H)];
}

/** The schematic: one row per keyframe, naming what the picture shows and which picture it is. */
export function keyframeManifest(rec, frames, rendered, { every, files = null, W = null, H = null } = {}) {
    return {
        kind: "swek-race-keyframes", scene: "race", seed: rec.seed, seconds: rec.seconds, ticks: rec.ticks, every, fleet: rec.fleet,
        driver: rec.weightsHash || null, fingerprint: rec.fingerprint, frame: { W, H }, cars: rec.log[0].length,
        keyframes: frames.map((kf, i) => ({ tick: kf.tick, seconds: +kf.seconds.toFixed(3), poses: kf.poses.map((p) => ({ pos: p.pos.map((v) => +v.toFixed(3)), quat: p.quat.map((v) => +v.toFixed(5)), speed: +p.speed.toFixed(2) })),
                                          file: files ? files[i] : null, pixelHash: rendered && rendered[i] ? rendered[i].hash : null })),
        note: "NOT REAL TIME: keyframes taken from the record's log played back through box3d, each drawn on the device and read back; a slideshow of what was rendered",
    };
}

export const MEASURED_V4528 = Object.freeze({
    at: "v4528",
    producedHere: Object.freeze(["voxel keyframes as PNG files with a JSON schematic", "a WebM (VP8/VP9) off the canvas through MediaRecorder"]),
    rigPending: "an H.264 MP4 a TV will play: the headless Chromium here reports video/mp4 supported and puts VP9 in the box (render/blobRecorder.js, v2588); libx264 lives on the rig",
    key: "*** THE FRAMES ARE THE RACE OR THEY ARE NOT: the keyframes come from the record's log played back through the same loop the fingerprint comes from, and the playback's fingerprint must equal the record's before a picture is drawn ***",
});

export function reportLines() {
    return [
        "[raceReplayBake] the replay pre-rendered: the track and city as voxels, the cars as quat-mode boxes, keyframes from the record's own log",
        `  voxels: asphalt ${VOXELS.asphalt} (ASH), kerb ${VOXELS.kerbA}/${VOXELS.kerbB} (STONE/SNOW striped), grass ${VOXELS.grass}; car box ${(CAR.half[0] * 2).toFixed(1)} x ${(CAR.half[1] * 2).toFixed(1)} x ${(CAR.half[2] * 2).toFixed(1)}`,
        "  produced here: " + MEASURED_V4528.producedHere.join("; "),
        "  rig-pending: " + MEASURED_V4528.rigPending,
        "  " + MEASURED_V4528.key,
    ];
}
