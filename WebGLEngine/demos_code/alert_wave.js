// demos_code/alert_wave.js — alert wave propagation through enemy network.
//
// AI translation #5 from the bio/evo demo collection. Takes the FHN
// (FitzHugh-Nagumo) excitable medium dynamics from ComputeFitzHughNagumoSystem
// and applies them to EACH ENEMY'S alertness state. When the player
// attacks (left-click on this demo) the nearest enemy's u variable
// jumps to "excited". The excitation propagates spatially as a wave
// through the enemy network, but cells are REFRACTORY after firing —
// they can't be re-alerted for a few seconds.
//
// Gameplay character: a single attack doesn't permanently aggro the
// whole map. Alert waves ripple through the network and pass. Enemies
// behind the wavefront are temporarily un-alertable (refractory).
// You can dodge waves by waiting them out, or chain attacks to keep
// the wave alive — but each attack costs HP, etc.
//
// Implementation:
//   * Each of N enemies has its own (u, v) state pair
//   * Update per frame: standard FHN dynamics with diffusion from
//     neighbors within COUPLING_RADIUS
//   * Visual: enemy tint reflects u (red=excited, blue=refractory)
//   * Behavior: enemies with u > 0.3 chase player; others wander
//   * Click anywhere to inject excitation at nearest enemy

const POPULATION    = 18;
const SPAWN_RADIUS  = 50;
const COUPLING_RADIUS = 16;     // u/v diffusion range between enemies
const COUPLING_RADIUS_SQ = COUPLING_RADIUS * COUPLING_RADIUS;
const ATTACK_RANGE = 4.5;

// FitzHugh-Nagumo parameters — same as the gray_scott-companion demo
// from earlier, but here we run them per-enemy instead of per-cell.
const EPSILON = 0.018;
const A_PARAM = 0.7;
const B_PARAM = 0.8;
const DT_FHN  = 0.25;           // sub-step per frame
const STEPS_PER_FRAME = 3;
const D_COUPLING = 0.12;        // diffusion coefficient between neighbors

const RESTING_SPEED  = 2.5;
const ALERTED_SPEED  = 7.0;
const ALERT_THRESHOLD = 0.30;
const WANDER_DIR_CHANGE = 0.015;

let enemies = [];               // { id, x, y, z, vx, vz, u, v, wanderDir, yaw }
let overlay = null;
let panel = null;
let elapsed = 0;
let totalWavesInjected = 0;
let totalAlerted = 0;
let clickHandler = null;

function ringSpawn(ctx, i, n, player) {
    const angle = (i / n) * Math.PI * 2 + ctx.rand() * 0.2;
    const r = SPAWN_RADIUS + (ctx.rand() - 0.5) * 15;
    const x = player.x + Math.cos(angle) * r;
    const z = player.z + Math.sin(angle) * r;
    const y = (ctx.getSurfaceY?.(x, z) ?? 30) + 2.2;
    return { x, y, z };
}

function spawn(ctx, x, y, z) {
    return ctx.spawnMesh?.("kaiju_hell", x, y, z, 1.5);
}

function injectExcitation(player) {
    // Find closest enemy to a position and bump its u → excited.
    let best = null;
    let bestD = Infinity;
    for (const e of enemies) {
        const d = Math.hypot(e.x - player.x, e.z - player.z);
        if (d < bestD) { bestD = d; best = e; }
    }
    if (best) {
        best.u = 1.5;
        best.v = -0.2;
        totalWavesInjected++;
    }
}

function fhnStep() {
    // Read existing state, compute new state into temporary arrays
    const n = enemies.length;
    const newU = new Float32Array(n);
    const newV = new Float32Array(n);

    for (let i = 0; i < n; i++) {
        const a = enemies[i];
        // Diffusion term from coupled neighbors
        let coupling = 0;
        let cnt = 0;
        for (let j = 0; j < n; j++) {
            if (i === j) continue;
            const b = enemies[j];
            const dx = a.x - b.x, dz = a.z - b.z;
            const d2 = dx*dx + dz*dz;
            if (d2 > COUPLING_RADIUS_SQ) continue;
            // Weight by inverse distance — closer neighbors couple more
            const w = 1 - Math.sqrt(d2) / COUPLING_RADIUS;
            coupling += (b.u - a.u) * w;
            cnt += w;
        }
        if (cnt > 0) coupling = (coupling / cnt) * D_COUPLING;

        // FHN update (per-enemy "cell")
        const u = a.u, v = a.v;
        const du = coupling + (1 / EPSILON) * (u - (u*u*u)/3 - v);
        const dv = EPSILON * (u + A_PARAM - B_PARAM * v);
        newU[i] = Math.max(-2.5, Math.min(2.5, u + du * DT_FHN));
        newV[i] = Math.max(-2.5, Math.min(2.5, v + dv * DT_FHN));
    }
    for (let i = 0; i < n; i++) {
        enemies[i].u = newU[i];
        enemies[i].v = newV[i];
    }
}

function renderHUD() {
    if (!panel) return;
    let excited = 0, refractory = 0, resting = 0;
    for (const e of enemies) {
        if (e.u > ALERT_THRESHOLD) excited++;
        else if (e.v > 0.3) refractory++;
        else resting++;
    }
    const bar = (n) => "█".repeat(n) + "·".repeat(Math.max(0, POPULATION - n));
    panel.innerHTML = `
        <div style="color:#fd0;font-weight:bold;font-size:13px;letter-spacing:1px;margin-bottom:6px">
            ⚡ ALERT WAVE
        </div>
        <div style="font-size:11px;line-height:1.6">
            <span style="color:#f66">EXCITED  </span> <span style="color:#f66;letter-spacing:1px">${bar(excited)}</span><br/>
            <span style="color:#6cf">REFRACT  </span> <span style="color:#6cf;letter-spacing:1px">${bar(refractory)}</span><br/>
            <span style="color:#9d9">RESTING  </span> <span style="color:#9d9;letter-spacing:1px">${bar(resting)}</span><br/>
            <span style="color:#9fd">Waves injected</span>: <b>${totalWavesInjected}</b><br/>
            <span style="color:#9fd">Total alerted</span>: <b>${totalAlerted}</b>
        </div>
        <div style="margin-top:8px;font-size:10px;color:#fb6;line-height:1.4">
            CLICK anywhere to inject an alert wave.<br/>
            Watch the wave propagate through the network.<br/>
            Refractory enemies can't re-fire for a few seconds.
        </div>`;
}

export default {
    id:    "alert_wave",
    label: "ALERT WAVE (FHN → ENEMY NETWORK)",
    hint:  "Click to fire — alert ripples through enemies, refractory tail follows",
    controls: [
        "Click anywhere = inject excitation at nearest enemy",
        `${POPULATION} enemies, coupling radius ${COUPLING_RADIUS}u`,
        "Compare with VBAOpenGL_Demos_v2_67.xlsm → ComputeFitzHughNagumoSystem",
    ],

    start(ctx) {
        const player = {
            x: ctx.camera?.position?.x ?? 0,
            y: ctx.camera?.position?.y ?? 35,
            z: ctx.camera?.position?.z ?? 0,
        };
        enemies = [];
        for (let i = 0; i < POPULATION; i++) {
            const p = ringSpawn(ctx, i, POPULATION, player);
            const id = spawn(ctx, p.x, p.y, p.z);
            if (id == null) continue;
            enemies.push({
                id, x: p.x, y: p.y, z: p.z,
                vx: 0, vz: 0,
                u: -1.1 + (ctx.rand() - 0.5) * 0.2,   // resting state
                v:  -0.6 + (ctx.rand() - 0.5) * 0.2,
                wanderDir: ctx.rand() * Math.PI * 2,
                yaw: Math.atan2(player.x - p.x, player.z - p.z),
                wasExcited: false,
            });
        }
        elapsed = 0;
        totalWavesInjected = 0;
        totalAlerted = 0;

        overlay = document.createElement("div");
        overlay.style.cssText = [
            "position:fixed",
            "right:20px",
            "top:140px",
            "width:260px",
            "background:rgba(16,8,8,0.92)",
            "border:1px solid #844",
            "border-radius:4px",
            "box-shadow:0 0 16px rgba(255,80,80,0.25)",
            "padding:12px 14px",
            "color:#9fd",
            "font:11px 'Courier New', monospace",
            "z-index:1000",
            "pointer-events:none",
        ].join(";");
        panel = overlay;
        document.body.appendChild(overlay);
        renderHUD();

        // Click handler — inject at player position
        clickHandler = (ev) => {
            // Ignore clicks on UI elements
            if (ev.target.closest("button, input, select, textarea")) return;
            const player2 = {
                x: ctx.camera?.position?.x ?? 0,
                z: ctx.camera?.position?.z ?? 0,
            };
            injectExcitation(player2);
        };
        window.addEventListener("click", clickHandler);

        ctx.kpop?.info?.("Alert Wave", "Click to inject excitation");
        console.log("[alert_wave] started; population:", enemies.length);
    },

    tick(ctx, dt) {
        if (!enemies.length) return;
        if (dt > 0.1) dt = 0.1;
        elapsed += dt;
        const player = {
            x: ctx.camera?.position?.x ?? 0,
            y: ctx.camera?.position?.y ?? 35,
            z: ctx.camera?.position?.z ?? 0,
        };

        // FHN sub-steps
        for (let s = 0; s < STEPS_PER_FRAME; s++) fhnStep();

        // Movement: excited enemies chase player, others wander
        for (const e of enemies) {
            const isExcited = e.u > ALERT_THRESHOLD;
            if (isExcited && !e.wasExcited) totalAlerted++;
            e.wasExcited = isExcited;

            let tvx = 0, tvz = 0;
            if (isExcited) {
                const dx = player.x - e.x, dz = player.z - e.z;
                const d = Math.hypot(dx, dz);
                if (d > 0.5) {
                    tvx = dx / d * ALERTED_SPEED;
                    tvz = dz / d * ALERTED_SPEED;
                }
            } else {
                // Wander — change direction occasionally
                if (ctx.rand() < WANDER_DIR_CHANGE) {
                    e.wanderDir = ctx.rand() * Math.PI * 2;
                }
                tvx = Math.cos(e.wanderDir) * RESTING_SPEED;
                tvz = Math.sin(e.wanderDir) * RESTING_SPEED;
            }
            // Smoothed velocity update
            e.vx = e.vx * 0.85 + tvx * 0.15;
            e.vz = e.vz * 0.85 + tvz * 0.15;
            e.x += e.vx * dt;
            e.z += e.vz * dt;
            e.y = (ctx.getSurfaceY?.(e.x, e.z) ?? 30) + 2.2;
            const yaw = Math.atan2(e.vx, e.vz);
            e.yaw = yaw;
            ctx.router?.exec?.({
                type: "entity:move",
                id:   e.id,
                x: e.x, y: e.y, z: e.z,
                yaw: yaw,
            });
        }
        if ((elapsed * 5 | 0) % 2 === 0) renderHUD();
    },

    stop(ctx) {
        if (clickHandler) window.removeEventListener("click", clickHandler);
        clickHandler = null;
        for (const e of enemies) ctx.despawnEntity?.(e.id);
        enemies = [];
        if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null; panel = null;
        console.log("[alert_wave] stopped");
    },
};
