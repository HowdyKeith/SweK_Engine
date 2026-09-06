// WebGLEngine/render/voxelAvatar.mjs -- v4522 (Sandbox on the device, round 6: the avatar and camera)
//
// *** THE SANDBOX'S FIRST-PERSON WALK, ON THE DEVICE WORLD, THROUGH THE SANDBOX'S OWN CAMERA. *** camera/camera.js's Camera is
// the avatar index.html already has: in "fp" mode it walks with WASD at 5 units a second (9 sprinting on Shift), jumps on
// Space at 7.5 up under 18 down, stands 1.7 above a bilinear ground sample, auto-steps one voxel, slides along walls, and
// reads the world through world.voxelAt -- which round 1's world contract carries. It constructs with no canvas (its input
// attaches only when there is one) and steps with _move(dt), so a gate drives it headless on a hand world. This module adds
// the device side and nothing of its own physics:
//
//   avatarCamera(world, opts)     a Camera on the world in fp mode at (x, z), its eye snapped to the ground there
//   stepAvatar(cam, dt, keys)     one tick: the keys (or the camera's own, from its window listeners) and _move(dt)
//   avatarForward(yaw, pitch)     buildViewProj's forward: (sin yaw cos pitch, sin pitch, -cos yaw cos pitch)
//   avatarViewProj(cam, W, H, G)  the frame's matrix from the pose through gpuDriven's perspective and lookAt -- held to
//                                 camera/buildViewProj.js element for element (both are column-major, -z forward, +y up)
//   avatarPose(cam)               { x, y, z, yaw, pitch, onGround, velocity } for a HUD and a gate
//   avatarSpec(cam)               the constants the camera walks by, read from the instance rather than restated
"use strict";
import { Camera } from "../camera/camera.js";

export function avatarCamera(world, { canvas = null, x = 0.5, z = 0.5, yaw = 0, pitch = 0 } = {}) {
    const cam = new Camera(canvas);
    cam.setWorld(world); cam.position.x = x; cam.position.z = z; cam.yaw = yaw; cam.pitch = pitch;
    cam.setMode("fp");
    return cam;
}
export function stepAvatar(cam, dt = 1 / 60, keys = null) {
    if (keys) { cam.keys.clear(); for (const k of keys) cam.keys.add(k); }
    cam._move(Math.min(dt, 0.1));
    return avatarPose(cam);
}
export function avatarForward(yaw, pitch) { return [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)]; }
export function avatarViewProj(cam, W, H, G) {
    const eye = [cam.position.x, cam.position.y, cam.position.z], f = avatarForward(cam.yaw, cam.pitch);
    return { viewProj: G.multiply(G.perspective(cam.fov, W / H, cam.near, cam.far), G.lookAt(eye, [eye[0] + f[0], eye[1] + f[1], eye[2] + f[2]])), eye, target: [eye[0] + f[0], eye[1] + f[1], eye[2] + f[2]] };
}
export function avatarPose(cam) { return { x: cam.position.x, y: cam.position.y, z: cam.position.z, yaw: cam.yaw, pitch: cam.pitch, onGround: !!cam._fpOnGround, velocity: { ...cam.velocity } }; }
export function avatarSpec(cam) { return { eyeHeight: cam._eyeHeight, walk: cam._fpWalkSpeed, sprint: cam._fpSprintSpeed, jump: cam._fpJumpVel, gravity: cam._gravity, fov: cam.fov, near: cam.near, far: cam.far }; }
export { Camera };
