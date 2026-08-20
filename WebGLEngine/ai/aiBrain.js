// FILE: ai/aiBrain.js
// VERSION: v2.72 — round 72 adds self-hosted hunt simulation
// VERSION: v1 - round 68
//
// AI Brain page — subscribes to /bridge/state over WebSocket, computes
// per-enemy decisions, POSTs directives back via /bridge/directive. The
// VBA OpenGL FPS in Excel sends its game state on every render tick;
// this page is the "brain" deciding what enemies do. Schema is
// schema-agnostic — we render whatever fields are present and don't
// crash on missing ones, because the VBA side's state shape may evolve.
//
// Visualization is the star: per-enemy state machine (idle/seek/attack)
// colors, threat lines from enemy to its target, player heading arrow,
// directive log. Side panel surfaces raw state for debugging.
//
// Round 72: self-hosted hunt simulation mode. When active, VBA bridge
// data is ignored and N synthetic agents fight each other on the
// loaded WAD using the same state machine + heatmap + thinking log.

import * as HuntSim from "./aiHuntSim.js";
import { backoffDelay, onConnectivityRegained } from "../net/wsReconnect.js";

// ---- DOM ----------------------------------------------------------------
const canvas        = document.getElementById("map");
const statusDot     = document.querySelector("#status .dot");
const statusTxt     = document.getElementById("status-text");
const statTick      = document.getElementById("stat-tick");
const statAge       = document.getElementById("stat-age");
const statPlayer    = document.getElementById("stat-player");
const statEnemies   = document.getElementById("stat-enemies");
const enemyListEl   = document.getElementById("enemy-list");
const recentDirsEl  = document.getElementById("recent-dirs");
const rawStateEl    = document.getElementById("raw-state");

const ctx = canvas.getContext("2d");

function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.max(1, Math.floor(canvas.clientWidth  * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
}
resize();
window.addEventListener("resize", resize);

// ---- State --------------------------------------------------------------
let lastState     = null;        // most recent { tick, t_ms, player, enemies, events }
let lastUpdateMs  = 0;
const aiState     = new Map();   // enemyId -> { state, target, desiredYaw, dist, lastDecisionMs }
const recentDirs  = [];          // last N directives we sent (for the log panel)
const MAX_RECENT  = 8;

// AI decision thresholds (world units; assume meters-ish based on VBA game)
const ATTACK_DIST = 4;
const SEEK_DIST   = 25;
const DECIDE_INTERVAL_MS = 250;    // re-decide every 250ms per enemy
const TURN_SPEED_RAD = 1.5;        // rad/s — caps how fast we tell an enemy to turn

// Round 69 — visible thinking. Player trajectory prediction window:
// we keep a short ring buffer of player positions and project ahead
// using a damped velocity estimate. Predictions over ~1.5s are usable;
// further out gets noisy from rotations.
const PLAYER_HISTORY_MS = 1500;
const PREDICT_AHEAD_S   = 1.2;
const playerHistory     = [];     // [{ t, x, z, yaw }] newest at end

// Round 69 — threat heatmap. Grid of cells colored by per-cell hostility
// (close to attacking enemy = red, close to seeking enemy = orange).
// 40 cells across the larger axis is enough resolution to read as a
// continuous gradient without burning CPU. Recomputed on state ingest,
// not per frame, since it's expensive enough to feel laggy at 60fps.
const HEATMAP_RES = 40;
let heatmap = null;               // { cells: Float32Array, minX, minZ, span, n }

// Round 69 — "thinking log". Every meaningful decision (state change,
// directive emitted, target switch) gets a one-line entry. Newest at top.
// Pure UX, not used by AI logic. Surface in the side panel.
const thinkLog = [];
const MAX_THINK = 24;
function think(line, kind = "info") {
    thinkLog.unshift({ t: Date.now(), line, kind });
    if (thinkLog.length > MAX_THINK) thinkLog.length = MAX_THINK;
    renderThinkLog();
}

// Round 70 — player control state. Three modes:
//   - none: brain only watches enemies, never touches the player
//   - goto: brain steers player toward `playerGoal` (set by click)
//   - autopilot: brain decides per-tick — evade nearest threat, return-fire
//     when an attacking enemy is in front, otherwise patrol/idle
let playerMode  = "none";
let playerGoal  = null;       // { x, z } in world units (goto mode)
let lastPlayerEmitMs = 0;

// Round 71 — WAD-loaded map geometry. When a WAD is loaded and a map
// selected, `wadMap` holds { vertices, lines, bounds, name }. The map
// renderer prefers WAD bounds over the entity-fit bounds, and draws
// linedefs (walls + passages) under everything else.
//
// Coordinate convention: WAD is X/Y in "map units" (~one inch each in
// Doom canon). We map x → x and y → z for our top-down view. No flip;
// north is up like the brain's existing convention.
let wadFile = null;          // parsed WAD descriptor (lumps, maps, arrayBuffer)
let wadMap  = null;          // parsed map (vertices, lines, bounds, name)
let wadScale = 1;            // converts WAD units to brain world units

(function wireWadUI() {
    const fileInput = document.getElementById("wad-file");
    const mapSelect = document.getElementById("wad-map");
    const status    = document.getElementById("wad-status");
    if (!fileInput) return;

    fileInput.addEventListener("change", async (ev) => {
        const file = ev.target.files?.[0];
        if (!file) return;
        status.textContent = `reading ${file.name}…`;
        try {
            const buf = await file.arrayBuffer();
            const mod = await import("../tools/wadLoader.js");
            wadFile = mod.WAD.parse(buf);
            if (wadFile.maps.length === 0) throw new Error("no maps found in WAD");
            // Populate dropdown
            mapSelect.innerHTML = "";
            for (const m of wadFile.maps) {
                const o = document.createElement("option");
                o.value = m.name;
                o.textContent = m.name;
                mapSelect.appendChild(o);
            }
            mapSelect.style.display = "block";
            // Auto-select first map
            mapSelect.value = wadFile.maps[0].name;
            loadWadMap(wadFile.maps[0].name);
            status.textContent = `${file.name}: ${wadFile.maps.length} maps, ${(buf.byteLength/1024/1024).toFixed(1)} MB`;
            think(`WAD loaded: ${file.name} (${wadFile.maps.length} maps)`, "info");
        } catch (e) {
            status.textContent = `load failed: ${e.message}`;
            wadFile = null;
            wadMap = null;
            mapSelect.style.display = "none";
        }
    });

    mapSelect.addEventListener("change", (ev) => {
        if (wadFile) loadWadMap(ev.target.value);
    });
})();

async function loadWadMap(name) {
    if (!wadFile) return;
    try {
        const mod = await import("../tools/wadLoader.js");
        wadMap = mod.WAD.parseMap(wadFile, name);
        // Auto-scale: aim for ~40-80 world units across the larger axis,
        // so the map matches the engine's "meters-ish" scale used for
        // enemies/player positions. Doom maps are usually 1024-3072
        // units across, so wadScale will land around 0.02-0.08.
        const wadSpan = Math.max(
            wadMap.bounds.maxX - wadMap.bounds.minX,
            wadMap.bounds.maxY - wadMap.bounds.minY,
        );
        wadScale = wadSpan > 0 ? 60 / wadSpan : 1;
        think(`map: ${name} (${wadMap.vertices.length / 2} verts, ${wadMap.lines.length / 3} lines, scale ${wadScale.toFixed(3)})`, "info");
    } catch (e) {
        document.getElementById("wad-status").textContent = `map parse failed: ${e.message}`;
        wadMap = null;
    }
}

// ---- Bridge connection: WS first, polling fallback ---------------------
let ws = null;
let _brainWsAttempt = 0;   // v1345 — jittered-backoff reconnect attempt counter
onConnectivityRegained(() => { _brainWsAttempt = 0; connect(); }, () => !ws || ws.readyState >= 2);
let pollTimer = null;

function connect() {
    try { ws = new WebSocket((location.protocol === "https:" ? "wss:" : "ws:") + "//" + location.host); }
    catch {
        statusTxt.textContent = "ws error — falling back to poll";
        startPolling();
        return;
    }

    ws.addEventListener("open", () => {
        statusDot.classList.add("on");
        statusTxt.textContent = `connected · ws://${location.host}`;
        stopPolling();
        _brainWsAttempt = 0;
    });
    ws.addEventListener("close", () => {
        statusDot.classList.remove("on");
        statusTxt.textContent = "ws disconnected — polling fallback";
        startPolling();
        setTimeout(connect, backoffDelay(_brainWsAttempt++));
    });
    ws.addEventListener("error", () => {
        statusDot.classList.remove("on");
    });
    ws.addEventListener("message", (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch { return; }
        if (m.type === "bridge:state" && m.state) {
            ingestState(m.state);
        }
        // v715 — forward speak:end events to every iframe on the page.
        // The Listener PowerShell fires this via /kpop/speak-end whenever
        // SpeakAsync's SpeakCompleted event raises; the bridge broadcasts
        // it on this socket; we fan out to all avatar iframes so each one
        // can early-release its head-focus lock + ease the camera out.
        else if (m.type === "kpop:speak:end") {
            try {
                document.querySelectorAll("iframe").forEach((f) => {
                    try { f.contentWindow?.postMessage({ type: "kpop:speak:end", voice: m.voice }, "*"); } catch {}
                });
            } catch {}
        }
    });
}

async function pollOnce() {
    try {
        const res = await fetch("/bridge/state");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const j = await res.json();
        if (j.state) ingestState(j.state);
    } catch (e) {
        // silent; status pill stays "polling fallback"
    }
}
function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(pollOnce, 300);
}
function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

connect();

// ---- State ingest -------------------------------------------------------
function ingestState(state) {
    lastState    = state;
    lastUpdateMs = performance.now();

    // Round 69 — track player history for trajectory prediction
    if (state.player && typeof state.player.x === "number") {
        playerHistory.push({
            t: lastUpdateMs,
            x: state.player.x,
            z: state.player.z,
            yaw: state.player.yaw,
        });
        // Trim old entries
        const cutoff = lastUpdateMs - PLAYER_HISTORY_MS;
        while (playerHistory.length > 1 && playerHistory[0].t < cutoff) {
            playerHistory.shift();
        }
    }

    // Round 69 — recompute heatmap on each tick. Done here rather than
    // per frame because state arrives at ~10Hz from VBA and the heatmap
    // shouldn't update faster than the data driving it.
    heatmap = computeHeatmap(state);

    updateSidePanel();
}

// Round 69 — project player position ahead by PREDICT_AHEAD_S seconds.
// Uses the last ~600ms of history for the velocity estimate to smooth
// out single-frame jitter. Returns null when we don't have enough
// history yet.
function predictPlayer() {
    if (playerHistory.length < 2) return null;
    const newest = playerHistory[playerHistory.length - 1];
    // Find the oldest sample within a 600ms window for the estimate
    const windowStart = newest.t - 600;
    let oldest = playerHistory[0];
    for (const h of playerHistory) {
        if (h.t >= windowStart) { oldest = h; break; }
    }
    const dt = (newest.t - oldest.t) / 1000;
    if (dt < 0.05) return null;
    const vx = (newest.x - oldest.x) / dt;
    const vz = (newest.z - oldest.z) / dt;
    const speed = Math.hypot(vx, vz);
    return {
        x: newest.x + vx * PREDICT_AHEAD_S,
        z: newest.z + vz * PREDICT_AHEAD_S,
        vx, vz, speed,
    };
}

// Round 69 — threat heatmap. Each cell scores the danger of standing
// there based on every enemy's state + distance. Score formula:
//   per-enemy contribution = weight * exp(-dist / scale)
//   weight: attack=1.0, seek=0.6, idle=0.15
//   scale:  attack=4 (sharp falloff), seek=12, idle=20
// Summed across enemies, capped at 1.0, mapped to a color in render().
// Players standing in high-score cells are "in danger." AI uses this
// implicitly via per-enemy decisions; the heatmap is mostly visual but
// also useful for future tasks like "predict where player should flee."
function computeHeatmap(state) {
    const enemies = state.enemies || [];
    if (enemies.length === 0) return null;

    // Build bounding box from player (if any) + enemies. In sim mode
    // there's no player; entity bounds alone are enough. With a loaded
    // WAD we extend to its bounds too so the heatmap covers the map.
    const points = [];
    if (state.player) points.push([state.player.x ?? 0, state.player.z ?? 0]);
    for (const e of enemies) {
        if (typeof e.x === "number") points.push([e.x, e.z]);
    }
    if (points.length === 0) return null;
    let minX = +Infinity, maxX = -Infinity, minZ = +Infinity, maxZ = -Infinity;
    for (const [x, z] of points) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const span = Math.max(30, maxX - minX, maxZ - minZ) * 1.4;   // pad 40%
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const startX = cx - span / 2;
    const startZ = cz - span / 2;
    const cellSize = span / HEATMAP_RES;
    const n = HEATMAP_RES;
    const cells = new Float32Array(n * n);

    // Per-enemy weights + scales by state
    const weights = enemies.map(e => {
        const ai = aiState.get(e.id);
        const s  = ai?.state || "idle";
        if (s === "attack") return { w: 1.0, scale: 4 };
        if (s === "seek")   return { w: 0.6, scale: 12 };
        return                       { w: 0.15, scale: 20 };
    });

    for (let iz = 0; iz < n; iz++) {
        const wz = startZ + (iz + 0.5) * cellSize;
        for (let ix = 0; ix < n; ix++) {
            const wx = startX + (ix + 0.5) * cellSize;
            let total = 0;
            for (let i = 0; i < enemies.length; i++) {
                const e = enemies[i];
                if (typeof e.x !== "number") continue;
                const dx = wx - e.x;
                const dz = wz - e.z;
                const d = Math.hypot(dx, dz);
                const { w, scale } = weights[i];
                total += w * Math.exp(-d / scale);
            }
            cells[iz * n + ix] = total > 1 ? 1 : total;
        }
    }
    return { cells, startX, startZ, span, n };
}

// ---- AI logic -----------------------------------------------------------
// Tick on a fixed interval rather than on every state update — keeps the
// directive rate sane and makes hysteresis (avoiding flicker between
// idle/seek when distance hovers near a threshold) clean to implement.
setInterval(aiTick, DECIDE_INTERVAL_MS);

function aiTick() {
    // Round 72 — in sim mode, hunt sim owns the decide loop and the
    // VBA-side decision logic is skipped entirely. The sim's own
    // decideTick handles state transitions + fire decisions + respawn.
    // Heatmap recomputes here so it tracks the synthetic agents.
    if (HuntSim.simIsActive()) {
        HuntSim.simSync({ wadMap, wadScale, thinkFn: think, aiState });
        HuntSim.simDecideTick();
        heatmap = computeHeatmap(HuntSim.simStateForRender() || {});
        return;
    }
    if (!lastState) return;
    const player = lastState.player;
    if (!player) return;

    // Round 70 — player-side decisions interleave with enemy decisions
    // on the same 250ms tick. Kept above enemy loop so the player
    // intent is visible in the directive log before reactive enemy
    // commands for the same tick.
    playerTick();

    const enemies = lastState.enemies || [];

    for (const enemy of enemies) {
        if (typeof enemy.x !== "number" || typeof enemy.z !== "number") continue;
        const dx = (player.x ?? 0) - enemy.x;
        const dz = (player.z ?? 0) - enemy.z;
        const dist = Math.hypot(dx, dz);
        const desiredYaw = Math.atan2(dz, dx);

        // State machine with hysteresis — enemies don't oscillate at borders
        const prev = aiState.get(enemy.id) || { state: "idle" };
        let newState = prev.state;
        if (newState === "idle") {
            if (dist < SEEK_DIST) newState = "seek";
        } else if (newState === "seek") {
            if (dist < ATTACK_DIST) newState = "attack";
            else if (dist > SEEK_DIST * 1.3) newState = "idle";
        } else if (newState === "attack") {
            if (dist > ATTACK_DIST * 1.5) newState = "seek";
        }

        const transitioned = newState !== prev.state;
        if (transitioned) {
            think(`#${e.id} ${prev.state || "idle"} → ${newState} (dist ${dist.toFixed(1)})`,
                newState === "attack" ? "attack" :
                newState === "seek"   ? "seek"   : "idle");
        }

        // Compute turn amount toward player (smallest signed delta).
        let yawDelta = 0;
        if (typeof enemy.yaw === "number") {
            yawDelta = wrapPi(desiredYaw - enemy.yaw);
        }

        aiState.set(enemy.id, {
            state: newState,
            target: "player",
            desiredYaw,
            yawDelta,
            dist,
            lastDecisionMs: performance.now(),
        });

        // Emit a directive only when transitioning OR every few seconds
        // when in seek/attack (so VBA gets fresh yaw as the player moves).
        const shouldEmit = transitioned ||
            (newState !== "idle" && (performance.now() - (prev.lastEmitMs || 0) > 600));
        if (shouldEmit) {
            const dt = DECIDE_INTERVAL_MS / 1000;
            const cappedYawStep = clamp(yawDelta, -TURN_SPEED_RAD * dt, TURN_SPEED_RAD * dt);
            const moveAmount = newState === "seek" ? 0.5 : (newState === "attack" ? 0.1 : 0);

            // Compound directive: turn + move + optionally fire. Send as
            // separate POSTs so modAICommands can dispatch individually.
            postDirective({
                cmd:       "turn",
                enemyId:   enemy.id,
                yaw:       desiredYaw,         // absolute target heading
                yawDelta:  cappedYawStep,      // suggested per-tick step
            });
            if (moveAmount > 0) {
                postDirective({
                    cmd:     "move",
                    enemyId: enemy.id,
                    amount:  moveAmount,
                });
            }
            if (newState === "attack") {
                postDirective({
                    cmd:     "fire",
                    enemyId: enemy.id,
                    target:  "player",
                });
            }
            aiState.get(enemy.id).lastEmitMs = performance.now();
        }
    }

    updateSidePanel();
}

async function postDirective(d) {
    try {
        const res = await fetch("/bridge/directive", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(d),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        recentDirs.unshift({ ...d, t: Date.now() });
        if (recentDirs.length > MAX_RECENT) recentDirs.length = MAX_RECENT;
        renderRecentDirs();
    } catch (e) {
        // silent — keep brain alive even if relay momentarily stalls
    }
}

// Round 70 — Player-side AI. Two modes:
//   goto: drive the player toward playerGoal (set by clicking on map).
//   autopilot: pick a tactic per tick — flee from attacking enemies,
//     close on seekers (to break their pursuit), fire at attackers in
//     view, otherwise idle.
function playerTick() {
    const player = lastState.player;
    if (!player) return;
    if (playerMode === "none") return;

    const enemies = lastState.enemies || [];

    let intent = null;     // { forward, strafe, yaw, fire, label }

    if (playerMode === "goto") {
        if (!playerGoal) return;
        const dx = playerGoal.x - player.x;
        const dz = playerGoal.z - player.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 1.5) {
            // Arrived — clear and stop
            think(`player reached (${playerGoal.x.toFixed(1)}, ${playerGoal.z.toFixed(1)})`, "info");
            playerGoal = null;
            updatePlayerStatus();
            postDirective({ cmd: "playerMove", forward: 0, strafe: 0 });
            return;
        }
        const desiredYaw = Math.atan2(dz, dx);
        intent = {
            yaw: desiredYaw,
            yawDelta: typeof player.yaw === "number" ? wrapPi(desiredYaw - player.yaw) : 0,
            forward: dist > 3 ? 1.0 : 0.5,    // slow on approach
            strafe: 0,
            fire: false,
            label: `goto (${playerGoal.x.toFixed(1)}, ${playerGoal.z.toFixed(1)}) · ${dist.toFixed(1)}u`,
        };
    } else if (playerMode === "autopilot") {
        // Find the most pressing threat: attacking enemy, then seek
        let threat = null;
        let threatScore = 0;
        for (const e of enemies) {
            if (typeof e.x !== "number") continue;
            const ai = aiState.get(e.id);
            if (!ai) continue;
            const dx = e.x - player.x;
            const dz = e.z - player.z;
            const dist = Math.hypot(dx, dz);
            const stateWeight = ai.state === "attack" ? 3
                              : ai.state === "seek"   ? 1.2
                              :                          0.3;
            const score = stateWeight / Math.max(1, dist);
            if (score > threatScore) {
                threatScore = score;
                threat = { e, ai, dist, dx, dz };
            }
        }

        if (!threat) {
            intent = { forward: 0, strafe: 0, fire: false, label: "no threats — idle" };
        } else {
            const desiredYaw = Math.atan2(threat.dz, threat.dx);   // face the threat
            const yawDelta   = typeof player.yaw === "number"
                ? wrapPi(desiredYaw - player.yaw)
                : 0;
            // Within firing range and roughly aimed → fire
            const aimedAtThreat = Math.abs(yawDelta) < 0.35;
            const canFire = threat.dist < 18 && aimedAtThreat;
            // Movement: back away if too close, hold if mid-range, advance if far
            let forward;
            let labelTactic;
            if (threat.dist < 5)        { forward = -1.0; labelTactic = "back off"; }
            else if (threat.dist < 12)  { forward =  0;   labelTactic = "hold + fire"; }
            else                         { forward =  0.5; labelTactic = "close"; }
            // Slight strafe to make us a harder target during attack engagements
            const strafe = threat.ai.state === "attack" ? (Math.sin(performance.now() * 0.003) > 0 ? 0.6 : -0.6) : 0;
            intent = {
                yaw: desiredYaw,
                yawDelta,
                forward,
                strafe,
                fire: canFire,
                label: `autopilot · ${labelTactic} #${threat.e.id} (dist ${threat.dist.toFixed(1)}, ${threat.ai.state})`,
            };
        }
    }

    if (!intent) return;

    // Throttle emission: every 250ms minimum, more often if intent changed
    // dramatically. Two POSTs per tick (turn + move) keeps modAICommands'
    // dispatch simple even if a single combined cmd would be more efficient.
    const now = performance.now();
    if (now - lastPlayerEmitMs < 200) return;
    lastPlayerEmitMs = now;

    if (intent.yaw != null) {
        postDirective({
            cmd: "playerTurn",
            yaw: intent.yaw,
            yawDelta: intent.yawDelta ?? 0,
        });
    }
    postDirective({
        cmd: "playerMove",
        forward: intent.forward,
        strafe:  intent.strafe ?? 0,
    });
    if (intent.fire) {
        postDirective({ cmd: "playerFire" });
    }
    updatePlayerStatus(intent.label);
}

function updatePlayerStatus(label) {
    const el = document.getElementById("player-status");
    if (!el) return;
    if (playerMode === "none") {
        el.textContent = "no target set";
    } else if (playerMode === "goto") {
        el.textContent = label ?? (playerGoal
            ? `goto: (${playerGoal.x.toFixed(1)}, ${playerGoal.z.toFixed(1)})`
            : "goto target cleared");
    } else if (playerMode === "autopilot") {
        el.textContent = label ?? "autopilot · waiting for state";
    }
}

// Round 70 — autopilot toggle wired here so the side-panel button can
// flip modes without re-rendering the whole panel.
(function wirePlayerControlUI() {
    const btn      = document.getElementById("btn-autopilot");
    const clearBtn = document.getElementById("btn-clear-goto");
    if (btn) {
        btn.addEventListener("click", () => {
            if (playerMode === "autopilot") {
                playerMode = "none";
                btn.textContent = "AUTO-PILOT: OFF";
                btn.style.background = "rgba(150,100,255,0.25)";
                think("autopilot OFF", "info");
                postDirective({ cmd: "playerMove", forward: 0, strafe: 0 });
            } else {
                playerMode = "autopilot";
                playerGoal = null;
                btn.textContent = "AUTO-PILOT: ON";
                btn.style.background = "rgba(150,100,255,0.55)";
                think("autopilot ON", "info");
            }
            updatePlayerStatus();
        });
    }
    if (clearBtn) {
        clearBtn.addEventListener("click", () => {
            if (playerMode === "goto") {
                playerMode = "none";
                playerGoal = null;
                think("goto target cleared", "info");
                postDirective({ cmd: "playerMove", forward: 0, strafe: 0 });
                updatePlayerStatus();
            }
        });
    }
})();

function wrapPi(a) {
    while (a >  Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

// ---- Side panel ---------------------------------------------------------
function updateSidePanel() {
    if (!lastState) return;
    statTick.textContent    = lastState.tick != null ? lastState.tick : "—";
    const age = (performance.now() - lastUpdateMs) / 1000;
    statAge.textContent     = `${age.toFixed(1)}s ago`;
    if (lastState.player) {
        const p = lastState.player;
        statPlayer.textContent = `(${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)}) yaw ${fmt(p.yaw)}`;
    } else {
        statPlayer.textContent = "—";
    }
    const enemies = lastState.enemies || [];
    statEnemies.textContent = enemies.length;

    enemyListEl.innerHTML = "";
    if (enemies.length === 0) {
        enemyListEl.innerHTML = `<div style="opacity:0.45;font-size:10px;">no enemies in state</div>`;
    } else {
        for (const e of enemies) {
            const ai = aiState.get(e.id) || {};
            const stateColor = colorForState(ai.state);
            const card = document.createElement("div");
            card.className = "enemy-card";
            card.style.borderLeftColor = stateColor;
            card.innerHTML = `
                <div class="row1">#${e.id} <span style="color:${stateColor}">${ai.state || "idle"}</span></div>
                <div class="row2">pos (${fmt(e.x)}, ${fmt(e.z)}) · dist ${fmt(ai.dist)} · Δyaw ${fmt(ai.yawDelta)}</div>
            `;
            enemyListEl.appendChild(card);
        }
    }

    rawStateEl.textContent = JSON.stringify(lastState, null, 2).slice(0, 1200);
}

function renderRecentDirs() {
    if (recentDirs.length === 0) {
        recentDirsEl.innerHTML = `<div style="opacity:0.4">none yet</div>`;
        return;
    }
    recentDirsEl.innerHTML = recentDirs.map(d => {
        const t = new Date(d.t).toLocaleTimeString();
        const main = `${d.cmd}${d.enemyId != null ? ` #${d.enemyId}` : ""}`;
        const params = [];
        if (d.yaw != null)      params.push(`yaw=${d.yaw.toFixed(2)}`);
        if (d.yawDelta != null) params.push(`Δ=${d.yawDelta.toFixed(2)}`);
        if (d.amount != null)   params.push(`amt=${d.amount}`);
        if (d.target)           params.push(`→${d.target}`);
        return `<div>${t} <span style="color:#5ec8ff">${main}</span> ${params.join(" ")}</div>`;
    }).join("");
}

// Round 69 — thinking log renderer. Pulls from the global `thinkLog`
// (newest first). Color-coded by kind so attack transitions pop.
function renderThinkLog() {
    const el = document.getElementById("think-log");
    if (!el) return;
    if (thinkLog.length === 0) {
        el.innerHTML = `<div style="opacity:0.4">no decisions yet</div>`;
        return;
    }
    const colorFor = { attack: "#ff5050", seek: "#ff9933", idle: "#5ec8ff", info: "#aaa" };
    el.innerHTML = thinkLog.map(t => {
        const ts = new Date(t.t).toLocaleTimeString();
        const c = colorFor[t.kind] || "#aaa";
        return `<div><span style="opacity:0.5">${ts}</span> <span style="color:${c}">${t.line}</span></div>`;
    }).join("");
}

function colorForState(s) {
    if (s === "attack") return "#ff5050";
    if (s === "seek")   return "#ff9933";
    return "#5ec8ff";
}

function fmt(v) {
    return typeof v === "number" ? v.toFixed(1) : "—";
}

// Round 70 — last-frame world transform captured for click translation.
// Updated each render(); used by the canvas click handler to convert
// screen pixels back to world (x, z).
let lastTransform = null;     // { centerX, centerZ, scale, cx, cy }

// Round 70 — click on the map sets a goto target. Right-click clears
// (also covered by the side-panel ×). Switches mode to "goto" unless
// autopilot is active (autopilot has priority).
canvas.addEventListener("click", (ev) => {
    if (!lastTransform || !lastState?.player) return;
    if (playerMode === "autopilot") return;     // autopilot owns the player
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const px = (ev.clientX - rect.left) * dpr;
    const py = (ev.clientY - rect.top)  * dpr;
    const { centerX, centerZ, scale, cx, cy } = lastTransform;
    const worldX = (px - cx / 2) / scale + centerX;
    const worldZ = (py - cy / 2) / scale + centerZ;
    playerMode = "goto";
    playerGoal = { x: worldX, z: worldZ };
    think(`goto set: (${worldX.toFixed(1)}, ${worldZ.toFixed(1)})`, "info");
    updatePlayerStatus();
});
canvas.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    if (playerMode === "goto") {
        playerMode = "none";
        playerGoal = null;
        think("goto cleared (right-click)", "info");
        postDirective({ cmd: "playerMove", forward: 0, strafe: 0 });
        updatePlayerStatus();
    }
});

// ---- Top-down map rendering --------------------------------------------
let lastRenderMs = 0;
function render() {
    const cx = canvas.width, cy = canvas.height;
    ctx.clearRect(0, 0, cx, cy);

    // Round 72 — step the hunt sim physics each frame. Decide-tick is
    // on its own 250ms cadence (above); this is the continuous part.
    // Use real elapsed time for smooth movement even when the page
    // tabs out and resumes.
    const nowMs = performance.now();
    const dt = lastRenderMs ? (nowMs - lastRenderMs) / 1000 : 1 / 60;
    lastRenderMs = nowMs;
    if (HuntSim.simIsActive()) {
        HuntSim.simSync({ wadMap, wadScale, thinkFn: think, aiState });
        HuntSim.simStepFrame(dt);
    }

    // Round 71 — if there's a WAD loaded, render at least the map even
    // when we don't have VBA state yet. Lets the user verify the WAD
    // loaded correctly without needing Excel to be live.
    // Round 72 — also bail out of the empty-state screen when sim is
    // active (sim is its own state source).
    if (!lastState && !wadMap && !HuntSim.simIsActive()) {
        ctx.fillStyle = "rgba(200, 210, 255, 0.4)";
        ctx.font = `${14 * (window.devicePixelRatio || 1)}px monospace`;
        ctx.textAlign = "center";
        ctx.fillText("waiting for VBA game state...", cx / 2, cy / 2);
        ctx.font = `${10 * (window.devicePixelRatio || 1)}px monospace`;
        ctx.fillStyle = "rgba(200, 210, 255, 0.25)";
        ctx.fillText("start the OpenGL FPS in Excel and call Bridge_StartTick", cx / 2, cy / 2 + 24);
        ctx.fillText("(or load a WAD on the right to preview the map)", cx / 2, cy / 2 + 42);
        requestAnimationFrame(render);
        return;
    }

    // Round 71 — safe-state alias. When a WAD is loaded but no VBA
    // state has arrived yet, lastState is null. Using S below means we
    // can render the map without crashing on .player / .enemies.
    // Round 72 — when the hunt sim is active, it supplies the state
    // shape instead of lastState. Standard renderer doesn't have to
    // know the difference.
    const S = HuntSim.simIsActive()
        ? (HuntSim.simStateForRender() || {})
        : (lastState || {});

    // ---- Establish world→canvas transform ----
    // Auto-fit. If a WAD map is loaded, fit to the WAD bounds (so the
    // whole level is visible regardless of where entities are). Otherwise
    // fit to player + enemy positions as before.
    let minX, maxX, minZ, maxZ;
    if (wadMap) {
        // WAD bounds, converted to brain world units, then expanded a
        // little so the wall lines aren't flush with the canvas edge.
        minX = wadMap.bounds.minX * wadScale;
        maxX = wadMap.bounds.maxX * wadScale;
        minZ = wadMap.bounds.minY * wadScale;
        maxZ = wadMap.bounds.maxY * wadScale;
    } else {
        const points = [];
        if (S.player) points.push([S.player.x ?? 0, S.player.z ?? 0]);
        for (const e of (S.enemies || [])) {
            if (typeof e.x === "number" && typeof e.z === "number") points.push([e.x, e.z]);
        }
        if (points.length === 0) {
            requestAnimationFrame(render);
            return;
        }
        minX = +Infinity; maxX = -Infinity; minZ = +Infinity; maxZ = -Infinity;
        for (const [x, z] of points) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
        }
    }
    // Add padding around the bounding box. Minimum 30 units so a single
    // entity isn't displayed at a huge zoom level.
    const span = Math.max(30, maxX - minX, maxZ - minZ);
    const padPx = 60 * (window.devicePixelRatio || 1);
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const scale = (Math.min(cx, cy) - 2 * padPx) / span;

    const toC = (x, z) => ({
        x: cx / 2 + (x - centerX) * scale,
        y: cy / 2 + (z - centerZ) * scale,
    });

    // Round 70 — capture for click→world translation
    lastTransform = { centerX, centerZ, scale, cx, cy };

    // ---- Threat heatmap (under the grid) -----------------------------
    // Round 69 — render each cell of the precomputed heatmap as a
    // translucent rectangle. Subtle (max alpha 0.35) so the player /
    // enemies stay readable on top. Threshold below 0.05 → skip (zero
    // contribution; saves fill calls in sparse layouts).
    if (heatmap) {
        const cellSize = heatmap.span / heatmap.n;
        const cellPx = cellSize * scale;
        const overdraw = 0.5;     // pixel extra to hide grid seams from sub-pixel pos
        for (let iz = 0; iz < heatmap.n; iz++) {
            for (let ix = 0; ix < heatmap.n; ix++) {
                const v = heatmap.cells[iz * heatmap.n + ix];
                if (v < 0.05) continue;
                const wx = heatmap.startX + ix * cellSize;
                const wz = heatmap.startZ + iz * cellSize;
                const p = toC(wx, wz);
                // Color ramp: blue (low) → orange (mid) → red (high).
                // Encode as HSL so alpha + color can stay independent.
                const hue = (1 - v) * 50;     // 0 (red) ... 50 (yellow-green-ish)
                const alpha = Math.min(0.35, v * 0.5);
                ctx.fillStyle = `hsla(${hue}, 90%, 55%, ${alpha})`;
                ctx.fillRect(p.x, p.y, cellPx + overdraw, cellPx + overdraw);
            }
        }
    }

    // ---- Grid ----
    ctx.strokeStyle = "rgba(94, 200, 255, 0.08)";
    ctx.lineWidth = 1;
    const gridStep = 5;
    const gridSpan = Math.ceil(span / 2) + gridStep;
    for (let gx = -gridSpan; gx <= gridSpan; gx += gridStep) {
        const p1 = toC(centerX + gx, centerZ - gridSpan);
        const p2 = toC(centerX + gx, centerZ + gridSpan);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    for (let gz = -gridSpan; gz <= gridSpan; gz += gridStep) {
        const p1 = toC(centerX - gridSpan, centerZ + gz);
        const p2 = toC(centerX + gridSpan, centerZ + gz);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }

    // ---- WAD walls (Round 71) ----------------------------------------
    // Drawn over the heatmap so the level geometry is clear, but UNDER
    // entities and threat lines so AI decisions still pop. Solid white
    // for one-sided walls; thinner dashed cyan for two-sided passages
    // (doorways / sector boundaries).
    if (wadMap) {
        const verts = wadMap.vertices;
        const lines = wadMap.lines;
        const dpr = window.devicePixelRatio || 1;
        // Two passes: passages first (thinner, below), walls on top.
        // Cuts down on state changes vs alternating.
        ctx.strokeStyle = "rgba(94, 200, 255, 0.25)";
        ctx.lineWidth = 1 * dpr;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        for (let i = 0; i < lines.length; i += 3) {
            if (lines[i + 2] === 0) continue;     // skip walls in pass 1
            const v1 = lines[i], v2 = lines[i + 1];
            const p1 = toC(verts[v1 * 2] * wadScale, verts[v1 * 2 + 1] * wadScale);
            const p2 = toC(verts[v2 * 2] * wadScale, verts[v2 * 2 + 1] * wadScale);
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = "rgba(220, 230, 255, 0.85)";
        ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath();
        for (let i = 0; i < lines.length; i += 3) {
            if (lines[i + 2] !== 0) continue;     // walls only
            const v1 = lines[i], v2 = lines[i + 1];
            const p1 = toC(verts[v1 * 2] * wadScale, verts[v1 * 2 + 1] * wadScale);
            const p2 = toC(verts[v2 * 2] * wadScale, verts[v2 * 2 + 1] * wadScale);
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
        }
        ctx.stroke();

        // Map-name label, top-right corner of the canvas
        ctx.fillStyle = "rgba(220, 230, 255, 0.65)";
        ctx.font = `${11 * dpr}px monospace`;
        ctx.textAlign = "right";
        ctx.fillText(wadMap.name, cx - 12 * dpr, 22 * dpr);
    }

    // ---- Threat lines (enemy -> player) ----
    // Round 72 — skipped in sim mode; HuntSim draws agent→target lines
    // in simExtraRender (different topology: agent targets agent, not
    // a shared player).
    if (!HuntSim.simIsActive() && S.player) {
        const pp = toC(S.player.x, S.player.z);
        for (const e of (S.enemies || [])) {
            const ai = aiState.get(e.id);
            if (!ai) continue;
            const ep = toC(e.x, e.z);
            ctx.strokeStyle = colorForState(ai.state);
            ctx.globalAlpha = ai.state === "attack" ? 0.85 : ai.state === "seek" ? 0.45 : 0.18;
            ctx.lineWidth = ai.state === "attack" ? 2 : 1;
            // Dashed for seek, solid for attack
            ctx.setLineDash(ai.state === "attack" ? [] : [4, 4]);
            ctx.beginPath();
            ctx.moveTo(ep.x, ep.y);
            ctx.lineTo(pp.x, pp.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
        }
    }

    // ---- Player trajectory prediction (Round 69) ---------------------
    if (S.player) {
        const pred = predictPlayer();
        if (pred && pred.speed > 0.3) {
            const a = toC(S.player.x, S.player.z);
            const b = toC(pred.x, pred.z);
            // Gradient dashed line current → predicted
            ctx.strokeStyle = "rgba(255, 230, 102, 0.55)";
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            ctx.setLineDash([]);
            // Ghost target marker
            ctx.strokeStyle = "rgba(255, 230, 102, 0.7)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(b.x, b.y, 6, 0, Math.PI * 2);
            ctx.stroke();
            // Velocity label
            ctx.fillStyle = "rgba(255, 230, 102, 0.5)";
            ctx.font = `${9 * (window.devicePixelRatio || 1)}px monospace`;
            ctx.textAlign = "left";
            ctx.fillText(`+${PREDICT_AHEAD_S.toFixed(1)}s @ ${pred.speed.toFixed(1)} u/s`,
                b.x + 8, b.y + 3);
        }
    }

    // ---- Player ----
    if (S.player) {
        const p = toC(S.player.x, S.player.z);
        const r = 9;
        // glow
        const grad = ctx.createRadialGradient(p.x, p.y, r * 0.5, p.x, p.y, r * 4);
        grad.addColorStop(0, "rgba(255, 230, 102, 0.5)");
        grad.addColorStop(1, "rgba(255, 230, 102, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(p.x, p.y, r * 4, 0, Math.PI * 2); ctx.fill();
        // star body
        ctx.fillStyle = "#ffe666";
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
        // yaw arrow
        if (typeof S.player.yaw === "number") {
            const yaw = S.player.yaw;
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + Math.cos(yaw) * r * 2, p.y + Math.sin(yaw) * r * 2);
            ctx.stroke();
        }
    }

    // ---- Goto target marker (Round 70) --------------------------------
    if (playerMode === "goto" && playerGoal && S.player) {
        const a = toC(S.player.x, S.player.z);
        const b = toC(playerGoal.x, playerGoal.z);
        ctx.strokeStyle = "rgba(160, 120, 255, 0.7)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);
        // Pulsing target ring
        const pulse = 8 + Math.sin(performance.now() * 0.006) * 3;
        ctx.strokeStyle = "rgba(180, 130, 255, 0.9)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(b.x, b.y, pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(180, 130, 255, 0.4)";
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // ---- Enemies ----
    for (const e of (S.enemies || [])) {
        const ep = toC(e.x, e.z);
        const ai = aiState.get(e.id) || { state: "idle" };
        const col = colorForState(ai.state);
        // outer ring (state)
        ctx.strokeStyle = col;
        ctx.lineWidth = ai.state === "attack" ? 3 : 1.5;
        ctx.beginPath(); ctx.arc(ep.x, ep.y, 10, 0, Math.PI * 2); ctx.stroke();
        // inner dot
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(ep.x, ep.y, 5, 0, Math.PI * 2); ctx.fill();
        // yaw indicator
        if (typeof e.yaw === "number") {
            ctx.strokeStyle = col;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(ep.x, ep.y);
            ctx.lineTo(ep.x + Math.cos(e.yaw) * 14, ep.y + Math.sin(e.yaw) * 14);
            ctx.stroke();
        }
        // id label
        ctx.fillStyle = "rgba(200, 210, 255, 0.5)";
        ctx.font = `${10 * (window.devicePixelRatio || 1)}px monospace`;
        ctx.textAlign = "center";
        ctx.fillText(`#${e.id}`, ep.x, ep.y - 14);
    }

    // Round 72 — sim-specific overlays: agent→target threat lines,
    // fire flashes, health pips, kill stars, round-over banner.
    if (HuntSim.simIsActive()) {
        HuntSim.simExtraRender(ctx, toC, window.devicePixelRatio || 1, cx, cy);
    }

    requestAnimationFrame(render);
}
requestAnimationFrame(render);

// Initial side panel state
updateSidePanel();

// Round 72 — hunt sim UI wiring + live stats. Stats refresh on a low-
// frequency timer so we don't burn cycles re-querying every frame.
(function wireSimUI() {
    const toggleBtn  = document.getElementById("btn-sim-toggle");
    const respawnBtn = document.getElementById("btn-sim-respawn");
    const countInput = document.getElementById("sim-count");
    const statsEl    = document.getElementById("sim-stats");
    if (!toggleBtn) return;

    function refreshButton() {
        const on = HuntSim.simIsActive();
        toggleBtn.textContent = on ? "SIMULATE: ON" : "SIMULATE: OFF";
        toggleBtn.style.background = on
            ? "rgba(94,255,138,0.45)"
            : "rgba(94,255,138,0.18)";
    }

    toggleBtn.addEventListener("click", () => {
        const n = Math.max(2, Math.min(16, parseInt(countInput.value, 10) || 6));
        if (HuntSim.simIsActive()) {
            HuntSim.simSetActive(false);
            think("sim: stopped", "info");
        } else {
            HuntSim.simSync({ wadMap, wadScale, thinkFn: think, aiState });
            HuntSim.simSetActive(true);
            HuntSim.simSpawn(n);
        }
        refreshButton();
    });

    respawnBtn.addEventListener("click", () => {
        if (!HuntSim.simIsActive()) return;
        const n = Math.max(2, Math.min(16, parseInt(countInput.value, 10) || 6));
        HuntSim.simSync({ wadMap, wadScale, thinkFn: think, aiState });
        HuntSim.simSpawn(n);
    });

    setInterval(() => {
        if (HuntSim.simIsActive()) {
            statsEl.textContent = `alive ${HuntSim.simAgentCount()} · kills ${HuntSim.simKills()}`;
        } else {
            statsEl.textContent = "—";
        }
    }, 250);

    refreshButton();
})();
