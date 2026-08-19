// demos_code/multiplayer_ogre.js — full multiplayer arc.
//
// Round 151 — server-authoritative OGRE waves with player HP,
// death + respawn, auto-wave progression, and session leaderboard.
//
// Pipeline:
//   1. Connect to bridge WebSocket via SharedOgreClient
//   2. Send player:announce (name + color) so other tabs see you
//   3. Click START WAVE — server spawns OGRE (or join an in-progress wave)
//   4. Click in world to attack (within 14u of OGRE) — applies damage
//      server-side, drains shared HP pool
//   5. OGRE attacks nearest player — reduces server-tracked player HP
//   6. Player HP reaches 0 → death + 3s respawn (server-driven)
//   7. OGRE HP reaches 0 → kill broadcast + 6s countdown → next wave
//      with 1.3× HP (server-driven, auto)
//   8. Session leaderboard tracks cumulative damage + kill credits
//
// What this demo proves over a single-player OGRE:
//   * The OGRE is a single shared entity (open two tabs, see the
//     same position, same HP)
//   * Damage is server-authoritative (your hits and theirs sum)
//   * Player HP is server-authoritative (when the OGRE hits you,
//     you actually take damage, can die, respawn)
//   * Waves auto-progress (kill → countdown → next wave)
//   * Session leaderboard ranks players by cumulative damage
//
// Try: open two browser tabs, START WAVE in one. The OGRE appears
// in both. Either tab can attack; HP drains for both. When it
// dies, both tabs see the countdown and the next wave spawning.

import { SharedOgreClient } from "../multiplayer/sharedOgreClient.js";
import { FrameStreamer }    from "../multiplayer/frameStreamer.js";

const ATTACK_DAMAGE = 12;     // damage per click
const ATTACK_RANGE  = 14;     // world units — reach where clicks count
const WAVE_HP       = 200;    // wave 1 HP

let client = null;
let ogreEntityId = null;
let overlay = null;
let panel = null;
let attackHandler = null;
let unloadHandler = null;
let lastClickAt = 0;
let damageDealtByMe = 0;
let ctxRef = null;
let myName = null;
let myColor = null;
let streamer = null;        // round 153 — FrameStreamer when active
let streaming = false;

// Round 152 — active explosion effects from /mp/bomb events.
// Each entry: { x, z, radius, startTime, fromName, hitOgre }
let activeBombs = [];
const BOMB_FX_DURATION_MS = 1200;

function shortId(id) { return id ? id.slice(0, 8) : "—"; }
function pidLabel(id) {
    if (!client) return shortId(id);
    if (id === client.myPlayerId) return "<span style='color:#fd0'>YOU</span>";
    return `<span style='color:#9fd'>${shortId(id)}</span>`;
}

function bar(frac, color, width = 18) {
    frac = Math.max(0, Math.min(1, frac));
    const filled = Math.floor(frac * width);
    return `<span style="color:${color};letter-spacing:0px">${"█".repeat(filled)}${"·".repeat(Math.max(0, width - filled))}</span>`;
}

function renderHUD() {
    if (!panel || !client) return;
    const ogreFrac = client.getHpFraction();
    const myFrac   = client.getMyHpFrac();
    const myHp     = client.getMyHp();
    const myMaxHp  = client.getMyMaxHp();
    const respawn  = client.getRespawnRemaining();
    const cd       = client.getWaveCountdownRemaining();
    const cdInfo   = client.getNextWaveInfo();
    const lb       = client.getLeaderboard();
    const interp   = client.getInterpolatedState();

    // Status line
    let status;
    if (!client.connected) {
        status = "<span style='color:#f99'>● disconnected</span>";
    } else if (cd != null) {
        status = `<span style='color:#fc4'>● WAVE ${cdInfo.nextWave} INCOMING (${cdInfo.nextMaxHp} HP) in ${cd.toFixed(1)}s</span>`;
    } else if (!client.active && !client.alive) {
        status = `<span style='color:#f99'>● YOU DIED — respawn in ${respawn.toFixed(1)}s</span>`;
    } else if (!client.active) {
        status = "<span style='color:#9fd'>● ready — START WAVE to begin</span>";
    } else if (client.hp <= 0) {
        status = "<span style='color:#fd0'>● OGRE DEFEATED</span>";
    } else if (!client.alive) {
        status = `<span style='color:#f99'>● YOU DIED — respawn in ${respawn.toFixed(1)}s</span>`;
    } else {
        status = "<span style='color:#0fa'>● live</span>";
    }

    // Contributors line (current wave)
    const contribTotal = client.contributors.reduce((a, b) => a + b.damage, 0);
    const contribLine = client.contributors.slice(0, 4)
        .sort((a, b) => b.damage - a.damage)
        .map(c => `${pidLabel(c.playerId)}: <b>${Math.round(c.damage)}</b>`)
        .join(" · ");

    // Session leaderboard (cumulative across waves)
    const lbLines = lb.slice(0, 5).map((e, i) => {
        const me = e.playerId === client.myPlayerId;
        const tag = me ? "<span style='color:#fd0'>YOU</span>"
                       : `<span style='color:#9fd'>${shortId(e.playerId)}</span>`;
        return `<div style="display:flex;justify-content:space-between;line-height:1.3">
            <span>${i + 1}. ${tag}</span>
            <span><b>${e.totalDamage}</b> dmg · <b>${e.kills}</b>k</span>
        </div>`;
    }).join("");

    const pos = interp ? `(${interp.x.toFixed(0)}, ${interp.z.toFixed(0)})` : "—";

    // Round 152 — recent bombs section (last 3 bombs in last 5s)
    const now = performance.now();
    activeBombs = activeBombs.filter(b => (now - b.startTime) < BOMB_FX_DURATION_MS * 4);
    const recentBombs = activeBombs.slice(-3).reverse();
    const bombLines = recentBombs.map(b => {
        const age = (now - b.startTime) / 1000;
        const ageStr = age < 1 ? "just now" : `${age.toFixed(1)}s ago`;
        const tag = b.hitOgre
            ? `<span style='color:#fa4'>-${Math.round(b.dealtToOgre)} HP</span>`
            : `<span style='color:#888'>miss</span>`;
        return `<div style='font-size:10px;line-height:1.3'>
            💥 <span style='color:#fc4'>${b.fromName}</span>
            @ (${b.x.toFixed(0)}, ${b.z.toFixed(0)}) ${tag}
            <span style='opacity:0.5'>· ${ageStr}</span>
        </div>`;
    }).join("");

    panel.innerHTML = `
        <div style="color:#fd0;font-weight:bold;font-size:13px;letter-spacing:1px;margin-bottom:6px">
            🌐 MULTIPLAYER OGRE — WAVES
        </div>
        <div style="font-size:11px;line-height:1.5;color:#9fd">
            ${status}<br/>
            You: <span style="color:${myColor}">${myName}</span> ·
            ID <span style="color:#888">${shortId(client.myPlayerId)}</span><br/>
            OGRE pos: <span style="color:#888">${pos}</span> · wave <b>${client.wave || (cdInfo?.nextWave ?? "—")}</b>
        </div>

        <div style="font-size:11px;line-height:1.5;color:#ddd;margin-top:8px">
            <div>YOUR HP <b>${myHp}/${myMaxHp}</b></div>
            ${bar(myFrac, myFrac > 0.5 ? "#0fa" : myFrac > 0.25 ? "#fc4" : "#f55")}
        </div>

        <div style="font-size:11px;line-height:1.5;color:#ddd;margin-top:6px">
            <div>OGRE HP <b>${Math.round(client.hp)}/${client.maxHp}</b></div>
            ${bar(ogreFrac, "#f55")}
        </div>

        <div style="font-size:11px;line-height:1.5;color:#9fd;margin-top:8px">
            <div style="color:#ddd">WAVE ${client.wave || "—"} DAMAGE</div>
            ${contribLine || '<span style="opacity:0.5">no damage yet</span>'}
            ${contribTotal ? `<div style="opacity:0.6;font-size:10px">total: ${Math.round(contribTotal)}</div>` : ""}
        </div>

        ${lbLines ? `
        <div style="font-size:11px;line-height:1.5;color:#9fd;margin-top:8px">
            <div style="color:#ddd">SESSION LEADERBOARD</div>
            ${lbLines}
        </div>` : ""}

        ${bombLines ? `
        <div style="font-size:11px;line-height:1.5;color:#9fd;margin-top:8px">
            <div style="color:#ddd">RECENT BOMBS</div>
            ${bombLines}
        </div>` : ""}

        <div style="margin-top:8px;display:flex;gap:4px">
            <button class="mp_start" style="flex:1;background:#062;color:#0fa;border:1px solid #0a6;padding:5px;font:10px monospace;cursor:pointer;pointer-events:auto;border-radius:3px">START WAVE</button>
            <button class="mp_stop"  style="flex:1;background:#400;color:#f99;border:1px solid #800;padding:5px;font:10px monospace;cursor:pointer;pointer-events:auto;border-radius:3px">STOP</button>
        </div>
        <div style="margin-top:5px;display:flex;gap:4px;align-items:center">
            <button class="mp_stream" style="flex:1;background:${streaming ? "#420" : "#222"};color:${streaming ? "#fc8" : "#9fd"};border:1px solid ${streaming ? "#a80" : "#444"};padding:5px;font:10px monospace;cursor:pointer;pointer-events:auto;border-radius:3px">
                ${streaming ? "📡 STREAMING TO EXCEL" : "📡 STREAM TO EXCEL"}
            </button>
        </div>
        ${streaming && streamer ? `
        <div style="margin-top:3px;font-size:9px;color:#888;line-height:1.3">
            sent <b>${streamer.stats().framesSent}</b> · skipped ${streamer.stats().framesSkipped} · errors ${streamer.stats().errors}
        </div>` : ""}
        <div style="margin-top:6px;font-size:10px;color:#aaa;line-height:1.4">
            ${client.alive
                ? `CLICK in the world to attack (within ${ATTACK_RANGE}u).`
                : "Dead — wait for respawn."}<br/>
            Open this demo in another tab to see waves shared.<br/>
            Your damage this session: <b style="color:#fd0">${Math.round(
                lb.find(e => e.playerId === client.myPlayerId)?.totalDamage || damageDealtByMe
            )}</b>
        </div>`;
    panel.querySelector(".mp_start").onclick = () => {
        // If a wave is already running or counting down, this is a no-op
        // on the server side (active flag prevents double-start), so we
        // just call it always — convenient for "join in progress".
        client.startWave({ maxHp: WAVE_HP, wave: client.wave + 1 });
        damageDealtByMe = 0;
    };
    panel.querySelector(".mp_stop").onclick = () => {
        client.stopWave();
    };
    // Round 153 — frame streaming toggle
    panel.querySelector(".mp_stream").onclick = () => {
        if (streaming) {
            if (streamer) { streamer.stop(); streamer = null; }
            streaming = false;
            ctxRef?.kpop?.info?.("📡 Stream off", "No longer sending frames");
        } else {
            streamer = new FrameStreamer({
                targetWidth:  48,
                targetHeight: 36,
                fps: 2,
                source: myName || "webgl_streamer",
            });
            streamer.start();
            streaming = true;
            ctxRef?.kpop?.info?.("📡 Stream on", "Excel can now pull frames");
        }
        renderHUD();
    };
}

// Full-screen death tint when the local player is dead
let deathOverlay = null;
function showDeathOverlay() {
    if (deathOverlay) return;
    deathOverlay = document.createElement("div");
    deathOverlay.style.cssText = [
        "position:fixed", "left:0", "top:0", "right:0", "bottom:0",
        "background:rgba(120,0,0,0.25)",
        "z-index:999",
        "pointer-events:none",
        "transition:background 0.3s",
    ].join(";");
    document.body.appendChild(deathOverlay);
}
function hideDeathOverlay() {
    if (deathOverlay?.parentNode) deathOverlay.parentNode.removeChild(deathOverlay);
    deathOverlay = null;
}

// Brief red flash overlay when we get hit
function flashHitOverlay() {
    const f = document.createElement("div");
    f.style.cssText = [
        "position:fixed", "left:0", "top:0", "right:0", "bottom:0",
        "background:rgba(255,40,40,0.35)",
        "z-index:998",
        "pointer-events:none",
    ].join(";");
    document.body.appendChild(f);
    setTimeout(() => { if (f.parentNode) f.parentNode.removeChild(f); }, 200);
}

// Round 152 — orange flash overlay when a bomb hits, with a slower
// fade so it reads distinctly from incoming OGRE damage.
function flashBombOverlay() {
    const f = document.createElement("div");
    f.style.cssText = [
        "position:fixed", "left:0", "top:0", "right:0", "bottom:0",
        "background:radial-gradient(circle at center, rgba(255,160,40,0.45), rgba(255,80,20,0.10))",
        "z-index:997",
        "pointer-events:none",
        "transition:opacity 0.6s ease-out",
        "opacity:1",
    ].join(";");
    document.body.appendChild(f);
    setTimeout(() => { f.style.opacity = "0"; }, 50);
    setTimeout(() => { if (f.parentNode) f.parentNode.removeChild(f); }, 700);
}

export default {
    id:    "multiplayer_ogre",
    label: "MULTIPLAYER OGRE WAVES (FULL ARC)",
    hint:  "Server-authoritative waves with player HP, death/respawn, auto-progression, session leaderboard",
    controls: [
        "Click START WAVE to spawn the OGRE on the server",
        "Open another tab — both see the same waves",
        "Click in the world to attack; damage routes server-side",
        "OGRE attacks reduce your HP; at 0 you die and respawn in 3s",
        "Kill the OGRE → wave auto-progresses with 1.3× HP",
    ],

    start(ctx) {
        ctxRef = ctx;
        client = new SharedOgreClient();
        ogreEntityId = null;
        damageDealtByMe = 0;

        // Generate a friendly name + color so other players have
        // something to label us with. Persisted in sessionStorage
        // would be nicer but isn't supported in artifacts; we just
        // randomize each session.
        myName = ctx?.kpop?.userName?.() || "Player_" + Math.floor(Math.random() * 999);
        myColor = `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`;

        overlay = document.createElement("div");
        overlay.style.cssText = [
            "position:fixed",
            "left:20px",
            "top:140px",
            "width:280px",
            "background:rgba(8,12,24,0.94)",
            "border:1px solid #466",
            "border-radius:5px",
            "box-shadow:0 0 18px rgba(80,160,200,0.20)",
            "padding:12px 14px",
            "color:#9fd",
            "font:11px 'Courier New', monospace",
            "z-index:1000",
            "pointer-events:auto",
            "max-height:80vh",
            "overflow-y:auto",
        ].join(";");
        panel = overlay;
        document.body.appendChild(overlay);

        // Announce ourselves after a moment so the server registers us
        // before any state messages start flowing
        setTimeout(() => {
            if (client?.connected && client.ws) {
                client.ws.send(JSON.stringify({
                    type: "player:announce",
                    data: { name: myName, color: myColor },
                }));
            }
        }, 200);

        // OGRE attack handler — flash overlay if we're the target
        client.onAttack((msg) => {
            if (client.isAttackingMe(msg)) {
                flashHitOverlay();
                ctx.kpop?.info?.("⚠ OGRE hit you", `-${msg.damage} HP`);
            }
        });

        client.onPlayerDied((msg) => {
            if (msg.playerId === client.myPlayerId) {
                showDeathOverlay();
                ctx.kpop?.info?.("☠ YOU DIED", `Respawn in ${(msg.respawnInMs / 1000).toFixed(1)}s`);
            } else {
                ctx.kpop?.info?.("☠ Player died", `${shortId(msg.playerId)} (${msg.deaths} total)`);
            }
        });

        client.onPlayerRespawned((msg) => {
            if (msg.playerId === client.myPlayerId) {
                hideDeathOverlay();
                ctx.kpop?.info?.("✦ Respawned", `Full HP — back in the fight`);
            }
        });

        client.onWaveCountdown((msg) => {
            ctx.kpop?.info?.(
                `WAVE ${msg.nextWave} INCOMING`,
                `${msg.nextMaxHp} HP · spawning in ${(msg.startsInMs / 1000).toFixed(0)}s`
            );
        });

        // Round 152 — bomb from Excel commander (or any HTTP poster).
        // Flash an orange overlay + toast. HP drop comes through the
        // ogre:state broadcast already wired.
        client.onBomb((msg) => {
            flashBombOverlay();
            const dist = (() => {
                const interp = client.getInterpolatedState();
                if (!interp) return null;
                return Math.hypot(interp.x - msg.x, interp.z - msg.z).toFixed(1);
            })();
            const hit = msg.damage > 0
                ? `-${msg.damage} HP${dist != null ? ` · ${dist}u from impact` : ""}`
                : "miss — no OGRE in radius";
            ctx.kpop?.info?.(`💣 ${msg.source}`, hit);
        });

        client.onKilled((msg) => {
            const breakdown = (msg.contributors || []).slice(0, 3)
                .map(c => `${c.playerId === client.myPlayerId ? "YOU" : shortId(c.playerId)}: ${Math.round(c.damage)}`)
                .join(", ");
            ctx.kpop?.info?.(`🎯 WAVE ${msg.wave} CLEARED`, "Contributors: " + breakdown);
            if (ogreEntityId != null) {
                ctx.despawnEntity?.(ogreEntityId);
                ogreEntityId = null;
            }
        });

        // Round 152 — Excel observer dropped a bomb. Display in the
        // 3D world (entity spawn at impact) AND keep a record for the
        // HUD ring animation. Multiple bombs can be active at once.
        client.onBomb((msg) => {
            const startTime = performance.now();
            activeBombs.push({
                x: msg.x, z: msg.z,
                radius: msg.radius,
                fromName: msg.fromName || "Observer",
                hitOgre: !!msg.hitOgre,
                dealtToOgre: msg.dealtToOgre || 0,
                startTime,
            });
            // Spawn a brief visual entity at the bomb landing site so
            // the world also reflects the strike, not just the HUD.
            const y = (ctx.getSurfaceY?.(msg.x, msg.z) ?? 30) + 2.0;
            const fxId = ctx.spawnMesh?.("kaiju_hell", msg.x, y, msg.z, 1.5);
            if (fxId != null) {
                setTimeout(() => ctx.despawnEntity?.(fxId), BOMB_FX_DURATION_MS);
            }
            const tag = msg.hitOgre
                ? `-${Math.round(msg.dealtToOgre)} HP to OGRE`
                : `MISS (OGRE out of range)`;
            ctx.kpop?.info?.(`💥 BOMB from ${msg.fromName}`, tag);
        });

        // Click handler — attempt to damage if OGRE in range AND we're alive
        attackHandler = (ev) => {
            if (ev.target.closest("button, input, select, textarea")) return;
            const now = performance.now();
            if (now - lastClickAt < 200) return;
            lastClickAt = now;
            if (!client.active) return;
            if (!client.isAlive()) {
                ctx.kpop?.info?.("Can't attack", "You're dead — respawning");
                return;
            }
            const interp = client.getInterpolatedState();
            if (!interp) return;
            const cam = ctx.camera?.position;
            if (!cam) return;
            const dx = interp.x - cam.x, dz = interp.z - cam.z;
            const d = Math.hypot(dx, dz);
            if (d <= ATTACK_RANGE) {
                client.applyDamage(ATTACK_DAMAGE);
                damageDealtByMe += ATTACK_DAMAGE;
            } else {
                ctx.kpop?.info?.("Out of range", `OGRE is ${d.toFixed(1)}u away`);
            }
        };
        window.addEventListener("click", attackHandler);

        unloadHandler = () => { if (client) client.close(); };
        window.addEventListener("beforeunload", unloadHandler);

        renderHUD();
        ctx.kpop?.info?.("Multiplayer OGRE", "Click START WAVE to begin");
        console.log("[multiplayer_ogre] started as", myName);
    },

    tick(ctx, dt) {
        if (!client) return;

        const interp = client.getInterpolatedState();

        // Maintain the OGRE entity: spawn when active, despawn when not
        if (client.active && interp) {
            const y = (ctx.getSurfaceY?.(interp.x, interp.z) ?? 30) + 2.5;
            if (ogreEntityId == null) {
                ogreEntityId = ctx.spawnMesh?.("kaiju_hell", interp.x, y, interp.z, 2.2);
            } else {
                ctx.router?.exec?.({
                    type: "entity:move",
                    id:   ogreEntityId,
                    x: interp.x, y: y, z: interp.z,
                    yaw: interp.yaw,
                });
            }
        } else if (!client.active && ogreEntityId != null) {
            ctx.despawnEntity?.(ogreEntityId);
            ogreEntityId = null;
        }

        // Keep death overlay synced (in case message was missed)
        if (!client.alive && !deathOverlay) showDeathOverlay();
        if (client.alive && deathOverlay) hideDeathOverlay();

        // HUD refresh ~6Hz — also keeps wave countdown / respawn ticking
        // smoothly on screen between server updates
        if (Math.floor(performance.now() / 166) !== Math.floor((performance.now() - (dt * 1000)) / 166)) {
            renderHUD();
        }
    },

    stop(ctx) {
        if (attackHandler) window.removeEventListener("click", attackHandler);
        if (unloadHandler) window.removeEventListener("beforeunload", unloadHandler);
        attackHandler = null; unloadHandler = null;
        if (ogreEntityId != null) ctx.despawnEntity?.(ogreEntityId);
        ogreEntityId = null;
        activeBombs = [];
        hideDeathOverlay();
        if (streamer) { streamer.stop(); streamer = null; }
        streaming = false;
        if (client) { client.close(); client = null; }
        if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null; panel = null; ctxRef = null;
        console.log("[multiplayer_ogre] stopped");
    },
};
