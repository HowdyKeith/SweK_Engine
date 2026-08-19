// demos_code/ecosystem_enemies.js — Lotka-Volterra cyclic enemy ecology.
//
// AI translation #6 from the bio/evo demo collection. Takes the
// May-Leonard / Lotka-Volterra cyclic dominance dynamics from
// ComputeRockPaperScissorsSystem and ComputeSpatialLotkaVolterra and
// turns them into a three-species enemy population with their own
// independent dynamics. The world has its own pulse — populations
// rise and fall whether or not the player participates.
//
// Three enemy types in cyclic dominance:
//
//   ROCK (red)      eats SCISSORS, loses to PAPER
//   PAPER (green)   eats ROCK,     loses to SCISSORS
//   SCISSORS (blue) eats PAPER,    loses to ROCK
//
// In the abstract simulation this produces rotating spiral domains.
// In gameplay terms:
//   * When ROCK is abundant, it eats SCISSORS → PAPER booms (no
//     predator) → PAPER eats ROCK back down → SCISSORS rebounds
//   * Player kills shift the balance. Kill many ROCK → PAPER
//     temporarily dominates, then SCISSORS recovers
//   * No single species can "win" globally; the balance perpetually
//     rotates
//
// Strategic angle: the player chooses which type to thin, which has
// downstream effects on the other two. Killing the wrong type can
// MAKE the world more hostile.
//
// Reference: ComputeRockPaperScissorsSystem.cls (May-Leonard model)

const POPULATION_TARGET = 18;          // total enemies the ecosystem maintains
const RESPAWN_RING      = 55;
const SPAWN_RATE        = 0.10;        // chance per frame to spawn if under target

// Population dynamics — rates of cyclic predation. Tuned so populations
// oscillate visibly over ~30-60 seconds without going extinct.
const ALPHA = 0.45;          // predator-eats-prey rate
const BETA  = 0.35;          // growth from prey
const NATURAL_DEATH = 0.02;  // baseline death (prevents runaway dominance)
const DT_POP = 0.6;          // sub-step per second

// Bond between species index and entity kind/color
const SPECIES = [
    { name: "ROCK",     kind: "kaiju_hell",  color: "#f55", index: 0 },  // red
    { name: "PAPER",    kind: "kaiju_grass", color: "#5d5", index: 1 },  // green
    { name: "SCISSORS", kind: "kaiju_tech",  color: "#5af", index: 2 },  // blue
];

// Continuous population values (real numbers, not integer counts).
// Discrete spawning catches up to these targets each frame.
let populations = [1, 1, 1];          // [r, p, s] running totals
let spawned = [[], [], []];           // arrays of {id, x, y, z, species}
let elapsed = 0;
let killsByType = [0, 0, 0];
let totalKills = 0;
let pendingDt = 0;
let overlay = null;
let panel = null;
let dynamicsCanvas = null;
let dynamicsCtx = null;
let historyR = [], historyP = [], historyS = [];   // population history for graph

function updatePopulationDynamics(dt) {
    // Cyclic Lotka-Volterra (May-Leonard simplified):
    //   dr/dt = r*(β*s - α*p)    (rock gains from scissors, loses to paper)
    //   dp/dt = p*(β*r - α*s)    (paper gains from rock,    loses to scissors)
    //   ds/dt = s*(β*p - α*r)    (scissors gains from paper, loses to rock)
    // Plus a baseline natural death so any one species can't go infinite.
    pendingDt += dt;
    while (pendingDt > 0) {
        const step = Math.min(0.05, pendingDt);
        pendingDt -= step;
        const r = populations[0], p = populations[1], s = populations[2];
        const dr = (r * (BETA * s - ALPHA * p) - NATURAL_DEATH * r) * DT_POP * step;
        const dp = (p * (BETA * r - ALPHA * s) - NATURAL_DEATH * p) * DT_POP * step;
        const ds = (s * (BETA * p - ALPHA * r) - NATURAL_DEATH * s) * DT_POP * step;
        populations[0] = Math.max(0.1, r + dr);
        populations[1] = Math.max(0.1, p + dp);
        populations[2] = Math.max(0.1, s + ds);
    }
}

function totalDesired() {
    const sum = populations[0] + populations[1] + populations[2];
    return sum > 0 ? sum : 0.001;
}

function targetCount(species) {
    return Math.round(POPULATION_TARGET * populations[species] / totalDesired());
}

function spawnEnemy(ctx, species, player) {
    const sp = SPECIES[species];
    const angle = ctx.rand() * Math.PI * 2;
    const r = RESPAWN_RING + (ctx.rand() - 0.5) * 12;
    const x = player.x + Math.cos(angle) * r;
    const z = player.z + Math.sin(angle) * r;
    const y = (ctx.getSurfaceY?.(x, z) ?? 30) + 2.2;
    const id = ctx.spawnMesh?.(sp.kind, x, y, z, 1.5);
    if (id != null) {
        spawned[species].push({ id, x, y, z, vx: 0, vz: 0, species });
    }
}

function pickAndKillEnemyOfType(ctx, species) {
    if (spawned[species].length === 0) return false;
    // Kill the one closest to player (representing combat with the
    // most threatening individual)
    const cam = { x: ctx.camera?.position?.x ?? 0, z: ctx.camera?.position?.z ?? 0 };
    let bestIdx = 0;
    let bestD = Infinity;
    for (let i = 0; i < spawned[species].length; i++) {
        const e = spawned[species][i];
        const d = Math.hypot(e.x - cam.x, e.z - cam.z);
        if (d < bestD) { bestD = d; bestIdx = i; }
    }
    const victim = spawned[species].splice(bestIdx, 1)[0];
    if (victim) {
        ctx.despawnEntity?.(victim.id);
        killsByType[species]++;
        totalKills++;
        // Reduce the species' population in the dynamics
        populations[species] = Math.max(0.1, populations[species] * 0.85);
        return true;
    }
    return false;
}

function renderDynamics() {
    if (!dynamicsCtx) return;
    const W = dynamicsCanvas.width, H = dynamicsCanvas.height;
    dynamicsCtx.fillStyle = "#020208";
    dynamicsCtx.fillRect(0, 0, W, H);
    // Find max for normalization
    let mx = 0;
    for (const v of [historyR, historyP, historyS]) for (const x of v) if (x > mx) mx = x;
    if (mx < 0.01) mx = 1;
    // Draw three lines
    const lines = [
        { hist: historyR, color: "#f55" },
        { hist: historyP, color: "#5d5" },
        { hist: historyS, color: "#5af" },
    ];
    for (const l of lines) {
        dynamicsCtx.strokeStyle = l.color;
        dynamicsCtx.lineWidth = 2;
        dynamicsCtx.beginPath();
        const N = l.hist.length;
        for (let i = 0; i < N; i++) {
            const x = (i / Math.max(1, N - 1)) * W;
            const y = H - (l.hist[i] / mx) * (H - 4) - 2;
            if (i === 0) dynamicsCtx.moveTo(x, y);
            else dynamicsCtx.lineTo(x, y);
        }
        dynamicsCtx.stroke();
    }
}

function renderHUD(ctx) {
    if (!panel) return;
    const counts = spawned.map(s => s.length);
    const targets = [targetCount(0), targetCount(1), targetCount(2)];
    const bar = (n) => "█".repeat(n) + "·".repeat(Math.max(0, 12 - n));
    panel.innerHTML = `
        <div style="color:#fd0;font-weight:bold;font-size:13px;letter-spacing:1px;margin-bottom:6px">
            🦁 ECOSYSTEM
        </div>
        <div style="font-size:11px;line-height:1.7">
            <span style="color:#f55">ROCK     </span> <span style="color:#f55;letter-spacing:1px">${bar(counts[0])}</span> ${counts[0]}/${targets[0]} (${killsByType[0]} killed)<br/>
            <span style="color:#5d5">PAPER    </span> <span style="color:#5d5;letter-spacing:1px">${bar(counts[1])}</span> ${counts[1]}/${targets[1]} (${killsByType[1]} killed)<br/>
            <span style="color:#5af">SCISSORS </span> <span style="color:#5af;letter-spacing:1px">${bar(counts[2])}</span> ${counts[2]}/${targets[2]} (${killsByType[2]} killed)<br/>
        </div>
        <canvas id="ecosystem_dyn" width="240" height="64"
                style="display:block;margin-top:8px;border:1px solid #422;background:#000;border-radius:2px"></canvas>
        <div style="margin-top:4px;font-size:9px;color:#888;text-align:center">
            ROCK beats SCISSORS · PAPER beats ROCK · SCISSORS beats PAPER
        </div>
        <div style="margin-top:6px;font-size:10px;color:#aaa;line-height:1.3">
            ${totalKills} kills · dynamics oscillate naturally
        </div>`;
    // Reattach canvas ref
    dynamicsCanvas = document.getElementById("ecosystem_dyn");
    if (dynamicsCanvas) dynamicsCtx = dynamicsCanvas.getContext("2d");
    renderDynamics();
}

export default {
    id:    "ecosystem_enemies",
    label: "ECOSYSTEM (LOTKA-VOLTERRA → ENEMY POPS)",
    hint:  "3-species cyclic dominance — kills shift the balance",
    controls: [
        "Three enemy types: ROCK (red), PAPER (green), SCISSORS (blue)",
        "Approach + tag an enemy to kill it; watch population dynamics shift",
        "Compare with VBAOpenGL_Demos_v2_67.xlsm → ComputeRockPaperScissorsSystem",
    ],

    start(ctx) {
        populations = [1.0, 1.0, 1.0];
        spawned = [[], [], []];
        killsByType = [0, 0, 0];
        totalKills = 0;
        elapsed = 0;
        pendingDt = 0;
        historyR = []; historyP = []; historyS = [];

        const player = {
            x: ctx.camera?.position?.x ?? 0,
            z: ctx.camera?.position?.z ?? 0,
        };
        // Initial spawn — 6 of each species
        for (let species = 0; species < 3; species++) {
            for (let i = 0; i < 6; i++) spawnEnemy(ctx, species, player);
        }

        overlay = document.createElement("div");
        overlay.style.cssText = [
            "position:fixed",
            "right:20px",
            "top:140px",
            "width:280px",
            "background:rgba(8,16,8,0.92)",
            "border:1px solid #484",
            "border-radius:4px",
            "box-shadow:0 0 16px rgba(80,200,80,0.18)",
            "padding:12px 14px",
            "color:#9fd",
            "font:11px 'Courier New', monospace",
            "z-index:1000",
            "pointer-events:none",
        ].join(";");
        panel = overlay;
        document.body.appendChild(overlay);

        ctx.kpop?.info?.("Ecosystem", "3 species cyclic dominance — get close to kill");
        console.log("[ecosystem_enemies] started");
    },

    tick(ctx, dt) {
        if (dt > 0.1) dt = 0.1;
        elapsed += dt;
        const player = {
            x: ctx.camera?.position?.x ?? 0,
            y: ctx.camera?.position?.y ?? 35,
            z: ctx.camera?.position?.z ?? 0,
        };

        // Update population dynamics
        updatePopulationDynamics(dt);

        // Sample population history every 0.5 sec
        if ((elapsed * 2 | 0) > historyR.length) {
            historyR.push(populations[0]);
            historyP.push(populations[1]);
            historyS.push(populations[2]);
            const MAX_HIST = 60;
            if (historyR.length > MAX_HIST) { historyR.shift(); historyP.shift(); historyS.shift(); }
        }

        // Spawn maintenance — each species spawns toward its target
        for (let species = 0; species < 3; species++) {
            if (spawned[species].length < targetCount(species) && ctx.rand() < SPAWN_RATE) {
                spawnEnemy(ctx, species, player);
            }
        }

        // Update each enemy: drift toward player, get killed if too close
        for (let species = 0; species < 3; species++) {
            const survivors = [];
            for (const e of spawned[species]) {
                const dx = player.x - e.x, dz = player.z - e.z;
                const d = Math.hypot(dx, dz);
                if (d < 4.5) {
                    // Player tagged enemy — kill it
                    ctx.despawnEntity?.(e.id);
                    killsByType[species]++;
                    totalKills++;
                    populations[species] = Math.max(0.1, populations[species] * 0.85);
                    continue;
                }
                // Drift slowly toward player; not aggressive — the
                // dynamics are the point, not combat
                if (d > 0.5) {
                    const sp = 3.0;
                    e.vx = e.vx * 0.92 + (dx / d) * sp * 0.08;
                    e.vz = e.vz * 0.92 + (dz / d) * sp * 0.08;
                }
                e.x += e.vx * dt;
                e.z += e.vz * dt;
                e.y = (ctx.getSurfaceY?.(e.x, e.z) ?? 30) + 2.2;
                ctx.router?.exec?.({
                    type: "entity:move",
                    id:   e.id,
                    x: e.x, y: e.y, z: e.z,
                    yaw: Math.atan2(dx, dz),
                });
                survivors.push(e);
            }
            spawned[species] = survivors;
        }

        // Cull excess enemies (population dynamics dropped target below
        // alive count — represents species die-off)
        for (let species = 0; species < 3; species++) {
            const excess = spawned[species].length - targetCount(species);
            if (excess > 0 && ctx.rand() < 0.02) {
                // Cull the one furthest from player (representing
                // natural death off-screen)
                let furthest = 0;
                let furthestD = 0;
                for (let i = 0; i < spawned[species].length; i++) {
                    const e = spawned[species][i];
                    const d = Math.hypot(e.x - player.x, e.z - player.z);
                    if (d > furthestD) { furthestD = d; furthest = i; }
                }
                const victim = spawned[species].splice(furthest, 1)[0];
                if (victim) ctx.despawnEntity?.(victim.id);
            }
        }

        if ((elapsed * 4 | 0) % 2 === 0) renderHUD(ctx);
    },

    stop(ctx) {
        for (let species = 0; species < 3; species++) {
            for (const e of spawned[species]) ctx.despawnEntity?.(e.id);
        }
        spawned = [[], [], []];
        if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null; panel = null; dynamicsCanvas = null; dynamicsCtx = null;
        console.log("[ecosystem_enemies] stopped");
    },
};
