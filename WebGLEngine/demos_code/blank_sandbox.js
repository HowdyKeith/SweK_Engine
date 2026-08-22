// FILE: demos_code/blank_sandbox.js
// VERSION: v622 — a TRUE blank sandbox + a compass for orientation.
//
// An empty stage: the procedural kaiju world (terrain, water, grass, the 3
// memory obelisks, all the floating kaiju/megastructures) is hidden and the
// kaiju/civ simulation is paused. You get a flat floor under a plain sky and
// nothing else — a clean place to drop a rig, a WAD level, or any test
// without the kaiju city sim running behind it. Run rig.demo() while this is
// active to display the rig on the floor.
//
// v622 — mounts a small compass widget at the top of the screen (heading +
//        cardinal letter + needle pointing at true world north / -Z). The
//        minimap radar stays hidden (no demo flag = no minimap) and the
//        narrative panel is silent (no events emitted from this demo).

import { GyroCompass } from "../ui/gyroCompass.js";   // v1677 — 3D gyro/attitude compass replaces the flat 2D one

export default {
    id:    "blank_sandbox",
    label: "BLANK SANDBOX (empty stage)",
    hint:  "A clean slate world to play in",
    isolation: "exclusive",   // hide the voxel world + pause the kaiju/civ sim
    displayOrder: 2,   // v717 — sorts to position 3 in the demo list (after resume_fx, engine_saga)
    controls: [
        "Auto — a flat floor under a plain sky, nothing else",
        "Run rig.demo() in the console to drop the rig onto this stage",
        "Switch to another demo (or rig.stop()) to bring the world back",
    ],

    start() {
        const stage = (typeof window !== "undefined") ? window._stage : null;
        if (!stage) { console.warn("[blank_sandbox] stage manager not ready"); return; }

        // ALWAYS enter the isolated stage immediately — this hides the
        // terrain, kaiju, obelisks, etc. The sky / sun / moon / weather
        // are NOT entities and continue to render unaffected.
        // (v717's original implementation skipped this in intro mode,
        // which meant terrain stayed visible — exactly what the user
        // did NOT want.)
        stage.enter({ floor: true });

        // v997 — show the bare reference grid as the blank-world floor. This
        // also sets a clean dark backdrop and hides the sky/atmosphere, which
        // kills the stray lighting that was bleeding onto the empty stage.
        try { window.gridWorld?.on?.(); } catch (e) { console.warn("[blank_sandbox] grid on failed:", e?.message); }

        // v1737 - the gyro compass moved into the peer radar (cycle the radar to its "Compass" mode); no center compass.

        // v717r2 — Intro mode. The DIFFERENCE between intro and classic
        // blank is just:
        //   * intro keeps the ambient audio audible (so you hear the
        //     weather, the sky, the world being alive)
        //   * the moment the user spawns/builds/rigs ANYTHING, audio
        //     mutes — that's the "fade to blackness" effect
        // The sky + sun/moon + weather always render the same way; we
        // never touch those.
        //
        // No keyboard or pointer listeners — those triggered on every
        // WASD press or mouse-look, which was the bug in v717r1.
        const isFirstBoot = !window._blankSandboxIntroConsumed;
        if (isFirstBoot) {
            window._blankSandboxIntroConsumed = true;
            this._introActive = true;
            // v1000 — the empty stage stays SILENT. The whoosh was EngineAudio's
            // dynamic-ambient wind bed (a looping noise → ambientGain) becoming
            // audible when the AudioContext resumes on the first click. The v998
            // master-mute here lost the startup race (audio wasn't ready yet, then
            // the boot restore early-returned on the already-set flag). It's now
            // silenced race-free at the source by the exclusive-isolation gate in
            // engine/audio.js update(), without touching the global mute state.
            console.log("[blank_sandbox] intro mode — silent empty stage, sky/weather live, waiting for spawn");

            // Hook router.exec to detect ONLY real spawn/build actions.
            // Wraps the existing exec; properly torn down in stop() and
            // _exitIntro() regardless of which path runs first.
            const router = window.router;
            if (router && typeof router.exec === "function") {
                this._origRouterExec = router.exec.bind(router);
                const _self = this;
                router.exec = function(cmd) {
                    const result = _self._origRouterExec(cmd);
                    try {
                        const t = cmd && cmd.type;
                        if (typeof t === "string" && /^entity:spawn|^build|^rig/.test(t)) {
                            _self._exitIntro();
                        }
                    } catch {}
                    return result;
                };
            }
        } else {
            // Classic blank sandbox — silence the room
            try { window.muteAllAudio?.(); } catch {}
            this._mutedAudio = true;
        }
    },

    // v717r2 — graceful intro exit. Called on first spawn. Mutes audio
    // (the "fade") and restores router.exec. Safe to call multiple times.
    _exitIntro() {
        if (!this._introActive) return;
        this._introActive = false;
        console.log("[blank_sandbox] spawn detected — fading audio");
        try { window.muteAllAudio?.(); } catch {}
        this._mutedAudio = true;
        try {
            if (this._origRouterExec && window.router) {
                window.router.exec = this._origRouterExec;
                this._origRouterExec = null;
            }
        } catch {}
    },

    tick() { /* nothing to drive — it's an empty stage */ },

    stop() {
        try { if (window._stage) window._stage.leave(); } catch {}
        // v717r2 — ALWAYS restore router.exec (whether intro fired or not).
        // The v717 bug was that switching away from blank_sandbox without
        // touching anything left the router hook in place, which then
        // redirected EVERY subsequent demo's spawn calls — that's why
        // Resume FX didn't render until Settings → Quality forced a
        // re-init.
        try {
            if (this._origRouterExec && window.router) {
                window.router.exec = this._origRouterExec;
                this._origRouterExec = null;
            }
        } catch {}
        // Only unmute if we were the ones who muted (intro mode never
        // muted; only the classic-blank path or post-spawn _exitIntro did)
        if (this._mutedAudio) {
            try { window.unmuteAllAudio?.(); } catch {}
            this._mutedAudio = false;
        }
        this._introActive = false;
        // v1737 - no center compass to unmount (it lives in the peer radar now)
    },
};
