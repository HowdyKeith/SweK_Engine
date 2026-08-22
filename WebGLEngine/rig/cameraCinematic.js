// FILE: rig/cameraCinematic.js
// VERSION: v1 (v828 — POC of TrackAnimator driving the engine camera)
//
// Records camera keyframes (position + yaw + pitch) into a TrackAnimator
// clip, then plays back with smooth interpolation. Reuses the rig system's
// clip schema so cinematics can be saved to the asset library as type
// "clip" (with id="camera").
//
// API surface (window.cameraCinematic after install):
//   .startRecording()
//   .snapshot(label?)         — capture current camera state as a keyframe
//   .stopRecording() → clip   — finalize and return the clip object
//   .play(clip, opts?)        — start playback
//   .pause() / .resume() / .stop()
//   .isPlaying / .isRecording
//   .saveToLibrary(name)      — saves the in-progress recording as a clip asset
//
// Clip layout (compatible with TrackAnimator):
//   { duration: <sec>, bones: [
//       { id: "camera.pos",   frames: [{ t, position: [x,y,z] }, ...] },
//       { id: "camera.aim",   frames: [{ t, position: [yaw, pitch, 0] }, ...] },
//   ]}
//
// During playback, each frame writes camera.position + yaw/pitch from the
// interpolated values. Caller-supplied camera & TrackAnimator are passed
// in at install time to avoid hard-coupling to a global.

import { TrackAnimator } from "./RigSystem.js";

export class CameraCinematic {
    constructor(camera) {
        this.camera = camera;
        this.isRecording = false;
        this.isPlaying = false;
        this._recStartMs = 0;
        this._recKeyframes = [];     // [{ t, pos:[x,y,z], yaw, pitch, label? }]
        this._animator = null;       // TrackAnimator instance during playback
        this._playStartMs = 0;
        // Backup of camera state pre-playback for restore on stop
        this._preplayState = null;
    }

    startRecording() {
        this.isRecording = true;
        this._recStartMs = performance.now();
        this._recKeyframes = [];
        // Anchor a frame at t=0 (current camera state)
        this.snapshot("start");
        return { ok: true };
    }

    snapshot(label = null) {
        if (!this.isRecording) return { error: "not recording — call startRecording() first" };
        const t = (performance.now() - this._recStartMs) / 1000;
        const c = this.camera;
        this._recKeyframes.push({
            t,
            pos:   [c.position.x, c.position.y, c.position.z],
            yaw:   c.yaw   || 0,
            pitch: c.pitch || 0,
            label,
        });
        return { ok: true, t, count: this._recKeyframes.length };
    }

    stopRecording() {
        this.isRecording = false;
        if (this._recKeyframes.length < 2) {
            return { error: "need at least 2 keyframes; snapshot more before stopping" };
        }
        const clip = this._buildClip();
        return { ok: true, clip, keyframes: this._recKeyframes.length };
    }

    _buildClip() {
        const kf = this._recKeyframes;
        const duration = kf[kf.length - 1].t;
        return {
            duration,
            bones: [
                { id: "camera.pos", frames: kf.map(k => ({ t: k.t, position: k.pos.slice() })) },
                { id: "camera.aim", frames: kf.map(k => ({ t: k.t, position: [k.yaw, k.pitch, 0] })) },
            ],
            // Custom field — TrackAnimator ignores it but useful for editor
            _labels: kf.map(k => ({ t: k.t, label: k.label })),
        };
    }

    play(clip, opts = {}) {
        if (!clip?.bones) return { error: "invalid clip" };
        this._preplayState = {
            x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z,
            yaw: this.camera.yaw, pitch: this.camera.pitch,
        };
        // v829 — apply easing to the clip if requested (default smoother).
        // We clone the clip rather than mutate the caller's. Easing is set
        // at clip level so per-keyframe ease (if author specified) still wins.
        let workClip = clip;
        const ease = opts.ease ?? "easeInOut";
        if (ease && ease !== "linear" && !clip.ease) {
            workClip = { ...clip, ease, bones: clip.bones };
        }
        this._animator = new TrackAnimator(workClip);
        this._animator.loop = opts.loop !== false;
        this._animator.play(performance.now() / 1000);
        this.isPlaying = true;
        this._currentClip = workClip;
        return { ok: true, duration: workClip.duration, ease };
    }

    pause()  { if (this._animator) this._animator.pause(); this.isPlaying = false; }
    resume() { if (this._animator) this._animator.play(performance.now() / 1000); this.isPlaying = true; }

    stop(restoreCamera = false) {
        this.isPlaying = false;
        this._animator = null;
        if (restoreCamera && this._preplayState) {
            this.camera.position.x = this._preplayState.x;
            this.camera.position.y = this._preplayState.y;
            this.camera.position.z = this._preplayState.z;
            this.camera.yaw   = this._preplayState.yaw;
            this.camera.pitch = this._preplayState.pitch;
        }
        this._preplayState = null;
    }

    // Per-frame hook — called from main loop after camera input handling.
    // Returns true if the camera was driven by playback this frame.
    tick(nowSec) {
        if (!this._animator || !this.isPlaying) return false;
        const r = this._animator.tick(nowSec);
        const pos = r["camera.pos"]?.position;
        const aim = r["camera.aim"]?.position;
        if (pos) {
            this.camera.position.x = pos[0];
            this.camera.position.y = pos[1];
            this.camera.position.z = pos[2];
        }
        if (aim) {
            this.camera.yaw   = aim[0];
            this.camera.pitch = aim[1];
        }
        // Auto-stop on one-shot completion
        const dur = this._currentClip?.duration || 0;
        if (!this._animator.loop && r._t > dur) {
            this.stop(false);
        }
        return true;
    }

    /** Save the current recording (or a given clip) to the asset library. */
    async saveToLibrary(name, optClip = null) {
        const clip = optClip || this._buildClipFromRecording();
        if (!clip || !clip.bones) return { error: "no clip to save — record first or pass clip arg" };
        if (!window.assetLibrary?.add) return { error: "assetLibrary not available" };
        // Save as a regular clip asset (the asset library validates the schema)
        return await window.assetLibrary.add({
            name: name || ("camera-" + Date.now()),
            type: "clip",
            source: "camera-cinematic",
            data: { duration: clip.duration, bones: clip.bones },
            tags: ["camera", "cinematic"],
            notes: `Camera cinematic with ${clip.bones[0]?.frames?.length || 0} keyframes`,
        });
    }

    _buildClipFromRecording() {
        if (this._recKeyframes.length < 2) return null;
        return this._buildClip();
    }
}

export function installCameraCinematicGlobal(camera) {
    if (!window.cameraCinematic && camera) {
        window.cameraCinematic = new CameraCinematic(camera);
    }
    return window.cameraCinematic;
}
