// facePuppet.js — v1387
// Drive the avatar's mouth from your webcam. Wires the existing
// MediaPipeFaceTracker (which already exposes {mouthOpen, eyeLeft, eyeRight,
// yaw, ...}) into avatarStage.setTalkLevel, so the jaw bone + visor vocoder
// bars follow your real mouth. Nothing runs until start() is called (camera
// permission prompt); stop() releases the camera. All processing is local.
//
//   window.facePuppet.start();   // talk — the avatar's mouth follows you
//   window.facePuppet.setGain(3.2);
//   window.facePuppet.stop();    // release camera, settle the jaw
//
// The talk envelope only lets an external level drive the jaw while "talking"
// is on (energy = ext * talkAmt), so the puppet holds setTalking(true) and
// refreshes a short talkFor() window each frame; stop() lets it settle.

import { makeMediaPipeFaceTracker } from "./MediaPipeFaceTracker.js";

export function makeFacePuppet(opts = {}) {
    let tracker = null, running = false;
    const getStage = opts.getStage || (() => window.avatarStage);
    // mouthOpen is ~0.03 closed, ~0.40+ wide; map to a 0..1 talk level.
    const cfg = { gain: opts.gain ?? 2.6, floor: opts.floor ?? 0.05 };

    async function start() {
        if (running) return { ok: true, already: true };
        tracker = makeMediaPipeFaceTracker(opts.tracker || {});
        tracker.onUpdate((m) => {
            if (!m || !running) return;
            const stage = getStage();
            if (!stage || !stage.setTalkLevel) return;
            let lvl = (m.mouthOpen - cfg.floor) * cfg.gain;
            lvl = lvl < 0 ? 0 : (lvl > 1 ? 1 : lvl);
            stage.setTalkLevel(lvl);
            if (stage.talkFor) stage.talkFor(1200);   // keep the talk window alive
        });
        try {
            const stage = getStage();
            if (stage && stage.setTalking) stage.setTalking(true);
            await tracker.start();
            running = true;
            console.log("[facePuppet] webcam -> avatar mouth. Talk; the jaw + vocoder follow you. facePuppet.stop() to end.");
            return { ok: true };
        } catch (e) {
            console.warn("[facePuppet] start failed:", e && e.message);
            try { tracker && tracker.stop(); } catch {}
            tracker = null; running = false;
            return { ok: false, error: String((e && e.message) || e) };
        }
    }

    function stop() {
        running = false;
        if (tracker) { try { tracker.stop(); } catch {} }
        tracker = null;
        const stage = getStage();
        try {
            if (stage && stage.setTalking) stage.setTalking(false);
            if (stage && stage.setTalkLevel) stage.setTalkLevel(-1);
        } catch {}
        console.log("[facePuppet] stopped, camera released");
        return { ok: true };
    }

    function setGain(g) { if (typeof g === "number") cfg.gain = g; return cfg.gain; }

    return { start, stop, setGain, get running() { return running; } };
}
