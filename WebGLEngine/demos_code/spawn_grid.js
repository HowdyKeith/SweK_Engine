// demos_code/spawn_grid.js — CA-driven enemy spawn zones.
//
// AI translation #4 from the bio/evo demo collection. The math from
// ComputeCellularAutomata.cls becomes a SPAWN MAP — a Conway-style
// 2D cellular automaton runs continuously on a world grid, where
// each live cell is an "active spawn zone". The player's presence
// kills nearby cells (chunks where you've recently fought go quiet);
// empty regions grow back into spawn zones via the CA rule.
//
// Result: enemies don't appear uniformly — they appear in patches
// that drift across the map. After fighting in one area, that area
// goes dead; you can't fully clear the world, only push activity
// elsewhere. The world has a "pulse" independent of player intent.
//
// Architecture:
//   * 48×48 grid covering 240u world span (5u per cell)
//   * Day & Night CA rule (B3678/S34678) for stable drifting patterns
//   * Player presence within 12u kills the local 5×5 patch each tick
//   * 4Hz CA update rate (visible enough to track, slow enough to
//     not feel chaotic)
//   * When alive cells exceed budget, oldest cells spawn enemies
//
// Compare with VBA: ComputeCellularAutomata.cls runs on a 256×256
// abstract grid with no game coupling. This translation reuses the
// same totalistic B/S rule logic but applies it to spatial
// enemy-spawn decisions.

const GRID_SIZE = 48;
const WORLD_SPAN = 240;
const CELL_SIZE = WORLD_SPAN / GRID_SIZE;   // 5u per cell
const STEP_RATE = 4;                         // CA steps per second
const PLAYER_KILL_RADIUS = 12;               // world units of suppression
const MAX_ENEMIES = 8;
const ENEMY_LIFETIME = 25;                   // sec before despawn
const ATTACK_RANGE = 4.5;

// Day & Night CA — symmetric in alive/dead, produces stable patterns
// that drift slowly. Better for "spawn zone" feel than Conway's Life
// which has too many extinct regions.
const BIRTH_SET    = new Set([3, 6, 7, 8]);
const SURVIVAL_SET = new Set([3, 4, 6, 7, 8]);

const VIZ_PX = 200;

let grid     = null;
let gridNext = null;
let cellAge  = null;     // ticks each cell has been alive
let enemies  = [];       // [{id, x, y, z, lifetime}]
let stepAcc  = 0;
let totalSpawned = 0;
let totalKilledByPresence = 0;
let elapsed = 0;
let overlay = null;
let vizCanvas = null;
let vizCtx = null;

function worldToGrid(x, z) {
    return [
        ((x + WORLD_SPAN / 2) / CELL_SIZE) | 0,
        ((z + WORLD_SPAN / 2) / CELL_SIZE) | 0,
    ];
}
function gridToWorld(gx, gz) {
    return [
        (gx + 0.5) * CELL_SIZE - WORLD_SPAN / 2,
        (gz + 0.5) * CELL_SIZE - WORLD_SPAN / 2,
    ];
}
function inBounds(gx, gz) {
    return gx >= 0 && gx < GRID_SIZE && gz >= 0 && gz < GRID_SIZE;
}

function caStep() {
    for (let z = 0; z < GRID_SIZE; z++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const i = z * GRID_SIZE + x;
            let n = 0;
            for (let dz = -1; dz <= 1; dz++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dz === 0) continue;
                    const nx = (x + dx + GRID_SIZE) % GRID_SIZE;
                    const nz = (z + dz + GRID_SIZE) % GRID_SIZE;
                    if (grid[nz * GRID_SIZE + nx]) n++;
                }
            }
            const alive = grid[i] === 1;
            const next = alive ? SURVIVAL_SET.has(n) : BIRTH_SET.has(n);
            gridNext[i] = next ? 1 : 0;
            // Update age
            if (next) {
                cellAge[i] = alive ? cellAge[i] + 1 : 0;
            } else {
                cellAge[i] = 0;
            }
        }
    }
    const tmp = grid; grid = gridNext; gridNext = tmp;
}

function killPlayerArea(player) {
    const r = Math.ceil(PLAYER_KILL_RADIUS / CELL_SIZE);
    const [pgx, pgz] = worldToGrid(player.x, player.z);
    let killed = 0;
    for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
            const gx = pgx + dx, gz = pgz + dz;
            if (!inBounds(gx, gz)) continue;
            const wd = Math.hypot(dx * CELL_SIZE, dz * CELL_SIZE);
            if (wd > PLAYER_KILL_RADIUS) continue;
            const i = gz * GRID_SIZE + gx;
            if (grid[i]) {
                grid[i] = 0;
                cellAge[i] = 0;
                killed++;
            }
        }
    }
    totalKilledByPresence += killed;
}

function findSpawnCell(player) {
    // Pick a random alive cell that's NOT within visible range of
    // the player (don't pop enemies into player's face)
    const candidates = [];
    for (let z = 0; z < GRID_SIZE; z++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const i = z * GRID_SIZE + x;
            if (!grid[i] || cellAge[i] < 2) continue;
            const [wx, wz] = gridToWorld(x, z);
            const d = Math.hypot(wx - player.x, wz - player.z);
            if (d < PLAYER_KILL_RADIUS + 5) continue;
            if (d > 70) continue;   // off-screen — skip
            candidates.push({ x: wx, z: wz, age: cellAge[i] });
        }
    }
    if (candidates.length === 0) return null;
    // Prefer older cells — settled spawn zones over newborn ones
    candidates.sort((a, b) => b.age - a.age);
    return candidates[Math.floor(Math.random() * Math.min(5, candidates.length))];
}

function spawnEnemy(ctx, cell) {
    const y = (ctx.getSurfaceY?.(cell.x, cell.z) ?? 30) + 2.2;
    const id = ctx.spawnMesh?.("kaiju_hell", cell.x, y, cell.z, 1.5);
    if (id == null) return;
    enemies.push({
        id, x: cell.x, y, z: cell.z,
        lifetime: 0,
        vx: 0, vz: 0,
    });
    totalSpawned++;
}

function renderViz(ctx) {
    if (!vizCtx) return;
    vizCtx.fillStyle = "#04060a";
    vizCtx.fillRect(0, 0, VIZ_PX, VIZ_PX);
    // Render cells
    const cellPx = VIZ_PX / GRID_SIZE;
    for (let z = 0; z < GRID_SIZE; z++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const i = z * GRID_SIZE + x;
            if (!grid[i]) continue;
            const age = cellAge[i];
            // Older = warmer / brighter
            const intensity = Math.min(1, 0.3 + age * 0.05);
            const r = Math.floor(intensity * 255);
            const g = Math.floor(intensity * 120);
            const b = Math.floor(intensity * 60);
            vizCtx.fillStyle = `rgb(${r},${g},${b})`;
            vizCtx.fillRect(x * cellPx, z * cellPx, cellPx + 0.5, cellPx + 0.5);
        }
    }
    // Player marker
    const player = {
        x: ctx.camera?.position?.x ?? 0,
        z: ctx.camera?.position?.z ?? 0,
    };
    const [pgx, pgz] = worldToGrid(player.x, player.z);
    vizCtx.fillStyle = "#ff0";
    vizCtx.beginPath();
    vizCtx.arc(pgx * cellPx + cellPx / 2, pgz * cellPx + cellPx / 2, 4, 0, Math.PI * 2);
    vizCtx.fill();
    // Player kill radius
    vizCtx.strokeStyle = "rgba(255,255,0,0.4)";
    vizCtx.lineWidth = 1;
    vizCtx.beginPath();
    vizCtx.arc(pgx * cellPx + cellPx / 2, pgz * cellPx + cellPx / 2,
               (PLAYER_KILL_RADIUS / CELL_SIZE) * cellPx, 0, Math.PI * 2);
    vizCtx.stroke();
    // Active enemy positions
    vizCtx.fillStyle = "#f48";
    for (const e of enemies) {
        const [egx, egz] = worldToGrid(e.x, e.z);
        vizCtx.beginPath();
        vizCtx.arc(egx * cellPx + cellPx / 2, egz * cellPx + cellPx / 2, 2, 0, Math.PI * 2);
        vizCtx.fill();
    }
}

export default {
    id:    "spawn_grid",
    label: "SPAWN ZONES (CA → ENEMY SPAWNING)",
    hint:  "Conway-style CA decides where enemies emerge — Day & Night ruleset",
    controls: [
        `${GRID_SIZE}×${GRID_SIZE} grid drives spawning; player presence kills nearby cells`,
        "Watch active patches drift while you fight. Quiet regions reignite.",
        "Compare with VBAOpenGL_Demos_v2_67.xlsm → ComputeCellularAutomata",
    ],

    start(ctx) {
        grid     = new Uint8Array(GRID_SIZE * GRID_SIZE);
        gridNext = new Uint8Array(GRID_SIZE * GRID_SIZE);
        cellAge  = new Int16Array(GRID_SIZE * GRID_SIZE);
        // Random initial state at ~50% density — Day & Night rule
        // works well with high density
        for (let i = 0; i < grid.length; i++) grid[i] = Math.random() < 0.45 ? 1 : 0;
        enemies = [];
        stepAcc = 0;
        totalSpawned = 0;
        totalKilledByPresence = 0;
        elapsed = 0;

        overlay = document.createElement("div");
        overlay.style.cssText = [
            "position:fixed",
            "right:20px",
            "top:140px",
            "padding:10px",
            "background:rgba(8,4,16,0.88)",
            "border:1px solid #842",
            "border-radius:4px",
            "box-shadow:0 0 16px rgba(255,120,40,0.25)",
            "z-index:1000",
            "pointer-events:none",
        ].join(";");
        const title = document.createElement("div");
        title.style.cssText = "color:#fb6;font:11px monospace;letter-spacing:1px;margin-bottom:4px";
        title.textContent = "🌐 SPAWN ZONES";
        overlay.appendChild(title);
        vizCanvas = document.createElement("canvas");
        vizCanvas.width = VIZ_PX;
        vizCanvas.height = VIZ_PX;
        vizCanvas.style.cssText = "display:block;border:1px solid #422;background:#000";
        overlay.appendChild(vizCanvas);
        const lbl = document.createElement("div");
        lbl.style.cssText = "color:#fb8;font:10px monospace;margin-top:4px;line-height:1.4";
        lbl.id = "spawn_grid_status";
        lbl.textContent = "live cells · spawned · suppressed";
        overlay.appendChild(lbl);
        document.body.appendChild(overlay);
        vizCtx = vizCanvas.getContext("2d");

        ctx.kpop?.info?.("Spawn Zones", "CA-driven enemy spawning active");
        console.log("[spawn_grid] started");
    },

    tick(ctx, dt) {
        if (!grid) return;
        if (dt > 0.1) dt = 0.1;
        elapsed += dt;

        const player = {
            x: ctx.camera?.position?.x ?? 0,
            y: ctx.camera?.position?.y ?? 35,
            z: ctx.camera?.position?.z ?? 0,
        };

        // CA steps at fixed rate
        stepAcc += dt;
        const stepInterval = 1.0 / STEP_RATE;
        while (stepAcc >= stepInterval) {
            stepAcc -= stepInterval;
            killPlayerArea(player);
            caStep();
        }

        // Count alive cells for HUD
        let alive = 0;
        for (let i = 0; i < grid.length; i++) if (grid[i]) alive++;

        // Spawn maintenance — keep population near MAX_ENEMIES
        if (enemies.length < MAX_ENEMIES && Math.random() < 0.04) {
            const cell = findSpawnCell(player);
            if (cell) spawnEnemy(ctx, cell);
        }

        // Update + age enemies
        const survivors = [];
        for (const e of enemies) {
            e.lifetime += dt;
            // Simple seek-player movement
            const dx = player.x - e.x, dz = player.z - e.z;
            const d = Math.hypot(dx, dz);
            if (d > 0.5) {
                const sp = 4.5;
                e.vx = (e.vx * 0.85) + (dx / d) * sp * 0.15;
                e.vz = (e.vz * 0.85) + (dz / d) * sp * 0.15;
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
            // Despawn on lifetime OR very close hit
            if (e.lifetime > ENEMY_LIFETIME || d < ATTACK_RANGE) {
                ctx.despawnEntity?.(e.id);
                if (d < ATTACK_RANGE) ctx.kpop?.info?.("⚠ Tag!", `Spawn zone enemy reached you`);
            } else {
                survivors.push(e);
            }
        }
        enemies = survivors;

        renderViz(ctx);
        const lbl = document.getElementById("spawn_grid_status");
        if (lbl) lbl.textContent = `alive ${alive} · spawned ${totalSpawned} · suppressed ${totalKilledByPresence}`;
    },

    stop(ctx) {
        for (const e of enemies) ctx.despawnEntity?.(e.id);
        enemies = [];
        grid = gridNext = cellAge = null;
        if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null; vizCanvas = null; vizCtx = null;
        console.log("[spawn_grid] stopped");
    },
};
