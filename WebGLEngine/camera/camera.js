// FILE: camera/camera.js
// VERSION: v9 - INPUT + PROJECTION (fixes 3 latent crashes from v8)
//
// v9 fixes:
//   * _attachInput() was called by the constructor but never defined.
//     The Camera failed to construct on page load. Now implements
//     pointer-lock + mouse-look + WASD/Space/Shift tracking.
//   * getViewProjMatrix() returned this.viewProj which was never
//     computed. Now update() builds the matrix each frame via the
//     shared buildViewProj() helper. Aspect ratio derives from
//     canvas.width/height so DPR-driven resizes are picked up.
//   * Projection params (fov, near, far) added as fields.

import { buildViewProj } from "./buildViewProj.js";
// v4545 -- the body-aware voxel probe, rather than a third copy of its rule. See _terrainTopAt.
import { standHeightAt } from "../world/surfaceProbe.mjs";

/**
 * *** RE-DERIVED BY tools/ship/playerGround-selfcheck.mjs ON EVERY RUN. *** Readings at v4545.
 */
export const PLAYER_GROUND_AT_V4545 = Object.freeze({
    at: "v4545",
    // the population, measured in a real boot of index.html
    columns: 1681,
    multiSurface: 921,          // columns holding more than one place a body can stand
    multiSurfacePct: 54.8,      // NOT reproducible boot to boot -- the floor below is what a gate may assert
    multiSurfaceFloorPct: 25,
    bodyPlaces: 2687,
    topmostRight: 1681,         // 62.56%, and exactly the column count, which is the finding
    topmostRightPct: 62.56,
    worstGap: 42,               // voxels between the lowest surface and the topmost answer
    // the scan ceiling this query used, against the world's own
    scannedFrom: 80,
    worldChunkHeight: 64,
    // what the defect actually did, driven on a cave with a rising floor
    stuckAtX: 13.92,            // where HEAD stops dead, four units into the cave
    stuckAtY: 2.7,
    repairedX: 27.17,           // and where the body-aware query gets to
    repairedY: 6.7,
    stepUpMax: 1.2,
});

/**
 * *** RE-DERIVED BY tools/ship/playerSlope-selfcheck.mjs ON EVERY RUN. *** Readings at v4546.
 */
export const PLAYER_SLOPE_AT_V4546 = Object.freeze({
    at: "v4546",
    // the population, measured in a real boot of index.html over a 3-unit lattice
    columns: 1681,
    pairs: 6279,                // adjacent walkable column pairs a body could step between
    steep: 254,                 // pairs steeper than 45 degrees -- ground the bots refuse
    steepPct: 4.05,             // NOT reproducible boot to boot; the floor below is what a gate may assert
    steepFloorPct: 1,
    worstDeg: 88.1,
    // *** THE LATTICE EXPRESSES NO SLOPE BETWEEN 45.0 AND 60 DEGREES, AND THAT IS MEASURED RATHER THAN
    // REASONED. *** 1,826 pairs land in the [45, 60) bucket and EVERY ONE of them is exactly 45.0 -- a
    // one-voxel lip -- while every steep pair is 60 or more. So the limit could be 45, 50 or 60 and refuse
    // the identical ground on this world; 45 is chosen to match terrainWalk's default, not because this
    // world can tell it from the others.
    atExactly45: 1826,
    bucket0to15: 4199, bucket45to60: 1826, bucket60to75: 183, bucket75to90: 71,
    // what the old rule did, driven on a plateau falling k voxels per column
    headWalkedDownDeg: 63.4,    // walked down at full speed, permanently grounded, 0 frames airborne
    headSurfaceSpeed: 8.247,    // units per second along the ground, against a walk speed of 5
    // *** THE OLD RULE WAS A FRAME-RATE SWITCH. *** One body, one speed, one 63.4-degree slope:
    fellAtFps: 6,               // and only at 6 -- 10, 15, 20, 30, 60, 120, 144 and 240 all walked it
    walkedAtFps: Object.freeze([10, 15, 20, 30, 60, 120, 144, 240]),
    // the first draft of the repair, and what killed it
    firstDraftFellOnDeg: 26.6,  // a shallow hill, because a run that shrinks with dt shrinks into a lip
    // *** TWO NUMBERS, AND THEY MEASURE DIFFERENT THINGS -- SAID HERE BECAUSE THE FIRST DRAFT OF THIS
    // RECORD CARRIED ONE AND THE GATE ASSERTED IT AGAINST THE OTHER, AND WENT RED. *** `fellFrames` was
    // taken with the draft INSTALLED as the rule, so the body really left the ground and its whole path
    // differed from then on; the gate cannot re-run that without shipping the draft. `wouldFire` is what
    // the draft's arithmetic reports while the SHIPPED rule drives the body, which is re-derivable and is
    // what section 3 asserts. The shipped rule reports 0 on the same walk either way.
    firstDraftFellFrames: 76,   // of 240, with the draft installed -- NOT re-derived by the gate
    firstDraftWouldFire: 18,    // of 240, observed alongside the shipped rule -- this one is re-derived
    // the float error the inclusive limit has to absorb, measured on an exactly-45-degree ramp
    observedAt45: 45.0000000000001990,
    epsDeg: 1e-9,
    maxSlopeDeg: 45,
    slopeRun: 1,
});

export class Camera {
    // The keys the _move* methods consult in EVERY mode that moves. KeyE is deliberately absent: it is
    // kaiju-drive only, and consumesKey() adds it there. Cross-checked against the keys.has() literals in this
    // file by tools/ship/cameraKeys-selfcheck.mjs, so this cannot quietly fall behind the code it describes.
    static MOVEMENT_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft"]);

    /** The tallest auto-step, in voxels. Read by _moveFP's walk rule AND by _terrainTopAt's reach, which
     *  are the same question asked twice -- so it is one number rather than two that must agree. */
    static STEP_UP_MAX = 1.2;

    /** Steeper than this and the ground is not walkable DOWN; the body leaves it and falls. v4546.
     *  45 is physics/character/terrainWalk.mjs's own default, taken so the player and the bots refuse the
     *  same ground rather than two numbers nobody compared. *** ON A VOXEL LATTICE EVERY LIMIT FROM 45 UP
     *  TO 63.4 IS THE SAME RULE, *** because the only slopes a lattice can express are n voxels per column
     *  -- 45.0, 63.4, 71.6 degrees -- and nothing lies between the first two. So this number is chosen to
     *  MATCH THE BOTS and not because this world can tell it from 50 or 60; said here rather than implied. */
    static MAX_SLOPE_DEG = 45;

    /** The world distance the slope is measured over, in voxels. ONE COLUMN, and it is fixed rather than
     *  derived from the frame's own travel for the reason _fpSlopeDeg sets out: a run that shrinks with dt
     *  shrinks into a single lip and reports 90 degrees for ordinary ground. v4546. */
    static SLOPE_RUN = 1;

    /** The tolerance that makes MAX_SLOPE_DEG inclusive, in degrees. See _moveFP's cliff branch: the
     *  bilinear blend puts about 2e-13 degrees of float error on an exactly-45-degree ramp. v4546. */
    static SLOPE_EPS_DEG = 1e-9;


    constructor(canvas) {

        this.canvas = canvas;

        this.position = { x: 0, y: 50, z: 50 };

        this.yaw = 0;
        this.pitch = -0.4;

        this.moveSpeed = 25;
        this.lookSpeed = 0.0025;

        this.locked = false;
        this._rotLock = false;          // v1735 - when true, mouse/drag/gamepad rotation is suppressed (#2: lock until floor draws)
        this._rotLockTimer = 0;
        this.lockRotation = (ms) => { this._rotLock = true; if (this._rotLockTimer) clearTimeout(this._rotLockTimer); this._rotLockTimer = setTimeout(() => { this._rotLock = false; this._rotLockTimer = 0; }, ms || 7000); };
        this.unlockRotation = () => { this._rotLock = false; if (this._rotLockTimer) { clearTimeout(this._rotLockTimer); this._rotLockTimer = 0; } };

        this.keys = new Set();

        // required for multiplayer + portal physics
        this.velocity = { x: 0, y: 0, z: 0 };

        this._lastTime = 0;

        // Round 28 — first-person agent mode. "observer" = free-fly
        // (default), "fp" = ground-locked walk + jump + collision.
        // World ref injected via setWorld() once world is constructed.
        // Round 96 — "ogre_orbit" = follow-cam circling a target entity
        // (the OGRE chassis usually). Target is set via setOrbitTarget;
        // movement code in _moveOrbit advances yaw and computes the
        // camera position with terrain-avoidance clearance.
        this.mode = "observer";
        this.world = null;
        this._fpVelY = 0;
        this._fpOnGround = false;
        this._eyeHeight = 1.7;          // body+head from ground
        this._fpWalkSpeed = 5;
        this._fpSprintSpeed = 9;
        this._fpJumpVel = 7.5;
        this._gravity = 18;             // m/s² downward in FP mode
        this._fpFallStartTime = 0;       // diagnostic: time spent airborne
        // Round 31 — energy bar gates sprint. main.js installs ref.
        this.playerEnergy = null;
        // Round 96 — orbit-cam state. Target can be a single object
        // {position:{x,y,z}} (OGRE), an array of such objects (2-OGRE
        // framing), or null. Distance/height adapt to spread automatically.
        this._orbitTarget   = null;
        this._orbitAngle    = 0;            // radians around target's Y axis
        this._orbitYawRate  = 0.18;         // rad/sec — slow lazy orbit
        this._orbitDistance = 55;           // base distance from target
        this._orbitHeight   = 20;           // height above target
        this._orbitMinY     = 8;            // never drop below this absolute
        this._orbitClearance= 6;            // raise above terrain by this much

        // Projection params (used by buildViewProj). Aspect ratio is
        // recomputed each update() against the canvas's current
        // framebuffer dimensions, so DPR-driven resizes are picked up
        // automatically.
        this.fov  = 70 * Math.PI / 180;
        this.near = 0.1;
        this.far  = 1000;
        // Round 31 polish — FOV "kick": a transient punch on weapon fire/landing that
        // eases back to base, plus a sustained widen while sprinting. Both add onto fov.
        this._fovKickAmp = 0; this._fovKickUntilT = 0; this._fovKickDuration = 1;
        this._fovSprint = 0; this._sprinting = false; this._fovLastT = 0;
        this.viewProj = new Float32Array(16);

        this._attachInput();
    }

    update() {

        const t = performance.now();

        if (!this._lastTime) this._lastTime = t;

        const dt = Math.min((t - this._lastTime) / 1000, 0.1);
        this._lastTime = t;

        // WASD/Space/Shift work whether or not pointer-lock is engaged.
        this._move(dt);

        // Round 28 — shake offset. Random-jitter the position passed to
        // buildViewProj so the matrix is shaken without mutating the
        // logical camera position.
        let camX = this.position.x;
        let camY = this.position.y;
        let camZ = this.position.z;
        if (this._shakeUntilT && t < this._shakeUntilT) {
            const remain = (this._shakeUntilT - t) / Math.max(1, this._shakeDuration);
            const amp = this._shakeAmp * remain;
            // v794 — directional shake bias. If a direction was set
            // (dirX/dirZ non-zero, normalized), 60% of the shake pushes
            // along that direction, 40% remains isotropic. Y stays purely
            // isotropic so the player doesn't get vertically-launched on
            // horizontal hits.
            const dx = this._shakeDirX ?? 0;
            const dz = this._shakeDirZ ?? 0;
            const dirActive = (dx !== 0 || dz !== 0);
            const isoJitterX = (Math.random() - 0.5) * 2 * amp;
            const isoJitterY = (Math.random() - 0.5) * 2 * amp;
            const isoJitterZ = (Math.random() - 0.5) * 2 * amp;
            if (dirActive) {
                // Bias: 0.6 * (signedPulse * dir) + 0.4 * isotropic
                const pulse = (Math.random() * 0.7 + 0.3) * amp;   // 30-100% of amp, always positive
                camX += 0.6 * pulse * dx + 0.4 * isoJitterX;
                camY += isoJitterY;       // Y stays isotropic
                camZ += 0.6 * pulse * dz + 0.4 * isoJitterZ;
            } else {
                camX += isoJitterX;
                camY += isoJitterY;
                camZ += isoJitterZ;
            }
        }

        // Recompute view-projection matrix each frame.
        const aspect = this.canvas
            ? this.canvas.width / Math.max(1, this.canvas.height)
            : 1;
        // Round 31 — effective FOV = base + transient kick (linear decay, like shake)
        // + sustained sprint widen (eased). Subtle; only meaningful in first-person.
        const _now = performance.now();
        let _fovK = 0;
        if (this._fovKickUntilT && _now < this._fovKickUntilT) {
            _fovK = this._fovKickAmp * (this._fovKickUntilT - _now) / Math.max(1, this._fovKickDuration);
        } else { this._fovKickUntilT = 0; this._fovKickAmp = 0; }
        const _fdt = this._fovLastT ? Math.min(0.05, (_now - this._fovLastT) / 1000) : 0;
        this._fovLastT = _now;
        const _sprTarget = (this._sprinting && this.mode === "fp") ? (8 * Math.PI / 180) : 0;
        this._fovSprint += (_sprTarget - this._fovSprint) * Math.min(1, _fdt * 8);
        const _fovEff = this.fov + _fovK + this._fovSprint;
        buildViewProj(this.viewProj, { x: camX, y: camY, z: camZ }, this.yaw, this.pitch,
                      _fovEff, this.near, this.far, aspect);
    }

    // Round 28 — trigger camera shake. amp = world units, durationMs.
    // Shake decays linearly to zero. Multiple shakes overwrite (latest wins
    // unless the new shake's remaining magnitude < current).
    // v794 — optional directional bias (dirX, dirZ). When non-null, the
    // shake jitter is 60% directional + 40% isotropic so the player
    // feels the hit coming FROM that direction (vector points from
    // source to player). Existing 2-arg callers behave unchanged.
    shake(amp, durationMs = 200, dirX = null, dirZ = null) {
        const now = performance.now();
        const newEnd = now + durationMs;
        const curRemain = this._shakeUntilT
            ? (this._shakeUntilT - now) / Math.max(1, this._shakeDuration) * (this._shakeAmp ?? 0)
            : 0;
        if (amp >= curRemain) {
            this._shakeAmp      = amp;
            this._shakeUntilT   = newEnd;
            this._shakeDuration = durationMs;
            // v794 — store direction bias (normalized to XZ plane)
            if (dirX != null && dirZ != null) {
                const len = Math.hypot(dirX, dirZ);
                if (len > 1e-5) {
                    this._shakeDirX = dirX / len;
                    this._shakeDirZ = dirZ / len;
                } else {
                    this._shakeDirX = this._shakeDirZ = 0;
                }
            } else {
                this._shakeDirX = this._shakeDirZ = 0;
            }
        }
    }

    // Round 31 polish — transient FOV "kick": a quick punch that eases back to base
    // (weapon fire, landings). amount in radians (+ widens / - narrows); linear decay.
    // Latest wins unless the current punch still has more magnitude.
    fovKick(amount, durationMs = 150) {
        const now = performance.now();
        const curRemain = this._fovKickUntilT
            ? (this._fovKickUntilT - now) / Math.max(1, this._fovKickDuration) * (this._fovKickAmp || 0)
            : 0;
        if (Math.abs(amount) >= Math.abs(curRemain)) {
            this._fovKickAmp = amount; this._fovKickUntilT = now + durationMs; this._fovKickDuration = durationMs;
        }
    }

    // ------------------------------------------------------------
    // INPUT — fixes a latent crash where _attachInput() was called
    // in the constructor but never defined. The page would throw
    // before any frame rendered. v2.22 implements standard FPS
    // controls: click-to-lock, mouse-look, WASD/Space/Shift.
    //
    // v2.24f: pointer-lock is now bound to MIDDLE-CLICK toggle, not
    // left-click. Left-click in unlocked mode goes through to the DOM
    // so the HUD palette swatches (and any other clickable UI) work.
    // Middle-click toggles in/out of FP mode. Escape also exits as
    // before (browser handles that).
    // ------------------------------------------------------------
    _attachInput() {
        if (!this.canvas) return;
        const canvas = this.canvas;

        // Drag-rotate state for non-locked mode. Left-click + hold + drag
        // rotates the camera the same way pointer-lock mouse-look does,
        // but the cursor stays visible so the HUD remains clickable.
        // (Pointer-lock via middle-click is still the precise mode.)
        this._dragging = false;
        this._dragLastX = 0;
        this._dragLastY = 0;

        // Middle-click toggles pointer lock. Use mousedown so we can
        // preventDefault() — middle-button on Windows otherwise triggers
        // auto-scroll mode which we definitely don't want over the canvas.
        canvas.addEventListener("mousedown", (e) => {
            if (e.button === 1) {
                e.preventDefault();
                if (this.locked) {
                    if (document.exitPointerLock) document.exitPointerLock();
                } else if (canvas.requestPointerLock) {
                    canvas.requestPointerLock();
                }
                return;
            }
            // v774 (round 31) — left-click in kaiju_drive mode fires
            // the controlled kaiju's primary attack via the KaijuManager
            // playerFire hook. Pointer-lock-or-not both work (drag-rotate
            // is moot in kaiju_drive since look comes from mouse delta).
            if (e.button === 0 && this.mode === "kaiju_drive") {
                e.preventDefault();
                // v777 — also track LMB-held for sustained fire. Each
                // frame _moveKaijuDrive will autofire if this is true.
                this._lmbHeld = true;
                const k = this._kaijuTarget;
                const km = (typeof window !== "undefined") ? window.kaijuManager : null;
                if (k && km?.playerFire) {
                    const result = km.playerFire(k, this);   // v775 — pass camera for crosshair targeting
                    // Quiet on success; warn on failure modes that the
                    // player can do something about ("no_target" =
                    // turn to face something).
                    if (!result.ok) {
                        // Throttle to avoid console spam from held click
                        const now = performance.now();
                        if (!this._lastFireReasonMs || now - this._lastFireReasonMs > 800) {
                            console.log(`[kaiju_drive] can't fire: ${result.reason}`);
                            this._lastFireReasonMs = now;
                        }
                    }
                }
                return;
            }
            // Left button + not pointer-locked = enter drag-rotate mode.
            // (When locked, EditorController handles left-click as voxel
            // remove, so we don't want to interfere.)
            if (e.button === 0 && !this.locked) {
                this._dragging = true;
                this._dragLastX = e.clientX;
                this._dragLastY = e.clientY;
                canvas.style.cursor = "grabbing";
            }
        });
        // Suppress middle-click auxclick (some browsers fire this for
        // "open in new tab" semantics on middle-click).
        canvas.addEventListener("auxclick", (e) => {
            if (e.button === 1) e.preventDefault();
        });

        // Round 42 — mouse wheel zoom (free-fly): move camera along its
        // forward axis. In observer mode this functions like a dolly.
        // In FP mode, scroll is ignored (player movement is keyboard).
        canvas.addEventListener("wheel", (e) => {
            // v780 — kaiju_drive mode: wheel cycles the attack rotation
            // (primary → alt → alt2). Lets the player pick which attack
            // to fire next without waiting for natural rotation advance.
            // v781 — proper modulo via peekPlayerAttack's rotLen so the
            // index wraps correctly for rotations of any length.
            if (this.mode === "kaiju_drive") {
                const k = this._kaijuTarget;
                if (k) {
                    e.preventDefault();
                    const km = (typeof window !== "undefined") ? window.kaijuManager : null;
                    const preview = km?.peekPlayerAttack?.(k);
                    const rotLen = preview?.rotLen ?? 1;
                    if (rotLen > 1) {
                        const delta = e.deltaY > 0 ? 1 : -1;
                        const field = k.becameKing ? "_kingAttackRotIdx" : "_attackRotIdx";
                        const cur = k[field] ?? 0;
                        k[field] = ((cur + delta) % rotLen + rotLen) % rotLen;
                        // Toast the new attack name so the player gets visual confirmation
                        try {
                            const updated = km?.peekPlayerAttack?.(k);
                            if (updated && window.toast?.show) {
                                window.toast.show(`switched to ${updated.attackName} [${updated.rotIdx + 1}/${updated.rotLen}]`, { ms: 1200 });
                            }
                        } catch {}
                    }
                }
                return;
            }
            if (this.mode === "fp") return;
            e.preventDefault();
            // Forward vector (yaw=0 → -Z; positive pitch up). Same convention
            // as the engine's voxel/listener mapping.
            const cy = Math.cos(this.yaw),  sy = Math.sin(this.yaw);
            const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
            const fx =  sy * cp;
            const fy =  sp;
            const fz = -cy * cp;
            // deltaY is positive when scrolling DOWN (away from user) — that
            // should pull the camera backward (zoom out). Invert sign.
            const step = -e.deltaY * 0.06;
            this.position.x += fx * step;
            this.position.y += fy * step;
            this.position.z += fz * step;
        }, { passive: false });

        // End drag on mouseup anywhere (so even if cursor leaves canvas
        // mid-drag, the next mousemove won't keep rotating).
        window.addEventListener("mouseup", (e) => {
            if (e.button === 0 && this._dragging) {
                this._dragging = false;
                canvas.style.cursor = "";
            }
            // v777 — release LMB sustains (kaiju autofire stops)
            if (e.button === 0) this._lmbHeld = false;
        });

        // Track lock state — driven by the browser's lock change events.
        const onLockChange = () => {
            this.locked = (document.pointerLockElement === canvas);
        };
        document.addEventListener("pointerlockchange", onLockChange);

        // Mouse-look: pointer-locked uses movementX/Y from the lock API.
        // Drag-rotate (unlocked) computes its own delta from clientX/Y.
        const LIMIT = Math.PI / 2 - 0.01;
        window.addEventListener("mousemove", (e) => {
            if (this.locked) {
                if (this._rotLock) return;   // v1735 - rotation locked until the floor draws (#2)
                this.yaw   += e.movementX * this.lookSpeed;
                this.pitch -= e.movementY * this.lookSpeed;
            } else if (this._dragging) {
                const dx = e.clientX - this._dragLastX;
                const dy = e.clientY - this._dragLastY;
                this._dragLastX = e.clientX;   // keep the delta current so there's no jump when it unlocks mid-drag
                this._dragLastY = e.clientY;
                if (this._rotLock) return;   // v1735 - rotation locked until the floor draws (#2)
                this.yaw   += dx * this.lookSpeed;
                this.pitch -= dy * this.lookSpeed;
            } else {
                return;
            }
            if (this.pitch >  LIMIT) this.pitch =  LIMIT;
            if (this.pitch < -LIMIT) this.pitch = -LIMIT;
        });

        // Keyboard tracking — _move() reads this.keys. Works in both
        // modes (locked or not) so WASD/Space/Shift always navigate.
        window.addEventListener("keydown", (e) => {
            // Round 43 — don't fire camera keys while the user is typing
            // in an input/textarea (Ollama prompt was triggering F-mode
            // toggle when "F" was typed).
            const tgt = e.target;
            if (tgt && (tgt.tagName === "INPUT" ||
                        tgt.tagName === "TEXTAREA" ||
                        tgt.isContentEditable)) {
                return;
            }
            this.keys.add(e.code);
            // Round 28 — F toggles first-person agent mode.
            // keydown fires once on press, so the toggle doesn't
            // ricochet while the key is held.
            if (e.code === "KeyF" && !e.repeat) {
                this.toggleMode();
            }
        });
        window.addEventListener("keyup", (e) => {
            this.keys.delete(e.code);
        });
    }

    setWorld(world) {
        this.world = world;
    }

    setMode(mode) {
        if (mode !== "observer" && mode !== "fp" && mode !== "missile_cam" && mode !== "ogre_orbit" && mode !== "kaiju_drive") return;
        const prevMode = this.mode;
        this.mode = mode;
        // v797 — when leaving kaiju_drive, clear any active beam ribbon so
        // we don't draw a stale beam to where the dead/abandoned kaiju was.
        if (prevMode === "kaiju_drive" && mode !== "kaiju_drive") {
            try {
                const km = (typeof window !== "undefined") ? window.kaijuManager : null;
                if (km?._activeBeams) km._activeBeams.clear();
            } catch {}
            this._lmbHeld = false;
        }
        if (mode === "fp") {
            // Snap to ground at current XZ
            const groundY = this._terrainTopAt(this.position.x, this.position.z);
            this.position.y = groundY + this._eyeHeight;
            this._fpVelY = 0;
            this._fpOnGround = true;
        }
        if (mode === "ogre_orbit") {
            // Reset angle so we don't start mid-frame at a strange spot.
            // The first _moveOrbit tick will snap to position based on target.
            this._orbitAngle = 0;
        }
        if (mode === "kaiju_drive") {
            // Round 124 — kaiju first-person drive. Camera snaps to the
            // controlled kaiju's position next tick (in _moveKaijuDrive);
            // here we just initialize per-mode state. Stamina lives on
            // the kaiju entity itself (k._stamina) so multiple kaiju can
            // each be driven across mode toggles without state leakage.
            this._kaijuDriveVelY = 0;
            this._kaijuDriveOnGround = true;
            // Round 125 — set persistent player-drive flag so AI tick
            // skips and mesh-sync can pick velocity-based clip.
            if (this._kaijuTarget) this._kaijuTarget._isPlayerDriven = true;
        }
        // Round 124 — leaving kaiju_drive: clear AI-skip flag so the
        // kaiju's AI takes over again cleanly on next tick.
        if (prevMode === "kaiju_drive" && mode !== "kaiju_drive") {
            if (this._kaijuTarget) this._kaijuTarget._isPlayerDriven = false;
        }
        // Round 40 — show/hide mech cockpit overlay
        if (this._onModeChange) this._onModeChange(mode);
        console.log(`[Camera] mode → ${mode}`);
    }

    // Round 124 — set the kaiju entity to drive in first-person mode.
    // Pass null to clear. Doesn't change mode; caller toggles via
    // setMode("kaiju_drive") after picking a target.
    setKaijuTarget(k) {
        // Round 125 — when switching target, clear flag on the old one
        // so its AI resumes
        if (this._kaijuTarget && this._kaijuTarget !== k) {
            this._kaijuTarget._isPlayerDriven = false;
        }
        this._kaijuTarget = k || null;
        // If we're already in drive mode, mark the new target as driven
        if (k && this.mode === "kaiju_drive") {
            k._isPlayerDriven = true;
        }
    }

    // Round 96 — set the target the orbit cam circles. Accepts:
    //   - a single object with .position {x,y,z}  (typical: the OGRE)
    //   - an array of such objects (frame both when 2 OGREs present)
    //   - null/empty (clears target; orbit cam falls back to observer)
    // Doesn't change mode — call setMode("ogre_orbit") separately to
    // engage. Keeps target update + mode toggle independent so the
    // caller can pre-set the target before entering the mode.
    setOrbitTarget(target) {
        if (target == null) {
            this._orbitTarget = null;
            return;
        }
        if (Array.isArray(target)) {
            if (target.length === 0) { this._orbitTarget = null; return; }
            this._orbitTarget = target;
        } else {
            this._orbitTarget = target;
        }
    }

    toggleMode() {
        // Round 46 — missile_cam isn't a player-toggleable mode; ignore
        // F-key while a missile is in flight. MissileSystem owns the
        // mode change in/out.
        if (this.mode === "missile_cam") return;
        this.setMode(this.mode === "observer" ? "fp" : "observer");
    }

    _move(dt) {
        // Round 46 — missile_cam: skip player movement entirely.
        // MissileSystem.tick drives camera position; mouse-look still
        // updates yaw/pitch (used as missile heading).
        if (this.mode === "missile_cam") return;
        if (this.mode === "ogre_orbit") {
            this._moveOrbit(dt);
            return;
        }
        if (this.mode === "kaiju_drive") {
            this._moveKaijuDrive(dt);
            return;
        }
        if (this.mode === "fp") {
            this._moveFP(dt);
        } else {
            this._moveObserver(dt);
        }
    }

    // Round 96 — orbit-cam tick. Circles a target (or framed midpoint
    // of multiple targets) at increasing distance with spread, raises Y
    // when terrain at the desired XZ would clip into the camera. Looks
    // at the target each frame so yaw/pitch track automatically.
    //
    // If target is null/empty, gracefully degrades to a hover-in-place
    // (camera doesn't fly off; user can switch to observer to recover).
    _moveOrbit(dt) {
        // Resolve target — single or list. Compute centroid + spread.
        let cx = 0, cy = 0, cz = 0, n = 0;
        let maxSpread = 0;
        const arr = Array.isArray(this._orbitTarget) ? this._orbitTarget : (this._orbitTarget ? [this._orbitTarget] : []);
        for (const t of arr) {
            const p = t?.position;
            if (!p) continue;
            cx += p.x; cy += p.y; cz += p.z;
            n++;
        }
        if (n === 0) return;                  // no target, hover in place
        cx /= n; cy /= n; cz /= n;
        if (n > 1) {
            for (const t of arr) {
                const p = t?.position;
                if (!p) continue;
                const d = Math.hypot(p.x - cx, p.z - cz);
                if (d > maxSpread) maxSpread = d;
            }
        }

        // Advance orbit angle
        this._orbitAngle += this._orbitYawRate * dt;
        if (this._orbitAngle > Math.PI * 2) this._orbitAngle -= Math.PI * 2;

        // Distance scales up if framing 2+ targets (need more space)
        const dist = this._orbitDistance + maxSpread * 1.4;
        const height = this._orbitHeight + maxSpread * 0.4;

        // Desired camera position on a circle around (cx, cz)
        const dx = Math.cos(this._orbitAngle) * dist;
        const dz = Math.sin(this._orbitAngle) * dist;
        let px = cx + dx;
        let pz = cz + dz;
        let py = cy + height;

        // Terrain avoidance — sample the surface at the desired XZ.
        // If our requested Y would have the camera below terrain (or
        // within clearance of it), lift the camera up. This prevents
        // the "inside-mountain" view the user flagged earlier.
        // Also sample a few intermediate points between target and
        // camera so we catch ridges that intrude into the sightline.
        //
        // v405 — bilinear sampling. The integer _terrainTopAt produced
        // visible stairs as the orbit angle swept across voxel
        // boundaries; bilinear gives a smooth float height per sample,
        // and taking the max of smooth samples is still smooth.
        if (this.world?.voxelAt) {
            const samples = 4;
            let maxTopY = -Infinity;
            for (let i = 1; i <= samples; i++) {
                const t = i / samples;
                const sx = cx + dx * t;
                const sz = cz + dz * t;
                const topY = this._terrainTopAtBilinear(sx, sz);
                if (topY > maxTopY) maxTopY = topY;
            }
            const requiredY = maxTopY + this._orbitClearance;
            if (py < requiredY) py = requiredY;
        }
        if (py < this._orbitMinY) py = this._orbitMinY;

        this.position.x = px;
        this.position.y = py;
        this.position.z = pz;

        // Look at target centroid (slightly above center to bias up)
        const lookX = cx;
        const lookY = cy + 2;
        const lookZ = cz;
        const fwdX = lookX - px;
        const fwdY = lookY - py;
        const fwdZ = lookZ - pz;
        // Yaw: atan2 with engine convention atan2(x, z) so yaw=0 looks +Z
        this.yaw   = Math.atan2(fwdX, fwdZ);
        // Pitch from horizontal: positive looks UP, negative DOWN.
        // Since we're above the target looking down, pitch is negative.
        const horiz = Math.hypot(fwdX, fwdZ);
        this.pitch = -Math.atan2(-fwdY, horiz);     // sign so down → negative
    }

    // v3911 -- *** WHO OWNS A KEY, ASKED RATHER THAN GUESSED. ***
    // Keith: pressing W on index.html moved the camera forward AND tipped it toward the sky. Both were happening:
    // this class consumes KeyW in _moveObserver/_moveFP/_moveKaijuDrive, while main.js's navPad ALSO bound KeyW
    // to "rotUp". The pad tried to stand aside -- but its guard read `mode === "fp" || mode === "kaiju_drive"`,
    // and it named TWO of the THREE modes that move on WASD. IT MISSED "observer", WHICH IS THE DEFAULT
    // (constructor, this.mode = "observer"), so the collision was live in the mode everyone starts in and in no
    // other. A HAND-LISTED SET OF MODES IS A SECOND DECLARATION OF THE DISPATCH ABOVE, and it drifted the moment
    // a third mover existed.
    //
    // So the pad no longer decides. It asks, and the answer lives beside the dispatch it has to agree with.
    // PER-MODE, because a blanket set would be wrong in the other direction: KeyE is read ONLY by
    // _moveKaijuDrive, and blocking it in observer would take the pad's rotRight away for no reason.
    consumesKey(code) {
        // these two return before any _move* runs -- see the dispatch in update(): missile_cam returns outright,
        // ogre_orbit goes to _moveOrbit, which reads no keys at all.
        if (this.mode === "missile_cam" || this.mode === "ogre_orbit") return false;
        if (Camera.MOVEMENT_KEYS.has(code)) return true;
        return code === "KeyE" && this.mode === "kaiju_drive";
    }

    _moveObserver(dt) {

        const cy = Math.cos(this.yaw);
        const sy = Math.sin(this.yaw);

        const cp = Math.cos(this.pitch);
        const sp = Math.sin(this.pitch);

        const fx = sy * cp;
        const fy = sp;
        const fz = -cy * cp;

        const rx = cy;
        const rz = sy;

        let mx = 0, my = 0, mz = 0;

        if (this.keys.has("KeyW")) { mx += fx; my += fy; mz += fz; }
        if (this.keys.has("KeyS")) { mx -= fx; my -= fy; mz -= fz; }
        if (this.keys.has("KeyD")) { mx += rx; mz += rz; }
        if (this.keys.has("KeyA")) { mx -= rx; mz -= rz; }

        if (this.keys.has("Space")) my += 1;
        if (this.keys.has("ShiftLeft")) my -= 1;
        // v1409 — external analog move (gamepad / phone).
        const _ext = this._extMove;
        if (_ext && (_ext.fwd || _ext.strafe)) { mx += fx * _ext.fwd + rx * _ext.strafe; my += fy * _ext.fwd; mz += fz * _ext.fwd + rz * _ext.strafe; }

        let len = Math.hypot(mx, my, mz);
        if (!len) return;
        if (len > 1) { mx /= len; my /= len; mz /= len; }   // v1409 — clamp to 1, keep analog

        const step = this.moveSpeed * dt;

        this.velocity.x = mx * this.moveSpeed;
        this.velocity.y = my * this.moveSpeed;
        this.velocity.z = mz * this.moveSpeed;

        this.position.x += mx * step;
        this.position.y += my * step;
        this.position.z += mz * step;
    }

    // Round 28 — first-person walking with gravity, terrain following,
    // 1-voxel auto-step, jump. Uses world.voxelAt for terrain queries.
    _moveFP(dt) {
        const cy = Math.cos(this.yaw);
        const sy = Math.sin(this.yaw);

        // Horizontal forward = projected onto XZ plane (ignore pitch
        // so looking up while walking goes forward, not skyward)
        const fx = sy;
        const fz = -cy;
        const rx = cy;
        const rz = sy;

        let mx = 0, mz = 0;
        if (this.keys.has("KeyW")) { mx += fx; mz += fz; }
        if (this.keys.has("KeyS")) { mx -= fx; mz -= fz; }
        if (this.keys.has("KeyD")) { mx += rx; mz += rz; }
        if (this.keys.has("KeyA")) { mx -= rx; mz -= rz; }
        // v1409 — external analog move (gamepad / phone): fwd/strafe in -1..1.
        const _ext = this._extMove;
        if (_ext && (_ext.fwd || _ext.strafe)) { mx += fx * _ext.fwd + rx * _ext.strafe; mz += fz * _ext.fwd + rz * _ext.strafe; }

        const horizLen = Math.hypot(mx, mz);
        if (horizLen > 1) {           // v1409 — clamp to max speed; analog magnitudes < 1 stay analog
            mx /= horizLen; mz /= horizLen;
        }
        // Round 31 — sprint gated by energy. Shift requested → check
        // bar; report active sprint so PlayerEnergy drains while held.
        const wantSprint = this.keys.has("ShiftLeft");
        const hasEnergy = this.playerEnergy ? this.playerEnergy.canSprint() : true;
        const isSprinting = wantSprint && hasEnergy;
        if (this.playerEnergy) this.playerEnergy.setSprinting(isSprinting && horizLen > 0);
        this._sprinting = isSprinting && horizLen > 0;   // Round 31 — drives the sprint FOV widen
        const speed = isSprinting ? this._fpSprintSpeed : this._fpWalkSpeed;

        // Try horizontal move with collision check
        const newX = this.position.x + mx * speed * dt;
        const newZ = this.position.z + mz * speed * dt;
        if (this._canStandAt(newX, this.position.y, newZ)) {
            this.position.x = newX;
            this.position.z = newZ;
        } else {
            // Try axes independently — slide along walls
            if (this._canStandAt(newX, this.position.y, this.position.z)) this.position.x = newX;
            if (this._canStandAt(this.position.x, this.position.y, newZ)) this.position.z = newZ;
        }

        // Vertical — gravity + ground snap + jump
        // v404 — bilinear ground sample so walking across sloped voxel
        // terrain doesn't produce visible "stairs". Other callers of
        // _terrainTopAt (mode-init snap, orbit clearance, kaiju drive
        // ground check) keep the integer version because they're
        // one-shot snaps or comparisons where integer is fine.
        // v4545 -- the body's FEET, so the probe answers the surface this body is on rather than the topmost
        // in the column. The reach is STEP_UP_MAX because this is the WALKING query: a walker may step up.
        // fallBody's falling query takes no reach at all, and the difference is the whole of v4544's note.
        const feetY = this.position.y - this._eyeHeight;
        const groundY = this._terrainTopAtBilinear(this.position.x, this.position.z, feetY);
        const targetY = groundY + this._eyeHeight;
        // v4546 -- THE SLOPE OF THE GROUND CROSSED THIS FRAME. See _fpSlopeDeg for why it is a secant over
        // the distance travelled rather than a normal, and why that is the only form of it a voxel lattice
        // can answer. Zero when the body did not move horizontally: a body standing still crosses no ground.
        const slope = this._fpSlopeDeg(mx, mz, groundY, feetY);
        this._fpSlope = slope;

        if (this._fpOnGround) {
            // v406 — branch logic retuned for the v404 bilinear ground.
            // Original thresholds (0.05u "fall trigger") were tuned for
            // the integer-Y path where targetY only changed across voxel
            // boundaries. With bilinear, targetY varies continuously: on
            // any modest slope, the per-frame downhill delta exceeds
            // 0.05 and the old code would briefly enter falling mode,
            // re-land, and repeat — visible as stairs even though the
            // sample was smooth.
            //
            // New rule: smoothly track targetY when on ground for any
            // delta within a "walkable" envelope. Only enter falling on
            // a genuine cliff (drop > CLIFF_DROP in one frame).
            // v4545 -- STEP_UP_MAX is Camera.STEP_UP_MAX now, because _terrainTopAt reads it too: the probe's
            // reach and the walker's allowance are the same question and two copies of a number that must
            // agree is the shape v4542 removed from BotManager. CLIFF_DROP stays local; nothing else reads it.
            // The sentence that used to sit here -- "climbs taller than STEP_UP_MAX are blocked by
            // _canStandAt earlier" -- WAS FALSE, and the wall branch below carried the same false reason.
            // See there.
            const STEP_UP_MAX = Camera.STEP_UP_MAX;
            // *** CLIFF_DROP WAS A PER-FRAME TEST, WHICH MAKES IT A FRAME-RATE SWITCH RATHER THAN A CLIFF
            // RULE. *** physics/character/terrainWalk.mjs is shaped around exactly this: "a slope limit
            // tested on the per-step height difference is not a slope limit ... the height difference over
            // one substep shrinks with the substep while the slope does not. The limit then depends on the
            // frame rate, which is the definition of a bug you cannot reproduce." Measured here, one body,
            // one speed, one 63.4-degree slope, ONLY THE FRAME RATE CHANGING: it falls at 6 fps and walks
            // down it grounded at 10, 15, 20, 30, 60, 120, 144 and 240. The drop per frame is 5 * dt * 2,
            // which crosses 1.5 only below about 9 fps.
            //
            // The slope is a RATIO of two quantities that both scale with dt, so it does not move with the
            // frame rate at all, and it is kept as a second test rather than replacing CLIFF_DROP because
            // the two catch different things: a cliff EDGE is a discontinuity where the ground falls away
            // over no horizontal distance at all, and a slope is what you can walk down. Both still end the
            // step by leaving the ground, which is the only outcome this branch has.
            const CLIFF_DROP  = 1.5;     // drop bigger than this = walked off a ledge, in ONE frame
            const dy = targetY - this.position.y;
            // *** THE LIMIT IS INCLUSIVE, AND THE TOLERANCE IS A MEASUREMENT RATHER THAN A CUSHION. ***
            // A one-voxel-per-column ramp is 45.0000 degrees by construction and atan2(1, 1) * 180 / PI is
            // EXACTLY 45 -- but the two heights come out of the bilinear blend, which accumulates about
            // 2e-13 of it, so the ramp reads 45.0000000000001990 and a bare `> 45` threw the body off a
            // slope it had just been told it could walk. Measured: 21 frames of 240 over the limit, four
            // separate departures from the ground, on a hill whose true angle is the limit exactly.
            // terrainWalk records the same hazard from the other side -- `n.y` against cos(45) is one ULP
            // and its remedy is a 1e-12 tolerance in cosine, "far below anything terrain can express and
            // far above the 1.1e-16 that caused it". 1e-9 DEGREES is that argument in this file's units:
            // five thousand times the error measured here, and a lattice's finest real distinction is
            // 45.0 against 63.4.
            const tooSteepDown = dy < 0 && slope !== null &&
                                 slope > Camera.MAX_SLOPE_DEG + Camera.SLOPE_EPS_DEG;
            if (dy > STEP_UP_MAX) {
                // *** UNREACHABLE FROM THE VOXEL PATH, AND v4545 IS THE ROUND THAT MADE THAT TRUE. *** This
                // read "_canStandAt already blocked the XZ move, so this should be unreachable. Defensive:
                // stay." -- and _canStandAt returns TRUE at a cave floor, at a tunnel floor and on the lower
                // of two decks, so it blocked nothing of the sort; tools/ship/playerGround-selfcheck.mjs
                // section 3 drives it and gets true. A defensive branch with a FALSE reason is worse than no
                // branch, because it tells the next reader not to look.
                // The true reason is arithmetic, not a guard: _terrainTopAt is given the body's feet and
                // cannot return a surface more than STEP_UP_MAX above them, the bilinear blend of four such
                // corners is bounded by the same number, and both read THIS number -- so dy <= STEP_UP_MAX
                // identically. Measured at 0.083333 max over a 260-frame climb of four voxels, 0 firings.
                // It stays as a total for `dy` rather than being deleted, because _extMove and the kaiju
                // path can set position.y from outside this function.
            } else if (dy < -CLIFF_DROP || tooSteepDown) {
                // Cliff, or ground too steep to walk down — start falling
                this._fpOnGround = false;
                this._fpVelY = 0;
                this._fpFallStartTime = performance.now();
            } else {
                // Smooth track. Covers both up-steps within range and
                // downhill slopes (where dy is a small negative number).
                this.position.y = targetY;
            }
            // Jump
            if (this.keys.has("Space")) {
                this._fpVelY = this._fpJumpVel;
                this._fpOnGround = false;
            }
        } else {
            // Airborne — apply gravity
            this._fpVelY -= this._gravity * dt;
            this.position.y += this._fpVelY * dt;
            if (this.position.y <= targetY) {
                this.position.y = targetY;
                this._fpVelY = 0;
                this._fpOnGround = true;
            }
        }

        this.velocity.x = mx * speed;
        this.velocity.y = this._fpVelY;
        this.velocity.z = mz * speed;
    }

    // Round 124 — first-person kaiju drive. The camera attaches to a
    // kaiju entity (set via setKaijuTarget) and the player's keyboard
    // input drives the kaiju's position field directly, bypassing AI.
    // Mouse-look updates the camera yaw and is also reflected on the
    // kaiju's heading so the obelisk faces where the camera looks.
    //
    // Movement uses the kaiju's own _stamina field (initialized to 1.0
    // on first drive) which depletes during sprint/jump/attacks and
    // regenerates when idle. Stamina is published on the kaiju entity
    // so the HUD can read it without going through the camera.
    //
    // Camera position is offset slightly above + slightly behind the
    // kaiju's body so the rider sees the kaiju's silhouette in their
    // foreground — gives a sense of "I'm controlling this thing" even
    // though the obelisk is the only visual. When round 31b lands and
    // replaces the obelisk with a GLB walking rig, the same offset will
    // place the camera near the rig's "head" naturally.
    _moveKaijuDrive(dt) {
        const k = this._kaijuTarget;
        if (!k || !k.isAlive || !k.isAlive()) {
            // Target died or vanished — fall back to observer mode so
            // we don't strand the camera. Caller can reselect a kaiju
            // and re-enter the mode.
            this.setMode("observer");
            return;
        }
        // Initialize stamina on first drive
        if (k._stamina == null) k._stamina = 1.0;
        // v774 (round 31) — weapon energy pool. Separate from stamina;
        // drained by playerFire(), regenerated continuously at 0.20/s
        // here. A meteor (0.35 cost) takes ~1.75s to refill, a beam
        // (0.15 cost) takes ~0.75s.
        if (k._weaponEnergy == null) k._weaponEnergy = 1.0;
        // v781 — refill rate scales with stamina. Full stamina (1.0)
        // → 0.30/sec regen (fast, ready for sustained fire). Empty
        // stamina (0.0) → 0.10/sec (slow, encourages resting before
        // committing to combat). Linear interp between.
        const refillRate = 0.10 + 0.20 * (k._stamina ?? 1);
        k._weaponEnergy = Math.min(1, k._weaponEnergy + refillRate * dt);

        // v777 — sustained fire. While LMB is held in kaiju_drive,
        // autofire each frame; playerFire's 250ms cooldown naturally
        // rate-limits to ~4 shots/sec. Beams + AoE feel sustained at
        // that rate; projectiles read as rapid fire. Each shot honors
        // the same energy cost / target lookup as a click.
        if (this._lmbHeld) {
            const km = (typeof window !== "undefined") ? window.kaijuManager : null;
            if (km?.playerFire) {
                km.playerFire(k, this);   // result ignored — cooldown/no-energy silently retried next frame
            }
            // v796 — continuous beam ribbon. While LMB held + the current
            // attack is beam-family + there's a target, expose an active
            // beam descriptor on the kaiju manager so the render loop can
            // draw a sustained ribbon between source and target. The 80ms
            // particle bursts in _executeBeam still fire (sparks/flair),
            // but the ribbon fills the visual gap between them.
            try {
                const peek = km?.peekPlayerAttack?.(k);
                if (peek?.attack?.family === "beam") {
                    // Resolve target: prefer lock-target (sticky), else crosshair-target,
                    // else extend forward to max range.
                    let target = null;
                    if (k._lockTarget) {
                        const lt = k._lockTarget;
                        target = { x: lt.x, y: lt.y ?? k.position.y, z: lt.z };
                    } else {
                        const ct = km.peekCrosshairTarget?.(this, 60, 3.0);
                        if (ct?.ref) target = { x: ct.x, y: ct.y, z: ct.z };
                    }
                    if (!target) {
                        // No target — extend ribbon along camera forward
                        const fx = Math.cos(this.pitch) * Math.sin(this.yaw);
                        const fy = Math.sin(this.pitch);
                        const fz = -Math.cos(this.pitch) * Math.cos(this.yaw);
                        target = {
                            x: k.position.x + fx * 60,
                            y: k.position.y + fy * 60,
                            z: k.position.z + fz * 60,
                        };
                    }
                    if (!km._activeBeams) km._activeBeams = new Map();
                    km._activeBeams.set(k.id, {
                        source: { x: k.position.x, y: k.position.y, z: k.position.z },
                        target,
                        attackName: peek.attackName,
                        expiresAt: (typeof performance !== "undefined" ? performance.now() : Date.now()) + 100,   // v798 — refreshed each frame while LMB held
                    });
                } else if (km?._activeBeams) {
                    km._activeBeams.delete(k.id);
                }
            } catch {}
        } else if (typeof window !== "undefined" && window.kaijuManager?._activeBeams) {
            window.kaijuManager._activeBeams.delete(k.id);
        }

        // Pitch is unused for movement (we keep movement on the
        // horizontal plane like FP mode), but we save it for mouse-look.
        // v779 — free-aim during sprint. Sprint captures the camera
        // yaw at start; movement uses that heading while sprinting,
        // so the player can look around (mouse) without veering off
        // their run direction. Walk mode still uses live yaw (turning
        // is responsive when not committed to a sprint direction).
        const liveCy = Math.cos(this.yaw);
        const liveSy = Math.sin(this.yaw);
        const wasSprint = !!this._sprintActive;
        const wantSprintCheck = this.keys.has("ShiftLeft") && k._stamina > 0.05;
        // Tentatively figure out whether we're going to commit to a
        // sprint this frame (still need horizLen, computed below). We
        // use the LIVE yaw to read WASD intent so a turn-into-sprint
        // still works on the first frame.
        const cy = (wasSprint && this._sprintHeading != null) ? Math.cos(this._sprintHeading) : liveCy;
        const sy = (wasSprint && this._sprintHeading != null) ? Math.sin(this._sprintHeading) : liveSy;
        const fx = sy;
        const fz = -cy;
        const rx = cy;
        const rz = sy;

        let mx = 0, mz = 0;
        if (this.keys.has("KeyW")) { mx += fx; mz += fz; }
        if (this.keys.has("KeyS")) { mx -= fx; mz -= fz; }
        if (this.keys.has("KeyD")) { mx += rx; mz += rz; }
        if (this.keys.has("KeyA")) { mx -= rx; mz -= rz; }
        const horizLen = Math.hypot(mx, mz);
        if (horizLen > 0) {
            mx /= horizLen; mz /= horizLen;
        }

        // Sprint: shift while moving + stamina available.
        // Kaiju are bigger than the player so base speed is faster
        // (kaiju walk = ~8 u/s; sprint = ~14 u/s). Stamina drains
        // at 0.4/s while sprinting, regenerates at 0.25/s when idle,
        // 0.15/s while just walking.
        const wantSprint = wantSprintCheck && horizLen > 0;
        const speed = wantSprint ? 14 : 8;
        if (wantSprint) {
            k._stamina = Math.max(0, k._stamina - 0.40 * dt);
        } else if (horizLen > 0) {
            k._stamina = Math.min(1, k._stamina + 0.15 * dt);
        } else {
            k._stamina = Math.min(1, k._stamina + 0.25 * dt);
        }

        // v779 — sprint heading commit/release. Transition WALK → SPRINT
        // captures live yaw; SPRINT → WALK clears it so next walk
        // movement uses live yaw responsively.
        if (wantSprint && !wasSprint) {
            this._sprintHeading = this.yaw;
            this._sprintActive = true;
        } else if (!wantSprint && wasSprint) {
            this._sprintHeading = null;
            this._sprintActive = false;
        }

        // v786 — Hold-E to mark target. Refreshes k._lockTarget without
        // firing, so the player can establish a sticky aim BEFORE
        // engaging. Lock window stays at 3s while E held (re-set each
        // frame), so even slow tracking holds. Released → lock decays
        // via the normal 1.5s post-fire window after the next shot, OR
        // just expires after 3s if never fired.
        if (this.keys.has("KeyE")) {
            const km = (typeof window !== "undefined") ? window.kaijuManager : null;
            const peek = km?.peekCrosshairTarget?.(this, 80, 3.0);
            if (peek?.ref) {
                // Wrap in same proxy shape playerFire uses so AoE / civ paths
                // route correctly when the player DOES fire on this target.
                const proxy = (peek.ref?.applyDamage)
                    ? peek.ref
                    : { x: peek.x, y: peek.y, z: peek.z, ref: peek.ref, applyDamage: (d) => peek.ref?.applyDamage?.(d) };
                k._lockTarget    = proxy;
                k._lockExpiresAt = (typeof performance !== "undefined" ? performance.now() : Date.now()) + 3000;
                k._markingActive = true;
            } else {
                k._markingActive = false;
            }
        } else {
            k._markingActive = false;
        }

        // Jump: Space + on-ground + stamina cost
        if (this.keys.has("Space") && this._kaijuDriveOnGround && k._stamina > 0.15) {
            this._kaijuDriveVelY = 11;        // bigger jump than player FP
            this._kaijuDriveOnGround = false;
            k._stamina = Math.max(0, k._stamina - 0.15);
        }

        // Horizontal movement: write directly to kaiju position
        k.position.x += mx * speed * dt;
        k.position.z += mz * speed * dt;
        // Heading on the kaiju so the obelisk visual faces the camera.
        // Some renderers/animators read .heading; the obelisk doesn't
        // currently rotate but the field is harmless to set and round
        // 31b's GLB rig will use it.
        if (horizLen > 0) k.heading = this.yaw;

        // Vertical: gravity + terrain step-up
        // v405 — bilinear ground sample for kaiju drive too. Integer
        // Y was producing stairs when the controlled kaiju walked
        // across sloped voxel terrain.
        this._kaijuDriveVelY -= this._gravity * dt;
        k.position.y += this._kaijuDriveVelY * dt;
        const groundY = this._terrainTopAtBilinear(k.position.x, k.position.z, k.position.y);
        if (k.position.y <= groundY) {
            k.position.y = groundY;
            this._kaijuDriveVelY = 0;
            this._kaijuDriveOnGround = true;
        }

        // Camera position — slightly above the kaiju's "head" + 2u
        // back along the look direction so the kaiju's silhouette is
        // visible in front of us.
        //
        // Round 125 — when a rigged GLB mesh is attached to the kaiju,
        // derive head height from the kaiju's config scale (rigs grow
        // with scale; head height ~2× scale at typical proportions).
        // For obelisk-only kaiju, fall back to the hardcoded ~8u that
        // matches the obelisk silhouette.
        const KAIJU_HEAD_Y = (k._meshEntityId != null)
            ? Math.max(4, (k.config?.scale ?? 3) * 2.0)
            : 8;
        const BACK_OFFSET  = 2;
        const cyP = Math.cos(this.pitch);
        const fwX = sy * cyP;
        const fwZ = -cy * cyP;
        this.position.x = k.position.x - fwX * BACK_OFFSET;
        this.position.y = k.position.y + KAIJU_HEAD_Y;
        this.position.z = k.position.z - fwZ * BACK_OFFSET;

        // Velocity exposure for downstream systems (audio, etc.)
        this.velocity.x = mx * speed;
        this.velocity.y = this._kaijuDriveVelY;
        this.velocity.z = mz * speed;
    }

    // *** THE TOPMOST SOLID IN THE COLUMN IS NOT WHERE A BODY STANDS, AND ON THIS WORLD IT IS NOT EVEN
    // CLOSE. *** This scanned down from y = 80 and returned the first solid it met, with no account of where
    // the body was. Measured in a real boot over 1,681 columns: 921 of them (54.8%) hold MORE THAN ONE place
    // a body can stand, giving 2,687 such places, and the topmost answer is right in 1,681 of them --
    // 62.56%, which is exactly the column count and not a coincidence: a function returning one y per column
    // is right once per column however good it is. Worst gap 42 voxels; at (-42,-60) the surfaces are 2 and
    // 19 and this said 19. It is the defect v4542 repaired for world/surfaceProbe.mjs's standHeightAt, never
    // applied to the controller the human drives.
    //
    // *** AND THE SYMPTOM IS NOT THE ONE IT LOOKS LIKE. *** _moveFP guards with `dy > STEP_UP_MAX`, so the
    // player is NOT lifted onto the hillside -- the guard holds. What happens instead is that vertical
    // tracking DIES: driven from open ground into a tunnel mouth, y freezes at 2.700 and stays there, with
    // _fpOnGround stuck true, and the player does not fall even when the floor under them is removed
    // entirely. The freeze begins at x = 9.08, a voxel BEFORE the tunnel, because the bilinear sampler
    // blends the neighbouring column's 21 in. That guard's own comment read "_canStandAt already blocked the
    // XZ move, so this should be unreachable" -- and _canStandAt at a tunnel floor returns TRUE, so it never
    // blocked anything.
    //
    // Given the body's feet in `fromY` this asks world/surfaceProbe.mjs instead, which scans DOWN from the
    // body's own reach. That module is gated and measured (2,644 of 2,644 body-places correct against this
    // rule's 1,681) and importing it is the point: a third copy of the rule is the defect, not the fix.
    // Without `fromY` the answer is byte-identical to the pre-v4545 one, which is what lets the orbit
    // clearance test -- which genuinely wants the topmost, because it is keeping a CAMERA out of a hill --
    // keep its behaviour and its readings.
    /**
     * The surface THIS body can stand on in one column, or `null` when the column offers none from the
     * body's reach down to the bottom of the world.
     *
     * *** null AND 0 ARE DIFFERENT ANSWERS AND CONFLATING THEM PARKED THE BODY INSIDE THE FLOOR. *** See
     * _terrainTopAtBilinear: the blend averages four columns, and a column reported as 0 when it really
     * means "nothing you can reach here" drags that average halfway to the world floor. 0 is also a
     * legitimate height, so the distinction cannot be carried in the number -- hence this method, and
     * _terrainTopAt below mapping null to 0 for the callers whose contract has always been a number.
     *
     * *** AN ADAPTER, NOT A COPY, AND NOT A hasVoxels GATE EITHER. *** The first draft asked
     * hasVoxels(this.world) and called standHeightAt directly -- and every fixture in this file's own gate
     * went on showing the defect, because the camera's world interface has always been `voxelAt` and
     * surfaceProbe's is `isAir` plus `chunkHeight`. A repair that silently does not apply to the worlds its
     * own caller supports is the shape of "a check nothing reaches", in code. The shim is four lines and
     * makes the gated rule work on every world the camera already accepts; writing the scan out again here
     * would be the third copy of it this session filed as a task.
     */
    _standYAt(x, z, fromY) {
        const v = (xx, yy, zz) => this.world.voxelAt(xx, yy, zz);
        const shim = {
            chunkHeight: Number.isFinite(this.world.chunkHeight) ? this.world.chunkHeight : 80,
            // the camera's own air test, verbatim: anything not 0 and not undefined is solid
            isAir: (xx, yy, zz) => { const q = v(xx, yy, zz); return q === 0 || q === undefined; },
        };
        return standHeightAt(shim, Math.floor(x), Math.floor(z),
                             { y: fromY, stepUp: Camera.STEP_UP_MAX });
    }

    /**
     * *** THE SLOPE OF THE GROUND THIS BODY JUST CROSSED, AS A RISE OVER A RUN. *** Returns degrees, or
     * null when the body did not move horizontally -- a body standing still crosses no ground and has no
     * slope to be refused by.
     *
     * *** IT IS A SECANT AND NOT A NORMAL, AND ON THIS WORLD THAT IS THE ONLY FORM OF IT THAT WORKS. ***
     * physics/character/terrainWalk.mjs tests its limit on the surface NORMAL, which is right on a
     * heightfield and is recorded IN THAT FILE as failing on a lattice: "a bot standing on a flat cell at
     * (5.96, 1.99) reads 65.9 degrees 0.25 units ahead, over a lattice row of 28, 28, 29, 29, 30 -- a
     * ONE-UNIT LIP -- and stops there permanently." A fix was written there, measured, and REVERTED, because
     * re-probing a fixed distance ahead still lands inside the inter-cell band where the interpolated
     * surface is steep everywhere: 1.0, 1.25 and 1.5 all stayed blocked and 2.0 teleported the body.
     *
     * A secant does not have that problem, because it never asks about a point: it asks how much the ground
     * rose over how far the body went. Across a one-voxel lip that is 1 over 1, which is 45.0 degrees and
     * walkable; across a two-voxel lip it is 2 over 1, which is 63.4 and is not. The bilinear blend the
     * camera already samples IS the staircase's secant, so this costs one extra blend and no new instrument.
     *
     * *** AND IT DOES NOT MOVE WITH THE FRAME RATE, WHICH IS THE WHOLE POINT -- BUT ONLY BECAUSE THE RUN IS
     * A FIXED WORLD DISTANCE. *** The first draft of this took the secant over the distance travelled IN
     * THAT FRAME, on the reasoning that a rise and a run which both scale with dt have a ratio that does
     * not. That is true of a plane and false of a staircase: as dt shrinks the run shrinks INTO a lip, whose
     * rise does not shrink with it, so the angle runs to 90 and a shallow hill reads 45 degrees at every
     * voxel edge and 0 between them. Measured -- a 26.6-degree hill (one voxel every two columns) fell 76
     * frames of 240, because alternate column boundaries each read 45.0. The same trap as the rule it
     * replaces, wearing a ratio. SLOPE_RUN is one column, so the sample always spans a whole tread and a
     * whole riser and the average is the hill.
     */
    _fpSlopeDeg(dirX, dirZ, groundY, feetY) {
        const L = Math.hypot(dirX, dirZ);
        if (!(L > 1e-9)) return null;
        const R = Camera.SLOPE_RUN / L;
        const ahead = this._terrainTopAtBilinear(this.position.x + dirX * R,
                                                 this.position.z + dirZ * R, feetY);
        return Math.atan2(Math.abs(ahead - groundY), Camera.SLOPE_RUN) * 180 / Math.PI;
    }

    _terrainTopAt(x, z, fromY = null) {
        if (!this.world?.voxelAt) return 0;
        if (Number.isFinite(fromY)) {
            const found = this._standYAt(x, z, fromY);
            return found === null ? 0 : found;   // nothing under this body: 0 falls, as it always did
        }
        const fx = Math.floor(x), fz = Math.floor(z);
        for (let y = 80; y >= 0; y--) {
            const v = this.world.voxelAt(fx, y, fz);
            if (v !== 0 && v !== undefined) return y + 1;
        }
        return 0;
    }

    // v404 — Bilinear ground sample for first-person walking. The
    // integer-Y _terrainTopAt above causes visible "stairs" when the
    // camera walks across voxel boundaries on sloped terrain (each new
    // XZ voxel snaps Y to an integer). Bilinear blends the four
    // neighbor columns by the fractional XZ position, producing a
    // smooth float Y that tracks the surface continuously.
    //
    // Cost: 4× the voxel-column scans of the integer version. Each scan
    // is at most 80 voxel lookups — call it ~320 lookups per frame for
    // the camera column. The chunk mesher does millions; this is a
    // rounding error.
    //
    // Cliffs: a 1-voxel-wide cliff with N units of height drop becomes
    // an N-unit-per-voxel ramp under bilinear. For the smoothness this
    // is the right tradeoff — gameplay never feels "stuck" at the
    // sub-voxel boundary. Edge-fall detection still works because
    // _terrainTopAt (integer) is still what the canStandAt logic
    // implicitly uses for collision.
    _terrainTopAtBilinear(x, z, fromY = null) {
        if (!this.world?.voxelAt) return 0;
        const ix = Math.floor(x), iz = Math.floor(z);
        const fx = x - ix, fz = z - iz;
        // *** THE BODY GOES TO ALL FOUR CORNERS, WHICH IS WHY THE DEAD ZONE STARTED A VOXEL EARLY. *** The
        // blend reads the neighbouring columns, so one tunnel column beside open ground was enough to make
        // the sample jump to 21 and freeze the walker before it ever entered.
        if (Number.isFinite(fromY)) {
            // *** A COLUMN THIS BODY CANNOT STAND IN IS NOT A COLUMN WHOSE GROUND IS ZERO, AND AVERAGING IT
            // IN AS ZERO PUT THE BODY INSIDE THE FLOOR AND LOCKED IT THERE. *** Found by
            // tools/ship/voxelAvatar-selfcheck.mjs, which the sweep rotation brought back under budget in
            // the same round -- it drives THIS method on a hand world and was green at HEAD. Walking off a
            // two-voxel ledge toward -z at x=40: the floor column answers 2 and the ledge column answers
            // NOT-FOUND, because the ledge's own surface is above this body's reach -- a wall, not a hole.
            // Read as 0 and blended at fz=0.25 that is 1.5, so targetY came out at 3.200, dy was 0, the
            // body read as GROUNDED half a voxel inside the floor, and _canStandAt then refused every
            // further step: stuck at z=3.250 for as long as the walk ran. The stuck player this very round
            // is about, re-introduced by its own repair, one method over.
            //
            // So the weights are renormalised over the corners that ANSWERED. A wall contributes nothing
            // and the body keeps the floor it is on; a genuine hole -- no surface from the reach down to
            // the bottom of the world -- makes every corner null, and 0 then means what it has always
            // meant here, which is that the cliff branch takes over and gravity does the rest.
            let sum = 0, wsum = 0;
            const corner = (cx, cz, wt) => {
                const h = this._standYAt(cx, cz, fromY);
                if (h !== null) { sum += h * wt; wsum += wt; }
            };
            corner(ix,     iz,     (1 - fx) * (1 - fz));
            corner(ix + 1, iz,     fx * (1 - fz));
            corner(ix,     iz + 1, (1 - fx) * fz);
            corner(ix + 1, iz + 1, fx * fz);
            return wsum > 0 ? sum / wsum : 0;
        }
        const h00 = this._terrainTopAt(ix,     iz    );
        const h10 = this._terrainTopAt(ix + 1, iz    );
        const h01 = this._terrainTopAt(ix,     iz + 1);
        const h11 = this._terrainTopAt(ix + 1, iz + 1);
        const h0 = h00 * (1 - fx) + h10 * fx;
        const h1 = h01 * (1 - fx) + h11 * fx;
        return h0 * (1 - fz) + h1 * fz;
    }

    // Can the player stand at (x, y, z) — requires 2 voxels of clear
    // air at the body footprint (head + feet).
    _canStandAt(x, y, z) {
        if (!this.world?.voxelAt) return true;
        const fx = Math.floor(x), fz = Math.floor(z);
        const feetY = Math.floor(y - this._eyeHeight + 0.1);
        const headY = Math.floor(y);
        for (let yy = feetY; yy <= headY; yy++) {
            const v = this.world.voxelAt(fx, yy, fz);
            if (v !== 0 && v !== undefined && v !== 10 && v !== 11) {
                // Solid (water = id 10/11 = passable in FP)
                return false;
            }
        }
        return true;
    }

    getMatrix() {
        return this.viewProj;
    }

    // Alias — voxelrenderer/voxelhighlight/EntityCubeRenderer all call
    // getViewProjMatrix(); Camera only had getMatrix(). Both names point
    // at the same matrix to avoid a name collision and keep both call
    // sites working.
    getViewProjMatrix() {
        return this.viewProj;
    }
}