// FILE: meta/UniverseOptimizer.js
// VERSION: v2 - SELF-MODIFYING SIMULATION META LAYER WITH RULE ENGINE CONTROL

import { RuleMutations } from "./RuleMutations.js";

export class UniverseOptimizer {

    constructor(world, memory, aiManager, civManager, ruleEngine) {

        this.world = world;
        this.memory = memory;
        this.ai = aiManager;
        this.civ = civManager;
        this.rules = ruleEngine;

        this.metrics = {
            stability: 0,
            entropy: 0,
            civCount: 0
        };

        this.params = {
            decayRate: 0.00001,
            aiAggression: 0.5,
            civExpansion: 0.5,
            signalNoise: 0.5
        };

        this.lastTick = performance.now();
    }

    // ------------------------------------------------------------
    // MAIN META LOOP
    // ------------------------------------------------------------

    tick() {

        const now = performance.now();
        const dt = Math.max(1, now - this.lastTick);
        this.lastTick = now;

        this._collectMetrics();
        this._adjustParameters();
        this._evolveRuleSystem();
    }

    // ------------------------------------------------------------
    // METRICS
    // ------------------------------------------------------------

    _collectMetrics() {

        const civs = this.civ?.getAll?.() || [];

        this.metrics.civCount = civs.length;

        let stabilitySum = 0;

        for (const c of civs) {
            stabilitySum += c.stability || 0;
        }

        this.metrics.stability =
            civs.length ? stabilitySum / civs.length : 0;

        this.metrics.entropy = 1 - this.metrics.stability;
    }

    // ------------------------------------------------------------
    // PARAMETER CONTROL
    // ------------------------------------------------------------

    _adjustParameters() {

        // SYSTEM TOO ORDERED → inject entropy
        if (this.metrics.stability > 0.8) {

            this.params.aiAggression += 0.01;
            this.params.civExpansion += 0.01;
            this.params.decayRate += 0.000001;
        }

        // SYSTEM TOO CHAOTIC → stabilize
        if (this.metrics.stability < 0.2) {

            this.params.aiAggression -= 0.01;
            this.params.civExpansion -= 0.01;
            this.params.decayRate -= 0.000001;
        }

        this.params.aiAggression =
            Math.max(0.1, Math.min(1, this.params.aiAggression));

        this.params.civExpansion =
            Math.max(0.1, Math.min(1, this.params.civExpansion));

        this.params.decayRate =
            Math.max(0.000001, Math.min(0.001, this.params.decayRate));
    }

    // ------------------------------------------------------------
    // RULE SYSTEM EVOLUTION (CRITICAL LAYER)
    // ------------------------------------------------------------

    _evolveRuleSystem() {

        if (!this.rules) return;

        this.rules.evolve();

        // inject chaos when overly stable
        if (this.metrics.stability > 0.85) {

            this.rules.mutate(
                "civ_growth",
                RuleMutations.chaotic
            );
        }

        // stabilize when collapsing
        if (this.metrics.stability < 0.25) {

            this.rules.mutate(
                "civ_growth",
                RuleMutations.smooth
            );
        }
    }

    // ------------------------------------------------------------
    // DEBUG
    // ------------------------------------------------------------

    getState() {

        return {
            metrics: this.metrics,
            params: this.params
        };
    }
}