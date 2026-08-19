// ai/EnemyEvolutionManager.js
//
// Port of VBA EnemyEvolutionManager.cls. Replaces the morphogenesis-
// driven evolution with a fitness-based selection loop suited to the
// WebGL demo:
//
//   * Each generation lives for GENERATION_DURATION seconds OR until
//     N% of the population has died.
//   * At generation end:
//       - rank survivors + recently-dead by fitness
//       - replace each enemy whose fitness is below median with a
//         mutated clone of a top-3 brain
//       - elite survivors carry over unchanged (preserves discovered
//         strategies across generations)
//       - dead enemies always get replaced (with a mutated top brain)
//   * Tracks generation, peak fitness, and population stats for the
//     HUD overlay.
//
// The interesting story: with random init, the first few generations
// look like noise. Around gen 3-6 you start seeing emergent strategies
// — direct pursuit, flanking, circling. By gen 10+ the population
// usually converges on a coherent hunting style.

const TOP_K               = 3;         // how many top brains form the breeding pool
const ELITE_KEEP_FRACTION = 0.25;      // top-K's % of population carries over
const MUTATION_RATE_BASE  = 0.7;       // odds the child enters mutation loop

export class EnemyEvolutionManager {
    constructor() {
        this.generation = 0;
        this.peakFitnessEver = 0;
        this.peakBrain = null;
        this.totalTags = 0;
        this.totalDeaths = 0;
        this.recentDeaths = [];        // last gen's casualties — eligible breeders
    }

    // Evaluate fitness across the population, replace low performers
    // with mutated clones of top performers. enemies is the array of
    // EnemyInstance — modified IN PLACE (existing entities are
    // re-purposed by overwriting their brain and resetting state).
    advanceGeneration(enemies, ctx, respawnFn) {
        this.generation++;

        // Combine living + recently-dead — both contribute genomes
        const pool = enemies.slice();
        for (const d of this.recentDeaths) pool.push(d);
        this.recentDeaths = [];

        // Sort descending by fitness
        pool.sort((a, b) => b.fitness() - a.fitness());

        // Track all-time best
        if (pool.length > 0 && pool[0].fitness() > this.peakFitnessEver) {
            this.peakFitnessEver = pool[0].fitness();
            this.peakBrain = pool[0].brain.clone();
            this.peakBrain.generation = this.generation;
        }

        const top = pool.slice(0, Math.min(TOP_K, pool.length));
        const eliteCount = Math.max(1, Math.floor(enemies.length * ELITE_KEEP_FRACTION));

        // Build new population: keep top eliteCount as-is, replace
        // the rest with mutated copies of one of the top-K brains.
        const elites = top.slice(0, eliteCount);
        const eliteIds = new Set(elites.map(e => e.id));

        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (eliteIds.has(e.id) && e.alive) {
                // Elite survivor — carry forward unchanged but reset
                // fitness counters so it has a fresh chance
                e.tagsScored = 0;
                e.minDistToPlayer = Infinity;
                e.timeAlive = 0;
                e.health = 100;
                continue;
            }
            // Replace this slot. Pick a parent at random from top-K
            // (weighted by rank — higher-ranked picked more often).
            const parent = pickWeighted(top);
            const childBrain = parent.brain.clone();
            childBrain.generation = this.generation;
            childBrain.parentId   = parent.id;
            childBrain.mutate(MUTATION_RATE_BASE);
            // Respawn the entity slot with the new brain
            respawnFn(e, childBrain);
        }
    }

    onEnemyDied(enemy) {
        this.totalDeaths++;
        this.recentDeaths.push(enemy);
        if (this.recentDeaths.length > 20) this.recentDeaths.shift();
    }

    onEnemyScored(enemy) {
        this.totalTags++;
    }

    stats(enemies) {
        let alive = 0, avgFitness = 0, bestFit = 0, avgGen = 0, totalMutations = 0;
        for (const e of enemies) {
            if (e.alive) alive++;
            const f = e.fitness();
            avgFitness += f;
            if (f > bestFit) bestFit = f;
            avgGen += e.brain.generation;
            totalMutations += e.brain.mutationCount;
        }
        if (enemies.length > 0) {
            avgFitness /= enemies.length;
            avgGen     /= enemies.length;
        }
        return {
            generation: this.generation,
            alive,
            peakFitnessEver: this.peakFitnessEver.toFixed(1),
            avgFitness: avgFitness.toFixed(1),
            bestFitnessThisGen: bestFit.toFixed(1),
            avgBrainGen: avgGen.toFixed(1),
            totalTags: this.totalTags,
            totalDeaths: this.totalDeaths,
            totalMutations,
        };
    }
}

// Rank-weighted pick: top of array twice as likely as bottom.
function pickWeighted(arr) {
    if (arr.length === 0) return null;
    if (arr.length === 1) return arr[0];
    // Weights: arr.length, arr.length-1, …, 1
    const totalW = arr.length * (arr.length + 1) / 2;
    let r = Math.random() * totalW;
    for (let i = 0; i < arr.length; i++) {
        const w = arr.length - i;
        if (r < w) return arr[i];
        r -= w;
    }
    return arr[arr.length - 1];
}
