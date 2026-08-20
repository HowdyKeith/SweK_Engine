// demos_code/compound_ai.js — every AI translation, composed.
//
// The grand integration demo. Stacks all five enemy-AI translations
// from the bio/evo demo collection into a single coherent ecosystem:
//
//   ECOSYSTEM (Lotka-Volterra cyclic dominance)
//     3 species in cyclic predator-prey relationship — ROCK eats
//     SCISSORS, PAPER eats ROCK, SCISSORS eats PAPER. Continuous
//     population variables drive how many of each species spawn.
//
//   SPAWN ZONES (Cellular Automata)
//     Day & Night CA runs on a world grid. New enemies only spawn
//     in currently-alive cells. Player presence kills nearby cells;
//     CA dynamics regrow them elsewhere.
//
//   NEURAL EVOLUTION (8→12→3 brain + fitness selection)
//     Each enemy has its own neural brain. Per-species evolution
//     pools — each species independently selects high-fitness genomes
//     to reproduce, mutating on inheritance. Three parallel evolution
//     processes, one per species.
//
//   PHEROMONE INPUT
//     Brain input #8 is pheromone gradient projected on heading.
//     Evolution can discover "follow scent" behavior independently
//     per species.
//
//   ALERT WAVES (FitzHugh-Nagumo)
//     Each enemy carries (u, v) excitation state. Excited enemies
//     get a speed boost. Excitation diffuses through nearby same-
//     species enemies (in-species coupling, not cross-species).
//     Click anywhere to inject excitation at nearest enemy.
//
//   IN-SPECIES FLOCKING (Reynolds rules)
//     Within each species, enemies apply separation + alignment +
//     cohesion forces. Different species ignore each other for
//     flocking — they're predators/prey, not allies.
//
// Compound observations to watch for:
//   * Spiraling population dynamics (ecosystem) — populations
//     oscillate over ~30s, no species wins
//   * CA-quiet zones where you've been fighting drift across the map
//   * Each species develops its own neural style independently
//     (ROCK might learn direct chase, PAPER might learn flanking)
//   * Click → wave of excited enemies ripples through one species,
//     accelerates that group's chase
//
// VBA references: composed from ComputeRockPaperScissorsSystem,
//   ComputeCellularAutomata, NeuralEnemyBrain, EnemyEvolutionManager,
//   ComputeFitzHughNagumoSystem, ComputeBoidSystem — all from
//   VBAOpenGL_Demos_v2_67.xlsm.

import { NeuralEnemyBrain }      from "../ai/NeuralEnemyBrain.js";
import { PheromoneField }        from "../ai/PheromoneField.js";

// ---- tuning constants -----------------------------------------------
const POP_TARGET            = 18;        // total enemies across 3 species
const SPAWN_CHANCE_PER_FRAME = 0.10;
const RESPAWN_RING          = 50;

// Ecosystem (Lotka-Volterra)
const ECO_ALPHA      = 0.42;
const ECO_BETA       = 0.34;
const ECO_NATURAL_D  = 0.018;
const ECO_DT         = 0.6;

// CA spawn zones
const CA_GRID_SIZE   = 36;
const CA_WORLD_SPAN  = 240;
const CA_CELL_SIZE   = CA_WORLD_SPAN / CA_GRID_SIZE;
const CA_STEP_RATE   = 4;
const CA_KILL_RADIUS = 12;
const CA_BIRTH    = new Set([3, 6, 7, 8]);   // Day & Night
const CA_SURVIVAL = new Set([3, 4, 6, 7, 8]);

// Evolution
const GENERATION_DURATION = 22;
const TOP_K = 3;
const ELITE_KEEP = 2;        // per species (small populations need fewer)
const MUTATION_RATE = 0.7;

// FHN alert
const FHN_EPSILON = 0.018;
const FHN_A       = 0.7;
const FHN_B       = 0.8;
const FHN_DT      = 0.25;
const FHN_STEPS_PER_FRAME = 3;
const FHN_COUPLING_RADIUS = 14;
const FHN_COUPLING_RADIUS_SQ = FHN_COUPLING_RADIUS * FHN_COUPLING_RADIUS;
const FHN_D_COUPLING = 0.10;
const ALERT_THRESHOLD = 0.30;

// Movement
const BASE_SPEED      = 5.0;
const ALERT_SPEED_MUL = 1.7;
const MAX_SPEED       = 11.0;

// Flocking (in-species only)
const FLOCK_VISION = 13;
const FLOCK_VISION_SQ = FLOCK_VISION * FLOCK_VISION;
const FLOCK_SEP_RADIUS = 5.0;
const FLOCK_SEP_RADIUS_SQ = FLOCK_SEP_RADIUS * FLOCK_SEP_RADIUS;
const W_SEP = 1.4;
const W_ALI = 0.6;
const W_COH = 0.5;

// Combat
const ATTACK_RANGE   = 4.5;
const TAG_HOLD_TIME  = 0.9;
const TAG_DAMAGE     = 25;

// Species definitions
const SPECIES = [
    { id: 0, name: "ROCK",     kind: "kaiju_hell",  color: "#f55" },
    { id: 1, name: "PAPER",    kind: "kaiju_grass", color: "#5d5" },
    { id: 2, name: "SCISSORS", kind: "kaiju_tech",  color: "#5af" },
];

// ---- module state ---------------------------------------------------
let nextEnemyId = 1;
let enemies = [];               // CompoundEnemy[]
let populations = [1.0, 1.0, 1.0];
let recentDeathsBySpecies = [[], [], []];    // brain pool per species
let generation = 0;
let elapsedThisGen = 0;
let elapsed = 0;
let caGrid = null;
let caGridNext = null;
let caStepAcc = 0;
let pheromone = null;
let clickHandler = null;
let overlay = null;
let panel = null;
let caCanvas = null;
let caCtx = null;
let scentCanvas = null;
let scentCtx = null;
let frameCounter = 0;

// Stats
let totalTagsByPlayer = 0;
let totalKillsByPlayer = 0;
let totalCaKilled = 0;
let totalWavesInjected = 0;

// ---- CompoundEnemy --------------------------------------------------
class CompoundEnemy {
    constructor({ species, brain, x, z }) {
        this.id = nextEnemyId++;
        this.species = species;
        this.brain = brain;
        this.entityId = null;
        this.x = x;
        this.y = 0;
        this.z = z;
        this.vx = (Math.random() - 0.5) * 3;
        this.vz = (Math.random() - 0.5) * 3;
        this.yaw = 0;
        this.health = 100;
        this.alive = true;
        // FHN
        this.u = -1.1 + (Math.random() - 0.5) * 0.2;
        this.v = -0.6 + (Math.random() - 0.5) * 0.2;
        // Fitness
        this.tagsScored = 0;
        this.timeAlive = 0;
        this.minDistToPlayer = Infinity;
        this.tagHoldTime = 0;
        // Scratch
        this._inputs = new Float32Array(8);
    }

    fitness() {
        const closeBonus = Math.max(0, 20 - this.minDistToPlayer);
        return this.tagsScored * 50 + this.timeAlive * 0.6 + closeBonus * 0.4;
    }
}

// ---- helpers --------------------------------------------------------
function getPlayer(ctx) {
    return {
        x: ctx.camera?.position?.x ?? 0,
        y: ctx.camera?.position?.y ?? 35,
        z: ctx.camera?.position?.z ?? 0,
    };
}

function worldToCAGrid(x, z) {
    return [
        ((x + CA_WORLD_SPAN / 2) / CA_CELL_SIZE) | 0,
        ((z + CA_WORLD_SPAN / 2) / CA_CELL_SIZE) | 0,
    ];
}
function caInBounds(gx, gz) {
    return gx >= 0 && gx < CA_GRID_SIZE && gz >= 0 && gz < CA_GRID_SIZE;
}
function caGridToWorld(gx, gz) {
    return [
        (gx + 0.5) * CA_CELL_SIZE - CA_WORLD_SPAN / 2,
        (gz + 0.5) * CA_CELL_SIZE - CA_WORLD_SPAN / 2,
    ];
}

function caStep() {
    for (let z = 0; z < CA_GRID_SIZE; z++) {
        for (let x = 0; x < CA_GRID_SIZE; x++) {
            const i = z * CA_GRID_SIZE + x;
            let n = 0;
            for (let dz = -1; dz <= 1; dz++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dz === 0) continue;
                    const nx = (x + dx + CA_GRID_SIZE) % CA_GRID_SIZE;
                    const nz = (z + dz + CA_GRID_SIZE) % CA_GRID_SIZE;
                    if (caGrid[nz * CA_GRID_SIZE + nx]) n++;
                }
            }
            const alive = caGrid[i] === 1;
            caGridNext[i] = (alive ? CA_SURVIVAL.has(n) : CA_BIRTH.has(n)) ? 1 : 0;
        }
    }
    const tmp = caGrid; caGrid = caGridNext; caGridNext = tmp;
}

function caKillAround(player) {
    const r = Math.ceil(CA_KILL_RADIUS / CA_CELL_SIZE);
    const [pgx, pgz] = worldToCAGrid(player.x, player.z);
    for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
            const gx = pgx + dx, gz = pgz + dz;
            if (!caInBounds(gx, gz)) continue;
            const wd = Math.hypot(dx * CA_CELL_SIZE, dz * CA_CELL_SIZE);
            if (wd > CA_KILL_RADIUS) continue;
            const i = gz * CA_GRID_SIZE + gx;
            if (caGrid[i]) {
                caGrid[i] = 0;
                totalCaKilled++;
            }
        }
    }
}

// Pick a live CA cell that's not too close to the player.
function findCASpawnPoint(player) {
    const candidates = [];
    for (let z = 0; z < CA_GRID_SIZE; z++) {
        for (let x = 0; x < CA_GRID_SIZE; x++) {
            const i = z * CA_GRID_SIZE + x;
            if (!caGrid[i]) continue;
            const [wx, wz] = caGridToWorld(x, z);
            const d = Math.hypot(wx - player.x, wz - player.z);
            if (d < CA_KILL_RADIUS + 5) continue;
            if (d > 70) continue;
            candidates.push({ x: wx, z: wz });
        }
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
}

function ecosystemTargetCount(species) {
    const total = populations[0] + populations[1] + populations[2];
    if (total < 0.001) return 0;
    return Math.round(POP_TARGET * populations[species] / total);
}

function ecosystemStep(dt) {
    // Cyclic Lotka-Volterra
    let pendDt = dt;
    while (pendDt > 0) {
        const step = Math.min(0.05, pendDt);
        pendDt -= step;
        const r = populations[0], p = populations[1], s = populations[2];
        // R eats S, P eats R, S eats P
        const dr = (r * (ECO_BETA * s - ECO_ALPHA * p) - ECO_NATURAL_D * r) * ECO_DT * step;
        const dp = (p * (ECO_BETA * r - ECO_ALPHA * s) - ECO_NATURAL_D * p) * ECO_DT * step;
        const ds = (s * (ECO_BETA * p - ECO_ALPHA * r) - ECO_NATURAL_D * s) * ECO_DT * step;
        populations[0] = Math.max(0.1, r + dr);
        populations[1] = Math.max(0.1, p + dp);
        populations[2] = Math.max(0.1, s + ds);
    }
}

function spawnEnemy(ctx, species, position) {
    const sp = SPECIES[species];
    const y = (ctx.getSurfaceY?.(position.x, position.z) ?? 30) + 2.2;
    const entityId = ctx.spawnMesh?.(sp.kind, position.x, y, position.z, 1.5);
    if (entityId == null) return null;
    // New brain: try inheriting from a recent strong death of this
    // species, otherwise random
    let brain;
    const pool = recentDeathsBySpecies[species];
    if (pool.length > 0 && Math.random() < 0.7) {
        const parent = pool[0];   // top of sorted-by-fitness pool
        brain = parent.clone();
        brain.generation = generation;
        brain.mutate(MUTATION_RATE);
    } else {
        brain = new NeuralEnemyBrain();
        brain.generation = generation;
    }
    const e = new CompoundEnemy({ species, brain, x: position.x, z: position.z });
    e.y = y;
    e.entityId = entityId;
    enemies.push(e);
    return e;
}

function killEnemy(ctx, enemy, byPlayer) {
    enemy.alive = false;
    ctx.despawnEntity?.(enemy.entityId);
    enemy.entityId = null;
    // Brain goes into species' death pool (sorted by fitness on advanceGeneration)
    const pool = recentDeathsBySpecies[enemy.species];
    pool.push(enemy);
    if (pool.length > 30) pool.shift();
    if (byPlayer) {
        // Shift Lotka-Volterra populations — player kills reduce that species
        populations[enemy.species] = Math.max(0.1, populations[enemy.species] * 0.85);
    }
}

// Per-species evolution pass — sort the species' death pool by
// fitness, keep top brains. Newborn enemies inherit/mutate from
// these. Elite living enemies (top 2 per species) carry over with
// reset fitness counters.
function advanceGeneration() {
    generation++;
    for (let species = 0; species < 3; species++) {
        // Pool of dead brains, sorted by fitness desc
        const deadPool = recentDeathsBySpecies[species].slice();
        deadPool.sort((a, b) => b.fitness() - a.fitness());
        // Also rank current alive enemies of this species
        const aliveOfSpecies = enemies.filter(e => e.alive && e.species === species);
        aliveOfSpecies.sort((a, b) => b.fitness() - a.fitness());
        // Combine + keep top K as the new "breeding pool"
        const combined = [...deadPool, ...aliveOfSpecies];
        combined.sort((a, b) => b.fitness() - a.fitness());
        // Replace recentDeathsBySpecies with just the top K — fresh
        // pool of strong brains for next-gen spawns to inherit from
        recentDeathsBySpecies[species] = combined.slice(0, TOP_K).map(e => {
            const b = e.brain.clone ? e.brain.clone() : e.brain;  // brains in pool may already be clones
            // Ensure fitness() will work — we need a thin shim
            return Object.assign(Object.create(b), {
                clone: () => e.brain.clone(),
                fitness: () => e.fitness(),
            });
        });
        // Elite living enemies — reset their fitness for the new gen
        for (let i = 0; i < Math.min(ELITE_KEEP, aliveOfSpecies.length); i++) {
            const e = aliveOfSpecies[i];
            e.tagsScored = 0;
            e.minDistToPlayer = Infinity;
            e.timeAlive = 0;
            e.health = 100;
        }
    }
}

// ---- core update ---------------------------------------------------
function buildBrainInputs(e, player, sameSpeciesNeighbors) {
    const dx = player.x - e.x, dz = player.z - e.z;
    const dist = Math.hypot(dx, dz);
    e._inputs[0] = Math.max(0, Math.min(1, 1 - dist / 60));
    if (dist > 0.01) {
        e._inputs[1] = dx / Math.max(dist, 1);
        e._inputs[2] = dz / Math.max(dist, 1);
    } else {
        e._inputs[1] = 0; e._inputs[2] = 0;
    }
    e._inputs[3] = Math.min(1, sameSpeciesNeighbors / 6);
    e._inputs[4] = e.health / 100;
    e._inputs[5] = Math.max(-1, Math.min(1, e.vx / MAX_SPEED));
    e._inputs[6] = Math.max(-1, Math.min(1, e.vz / MAX_SPEED));
    // (7) pheromone gradient projected on heading
    const [gx, gz] = pheromone.sampleGradient(e.x, e.z);
    const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
    const projected = fx * gx + fz * gz;
    e._inputs[7] = Math.max(-1, Math.min(1, projected * 40));
}

function applyFlocking(e, sameSpeciesEnemies) {
    let sepX = 0, sepZ = 0, sepN = 0;
    let aliX = 0, aliZ = 0, aliN = 0;
    let cohX = 0, cohZ = 0, cohN = 0;
    for (const b of sameSpeciesEnemies) {
        if (b === e || !b.alive) continue;
        const dx = e.x - b.x, dz = e.z - b.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > FLOCK_VISION_SQ || d2 < 1e-4) continue;
        cohX += b.x; cohZ += b.z; cohN++;
        aliX += b.vx; aliZ += b.vz; aliN++;
        if (d2 < FLOCK_SEP_RADIUS_SQ) {
            const inv = 1 / Math.sqrt(d2);
            sepX += dx * inv;
            sepZ += dz * inv;
            sepN++;
        }
    }
    let fx = 0, fz = 0;
    if (sepN > 0) { fx += (sepX / sepN) * W_SEP; fz += (sepZ / sepN) * W_SEP; }
    if (aliN > 0) {
        const ax = aliX / aliN, az = aliZ / aliN;
        const al = Math.hypot(ax, az);
        if (al > 0) {
            fx += (ax / al) * W_ALI * BASE_SPEED;
            fz += (az / al) * W_ALI * BASE_SPEED;
        }
    }
    if (cohN > 0) {
        const cx = cohX / cohN - e.x;
        const cz = cohZ / cohN - e.z;
        const cl = Math.hypot(cx, cz);
        if (cl > 0) {
            fx += (cx / cl) * W_COH * BASE_SPEED;
            fz += (cz / cl) * W_COH * BASE_SPEED;
        }
    }
    return { fx, fz };
}

function fhnPass() {
    const n = enemies.length;
    const newU = new Float32Array(n);
    const newV = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const a = enemies[i];
        if (!a.alive) { newU[i] = a.u; newV[i] = a.v; continue; }
        // Coupling from same-species neighbors only
        let coupling = 0, cnt = 0;
        for (let j = 0; j < n; j++) {
            if (i === j) continue;
            const b = enemies[j];
            if (!b.alive || b.species !== a.species) continue;
            const dx = a.x - b.x, dz = a.z - b.z;
            const d2 = dx * dx + dz * dz;
            if (d2 > FHN_COUPLING_RADIUS_SQ) continue;
            const w = 1 - Math.sqrt(d2) / FHN_COUPLING_RADIUS;
            coupling += (b.u - a.u) * w;
            cnt += w;
        }
        if (cnt > 0) coupling = (coupling / cnt) * FHN_D_COUPLING;
        const u = a.u, v = a.v;
        const du = coupling + (1 / FHN_EPSILON) * (u - (u * u * u) / 3 - v);
        const dv = FHN_EPSILON * (u + FHN_A - FHN_B * v);
        newU[i] = Math.max(-2.5, Math.min(2.5, u + du * FHN_DT));
        newV[i] = Math.max(-2.5, Math.min(2.5, v + dv * FHN_DT));
    }
    for (let i = 0; i < n; i++) {
        enemies[i].u = newU[i];
        enemies[i].v = newV[i];
    }
}

function injectExcitation(targetX, targetZ) {
    let best = null, bestD = Infinity;
    for (const e of enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - targetX, e.z - targetZ);
        if (d < bestD) { bestD = d; best = e; }
    }
    if (best) {
        best.u = 1.5;
        best.v = -0.2;
        totalWavesInjected++;
    }
}

// ---- HUD ------------------------------------------------------------
function renderHUD(ctx) {
    if (!panel) return;
    const counts = [0, 0, 0];
    for (const e of enemies) if (e.alive) counts[e.species]++;
    let excited = 0, refractory = 0, resting = 0;
    let avgFit = [0, 0, 0], fitCount = [0, 0, 0];
    let peakFit = [0, 0, 0];
    for (const e of enemies) {
        if (!e.alive) continue;
        const f = e.fitness();
        avgFit[e.species] += f;
        fitCount[e.species]++;
        if (f > peakFit[e.species]) peakFit[e.species] = f;
        if (e.u > ALERT_THRESHOLD) excited++;
        else if (e.v > 0.3) refractory++;
        else resting++;
    }
    for (let s = 0; s < 3; s++) {
        if (fitCount[s] > 0) avgFit[s] /= fitCount[s];
    }
    const bar = (n, max) => "█".repeat(Math.min(n, max)) + "·".repeat(Math.max(0, max - n));
    const genProgress = elapsedThisGen / GENERATION_DURATION;
    const genBar = "█".repeat(Math.floor(genProgress * 18)) + "·".repeat(Math.max(0, 18 - Math.floor(genProgress * 18)));

    panel.innerHTML = `
        <div style="color:#fd0;font-weight:bold;font-size:13px;letter-spacing:1px;margin-bottom:6px">
            🌍 COMPOUND AI
        </div>
        <div style="font-size:11px;line-height:1.5;color:#9fd">
            <div style="color:#ddd;margin-bottom:2px">ECOSYSTEM <span style="color:#888">(L-V cyclic)</span></div>
            <span style="color:#f55">R</span> ${bar(counts[0],8)} ${counts[0]}/${ecosystemTargetCount(0)} <span style="color:#888">avg ${avgFit[0].toFixed(0)}</span><br/>
            <span style="color:#5d5">P</span> ${bar(counts[1],8)} ${counts[1]}/${ecosystemTargetCount(1)} <span style="color:#888">avg ${avgFit[1].toFixed(0)}</span><br/>
            <span style="color:#5af">S</span> ${bar(counts[2],8)} ${counts[2]}/${ecosystemTargetCount(2)} <span style="color:#888">avg ${avgFit[2].toFixed(0)}</span>
        </div>
        <div style="font-size:11px;line-height:1.5;color:#9fd;margin-top:8px">
            <div style="color:#ddd;margin-bottom:2px">EVOLUTION <span style="color:#888">(per species)</span></div>
            Gen <b style="color:#fb6">${generation}</b> · peak fits R/P/S: <b>${peakFit[0].toFixed(0)} / ${peakFit[1].toFixed(0)} / ${peakFit[2].toFixed(0)}</b><br/>
            Next gen: <span style="color:#fb6;letter-spacing:1px">${genBar}</span>
        </div>
        <div style="font-size:11px;line-height:1.5;color:#9fd;margin-top:8px">
            <div style="color:#ddd;margin-bottom:2px">ALERT <span style="color:#888">(FHN coupling)</span></div>
            <span style="color:#f66">EXC</span> ${bar(excited, 6)} &nbsp;
            <span style="color:#6cf">REF</span> ${bar(refractory, 6)} &nbsp;
            <span style="color:#9d9">RST</span> ${bar(resting, 6)}<br/>
            Waves: <b>${totalWavesInjected}</b> · CLICK to inject
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
            <div style="flex:1">
                <div style="font-size:10px;color:#ddd;margin-bottom:2px">SPAWN CA</div>
                <canvas id="cmp_ca" width="110" height="110" style="display:block;border:1px solid #422;background:#000;border-radius:2px"></canvas>
            </div>
            <div style="flex:1">
                <div style="font-size:10px;color:#ddd;margin-bottom:2px">SCENT</div>
                <canvas id="cmp_sc" width="110" height="110" style="display:block;border:1px solid #422;background:#000;border-radius:2px"></canvas>
            </div>
        </div>
        <div style="font-size:10px;color:#9fd;margin-top:6px;text-align:center">
            Tags: <b>${totalTagsByPlayer}</b> · Kills: <b>${totalKillsByPlayer}</b> · CA suppressed: ${totalCaKilled}
        </div>`;
    caCanvas = document.getElementById("cmp_ca");
    scentCanvas = document.getElementById("cmp_sc");
    if (caCanvas) caCtx = caCanvas.getContext("2d");
    if (scentCanvas) scentCtx = scentCanvas.getContext("2d");
    drawCAMini(ctx);
    drawScentMini(ctx);
}

function drawCAMini(ctx) {
    if (!caCtx) return;
    const W = 110, H = 110;
    caCtx.fillStyle = "#04060a";
    caCtx.fillRect(0, 0, W, H);
    const cellPx = W / CA_GRID_SIZE;
    for (let z = 0; z < CA_GRID_SIZE; z++) {
        for (let x = 0; x < CA_GRID_SIZE; x++) {
            if (!caGrid[z * CA_GRID_SIZE + x]) continue;
            caCtx.fillStyle = "#f93";
            caCtx.fillRect(x * cellPx, z * cellPx, cellPx + 0.5, cellPx + 0.5);
        }
    }
    // Player marker
    const player = getPlayer(ctx);
    const [pgx, pgz] = worldToCAGrid(player.x, player.z);
    caCtx.fillStyle = "#ff0";
    caCtx.beginPath();
    caCtx.arc(pgx * cellPx + cellPx / 2, pgz * cellPx + cellPx / 2, 2, 0, Math.PI * 2);
    caCtx.fill();
}

function drawScentMini(ctx) {
    if (!scentCtx) return;
    const W = 110, H = 110;
    const imgData = scentCtx.createImageData(W, H);
    const px = imgData.data;
    const N = pheromone.size;
    const scale = N / W;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const gx = (x * scale) | 0;
            const gz = (y * scale) | 0;
            const v = pheromone.grid[gz * N + gx];
            const i = (y * W + x) * 4;
            px[i + 0] = Math.min(255, v * 320);
            px[i + 1] = Math.min(255, v * 200);
            px[i + 2] = Math.min(255, v * 80);
            px[i + 3] = 255;
        }
    }
    scentCtx.putImageData(imgData, 0, 0);
    const player = getPlayer(ctx);
    const [pgx, pgz] = pheromone.worldToGrid(player.x, player.z);
    scentCtx.fillStyle = "#ff0";
    scentCtx.beginPath();
    scentCtx.arc((pgx / N) * W, (pgz / N) * H, 2, 0, Math.PI * 2);
    scentCtx.fill();
}

// ---- demo lifecycle -------------------------------------------------
export default {
    id:    "compound_ai",
    label: "COMPOUND AI (FULL STACK)",
    hint:  "All five AI translations composed: ecosystem + CA + evolution + FHN + pheromone + flocking",
    controls: [
        "3-species cyclic predator-prey, neural brains per species, FHN alert waves",
        "CA-gated spawning, pheromone-driven brain inputs, in-species flocking",
        "CLICK anywhere to inject an alert wave",
    ],

    start(ctx) {
        // Reset state
        enemies = [];
        populations = [1.0, 1.0, 1.0];
        recentDeathsBySpecies = [[], [], []];
        generation = 0;
        elapsedThisGen = 0;
        elapsed = 0;
        totalTagsByPlayer = 0;
        totalKillsByPlayer = 0;
        totalCaKilled = 0;
        totalWavesInjected = 0;
        frameCounter = 0;
        caStepAcc = 0;

        // Init CA grid (50% live)
        caGrid     = new Uint8Array(CA_GRID_SIZE * CA_GRID_SIZE);
        caGridNext = new Uint8Array(CA_GRID_SIZE * CA_GRID_SIZE);
        for (let i = 0; i < caGrid.length; i++) caGrid[i] = Math.random() < 0.45 ? 1 : 0;

        // Subscribe pheromone field
        pheromone = PheromoneField.shared().subscribe();

        // Initial population — 4 of each species in random CA cells
        const player = getPlayer(ctx);
        for (let species = 0; species < 3; species++) {
            for (let i = 0; i < 4; i++) {
                const spot = findCASpawnPoint(player) ?? {
                    x: player.x + Math.cos(Math.random() * 6.28) * RESPAWN_RING,
                    z: player.z + Math.sin(Math.random() * 6.28) * RESPAWN_RING,
                };
                spawnEnemy(ctx, species, spot);
            }
        }

        // HUD
        overlay = document.createElement("div");
        overlay.style.cssText = [
            "position:fixed",
            "right:20px",
            "top:140px",
            "width:300px",
            "background:rgba(8,10,16,0.94)",
            "border:1px solid #555",
            "border-radius:5px",
            "box-shadow:0 0 18px rgba(255,200,80,0.20)",
            "padding:12px 14px",
            "color:#9fd",
            "font:11px 'Courier New', monospace",
            "z-index:1000",
            "pointer-events:none",
        ].join(";");
        panel = overlay;
        document.body.appendChild(overlay);

        // Click to inject alert
        clickHandler = (ev) => {
            if (ev.target.closest("button, input, select, textarea, canvas")) return;
            const p = getPlayer(ctx);
            injectExcitation(p.x, p.z);
        };
        window.addEventListener("click", clickHandler);

        renderHUD(ctx);
        ctx.kpop?.info?.("Compound AI", "All systems online — click to inject alert");
        console.log("[compound_ai] started; enemies:", enemies.length);
    },

    tick(ctx, dt) {
        if (dt > 0.1) dt = 0.1;
        elapsed += dt;
        elapsedThisGen += dt;
        frameCounter++;

        const player = getPlayer(ctx);

        // 1. Drive shared pheromone field
        const frameTag = frameCounter;
        pheromone.depositPlayer(player, dt, frameTag);
        pheromone.tickGlobal(dt, frameTag);

        // 2. Ecosystem dynamics (continuous L-V)
        ecosystemStep(dt);

        // 3. CA step + kill player area
        caStepAcc += dt;
        const stepIvl = 1.0 / CA_STEP_RATE;
        while (caStepAcc >= stepIvl) {
            caStepAcc -= stepIvl;
            caKillAround(player);
            caStep();
        }

        // 4. Spawn maintenance — try to match L-V targets per species
        for (let species = 0; species < 3; species++) {
            const alive = enemies.filter(e => e.alive && e.species === species).length;
            const target = ecosystemTargetCount(species);
            if (alive < target && Math.random() < SPAWN_CHANCE_PER_FRAME) {
                const spot = findCASpawnPoint(player);
                if (spot) spawnEnemy(ctx, species, spot);
            }
        }

        // 5. FHN passes
        for (let s = 0; s < FHN_STEPS_PER_FRAME; s++) fhnPass();

        // 6. Per-enemy update
        // Pre-bucket alive enemies by species for flocking + neighbor count
        const alive = enemies.filter(e => e.alive);
        const bySpecies = [[], [], []];
        for (const e of alive) bySpecies[e.species].push(e);

        for (const e of alive) {
            e.timeAlive += dt;

            // Build neural inputs (pheromone-driven)
            const sameSpec = bySpecies[e.species];
            let neighborCount = 0;
            for (const b of sameSpec) {
                if (b === e) continue;
                const dx = e.x - b.x, dz = e.z - b.z;
                if (dx * dx + dz * dz < FLOCK_VISION_SQ) neighborCount++;
            }
            buildBrainInputs(e, player, neighborCount);

            // Brain forward pass
            const out = e.brain.think(e._inputs);
            const steerX  = out[0], steerZ = out[1], speedMod = out[2];

            // Apply brain steering
            e.vx += steerX * 1.6 * dt * 4;
            e.vz += steerZ * 1.6 * dt * 4;

            // Flocking force (in-species)
            const flock = applyFlocking(e, sameSpec);
            e.vx += flock.fx * dt;
            e.vz += flock.fz * dt;

            // Speed: brain speedMod + alert-state boost
            const isExcited = e.u > ALERT_THRESHOLD;
            const speedMul = Math.max(0.5, Math.min(1.5, 1 + speedMod * 0.2));
            const alertMul = isExcited ? ALERT_SPEED_MUL : 1.0;
            const maxSpd = Math.min(MAX_SPEED, BASE_SPEED * speedMul * alertMul);
            const spd = Math.hypot(e.vx, e.vz);
            if (spd > maxSpd) {
                e.vx = e.vx / spd * maxSpd;
                e.vz = e.vz / spd * maxSpd;
            }

            // Integrate
            e.x += e.vx * dt;
            e.z += e.vz * dt;
            e.y = (ctx.getSurfaceY?.(e.x, e.z) ?? 30) + 2.2;

            if (Math.abs(e.vx) > 0.05 || Math.abs(e.vz) > 0.05) {
                e.yaw = Math.atan2(e.vx, e.vz);
            }

            // Combat
            const dxP = player.x - e.x, dzP = player.z - e.z;
            const dToP = Math.hypot(dxP, dzP);
            if (dToP < e.minDistToPlayer) e.minDistToPlayer = dToP;
            if (dToP < ATTACK_RANGE) {
                e.tagHoldTime += dt;
                if (e.tagHoldTime >= TAG_HOLD_TIME) {
                    e.tagsScored++;
                    totalTagsByPlayer++;
                    e.tagHoldTime = 0;
                    e.health -= TAG_DAMAGE;
                    ctx.kpop?.info?.("⚠ " + SPECIES[e.species].name + " tag", `Gen ${e.brain.generation} brain · fitness ${e.fitness().toFixed(0)}`);
                    if (e.health <= 0) {
                        totalKillsByPlayer++;
                        killEnemy(ctx, e, true);
                        continue;
                    }
                }
            } else {
                e.tagHoldTime = Math.max(0, e.tagHoldTime - dt * 0.5);
            }

            // Push position to renderer
            ctx.router?.exec?.({
                type: "entity:move",
                id:   e.entityId,
                x: e.x, y: e.y, z: e.z,
                yaw: e.yaw,
            });
        }

        // 7. End-of-generation evolution
        if (elapsedThisGen >= GENERATION_DURATION) {
            elapsedThisGen = 0;
            advanceGeneration();
            ctx.kpop?.info?.("⚡ Generation " + generation,
                             `Per-species evolution complete`);
        }

        // 8. Remove dead enemies from main list
        enemies = enemies.filter(e => e.alive);

        // HUD throttled to 6Hz
        if (frameCounter % 10 === 0) renderHUD(ctx);
    },

    stop(ctx) {
        if (clickHandler) window.removeEventListener("click", clickHandler);
        clickHandler = null;
        for (const e of enemies) {
            if (e.entityId != null) ctx.despawnEntity?.(e.entityId);
        }
        enemies = [];
        if (pheromone) { pheromone.unsubscribe(); pheromone = null; }
        caGrid = caGridNext = null;
        if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null; panel = null; caCanvas = caCtx = scentCanvas = scentCtx = null;
        console.log("[compound_ai] stopped");
    },
};
