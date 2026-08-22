// FILE: multiplayer/remotePlayers.js
// VERSION: v1
//
// Round 129 — multiplayer arc round 33. Manages the local view of OTHER
// players in a shared world. Each connected client runs its own copy
// of this module; the server registry just relays state.
//
// Wiring:
//   * On WSBridge connect, sends "player:announce" with our own name + color
//   * Every 100ms, sends "player:state" with our current camera position,
//     yaw, and driven-kaiju info (round 31a/b)
//   * Listens for "player:welcome"  → prefills remote map with existing players
//   * Listens for "players:state"   → updates all remote player positions
//   * Listens for "player:join"     → adds a new remote player
//   * Listens for "player:leave"    → removes a remote player
//
// Rendering:
//   * Each remote player gets a "remote_player_marker" entity spawned
//     locally via entity:spawnMesh. Position synced from server state.
//   * An HTML label floats above each marker showing the player's name.
//     The label is projected from world coords to screen coords each
//     frame.

const PLAYER_COLORS = [
    "#ff6b6b", "#feca57", "#5ee2a3", "#48dbfb", "#a55eea",
    "#ff9ff3", "#54a0ff", "#1dd1a1", "#ee5253", "#5f27cd",
];

function pickColorFor(playerId) {
    // Stable color from playerId hash so the same player always gets
    // the same color across reconnects
    let h = 0;
    for (let i = 0; i < playerId.length; i++) {
        h = ((h << 5) - h + playerId.charCodeAt(i)) | 0;
    }
    return PLAYER_COLORS[Math.abs(h) % PLAYER_COLORS.length];
}

// Round 130 — robust hex→rgb floats. Expands "#rgb" shorthand to
// "#rrggbb" form before parsing. Returns [r, g, b] in 0..1 scaled
// by the optional multiplier. Default white if parsing fails.
function hexToRgbFloats(hex, mul = 1.0) {
    if (typeof hex !== "string") return [mul, mul, mul];
    let s = hex.replace(/^#/, "");
    if (s.length === 3) {
        s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    }
    if (s.length !== 6) return [mul, mul, mul];
    const r = parseInt(s.slice(0, 2), 16) / 255;
    const g = parseInt(s.slice(2, 4), 16) / 255;
    const b = parseInt(s.slice(4, 6), 16) / 255;
    if (isNaN(r) || isNaN(g) || isNaN(b)) return [mul, mul, mul];
    return [r * mul, g * mul, b * mul];
}

function randomName() {
    const adjs = ["Quick", "Brave", "Sly", "Bold", "Wise", "Wild", "Lone", "True", "Swift", "Calm"];
    const nouns = ["Wolf", "Hawk", "Bear", "Fox", "Lynx", "Crane", "Drake", "Otter", "Boar", "Stag"];
    return adjs[(Math.random() * adjs.length) | 0]
        + nouns[(Math.random() * nouns.length) | 0]
        + ((Math.random() * 100) | 0);
}

export class RemotePlayers {

    constructor({ bridge, camera, router }) {
        this.bridge = bridge;
        this.camera = camera;
        this.router = router;

        // Our identity (server tells us on connect)
        this.playerId = null;
        this.localName = randomName();
        this.localColor = "#9cf";

        // playerId → { name, color, pos, yaw, drivingKaiju, entityId, labelEl }
        this.remotes = new Map();

        // Throttle state-send to 10Hz
        this._lastSendAt = 0;
        this.sendIntervalMs = 100;

        // Throttle label-position updates to 30Hz (cheaper than per-frame)
        this._lastLabelAt = 0;
        this.labelIntervalMs = 33;

        // ---- DOM root for name labels ----
        const root = document.createElement("div");
        root.id = "multiplayer-labels";
        Object.assign(root.style, {
            position: "fixed",
            left: "0", top: "0",
            width: "100%", height: "100%",
            pointerEvents: "none",
            zIndex: "1200",
            fontFamily: "monospace",
            fontSize: "12px",
        });
        document.body.appendChild(root);
        this.labelRoot = root;

        // ---- Bridge listeners ----
        bridge.on("player:welcome", (msg) => this._onWelcome(msg));
        bridge.on("player:join",    (msg) => this._onJoin(msg));
        bridge.on("player:leave",   (msg) => this._onLeave(msg));
        bridge.on("players:state",  (msg) => this._onPlayersState(msg));

        // Announce ourselves as soon as the bridge connects. If already
        // connected, send immediately; otherwise wait for the connection.
        if (bridge.connected) {
            this._sendAnnounce();
        } else {
            // Poll until connected — cheap, fires once
            const check = setInterval(() => {
                if (bridge.connected) {
                    clearInterval(check);
                    this._sendAnnounce();
                }
            }, 200);
        }

        console.log(`[multiplayer] initialized as "${this.localName}" (round 33)`);
    }

    // ---------- OUTBOUND ----------

    _sendAnnounce() {
        this.bridge.emit("player:announce", {
            name: this.localName,
            color: this.localColor,
        });
    }

    // Called from main loop. Sends state at ~10Hz.
    update() {
        const now = performance.now();

        // Throttled state send
        if (this.bridge.connected && now - this._lastSendAt > this.sendIntervalMs) {
            this._lastSendAt = now;
            // Our "position" for purposes of ghost rendering. If we're
            // driving a kaiju, send the kaiju's position (more useful
            // for spectators); otherwise send the camera position.
            let pos = {
                x: this.camera.position.x,
                y: this.camera.position.y,
                z: this.camera.position.z,
            };
            let drivingKaiju = null;
            if (this.camera.mode === "kaiju_drive" && this.camera._kaijuTarget) {
                const k = this.camera._kaijuTarget;
                pos = { x: k.position.x, y: k.position.y, z: k.position.z };
                drivingKaiju = {
                    kind: k.kind,
                    name: k.name,
                };
            }
            this.bridge.emit("player:state", {
                pos,
                yaw: this.camera.yaw,
                drivingKaiju,
            });
        }

        // Round 130 — per-frame interpolation tick for all remotes
        this._interpolateRemotes(now);

        // Throttled label position update
        if (now - this._lastLabelAt > this.labelIntervalMs) {
            this._lastLabelAt = now;
            this._updateLabelPositions();
        }
    }

    // Round 130 — interpolate every remote's rendered position between
    // their last two snapshots. Standard "render at server-time minus
    // one tick" pattern: by the time we're rendering, we have at
    // least one snapshot newer than our render time, so we can
    // interpolate cleanly without extrapolation in the common case.
    //
    // Edge cases:
    //   * Brand-new remote (prev = target = spawn position) — t=1, no motion
    //   * Late packet (now > targetAt + tickInterval) — extrapolate up
    //     to 200ms past target, then clamp (don't run away forever)
    //   * Long gap (no packets for >500ms) — freeze in place
    //
    // After computing the new rendered pos, compute speed for
    // animation clip selection (idle/walk/run by threshold) and emit
    // an entity:move + setAnimClip command if the clip changed.
    _interpolateRemotes(now) {
        if (this.remotes.size === 0) return;
        for (const remote of this.remotes.values()) {
            // Compute interpolation parameter
            const span = remote.targetAt - remote.prevAt;
            let t;
            if (span <= 0) {
                t = 1;
            } else {
                t = (now - remote.prevAt) / span;
                // Allow modest extrapolation past target (up to one tick
                // ahead, ~100ms past target), then clamp.
                const maxT = 1 + (200 / span);
                if (t > maxT) t = maxT;
            }
            const prevX = remote.prevPos.x,   prevY = remote.prevPos.y,   prevZ = remote.prevPos.z;
            const tgtX  = remote.targetPos.x, tgtY  = remote.targetPos.y, tgtZ  = remote.targetPos.z;
            const newX = prevX + (tgtX - prevX) * t;
            const newY = prevY + (tgtY - prevY) * t;
            const newZ = prevZ + (tgtZ - prevZ) * t;

            // Speed for animation: use snapshot-to-snapshot velocity
            // (not per-frame delta which is noisy). span is ms; pos
            // delta over span gives u/s.
            const dx = tgtX - prevX, dy = tgtY - prevY, dz = tgtZ - prevZ;
            const dist = Math.hypot(dx, dy, dz);
            const speed = span > 0 ? (dist / (span / 1000)) : 0;
            remote.renderedSpeed = speed;

            // Yaw interp (linear; doesn't handle wrap-around well but
            // good enough for round 33/34)
            const newYaw = remote.prevYaw + (remote.targetYaw - remote.prevYaw) * Math.min(1, t);

            // Commit rendered values
            remote.pos.x = newX;
            remote.pos.y = newY;
            remote.pos.z = newZ;
            remote.yaw = newYaw;

            // Sync entity position every frame for smooth motion
            if (this.router && remote.entityId != null) {
                this.router.exec({
                    type: "entity:move",
                    id: remote.entityId,
                    x: newX, y: newY, z: newZ,
                    yaw: newYaw,
                });
            }

            // Animation clip pick (only when rendering a kaiju). Matches
            // the local round 31a thresholds: idle < 0.5, walk < 11, run.
            if (remote.entityKind && remote.entityKind.startsWith("kaiju_")) {
                let wantClip;
                if (speed < 0.5)      wantClip = "idle";
                else if (speed < 11)  wantClip = "walk";
                else                  wantClip = "run";
                if (wantClip !== remote.lastAnimClip) {
                    this.router?.exec({
                        type: "entity:setAnimClip",
                        id: remote.entityId,
                        clip: wantClip,
                    });
                    remote.lastAnimClip = wantClip;
                }
            }
        }
    }

    // ---------- INBOUND ----------

    _onWelcome(msg) {
        this.playerId = msg.playerId;
        console.log(`[multiplayer] welcomed as ${msg.playerId}; ${msg.players?.length || 0} players present`);
        // Prefill existing remotes
        for (const p of (msg.players || [])) {
            if (p.playerId === this.playerId) continue;
            this._addRemote(p.playerId, p.name, p.color, p.pos, p.yaw, p.drivingKaiju);
        }
    }

    _onJoin(msg) {
        if (msg.playerId === this.playerId) return;
        if (this.remotes.has(msg.playerId)) return;
        console.log(`[multiplayer] join: ${msg.name} (${msg.playerId})`);
        this._addRemote(msg.playerId, msg.name, msg.color, null, 0, null);
    }

    _onLeave(msg) {
        const remote = this.remotes.get(msg.playerId);
        if (!remote) return;
        console.log(`[multiplayer] leave: ${remote.name} (${msg.playerId})`);
        this._removeRemote(msg.playerId);
    }

    _onPlayersState(msg) {
        if (!Array.isArray(msg.players)) return;
        const now = performance.now();
        for (const p of msg.players) {
            if (p.playerId === this.playerId) continue;
            const remote = this.remotes.get(p.playerId);
            if (!remote) {
                // Late-arriving remote (joined before we welcomed):
                // server may include them in players:state before
                // their player:join arrives. Spawn with placeholder
                // name/color; the upcoming player:join will fix them.
                this._addRemote(p.playerId, "anon", pickColorFor(p.playerId), p.pos, p.yaw, p.drivingKaiju);
                continue;
            }
            // Round 130 — INTERPOLATION SNAPSHOTS. Store the last two
            // received positions with timestamps. Per-frame interpolation
            // smoothly tweens between them; if we're past the latest
            // snapshot, extrapolate up to 200ms before clamping (the
            // ghost waits for new data instead of running off forever).
            if (p.pos) {
                remote.prevPos  = remote.targetPos ? { ...remote.targetPos } : { ...p.pos };
                remote.prevAt   = remote.targetAt != null ? remote.targetAt : now;
                remote.targetPos = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
                remote.targetAt  = now;
            }
            if (p.yaw != null) {
                remote.prevYaw    = remote.targetYaw != null ? remote.targetYaw : p.yaw;
                remote.targetYaw  = p.yaw;
            }
            // Round 130 — kind swap on drive-mode change. When a remote
            // player enters kaiju_drive, their ghost should appear as
            // the actual rigged kaiju (so the kind+animation read).
            // When they exit, swap back to the neutral marker.
            const newKind = p.drivingKaiju?.kind || null;
            const oldKind = remote.drivingKaiju?.kind || null;
            if (newKind !== oldKind) {
                this._swapRemoteEntity(remote, newKind);
            }
            remote.drivingKaiju = p.drivingKaiju || null;
        }
    }

    // ---------- REMOTE MANAGEMENT ----------

    _addRemote(playerId, name, color, pos, yaw, drivingKaiju) {
        if (this.remotes.has(playerId)) return;
        const finalColor = color || pickColorFor(playerId);
        const now = performance.now();
        const initialPos = pos || { x: 0, y: 60, z: 0 };
        const remote = {
            playerId,
            name: name || "anon",
            color: finalColor,
            // Round 130 — separate "current" (rendered) from "target"
            // (last received). Per-frame, we tween current toward target.
            pos: { ...initialPos },           // current rendered position
            prevPos: { ...initialPos },       // snapshot N-1
            targetPos: { ...initialPos },     // snapshot N (most recent)
            prevAt: now,                      // timestamp of prevPos
            targetAt: now,                    // timestamp of targetPos
            yaw: yaw || 0,
            prevYaw: yaw || 0,
            targetYaw: yaw || 0,
            // Round 130 — for animation clip selection
            renderedSpeed: 0,
            lastAnimClip: null,
            drivingKaiju,
            entityId: null,
            entityKind: null,                 // which mesh kind is currently spawned
            labelEl: null,
        };
        // Round 130 — pick initial entity kind based on driving state
        const initialKind = drivingKaiju?.kind ? `kaiju_${drivingKaiju.kind}` : "remote_player_marker";
        this._spawnRemoteEntity(remote, initialKind);
        // Create a name label
        const label = document.createElement("div");
        Object.assign(label.style, {
            position: "absolute",
            transform: "translate(-50%, -100%)",
            background: "rgba(0, 0, 0, 0.7)",
            border: `1px solid ${finalColor}`,
            color: finalColor,
            padding: "2px 6px",
            borderRadius: "3px",
            whiteSpace: "nowrap",
            display: "none",   // shown only when projected on-screen
        });
        label.textContent = remote.name;
        this.labelRoot.appendChild(label);
        remote.labelEl = label;
        this.remotes.set(playerId, remote);
    }

    // Round 130 — spawn the mesh entity used to render this remote
    // player. Called from _addRemote and on kind-swaps. Stores the
    // entity id + the kind name back on the remote record.
    _spawnRemoteEntity(remote, kind) {
        if (!this.router) return;
        // Kaiju kinds spawn at scale 3 (matching obelisk size). Generic
        // markers stay at 1.2 (small ghost cube).
        const scale = kind.startsWith("kaiju_") ? 3 : 1.2;
        const r = this.router.exec({
            type: "entity:spawnMesh",
            assetId: kind,
            kind,
            x: remote.pos.x,
            y: remote.pos.y,
            z: remote.pos.z,
            scale,
        });
        if (r?.id != null) {
            remote.entityId = r.id;
            remote.entityKind = kind;
            // Apply per-player color tint so each ghost is visually
            // distinct even when multiple players drive the same kind.
            // colorTint is additive (round 26) so a neutral base
            // (the cube's 0.85, 0.85, 0.90) shifts toward the player
            // hue. For kaiju kinds the kind's own color dominates;
            // we use a small additive tint just to add a subtle hue.
            // Round 130 — robust hex parse: handles "#rgb" (3-digit
            // shorthand) and "#rrggbb" (full 6-digit) by expanding
            // shorthand to full form first.
            const tint = hexToRgbFloats(remote.color || "#ffffff", 0.30);
            this.router.exec({
                type: "entity:setColorTint",
                id: r.id,
                tint,
            });
        }
    }

    // Round 130 — swap a remote's entity to a different mesh kind.
    // Called when their driving state changes (enter/exit kaiju_drive,
    // or switch driven kaiju kind). Despawns old, spawns new at the
    // same position so there's no visual gap.
    _swapRemoteEntity(remote, newDrivingKind) {
        const wantKind = newDrivingKind ? `kaiju_${newDrivingKind}` : "remote_player_marker";
        if (wantKind === remote.entityKind) return;
        if (this.router && remote.entityId != null) {
            this.router.exec({ type: "entity:despawn", id: remote.entityId });
        }
        remote.entityId = null;
        remote.entityKind = null;
        remote.lastAnimClip = null;   // force clip re-pick on next tick
        this._spawnRemoteEntity(remote, wantKind);
    }

    _removeRemote(playerId) {
        const remote = this.remotes.get(playerId);
        if (!remote) return;
        if (this.router && remote.entityId != null) {
            this.router.exec({ type: "entity:despawn", id: remote.entityId });
        }
        if (remote.labelEl) remote.labelEl.remove();
        this.remotes.delete(playerId);
    }

    _updateLabelPositions() {
        if (this.remotes.size === 0) return;
        // Read viewport once
        const w = window.innerWidth;
        const h = window.innerHeight;
        // Camera view-proj matrix for world→clip projection
        // Camera.update() runs first in the main loop, so viewProj is fresh
        const vp = this.camera.getViewProjMatrix?.();
        if (!vp) return;
        for (const remote of this.remotes.values()) {
            if (!remote.pos || !remote.labelEl) continue;
            // Project remote.pos + (0, +3, 0) for label height above marker
            const wx = remote.pos.x;
            const wy = remote.pos.y + 3;
            const wz = remote.pos.z;
            // mat4 * vec4 (column-major)
            const cx = vp[0] * wx + vp[4] * wy + vp[8]  * wz + vp[12];
            const cy = vp[1] * wx + vp[5] * wy + vp[9]  * wz + vp[13];
            const cw = vp[3] * wx + vp[7] * wy + vp[11] * wz + vp[15];
            // Behind camera → hide
            if (cw <= 0) {
                remote.labelEl.style.display = "none";
                continue;
            }
            const ndcX = cx / cw;
            const ndcY = cy / cw;
            // Off-screen → hide
            if (ndcX < -1.2 || ndcX > 1.2 || ndcY < -1.2 || ndcY > 1.2) {
                remote.labelEl.style.display = "none";
                continue;
            }
            const sx = (ndcX * 0.5 + 0.5) * w;
            const sy = (1 - (ndcY * 0.5 + 0.5)) * h;
            remote.labelEl.style.display = "block";
            remote.labelEl.style.left = sx + "px";
            remote.labelEl.style.top  = sy + "px";
            // Update label text if it changed (e.g. join event update)
            const desiredText = remote.drivingKaiju
                ? `${remote.name} · ${remote.drivingKaiju.kind || "kaiju"}`
                : remote.name;
            if (remote.labelEl.textContent !== desiredText) {
                remote.labelEl.textContent = desiredText;
            }
        }
    }
}
