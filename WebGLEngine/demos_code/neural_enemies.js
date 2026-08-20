// demos_code/neural_enemies.js — neural-evolution enemy AI.
//
// The third AI translation, and the heaviest one — full port of the
// VBA demos collection's NeuralEnemyBrain + EnemyInstance +
// EnemyEvolutionManager architecture into engine-integrated WebGL.
//
// Pipeline per frame:
//
//   1. Each enemy reads world state (player position, neighbors,
//      own health/velocity) into an 8-element input vector.
//   2. Brain forward pass → (steerX, steerZ, speedMod) outputs.
//   3. Velocity integrated, capped, position updated.
//   4. Fitness updated (tag count, time alive, closest approach).
//
// Every GENERATION_DURATION seconds, the population evolves:
//   - Rank by fitness
//   - Elites carry over unchanged
//   - Non-elites replaced with mutated clones of top performers
//
// VBA source: NeuralEnemyBrain.cls + EnemyInstance.cls +
//   EnemyEvolutionManager.cls + FPSPredatorPreySwarm.cls
//   (in VBAOpenGL_Demos_v2_67.xlsm).

import { NeuralEnemyBrain } from "../ai/NeuralEnemyBrain.js";
import { EnemyInstance }    from "../ai/EnemyInstance.js";
import { EnemyEvolutionManager } from "../ai/EnemyEvolutionManager.js";
import { PheromoneField } from "../ai/PheromoneField.js";

const USE_PHEROMONE = true;   // round 145 — neural enemies sense player scent

let pheromone = null;

const POPULATION_SIZE      = 10;
const SPAWN_RADIUS         = 45;
const GENERATION_DURATION  = 18;     // seconds per generation
const RESPAWN_RING_RADIUS  = 50;

// Visual badge: elites get a glow; gen-1 enemies are noise-purple,
// later gens shift toward saturated kaiju-hell red as they converge
const KIND_NOISE   = "kaiju_tech";    // visual tag for early gens
const KIND_HUNTING = "kaiju_hell";    // visual tag for evolved gens

let enemies = [];
let manager = null;
let elapsedThisGen = 0;
let overlay = null;
let panel = null;
let bestEnemyEntity = null;   // alpha badge marker
let bestEnemyId = null;

function getPlayerPos(ctx) {
    return {
        x: ctx.camera?.position?.x ?? 0,
        y: ctx.camera?.position?.y ?? 35,
        z: ctx.camera?.position?.z ?? 0,
    };
}

function spawnEnemyAt(ctx, x, z, brain, kind) {
    const y = (ctx.getSurfaceY?.(x, z) ?? 30) + 2.2;
    const id = ctx.spawnMesh?.(kind, x, y, z, 1.5);
    return id;
}

// Place an enemy somewhere on a ring around the player (so each
// generation starts with a fresh circle of hunters, like the VBA demo).
function respawnEnemyOnRing(ctx, player, enemy, brain) {
    // If old entity exists, despawn first
    if (enemy.entityId != null) {
        ctx.despawnEntity?.(enemy.entityId);
        enemy.entityId = null;
    }
    const angle = Math.random() * Math.PI * 2;
    const r = RESPAWN_RING_RADIUS + (Math.random() - 0.5) * 8;
    const x = player.x + Math.cos(angle) * r;
    const z = player.z + Math.sin(angle) * r;
    const kind = (brain.generation >= 4) ? KIND_HUNTING : KIND_NOISE;
    const entityId = spawnEnemyAt(ctx, x, z, brain, kind);
    // Reset state on this slot
    enemy.brain = brain;
    enemy.entityId = entityId;
    enemy.x = x;
    enemy.z = z;
    enemy.y = (ctx.getSurfaceY?.(x, z) ?? 30) + 2.2;
    enemy.vx = (Math.random() - 0.5) * 4;
    enemy.vz = (Math.random() - 0.5) * 4;
    enemy.yaw = Math.atan2(player.x - x, player.z - z);
    enemy.health = 100;
    enemy.alive = true;
    enemy.dead = false;
    enemy.tagsScored = 0;
    enemy.timeAlive = 0;
    enemy.minDistToPlayer = Infinity;
    enemy.tagHoldTime = 0;
    enemy.kind = kind;
}

function renderHUD() {
    if (!panel || !manager) return;
    const s = manager.stats(enemies);
    const aliveBar = "█".repeat(s.alive) + "·".repeat(POPULATION_SIZE - s.alive);
    const genProgress = Math.min(1, elapsedThisGen / GENERATION_DURATION);
    const barWidth = 24;
    const filled = Math.floor(genProgress * barWidth);
    const genBar = "█".repeat(filled) + "·".repeat(barWidth - filled);
    panel.innerHTML = `
        <div style="color:#fd0;font-weight:bold;font-size:13px;letter-spacing:1px;margin-bottom:6px">
            🧠 NEURAL EVOLUTION
        </div>
        <div style="font-size:11px;line-height:1.6">
            <span style="color:#9fd">Generation</span>:  <b style="color:#fb6">${s.generation}</b><br/>
            <span style="color:#9fd">Avg brain gen</span>: <b>${s.avgBrainGen}</b><br/>
            <span style="color:#9fd">Population</span>:  <span style="color:#0fa;letter-spacing:1px">${aliveBar}</span><br/>
            <span style="color:#9fd">Peak fitness</span>: <b style="color:#fd0">${s.peakFitnessEver}</b><br/>
            <span style="color:#9fd">Best this gen</span>: <b>${s.bestFitnessThisGen}</b><br/>
            <span style="color:#9fd">Avg this gen</span>:  ${s.avgFitness}<br/>
            <span style="color:#9fd">Tags scored</span>:  <b style="color:#0fa">${s.totalTags}</b><br/>
            <span style="color:#9fd">Deaths</span>:    ${s.totalDeaths}<br/>
            <span style="color:#9fd">Mutations</span>: ${s.totalMutations}
        </div>
        <div style="margin-top:8px;font-size:10px">
            <span style="color:#9fd">Next gen in</span>
            <div style="color:#fb6;letter-spacing:1px;margin-top:2px">${genBar}</div>
        </div>`;
}

function findAlphaEnemy() {
    let best = null;
    let bestFit = -Infinity;
    for (const e of enemies) {
        if (!e.alive) continue;
        const f = e.fitness();
        if (f > bestFit) { bestFit = f; best = e; }
    }
    return best;
}

export default {
    id:    "neural_enemies",
    label: "NEURAL ENEMIES (EVOLUTION PORT)",
    hint:  "Enemy AI evolves over generations — VBA NeuralEnemyBrain ported",
    controls: [
        `${POPULATION_SIZE} enemies, ${GENERATION_DURATION}s per generation, fitness-based selection`,
        "Watch gens 1-3 = noise. Around gen 5+ they start hunting coherently.",
        "Compare with VBAOpenGL_Demos_v2_67.xlsm → NeuralEnemyBrain.cls",
    ],

    start(ctx) {
        const player = getPlayerPos(ctx);
        manager = new EnemyEvolutionManager();
        enemies = [];
        elapsedThisGen = 0;
        if (USE_PHEROMONE) {
            pheromone = PheromoneField.shared().subscribe();
        }

        // Initial population — all gen-0, fresh random brains
        for (let i = 0; i < POPULATION_SIZE; i++) {
            const angle = (i / POPULATION_SIZE) * Math.PI * 2;
            const r = SPAWN_RADIUS;
            const x = player.x + Math.cos(angle) * r;
            const z = player.z + Math.sin(angle) * r;
            const brain = new NeuralEnemyBrain();
            brain.generation = 0;
            const entityId = spawnEnemyAt(ctx, x, z, brain, KIND_NOISE);
            if (entityId == null) continue;
            const e = new EnemyInstance({
                brain, x, z, kind: KIND_NOISE,
                y: (ctx.getSurfaceY?.(x, z) ?? 30) + 2.2,
                usePheromone: USE_PHEROMONE,
            });
            e.entityId = entityId;
            enemies.push(e);
        }

        // HUD overlay
        overlay = document.createElement("div");
        overlay.style.cssText = [
            "position:fixed",
            "left:20px",
            "top:140px",
            "width:260px",
            "background:rgba(8,10,16,0.92)",
            "border:1px solid #845",
            "border-radius:4px",
            "box-shadow:0 0 16px rgba(180,80,160,0.25)",
            "padding:12px 14px",
            "color:#9fd",
            "font:11px 'Courier New', monospace",
            "z-index:1000",
            "pointer-events:none",
        ].join(";");
        panel = overlay;
        document.body.appendChild(overlay);

        renderHUD();
        ctx.kpop?.info?.("Neural Evolution", `Gen 0 — ${enemies.length} enemies, random brains`);
        console.log("[neural_enemies] started; population:", enemies.length);
    },

    tick(ctx, dt) {
        if (!enemies.length || !manager) return;
        if (dt > 0.1) dt = 0.1;
        elapsedThisGen += dt;

        const player = getPlayerPos(ctx);

        // Round 145 — drive the shared scent field. The player's
        // recent positions become input #8 of every enemy brain.
        if (pheromone) {
            const frameTag = elapsedThisGen + manager.generation * 1000;
            pheromone.depositPlayer(player, dt, frameTag);
            pheromone.tickGlobal(dt, frameTag);
        }

        // Update each enemy
        for (const e of enemies) {
            if (!e.alive) continue;
            const wasAlive = e.alive;
            const prevTags = e.tagsScored;
            e.update(dt, player, enemies, ctx);
            if (e.tagsScored > prevTags) {
                manager.onEnemyScored(e);
                ctx.kpop?.info?.("⚠ Tag!", `Gen ${e.brain.generation} brain scored — fitness ${e.fitness().toFixed(0)}`);
            }
            if (wasAlive && !e.alive) {
                manager.onEnemyDied(e);
                // Despawn the entity so the slot is visually empty
                // until next generation reset
                if (e.entityId != null) {
                    ctx.despawnEntity?.(e.entityId);
                    e.entityId = null;
                }
            }
        }

        // End of generation — evolve
        if (elapsedThisGen >= GENERATION_DURATION) {
            elapsedThisGen = 0;
            const respawnFn = (enemy, brain) => respawnEnemyOnRing(ctx, player, enemy, brain);
            manager.advanceGeneration(enemies, ctx, respawnFn);
            ctx.kpop?.info?.("⚡ Generation " + manager.generation,
                             `Top fitness so far: ${manager.peakFitnessEver.toFixed(0)}`);
        }

        // Alpha marker — spawn a marker entity above the best-current
        // enemy so the player can see which one is "winning"
        const alpha = findAlphaEnemy();
        const alphaId = alpha ? alpha.id : null;
        if (alphaId !== bestEnemyId) {
            // Despawn old marker
            if (bestEnemyEntity != null) {
                ctx.despawnEntity?.(bestEnemyEntity);
                bestEnemyEntity = null;
            }
            bestEnemyId = alphaId;
            if (alpha) {
                bestEnemyEntity = ctx.spawnMesh?.("portal_holy",
                    alpha.x, alpha.y + 3, alpha.z, 0.6);
            }
        } else if (alpha && bestEnemyEntity != null) {
            // Move marker with alpha
            ctx.router?.exec?.({
                type: "entity:move",
                id:   bestEnemyEntity,
                x: alpha.x, y: alpha.y + 3, z: alpha.z,
                yaw: 0,
            });
        }

        renderHUD();
    },

    stop(ctx) {
        for (const e of enemies) e.despawn(ctx);
        if (bestEnemyEntity != null) ctx.despawnEntity?.(bestEnemyEntity);
        bestEnemyEntity = null; bestEnemyId = null;
        enemies = [];
        manager = null;
        if (pheromone) { pheromone.unsubscribe(); pheromone = null; }
        if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null; panel = null;
        console.log("[neural_enemies] stopped");
    },
};
